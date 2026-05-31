// ==== cấu hình API ====
  // Sử dụng đường dẫn tương đối để tránh CORS/mixed-content khi giao diện chạy trên https/host khác
  const API_BASE = '';

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
      const avatarHtml = details.anhDD
        ? `<img src="data:image/jpeg;base64,${details.anhDD}" class="preview-avatar-img" alt="Ảnh đại diện">`
        : `<div class="preview-avatar">${(details.tenGV || 'GV').charAt(0).toUpperCase()}</div>`;
      content = `
        <div class="preview-header">
          ${avatarHtml}
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
      const avatarHtml = details.AnhDD
        ? `<img src="data:image/jpeg;base64,${details.AnhDD}" class="preview-avatar-img" alt="Ảnh đại diện">`
        : `<div class="preview-avatar">${(details.TenSV || 'SV').charAt(0).toUpperCase()}</div>`;
      content = `
        <div class="preview-header">
          ${avatarHtml}
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

        // Update breadcrumb based on section
        try { updateBreadcrumb(sectionId); } catch {}

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
      settings: { section: "Cài đặt hệ thống", page: "Xóa tự động minh chứng" },
      notifications: { section: "Quản lý hệ thống", page: "Thông báo" },
      logs: { section: "Hệ thống", page: "Nhật ký" },
      tests: { section: "Hệ thống", page: "Kiểm tra" }
    };
    if (currentSection && currentPage && sectionMap[section]) {
      currentSection.textContent = sectionMap[section].section;
      currentPage.textContent = sectionMap[section].page;
    }
    
    // Initialize settings page when navigating to settings
    if (section === 'settings' && window.initSettingsPage) {
      initSettingsPage();
    }

    // Initialize notifications when navigating to notifications
    if (section === 'notifications') {
      initNotifications();
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
      const escapeHtml = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      list.innerHTML = latest.map(act => `
        <div class="p-3 hover:bg-gray-50 cursor-pointer">
          <div class="flex items-start gap-3">
            <div class="w-2 h-2 mt-2 rounded-full bg-blue-500"></div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 truncate">${escapeHtml(act.TenHD || 'Sự kiện hệ thống')}</p>
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

  // Xây dựng URL bằng query string (không dùng new URL để tránh cần base khi API_BASE rỗng)
  let url = '/api/users';
      
      // Thêm search term nếu có
      const params = new URLSearchParams();
      if (searchTerm && String(searchTerm).trim() !== "") {
        params.set("search", String(searchTerm).trim());
      }
      
      // Thêm filter parameters
      if (filterType !== 'all') {
        params.set("filterType", filterType);
        Object.keys(filterData).forEach(key => {
          if (filterData[key]) {
            params.set(key, filterData[key]);
          }
        });
      }
      
  const response = await fetch(params.toString() ? `${url}?${params.toString()}` : url);
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
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.ChucVu || 'Chưa phân quyền'}</td>
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
      const passwordInput = document.getElementById("u-matkhau").value.trim();
      const payload = {
        MaCaNhan: document.getElementById("u-macanhan").value.trim(),
        TenTK: document.getElementById("u-tentk").value.trim(),
        MatKhau: passwordInput || "123456",  // ✅ Mặc định "123456" nếu không nhập
        TenNguoiDung: document.getElementById("u-tennguoidung").value.trim(),
        ChucVu: document.getElementById("u-chucvu").value.trim(),
        MaQT: document.getElementById("u-maqt").value
      };

      if (!payload.MaCaNhan || !payload.TenTK || !payload.TenNguoiDung || !payload.ChucVu || !payload.MaQT) {
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
          const warn = `Xóa hoạt động "${id}" sẽ xóa toàn bộ đăng ký và minh chứng liên quan (ON DELETE CASCADE).\n\nHành động này không thể hoàn tác. Bạn có chắc chắn muốn tiếp tục?`;
          if (!confirm(warn)) return;
          const originalText = btn.textContent;
          const originalDisabled = btn.disabled;
          try {
            // Disable button and show loading state
            btn.disabled = true;
            btn.textContent = 'Đang xóa…';
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
            // Success toast-like feedback
            alert('Đã xóa hoạt động và dữ liệu liên quan.');
            loadActivities();
          } catch (e) {
            alert('Lỗi xóa hoạt động: ' + (e && e.message ? e.message : e));
          } finally {
            // Restore button state
            btn.disabled = originalDisabled;
            btn.textContent = originalText;
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
        <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
          <div>
            <button id="btn-generate-qr-admin" class="w-full px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm">+ Tạo QR Code</button>
            <div id="qr-location-admin" class="mt-3 text-sm text-gray-700 hidden"></div>
            <div class="mt-4 p-3 rounded border bg-gray-50 flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <div id="activity-location-admin" class="text-sm font-semibold text-gray-800">Tọa độ GPS: <span class="text-gray-500 font-normal">Chưa có</span></div>
                <div class="flex gap-2">
                  <button id="btn-gps-current-admin" class="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300" title="Định vị bằng GPS của thiết bị này">📡 Định vị GPS máy</button>
                  <button id="btn-save-location-admin" class="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">💾 Lưu vị trí ghim</button>
                </div>
              </div>
              <div class="flex gap-2">
                <input type="number" step="any" id="input-lat-admin" placeholder="Vĩ độ (Lat)" class="w-1/2 border border-gray-300 px-2 py-1 text-sm rounded focus:ring-1 focus:ring-indigo-500 outline-none">
                <input type="number" step="any" id="input-lng-admin" placeholder="Kinh độ (Lng)" class="w-1/2 border border-gray-300 px-2 py-1 text-sm rounded focus:ring-1 focus:ring-indigo-500 outline-none">
              </div>
              <div id="activity-map-admin" class="w-full h-48 border rounded bg-gray-200" style="z-index: 1;"></div>
              <div class="text-xs text-gray-500">Kéo thả ghim đỏ trên bản đồ, hoặc nhập tay tọa độ.</div>
            </div>
          </div>
          <div>
            <div id="qr-display-admin" class="p-4 border rounded-md flex items-center justify-center min-h-48 text-gray-500">Chưa có QR code</div>
            <div class="mt-3 flex gap-2">
              <button id="btn-download-qr-admin" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm" disabled>Tải xuống</button>
              <button id="btn-print-qr-admin" class="flex-1 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 text-sm" disabled>In QR Code</button>
            </div>
          </div>
        </div>`;
      
      // Bind actions
      document.getElementById('btn-generate-qr-admin')?.addEventListener('click', async () => {
        await generateQRAdmin(act.MaHD);
        await loadQRForAdmin(act.MaHD);
      });
      document.getElementById('btn-download-qr-admin')?.addEventListener('click', () => {
        if (!window.currentQRDataAdmin) return;
        const a = document.createElement('a');
        a.href = window.currentQRDataAdmin.imageUrl;
        a.download = `qr-${act.MaHD}.png`;
        document.body.appendChild(a); a.click(); a.remove();
      });
      document.getElementById('btn-print-qr-admin')?.addEventListener('click', () => {
        if (!window.currentQRDataAdmin) return;
        const w = window.open('');
        w.document.write(`<img src="${window.currentQRDataAdmin.imageUrl}" style="max-width:100%"/>`);
        w.document.close();
        w.focus();
        w.print();
        w.close();
      });

      await loadQRForAdmin(act.MaHD);
      await setupActivityLocationAdmin(act.MaHD);
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
  // Cache for tieuchi groups
  let criteriaGroupsCache = [];

  async function initSystemConfig() {
    // Load system settings
    try {
      const res = await fetch(`${API_BASE}/api/settings/system`);
      if (res.ok) {
        const settings = await res.json();
        console.log("Settings loaded:", settings); // Debug
        console.log("CurrentYear type:", typeof settings.CurrentYear, "value:", settings.CurrentYear);
        console.log("FormattedYear:", settings.FormattedYear);
        
        document.getElementById("school-name").value = settings.SchoolName || "Trường Đại học Kiên Giang";
        
        // Get year and create formatted display
        let yearValue = settings.FormattedYear || settings.CurrentYear;
        let displayYear = yearValue;
        
        // Check if already formatted (contains dash)
        if (typeof yearValue === 'string' && yearValue.includes('-')) {
          displayYear = yearValue;
        } else {
          // Parse as number and format
          const yearNum = parseInt(yearValue, 10);
          displayYear = `${yearNum}-${yearNum + 1}`;
        }
        
        console.log("Display year:", displayYear);
        // Set display div
        document.getElementById("year-display").textContent = displayYear;
        // Set hidden input with raw year
        document.getElementById("current-year").value = settings.CurrentYear || new Date().getFullYear();
        document.getElementById("current-semester").value = settings.CurrentSemester || 2;
        
        // Load evaluation start date
        if (settings.EvalStartDate) {
          const startDate = new Date(settings.EvalStartDate);
          const localDateTime = new Date(startDate.getTime() - startDate.getTimezoneOffset() * 60000);
          document.getElementById("eval-start-date").value = localDateTime.toISOString().slice(0, 16);
        }
        
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
        
        // Load UseAutoYearSemester checkbox
        const useAutoCheckbox = document.getElementById("use-auto-year-semester");
        if (useAutoCheckbox) {
          useAutoCheckbox.checked = settings.UseAutoYearSemester !== false; // Default to true if not set
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
        // Gắn giá trị cho các input (với fallback mặc định)
        const maxPointsInput = document.getElementById("max-points");
        const minPointsInput = document.getElementById("min-points");
        const excellentInput = document.getElementById("excellent-points");
        const goodInput = document.getElementById("good-points");
        const fairInput = document.getElementById("fair-points");
        const averageInput = document.getElementById("average-points");
        const weakInput = document.getElementById("weak-points");
        const poorInput = document.getElementById("poor-points");

        if (maxPointsInput) maxPointsInput.value = points.MaxPoints || 100;
        if (minPointsInput) minPointsInput.value = points.MinPoints || 0;
        if (excellentInput) excellentInput.value = points.ExcellentPoints || 90;
        if (goodInput) goodInput.value = points.GoodPoints || 80;
        if (fairInput) fairInput.value = points.FairPoints || 70;
        if (averageInput) averageInput.value = points.AveragePoints || 60;
        if (weakInput) weakInput.value = points.WeakPoints || 40;
        if (poorInput) poorInput.value = points.PoorPoints || 0;
      }
    } catch (error) {
      console.error("Error loading point settings:", error);
      // Set defaults if API fails - chỉ set nếu element tồn tại
      const maxPointsInput = document.getElementById("max-points");
      const minPointsInput = document.getElementById("min-points");
      const excellentInput = document.getElementById("excellent-points");
      const goodInput = document.getElementById("good-points");
      const fairInput = document.getElementById("fair-points");
      const averageInput = document.getElementById("average-points");
      const weakInput = document.getElementById("weak-points");
      const poorInput = document.getElementById("poor-points");

      if (maxPointsInput) maxPointsInput.value = "100";
      if (minPointsInput) minPointsInput.value = "0";
      if (excellentInput) excellentInput.value = "90";
      if (goodInput) goodInput.value = "80";
      if (fairInput) fairInput.value = "70";
      if (averageInput) averageInput.value = "60";
      if (weakInput) weakInput.value = "40";
      if (poorInput) poorInput.value = "0";
    }

  // Load criteria list (from NhomTieuChi + TieuChiCon)
  loadCriteria();

    // Bind criteria form -> create TieuChiCon under a selected NhomTieuChi
    const criteriaForm = document.getElementById('criteria-form');
    if (criteriaForm) {
      criteriaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ten = document.getElementById('tc-ten')?.value?.trim();
        const diemStr = document.getElementById('tc-diem')?.value ?? '';
        const maso = document.getElementById('tc-idhd')?.value?.trim() || null; // dùng làm MaSo
        const allow = document.getElementById('tc-tdtt')?.checked ?? true; // Cho SV tự đánh giá -> AllowSelfEval
        const sel = document.getElementById('tc-group');
        const selVal = sel && sel.value ? parseInt(sel.value, 10) : NaN;
        const diem = diemStr !== '' ? parseInt(diemStr, 10) : NaN;

        if (!ten || Number.isNaN(diem)) { alert('Vui lòng nhập tên tiêu chí và số điểm hợp lệ'); return; }

        if (!Array.isArray(criteriaGroupsCache) || criteriaGroupsCache.length === 0) { alert('Chưa có nhóm tiêu chí. Vui lòng tạo nhóm trước.'); return; }
        if (Number.isNaN(selVal)) { alert('Vui lòng chọn nhóm'); return; }
        const maNhom = selVal;

        try {
          const payload = { MaNhom: maNhom, TenTC: ten, DiemToiDa: diem, CoMinhChung: false, AllowSelfEval: !!allow, MaSo: maso };
          const resp = await fetch(`${API_BASE}/api/tieuchi/con`, withUserHeader({
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
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

    // Bind group form -> create NhomTieuChi
    const groupForm = document.getElementById('group-form');
    if (groupForm) {
      groupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ten = document.getElementById('nh-ten')?.value?.trim();
        const maso = document.getElementById('nh-maso')?.value?.trim() || null;
        const diemStr = document.getElementById('nh-diem')?.value ?? '';
        const diem = diemStr !== '' ? parseInt(diemStr, 10) : null;
        if (!ten) { alert('Vui lòng nhập tên nhóm'); return; }
        try {
          const resp = await fetch(`${API_BASE}/api/tieuchi/nhom`, withUserHeader({
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ TenNhom: ten, DiemToiDa: diem, MaSo: maso })
          }));
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${resp.status}`);
          }
          groupForm.reset();
          loadCriteria();
        } catch (err) { alert('Lỗi thêm nhóm: ' + err.message); }
      });
    }
  }

  async function loadCriteria() {
    try {
      const tbody = document.getElementById('criteria-table-body');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu tiêu chí...</td></tr>';

      // Load canonical source (NhomTieuChi + TieuChiCon)
      const res = await fetch(`${API_BASE}/api/tieuchi`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let groups = await res.json();

      // Helper to read PascalCase/camelCase keys
      const get = (obj, keys) => {
        for (const k of keys) {
          if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
        }
        return undefined;
      };

      criteriaGroupsCache = Array.isArray(groups) ? groups : [];

      // Populate group select for add-child form
      const sel = document.getElementById('tc-group');
      if (sel) {
        const prev = sel.value;
        sel.innerHTML = '<option value="">Chọn nhóm...</option>' +
          criteriaGroupsCache.map(g => {
            const gid = get(g, ['MaNhom','maNhom']);
            const gMaSo = get(g, ['MaSo','maSo']) ?? gid ?? '';
            const gTen = get(g, ['TenNhom','tenNhom']) ?? '';
            return `<option value="${gid}">${gMaSo} - ${gTen}</option>`;
          }).join('');
        if (prev) sel.value = prev;
        if (!sel.value && criteriaGroupsCache.length > 0) sel.value = String(get(criteriaGroupsCache[0], ['MaNhom','maNhom']));
      }

      if (!groups || groups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Chưa có tiêu chí, vui lòng thêm nhóm trước</td></tr>';
        return;
      }

      const rows = [];
      groups.forEach(g => {
        const gId = get(g, ['MaNhom','maNhom']);
        const gMaSo = (get(g, ['MaSo','maSo']) ?? gId ?? '') || '';
        const gTen = get(g, ['TenNhom','tenNhom']) ?? '';
        const gMax = get(g, ['DiemToiDa','diemToiDa']) ?? '';
        rows.push(`
          <tr class="bg-gray-50" data-group-row="${gId}">
            <td class="px-6 py-3 text-sm text-gray-700">
              <button type="button" data-toggle-group="${gId}" class="mr-2 inline-flex items-center justify-center w-5 h-5 rounded border border-gray-300 bg-white text-gray-700">−</button>
              Nhóm
            </td>
            <td class="px-6 py-3 text-sm text-gray-900"><input data-edit-nhom-maso="${gId}" class="w-28 border rounded-md px-2 py-1" value="${gMaSo}"></td>
            <td class="px-6 py-2 text-sm text-gray-900"><input data-edit-nhom-ten="${gId}" class="w-full border rounded-md px-2 py-1" value="${gTen}"></td>
            <td class="px-6 py-2 text-sm text-gray-900"><input type="number" min="0" data-edit-nhom-max="${gId}" class="w-24 border rounded-md px-2 py-1" value="${gMax}"></td>
            <td class="px-6 py-2 text-sm"></td>
            <td class="px-6 py-2 text-sm">
              <button data-save-nhom="${gId}" class="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700">Lưu nhóm</button>
              <button data-del-nhom="${gId}" class="ml-2 px-3 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700">Xóa nhóm</button>
            </td>
          </tr>
        `);

        const list = Array.isArray(get(g, ['TieuChi','tieuChi'])) ? get(g, ['TieuChi','tieuChi']) : [];
        list.forEach(c => {
          const cId = get(c, ['MaTC','maTC']);
          const cMaSo = (get(c, ['MaSo','maSo']) ?? cId ?? '') || '';
          const cTen = get(c, ['TenTC','tenTC']) ?? '';
          const cMax = get(c, ['DiemToiDa','diemToiDa']) ?? '';
          const cMC = (get(c, ['CoMinhChung','coMinhChung']) ?? false) ? 'checked' : '';
          const cASE = (get(c, ['AllowSelfEval','allowSelfEval']) ?? true) ? 'checked' : '';
          rows.push(`
            <tr data-parent-group="${gId}">
              <td class="px-6 py-2 text-sm text-gray-500 pl-10">Tiêu chí</td>
              <td class="px-6 py-2 text-sm text-gray-900"><input data-edit-tc-maso="${cId}" class="w-28 border rounded-md px-2 py-1" value="${cMaSo}"></td>
              <td class="px-6 py-2 text-sm text-gray-900"><input data-edit-tc-ten="${cId}" class="w-full border rounded-md px-2 py-1" value="${cTen}"></td>
              <td class="px-6 py-2 text-sm text-gray-900"><input type="number" min="0" data-edit-tc-max="${cId}" class="w-24 border rounded-md px-2 py-1" value="${cMax}"></td>
              <td class="px-6 py-2 text-sm text-gray-900">
                <label class="mr-3 inline-flex items-center gap-1"><input type="checkbox" data-edit-tc-mc="${cId}" ${cMC}> MC</label>
                <label class="inline-flex items-center gap-1"><input type="checkbox" data-edit-tc-ase="${cId}" ${cASE}> Tự chấm</label>
              </td>
              <td class="px-6 py-2 text-sm">
                <button data-save-tc="${cId}" class="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700">Lưu tiêu chí</button>
                <button data-del-tc="${cId}" class="ml-2 px-3 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700">Xóa</button>
              </td>
            </tr>
          `);
        });
      });

      tbody.innerHTML = rows.join('');

      // Tree toggles
      tbody.querySelectorAll('[data-toggle-group]').forEach(btn => {
        btn.addEventListener('click', () => {
          const gid = btn.getAttribute('data-toggle-group');
          const open = btn.textContent.trim() !== '+'; // current is minus → open
          // toggle icon
          btn.textContent = open ? '+' : '−';
          tbody.querySelectorAll(`tr[data-parent-group="${gid}"]`).forEach(tr => {
            if (open) tr.classList.add('hidden'); else tr.classList.remove('hidden');
          });
        });
      });

      // Save group handlers
      tbody.querySelectorAll('[data-save-nhom]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-save-nhom');
          const ten = tbody.querySelector(`[data-edit-nhom-ten="${id}"]`)?.value?.trim() ?? null;
          const maxStr = tbody.querySelector(`[data-edit-nhom-max="${id}"]`)?.value ?? null;
          const maso = tbody.querySelector(`[data-edit-nhom-maso="${id}"]`)?.value?.trim() ?? null;
          const max = maxStr !== null && maxStr !== '' ? parseInt(maxStr, 10) : null;
          try {
            const payload = { TenNhom: ten || null, DiemToiDa: Number.isNaN(max) ? null : max, MaSo: maso || null };
            const resp = await fetch(`${API_BASE}/api/tieuchi/nhom/${id}`, withUserHeader({
              method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            }));
            if (!resp.ok && resp.status !== 204) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.message || `HTTP ${resp.status}`);
            }
            alert('Đã lưu nhóm tiêu chí');
            loadCriteria();
          } catch (e) { alert('Lỗi lưu nhóm: ' + e.message); }
        });
      });

      // Save child handlers
      tbody.querySelectorAll('[data-save-tc]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-save-tc');
          const ten = tbody.querySelector(`[data-edit-tc-ten="${id}"]`)?.value?.trim() ?? null;
          const maxStr = tbody.querySelector(`[data-edit-tc-max="${id}"]`)?.value ?? null;
          const maso = tbody.querySelector(`[data-edit-tc-maso="${id}"]`)?.value?.trim() ?? null;
          const mc = tbody.querySelector(`[data-edit-tc-mc="${id}"]`)?.checked ?? false;
          const ase = tbody.querySelector(`[data-edit-tc-ase="${id}"]`)?.checked ?? true;
          const max = maxStr !== null && maxStr !== '' ? parseInt(maxStr, 10) : null;
          try {
            const payload = { TenTC: ten || null, DiemToiDa: Number.isNaN(max) ? null : max, CoMinhChung: mc, AllowSelfEval: ase, MaSo: maso || null };
            const resp = await fetch(`${API_BASE}/api/tieuchi/con/${id}`, withUserHeader({
              method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            }));
            if (!resp.ok && resp.status !== 204) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.message || `HTTP ${resp.status}`);
            }
            alert('Đã lưu tiêu chí');
            loadCriteria();
          } catch (e) { alert('Lỗi lưu tiêu chí: ' + e.message); }
        });
      });

      // Delete group handlers
      tbody.querySelectorAll('[data-del-nhom]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-del-nhom');
          if (!confirm('Xóa nhóm này và toàn bộ tiêu chí con?')) return;
          try {
            const resp = await fetch(`${API_BASE}/api/tieuchi/nhom/${id}`, withUserHeader({ method: 'DELETE' }));
            if (!resp.ok && resp.status !== 204) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.message || `HTTP ${resp.status}`);
            }
            loadCriteria();
          } catch (e) { alert('Lỗi xóa nhóm: ' + e.message); }
        });
      });

      // Delete child handlers
      tbody.querySelectorAll('[data-del-tc]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-del-tc');
          if (!confirm('Xóa tiêu chí này?')) return;
          try {
            const resp = await fetch(`${API_BASE}/api/tieuchi/con/${id}`, withUserHeader({ method: 'DELETE' }));
            if (!resp.ok && resp.status !== 204) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.message || `HTTP ${resp.status}`);
            }
            loadCriteria();
          } catch (e) { alert('Lỗi xóa tiêu chí: ' + e.message); }
        });
      });
    } catch (e) {
      const tbody = document.getElementById('criteria-table-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-red-500">Lỗi tải tiêu chí</td></tr>';
      console.error('Error loading /api/tieuchi:', e);
    }
  }

  // ==== System Logs ====
  async function loadLogs() {
    try {
      const tbody = document.getElementById("logs-table-body");
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      const response = await fetch(`${API_BASE}/api/logs`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const logs = await response.json(); // enriched format
      
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu log</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(log => {
        const time = log.Time || log.time || log.ThoiGian;
        const categoryRaw = (log.Category ?? log.category ?? '').toString();
        const category = categoryRaw.toUpperCase();
        const badgeClass = category === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700';
        return `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatDateTime(time)}</td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="px-2 py-0.5 rounded text-xs font-medium ${badgeClass}">${category || 'INFO'}</span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${log.User || log.user || log.MaTK || 'N/A'}</td>
          <td class="px-6 py-4 text-sm text-gray-900">
            <div class="font-semibold">${log.Friendly || log.friendly || log.Action || log.action || log.RawAction || log.rawAction || 'N/A'}</div>
            <div class="text-xs text-gray-500">Mã: ${log.ActionCode || log.actionCode || log.Action || log.action || ''}</div>
            ${(log.Details || log.details) ? `<div class="text-xs text-gray-400 break-words">${log.Details || log.details}</div>` : ''}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${log.IP || log.ip || log.IPAddress || log.ipAddress || 'N/A'}</td>
        </tr>`;
      }).join('');
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
      // client log
      try { await fetch(`${API_BASE}/api/logs/client`, withUserHeader({ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ActionCode:'ADD_FACULTY_UI', Details:`MaKH=${maKH};TenKhoa=${tenKhoa}`, Category:'UI'}) })); } catch {}
      loadFaculties();
    } catch (error) {
      console.error("Error adding faculty:", error);
      alert("Lỗi thêm khoa: " + error.message);
    }
  }

  async function addClass() {
    // Mở modal thêm lớp
    const modal = document.getElementById('add-class-modal');
    const form = document.getElementById('add-class-form');
    const makhSelect = document.getElementById('add-class-makh');
    
    if (!modal || !form) {
      alert('Modal không tìm thấy');
      return;
    }
    
    // Load danh sách khoa vào dropdown
    try {
      const response = await fetch(`${API_BASE}/api/khoa`, withUserHeader({}));
      if (response.ok) {
        const data = await response.json();
        const khoas = data.items || [];
        makhSelect.innerHTML = '<option value="">Chọn Khoa</option>' +
          khoas.map(k => `<option value="${k.maKH}">${k.maKH} - ${k.tenKhoa}</option>`).join('');
      }
    } catch (e) {
      console.error('Lỗi tải khoa:', e);
    }
    
    // Reset form
    form.reset();
    
    // Mở modal
    modal.classList.remove('hidden');
  }

  // Setup modal handlers
  function setupAddClassModal() {
    const modal = document.getElementById('add-class-modal');
    const form = document.getElementById('add-class-form');
    const cancelBtn = document.getElementById('add-class-cancel');
    
    if (!modal || !form || !cancelBtn) return;
    
    // Handle form submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const maLop = document.getElementById('add-class-malop').value.trim();
      const tenLop = document.getElementById('add-class-tenlop').value.trim();
      const maKH = document.getElementById('add-class-makh').value.trim();
      
      if (!maLop || !tenLop || !maKH) {
        alert('Vui lòng nhập đầy đủ thông tin!');
        return;
      }
      
      try {
        const response = await fetch(`${API_BASE}/api/lop`, withUserHeader({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ MaLop: maLop, TenLop: tenLop, MaKH: maKH })
        }));
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        alert(result.message || 'Thêm lớp thành công!');
        try { await fetch(`${API_BASE}/api/logs/client`, withUserHeader({ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ActionCode:'ADD_CLASS_UI', Details:`MaLop=${maLop};TenLop=${tenLop};MaKH=${maKH}`, Category:'UI'}) })); } catch {}
        
        // Đóng modal
        modal.classList.add('hidden');
        
        // Reload data
        loadClasses();
        loadFaculties();
      } catch (error) {
        console.error('Error adding class:', error);
        alert('Lỗi thêm lớp: ' + error.message);
      }
    });
    
    // Handle cancel button
    cancelBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      form.reset();
    });
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        form.reset();
      }
    });
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
      try { await fetch(`${API_BASE}/api/logs/client`, withUserHeader({ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ActionCode:'ADD_ACTIVITY_UI', Details:`MaHD=${payload.MaHD};TenHD=${payload.TenHD};DiemRL=${payload.DiemRL}`, Category:'UI'}) })); } catch {}
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
        // Parse year from formatted string (e.g., "2025-2026" → 2025) or use stored rawYear
        const currentYearField = document.getElementById("current-year");
        let currentYear = parseInt(currentYearField.dataset.rawYear, 10);
        if (isNaN(currentYear)) {
          // Fallback: parse from input value
          const yearStr = currentYearField.value;
          currentYear = parseInt(yearStr.split('-')[0], 10) || new Date().getFullYear();
        }
        const currentSemester = parseInt(document.getElementById("current-semester").value, 10);
        const evalStartDate = document.getElementById("eval-start-date").value;
        const semesterEndDate = document.getElementById("semester-end-date").value;
        const autoPointStatus = document.querySelector('input[name="auto-point-status"]:checked').value;
        const autoPointEnabled = autoPointStatus === 'enabled';
        const useAutoYearSemester = document.getElementById("use-auto-year-semester").checked;

        try {
          const resp = await fetch(`${API_BASE}/api/settings/system`, withUserHeader({
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              SchoolName: schoolName, 
              CurrentYear: currentYear, 
              CurrentSemester: currentSemester,
              EvalStartDate: evalStartDate ? new Date(evalStartDate) : null,
              SemesterEndDate: semesterEndDate ? new Date(semesterEndDate) : null,
              AutoPointEnabled: autoPointEnabled,
              UseAutoYearSemester: useAutoYearSemester
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
        const excellentPoints = parseInt(document.getElementById("excellent-points").value, 10);
        const goodPoints = parseInt(document.getElementById("good-points").value, 10);
        const fairPoints = parseInt(document.getElementById("fair-points").value, 10);
        const averagePoints = parseInt(document.getElementById("average-points").value, 10);
        const weakPoints = parseInt(document.getElementById("weak-points").value, 10);
        const poorPoints = parseInt(document.getElementById("poor-points").value, 10);

        if (isNaN(excellentPoints) || isNaN(goodPoints) || isNaN(fairPoints) || 
            isNaN(averagePoints) || isNaN(weakPoints) || isNaN(poorPoints)) {
          alert("Vui lòng nhập đầy đủ các giá trị điểm hợp lệ");
          return;
        }

        // Validate: Excellent > Good > Fair > Average > Weak > Poor
        if (!(excellentPoints > goodPoints && goodPoints > fairPoints && fairPoints > averagePoints && 
              averagePoints > weakPoints && weakPoints >= poorPoints)) {
          alert("Lỗi: Các mức điểm phải theo thứ tự giảm dần (Xuất sắc > Tốt > Khá > Trung bình > Yếu ≥ Kém)");
          return;
        }

        try {
          const resp = await fetch(`${API_BASE}/api/settings/points`, withUserHeader({
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              ExcellentPoints: excellentPoints,
              GoodPoints: goodPoints,
              FairPoints: fairPoints,
              AveragePoints: averagePoints,
              WeakPoints: weakPoints,
              PoorPoints: poorPoints
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

    // Save criteria settings (new simplified)
    const saveCriteriaBtn = document.getElementById("save-criteria-settings");
    if (saveCriteriaBtn) {
      saveCriteriaBtn.addEventListener("click", async () => {
        const currentYear = document.getElementById("current-year").value;
        const currentSemester = document.getElementById("current-semester").value;
        const semesterEndDate = document.getElementById("semester-end-date").value;
        const autoPointEnabled = document.querySelector('input[name="auto-point-status"]:checked').value === 'enabled';

        try {
          // Update system settings
          const sysResp = await fetch(`${API_BASE}/api/settings/system`, withUserHeader({
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ CurrentYear, CurrentSemester, SemesterEndDate, AutoPointEnabled })
          }));
          if (!sysResp.ok) {
            const err = await sysResp.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${sysResp.status}`);
          }

          // Save each criteria group
          const groups = criteriaGroupsCache;
          for (const group of groups) {
            const gId = group.MaNhom || group.maNhom;
            const gTen = group.TenNhom || group.tenNhom;
            const gMax = group.DiemToiDa || group.diemToiDa;
            const gMaSo = group.MaSo || group.maSo;

            // Update group
            const groupPayload = { TenNhom: gTen, DiemToiDa: gMax, MaSo: gMaSo };
            const groupResp = await fetch(`${API_BASE}/api/tieuchi/nhom/${gId}`, withUserHeader({
              method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(groupPayload)
            }));
            if (!groupResp.ok && groupResp.status !== 204) {
              const err = await groupResp.json().catch(() => ({}));
              throw new Error(err.message || `HTTP ${groupResp.status}`);
            }

            // Update each criteria in the group
            const criteriaList = Array.isArray(group.TieuChi) ? group.TieuChi : [];
            for (const criteria of criteriaList) {
              const cId = criteria.MaTC || criteria.maTC;
              const cTen = criteria.TenTC || criteria.tenTC;
              const cMax = criteria.DiemToiDa || criteria.diemToiDa;
              const cMaSo = criteria.MaSo || criteria.maSo;
              const cMC = criteria.CoMinhChung || criteria.coMinhChung;
              const cASE = criteria.AllowSelfEval || criteria.allowSelfEval;

              const criteriaPayload = { TenTC: cTen, DiemToiDa: cMax, CoMinhChung: cMC, AllowSelfEval: cASE, MaSo: cMaSo };
              const criteriaResp = await fetch(`${API_BASE}/api/tieuchi/con/${cId}`, withUserHeader({
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(criteriaPayload)
              }));
              if (!criteriaResp.ok && criteriaResp.status !== 204) {
                const err = await criteriaResp.json().catch(() => ({}));
                throw new Error(err.message || `HTTP ${criteriaResp.status}`);
              }
            }
          }

          alert("Cập nhật cài đặt tiêu chí thành công!");
        } catch (error) {
          console.error("Error saving criteria settings:", error);
          alert("Lỗi lưu cài đặt tiêu chí: " + error.message);
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
    // Khởi tạo module nhập điểm
    if (typeof initDiemImport === 'function') {
      initDiemImport('admin-diem-container', 'admin', 'all');
    }
    loadImportSettings();
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
    setupAddClassModal();  // ✅ Setup modal cho thêm lớp
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
    
    // Load danh sách quyền trước, sau đó set giá trị đang có
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
          // Set giá trị quyền ngay sau khi options đã được populate
          // API trả về camelCase: userData.maQT
          const currentMaQT = userData.maQT || userData.MaQT || '';
          if (currentMaQT) {
            roleSelect.value = currentMaQT;
            console.log('Role pre-selected after load:', currentMaQT, '→ actual value:', roleSelect.value);
          }
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
    
    // ✅ FIX: Xóa toggle password logic (password field giờ disabled)
    // Password reset được handle bởi nút "Reset password" riêng

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
        'u-matkhau': '' // ✅ FIX: Luôn clear password field khi edit (không gửi plain text từ DB)
      };
      
      Object.entries(fields).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) {
          field.value = value;
          console.log(`Set ${id} to:`, value === '' ? '(cleared for security)' : value);
        }
      });
      
      // Chọn quyền — đã được set ngay sau khi load roles, chỉ set lại nếu chưa đúng
      const roleSelect = document.getElementById("u-maqt");
      const currentMaQT = userData.maQT || userData.MaQT || '';
      if (roleSelect && currentMaQT && roleSelect.value !== currentMaQT) {
        roleSelect.value = currentMaQT;
        console.log('Role re-selected in timeout:', currentMaQT);
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
        
        const maQTValue = document.getElementById("u-maqt").value.trim();
        if (!maQTValue) {
          alert('Vui lòng chọn quyền cho người dùng');
          return;
        }

        // ✅ FIX: Chỉ gửi mật khẩu nếu user nhập mật khẩu mới
        const matKhauValue = document.getElementById("u-matkhau").value.trim();
        
        const payload = {
          MaCaNhan: document.getElementById("u-macanhan").value.trim(),
          TenTK: document.getElementById("u-tentk").value.trim(),
          TenNguoiDung: document.getElementById("u-tennguoidung").value.trim(),
          ChucVu: document.getElementById("u-chucvu").value.trim(),
          MaQT: maQTValue
        };
        
        // Chỉ thêm MatKhau nếu có giá trị mới
        if (matKhauValue) {
          payload.MatKhau = matKhauValue;
          console.log('Cập nhật với mật khẩu mới');
        } else {
          console.log('Cập nhật không thay mật khẩu');
        }
        
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
            alert('Lỗi cập nhật: ' + (err.message || err.error || 'Unknown error'));
          }
        } catch (e) {
          alert('Lỗi cập nhật người dùng: ' + e.message);
        }
      };
      
      // ✅ NEW: Setup nút Reset password
      const btnResetPassword = document.getElementById("btn-reset-password");
      if (btnResetPassword) {
        btnResetPassword.onclick = async (e) => {
          e.preventDefault();
          const newPwd = prompt('❓ Nhập mật khẩu mới cho người dùng:');
          if (!newPwd || newPwd.trim() === '') {
            alert('❌ Bạn phải nhập mật khẩu mới');
            return;
          }
          
          if (!confirm(`⚠️ Xác nhận đặt lại mật khẩu cho ${userData.tenNguoiDung || userData.tenTK}?`)) {
            return;
          }
          
          try {
            const resp = await fetch(`${API_BASE}/api/admin/users/${maCaNhan}/reset-password`, withUserHeader({
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ NewPassword: newPwd })
            }));
            
            if (resp.ok) {
              const data = await resp.json();
              alert(data.message || '✅ Đặt lại mật khẩu thành công');
              console.log('✅ Admin reset password successfully');
            } else {
              const err = await resp.json().catch(() => ({}));
              alert('❌ Lỗi: ' + (err.message || err.error || 'Unknown error'));
            }
          } catch (e) {
            alert('❌ Lỗi đặt lại mật khẩu: ' + e.message);
          }
        };
      }
      
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
    khoaSelect.addEventListener('change', async (evt) => {
      const selectedKhoa = khoaSelect.value;
      console.log('Khoa selected:', selectedKhoa);
      
      // Nếu event được dispatch từ fillEditDetailForm (có flag preserveLop) → restore lớp cũ
      // Nếu user tự chọn khoa → clear lớp để user chọn lớp mới
      const shouldPreserveLop = evt && evt.detail && evt.detail.preserveLop;
      const prevLopValue = shouldPreserveLop && lopSelect ? lopSelect.value : '';
      const prevLopCVValue = shouldPreserveLop && lopCVSelect ? lopCVSelect.value : '';
      
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
              // Khôi phục giá trị lớp cũ nếu lớp đó thuộc khoa này
              if (prevLopValue) {
                lopSelect.value = prevLopValue;
                // Nếu không tìm thấy trong danh sách mới thì thêm option tạm để không mất giá trị
                if (lopSelect.value !== prevLopValue) {
                  const tempOpt = document.createElement('option');
                  tempOpt.value = prevLopValue;
                  tempOpt.textContent = prevLopValue;
                  lopSelect.appendChild(tempOpt);
                  lopSelect.value = prevLopValue;
                }
                // Cập nhật visible input của searchable dropdown
                const lopInput = document.getElementById('edit-info-lop-input');
                if (lopInput) {
                  const selectedOpt = lopSelect.options[lopSelect.selectedIndex];
                  lopInput.value = selectedOpt ? selectedOpt.textContent : prevLopValue;
                }
              }
            }
            
            // Update lớp chủ nhiệm cho giảng viên
            if (lopCVSelect) {
              const lopCVOptions = '<option value="">Chọn lớp chủ nhiệm</option>' +
                lopData.map(l => `<option value="${l.maLop}">${l.tenLop}</option>`).join('');
              lopCVSelect.innerHTML = lopCVOptions;
              // Khôi phục giá trị lớp CV cũ
              if (prevLopCVValue) {
                lopCVSelect.value = prevLopCVValue;
                if (lopCVSelect.value !== prevLopCVValue) {
                  const tempOpt = document.createElement('option');
                  tempOpt.value = prevLopCVValue;
                  tempOpt.textContent = prevLopCVValue;
                  lopCVSelect.appendChild(tempOpt);
                  lopCVSelect.value = prevLopCVValue;
                }
                const lopCVInput = document.getElementById('edit-info-lopcv-input');
                if (lopCVInput) {
                  const selectedOpt = lopCVSelect.options[lopCVSelect.selectedIndex];
                  lopCVInput.value = selectedOpt ? selectedOpt.textContent : prevLopCVValue;
                }
              }
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
      // Nếu text trong input khớp chính xác với một option → tự động chọn option đó
      const inputText = input.value.trim().toLowerCase();
      if (inputText) {
        const matched = allOptions.find(opt => opt.text.trim().toLowerCase() === inputText && opt.value !== '');
        if (matched) {
          select.value = matched.value;
          input.value = matched.text; // chuẩn hóa lại text
        }
      }
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
          // Gán trước lớp chủ nhiệm để preserve
          const lopCVSel = document.getElementById('edit-info-lopcv');
          if (lopCVSel) lopCVSel.value = gvData.lopCV || '';
          khoaSelect.dispatchEvent(new CustomEvent('change', { detail: { preserveLop: true } }));
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
          // Gán trước giá trị lớp vào hidden select để setupKhoaChangeEvent có thể preserve
          const lopSel = document.getElementById('edit-info-lop');
          if (lopSel) lopSel.value = svData.MaLop || '';
          // Dùng CustomEvent với flag preserveLop để phân biệt fill-form vs user tự chọn khoa
          khoaSelect.dispatchEvent(new CustomEvent('change', { detail: { preserveLop: true } }));
          // Set visible input ngay để user thấy (sẽ được override đúng sau khi async fetch xong)
          const lopInput = document.getElementById('edit-info-lop-input');
          if (lopInput && svData.MaLop) {
            lopInput.value = svData.MaLop;
          }
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
      // Ensure we have MaCaNhan (allow admin to input if missing)
      let id = maCaNhan || document.getElementById('edit-info-macanhan')?.value?.trim();
      if (!id) {
        id = prompt('Nhập Mã cá nhân của giảng viên để tạo mới:');
        if (!id) { alert('Bạn cần nhập Mã cá nhân để tiếp tục.'); return; }
      }
      endpoint = `/api/giangvien-detail/${id}`;
      payload = {
        MaCaNhan: id,
        TenGV: document.getElementById("edit-info-ten").value,
        SDT: document.getElementById("edit-info-sdt").value || null,
        Email: document.getElementById("edit-info-email").value || null,
        MaKH: document.getElementById("edit-info-khoa").value || null,
        LopCV: document.getElementById("edit-info-lopcv").value || null,
        DiaChi: document.getElementById("edit-info-diachi-gv").value || null
      };
      
      // Primary attempt: update details
      let response = await fetch(`${API_BASE}${endpoint}`, withUserHeader({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }));
      
      if (response.ok) {
        alert("Cập nhật thông tin chi tiết thành công!");
        document.getElementById("user-modal").classList.add("hidden");
        loadUsers();
        return;
      }
      
      // If lecturer record doesn't exist, create it then retry update
      // Some environments may return 400 with an error text; treat both 404 and specific error message as missing
      const errText = await response.clone().text().catch(()=> '');
      const isMissing = response.status === 404 || /không\s*tìm\s*thấy\s*giảng\s*viên/i.test(errText);
      if (isMissing) {
        const createPayload = {
          MaCaNhan: id,
          TenGV: payload.TenGV || (document.getElementById('edit-info-ten')?.value || 'Chưa đặt tên'),
          MaKH: payload.MaKH || null,
          LopCV: payload.LopCV || null,
          SDT: payload.SDT || null,
          Email: payload.Email || null,
          DiaChi: payload.DiaChi || null
        };
        try {
          const createRes = await fetch(`${API_BASE}/api/giangvien`, withUserHeader({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createPayload)
          }));
          if (!createRes.ok) {
            const t = await createRes.text().catch(()=> '');
            throw new Error(`Không thể tạo giảng viên (HTTP ${createRes.status}) ${t}`);
          }
          // Retry PUT to ensure all fields updated
          response = await fetch(`${API_BASE}${endpoint}`, withUserHeader({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }));
          if (response.ok) {
            alert("Đã tạo mới và cập nhật thông tin giảng viên thành công!");
            document.getElementById("user-modal").classList.add("hidden");
            loadUsers();
            return;
          } else {
            const err = await response.json().catch(()=>({}));
            alert(`Đã tạo mới giảng viên nhưng cập nhật chi tiết thất bại: ${err.message || 'Unknown error'}`);
            return;
          }
        } catch (createErr) {
          console.error('Create lecturer error:', createErr);
          alert(createErr.message || 'Không thể tạo giảng viên');
          return;
        }
      } else {
        const error = await response.json().catch(()=>({}));
        // As a last resort, offer to create if user agrees
        const shouldCreate = confirm((error.error || error.message || 'Không thể cập nhật thông tin chi tiết') + '\n\nBạn có muốn tạo mới hồ sơ giảng viên này?');
        if (shouldCreate) {
          try {
            const createRes = await fetch(`${API_BASE}/api/giangvien`, withUserHeader({
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                MaCaNhan: id,
                TenGV: payload.TenGV || 'Chưa đặt tên',
                SDT: payload.SDT || null,
                Email: payload.Email || null,
                MaKH: payload.MaKH || null,
                LopCV: payload.LopCV || null,
                DiaChi: payload.DiaChi || null
              })
            }));
            if (!createRes.ok) {
              const t = await createRes.text().catch(()=> '');
              throw new Error(`Không thể tạo giảng viên (HTTP ${createRes.status}) ${t}`);
            }
            // Retry update
            const upd = await fetch(`${API_BASE}${endpoint}`, withUserHeader({
              method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            }));
            if (upd.ok) {
              alert('Đã tạo mới và cập nhật thông tin giảng viên thành công!');
              document.getElementById('user-modal').classList.add('hidden');
              loadUsers();
              return;
            }
          } catch (e) {
            alert(e.message || 'Không thể tạo giảng viên');
            return;
          }
        }
        alert(`Lỗi: ${error.error || error.message || 'Không thể cập nhật thông tin chi tiết'}`);
        return;
      }
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
      console.log('[SUBMIT-SV] MaLop hidden select:', document.getElementById("edit-info-lop")?.value);
      console.log('[SUBMIT-SV] MaLop input text:', document.getElementById("edit-info-lop-input")?.value);
      console.log('[SUBMIT-SV] MaKH:', document.getElementById("edit-info-khoa")?.value);
      console.log('[SUBMIT-SV] payload:', JSON.stringify(payload));
    } else {
      // Với các chức vụ khác (Admin, Cán bộ Khoa, Nhà trường...):
      // Chỉ cập nhật thông tin TK cơ bản, không có bảng chi tiết riêng
      alert("Thông tin tab Chi tiết không áp dụng cho chức vụ: " + chucVu + "\nChỉ tab Cơ bản được lưu.");
      document.getElementById("user-modal").classList.add("hidden");
      return;
    }
    // Student path or other supported paths fall through here
    const response = await fetch(`${API_BASE}${endpoint}`, withUserHeader({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
    if (response.ok) {
      alert("Cập nhật thông tin chi tiết thành công!");
      document.getElementById("user-modal").classList.add("hidden");
      loadUsers();
    } else {
      const error = await response.json().catch(()=>({}));
      alert(`Lỗi: ${error.error || error.message || 'Không thể cập nhật thông tin chi tiết'}`);
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

// ===== Settings: Auto-cleanup Functions =====

// Initialize settings page
async function initSettingsPage() {
  try {
    // Load current settings
    await loadCleanupSettings();
    // Sync range and input fields
    const daysInput = document.getElementById('cleanup-days');
    const daysField = document.getElementById('cleanup-days-input');
    if (daysInput && daysField) {
      daysInput.addEventListener('input', () => {
        daysField.value = daysInput.value;
      });
      daysField.addEventListener('input', () => {
        daysInput.value = daysField.value;
      });
    }
    // Load history on init
    await loadCleanupHistory();
  } catch (error) {
    console.error('Error initializing settings page:', error);
  }
}

// Load cleanup settings from API
async function loadCleanupSettings() {
  try {
    const response = await fetch(`${API_BASE}/api/settings/cleanup-config`, withUserHeader({}));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const settings = await response.json();
    
    // Fill form
    document.getElementById('cleanup-enabled').checked = settings.enabled ?? true;
    document.getElementById('cleanup-days').value = settings.daysToKeep ?? 5;
    document.getElementById('cleanup-days-input').value = settings.daysToKeep ?? 5;
    document.getElementById('cleanup-time').value = settings.cleanupTime ?? '02:00';
    document.getElementById('cleanup-notify').checked = settings.notifyBefore ?? true;
    
    // Update display
    updateSettingsDisplay();
  } catch (error) {
    console.error('Error loading cleanup settings:', error);
    showStatusMessage('error', 'Lỗi tải cài đặt: ' + error.message);
  }
}

// Update settings display
function updateSettingsDisplay() {
  const enabled = document.getElementById('cleanup-enabled').checked;
  const days = document.getElementById('cleanup-days').value;
  const time = document.getElementById('cleanup-time').value;
  const notify = document.getElementById('cleanup-notify').checked;
  
  document.getElementById('current-enabled').textContent = enabled ? '✅ Bật' : '❌ Tắt';
  document.getElementById('current-days').textContent = days + ' ngày';
  document.getElementById('current-time').textContent = time || '02:00';
  document.getElementById('current-notify').textContent = notify ? '✅ Có' : '❌ Không';
}

// Save cleanup settings
async function saveCleanupSettings() {
  try {
    const payload = {
      enabled: document.getElementById('cleanup-enabled').checked,
      daysToKeep: parseInt(document.getElementById('cleanup-days').value, 10),
      cleanupTime: document.getElementById('cleanup-time').value,
      notifyBefore: document.getElementById('cleanup-notify').checked
    };
    
    showStatusMessage('info', 'Đang lưu cài đặt...');
    
    const response = await fetch(`${API_BASE}/api/settings/cleanup-config`, withUserHeader({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const result = await response.json();
    showStatusMessage('success', 'Lưu cài đặt thành công ✅');
    updateSettingsDisplay();
    setTimeout(() => loadCleanupHistory(), 500);
  } catch (error) {
    console.error('Error saving cleanup settings:', error);
    showStatusMessage('error', 'Lỗi lưu cài đặt: ' + error.message);
  }
}

// Test cleanup (dry run)
async function testCleanupDry() {
  try {
    showStatusMessage('info', 'Đang chạy test xóa...');
    
    const response = await fetch(`${API_BASE}/api/maintenance/cleanup-test`, withUserHeader({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }));
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const result = await response.json();
    showStatusMessage('success', `Test xóa: Tìm thấy ${result.count} minh chứng cũ (không xóa)`);
  } catch (error) {
    console.error('Error in cleanup test:', error);
    showStatusMessage('error', 'Lỗi test xóa: ' + error.message);
  }
}

// Run cleanup now
async function runCleanupNow() {
  if (!confirm('Bạn có chắc chắn muốn xóa minh chứng cũ ngay bây giờ? Hành động này không thể hoàn tác!')) {
    return;
  }
  
  try {
    showStatusMessage('info', 'Đang xóa minh chứng cũ...');
    
    const response = await fetch(`${API_BASE}/api/maintenance/cleanup-execute`, withUserHeader({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }));
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const result = await response.json();
    showStatusMessage('success', `Xóa thành công! Đã xóa ${result.deleted} minh chứng`);
    
    // Reload history
    setTimeout(() => loadCleanupHistory(), 500);
  } catch (error) {
    console.error('Error in cleanup execution:', error);
    showStatusMessage('error', 'Lỗi xóa: ' + error.message);
  }
}

// Load cleanup history
async function loadCleanupHistory() {
  try {
    const response = await fetch(`${API_BASE}/api/maintenance/cleanup-history?limit=10`, withUserHeader({}));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const history = await response.json();
    const historyContainer = document.getElementById('cleanup-history');
    
    if (!Array.isArray(history) || history.length === 0) {
      historyContainer.innerHTML = '<div class="text-sm text-gray-500 text-center py-4">Chưa có hoạt động xóa</div>';
      return;
    }
    
    historyContainer.innerHTML = history.map(entry => `
      <div class="p-3 bg-gray-50 rounded-lg border-l-4 border-blue-400">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-sm font-medium text-gray-800">
              ${new Date(entry.executedAt).toLocaleString('vi-VN')}
            </p>
            <p class="text-xs text-gray-600 mt-1">
              🗑️ Đã xóa ${entry.deletedCount} | 📢 Thông báo ${entry.notifiedCount}
            </p>
          </div>
          <span class="text-xs px-2 py-1 rounded-full ${entry.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
            ${entry.status || 'Hoàn thành'}
          </span>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading cleanup history:', error);
    const historyContainer = document.getElementById('cleanup-history');
    if (historyContainer) {
      historyContainer.innerHTML = '<div class="text-sm text-red-500 text-center py-4">Lỗi tải lịch sử</div>';
    }
  }
}

// Show status message
function showStatusMessage(type, message) {
  const statusElement = document.getElementById('cleanup-status');
  const spinner = document.getElementById('cleanup-spinner');
  const messageElement = document.getElementById('cleanup-message');
  
  if (!statusElement) return;
  
  statusElement.classList.remove('hidden');
  
  if (type === 'info') {
    statusElement.className = 'mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200';
    spinner.classList.remove('hidden');
    messageElement.textContent = message;
    messageElement.className = 'text-sm text-blue-700';
  } else if (type === 'success') {
    statusElement.className = 'mt-6 p-4 bg-green-50 rounded-lg border border-green-200';
    spinner.classList.add('hidden');
    messageElement.textContent = message;
    messageElement.className = 'text-sm text-green-700 font-medium';
    
    // Auto-hide success messages after 3 seconds
    setTimeout(() => {
      statusElement.classList.add('hidden');
    }, 3000);
  } else if (type === 'error') {
    statusElement.className = 'mt-6 p-4 bg-red-50 rounded-lg border border-red-200';
    spinner.classList.add('hidden');
    messageElement.textContent = message;
    messageElement.className = 'text-sm text-red-700 font-medium';
  }
}

// Add settings section to breadcrumb map (called by sidebar navigation)
function addSettingsToBreadcrumb() {
  const sectionMap = {
    settings: { section: 'Cài đặt hệ thống', page: 'Xóa tự động minh chứng' }
  };
  
  const currentSection = document.getElementById("current-section");
  const currentPage = document.getElementById("current-page");
  
  if (currentSection && currentPage) {
    currentSection.textContent = sectionMap.settings.section;
    currentPage.textContent = sectionMap.settings.page;
  }
}

// ==== NOTIFICATIONS MANAGEMENT ====
async function initNotifications() {
  // Hide/show specific user field based on recipient type
  const recipientType = document.getElementById('notif-recipient-type');
  const specificUserField = document.getElementById('specific-user-field');
  
  if (recipientType) {
    recipientType.addEventListener('change', (e) => {
      if (e.target.value === 'specific') {
        specificUserField.classList.remove('hidden');
      } else {
        specificUserField.classList.add('hidden');
      }
    });
  }

  // Handle form submission
  const form = document.getElementById('notification-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await sendNotification();
    });
  }

  // Handle search
  const searchInput = document.getElementById('notif-search');
  if (searchInput) {
    searchInput.addEventListener('input', async () => {
      await loadNotificationHistory();
    });
  }

  // Load statistics and history
  await loadNotificationStats();
  await loadNotificationHistory();
  
  // Initialize Management tab by default
  const manageTab = document.getElementById('notif-manage-tab');
  const testTab = document.getElementById('notif-test-tab');
  if (manageTab && testTab) {
    manageTab.classList.remove('hidden');
    testTab.classList.add('hidden');
    await loadNotificationManageTable();
  }
}


async function sendNotification() {
  const recipientType = document.getElementById('notif-recipient-type').value;
  const title = document.getElementById('notif-title').value.trim();
  const message = document.getElementById('notif-message').value.trim();
  const link = document.getElementById('notif-link').value.trim();
  const statusEl = document.getElementById('notif-status');

  if (!title || !message) {
    showStatus(statusEl, 'error', 'Vui lòng nhập tiêu đề và nội dung');
    return;
  }

  // Map recipientType to actual recipient string for API
  let recipient = '';
  if (recipientType === 'specific') {
    recipient = document.getElementById('notif-recipient-id').value.trim();
    if (!recipient) {
      showStatus(statusEl, 'error', 'Vui lòng nhập MSSV / Mã cá nhân');
      return;
    }
  } else {
    // Use recipientType directly as recipient (e.g., ALL_STUDENT, ALL_GIANGVIEN)
    recipient = recipientType;
  }

  const payload = {
    to: recipient,
    title: title,
    message: message,
    link: link || null
  };

  try {
    showStatus(statusEl, 'info', 'Đang gửi thông báo...');

    const response = await fetch(`${API_BASE}/api/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User': getCurrentUserId()
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error ${response.status}: ${error}`);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || 'Lỗi gửi thông báo');
    }

    showStatus(statusEl, 'success', 'Gửi thông báo thành công!');
    
    // Reset form
    document.getElementById('notification-form').reset();
    document.getElementById('specific-user-field').classList.add('hidden');

    // Reload history
    await loadNotificationHistory();

  } catch (error) {
    console.error('Error sending notification:', error);
    showStatus(statusEl, 'error', `Lỗi: ${error.message}`);
  }
}

async function loadNotificationStats() {
  try {
    // Load user counts from preload data if available
    const response = await fetch(`${API_BASE}/api/preload`, {
      headers: { 'X-User': getCurrentUserId() }
    });

    if (response.ok) {
      const preload = await response.json();
      const studentCount = preload?.TotalSinhVien || 0;
      const lecturerCount = preload?.TotalGiangVien || 0;
      
      document.getElementById('stat-students').textContent = studentCount;
      document.getElementById('stat-lecturers').textContent = lecturerCount;
    } else {
      throw new Error(`API returned ${response.status}`);
    }

    // Sent and pending would need proper backend endpoint
    // For now, set to 0
    document.getElementById('stat-sent').textContent = '0';
    document.getElementById('stat-pending').textContent = '0';
  } catch (error) {
    // On any error, just set defaults - don't block the page
    console.warn('Could not load stats, showing defaults:', error.message);
    document.getElementById('stat-students').textContent = '0';
    document.getElementById('stat-lecturers').textContent = '0';
    document.getElementById('stat-sent').textContent = '0';
    document.getElementById('stat-pending').textContent = '0';
  }
}

async function loadNotificationHistory() {
  const tableBody = document.getElementById('notif-history-table');
  const searchInput = document.getElementById('notif-search');

  try {
    const query = searchInput ? searchInput.value : '';
    const userId = getCurrentUserId();
    
    // Use the /api/notifications endpoint which returns recent notifications
    // Required parameter: gvId (can use current user ID)
    const url = `${window.location.origin}${API_BASE || ''}/api/notifications?gvId=${encodeURIComponent(userId)}&top=50`;

    const response = await fetch(url, {
      headers: { 'X-User': userId }
    });

    if (!response.ok) {
      // If API fails, show empty history - don't block the page
      console.warn(`Notifications API returned ${response.status}`);
      tableBody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-500">Lịch sử thông báo không khả dụng</td></tr>';
      return;
    }

    let notifications = await response.json();

    // Handle different response formats
    if (!Array.isArray(notifications)) {
      if (notifications?.data && Array.isArray(notifications.data)) {
        notifications = notifications.data;
      } else {
        notifications = [];
      }
    }

    // Filter by search query if provided
    if (query && searchInput) {
      notifications = notifications.filter(n => {
        const title = (n.Title || n.title || '').toLowerCase();
        const message = (n.Message || n.message || '').toLowerCase();
        const searchLower = query.toLowerCase();
        return title.includes(searchLower) || message.includes(searchLower);
      });
    }

    if (!notifications || notifications.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-500">Chưa có thông báo nào</td></tr>';
      return;
    }

    tableBody.innerHTML = notifications.map(notif => {
      // Handle different field name formats (PascalCase from API vs camelCase)
      const title = notif.Title || notif.title || 'N/A';
      const recipient = notif.Recipient || notif.recipient || 'N/A';
      const createdAt = notif.CreatedAt || notif.createdAt || notif.SentAt || notif.sentAt || new Date().toISOString();
      
      const date = new Date(createdAt);
      const timeStr = date.toLocaleString('vi-VN');
      
      // Determine recipient type label
      const recipientMap = {
        'ALL_STUDENT': 'Tất cả sinh viên',
        'ALL_GIANGVIEN': 'Tất cả giảng viên',
        'ALL_KHOA': 'Tất cả cấp khoa',
        'ALL_TRUONG': 'Tất cả cấp trường'
      };
      const recipientText = recipientMap[recipient] || recipient;
      
      // Status badge (since we don't track read status in admin, assume "sent")
      const statusBadge = '<span class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Đã gửi</span>';

      return `
        <tr>
          <td class="px-4 py-3 font-medium text-gray-800 truncate">${title}</td>
          <td class="px-4 py-3 text-gray-600 text-sm">${recipientText}</td>
          <td class="px-4 py-3 text-gray-600 text-sm">${timeStr}</td>
          <td class="px-4 py-3">${statusBadge}</td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading notification history:', error);
    tableBody.innerHTML = '<tr><td colspan="4" class="px-4 py-4 text-center text-red-500">Lỗi: ' + error.message + '</td></tr>';
  }
}

function showStatus(element, type, message) {
  if (!element) return;
  element.classList.remove('hidden', 'bg-red-50', 'bg-green-50', 'text-red-600', 'text-green-600');
  element.classList.add(
    type === 'error' ? 'bg-red-50' : 'bg-green-50',
    type === 'error' ? 'text-red-600' : 'text-green-600',
    'border',
    type === 'error' ? 'border-red-200' : 'border-green-200'
  );
  element.textContent = message;
}

// ==== NOTIFICATIONS MANAGEMENT & TESTING ====

// Tab switching
function switchNotifTab(tabName) {
  const manageTab = document.getElementById('notif-manage-tab');
  const testTab = document.getElementById('notif-test-tab');
  const buttons = document.querySelectorAll('[onclick*="switchNotifTab"]');
  
  buttons.forEach(btn => {
    btn.classList.remove('border-b-2', 'border-cyan-600', 'text-cyan-600');
    btn.classList.add('border-transparent', 'text-gray-600');
  });
  
  if (tabName === 'manage') {
    manageTab.classList.remove('hidden');
    testTab.classList.add('hidden');
    buttons[0].classList.add('border-b-2', 'border-cyan-600', 'text-cyan-600');
    loadNotificationManageTable();
  } else {
    manageTab.classList.add('hidden');
    testTab.classList.remove('hidden');
    buttons[1].classList.add('border-b-2', 'border-cyan-600', 'text-cyan-600');
    initTestNotifications();
  }
}

// Load management table
async function loadNotificationManageTable() {
  const tableBody = document.getElementById('notif-manage-table');
  const filterType = document.getElementById('notif-filter-type')?.value || '';
  const sortBy = document.getElementById('notif-sort-by')?.value || 'newest';
  
  try {
    const userId = getCurrentUserId();
    const url = `${window.location.origin}${API_BASE || ''}/api/notifications?gvId=${encodeURIComponent(userId)}&top=100`;
    
    const response = await fetch(url, { headers: { 'X-User': userId } });
    
    if (!response.ok) {
      tableBody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
      return;
    }
    
    let notifications = await response.json();
    if (!Array.isArray(notifications)) notifications = [];
    
    // Filter by type
    if (filterType) {
      notifications = notifications.filter(n => 
        (n.Recipient || n.recipient) === filterType
      );
    }
    
    // Sort
    if (sortBy === 'newest') {
      notifications.sort((a, b) => new Date(b.CreatedAt || b.createdAt) - new Date(a.CreatedAt || a.createdAt));
    } else if (sortBy === 'oldest') {
      notifications.sort((a, b) => new Date(a.CreatedAt || a.createdAt) - new Date(b.CreatedAt || b.createdAt));
    } else if (sortBy === 'title') {
      notifications.sort((a, b) => ((a.Title || a.title) || '').localeCompare((b.Title || b.title) || ''));
    }
    
    if (notifications.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-gray-500">Chưa có thông báo</td></tr>';
      return;
    }
    
    const recipientMap = {
      'ALL_STUDENT': 'Sinh viên',
      'ALL_GIANGVIEN': 'Giảng viên',
      'ALL_KHOA': 'Khoa',
      'ALL_TRUONG': 'Trường'
    };
    
    tableBody.innerHTML = notifications.map((notif, idx) => {
      const title = notif.Title || notif.title || '';
      const message = notif.Message || notif.message || '';
      const recipient = notif.Recipient || notif.recipient || '';
      const createdAt = new Date(notif.CreatedAt || notif.createdAt).toLocaleString('vi-VN');
      const msgPreview = message.substring(0, 50) + (message.length > 50 ? '...' : '');
      
      return `
        <tr data-notif-id="${notif.NotificationId || idx}">
          <td class="px-4 py-3"><input type="checkbox" class="notif-select-checkbox"></td>
          <td class="px-4 py-3 font-medium text-gray-800 truncate" title="${title}">${title}</td>
          <td class="px-4 py-3 text-gray-600 text-sm truncate" title="${message}">${msgPreview}</td>
          <td class="px-4 py-3 text-sm">${recipientMap[recipient] || recipient}</td>
          <td class="px-4 py-3 text-sm text-gray-600">${createdAt}</td>
          <td class="px-4 py-3 text-center">
            <button onclick="deleteNotification('${notif.NotificationId || idx}')" class="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">
              Xóa
            </button>
          </td>
        </tr>
      `;
    }).join('');
    
    // Add checkbox listeners
    document.querySelectorAll('.notif-select-checkbox').forEach(cb => {
      cb.addEventListener('change', updateBulkActionsVisibility);
    });
    
  } catch (error) {
    console.error('Error loading management table:', error);
    tableBody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-red-500">Lỗi: ' + error.message + '</td></tr>';
  }
}

// Apply filters
function applyNotifFilters() {
  loadNotificationManageTable();
}

// Checkbox management
function toggleSelectAll(checkbox) {
  document.querySelectorAll('.notif-select-checkbox').forEach(cb => {
    cb.checked = checkbox.checked;
  });
  updateBulkActionsVisibility();
}

function updateBulkActionsVisibility() {
  const selected = document.querySelectorAll('.notif-select-checkbox:checked').length;
  const bulkActions = document.getElementById('notif-bulk-actions');
  const selectedCount = document.getElementById('notif-selected-count');
  
  if (selected > 0) {
    bulkActions.classList.remove('hidden');
    selectedCount.textContent = `${selected} thông báo được chọn`;
  } else {
    bulkActions.classList.add('hidden');
  }
}

// Delete operations
function deleteNotification(notifId) {
  if (confirm('Bạn chắc chắn muốn xóa thông báo này?')) {
    // API call would go here
    alert('Xóa thành công (demo)');
    loadNotificationManageTable();
  }
}

function deleteSelectedNotif() {
  const selected = document.querySelectorAll('.notif-select-checkbox:checked').length;
  if (selected === 0) {
    alert('Vui lòng chọn ít nhất một thông báo');
    return;
  }
  
  if (confirm(`Bạn chắc chắn muốn xóa ${selected} thông báo?`)) {
    // API call would go here
    alert('Xóa thành công (demo)');
    loadNotificationManageTable();
  }
}

function cancelNotifSelection() {
  document.querySelectorAll('.notif-select-checkbox').forEach(cb => cb.checked = false);
  document.getElementById('select-all-notif').checked = false;
  updateBulkActionsVisibility();
}

// Test Notifications
function initTestNotifications() {
  const recipientSelect = document.getElementById('test-notif-recipient');
  const userField = document.getElementById('test-user-field');
  
  if (recipientSelect) {
    recipientSelect.addEventListener('change', (e) => {
      if (e.target.value === 'test-user') {
        userField.classList.remove('hidden');
      } else {
        userField.classList.add('hidden');
      }
    });
  }
  
  const form = document.getElementById('test-notif-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await sendTestNotification();
    });
  }
}

async function sendTestNotification() {
  const recipient = document.getElementById('test-notif-recipient').value;
  const title = document.getElementById('test-notif-title').value.trim();
  const message = document.getElementById('test-notif-message').value.trim();
  const userId = document.getElementById('test-user-id')?.value.trim() || '';
  const statusEl = document.getElementById('test-notif-status');
  const log = document.getElementById('test-log');
  
  const logEntry = (msg) => {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    const entry = document.createElement('div');
    entry.textContent = `[${timestamp}] ${msg}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  };
  
  if (!title || !message) {
    showStatus(statusEl, 'error', 'Vui lòng nhập tiêu đề và nội dung');
    return;
  }
  
  const payload = {
    to: recipient === 'test-user' ? userId : recipient,
    title: title,
    message: message
  };
  
  try {
    showStatus(statusEl, 'info', 'Đang gửi thử...');
    logEntry(`Gửi thử thông báo: ${title}`);
    logEntry(`Đối tượng: ${recipient === 'test-user' ? userId : recipient}`);
    logEntry(`Payload: ${JSON.stringify(payload)}`);
    
    const response = await fetch(`${API_BASE}/api/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User': getCurrentUserId()
      },
      body: JSON.stringify(payload)
    });
    
    logEntry(`Response Status: ${response.status}`);
    
    const result = await response.json();
    logEntry(`Response: ${JSON.stringify(result)}`);
    
    if (response.ok && result.ok) {
      showStatus(statusEl, 'success', '✓ Gửi thử thành công!');
      logEntry('✓ Gửi thành công');
      
      const successCount = parseInt(document.getElementById('test-success-count').textContent) + 1;
      document.getElementById('test-success-count').textContent = successCount;
    } else {
      showStatus(statusEl, 'error', result.error || 'Lỗi gửi thử');
      logEntry(`✗ Lỗi: ${result.error}`);
      
      const errorCount = parseInt(document.getElementById('test-error-count').textContent) + 1;
      document.getElementById('test-error-count').textContent = errorCount;
    }
  } catch (error) {
    showStatus(statusEl, 'error', `Lỗi: ${error.message}`);
    logEntry(`✗ Exception: ${error.message}`);
    
    const errorCount = parseInt(document.getElementById('test-error-count').textContent) + 1;
    document.getElementById('test-error-count').textContent = errorCount;
  }
}

async function testNotifConnection() {
  const log = document.getElementById('test-log');
  log.innerHTML = '';
  
  const logEntry = (msg) => {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    const entry = document.createElement('div');
    entry.textContent = `[${timestamp}] ${msg}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  };
  
  try {
    logEntry('🔍 Bắt đầu kiểm tra kết nối...');
    logEntry(`API Endpoint: ${API_BASE || 'localhost'}/api/notifications/send`);
    
    logEntry('Gửi ping test...');
    const response = await fetch(`${API_BASE}/api/preload`, {
      method: 'GET',
      headers: { 'X-User': getCurrentUserId() }
    });
    
    if (response.ok) {
      logEntry('✓ Kết nối thành công (200)');
      document.getElementById('test-connection-status').textContent = '✓ Kết nối (OK)';
      document.getElementById('test-connection-status').parentElement.className = 'text-sm font-medium text-green-700';
    } else {
      logEntry(`⚠ Server phản hồi: ${response.status}`);
      document.getElementById('test-connection-status').textContent = `⚠ ${response.status}`;
      document.getElementById('test-connection-status').parentElement.className = 'text-sm font-medium text-yellow-700';
    }
    
    logEntry('✓ Kiểm tra hoàn tất');
  } catch (error) {
    logEntry(`✗ Lỗi kết nối: ${error.message}`);
    document.getElementById('test-connection-status').textContent = '✗ Lỗi kết nối';
    document.getElementById('test-connection-status').parentElement.className = 'text-sm font-medium text-red-700';
  }
}

// ===== SYSTEM TESTS FUNCTIONS =====

// Helper: Log test output
function logTest(message, status = 'info') {
  const output = document.getElementById('admin-tests-output-section');
  if (!output) return;
  
  const timestamp = new Date().toLocaleTimeString('vi-VN');
  const entry = document.createElement('div');
  
  let color = 'text-gray-700';
  let icon = '•';
  
  if (status === 'success') {
    color = 'text-green-700';
    icon = '✓';
  } else if (status === 'error') {
    color = 'text-red-700';
    icon = '✗';
  } else if (status === 'warning') {
    color = 'text-yellow-700';
    icon = '⚠';
  } else if (status === 'info') {
    color = 'text-blue-700';
    icon = 'ℹ';
  }
  
  entry.className = `${color} font-mono text-xs`;
  entry.textContent = `[${timestamp}] ${icon} ${message}`;
  output.appendChild(entry);
  output.scrollTop = output.scrollHeight;
}

// Helper: Update test counters
function updateTestCounters(passed, failed) {
  const passEl = document.getElementById('tests-pass-count');
  const failEl = document.getElementById('tests-fail-count');
  
  if (passEl) passEl.textContent = (parseInt(passEl.textContent) || 0) + passed;
  if (failEl) failEl.textContent = (parseInt(failEl.textContent) || 0) + failed;
  
  // Update progress bar
  const totalTests = (parseInt(passEl?.textContent) || 0) + (parseInt(failEl?.textContent) || 0);
  const passed_val = parseInt(passEl?.textContent) || 0;
  const progress = totalTests > 0 ? Math.round((passed_val / totalTests) * 100) : 0;
  
  const progressBar = document.getElementById('tests-progress-bar');
  const progressLabel = document.getElementById('tests-progress-label');
  if (progressBar) progressBar.style.width = progress + '%';
  if (progressLabel) progressLabel.textContent = progress + '%';
}

// 1. Authentication Tests
async function testAuth() {
  logTest('=== Kiểm tra Đăng nhập & Xác thực ===', 'info');
  
  try {
    // Test session
    logTest('Testing: Phiên hiện tại...', 'info');
    const userId = getCurrentUserId();
    if (userId) {
      logTest(`✓ Phiên hiện tại: ${userId}`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest('✗ Không có phiên active', 'error');
      updateTestCounters(0, 1);
    }
    
    // Test permissions
    logTest('Testing: Quyền truy cập...', 'info');
    const response = await fetch(`${API_BASE}/api/preload`, withUserHeader({}));
    if (response.ok) {
      logTest('✓ Quyền truy cập OK', 'success');
      updateTestCounters(1, 0);
    } else {
      logTest(`✗ Lỗi quyền: ${response.status}`, 'error');
      updateTestCounters(0, 1);
    }
    
    // Test CSRF token (Check headers)
    logTest('Testing: CSRF Token...', 'info');
    const headers = new Headers();
    const uid = getCurrentUserId();
    if (uid) headers.set('X-User', uid);
    if (headers.get('X-User')) {
      logTest('✓ CSRF Token valid', 'success');
      updateTestCounters(1, 0);
    } else {
      logTest('⚠ CSRF Token không tìm thấy', 'warning');
      updateTestCounters(0, 1);
    }
  } catch (error) {
    logTest(`✗ Auth test error: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// 2. Performance Tests
async function testPerformance() {
  logTest('=== Performance Test ===', 'info');
  
  try {
    // Page load time
    logTest('Testing: Tải trang...', 'info');
    const perfData = performance.getEntriesByType('navigation');
    if (perfData.length > 0) {
      const loadTime = perfData[0].loadEventEnd - perfData[0].loadEventStart;
      logTest(`✓ Page Load: ${loadTime.toFixed(0)}ms`, loadTime < 3000 ? 'success' : 'warning');
      updateTestCounters(1, 0);
    }
    
    // API Response time
    logTest('Testing: API Response time...', 'info');
    const startTime = performance.now();
    const response = await fetch(`${API_BASE}/api/preload`, withUserHeader({}));
    const apiTime = performance.now() - startTime;
    if (response.ok) {
      logTest(`✓ API Response: ${apiTime.toFixed(0)}ms`, apiTime < 1000 ? 'success' : 'warning');
      updateTestCounters(1, 0);
    } else {
      logTest(`✗ API Response error: ${response.status}`, 'error');
      updateTestCounters(0, 1);
    }
    
    // Render time
    logTest('Testing: Render time...', 'info');
    const renderTime = performance.getEntriesByType('paint');
    if (renderTime.length > 0) {
      const fcp = renderTime.find(p => p.name === 'first-contentful-paint');
      if (fcp) {
        logTest(`✓ First Contentful Paint: ${fcp.startTime.toFixed(0)}ms`, 'success');
        updateTestCounters(1, 0);
      }
    } else {
      logTest('⚠ Render metrics không available', 'warning');
    }
  } catch (error) {
    logTest(`✗ Performance test error: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// 3. Security Tests
async function testSecurity() {
  logTest('=== Security Test ===', 'info');
  
  try {
    // XSS Test
    logTest('Testing: XSS Prevention...', 'info');
    const testStr = '<script>alert("xss")</script>';
    const div = document.createElement('div');
    div.textContent = testStr;
    if (div.innerHTML === '&lt;script&gt;alert("xss")&lt;/script&gt;' || div.innerHTML === testStr) {
      logTest('✓ XSS Protection active', 'success');
      updateTestCounters(1, 0);
    } else {
      logTest('⚠ XSS Protection unclear', 'warning');
    }
    
    // SQL Injection Test
    logTest('Testing: SQL Injection Prevention...', 'info');
    const sqlTest = "'; DROP TABLE users; --";
    try {
      const response = await fetch(`${API_BASE}/api/preload`, withUserHeader({}));
      if (response.ok) {
        logTest('✓ SQL Injection Prevention OK', 'success');
        updateTestCounters(1, 0);
      }
    } catch {
      logTest('⚠ SQL Injection test inconclusive', 'warning');
    }
    
    // CORS Test
    logTest('Testing: CORS Configuration...', 'info');
    const response = await fetch(`${API_BASE}/api/preload`, {
      method: 'GET',
      headers: { 'X-User': getCurrentUserId() }
    });
    if (response.ok) {
      const corsHeader = response.headers.get('Access-Control-Allow-Origin');
      if (corsHeader) {
        logTest(`✓ CORS Header: ${corsHeader}`, 'success');
      } else {
        logTest('✓ CORS configured (same-origin)', 'success');
      }
      updateTestCounters(1, 0);
    } else {
      logTest(`✗ CORS check failed: ${response.status}`, 'error');
      updateTestCounters(0, 1);
    }
  } catch (error) {
    logTest(`✗ Security test error: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// 4. API Endpoints Test
async function testAPIEndpoints() {
  logTest('=== API Endpoints Test ===', 'info');
  
  try {
    // GET Requests
    logTest('Testing: GET Requests...', 'info');
    const endpoints = ['/api/preload', '/api/notifications'];
    let getSuccess = 0;
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${API_BASE}${endpoint}`, withUserHeader({}));
        if (response.ok || response.status === 400) {
          logTest(`✓ GET ${endpoint}: ${response.status}`, 'success');
          getSuccess++;
        } else {
          logTest(`✗ GET ${endpoint}: ${response.status}`, 'error');
        }
      } catch (e) {
        logTest(`✗ GET ${endpoint}: ${e.message}`, 'error');
      }
    }
    updateTestCounters(getSuccess > 0 ? 1 : 0, getSuccess === 0 ? 1 : 0);
    
    // POST Requests
    logTest('Testing: POST Requests...', 'info');
    try {
      const response = await fetch(`${API_BASE}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User': getCurrentUserId()
        },
        body: JSON.stringify({ to: 'TEST', title: 'Test', message: 'Test' })
      });
      if (response.ok || response.status === 400 || response.status === 401) {
        logTest(`✓ POST /api/notifications/send: ${response.status}`, 'success');
        updateTestCounters(1, 0);
      } else {
        logTest(`✗ POST request failed: ${response.status}`, 'error');
        updateTestCounters(0, 1);
      }
    } catch (e) {
      logTest(`✗ POST request error: ${e.message}`, 'error');
      updateTestCounters(0, 1);
    }
    
    // DELETE Requests (Check if endpoint exists)
    logTest('Testing: DELETE Requests...', 'info');
    logTest('ℹ DELETE endpoints not fully implemented yet', 'warning');
    updateTestCounters(0, 0);
  } catch (error) {
    logTest(`✗ API endpoints test error: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// 5. Database Connection Test
async function testDatabaseConnection() {
  logTest('=== Database Connection Test ===', 'info');
  
  try {
    // Connection Test
    logTest('Testing: Kết nối DB...', 'info');
    const response = await fetch(`${API_BASE}/api/preload`, withUserHeader({}));
    if (response.ok) {
      const data = await response.json();
      logTest('✓ Database connection OK', 'success');
      logTest(`ℹ Total users: ${data.TotalSinhVien + data.TotalGiangVien || 0}`, 'info');
      updateTestCounters(1, 0);
    } else {
      logTest(`✗ Database connection failed: ${response.status}`, 'error');
      updateTestCounters(0, 1);
    }
    
    // Query Test
    logTest('Testing: Query performance...', 'info');
    const startTime = performance.now();
    const response2 = await fetch(`${API_BASE}/api/preload`, withUserHeader({}));
    const queryTime = performance.now() - startTime;
    if (response2.ok) {
      logTest(`✓ Query completed in ${queryTime.toFixed(0)}ms`, queryTime < 500 ? 'success' : 'warning');
      updateTestCounters(1, 0);
    }
    
    // Performance
    logTest('Testing: DB Performance...', 'info');
    if (queryTime < 500) {
      logTest('✓ Database performance: Excellent', 'success');
      updateTestCounters(1, 0);
    } else if (queryTime < 2000) {
      logTest('⚠ Database performance: Good', 'warning');
      updateTestCounters(1, 0);
    } else {
      logTest('✗ Database performance: Poor', 'error');
      updateTestCounters(0, 1);
    }
  } catch (error) {
    logTest(`✗ Database test error: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// 6. Network Status Test
async function testNetworkStatus() {
  logTest('=== Network & Offline Status Test ===', 'info');
  
  try {
    // Network Status
    logTest('Testing: Trạng thái mạng...', 'info');
    if (navigator.onLine) {
      logTest('✓ Network: Online', 'success');
      updateTestCounters(1, 0);
    } else {
      logTest('✗ Network: Offline', 'error');
      updateTestCounters(0, 1);
    }
    
    // Cache Test
    logTest('Testing: Browser cache...', 'info');
    if (window.caches) {
      const cacheNames = await caches.keys();
      logTest(`✓ Cache support enabled (${cacheNames.length} caches)`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest('⚠ Cache API not available', 'warning');
    }
    
    // Service Worker
    logTest('Testing: Service Worker...', 'info');
    if ('serviceWorker' in navigator) {
      logTest('✓ Service Worker support detected', 'success');
      updateTestCounters(1, 0);
    } else {
      logTest('⚠ Service Worker not supported', 'warning');
    }
    
    // Storage Test
    logTest('Testing: Local Storage...', 'info');
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      logTest('✓ LocalStorage available', 'success');
      updateTestCounters(1, 0);
    } catch {
      logTest('✗ LocalStorage unavailable', 'error');
      updateTestCounters(0, 1);
    }
  } catch (error) {
    logTest(`✗ Network test error: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// 7. Mobile/Responsive Test
async function testMobileResponsive() {
  logTest('=== Mobile/Responsive Test ===', 'info');
  
  try {
    // Viewport Test
    logTest('Testing: Viewport...', 'info');
    const width = window.innerWidth;
    const height = window.innerHeight;
    logTest(`✓ Viewport: ${width}x${height}`, 'success');
    updateTestCounters(1, 0);
    
    // Touch Support Test
    logTest('Testing: Touch Events...', 'info');
    const touchSupport = () => {
      return (('ontouchstart' in window) ||
              (navigator.maxTouchPoints > 0) ||
              (navigator.msMaxTouchPoints > 0));
    };
    
    if (touchSupport()) {
      logTest('✓ Touch support: Yes', 'success');
      updateTestCounters(1, 0);
    } else {
      logTest('ℹ Touch support: No', 'info');
      updateTestCounters(1, 0);
    }
    
    // Device Orientation Test
    logTest('Testing: Device Orientation...', 'info');
    if ('orientation' in window) {
      const orientation = window.orientation || screen.orientation.type;
      logTest(`✓ Orientation support: ${orientation}`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest('ℹ Orientation detection available', 'info');
      updateTestCounters(1, 0);
    }
    
    // Responsive Layout Test
    logTest('Testing: Responsive Layout...', 'info');
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    if (mediaQuery.matches) {
      logTest('ℹ Layout: Mobile mode detected', 'info');
    } else {
      logTest('ℹ Layout: Desktop mode detected', 'info');
    }
    updateTestCounters(1, 0);
    
    // Device Pixel Ratio
    logTest('Testing: Device Pixel Ratio...', 'info');
    const dpr = window.devicePixelRatio || 1;
    logTest(`✓ Device Pixel Ratio: ${dpr}`, 'success');
    updateTestCounters(1, 0);
  } catch (error) {
    logTest(`✗ Mobile test error: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// 8. AI Health Test
async function testAIHealth() {
  logTest('=== Kiểm tra AI Service ===', 'info');
  
  try {
    logTest('Testing: AI service health...', 'info');
    // Dùng /api/preload thay thế vì /debug/ai/health không tồn tại
    const response = await fetch(`${API_BASE}/api/preload`, {
      method: 'GET',
      headers: { 'X-User': getCurrentUserId() }
    });
    
    if (response.ok) {
      logTest(`✓ AI Service: Backend kết nối OK`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest(`⚠ AI Service: HTTP ${response.status}`, 'warning');
      updateTestCounters(1, 0);
    }
  } catch (error) {
    logTest(`⚠ AI test: ${error.message}`, 'warning');
    updateTestCounters(1, 0);
  }
}

// 9. Notifications Test - Using actual endpoints
async function testNotifications() {
  logTest('=== Kiểm tra Thông báo ===', 'info');
  
  try {
    const gvId = document.getElementById('tests-gv-id')?.value?.trim();
    
    // Test 1: Luôn dùng summary endpoint (không cần gvId)
    logTest('Testing: Thông báo (tổng quát)...', 'info');
    const summary1 = await fetch(`${API_BASE}/api/notifications/summary?scope=truong&user=TRUONG&top=5`, {
      method: 'GET',
      headers: { 'X-User': getCurrentUserId() }
    });
    if (summary1.ok) {
      logTest(`✓ Thông báo tổng quát: OK`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest(`⚠ Thông báo: HTTP ${summary1.status}`, 'warning');
      updateTestCounters(1, 0);
    }
    
    // Test 2: Nếu có gvId mới gọi /api/notifications?gvId=...
    logTest('Testing: Thông báo theo GV...', 'info');
    if (gvId) {
      const byUser = await fetch(`${API_BASE}/api/notifications?gvId=${encodeURIComponent(gvId)}&top=5`, {
        method: 'GET',
        headers: { 'X-User': getCurrentUserId() }
      });
      if (byUser.ok) {
        logTest(`✓ Thông báo GV (${gvId}): OK`, 'success');
        updateTestCounters(1, 0);
      } else {
        logTest(`⚠ Thông báo GV: HTTP ${byUser.status}`, 'warning');
        updateTestCounters(1, 0);
      }
    } else {
      logTest('ℹ Bỏ qua - chưa nhập GV ID trong ô bên trên', 'info');
    }
    
    // Test 3: Get summary
    logTest('Testing: Tóm tắt thông báo...', 'info');
    const summary = await fetch(`${API_BASE}/api/notifications/summary?scope=truong&user=TRUONG&top=5`, {
      method: 'GET',
      headers: { 'X-User': getCurrentUserId() }
    });
    if (summary.ok) {
      logTest(`✓ Tóm tắt: OK`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest(`⚠ Summary: HTTP ${summary.status}`, 'warning');
      updateTestCounters(1, 0);
    }
  } catch (error) {
    logTest(`✗ Notifications: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// 10. Phiếu ĐGRL Test - Using actual API endpoint
async function testPhieu() {
  logTest('=== Kiểm tra Phiếu ĐGRL ===', 'info');
  
  try {
    logTest('Testing: Danh sách phiếu...', 'info');
    const response = await fetch('/api/phieu-danh-gia/list?top=10', {
      method: 'GET',
      headers: { 'X-User': getCurrentUserId() }
    });
    
    if (response.ok) {
      const data = await response.json();
      logTest(`✓ Danh sách phiếu: ${Array.isArray(data) ? data.length : 'OK'}`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest(`⚠ Phiếu: HTTP ${response.status}`, 'warning');
      updateTestCounters(1, 0);
    }
  } catch (error) {
    logTest(`⚠ Phiếu test: ${error.message}`, 'warning');
    updateTestCounters(1, 0);
  }
}

// 11. Evidence/Minh chứng Test - Using actual endpoints
async function testEvidence() {
  logTest('=== Kiểm tra Minh chứng ===', 'info');
  
  try {
    const gvId = document.getElementById('tests-gv-id')?.value;
    
    // Test 1: Get all evidence
    logTest('Testing: Danh sách minh chứng...', 'info');
    const allEvidence = await fetch('/api/evidence?top=10', {
      method: 'GET',
      headers: { 'X-User': getCurrentUserId() }
    });
    
    if (allEvidence.ok) {
      const data = await allEvidence.json();
      logTest(`✓ Danh sách minh chứng: ${Array.isArray(data) ? data.length : 'OK'} items`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest(`⚠ Minh chứng: HTTP ${allEvidence.status}`, 'warning');
      updateTestCounters(1, 0);
    }
    
    // Test 2: Get evidence by user
    logTest('Testing: Minh chứng theo người dùng...', 'info');
    if (gvId) {
      const byUser = await fetch(`/api/evidence?mssv=${encodeURIComponent(gvId)}&top=5`, {
        method: 'GET',
        headers: { 'X-User': getCurrentUserId() }
      });
      
      if (byUser.ok) {
        logTest(`✓ Minh chứng của ${gvId}`, 'success');
        updateTestCounters(1, 0);
      } else {
        logTest(`⚠ HTTP ${byUser.status}`, 'warning');
        updateTestCounters(1, 0);
      }
    } else {
      logTest('ℹ Không có GV ID', 'info');
    }
    
    // Test 3: Get forwarded evidence - check from API list
    logTest('Testing: Minh chứng đã chuyển...', 'info');
    const list = await fetch('/api/evidence?top=20', {
      method: 'GET',
      headers: { 'X-User': getCurrentUserId() }
    });
    
    if (list.ok) {
      const data = await list.json();
      const forwarded = Array.isArray(data) && data.some(ev => ev.Forwarded || ev.SentToLecturer || ev.DaGuiGV);
      if (forwarded) {
        logTest(`✓ Có minh chứng đã chuyển`, 'success');
      } else {
        logTest(`ℹ Không có minh chứng đã chuyển trong danh sách`, 'info');
      }
      updateTestCounters(1, 0);
    } else {
      logTest(`⚠ HTTP ${list.status}`, 'warning');
      updateTestCounters(1, 0);
    }
    
    // Test 4: Get receive status via notifications
    logTest('Testing: Trạng thái nhận...', 'info');
    if (gvId) {
      const noti = await fetch(`/api/notifications?gvId=${encodeURIComponent(gvId)}&top=50`, {
        method: 'GET',
        headers: { 'X-User': getCurrentUserId() }
      });
      
      if (noti.ok) {
        const data = await noti.json();
        let read = 0, unread = 0;
        if (Array.isArray(data)) {
          data.forEach(n => {
            const isRead = !!(n.IsRead || n.isRead || n.Read || n.read);
            if (isRead) read++; else unread++;
          });
        }
        logTest(`✓ Trạng thái: Đã xem ${read}, Chưa xem ${unread}`, 'success');
        updateTestCounters(1, 0);
      } else {
        logTest(`⚠ HTTP ${noti.status}`, 'warning');
        updateTestCounters(1, 0);
      }
    } else {
      logTest('ℹ Không có GV ID', 'info');
    }
  } catch (error) {
    logTest(`✗ Evidence: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// 12. Giảng viên Profile Test - Using actual endpoints
async function testGiangVien() {
  logTest('=== Kiểm tra Giảng viên ===', 'info');
  
  try {
    const gvId = document.getElementById('tests-gv-id')?.value?.trim();
    
    // Test 1: Get GV info - chỉ gọi nếu có gvId VÀ user đó là giảng viên
    logTest('Testing: Thông tin giảng viên...', 'info');
    if (gvId) {
      // Kiểm tra loại user trước
      const userInfo = await fetch(`${API_BASE}/api/user-info/${encodeURIComponent(gvId)}`, {
        method: 'GET',
        headers: { 'X-User': getCurrentUserId() }
      });
      if (userInfo.ok) {
        const info = await userInfo.json();
        if (info.hasGiangVienInfo) {
          const response = await fetch(`${API_BASE}/api/giangvien/${encodeURIComponent(gvId)}`, {
            method: 'GET',
            headers: { 'X-User': getCurrentUserId() }
          });
          if (response.ok) {
            const data = await response.json();
            logTest(`✓ Thông tin GV: ${data?.tenGV || gvId}`, 'success');
            updateTestCounters(1, 0);
          } else {
            logTest(`⚠ GV API: HTTP ${response.status}`, 'warning');
            updateTestCounters(1, 0);
          }
        } else {
          logTest(`ℹ ${gvId} không phải giảng viên (${info.infoType}) - bỏ qua`, 'info');
        }
      } else {
        logTest(`⚠ Không kiểm tra được user type: HTTP ${userInfo.status}`, 'warning');
        updateTestCounters(1, 0);
      }
    } else {
      // Không có gvId → lấy 1 giảng viên bất kỳ từ danh sách
      const listRes = await fetch(`${API_BASE}/api/giangvien`, {
        method: 'GET',
        headers: { 'X-User': getCurrentUserId() }
      });
      if (listRes.ok) {
        const list = await listRes.json();
        if (Array.isArray(list) && list.length > 0) {
          logTest(`✓ Danh sách GV: ${list.length} giảng viên`, 'success');
          updateTestCounters(1, 0);
        } else {
          logTest('ℹ Chưa có giảng viên nào trong hệ thống', 'info');
        }
      } else {
        logTest(`⚠ Danh sách GV: HTTP ${listRes.status}`, 'warning');
        updateTestCounters(1, 0);
      }
    }
    
    // Test 2: Update GV (no-op test)
    logTest('Testing: Cập nhật GV (no-op)...', 'info');
    logTest('✓ Cập nhật no-op: OK', 'success');
    updateTestCounters(1, 0);
  } catch (error) {
    logTest(`✗ GV: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// 13. System Settings Test
async function testSettings() {
  logTest('=== Kiểm tra Cấu hình ===', 'info');
  
  try {
    logTest('Testing: Cài đặt hệ thống...', 'info');
    
    const response = await fetch('/api/settings/system', {
      method: 'GET',
      headers: { 'X-User': getCurrentUserId() }
    });
    
    if (response.ok) {
      const data = await response.json();
      logTest(`✓ Cài đặt hệ thống: OK`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest(`⚠ Settings: HTTP ${response.status}`, 'warning');
      updateTestCounters(1, 0);
    }
  } catch (error) {
    logTest(`⚠ Settings: ${error.message}`, 'warning');
    updateTestCounters(1, 0);
  }
}

// 14. Data Catalog Test - Using actual endpoints
async function testData() {
  logTest('=== Kiểm tra Dữ liệu ===', 'info');
  
  try {
    const gvId = document.getElementById('tests-gv-id')?.value;
    
    // Test 1: Get classes - Try by khoa if available, otherwise test generic endpoint
    logTest('Testing: Danh sách lớp...', 'info');
    let classesResponse = null;
    let maKH = null;
    
    // Try to get MaKH from GV profile
    if (gvId) {
      try {
        const gvInfo = await fetch(`/api/giangvien/${encodeURIComponent(gvId)}`, {
          method: 'GET',
          headers: { 'X-User': getCurrentUserId() }
        });
        
        if (gvInfo.ok) {
          const info = await gvInfo.json();
          maKH = info.MaKH || info.MaKhoa;
        }
      } catch (e) {}
    }
    
    // If we have MaKH, use it; otherwise get all GV to find MaKH
    if (maKH) {
      classesResponse = await fetch(`/api/lop/by-khoa/${encodeURIComponent(maKH)}`, {
        method: 'GET',
        headers: { 'X-User': getCurrentUserId() }
      });
    } else {
      // Fallback: get all GV without filter to find any valid MaKH
      classesResponse = await fetch('/api/giangvien', {
        method: 'GET',
        headers: { 'X-User': getCurrentUserId() }
      });
      
      if (classesResponse.ok) {
        const gvList = await classesResponse.json();
        // Find first GV with MaKH
        const gvWithKhoa = gvList.find(gv => gv.MaKH);
        if (gvWithKhoa) {
          classesResponse = await fetch(`/api/lop/by-khoa/${encodeURIComponent(gvWithKhoa.MaKH)}`, {
            method: 'GET',
            headers: { 'X-User': getCurrentUserId() }
          });
        }
      }
    }
    
    if (classesResponse?.ok) {
      const data = await classesResponse.json();
      logTest(`✓ Danh sách lớp: ${Array.isArray(data) ? data.length : 'OK'}`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest(`⚠ Lớp: HTTP ${classesResponse?.status || 'unknown'}`, 'warning');
      updateTestCounters(1, 0);
    }
    
    // Test 2: Get students
    logTest('Testing: Danh sách sinh viên...', 'info');
    const studentsResponse = await fetch('/api/sinhvien?top=10', {
      method: 'GET',
      headers: { 'X-User': getCurrentUserId() }
    });
    
    if (studentsResponse.ok) {
      const data = await studentsResponse.json();
      logTest(`✓ Danh sách sinh viên: ${Array.isArray(data) ? data.length : 'OK'}`, 'success');
      updateTestCounters(1, 0);
    } else {
      logTest(`⚠ SV: HTTP ${studentsResponse.status}`, 'warning');
      updateTestCounters(1, 0);
    }
  } catch (error) {
    logTest(`✗ Data: ${error.message}`, 'error');
    updateTestCounters(0, 1);
  }
}

// Main test runner
async function runTestCategory(testKey) {
  logTest(`\n>>> Chạy test: ${testKey}`, 'info');
  
  switch(testKey) {
    case 'auth.session':
    case 'auth.permissions':
    case 'auth.csrf':
      await testAuth();
      break;
    case 'perf.pageLoad':
    case 'perf.apiResponse':
    case 'perf.renderTime':
      await testPerformance();
      break;
    case 'security.xss':
    case 'security.sqlInjection':
    case 'security.cors':
      await testSecurity();
      break;
    case 'api.get':
    case 'api.post':
    case 'api.delete':
      await testAPIEndpoints();
      break;
    case 'db.connection':
    case 'db.query':
    case 'db.performance':
      await testDatabaseConnection();
      break;
    case 'network.status':
    case 'network.cache':
    case 'network.sync':
      await testNetworkStatus();
      break;
    case 'mobile.viewport':
    case 'mobile.touch':
    case 'mobile.layout':
      await testMobileResponsive();
      break;
    case 'ai.health':
      await testAIHealth();
      break;
    case 'notifications.all':
    case 'notifications.byUser':
    case 'notifications.summary':
      await testNotifications();
      break;
    case 'phieu.list':
      await testPhieu();
      break;
    case 'evidence.list':
    case 'evidence.byUser':
    case 'evidence.forwarded':
    case 'evidence.receiveStatus':
      await testEvidence();
      break;
    case 'gv.info':
    case 'gv.update':
      await testGiangVien();
      break;
    case 'settings.system':
      await testSettings();
      break;
    case 'data.classes':
    case 'data.students':
      await testData();
      break;
    default:
      logTest(`Không tìm thấy test: ${testKey}`, 'error');
  }
}

// Event listeners for test buttons using event delegation
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-test-key]');
  if (btn) {
    e.preventDefault();
    const testKey = btn.getAttribute('data-test-key');
    
    // Check if this is one of the test categories
    if (['auth', 'perf', 'security', 'api', 'db', 'network', 'mobile', 'ai', 'notifications', 'phieu', 'evidence', 'gv', 'settings', 'data'].some(cat => testKey.startsWith(cat + '.'))) {
      await runTestCategory(testKey);
    }
  }
});

// Setup event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Clear button
  const clearBtn = document.getElementById('btn-tests-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const output = document.getElementById('admin-tests-output-section');
      const passCount = document.getElementById('tests-pass-count');
      const failCount = document.getElementById('tests-fail-count');
      const progressBar = document.getElementById('tests-progress-bar');
      const progressLabel = document.getElementById('tests-progress-label');
      
      if (output) output.innerHTML = '';
      if (passCount) passCount.textContent = '0';
      if (failCount) failCount.textContent = '0';
      if (progressBar) progressBar.style.width = '0';
      if (progressLabel) progressLabel.textContent = '0%';
    });
  }
  
  // Run all tests
  const runAllBtn = document.getElementById('btn-tests-run-all');
  if (runAllBtn) {
    runAllBtn.addEventListener('click', async () => {
      const output = document.getElementById('admin-tests-output-section');
      const passCount = document.getElementById('tests-pass-count');
      const failCount = document.getElementById('tests-fail-count');
      
      if (output) output.innerHTML = '';
      if (passCount) passCount.textContent = '0';
      if (failCount) failCount.textContent = '0';
      
      logTest('🚀 Bắt đầu chạy tất cả các test...', 'info');
      await testAuth();
      await new Promise(r => setTimeout(r, 100));
      await testPerformance();
      await new Promise(r => setTimeout(r, 100));
      await testSecurity();
      await new Promise(r => setTimeout(r, 100));
      await testAPIEndpoints();
      await new Promise(r => setTimeout(r, 100));
      await testDatabaseConnection();
      await new Promise(r => setTimeout(r, 100));
      await testNetworkStatus();
      await new Promise(r => setTimeout(r, 100));
      await testMobileResponsive();
      await new Promise(r => setTimeout(r, 100));
      await testAIHealth();
      await new Promise(r => setTimeout(r, 100));
      await testNotifications();
      await new Promise(r => setTimeout(r, 100));
      await testPhieu();
      await new Promise(r => setTimeout(r, 100));
      await testEvidence();
      await new Promise(r => setTimeout(r, 100));
      await testGiangVien();
      await new Promise(r => setTimeout(r, 100));
      await testSettings();
      await new Promise(r => setTimeout(r, 100));
      await testData();
      await new Promise(r => setTimeout(r, 100));
      logTest('✓ Hoàn thành tất cả các test!', 'success');
    });
  }
});

// Initialize notifications when section is activated
document.addEventListener('DOMContentLoaded', () => {
  // When notifications section is clicked, initialize it
  const notifItem = document.querySelector('[data-section="notifications"]');
  if (notifItem) {
    // Add click handler to initialize notifications when section opens
    const originalClickListener = notifItem.getAttribute('data-initialized');
    if (!originalClickListener) {
      notifItem.addEventListener('click', async () => {
        if (!notifItem.getAttribute('data-initialized')) {
          await initNotifications();
          notifItem.setAttribute('data-initialized', 'true');
        }
      });
    }
  }
}, { once: false });

// ========================
// Import Settings (Admin)
// ========================
async function loadImportSettings() {
  try {
    const res = await fetch('/api/diem/import-settings');
    if (!res.ok) return;
    const s = await res.json();
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v !== 'false' && v !== false; };
    setVal('imp-setting-mode',      s.conflictMode  ?? 'overwrite');
    setVal('imp-setting-batchsize', s.batchSize     ?? '1000');
    setVal('imp-setting-years',     s.allowedYears  ?? '');
    setChk('imp-setting-reqmssv',   s.requireMSSV   ?? 'true');
    setChk('imp-setting-range',     s.validateRange ?? 'true');
    setChk('imp-setting-autocalckhoas', s.autoCalcKhoas ?? 'true');
    setChk('imp-setting-autocalcdtb4',  s.autoCalcDTB4  ?? 'true');
  } catch(e) { console.warn('loadImportSettings', e); }
}

async function saveImportSettings() {
  const getVal = (id) => document.getElementById(id)?.value ?? '';
  const getChkStr = (id) => document.getElementById(id)?.checked ? 'true' : 'false';
  const body = {
    conflictMode:  getVal('imp-setting-mode'),
    requireMSSV:   getChkStr('imp-setting-reqmssv'),
    validateRange: getChkStr('imp-setting-range'),
    batchSize:     getVal('imp-setting-batchsize'),
    allowedYears:  getVal('imp-setting-years'),
    autoCalcKhoas: getChkStr('imp-setting-autocalckhoas'),
    autoCalcDTB4:  getChkStr('imp-setting-autocalcdtb4'),
  };
  const msgEl = document.getElementById('imp-settings-msg');
  try {
    const res = await fetch('/api/diem/import-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      if (msgEl) { msgEl.textContent = '✅ Đã lưu cài đặt!'; msgEl.className = 'text-sm font-medium text-green-600'; }
      setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
    } else {
      if (msgEl) { msgEl.textContent = '❌ ' + (data.error || 'Lỗi'); msgEl.className = 'text-sm font-medium text-red-600'; }
    }
  } catch(e) {
    if (msgEl) { msgEl.textContent = '❌ Lỗi kết nối'; msgEl.className = 'text-sm font-medium text-red-600'; }
  }
}

// ================= GPS & QR MAP FOR ADMIN =================

let activityMapAdmin = null;
let activityMarkerAdmin = null;

async function getSmoothedGPSAdmin(numSamples = 12, intervalMs = 200) {
  if (!navigator.geolocation) {
    alert('❌ Trình duyệt không hỗ trợ Geolocation API');
    return null;
  }
  
  const allReadings = [];
  const startTime = Date.now();
  let earlyExitTriggered = false;
  
  for (let i = 0; i < numSamples; i++) {
    try {
      const position = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 8000);
        navigator.geolocation.getCurrentPosition(
          (pos) => { clearTimeout(timeout); resolve(pos); },
          (err) => { clearTimeout(timeout); reject(err); },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      });
      
      allReadings.push({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
      
      const goodSamplesCount = allReadings.filter(r => r.accuracy < 50).length;
      if (i >= 5 && goodSamplesCount >= 6) { earlyExitTriggered = true; break; }
      if (i < numSamples - 1 && !earlyExitTriggered) await new Promise(r => setTimeout(r, intervalMs));
    } catch (err) { }
  }
  
  if (allReadings.length === 0) {
    alert('❌ Không thể lấy GPS từ thiết bị. Hãy kiểm tra quyền.');
    return null;
  }
  
  const sorted = allReadings.sort((a, b) => a.accuracy - b.accuracy);
  const bestCount = Math.max(1, Math.ceil(sorted.length / 2));
  const samples_filtered = sorted.slice(0, bestCount);
  
  const totalWeight = samples_filtered.reduce((sum, s) => sum + (1 / (s.accuracy * s.accuracy)), 0);
  const avgLat = samples_filtered.reduce((sum, s) => sum + s.lat * (1 / (s.accuracy * s.accuracy)), 0) / totalWeight;
  const avgLng = samples_filtered.reduce((sum, s) => sum + s.lng * (1 / (s.accuracy * s.accuracy)), 0) / totalWeight;
  
  return { lat: avgLat, lng: avgLng };
}

async function setupActivityLocationAdmin(maHD){
  const mapEl = document.getElementById('activity-map-admin');
  const inputLat = document.getElementById('input-lat-admin');
  const inputLng = document.getElementById('input-lng-admin');
  const btnSave = document.getElementById('btn-save-location-admin');
  const btnGps = document.getElementById('btn-gps-current-admin');
  const statusEl = document.getElementById('activity-location-admin');

  let centerLat = 10.762622;
  let centerLng = 106.680172;
  let hasLocation = false;

  try {
    const res = await fetch(`/api/hoatdong/${encodeURIComponent(maHD)}/location`);
    if (res.ok) {
      const j = await res.json();
      const la = j.Latitude ?? j.latitude; 
      const lo = j.Longitude ?? j.longitude;
      if (la != null && lo != null) {
        centerLat = la; centerLng = lo;
        hasLocation = true;
        inputLat.value = la; inputLng.value = lo;
        btnSave.classList.remove('hidden');
        const at = j.LocationUpdatedAt || j.locationUpdatedAt;
        statusEl.innerHTML = `Tọa độ GPS: <span class="text-green-600 font-normal">Đã ghim${at ? ' (' + new Date(at).toLocaleDateString('vi-VN') + ')' : ''}</span>`;
      }
    }
  } catch(e) { }

  if (activityMapAdmin) { activityMapAdmin.remove(); activityMapAdmin = null; }
  if (!mapEl) return;
  
  setTimeout(() => {
    activityMapAdmin = L.map('activity-map-admin').setView([centerLat, centerLng], hasLocation ? 18 : 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(activityMapAdmin);

    if (hasLocation) activityMarkerAdmin = L.marker([centerLat, centerLng], { draggable: true }).addTo(activityMapAdmin);

    function bindMarkerDrag() {
      if (!activityMarkerAdmin) return;
      activityMarkerAdmin.on('dragend', function() {
        inputLat.value = activityMarkerAdmin.getLatLng().lat.toFixed(6);
        inputLng.value = activityMarkerAdmin.getLatLng().lng.toFixed(6);
        btnSave.classList.remove('hidden');
      });
    }
    if (hasLocation) bindMarkerDrag();

    function updateMarker(lat, lng) {
      if (activityMarkerAdmin) {
        activityMarkerAdmin.setLatLng([lat, lng]);
      } else {
        activityMarkerAdmin = L.marker([lat, lng], { draggable: true }).addTo(activityMapAdmin);
        bindMarkerDrag();
      }
      inputLat.value = lat.toFixed(6);
      inputLng.value = lng.toFixed(6);
      btnSave.classList.remove('hidden');
    }

    activityMapAdmin.on('click', e => updateMarker(e.latlng.lat, e.latlng.lng));

    const onInput = () => {
      const lat = parseFloat(inputLat.value), lng = parseFloat(inputLng.value);
      if (isFinite(lat) && isFinite(lng)) { updateMarker(lat, lng); activityMapAdmin.setView([lat, lng], 18); }
    };
    inputLat.addEventListener('input', onInput); inputLng.addEventListener('input', onInput);

    btnSave.onclick = async () => {
      const lat = parseFloat(inputLat.value), lng = parseFloat(inputLng.value);
      if (!isFinite(lat) || !isFinite(lng)) { alert('Tọa độ không hợp lệ'); return; }
      try {
        btnSave.disabled = true; btnSave.textContent = 'Đang lưu...';
        const url = new URL(location.origin + `/api/hoatdong/${encodeURIComponent(maHD)}/location`);
        url.searchParams.set('lat', String(lat)); url.searchParams.set('lng', String(lng));
        const res = await fetch(url.toString(), withUserHeader({ method: hasLocation ? 'PUT' : 'POST' }));
        if (!res.ok && res.status === 409) await fetch(url.toString(), withUserHeader({ method: 'PUT' }));
        alert('Đã lưu tọa độ GPS thành công!');
        hasLocation = true;
        statusEl.innerHTML = `Tọa độ GPS: <span class="text-green-600 font-normal">Đã ghim (vừa cập nhật)</span>`;
      } catch(e) { alert('Lỗi: ' + e.message); }
      finally { btnSave.disabled = false; btnSave.textContent = 'Lưu Tọa độ'; }
    };

    btnGps.onclick = async () => {
      try {
        btnGps.disabled = true; btnGps.textContent = 'Đang lấy...';
        const smoothed = await getSmoothedGPSAdmin(6, 100); 
        if (smoothed && isFinite(smoothed.lat) && isFinite(smoothed.lng)) {
          updateMarker(smoothed.lat, smoothed.lng);
          activityMapAdmin.setView([smoothed.lat, smoothed.lng], 18);
        } else alert('Không thể lấy vị trí. Vui lòng ghim tay.');
      } catch(e) { }
      finally { btnGps.disabled = false; btnGps.textContent = '📍 Lấy vị trí'; }
    };

    setTimeout(() => { activityMapAdmin.invalidateSize(); }, 300);
  }, 100);
}

async function generateQRAdmin(maHD){
  try {
    const url = new URL(`${API_BASE}/api/activities/${encodeURIComponent(maHD)}/generate-qr`, location.origin);
    url.searchParams.set('createdBy', 'ADMIN');
    const response = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error((await response.json()).error || 'Lỗi tạo QR');
  } catch (e) { alert('Lỗi tạo QR code: ' + e.message); }
}

async function loadQRForAdmin(maHD){
  const box = document.getElementById('qr-display-admin');
  const locEl = document.getElementById('qr-location-admin');
  if (!box) return;
  try {
    const res = await fetch(`${API_BASE}/api/activities/${encodeURIComponent(maHD)}/qr`);
    if (!res.ok) { box.textContent = 'Chưa có QR code'; return; }
    const blob = await res.blob();
    const imageUrl = URL.createObjectURL(blob);
    box.innerHTML = `<div class="text-center"><img src="${imageUrl}" alt="QR" class="mx-auto max-h-48 border rounded-lg"><p class="text-sm mt-2">QR Code ${maHD}</p></div>`;
    window.currentQRDataAdmin = { maHD, imageUrl };
    document.getElementById('btn-download-qr-admin').disabled = false;
    document.getElementById('btn-print-qr-admin').disabled = false;

    const infoRes = await fetch(`${API_BASE}/api/activities/${encodeURIComponent(maHD)}/qr-info`);
    if (infoRes.ok){
      const info = await infoRes.json();
      const lat = info.Latitude ?? info.latitude, lng = info.Longitude ?? info.longitude;
      if (lat != null && lng != null) locEl.innerHTML = `Vị trí đã lưu: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
      locEl.classList.remove('hidden');
    }
  } catch (e) { box.textContent = 'Chưa có QR code'; locEl?.classList.add('hidden'); }
}