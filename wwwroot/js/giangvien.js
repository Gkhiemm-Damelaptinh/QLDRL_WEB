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
      reports: { section: "Báo cáo", page: "Thống kê" }
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
        
        // Debug: Log stats data to console
        console.log('Dashboard stats data:', stats);
        console.log('StudentsWithResearch count from API:', stats.StudentsWithResearch);
        
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

  // ==== Notifications ====
  function hydrateNotifications(activities) {
    try {
      const badge = document.getElementById("notifications-badge");
      const menu = document.getElementById("notifications-menu");
      const list = document.getElementById("notifications-list");
      if (!badge || !menu || !list) return;

      const latest = (activities || []).slice(0, 5);
      if (latest.length === 0) {
        badge.classList.add("hidden");
        list.innerHTML = '<div class="p-4 text-sm text-gray-500">Chưa có thông báo</div>';
        return;
      }

      badge.textContent = String(latest.length);
      badge.classList.remove("hidden");

      list.innerHTML = latest.map(act => `
        <div class="p-3 hover:bg-gray-50 cursor-pointer">
          <div class="flex items-start gap-3">
            <div class="w-2 h-2 mt-2 rounded-full bg-blue-500"></div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 truncate">${act.TenHD || 'Hoạt động mới'}</p>
              <p class="text-xs text-gray-500">${formatDate(act.NgayBD)} - ${formatDate(act.NgayKT)}</p>
            </div>
            <span class="activity-status bg-blue-500 text-[10px]">${act.DiemRL ?? ''}</span>
          </div>
        </div>
      `).join('');
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
        
        // Debug: Count students with research
        const studentsWithResearch = rankingData.filter(student => 
          student.TGNCKH === true || student.TGNCKH === 1 || student.TGNCKH === "1"
        );
        console.log('Total students in ranking:', rankingData.length);
        console.log('Students with TGNCKH = true (actual count):', studentsWithResearch.length);
        console.log('Students with research details:', studentsWithResearch.map(s => ({
          MSSV: s.MSSV,
          TenSV: s.TenSV,
          TGNCKH: s.TGNCKH,
          TGNCKH_type: typeof s.TGNCKH
        })));
        
        // Fix: Update dashboard with correct research count
        const correctResearchCount = studentsWithResearch.length;
        document.getElementById("monthly-reports").textContent = correctResearchCount;
        console.log('Updated dashboard research count to:', correctResearchCount);
        
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
      const classFilter = document.getElementById("class-filter")?.value || "";
      const facultyFilter = document.getElementById("faculty-filter")?.value || "";

      // Build query parameters
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (classFilter) params.append("maLop", classFilter);
      if (facultyFilter) params.append("maKhoa", facultyFilter);

      const response = await fetch(`${API_BASE}/api/sinhvien?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const students = await response.json();
      
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

      console.log('Students data after conversion:', students.slice(0, 2)); // Log first 2 students for debugging

      // Load student grades for each student
      const studentsWithGrades = await Promise.all(students.map(async (student) => {
        try {
          const gradeRes = await fetch(`${API_BASE}/api/sinhvien/${student.MSSV}/diem`);
          if (gradeRes.ok) {
            const grades = await gradeRes.json();
            const latestGrade = grades[0]; // Get the latest grade
            student.latestGrade = latestGrade?.TongDRL || null;
          }
        } catch (error) {
          console.error(`Error loading grade for ${student.MSSV}:`, error);
        }
        return student;
      }));

      tbody.innerHTML = studentsWithGrades.map(student => `
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

      // Get ranking data which includes all grades
      const response = await fetch(`${API_BASE}/api/luutrudiemsv/ranking`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const grades = await response.json();
      
      // Debug logging
      console.log('Grades data from API:', grades);
      if (grades.length > 0) {
        console.log('First grade sample:', grades[0]);
        console.log('Violation fields:', {
          viphamNT: grades[0].viphamNT,
          viphamXH: grades[0].viphamXH,
          TGNCKH: grades[0].TGNCKH
        });
      }
      
      if (grades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu điểm</td></tr>';
        return;
      }

      tbody.innerHTML = grades.map(grade => {
        const evaluation = getGradeEvaluation(grade.TongDRL);
        return `
          <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${grade.MSSV}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${grade.TenSV}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${grade.NamHoc}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${grade.HocKi}</td>
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
              <button onclick="editStudentGrade('${grade.MSSV}', ${grade.NamHoc}, ${grade.HocKi})" class="text-blue-600 hover:text-blue-900 mr-2">Sửa</button>
              <button onclick="deleteStudentGrade('${grade.MSSV}', ${grade.NamHoc}, ${grade.HocKi})" class="text-red-600 hover:text-red-900">Xóa</button>
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
            <button class="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm" data-edit-activity="${act.MaHD}">
              Sửa
            </button>
          </div>
        </div>
      `).join('');

      // Attach handlers
      grid.querySelectorAll('[data-view-activity]').forEach(btn => {
        btn.addEventListener('click', () => viewActivityDetailGV(btn.getAttribute('data-view-activity')));
      });
      grid.querySelectorAll('[data-edit-activity]').forEach(btn => {
        btn.addEventListener('click', () => openEditActivityGV(btn.getAttribute('data-edit-activity')));
      });
    } catch (error) {
      console.error("Error loading activities:", error);
      document.getElementById("activities-grid").innerHTML = 
        '<div class="col-span-full text-center text-red-500">Lỗi tải dữ liệu</div>';
    }
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

  function formatDate(dateStr) {
    if (!dateStr || dateStr === "-") return "Chưa có thông tin";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('vi-VN');
    } catch {
      return dateStr;
    }
  }

  async function viewActivityDetailGV(maHD) {
    try {
      const res = await fetch(`${API_BASE}/api/hoatdong/${maHD}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const act = await res.json();
      const title = document.getElementById('modal-title');
      const body = document.getElementById('modal-body');
      const qrSection = document.getElementById('qr-section');
      
      title.textContent = `Chi tiết hoạt động: ${act.TenHD} (${act.MaHD})`;
      body.innerHTML = `
        <div class="space-y-2">
          <p><strong>Mã:</strong> ${act.MaHD}</p>
          <p><strong>Tên:</strong> ${act.TenHD}</p>
          <p><strong>Điểm:</strong> ${act.DiemRL}</p>
          <p><strong>Bắt đầu:</strong> ${formatDate(act.NgayBD)}</p>
          <p><strong>Kết thúc:</strong> ${formatDate(act.NgayKT)}</p>
          <p><strong>Địa điểm:</strong> ${act.DiaDiem || 'N/A'}</p>
          <p><strong>Số SV tối đa:</strong> ${act.SoSvDK ?? 'N/A'}</p>
          <p><strong>Từ khóa:</strong> ${act.TUKHOA || 'N/A'}</p>
          <div>
            <p class="font-medium">Mô tả:</p>
            <p class="text-sm text-gray-700 whitespace-pre-line">${act.NDHD || 'Chưa có mô tả'}</p>
          </div>
        </div>`;
      
      // Hiển thị QR section và load QR code nếu có
      qrSection.classList.remove('hidden');
      await loadQRCodeForActivity(maHD);
      
      document.getElementById('modal').classList.remove('hidden');
    } catch (e) {
      alert('Lỗi tải chi tiết hoạt động: ' + e.message);
    }
  }

  async function openEditActivityGV(maHD) {
    try {
      const res = await fetch(`${API_BASE}/api/hoatdong/${maHD}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const act = await res.json();

      const modal = document.getElementById('add-activity-modal');
      const form = document.getElementById('add-activity-form');
      const modalTitle = modal.querySelector('h3');
      const submitBtn = form.querySelector('button[type="submit"]');
      const submitText = document.getElementById('submit-text');
      const cancelBtn = document.querySelector('#add-activity-form button[type="button"]');

      // Cập nhật tiêu đề modal cho chế độ sửa
      modalTitle.textContent = 'Sửa hoạt động';
      
      // Cập nhật text nút submit
      if (submitText) {
        submitText.textContent = 'Cập nhật hoạt động';
      }

      // Điền dữ liệu vào form
      document.getElementById('activity-code').value = act.MaHD;
      document.getElementById('activity-name').value = act.TenHD || '';
      document.getElementById('activity-description').value = act.NDHD || '';
      document.getElementById('activity-start-date').value = act.NgayBD ? new Date(act.NgayBD).toISOString().split('T')[0] : '';
      document.getElementById('activity-end-date').value = act.NgayKT ? new Date(act.NgayKT).toISOString().split('T')[0] : '';
      document.getElementById('activity-points').value = act.DiemRL ?? '';
      document.getElementById('activity-max-participants').value = act.SoSvDK ?? '';
      document.getElementById('activity-location').value = act.DiaDiem || '';
      document.getElementById('activity-requirements').value = act.TUKHOA || '';

      modal.classList.remove('hidden');

      const close = () => {
        modal.classList.add('hidden');
        form.reset();
        
        // Xóa event listener sửa và gắn lại event listener thêm mới
        if (window.currentEditHandler) {
          form.removeEventListener('submit', window.currentEditHandler);
          window.currentEditHandler = null;
        }
        if (window.handleAddActivitySubmit) {
          form.addEventListener('submit', window.handleAddActivitySubmit);
        }
        
        // Reset lại tiêu đề và text nút về chế độ thêm mới
        modalTitle.textContent = 'Thêm hoạt động mới';
        if (submitText) {
          submitText.textContent = 'Thêm hoạt động';
        }
      };
      if (cancelBtn) cancelBtn.onclick = close;

      // Xóa tất cả event listener cũ
      form.removeEventListener('submit', window.handleAddActivitySubmit);
      
      // Tạo event listener mới cho chế độ sửa
      const handleEditActivitySubmit = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const payload = {
          MaHD: document.getElementById('activity-code').value.trim(),
          TenHD: document.getElementById('activity-name').value.trim(),
          DiemRL: parseInt(document.getElementById('activity-points').value, 10),
          NDHD: document.getElementById('activity-description').value.trim() || null,
          NgayBD: new Date(document.getElementById('activity-start-date').value),
          NgayKT: new Date(document.getElementById('activity-end-date').value),
          SoSvDK: document.getElementById('activity-max-participants').value ? parseInt(document.getElementById('activity-max-participants').value, 10) : null,
          DiaDiem: document.getElementById('activity-location').value.trim() || null,
          TUKHOA: document.getElementById('activity-requirements').value.trim() || null
        };
        try {
          const resp = await fetch(`${API_BASE}/api/hoatdong/${maHD}`, withUserHeader({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }));
          if (!resp.ok && resp.status !== 204) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${resp.status}`);
          }
          alert('Cập nhật hoạt động thành công');
          close();
          loadActivities();
        } catch (err) {
          alert('Lỗi cập nhật: ' + err.message);
        }
      };
      
      // Gắn event listener mới
      form.addEventListener('submit', handleEditActivitySubmit);
      
      // Lưu reference để có thể xóa sau này
      window.currentEditHandler = handleEditActivitySubmit;
    } catch (e) {
      alert('Lỗi tải hoạt động: ' + e.message);
    }
  }

  // ==== Reports ====
  async function generateReport() {
    const reportType = document.getElementById("report-type").value;
    const reportYear = document.getElementById("report-year").value;
    const content = document.getElementById("report-content");

    content.innerHTML = '<div class="text-center text-gray-500"><p>Đang tạo báo cáo...</p></div>';

    try {
      let reportData;
      let reportTitle = "";
      
      switch (reportType) {
        case "summary":
          reportTitle = "Báo cáo tổng hợp";
          const yearParam = reportYear ? `?year=${reportYear}` : "";
          reportData = await fetch(`${API_BASE}/api/reports/summary${yearParam}`).then(r => r.json());
          content.innerHTML = generateSummaryReport(reportData, reportYear);
          
          // Update research count with correct value
          try {
            const rankingRes = await fetch(`${API_BASE}/api/luutrudiemsv/ranking`);
            if (rankingRes.ok) {
              const rankingData = await rankingRes.json();
              const studentsWithResearch = rankingData.filter(student => 
                student.TGNCKH === true || student.TGNCKH === 1 || student.TGNCKH === "1"
              );
              const researchCountElement = document.getElementById('research-count-display');
              if (researchCountElement) {
                researchCountElement.textContent = studentsWithResearch.length;
              }
            }
          } catch (error) {
            console.error('Error updating research count:', error);
          }
          break;
          
        case "faculty":
          reportTitle = "Báo cáo theo khoa";
          const facultyYearParam = reportYear ? `?year=${reportYear}` : "";
          reportData = await fetch(`${API_BASE}/api/reports/faculty${facultyYearParam}`).then(r => r.json());
          content.innerHTML = generateFacultyReport(reportData, reportYear);
          break;
          
        case "class":
          reportTitle = "Báo cáo theo lớp";
          const classYearParam = reportYear ? `?year=${reportYear}` : "";
          reportData = await fetch(`${API_BASE}/api/reports/class${classYearParam}`).then(r => r.json());
          content.innerHTML = generateClassReport(reportData, reportYear);
          break;
          
        case "activity":
          reportTitle = "Báo cáo hoạt động";
          const activityYearParam = reportYear ? `?year=${reportYear}` : "";
          reportData = await fetch(`${API_BASE}/api/reports/activity${activityYearParam}`).then(r => r.json());
          content.innerHTML = generateActivityReport(reportData, reportYear);
          break;
          
        default:
          content.innerHTML = '<div class="text-center text-red-500"><p>Loại báo cáo không hợp lệ</p></div>';
          return;
      }
      
    } catch (error) {
      console.error("Error generating report:", error);
      content.innerHTML = '<div class="text-center text-red-500"><p>Lỗi tạo báo cáo: ' + error.message + '</p></div>';
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
          reportData = await summaryRes.json();
          
          // Debug: Log summary report data
          console.log('Summary report data:', reportData);
          console.log('StudentsWithResearch in summary (from API):', reportData.StudentsWithResearch);
          
          // Fix: Get correct research count from ranking data
          const rankingRes = await fetch(`${API_BASE}/api/luutrudiemsv/ranking`);
          let correctResearchCount = reportData.StudentsWithResearch || 0;
          if (rankingRes.ok) {
            const rankingData = await rankingRes.json();
            const studentsWithResearch = rankingData.filter(student => 
              student.TGNCKH === true || student.TGNCKH === 1 || student.TGNCKH === "1"
            );
            correctResearchCount = studentsWithResearch.length;
            console.log('Correct research count from ranking data:', correctResearchCount);
          }
          
          fileName = `BaoCaoTongHop_${reportYear || 'TatCaNamHoc'}.xlsx`;
          
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
          reportData = await facultyRes.json();
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
          reportData = await classRes.json();
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
          reportData = await activityRes.json();
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
        </div>
      `;
      
      document.getElementById("modal").classList.remove("hidden");
    } catch (error) {
      console.error("Error loading student detail:", error);
      alert("Lỗi tải thông tin sinh viên!");
    }
  }

  async function editStudentGrade(mssv, namHoc = null, hocKi = null) {
    try {
      console.log(`Editing grade for MSSV: ${mssv}, NamHoc: ${namHoc}, HocKi: ${hocKi}`);
      
      // Pre-fill form if editing existing grade
      if (namHoc && hocKi) {
        const response = await fetch(`${API_BASE}/api/sinhvien/${mssv}/diem?namHoc=${namHoc}&hocKi=${hocKi}`);
        console.log('Edit grade response:', response);
        
        if (response.ok) {
          const grades = await response.json();
          console.log('Edit grade data:', grades);
          
          const grade = grades[0];
          if (grade) {
            console.log('Grade data for form:', {
              MSSV: grade.MSSV,
              NamHoc: grade.NamHoc,
              HocKi: grade.HocKi,
              TongDRL: grade.TongDRL,
              viphamNT: grade.viphamNT,
              viphamXH: grade.viphamXH,
              TGNCKH: grade.TGNCKH
            });
            
            console.log('Raw violation data types:', {
              viphamNT_type: typeof grade.viphamNT,
              viphamNT_value: grade.viphamNT,
              viphamXH_type: typeof grade.viphamXH,
              viphamXH_value: grade.viphamXH,
              TGNCKH_type: typeof grade.TGNCKH,
              TGNCKH_value: grade.TGNCKH
            });
            
            // Fill form fields
            document.getElementById("grade-mssv").value = mssv;
            document.getElementById("grade-year").value = grade.NamHoc || "";
            document.getElementById("grade-semester").value = grade.HocKi || "";
            document.getElementById("grade-score").value = grade.TongDRL || "";
            
            // Fill violation fields - handle null/undefined values
            const violationSchool = grade.viphamNT !== null && grade.viphamNT !== undefined ? grade.viphamNT : "";
            const violationSocial = grade.viphamXH !== null && grade.viphamXH !== undefined ? grade.viphamXH : "";
            
            document.getElementById("grade-violation-school").value = violationSchool;
            document.getElementById("grade-violation-social").value = violationSocial;
            
            // Handle TGNCKH - convert bit to string properly
            let researchValue = "";
            if (grade.TGNCKH === true || grade.TGNCKH === 1 || grade.TGNCKH === "1") {
                researchValue = "true";
            } else if (grade.TGNCKH === false || grade.TGNCKH === 0 || grade.TGNCKH === "0") {
                researchValue = "false";
            } else {
                researchValue = ""; // null/undefined case
            }
            document.getElementById("grade-research").value = researchValue;
            
            console.log('Form filled with values:', {
              violationSchool: document.getElementById("grade-violation-school").value,
              violationSocial: document.getElementById("grade-violation-social").value,
              research: document.getElementById("grade-research").value
            });
          } else {
            console.log('No grade data found');
            alert("Không tìm thấy dữ liệu điểm!");
            return;
          }
        } else {
          console.error('Failed to fetch grade data:', response.status);
          alert("Lỗi tải dữ liệu điểm!");
          return;
        }
      } else {
        // Clear form for new grade
        console.log('Clearing form for new grade');
        document.getElementById("grade-mssv").value = mssv;
        document.getElementById("grade-year").value = "";
        document.getElementById("grade-semester").value = "";
        document.getElementById("grade-score").value = "";
        document.getElementById("grade-violation-school").value = "";
        document.getElementById("grade-violation-social").value = "";
        document.getElementById("grade-research").value = "";
      }
      
      // Switch to grades section
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
      loadGrades();
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
            headers: { "Content-Type": "application/json" },
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
          
          loadGrades();
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

    // Logout
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("loggedUser");
        localStorage.removeItem("loggedUserInfo");
        window.location.href = "index.html";
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

  // ==== Initialize ====
  function init() {
    if (!checkTeacherAccess()) return; // Kiểm tra quyền truy cập trước khi load các phần khác
    initSidebar();
    initEventListeners();
    loadFilterData();
    loadDashboardStats();
    loadStudents();
    loadGrades();
    loadActivities();
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
  
  // QR Code event listeners
  document.getElementById('generate-qr-btn').addEventListener('click', generateQRCode);
  document.getElementById('download-qr-btn').addEventListener('click', downloadQRCode);
  document.getElementById('print-qr-btn').addEventListener('click', printQRCode);

  // Start the application
  init();
});

// Global modal functions
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
      const error = await response.json();
      throw new Error(error.error || 'Lỗi tạo QR code');
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
