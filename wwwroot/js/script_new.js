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

  // ====== Bảng xếp hạng sinh viên từ bảng LUUTRUDIEMSV ======
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
          <td class="td class="text-sm text-gray-900">${student.TenKhoa || student.MaKhoa || 'N/A'}</td>
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
});
