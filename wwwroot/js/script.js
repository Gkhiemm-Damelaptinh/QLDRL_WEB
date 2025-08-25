document.addEventListener("DOMContentLoaded", async () => {
  // ==== cấu hình API ====
  const API_BASE = "http://localhost:5204"; // <-- đổi URL/cổng theo API của bạn

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
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("change", () => {
      passwordInput.type = togglePassword.checked ? "text" : "password";
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
      <a href="#" class="hover-link">Đánh giá rèn luyện</a>
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
      }
    );
  }

  function renderLoggedInUI(username) {
    fadeReplace(
      navRight,
      `
      <a href="#" class="hover-link">Trang chủ</a>
      <a href="#" class="hover-link">Hoạt động</a>
      <a href="#" class="hover-link">Đánh giá rèn luyện</a>
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

      const info = await res.json(); // {MaTK, TenTK, TenNguoiDung, ChucVu}
      localStorage.setItem("loggedUser", info.TenNguoiDung || info.TenTK || user);
      try { localStorage.setItem("loggedUserInfo", JSON.stringify(info)); } catch {}
      renderLoggedInUI(localStorage.getItem("loggedUser"));
      loginModal.classList.add("hidden");
      hideLoginError(); // Ẩn lỗi khi đăng nhập thành công
    } catch (err) {
      console.error(err);
      showLoginError("Lỗi kết nối. Vui lòng thử lại sau!");
    }
  });

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
  if (savedUser) renderLoggedInUI(savedUser); else renderLoggedOutUI();
});
