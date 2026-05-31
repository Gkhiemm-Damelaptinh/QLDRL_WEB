// Global: shared between DOMContentLoaded scope and outer functions (e.g. initOfficerAssignment)
var lecturerClasses = [];

document.addEventListener("DOMContentLoaded", async () => {
  // ==== cấu hình API ====
  const API_BASE = "";
  // helper attach X-User header for write operations
  function getCurrentUserId() {
    try {
      const raw = localStorage.getItem('loggedUserInfo');
      if (!raw) return '';
      const info = JSON.parse(raw);
      return info?.MaCaNhan || info?.TenTK || '';
    } catch { return ''; }
  }
  function withUserHeader(init) {
    const headers = new Headers((init && init.headers) || {});
    const uid = getCurrentUserId();
    if (uid) headers.set('X-User', uid);
    return { ...(init || {}), headers };
  }

  // ==== Kiểm tra quyền truy cập ====
  function checkTeacherAccess() {
    const userInfo = localStorage.getItem("loggedUserInfo");
    if (!userInfo) {
      alert("Bạn chưa đăng nhập. Vui lòng đăng nhập trước!");
      window.location.href = "index.html";
      return false;
    }

    try {
      const user = JSON.parse(userInfo);
      const maQT = user.MaQT || "";
      
      if (maQT !== "GV01") {
        alert("Bạn không có quyền truy cập giao diện giảng viên!");
        window.location.href = "index.html";
        return false;
      }

      // Hiển thị thông tin người dùng
      const userNameElement = document.getElementById("user-name");
      const dropdownUserName = document.getElementById("dropdown-user-name");
      const headerAvatar = document.getElementById("header-avatar");
      
      const displayName = user.TenNguoiDung || user.TenTK || "Giảng viên";
      
      if (userNameElement) {
        userNameElement.textContent = displayName;
      }
      
      if (dropdownUserName) {
        dropdownUserName.textContent = displayName;
      }
      
      if (headerAvatar) {
        // Có thể thêm logic để hiển thị avatar thực tế của người dùng
        headerAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=059669&color=fff`;
      }

      return true;
    } catch (error) {
      console.error("Error parsing user info:", error);
      alert("Lỗi thông tin người dùng. Vui lòng đăng nhập lại!");
      window.location.href = "index.html";
      return false;
    }
  }

  // ==== phần tử UI ====
  const sidebar = document.getElementById("sidebar");
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const sidebarItems = document.querySelectorAll(".sidebar-item");
  const sectionContents = document.querySelectorAll(".section-content");
  const studentsSection = document.getElementById('students');
  const gradesSection = document.getElementById('grades');
  // lecturerClasses is declared as global var above DOMContentLoaded

  // ==== Enhanced Sidebar Navigation ====
  function initSidebar() {
    const mobileOverlay = document.getElementById("mobile-overlay");
    const pinBtn = document.getElementById("sidebar-pin");

    // Mobile menu toggle
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMobileMenu();
      });
    }

    // Initial expanded state from localStorage
    const persisted = localStorage.getItem("sidebarExpanded");
    if (persisted === "true") {
      sidebar.classList.add("expanded");
    }

    // Hover expand when not pinned
    sidebar.addEventListener("mouseenter", () => {
      if (localStorage.getItem("sidebarExpanded") !== "true") {
        sidebar.classList.add("expanded");
      }
    });
    sidebar.addEventListener("mouseleave", () => {
      if (localStorage.getItem("sidebarExpanded") !== "true") {
        sidebar.classList.remove("expanded");
      }
    });

    // Pin/unpin toggle
    if (pinBtn) {
      pinBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const nowExpanded = sidebar.classList.toggle("expanded");
        localStorage.setItem("sidebarExpanded", String(nowExpanded));
      });
    }

    // Mobile overlay click
    if (mobileOverlay) {
      mobileOverlay.addEventListener("click", () => {
        closeMobileMenu();
      });
    }

    // Sidebar item click
    sidebarItems.forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const targetSection = item.getAttribute("data-section");
        
        // Update active states
        sidebarItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        
        // Update breadcrumb
        updateBreadcrumb(targetSection);
        
        // Show target section
        sectionContents.forEach(section => {
          section.classList.add("hidden");
          section.classList.remove("active");
        });
        
        const targetElement = document.getElementById(targetSection);
        if (targetElement) {
          targetElement.classList.remove("hidden");
          targetElement.classList.add("active");
        }

        if (targetSection === 'evalforms') {
          maybeInitEvalFormsOnSectionSwitch();
        }
        if (targetSection === 'evidence') {
          // Load once on navigation; no auto-refresh
          loadEvidenceList();
        }
        if (targetSection === 'officers') {
          initOfficerAssignment();
        }
        if (targetSection === 'reports') {
          // Auto-load report for current year when switching to reports section
          generateReport();
        }
        if (targetSection === 'ekyc') {
          loadEkycPending();
        }
        if (targetSection === 'grades' && typeof initDiemImport === 'function') {
          if (!document.getElementById('giangvien-diem-container').innerHTML.trim()) {
            initDiemImport('giangvien-diem-container', 'giangvien', 'giangvien');
          }
        }

        // Close mobile menu
        if (window.innerWidth < 1024) {
          closeMobileMenu();
        }
      });
    });

    // User dropdown: toggle on click
    const userDropdown = document.querySelector('.user-avatar-dropdown');
    const dropdownMenu = document.querySelector('.user-dropdown-menu');
    if (userDropdown && dropdownMenu) {
      userDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('hidden');
      });
      document.addEventListener('click', () => dropdownMenu.classList.add('hidden'));
    }

    // Handle window resize
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) {
        closeMobileMenu();
      }
    });
  }

  // ==== Lecturer advisory classes gating ====
  async function gateSectionsByLecturer(){
    try {
      const userInfoRaw = localStorage.getItem('loggedUserInfo');
      const user = userInfoRaw ? JSON.parse(userInfoRaw) : null;
      const maGV = user?.MaCaNhan || user?.TenTK || '';
      // Only gate for lecturer role
      if ((user?.MaQT || '') !== 'GV01') return;
      if (!maGV) return;
      const res = await fetch(`${API_BASE}/api/lecturers/${encodeURIComponent(maGV)}/classes`);
      if (res.ok) {
        const raw = await res.json();
        // Normalize: đảm bảo luôn có cả PascalCase lẫn camelCase để code cũ không bị undefined
        lecturerClasses = (raw||[]).map(c => ({
          MaLop: c.MaLop || c.maLop || '',
          maLop: c.MaLop || c.maLop || '',
          TenLop: (c.TenLop || c.tenLop || '').trim(),
          tenLop: (c.TenLop || c.tenLop || '').trim(),
          MaKH:   c.MaKH  || c.maKH  || c.MaKhoa || c.makhoa || '',
          maKH:   c.MaKH  || c.maKH  || c.MaKhoa || c.makhoa || '',
          TenKhoa: c.TenKhoa || c.tenKhoa || '',
          tenKhoa: c.TenKhoa || c.tenKhoa || ''
        }));
      }
      // Hide students + grades if no advisory classes
      const hasClasses = Array.isArray(lecturerClasses) && lecturerClasses.length > 0;
      if (!hasClasses) {
        studentsSection?.classList.add('hidden');
        gradesSection?.classList.add('hidden');
        // Also disable sidebar navigation entries
        document.querySelectorAll('.sidebar-item[data-section="students"], .sidebar-item[data-section="grades"]').forEach(el=>{
          el.classList.add('disabled');
          el.setAttribute('title','Bạn chưa có lớp chủ nhiệm/cố vấn');
        });
      } else {
        studentsSection?.classList.remove('hidden');
        gradesSection?.classList.remove('hidden');
        document.querySelectorAll('.sidebar-item[data-section="students"], .sidebar-item[data-section="grades"]').forEach(el=>{
          el.classList.remove('disabled');
          el.removeAttribute('title');
        });
      }
    } catch (e) {
      console.warn('gateSectionsByLecturer error', e);
    }
  }

  // ==== Mobile Menu Functions ====
  function toggleMobileMenu() {
    const sidebar = document.getElementById("sidebar");
    const mobileOverlay = document.getElementById("mobile-overlay");
    
    if (sidebar && mobileOverlay) {
      sidebar.classList.toggle("mobile-open");
      mobileOverlay.classList.toggle("hidden");
      
      // Prevent body scroll when menu is open
      if (sidebar.classList.contains("mobile-open")) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
    }
  }

  function closeMobileMenu() {
    const sidebar = document.getElementById("sidebar");
    const mobileOverlay = document.getElementById("mobile-overlay");
    
    if (sidebar && mobileOverlay) {
      sidebar.classList.remove("mobile-open");
      mobileOverlay.classList.add("hidden");
      document.body.style.overflow = "";
    }
  }

  // ==== Breadcrumb Navigation ====
  function updateBreadcrumb(section) {
    const currentSection = document.getElementById("current-section");
    const currentPage = document.getElementById("current-page");
    
    const sectionMap = {
      dashboard: { section: "Tổng quan", page: "Dashboard" },
      students: { section: "Sinh viên", page: "Quản lý sinh viên" },
      grades: { section: "Điểm rèn luyện", page: "Chấm điểm" },
      activities: { section: "Hoạt động", page: "Quản lý hoạt động" },
      reports: { section: "Báo cáo", page: "Thống kê" },
      evalforms: { section: "Điểm rèn luyện", page: "Phiếu đánh giá" },
      evidence: { section: "Minh chứng", page: "Duyệt minh chứng" }
    };
    
    if (currentSection && currentPage && sectionMap[section]) {
      currentSection.textContent = sectionMap[section].section;
      currentPage.textContent = sectionMap[section].page;
    }
  }

  // ==== Dashboard Functions ====
  async function loadDashboardStats() {
    try {
      // Load statistics
      const [statsRes, preloadRes] = await Promise.all([
        fetch(`${API_BASE}/api/stats`),
        fetch(`${API_BASE}/api/preload`)
      ]);
      
      if (statsRes.ok) {
        const stats = await statsRes.json();
        
        // Update stats cards
        document.getElementById("total-students").textContent = stats.totalStudents || 0;
        document.getElementById("active-activities").textContent = stats.totalActivities || 0;
        document.getElementById("avg-training-score").textContent = Math.round(stats.avgTrainingScore || 0);
        document.getElementById("monthly-reports").textContent = stats.totalRecords || 0;
      }
      
      if (preloadRes.ok) {
        const data = await preloadRes.json();
        
        // Load recent activities
        const recentActivities = data.hoatDongTruong?.slice(0, 5) || [];
        const activitiesContainer = document.getElementById("recent-activities");
        
        if (recentActivities.length > 0) {
          activitiesContainer.innerHTML = recentActivities.map(act => `
            <div class="flex items-center p-3 bg-gray-50 rounded-lg">
              <div class="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
              <div class="flex-1">
                <p class="text-sm font-medium text-gray-800">${act.TenHD}</p>
                <p class="text-xs text-gray-500">${formatDate(act.NgayBD)} - ${formatDate(act.NgayKT)}</p>
              </div>
            </div>
          `).join('');
        }
        
        // Load top students from ranking
        loadTopStudents();

        // Hydrate notifications from recent activities
        hydrateNotifications(data.hoatDongTruong || []);
      }
    } catch (error) {
      console.error("Error loading dashboard stats:", error);
    }
  }

  // Kick off gating early
  await gateSectionsByLecturer();

  // ==== Notifications ====
  function hydrateNotifications(activities) {
    try {
      // Chỉ lưu dữ liệu hoạt động để dùng chỗ khác nếu cần; KHÔNG đụng tới badge nữa
      window.__preloadActivities = Array.isArray(activities) ? activities : [];
      const badge = document.getElementById("notifications-badge");
      if (badge) { badge.textContent = '0'; badge.classList.add('hidden'); }
    } catch (error) {
      console.error('Error hydrating notifications:', error);
    }
  }

  // Load top students for dashboard
  async function loadTopStudents() {
    try {
      const res = await fetch(`${API_BASE}/api/luutrudiemsv/ranking`);
      if (res.ok) {
        const rankingData = await res.json();
        
        // Update research count based on ranking flag
        const studentsWithResearch = rankingData.filter(student => student.TGNCKH === true || student.TGNCKH === 1 || student.TGNCKH === "1");
        document.getElementById("monthly-reports").textContent = studentsWithResearch.length;
        
        const topStudents = rankingData.slice(0, 3);
        const topStudentsContainer = document.getElementById("top-students");
        
        if (topStudents.length > 0) {
          topStudentsContainer.innerHTML = topStudents.map((student, index) => `
            <div class="flex items-center p-3 bg-gray-50 rounded-lg">
              <div class="w-8 h-8 ${getRankClass(index + 1)} rounded-full flex items-center justify-center mr-3">
                <span class="text-white text-xs font-bold">${index + 1}</span>
              </div>
              <div class="flex-1">
                <p class="text-sm font-medium text-gray-800">${student.TenSV}</p>
                <p class="text-xs text-gray-500">Điểm rèn luyện: ${student.TongDRL || 'N/A'}</p>
              </div>
            </div>
          `).join('');
        }
      }
    } catch (error) {
      console.error("Error loading top students:", error);
    }
  }

  function getRankClass(rank) {
    if (rank === 1) return "bg-yellow-500";
    if (rank === 2) return "bg-gray-400";
    if (rank === 3) return "bg-orange-500";
    return "bg-blue-500";
  }

  // ==== Students Management ====
  async function loadStudents() {
    try {
      const tbody = document.getElementById("students-table-body");
      tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      // Get search and filter parameters
      const search = document.getElementById("student-search")?.value || "";
      let classFilter = document.getElementById("class-filter")?.value || "";
      const facultyFilter = document.getElementById("faculty-filter")?.value || "";

      // If lecturer has advisory classes, default filter to first class (or keep user selection)
      try {
        if ((!classFilter || classFilter === '') && Array.isArray(lecturerClasses) && lecturerClasses.length > 0) {
          const firstClass = lecturerClasses[0].MaLop || lecturerClasses[0].maLop;
          if (firstClass) classFilter = firstClass;
        }
        // Lock class filter options to lecturer classes if present
        const classSel = document.getElementById('class-filter');
        if (classSel && Array.isArray(lecturerClasses) && lecturerClasses.length > 0) {
          classSel.innerHTML = '<option value="">Chọn lớp của bạn</option>' + lecturerClasses.map(c => `<option value="${c.MaLop||c.maLop}">${c.TenLop||c.tenLop}</option>`).join('');
          if (classFilter) classSel.value = classFilter;
        }
      } catch(e){ console.warn('apply lecturer class filter error', e); }

      // Build query parameters
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (classFilter) params.append("maLop", classFilter);
      if (facultyFilter) params.append("maKhoa", facultyFilter);

  // Đảm bảo luôn gửi X-User để backend có thể áp scope nếu khả dụng
  const response = await fetch(`${API_BASE}/api/sinhvien?${params.toString()}`, withUserHeader());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      let students = await response.json();
      
      // Convert CBLop from bit to boolean for easier handling
      students.forEach(student => {
        // Handle different data types that might come from database
        const originalCBLop = student.CBLop;
        student.CBLop = student.CBLop === 1 || student.CBLop === true || student.CBLop === '1';
        student.TVCLBKhoa = student.TVCLBKhoa === 1 || student.TVCLBKhoa === true || student.TVCLBKhoa === '1';
        student.TVCLBTruong = student.TVCLBTruong === 1 || student.TVCLBTruong === true || student.TVCLBTruong === '1';
        
        // Debug logging
        if (student.MSSV === '23092006119') {
          console.log('Student CBLop conversion:', {
            MSSV: student.MSSV,
            original: originalCBLop,
            converted: student.CBLop,
            type: typeof originalCBLop
          });
        }
      });
      
      if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu sinh viên</td></tr>';
        return;
      }

  //

      // Load grades in ONE bulk call when filtering theo lớp; tránh gọi từng MSSV gây 429
      try {
        const selectedClass = classFilter;
        if (selectedClass) {
          const reportRes = await fetch(`${API_BASE}/api/reports/class/${encodeURIComponent(selectedClass)}/students`, withUserHeader());
          if (reportRes.ok) {
            const classReport = await reportRes.json();
            const gradeByMssv = new Map((classReport||[]).map(r => [r.MSSV, r.TongDRL ?? null]));
            students.forEach(s => { s.latestGrade = gradeByMssv.get(s.MSSV) ?? null; });
          }
        } else {
          // Không có bộ lọc lớp → để trống điểm (giảm tải server). Người dùng xem chi tiết sẽ gọi riêng.
          students.forEach(s => { s.latestGrade = null; });
        }
      } catch(e){ /* ignore & keep N/A */ }

      tbody.innerHTML = students.map(student => `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${student.MSSV}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${student.TenSV}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.TenLop || 'N/A'}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.TenKhoa || 'N/A'}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.latestGrade || 'N/A'}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            <input type="checkbox" 
                   ${student.CBLop ? 'checked' : ''} 
                   onchange="updateCBLop('${student.MSSV}', this.checked)"
                   class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2">
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <button onclick="viewStudentDetail('${student.MSSV}')" class="text-blue-600 hover:text-blue-900 mr-2">Xem</button>
            <button onclick="editStudentGrade('${student.MSSV}')" class="text-green-600 hover:text-green-900">Sửa điểm</button>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      console.error("Error loading students:", error);
      document.getElementById("students-table-body").innerHTML = 
        '<tr><td colspan="7" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
    }
  }

  // ==== Grades Management ====
  async function loadGrades() {
    try {
      const tbody = document.getElementById("grades-table-body");
      tbody.innerHTML = '<tr><td colspan="10" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      // If lecturer has advisory classes, request class-specific report; else fallback to ranking
      let grades = [];
      console.log('lecturerClasses:', lecturerClasses);
      try {
        // Try to get all students from lecturer's teaching classes
        console.log('Fetching all my students from GVLOP');
        const res = await fetch(`${API_BASE}/api/my-students`, withUserHeader());
        if (res.ok) {
          const students = await res.json();
          console.log('My students data:', students);
          if (students && students.length > 0) {
            grades = students.map(s => ({
              MSSV: s.MSSV || '',
              TenSV: s.HoTen || s.TenSV || '',
              NamHoc: s.NamHoc || '',
              HocKi: s.HocKi || '',
              TongDRL: s.TongDRL ?? null,
              viphamNT: s.viphamNT ?? 0,
              viphamXH: s.viphamXH ?? 0,
              TGNCKH: s.TGNCKH ?? false,
              TenLop: s.TenLop || '',
              TenKhoa: s.TenKhoa || ''
            }));
            console.log('Mapped grades from my-students:', grades);
          }
        } else {
          console.warn('Failed to fetch my students:', res.status);
          // Fallback to old method with class-specific API
          if (Array.isArray(lecturerClasses) && lecturerClasses.length > 0) {
            const maLop = lecturerClasses[0].MaLop || lecturerClasses[0].maLop;
            console.log('Fallback: Fetching grades for class:', maLop);
            const resClass = await fetch(`${API_BASE}/api/reports/class/${encodeURIComponent(maLop)}/students`, withUserHeader());
            if (resClass.ok) {
              const studentsClass = await resClass.json();
              console.log('Class students data:', studentsClass);
              if (studentsClass && studentsClass.length > 0) {
                grades = studentsClass.map(s => ({
                  MSSV: s.MSSV || '',
                  TenSV: s.HoTen || s.TenSV || '',
                  NamHoc: s.NamHoc || '',
                  HocKi: s.HocKi || '',
                  TongDRL: s.TongDRL ?? null,
                  viphamNT: s.viphamNT ?? 0,
                  viphamXH: s.viphamXH ?? 0,
                  TGNCKH: s.TGNCKH ?? false,
                  TenLop: s.TenLop || '',
                  TenKhoa: s.TenKhoa || ''
                }));
              }
            }
          }
        }
      } catch(e){ console.warn('load my-students error', e); }
      if (!grades || grades.length === 0) {
        console.log('No grades from class API, using fallback ranking');
        const response = await fetch(`${API_BASE}/api/luutrudiemsv/ranking`, withUserHeader());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rankingData = await response.json();
        console.log('Ranking data:', rankingData);
        // Map ranking data to same structure as class students
        grades = (rankingData||[]).map(g => ({
          MSSV: g.MSSV || '',
          TenSV: g.TenSV || g.HoTen || '',
          NamHoc: g.NamHoc || '',
          HocKi: g.HocKi || '',
          TongDRL: g.TongDRL ?? null,
          viphamNT: g.viphamNT ?? 0,
          viphamXH: g.viphamXH ?? 0,
          TGNCKH: g.TGNCKH ?? false,
          TenLop: g.TenLop || '',
          TenKhoa: g.TenKhoa || ''
        }));
        console.log('Mapped grades from ranking:', grades);
      }
      
      //
      
      if (grades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu điểm</td></tr>';
        return;
      }

      tbody.innerHTML = grades.map(grade => {
        const evaluation = getGradeEvaluation(grade.TongDRL);
        // Fallback: if TenSV is undefined, use "Chưa cập nhật"
        const displayName = grade.TenSV || grade.HoTen || 'Chưa cập nhật';
        const displayMSSV = grade.MSSV || 'Chưa cập nhật';
        return `
          <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${displayMSSV}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${displayName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${grade.NamHoc || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${grade.HocKi || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${grade.TongDRL || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${grade.viphamNT || '0'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${grade.viphamXH || '0'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${grade.TGNCKH ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                ${grade.TGNCKH ? 'Có' : 'Không'}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span class="activity-status ${evaluation.class} text-xs">${evaluation.text}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
              <button onclick="editStudentGrade('${displayMSSV}', ${grade.NamHoc}, ${grade.HocKi})" class="text-blue-600 hover:text-blue-900 mr-2">Sửa</button>
              <button onclick="deleteStudentGrade('${displayMSSV}', ${grade.NamHoc}, ${grade.HocKi})" class="text-red-600 hover:text-red-900">Xóa</button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (error) {
      console.error("Error loading grades:", error);
      document.getElementById("grades-table-body").innerHTML = 
        '<tr><td colspan="10" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
    }
  }

  function getGradeEvaluation(score) {
    if (!score || score === 0) return { text: "Chưa có", class: "bg-gray-500" };
    if (score >= 90) return { text: "Xuất sắc", class: "bg-purple-500" };
    if (score >= 80) return { text: "Giỏi", class: "bg-green-500" };
    if (score >= 70) return { text: "Khá", class: "bg-blue-500" };
    if (score >= 60) return { text: "Trung bình", class: "bg-yellow-500" };
    return { text: "Yếu", class: "bg-red-500" };
  }

  // ==== Activities Management ====
  async function loadActivities() {
    try {
      const grid = document.getElementById("activities-grid");
      grid.innerHTML = '<div class="col-span-full text-center text-gray-500">Đang tải dữ liệu...</div>';

      const res = await fetch(`${API_BASE}/api/preload`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      const activities = data.hoatDongTruong || [];

      if (activities.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-500">Chưa có hoạt động nào</div>';
        return;
      }

      grid.innerHTML = activities.map(act => `
        <div class="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow">
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-lg font-semibold text-gray-800">${act.TenHD || 'Chưa có tên'}</h3>
            <span class="activity-status bg-blue-500 text-xs">${act.MaHD}</span>
          </div>
          <div class="space-y-2 mb-4">
            <p class="text-sm text-gray-600"><strong>Điểm:</strong> ${act.DiemRL || 'N/A'}</p>
            <p class="text-sm text-gray-600"><strong>Ngày BD:</strong> ${formatDate(act.NgayBD)}</p>
            <p class="text-sm text-gray-600"><strong>Ngày KT:</strong> ${formatDate(act.NgayKT)}</p>
            <p class="text-sm text-gray-600"><strong>Địa điểm:</strong> ${act.DiaDiem || 'N/A'}</p>
          </div>
          <div class="flex gap-2">
            <button class="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm" data-view-activity="${act.MaHD}">
              Xem chi tiết
            </button>
          </div>
        </div>
      `).join('');

      // Attach handlers
      grid.querySelectorAll('[data-view-activity]').forEach(btn => {
        btn.addEventListener('click', () => viewActivityDetailGV(btn.getAttribute('data-view-activity')));
      });
    } catch (error) {
      console.error("Error loading activities:", error);
      document.getElementById("activities-grid").innerHTML = 
        '<div class="col-span-full text-center text-red-500">Lỗi tải dữ liệu</div>';
    }
  }

  // ==== Evidence Moderation (Lecturer) ====
  function verdictBadgeClass(v){
    switch(v){
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      case 'Deleted': return 'bg-gray-300 text-gray-800';
      case 'ManualReview': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  // Helpers to safely render possibly nested values to strings
  function safeStr(v){
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'object'){
      const cand = v.TenHD || v.TenSV || v.TenGV || v.name || v.title || v.text || v.MaHD || v.MSSV || v.id;
      return cand ? String(cand) : '';
    }
    try { return String(v); } catch { return ''; }
  }
  function getStudentIdFrom(ev){
    const s = ev.StudentId ?? ev.studentId ?? ev.MSSV ?? ev.mssv ?? ev.Student ?? ev.student;
    return safeStr(s);
  }
  function getActivityNameFrom(ev){
    const a = ev.ActivityName ?? ev.activityName ?? ev.Activity ?? ev.activity;
    return safeStr(a);
  }
  // Điểm số an toàn: xử lý cả khi backend trả về object thay vì số
  function fmtScore(v){
    if (v === undefined || v === null) return '-';
    if (typeof v === 'object') {
      // Thử rút số từ các key thường gặp
      const cand = v.value ?? v.score ?? v.SCORE ?? v.Val ?? null;
      const n = cand != null ? Number(cand) : NaN;
      return isNaN(n) ? '-' : n.toFixed(2);
    }
    const n = Number(v);
    return isNaN(n) ? '-' : n.toFixed(2);
  }
  // Cố gắng rút điểm số từ nhiều cấu trúc lồng nhau
  function getNumericScore(v){
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string') { const n = Number(v); return isNaN(n) ? null : n; }
    if (typeof v === 'object') {
      const candidates = [v.value, v.score, v.SCORE, v.Val, v.percent, v.percentage, v.confidence, v.similarity, v.prob, v.probability];
      for (const c of candidates){ const n = Number(c); if (!isNaN(n)) return n; }
      const deep = v.data || v.result || v.metrics || v.ai || v.tamper || v.face || v.banner || v.scores || v.stats || v.details;
      if (deep){
        const dCands = [deep.value, deep.score, deep.SCORE, deep.Val, deep.percent, deep.percentage, deep.confidence, deep.similarity, deep.prob, deep.probability];
        for (const c of dCands){ const n = Number(c); if (!isNaN(n)) return n; }
        // Thử duyệt nông tất cả giá trị trong object lồng
        try {
          const vals = Array.isArray(deep) ? deep : Object.values(deep);
          for (const x of vals){
            const n = getNumericScore(x);
            if (n != null) return n;
          }
        } catch {}
      }
      // Duyệt nông tất cả giá trị của object đầu vào
      try {
        const vals = Array.isArray(v) ? v : Object.values(v);
        for (const x of vals){
          const n = getNumericScore(x);
          if (n != null) return n;
        }
      } catch {}
    }
    return null;
  }
  function escapeHtml(str){ return String(str).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s])); }

  async function loadEvidenceList(){
    const tbody = document.getElementById('evidence-tbody');
    const totalEl = document.getElementById('evidence-total');
    const pendingBadge = document.getElementById('evidence-pending-badge');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10" class="px-6 py-4 text-center text-gray-500">Đang tải...</td></tr>';
    try {
      const mssv = document.getElementById('evidence-filter-mssv')?.value || '';
      const verdict = document.getElementById('evidence-filter-verdict')?.value || '';
      let maLop = document.getElementById('evidence-filter-class')?.value || '';
      const page = parseInt(document.getElementById('evidence-filter-page')?.value || '1',10) || 1;
      
      // Chỉ auto-load lớp chủ nhiệm của GV khi:
      // 1. User KHÔNG có filter lớp (maLop empty)
      // 2. Page = 1 (lần đầu tiên)
      // 3. Chưa load page này từ trước (sessionStorage)
      if (!maLop && page === 1 && !sessionStorage.getItem('evidenceListLoaded')) {
        const gvId = getCurrentUserId();
        if (gvId) {
          try {
            const gvRes = await fetch(`${API_BASE}/api/giangvien/${encodeURIComponent(gvId)}`, withUserHeader({}));
            if (gvRes.ok) {
              const gvData = await gvRes.json();
              maLop = gvData.tenLop || gvData.lopCV || '';
              // Auto-set dropdown nếu lấy được lớp
              if (maLop) {
                const classSelect = document.getElementById('evidence-filter-class');
                if (classSelect) {
                  const option = Array.from(classSelect.options).find(opt => opt.value === maLop);
                  if (option) classSelect.value = maLop;
                }
              }
            }
          } catch (e) {
            console.warn('[GV] Failed to load lecturer info:', e);
          }
        }
        sessionStorage.setItem('evidenceListLoaded', 'true');
      }
      
  // Tăng mặc định để không bỏ sót minh chứng mới
  const pageSize = parseInt(document.getElementById('evidence-filter-pageSize')?.value || '200',10) || 200;
      const params = new URLSearchParams({ page, pageSize });
      if(mssv) params.append('studentId', mssv);
      if(maLop) params.append('maLop', maLop);
  // Không áp verdict nếu người dùng đang để "Tất cả" hoặc rỗng, tránh lọc mất ManualReview/Pending
  const vClean = (verdict||'').trim();
  if(vClean && !/^t(?:at ca|ất cả)$/i.test(vClean)) params.append('verdict', vClean);
  const res = await fetch(`${API_BASE}/api/evidence?${params.toString()}`, withUserHeader());
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = data.items || data.Items || [];
      try {
        console.debug('[GV] Evidence list fetched:', { total: items.length, maLop, sample: items[0] });
      } catch {}
      const total = data.total || data.Total || items.length;
      totalEl && (totalEl.textContent = `${total} minh chứng`);
      if(items.length===0){
        tbody.innerHTML = '<tr><td colspan="10" class="px-6 py-4 text-center text-gray-500">Không có minh chứng</td></tr>';
      } else {
        // Helpers to robustly extract context/device percent from various shapes
        const toPct = (val)=>{
          const num = getNumericScore(val);
          if (num == null || !isFinite(num)) return null;
          const pct = (num >= 0 && num <= 1) ? (num * 100) : num;
          return Math.max(0, Math.min(100, pct));
        };
        const parseDetails = (ev)=>{
          let d = ev.Details || ev.details || null;
          const dj = ev.DetailsJson || ev.detailsJson;
          if (!d && typeof dj === 'string'){
            try { d = JSON.parse(dj); } catch {}
          } else if (!d && dj && typeof dj === 'object') {
            d = dj;
          }
          return d || {};
        };
        const extractContextPct = (ev)=>{
          // Try top-level
          let v = toPct(ev.ContextPercent || ev.contextPercent || ev.ContextScore || ev.contextScore || ev.BannerPercent || ev.bannerPercent || ev.BannerScore || ev.bannerScore || ev.banner_score);
          if (v != null) return v;
          // Try details/scores with flexible keys
          const det = parseDetails(ev);
          const pools = [det.scores, det.Scores, det.details, det.Details, det.result, det.Result, det.ai, det.AI, det.banner, det.context];
          const keys = ['context','boicanh','scene','environment','banner','poster','standee','text_banner','bg_text','logo','context_score','contextScore','banner_score','bannerScore'];
          for (const p of pools){
            if (!p) continue;
            for (const k of keys){
              if (k in p){
                const n = toPct(p[k]);
                if (n != null) return n;
              }
            }
          }
          // Direct in result: contextScore
          if (det && (det.context_score!=null || det.contextScore!=null)){
            const n = toPct(det.context_score ?? det.contextScore);
            if (n != null) return n;
          }
          return null;
        };
        const extractDevicePct = (ev)=>{
          // Top-level
          let v = toPct(ev.DevicePercent || ev.devicePercent || ev.DeviceScore || ev.deviceScore || ev.device_score);
          if (v != null) return v;
          // Details
          const det = parseDetails(ev);
          const pools = [det.result, det.Result, det.scores, det.Scores, det.details, det.Details];
          const keys = ['deviceScore','device_score','device'];
          for (const p of pools){
            if (!p) continue;
            for (const k of keys){
              if (k in p){
                const n = toPct(p[k]);
                if (n != null) return n;
              }
            }
          }
          return null;
        };

        const toEnrich = [];
        tbody.innerHTML = items.map(ev=>{
          const v = ev.Verdict || ev.verdict;
          const studentId = getStudentIdFrom(ev);
          const activityName = getActivityNameFrom(ev);
          const evid = String(ev.EvidenceId || ev.evidenceId || '').trim();
          if (!evid) {
            console.warn('[GV] Evidence row skipped: missing ID', ev);
            return '';
          }
          // Hiển thị phần trăm theo AI phân tích; hỗ trợ cả giá trị 0..1 và 0..100
          const aiPct = toPct(ev.AIWeighted || ev.WeightedScore || ev.weightedScore || ev.AIScore || ev.aiScore);
          // Bối cảnh và Thiết bị: bóc tách linh hoạt từ nhiều dạng dữ liệu
          const contextPct = extractContextPct(ev);
          const facePct = toPct(ev.FacePercent || ev.facePercent || ev.FaceScore || ev.faceScore);
          const gpsPct = extractDevicePct(ev);
          if (contextPct == null || gpsPct == null) toEnrich.push({ id: evid, hasCtx: contextPct!=null, hasGps: gpsPct!=null });
          try {
            console.debug('[GV] Evidence row computed:', {
              id: ev.EvidenceId || ev.evidenceId,
              aiRaw: ev.AIWeighted || ev.WeightedScore || ev.weightedScore || ev.AIScore || ev.aiScore,
              aiPct,
              contextRaw: ev.ContextPercent || ev.contextPercent || ev.ContextScore || ev.contextScore || ev.BannerPercent || ev.bannerPercent || ev.BannerScore || ev.bannerScore || (parseDetails(ev) || {}),
              contextPct,
              faceRaw: ev.FacePercent || ev.facePercent || ev.FaceScore || ev.faceScore,
              facePct,
              gpsRaw: ev.DevicePercent || ev.devicePercent || ev.DeviceScore || ev.deviceScore || (parseDetails(ev) || {}),
              gpsPct
            });
          } catch {}
          const isRejected = String(v||'').toLowerCase() === 'rejected';
          const isApproved = String(v||'').toLowerCase() === 'approved';
          const isDeleted = String(ev?.Status||ev?.status||'').toLowerCase() === 'deleted';
          const canSelect = !isApproved && !isRejected && !isDeleted; // Chỉ cho phép chọn ManualReview/Pending
          return `<tr>
            <td class='px-3 py-4 whitespace-nowrap text-sm'><input type='checkbox' class='evidence-row-checkbox rounded' data-evidence-id='${evid}' data-mssv='${escapeHtml(studentId)}' ${!canSelect ? 'disabled' : ''} /></td>
            <td class='px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900'>${escapeHtml(studentId)}</td>
            <td class='px-3 py-4 whitespace-nowrap text-sm text-gray-700'>${escapeHtml(activityName)}</td>
            <td class='px-3 py-4 whitespace-nowrap text-sm font-semibold'>${aiPct!=null ? aiPct.toFixed(1)+'%' : '-'}</td>
            <td class='px-3 py-4 whitespace-nowrap text-sm' data-ctx-for='${evid}'>${contextPct!=null ? contextPct.toFixed(1)+'%' : '-'}</td>
            <td class='px-3 py-4 whitespace-nowrap text-sm'>${facePct!=null ? facePct.toFixed(1)+'%' : '-'}</td>
            <td class='px-3 py-4 whitespace-nowrap text-sm' data-gps-for='${evid}'>${gpsPct!=null ? gpsPct.toFixed(1)+'%' : '-'}</td>
            <td class='px-3 py-4 whitespace-nowrap text-sm'><span class='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${verdictBadgeClass(v)}'>${escapeHtml(v||'N/A')}</span></td>
            <td class='px-3 py-4 whitespace-nowrap text-xs text-gray-600'>${escapeHtml(safeStr(ev.Status||ev.status))}</td>
            <td class='px-3 py-4 whitespace-nowrap text-sm font-medium'>
              ${isDeleted ? 
                `<span class='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-300 text-gray-800'>Đã xóa</span>` :
                `<button class='text-blue-600 hover:text-blue-900 mr-2' data-view-evidence='${ev.EvidenceId||ev.evidenceId}'>Xem</button>
                ${isApproved ? 
                  `<span class='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800'>Đã duyệt</span>` : 
                  isRejected ? 
                    `<span class='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800'>Đã từ chối</span>
                    <span class='ml-2 text-xs text-gray-500'>(Sinh viên có thể khiếu nại)</span>
                    <button class='ml-2 text-orange-600 hover:text-orange-900' data-delete-evidence='${ev.EvidenceId||ev.evidenceId}' data-mssv='${escapeHtml(studentId)}'>Xóa</button>` : 
                    `<button class='text-green-600 hover:text-green-900 mr-2' data-approve-evidence='${ev.EvidenceId||ev.evidenceId}' data-mssv='${escapeHtml(getStudentIdFrom(ev))}'>Duyệt</button>
                    <button class='text-red-600 hover:text-red-900' data-reject-evidence='${ev.EvidenceId||ev.evidenceId}' data-mssv='${escapeHtml(studentId)}'>Từ chối</button>`
                }`
              }
            </td>
          </tr>`;
        }).join('');
        // Lazy enrich rows that miss context/gps by fetching evidence detail
        (async ()=>{
          const limit = 10; // avoid overloading; enrich first 10 missing rows
          for (const item of toEnrich.slice(0, limit)){
            try {
              const r = await fetch(`${API_BASE}/api/evidence/${item.id}`, withUserHeader());
              if (!r.ok) continue;
              const evd = await r.json();
              const ctx = extractContextPct(evd);
              const gps = extractDevicePct(evd);
              if (!item.hasCtx && ctx != null){
                const el = tbody.querySelector(`[data-ctx-for='${item.id}']`);
                if (el) el.textContent = `${ctx.toFixed(1)}%`;
              }
              if (!item.hasGps && gps != null){
                const el2 = tbody.querySelector(`[data-gps-for='${item.id}']`);
                if (el2) el2.textContent = `${gps.toFixed(1)}%`;
              }
            } catch {}
          }
        })();
  tbody.querySelectorAll('[data-view-evidence]').forEach(b=>b.addEventListener('click',()=>openEvidenceDetail(b.getAttribute('data-view-evidence'))));
  tbody.querySelectorAll('[data-approve-evidence]').forEach(b=>b.addEventListener('click',()=>approveEvidence(b.getAttribute('data-approve-evidence'), b.getAttribute('data-mssv'))));
  tbody.querySelectorAll('[data-reject-evidence]').forEach(b=>b.addEventListener('click',()=>rejectEvidence(b.getAttribute('data-reject-evidence'), b.getAttribute('data-mssv'))));
  tbody.querySelectorAll('[data-delete-evidence]').forEach(b=>b.addEventListener('click',()=>deleteEvidence(b.getAttribute('data-delete-evidence'), b.getAttribute('data-mssv'))));
  
  // Bind checkbox handlers
  const selectAllBtn = document.getElementById('evidence-select-all');
  const rowCheckboxes = tbody.querySelectorAll('.evidence-row-checkbox:not([disabled])');
  let lastCheckedCheckbox = null;
  
  selectAllBtn && selectAllBtn.addEventListener('change', function(){
    rowCheckboxes.forEach(cb => cb.checked = this.checked);
    updateEvidenceBulkActionButtons();
  });
  
  rowCheckboxes.forEach(cb => {
    cb.addEventListener('click', (e) => {
      // Shift+Click range selection
      if (e.shiftKey && lastCheckedCheckbox && lastCheckedCheckbox !== cb) {
        const checkboxArray = Array.from(rowCheckboxes);
        const currentIdx = checkboxArray.indexOf(cb);
        const lastIdx = checkboxArray.indexOf(lastCheckedCheckbox);
        const [start, end] = currentIdx < lastIdx ? [currentIdx, lastIdx] : [lastIdx, currentIdx];
        
        for (let i = start; i <= end; i++) {
          checkboxArray[i].checked = cb.checked;
        }
      }
      
      lastCheckedCheckbox = cb;
    });
    
    cb.addEventListener('change', () => {
      const allSelected = Array.from(rowCheckboxes).every(c => c.checked);
      const someSelected = Array.from(rowCheckboxes).some(c => c.checked);
      selectAllBtn && (selectAllBtn.checked = allSelected);
      updateEvidenceBulkActionButtons();
    });
  });
      }
      const pendingCount = items.filter(ev => (ev.Verdict||ev.verdict)==='ManualReview').length;
      if(pendingBadge){
        if(pendingCount>0){ pendingBadge.textContent=`${pendingCount} cần duyệt`; pendingBadge.classList.remove('hidden'); }
        else pendingBadge.classList.add('hidden');
      }
    } catch(err){
      console.error('loadEvidenceList error', err);
      tbody.innerHTML = '<tr><td colspan="9" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
    }
    const applyBtn = document.getElementById('evidence-filter-apply');
    if(applyBtn && !applyBtn.__bound){ applyBtn.addEventListener('click',()=>{ const pg=document.getElementById('evidence-filter-page'); if(pg) pg.value='1'; loadEvidenceList(); }); applyBtn.__bound=true; }
    
    // Bind bulk action button handlers
    const approveBulkBtn = document.getElementById('evidence-approve-bulk');
    const rejectBulkBtn = document.getElementById('evidence-reject-bulk');
    if(approveBulkBtn && !approveBulkBtn.__bound){ approveBulkBtn.addEventListener('click', approveBulkEvidence); approveBulkBtn.__bound=true; }
    if(rejectBulkBtn && !rejectBulkBtn.__bound){ rejectBulkBtn.addEventListener('click', rejectBulkEvidence); rejectBulkBtn.__bound=true; }
  }

  // ==== Real-time polling disabled by request; refresh only on F5 or manual navigation ====

  async function openEvidenceDetail(id){
    try {
      const title = document.getElementById('modal-title');
      const body = document.getElementById('modal-body');
      const videoUrl = `${API_BASE}/api/evidence/${id}/file`;
      let ev = null;
      let modelVersion = '';
      let processedAt = '';
      let jsonPretty = '<em class="text-xs text-gray-500">Không có chi tiết</em>';
      // Try to load metadata; ignore errors and fall back
      const res = await fetch(`${API_BASE}/api/evidence/${id}`);
      if(res.ok){
        ev = await res.json();
        modelVersion = ev.ModelVersion||ev.modelVersion||'';
        const processedAtRaw = ev.ProcessedAt||ev.processedAt||'';
        processedAt = processedAtRaw ? new Date(processedAtRaw).toLocaleString('vi-VN') : '';
        const detailJson = ev.DetailsJson||ev.detailsJson||null;
        if(detailJson){
          jsonPretty = `<pre class='text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap'>${escapeHtml(typeof detailJson==='string'?detailJson:JSON.stringify(detailJson,null,2))}</pre>`;
        }
      }
      const studentId = ev ? getStudentIdFrom(ev) : '';
      const activityName = ev ? getActivityNameFrom(ev) : '';
      // Compute AI metrics (supports 0..1 or 0..100 inputs)
      const toPercent = (val)=>{
        const num = getNumericScore(val);
        if (num == null || !isFinite(num)) return null;
        const pct = (num >= 0 && num <= 1) ? (num * 100) : num;
        return Math.max(0, Math.min(100, pct));
      };
      const parseDetails = ()=>{
        let d = ev?.Details || ev?.details || null;
        const dj = ev?.DetailsJson || ev?.detailsJson;
        if (!d && typeof dj === 'string') { try { d = JSON.parse(dj); } catch{} }
        else if (!d && dj && typeof dj === 'object') { d = dj; }
        return d || {};
      };
      let aiPct = toPercent(ev?.AIWeighted || ev?.WeightedScore || ev?.weightedScore || ev?.AIScore || ev?.aiScore);
      let facePct = toPercent(ev?.FacePercent || ev?.facePercent || ev?.FaceScore || ev?.faceScore);
      let contextPct = toPercent(ev?.ContextPercent || ev?.contextPercent || ev?.ContextScore || ev?.contextScore || ev?.BannerPercent || ev?.bannerPercent || ev?.BannerScore || ev?.bannerScore || ev?.banner_score);
      let gpsPct = toPercent(ev?.DevicePercent || ev?.devicePercent || ev?.DeviceScore || ev?.deviceScore || ev?.device_score);
      // Fallback to details when top-level fields are missing
      const det = parseDetails();
      if (contextPct == null){
        const pools = [det.scores, det.Scores, det.details, det.Details, det.result, det.Result, det.ai, det.AI, det.banner, det.context];
        const keys = ['context','boicanh','scene','environment','banner','poster','standee','text_banner','bg_text','logo','context_score','contextScore','banner_score','bannerScore'];
        for (const p of pools){ if (!p) continue; for (const k of keys){ if (k in p){ const n = toPercent(p[k]); if (n != null){ contextPct = n; break; } } } if (contextPct!=null) break; }
        if (contextPct==null && (det.context_score!=null || det.contextScore!=null)) contextPct = toPercent(det.context_score ?? det.contextScore);
      }
      if (gpsPct == null){
        const pools = [det.result, det.Result, det.scores, det.Scores, det.details, det.Details, det.device, det.Device, det.gps, det.GPS];
        const keys = ['deviceScore','device_score','device','gps','GPS','DeviceScore','DevicePercent','devicePercent'];
        for (const p of pools){ if (!p) continue; for (const k of keys){ if (k in p){ const n = toPercent(p[k]); if (n != null){ gpsPct = n; break; } } } if (gpsPct!=null) break; }
      }
      title.textContent = `Minh chứng: ${studentId ? studentId + ' - ' : ''}${activityName ? activityName + ' - ' : ''}${ev?.EvidenceId||ev?.evidenceId||id}`;
      const previewUrl = `${API_BASE}/api/evidence/${id}/preview`;
      const downloadUrl = `${API_BASE}/api/evidence/${id}/download`;
      const fileUrl = `${API_BASE}/api/evidence/${id}/file`;
      body.innerHTML = `
        <div class='space-y-4'>
          <div class='grid grid-cols-2 gap-4'>
            <div><span class='text-xs text-gray-500'>MSSV</span><div class='font-medium'>${studentId}</div></div>
            <div><span class='text-xs text-gray-500'>Hoạt động</span><div class='font-medium'>${activityName}</div></div>
            <div><span class='text-xs text-gray-500'>Trạng thái</span><div class='text-sm'>${ev?.Status||ev?.status||''}</div></div>
            <div><span class='text-xs text-gray-500'>Verdict</span><div class='inline-flex px-2 py-1 rounded text-xs font-medium ${verdictBadgeClass(ev?.Verdict||ev?.verdict)}'>${ev?.Verdict||ev?.verdict||''}</div></div>
            ${modelVersion?`<div><span class='text-xs text-gray-500'>AI Model</span><div class='font-medium'>${escapeHtml(modelVersion)}</div></div>`:''}
            ${processedAt?`<div><span class='text-xs text-gray-500'>Phân tích lúc</span><div class='font-medium'>${escapeHtml(processedAt)}</div></div>`:''}
          </div>

          <div class='space-y-2'>
            <h4 class='text-sm font-semibold'>Kết quả AI</h4>
            <div class='grid grid-cols-1 md:grid-cols-4 gap-3'>
              <div class='p-3 rounded border bg-white'>
                <div class='text-xs text-gray-500'>Điểm AI</div>
                <div class='text-sm font-semibold'>${aiPct!=null ? aiPct.toFixed(1)+'%' : '-'}</div>
                <div class='h-1.5 bg-gray-200 rounded mt-2'><div style='width:${aiPct||0}%' class='h-1.5 bg-blue-600 rounded'></div></div>
              </div>
              <div class='p-3 rounded border bg-white'>
                <div class='text-xs text-gray-500'>Face</div>
                <div class='text-sm font-semibold'>${facePct!=null ? facePct.toFixed(1)+'%' : '-'}</div>
                <div class='h-1.5 bg-gray-200 rounded mt-2'><div style='width:${facePct||0}%' class='h-1.5 bg-green-600 rounded'></div></div>
              </div>
              <div class='p-3 rounded border bg-white'>
                <div class='text-xs text-gray-500'>Bối cảnh</div>
                <div class='text-sm font-semibold'>${contextPct!=null ? contextPct.toFixed(1)+'%' : '-'}</div>
                <div class='h-1.5 bg-gray-200 rounded mt-2'><div style='width:${contextPct||0}%' class='h-1.5 bg-purple-600 rounded'></div></div>
              </div>
              <div class='p-3 rounded border bg-white'>
                <div class='text-xs text-gray-500'>Thiết bị</div>
                <div class='text-sm font-semibold'>${gpsPct!=null ? gpsPct.toFixed(1)+'%' : '-'}</div>
                <div class='h-1.5 bg-gray-200 rounded mt-2'><div style='width:${gpsPct||0}%' class='h-1.5 bg-yellow-600 rounded'></div></div>
              </div>
            </div>
          </div>

          <div class='space-y-2'>
            <h4 class='text-sm font-semibold'>Xem trước minh chứng</h4>
            <div class='border rounded overflow-hidden'>
              ${String(ev?.Status||ev?.status||'').toLowerCase() === 'deleted' 
                ? `<div class='p-8 bg-gray-100 text-center text-gray-600'><p class='text-sm'>Minh chứng đã được xóa. Không thể xem file này nữa.</p></div>`
                : `<video id='evidence-video' class='w-full max-h-96 bg-black' controls playsinline></video>
                   <div id='video-error' class='p-3 text-sm text-red-600 hidden'></div>`}
            </div>
          </div>
          <div class='flex gap-2 pt-2'>
            ${String(ev?.Status||ev?.status||'').toLowerCase() === 'deleted' 
              ? `<span class='px-3 py-2 rounded text-sm bg-gray-300 text-gray-800'>Đã xóa</span>`
              : `<a class='px-3 py-2 bg-blue-600 text-white rounded text-sm' href='${downloadUrl}' target='_blank'>Tải xuống</a>`}
            ${String(ev?.Verdict||ev?.verdict||'').toLowerCase() === 'approved' 
              ? `<span class='px-3 py-2 rounded text-sm bg-green-100 text-green-800'>Đã duyệt</span>`
              : String(ev?.Verdict||ev?.verdict||'').toLowerCase() === 'rejected'
              ? `<span class='px-3 py-2 rounded text-sm bg-red-100 text-red-800'>Đã từ chối</span>
                 <button class='ml-2 px-3 py-2 bg-amber-600 text-white rounded text-sm' id='modal-complaint-btn' data-evid='${id}' data-mssv='${escapeHtml(studentId)}'>Khiếu nại</button>`
              : String(ev?.Status||ev?.status||'').toLowerCase() === 'deleted'
              ? ''
              : `<button class='px-3 py-2 bg-green-600 text-white rounded text-sm' id='modal-approve-btn' data-evid='${id}' data-mssv='${escapeHtml(studentId)}'>Duyệt</button>
                 <button class='px-3 py-2 bg-red-600 text-white rounded text-sm' id='modal-reject-btn' data-evid='${id}' data-mssv='${escapeHtml(studentId)}'>Từ chối</button>`}
          </div>
          <div class='space-y-2'>
            <h4 class='text-sm font-semibold'>Chi tiết AI</h4>
            ${jsonPretty}
          </div>
        </div>`;
      openModal();
      // bind modal action buttons
    const ab = document.getElementById('modal-approve-btn');
    const rb = document.getElementById('modal-reject-btn');
    const cb = document.getElementById('modal-complaint-btn');
    ab && ab.addEventListener('click', ()=> approveEvidence(id, studentId));
    rb && rb.addEventListener('click', ()=> rejectEvidence(id, studentId));
    cb && cb.addEventListener('click', ()=> fileComplaint(id, studentId));
      // Load video via Blob to avoid auto-download behavior from preview endpoint
      // Skip loading if evidence was soft-deleted
      if (String(ev?.Status||ev?.status||'').toLowerCase() !== 'deleted') {
        try {
          const v = document.getElementById('evidence-video');
          const errEl = document.getElementById('video-error');
          const r = await fetch(fileUrl, withUserHeader());
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          v.src = url;
          // Try to set common video mime types for better playback
          try {
            const type = blob.type || '';
            if (!type) {
              // no explicit type; attempt play
              v.load();
            }
          } catch{}
          v.onloadeddata = () => { /* ready */ };
          v.onerror = () => {
            errEl.classList.remove('hidden');
            errEl.textContent = 'Không thể phát video. Vui lòng tải xuống hoặc thử lại sau.';
          };
        } catch (e) {
          const errEl = document.getElementById('video-error');
          errEl.classList.remove('hidden');
          errEl.textContent = 'Không thể tải video ( '+e.message+' ).';
        }
      }
    } catch(err){
      console.error('openEvidenceDetail error', err);
      const title = document.getElementById('modal-title');
      const body = document.getElementById('modal-body');
      const previewUrl = `${API_BASE}/api/evidence/${id}/preview`;
      title.textContent = `Minh chứng: ${id}`;
      body.innerHTML = `
        <div class='space-y-4'>
          <div class='text-xs text-gray-500'>Không tải được metadata, hiển thị xem trước.</div>
          <div class='border rounded overflow-hidden'>
            <video id='evidence-video-fallback' class='w-full max-h-96 bg-black' controls playsinline></video>
          </div>
          <div class='pt-2'>
            <a class='px-3 py-2 bg-blue-600 text-white rounded text-sm' href='${API_BASE}/api/evidence/${id}/download' target='_blank'>Tải xuống</a>
          </div>
        </div>`;
      openModal();
      // Attempt direct file load even in fallback
      try{
        const v2 = document.getElementById('evidence-video-fallback');
        const r2 = await fetch(`${API_BASE}/api/evidence/${id}/file`, withUserHeader());
        if (r2.ok){ const b2 = await r2.blob(); v2.src = URL.createObjectURL(b2); v2.load(); }
      }catch{}
    }
  }

  // === Approve/Reject evidence ===
  async function approveEvidence(id, mssv){
    try {
      const studentId = mssv || prompt('Nhập MSSV để duyệt:');
      if (!studentId) return;
      // Guard: chỉ GVCN lớp của sinh viên mới được duyệt
      try {
        // Nếu chưa có danh sách lớp cố vấn, gateSectionsByLecturer đã chạy đầu trang; kiểm tra nhanh
        if (!Array.isArray(lecturerClasses) || lecturerClasses.length === 0) {
          alert('Bạn chưa được cấu hình làm GVCN cho bất kỳ lớp nào. Không thể duyệt minh chứng.');
          return;
        }
        const svRes = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(studentId)}`, withUserHeader());
        if (!svRes.ok) throw new Error(`HTTP ${svRes.status}`);
        const sv = await svRes.json();
        const svLop = sv.MaLop || sv.maLop || '';
        const allowed = lecturerClasses.some(c => String(c.MaLop) === String(svLop));
        if (!allowed) {
          alert('Bạn không phải GVCN lớp của sinh viên này nên không thể duyệt minh chứng.');
          return;
        }
      } catch (gErr) {
        // Nếu không kiểm tra được, fail an toàn
        alert('Không xác định được lớp của sinh viên để kiểm tra quyền duyệt.');
        return;
      }
      const res = await fetch(`${API_BASE}/api/evidence/${id}/approve?mssv=${encodeURIComponent(studentId)}`, withUserHeader({ method:'POST' }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let info = null; try { info = await res.json(); } catch {}
      if (info && typeof info.pointsAdded !== 'undefined') {
        alert(`Đã duyệt minh chứng. Cộng thêm: +${info.pointsAdded} điểm (Học kỳ ${info.semester}, Năm ${info.year}).`);
      } else {
        alert('Đã duyệt minh chứng và cộng điểm (nếu áp dụng)');
      }
      // reload list to reflect verdict change
      await loadEvidenceList();
      // if đang xem bảng sinh viên lớp, refresh để cập nhật cột Điểm rèn luyện (đọc từ LUUTRUDIEMSV)
      try {
        if (currentClassInfo && currentClassInfo.maLop) {
          await loadClassStudents(currentClassInfo.maLop, currentClassInfo.tenLop, currentClassInfo.year);
        }
      } catch {}
      // optional: close modal if open
      try { closeModal(); } catch {}
      // try notify student if endpoint available (best-effort)
      try {
        const payload = { to: studentId, type: 'EvidenceApproved', message: `Minh chứng ${id} đã được giảng viên duyệt.` };
        await fetch(`${API_BASE}/api/notifications/send`, withUserHeader({ method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) }));
      } catch {}
    } catch (e) {
      alert('Lỗi duyệt minh chứng: '+ e.message);
    }
  }

  async function rejectEvidence(id, mssv){
    try {
      const reason = prompt('Nhập lý do từ chối (tuỳ chọn):', '') || '';
      // Xác định MSSV: ưu tiên tham số; sau đó thử lấy từ modal; cuối cùng hỏi người dùng
      let studentId = mssv || '';
      if (!studentId){
        try {
          // Lấy MSSV từ modal (ô đầu tiên trong grid Metadata)
          const firstCell = document.querySelector('#modal-body .grid .font-medium');
          if (firstCell) studentId = (firstCell.textContent||'').trim();
        } catch {}
      }
      if (!studentId){
        const input = prompt('Không tìm thấy MSSV trong giao diện. Nhập MSSV để từ chối:');
        if (!input) return; 
        studentId = input.trim();
      }
      // Guard quyền: chỉ GVCN của SV mới được từ chối
      try {
        if (!Array.isArray(lecturerClasses) || lecturerClasses.length === 0) {
          alert('Bạn chưa được cấu hình làm GVCN cho bất kỳ lớp nào. Không thể từ chối minh chứng.');
          return;
        }
        const svRes = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(studentId)}`, withUserHeader());
        if (svRes.ok) {
          const sv = await svRes.json();
          const svLop = sv.MaLop || sv.maLop || '';
          const allowed = lecturerClasses.some(c => String(c.MaLop) === String(svLop));
          if (!allowed) {
            alert('Bạn không phải GVCN lớp của sinh viên này nên không thể từ chối minh chứng.');
            return;
          }
        }
      } catch {}

      const qsParams = new URLSearchParams();
      if (reason) qsParams.set('reason', reason);
      const qs = qsParams.toString() ? `?${qsParams.toString()}` : '';

      const res = await fetch(`${API_BASE}/api/evidence/${id}/reject${qs}`, withUserHeader({ method:'POST' }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alert('Đã từ chối minh chứng');
      await loadEvidenceList();
      try { closeModal(); } catch {}
    } catch (e) {
      alert('Lỗi từ chối minh chứng: '+ e.message);
    }
  }

  async function fileComplaint(id, mssv){
    try {
      const reason = prompt('Vui lòng nhập lý do khiếu nại:', '');
      if (reason === null) return; // User cancelled
      
      const studentId = mssv || '';
      if (!studentId) {
        alert('Không xác định được MSSV của sinh viên');
        return;
      }
      
      const res = await fetch(`${API_BASE}/api/evidence/${id}/complaint?mssv=${encodeURIComponent(studentId)}&reason=${encodeURIComponent(reason)}`, 
        withUserHeader({ method: 'POST' }));
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}`);
      }
      
      alert('Khiếu nại đã được gửi đến Khoa. Khoa sẽ xem xét trong vòng 48 giờ.');
      try { closeModal(); } catch {}
      await loadEvidenceList();
    } catch (e) {
      alert('Lỗi gửi khiếu nại: ' + e.message);
    }
  }

  // === Delete evidence (only when Rejected) ===
  async function deleteEvidence(id, mssv){
    try{
      if (!confirm('Xóa minh chứng này? Hành động không thể hoàn tác.')) return;
      // Determine student id for permission and audit
      let studentId = mssv || '';
      if (!studentId){
        try{ // try from modal view first cell
          studentId = document.querySelector('#modal-body .grid div .font-medium')?.textContent?.trim() || '';
        }catch{}
      }
      if (!studentId){
        alert('Không xác định được MSSV của minh chứng. Không thể xóa.');
        return;
      }
      // Permission guard: only homeroom lecturer of the student
      try {
        if (!Array.isArray(lecturerClasses) || lecturerClasses.length === 0) {
          alert('Bạn chưa được cấu hình làm GVCN cho bất kỳ lớp nào. Không thể xóa minh chứng.');
          return;
        }
        const svRes = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(studentId)}`, withUserHeader());
        if (!svRes.ok) throw new Error(`HTTP ${svRes.status}`);
        const sv = await svRes.json();
        const svLop = sv.MaLop || sv.maLop || '';
        const allowed = lecturerClasses.some(c => String(c.MaLop) === String(svLop));
        if (!allowed) {
          alert('Bạn không phải GVCN lớp của sinh viên này nên không thể xóa minh chứng.');
          return;
        }
      } catch (e) {
        alert('Không xác minh được quyền xóa minh chứng.');
        return;
      }

      const resp = await fetch(`${API_BASE}/api/evidence/${id}`, withUserHeader({ method:'DELETE' }));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      // Best-effort audit log
      try{
        const audit = {
          action: 'DeleteEvidence',
          evidenceId: id,
          studentId,
          reason: 'Deleted after rejection by lecturer',
          timestamp: new Date().toISOString()
        };
        await fetch(`${API_BASE}/api/audit/log`, withUserHeader({ method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(audit) }));
      }catch{}

      alert('Đã xóa minh chứng.');
      await loadEvidenceList();
      try { closeModal(); } catch {}
    }catch(e){
      alert('Lỗi xóa minh chứng: ' + e.message);
    }
  }

  // ==== Bulk Actions for Evidence ====
  function updateEvidenceBulkActionButtons(){
    const selectedCheckboxes = document.querySelectorAll('.evidence-row-checkbox:checked');
    const selectedCount = selectedCheckboxes.length;
    const countSpan = document.getElementById('evidence-selected-count');
    const numSpan = document.getElementById('evidence-selected-num');
    const approveBulkBtn = document.getElementById('evidence-approve-bulk');
    const rejectBulkBtn = document.getElementById('evidence-reject-bulk');
    
    // Debug: Log selected items
    if (selectedCount > 0) {
      console.log(`[BulkAction] ${selectedCount} items selected:`, Array.from(selectedCheckboxes).map(cb => ({
        id: cb.getAttribute('data-evidence-id'),
        mssv: cb.getAttribute('data-mssv')
      })));
    }
    
    if (selectedCount > 0) {
      countSpan && countSpan.classList.remove('hidden');
      numSpan && (numSpan.textContent = selectedCount);
      approveBulkBtn && approveBulkBtn.classList.remove('hidden');
      rejectBulkBtn && rejectBulkBtn.classList.remove('hidden');
    } else {
      countSpan && countSpan.classList.add('hidden');
      approveBulkBtn && approveBulkBtn.classList.add('hidden');
      rejectBulkBtn && rejectBulkBtn.classList.add('hidden');
    }
  }

  async function approveBulkEvidence(){
    const selectedCheckboxes = Array.from(document.querySelectorAll('.evidence-row-checkbox:checked'));
    if (selectedCheckboxes.length === 0) {
      alert('Vui lòng chọn ít nhất một minh chứng');
      return;
    }
    
    if (!confirm(`Duyệt ${selectedCheckboxes.length} minh chứng? Hành động này không thể hoàn tác.`)) {
      return;
    }

    const ids = selectedCheckboxes.map(cb => {
      const id = (cb.getAttribute('data-evidence-id') || '').trim();
      console.log(`[BulkApprove] Selected ID: '${id}' (length: ${id.length})`);
      return id;
    }).filter(id => id && id.length > 0);
    
    if (ids.length === 0) {
      alert('Lỗi: không thể lấy được ID minh chứng. Vui lòng thử lại.');
      return;
    }
    
    const mssvs = selectedCheckboxes.slice(0, ids.length).map(cb => cb.getAttribute('data-mssv'));
    
    try {
      let successCount = 0;
      let failCount = 0;
      const failedList = [];

      // Process in batches of 5 parallel requests
      const batchSize = 5;
      for (let batch = 0; batch < ids.length; batch += batchSize) {
        const batchIds = ids.slice(batch, batch + batchSize);
        const batchMssvs = mssvs.slice(batch, batch + batchSize);
        
        await Promise.all(batchIds.map(async (id, idx) => {
          const realIdx = batch + idx;
          try {
            console.log(`[BulkApprove] Processing ${realIdx+1}/${ids.length}: ${id}`);
            const res = await fetch(`${API_BASE}/api/evidence/${id}/approve?mssv=${encodeURIComponent(batchMssvs[idx])}`, 
              withUserHeader({ method:'POST' }));
            if (res.ok) {
              successCount++;
              console.log(`[BulkApprove] OK: ${id}`);
            } else {
              failCount++;
              console.log(`[BulkApprove] FAIL HTTP ${res.status}: ${id}`);
              failedList.push(`${batchMssvs[idx]} (${id})`);
            }
          } catch (e) {
            failCount++;
            console.error(`[BulkApprove] Exception: ${id}`, e);
            failedList.push(`${batchMssvs[idx]} (${id}) - ${e.message}`);
          }
        }));
      }

      let msg = `Đã duyệt ${successCount}/${ids.length} minh chứng`;
      if (failCount > 0) {
        msg += `\n\nLỗi (${failCount}): ${failedList.join(', ')}`;
      }
      alert(msg);
      
      // Clear selection
      selectedCheckboxes.forEach(cb => cb.checked = false);
      const selectAllBtn = document.getElementById('evidence-select-all');
      if(selectAllBtn) selectAllBtn.checked = false;
      updateEvidenceBulkActionButtons();
      
      // Close modal if open
      try { closeModal(); } catch {}
      
      console.log('[BulkApprove] Reloading evidence list...');
      await loadEvidenceList();
      console.log('[BulkApprove] Done');
    } catch (e) {
      console.error('[BulkApprove] Fatal error:', e);
      alert('Lỗi duyệt nhiều minh chứng: ' + e.message);
    }
  }

  async function rejectBulkEvidence(){
    const selectedCheckboxes = Array.from(document.querySelectorAll('.evidence-row-checkbox:checked'));
    if (selectedCheckboxes.length === 0) {
      alert('Vui lòng chọn ít nhất một minh chứng');
      return;
    }

    const reason = prompt(`Nhập lý do từ chối (tuỳ chọn) cho ${selectedCheckboxes.length} minh chứng:`, '') || '';
    
    if (!confirm(`Từ chối ${selectedCheckboxes.length} minh chứng? Hành động này không thể hoàn tác.`)) {
      return;
    }

    const ids = selectedCheckboxes.map(cb => (cb.getAttribute('data-evidence-id') || '').trim()).filter(id => id);
    if (ids.length === 0) {
      alert('Lỗi: không thể lấy được ID minh chứng. Vui lòng thử lại.');
      return;
    }
    const mssvs = selectedCheckboxes.slice(0, ids.length).map(cb => cb.getAttribute('data-mssv'));
    
    try {
      let successCount = 0;
      let failCount = 0;
      const failedList = [];

      // Process in batches of 5 parallel requests
      const batchSize = 5;
      for (let batch = 0; batch < ids.length; batch += batchSize) {
        const batchIds = ids.slice(batch, batch + batchSize);
        const batchMssvs = mssvs.slice(batch, batch + batchSize);
        
        await Promise.all(batchIds.map(async (id, idx) => {
          const realIdx = batch + idx;
          try {
            console.log(`[BulkReject] Processing ${realIdx+1}/${ids.length}: ${id}`);
            const params = new URLSearchParams();
            if (reason) params.append('reason', reason);
            const qs = params.toString() ? `?${params.toString()}` : '';
            
            const res = await fetch(`${API_BASE}/api/evidence/${id}/reject${qs}`, 
              withUserHeader({ method:'POST' }));
            if (res.ok) {
              successCount++;
              console.log(`[BulkReject] OK: ${id}`);
            } else {
              failCount++;
              console.log(`[BulkReject] FAIL HTTP ${res.status}: ${id}`);
              failedList.push(`${batchMssvs[idx]} (${id})`);
            }
          } catch (e) {
            failCount++;
            console.error(`[BulkReject] Exception: ${id}`, e);
            failedList.push(`${batchMssvs[idx]} (${id}) - ${e.message}`);
          }
        }));
      }

      let msg = `Đã từ chối ${successCount}/${ids.length} minh chứng`;
      if (failCount > 0) {
        msg += `\n\nLỗi (${failCount}): ${failedList.join(', ')}`;
      }
      alert(msg);
      
      // Clear selection
      selectedCheckboxes.forEach(cb => cb.checked = false);
      const selectAllBtn = document.getElementById('evidence-select-all');
      if(selectAllBtn) selectAllBtn.checked = false;
      updateEvidenceBulkActionButtons();
      
      // Close modal if open
      try { closeModal(); } catch {}
      
      console.log('[BulkReject] Reloading evidence list...');
      await loadEvidenceList();
      console.log('[BulkReject] Done');
    } catch (e) {
      console.error('[BulkReject] Fatal error:', e);
      alert('Lỗi từ chối nhiều minh chứng: ' + e.message);
    }
  }

  async function deleteBulkEvidence(){
    const selectedCheckboxes = Array.from(document.querySelectorAll('.evidence-row-checkbox:checked'));
    if (selectedCheckboxes.length === 0) {
      alert('Vui lòng chọn ít nhất một minh chứng');
      return;
    }

    // Check if any are not rejected yet
    const notRejectedCheckboxes = selectedCheckboxes.filter(cb => {
      const row = cb.closest('tr');
      const verdictCell = row?.querySelector('[class*="inline-flex"]');
      const verdict = verdictCell?.textContent?.trim() || '';
      return verdict.toLowerCase() !== 'rejected' && verdict.toLowerCase() !== 'đã từ chối';
    });

    let shouldRejectFirst = false;
    if (notRejectedCheckboxes.length > 0) {
      const confirmReject = confirm(
        `Có ${notRejectedCheckboxes.length}/${selectedCheckboxes.length} minh chứng chưa bị từ chối.\n\n` +
        `Bạn có muốn từ chối những minh chứng này trước khi xóa không?\n\n` +
        `- Nhấn "OK" để từ chối rồi xóa\n` +
        `- Nhấn "Hủy" để xóa luôn (không từ chối)`
      );
      shouldRejectFirst = confirmReject;
    }

    if (!confirm(`Xóa ${selectedCheckboxes.length} minh chứng? Hành động này không thể hoàn tác.`)) {
      return;
    }

    const ids = selectedCheckboxes.map(cb => (cb.getAttribute('data-evidence-id') || '').trim()).filter(id => id);
    if (ids.length === 0) {
      alert('Lỗi: không thể lấy được ID minh chứng. Vui lòng thử lại.');
      return;
    }
    const mssvs = selectedCheckboxes.slice(0, ids.length).map(cb => cb.getAttribute('data-mssv'));
    
    try {
      let successCount = 0;
      let failCount = 0;
      let rejectCount = 0;
      const failedList = [];
      const rejectReason = shouldRejectFirst ? prompt('Nhập lý do từ chối (tuỳ chọn):', '') || '' : '';

      // Process in batches of 5 parallel requests
      const batchSize = 5;
      for (let batch = 0; batch < ids.length; batch += batchSize) {
        const batchIds = ids.slice(batch, batch + batchSize);
        const batchMssvs = mssvs.slice(batch, batch + batchSize);
        
        await Promise.all(batchIds.map(async (id, idx) => {
          const realIdx = batch + idx;
          try {
            console.log(`[BulkDelete] Processing ${realIdx+1}/${ids.length}: ${id}`);
            
            // Reject first if needed
            if (shouldRejectFirst && notRejectedCheckboxes.some(cb => cb.getAttribute('data-evidence-id') === id)) {
              try {
                const params = new URLSearchParams();
                if (rejectReason) params.append('reason', rejectReason);
                const qs = params.toString() ? `?${params.toString()}` : '';
                
                const rejectRes = await fetch(`${API_BASE}/api/evidence/${id}/reject${qs}`, 
                  withUserHeader({ method:'POST' }));
                if (rejectRes.ok) {
                  rejectCount++;
                  console.log(`[BulkDelete] Rejected: ${id}`);
                }
              } catch (e) {
                console.log(`[BulkDelete] Reject failed for ${id}, continuing with delete anyway`);
              }
            }

            // Delete
            const res = await fetch(`${API_BASE}/api/evidence/${id}`, 
              withUserHeader({ method:'DELETE' }));
            if (res.ok) {
              successCount++;
              console.log(`[BulkDelete] Deleted OK: ${id}`);
              // Audit log bỏ qua - endpoint không tồn tại
              // (Có thể thêm sau khi backend hỗ trợ)
            } else {
              failCount++;
              console.log(`[BulkDelete] FAIL HTTP ${res.status}: ${id}`);
              failedList.push(`${batchMssvs[idx]} (${id})`);
            }
          } catch (e) {
            failCount++;
            console.error(`[BulkDelete] Exception: ${id}`, e);
            failedList.push(`${batchMssvs[idx]} (${id}) - ${e.message}`);
          }
        }));
      }

      let msg = `Đã xóa ${successCount}/${ids.length} minh chứng`;
      if (shouldRejectFirst && rejectCount > 0) {
        msg = `Từ chối và xóa ${rejectCount} minh chứng. Xóa tổng cộng ${successCount}/${ids.length}.`;
      }
      if (failCount > 0) {
        msg += `\n\nLỗi (${failCount}): ${failedList.join(', ')}`;
      }
      alert(msg);
      
      // Clear selection
      selectedCheckboxes.forEach(cb => cb.checked = false);
      const selectAllBtn = document.getElementById('evidence-select-all');
      if(selectAllBtn) selectAllBtn.checked = false;
      updateEvidenceBulkActionButtons();
      
      // Close modal if open
      try { closeModal(); } catch {}
      
      console.log('[BulkDelete] Reloading evidence list...');
      await loadEvidenceList();
      console.log('[BulkDelete] Done');
    } catch (e) {
      console.error('[BulkDelete] Fatal error:', e);
      alert('Lỗi xóa nhiều minh chứng: ' + e.message);
    }
  }

  // Evidence approval/rejection helpers removed.
  async function reanalyzeEvidence(id){
    try {
      const r = await fetch(`${API_BASE}/api/evidence/${id}/reanalyze`, { method:'POST', headers: withUserHeader().headers });
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      alert('Đã gửi yêu cầu phân tích lại');
      openEvidenceDetail(id);
    } catch(e){ alert('Lỗi phân tích lại: '+e.message); }
  }

  // ==== Add Activity Functions ====
  function openAddActivityModal() {
    const modal = document.getElementById("add-activity-modal");
    const modalTitle = modal.querySelector('h3');
    const submitText = document.getElementById('submit-text');
    const form = document.getElementById('add-activity-form');
    
    // Đảm bảo tiêu đề và text nút đúng cho chế độ thêm mới
    modalTitle.textContent = 'Thêm hoạt động mới';
    if (submitText) {
      submitText.textContent = 'Thêm hoạt động';
    }
    
    // Xóa tất cả event listener cũ và gắn lại event listener cho thêm mới
    form.removeEventListener('submit', window.handleAddActivitySubmit);
    if (window.handleAddActivitySubmit) {
      form.addEventListener('submit', window.handleAddActivitySubmit);
    }
    
    modal.classList.remove("hidden");
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("activity-start-date").value = today;
    document.getElementById("activity-end-date").value = today;
  }

  function closeAddActivityModal() {
    const modal = document.getElementById("add-activity-modal");
    const modalTitle = modal.querySelector('h3');
    const submitText = document.getElementById('submit-text');
    const form = document.getElementById("add-activity-form");
    
    modal.classList.add("hidden");
    form.reset();
    
    // Reset tiêu đề và text nút về chế độ thêm mới
    modalTitle.textContent = 'Thêm hoạt động mới';
    if (submitText) {
      submitText.textContent = 'Thêm hoạt động';
    }
    
    // Reset event listener về chế độ thêm mới
    form.removeEventListener('submit', window.handleAddActivitySubmit);
    if (window.handleAddActivitySubmit) {
      form.addEventListener('submit', window.handleAddActivitySubmit);
    }
  }

  async function submitAddActivity(formData) {
    try {
      // Show loading state
      const submitBtn = document.querySelector('#add-activity-form button[type="submit"]');
      const submitText = document.getElementById("submit-text");
      const submitLoading = document.getElementById("submit-loading");
      
      submitBtn.disabled = true;
      submitText.textContent = "Đang thêm...";
      submitLoading.classList.remove("hidden");

      const requestData = {
        MaHD: formData.maHD,
        TenHD: formData.tenHD,
        DiemRL: formData.diemRL,
        NDHD: formData.moTa || null,
        NgayBD: new Date(formData.ngayBD),
        NgayKT: new Date(formData.ngayKT),
        SoSvDK: formData.soLuongToiDa || null,
        DiaDiem: formData.diaDiem || null,
        TUKHOA: formData.yeuCau || null
      };

      console.log('Sending request data:', requestData);
      console.log('Request headers:', withUserHeader().headers);

      const response = await fetch(`${API_BASE}/api/hoatdong`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...withUserHeader().headers
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      alert(result.message || "Thêm hoạt động thành công!");
      closeAddActivityModal();
      loadActivities(); // Reload activities list
      
    } catch (error) {
      console.error("Error adding activity:", error);
      alert("Lỗi thêm hoạt động: " + error.message);
    } finally {
      // Reset loading state
      const submitBtn = document.querySelector('#add-activity-form button[type="submit"]');
      const submitText = document.getElementById("submit-text");
      const submitLoading = document.getElementById("submit-loading");
      
      submitBtn.disabled = false;
      submitText.textContent = "Thêm hoạt động";
      submitLoading.classList.add("hidden");
    }
  }

  // ==== Request Activity (Lecturer-only) ====
  function openRequestActivityModal() {
    const modal = document.getElementById('request-activity-modal');
    if (!modal) return;
    const today = new Date().toISOString().split('T')[0];
    modal.classList.remove('hidden');
    // prefill simple title
    const titleEl = document.getElementById('request-title');
    const bodyEl = document.getElementById('request-body');
    if (titleEl && !titleEl.value) titleEl.value = 'Yêu cầu tạo hoạt động - ' + today;
    if (bodyEl && !bodyEl.value) bodyEl.value = 'Mô tả ngắn:\nThời gian dự kiến:\nĐịa điểm:\nĐiểm RL đề xuất:';
  }

  function closeRequestActivityModal(){
    const modal = document.getElementById('request-activity-modal'); if (!modal) return; modal.classList.add('hidden');
    const form = document.getElementById('request-activity-form'); if (form) form.reset();
    const res = document.getElementById('request-result'); if (res) { res.classList.add('hidden'); res.textContent=''; }
  }

  // Handler: try to POST to an API endpoint; if unavailable, copy to clipboard
  async function handleRequestActivitySubmit(e){
    e.preventDefault();
    const title = document.getElementById('request-title')?.value || '';
    const body = document.getElementById('request-body')?.value || '';
    const resultEl = document.getElementById('request-result');
    if (resultEl) { resultEl.classList.remove('hidden'); resultEl.textContent = 'Đang gửi yêu cầu...'; }
    const payload = { title, body, submittedBy: (window.loggedUser?.MaNV || window.loggedUser?.username || 'unknown') };
    try {
      const res = await fetch(`${API_BASE}/api/hoatdong/request`, { method: 'POST', headers: { 'Content-Type':'application/json', ...withUserHeader().headers }, body: JSON.stringify(payload) });
      if (res.ok){
        const j = await res.json();
        if (resultEl) resultEl.textContent = j.message || 'Yêu cầu đã được gửi tới Khoa/Trường.';
        setTimeout(closeRequestActivityModal, 1500);
        return;
      }
      // fallback if endpoint not implemented
    } catch (err) {
      console.warn('Request endpoint not available or error:', err);
    }
    // Fallback: copy to clipboard and instruct user to send to Khoa/Trường
    try {
      await navigator.clipboard.writeText(`Tiêu đề: ${title}\n\n${body}`);
      if (resultEl) resultEl.innerHTML = 'Không thể gửi tự động. Nội dung đã được sao chép vào clipboard. Vui lòng gửi cho Khoa/Trường qua email hoặc hệ thống nội bộ.';
    } catch (err) {
      if (resultEl) resultEl.innerHTML = 'Không thể gửi tự động và không thể sao chép. Vui lòng sao chép thủ công nội dung và gửi cho Khoa/Trường.';
    }
  }

  // Bind request form handler
  (function bindRequestForm(){
    const form = document.getElementById('request-activity-form');
    if (form) {
      form.addEventListener('submit', handleRequestActivitySubmit);
    }
    const btn = document.getElementById('request-activity-btn');
    if (btn) btn.addEventListener('click', openRequestActivityModal);
  })();

  function formatDate(dateStr) {
    if (!dateStr || dateStr === "-") return "Chưa có thông tin";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('vi-VN');
    } catch {
      return dateStr;
    }
  }

  // ==== Evaluation Forms (Lecturer) ====
  function initApprovalDashboard() {
    if (window.ApprovalDashboard) {
      window.ApprovalDashboard.init({
        containerId: 'approval-dashboard-container',
        role: 'GiangVien',
        defaultStatus: 'ForwardedToGVCN',
        getUserToken: () => {
          try {
            return JSON.parse(localStorage.getItem('loggedUserInfo') || '{}');
          } catch(e) { return {}; }
        }
      });
    }
  }

// ==== Reports ====

  // Normalize report data: đảm bảo key PascalCase luôn tồn tại (API trả camelCase)
  function normReportObj(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return d;
    const out = {};
    for (const [k, v] of Object.entries(d)) {
      out[k] = v; // giữ nguyên key gốc
      const pascal = k.charAt(0).toUpperCase() + k.slice(1);
      if (!(pascal in d)) out[pascal] = v; // thêm PascalCase nếu chưa có
    }
    return out;
  }
  function normReportData(data) {
    if (Array.isArray(data)) return data.map(normReportObj);
    return normReportObj(data);
  }

  // Load class report as card list for lecturer (only their class)
  async function generateReport() {
    const reportYear = document.getElementById("report-year").value;
    const content = document.getElementById("report-content");
    const loading = document.getElementById("report-loading");

    content.innerHTML = '';
    loading.classList.remove('hidden');

    try {
      // Get GV's class
      const gvId = getCurrentUserId();
      if (!gvId) {
        throw new Error("Không thể lấy ID giảng viên");
      }

      // Fetch GV info to get their class
      const gvRes = await fetch(`${API_BASE}/api/giangvien/${encodeURIComponent(gvId)}`, withUserHeader({}));
      if (!gvRes.ok) {
        throw new Error(`Không thể tải thông tin giảng viên: ${gvRes.status}`);
      }

      const gvData = await gvRes.json();
      const gvClass = gvData.lopCV || gvData.LopCV; // lớp chủ nhiệm

      if (!gvClass) {
        loading.classList.add('hidden');
        content.innerHTML = '<div class="text-center text-gray-500 py-8"><p>Bạn không có lớp chủ nhiệm để báo cáo</p></div>';
        return;
      }

      // Fetch class report for all classes, filter to GV's class
      const yearParam = reportYear ? `?year=${reportYear}` : "";
      const classRes = await fetch(`${API_BASE}/api/reports/class${yearParam}`);
      if (!classRes.ok) {
        throw new Error(`Không thể tải báo cáo: ${classRes.status}`);
      }

      const allClassReports = await classRes.json();
      
      // Find GV's class report
      const gvClassReport = allClassReports.find(c => 
        (c.MaLop === gvClass || c.maLop === gvClass)
      );

      loading.classList.add('hidden');

      if (!gvClassReport) {
        content.innerHTML = '<div class="text-center text-gray-500 py-8"><p>Không tìm thấy dữ liệu báo cáo cho lớp của bạn</p></div>';
        return;
      }

      // Generate card view for GV's class
      const yearText = reportYear ? ` (Năm ${reportYear})` : " (Tất cả năm học)";
      const cardHtml = generateClassReportCard(gvClassReport, yearText);
      
      content.innerHTML = cardHtml;

    } catch (error) {
      console.error("Error generating report:", error);
      loading.classList.add('hidden');
      content.innerHTML = '<div class="text-center text-red-500 py-8"><p>Lỗi tạo báo cáo: ' + error.message + '</p></div>';
    }
  }

  // Generate card view for a single class report
  function generateClassReportCard(cls, yearText) {
    const maLop = cls.MaLop || cls.maLop || '';
    const tenLop = cls.TenLop || cls.tenLop || 'N/A';
    const tenKhoa = cls.TenKhoa || cls.tenKhoa || 'N/A';
    const totalStudents = cls.TotalStudents || cls.totalStudents || 0;
    const avgScore = cls.AverageScore || cls.averageScore || 0;
    const excellent = cls.ExcellentCount || cls.excellentCount || 0;
    const good = cls.GoodCount || cls.goodCount || 0;
    const fair = cls.FairCount || cls.fairCount || 0;
    const average = cls.AverageCount || cls.averageCount || 0;
    const poor = cls.PoorCount || cls.poorCount || 0;

    // Thống kê vi phạm (nếu có)
    const schoolViolations = cls.StudentsWithSchoolViolations || cls.studentsWithSchoolViolations || 0;
    const socialViolations = cls.StudentsWithSocialViolations || cls.studentsWithSocialViolations || 0;

    return `
      <div class="bg-white rounded-lg shadow-lg overflow-hidden border-t-4 border-blue-600 hover:shadow-xl transition-all duration-300">
        <!-- Header with gradient -->
        <div class="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white">
          <div class="flex justify-between items-start mb-3">
            <div>
              <h3 class="text-2xl font-bold">${tenLop}</h3>
              <p class="text-blue-100 text-sm mt-1">Khoa: ${tenKhoa}</p>
            </div>
            <span class="bg-blue-400 px-4 py-2 rounded-full text-sm font-semibold">${yearText.replace(' (', '').replace(')', '')}</span>
          </div>
        </div>

        <!-- Main stats grid -->
        <div class="p-6">
          <!-- Top row: Large stats -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border-l-4 border-blue-600">
              <p class="text-gray-700 text-sm font-semibold mb-1">Số SV</p>
              <p class="text-3xl font-bold text-blue-900">${totalStudents}</p>
            </div>
            <div class="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border-l-4 border-green-600">
              <p class="text-gray-700 text-sm font-semibold mb-1">Điểm TB</p>
              <p class="text-3xl font-bold text-green-900">${avgScore.toFixed(1)}</p>
            </div>
            <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border-l-4 border-purple-600">
              <p class="text-gray-700 text-sm font-semibold mb-1">Xuất sắc</p>
              <p class="text-3xl font-bold text-purple-900">${excellent}</p>
            </div>
            <div class="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border-l-4 border-orange-600">
              <p class="text-gray-700 text-sm font-semibold mb-1">Tổng hoạt động</p>
              <p class="text-3xl font-bold text-orange-900">4</p>
            </div>
          </div>

          <!-- Score breakdown -->
          <div class="bg-gray-50 p-4 rounded-lg mb-6 border-l-4 border-indigo-500">
            <h4 class="text-gray-800 font-bold text-sm mb-3">Phân loại điểm rèn luyện</h4>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div class="text-center">
                <p class="text-2xl font-bold text-purple-600">${excellent}</p>
                <p class="text-xs text-gray-600">Xuất sắc (≥90)</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-green-600">${good}</p>
                <p class="text-xs text-gray-600">Giỏi (80-89)</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-blue-600">${fair}</p>
                <p class="text-xs text-gray-600">Khá (70-79)</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-yellow-600">${average}</p>
                <p class="text-xs text-gray-600">Trung bình (60-69)</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-red-600">${poor}</p>
                <p class="text-xs text-gray-600">Yếu (<60)</p>
              </div>
            </div>
          </div>

          <!-- Violations section -->
          <div class="bg-gray-50 p-4 rounded-lg mb-6 border-l-4 border-red-500">
            <h4 class="text-gray-800 font-bold text-sm mb-3">Thống kê vi phạm</h4>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <div class="flex justify-between items-center mb-2">
                  <span class="text-sm font-medium text-gray-600">Vi phạm nhà trường</span>
                  <span class="text-lg font-bold text-red-600">${schoolViolations}</span>
                </div>
                <div class="w-full bg-gray-300 rounded-full h-2">
                  <div class="bg-red-500 h-2 rounded-full transition-all duration-300" style="width: ${Math.min(((schoolViolations || 0) / (totalStudents || 1)) * 100, 100)}%"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between items-center mb-2">
                  <span class="text-sm font-medium text-gray-600">Vi phạm xã hội</span>
                  <span class="text-lg font-bold text-orange-600">${socialViolations}</span>
                </div>
                <div class="w-full bg-gray-300 rounded-full h-2">
                  <div class="bg-orange-500 h-2 rounded-full transition-all duration-300" style="width: ${Math.min(((socialViolations || 0) / (totalStudents || 1)) * 100, 100)}%"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-3">
            <button onclick="viewClassStudentsFromReport('${maLop}', '${tenLop}')" class="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg">
              <svg class="inline-block w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Xem chi tiết
            </button>
            <button onclick="exportClassReportCard('${tenLop}')" class="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md hover:shadow-lg">
              <svg class="inline-block w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              Xuất Excel
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // View class students from report
  async function viewClassStudentsFromReport(maLop, tenLop) {
    await viewClassStudents(maLop, tenLop, null);
  }

  // Export class report card
  async function exportClassReportCard(tenLop) {
    try {
      const reportYear = document.getElementById("report-year").value;
      const yearParam = reportYear ? `?year=${reportYear}` : "";
      
      const response = await fetch(`${API_BASE}/api/reports/class${yearParam}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const allClassReports = await response.json();
      
      // Find this class report
      const cls = allClassReports.find(c => (c.TenLop || c.tenLop) === tenLop);
      if (!cls) {
        alert('Không tìm thấy dữ liệu báo cáo!');
        return;
      }
      
      // Create Excel data
      const excelData = [
        ['Lớp', 'Khoa', 'Số SV', 'Điểm TB', 'Xuất sắc', 'Giỏi', 'Khá', 'Trung bình', 'Yếu'],
        [
          cls.TenLop || cls.tenLop || 'N/A',
          cls.TenKhoa || cls.tenKhoa || 'N/A',
          cls.TotalStudents || cls.totalStudents || 0,
          ((cls.AverageScore || cls.averageScore || 0).toFixed(1)),
          cls.ExcellentCount || cls.excellentCount || 0,
          cls.GoodCount || cls.goodCount || 0,
          cls.FairCount || cls.fairCount || 0,
          cls.AverageCount || cls.averageCount || 0,
          cls.PoorCount || cls.poorCount || 0
        ]
      ];
      
      await exportToExcel(excelData, `BaoCaoLop_${tenLop}_${reportYear || 'TatCaNamHoc'}.xlsx`);
      
    } catch (error) {
      console.error("Error exporting class report:", error);
      alert("Lỗi xuất báo cáo: " + error.message);
    }
  }

  function generateSummaryReport(data, year) {
    const yearText = year ? ` năm ${year}` : " (tất cả năm học)";
    
    return `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h3 class="text-2xl font-bold text-gray-800">Báo cáo tổng hợp${yearText}</h3>
          <button onclick="exportReport('summary')" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
            Xuất Excel
          </button>
        </div>
        
        <!-- Thống kê tổng quan -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div class="bg-blue-50 p-6 rounded-lg">
            <div class="flex items-center">
              <div class="p-3 rounded-full bg-blue-100">
                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path>
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-600">Tổng lớp</p>
                <p class="text-2xl font-semibold text-gray-900">${data.TotalClasses || 0}</p>
              </div>
            </div>
          </div>
          
          <div class="bg-green-50 p-6 rounded-lg">
            <div class="flex items-center">
              <div class="p-3 rounded-full bg-green-100">
                <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-600">Điểm trung bình</p>
                <p class="text-2xl font-semibold text-gray-900">${(data.AverageScore || 0).toFixed(1)}</p>
              </div>
            </div>
          </div>
          
          <div class="bg-purple-50 p-6 rounded-lg">
            <div class="flex items-center">
              <div class="p-3 rounded-full bg-purple-100">
                <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-600">Tổng hoạt động</p>
                <p class="text-2xl font-semibold text-gray-900">${data.TotalActivities || 0}</p>
              </div>
            </div>
          </div>
          
          <div class="bg-orange-50 p-6 rounded-lg">
            <div class="flex items-center">
              <div class="p-3 rounded-full bg-orange-100">
                <svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-gray-600">Sinh viên NCKH</p>
                <p class="text-2xl font-semibold text-gray-900" id="research-count-display">Đang tải...</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Phân loại điểm -->
        <div class="bg-white p-6 rounded-lg shadow-md">
          <h4 class="text-lg font-semibold text-gray-800 mb-4">Phân loại điểm rèn luyện</h4>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div class="text-center">
              <div class="text-2xl font-bold text-purple-600">${data.ExcellentCount || 0}</div>
              <div class="text-sm text-gray-600">Xuất sắc (≥90)</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-green-600">${data.GoodCount || 0}</div>
              <div class="text-sm text-gray-600">Giỏi (80-89)</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-blue-600">${data.FairCount || 0}</div>
              <div class="text-sm text-gray-600">Khá (70-79)</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-yellow-600">${data.AverageCount || 0}</div>
              <div class="text-sm text-gray-600">Trung bình (60-69)</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-red-600">${data.PoorCount || 0}</div>
              <div class="text-sm text-gray-600">Yếu (<60)</div>
            </div>
          </div>
        </div>
        
        <!-- Thống kê vi phạm -->
        <div class="bg-white p-6 rounded-lg shadow-md">
          <h4 class="text-lg font-semibold text-gray-800 mb-4">Thống kê vi phạm</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="max-w-sm">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-medium text-gray-600">Vi phạm nhà trường</span>
                <span class="text-lg font-semibold text-red-600">${data.StudentsWithSchoolViolations || 0}</span>
              </div>
              <div class="w-full max-w-xs bg-gray-200 rounded-full h-2">
                <div class="bg-red-600 h-2 rounded-full transition-all duration-300" style="width: ${Math.min(((data.StudentsWithSchoolViolations || 0) / (data.TotalStudents || 1)) * 100, 100)}%"></div>
              </div>
            </div>
            <div class="max-w-sm">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-medium text-gray-600">Vi phạm xã hội</span>
                <span class="text-lg font-semibold text-orange-600">${data.StudentsWithSocialViolations || 0}</span>
              </div>
              <div class="w-full max-w-xs bg-gray-200 rounded-full h-2">
                <div class="bg-orange-600 h-2 rounded-full transition-all duration-300" style="width: ${Math.min(((data.StudentsWithSocialViolations || 0) / (data.TotalStudents || 1)) * 100, 100)}%"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function generateFacultyReport(data, year) {
    const yearText = year ? ` năm ${year}` : " (tất cả năm học)";
    
    return `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h3 class="text-2xl font-bold text-gray-800">Báo cáo theo khoa${yearText}</h3>
          <button onclick="exportReport('faculty')" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
            Xuất Excel
          </button>
        </div>
        
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Khoa</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số lớp</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Điểm TB</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Xuất sắc</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giỏi</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Khá</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trung bình</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Yếu</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              ${data.map(faculty => `
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${faculty.TenKhoa || 'N/A'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${faculty.TotalClasses || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">${(faculty.AverageScore || 0).toFixed(1)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-purple-600">${faculty.ExcellentCount || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600">${faculty.GoodCount || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600">${faculty.FairCount || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">${faculty.AverageCount || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-red-600">${faculty.PoorCount || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function generateClassReport(data, year) {
    const yearText = year ? ` năm ${year}` : " (tất cả năm học)";
    
    return `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h3 class="text-2xl font-bold text-gray-800">Báo cáo theo lớp${yearText}</h3>
          <button onclick="exportClassReport()" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
            Xuất Excel
          </button>
        </div>
        
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lớp</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Khoa</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số SV</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Điểm TB</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Xuất sắc</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giỏi</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Khá</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trung bình</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Yếu</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thao tác</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              ${data.map(cls => `
                <tr class="hover:bg-gray-50 cursor-pointer" onclick="toggleClassStudents('${cls.MaLop}', '${cls.TenLop}', ${year || 'null'})">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${cls.TenLop || 'N/A'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${cls.TenKhoa || 'N/A'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${cls.TotalStudents || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">${(cls.AverageScore || 0).toFixed(1)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-purple-600">${cls.ExcellentCount || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600">${cls.GoodCount || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600">${cls.FairCount || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">${cls.AverageCount || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-red-600">${cls.PoorCount || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button onclick="event.stopPropagation(); viewClassStudents('${cls.MaLop}', '${cls.TenLop}', ${year || 'null'})" 
                            class="text-blue-600 hover:text-blue-900 font-medium">
                      Xem chi tiết
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <!-- Bảng chi tiết sinh viên -->
        <div id="class-students-detail" class="hidden">
          <div class="bg-white rounded-lg shadow-md overflow-hidden">
            <div class="px-6 py-4 bg-gray-50 border-b">
              <div class="flex justify-between items-center">
                <h4 class="text-lg font-semibold text-gray-800" id="class-students-title">Chi tiết sinh viên</h4>
                <div class="flex gap-2">
                  <button onclick="exportCurrentClassStudents()" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm">
                    Xuất Excel
                  </button>
                  <button onclick="hideClassStudents()" class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm">
                    Đóng
                  </button>
                </div>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MSSV</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Họ tên</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SĐT</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CBL</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Điểm RL</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Xếp loại</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VP NT</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VP XH</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NCKH</th>
                  </tr>
                </thead>
                <tbody id="class-students-tbody" class="bg-white divide-y divide-gray-200">
                  <!-- Sẽ được load động -->
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function generateActivityReport(data, year) {
    const yearText = year ? ` năm ${year}` : " (tất cả năm học)";
    
    return `
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <h3 class="text-2xl font-bold text-gray-800">Báo cáo hoạt động${yearText}</h3>
          <button onclick="exportReport('activity')" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
            Xuất Excel
          </button>
        </div>
        
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mã HD</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên hoạt động</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Điểm RL</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày BD</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày KT</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Địa điểm</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tham gia</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tỷ lệ</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              ${data.map(activity => `
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${activity.MaHD || 'N/A'}</td>
                  <td class="px-6 py-4 text-sm text-gray-900">${activity.TenHD || 'N/A'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${activity.DiemRL || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(activity.NgayBD)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(activity.NgayKT)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${activity.DiaDiem || 'N/A'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${activity.ActualParticipants || 0}/${activity.SoSvDK || '∞'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${activity.ParticipationRate ? activity.ParticipationRate.toFixed(1) + '%' : 'N/A'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Biến lưu trữ dữ liệu sinh viên hiện tại
  let currentClassStudents = null;
  let currentClassInfo = null;

  // Load chi tiết sinh viên
  async function loadClassStudents(maLop, tenLop, year) {
    try {
      const yearParam = year ? `?year=${year}` : "";
      const response = await fetch(`${API_BASE}/api/reports/class/${maLop}/students${yearParam}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const students = await response.json();
      
      // Lưu dữ liệu hiện tại
      currentClassStudents = students;
      currentClassInfo = { maLop, tenLop, year };
      
      // Cập nhật tiêu đề
      const yearText = year ? ` năm ${year}` : " (tất cả năm học)";
      document.getElementById('class-students-title').textContent = `Chi tiết sinh viên lớp ${tenLop}${yearText}`;
      
      // Render bảng sinh viên
      renderClassStudentsTable(students);
      
      // Hiển thị bảng
      document.getElementById('class-students-detail').classList.remove('hidden');
      
      // Scroll đến bảng chi tiết
      document.getElementById('class-students-detail').scrollIntoView({ behavior: 'smooth' });
      
    } catch (error) {
      console.error("Error loading class students:", error);
      alert("Lỗi tải danh sách sinh viên: " + error.message);
    }
  }

  // Render bảng sinh viên
  function renderClassStudentsTable(students) {
    const tbody = document.getElementById('class-students-tbody');
    
    if (students.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="px-6 py-4 text-center text-gray-500">
            Không có dữ liệu sinh viên
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = students.map(student => `
      <tr class="hover:bg-gray-50">
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${student.MSSV || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${student.HoTen || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.Email || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.SDT || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          ${student.CBLop ? 
            '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">CBL</span>' : 
            '<span class="text-gray-400">-</span>'
          }
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">${student.TongDRL || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getGradeClass(student.TongDRL)}">
            ${student.XepLoai || 'N/A'}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.viphamNT || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.viphamXH || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          ${student.TGNCKH ? 
            '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Có</span>' : 
            '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Không</span>'
          }
        </td>
      </tr>
    `).join('');
  }

  // Ẩn bảng chi tiết sinh viên
  function hideClassStudents() {
    document.getElementById('class-students-detail').classList.add('hidden');
    currentClassStudents = null;
    currentClassInfo = null;
  }

  // Xem chi tiết sinh viên trong lớp (modal - giữ lại để tương thích)
  async function viewClassStudents(maLop, tenLop, year) {
    try {
      // Debug: Log parameters
      console.log('viewClassStudents called with:', { maLop, tenLop, year });
      
      const yearParam = year ? `?year=${year}` : "";
      const url = `${API_BASE}/api/reports/class/${maLop}/students${yearParam}`;
      console.log('API URL:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('API Error:', response.status, response.statusText);
        throw new Error(`HTTP ${response.status}`);
      }
      
      const students = await response.json();
      console.log('Students data received:', students);
      showClassStudentsModal(tenLop, students, year);
      
    } catch (error) {
      console.error("Error loading class students:", error);
      alert("Lỗi tải danh sách sinh viên: " + error.message);
    }
  }

  // Hiển thị modal chi tiết sinh viên
  function showClassStudentsModal(tenLop, students, year) {
    const yearText = year ? ` năm ${year}` : " (tất cả năm học)";
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50';
    modal.innerHTML = `
      <div class="relative top-20 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-gray-900">Chi tiết sinh viên lớp ${tenLop}${yearText}</h3>
            <button onclick="closeClassStudentsModal()" class="text-gray-400 hover:text-gray-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          <div class="mb-4">
            <button onclick="exportClassStudentsExcel('${tenLop}', ${year || 'null'})" 
                    class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
              Xuất Excel
            </button>
          </div>
          
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MSSV</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Họ tên</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SĐT</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CBL</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Điểm RL</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Xếp loại</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VP NT</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VP XH</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NCKH</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                ${students.map(student => `
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${student.MSSV || 'N/A'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${student.HoTen || 'N/A'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.Email || 'N/A'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.SDT || 'N/A'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${student.CBLop ? 
                        '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">CBL</span>' : 
                        '<span class="text-gray-400">-</span>'
                      }
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">${student.TongDRL || 'Chưa có'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getGradeClass(student.TongDRL)}">
                        ${student.XepLoai || 'Chưa xếp loại'}
                      </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.viphamNT || 0}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.viphamXH || 0}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${student.TGNCKH ? 
                        '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Có</span>' : 
                        '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Không</span>'
                      }
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Đóng modal chi tiết sinh viên
  function closeClassStudentsModal() {
    const modal = document.querySelector('.fixed.inset-0.bg-gray-600');
    if (modal) {
      modal.remove();
    }
  }

  // Lấy class CSS cho xếp loại điểm
  function getGradeClass(score) {
    if (!score || score === null || score === undefined) return 'bg-gray-100 text-gray-800';
    if (score >= 90) return 'bg-purple-100 text-purple-800';
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 70) return 'bg-blue-100 text-blue-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  }

  // Xuất Excel cho báo cáo lớp
  async function exportClassReport() {
    try {
      const reportType = document.getElementById("report-type").value;
      const reportYear = document.getElementById("report-year").value;
      
      if (reportType !== 'class') {
        alert('Vui lòng chọn báo cáo theo lớp trước!');
        return;
      }
      
      const yearParam = reportYear ? `?year=${reportYear}` : "";
      const response = await fetch(`${API_BASE}/api/reports/class${yearParam}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Tạo dữ liệu Excel
      const excelData = [
        ['Lớp', 'Khoa', 'Số SV', 'Điểm TB', 'Xuất sắc', 'Giỏi', 'Khá', 'Trung bình', 'Yếu'],
        ...data.map(cls => [
          cls.TenLop || 'N/A',
          cls.TenKhoa || 'N/A',
          cls.TotalStudents || 0,
          (cls.AverageScore || 0).toFixed(1),
          cls.ExcellentCount || 0,
          cls.GoodCount || 0,
          cls.FairCount || 0,
          cls.AverageCount || 0,
          cls.PoorCount || 0
        ])
      ];
      
      await exportToExcel(excelData, `BaoCaoLop_${reportYear || 'TatCaNamHoc'}.xlsx`);
      
    } catch (error) {
      console.error("Error exporting class report:", error);
      alert("Lỗi xuất báo cáo: " + error.message);
    }
  }

  // Xuất Excel cho bảng chi tiết sinh viên hiện tại
  async function exportCurrentClassStudents() {
    if (!currentClassStudents || !currentClassInfo) {
      alert('Không có dữ liệu sinh viên để xuất!');
      return;
    }
    
    const { tenLop, year } = currentClassInfo;
    
    // Tạo dữ liệu Excel
    const excelData = [
      ['MSSV', 'Họ tên', 'Email', 'SĐT', 'CBL', 'Điểm RL', 'Xếp loại', 'VP NT', 'VP XH', 'NCKH'],
      ...currentClassStudents.map(student => [
        student.MSSV || 'N/A',
        student.HoTen || 'N/A',
        student.Email || 'N/A',
        student.SDT || 'N/A',
        student.CBLop ? 'Có' : 'Không',
        student.TongDRL || 'N/A',
        student.XepLoai || 'N/A',
        student.viphamNT || 0,
        student.viphamXH || 0,
        student.TGNCKH ? 'Có' : 'Không'
      ])
    ];
    
    const fileName = `ChiTietSinhVien_${tenLop}_${year || 'TatCaNamHoc'}.xlsx`;
    await exportToExcel(excelData, fileName);
  }

  // Xuất Excel cho chi tiết sinh viên lớp (modal - giữ lại để tương thích)
  async function exportClassStudentsExcel(tenLop, year) {
    try {
      const yearParam = year ? `?year=${year}` : "";
      const response = await fetch(`${API_BASE}/api/reports/class/${tenLop}/students${yearParam}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const students = await response.json();
      
      // Tạo dữ liệu Excel
      const excelData = [
        ['MSSV', 'Họ tên', 'Email', 'SĐT', 'CBL', 'Điểm RL', 'Xếp loại', 'VP NT', 'VP XH', 'NCKH'],
        ...students.map(student => [
          student.MSSV || 'N/A',
          student.HoTen || 'N/A',
          student.Email || 'N/A',
          student.SDT || 'N/A',
          student.CBLop ? 'Có' : 'Không',
          student.TongDRL || 'N/A',
          student.XepLoai || 'N/A',
          student.viphamNT || 0,
          student.viphamXH || 0,
          student.TGNCKH ? 'Có' : 'Không'
        ])
      ];
      
      const fileName = `ChiTietSinhVien_${tenLop}_${year || 'TatCaNamHoc'}.xlsx`;
      await exportToExcel(excelData, fileName);
      
    } catch (error) {
      console.error("Error exporting students:", error);
      alert("Lỗi xuất danh sách sinh viên: " + error.message);
    }
  }

  // Hàm xuất Excel chung sử dụng ExcelJS
  async function exportToExcel(data, fileName) {
    try {
      // Kiểm tra ExcelJS có sẵn không
      if (typeof ExcelJS === 'undefined') {
        throw new Error('ExcelJS library chưa được tải. Vui lòng tải lại trang.');
      }

      // Tạo workbook mới
      const workbook = new ExcelJS.Workbook();
      
      // Thêm metadata
      workbook.creator = 'Hệ thống QLDRL - KGU';
      workbook.lastModifiedBy = 'Giảng viên';
      workbook.created = new Date();
      workbook.modified = new Date();
      
      // Tạo worksheet
      const worksheet = workbook.addWorksheet('Báo cáo', {
        properties: { tabColor: { argb: 'FF4F46E5' } }
      });

      // Định nghĩa style cho header
      const headerStyle = {
        font: { 
          name: 'Arial', 
          size: 12, 
          bold: true, 
          color: { argb: 'FFFFFFFF' } 
        },
        fill: { 
          type: 'pattern', 
          pattern: 'solid', 
          fgColor: { argb: 'FF4F46E5' } 
        },
        alignment: { 
          horizontal: 'center', 
          vertical: 'middle' 
        },
        border: {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        }
      };

      // Định nghĩa style cho data cells
      const dataStyle = {
        font: { 
          name: 'Arial', 
          size: 11 
        },
        alignment: { 
          horizontal: 'left', 
          vertical: 'middle' 
        },
        border: {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
        }
      };

      // Định nghĩa style cho số liệu
      const numberStyle = {
        font: { 
          name: 'Arial', 
          size: 11 
        },
        alignment: { 
          horizontal: 'right', 
          vertical: 'middle' 
        },
        border: {
          top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
          right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
        }
      };

      // Thêm dữ liệu vào worksheet
      data.forEach((row, rowIndex) => {
        const excelRow = worksheet.addRow(row);
        
        // Áp dụng style cho từng cell
        excelRow.eachCell((cell, colNumber) => {
          if (rowIndex === 0) {
            // Header row
            cell.style = headerStyle;
          } else {
            // Data rows
            const cellValue = cell.value;
            if (typeof cellValue === 'number' && !isNaN(cellValue)) {
              cell.style = numberStyle;
            } else {
              cell.style = dataStyle;
            }
          }
        });
      });

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(maxLength + 2, 50);
      });

      // Freeze header row
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }
      ];

      // Thêm filter cho header row
      worksheet.autoFilter = {
        from: 'A1',
        to: `${String.fromCharCode(64 + data[0].length)}1`
      };

      // Tạo file Excel
      const buffer = await workbook.xlsx.writeBuffer();
      
      // Tạo blob và download
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      URL.revokeObjectURL(url);
      
      alert(`Đã xuất file ${fileName} thành công! File Excel có format đẹp và chuyên nghiệp.`);
    } catch (error) {
      console.error('Error exporting Excel file:', error);
      alert('Lỗi xuất file Excel: ' + error.message);
    }
  }

  async function loadReportYears() {
    try {
      const response = await fetch(`${API_BASE}/api/reports/years`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const years = await response.json();
      const yearSelect = document.getElementById("report-year");
      
      if (yearSelect) {
        // Clear existing options except the first one
        yearSelect.innerHTML = '<option value="">Tất cả năm học</option>';
        
        // Add years
        years.forEach(year => {
          const option = document.createElement('option');
          option.value = year;
          option.textContent = `Năm học ${year}`;
          yearSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error("Error loading years:", error);
    }
  }

  // Hook up EvalForms section when active
  function maybeInitEvalFormsOnSectionSwitch() {
    const evalSection = document.getElementById('evalforms');
    if (!evalSection) return;
    // When section becomes visible, load filters and list
    initApprovalDashboard();
  }

  // ==== GLOBAL FUNCTIONS ====
  // Toggle hiển thị chi tiết sinh viên
  async function toggleClassStudents(maLop, tenLop, year) {
    const detailDiv = document.getElementById('class-students-detail');
    
    if (detailDiv.classList.contains('hidden')) {
      await loadClassStudents(maLop, tenLop, year);
    } else {
      hideClassStudents();
    }
  }

  // Xuất báo cáo
  async function exportReport(type) {
    try {
      const reportYear = document.getElementById("report-year").value;
      const yearParam = reportYear ? `?year=${reportYear}` : "";
      
      let reportData;
      let fileName;
      
      switch (type) {
        case "summary":
          const summaryRes = await fetch(`${API_BASE}/api/reports/summary${yearParam}`);
          if (!summaryRes.ok) throw new Error(`HTTP ${summaryRes.status}`);
          reportData = normReportData(await summaryRes.json());
          
          fileName = `BaoCaoTongHop_${reportYear || 'TatCaNamHoc'}.xlsx`;
          const correctResearchCount = reportData.StudentsWithResearch || 0;
          
          // Tạo dữ liệu Excel cho báo cáo tổng hợp
          const summaryExcelData = [
            ['Thống kê', 'Giá trị'],
            ['Tổng sinh viên', reportData.TotalStudents || 0],
            ['Điểm trung bình', (reportData.AverageScore || 0).toFixed(1)],
            ['Tổng hoạt động', reportData.TotalActivities || 0],
            ['Sinh viên NCKH', correctResearchCount],
            ['', ''],
            ['Phân loại điểm', ''],
            ['Xuất sắc (≥90)', reportData.ExcellentCount || 0],
            ['Giỏi (80-89)', reportData.GoodCount || 0],
            ['Khá (70-79)', reportData.FairCount || 0],
            ['Trung bình (60-69)', reportData.AverageCount || 0],
            ['Yếu (<60)', reportData.PoorCount || 0],
            ['', ''],
            ['Vi phạm', ''],
            ['Vi phạm nhà trường', reportData.StudentsWithSchoolViolations || 0],
            ['Vi phạm xã hội', reportData.StudentsWithSocialViolations || 0]
          ];
          await exportToExcel(summaryExcelData, fileName);
          break;
          
        case "faculty":
          const facultyRes = await fetch(`${API_BASE}/api/reports/faculty${yearParam}`);
          if (!facultyRes.ok) throw new Error(`HTTP ${facultyRes.status}`);
          reportData = normReportData(await facultyRes.json());
          fileName = `BaoCaoKhoa_${reportYear || 'TatCaNamHoc'}.xlsx`;
          
          const facultyExcelData = [
            ['Khoa', 'Số lớp', 'Điểm TB', 'Xuất sắc', 'Giỏi', 'Khá', 'Trung bình', 'Yếu'],
            ...reportData.map(faculty => [
              faculty.TenKhoa || 'N/A',
              faculty.TotalClasses || 0,
              (faculty.AverageScore || 0).toFixed(1),
              faculty.ExcellentCount || 0,
              faculty.GoodCount || 0,
              faculty.FairCount || 0,
              faculty.AverageCount || 0,
              faculty.PoorCount || 0
            ])
          ];
          await exportToExcel(facultyExcelData, fileName);
          break;
          
        case "class":
          const classRes = await fetch(`${API_BASE}/api/reports/class${yearParam}`);
          if (!classRes.ok) throw new Error(`HTTP ${classRes.status}`);
          reportData = normReportData(await classRes.json());
          fileName = `BaoCaoLop_${reportYear || 'TatCaNamHoc'}.xlsx`;
          
          const classExcelData = [
            ['Lớp', 'Khoa', 'Số SV', 'Điểm TB', 'Xuất sắc', 'Giỏi', 'Khá', 'Trung bình', 'Yếu'],
            ...reportData.map(cls => [
              cls.TenLop || 'N/A',
              cls.TenKhoa || 'N/A',
              cls.TotalStudents || 0,
              (cls.AverageScore || 0).toFixed(1),
              cls.ExcellentCount || 0,
              cls.GoodCount || 0,
              cls.FairCount || 0,
              cls.AverageCount || 0,
              cls.PoorCount || 0
            ])
          ];
          await exportToExcel(classExcelData, fileName);
          break;
          
        case "activity":
          const activityRes = await fetch(`${API_BASE}/api/reports/activity${yearParam}`);
          if (!activityRes.ok) throw new Error(`HTTP ${activityRes.status}`);
          reportData = normReportData(await activityRes.json());
          fileName = `BaoCaoHoatDong_${reportYear || 'TatCaNamHoc'}.xlsx`;
          
          const activityExcelData = [
            ['Mã HD', 'Tên hoạt động', 'Điểm RL', 'Ngày BD', 'Ngày KT', 'Địa điểm', 'Tham gia', 'Tỷ lệ %'],
            ...reportData.map(activity => [
              activity.MaHD || 'N/A',
              activity.TenHD || 'N/A',
              activity.DiemRL || 0,
              formatDate(activity.NgayBD),
              formatDate(activity.NgayKT),
              activity.DiaDiem || 'N/A',
              `${activity.ActualParticipants || 0}/${activity.SoSvDK || '∞'}`,
              activity.ParticipationRate ? activity.ParticipationRate.toFixed(1) + '%' : 'N/A'
            ])
          ];
          await exportToExcel(activityExcelData, fileName);
          break;
          
        default:
          alert('Loại báo cáo không hợp lệ!');
          return;
      }
      
    } catch (error) {
      console.error("Error exporting report:", error);
      alert("Lỗi xuất báo cáo: " + error.message);
    }
  }

  // Ẩn bảng chi tiết sinh viên
  function hideClassStudents() {
    document.getElementById('class-students-detail').classList.add('hidden');
    currentClassStudents = null;
    currentClassInfo = null;
  }

  // Xuất Excel cho bảng chi tiết sinh viên hiện tại
  async function exportCurrentClassStudents() {
    if (!currentClassStudents || !currentClassInfo) {
      alert('Không có dữ liệu sinh viên để xuất!');
      return;
    }
    
    const { tenLop, year } = currentClassInfo;
    
    // Tạo dữ liệu Excel
    const excelData = [
      ['MSSV', 'Họ tên', 'Email', 'SĐT', 'CBL', 'Điểm RL', 'Xếp loại', 'VP NT', 'VP XH', 'NCKH'],
      ...currentClassStudents.map(student => [
        student.MSSV || 'N/A',
        student.HoTen || 'N/A',
        student.Email || 'N/A',
        student.SDT || 'N/A',
        student.CBLop ? 'Có' : 'Không',
        student.TongDRL || 'N/A',
        student.XepLoai || 'N/A',
        student.viphamNT || 0,
        student.viphamXH || 0,
        student.TGNCKH ? 'Có' : 'Không'
      ])
    ];
    
    const fileName = `ChiTietSinhVien_${tenLop}_${year || 'TatCaNamHoc'}.xlsx`;
    await exportToExcel(excelData, fileName);
  }

  // Xuất Excel cho báo cáo lớp
  async function exportClassReport() {
    try {
      const reportType = document.getElementById("report-type").value;
      const reportYear = document.getElementById("report-year").value;
      
      if (reportType !== 'class') {
        alert('Vui lòng chọn báo cáo theo lớp trước!');
        return;
      }
      
      const yearParam = reportYear ? `?year=${reportYear}` : "";
      const response = await fetch(`${API_BASE}/api/reports/class${yearParam}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Tạo dữ liệu Excel
      const excelData = [
        ['Lớp', 'Khoa', 'Số SV', 'Điểm TB', 'Xuất sắc', 'Giỏi', 'Khá', 'Trung bình', 'Yếu'],
        ...data.map(cls => [
          cls.TenLop || 'N/A',
          cls.TenKhoa || 'N/A',
          cls.TotalStudents || 0,
          (cls.AverageScore || 0).toFixed(1),
          cls.ExcellentCount || 0,
          cls.GoodCount || 0,
          cls.FairCount || 0,
          cls.AverageCount || 0,
          cls.PoorCount || 0
        ])
      ];
      
      await exportToExcel(excelData, `BaoCaoLop_${reportYear || 'TatCaNamHoc'}.xlsx`);
      
    } catch (error) {
      console.error("Error exporting class report:", error);
      alert("Lỗi xuất báo cáo: " + error.message);
    }
  }

  // Đóng modal chi tiết sinh viên
  function closeClassStudentsModal() {
    const modal = document.querySelector('.fixed.inset-0.bg-gray-600');
    if (modal) {
      modal.remove();
    }
  }

  // ==== Student Detail Functions ====
  async function viewStudentDetail(mssv) {
    try {
      const response = await fetch(`${API_BASE}/api/sinhvien/${mssv}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const student = await response.json();
      
      // Get student grades
      const gradeRes = await fetch(`${API_BASE}/api/sinhvien/${mssv}/diem`);
      const grades = gradeRes.ok ? await gradeRes.json() : [];
      
      const modalTitle = document.getElementById("modal-title");
      const modalBody = document.getElementById("modal-body");
      
      modalTitle.textContent = `Chi tiết sinh viên: ${student.TenSV}`;
      
      modalBody.innerHTML = `
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">MSSV</label>
              <p class="text-sm text-gray-900">${student.MSSV}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Họ và tên</label>
              <p class="text-sm text-gray-900">${student.TenSV}</p>
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">Lớp</label>
              <p class="text-sm text-gray-900">${student.TenLop || 'N/A'}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Khoa</label>
              <p class="text-sm text-gray-900">${student.TenKhoa || 'N/A'}</p>
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">Số điện thoại</label>
              <p class="text-sm text-gray-900">${student.SDT || 'N/A'}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Email</label>
              <p class="text-sm text-gray-900">${student.Email || 'N/A'}</p>
            </div>
          </div>
          
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">Cán bộ lớp</label>
              <p class="text-sm text-gray-900">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${student.CBLop ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                  ${student.CBLop ? 'Có' : 'Không'}
                </span>
              </p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">TVCLB Khoa</label>
              <p class="text-sm text-gray-900">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${student.TVCLBKhoa ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
                  ${student.TVCLBKhoa ? 'Có' : 'Không'}
                </span>
              </p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">TVCLB Trường</label>
              <p class="text-sm text-gray-900">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${student.TVCLBTruong ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}">
                  ${student.TVCLBTruong ? 'Có' : 'Không'}
                </span>
              </p>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700">Địa chỉ</label>
            <p class="text-sm text-gray-900">${student.DiaChi || 'N/A'}</p>
          </div>
          
          ${grades.length > 0 ? `
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Lịch sử điểm</label>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Năm học</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Học kì</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Điểm RL</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Đánh giá</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  ${grades.map(grade => {
                    const evaluation = getGradeEvaluation(grade.TongDRL);
                    return `
                      <tr>
                        <td class="px-3 py-2 text-sm text-gray-900">${grade.NamHoc}</td>
                        <td class="px-3 py-2 text-sm text-gray-900">${grade.HocKi}</td>
                        <td class="px-3 py-2 text-sm text-gray-900">${grade.TongDRL || 'N/A'}</td>
                        <td class="px-3 py-2">
                          <span class="activity-status ${evaluation.class} text-xs">${evaluation.text}</span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
          ` : '<p class="text-sm text-gray-500">Chưa có dữ liệu điểm</p>'}
          
          <!-- Lịch sử cộng điểm chi tiết -->
          <div class="mt-6 border-t border-gray-200 pt-4">
              <div class="flex justify-between items-center mb-3">
                <h4 class="block text-sm font-medium text-gray-700">Lịch sử cộng/trừ điểm rèn luyện</h4>
                <button type="button" id="gv-btn-history" class="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-200 font-semibold shadow-sm transition-colors duration-200">Xem chi tiết</button>
              </div>
              <div id="gv-history-display" class="hidden">
                 <div class="text-center text-xs text-gray-500 py-4">Đang tải lịch sử...</div>
              </div>
          </div>
        </div>
      `;
      
      document.getElementById("modal").classList.remove("hidden");
      
      const btnHistory = document.getElementById('gv-btn-history');
      if (btnHistory) {
        btnHistory.addEventListener('click', async () => {
          const disp = document.getElementById('gv-history-display');
          if (!disp) return;
          if (!disp.classList.contains('hidden')) {
              disp.classList.add('hidden');
              return;
          }
          disp.classList.remove('hidden');
          disp.innerHTML = '<div class="text-center text-xs text-gray-500 py-4">Đang tải lịch sử...</div>';
          try {
              // Get latest history across all semesters
              const res = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssv)}/points-history`);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const history = await res.json();
              if (Array.isArray(history) && history.length > 0) {
                  disp.innerHTML = `
                    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
                      <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                          <tr>
                            <th scope="col" class="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Kì học</th>
                            <th scope="col" class="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Thời gian</th>
                            <th scope="col" class="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Điểm</th>
                            <th scope="col" class="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lý do</th>
                            <th scope="col" class="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Người duyệt</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 bg-white text-xs">
                          ${history.map(h => `
                            <tr class="hover:bg-gray-50">
                              <td class="px-4 py-2 whitespace-nowrap text-gray-500">${h.hocKi}/${h.namHoc}</td>
                              <td class="px-4 py-2 whitespace-nowrap text-gray-500">${new Date(h.createdAt).toLocaleString('vi-VN')}</td>
                              <td class="px-4 py-2 whitespace-nowrap font-medium ${h.pointsChanged > 0 ? 'text-green-600' : (h.pointsChanged < 0 ? 'text-red-600' : 'text-gray-900')}">${h.pointsChanged > 0 ? '+' : ''}${h.pointsChanged}</td>
                              <td class="px-4 py-2 text-gray-700">${h.reason || 'Không có lý do'}</td>
                              <td class="px-4 py-2 text-gray-700">
                                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${h.approvedBy === 'AI' ? 'bg-purple-100 text-purple-800' : (h.approvedBy === 'System' ? 'bg-gray-100 text-gray-800' : 'bg-blue-100 text-blue-800')}">
                                      ${h.approvedBy || 'N/A'}
                                  </span>
                              </td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  `;
              } else {
                  disp.innerHTML = '<div class="text-center text-xs text-gray-500 py-4 bg-gray-50 rounded-md">Không có lịch sử cộng điểm nào.</div>';
              }
          } catch(err) {
              disp.innerHTML = `<div class="text-center text-xs text-red-500 py-4">Lỗi: ${err.message || err}</div>`;
          }
        });
      }

    } catch (error) {
      console.error("Error loading student detail:", error);
      alert("Lỗi tải thông tin sinh viên!");
    }
  }

  async function editStudentGrade(mssv, namHoc = null, hocKi = null) {
    try {
      const studentName = window.studentsData?.find(s => s.MSSV === mssv)?.TenSV || '';

      if (namHoc && hocKi) {
        const response = await fetch(`${API_BASE}/api/sinhvien/${mssv}/diem?namHoc=${namHoc}&hocKi=${hocKi}`);
        
        if (response.ok) {
          const grades = await response.json();
          const grade = grades.find(g => g.NamHoc === namHoc && g.HocKi === hocKi);
          if (grade) {
            document.getElementById("giangvien-mssv").value = mssv;
            document.getElementById("giangvien-namhoc").value = grade.namHoc || grade.NamHoc || "";
            document.getElementById("giangvien-hocki").value = grade.hocKi || grade.HocKi || "";
            document.getElementById("giangvien-tongdrl").value = grade.tongDRL || grade.TongDRL || "";
            
            const viphamNT = grade.viphamNT !== undefined ? grade.viphamNT : (grade.ViPhamNoiQuy || 0);
            const viphamXH = grade.viphamXH !== undefined ? grade.viphamXH : (grade.ViPhamPhapLuat || 0);
            document.getElementById("giangvien-vpnt").value = viphamNT;
            document.getElementById("giangvien-vpxh").value = viphamXH;
            
            const nckh = grade.TGNCKH === true || grade.TGNCKH === 1 || grade.TGNCKH === "1";
            document.getElementById("giangvien-nckh").checked = nckh;
          } else {
            alert("Không tìm thấy dữ liệu điểm!");
            return;
          }
        } else {
          alert("Lỗi tải dữ liệu điểm!");
          return;
        }
      } else {
        document.getElementById("giangvien-mssv").value = mssv;
        document.getElementById("giangvien-namhoc").value = "";
        document.getElementById("giangvien-hocki").value = "";
        document.getElementById("giangvien-tongdrl").value = "";
        document.getElementById("giangvien-vpnt").value = 0;
        document.getElementById("giangvien-vpxh").value = 0;
        document.getElementById("giangvien-nckh").checked = false;
      }

      window.currentStudentName = studentName;
      
      const tabManualBtn = document.getElementById('giangvien-tab-manual');
      if (tabManualBtn) tabManualBtn.click();
      
      document.querySelector('[data-section="grades"]').click();
    } catch (error) {
      console.error("Error loading grade for edit:", error);
      alert("Lỗi tải thông tin điểm: " + error.message);
    }
}

  async function deleteStudentGrade(mssv, namHoc, hocKi) {
    if (!confirm(`Bạn có chắc chắn muốn xóa điểm của sinh viên ${mssv} học kì ${hocKi} năm ${namHoc}?`)) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/diem/${mssv}/${namHoc}/${hocKi}`, {
        method: "DELETE",
        headers: withUserHeader().headers
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      alert(result.message || "Xóa điểm thành công!");
      
      // Reload grades and students lists
      loadStudents();
    } catch (error) {
      console.error("Error deleting grade:", error);
      alert("Lỗi xóa điểm: " + error.message);
    }
  }

  // Cập nhật trạng thái cán bộ lớp
  async function updateCBLop(mssv, isCBLop) {
    try {
      // Tạo headers một cách rõ ràng
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      
      // Thêm X-User header nếu có
      const uid = getCurrentUserId();
      if (uid) {
        headers.set('X-User', uid);
      }
      
      console.log('=== Starting CBLop update ===');
      console.log('MSSV:', mssv);
      console.log('isCBLop:', isCBLop);
      console.log('API_BASE:', API_BASE);
      console.log('Headers:', [...headers.entries()]);
      
      const url = `${API_BASE}/api/sinhvien/${mssv}/cblop`;
      const body = JSON.stringify({ CBLop: isCBLop });
      
      console.log('URL:', url);
      console.log('Body:', body);
      
      const response = await fetch(url, {
        method: "PUT",
        headers: headers,
        body: body
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', [...response.headers.entries()]);
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      // Handle different response types
      let result = null;
      if (response.status === 204) {
        // No content response
        result = { message: "Cập nhật trạng thái cán bộ lớp thành công!" };
      } else {
        // Try to parse JSON response
        try {
          result = await response.json();
        } catch (e) {
          result = { message: "Cập nhật trạng thái cán bộ lớp thành công!" };
        }
      }
      
      console.log(result.message || "Cập nhật trạng thái cán bộ lớp thành công!");
      
      // Reload students list to reflect changes
      loadStudents();
    } catch (error) {
      console.error("Error updating CBLop:", error);
      alert("Lỗi cập nhật trạng thái cán bộ lớp: " + error.message);
      // Reload to revert checkbox state
      loadStudents();
    }
  }

  // ==== Event Listeners ====
  function initEventListeners() {
    // Search students
    const searchBtn = document.getElementById("search-students");
    if (searchBtn) {
      searchBtn.addEventListener("click", loadStudents);
    }

    // Save grade
    const saveGradeBtn = document.getElementById("save-grade");
    if (saveGradeBtn) {
      saveGradeBtn.addEventListener("click", async () => {
        const mssv = document.getElementById("grade-mssv").value;
        const year = document.getElementById("grade-year").value;
        const semester = document.getElementById("grade-semester").value;
        const score = document.getElementById("grade-score").value;
        const violationSchool = document.getElementById("grade-violation-school").value;
        const violationSocial = document.getElementById("grade-violation-social").value;
        const research = document.getElementById("grade-research").value;

        if (!mssv || !year || !semester || !score) {
          alert("Vui lòng điền đầy đủ thông tin bắt buộc!");
          return;
        }

        try {
          const response = await fetch(`${API_BASE}/api/diem`, {
            method: "POST",
            headers: withUserHeader({ headers: { "Content-Type": "application/json" } }).headers,
            body: JSON.stringify({
              MSSV: mssv,
              NamHoc: parseInt(year),
              HocKi: parseInt(semester),
              TongDRL: parseInt(score),
              viphamNT: violationSchool ? parseInt(violationSchool) : null,
              viphamXH: violationSocial ? parseInt(violationSocial) : null,
              TGNCKH: research ? (research === 'true') : null
            })
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}`);
          }
          
          const result = await response.json();
          alert(result.message || "Lưu điểm thành công!");
          
          // Clear form
          document.getElementById("grade-mssv").value = "";
          document.getElementById("grade-year").value = "";
          document.getElementById("grade-semester").value = "";
          document.getElementById("grade-score").value = "";
          document.getElementById("grade-violation-school").value = "";
          document.getElementById("grade-violation-social").value = "";
          document.getElementById("grade-research").value = "";
          
          loadStudents(); // Refresh students list too
        } catch (error) {
          console.error("Error saving grade:", error);
          alert("Lỗi lưu điểm: " + error.message);
        }
      });
    }

    // Clear grade form
    const clearGradeBtn = document.getElementById("clear-grade-form");
    if (clearGradeBtn) {
      clearGradeBtn.addEventListener("click", () => {
        document.getElementById("grade-mssv").value = "";
        document.getElementById("grade-year").value = "";
        document.getElementById("grade-semester").value = "";
        document.getElementById("grade-score").value = "";
        document.getElementById("grade-violation-school").value = "";
        document.getElementById("grade-violation-social").value = "";
        document.getElementById("grade-research").value = "";
      });
    }

    // Generate report
    const generateReportBtn = document.getElementById("generate-report");
    if (generateReportBtn) {
      generateReportBtn.addEventListener("click", generateReport);
    }

    // Notifications
    const btnNotifications = document.getElementById("btn-notifications");
    const notificationsMenu = document.getElementById("notifications-menu");
    if (btnNotifications && notificationsMenu) {
      btnNotifications.addEventListener("click", (e) => {
        e.stopPropagation();
        notificationsMenu.classList.toggle("hidden");
      });
      document.addEventListener("click", () => notificationsMenu.classList.add("hidden"));
    }

    // Add activity button
    const addActivityBtn = document.getElementById("add-activity-btn");
    if (addActivityBtn) {
      addActivityBtn.addEventListener("click", openAddActivityModal);
    }

    // Add activity form submission
    const addActivityForm = document.getElementById("add-activity-form");
    if (addActivityForm) {
      // Tạo hàm xử lý submit thêm hoạt động
      window.handleAddActivitySubmit = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const formData = {
          maHD: document.getElementById("activity-code").value,
          tenHD: document.getElementById("activity-name").value,
          moTa: document.getElementById("activity-description").value,
          ngayBD: document.getElementById("activity-start-date").value,
          ngayKT: document.getElementById("activity-end-date").value,
          diemRL: parseInt(document.getElementById("activity-points").value),
          diaDiem: document.getElementById("activity-location").value,
          soLuongToiDa: parseInt(document.getElementById("activity-max-participants").value) || null,
          yeuCau: document.getElementById("activity-requirements").value
        };

        console.log('Form data collected:', formData);

        // Validate required fields
        if (!formData.maHD || !formData.tenHD || !formData.ngayBD || !formData.ngayKT || !formData.diemRL) {
          alert("Vui lòng điền đầy đủ thông tin bắt buộc!");
          return;
        }

        // Validate dates
        if (new Date(formData.ngayBD) > new Date(formData.ngayKT)) {
          alert("Ngày bắt đầu không thể sau ngày kết thúc!");
          return;
        }

        // Validate points
        if (formData.diemRL < 0 || formData.diemRL > 100) {
          alert("Điểm rèn luyện phải từ 0 đến 100!");
          return;
        }

        await submitAddActivity(formData);
      };
      
      addActivityForm.addEventListener("submit", window.handleAddActivitySubmit);
    }

    // Load years for report dropdown
    loadReportYears();

    // Populate GVCN class filter in Evidence section
    try {
      const classSel = document.getElementById('evidence-filter-class');
      if (classSel) {
        // lecturerClasses is set by gateSectionsByLecturer earlier
        if (Array.isArray(lecturerClasses) && lecturerClasses.length > 0) {
          classSel.innerHTML = '<option value="">Tất cả lớp của bạn</option>' + lecturerClasses.map(c => `<option value="${c.MaLop||c.maLop}">${c.TenLop||c.tenLop||c.MaLop||c.maLop}</option>`).join('');
        } else {
          // If not available yet, attempt a lazy fetch of classes
          (async ()=>{
            try{
              const userInfoRaw = localStorage.getItem('loggedUserInfo');
              const user = userInfoRaw ? JSON.parse(userInfoRaw) : null;
              const maGV = user?.MaCaNhan || user?.TenTK || '';
              if (!maGV) return;
              const res = await fetch(`${API_BASE}/api/lecturers/${encodeURIComponent(maGV)}/classes`);
              if (res.ok) {
                const raw2 = await res.json();
                lecturerClasses = (raw2||[]).map(c => ({
                  MaLop: c.MaLop||c.maLop||'', maLop: c.MaLop||c.maLop||'',
                  TenLop: (c.TenLop||c.tenLop||'').trim(), tenLop: (c.TenLop||c.tenLop||'').trim(),
                  MaKH: c.MaKH||c.maKH||c.MaKhoa||c.makhoa||'', maKH: c.MaKH||c.maKH||c.MaKhoa||c.makhoa||'',
                  TenKhoa: c.TenKhoa||c.tenKhoa||'', tenKhoa: c.TenKhoa||c.tenKhoa||''
                }));
                if (Array.isArray(lecturerClasses) && lecturerClasses.length > 0) {
                  classSel.innerHTML = '<option value="">Tất cả lớp của bạn</option>' + lecturerClasses.map(c => `<option value="${c.MaLop}">${c.TenLop||c.MaLop}</option>`).join('');
                }
              }
            }catch{}
          })();
        }
      }
    } catch {}

    // Logout
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        fetch(`/api/auth/logout`, { method: 'POST' }).catch(() => {});
        localStorage.removeItem("loggedUser");
        localStorage.removeItem("loggedUserInfo");
        localStorage.removeItem("userAvatar");
        localStorage.removeItem("_lastPassword"); // security: clear any saved credentials
        sessionStorage.clear();
        window.location.href = "login.html";
      });
    }
  }

  // ==== Load Filter Data ====
  async function loadFilterData() {
    try {
      const response = await fetch(`${API_BASE}/api/preload`);
      if (response.ok) {
        const data = await response.json();
        
        // Load class filter
        const classFilter = document.getElementById("class-filter");
        if (classFilter && data.lop) {
          classFilter.innerHTML = '<option value="">Tất cả lớp</option>' +
            data.lop.map(lop => `<option value="${lop.MaLop}">${lop.TenLop}</option>`).join('');
        }
        
        // Load faculty filter
        const facultyFilter = document.getElementById("faculty-filter");
        if (facultyFilter && data.khoa) {
          facultyFilter.innerHTML = '<option value="">Tất cả khoa</option>' +
            data.khoa.map(khoa => `<option value="${khoa.MaKH}">${khoa.TenKhoa}</option>`).join('');
        }
        
        // Load year options for grade form
        const gradeYear = document.getElementById("grade-year");
        if (gradeYear) {
          const currentYear = new Date().getFullYear();
          gradeYear.innerHTML = '<option value="">Chọn năm học</option>' +
            Array.from({length: 5}, (_, i) => {
              const year = currentYear - i;
              return `<option value="${year}">${year}</option>`;
            }).join('');
        }
      }
    } catch (error) {
      console.error("Error loading filter data:", error);
    }
  }

// === NOTIFICATIONS FOR GIẢNG VIÊN (AI Evidence) ===
(function(){
  const btn   = document.getElementById("btn-notifications");
  const menu  = document.getElementById("notifications-menu");
  const badge = document.getElementById("notifications-badge");
  const list  = document.getElementById("notifications-list");
  if (!btn || !menu || !badge || !list) return;
  let lastNotifLoad = 0;

  // Dùng function có sẵn đầu file để lấy id người dùng hiện hành
  function getCurrentGV() {
    try {
      const raw = localStorage.getItem('loggedUserInfo');
      if (!raw) return '';
      const info = JSON.parse(raw);
      // Ưu tiên MaCaNhan (hoặc TenTK) làm gvId
      return info?.MaCaNhan || info?.TenTK || '';
    } catch { return ''; }
  }

  async function refreshNotifCount() {
    const gv = getCurrentGV(); if (!gv) return;
    try {
      const r = await fetch(`/api/notifications/count?gvId=${encodeURIComponent(gv)}`);
      if (!r.ok) return;
      const j = await r.json();
      if (j.unread > 0) {
        badge.textContent = String(j.unread);
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    } catch (e) { /* ignore */ }
  }

  function renderItem(it) {
    // it: { notificationId, title, message, link, evidenceId, studentId, createdAt, isRead }
    const dt = new Date(it.createdAt).toLocaleString();
    const actions = it.evidenceId ? `
      <div class="mt-2 flex gap-2">
        <button class="noti-approve text-xs px-2 py-1 rounded bg-green-600 text-white"
                data-id="${it.notificationId}" data-evid="${it.evidenceId}" data-mssv="${it.studentId||''}">
          Duyệt
        </button>
        <button class="noti-reject text-xs px-2 py-1 rounded bg-red-600 text-white"
                data-id="${it.notificationId}" data-evid="${it.evidenceId}">
          Từ chối
        </button>
      </div>` : ``;

    return `
    <div class="p-3 hover:bg-gray-50 cursor-pointer noti-item ${it.isRead?'opacity-70':''}"
         data-id="${it.notificationId}" data-link="${it.link||''}">
      <div class="flex items-start gap-3">
        <div class="w-2 h-2 mt-2 rounded-full ${it.isRead?'bg-gray-300':'bg-blue-500'}"></div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-800 truncate">${it.title||'Thông báo'}</p>
          <p class="text-xs text-gray-600 line-clamp-2">${it.message||''}</p>
          <p class="text-[11px] text-gray-400 mt-1">${dt}</p>
          ${actions}
        </div>
      </div>
    </div>`;
  }

  function renderActivityItem(act) {
    const title = act.TenHD || 'Hoạt động mới';
    const dateText = `${formatDate(act.NgayBD)} - ${formatDate(act.NgayKT)}`;
    const maHD = act.MaHD || '';
    return `
      <div class="p-3 hover:bg-gray-50 cursor-pointer noti-item"
           data-id="" data-link="" data-mahd="${maHD}">
        <div class="flex items-start gap-3">
          <div class="w-2 h-2 mt-2 rounded-full bg-blue-500"></div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-800 truncate">${title}</p>
            <p class="text-xs text-gray-600">${dateText}</p>
          </div>
          <span class="activity-status bg-blue-500 text-[10px]">${act.DiemRL ?? ''}</span>
        </div>
      </div>`;
  }

  // No activity fallback for lecturer; only show original notifications

  async function loadNotifList() {
    const gv = getCurrentGV();
    if (!gv) { list.innerHTML='<div class="p-4 text-sm text-gray-500">Chưa đăng nhập</div>'; return; }
    list.innerHTML = '<div class="p-4 text-sm text-gray-500">Đang tải...</div>';
    try {
      // Only use the original notifications list (no grouped summary, no activity fallback)
      const r = await fetch(`/api/notifications?gvId=${encodeURIComponent(gv)}&top=30`);
      if (!r.ok) { list.innerHTML = '<div class="p-4 text-sm text-gray-500">Không thể tải thông báo</div>'; badge.classList.add('hidden'); return; }
      const arr = await r.json();
      if (!Array.isArray(arr) || arr.length === 0) { list.innerHTML = '<div class="p-4 text-sm text-gray-500">Chưa có thông báo</div>'; badge.classList.add('hidden'); return; }
      list.innerHTML = arr.map(renderItem).join('');
      // badge is driven by refreshNotifCount()
      refreshNotifCount();
    } catch(e){
      list.innerHTML = '<div class="p-4 text-sm text-red-500">Lỗi tải thông báo</div>';
      badge.classList.add('hidden');
    }
    // No delete-read button in this simplified view
  }

  // Mở dropdown → tải danh sách mới nhất
  function isVisible(el){
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }
  
  function ensureNotifLoaded(force=false){
    if (!isVisible(menu)) return;
    const now = Date.now();
    if (force || !list.dataset.loaded || (now - lastNotifLoad > 5000)) {
      list.dataset.loaded = "1";
      lastNotifLoad = now;
      loadNotifList();
    }
  }

  // Click icon
  btn.addEventListener("click", ()=> setTimeout(()=> ensureNotifLoaded(false), 0));
  // Hover open (conditional theo cài đặt người dùng)
  function maybeHoverLoad(){ if (!window.gvSettings || window.gvSettings.hoverLoad !== false) ensureNotifLoaded(false); }
  btn.addEventListener("mouseenter", maybeHoverLoad);
  menu.addEventListener("mouseenter", maybeHoverLoad);

  
  document.addEventListener("click", ()=> menu.classList.add("hidden"));

  // Click vào item: mark read + chuyển trang (nếu có link)
  list.addEventListener("click", async (e)=>{
    const item = e.target.closest('.noti-item');
    if (!item) return;
    e.stopPropagation(); 
    const id = item.dataset.id;
    const link = item.dataset.link || '';
    const gv = getCurrentGV();
    if (gv && id) {
      // mark read (idempotent)
  // Use unified mark-read endpoint with scope=user
  fetch(`/api/notifications/${id}/read?scope=giangvien&user=${encodeURIComponent(gv)}`, { method:'POST' })
        .catch(()=>{});
    }
    if (link) location.href = link;
    if ((!link || link === "#") && item.dataset.mahd && typeof viewActivityDetailGV === "function") {
      menu.classList.add("hidden"); // đóng dropdown cho gọn
      return viewActivityDetailGV(item.dataset.mahd);
    }
  });

  // Click Duyệt / Từ chối ngay trong dropdown
  list.addEventListener("click", async (e)=>{
    const btnApprove = e.target.closest('.noti-approve');
    const btnReject  = e.target.closest('.noti-reject');
    if (!btnApprove && !btnReject) return;

    e.stopPropagation();
    const evid = (btnApprove||btnReject).dataset.evid;
    const notiId = (btnApprove||btnReject).dataset.id;
    if (!evid) return;

    if (btnApprove) {
      const mssv = btnApprove.dataset.mssv || prompt("Nhập MSSV để duyệt:");
      if (!mssv) return;
      const gv = getCurrentGV();
      const r = await fetch(`/api/evidence/${evid}/approve?mssv=${encodeURIComponent(mssv)}`, { method:'POST', headers: gv ? { 'X-User': gv } : {} });
      if (!r.ok) { alert("Duyệt thất bại"); return; }
      alert("Đã duyệt và cộng điểm theo năm/kì hiện hành");
    } else {
      if (!confirm("Từ chối minh chứng này?")) return;
      const reason = prompt("Lý do từ chối (tuỳ chọn):", "");
      const gv = getCurrentGV();
      const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
      const r = await fetch(`/api/evidence/${evid}/reject${qs}`, { method:'POST', headers: gv ? { 'X-User': gv } : {} });
      if (!r.ok) { alert("Từ chối thất bại"); return; }
      alert("Đã từ chối minh chứng");
    }

    // Mark read & refresh UI
    const gv = getCurrentGV();
  // Ensure any direct mark-read also uses unified scope=user format
  if (gv && notiId) await fetch(`/api/notifications/${notiId}/read?scope=giangvien&user=${encodeURIComponent(gv)}`, { method:'POST' });
    await loadNotifList();
    await refreshNotifCount();
  });

  // Poll số lượng chưa đọc
  refreshNotifCount();
  setInterval(refreshNotifCount, 20000);
})();

  // ==== Initialize ====
  function init() {
    if (!checkTeacherAccess()) return; // Kiểm tra quyền truy cập trước khi load các phần khác
    initSidebar();
    initEventListeners();
    loadFilterData();
    loadDashboardStats();
    loadStudents();
    loadActivities();
    // Nếu bảng minh chứng có mặt trên trang, load ngay
    if (document.getElementById('evidence-tbody')) {
      loadEvidenceList();
    }
  }

  // Expose functions to global scope for inline handlers
  window.viewStudentDetail = viewStudentDetail;
  window.editStudentGrade = editStudentGrade;
  window.deleteStudentGrade = deleteStudentGrade;
  window.updateCBLop = updateCBLop;
  window.exportReport = exportReport;
  window.toggleClassStudents = toggleClassStudents;
  window.viewClassStudents = viewClassStudents;
  window.exportClassReport = exportClassReport;
  window.exportCurrentClassStudents = exportCurrentClassStudents;
  window.hideClassStudents = hideClassStudents;
  window.closeClassStudentsModal = closeClassStudentsModal;
  // Evidence moderation exports
  window.loadEvidenceList = loadEvidenceList;
  window.openEvidenceDetail = openEvidenceDetail;
  // approveEvidence/rejectEvidence/reanalyzeEvidence đã bỏ theo yêu cầu: không xuất ra global
  
  // QR Code event listeners
  document.getElementById('generate-qr-btn').addEventListener('click', generateQRCode);
  document.getElementById('download-qr-btn').addEventListener('click', downloadQRCode);
  document.getElementById('print-qr-btn').addEventListener('click', printQRCode);

  // Start the application
  init();
});

// ===== Officer Assignment (Lecturer) =====
function initOfficerAssignment(){
  const section = document.getElementById('officers');
  if (!section || section.dataset.init === '1') return;
  section.dataset.init = '1';

  const API_BASE = "";
  const selKhoa = document.getElementById('officer-khoa');
  const selLop = document.getElementById('officer-lop');
  const selRole = document.getElementById('officer-role');
  const tbody = document.getElementById('officer-students');
  const countLbl = document.getElementById('officer-count');
  const btnSave = document.getElementById('officer-save');

  let currentLop = '';
  let selected = new Set();
  let myClasses = [];

  // Map backend role codes to localized display text
  function roleDisplay(code){
    switch(String(code||'')){
      case 'LopTruong': return 'Lớp trưởng';
      case 'LopPho': return 'Lớp phó';
      case 'LopTruongHocPhan': return 'Lớp trưởng lớp học phần';
      default: return code||'-';
    }
  }

  function getUserId(){
    try{ const raw = localStorage.getItem('loggedUserInfo'); if (!raw) return ''; const info = JSON.parse(raw); return info?.MaCaNhan || info?.TenTK || ''; }catch{return ''}
  }
  function withXUser(init){
    const headers = new Headers((init && init.headers) || {});
    const uid = getUserId(); if (uid) headers.set('X-User', uid);
    return { ...(init||{}), headers };
  }

  async function ensureLecturerClasses(){
    if (Array.isArray(myClasses) && myClasses.length>0) return;
    // Try global lecturerClasses first (already normalized)
    if (Array.isArray(lecturerClasses) && lecturerClasses.length>0){ myClasses = lecturerClasses; return; }
    const uid = getUserId(); if (!uid) return;
    try{
      const res = await fetch(`${API_BASE}/api/lecturers/${encodeURIComponent(uid)}/classes`);
      if (res.ok) {
        const raw = await res.json();
        myClasses = (raw||[]).map(c => ({
          MaLop: c.MaLop||c.maLop||'', maLop: c.MaLop||c.maLop||'',
          TenLop: (c.TenLop||c.tenLop||'').trim(), tenLop: (c.TenLop||c.tenLop||'').trim(),
          MaKH: c.MaKH||c.maKH||c.MaKhoa||c.makhoa||'', maKH: c.MaKH||c.maKH||c.MaKhoa||c.makhoa||'',
          TenKhoa: c.TenKhoa||c.tenKhoa||'', tenKhoa: c.TenKhoa||c.tenKhoa||''
        }));
      }
    }catch{}
  }

    async function loadKhoa(){
      await ensureLecturerClasses();
      const uniq = new Map();
      (myClasses||[]).forEach(c=>{
        const mk = c.MaKH || c.MaKhoa || c.maKH || c.makh || c.makhoa;
        const tk = c.TenKhoa || c.tenKhoa || c.TenKH || 'Không tên';
        if (mk) uniq.set(String(mk), tk);
      });
      const items = Array.from(uniq.entries()).map(([MaKhoa, TenKhoa])=>({MaKhoa, TenKhoa}));
      selKhoa.innerHTML = '<option value="">Chọn khoa</option>' + items.map(k=>`<option value="${k.MaKhoa}">${k.TenKhoa}</option>`).join('');

      // Tự động chọn nếu GV chỉ có 1 khoa / 1 lớp
      if (myClasses && myClasses.length > 0) {
        const firstClass = myClasses[0];
        const firstMaKH = firstClass.MaKH || firstClass.MaKhoa || firstClass.maKH || firstClass.makh || '';
        if (firstMaKH) {
          selKhoa.value = firstMaKH;
          await loadLops(firstMaKH);
          // Auto-select lớp đầu tiên và load sinh viên ngay
          const firstMaLop = firstClass.MaLop || firstClass.maLop || '';
          if (firstMaLop) {
            selLop.value = firstMaLop;
            currentLop = firstMaLop;
            await loadStudents(firstMaLop);
          }
        }
      }
    }

    async function loadLops(maKhoa){
    if (!maKhoa){ selLop.innerHTML = '<option value="">Chọn lớp</option>'; return; }
    await ensureLecturerClasses();
    const allowed = (myClasses||[]).filter(c=> String(c.MaKH || c.MaKhoa || c.maKH || c.makhoa || '') === String(maKhoa));
    selLop.innerHTML = '<option value="">Chọn lớp</option>' + allowed.map(l=>`<option value="${l.MaLop||l.maLop}">${l.TenLop||l.tenLop||l.MaLop||l.maLop}</option>`).join('');
  }

  async function loadStudents(maLop){
    selected.clear(); tbody.innerHTML = '<tr><td class="px-6 py-3" colspan="4">Đang tải...</td></tr>';
    if (!maLop){ tbody.innerHTML = ''; countLbl.textContent=''; return; }
    try{
      const res = await fetch(`${API_BASE}/api/classes/${encodeURIComponent(maLop)}/students`, withXUser());
      if (!res.ok){
        let msg = 'HTTP '+res.status;
        try{ const problem = await res.json(); if (problem?.title || problem?.message) msg = problem.title || problem.message; }catch{}
        if (res.status === 403) msg = 'Bạn không có quyền xem lớp này (403)';
        if (res.status === 404) msg = 'Lớp không tồn tại (404)';
        throw new Error(msg);
      }
      const data = await res.json();
      const roles = data.roles || {};
      const items = data.students || [];
      countLbl.textContent = `${items.length} sinh viên`;
      tbody.innerHTML = items.map(s=>{
        // Normalize common field casings/aliases to avoid undefined in UI
        const mssv = s.MSSV ?? s.mssv ?? s.MaSV ?? s.maSV ?? s.studentId ?? s.StudentId ?? '';
        const hoten = s.HoTen ?? s.hoTen ?? s.TenSV ?? s.tenSV ?? s.Ten ?? s.ten ?? '';
        const cur = roles[mssv] || '';
        const curDisplay = roleDisplay(cur);
        const checked = cur && cur === selRole.value ? 'checked' : '';
        if (checked) selected.add(mssv);
        return `<tr>
          <td class="px-6 py-3"><input type="checkbox" class="officer-check" data-mssv="${mssv}" ${checked}></td>
          <td class="px-6 py-3 text-sm text-gray-800">${mssv || '-'}</td>
          <td class="px-6 py-3 text-sm text-gray-800">${hoten || '-'}</td>
          <td class="px-6 py-3 text-sm text-gray-500">${curDisplay || '-'}</td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('.officer-check').forEach(ch=>{
        ch.addEventListener('change',()=>{
          const id = ch.getAttribute('data-mssv');
          if (ch.checked) selected.add(id); else selected.delete(id);
        });
      });
    }catch(e){ tbody.innerHTML = `<tr><td class="px-6 py-3 text-red-600" colspan="4">Lỗi tải danh sách: ${e?.message||e}</td></tr>`; }
  }

  async function saveAssignments(){
    if (!currentLop){ alert('Vui lòng chọn lớp'); return; }
    const role = selRole.value;
    const payload = { assignments: Array.from(selected).map(mssv=>({ MSSV: mssv, Role: role })) };
    btnSave.disabled = true; btnSave.textContent = 'Đang lưu...';
    try{
      const res = await fetch(`${API_BASE}/api/classes/${encodeURIComponent(currentLop)}/officers`, withXUser({
        method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload)
      }));
      if (!res.ok) throw new Error('HTTP '+res.status);
      await loadStudents(currentLop);

      // Audit log: persist action; fallback to console if endpoint not available
      const audit = {
        action: 'AssignOfficers',
        classId: currentLop,
        role,
        count: payload.assignments.length,
        students: payload.assignments.map(a=>a.MSSV),
        timestamp: new Date().toISOString()
      };
      try{
        const logRes = await fetch(`${API_BASE}/api/audit/log`, withXUser({
          method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(audit)
        }));
        if (!logRes.ok) console.warn('Audit log not saved: HTTP '+logRes.status);
      }catch(err){ console.warn('Audit log error:', err); }

      console.log('[Audit] Officer assignment saved', audit);
      const t = document.createElement('div'); t.className='fixed bottom-4 right-4 bg-green-600 text-white text-sm px-3 py-2 rounded shadow'; t.textContent='Đã lưu phân công';
      document.body.appendChild(t); setTimeout(()=> t.remove(), 2000);
    }catch(e){ alert('Không thể lưu: '+(e?.message||e)); }
    finally{ btnSave.disabled=false; btnSave.textContent='Lưu phân công'; }
  }

  selKhoa?.addEventListener('change', ()=> loadLops(selKhoa.value));
  selLop?.addEventListener('change', ()=> { currentLop = selLop.value; loadStudents(currentLop); });
  selRole?.addEventListener('change', ()=> { if (currentLop) loadStudents(currentLop); });
  btnSave?.addEventListener('click', saveAssignments);

  loadKhoa();
}

// Global modal functions
window.openModal = () => {
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const mc = modal.querySelector('.modal-content');
  if (mc) mc.scrollTop = 0;
};
window.closeModal = () => {
  document.getElementById("modal").classList.add("hidden");
  // Ẩn QR section khi đóng modal
  const qrSection = document.getElementById('qr-section');
  if (qrSection) {
    qrSection.classList.add('hidden');
  }
};

window.closeAddActivityModal = () => {
  document.getElementById("add-activity-modal").classList.add("hidden");
  document.getElementById("add-activity-form").reset();
};

// ==================== QR CODE FUNCTIONS ====================

// Load QR code for specific activity (used in modal)
async function loadQRCodeForActivity(maHD) {
  try {
    await loadQRCode(maHD);
  } catch (error) {
    console.error('Error loading QR code for activity:', error);
    showNoQRCode();
  }
}

// Load activities for QR code dropdown (legacy - not used anymore)
async function loadActivitiesForQR() {
  try {
    const response = await fetch(`/api/activities`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const activities = await response.json();
    
    const select = document.getElementById('qr-activity-select');
    if (select) {
      select.innerHTML = '<option value="">Chọn hoạt động để tạo QR</option>';
      
      activities.forEach(activity => {
        const option = document.createElement('option');
        option.value = activity.MaHD;
        option.textContent = `${activity.MaHD} - ${activity.TenHD}`;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading activities for QR:', error);
  }
}

// Generate QR code for current activity in modal
async function generateQRCode() {
  const generateBtn = document.getElementById('generate-qr-btn');
  
  // Lấy maHD từ modal title
  const modalTitle = document.getElementById('modal-title');
  const titleText = modalTitle.textContent;
  const maHDMatch = titleText.match(/\(([A-Z0-9]+)\)/);
  
  if (!maHDMatch) {
    alert('Không thể xác định mã hoạt động');
    return;
  }
  
  const maHD = maHDMatch[1];
  
  try {
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<svg class="w-4 h-4 inline mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>Đang tạo...';
    
    const response = await fetch(`/api/activities/${maHD}/generate-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ createdBy: 'GIANGVIEN' })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = 'Lỗi tạo QR code';
      try { errorMsg = JSON.parse(errorText).error || errorMsg; } catch {}
      throw new Error(errorMsg);
    }
    
    const result = await response.json();
    console.log('QR code generated:', result);
    
    // Load and display QR code
    await loadQRCode(maHD);
    
    alert('QR code đã được tạo thành công!');
    
  } catch (error) {
    console.error('Error generating QR code:', error);
    alert('Lỗi tạo QR code: ' + error.message);
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = '<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>Tạo QR Code';
  }
}

// Load and display QR code
async function loadQRCode(maHD) {
  try {
    const response = await fetch(`/api/activities/${maHD}/qr`);
    if (!response.ok) {
      if (response.status === 404) {
        showNoQRCode();
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    
    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);
    
    const qrDisplay = document.getElementById('qr-code-display');
    qrDisplay.innerHTML = `
      <div class="text-center">
        <img src="${imageUrl}" alt="QR Code" class="mx-auto max-w-full h-auto max-h-48 border rounded-lg">
        <p class="text-sm text-gray-600 mt-2">QR Code cho hoạt động ${maHD}</p>
      </div>
    `;
    
    // Show action buttons
    document.getElementById('qr-actions').classList.remove('hidden');
    
    // Store current QR data for download/print
    window.currentQRData = { maHD, imageUrl };
    
  } catch (error) {
    console.error('Error loading QR code:', error);
    showNoQRCode();
  }
}

// Show no QR code state
function showNoQRCode() {
  const qrDisplay = document.getElementById('qr-code-display');
  qrDisplay.innerHTML = `
    <div class="text-gray-500 py-8">
      <svg class="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
      </svg>
      <p>Chưa có QR code</p>
    </div>
  `;
  document.getElementById('qr-actions').classList.add('hidden');
}

// Download QR code
function downloadQRCode() {
  if (!window.currentQRData) {
    alert('Không có QR code để tải xuống');
    return;
  }
  
  const { maHD, imageUrl } = window.currentQRData;
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = `qr-code-${maHD}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Print QR code
function printQRCode() {
  if (!window.currentQRData) {
    alert('Không có QR code để in');
    return;
  }
  
  const { maHD, imageUrl } = window.currentQRData;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>QR Code - ${maHD}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 20px;
            margin: 0;
          }
          .qr-container {
            max-width: 400px;
            margin: 0 auto;
          }
          .qr-image {
            max-width: 100%;
            height: auto;
            border: 2px solid #000;
            border-radius: 8px;
          }
          .qr-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .qr-subtitle {
            font-size: 14px;
            color: #666;
            margin-bottom: 20px;
          }
          .instructions {
            font-size: 12px;
            color: #888;
            margin-top: 20px;
            text-align: left;
            max-width: 300px;
            margin-left: auto;
            margin-right: auto;
          }
        </style>
      </head>
      <body>
        <div class="qr-container">
          <div class="qr-title">QR Code Đăng Ký Hoạt Động</div>
          <div class="qr-subtitle">Mã hoạt động: ${maHD}</div>
          <img src="${imageUrl}" alt="QR Code" class="qr-image">
          <div class="instructions">
            <p><strong>Hướng dẫn sử dụng:</strong></p>
            <p>1. Sinh viên mở camera điện thoại</p>
            <p>2. Quét mã QR này</p>
            <p>3. Đăng ký tham gia hoạt động</p>
            <p>4. Nộp minh chứng video</p>
          </div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}

// Global functions for student management are exported inside DOMContentLoaded scope

// ===== eKYC Approval Logic =====
let currentEkycRequestId = null;

function formatScore(score) {
    if(!score) return "0%";
    return Number(score).toFixed(1) + "%";
}

async function loadEkycPending() {
    const user = (localStorage.getItem('loggedUserInfo') ? JSON.parse(localStorage.getItem('loggedUserInfo')).TenTK : null);
    if(!user) return;
    
    try {
        const res = await fetch('/api/ekyc/pending', { headers: { 'X-User': user } });
        if (!res.ok) throw new Error('Lỗi tải dữ liệu');
        const data = await res.json();
        
        const tbody = document.getElementById('ekyc-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">Không có yêu cầu xác thực nào đang chờ.</td></tr>';
            return;
        }
        
        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 transition-colors';
            
            const faceBadge = item.faceScore > 80 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
            const cardBadge = item.cardScore > 50 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
            
            const faceText = item.faceScore > 80 ? `Khớp thẻ (${formatScore(item.faceScore)})` : `Xem xét (${formatScore(item.faceScore)})`;
            const cardText = item.cardScore > 50 ? `Thẻ rõ nét (${formatScore(item.cardScore)})` : `Thẻ mờ (${formatScore(item.cardScore)})`;
            
            const safeText = (item.text || '')
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '&quot;')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '');

            tr.innerHTML = `
                <td class="px-6 py-4">
                    <div class="font-medium text-gray-900">${item.name}</div>
                    <div class="text-xs text-gray-500">${item.mssv}</div>
                </td>
                <td class="px-6 py-4 text-gray-600">${item.className}</td>
                <td class="px-6 py-4">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${faceBadge}">
                        ${faceText}
                    </span>
                </td>
                <td class="px-6 py-4">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cardBadge}">
                        ${cardText}
                    </span>
                </td>
                <td class="px-6 py-4 text-xs font-mono text-gray-600 truncate max-w-[150px]">
                    ${item.text || 'Không có dữ liệu'}
                </td>
                <td class="px-6 py-4 text-center">
                    <button onclick="openEkycReview('${item.id}', '${item.name}', ${item.faceScore}, ${item.cardScore}, '${safeText}')" 
                            class="text-blue-600 hover:text-blue-900 font-medium text-sm bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors">
                        Xem xét
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("eKYC Error:", e);
        const tbody = document.getElementById('ekyc-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-500">Lỗi khi tải dữ liệu: ${e.message}</td></tr>`;
        }
    }
}

function parseEkycText(text, exactName = null) {
    const info = { name: "", dob: "", major: "", course: "", mssv: "" };
    if (!text) return info;
    const lines = text.split('\n');
    let dobIndex = -1;
    
    const dobMatch = text.match(/(?:Ng[aà]y\s*sinh|N[oó]i\s*sinh)[\s:]*([\d\-\./]+)/i);
    if (dobMatch) info.dob = dobMatch[1].replace(/[\.-]/g, '/').trim();
    
    const mssvMatch = text.match(/\b(2[0-9]{10})\b/);
    if (mssvMatch) info.mssv = mssvMatch[1];
    
    const majorMatch = text.match(/Ng[aà]nh[\s:]*([^\n\r]+)/i);
    if (majorMatch) info.major = majorMatch[1].replace(/Kh[oó]a\s*h[oọ]c.*/i, '').trim();
    
    const courseMatch = text.match(/Kh[oó]a\s*h[oọ]c[\s:]*([\d\-\.]+)/i);
    if (courseMatch) info.course = courseMatch[1].trim();
    
    for (let i = 0; i < lines.length; i++) {
        if (/Ng[aà]y\s*sinh/i.test(lines[i]) || /N[oó]i\s*sinh/i.test(lines[i])) { dobIndex = i; break; }
    }
    
    if (exactName) {
        info.name = exactName;
    } else if (dobIndex > 0) {
        let nameLine = lines[dobIndex - 1].trim();
        let nameParts = nameLine.split(/[|:-]/);
        info.name = nameParts[nameParts.length - 1].trim();
        let cleanName = info.name.replace(/[^A-Za-zÀ-ỹ\s]/g, '').trim();
        if (cleanName.length < 5 && dobIndex > 1) {
            info.name = lines[dobIndex - 2].replace(/[^A-Za-zÀ-ỹ\s]/g, '').trim();
        } else {
            info.name = cleanName;
        }
    }
    return info;
}

function openEkycReview(id, name, faceScore, cardScore, text) {
    currentEkycRequestId = id;
    document.getElementById('ekyc-mdl-name').innerText = name;
    document.getElementById('ekyc-mdl-face-score').innerText = formatScore(faceScore);
    document.getElementById('ekyc-mdl-card-score').innerText = formatScore(cardScore);
    document.getElementById('ekyc-mdl-text').innerText = text || "Không có thông tin bóc tách";
    
    const parsed = parseEkycText(text, name);
    const parsedContainer = document.getElementById('ekyc-mdl-parsed');
    if (parsedContainer) {
        parsedContainer.innerHTML = `
            <div class="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200 mb-2">
                <div class="col-span-1 font-semibold text-gray-600 text-sm">Họ và tên:</div>
                <div class="col-span-2 font-bold text-indigo-700 text-sm">${parsed.name || '-'}</div>
                
                <div class="col-span-1 font-semibold text-gray-600 text-sm">Mã SV:</div>
                <div class="col-span-2 font-bold text-blue-700 text-sm">${parsed.mssv || '-'}</div>
                
                <div class="col-span-1 font-semibold text-gray-600 text-sm">Ngày sinh:</div>
                <div class="col-span-2 text-gray-800 text-sm">${parsed.dob || '-'}</div>
                
                <div class="col-span-1 font-semibold text-gray-600 text-sm">Ngành:</div>
                <div class="col-span-2 text-gray-800 text-sm">${parsed.major || '-'}</div>
                
                <div class="col-span-1 font-semibold text-gray-600 text-sm">Khóa học:</div>
                <div class="col-span-2 text-gray-800 text-sm">${parsed.course || '-'}</div>
            </div>
        `;
    }
    
    document.getElementById('ekyc-mdl-selfie').src = `/api/ekyc/image/${id}/selfie?t=${Date.now()}`;
    document.getElementById('ekyc-mdl-card').src = `/api/ekyc/image/${id}/card?t=${Date.now()}`;
    
    document.getElementById('ekyc-review-modal').classList.remove('hidden');
}

async function submitEkycDecision(action) {
    if (!currentEkycRequestId) return;
    const user = (localStorage.getItem('loggedUserInfo') ? JSON.parse(localStorage.getItem('loggedUserInfo')).TenTK : null);
    
    const fd = new FormData();
    fd.append('requestId', currentEkycRequestId);
    fd.append('action', action);

    try {
        const res = await fetch('/api/ekyc/approve', {
            method: 'POST',
            headers: { 'X-User': user },
            body: fd
        });
        if (res.ok) {
            alert(action === 'Approve' ? 'Đã duyệt hồ sơ eKYC thành công!' : 'Đã từ chối hồ sơ!');
            document.getElementById('ekyc-review-modal').classList.add('hidden');
            loadEkycPending();
        } else {
            alert('Lỗi khi xử lý phê duyệt!');
        }
    } catch (e) { 
        alert(e.message); 
    }
}


