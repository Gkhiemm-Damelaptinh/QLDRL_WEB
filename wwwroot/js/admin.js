  // ==== cấu hình API ====
  const API_BASE = 'http://localhost:5204';

// helper to attach X-User header
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

document.addEventListener("DOMContentLoaded", async () => {

  // Kiểm tra thông tin chi tiết của user
  async function checkUserInfo(maCaNhan) {
    console.log('Checking user info for:', maCaNhan);
    try {
      const response = await fetch(`${API_BASE}/api/user-info/${maCaNhan}`, withUserHeader({}));
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('User info data:', data);
        
        const statusElement = document.getElementById(`info-status-${maCaNhan}`);
        const addInfoBtn = document.getElementById(`add-info-btn-${maCaNhan}`);
        
        if (data.infoType === 'admin') {
          // Admin luôn hiển thị "Không cần thông tin"
          statusElement.textContent = 'Không cần thông tin';
          statusElement.className = 'text-gray-500 font-medium';
          if (addInfoBtn) addInfoBtn.style.display = 'none';
        } else if (data.hasInfo) {
          let statusText = "Đã có thông tin";
          let statusClass = "text-green-600 font-medium user-info-preview";
          
          // Hiển thị chi tiết loại thông tin dựa trên infoType từ API
          if (data.infoType === 'giangvien') {
            statusText = "Đã có thông tin (Giảng viên)";
          } else if (data.infoType === 'sinhvien') {
            statusText = "Đã có thông tin (Sinh viên)";
          } else if (data.hasSinhVienInfo && data.hasGiangVienInfo) {
            statusText = "Đã có thông tin (SV + GV)";
          }
          
          statusElement.textContent = statusText;
          statusElement.className = statusClass;
          statusElement.setAttribute('data-macanhan', maCaNhan);
          statusElement.setAttribute('data-infotype', data.infoType || '');
          if (addInfoBtn) addInfoBtn.style.display = 'none';
          
          // Thêm event listeners cho hover preview
          addHoverPreviewListeners(statusElement, maCaNhan);
        } else {
          // Chưa có thông tin - hiển thị dựa trên infoType
          if (data.infoType === 'giangvien' || data.infoType === 'sinhvien') {
            statusElement.textContent = 'Chưa có thông tin';
            statusElement.className = 'text-orange-600 font-medium';
            if (addInfoBtn) addInfoBtn.style.display = 'inline-flex';
            console.log('Showing add info button for:', maCaNhan, 'Type:', data.infoType);
          } else {
            statusElement.textContent = 'Chưa xác định';
            statusElement.className = 'text-gray-400 font-medium';
            if (addInfoBtn) addInfoBtn.style.display = 'none';
          }
        }
      } else {
        console.error('API error:', response.status);
        const statusElement = document.getElementById(`info-status-${maCaNhan}`);
        if (statusElement) {
        statusElement.textContent = 'Lỗi API: ' + response.status;
        statusElement.className = 'text-red-600';
        }
      }
    } catch (error) {
      console.error('Error checking user info:', error);
      const statusElement = document.getElementById(`info-status-${maCaNhan}`);
      if (statusElement) {
      statusElement.textContent = 'Lỗi: ' + error.message;
      statusElement.className = 'text-red-600';
    }
  }
  }


  // Load dữ liệu khoa, lớp và khóa học
  async function loadKhoaAndLop() {
    try {
      const response = await fetch(`${API_BASE}/api/preload`);
      if (response.ok) {
        const data = await response.json();
        
        // Load khoa
        const khoaSelect = document.getElementById("info-khoa");
        khoaSelect.innerHTML = '<option value="">Chọn khoa</option>' +
          data.khoa.map(k => `<option value="${k.MaKH}">${k.TenKhoa}</option>`).join('');
        
        // Load lớp
        const lopSelect = document.getElementById("info-lop");
        const lopCVSelect = document.getElementById("info-lopcv");
        const lopOptions = '<option value="">Chọn lớp</option>' +
          data.lop.map(l => `<option value="${l.MaLop}" data-makh="${l.MaKH}">${l.TenLop} - ${l.TenKhoa || 'N/A'}</option>`).join('');
        
        lopSelect.innerHTML = lopOptions;
        lopCVSelect.innerHTML = lopOptions;
        
        // Load khóa học
        const khoahocSelect = document.getElementById("info-khoahoc");
        khoahocSelect.innerHTML = '<option value="">Chọn khóa học</option>' +
          (data.khoaHoc || []).map(k => `<option value="${k.MaKhoa}">${k.MaKhoa} - ${k.TenKhoa}</option>`).join('');
        
        // Khi chọn khoa, filter lớp
        khoaSelect.onchange = () => {
          const selectedKhoa = khoaSelect.value;
          const lopOptions = lopSelect.querySelectorAll('option');
          lopOptions.forEach(option => {
            if (option.value === '') return;
            const shouldShow = !selectedKhoa || option.dataset.makh === selectedKhoa;
            option.style.display = shouldShow ? 'block' : 'none';
          });
        };
      }
    } catch (error) {
      console.error('Error loading khoa, lop and khoahoc:', error);
    }
  }


  // Thêm event listeners cho hover preview
  function addHoverPreviewListeners(element, maCaNhan) {
    let tooltip = null;
    let hoverTimeout = null;
    
    element.addEventListener('mouseenter', () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      
      hoverTimeout = setTimeout(() => {
        showUserPreview(element, maCaNhan);
      }, 300); // Delay 300ms trước khi hiển thị
    });
    
    element.addEventListener('mouseleave', () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      
      setTimeout(() => {
        hideUserPreview(element);
      }, 100); // Delay 100ms trước khi ẩn
    });
  }
  
  // Hiển thị preview thông tin người dùng
  async function showUserPreview(element, maCaNhan) {
    // Kiểm tra xem tooltip đã tồn tại chưa
    let tooltip = document.querySelector('.user-info-tooltip');
    
    if (!tooltip) {
      // Tạo tooltip mới và thêm vào body
      tooltip = createUserPreviewTooltip();
      document.body.appendChild(tooltip);
    }
    
    // Tính toán vị trí tooltip
    const rect = element.getBoundingClientRect();
    const tooltipWidth = 300; // min-width
    
    // Vị trí tooltip: bên phải element, căn giữa theo chiều dọc
    let left = rect.right + 10; // 10px bên phải element
    let top = rect.top + (rect.height / 2) - 100; // ước tính 200px height, căn giữa
    
    // Kiểm tra nếu tooltip bị tràn ra ngoài màn hình
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Nếu tooltip bị tràn bên phải, hiển thị bên trái
    if (left + tooltipWidth > viewportWidth - 20) {
      left = rect.left - tooltipWidth - 10;
    }
    
    // Nếu tooltip bị tràn bên trái, hiển thị bên phải
    if (left < 20) {
      left = rect.right + 10;
    }
    
    // Nếu tooltip bị tràn phía trên, điều chỉnh top
    if (top < 20) {
      top = 20;
    }
    
    // Đặt vị trí tooltip ban đầu
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    
    // Hiển thị loading state
    showLoadingState(tooltip);
    
    // Lấy thông tin chi tiết
    try {
      const userDetails = await fetchUserDetails(maCaNhan);
      if (userDetails) {
        populateUserPreview(tooltip, userDetails);
        
        // Điều chỉnh vị trí sau khi nội dung được load
        setTimeout(() => {
          const tooltipRect = tooltip.getBoundingClientRect();
          const newTop = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
          
          // Kiểm tra lại vị trí sau khi có nội dung thực tế
          if (newTop < 20) {
            tooltip.style.top = '20px';
          } else if (newTop + tooltipRect.height > viewportHeight - 20) {
            tooltip.style.top = (viewportHeight - tooltipRect.height - 20) + 'px';
      } else {
            tooltip.style.top = newTop + 'px';
          }
        }, 50);
      } else {
        showErrorState(tooltip, 'Không thể tải thông tin');
      }
    } catch (error) {
      console.error('Error loading user details:', error);
      showErrorState(tooltip, 'Lỗi tải thông tin');
    }
    
    // Hiển thị tooltip
    tooltip.classList.add('show');
  }
  
  // Ẩn preview thông tin người dùng
  function hideUserPreview(element) {
    const tooltip = document.querySelector('.user-info-tooltip');
    if (tooltip) {
      tooltip.classList.remove('show');
    }
  }
  
  // Tạo HTML cho tooltip preview
  function createUserPreviewTooltip() {
    const tooltip = document.createElement('div');
    tooltip.className = 'user-info-tooltip';
    return tooltip;
  }
  
  // Hiển thị trạng thái loading
  function showLoadingState(tooltip) {
    tooltip.innerHTML = `
      <div class="preview-loading">
        <svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Đang tải thông tin...
      </div>
    `;
  }
  
  // Hiển thị trạng thái lỗi
  function showErrorState(tooltip, message) {
    tooltip.innerHTML = `
      <div class="preview-error">
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        ${message}
      </div>
    `;
  }
  
  // Lấy thông tin chi tiết người dùng
  async function fetchUserDetails(maCaNhan) {
    try {
      console.log('Fetching user details for:', maCaNhan);
      const response = await fetch(`${API_BASE}/api/user-info/${maCaNhan}`, withUserHeader({}));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Lấy thông tin chi tiết dựa trên loại
      let details = null;
      
      if (data.infoType === 'giangvien' && data.hasInfo) {
        console.log('Fetching giang vien details...');
        details = await fetchGiangVienDetails(maCaNhan);
        console.log('Giang vien details:', details);
      } else if (data.infoType === 'sinhvien' && data.hasInfo) {
        console.log('Fetching sinh vien details...');
        details = await fetchSinhVienDetails(maCaNhan);
        console.log('Sinh vien details:', details);
      }
      
      return {
        ...data,
        details: details
      };
    } catch (error) {
      console.error('Error fetching user details:', error);
      return null;
    }
  }
  
  // Lấy thông tin chi tiết giảng viên
  async function fetchGiangVienDetails(maCaNhan) {
    try {
      const response = await fetch(`${API_BASE}/api/giangvien/${maCaNhan}`, withUserHeader({}));
      
      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        const errorText = await response.text();
        console.error('Giang vien API error:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error fetching giang vien details:', error);
    }
    return null;
  }
  
  // Lấy thông tin chi tiết sinh viên
  async function fetchSinhVienDetails(maCaNhan) {
    try {
      // Sử dụng maCaNhan làm MSSV vì trong hệ thống này maCaNhan = MSSV cho sinh viên
      const response = await fetch(`${API_BASE}/api/sinhvien/${maCaNhan}`, withUserHeader({}));
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching sinh vien details:', error);
    }
    return null;
  }
  
  // Điền dữ liệu vào tooltip preview
  function populateUserPreview(tooltip, userData) {
    const { infoType, details } = userData;
    
    let content = '';
    
    if (infoType === 'giangvien' && details) {
      content = `
        <div class="preview-header">
          <div class="preview-avatar">${(details.tenGV || 'GV').charAt(0).toUpperCase()}</div>
          <div>
            <h3 class="preview-title">${details.tenGV || 'Chưa có tên'}</h3>
            <div class="preview-status giảng-viên">Giảng viên</div>
          </div>
        </div>
        <div class="preview-content">
          <div class="preview-field">
            <div class="preview-label">Mã cá nhân</div>
            <div class="preview-value">${details.maCaNhan || 'N/A'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">Số điện thoại</div>
            <div class="preview-value">${details.sdt || 'Chưa có'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">Email</div>
            <div class="preview-value">${details.email || 'Chưa có'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">Khoa</div>
            <div class="preview-value">${details.tenKhoa || 'Chưa có'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">Lớp CV</div>
            <div class="preview-value">${details.tenLop || 'Chưa có'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">Địa chỉ</div>
            <div class="preview-value">${details.diaChi || 'Chưa có'}</div>
          </div>
        </div>
      `;
    } else if (infoType === 'sinhvien' && details) {
      content = `
        <div class="preview-header">
          <div class="preview-avatar">${(details.TenSV || 'SV').charAt(0).toUpperCase()}</div>
          <div>
            <h3 class="preview-title">${details.TenSV || 'Chưa có tên'}</h3>
            <div class="preview-status sinh-viên">Sinh viên</div>
          </div>
        </div>
        <div class="preview-content">
          <div class="preview-field">
            <div class="preview-label">MSSV</div>
            <div class="preview-value">${details.MSSV || 'N/A'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">Số điện thoại</div>
            <div class="preview-value">${details.SDT || 'Chưa có'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">Email</div>
            <div class="preview-value">${details.Email || 'Chưa có'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">Lớp</div>
            <div class="preview-value">${details.TenLop || 'Chưa có'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">Khoa</div>
            <div class="preview-value">${details.TenKhoa || 'Chưa có'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">Địa chỉ</div>
            <div class="preview-value">${details.DiaChi || 'Chưa có'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">TVCLB Khoa</div>
            <div class="preview-value">${details.TVCLBKhoa ? 'Có' : 'Không'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">TVCLB Trường</div>
            <div class="preview-value">${details.TVCLBTruong ? 'Có' : 'Không'}</div>
          </div>
          <div class="preview-field">
            <div class="preview-label">CBLớp</div>
            <div class="preview-value">${details.CBLop ? 'Có' : 'Không'}</div>
          </div>
        </div>
      `;
    } else {
      content = `
        <div class="preview-error">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Không có thông tin chi tiết
        </div>
      `;
    }
    
    tooltip.innerHTML = content;
  }

  // Global functions

  // Edit existing user using the same modal - VERSION 2 (REMOVED - USING NEW ONE)

  // ==== Kiểm tra quyền truy cập ====
  function checkAdminAccess() {
    const userInfo = localStorage.getItem("loggedUserInfo");
    if (!userInfo) {
      alert("Bạn chưa đăng nhập. Vui lòng đăng nhập trước!");
      window.location.href = "index.html";
      return false;
    }

    try {
      const user = JSON.parse(userInfo);
      const maQT = user.MaQT || "";
      
      if (maQT !== "AD01") {
        alert("Bạn không có quyền truy cập giao diện admin!");
        window.location.href = "index.html";
        return false;
      }

      // Hiển thị thông tin người dùng
      const userNameElement = document.getElementById("user-name");
      const headerAvatar = document.getElementById("header-avatar");
      
      if (userNameElement) {
        userNameElement.textContent = user.TenNguoiDung || user.TenTK || "Admin";
      }
      
      if (headerAvatar) {
        // Có thể thêm logic để hiển thị avatar thực tế của người dùng
        headerAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.TenNguoiDung || user.TenTK || "Admin")}&background=dc2626&color=fff`;
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
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  // ==== Sidebar Navigation (collapsible/pinnable) ====
  function initSidebar() {
    const pinBtn = document.getElementById("sidebar-pin");
    const mobileOverlay = document.getElementById("mobile-overlay");

    // Mobile menu toggle
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMobileMenu();
      });
    }

    // Mobile overlay click
    if (mobileOverlay) {
      mobileOverlay.addEventListener("click", () => closeMobileMenu());
    }

    // Initial expanded state from localStorage
    const persisted = localStorage.getItem("sidebarExpandedAdmin");
    if (persisted === "true") sidebar.classList.add("expanded");

    // Hover expand when not pinned
    sidebar.addEventListener("mouseenter", () => {
      if (localStorage.getItem("sidebarExpandedAdmin") !== "true") sidebar.classList.add("expanded");
    });
    sidebar.addEventListener("mouseleave", () => {
      if (localStorage.getItem("sidebarExpandedAdmin") !== "true") sidebar.classList.remove("expanded");
    });

    // Pin toggle
    if (pinBtn) {
      pinBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const nowExpanded = sidebar.classList.toggle("expanded");
        localStorage.setItem("sidebarExpandedAdmin", String(nowExpanded));
      });
    }

    // Item navigation
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();

        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        document.querySelectorAll('.section-content').forEach(sec => {
          sec.classList.add('hidden');
          sec.classList.remove('active');
        });

        const sectionId = item.getAttribute('data-section');
        const section = document.getElementById(sectionId);
        if (section) {
          section.classList.remove('hidden');
          section.classList.add('active');
        }

        // Auto close mobile menu after selection
        if (window.innerWidth < 1024) {
          closeMobileMenu();
        }
      });
    });
  }

  // ==== Mobile Menu Functions ====
  function toggleMobileMenu() {
    const mobileOverlay = document.getElementById("mobile-overlay");
    if (!mobileOverlay) return;
    sidebar.classList.toggle("mobile-open");
    mobileOverlay.classList.toggle("hidden");
    if (sidebar.classList.contains("mobile-open")) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }

  function closeMobileMenu() {
    const mobileOverlay = document.getElementById("mobile-overlay");
    if (!mobileOverlay) return;
    sidebar.classList.remove("mobile-open");
    mobileOverlay.classList.add("hidden");
    document.body.style.overflow = "";
  }

  // ==== Tab Navigation ====
  function initTabs() {
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-tab");
        
        // Update active states
        tabBtns.forEach(b => {
          b.classList.remove("active");
          b.querySelector("span").classList.remove("border-blue-500", "text-blue-600");
          b.querySelector("span").classList.add("border-transparent", "text-gray-500");
        });
        btn.classList.add("active");
        btn.querySelector("span").classList.add("border-blue-500", "text-blue-600");
        btn.querySelector("span").classList.remove("border-transparent", "text-gray-500");
        
        // Show target tab content
        tabContents.forEach(content => {
          content.classList.add("hidden");
          content.classList.remove("active");
        });
        
        const targetElement = document.getElementById(targetTab);
        if (targetElement) {
          targetElement.classList.remove("hidden");
          targetElement.classList.add("active");
        }
      });
    });
  }

  // ==== Breadcrumb and Notifications (reuse logic) ====
  function updateBreadcrumb(section) {
    const currentSection = document.getElementById("current-section");
    const currentPage = document.getElementById("current-page");
    const sectionMap = {
      dashboard: { section: "Tổng quan", page: "Dashboard" },
      users: { section: "Hệ thống", page: "Người dùng" },
      faculty: { section: "Hệ thống", page: "Khoa/Lớp" },
      activities: { section: "Hệ thống", page: "Hoạt động" },
      system: { section: "Cấu hình", page: "Thiết lập" },
      logs: { section: "Hệ thống", page: "Nhật ký" }
    };
    if (currentSection && currentPage && sectionMap[section]) {
      currentSection.textContent = sectionMap[section].section;
      currentPage.textContent = sectionMap[section].page;
    }
  }

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
              <p class="text-sm font-medium text-gray-800 truncate">${act.TenHD || 'Sự kiện hệ thống'}</p>
              <p class="text-xs text-gray-500">${formatDate(act.NgayBD)} - ${formatDate(act.NgayKT)}</p>
            </div>
          </div>
        </div>
      `).join('');
    } catch {}
  }

  // ==== Dashboard Functions ====
  async function loadDashboardStats() {
    try {
      // Load statistics and quick health checks
      const [statsRes, preloadRes, pingRes] = await Promise.all([
        fetch(`${API_BASE}/api/stats`),
        fetch(`${API_BASE}/api/preload`),
        fetch(`${API_BASE}/api/preload`) // lightweight ping for API/db health
      ]);
      
      if (statsRes.ok) {
        const stats = await statsRes.json();
        
        // Update stats cards
        document.getElementById("total-users").textContent = stats.totalUsers || 0;
        document.getElementById("total-faculties").textContent = stats.totalFaculties || 0;
        document.getElementById("total-activities").textContent = stats.totalActivities || 0;
        document.getElementById("total-records").textContent = stats.totalRecords || 0;
      }

      // Update system status
      const setStatus = (ok, dotId, textId, okText, failText) => {
        const dot = document.getElementById(dotId);
        const text = document.getElementById(textId);
        if (!dot || !text) return;
        if (ok) {
          dot.classList.remove('bg-red-500');
          dot.classList.add('bg-green-500');
          text.textContent = okText;
          text.classList.remove('text-red-600');
          text.classList.add('text-green-600');
        } else {
          dot.classList.remove('bg-green-500');
          dot.classList.add('bg-red-500');
          text.textContent = failText;
          text.classList.remove('text-green-600');
          text.classList.add('text-red-600');
        }
      };

      // API server up if pingRes ok
      setStatus(pingRes && pingRes.ok, 'api-status-dot', 'api-status-text', 'Hoạt động', 'Mất kết nối');
      // DB assumed up if stats loaded successfully
      setStatus(statsRes && statsRes.ok, 'db-status-dot', 'db-status-text', 'Hoạt động', 'Lỗi cơ sở dữ liệu');
      // Security: basic assumption OK (no check); keep as OK if API OK
      setStatus(pingRes && pingRes.ok, 'sec-status-dot', 'sec-status-text', 'Bảo vệ', 'Cảnh báo');
      
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

        // Hydrate notifications for header
        hydrateNotifications(data.hoatDongTruong || []);
      }
    } catch (error) {
      console.error("Error loading dashboard stats:", error);
      // Show degraded status when error
      const degrade = (dotId, textId, text) => {
        const dot = document.getElementById(dotId);
        const t = document.getElementById(textId);
        if (dot) { dot.classList.remove('bg-green-500'); dot.classList.add('bg-red-500'); }
        if (t) { t.textContent = text; t.classList.remove('text-green-600'); t.classList.add('text-red-600'); }
      };
      degrade('api-status-dot', 'api-status-text', 'Mất kết nối');
      degrade('db-status-dot', 'db-status-text', 'Lỗi cơ sở dữ liệu');
      degrade('sec-status-dot', 'sec-status-text', 'Cảnh báo');
    }
  }

  // ==== Users Management ====
  let currentFilter = 'all';
  let currentFilterData = {};

  async function loadUsers(searchTerm, filterType = 'all', filterData = {}) {
    try {
      const tbody = document.getElementById("users-table-body");
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      let url = new URL(`${API_BASE}/api/users`);
      
      // Thêm search term nếu có
      if (searchTerm && String(searchTerm).trim() !== "") {
        url.searchParams.set("search", String(searchTerm).trim());
      }
      
      // Thêm filter parameters
      if (filterType !== 'all') {
        url.searchParams.set("filterType", filterType);
        Object.keys(filterData).forEach(key => {
          if (filterData[key]) {
            url.searchParams.set(key, filterData[key]);
          }
        });
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const users = await response.json();
      
      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu người dùng</td></tr>';
        return;
      }

      tbody.innerHTML = users.map(user => `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.TenTK}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.TenNguoiDung}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.ChucVu}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            <span id="info-status-${user.MaCaNhan}" class="text-gray-400">Đang kiểm tra...</span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span id="status-badge-${user.MaCaNhan}" class="status-badge ${user.TrangThai ? 'status-active' : 'status-locked'}">
              ${user.TrangThai ? 'Hoạt động' : 'Đã khóa'}
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <div class="action-buttons">
              <!-- Nút Chỉnh sửa -->
              <button onclick="editUser('${user.MaCaNhan}')" 
                      class="action-btn bg-blue-500"
                      title="Chỉnh sửa thông tin người dùng">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
                <span>Chỉnh sửa</span>
              </button>
              
              <!-- Nút Khóa/Mở khóa -->
              ${user.TrangThai ? 
                `<button onclick="lockUser('${user.MaCaNhan}')" 
                         class="action-btn bg-orange-500"
                         title="Khóa tài khoản người dùng">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                  </svg>
                  <span>Khóa</span>
                </button>` : 
                `<button onclick="unlockUser('${user.MaCaNhan}')" 
                         class="action-btn bg-emerald-500"
                         title="Mở khóa tài khoản người dùng">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"></path>
                  </svg>
                  <span>Mở khóa</span>
                </button>`
              }
              
              <!-- Nút Xóa -->
              <button onclick="deleteUser('${user.MaCaNhan}')" 
                      class="action-btn bg-red-500"
                      title="Xóa tài khoản người dùng">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                <span>Xóa</span>
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      // Kiểm tra thông tin chi tiết cho từng user
      users.forEach(user => {
        checkUserInfo(user.MaCaNhan);
      });

    } catch (error) {
      console.error("Error loading users:", error);
      document.getElementById("users-table-body").innerHTML = 
        '<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
    }
  }
  
  // ==== Filter Management ====
  function initFilterTabs() {
    // Tab click handlers
    document.getElementById('filter-all').addEventListener('click', () => switchFilter('all'));
    document.getElementById('filter-chucvu').addEventListener('click', () => switchFilter('chucvu'));
    document.getElementById('filter-lop').addEventListener('click', () => switchFilter('lop'));
    document.getElementById('filter-khoa').addEventListener('click', () => switchFilter('khoa'));
    document.getElementById('filter-khoahoc').addEventListener('click', () => switchFilter('khoahoc'));
    
    // Search button handlers
    document.getElementById('user-search-btn').addEventListener('click', () => {
      const searchTerm = document.getElementById('user-search-input').value;
      loadUsers(searchTerm, 'all', {});
    });
    
    document.getElementById('chucvu-search-btn').addEventListener('click', () => {
      const searchTerm = document.getElementById('chucvu-search').value;
      const chucVu = document.getElementById('chucvu-filter').value;
      loadUsers(searchTerm, 'chucvu', { chucVu });
    });
    
    document.getElementById('lop-search-btn').addEventListener('click', () => {
      const searchTerm = document.getElementById('lop-search').value;
      const lop = document.getElementById('lop-filter').value;
      loadUsers(searchTerm, 'lop', { lop });
    });
    
    document.getElementById('khoa-search-btn').addEventListener('click', () => {
      const searchTerm = document.getElementById('khoa-search').value;
      const khoa = document.getElementById('khoa-filter').value;
      loadUsers(searchTerm, 'khoa', { khoa });
    });
    
    document.getElementById('khoahoc-search-btn').addEventListener('click', () => {
      const searchTerm = document.getElementById('khoahoc-search').value;
      const khoahoc = document.getElementById('khoahoc-filter').value;
      loadUsers(searchTerm, 'khoahoc', { khoahoc });
    });
    
    // Load filter data
    loadFilterOptions();
  }
  
  function switchFilter(filterType) {
    // Update current filter
    currentFilter = filterType;
    
    // Update tab appearance
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.classList.remove('active');
      tab.classList.add('border-transparent', 'text-gray-500');
      tab.classList.remove('border-blue-500', 'text-blue-600');
    });
    
    document.getElementById(`filter-${filterType}`).classList.add('active');
    document.getElementById(`filter-${filterType}`).classList.add('border-blue-500', 'text-blue-600');
    document.getElementById(`filter-${filterType}`).classList.remove('border-transparent', 'text-gray-500');
    
    // Update content visibility
    document.querySelectorAll('.filter-content').forEach(content => {
      content.classList.add('hidden');
      content.classList.remove('active');
    });
    
    document.getElementById(`filter-${filterType}-content`).classList.remove('hidden');
    document.getElementById(`filter-${filterType}-content`).classList.add('active');
    
    // Load users for this filter
    loadUsers('', filterType, {});
  }
  
  async function loadFilterOptions() {
    try {
      // Load classes for lop filter
      const lopResponse = await fetch(`${API_BASE}/api/preload`);
      if (lopResponse.ok) {
        const data = await lopResponse.json();
        const lopSelect = document.getElementById('lop-filter');
        lopSelect.innerHTML = '<option value="">Tất cả lớp</option>' +
          data.lop.map(l => `<option value="${l.MaLop}">${l.TenLop} - ${l.TenKhoa || 'N/A'}</option>`).join('');
        
        // Load faculties for khoa filter
        const khoaSelect = document.getElementById('khoa-filter');
        khoaSelect.innerHTML = '<option value="">Tất cả khoa</option>' +
          data.khoa.map(k => `<option value="${k.MaKH}">${k.TenKhoa}</option>`).join('');
        
        // Load khoa hoc (khóa học) for khoahoc filter - sử dụng MaKhoa và TenKhoa từ bảng KhoaHoc
        const khoahocSelect = document.getElementById('khoahoc-filter');
        khoahocSelect.innerHTML = '<option value="">Tất cả khóa học</option>' +
          (data.khoaHoc || []).map(k => `<option value="${k.MaKhoa}">${k.MaKhoa} - ${k.TenKhoa}</option>`).join('');
      }
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  }

  
  
  
  
  
  // Assign to global for access from lock/unlock functions
  window._loadUsers = loadUsers;

  async function openAddUserModal() {
    const modal = document.getElementById("user-modal");
    const closeBtn = document.getElementById("user-modal-close");
    const cancelBtn = document.getElementById("user-cancel");
    const form = document.getElementById("user-form");
    const roleSelect = document.getElementById("u-maqt");
    const modalTitle = modal.querySelector("h3");
    
    // Đảm bảo title là "Thêm người dùng mới"
    modalTitle.textContent = "Thêm người dùng mới";
    
    // Ẩn tab "Thông tin chi tiết" khi thêm mới
    const tabDetail = document.getElementById("tab-detail");
    const tabDetailContent = document.getElementById("tab-detail-content");
    if (tabDetail) tabDetail.style.display = 'none';
    if (tabDetailContent) tabDetailContent.style.display = 'none';
    
    // Chuyển về tab cơ bản
    const tabBasic = document.getElementById("tab-basic");
    const tabBasicContent = document.getElementById("tab-basic-content");
    
    if (tabBasic) {
      tabBasic.classList.add("active");
      tabBasic.classList.remove("inactive");
    }
    if (tabBasicContent) {
      tabBasicContent.classList.add("active");
      tabBasicContent.classList.remove("hidden");
    }
    
    if (tabDetail) {
      tabDetail.classList.add("inactive");
      tabDetail.classList.remove("active");
    }
    if (tabDetailContent) {
      tabDetailContent.classList.add("hidden");
      tabDetailContent.classList.remove("active");
    }
    
    // Reset form cơ bản
    form.reset();
    
    // Reset form chi tiết
    const detailForm = document.getElementById("user-detail-form");
    if (detailForm) detailForm.reset();
    
    // Ẩn tất cả trường giảng viên và sinh viên
    const giangvienFields = document.getElementById("edit-giangvien-fields");
    const sinhvienFields = document.getElementById("edit-sinhvien-fields");
    if (giangvienFields) giangvienFields.classList.add("hidden");
    if (sinhvienFields) sinhvienFields.classList.add("hidden");
    
    // Reset tất cả trường chi tiết về giá trị mặc định
    const detailFields = [
      'edit-info-macanhan', 'edit-info-tennguoidung', 'edit-info-ten',
      'edit-info-sdt', 'edit-info-email', 'edit-info-khoa', 'edit-info-lopcv',
      'edit-info-diachi-gv', 'edit-info-lop', 'edit-info-khoahoc', 'edit-info-diachi',
      'edit-info-cblop', 'edit-info-tvclbkhoa', 'edit-info-tvclbtruong'
    ];
    
    detailFields.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) {
        if (field.type === 'checkbox') {
          field.checked = false;
        } else {
          field.value = '';
        }
      }
    });

    // Load roles
    try {
      const res = await fetch(`${API_BASE}/api/quantri`);
      if (res.ok) {
        const roles = await res.json();
        roleSelect.innerHTML = '<option value="">-- Chọn quyền --</option>' +
          roles.map(r => `<option value="${r.MaQT}" data-tencap="${r.TenCAP}">${r.TenCAP} (${r.MaQT})</option>`).join('');
      } else {
        roleSelect.innerHTML = '<option value="">Không tải được quyền</option>';
      }
    } catch {
      roleSelect.innerHTML = '<option value="">Lỗi tải quyền</option>';
    }

    // Tự động điền chức vụ khi chọn quyền (remove existing listener first)
    const existingListener = roleSelect.getAttribute('data-listener-added');
    if (!existingListener) {
      roleSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption.value) {
          const tenCap = selectedOption.getAttribute('data-tencap');
          document.getElementById("u-chucvu").value = tenCap || '';
        }
      });
      roleSelect.setAttribute('data-listener-added', 'true');
    }

    // Setup nút Hủy
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        modal.classList.add("hidden");
        // Reset về tab cơ bản
        if (tabBasic) {
          tabBasic.classList.add("active");
          tabBasic.classList.remove("inactive");
        }
        if (tabBasicContent) {
          tabBasicContent.classList.add("active");
          tabBasicContent.classList.remove("hidden");
        }
        if (tabDetail) {
          tabDetail.classList.add("inactive");
          tabDetail.classList.remove("active");
        }
        if (tabDetailContent) {
          tabDetailContent.classList.add("hidden");
          tabDetailContent.classList.remove("active");
        }
        form.reset();
      };
    }
    
    // Setup nút xem mật khẩu
    const togglePasswordBtn = document.getElementById("toggle-password");
    const passwordInput = document.getElementById("u-matkhau");
    const eyeOpen = document.getElementById("eye-open");
    const eyeClosed = document.getElementById("eye-closed");
    
    if (togglePasswordBtn && passwordInput && eyeOpen && eyeClosed) {
      togglePasswordBtn.onclick = () => {
        if (passwordInput.type === "password") {
          passwordInput.type = "text";
          eyeOpen.classList.add("hidden");
          eyeClosed.classList.remove("hidden");
        } else {
          passwordInput.type = "password";
          eyeOpen.classList.remove("hidden");
          eyeClosed.classList.add("hidden");
        }
      };
    }

    // Show modal
    modal.classList.remove("hidden");

    const close = () => {
      modal.classList.add("hidden");
      form.reset();
      // Reset title về "Thêm người dùng mới"
      modalTitle.textContent = "Thêm người dùng mới";

    };

    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    // Auto-fill role name to Chức vụ
    roleSelect.onchange = () => {
      const selected = roleSelect.options[roleSelect.selectedIndex];
      const tenCap = selected?.getAttribute('data-tencap') || '';
      const chucVuInput = document.getElementById("u-chucvu");
      if (chucVuInput) chucVuInput.value = tenCap || '';
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        MaCaNhan: document.getElementById("u-macanhan").value.trim(),
        TenTK: document.getElementById("u-tentk").value.trim(),
        MatKhau: document.getElementById("u-matkhau").value,
        TenNguoiDung: document.getElementById("u-tennguoidung").value.trim(),
        ChucVu: document.getElementById("u-chucvu").value.trim(),
        MaQT: document.getElementById("u-maqt").value
      };

      if (!payload.MaCaNhan || !payload.TenTK || !payload.MatKhau || !payload.TenNguoiDung || !payload.ChucVu || !payload.MaQT) {
        alert("Vui lòng nhập đầy đủ thông tin bắt buộc");
        return;
      }

      try {
        const resp = await fetch(`${API_BASE}/api/users`, withUserHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }));
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.message || `HTTP ${resp.status}`);
        }
        const result = await resp.json();
        alert(result.message || "Thêm người dùng thành công!");
        close();
        loadUsers();
      } catch (err) {
        alert("Lỗi thêm người dùng: " + err.message);
      }
    };
  }

  // ==== Faculty Management ====
  async function loadFaculties() {
    try {
      const tbody = document.getElementById("faculty-table-body");
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      const res = await fetch(`${API_BASE}/api/preload`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      const faculties = data.khoa || [];
      const classes = data.lop || [];

      // Đếm số lớp theo khoa
      const classCountByFaculty = new Map(); // MaKH -> count
      const classIdsByFaculty = new Map();   // MaKH -> Set<MaLop>
      for (const cls of classes) {
        const maKH = cls.MaKH;
        if (!maKH) continue;
        classCountByFaculty.set(maKH, (classCountByFaculty.get(maKH) || 0) + 1);
        if (!classIdsByFaculty.has(maKH)) classIdsByFaculty.set(maKH, new Set());
        classIdsByFaculty.get(maKH).add(cls.MaLop);
      }

      // Đếm số sinh viên theo lớp
      let students = [];
      try {
        const svRes = await fetch(`${API_BASE}/api/sinhvien`);
        if (svRes.ok) students = await svRes.json();
      } catch {}
      const studentCountByClass = new Map(); // MaLop -> count
      for (const sv of students) {
        const maLop = sv.MaLop;
        if (!maLop) continue;
        studentCountByClass.set(maLop, (studentCountByClass.get(maLop) || 0) + 1);
      }

      // Tính số sinh viên theo khoa (tổng của các lớp thuộc khoa)
      const studentCountByFaculty = new Map(); // MaKH -> total students
      for (const [maKH, lopSet] of classIdsByFaculty.entries()) {
        let total = 0;
        for (const maLop of lopSet.values()) {
          total += studentCountByClass.get(maLop) || 0;
        }
        studentCountByFaculty.set(maKH, total);
      }

      if (faculties.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu khoa</td></tr>';
        return;
      }

      tbody.innerHTML = faculties.map(faculty => {
        const soLop = classCountByFaculty.get(faculty.MaKH) || 0;
        const soSV = studentCountByFaculty.get(faculty.MaKH) || 0;
        return `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${faculty.MaKH}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${faculty.TenKhoa}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${soLop}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${soSV}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <button data-edit-khoa="${faculty.MaKH}" class="text-blue-600 hover:text-blue-900 mr-2">Sửa</button>
            <button data-del-khoa="${faculty.MaKH}" class="text-red-600 hover:text-red-900">Xóa</button>
          </td>
        </tr>`;
      }).join('');

      // Attach actions
      document.querySelectorAll('[data-edit-khoa]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const maKH = btn.getAttribute('data-edit-khoa');
          const tenKhoa = prompt('Nhập tên khoa mới:');
          if (!tenKhoa) return;
          try {
            const resp = await fetch(`${API_BASE}/api/khoa/${maKH}`, withUserHeader({
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ MaKH: maKH, TenKhoa: tenKhoa })
            }));
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.message || `HTTP ${resp.status}`);
            }
            alert('Cập nhật khoa thành công');
            loadFaculties();
          } catch (e) {
            alert('Lỗi cập nhật khoa: ' + e.message);
          }
        });
      });

      document.querySelectorAll('[data-del-khoa]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const maKH = btn.getAttribute('data-del-khoa');
          if (!confirm('Xóa khoa này? Lưu ý: có thể ảnh hưởng dữ liệu lớp.')) return;
          try {
            const resp = await fetch(`${API_BASE}/api/khoa/${maKH}`, withUserHeader({ method: 'DELETE' }));
            if (!resp.ok && resp.status !== 204) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.message || `HTTP ${resp.status}`);
            }
            alert('Đã xóa khoa');
            loadFaculties();
            loadClasses();
          } catch (e) {
            alert('Lỗi xóa khoa: ' + e.message);
          }
        });
      });
    } catch (error) {
      console.error("Error loading faculties:", error);
      document.getElementById("faculty-table-body").innerHTML = 
        '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
    }
  }

  async function loadClasses() {
    try {
      const tbody = document.getElementById("class-table-body");
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      const res = await fetch(`${API_BASE}/api/preload`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      const classes = data.lop || [];
      const facultyMap = new Map((data.khoa || []).map(k => [k.MaKH, k.TenKhoa]));

      // Đếm số sinh viên theo lớp
      let students = [];
      try {
        const svRes = await fetch(`${API_BASE}/api/sinhvien`);
        if (svRes.ok) students = await svRes.json();
      } catch {}
      const studentCountByClass = new Map(); // MaLop -> count
      for (const sv of students) {
        const maLop = sv.MaLop;
        if (!maLop) continue;
        studentCountByClass.set(maLop, (studentCountByClass.get(maLop) || 0) + 1);
      }

      if (classes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu lớp</td></tr>';
        return;
      }

      tbody.innerHTML = classes.map(cls => {
        const tenKhoa = cls.TenKhoa || facultyMap.get(cls.MaKH) || 'N/A';
        const soSV = studentCountByClass.get(cls.MaLop) || 0;
        return `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${cls.MaLop}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${cls.TenLop}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${tenKhoa}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${soSV}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <button data-edit-lop="${cls.MaLop}" class="text-blue-600 hover:text-blue-900 mr-2">Sửa</button>
            <button data-del-lop="${cls.MaLop}" class="text-red-600 hover:text-red-900">Xóa</button>
          </td>
        </tr>`;
      }).join('');

      // Attach class actions
      document.querySelectorAll('[data-edit-lop]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const maLop = btn.getAttribute('data-edit-lop');
          const tenLop = prompt('Nhập tên lớp mới:');
          if (!tenLop) return;
          const maKH = prompt('Nhập mã khoa (giữ nguyên nếu không đổi):');
          if (!maKH) return;
          try {
            const resp = await fetch(`${API_BASE}/api/lop/${maLop}`, withUserHeader({
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ MaLop: maLop, TenLop: tenLop, MaKH: maKH })
            }));
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.message || `HTTP ${resp.status}`);
            }
            alert('Cập nhật lớp thành công');
            loadClasses();
            loadFaculties();
          } catch (e) {
            alert('Lỗi cập nhật lớp: ' + e.message);
          }
        });
      });

      document.querySelectorAll('[data-del-lop]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const maLop = btn.getAttribute('data-del-lop');
          if (!confirm('Xóa lớp này?')) return;
          try {
            const resp = await fetch(`${API_BASE}/api/lop/${maLop}`, withUserHeader({ method: 'DELETE' }));
            if (!resp.ok && resp.status !== 204) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.message || `HTTP ${resp.status}`);
            }
            alert('Đã xóa lớp');
            loadClasses();
            loadFaculties();
          } catch (e) {
            alert('Lỗi xóa lớp: ' + e.message);
          }
        });
      });
    } catch (error) {
      console.error("Error loading classes:", error);
      document.getElementById("class-table-body").innerHTML = 
        '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
    }
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
            <button class="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm" data-del-activity="${act.MaHD}">
              Xóa
            </button>
          </div>
        </div>
      `).join('');

      // Attach handlers for view/edit/delete
      grid.querySelectorAll('[data-view-activity]').forEach(btn => {
        btn.addEventListener('click', () => viewActivityDetailAdmin(btn.getAttribute('data-view-activity')));
      });
      grid.querySelectorAll('[data-edit-activity]').forEach(btn => {
        btn.addEventListener('click', () => openEditActivityAdmin(btn.getAttribute('data-edit-activity')));
      });
      grid.querySelectorAll('[data-del-activity]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-del-activity');
          if (!id) return;
          if (!confirm(`Xóa hoạt động ${id}?`)) return;
          try {
            const resp = await fetch(`${API_BASE}/api/hoatdong/${id}`, withUserHeader({ method: 'DELETE' }));
            if (!resp.ok && resp.status !== 204) {
              const txt = await resp.text();
              try {
                const err = JSON.parse(txt);
                throw new Error(err.message || `HTTP ${resp.status}`);
              } catch {
                throw new Error(txt || `HTTP ${resp.status}`);
              }
            }
            alert('Đã xóa hoạt động');
            loadActivities();
          } catch (e) {
            alert('Lỗi xóa hoạt động: ' + (e && e.message ? e.message : e));
          }
        });
      });
    } catch (error) {
      console.error("Error loading activities:", error);
      document.getElementById("activities-grid").innerHTML = 
        '<div class="col-span-full text-center text-red-500">Lỗi tải dữ liệu</div>';
    }
  }

  async function viewActivityDetailAdmin(maHD) {
    try {
      const res = await fetch(`${API_BASE}/api/hoatdong/${maHD}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const act = await res.json();
      const title = document.getElementById('modal-title');
      const body = document.getElementById('modal-body');
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
      document.getElementById('modal').classList.remove('hidden');
    } catch (e) {
      alert('Lỗi tải chi tiết hoạt động: ' + e.message);
    }
  }

  async function openEditActivityAdmin(maHD) {
    try {
      const res = await fetch(`${API_BASE}/api/hoatdong/${maHD}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const act = await res.json();

      const modal = document.getElementById('activity-modal-admin');
      const form = document.getElementById('activity-form-admin');
      const closeBtn = document.getElementById('activity-modal-admin-close');
      const cancelBtn = document.getElementById('act-cancel');
      document.getElementById('act-code').value = act.MaHD;
      document.getElementById('act-name').value = act.TenHD || '';
      document.getElementById('act-desc').value = act.NDHD || '';
      document.getElementById('act-start').value = act.NgayBD ? new Date(act.NgayBD).toISOString().split('T')[0] : '';
      document.getElementById('act-end').value = act.NgayKT ? new Date(act.NgayKT).toISOString().split('T')[0] : '';
      document.getElementById('act-points').value = act.DiemRL ?? '';
      document.getElementById('act-max').value = act.SoSvDK ?? '';
      document.getElementById('act-key').value = act.TUKHOA || '';
      document.getElementById('act-location').value = act.DiaDiem || '';

      form.dataset.editId = maHD;
      modal.classList.remove('hidden');

      const close = () => {
        modal.classList.add('hidden');
        form.reset();
        delete form.dataset.editId;
      };
      if (closeBtn) closeBtn.onclick = close;
      if (cancelBtn) cancelBtn.onclick = close;

      form.onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
          MaHD: document.getElementById('act-code').value.trim(),
          TenHD: document.getElementById('act-name').value.trim(),
          DiemRL: parseInt(document.getElementById('act-points').value, 10),
          NDHD: document.getElementById('act-desc').value.trim() || null,
          NgayBD: new Date(document.getElementById('act-start').value),
          NgayKT: new Date(document.getElementById('act-end').value),
          SoSvDK: document.getElementById('act-max').value ? parseInt(document.getElementById('act-max').value, 10) : null,
          DiaDiem: document.getElementById('act-location').value.trim() || null,
          TUKHOA: document.getElementById('act-key').value.trim() || null
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
    } catch (e) {
      alert('Lỗi tải hoạt động: ' + e.message);
    }
  }

  // ==== System Configuration ====
  async function initSystemConfig() {
    // Load system settings
    try {
      const res = await fetch(`${API_BASE}/api/settings/system`);
      if (res.ok) {
        const settings = await res.json();
        document.getElementById("school-name").value = settings.SchoolName || "Trường Đại học Kiên Giang";
        document.getElementById("current-year").value = settings.CurrentYear || new Date().getFullYear();
        document.getElementById("current-semester").value = settings.CurrentSemester || 2;
        
        // Load semester end date
        if (settings.SemesterEndDate) {
          const endDate = new Date(settings.SemesterEndDate);
          const localDateTime = new Date(endDate.getTime() - endDate.getTimezoneOffset() * 60000);
          document.getElementById("semester-end-date").value = localDateTime.toISOString().slice(0, 16);
        }
        
        // Load auto point status
        const autoPointEnabled = settings.AutoPointEnabled;
        const enabledRadio = document.querySelector('input[name="auto-point-status"][value="enabled"]');
        const disabledRadio = document.querySelector('input[name="auto-point-status"][value="disabled"]');
        if (autoPointEnabled) {
          enabledRadio.checked = true;
        } else {
          disabledRadio.checked = true;
        }
      }
    } catch (error) {
      console.error("Error loading system settings:", error);
    }

    // Load point settings
    try {
      const res = await fetch(`${API_BASE}/api/settings/points`);
      if (res.ok) {
        const points = await res.json();
        document.getElementById("max-points").value = points.MaxPoints || 100;
        document.getElementById("min-points").value = points.MinPoints || 0;
        document.getElementById("excellent-points").value = points.ExcellentPoints || 90;
        document.getElementById("good-points").value = points.GoodPoints || 80;
      }
    } catch (error) {
      console.error("Error loading point settings:", error);
      // Set defaults if API fails
    document.getElementById("max-points").value = "100";
    document.getElementById("min-points").value = "0";
    document.getElementById("excellent-points").value = "90";
    document.getElementById("good-points").value = "80";
    }

    // Load criteria list
    loadCriteria();

    // Bind criteria form
    const criteriaForm = document.getElementById('criteria-form');
    if (criteriaForm) {
      criteriaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ten = document.getElementById('tc-ten').value.trim();
        const diem = parseInt(document.getElementById('tc-diem').value, 10);
        const idhdRaw = document.getElementById('tc-idhd').value;
        const idhd = idhdRaw && idhdRaw.trim() !== '' ? idhdRaw.trim() : null;
        const tdtt = document.getElementById('tc-tdtt').checked;
        if (!ten || isNaN(diem)) { alert('Vui lòng nhập tên và số điểm'); return; }
        try {
          const resp = await fetch(`${API_BASE}/api/hoatdongtc`, withUserHeader({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ TenHD: ten, SoDiemToiDa: diem, TDTT: tdtt, IDHoatDong: idhd })
          }));
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${resp.status}`);
          }
          alert('Thêm tiêu chí thành công');
          criteriaForm.reset();
          loadCriteria();
        } catch (err) {
          alert('Lỗi thêm tiêu chí: ' + err.message);
        }
      });
    }
  }

  async function loadCriteria() {
    try {
      const tbody = document.getElementById('criteria-table-body');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';
      const res = await fetch(`${API_BASE}/api/hoatdongtc`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      // Ensure ascending by Ma on client as well (safety)
      rows.sort((a,b) => (a.Ma ?? 0) - (b.Ma ?? 0));
      if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Chưa có tiêu chí, vui lòng thêm tiêu chí</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${r.Ma}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${r.IDHoatDong ?? ''}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
            <input data-edit-tenhd="${r.Ma}" class="w-full border rounded-md px-2 py-1" value="${r.TenHD || ''}">
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
            <input type="number" min="0" data-edit-diem="${r.Ma}" class="w-24 border rounded-md px-2 py-1" value="${r.SoDiemToiDa ?? ''}">
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm">
            ${r.TDTT ? '<span class="status-badge status-active">Có</span>' : '<span class="status-badge status-inactive">Không</span>'}
            <button data-save-tc="${r.Ma}" class="ml-3 px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700">Lưu</button>
          </td>
        </tr>
      `).join('');

      // Attach save handlers
      tbody.querySelectorAll('[data-save-tc]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ma = btn.getAttribute('data-save-tc');
          const tenInput = tbody.querySelector(`[data-edit-tenhd="${ma}"]`);
          const diemInput = tbody.querySelector(`[data-edit-diem="${ma}"]`);
          const ten = tenInput ? tenInput.value.trim() : null;
          const diemStr = diemInput ? diemInput.value : null;
          const diem = diemStr !== null && diemStr !== '' ? parseInt(diemStr, 10) : null;
          try {
            const resp = await fetch(`${API_BASE}/api/hoatdongtc/${ma}`, withUserHeader({
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ TenHD: ten || null, SoDiemToiDa: Number.isNaN(diem) ? null : diem })
            }));
            if (!resp.ok && resp.status !== 204) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.message || `HTTP ${resp.status}`);
            }
            alert('Đã lưu tiêu chí');
            loadCriteria();
          } catch (e) {
            alert('Lỗi lưu tiêu chí: ' + e.message);
          }
        });
      });
    } catch (e) {
      const tbody = document.getElementById('criteria-table-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Lỗi tải tiêu chí</td></tr>';
    }
  }

  // ==== System Logs ====
  async function loadLogs() {
    try {
      const tbody = document.getElementById("logs-table-body");
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      const response = await fetch(`${API_BASE}/api/logs`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const logs = await response.json();
      
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu log</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(log => `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatDateTime(log.ThoiGian)}</td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="status-badge status-active">Info</span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${log.MaTK || 'N/A'}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${log.Action || 'N/A'}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${log.IPAddress || 'N/A'}</td>
        </tr>
      `).join('');
    } catch (error) {
      console.error("Error loading logs:", error);
      document.getElementById("logs-table-body").innerHTML = 
        '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
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

  function formatDateTime(dateStr) {
    if (!dateStr) return "N/A";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('vi-VN');
    } catch {
      return dateStr;
    }
  }

  // ==== Admin Management Functions ====
  async function addFaculty() {
    const maKH = prompt("Nhập mã khoa:");
    const tenKhoa = prompt("Nhập tên khoa:");
    
    if (!maKH || !tenKhoa) {
      alert("Vui lòng nhập đầy đủ thông tin!");
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/khoa`, withUserHeader({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ MaKH: maKH, TenKhoa: tenKhoa })
      }));
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      alert(result.message || "Thêm khoa thành công!");
      loadFaculties();
    } catch (error) {
      console.error("Error adding faculty:", error);
      alert("Lỗi thêm khoa: " + error.message);
    }
  }

  async function addClass() {
    const maLop = prompt("Nhập mã lớp:");
    const tenLop = prompt("Nhập tên lớp:");
    const maKH = prompt("Nhập mã khoa:");
    
    if (!maLop || !tenLop || !maKH) {
      alert("Vui lòng nhập đầy đủ thông tin!");
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/lop`, withUserHeader({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ MaLop: maLop, TenLop: tenLop, MaKH: maKH })
      }));
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      alert(result.message || "Thêm lớp thành công!");
      loadClasses();
    } catch (error) {
      console.error("Error adding class:", error);
      alert("Lỗi thêm lớp: " + error.message);
    }
  }

  async function addActivity() {
    // Open admin activity modal
    const modal = document.getElementById("activity-modal-admin");
    const form = document.getElementById("activity-form-admin");
    const closeBtn = document.getElementById("activity-modal-admin-close");
    const cancelBtn = document.getElementById("act-cancel");

    const open = () => modal.classList.remove("hidden");
    const close = () => { modal.classList.add("hidden"); form.reset(); };

    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    form.onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        MaHD: document.getElementById("act-code").value.trim(),
        TenHD: document.getElementById("act-name").value.trim(),
        DiemRL: parseInt(document.getElementById("act-points").value, 10),
        NDHD: document.getElementById("act-desc").value.trim() || null,
        DiaDiem: document.getElementById("act-location")?.value?.trim() || null,
        NgayBD: new Date(document.getElementById("act-start").value),
        NgayKT: new Date(document.getElementById("act-end").value),
        SoSvDK: document.getElementById("act-max").value ? parseInt(document.getElementById("act-max").value, 10) : null,
        TUKHOA: document.getElementById("act-key").value.trim() || null
      };

      if (!payload.MaHD || !payload.TenHD || isNaN(payload.DiemRL) || !payload.NgayBD || !payload.NgayKT) {
        alert("Vui lòng nhập đầy đủ thông tin bắt buộc");
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/hoatdong`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      alert(result.message || "Thêm hoạt động thành công!");
        close();
      loadActivities();
    } catch (error) {
      console.error("Error adding activity:", error);
      alert("Lỗi thêm hoạt động: " + error.message);
    }
    };

    open();
  }

  window.deleteUser = async function deleteUser(maCaNhan) {
    if (confirm("Bạn có chắc chắn muốn xóa người dùng này? Hành động này không thể hoàn tác!")) {
      try {
        const response = await fetch(`${API_BASE}/api/users/${maCaNhan}`, withUserHeader({
          method: 'DELETE'
        }));
        
        if (response.ok) {
          alert("Xóa người dùng thành công!");
          loadUsers(); // Reload danh sách
        } else {
          const error = await response.json();
          alert(`Lỗi: ${error.message || 'Không thể xóa người dùng'}`);
        }
      } catch (error) {
        console.error('Error deleting user:', error);
        alert("Có lỗi xảy ra khi xóa người dùng!");
      }
    }
  }

  // ==== Event Listeners ====
  function initEventListeners() {
    // Add faculty button
    const addFacultyBtn = document.getElementById("add-faculty-btn");
    if (addFacultyBtn) {
      addFacultyBtn.addEventListener("click", addFaculty);
    }

    // Add class button
    const addClassBtn = document.getElementById("add-class-btn");
    if (addClassBtn) {
      addClassBtn.addEventListener("click", addClass);
    }

    // Add activity button
    const addActivityBtn = document.getElementById("add-activity-btn");
    if (addActivityBtn) {
      addActivityBtn.addEventListener("click", addActivity);
    }

    // Add user button
    const addUserBtn = document.getElementById("add-user-btn");
    if (addUserBtn) {
      addUserBtn.addEventListener("click", openAddUserModal);
    }

    // Header dropdown actions
    const dpChangePwd = document.getElementById('dropdown-change-password');
    if (dpChangePwd) {
      dpChangePwd.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close dropdown
        const userMenu = document.querySelector('.user-dropdown-menu');
        if (userMenu) userMenu.classList.add('hidden');
        
        const infoRaw = localStorage.getItem('loggedUserInfo');
        if (!infoRaw) { alert('Chưa đăng nhập'); return; }
        try {
          const info = JSON.parse(infoRaw);
          if (info && info.MaCaNhan && window.editUser) {
            window.editUser(info.MaCaNhan);
          } else {
            alert('Không xác định được tài khoản hiện tại');
          }
        } catch { alert('Lỗi dữ liệu người dùng'); }
      });
    }
    const dpSettingsGeneral = document.getElementById('dropdown-settings-general');
    if (dpSettingsGeneral) {
      dpSettingsGeneral.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close dropdown
        const userMenu = document.querySelector('.user-dropdown-menu');
        if (userMenu) userMenu.classList.add('hidden');
        
        // Switch to system section
        document.querySelectorAll('.section-content').forEach(s => s.classList.add('hidden'));
        const sys = document.getElementById('system');
        if (sys) { 
          sys.classList.remove('hidden');
          // Update sidebar active state
          document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
          document.querySelector('[data-section="system"]')?.classList.add('active');
          // Update breadcrumb
          document.getElementById('current-section').textContent = 'Cấu hình';
          document.getElementById('current-page').textContent = 'Cài đặt chung';
        }
      });
    }
    const dpSettingsPoints = document.getElementById('dropdown-settings-points');
    if (dpSettingsPoints) {
      dpSettingsPoints.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close dropdown
        const userMenu = document.querySelector('.user-dropdown-menu');
        if (userMenu) userMenu.classList.add('hidden');
        
        // Switch to system section
        document.querySelectorAll('.section-content').forEach(s => s.classList.add('hidden'));
        const sys = document.getElementById('system');
        if (sys) { 
          sys.classList.remove('hidden');
          // Update sidebar active state
          document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
          document.querySelector('[data-section="system"]')?.classList.add('active');
          // Update breadcrumb
          document.getElementById('current-section').textContent = 'Cấu hình';
          document.getElementById('current-page').textContent = 'Cài đặt điểm';
        }
      });
    }
    const dpSettingsCriteria = document.getElementById('dropdown-settings-criteria');
    if (dpSettingsCriteria) {
      dpSettingsCriteria.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close dropdown
        const userMenu = document.querySelector('.user-dropdown-menu');
        if (userMenu) userMenu.classList.add('hidden');
        
        // Switch to system section
        document.querySelectorAll('.section-content').forEach(s => s.classList.add('hidden'));
        const sys = document.getElementById('system');
        if (sys) { 
          sys.classList.remove('hidden');
          // Update sidebar active state
          document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
          document.querySelector('[data-section="system"]')?.classList.add('active');
          // Update breadcrumb
          document.getElementById('current-section').textContent = 'Cấu hình';
          document.getElementById('current-page').textContent = 'Tiêu chí đánh giá';
        }
      });
    }

    // Users search controls
    const userSearchBtn = document.getElementById("user-search-btn");
    const userSearchInput = document.getElementById("user-search-input");
    if (userSearchBtn && userSearchInput) {
      userSearchBtn.addEventListener("click", () => loadUsers(userSearchInput.value));
      userSearchInput.addEventListener("keydown", (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          loadUsers(userSearchInput.value);
        }
      });
    }

    // Save general settings
    const saveGeneralBtn = document.getElementById("save-general-settings");
    if (saveGeneralBtn) {
      saveGeneralBtn.addEventListener("click", async () => {
        const schoolName = document.getElementById("school-name").value;
        const currentYear = parseInt(document.getElementById("current-year").value, 10);
        const currentSemester = parseInt(document.getElementById("current-semester").value, 10);
        const semesterEndDate = document.getElementById("semester-end-date").value;
        const autoPointStatus = document.querySelector('input[name="auto-point-status"]:checked').value;
        const autoPointEnabled = autoPointStatus === 'enabled';

        try {
          const resp = await fetch(`${API_BASE}/api/settings/system`, withUserHeader({
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              SchoolName: schoolName, 
              CurrentYear: currentYear, 
              CurrentSemester: currentSemester,
              SemesterEndDate: semesterEndDate ? new Date(semesterEndDate) : null,
              AutoPointEnabled: autoPointEnabled
            })
          }));

          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${resp.status}`);
          }

          alert("Lưu cài đặt chung thành công! Các thao tác lưu điểm sẽ dùng năm/kì này nếu bạn không nhập.");
        } catch (error) {
          console.error("Error saving general settings:", error);
          alert("Lỗi lưu cài đặt: " + error.message);
        }
      });
    }

    // Save point settings
    const savePointBtn = document.getElementById("save-point-settings");
    if (savePointBtn) {
      savePointBtn.addEventListener("click", async () => {
        const maxPoints = parseInt(document.getElementById("max-points").value, 10);
        const minPoints = parseInt(document.getElementById("min-points").value, 10);
        const excellentPoints = parseInt(document.getElementById("excellent-points").value, 10);
        const goodPoints = parseInt(document.getElementById("good-points").value, 10);

        if (isNaN(maxPoints) || isNaN(minPoints) || isNaN(excellentPoints) || isNaN(goodPoints)) {
          alert("Vui lòng nhập đầy đủ các giá trị điểm hợp lệ");
          return;
        }

        try {
          const resp = await fetch(`${API_BASE}/api/settings/points`, withUserHeader({
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              MaxPoints: maxPoints, 
              MinPoints: minPoints, 
              ExcellentPoints: excellentPoints, 
              GoodPoints: goodPoints 
            })
          }));
          
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${resp.status}`);
          }
          
          alert("Lưu cài đặt điểm thành công!");
        } catch (error) {
          console.error("Error saving point settings:", error);
          alert("Lỗi lưu cài đặt: " + error.message);
        }
      });
    }

    // Notifications: open on hover
    const notiContainer = document.querySelector('.notifications-container');
    const notificationsMenu = document.getElementById("notifications-menu");
    if (notiContainer && notificationsMenu) {
      notiContainer.addEventListener('mouseenter', () => notificationsMenu.classList.remove('hidden'));
      notiContainer.addEventListener('mouseleave', () => notificationsMenu.classList.add('hidden'));
    }

    // User dropdown: toggle on click
    const userDropdown = document.querySelector('.user-avatar-dropdown');
    const userMenu = document.querySelector('.user-dropdown-menu');
    if (userDropdown && userMenu) {
      userDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu.classList.toggle('hidden');
      });
      // Close dropdown when clicking outside, but not on menu items
      document.addEventListener('click', (e) => {
        if (!userDropdown.contains(e.target) && !userMenu.contains(e.target)) {
          userMenu.classList.add('hidden');
        }
      });
    }

    // Filter logs
    const filterLogsBtn = document.getElementById("filter-logs");
    if (filterLogsBtn) {
      filterLogsBtn.addEventListener("click", loadLogs);
    }

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
        
        // Load year options for report form
        const reportYear = document.getElementById("report-year");
        if (reportYear) {
          const currentYear = new Date().getFullYear();
          reportYear.innerHTML = '<option value="">Tất cả năm học</option>' +
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
    if (!checkAdminAccess()) return; // Kiểm tra quyền truy cập trước khi load các phần khác
    initSidebar();
    initTabs();
    initEventListeners();
    initFilterTabs(); // Initialize filter tabs
    initSystemConfig();
    loadFilterData();
    loadDashboardStats();
    // Load settings and hydrate defaults on UI if available
    (async () => {
      try {
        const s = await fetch(`${API_BASE}/api/settings/system`);
        if (s.ok) {
          const set = await s.json();
          if (set.SchoolName) document.getElementById("school-name").value = set.SchoolName;
          if (set.CurrentYear) document.getElementById("current-year").value = set.CurrentYear;
          if (set.CurrentSemester) document.getElementById("current-semester").value = set.CurrentSemester;
          
          // Load semester end date
          if (set.SemesterEndDate) {
            const endDate = new Date(set.SemesterEndDate);
            const localDateTime = new Date(endDate.getTime() - endDate.getTimezoneOffset() * 60000);
            document.getElementById("semester-end-date").value = localDateTime.toISOString().slice(0, 16);
          }
          
          // Load auto point status
          const autoPointEnabled = set.AutoPointEnabled;
          const enabledRadio = document.querySelector('input[name="auto-point-status"][value="enabled"]');
          const disabledRadio = document.querySelector('input[name="auto-point-status"][value="disabled"]');
          if (autoPointEnabled) {
            enabledRadio.checked = true;
          } else {
            disabledRadio.checked = true;
          }
        }
      } catch {}
    })();
    loadUsers();
    loadFaculties();
    loadClasses();
    loadActivities();
    loadLogs();
  }

  // NEW SIMPLIFIED EDIT USER FUNCTION
  window.editUser = async function editUser(maCaNhan) {
    console.log('=== EDIT USER START ===', maCaNhan);
    console.log('API_BASE:', API_BASE);
    
    // Lấy các elements trước
    const modal = document.getElementById("user-modal");
    const form = document.getElementById("user-form");
    
    console.log('Modal found:', !!modal);
    console.log('Form found:', !!form);
    
    if (!modal) {
      alert('Không tìm thấy modal user-modal');
      return;
    }
    
    if (!form) {
      alert('Không tìm thấy form user-form');
      return;
    }
    
    
    const modalTitle = modal.querySelector("h3");
    console.log('Modal title found:', !!modalTitle);
    
    // Hiện cả 2 tab khi sửa người dùng
    const tabDetail = document.getElementById("tab-detail");
    const tabDetailContent = document.getElementById("tab-detail-content");
    const tabBasic = document.getElementById("tab-basic");
    const tabBasicContent = document.getElementById("tab-basic-content");
    
    if (tabDetail) tabDetail.style.display = 'block';
    
    // Đảm bảo tab cơ bản được hiển thị mặc định
    if (tabBasic) {
      tabBasic.classList.add("active");
      tabBasic.classList.remove("inactive");
    }
    if (tabBasicContent) {
      tabBasicContent.classList.add("active");
      tabBasicContent.classList.remove("hidden");
    }
    
    // Tab chi tiết inactive ban đầu
    if (tabDetail) {
      tabDetail.classList.add("inactive");
      tabDetail.classList.remove("active");
    }
    if (tabDetailContent) {
      tabDetailContent.classList.remove("active");
      tabDetailContent.classList.add("hidden");
    }
    
    // Thêm event listener cho tab switching
    if (tabDetail && tabDetailContent) {
      tabDetail.addEventListener('click', () => {
        // Ẩn tab cơ bản
        const tabBasic = document.getElementById('tab-basic');
        const tabBasicContent = document.getElementById('tab-basic-content');
        
        if (tabBasic) {
          tabBasic.classList.remove('active');
          tabBasic.classList.add('inactive');
        }
        
        // Hiện tab chi tiết
        tabDetail.classList.remove('inactive');
        tabDetail.classList.add('active');
        
        // Ẩn content cơ bản
        if (tabBasicContent) {
          tabBasicContent.classList.add('hidden');
          tabBasicContent.classList.remove('active');
        }
        
        // Hiện content chi tiết
        if (tabDetailContent) {
          tabDetailContent.classList.remove('hidden');
          tabDetailContent.classList.add('active');
          console.log('Tab detail content shown');
        }
      });
      
      // Thêm event listener cho tab cơ bản
      const tabBasic = document.getElementById('tab-basic');
      const tabBasicContent = document.getElementById('tab-basic-content');
      
      if (tabBasic && tabBasicContent) {
        tabBasic.addEventListener('click', () => {
          // Ẩn tab chi tiết
          tabDetail.classList.remove('active');
          tabDetail.classList.add('inactive');
          
          // Hiện tab cơ bản
          tabBasic.classList.remove('inactive');
          tabBasic.classList.add('active');
          
          // Ẩn content chi tiết
          if (tabDetailContent) {
            tabDetailContent.classList.add('hidden');
            tabDetailContent.classList.remove('active');
          }
          
          // Hiện content cơ bản
          if (tabBasicContent) {
            tabBasicContent.classList.remove('hidden');
            tabBasicContent.classList.add('active');
          }
        });
      }
    }
    
    // Load dữ liệu cho tab chi tiết (khoa, lớp, khóa học)
    console.log('Loading edit detail data...');
    await loadEditDetailData();
    console.log('Edit detail data loaded');
    
    // Lấy thông tin người dùng trước
    let userData = null;
    try {
      console.log('Fetching user details...');
      const response = await fetch(`${API_BASE}/api/users/${maCaNhan}/details`, withUserHeader({}));
      console.log('Response status:', response.status);
      if (response.ok) {
        userData = await response.json();
        console.log('User data loaded:', userData);
      } else {
        console.error('Failed to load user details:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error response:', errorText);
      }
    } catch (error) {
      console.error('Error loading user details:', error);
    }
    
    if (!userData) {
      alert('Không thể tải thông tin người dùng');
      return;
    }
    
    // Thay đổi title
    modalTitle.textContent = "Chỉnh sửa người dùng";
    
    // Fill dữ liệu chi tiết dựa trên chức vụ
    console.log('Filling edit detail form...');
    await fillEditDetailForm(maCaNhan, userData);
    console.log('Edit detail form filled');
    
    // Load danh sách quyền trước
    try {
      const rolesResponse = await fetch(`${API_BASE}/api/roles`, withUserHeader({}));
      if (rolesResponse.ok) {
        const roles = await rolesResponse.json();
        const roleSelect = document.getElementById("u-maqt");
        if (roleSelect) {
          roleSelect.innerHTML = '<option value="">Chọn quyền</option>';
          roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.MaQT;
            option.textContent = role.TenQT;
            roleSelect.appendChild(option);
          });
          console.log('Roles loaded:', roles);
        }
      }
    } catch (error) {
      console.error('Error loading roles:', error);
    }
    
    
    // Setup nút Hủy cho edit
    const cancelBtn = document.getElementById("user-cancel");
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        modal.classList.add("hidden");
        // Reset về tab cơ bản
        if (tabBasic) {
          tabBasic.classList.add("active");
          tabBasic.classList.remove("inactive");
        }
        if (tabBasicContent) {
          tabBasicContent.classList.add("active");
          tabBasicContent.classList.remove("hidden");
        }
        if (tabDetail) {
          tabDetail.classList.add("inactive");
          tabDetail.classList.remove("active");
        }
        if (tabDetailContent) {
          tabDetailContent.classList.add("hidden");
          tabDetailContent.classList.remove("active");
        }
        form.reset();
      };
    }
    
    // Setup nút Hủy cho thông tin chi tiết - delay để đảm bảo modal đã hiển thị
    setTimeout(() => {
      const detailCancelBtn = document.getElementById("edit-detail-cancel");
      console.log('Detail cancel button found:', !!detailCancelBtn);
      if (detailCancelBtn) {
        detailCancelBtn.onclick = () => {
          console.log('Detail cancel button clicked');
          modal.classList.add("hidden");
          // Reset về tab cơ bản
          if (tabBasic) {
            tabBasic.classList.add("active");
            tabBasic.classList.remove("inactive");
          }
          if (tabBasicContent) {
            tabBasicContent.classList.add("active");
            tabBasicContent.classList.remove("hidden");
          }
          if (tabDetail) {
            tabDetail.classList.add("inactive");
            tabDetail.classList.remove("active");
          }
          if (tabDetailContent) {
            tabDetailContent.classList.add("hidden");
            tabDetailContent.classList.remove("active");
          }
          form.reset();
        };
      } else {
        console.warn('Detail cancel button not found!');
      }
    }, 100);
    
    // Setup nút xem mật khẩu cho edit
    const togglePasswordBtn = document.getElementById("toggle-password");
    const passwordInput = document.getElementById("u-matkhau");
    const eyeOpen = document.getElementById("eye-open");
    const eyeClosed = document.getElementById("eye-closed");
    
    if (togglePasswordBtn && passwordInput && eyeOpen && eyeClosed) {
      togglePasswordBtn.onclick = () => {
        if (passwordInput.type === "password") {
          passwordInput.type = "text";
          eyeOpen.classList.add("hidden");
          eyeClosed.classList.remove("hidden");
        } else {
          passwordInput.type = "password";
          eyeOpen.classList.remove("hidden");
          eyeClosed.classList.add("hidden");
        }
      };
    }

    // Hiển thị modal
    modal.classList.remove("hidden");
    console.log('Modal classes after show:', modal.className);
    console.log('Modal is hidden:', modal.classList.contains('hidden'));
    
    // Đợi một chút rồi fill dữ liệu
    setTimeout(() => {
      console.log('Filling form...');
      
      // Fill dữ liệu trực tiếp
      const fields = {
        'u-macanhan': userData.maCaNhan || '',
        'u-tentk': userData.tenTK || '',
        'u-tennguoidung': userData.tenNguoiDung || '',
        'u-chucvu': userData.chucVu || '',
        'u-matkhau': userData.matKhau || ''
      };
      
      Object.entries(fields).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) {
          field.value = value;
          console.log(`Set ${id} to:`, value);
        }
      });
      
      // Chọn quyền
      const roleSelect = document.getElementById("u-maqt");
      if (roleSelect && userData.MaQT) {
        roleSelect.value = userData.MaQT;
        roleSelect.dispatchEvent(new Event('change'));
        console.log('Role selected:', userData.MaQT);
      }
      
      // Thêm event listener để tự động fill chức vụ khi chọn quyền
      roleSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption.value) {
          const tenQT = selectedOption.textContent;
          document.getElementById("u-chucvu").value = tenQT || '';
          console.log('Chức vụ auto-filled:', tenQT);
        }
      });
      
      console.log('Form filled successfully');
      
      // Gán form submit handler
      form.onsubmit = async (e) => {
        e.preventDefault();
        console.log('Basic form submitted');
        
        const payload = {
          TenTK: document.getElementById("u-tentk").value.trim(),
          TenNguoiDung: document.getElementById("u-tennguoidung").value.trim(),
          ChucVu: document.getElementById("u-chucvu").value.trim(),
          MaQT: document.getElementById("u-maqt").value,
          MatKhau: document.getElementById("u-matkhau").value
        };
        
        try {
          const resp = await fetch(`${API_BASE}/api/users/${maCaNhan}`, withUserHeader({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }));
          
          if (resp.ok) {
            alert('Cập nhật người dùng thành công');
            modal.classList.add("hidden");
            loadUsers();
          } else {
            const err = await resp.json().catch(() => ({}));
            alert('Lỗi cập nhật: ' + (err.message || 'Unknown error'));
          }
        } catch (e) {
          alert('Lỗi cập nhật người dùng: ' + e.message);
        }
      };
      
      // Gán form submit handler cho tab chi tiết
      const detailForm = document.getElementById("user-detail-form");
      if (detailForm) {
        detailForm.onsubmit = async (e) => {
          e.preventDefault();
          await submitEditDetailInfo(maCaNhan, userData.chucVu);
        };
      }
      
      // Gán close handlers
      const closeBtn = document.getElementById("user-modal-close");
      const cancelBtn = document.getElementById("user-cancel");
      
      const close = () => {
        modal.classList.add("hidden");
        form.reset();
        modalTitle.textContent = "Thêm người dùng mới";
      };
      
      closeBtn.onclick = close;
      cancelBtn.onclick = close;
      
    }, 100);
  };

  // Start the application
  try {
  init();
  } catch (error) {
    console.error('Error initializing application:', error);
  }
});

// Global modal functions
window.closeModal = () => {
  document.getElementById("modal").classList.add("hidden");
};

// Lock/Unlock user functions
async function lockUser(maCaNhan) {
  if (!confirm('Bạn có chắc chắn muốn khóa tài khoản này?')) return;
  
  const button = document.querySelector(`button[onclick="lockUser('${maCaNhan}')"]`);
  const originalContent = button.innerHTML;
  
  try {
    // Show loading state
    button.classList.add('loading');
    button.innerHTML = '<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Đang khóa...</span>';
    button.disabled = true;
    
    const response = await fetch(`${API_BASE}/api/users/${maCaNhan}/lock`, withUserHeader({
      method: 'POST'
    }));
    
    if (response.ok) {
      const result = await response.json();
      // Show success state
      button.classList.remove('loading');
      button.classList.add('success');
      button.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><span>Đã khóa</span>';
      
      setTimeout(() => {
        loadUsers(); // Reload the users table
      }, 1000);
    } else {
      const error = await response.json();
      // Show error state
      button.classList.remove('loading');
      button.classList.add('error');
      button.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg><span>Lỗi</span>';
      
      setTimeout(() => {
        button.classList.remove('error');
        button.innerHTML = originalContent;
        button.disabled = false;
        alert('Lỗi: ' + (error.message || 'Không thể khóa tài khoản'));
      }, 2000);
    }
  } catch (error) {
    // Show error state
    button.classList.remove('loading');
    button.classList.add('error');
    button.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg><span>Lỗi</span>';
    
    setTimeout(() => {
      button.classList.remove('error');
      button.innerHTML = originalContent;
      button.disabled = false;
      alert('Lỗi: ' + error.message);
    }, 2000);
  }
}

async function unlockUser(maCaNhan) {
  if (!confirm('Bạn có chắc chắn muốn mở khóa tài khoản này?')) return;
  
  const button = document.querySelector(`button[onclick="unlockUser('${maCaNhan}')"]`);
  const originalContent = button.innerHTML;
  
  try {
    // Show loading state
    button.classList.add('loading');
    button.innerHTML = '<svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Đang mở khóa...</span>';
    button.disabled = true;
    
    const response = await fetch(`${API_BASE}/api/users/${maCaNhan}/unlock`, withUserHeader({
      method: 'POST'
    }));
    
    if (response.ok) {
      const result = await response.json();
      // Show success state
      button.classList.remove('loading');
      button.classList.add('success');
      button.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><span>Đã mở khóa</span>';
      
      setTimeout(() => {
        loadUsers(); // Reload the users table
      }, 1000);
    } else {
      const error = await response.json();
      // Show error state
      button.classList.remove('loading');
      button.classList.add('error');
      button.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg><span>Lỗi</span>';
      
      setTimeout(() => {
        button.classList.remove('error');
        button.innerHTML = originalContent;
        button.disabled = false;
        alert('Lỗi: ' + (error.message || 'Không thể mở khóa tài khoản'));
      }, 2000);
    }
  } catch (error) {
    // Show error state
    button.classList.remove('loading');
    button.classList.add('error');
    button.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg><span>Lỗi</span>';
    
    setTimeout(() => {
      button.classList.remove('error');
      button.innerHTML = originalContent;
      button.disabled = false;
      alert('Lỗi: ' + error.message);
    }, 2000);
  }
}

// Global wrapper for loadUsers
// Load dữ liệu cho tab chi tiết (khoa, lớp, khóa học)
async function loadEditDetailData() {
  try {
    const response = await fetch(`${API_BASE}/api/preload`);
    if (response.ok) {
      const data = await response.json();
      
      // Load khoa
      const khoaSelect = document.getElementById('edit-info-khoa');
      if (khoaSelect) {
        khoaSelect.innerHTML = '<option value="">Chọn khoa</option>' +
          data.khoa.map(k => `<option value="${k.MaKH}">${k.TenKhoa}</option>`).join('');
      }
      
      // Load lớp - hiển thị tất cả lớp ban đầu
      const lopSelect = document.getElementById('edit-info-lop');
      const lopCVSelect = document.getElementById('edit-info-lopcv');
      if (lopSelect && lopCVSelect) {
        const lopOptions = '<option value="">Chọn lớp</option>' +
          data.lop.map(l => `<option value="${l.MaLop}" data-makh="${l.MaKH}">${l.TenLop} - ${l.TenKhoa || 'N/A'}</option>`).join('');
        
        lopSelect.innerHTML = lopOptions;
        lopCVSelect.innerHTML = lopOptions;
        
        // Setup khoa change event để lọc lớp
        setupKhoaChangeEvent();
        
        // Setup tìm kiếm lớp trực tiếp trên dropdown
        setupDropdownSearch();
      }
      
      // Load khóa học
      const khoaHocSelect = document.getElementById('edit-info-khoahoc');
      if (khoaHocSelect) {
        khoaHocSelect.innerHTML = '<option value="">Chọn khóa học</option>' +
          (data.khoaHoc || []).map(k => `<option value="${k.MaKhoa}">${k.MaKhoa} - ${k.TenKhoa}</option>`).join('');
      }
      
    }
  } catch (error) {
    console.error('Error loading edit detail data:', error);
  }
}

// Setup khoa change event để lọc lớp
function setupKhoaChangeEvent() {
  const khoaSelect = document.getElementById('edit-info-khoa');
  const lopSelect = document.getElementById('edit-info-lop');
  const lopCVSelect = document.getElementById('edit-info-lopcv');
  
  if (khoaSelect) {
    khoaSelect.addEventListener('change', async () => {
      const selectedKhoa = khoaSelect.value;
      console.log('Khoa selected:', selectedKhoa);
      
      if (selectedKhoa) {
        // Load lớp theo khoa từ API
        try {
          const response = await fetch(`${API_BASE}/api/lop/by-khoa/${selectedKhoa}`);
          if (response.ok) {
            const lopData = await response.json();
            console.log('Lớp data loaded:', lopData);
            console.log('First item structure:', lopData[0]);
            
            // Update lớp cho sinh viên
            if (lopSelect) {
              const lopOptions = '<option value="">Chọn lớp</option>' +
                lopData.map(l => `<option value="${l.maLop}">${l.tenLop}</option>`).join('');
              lopSelect.innerHTML = lopOptions;
            }
            
            // Update lớp chủ nhiệm cho giảng viên
            if (lopCVSelect) {
              const lopCVOptions = '<option value="">Chọn lớp chủ nhiệm</option>' +
                lopData.map(l => `<option value="${l.maLop}">${l.tenLop}</option>`).join('');
              lopCVSelect.innerHTML = lopCVOptions;
            }
            
          }
        } catch (error) {
          console.error('Error loading lớp by khoa:', error);
        }
      } else {
        // Reset về tất cả lớp từ preload data
        loadAllLop();
      }
    });
  }
}

// Load tất cả lớp từ preload data
async function loadAllLop() {
  try {
    const response = await fetch(`${API_BASE}/api/preload`);
    if (response.ok) {
      const data = await response.json();
      
      const lopSelect = document.getElementById('edit-info-lop');
      const lopCVSelect = document.getElementById('edit-info-lopcv');
      
      if (lopSelect && lopCVSelect) {
        const lopOptions = '<option value="">Chọn lớp</option>' +
          data.lop.map(l => `<option value="${l.MaLop}" data-makh="${l.MaKH}">${l.TenLop} - ${l.TenKhoa || 'N/A'}</option>`).join('');
        
        lopSelect.innerHTML = lopOptions;
        lopCVSelect.innerHTML = lopOptions;
        
        
        console.log('All lớp loaded:', data.lop.length, 'items');
      }
    }
  } catch (error) {
    console.error('Error loading all lớp:', error);
  }
}

// Setup tìm kiếm trực tiếp trên dropdown
function setupDropdownSearch() {
  setupSearchableDropdown('edit-info-lop', 'edit-info-lop-input', 'edit-info-lop-dropdown');
  setupSearchableDropdown('edit-info-lopcv', 'edit-info-lopcv-input', 'edit-info-lopcv-dropdown');
}

// Tạo searchable dropdown
function setupSearchableDropdown(selectId, inputId, dropdownId) {
  const select = document.getElementById(selectId);
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  
  if (!select || !input || !dropdown) return;
  
  let allOptions = [];
  let filteredOptions = [];
  
  // Lưu tất cả options
  function saveAllOptions() {
    allOptions = Array.from(select.options).map(option => ({
      value: option.value,
      text: option.textContent,
      element: option
    }));
    filteredOptions = [...allOptions];
  }
  
  // Cập nhật dropdown hiển thị
  function updateDropdown(searchTerm = '') {
    dropdown.innerHTML = '';
    
    if (filteredOptions.length === 0) {
      const div = document.createElement('div');
      div.className = 'px-3 py-2 text-gray-500 text-sm text-center';
      div.textContent = 'Không tìm thấy lớp nào';
      dropdown.appendChild(div);
      return;
    }
    
    filteredOptions.forEach((option, index) => {
      if (option.value === '') return; // Bỏ qua option mặc định
      
      const div = document.createElement('div');
      div.className = 'px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-b-0';
      div.dataset.value = option.value;
      
      // Highlight từ khóa tìm kiếm
      if (searchTerm && searchTerm.trim()) {
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const highlightedText = option.text.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
        div.innerHTML = highlightedText;
      } else {
        div.textContent = option.text;
      }
      
      div.addEventListener('click', () => {
        input.value = option.text;
        select.value = option.value;
        dropdown.classList.add('hidden');
        input.blur();
      });
      
      div.addEventListener('mouseenter', () => {
        div.classList.add('bg-blue-50');
      });
      
      div.addEventListener('mouseleave', () => {
        div.classList.remove('bg-blue-50');
      });
      
      dropdown.appendChild(div);
    });
  }
  
  // Tìm kiếm
  function search(term) {
    if (!term) {
      filteredOptions = [...allOptions];
    } else {
      const searchTerm = term.toLowerCase().trim();
      filteredOptions = allOptions.filter(option => {
        const text = option.text.toLowerCase();
        // Tìm kiếm theo nhiều cách:
        // 1. Chứa từ khóa
        // 2. Bắt đầu bằng từ khóa (ưu tiên cao hơn)
        return text.includes(searchTerm);
      }).sort((a, b) => {
        const aText = a.text.toLowerCase();
        const bText = b.text.toLowerCase();
        const searchTerm = term.toLowerCase();
        
        // Ưu tiên các kết quả bắt đầu bằng từ khóa
        const aStartsWith = aText.startsWith(searchTerm);
        const bStartsWith = bText.startsWith(searchTerm);
        
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        
        // Sau đó sắp xếp theo thứ tự alphabet
        return aText.localeCompare(bText);
      });
    }
    updateDropdown(term);
  }
  
  // Event listeners
  input.addEventListener('focus', () => {
    saveAllOptions();
    search(input.value);
    dropdown.classList.remove('hidden');
  });
  
  // Tìm kiếm real-time ngay lập tức
  input.addEventListener('input', (e) => {
    search(e.target.value);
  });
  
  // Tìm kiếm khi paste
  input.addEventListener('paste', (e) => {
    setTimeout(() => {
      search(e.target.value);
    }, 10);
  });
  
  input.addEventListener('blur', (e) => {
    // Delay để cho phép click vào dropdown
    setTimeout(() => {
      dropdown.classList.add('hidden');
    }, 200);
  });
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
      input.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Focus vào option đầu tiên
      const firstOption = dropdown.querySelector('div');
      if (firstOption) firstOption.focus();
    }
  });
  
  // Click outside để đóng dropdown
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

// Fill dữ liệu chi tiết dựa trên chức vụ
async function fillEditDetailForm(maCaNhan, userData) {
  // Fill basic info
  const macanhanField = document.getElementById('edit-info-macanhan');
  const tennguoidungField = document.getElementById('edit-info-tennguoidung');
  
  if (macanhanField) macanhanField.value = maCaNhan;
  if (tennguoidungField) tennguoidungField.value = userData.tenNguoiDung || userData.TenNguoiDung || '';
  
  // Determine user type and show appropriate fields
  const chucVu = userData.chucVu || userData.ChucVu || '';
  console.log('User chucVu:', chucVu);
  console.log('User data keys:', Object.keys(userData));
  
  const giangvienFields = document.getElementById('edit-giangvien-fields');
  const sinhvienFields = document.getElementById('edit-sinhvien-fields');
  
  console.log('Giangvien fields element:', !!giangvienFields);
  console.log('Sinhvien fields element:', !!sinhvienFields);
  
  if (chucVu.toLowerCase().includes('giảng viên')) {
    console.log('Processing as giảng viên');
    if (giangvienFields) giangvienFields.classList.remove('hidden');
    if (sinhvienFields) sinhvienFields.classList.add('hidden');
    
    // Load existing giangvien data
    try {
      console.log('Fetching giangvien data for:', maCaNhan);
      const response = await fetch(`${API_BASE}/api/giangvien/${maCaNhan}`, withUserHeader({}));
      console.log('Giangvien API response status:', response.status);
      
      if (response.ok) {
        const gvData = await response.json();
        console.log('Giangvien data received:', gvData);
        
        const fields = {
          'edit-info-ten': gvData.tenGV || '',
          'edit-info-sdt': gvData.sdt || '',
          'edit-info-email': gvData.email || '',
          'edit-info-khoa': gvData.maKH || '',
          'edit-info-lopcv': gvData.lopCV || '',
          'edit-info-diachi-gv': gvData.diaChi || ''
        };
        
        console.log('Fields to fill:', fields);
        
        Object.entries(fields).forEach(([id, value]) => {
          const field = document.getElementById(id);
          if (field) {
            field.value = value;
            console.log(`Filled ${id} with value:`, value);
          } else {
            console.warn(`Field not found: ${id}`);
          }
        });
        
        // Trigger change event for khoa to filter lop options
        const khoaSelect = document.getElementById('edit-info-khoa');
        if (khoaSelect && gvData.maKH) {
          console.log('Triggering change event for khoa select');
          khoaSelect.dispatchEvent(new Event('change'));
        }
      } else {
        console.error('Giangvien API error:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Error loading giangvien data:', error);
    }
  } else if (chucVu.toLowerCase().includes('sinh viên')) {
    if (giangvienFields) giangvienFields.classList.add('hidden');
    if (sinhvienFields) sinhvienFields.classList.remove('hidden');
    
    // Load existing sinhvien data
    try {
      const response = await fetch(`${API_BASE}/api/sinhvien/${maCaNhan}`, withUserHeader({}));
      if (response.ok) {
        const svData = await response.json();
        const fields = {
          'edit-info-ten': svData.TenSV || '',
          'edit-info-sdt': svData.SDT || '',
          'edit-info-email': svData.Email || '',
          'edit-info-khoa': svData.MaKH || '',
          'edit-info-lop': svData.MaLop || '',
          'edit-info-khoahoc': svData.MaKhoa || '',
          'edit-info-diachi': svData.DiaChi || '',
          'edit-info-cblop': svData.CBLop || false,
          'edit-info-tvclbkhoa': svData.TVCLBKhoa || false,
          'edit-info-tvclbtruong': svData.TVCLBTruong || false
        };
        
        Object.entries(fields).forEach(([id, value]) => {
          const field = document.getElementById(id);
          if (field) {
            if (field.type === 'checkbox') {
              field.checked = value;
            } else {
              field.value = value;
            }
          }
        });
        
        // Trigger change event for khoa to filter lop options
        const khoaSelect = document.getElementById('edit-info-khoa');
        if (khoaSelect && svData.MaKH) {
          khoaSelect.dispatchEvent(new Event('change'));
        }
      }
    } catch (error) {
      console.error('Error loading sinhvien data:', error);
    }
  } else {
    if (giangvienFields) giangvienFields.classList.add('hidden');
    if (sinhvienFields) sinhvienFields.classList.add('hidden');
  }
}

// Submit dữ liệu chi tiết
async function submitEditDetailInfo(maCaNhan, chucVu) {
  try {
    let endpoint, payload;
    
    if (chucVu?.toLowerCase().includes("giảng viên")) {
      endpoint = `/api/giangvien-detail/${maCaNhan}`;
      payload = {
        MaCaNhan: maCaNhan,
        TenGV: document.getElementById("edit-info-ten").value,
        SDT: document.getElementById("edit-info-sdt").value || null,
        Email: document.getElementById("edit-info-email").value || null,
        MaKH: document.getElementById("edit-info-khoa").value || null,
        LopCV: document.getElementById("edit-info-lopcv").value || null,
        DiaChi: document.getElementById("edit-info-diachi-gv").value || null
      };
    } else if (chucVu?.toLowerCase().includes("sinh viên")) {
      endpoint = `/api/sinhvien-detail/${maCaNhan}`;
      payload = {
        MSSV: maCaNhan,
        TenSV: document.getElementById("edit-info-ten").value,
        SDT: document.getElementById("edit-info-sdt").value || null,
        Email: document.getElementById("edit-info-email").value || null,
        DiaChi: document.getElementById("edit-info-diachi").value || null,
        MaLop: document.getElementById("edit-info-lop").value || null,
        MaKH: document.getElementById("edit-info-khoa").value || null,
        MaKhoa: document.getElementById("edit-info-khoahoc").value || null,
        TVCLBKhoa: document.getElementById("edit-info-tvclbkhoa").checked,
        TVCLBTruong: document.getElementById("edit-info-tvclbtruong").checked,
        CBLop: document.getElementById("edit-info-cblop").checked
      };
    } else {
      alert("Chức vụ này không được hỗ trợ sửa thông tin chi tiết: " + chucVu);
      return;
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, withUserHeader({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
    
    if (response.ok) {
      alert("Cập nhật thông tin chi tiết thành công!");
      document.getElementById("user-modal").classList.add("hidden");
      loadUsers(); // Reload danh sách
    } else {
      const error = await response.json();
      alert(`Lỗi: ${error.error || 'Không thể cập nhật thông tin chi tiết'}`);
    }
  } catch (error) {
    console.error('Error updating detail info:', error);
    alert('Lỗi khi cập nhật thông tin chi tiết');
  }
}

window.loadUsers = (searchTerm) => {
  // This will be set when DOMContentLoaded fires
  if (window._loadUsers) {
    window._loadUsers(searchTerm);
  }
  };

// Global functions for admin management
window.lockUser = lockUser;
window.unlockUser = unlockUser;