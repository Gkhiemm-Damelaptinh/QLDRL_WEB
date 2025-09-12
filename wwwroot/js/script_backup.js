document.addEventListener("DOMContentLoaded", async () => {
  // ==== cấu hình API ====
  const API_BASE = "http://localhost:5204";

  // ==== phần tử UI có sẵn trong index.html ====
  const activitiesContainer = document.getElementById("activities");
  const noActivity = document.getElementById("no-activity");
  const loginModal = document.getElementById("login-modal");
  const cancelLogin = document.getElementById("cancel-login");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const navRight = document.getElementById("nav-right");
  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("toggle-password");
  const btnRanking = document.getElementById("btn-ranking");
  
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("change", () => {
      passwordInput.type = togglePassword.checked ? "text" : "password";
    });
  }

  // Add event listener for ranking button
  if (btnRanking) {
    btnRanking.addEventListener("click", () => {
      showStudentRanking();
    });
  }

  // ==== cache dữ liệu preload ====
  const dbCache = {
    KHOA: [],
    Lop: [],
    HoatDongTruong: []
  };

  // ====== UI helpers ======
  function fadeReplace(element, newHTML, afterReplace) {
    element.classList.add("fade-transition");
    element.classList.remove("fade-show");
    element.innerHTML = newHTML;
    element.classList.add("fade-show");
    if (typeof afterReplace === "function") {
      requestAnimationFrame(() => afterReplace());
    }
  }

  // Show login error message
  function showLoginError(message) {
    const errorText = loginError.querySelector("p");
    errorText.textContent = message;
    loginError.classList.remove("hidden");
    loginError.classList.add("fade-up");
  }

  // Hide login error message
  function hideLoginError() {
    loginError.classList.add("hidden");
    loginError.classList.remove("fade-up");
  }

  function renderLoggedOutUI() {
    fadeReplace(
      navRight,
      `
      <a href="#" class="hover-link">Trang chủ</a>
      <a href="#" class="hover-link">Hoạt động</a>
      <button id="btn-ranking" class="hover-link bg-transparent border-none cursor-pointer">Bảng xếp hạng</button>
      <a id="btn-login" href="#" class="btn-outline">Đăng nhập</a>
    `,
      () => {
                 const btn = document.getElementById("btn-login");
         if (btn) {
           btn.addEventListener("click", (e) => {
             e.preventDefault();
             loginModal.classList.remove("hidden");
             hideLoginError(); // Ẩn lỗi khi mở modal
           });
         }
         
         // Add event listener for ranking button
         const rankingBtn = document.getElementById("btn-ranking");
         if (rankingBtn) {
           rankingBtn.addEventListener("click", () => {
             showStudentRanking();
           });
         }
      }
    );
  }

  function renderLoggedInUI(username) {
    fadeReplace(
      navRight,
      `
      <a href="#" class="hover-link">Trang chủ</a>
      <a href="#" class="hover-link">Hoạt động</a>
      <button id="btn-ranking" class="hover-link bg-transparent border-none cursor-pointer">Bảng xếp hạng</button>
      <div class="user-avatar slide-in-right">
        <img id="header-avatar" src="https://i.pravatar.cc/150?u=${encodeURIComponent(username)}" alt="Avatar">
        <span>${username}</span>
      </div>
      <button id="btn-logout" class="px-3 py-1 border rounded-md hover:bg-gray-100">Đăng xuất</button>
    `,
      () => {
        const btn = document.getElementById("btn-logout");
        if (btn) {
          btn.addEventListener("click", () => {
            localStorage.removeItem("loggedUser");
            localStorage.removeItem("loggedUserInfo");
            localStorage.removeItem("userAvatar");
            renderLoggedOutUI();
          });
        }
        
        // Add event listener for ranking button
        const rankingBtn = document.getElementById("btn-ranking");
        if (rankingBtn) {
          rankingBtn.addEventListener("click", () => {
            showStudentRanking();
          });
        }
        
        const ava = document.querySelector(".user-avatar");
        if (ava) {
          ava.classList.add("cursor-pointer");
          ava.setAttribute("title", "Xem / chỉnh sửa thông tin sinh viên");
          ava.addEventListener("click", (e) => {
            e.preventDefault();
            openCurrentStudentProfile();
          });
        }

        // Try load custom avatar from localStorage or fetch from server
        const headerImg = document.getElementById("header-avatar");
        try {
          const stored = localStorage.getItem("userAvatar");
          if (stored && headerImg) headerImg.src = stored;
          if (!stored && headerImg) {
            const raw = localStorage.getItem("loggedUserInfo");
            const info = raw ? JSON.parse(raw) : null;
            const candidate = info?.MaCaNhan || info?.MSSV || info?.MaSV || info?.TenTK;
            if (candidate) {
              fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(candidate)}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data && data.AnhDD) {
                    const url = `data:image/jpeg;base64,${data.AnhDD}`;
                    try { localStorage.setItem("userAvatar", url); } catch {}
                    headerImg.src = url;
                  }
                })
                .catch(() => {});
            }
          }
        } catch {}
      }
    );
  }

  // ====== render hoạt động từ dbCache ======
  function renderActivities(list) {
    activitiesContainer.innerHTML = "";
    if (!list || list.length === 0) {
      noActivity.classList.remove("hidden");
      return;
    }
    noActivity.classList.add("hidden");

    list.forEach((act, idx) => {
      const card = document.createElement("div");
      card.className = "bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer fade-up border border-gray-100";
      card.style.animationDelay = `${idx * 0.05}s`;
      
      // Format dates for better display
      const formatDate = (dateStr) => {
        if (!dateStr || dateStr === "-") return "Chưa có thông tin";
        try {
          const date = new Date(dateStr);
          return date.toLocaleDateString('vi-VN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        } catch {
          return dateStr;
        }
      };

      // Format points with better styling
      const formatPoints = (points) => {
        if (!points || points === "-") return "Chưa có điểm";
        return `${points} điểm`;
      };

      // Get activity status based on dates
      const getActivityStatus = (activity) => {
        const now = new Date();
        const startDate = activity.NgayBD ? new Date(activity.NgayBD) : null;
        const endDate = activity.NgayKT ? new Date(activity.NgayKT) : null;

        if (!startDate || !endDate) {
          return { text: "Chưa có lịch", class: "bg-gray-500" };
        }

        if (now < startDate) {
          return { text: "Sắp diễn ra", class: "bg-blue-500" };
        } else if (now >= startDate && now <= endDate) {
          return { text: "Đang diễn ra", class: "bg-green-500" };
        } else {
          return { text: "Đã kết thúc", class: "bg-red-500" };
        }
      };

      card.innerHTML = `
        <div class="space-y-4">
          <!-- Title with better typography -->
          <div class="border-b border-gray-200 pb-3">
            <h3 class="text-xl font-bold text-gray-800 leading-tight mb-1">
              ${act.TenHD || "(Chưa có tên hoạt động)"}
            </h3>
            <p class="text-xs text-gray-400 font-medium tracking-wide uppercase">
              Mã hoạt động: ${act.MaHD || "N/A"}
            </p>
          </div>

                     <!-- Points section with highlight -->
           <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border-l-4 border-blue-400">
             <p class="text-sm font-medium text-gray-600 mb-1">Điểm rèn luyện</p>
             <p class="text-lg font-bold text-blue-600">
               ${formatPoints(act.DiemRL)}
             </p>
           </div>

           <!-- Activity Status -->
           <div class="flex items-center justify-between">
             <div class="activity-status ${getActivityStatus(act).class}">
               ${getActivityStatus(act).text}
             </div>
           </div>

           <!-- Date information with icons -->
           <div class="space-y-3">
             <div class="flex items-center space-x-3">
               <div class="w-2 h-2 bg-green-500 rounded-full"></div>
               <div>
                 <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Ngày bắt đầu</p>
                 <p class="text-sm font-semibold text-gray-800">${formatDate(act.NgayBD)}</p>
               </div>
             </div>
             
             <div class="flex items-center space-x-3">
               <div class="w-2 h-2 bg-red-500 rounded-full"></div>
               <div>
                 <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">Ngày kết thúc</p>
                 <p class="text-sm font-semibold text-gray-800">${formatDate(act.NgayKT)}</p>
               </div>
             </div>
           </div>

          <!-- Click indicator -->
          <div class="pt-2 border-t border-gray-100">
            <p class="text-xs text-gray-400 text-center">
              👆 Nhấp để xem chi tiết
            </p>
          </div>
        </div>
      `;
      
      card.addEventListener("click", () => openModalHD(act));
      activitiesContainer.appendChild(card);
    });
  }

  // ====== modal hoạt động với thiết kế đẹp hơn ======
  function openModalHD(act) {
    document.getElementById("modal-title").textContent = act.TenHD || "(Chưa có tên hoạt động)";
    
    // Format dates for better display
    const formatDate = (dateStr) => {
      if (!dateStr || dateStr === "-") return "Chưa có thông tin";
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('vi-VN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long'
        });
      } catch {
        return dateStr;
      }
    };

    // Format points with better styling
    const formatPoints = (points) => {
      if (!points || points === "-") return "Chưa có điểm";
      return `${points} điểm`;
    };

    document.getElementById("modal-body").innerHTML = `
      <div class="space-y-6">
        <!-- Activity Code Section -->
        <div class="bg-gray-50 p-4 rounded-lg border-l-4 border-gray-400">
          <h4 class="text-sm font-bold text-gray-600 uppercase tracking-wide mb-2">
            Mã hoạt động
          </h4>
          <p class="text-lg font-mono font-semibold text-gray-800">
            ${act.MaHD || "N/A"}
          </p>
        </div>

        <!-- Points Section -->
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border-l-4 border-blue-500">
          <h4 class="text-sm font-bold text-blue-700 uppercase tracking-wide mb-2">
            Điểm rèn luyện
          </h4>
          <p class="text-2xl font-bold text-blue-600">
            ${formatPoints(act.DiemRL)}
          </p>
        </div>

        <!-- Date Information -->
        <div class="space-y-4">
          <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
            Thông tin thời gian
          </h4>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Start Date -->
            <div class="bg-green-50 p-3 rounded-lg border border-green-200">
              <div class="flex items-center space-x-2 mb-2">
                <div class="w-3 h-3 bg-green-500 rounded-full"></div>
                <span class="text-xs font-bold text-green-700 uppercase tracking-wide">
                  Ngày bắt đầu
                </span>
              </div>
              <p class="text-sm font-semibold text-green-800">
                ${formatDate(act.NgayBD)}
              </p>
            </div>

            <!-- End Date -->
            <div class="bg-red-50 p-3 rounded-lg border border-red-200">
              <div class="flex items-center space-x-2 mb-2">
                <div class="w-3 h-3 bg-red-500 rounded-full"></div>
                <span class="text-xs font-bold text-red-700 uppercase tracking-wide">
                  Ngày kết thúc
                </span>
              </div>
              <p class="text-sm font-semibold text-red-800">
                ${formatDate(act.NgayKT)}
              </p>
            </div>
          </div>
        </div>

                 <!-- Activity Description Section -->
         <div class="space-y-4">
           <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
             Mô tả chi tiết
           </h4>
           
           <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border-l-4 border-purple-400">
             <div class="flex items-start space-x-3">
               <div class="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
               <div class="flex-1">
                 <p class="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2">
                   Nội dung hoạt động
                 </p>
                 <div class="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                   ${act.NDHD ? act.NDHD.replace(/\n/g, '<br>') : "Chưa có mô tả chi tiết về hoạt động này."}
                 </div>
               </div>
             </div>
           </div>
         </div>

         <!-- Additional Info Section -->
         <div class="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
           <h4 class="text-sm font-bold text-yellow-700 uppercase tracking-wide mb-2">
             Lưu ý
           </h4>
           <p class="text-sm text-yellow-800">
             Đây là thông tin chi tiết về hoạt động. Vui lòng liên hệ với phòng ban chức năng nếu cần thêm thông tin.
           </p>
         </div>
      </div>
    `;
    document.getElementById("modal").classList.remove("hidden");
  }
  window.closeModal = () => document.getElementById("modal").classList.add("hidden");

  // ====== PRELOAD dữ liệu cần cho cả phiên ======
  async function preloadData() {
    activitiesContainer.innerHTML = `<div class="text-gray-500">Đang tải dữ liệu...</div>`;
    try {
      const res = await fetch(`${API_BASE}/api/preload`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      dbCache.KHOA = data.khoa ?? [];
      dbCache.Lop = data.lop ?? [];
      dbCache.HoatDongTruong = data.hoatDongTruong ?? [];

      // lưu sessionStorage để F5 không phải tải lại (tùy chọn)
      sessionStorage.setItem("preload", JSON.stringify(dbCache));

      renderActivities(dbCache.HoatDongTruong);
    } catch (e) {
      console.error(e);
      activitiesContainer.innerHTML = "";
      noActivity.classList.remove("hidden");
      noActivity.querySelector("p.text-lg").textContent = "Không tải được dữ liệu từ máy chủ.";
    }
  }

  // ====== LOGIN: gọi server để kiểm tra (an toàn) ======
  cancelLogin.addEventListener("click", () => {
    loginModal.classList.add("hidden");
    hideLoginError(); // Ẩn lỗi khi đóng modal
  });
  
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = document.getElementById("username").value.trim();
    const pass = document.getElementById("password").value.trim();
    
    // Ẩn lỗi cũ khi submit form mới
    hideLoginError();
    
    if (!user || !pass) {
      showLoginError("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!");
      return;
    }

    try {
      // Gọi API đăng nhập thực tế
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ TenTK: user, MatKhau: pass })
      });
      
      if (res.status === 401) {
        showLoginError("Sai tài khoản hoặc mật khẩu. Vui lòng kiểm tra lại!");
        return;
      }
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const userInfo = await res.json();
      console.log("API Response:", userInfo); // Debug: xem response từ API
      
      // Kiểm tra xem API có trả về MaQT không
      if (!userInfo.MaQT) {
        console.warn("API không trả về MaQT, sử dụng giá trị mặc định");
        // Nếu API không có MaQT, có thể set giá trị mặc định hoặc báo lỗi
        showLoginError("API không trả về thông tin phân quyền (MaQT). Vui lòng liên hệ admin!");
        return;
      }

      // Lưu thông tin người dùng
      localStorage.setItem("loggedUser", userInfo.TenNguoiDung || userInfo.TenTK || user);
      localStorage.setItem("loggedUserInfo", JSON.stringify(userInfo));
      
      // Phân quyền dựa trên MaQT từ API
      const maQT = userInfo.MaQT;
      console.log("MaQT từ API:", maQT); // Debug: xem MaQT nhận được
      
      if (maQT === "AD01") {
        // Admin - Chuyển đến giao diện admin
        console.log("Chuyển hướng đến giao diện Admin");
        window.location.href = "admin.html";
        return;
      } else if (maQT === "GV01") {
        // Giảng viên - Chuyển đến giao diện giảng viên
        console.log("Chuyển hướng đến giao diện Giảng viên");
        window.location.href = "giangvien.html";
        return;
      } else {
        // Sinh viên hoặc vai trò khác - Ở lại trang chủ
        console.log("Ở lại trang chủ với vai trò:", maQT);
        renderLoggedInUI(localStorage.getItem("loggedUser"));
        loginModal.classList.add("hidden");
        hideLoginError();
        
        // Hiển thị thông báo về vai trò
        showRoleMessage(maQT, userInfo.TenNguoiDung || userInfo.TenTK);
      }
      
    } catch (err) {
      console.error("Lỗi khi gọi API:", err);
      
      // Fallback: sử dụng demo data nếu API không hoạt động
      console.log("API không hoạt động, sử dụng demo data");
      handleDemoLogin(user, pass);
    }
  });

  // Hàm xử lý demo login khi API không hoạt động
  function handleDemoLogin(user, pass) {
    let demoUserInfo = null;
    
    // Kiểm tra tài khoản demo
    if (user === "admin" && pass === "admin123") {
      demoUserInfo = {
        MaTK: "ADM001",
        MaCaNhan: "AD001",
        TenTK: "admin",
        TenNguoiDung: "Quản trị viên hệ thống",
        ChucVu: "Quản trị viên",
        MaQT: "AD01"
      };
    } else if (user === "giangvien" && pass === "gv123") {
      demoUserInfo = {
        MaTK: "GV001",
        MaCaNhan: "GV001",
        TenTK: "giangvien",
        TenNguoiDung: "Giảng viên mẫu",
        ChucVu: "Giảng viên",
        MaQT: "GV01"
      };
    } else if (user === "sinhvien" && pass === "sv123") {
      demoUserInfo = {
        MaTK: "SV001",
        MaCaNhan: "SV001",
        TenTK: "sinhvien",
        TenNguoiDung: "Sinh viên mẫu",
        ChucVu: "Sinh viên",
        MaQT: "SV01"
      };
    }
    
    if (demoUserInfo) {
      console.log("Sử dụng demo data:", demoUserInfo);
      localStorage.setItem("loggedUser", demoUserInfo.TenNguoiDung || demoUserInfo.TenTK || user);
      localStorage.setItem("loggedUserInfo", JSON.stringify(demoUserInfo));
      
      // Phân quyền dựa trên MaQT demo
      const maQT = demoUserInfo.MaQT;
      
      if (maQT === "AD01") {
        window.location.href = "admin.html";
        return;
      } else if (maQT === "GV01") {
        window.location.href = "giangvien.html";
        return;
      } else {
        renderLoggedInUI(localStorage.getItem("loggedUser"));
        loginModal.classList.add("hidden");
        hideLoginError();
        showRoleMessage(maQT, demoUserInfo.TenNguoiDung || demoUserInfo.TenTK);
      }
    } else {
      showLoginError("Sai tài khoản hoặc mật khẩu. Vui lòng kiểm tra lại!");
    }
  }

  // Hàm hiển thị thông báo về vai trò
  function showRoleMessage(maQT, username) {
    let roleText = "";
    let roleColor = "";
    
    switch(maQT) {
      case "AD01":
        roleText = "Quản trị viên";
        roleColor = "bg-red-100 border-red-300 text-red-800";
        break;
      case "GV01":
        roleText = "Giảng viên";
        roleColor = "bg-green-100 border-green-300 text-green-800";
        break;
      default:
        roleText = "Sinh viên";
        roleColor = "bg-blue-100 border-blue-300 text-blue-800";
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `fixed top-20 right-4 z-50 p-4 rounded-lg border ${roleColor} shadow-lg max-w-sm`;
    messageDiv.innerHTML = `
      <div class="flex items-start space-x-3">
        <div class="flex-shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <div>
          <h3 class="text-sm font-medium">Đăng nhập thành công!</h3>
          <p class="text-sm mt-1">Chào mừng ${username}</p>
          <p class="text-xs mt-2">Vai trò: ${roleText} (${maQT})</p>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="text-current hover:opacity-70">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    `;
    
    document.body.appendChild(messageDiv);
    
    // Tự động ẩn sau 5 giây
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 5000);
  }

  // ====== Xem chi tiết sinh viên khi cần ======
  // Ví dụ: gọi hàm này từ 1 nút/ô tìm kiếm MSSV
  function openCurrentStudentProfile() {
    try {
      const raw = localStorage.getItem("loggedUserInfo");
      const info = raw ? JSON.parse(raw) : null;
      const candidate = info?.MaCaNhan || info?.MSSV || info?.MaSV || info?.TenTK;
      if (candidate) {
        showStudentPreview(candidate);
      } else {
        const fallback = prompt("Nhập MSSV của bạn để xem/chỉnh sửa:");
        if (fallback && fallback.trim()) showStudentPreview(fallback.trim());
      }
    } catch {
      const fallback = prompt("Nhập MSSV của bạn để xem/chỉnh sửa:");
      if (fallback && fallback.trim()) showStudentPreview(fallback.trim());
    }
  }

  async function showStudentPreview(mssv) {
    try {
      const res = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssv)}`);
      if (res.status === 404) return alert("Không tìm thấy sinh viên.");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sv = await res.json();

      // Get current year and semester for default values
      const currentYear = new Date().getFullYear();
      const currentSemester = new Date().getMonth() < 6 ? 2 : 1; // Rough estimate

      // Fetch grades
      console.log(`Fetching grades for MSSV: ${mssv}, Year: ${currentYear}, Semester: ${currentSemester}`);
      const gradesRes = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssv)}/diem?namHoc=${currentYear}&hocKi=${currentSemester}`);
      console.log(`Grades response status: ${gradesRes.status}`);
      const grades = gradesRes.ok ? await gradesRes.json() : [];
      console.log(`Grades data:`, grades);

      // Generate years (current year back 5 years) and semesters (1, 2, 3)
      const years = [];
      for (let i = 0; i < 6; i++) {
        years.push(currentYear - i);
      }
      const semesters = [1, 2, 3];

      // Helper function to evaluate grades
      const evaluateGrade = (score, type) => {
        if (!score || score === 0) return { text: "Chưa có", class: "bg-gray-500" };
        
        if (type === 'gpa') {
          if (score >= 3.6) return { text: "Xuất sắc", class: "bg-purple-500" };
          if (score >= 3.2) return { text: "Giỏi", class: "bg-green-500" };
          if (score >= 2.5) return { text: "Khá", class: "bg-blue-500" };
          if (score >= 2.0) return { text: "Trung bình", class: "bg-yellow-500" };
          return { text: "Yếu", class: "bg-red-500" };
        } else { // training points
          if (score >= 90) return { text: "Xuất sắc", class: "bg-purple-500" };
          if (score >= 80) return { text: "Giỏi", class: "bg-green-500" };
          if (score >= 70) return { text: "Khá", class: "bg-blue-500" };
          if (score >= 60) return { text: "Trung bình", class: "bg-yellow-500" };
          return { text: "Yếu", class: "bg-red-500" };
        }
      };

      const currentGrade = grades.length > 0 ? grades[0] : null;
      const gpaEval = evaluateGrade(currentGrade?.DiemTBM_4, 'gpa');
      const trainingEval = evaluateGrade(currentGrade?.TongDRL, 'training');

      document.getElementById("modal-title").textContent = `Thông tin sinh viên - ${sv.TenSV || "N/A"} (${sv.MSSV || mssv})`;
      
      document.getElementById("modal-body").innerHTML = `
        <div class="space-y-6">
          <!-- Student Info Section -->
          <div class="flex items-start gap-6">
            <div class="flex flex-col items-center gap-3">
              <img class="w-24 h-24 rounded-full object-cover border" src="${sv.AnhDD ? `data:image/jpeg;base64,${sv.AnhDD}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(sv.TenSV || sv.MSSV || mssv)}&background=0D8ABC&color=fff`}" alt="Avatar">
            </div>
            <div class="flex-1 space-y-4">
              <div class="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                <h4 class="text-sm font-bold text-blue-700 uppercase tracking-wide mb-2">Mã số sinh viên</h4>
                <p class="text-lg font-mono font-bold text-blue-800">${sv.MSSV || mssv}</p>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Họ và tên</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.TenSV || "Chưa có thông tin"}</p>
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Email</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.Email || "Chưa có email"}</p>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Số điện thoại</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.SDT || "Chưa có số điện thoại"}</p>
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Địa chỉ</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.DiaChi || "Chưa có địa chỉ"}</p>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Lớp</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.TenLop ?? sv.MaLop ?? "Chưa có thông tin"}</p>
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Khoa</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.TenKhoa ?? sv.MaKH ?? "Chưa có thông tin"}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Academic Performance Section -->
          <div class="space-y-4">
            <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">
              Kết quả học tập
            </h4>
            
            <!-- Filter Controls -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Năm học</label>
                <select id="filter-namhoc" class="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">Tất cả năm học</option>
                  ${years.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Học kì</label>
                <select id="filter-hocki" class="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">Tất cả học kì</option>
                  ${semesters.map(s => `<option value="${s}" ${s === currentSemester ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
              </div>
              <div class="flex items-end">
                <button id="btn-apply-filter" class="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">Áp dụng</button>
              </div>
            </div>

            <!-- Grades Display -->
            <div id="grades-display" class="space-y-4">
              ${currentGrade ? `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <!-- GPA Section -->
                  <div class="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-l-4 border-green-500">
                    <h5 class="text-sm font-bold text-green-700 uppercase tracking-wide mb-2">Điểm trung bình môn</h5>
                    <div class="space-y-2">
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">Hệ số 4:</span>
                        <span class="font-bold text-lg">${currentGrade.DiemTBM_4 || "N/A"}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">Hệ số 10:</span>
                        <span class="font-bold text-lg">${currentGrade.DiemTBM_10 || "N/A"}</span>
                      </div>
                      <div class="mt-2">
                        <span class="activity-status ${gpaEval.class} text-xs">${gpaEval.text}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Training Points Section -->
                  <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border-l-4 border-blue-500">
                    <h5 class="text-sm font-bold text-blue-700 uppercase tracking-wide mb-2">Điểm rèn luyện</h5>
                    <div class="space-y-2">
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">Tổng điểm:</span>
                        <span class="font-bold text-lg">${currentGrade.TongDRL || "N/A"}</span>
                      </div>
                      <div class="mt-2">
                        <span class="activity-status ${trainingEval.class} text-xs">${trainingEval.text}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="text-xs text-gray-500 text-center">
                  Năm học: ${currentGrade.NamHoc} - Học kì: ${currentGrade.HocKi}
                </div>
              ` : `
                <div class="text-center py-8 text-gray-500">
                  <p>Chưa có dữ liệu điểm cho năm học và học kì đã chọn.</p>
                </div>
              `}
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <button type="button" id="btn-edit-profile" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Chỉnh sửa thông tin</button>
            <button type="button" id="btn-close-preview" class="px-4 py-2 border rounded-md hover:bg-gray-100">Đóng</button>
          </div>
        </div>
      `;

      document.getElementById("modal").classList.remove("hidden");

      // Event listeners
      const closeBtn = document.getElementById("btn-close-preview");
      if (closeBtn) closeBtn.addEventListener("click", () => window.closeModal());

      const editBtn = document.getElementById("btn-edit-profile");
      if (editBtn) editBtn.addEventListener("click", () => {
        window.closeModal();
        viewSinhVien(mssv);
      });

      const applyFilterBtn = document.getElementById("btn-apply-filter");
      if (applyFilterBtn) {
        applyFilterBtn.addEventListener("click", async () => {
          const selectedYear = document.getElementById("filter-namhoc").value;
          const selectedSemester = document.getElementById("filter-hocki").value;
          
          const params = new URLSearchParams();
          if (selectedYear) params.append("namHoc", selectedYear);
          if (selectedSemester) params.append("hocKi", selectedSemester);
          
                     try {
             console.log(`Applying filter with params: ${params.toString()}`);
             const res = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssv)}/diem?${params}`);
             console.log(`Filter response status: ${res.status}`);
             if (!res.ok) throw new Error(`HTTP ${res.status}`);
             const newGrades = await res.json();
             console.log(`Filtered grades:`, newGrades);
            
            // Update the grades display
            const gradesDisplay = document.getElementById("grades-display");
            if (gradesDisplay && newGrades.length > 0) {
              const grade = newGrades[0];
              const gpaEval = evaluateGrade(grade.DiemTBM_4, 'gpa');
              const trainingEval = evaluateGrade(grade.TongDRL, 'training');
              
              gradesDisplay.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-l-4 border-green-500">
                    <h5 class="text-sm font-bold text-green-700 uppercase tracking-wide mb-2">Điểm trung bình môn</h5>
                    <div class="space-y-2">
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">Hệ số 4:</span>
                        <span class="font-bold text-lg">${grade.DiemTBM_4 || "N/A"}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">Hệ số 10:</span>
                        <span class="font-bold text-lg">${grade.DiemTBM_10 || "N/A"}</span>
                      </div>
                      <div class="mt-2">
                        <span class="activity-status ${gpaEval.class} text-xs">${gpaEval.text}</span>
                      </div>
                    </div>
                  </div>

                  <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border-l-4 border-blue-500">
                    <h5 class="text-sm font-bold text-blue-700 uppercase tracking-wide mb-2">Điểm rèn luyện</h5>
                    <div class="space-y-2">
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">Tổng điểm:</span>
                        <span class="font-bold text-lg">${grade.TongDRL || "N/A"}</span>
                      </div>
                      <div class="mt-2">
                        <span class="activity-status ${trainingEval.class} text-xs">${trainingEval.text}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="text-xs text-gray-500 text-center">
                  Năm học: ${grade.NamHoc} - Học kì: ${grade.HocKi}
                </div>
              `;
            } else {
              gradesDisplay.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                  <p>Chưa có dữ liệu điểm cho năm học và học kì đã chọn.</p>
                </div>
              `;
            }
          } catch (err) {
            console.error(err);
            let errorMsg = "Không thể tải dữ liệu điểm. Vui lòng thử lại!";
            if (err.message.includes("HTTP")) {
              errorMsg = `Lỗi server: ${err.message}`;
            }
            alert(errorMsg);
          }
        });
      }

    } catch (e) {
      console.error(e);
      alert("Không tải được thông tin sinh viên.");
    }
  }

  async function viewSinhVien(mssv) {
    try {
      const res = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssv)}`);
      if (res.status === 404) return alert("Không tìm thấy sinh viên.");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sv = await res.json();

      // hiển thị form chỉnh sửa trong modal
      document.getElementById("modal-title").textContent = `${sv.TenSV || "Thông tin sinh viên"} (${sv.MSSV || mssv})`;
      const lopOptions = (Array.isArray(dbCache.Lop) ? dbCache.Lop : [])
        .map(l => `<option value="${l.MaLop}" ${String(l.MaLop) === String(sv.MaLop) ? "selected" : ""}>${l.TenLop || l.MaLop}</option>`)
        .join("");
      const khoaOptions = (Array.isArray(dbCache.KHOA) ? dbCache.KHOA : [])
        .map(k => `<option value="${k.MaKH}" ${String(k.MaKH) === String(sv.MaKH) ? "selected" : ""}>${k.TenKhoa || k.MaKH}</option>`)
        .join("");

      document.getElementById("modal-body").innerHTML = `
        <form id="sv-form" class="space-y-6">
          <div class="flex items-start gap-6">
            <div class="flex flex-col items-center gap-3">
              <img id="sv-avatar-img" class="w-24 h-24 rounded-full object-cover border" src="${sv.AnhDD ? `data:image/jpeg;base64,${sv.AnhDD}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(sv.TenSV || sv.MSSV || mssv)}&background=0D8ABC&color=fff`}" alt="Avatar">
              <label class="text-xs font-medium">Đổi ảnh đại diện</label>
              <input id="sv-avatar" type="file" accept="image/*" class="text-xs" />
            </div>
            <div class="flex-1 space-y-4">
              <div class="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                <h4 class="text-sm font-bold text-blue-700 uppercase tracking-wide mb-2">Mã số sinh viên</h4>
                <input type="text" class="w-full border rounded-md px-3 py-2 bg-gray-100" value="${sv.MSSV || mssv}" disabled />
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Họ và tên</label>
                  <input id="sv-ten" type="text" class="w-full border rounded-md px-3 py-2 bg-gray-100" value="${sv.TenSV || ""}" disabled>
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Email</label>
                  <input id="sv-email" type="email" class="w-full border rounded-md px-3 py-2 bg-gray-100" value="${sv.Email || ""}" disabled>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Số điện thoại</label>
                  <input id="sv-sdt" type="text" class="w-full border rounded-md px-3 py-2" value="${sv.SDT || ""}">
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Địa chỉ</label>
                  <input id="sv-diachi" type="text" class="w-full border rounded-md px-3 py-2" value="${sv.DiaChi || ""}">
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Lớp</label>
                  <input type="text" class="w-full border rounded-md px-3 py-2 bg-gray-100" value="${sv.TenLop ?? sv.MaLop ?? ""}" disabled />
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Khoa</label>
                  <input type="text" class="w-full border rounded-md px-3 py-2 bg-gray-100" value="${sv.TenKhoa ?? sv.MaKH ?? ""}" disabled />
                </div>
              </div>

              <div class="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button type="button" id="btn-cancel-sv" class="px-3 py-2 border rounded-md hover:bg-gray-100">Hủy</button>
                <button type="button" id="btn-save-sv" class="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Lưu thay đổi</button>
              </div>
            </div>
          </div>
        </form>
      `;
      document.getElementById("modal").classList.remove("hidden");

      const cancelBtn = document.getElementById("btn-cancel-sv");
      if (cancelBtn) cancelBtn.addEventListener("click", () => window.closeModal());

      const saveBtn = document.getElementById("btn-save-sv");
      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
          const payload = {
            SDT: document.getElementById("sv-sdt").value.trim(),
            DiaChi: document.getElementById("sv-diachi").value.trim()
          };

          try {
            const resp = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(sv.MSSV || mssv)}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            alert("Cập nhật thông tin sinh viên thành công!");
            window.closeModal();
          } catch (err) {
            console.error(err);
            alert("Cập nhật thất bại. Vui lòng thử lại!");
          }
        });
      }

      const avatarInput = document.getElementById("sv-avatar");
      if (avatarInput) {
        avatarInput.addEventListener("change", async (ev) => {
          const file = ev.target.files && ev.target.files[0];
          if (!file) return;
          const fd = new FormData();
          fd.append("file", file);
          try {
            const resp = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(sv.MSSV || mssv)}/avatar`, {
              method: "POST",
              body: fd
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const img = document.getElementById("sv-avatar-img");
            if (img) img.src = URL.createObjectURL(file);
            // update header avatar and cache
            const reader = new FileReader();
            reader.onload = () => {
              const url = typeof reader.result === 'string' ? reader.result : null;
              if (url) {
                try { localStorage.setItem("userAvatar", url); } catch {}
                const headerImg = document.getElementById("header-avatar");
                if (headerImg) headerImg.src = url;
              }
            };
            reader.readAsDataURL(file);
            alert("Đổi ảnh đại diện thành công!");
          } catch (err) {
            console.error(err);
            alert("Tải ảnh thất bại. Vui lòng thử lại!");
          }
        });
      }

      // Hover preview for full address on input
      const inputDiaChi = document.getElementById("sv-diachi");
      if (inputDiaChi) {
        let pop;
        const show = () => {
          const rect = inputDiaChi.getBoundingClientRect();
          const text = inputDiaChi.value || "(Chưa có địa chỉ)";
          pop = document.createElement("div");
          pop.className = "absolute z-50 bg-white border rounded shadow-lg max-w-sm w-[28rem] p-3 text-sm leading-6";
          pop.style.top = `${rect.bottom + window.scrollY + 8}px`;
          pop.style.left = `${rect.left + window.scrollX}px`;
          pop.innerHTML = `<div class=\"max-h-60 overflow-auto whitespace-pre-wrap\">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
          document.body.appendChild(pop);
        };
        const hide = () => { if (pop && pop.parentNode) pop.parentNode.removeChild(pop); pop = null; };
        inputDiaChi.addEventListener("mouseenter", show);
        inputDiaChi.addEventListener("mouseleave", hide);
        inputDiaChi.addEventListener("focus", show);
        inputDiaChi.addEventListener("blur", hide);
      }
    } catch (e) {
      console.error(e);
      alert("Không tải được thông tin sinh viên.");
    }
  }
  // nếu cần dùng ngoài file:
  window.viewSinhVien = viewSinhVien;
  window.openCurrentStudentProfile = openCurrentStudentProfile;
  window.showStudentRanking = showStudentRanking;

  // ====== Khởi động: restore session preload nếu có, sau đó gọi API nếu chưa có ======
  const saved = sessionStorage.getItem("preload");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed?.hoatDongTruong) {
        dbCache.KHOA = parsed.khoa ?? [];
        dbCache.Lop = parsed.lop ?? [];
        dbCache.HoatDongTruong = parsed.hoatDongTruong ?? [];
        renderActivities(dbCache.HoatDongTruong);
      } else {
        await preloadData();
      }
    } catch { await preloadData(); }
  } else {
    preloadData();
  }

  // ====== Giữ trạng thái login như cũ ======
  const savedUser = localStorage.getItem("loggedUser");
  if (savedUser) {
    // Kiểm tra xem người dùng có phải là admin hoặc giảng viên không
    const userInfo = localStorage.getItem("loggedUserInfo");
    if (userInfo) {
      try {
        const info = JSON.parse(userInfo);
        const maQT = info.MaQT || "";
        
        if (maQT === "AD01") {
          // Nếu là admin, chuyển đến giao diện admin
          window.location.href = "admin.html";
          return;
        } else if (maQT === "GV01") {
          // Nếu là giảng viên, chuyển đến giao diện giảng viên
          window.location.href = "giangvien.html";
          return;
        }
      } catch (error) {
        console.error("Error parsing user info:", error);
      }
    }
    
    // Nếu là sinh viên hoặc không xác định được vai trò, hiển thị giao diện sinh viên
    renderLoggedInUI(savedUser);
  } else {
    renderLoggedOutUI();
  }

  // ====== Bảng xếp hạng sinh viên ======
  async function showStudentRanking() {
    try {
      // Hiển thị loading
      document.getElementById("modal-title").textContent = "Bảng xếp hạng sinh viên";
      document.getElementById("modal-body").innerHTML = `
        <div class="text-center py-8">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p class="mt-4 text-gray-600">Đang tải bảng xếp hạng...</p>
        </div>
      `;
      document.getElementById("modal").classList.remove("hidden");

      // Fetch student ranking data từ bảng LUUTRUDIEMSV
      const res = await fetch(`${API_BASE}/api/luutrudiemsv/ranking`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const rankingData = await res.json();
      
      if (!rankingData || rankingData.length === 0) {
        document.getElementById("modal-body").innerHTML = `
          <div class="text-center py-8 text-gray-500">
            <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p class="mt-4 text-lg">Chưa có dữ liệu xếp hạng</p>
            <p class="text-sm text-gray-400">Hệ thống chưa có thông tin xếp hạng sinh viên từ bảng LUUTRUDIEMSV.</p>
          </div>
        `;
        return;
      }

      // Sort by điểm (descending) - giả sử trường điểm là 'Diem' hoặc 'TongDiem'
      const sortedRanking = rankingData.sort((a, b) => {
        const pointsA = parseFloat(a.Diem || a.TongDiem || a.DiemRL || 0);
        const pointsB = parseFloat(b.Diem || b.TongDiem || b.DiemRL || 0);
        return pointsB - pointsA;
      });

      // Phân trang: 16 người mỗi trang
      const itemsPerPage = 16;
      const totalPages = Math.ceil(sortedRanking.length / itemsPerPage);
      let currentPage = 1;

      // Render ranking table với phân trang
      function renderRankingTable(page = 1) {
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentPageData = sortedRanking.slice(startIndex, endIndex);

        let rankingHTML = `
          <div class="space-y-6">
            <!-- Header Section -->
            <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border-l-4 border-blue-500">
              <h4 class="text-lg font-bold text-blue-800 mb-2">🏆 Bảng xếp hạng điểm sinh viên</h4>
              <p class="text-sm text-blue-700">Xếp hạng dựa trên điểm từ bảng LUUTRUDIEMSV - ${sortedRanking.length} sinh viên</p>
            </div>

            <!-- Filter Controls -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Khoa</label>
                <select id="filter-khoa-ranking" class="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">Tất cả khoa</option>
                  ${Array.from(new Set(sortedRanking.map(s => s.TenKhoa || s.MaKhoa).filter(Boolean))).map(khoa => 
                    `<option value="${khoa}">${khoa}</option>`
                  ).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Lớp</label>
                <select id="filter-lop-ranking" class="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">Tất cả lớp</option>
                  ${Array.from(new Set(sortedRanking.map(s => s.TenLop || s.MaLop).filter(Boolean))).map(lop => 
                    `<option value="${lop}">${lop}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="flex items-end">
                <button id="btn-apply-ranking-filter" class="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">Lọc</button>
              </div>
            </div>

            <!-- Ranking Table -->
            <div class="overflow-x-auto">
              <table class="ranking-table">
                <thead>
                  <tr>
                    <th>Thứ hạng</th>
                    <th>Sinh viên</th>
                    <th>MSSV</th>
                    <th>Lớp</th>
                    <th>Khoa</th>
                    <th>Điểm</th>
                    <th>Xếp loại</th>
                  </tr>
                </thead>
                <tbody id="ranking-table-body">
        `;

        // Add ranking rows cho trang hiện tại
        currentPageData.forEach((student, index) => {
          const globalRank = startIndex + index + 1;
          const points = parseFloat(student.Diem || student.TongDiem || student.DiemRL || 0);
          
          // Determine rank badge
          let rankBadge = '';
          if (globalRank === 1) rankBadge = '🥇';
          else if (globalRank === 2) rankBadge = '🥈';
          else if (globalRank === 3) rankBadge = '🥉';
          else if (globalRank <= 10) rankBadge = '🏅';
          else rankBadge = `${globalRank}`;

          // Determine grade level
          let gradeLevel = '';
          let gradeClass = '';
          if (points >= 90) {
            gradeLevel = 'Xuất sắc';
            gradeClass = 'grade-excellent';
          } else if (points >= 80) {
            gradeLevel = 'Giỏi';
            gradeClass = 'grade-good';
          } else if (points >= 70) {
            gradeLevel = 'Khá';
            gradeClass = 'grade-fair';
          } else if (points >= 60) {
            gradeLevel = 'Trung bình';
            gradeClass = 'grade-average';
          } else {
            gradeLevel = 'Yếu';
            gradeClass = 'grade-poor';
          }

          rankingHTML += `
            <tr>
              <td class="text-center">
                <span class="rank-badge ${
                  globalRank === 1 ? 'rank-gold' : 
                  globalRank === 2 ? 'rank-silver' : 
                  globalRank === 3 ? 'rank-bronze' : 
                  globalRank <= 10 ? 'rank-top10' : 
                  'rank-normal'
                }">
                  ${rankBadge}
                </span>
              </td>
              <td>
                <div class="flex items-center space-x-3">
                  <img class="w-8 h-8 rounded-full object-cover" 
                       src="${student.AnhDD ? `data:image/jpeg;base64,${student.AnhDD}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(student.TenSV || student.HoTen || student.MSSV)}&size=32&background=0D8ABC&color=fff`}" 
                       alt="Avatar">
                  <div>
                    <div class="text-sm font-semibold text-gray-900">${student.TenSV || student.HoTen || 'N/A'}</div>
                  </div>
                </div>
              </td>
              <td class="text-sm font-mono text-gray-900">${student.MSSV || 'N/A'}</td>
              <td class="text-sm text-gray-900">${student.TenLop || student.MaLop || 'N/A'}</td>
              <td class="text-sm text-gray-900">${student.TenKhoa || student.MaKhoa || 'N/A'}</td>
              <td>
                <span class="points-display">
                  ${points.toFixed(1)} điểm
                </span>
              </td>
              <td>
                <span class="grade-badge ${gradeClass}">
                  ${gradeLevel}
                </span>
              </td>
            </tr>
          `;
        });

        rankingHTML += `
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-700">
                Hiển thị ${startIndex + 1}-${Math.min(endIndex, sortedRanking.length)} trong tổng số ${sortedRanking.length} sinh viên
              </div>
              <div class="flex items-center space-x-2">
                <button id="btn-prev-page" class="px-3 py-2 border rounded-md hover:bg-gray-100 ${page === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${page === 1 ? 'disabled' : ''}>
                  ← Trước
                </button>
                <div class="flex items-center space-x-1">
                  ${Array.from({length: totalPages}, (_, i) => i + 1).map(pageNum => `
                    <button class="page-btn px-3 py-2 border rounded-md hover:bg-gray-100 ${pageNum === page ? 'bg-blue-600 text-white border-blue-600' : ''}" data-page="${pageNum}">
                      ${pageNum}
                    </button>
                  `).join('')}
                </div>
                <button id="btn-next-page" class="px-3 py-2 border rounded-md hover:bg-gray-100 ${page === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${page === totalPages ? 'disabled' : ''}>
                  Sau →
                </button>
              </div>
            </div>

            <!-- Statistics Section -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div class="bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-lg border-l-4 border-yellow-400">
                <div class="flex items-center">
                  <div class="p-2 bg-yellow-100 rounded-full">
                    <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <div class="ml-3">
                    <p class="text-sm font-medium text-yellow-800">Top 3</p>
                    <p class="text-lg font-bold text-yellow-900">${Math.min(3, sortedRanking.length)}</p>
                  </div>
                </div>
              </div>

              <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border-l-4 border-blue-400">
                <div class="flex items-center">
                  <div class="p-2 bg-blue-100 rounded-full">
                    <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div class="ml-3">
                    <p class="text-sm font-medium text-blue-800">Xuất sắc</p>
                    <p class="text-lg font-bold text-blue-900">${sortedRanking.filter(s => (parseFloat(s.Diem || s.TongDiem || s.DiemRL || 0)) >= 90).length}</p>
                  </div>
                </div>
              </div>

              <div class="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-l-4 border-green-400">
                <div class="flex items-center">
                  <div class="p-2 bg-green-100 rounded-full">
                    <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div class="ml-3">
                    <p class="text-sm font-medium text-green-800">Trung bình</p>
                    <p class="text-lg font-bold text-green-900">${(sortedRanking.reduce((sum, s) => sum + (parseFloat(s.Diem || s.TongDiem || s.DiemRL || 0)), 0) / sortedRanking.length).toFixed(1)}</p>
                  </div>
                </div>
              </div>

              <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border-l-4 border-purple-400">
                <div class="flex items-center">
                  <div class="p-2 bg-purple-100 rounded-full">
                    <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div class="ml-3">
                    <p class="text-sm font-medium text-purple-800">Tổng số</p>
                    <p class="text-lg font-bold text-purple-900">${sortedRanking.length}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        document.getElementById("modal-body").innerHTML = rankingHTML;

        // Add event listeners cho phân trang
        addPaginationEventListeners();
        
        // Add filter functionality
        addFilterEventListeners();
      }

      // Hàm thêm event listeners cho phân trang
      function addPaginationEventListeners() {
        // Previous page button
        const prevBtn = document.getElementById("btn-prev-page");
        if (prevBtn) {
          prevBtn.addEventListener("click", () => {
            if (currentPage > 1) {
              currentPage--;
              renderRankingTable(currentPage);
            }
          });
        }

        // Next page button
        const nextBtn = document.getElementById("btn-next-page");
        if (nextBtn) {
          nextBtn.addEventListener("click", () => {
            if (currentPage < totalPages) {
              currentPage++;
              renderRankingTable(currentPage);
            }
          });
        }

        // Page number buttons
        const pageBtns = document.querySelectorAll(".page-btn");
        pageBtns.forEach(btn => {
          btn.addEventListener("click", () => {
            const pageNum = parseInt(btn.dataset.page);
            currentPage = pageNum;
            renderRankingTable(currentPage);
          });
        });
      }

      // Hàm thêm event listeners cho filter
      function addFilterEventListeners() {
        const applyFilterBtn = document.getElementById("btn-apply-ranking-filter");
        if (applyFilterBtn) {
          applyFilterBtn.addEventListener("click", () => {
            const selectedKhoa = document.getElementById("filter-khoa-ranking").value;
            const selectedLop = document.getElementById("filter-lop-ranking").value;
            
            let filteredData = [...sortedRanking];
            
            if (selectedKhoa) {
              filteredData = filteredData.filter(s => (s.TenKhoa || s.MaKhoa) === selectedKhoa);
            }
            
            if (selectedLop) {
              filteredData = filteredData.filter(s => (s.TenLop || s.MaLop) === selectedLop);
            }
            
            // Reset về trang 1 khi filter
            currentPage = 1;
            
            // Re-render với dữ liệu đã filter
            renderFilteredRankingTable(filteredData);
          });
        }
      }

      // Render trang đầu tiên
      renderRankingTable(1);

    } catch (error) {
      console.error("Error loading ranking:", error);
      document.getElementById("modal-body").innerHTML = `
        <div class="text-center py-8 text-red-500">
          <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-16 w-16 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="mt-4 text-lg font-semibold">Lỗi tải dữ liệu</p>
          <p class="text-sm text-red-400">Không thể tải bảng xếp hạng từ bảng LUUTRUDIEMSV. Vui lòng thử lại sau.</p>
          <button onclick="showStudentRanking()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Thử lại</button>
        </div>
      `;
    }
  }

  // Helper function to render filtered ranking table
  function renderFilteredRankingTable(filteredData) {
    const tbody = document.getElementById("ranking-table-body");
    if (!tbody) return;

    let tableHTML = '';
    
    filteredData.forEach((student, index) => {
      const rank = index + 1;
      const points = parseFloat(student.Diem || student.TongDiem || student.DiemRL || 0);
      
      let rankBadge = '';
      if (rank === 1) rankBadge = '🥇';
      else if (rank === 2) rankBadge = '🥈';
      else if (rank === 3) rankBadge = '🥉';
      else if (rank <= 10) rankBadge = '🏅';
      else rankBadge = `${rank}`;

      let gradeLevel = '';
      let gradeClass = '';
      if (points >= 90) {
        gradeLevel = 'Xuất sắc';
        gradeClass = 'grade-excellent';
      } else if (points >= 80) {
        gradeLevel = 'Giỏi';
        gradeClass = 'grade-good';
      } else if (points >= 70) {
        gradeLevel = 'Khá';
        gradeClass = 'grade-fair';
      } else if (points >= 60) {
        gradeLevel = 'Trung bình';
        gradeClass = 'grade-average';
      } else {
        gradeLevel = 'Yếu';
        gradeClass = 'grade-poor';
      }

      tableHTML += `
        <tr>
          <td class="text-center">
            <span class="rank-badge ${
              rank === 1 ? 'rank-gold' : 
              rank === 2 ? 'rank-silver' : 
              rank === 3 ? 'rank-bronze' : 
              rank <= 10 ? 'rank-top10' : 
              'rank-normal'
            }">
              ${rankBadge}
            </span>
          </td>
          <td>
            <div class="flex items-center space-x-3">
              <img class="w-8 h-8 rounded-full object-cover" 
                   src="${student.AnhDD ? `data:image/jpeg;base64,${student.AnhDD}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(student.TenSV || student.HoTen || student.MSSV)}&size=32&background=0D8ABC&color=fff`}" 
                   alt="Avatar">
              <div>
                <div class="text-sm font-semibold text-gray-900">${student.TenSV || student.HoTen || 'N/A'}</div>
              </div>
            </div>
          </td>
          <td class="text-sm font-mono text-gray-900">${student.MSSV || 'N/A'}</td>
          <td class="text-sm text-gray-900">${student.TenLop || student.MaLop || 'N/A'}</td>
          <td class="text-sm text-gray-900">${student.TenKhoa || student.MaKhoa || 'N/A'}</td>
          <td>
            <span class="points-display">
              ${points.toFixed(1)} điểm
            </span>
          </td>
          <td>
            <span class="grade-badge ${gradeClass}">
              ${gradeLevel}
            </span>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = tableHTML;
  }
