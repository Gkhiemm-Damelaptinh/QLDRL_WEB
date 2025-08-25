document.addEventListener("DOMContentLoaded", async () => {
  // ==== cấu hình API ====
  const API_BASE = "http://localhost:5204";

  // ==== phần tử UI ====
  const sidebar = document.getElementById("sidebar");
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const sidebarItems = document.querySelectorAll(".sidebar-item");
  const sectionContents = document.querySelectorAll(".section-content");

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

  // ==== Dashboard Functions ====
  async function loadDashboardStats() {
    try {
      // Load statistics
      const statsRes = await fetch(`${API_BASE}/api/preload`);
      if (statsRes.ok) {
        const data = await statsRes.json();
        
        // Update stats cards
        document.getElementById("total-students").textContent = "0"; // Will be updated when we have student count API
        document.getElementById("active-activities").textContent = data.hoatDongTruong?.length || 0;
        document.getElementById("avg-training-score").textContent = "0"; // Will be updated when we have grades API
        document.getElementById("monthly-reports").textContent = "0"; // Will be updated when we have reports API
      }
    } catch (error) {
      console.error("Error loading dashboard stats:", error);
    }
  }

  // ==== Students Management ====
  async function loadStudents() {
    try {
      const tbody = document.getElementById("students-table-body");
      tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      // This would be replaced with actual API call
      const students = []; // await fetch(`${API_BASE}/api/students`).then(r => r.json());
      
      if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu sinh viên</td></tr>';
        return;
      }

      tbody.innerHTML = students.map(student => `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${student.MSSV}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${student.TenSV}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.TenLop || 'N/A'}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.TenKhoa || 'N/A'}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.DiemRL || 'N/A'}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <button class="text-blue-600 hover:text-blue-900 mr-2">Xem</button>
            <button class="text-green-600 hover:text-green-900">Sửa</button>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      console.error("Error loading students:", error);
      document.getElementById("students-table-body").innerHTML = 
        '<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
    }
  }

  // ==== Grades Management ====
  async function loadGrades() {
    try {
      const tbody = document.getElementById("grades-table-body");
      tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';

      // This would be replaced with actual API call
      const grades = []; // await fetch(`${API_BASE}/api/grades`).then(r => r.json());
      
      if (grades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Chưa có dữ liệu điểm</td></tr>';
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
            <td class="px-6 py-4 whitespace-nowrap">
              <span class="activity-status ${evaluation.class} text-xs">${evaluation.text}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
              <button class="text-blue-600 hover:text-blue-900 mr-2">Sửa</button>
              <button class="text-red-600 hover:text-red-900">Xóa</button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (error) {
      console.error("Error loading grades:", error);
      document.getElementById("grades-table-body").innerHTML = 
        '<tr><td colspan="7" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
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
          </div>
          <div class="flex gap-2">
            <button class="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
              Xem chi tiết
            </button>
            <button class="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm">
              Sửa
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

  // ==== Add Activity Functions ====
  function openAddActivityModal() {
    document.getElementById("add-activity-modal").classList.remove("hidden");
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("activity-start-date").value = today;
    document.getElementById("activity-end-date").value = today;
  }

  function closeAddActivityModal() {
    document.getElementById("add-activity-modal").classList.add("hidden");
    document.getElementById("add-activity-form").reset();
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

      // This would be replaced with actual API call
      // const response = await fetch(`${API_BASE}/api/activities`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(formData)
      // });
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      alert("Thêm hoạt động thành công!");
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

  // ==== Reports ====
  async function generateReport() {
    const reportType = document.getElementById("report-type").value;
    const reportYear = document.getElementById("report-year").value;
    const content = document.getElementById("report-content");

    content.innerHTML = '<div class="text-center text-gray-500"><p>Đang tạo báo cáo...</p></div>';

    try {
      // This would be replaced with actual API call
      const reportData = {}; // await fetch(`${API_BASE}/api/reports?type=${reportType}&year=${reportYear}`).then(r => r.json());
      
      content.innerHTML = `
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-gray-800">Báo cáo ${reportType} ${reportYear}</h3>
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-gray-600">Chức năng báo cáo sẽ được phát triển trong phiên bản tiếp theo.</p>
          </div>
        </div>
      `;
    } catch (error) {
      console.error("Error generating report:", error);
      content.innerHTML = '<div class="text-center text-red-500"><p>Lỗi tạo báo cáo</p></div>';
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

        if (!mssv || !year || !semester || !score) {
          alert("Vui lòng điền đầy đủ thông tin!");
          return;
        }

        try {
          // This would be replaced with actual API call
          // await fetch(`${API_BASE}/api/grades`, {
          //   method: "POST",
          //   headers: { "Content-Type": "application/json" },
          //   body: JSON.stringify({ mssv, year, semester, score })
          // });
          
          alert("Lưu điểm thành công!");
          loadGrades();
        } catch (error) {
          console.error("Error saving grade:", error);
          alert("Lỗi lưu điểm!");
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
      });
    }

    // Generate report
    const generateReportBtn = document.getElementById("generate-report");
    if (generateReportBtn) {
      generateReportBtn.addEventListener("click", generateReport);
    }

    // Add activity button
    const addActivityBtn = document.getElementById("add-activity-btn");
    if (addActivityBtn) {
      addActivityBtn.addEventListener("click", openAddActivityModal);
    }

    // Add activity form submission
    const addActivityForm = document.getElementById("add-activity-form");
    if (addActivityForm) {
      addActivityForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
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
      });
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
    initEventListeners();
    loadDashboardStats();
    loadStudents();
    loadGrades();
    loadActivities();
  }

  // Start the application
  init();
});

// Global modal functions
window.closeModal = () => {
  document.getElementById("modal").classList.add("hidden");
};

window.closeAddActivityModal = () => {
  document.getElementById("add-activity-modal").classList.add("hidden");
  document.getElementById("add-activity-form").reset();
};
