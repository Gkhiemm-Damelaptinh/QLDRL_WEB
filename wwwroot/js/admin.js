document.addEventListener("DOMContentLoaded", async () => {
  // ==== cấu hình API ====
  const API_BASE = "http://localhost:5204";

  // ==== phần tử UI ====
  const sidebar = document.getElementById("sidebar");
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const sidebarItems = document.querySelectorAll(".sidebar-item");
  const sectionContents = document.querySelectorAll(".section-content");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  // ==== Sidebar Navigation ====
  function initSidebar() {
    // Mobile menu toggle
    mobileMenuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("-translate-x-full");
    });

    // Sidebar item click
    sidebarItems.forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const targetSection = item.getAttribute("data-section");
        
        // Update active states
        sidebarItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");
        
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
        sidebar.classList.add("-translate-x-full");
      });
    });
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

  // ==== Dashboard Functions ====
  async function loadDashboardStats() {
    try {
      // Load statistics
      const statsRes = await fetch(`${API_BASE}/api/preload`);
      if (statsRes.ok) {
        const data = await statsRes.json();
        
        // Update stats cards
        document.getElementById("total-users").textContent = "0"; // Will be updated when we have user count API
        document.getElementById("total-faculties").textContent = data.khoa?.length || 0;
        document.getElementById("total-activities").textContent = data.hoatDongTruong?.length || 0;
        document.getElementById("total-records").textContent = "0"; // Will be updated when we have records API
      }
    } catch (error) {
      console.error("Error loading dashboard stats:", error);
    }
  }

  // ==== Users Management ====
  async function loadUsers() {
    try {
      const tbody = document.getElementById("users-table-body");
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      // This would be replaced with actual API call
      const users = []; // await fetch(`${API_BASE}/api/users`).then(r => r.json());
      
      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu người dùng</td></tr>';
        return;
      }

      tbody.innerHTML = users.map(user => `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.TenTK}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.TenNguoiDung}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.ChucVu}</td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="status-badge status-active">Hoạt động</span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <button class="text-blue-600 hover:text-blue-900 mr-2">Sửa</button>
            <button class="text-red-600 hover:text-red-900">Xóa</button>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      console.error("Error loading users:", error);
      document.getElementById("users-table-body").innerHTML = 
        '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
    }
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

      if (faculties.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu khoa</td></tr>';
        return;
      }

      tbody.innerHTML = faculties.map(faculty => `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${faculty.MaKhoa}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${faculty.TenKhoa}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">0</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">0</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <button class="text-blue-600 hover:text-blue-900 mr-2">Sửa</button>
            <button class="text-red-600 hover:text-red-900">Xóa</button>
          </td>
        </tr>
      `).join('');
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

      if (classes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu lớp</td></tr>';
        return;
      }

      tbody.innerHTML = classes.map(cls => `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${cls.MaLop}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${cls.TenLop}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${cls.TenKhoa || 'N/A'}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">0</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <button class="text-blue-600 hover:text-blue-900 mr-2">Sửa</button>
            <button class="text-red-600 hover:text-red-900">Xóa</button>
          </td>
        </tr>
      `).join('');
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
          </div>
          <div class="flex gap-2">
            <button class="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
              Xem chi tiết
            </button>
            <button class="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm">
              Sửa
            </button>
            <button class="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
              Xóa
            </button>
          </div>
        </div>
      `).join('');
    } catch (error) {
      console.error("Error loading activities:", error);
      document.getElementById("activities-grid").innerHTML = 
        '<div class="col-span-full text-center text-red-500">Lỗi tải dữ liệu</div>';
    }
  }

  // ==== System Configuration ====
  function initSystemConfig() {
    // Load current settings
    const currentYear = new Date().getFullYear();
    document.getElementById("current-year").value = currentYear;
    
    // Set default values
    document.getElementById("school-name").value = "Trường Đại học Kiên Giang";
    document.getElementById("max-points").value = "100";
    document.getElementById("min-points").value = "0";
    document.getElementById("excellent-points").value = "90";
    document.getElementById("good-points").value = "80";
  }

  // ==== System Logs ====
  async function loadLogs() {
    try {
      const tbody = document.getElementById("logs-table-body");
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      // This would be replaced with actual API call
      const logs = []; // await fetch(`${API_BASE}/api/logs`).then(r => r.json());
      
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu log</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(log => `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatDateTime(log.timestamp)}</td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="status-badge status-${log.type}">${log.type}</span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${log.user}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${log.action}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${log.details}</td>
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

  // ==== Event Listeners ====
  function initEventListeners() {
    // Save general settings
    const saveGeneralBtn = document.getElementById("save-general-settings");
    if (saveGeneralBtn) {
      saveGeneralBtn.addEventListener("click", async () => {
        const schoolName = document.getElementById("school-name").value;
        const currentYear = document.getElementById("current-year").value;
        const currentSemester = document.getElementById("current-semester").value;

        try {
          // This would be replaced with actual API call
          // await fetch(`${API_BASE}/api/settings/general`, {
          //   method: "PUT",
          //   headers: { "Content-Type": "application/json" },
          //   body: JSON.stringify({ schoolName, currentYear, currentSemester })
          // });
          
          alert("Lưu cài đặt chung thành công!");
        } catch (error) {
          console.error("Error saving general settings:", error);
          alert("Lỗi lưu cài đặt!");
        }
      });
    }

    // Save point settings
    const savePointBtn = document.getElementById("save-point-settings");
    if (savePointBtn) {
      savePointBtn.addEventListener("click", async () => {
        const maxPoints = document.getElementById("max-points").value;
        const minPoints = document.getElementById("min-points").value;
        const excellentPoints = document.getElementById("excellent-points").value;
        const goodPoints = document.getElementById("good-points").value;

        try {
          // This would be replaced with actual API call
          // await fetch(`${API_BASE}/api/settings/points`, {
          //   method: "PUT",
          //   headers: { "Content-Type": "application/json" },
          //   body: JSON.stringify({ maxPoints, minPoints, excellentPoints, goodPoints })
          // });
          
          alert("Lưu cài đặt điểm thành công!");
        } catch (error) {
          console.error("Error saving point settings:", error);
          alert("Lỗi lưu cài đặt!");
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

  // ==== Initialize ====
  function init() {
    initSidebar();
    initTabs();
    initEventListeners();
    initSystemConfig();
    loadDashboardStats();
    loadUsers();
    loadFaculties();
    loadClasses();
    loadActivities();
    loadLogs();
  }

  // Start the application
  init();
});

// Global modal functions
window.closeModal = () => {
  document.getElementById("modal").classList.add("hidden");
};
