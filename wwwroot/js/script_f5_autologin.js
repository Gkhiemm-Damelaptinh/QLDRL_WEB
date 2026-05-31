// Global handler for unhandled promise rejections (prevents console errors)
window.addEventListener('unhandledrejection', event => {
  console.warn('[Unhandled Promise Rejection]', event.reason);
  // Prevent the error from being logged as uncaught
  event.preventDefault();
});

// ✅ F5 AUTO-LOGIN FUNCTION (defined OUTSIDE DOMContentLoaded so it's available early)
function triggerF5AutoLogin() {
  // ✅ FIX: Use correct key names (savedTenTK, not F5_AUTO_LOGIN_TenTK)
  const F5_TenTK = localStorage.getItem("savedTenTK");
  const F5_MatKhau = localStorage.getItem("savedMatKhau");
  
  if (!F5_TenTK || !F5_MatKhau) {
    console.log('🔄 [F5-AUTO-LOGIN] No saved credentials found');
    return;
  }
  
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginForm = document.getElementById("login-form");
  const loginModal = document.getElementById("login-modal");
  
  if (usernameInput && passwordInput && loginForm) {
    // Clear F5 auto-login flags
    localStorage.removeItem("F5_AUTO_LOGIN_PENDING");
    localStorage.removeItem("F5_AUTO_LOGIN_TenTK");
    localStorage.removeItem("F5_AUTO_LOGIN_MatKhau");
    
    // Fill form
    usernameInput.value = F5_TenTK;
    passwordInput.value = F5_MatKhau;
    
    // Show modal if hidden
    if (loginModal && loginModal.classList.contains("hidden")) {
      loginModal.classList.remove("hidden");
    }
    
    // Submit form after delay
    setTimeout(() => {
      console.log('🔄 [F5-AUTO-LOGIN] Submitting form...');
      loginForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }, 150);
  } else {
    // Retry if form not ready
    console.log('🔄 [F5-AUTO-LOGIN] Form not ready, retrying...');
    setTimeout(triggerF5AutoLogin, 300);
  }
}

// ✅ DISPLAY AI RESULTS FOR ATTENDANCE MODAL - Defined here to ensure it's available BEFORE being called
function displayAIResultsAttendance(result) {
  console.log('🎬 displayAIResultsAttendance() called with result:', result);
  
  // Helper to convert to percentage
  const toPct = (v) => {
    if (v == null) return null;
    let n = v;
    if (typeof v === 'string') { n = parseFloat(v); if (!isFinite(n)) return null; }
    if (typeof n !== 'number' || !isFinite(n)) return null;
    if (n <= 1) n = n * 100;
    n = Math.max(0, Math.min(100, Math.round(n)));
    return n;
  };

  // Get attendance-specific elements
  const aiResultEl = document.getElementById("ai-result-attendance");
  const statusIconEl = document.getElementById("ai-status-icon-attendance");
  const statusTitleEl = document.getElementById("ai-status-title-attendance");
  const confidenceScoreEl = document.getElementById("confidence-score-attendance");
  const confidenceBarEl = document.getElementById("confidence-bar-attendance");
  
  // Face, Context, Device elements
  const faceScoreEl = document.getElementById("face-score-attendance");
  const faceStatusEl = document.getElementById("face-status-attendance");
  const bannerScoreEl = document.getElementById("banner-score-attendance");
  const bannerStatusEl = document.getElementById("banner-status-attendance");
  const deviceScoreEl = document.getElementById("device-score-attendance");
  const deviceStatusEl = document.getElementById("device-status-attendance");
  
  // Analysis details
  const analysisDetailsEl = document.getElementById("analysis-details-attendance");
  
  console.log('🔍 Elements:', { aiResultEl, faceScoreEl, bannerScoreEl, deviceScoreEl });

  if (!aiResultEl || !statusIconEl) {
    console.warn('❌ Missing key elements');
    return;
  }

  // Extract raw decimal scores (0.0-1.0 or percentage)
  const scores = result.scores || result.Scores || {};
  let faceScore = result.face_score || scores.face;  // Keep as decimal
  let contextScore = result.context_score || result.banner_score || scores.context || scores.banner;  // Keep as decimal
  let deviceScore = result.device_score || scores.device;  // Keep as decimal
  let interactionScore = result.interaction_score || scores.interaction || 0.0;  // Default 0
  
  // Convert to percentages for display
  let faceScorePct = toPct(faceScore);
  let bannerScorePct = toPct(contextScore);
  let deviceScorePct = toPct(deviceScore);
  let interactionScorePct = toPct(interactionScore);
  
  // Calculate weighted score using exact formula: Face 50% + Context 30% + Device 10% + Interaction 10%
  let weightedScorePct = null;
  if (result.weighted_score != null || result.weightedScore != null) {
    // Use backend-calculated weighted score if available
    weightedScorePct = toPct(result.weighted_score || result.weightedScore);
  } else if (faceScore != null && contextScore != null && deviceScore != null) {
    // Calculate using weighted formula (convert decimals to 0-1 range if needed)
    let f = faceScore <= 1 ? faceScore : faceScore / 100;
    let c = contextScore <= 1 ? contextScore : contextScore / 100;
    let d = deviceScore <= 1 ? deviceScore : deviceScore / 100;
    let i = interactionScore <= 1 ? interactionScore : interactionScore / 100;
    let weighted = (f * 0.50) + (c * 0.30) + (d * 0.10) + (i * 0.10);
    weightedScorePct = Math.round(Math.max(0, Math.min(100, weighted * 100)));
  }

  console.log('📊 Scores (raw):', { faceScore, contextScore, deviceScore, interactionScore });
  console.log('📊 Scores (%):', { faceScorePct, bannerScorePct, deviceScorePct, interactionScorePct, weightedScorePct });

  // Set verdict
  let verdict = result.verdict || result.Verdict || 'Pending';
  let isApproved = result.isValid === true || verdict === 'Approved' || verdict === 'Đạt' || weightedScorePct >= 60;

  if (isApproved) {
    statusIconEl.innerHTML = `<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    statusTitleEl.textContent = 'Hợp lệ ✅';
    statusTitleEl.className = "text-lg font-semibold text-green-800";
  } else {
    statusIconEl.innerHTML = `<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    statusTitleEl.textContent = 'Không hợp lệ ❌';
    statusTitleEl.className = "text-lg font-semibold text-red-800";
  }

  // Update score display
  if (confidenceScoreEl && weightedScorePct != null) {
    confidenceScoreEl.textContent = `${weightedScorePct}%`;
  }
  
  if (confidenceBarEl && weightedScorePct != null) {
    confidenceBarEl.style.width = `${Math.min(100, weightedScorePct)}%`;
    if (weightedScorePct >= 80) {
      confidenceBarEl.className = "h-2 rounded-full transition-all duration-500 bg-green-500";
    } else if (weightedScorePct >= 60) {
      confidenceBarEl.className = "h-2 rounded-full transition-all duration-500 bg-yellow-500";
    } else {
      confidenceBarEl.className = "h-2 rounded-full transition-all duration-500 bg-red-500";
    }
  }

  // Render categories with bars and details
  function renderCategory(elScore, elStatus, elBar, elDetails, scorePct, name, detailsData) {
    if (!elScore || !elStatus) return;
    if (scorePct == null) { 
      elScore.textContent = '—'; 
      elStatus.textContent = 'Không có';
      if (elBar) elBar.style.width = '0%';
      if (elDetails) elDetails.classList.add('hidden');
      return; 
    }
    
    // Update score & status
    elScore.textContent = `${scorePct}%`;
    let statusText, statusClass, barColor;
    if (scorePct >= 80) {
      statusText = '✅ Đạt';
      statusClass = 'text-sm font-semibold text-green-700';
      barColor = 'bg-green-500';
    } else if (scorePct >= 60) {
      statusText = '⚠️ Cảnh báo';
      statusClass = 'text-sm font-semibold text-yellow-700';
      barColor = 'bg-yellow-500';
    } else {
      statusText = '❌ Thất bại';
      statusClass = 'text-sm font-semibold text-red-700';
      barColor = 'bg-red-500';
    }
    elStatus.textContent = statusText;
    elStatus.className = statusClass;
    
    // Update progress bar
    if (elBar) {
      elBar.style.width = `${Math.min(100, scorePct)}%`;
      elBar.className = `h-1.5 rounded-full transition-all duration-500 ${barColor}`;
    }
    
    // Show/hide details section
    if (elDetails && detailsData) {
      elDetails.classList.remove('hidden');
    } else if (elDetails) {
      elDetails.classList.add('hidden');
    }
  }

  // Populate details for Face
  const faceDetailsEl = document.getElementById("face-details-attendance");
  if (faceDetailsEl && result.details && result.details.face) {
    const faceInfo = result.details.face;
    const detailHtml = `
      <div class="flex justify-between">
        <span class="font-semibold">Trạng thái:</span>
        <span class="font-mono">${faceInfo.note ? '✓ Phát hiện' : '✗ Không phát hiện'}</span>
      </div>
      <div class="text-gray-500 italic text-xs">${faceInfo.note || 'Không có khuôn mặt trong video'}</div>
      ${faceInfo.timings_ms ? `<div class="text-gray-400 text-xs">Xử lý: ${faceInfo.timings_ms.total_ms?.toFixed(0)}ms</div>` : ''}
    `;
    faceDetailsEl.innerHTML = detailHtml;
  }

  // Populate details for Context/Bối cảnh
  const bannerDetailsEl = document.getElementById("banner-details-attendance");
  if (bannerDetailsEl && result.details && result.details.context) {
    const ctxInfo = result.details.context;
    let probsHtml = '';
    if (ctxInfo.context_probs) {
      probsHtml = '<div class="text-xs text-gray-500 space-y-0.5 mt-1">';
      Object.entries(ctxInfo.context_probs).sort((a,b) => b[1] - a[1]).slice(0, 3).forEach(([k, v]) => {
        probsHtml += `<div><span class="font-mono">${k}</span>: <strong>${(v*100).toFixed(0)}%</strong></div>`;
      });
      probsHtml += '</div>';
    }
    
    const detailHtml = `
      <div class="flex justify-between">
        <span class="font-semibold">Dự đoán:</span>
        <span class="font-mono font-semibold text-amber-700">${ctxInfo.predicted_context || '—'}</span>
      </div>
      <div class="flex justify-between">
        <span class="font-semibold">Mong đợi:</span>
        <span class="font-mono">${result.expected_context || '—'}</span>
      </div>
      ${probsHtml}
      ${ctxInfo.people_count_avg ? `<div class="text-xs text-gray-500 mt-1">Người: ${ctxInfo.people_count_avg.toFixed(1)}, Chuyển động: ${ctxInfo.motion_score.toFixed(2)}</div>` : ''}
    `;
    bannerDetailsEl.innerHTML = detailHtml;
  }

  // Populate details for GPS/Device
  const deviceDetailsEl = document.getElementById("device-details-attendance");
  if (deviceDetailsEl && result.details && result.details.device) {
    const devInfo = result.details.device;
    const hasGps = result.lat && result.lng;
    let distanceHtml = '';
    if (result.gps_distance_km != null) {
      const distM = (result.gps_distance_km * 1000).toFixed(0);
      const distKm = result.gps_distance_km.toFixed(2);
      distanceHtml = `<div id="device-detail-distance" class="text-amber-700 font-semibold">📍 Cách ${distKm}km (${distM}m)</div>`;
    }
    
    let coordsHtml = '';
    if (result.lat && result.lng && result.activity_lat && result.activity_lng) {
      coordsHtml = `<div id="device-detail-coords" class="text-xs text-gray-400 mt-1">
        Video: (${parseFloat(result.lat).toFixed(4)}, ${parseFloat(result.lng).toFixed(4)}) →
        Hoạt động: (${parseFloat(result.activity_lat).toFixed(4)}, ${parseFloat(result.activity_lng).toFixed(4)})
      </div>`;
    }
    
    const detailHtml = `
      <div class="flex justify-between">
        <span class="font-semibold">GPS:</span>
        <span class="font-mono">${hasGps ? '✓ Có' : '✗ Không'}</span>
      </div>
      ${distanceHtml}
      ${coordsHtml}
    `;
    deviceDetailsEl.innerHTML = detailHtml;
  }

  // Call render with bar and details elements
  const faceBarEl = document.getElementById("face-bar-attendance");
  const bannerBarEl = document.getElementById("banner-bar-attendance");
  const deviceBarEl = document.getElementById("device-bar-attendance");
  
  renderCategory(faceScoreEl, faceStatusEl, faceBarEl, faceDetailsEl, faceScorePct, 'Face', result.details?.face);
  renderCategory(bannerScoreEl, bannerStatusEl, bannerBarEl, bannerDetailsEl, bannerScorePct, 'Context', result.details?.context);
  renderCategory(deviceScoreEl, deviceStatusEl, deviceBarEl, deviceDetailsEl, deviceScorePct, 'Device', result.details?.device);

  // ✅ POPULATE CHI TIẾT PHÂN TÍCH (New detailed section)
  const detailFaceScoreEl = document.getElementById("detail-face-score");
  const detailContextScoreEl = document.getElementById("detail-context-score");
  const detailContextInfoEl = document.getElementById("detail-context-info");
  const detailDeviceScoreEl = document.getElementById("detail-device-score");
  const detailDeviceInfoEl = document.getElementById("detail-device-info");
  
  if (detailFaceScoreEl) {
    detailFaceScoreEl.textContent = faceScorePct != null ? `${faceScorePct}%` : '—';
  }
  
  if (detailContextScoreEl) {
    detailContextScoreEl.textContent = bannerScorePct != null ? `${bannerScorePct}%` : '—';
  }
  
  if (detailContextInfoEl && result.details && result.details.context) {
    const ctxInfo = result.details.context;
    const predicted = ctxInfo.predicted_context || 'Không xác định';
    const expectedContext = result.expected_context;
    const prob = ctxInfo.context_probs?.[predicted] || 0;
    const probPct = Math.round(prob * 100);
    
    if (expectedContext === predicted) {
      detailContextInfoEl.innerHTML = `✅ Khớp: <span class="text-green-600 font-semibold">${predicted}</span> | ${probPct}%`;
    } else {
      detailContextInfoEl.innerHTML = `❌ Sai bối cảnh<br/><span class="text-xs text-gray-600">Dự đoán: ${predicted} | Mong đợi: ${expectedContext || 'N/A'}</span>`;
    }
  } else if (detailContextInfoEl) {
    detailContextInfoEl.textContent = result.predicted_context || 'Không xác định';
  }
  
  if (detailDeviceScoreEl) {
    detailDeviceScoreEl.textContent = deviceScorePct != null ? `${deviceScorePct}%` : '—';
  }
  
  if (detailDeviceInfoEl) {
    const hasGps = result.lat && result.lng;
    if (hasGps) {
      const distKm = result.gps_distance_km || 0;
      detailDeviceInfoEl.textContent = distKm > 0 ? `✓ Rõ: ${distKm.toFixed(2)}km` : '✓ Có GPS';
    } else {
      detailDeviceInfoEl.textContent = 'Thiếu / sai';
    }
  }

  // ✅ BUILD ANALYSIS DETAILS - Show user-friendly information only
  if (analysisDetailsEl) {
    let detailsHTML = '<div class="space-y-2">';
    
    // Show Face analysis
    if (faceScorePct != null) {
      detailsHTML += '<div class="border-b pb-2"><strong>Khương mặt:</strong>';
      detailsHTML += ` ${faceScorePct}%</div>`;
    }
    
    // Show Context analysis with Expected vs Actual (only user-relevant info)
    if (result.expected_context || bannerScorePct != null) {
      detailsHTML += '<div class="border-b pb-2"><strong>Bối cảnh:</strong>';
      
      if (result.expected_context === result.predicted_context) {
        // Context matches
        detailsHTML += ` ✅ Khớp: <span class="text-green-600">${result.expected_context}</span>`;
      } else if (result.predicted_context) {
        // Context mismatch
        detailsHTML += ` ❌ Sai bối cảnh<br/>`;
        detailsHTML += `<span class="text-xs text-gray-700">Dự đoán: ${result.predicted_context}</span><br/>`;
        detailsHTML += `<span class="text-xs text-gray-700">Mong đợi: ${result.expected_context}</span>`;
      }
      
      if (bannerScorePct != null) {
        detailsHTML += ` | ${bannerScorePct}%`;
      }
      
      detailsHTML += '</div>';
    }
    
    // Show Device/GPS analysis
    if (deviceScorePct != null) {
      detailsHTML += '<div><strong>Thiết bị / Vị trị:</strong>';
      
      if (result.gps_distance != null && result.gps_distance > 0) {
        detailsHTML += ` ${Math.round(result.gps_distance)}m`;
      }
      
      detailsHTML += ` | ${deviceScorePct}%</div>`;
    }
    
    detailsHTML += '</div>';
    
    analysisDetailsEl.innerHTML = detailsHTML;
    console.log('✅ Analysis details populated');
  }

  console.log('✅ displayAIResultsAttendance() DONE');
}

// ✅ CẢI THIỆN: Đơn giản hóa - chỉ load từ API, không cần cache phức tạp
// Dữ liệu API sẽ hiển thị ngay khi fetch xong
console.log('%c🔥 [GLOBAL-SCOPE] script_f5_autologin.js loaded! 🔥', 'color: red; font-size: 16px; font-weight: bold');

document.addEventListener("DOMContentLoaded", async () => {
  console.log('%c🔥 [GLOBAL-SCOPE→DOMContentLoaded] Event handler called! 🔥', 'color: red; font-size: 16px; font-weight: bold');
  // ==== cấu hình API ====
  // Cho phép override qua localStorage (api_base_url); mặc định cùng origin
  let API_BASE = (() => {
    try {
      const v = localStorage.getItem('api_base_url');
      if (v && typeof v === 'string') return v.replace(/\/$/, '');
    } catch {}
    return ""; // dùng đường dẫn tuyệt đối /api/... theo cùng origin
  })();

  // ==== Logout khi tab/window đóng (xóa server session) ====
  // Phân biệt F5 reload vs Close tab:
  // - F5/Ctrl+R: user intent reload → giữ localStorage (auto-login)
  // - Close tab/Alt+F4: user intent logout → xóa localStorage
  
  let isReloading = false;
  
  // Detect reload/navigate actions
  window.addEventListener('beforeunload', (event) => {
    // Nếu user nhấn F5, Ctrl+R, Ctrl+W (reload/navigate) → set flag
    // Nhưng close tab không trigger sự kiện này đủ sớm
    // Vì vậy ta dùng khác cách: detect keyboard/click intent
    
    // Check nếu user nhấn F5 hoặc reload button
    // Thực tế: beforeunload không thể phân biệt F5 vs close
    // Nên ta dùng visibilitychange + unload combination
  });
  
  // Better approach: track reload via sessionStorage flag
  // Nếu page reload (F5), sessionStorage vẫn tồn tại
  // Nếu close tab + reopen, sessionStorage mất
  
  // Khi page load, check xem có session data không
  try {
    const savedUser = localStorage.getItem("loggedUser");
    const savedInfo = localStorage.getItem("loggedUserInfo");
    
    if (savedUser && savedInfo) {
      // Restore sessionStorage từ localStorage (người dùng vẫn đang login)
      sessionStorage.setItem("loggedUser", savedUser);
      sessionStorage.setItem("loggedUserInfo", savedInfo);
      console.log('✅ Auto-restored login state from localStorage (F5 detected)');
    }
  } catch {}
  
  // REMOVED: pagehide listener
  // Reason: pagehide event.persisted is unreliable for detecting F5 vs tab close
  // The backend keepalive endpoint will clear session cookies on actual tab close
  // We'll let localStorage persist - it will be cleared only on true logout action

  // ==== Persisted student activity registration state (survives refresh, cleared on tab close) ====
  function loadRegState(){
    try {
      const setRaw = sessionStorage.getItem('sv_reg_set');
      const detRaw = sessionStorage.getItem('sv_reg_detail');
      if (!window._svRegSet) window._svRegSet = new Set();
      if (!window._svRegDetail) window._svRegDetail = {};
      if (setRaw){
        try { JSON.parse(setRaw).forEach(id => window._svRegSet.add(String(id))); } catch {}
      }
      if (detRaw){
        try { const obj = JSON.parse(detRaw); if (obj && typeof obj === 'object') window._svRegDetail = obj; } catch {}
      }
    } catch {}
  }
  function saveRegState(){
    try {
      const setArr = window._svRegSet ? Array.from(window._svRegSet) : [];
      sessionStorage.setItem('sv_reg_set', JSON.stringify(setArr));
      sessionStorage.setItem('sv_reg_detail', JSON.stringify(window._svRegDetail || {}));
      // Also save to localStorage for iOS fallback (aggressive caching)
      try {
        localStorage.setItem('_svRegState', JSON.stringify({
          set: setArr,
          detail: window._svRegDetail || {},
          timestamp: Date.now()
        }));
      } catch {}
    } catch {}
  }
  // Hydrate registration cache on page load
  loadRegState();

  // ==== phần tử UI có sẵn trong index.html ====
  const activitiesContainer = document.getElementById("activities");
  const noActivity = document.getElementById("no-activity");
  
  // 🔥 FIX: Create login modal if not exists (might be missing from index.html)
  let loginModal = document.getElementById("login-modal");
  if (!loginModal) {
    console.log('🔴 [INIT] Login modal not found in HTML, creating it dynamically...');
    loginModal = document.createElement('div');
    loginModal.id = 'login-modal';
    loginModal.className = 'modal hidden';
    loginModal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <h2 class="modal-title">Đăng nhập</h2>
        <form id="login-form">
          <div class="form-group">
            <label for="username">Tên đăng nhập</label>
            <input type="text" id="username" class="form-control" placeholder="Nhập tên đăng nhập" required>
          </div>
          <div class="form-group">
            <label for="password">Mật khẩu <span id="toggle-password-label" class="toggle-password-label">
              <input type="checkbox" id="toggle-password" class="toggle-password" title="Hiển thị mật khẩu">
              Hiện
            </span></label>
            <input type="password" id="password" class="form-control" placeholder="Nhập mật khẩu" required>
          </div>
          <div id="login-error" class="login-error hidden"></div>
          <div class="form-group">
            <button type="submit" class="btn btn-primary w-full">Đăng nhập</button>
          </div>
        </form>
        <button id="cancel-login" class="btn-close">×</button>
      </div>
    `;
    document.body.appendChild(loginModal);
    console.log('✅ Login modal created successfully');
  }
  
  // Global variable để lưu pending action khi user chưa login
  let pendingWizardAction = null;
  const cancelLogin = document.getElementById("cancel-login");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const navRight = document.getElementById("nav-right");
  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("toggle-password");
  const btnRanking = document.getElementById("btn-ranking");
  const btnHome = document.getElementById("btn-home");
  const btnActivities = document.getElementById("btn-activities");
  const closeWizard = document.getElementById("close-wizard");
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("change", () => {
      passwordInput.type = togglePassword.checked ? "text" : "password";
    });
  }

  // Mobile menu toggle - Using Event Delegation (attach to document, not to button)
  // This way it works even if button is re-rendered during login/logout
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "mobile-menu-btn") {
      console.log('🔍 Mobile menu button clicked');
      const mobileSidebar = document.getElementById("mobile-sidebar");
      const mobileOverlay = document.getElementById("mobile-sidebar-overlay");
      
      if (mobileSidebar && mobileOverlay) {
        mobileSidebar.classList.toggle("-translate-x-full");
        mobileOverlay.classList.toggle("hidden");
        console.log('📱 Mobile sidebar toggled');
      } else {
        console.warn('⚠️ Mobile sidebar or overlay not found!');
      }
    }
  });
  
  // Close mobile sidebar when clicking overlay
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "mobile-sidebar-overlay") {
      const mobileSidebar = document.getElementById("mobile-sidebar");
      if (mobileSidebar) {
        mobileSidebar.classList.add("-translate-x-full");
        e.target.classList.add("hidden");
      }
    }
  });

  // Helper function to setup desktop navigation events
  function setupNavigationEvents() {
    const btn = document.getElementById("btn-login");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        loginModal.classList.remove("hidden");
        hideLoginError();
      });
    }
    // ✅ Removed: btn-home listener moved to event delegation below
    // Open evaluation when clicking "Đánh giá rèn luyện" is now handled by event delegation (line 339)
    
    // Các event listeners khác đã được xử lý bằng event delegation ở trên
  }

  // Helper function to setup mobile navigation events
  function setupMobileNavigationEvents() {
    const btn = document.getElementById("btn-login-mobile");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        loginModal.classList.remove("hidden");
        mobileMenu.classList.add("hidden"); // Close mobile menu
        hideLoginError();
      });
    }
    // Open evaluation when clicking in mobile nav
    const btnHomeMobile = document.getElementById("btn-home-mobile");
    if (btnHomeMobile) {
      btnHomeMobile.addEventListener("click", (e) => {
        e.preventDefault();
        if (ensureLoggedIn()) {
          openTrainingEvaluation();
        }
        const mobileSidebar = document.getElementById("mobile-sidebar");
        const mobileOverlay = document.getElementById("mobile-sidebar-overlay");
        if (mobileSidebar) mobileSidebar.classList.add("-translate-x-full");
        if (mobileOverlay) mobileOverlay.classList.add("hidden");
      });
    }
    
    // Các event listeners khác đã được xử lý bằng event delegation ở trên
  }

  // Add event listener for ranking button
  if (btnRanking) {
    btnRanking.addEventListener("click", () => {
      showStudentRanking();
    });
  }

  // Event listeners đã được xử lý bằng event delegation ở dưới
  
  // Sử dụng event delegation để xử lý các nút navigation
  document.addEventListener("click", (e) => {
    // Mobile sidebar menu items
    if (e.target.closest('.mobile-sidebar-item')) {
      const sidebarItem = e.target.closest('.mobile-sidebar-item');
      const text = sidebarItem.querySelector('.mobile-sidebar-text');
      
      if (text) {
        const menuText = text.textContent.trim();
        
        // Remove active class from all mobile sidebar items
        document.querySelectorAll('.mobile-sidebar-item').forEach(item => {
          item.classList.remove('active');
        });
        
        // Add active class to clicked item
        sidebarItem.classList.add('active');
        
        // Handle menu actions
        if (menuText === 'Lưu minh chứng') {
          if (ensureLoggedIn()) {
            document.getElementById("wizard-modal").classList.remove("hidden");
          }
          // Close mobile sidebar
          const mobileSidebar = document.getElementById("mobile-sidebar");
          const mobileOverlay = document.getElementById("mobile-sidebar-overlay");
          if (mobileSidebar) mobileSidebar.classList.add("-translate-x-full");
          if (mobileOverlay) mobileOverlay.classList.add("hidden");
        } else if (menuText === 'Bảng xếp hạng') {
          showStudentRanking();
          // Close mobile sidebar
          const mobileSidebar = document.getElementById("mobile-sidebar");
          const mobileOverlay = document.getElementById("mobile-sidebar-overlay");
          if (mobileSidebar) mobileSidebar.classList.add("-translate-x-full");
          if (mobileOverlay) mobileOverlay.classList.add("hidden");
        } else if (menuText === 'Đánh giá rèn luyện') {
          if (ensureLoggedIn()) {
            openTrainingEvaluation();
          }
          const mobileSidebar = document.getElementById("mobile-sidebar");
          const mobileOverlay = document.getElementById("mobile-sidebar-overlay");
          if (mobileSidebar) mobileSidebar.classList.add("-translate-x-full");
          if (mobileOverlay) mobileOverlay.classList.add("hidden");
        }
      }
    }
    
    // Avatar click events - Desktop và Mobile
    if (e.target.closest('.user-avatar') || e.target.closest('.user-avatar-mobile')) {
      e.preventDefault();
      e.stopPropagation();
      
      // Close mobile sidebar if open
      const mobileSidebar = document.getElementById("mobile-sidebar");
      const mobileOverlay = document.getElementById("mobile-sidebar-overlay");
      if (mobileSidebar) mobileSidebar.classList.add("-translate-x-full");
      if (mobileOverlay) mobileOverlay.classList.add("hidden");
      
      // Open student profile
      openCurrentStudentProfile();
    }
    
    // Mobile sidebar avatar click
    if (e.target.closest('#mobile-user-profile-section .flex.items-center')) {
      e.preventDefault();
      e.stopPropagation();
      
      // Close mobile sidebar
      const mobileSidebar = document.getElementById("mobile-sidebar");
      const mobileOverlay = document.getElementById("mobile-sidebar-overlay");
      if (mobileSidebar) mobileSidebar.classList.add("-translate-x-full");
      if (mobileOverlay) mobileOverlay.classList.add("hidden");
      
      // Open student profile
      openCurrentStudentProfile();
    }
    
    // Legacy button handling (for backward compatibility)
    if (e.target && e.target.id === "btn-activities") {
      if (ensureLoggedIn()) {
        document.getElementById("wizard-modal").classList.remove("hidden");
        try { loadCriteriaOptions(); } catch {}
      }
    } else if (e.target && e.target.id === "btn-activities-mobile") {
      if (ensureLoggedIn()) {
        document.getElementById("wizard-modal").classList.remove("hidden");
        try { loadCriteriaOptions(); } catch {}
      }
      mobileMenu.classList.add("hidden");
    } else if (e.target && e.target.id === "btn-home") {
      e.preventDefault();
      if (ensureLoggedIn()) {
        openTrainingEvaluation();
      }
    } else if (e.target && e.target.id === "btn-home-mobile") {
      e.preventDefault();
      if (ensureLoggedIn()) {
        openTrainingEvaluation();
      }
    } else if (e.target && e.target.id === "btn-ranking") {
      showStudentRanking();
    } else if (e.target && e.target.id === "btn-ranking-mobile") {
      showStudentRanking();
      mobileMenu.classList.add("hidden");
    } else if (e.target && e.target.id === "btn-logout") {
      // Call server logout endpoint to clear session
      fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' }).catch(() => {});
      // Clear sessionStorage
      sessionStorage.removeItem("loggedUser");
      sessionStorage.removeItem("loggedUserInfo");
      sessionStorage.removeItem("userAvatar");
      sessionStorage.removeItem("sv_reg_set");
      sessionStorage.removeItem("sv_reg_detail");
      sessionStorage.removeItem("qr_maHD");
      sessionStorage.removeItem("qr_tenHD");
      sessionStorage.removeItem("preload");
      // Clear localStorage (except api_base_url which is configuration)
      localStorage.removeItem("loggedUser");
      localStorage.removeItem("loggedUserInfo");
      localStorage.removeItem("userAvatar");
      renderLoggedOutUI();
    } else if (e.target && e.target.id === "btn-logout-mobile") {
      // Call server logout endpoint to clear session
      fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' }).catch(() => {});
      // Clear sessionStorage
      sessionStorage.removeItem("loggedUser");
      sessionStorage.removeItem("loggedUserInfo");
      sessionStorage.removeItem("userAvatar");
      sessionStorage.removeItem("sv_reg_set");
      sessionStorage.removeItem("sv_reg_detail");
      sessionStorage.removeItem("qr_maHD");
      sessionStorage.removeItem("qr_tenHD");
      sessionStorage.removeItem("preload");
      // Clear localStorage (except api_base_url which is configuration)
      localStorage.removeItem("loggedUser");
      localStorage.removeItem("loggedUserInfo");
      localStorage.removeItem("userAvatar");
      mobileMenu.classList.add("hidden");
      renderLoggedOutUI();
    }
  });
  // Load danh sách tiêu chí ĐGRL vào selector của wizard (chỉ dùng khi không ở attendance/QR)
  async function loadCriteriaOptions(){
    try {
      const sel = document.getElementById('criterion-select');
      if (!sel) return;
      
      // clear existing except first placeholder
      sel.querySelectorAll('option:not(:first-child)').forEach(o=>o.remove());
      
      // ✅ Load tiêu chí từ /api/tieuchi (NhomTieuChi + TieuChiCon)
      let groups = null;
      
      try {
        console.log('🔍 Fetching criteria from /api/tieuchi...');
        const res = await fetch(`${API_BASE}/api/tieuchi`);
        console.log('� API response status:', res.status);
        
        if (res.ok) {
          const data = await res.json();
          console.log('📋 API response data:', data);
          groups = Array.isArray(data) ? data : [];
          console.log('✅ Loaded', groups.length, 'groups from /api/tieuchi');
          
          if (groups.length > 0) {
            console.log('📊 First group:', groups[0]);
            console.log('📊 First group TieuChi:', groups[0].TieuChi);
          }
        } else {
          console.warn('❌ API error status:', res.status);
          const errText = await res.text();
          console.warn('❌ Error response:', errText);
        }
      } catch (e) {
        console.error('❌ Failed to fetch /api/tieuchi:', e);
      }
      
      // Parse dữ liệu thành options (giữ lại mã tiêu chí rõ ràng)
      const opts = [];
      if (groups && Array.isArray(groups)) {
        console.log('🔍 Groups data:', groups);  // Debug: xem cấu trúc dữ liệu
        groups.forEach((g, gi) => {
          const gCode = (g.MaSo || g.maSo || (gi+1)).toString();
          // ✅ Kiểm tra TieuChi (từ API, chứa dữ liệu từ bảng TieuChiCon)
          const items = Array.isArray(g.TieuChi) ? g.TieuChi : (Array.isArray(g.tieuChi) ? g.tieuChi : []);
          console.log('📋 Group', gi, 'TieuChi:', items?.length, 'items');  // Debug
          items.forEach((it, ii) => {
            const maTC = it.MaTC ?? it.maTC;
            const iCode = (it.MaSo || it.maSo || `${gi+1}.${ii+1}`).toString();
            const iName = it.TenTC || it.tenTC || `Tiêu chí ${iCode}`;
            // ✅ CHỈ hiển thị tiêu chí có CoMinhChung = 1/true (cần minh chứng)
            const needsProof = (it.CoMinhChung ?? it.coMinhChung) === 1 || (it.CoMinhChung ?? it.coMinhChung) === true;
            if (maTC && needsProof) {
              // Format: "1.1 — Tên tiêu chí" để sinh viên dễ nhận biết
              opts.push({ 
                value: Number(maTC), 
                label: `${iCode} — ${iName}`,
                code: iCode
              });
            }
          });
        });
      }
      
      // Thêm options vào dropdown
      if (opts.length === 0) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'Không có tiêu chí yêu cầu minh chứng';
        sel.appendChild(o);
        console.warn('No criteria with proof requirement found');
      } else {
        opts.forEach(opt => { 
          const o = document.createElement('option'); 
          o.value = String(opt.value); 
          o.textContent = opt.label;
          o.setAttribute('data-code', opt.code);  // ← Lưu mã để dễ trace
          sel.appendChild(o); 
        });
        console.log('Loaded', opts.length, 'criteria options');
      }
    } catch (e) {
      console.error('loadCriteriaOptions error:', e);
    }
  }
  
  if (closeWizard) {
    closeWizard.addEventListener("click", () => {
      console.log('🔍 closeWizard handler called');
      // Tắt camera khi đóng modal và reset UI
      try { stopCamera(); } catch {}

      // Reset các trạng thái nút và video
      const btnStart = document.getElementById("btn-start");
      const btnStop = document.getElementById("btn-stop");
      const btnSend = document.getElementById("btn-send");
      const preview = document.getElementById("video-preview");
      const resultVideo = document.getElementById("video-result");
      const aiResult = document.getElementById("ai-result");
      const faceUpload = document.getElementById("face-upload-section");
      const cameraOverlay = document.getElementById("camera-overlay");
      try { if (btnStart) btnStart.classList.remove("hidden"); } catch {}
      try { if (btnStop) btnStop.classList.add("hidden"); } catch {}
      try { if (btnSend) btnSend.classList.add("hidden"); } catch {}
      try { if (aiResult) aiResult.classList.add("hidden"); } catch {}
      try { if (resultVideo) { resultVideo.pause?.(); resultVideo.removeAttribute("src"); resultVideo.load?.(); resultVideo.classList.add("hidden"); } } catch {}
      try { if (preview) { preview.classList.remove("hidden"); preview.srcObject = null; } } catch {}
      try { if (faceUpload) faceUpload.classList.add("hidden"); } catch {}
      try { if (cameraOverlay) cameraOverlay.classList.add("opacity-0"); } catch {}

      // ✅ RESET MODAL STATE
      try { const wm = document.getElementById("wizard-modal"); if (wm) wm.classList.add("hidden"); } catch {}
      try { const s1 = document.getElementById("step-1"); if (s1) s1.classList.remove("hidden"); } catch {}
      // ❌ BỎ: Đừng ẩn step-2-video - nó sẽ được show lại khi mở modal
      // try { const sv = document.getElementById("step-2-video"); if (sv) sv.classList.add("hidden"); } catch {}
      try { const sc = document.getElementById("step-2-cert"); if (sc) sc.classList.add("hidden"); } catch {}
      
      // ✅ CLEAR QR DATA (để lần mở tiếp theo sẽ show criterion-select lại)
      try { 
        sessionStorage.removeItem("qr_maHD");
        sessionStorage.removeItem("qr_tenHD");
        console.log('✅ Cleared qr_maHD and qr_tenHD from sessionStorage');
      } catch {}
      
      // ✅ RESET CRITERION-SELECT-WRAP TO BE VISIBLE
      try { 
        const wrap = document.getElementById('criterion-select-wrap');
        if (wrap) {
          wrap.classList.remove('hidden');
          console.log('✅ Made criterion-select-wrap visible on close');
        }
      } catch {}
    });
  }

  // ✅ NEW: Close listener cho attendance-wizard-modal
  const closeAttendanceWizard = document.getElementById("close-attendance-wizard");
  if (closeAttendanceWizard) {
    closeAttendanceWizard.addEventListener("click", () => {
      console.log('🔍 closeAttendanceWizard handler called');
      // Tắt camera khi đóng modal và reset UI
      try { stopCamera(); } catch {}

      // Reset các trạng thái nút và video (attendance-specific)
      const btnStartAtt = document.getElementById("btn-start-attendance");
      const btnStopAtt = document.getElementById("btn-stop-attendance");
      const btnSendAtt = document.getElementById("btn-send-attendance");
      const previewAtt = document.getElementById("video-preview-attendance");
      const resultVideoAtt = document.getElementById("video-result-attendance");
      const aiResultAtt = document.getElementById("ai-result-attendance");
      const faceUploadAtt = document.getElementById("face-upload-section-attendance");
      const cameraOverlayAtt = document.getElementById("camera-overlay-attendance");
      try { if (btnStartAtt) btnStartAtt.classList.remove("hidden"); } catch {}
      try { if (btnStopAtt) btnStopAtt.classList.add("hidden"); } catch {}
      try { if (btnSendAtt) btnSendAtt.classList.add("hidden"); } catch {}
      try { if (aiResultAtt) { aiResultAtt.classList.add("hidden"); aiResultAtt.innerHTML = ''; } } catch {}
      try { if (resultVideoAtt) { resultVideoAtt.pause?.(); resultVideoAtt.removeAttribute("src"); resultVideoAtt.load?.(); resultVideoAtt.classList.add("hidden"); } } catch {}
      try { if (previewAtt) { previewAtt.classList.remove("hidden"); previewAtt.srcObject = null; } } catch {}
      try { if (faceUploadAtt) faceUploadAtt.classList.add("hidden"); } catch {}
      try { if (cameraOverlayAtt) cameraOverlayAtt.classList.add("opacity-0"); } catch {}

      // ✅ RESET MODAL STATE
      try { const attModal = document.getElementById("attendance-wizard-modal"); if (attModal) attModal.classList.add("hidden"); } catch {}
      try { const sv = document.getElementById("step-2-attendance-video"); if (sv) sv.classList.add("hidden"); } catch {}
      
      // ✅ XÓA TRẠNG THÁI VIDEO
      if (typeof window.lastBlob !== 'undefined') window.lastBlob = null;
      if (typeof window.recordedChunks !== 'undefined') window.recordedChunks = [];
      
      // ✅ XÓA ID HOẠT ĐỘNG TRONG SESSION ĐỂ LẦN SAU KHÔNG BỊ DÍNH
      sessionStorage.removeItem('qr_maHD');
      sessionStorage.removeItem('qr_tenHD');
      
      // 🔧 RESET WIRING FLAG: Allow modal to be wired again when reopened
      window._attendanceModalWired = false;
      console.log('ℹ️ Reset _attendanceModalWired flag for next modal open');
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

  // ====== Login guard ======
  function isLoggedIn() {
    try {
      // Kiểm tra sessionStorage trước
      let u = sessionStorage.getItem("loggedUser");
      let info = sessionStorage.getItem("loggedUserInfo");
      
      // Nếu sessionStorage trống, kiểm tra localStorage (trường hợp trang được reload)
      if (!u || !info) {
        u = localStorage.getItem("loggedUser");
        info = localStorage.getItem("loggedUserInfo");
        
        // Nếu tìm thấy trong localStorage, sao chép vào sessionStorage để đồng bộ
        if (u && info) {
          try {
            sessionStorage.setItem("loggedUser", u);
            sessionStorage.setItem("loggedUserInfo", info);
          } catch {}
        }
      }
      
      return !!(u && info);
    } catch { return false; }
  }

  function ensureLoggedIn() {
    if (isLoggedIn()) return true;
    // Open login modal and focus username
    if (loginModal) {
      loginModal.classList.remove("hidden");
      hideLoginError?.();
      setTimeout(() => {
        const u = document.getElementById("username");
        if (u) u.focus();
      }, 0);
    }
    return false;
  }

  // Expose guards to global scope for inline handlers and global functions
  window.isLoggedIn = isLoggedIn;
  window.ensureLoggedIn = ensureLoggedIn;

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
    // Desktop navigation (giữ nguyên)
    const desktopNav = `
      <button id="btn-home" class="nav-btn">Đánh giá rèn luyện</button>
      <button id="btn-ranking" class="hover-link bg-transparent border-none cursor-pointer">Bảng xếp hạng</button>
      <a id="btn-login" href="#" class="btn-outline">Đăng nhập</a>
    `;
    
    const mobileNav = `
      <button id="btn-home-mobile" class="nav-btn">Đánh giá rèn luyện</button>
      <button id="btn-ranking-mobile" class="nav-btn">Bảng xếp hạng</button>
      <a id="btn-login-mobile" href="#" class="nav-btn">Đăng nhập</a>
    `;

    fadeReplace(navRight, desktopNav, () => {
      setupNavigationEvents();
    });
    
    const navRightMobile = document.getElementById("nav-right-mobile");
    if (navRightMobile) {
      fadeReplace(navRightMobile, mobileNav, () => {
        setupMobileNavigationEvents();
      });
    }
    
    // Mobile sidebar - hiển thị login section
    const mobileLoginSection = document.getElementById("mobile-login-section");
    const mobileUserProfileSection = document.getElementById("mobile-user-profile-section");
    
    if (mobileLoginSection) mobileLoginSection.classList.remove("hidden");
    if (mobileUserProfileSection) mobileUserProfileSection.classList.add("hidden");
    
    // Setup mobile sidebar login button
    const mobileSidebarLoginBtn = document.getElementById("mobile-sidebar-login");
    if (mobileSidebarLoginBtn) {
      mobileSidebarLoginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        loginModal.classList.remove("hidden");
        hideLoginError();
        // Close mobile sidebar
        const mobileSidebar = document.getElementById("mobile-sidebar");
        const mobileOverlay = document.getElementById("mobile-sidebar-overlay");
        if (mobileSidebar) mobileSidebar.classList.add("-translate-x-full");
        if (mobileOverlay) mobileOverlay.classList.add("hidden");
      });
    }
    
    // ✅ Trigger F5 auto-login if pending
    if (localStorage.getItem("F5_AUTO_LOGIN_PENDING") === "true") {
      console.log('🔄 [renderLoggedOutUI] Login form rendered, will trigger F5 auto-login...');
      setTimeout(() => {
        triggerF5AutoLogin();
      }, 200);
    }
  }

  function renderLoggedInUI(username) {
    // Desktop navigation (giữ nguyên)
    const desktopNav = `
      <button id="btn-home" class="nav-btn">Đánh giá rèn luyện</button>
      <button id="btn-ranking" class="hover-link bg-transparent border-none cursor-pointer">Bảng xếp hạng</button>
      <!-- Notifications are now handled by notification-widget.js -->
      <div class="user-avatar slide-in-right">
        <img id="header-avatar" src="https://ui-avatars.com/api/?background=0D8ABC&color=fff&name=${encodeURIComponent(username)}" alt="Avatar">
        <span>${username}</span>
      </div>
      <button id="btn-logout" class="px-3 py-1 border rounded-md hover:bg-gray-100">Đăng xuất</button>
    `;
    
    const mobileNav = `
      <button id="btn-home-mobile" class="nav-btn">Đánh giá rèn luyện</button>
      <button id="btn-ranking-mobile" class="nav-btn">Bảng xếp hạng</button>
      <div class="user-avatar-mobile">
        <img id="header-avatar-mobile" src="https://ui-avatars.com/api/?background=0D8ABC&color=fff&name=${encodeURIComponent(username)}" alt="Avatar">
        <span>${username}</span>
      </div>
      <button id="btn-logout-mobile" class="nav-btn">Đăng xuất</button>
    `;

    fadeReplace(navRight, desktopNav, () => {
      setupLoggedInNavigationEvents();
      try { initStudentNotifications(); } catch {}
    });
    
    const navRightMobile = document.getElementById("nav-right-mobile");
    if (navRightMobile) {
      fadeReplace(navRightMobile, mobileNav, () => {
        setupLoggedInMobileNavigationEvents();
        // Mobile: optional simple notifications trigger opens evaluation modal for now
      });
    }
    
    // Mobile sidebar - hiển thị user profile section
    const mobileLoginSection = document.getElementById("mobile-login-section");
    const mobileUserProfileSection = document.getElementById("mobile-user-profile-section");
    
    if (mobileLoginSection) mobileLoginSection.classList.add("hidden");
    if (mobileUserProfileSection) mobileUserProfileSection.classList.remove("hidden");
    
    // Update mobile sidebar user info
    const mobileSidebarUserName = document.getElementById("mobile-sidebar-user-name");
    const mobileSidebarAvatar = document.getElementById("mobile-sidebar-avatar");
    
    if (mobileSidebarUserName) mobileSidebarUserName.textContent = username;
    if (mobileSidebarAvatar) mobileSidebarAvatar.src = `https://ui-avatars.com/api/?background=0D8ABC&color=fff&name=${encodeURIComponent(username)}`;
    
    // Load custom avatar for mobile sidebar
    try {
      const stored = sessionStorage.getItem("userAvatar");
      if (stored && mobileSidebarAvatar) mobileSidebarAvatar.src = stored;
      if (!stored && mobileSidebarAvatar) {
        const raw = sessionStorage.getItem("loggedUserInfo");
        const info = raw ? JSON.parse(raw) : null;
        const candidate = info?.MaCaNhan || info?.MSSV || info?.MaSV || info?.TenTK;
        if (candidate) {
          fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(candidate)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data && data.AnhDD) {
                const url = `data:image/jpeg;base64,${data.AnhDD}`;
                try { sessionStorage.setItem("userAvatar", url); } catch {}
                mobileSidebarAvatar.src = url;
              }
            })
            .catch(() => {});
        }
      }
    } catch {}
    
    // Setup mobile sidebar logout button
    const mobileSidebarLogoutBtn = document.getElementById("mobile-sidebar-logout");
    if (mobileSidebarLogoutBtn) {
      mobileSidebarLogoutBtn.addEventListener("click", () => {
        // Call server logout endpoint to clear session
        fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' }).catch(() => {});
        // Clear sessionStorage
        sessionStorage.removeItem("loggedUser");
        sessionStorage.removeItem("loggedUserInfo");
        sessionStorage.removeItem("userAvatar");
        sessionStorage.removeItem("sv_reg_set");
        sessionStorage.removeItem("sv_reg_detail");
        sessionStorage.removeItem("qr_maHD");
        sessionStorage.removeItem("qr_tenHD");
        sessionStorage.removeItem("preload");
        // Clear localStorage (except api_base_url which is configuration)
        localStorage.removeItem("loggedUser");
        localStorage.removeItem("loggedUserInfo");
        localStorage.removeItem("userAvatar");
        renderLoggedOutUI();
        // Close mobile sidebar
        const mobileSidebar = document.getElementById("mobile-sidebar");
        const mobileOverlay = document.getElementById("mobile-sidebar-overlay");
        if (mobileSidebar) mobileSidebar.classList.add("-translate-x-full");
        if (mobileOverlay) mobileOverlay.classList.add("hidden");
      });
    }
  }

  // ====== Student Notifications (ĐGRL status + Hoạt động mới) ======
  // Helpers for robust field access and time formatting (handle camelCase/PascalCase)
  function getProp(obj, keys) {
    if (!obj) return undefined;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
    }
    // also try case-insensitive match once
    const lowerMap = Object.keys(obj).reduce((acc, key) => { acc[key.toLowerCase()] = key; return acc; }, {});
    for (const k of keys) {
      const real = lowerMap[k.toLowerCase()];
      if (real && obj[real] != null) return obj[real];
    }
    return undefined;
  }
  function parseDateLoose(v){
    try{
      if (v == null) return null;
      if (v instanceof Date) return isNaN(v) ? null : v;
      if (typeof v === 'number') { const d = new Date(v); return isNaN(d) ? null : d; }
      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return null;
        let d = new Date(s);
        if (!isNaN(d)) return d;
        // try replace space with T (e.g., "2025-10-31 12:30:00")
        d = new Date(s.replace(' ', 'T'));
        if (!isNaN(d)) return d;
      }
    }catch{}
    return null;
  }
  function formatDateTimeViSafe(v){
    const d = parseDateLoose(v);
    if (!d) return '';
    try{ return d.toLocaleString('vi-VN'); }catch{ return '';
    }
  }
  function timeAgoSafe(v){
    const d = parseDateLoose(v);
    if (!d) return '';
    try{
      const t = d.getTime();
      const now = Date.now();
      let diffSec = Math.floor((now - t) / 1000);
      if (!Number.isFinite(diffSec) || diffSec < 0) return '';
      if (diffSec < 60) return `${diffSec}s trước`;
      const m = Math.floor(diffSec/60);
      if (m < 60) return `${m} phút trước`;
      const h = Math.floor(m/60);
      if (h < 24) return `${h} giờ trước`;
      const dd = Math.floor(h/24);
      return `${dd} ngày trước`;
    }catch{ return ''; }
  }
  function initStudentNotifications() {
    const btn = document.getElementById('btn-notifications');
    const menu = document.getElementById('notifications-menu');
    const badge = document.getElementById('notifications-badge');
    const list = document.getElementById('notifications-list');
    const markRead = document.getElementById('notifications-mark-read');
    const viewAll = document.getElementById('notifications-view-all');

    if (!btn || !menu || !badge || !list) return;

    // Preload function: fetch summary (unread count + latest items) then update UI
    const preloadStudentNotifications = async () => {
      try {
        const m = getCurrentMSSV();
        if (!m) return;
        const sum = await getStudentNotifSummary(m, 10);
        if (sum) {
          window._svStudentUnreadCount = Number(sum.unreadCount || 0);
          window._svStudentNotifCache = Array.isArray(sum.items) ? sum.items : [];
          const menuEl = document.getElementById('notifications-menu');
          if (menuEl && !menuEl.classList.contains('hidden')) {
            renderStudentNotifications();
          }
        }
      } catch {}
      // Update badge and any dependent state
      updateStudentNotificationCounters();
    };

    // toggle menu via click
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
      if (!menu.classList.contains('hidden')) {
        // when opening, mark activities as seen
        markActivitiesSeen();
        // If chưa có cache → hiển thị trạng thái loading thay vì 'Không có thông báo'
        const listEl = document.getElementById('notifications-list');
        if (listEl) {
          window._svNotifLoading = true;
          listEl.innerHTML = '<div class="p-4 text-center text-gray-500 text-sm">Đang tải thông báo...</div>';
        }
        // Đảm bảo hoạt động đã preload (nếu chưa) để trạng thái "Hoạt động mới" xuất hiện ngay
        try {
          await Promise.all([
            preloadStudentNotifications(),
            (async () => {
              if (!Array.isArray(dbCache.HoatDongTruong) || dbCache.HoatDongTruong.length === 0) {
                try {
                  const r = await fetch(`${API_BASE}/api/preload`);
                  if (r.ok) {
                    const data = await r.json();
                    if (Array.isArray(data?.hoatDongTruong)) {
                      dbCache.HoatDongTruong = data.hoatDongTruong;
                      window.allActivities = data.hoatDongTruong;
                    }
                  }
                } catch {}
              }
            })()
          ]);
        } catch {}
        window._svNotifLoading = false;
        // Render lại chắc chắn sau khi cả hai nguồn dữ liệu đã xử lý
        renderStudentNotifications();
        // Nếu vẫn rỗng → đặt timeout thử render lại (phòng trường hợp summary về sau do mạng chậm)
        if (listEl && /Chưa có thông báo/.test(listEl.innerHTML)) {
          setTimeout(() => {
            if (menu && !menu.classList.contains('hidden')) renderStudentNotifications();
          }, 600);
        }
      }
    });

    // open menu on hover (mouseenter) for instant reveal like Facebook
    const container = btn.closest('.notifications-container');
    if (container) {
      let hoverOpenTimer = null;
      container.addEventListener('mouseenter', async () => {
        // open immediately and render from cache; refresh in background
        if (menu.classList.contains('hidden')) {
          menu.classList.remove('hidden');
          // do not mark reads automatically; only mark activities seen
          markActivitiesSeen();
          // render cached items immediately (if any)
          renderStudentNotifications();
          // if no cache, show loading and fetch
          if (!Array.isArray(window._svStudentNotifCache) || window._svStudentNotifCache.length === 0) {
            const listEl2 = document.getElementById('notifications-list');
            if (listEl2) {
              window._svNotifLoading = true;
              listEl2.innerHTML = '<div class="p-4 text-center text-gray-500 text-sm">Đang tải thông báo...</div>';
            }
            try {
              await preloadStudentNotifications();
            } catch {}
            window._svNotifLoading = false;
            renderStudentNotifications();
          } else {
            // still proactively refresh in background without flicker
            try { hoverOpenTimer = setTimeout(() => { preloadStudentNotifications(); }, 50); } catch {}
          }
        }
      });
      container.addEventListener('mouseleave', () => {
        if (hoverOpenTimer) { try { clearTimeout(hoverOpenTimer); } catch {} hoverOpenTimer = null; }
        // keep menu open until user clicks outside; do not auto-close on mouseleave to avoid flicker
      });
      // Accessibility: open on focus for keyboard users
      btn.addEventListener('focus', () => {
        if (menu.classList.contains('hidden')) {
          menu.classList.remove('hidden');
          renderStudentNotifications();
        }
      });
    }
    // click outside closes
    document.addEventListener('click', (e) => {
      if (!menu.classList.contains('hidden')) {
        const within = e.target.closest?.('.notifications-container');
        if (!within) menu.classList.add('hidden');
      }
    });
    markRead?.addEventListener('click', async () => {
      markActivitiesSeen();
      localStorage.setItem('sv_last_seen_dgrl_status', currentDgrlStatus || '');
      try {
        const mssv = getCurrentMSSV();
        if (mssv) await markAllStudentNotifsRead(mssv);
      } catch {}
      await updateStudentNotificationCounters();
      // Refresh list after marking read
      await preloadStudentNotifications();
    });
    viewAll?.addEventListener('click', async () => {
      await openAllStudentNotifications();
      menu.classList.add('hidden');
    });

    // seed current data and start polling (single combined timer)
    updateStudentNotificationCounters();
    try { if (window._svNotifTimer) clearInterval(window._svNotifTimer); } catch {}
    preloadStudentNotifications();
    window._svNotifTimer = setInterval(preloadStudentNotifications, 60000);
  }

  let currentDgrlStatus = '';
  async function getStudentNotifSummary(mssv, top=10){
    try{
      const r = await fetch(`${API_BASE}/api/student-notifications/summary?mssv=${encodeURIComponent(mssv)}&top=${encodeURIComponent(top)}`);
      if (!r.ok) return null; return await r.json();
    }catch{ return null; }
  }
  async function markAllStudentNotifsRead(mssv){
    try{ await fetch(`${API_BASE}/api/student-notifications/mark-all-read?mssv=${encodeURIComponent(mssv)}`, { method:'POST' }); }catch{}
  }
  async function openAllStudentNotifications(){
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    const title = document.getElementById('modal-title');
    if (!modal||!body||!title) return;
    title.textContent = 'Tất cả thông báo';
    body.innerHTML = '<div class="py-6 text-center text-gray-600"><div class="loading-spinner mx-auto mb-3"></div>Đang tải...</div>';
    modal.classList.remove('hidden');
    try{
  const m = getCurrentMSSV();
  const sum = m ? (await getStudentNotifSummary(m, 50)) : null;
  const list = Array.isArray(sum?.items) ? sum.items : [];
      if (!list || list.length===0){ body.innerHTML = '<div class="p-4 text-center text-gray-500">Không có thông báo.</div>'; return; }
      const rows = list.map(n=>{
        const tRaw = (getProp(n, ['title','Title']) || '').toString().trim();
        const mRaw = (getProp(n, ['message','Message']) || '').toString().trim();
        const time = formatDateTimeViSafe(getProp(n, ['createdAt','CreatedAt','created','Created','timestamp','Timestamp','created_at']));
        const t = tRaw && tRaw.toLowerCase() !== 'thông báo' ? tRaw : (mRaw || 'Thông báo');
        return `<div class="p-3 border-b last:border-b-0">
          <div class="text-sm font-medium text-gray-800 break-words">${escapeHtml(t)}</div>
          ${mRaw?`<div class=\"text-sm text-gray-600 break-words mt-0.5\">${escapeHtml(mRaw)}</div>`:''}
          <div class="text-[11px] text-gray-500 mt-0.5">${escapeHtml(time)}</div>
        </div>`;
      }).join('');
      body.innerHTML = `<div class="max-h-[70vh] overflow-auto">${rows}</div>`;
    }catch(e){ body.innerHTML = `<div class="p-4 text-center text-red-600">Lỗi tải thông báo: ${escapeHtml(e.message||e)}</div>`; }
  }
  function computeLatestActivityKey(acts) {
    if (!Array.isArray(acts) || acts.length === 0) return '';
    // try numeric MaHD
    const nums = acts
      .map(a => parseInt(String(a.MaHD||'').replace(/\D/g, ''), 10))
      .filter(n => Number.isFinite(n));
    if (nums.length) return String(Math.max(...nums));
    // fallback: first 10 chars of concatenated latest names
    return String(acts[0]?.MaHD || acts[0]?.TenHD || acts.length);
  }

  async function updateStudentNotificationCounters() {
    try {
      // Occasionally refresh activities from server (every 5 minutes)
      const nowTs = Date.now();
      const lastFetch = window._svLastActsFetchAt || 0;
      if (!window._svLastActsFetchAt || nowTs - lastFetch > 5 * 60 * 1000) {
        try {
          // Bust cache to reflect latest activities
          const r = await fetch(`${API_BASE}/api/preload?t=${Date.now()}`);
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data?.hoatDongTruong)) {
              dbCache.HoatDongTruong = data.hoatDongTruong;
              window.allActivities = data.hoatDongTruong;
            }
          }
        } catch {}
        window._svLastActsFetchAt = nowTs;
      }
      // New activities since last seen
      const acts = Array.isArray(dbCache.HoatDongTruong) ? dbCache.HoatDongTruong : [];
      const latestKey = computeLatestActivityKey(acts);
      const lastSeenKey = localStorage.getItem('sv_last_seen_activity_key') || '';
      const hasNewActivities = latestKey && latestKey !== lastSeenKey;

      // Current ĐGRL status
      const { namHoc, hocKi } = getEvalTermValues();
      const mssv = getCurrentMSSV();
      let status = '';
      if (mssv && !window._svNoPhieuStatusAPI) {
        try {
          const res = await fetch(`${API_BASE}/api/phieu-danh-gia/status?mssv=${encodeURIComponent(mssv)}&namHoc=${encodeURIComponent(namHoc)}&hocKi=${encodeURIComponent(hocKi)}`);
          if (res.status === 404) {
            // Server hasn't deployed /status yet -> disable future probes to avoid noisy 404
            window._svNoPhieuStatusAPI = true;
          } else if (res.ok) {
            const data = await res.json();
            status = (data?.status || data?.header?.Status || '').toString();
          } else {
            status = '';
          }
        } catch { status = ''; }
      }
      currentDgrlStatus = status;
      const lastSeenStatus = localStorage.getItem('sv_last_seen_dgrl_status') || '';
      const statusChanged = status && status !== lastSeenStatus;

  // Student server-side notifications (unread count from cache populated by summary)
  let stuUnread = Number(window._svStudentUnreadCount || 0);

      const badge = document.getElementById('notifications-badge');
      if (badge) {
        const total = (hasNewActivities ? 1 : 0) + (statusChanged ? 1 : 0) + (stuUnread || 0);
        if (total > 0) {
          badge.textContent = String(total);
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }

      // Cache data for rendering list
      window._svNotifState = { hasNewActivities, latestKey, status, statusChanged };
      // If menu is open, refresh list
      const menu = document.getElementById('notifications-menu');
      if (menu && !menu.classList.contains('hidden')) renderStudentNotifications();
    } catch {}
  }

  function renderStudentNotifications() {
    const list = document.getElementById('notifications-list');
    if (!list) return;
    const state = window._svNotifState || {};
    const items = [];

    // 1) Server notifications for students
    const mssv = getCurrentMSSV();
    const serverItems = [];
    if (mssv) {
      const notifs = window._svStudentNotifCache || [];
      // Render immediately if cached; then refresh in background
      const fmtTime = (d)=> formatDateTimeViSafe(d);
      const timeAgo = (d)=> timeAgoSafe(d);
      const icon = (kind)=>{
        if (kind==='success') return '<svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
        if (kind==='warn') return '<svg class="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3l-6.93-12a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z"/></svg>';
        if (kind==='error') return '<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
        return '<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z"/></svg>';
      };
      // Group classification (client-side, no new columns)
  const groups = { 'Minh chứng đính kèm': [], 'Phiếu ĐGRL': [], 'Hoạt động': [], 'Nhắc nhở': [], 'Khác': [] };
      function classify(n){
        const title = (getProp(n,['title','Title'])||'').toString().toLowerCase();
        const msg = (getProp(n,['message','Message'])||'').toString().toLowerCase();
        const combined = `${title} ${msg}`;
        const evidenceId = getProp(n,['evidenceId','EvidenceId']);
  if (evidenceId) return 'Minh chứng đính kèm';
        if (combined.includes('đgrl') || combined.includes('phiếu') || combined.includes('phieu')) return 'Phiếu ĐGRL';
        if (combined.includes('hoạt động') || combined.includes('hoat dong')) return 'Hoạt động';
        if (combined.includes('nhắc') || combined.includes('remind') || combined.includes('cần bổ sung') || combined.includes('can bo sung')) return 'Nhắc nhở';
        return 'Khác';
      }
      notifs.forEach(n => {
        const isRead = !!(getProp(n, ['isRead','IsRead']));
        const rawTitle = (getProp(n, ['title','Title']) || '').toString().trim();
        const rawMsg = (getProp(n, ['message','Message']) || '').toString().trim();
        const link = (getProp(n, ['link','Link','url','Url']) || '').toString().trim();
        const full = `${rawTitle} ${rawMsg}`.toLowerCase();
        const isForm = full.includes('đgrl') || full.includes('phiếu');
        const isRejected = full.includes('từ chối') || full.includes('bị xóa') || full.includes('bi xoa');
        const isNeeds = full.includes('cần bổ sung') || full.includes('can bo sung') || full.includes('nhắc');
        const isApproved = full.includes('đã duyệt') || full.includes('da duyet');
        const kind = isRejected ? 'error' : (isNeeds ? 'warn' : (isApproved ? 'success' : 'info'));
        const badge = isForm ? '<span class="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] border border-slate-200">ĐGRL</span>' : '';
        // Prefer message as title if generic
        const niceTitle = escapeHtml(rawTitle && rawTitle.toLowerCase() !== 'thông báo' ? rawTitle : (rawMsg || 'Thông báo'));
        const reasonMatch = /(l[ýi]\s*|ly\s*)do\s*:\s*(.+)$/i.exec(rawMsg);
        const reason = reasonMatch ? (reasonMatch[2]||'').trim() : '';
        const created = getProp(n, ['createdAt','CreatedAt','created','Created','timestamp','Timestamp','created_at']);
        const meta = timeAgo(created) || fmtTime(created);
        const clickAttr = link ? `data-open-link="${escapeHtml(link)}"` : 'data-open-eval="true"';
        const nid = getProp(n, ['notificationId','NotificationId','id','Id']);
        const html = `
          <div class="p-3 hover:bg-gray-50 cursor-pointer group" ${clickAttr} data-snotify-id="${nid}">
            <div class="flex items-start gap-2">
              <div class="mt-0.5">${icon(kind)}</div>
              <div class="flex-1 break-words whitespace-normal">
                <div class="text-sm ${isRead ? 'font-medium' : 'font-semibold'} text-gray-800">${niceTitle} ${badge}</div>
                <div class="text-[11px] text-gray-500 mt-0.5">${escapeHtml(meta)}</div>
                ${reason ? `<div class="text-xs text-red-600 mt-0.5">Lý do: ${escapeHtml(reason)}</div>` : ''}
              </div>
              <div class="ml-2 flex items-center gap-1">
                ${isRead ? '' : '<span class="w-2 h-2 bg-blue-600 rounded-full" title="Chưa đọc" aria-hidden="true"></span>'}
                <button class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 p-1 rounded" title="Xóa thông báo" data-delete-notif="${nid}" aria-label="Xóa">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0V5a2 2 0 012-2h2a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>`;
        const grpName = classify(n);
        groups[grpName].push(html);
      });
  const groupOrder = ['Minh chứng đính kèm','Phiếu ĐGRL','Hoạt động','Nhắc nhở','Khác'];
      groupOrder.forEach(gName => {
        const arr = groups[gName];
        if (arr && arr.length) {
          serverItems.push(`<div class="mb-2"><div class="px-3 py-1 text-[11px] uppercase tracking-wide font-semibold text-gray-500">${escapeHtml(gName)}</div>${arr.join('')}</div>`);
        }
      });
  // list cache will be refreshed by preloadStudentNotifications() timer
    }
    if (serverItems.length) items.push(...serverItems);

    if (state.status) {
      const textMap = {
        Submitted: 'Phiếu ĐGRL đã gửi, chờ duyệt',
        ApprovedByCBL: 'Phiếu ĐGRL đã được CBL duyệt',
        ForwardedToLecturer: 'Phiếu ĐGRL đã gửi đến Giảng viên',
        ApprovedByGV: 'Phiếu ĐGRL đã được Giảng viên duyệt',
        ForwardedToFaculty: 'Phiếu ĐGRL đã gửi Khoa',
        ApprovedByFaculty: 'Phiếu ĐGRL đã được Khoa duyệt',
        ForwardedToSchool: 'Phiếu ĐGRL đã gửi Trường',
        ApprovedBySchool: 'Phiếu ĐGRL đã được Trường duyệt',
        Rejected: 'Phiếu ĐGRL bị từ chối',
        NeedsRevision: 'Phiếu ĐGRL cần bổ sung'
      };
      const label = textMap[state.status] || `Trạng thái ĐGRL: ${state.status}`;
      items.push(`<div class="p-3 hover:bg-gray-50 cursor-pointer" data-open-eval>
        <div class="text-sm font-medium text-gray-800">${label}</div>
        <div class="text-xs text-gray-500 mt-0.5">Nhấp để mở phiếu</div>
      </div>`);
    }

    if (state.hasNewActivities) {
      // hiển thị tất cả hoạt động mới (bỏ giới hạn 3)
      const acts = Array.isArray(dbCache.HoatDongTruong) ? dbCache.HoatDongTruong : [];
      acts.forEach(a => {
        items.push(`<div class="p-3 hover:bg-gray-50 cursor-pointer" data-open-activity="${String(a.MaHD||'')}">
          <div class="text-sm font-medium text-gray-800">Hoạt động mới: ${escapeHtml(a.TenHD||'')}</div>
          <div class="text-xs text-gray-500 mt-0.5">Mã: ${escapeHtml(a.MaHD||'N/A')} • Điểm: ${a.DiemRL ?? 0}</div>
        </div>`);
      });
    }

  if (items.length) {
    list.innerHTML = items.join('') + '<div class="p-2 flex justify-end"><button id="sv-btn-delete-read" class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-red-600 hover:text-white transition">Xóa thông báo đã đọc</button></div>';
  } else {
    list.innerHTML = window._svNotifLoading
      ? '<div class="p-3 text-sm text-gray-500 text-center">Đang tải thông báo...</div>'
      : '<div class="p-3 text-sm text-gray-500 text-center">Chưa có thông báo</div>';
  }

  // Wire delete-read button (student)
  const delBtn = list.querySelector('#sv-btn-delete-read');
  if (delBtn) {
    delBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const mssv = getCurrentMSSV(); if (!mssv) return;
      delBtn.disabled = true; delBtn.textContent = 'Đang xóa...';
      try {
        const resp = await fetch(`${API_BASE}/api/student-notifications/delete-read?mssv=${encodeURIComponent(mssv)}`, { method:'POST' });
        if (resp.ok) {
          // Remove read items from cache
          if (Array.isArray(window._svStudentNotifCache)) {
            window._svStudentNotifCache = window._svStudentNotifCache.filter(n => {
              const isRead = !!(getProp(n,['isRead','IsRead']));
              return !isRead; // keep unread only
            });
          }
          renderStudentNotifications();
          updateStudentNotificationCounters();
        }
      } finally { delBtn.disabled = false; delBtn.textContent = 'Xóa thông báo đã đọc'; }
    });
  }

    // wire actions
    list.querySelectorAll('[data-open-eval]')?.forEach(el => el.addEventListener('click', async (ev) => {
      // Shift+Click để xóa nhanh
      if (ev && ev.shiftKey) {
        try {
          const mssv = getCurrentMSSV();
          if (mssv){
            const id = el.getAttribute('data-snotify-id');
            if (id) {
              const r = await fetch(`${API_BASE}/api/student-notifications/${encodeURIComponent(id)}?mssv=${encodeURIComponent(mssv)}`, { method:'DELETE' });
              if (r.ok) {
                // Remove from cache and re-render
                if (Array.isArray(window._svStudentNotifCache)) window._svStudentNotifCache = window._svStudentNotifCache.filter(x => String(getProp(x,['notificationId','NotificationId','id','Id'])) !== String(id));
                renderStudentNotifications();
                return; // stop further actions
              }
            }
          }
        } catch {}
      }
      if (ensureLoggedIn()) openTrainingEvaluation();
      try {
        const mssv = getCurrentMSSV();
        if (mssv){
          const id = el.getAttribute('data-snotify-id');
          if (id) {
            const resp = await fetch(`${API_BASE}/api/student-notifications/${encodeURIComponent(id)}/read?mssv=${encodeURIComponent(mssv)}`, { method:'POST' });
            if (resp.ok) {
              // update cache isRead and decrement unread badge
              try {
                const arr = Array.isArray(window._svStudentNotifCache) ? window._svStudentNotifCache : [];
                const idx = arr.findIndex(x => String(getProp(x,['notificationId','NotificationId','id','Id'])) === String(id));
                if (idx >= 0) {
                  const itm = Object.assign({}, arr[idx]);
                  // normalize property name
                  itm.IsRead = true; itm.isRead = true;
                  arr[idx] = itm; window._svStudentNotifCache = arr;
                }
                if (typeof window._svStudentUnreadCount === 'number') window._svStudentUnreadCount = Math.max(0, window._svStudentUnreadCount - 1);
                updateStudentNotificationCounters();
              } catch {}
            }
          }
        }
      } catch {}
      document.getElementById('notifications-menu')?.classList.add('hidden');
    }));
    list.querySelectorAll('[data-open-link]')?.forEach(el => el.addEventListener('click', async (ev) => {
      // Shift+Click để xóa nhanh
      if (ev && ev.shiftKey) {
        try {
          const mssv = getCurrentMSSV();
          if (mssv){
            const id = el.getAttribute('data-snotify-id');
            if (id) {
              const r = await fetch(`${API_BASE}/api/student-notifications/${encodeURIComponent(id)}?mssv=${encodeURIComponent(mssv)}`, { method:'DELETE' });
              if (r.ok) {
                if (Array.isArray(window._svStudentNotifCache)) window._svStudentNotifCache = window._svStudentNotifCache.filter(x => String(getProp(x,['notificationId','NotificationId','id','Id'])) !== String(id));
                renderStudentNotifications();
                return;
              }
            }
          }
        } catch {}
      }
      const href = el.getAttribute('data-open-link');
      try {
        const mssv = getCurrentMSSV();
        if (mssv){
          const id = el.getAttribute('data-snotify-id');
          if (id) {
            const resp = await fetch(`${API_BASE}/api/student-notifications/${encodeURIComponent(id)}/read?mssv=${encodeURIComponent(mssv)}`, { method:'POST' });
            if (resp.ok) {
              try {
                const arr = Array.isArray(window._svStudentNotifCache) ? window._svStudentNotifCache : [];
                const idx = arr.findIndex(x => String(getProp(x,['notificationId','NotificationId','id','Id'])) === String(id));
                if (idx >= 0) {
                  const itm = Object.assign({}, arr[idx]);
                  itm.IsRead = true; itm.isRead = true;
                  arr[idx] = itm; window._svStudentNotifCache = arr;
                }
                if (typeof window._svStudentUnreadCount === 'number') window._svStudentUnreadCount = Math.max(0, window._svStudentUnreadCount - 1);
                updateStudentNotificationCounters();
              } catch {}
            }
          }
        }
      } catch {}
      if (href) {
        if (href.startsWith('http') || href.startsWith('/')) window.location.href = href; else window.location.href = `/${href}`;
      }
      document.getElementById('notifications-menu')?.classList.add('hidden');
    }));
    list.querySelectorAll('[data-open-activity]')?.forEach(el => el.addEventListener('click', (e) => {
      const ma = e.currentTarget.getAttribute('data-open-activity');
      const act = (dbCache.HoatDongTruong||[]).find(x => String(x.MaHD) === String(ma));
      if (act) openModalHD(act);
      document.getElementById('notifications-menu')?.classList.add('hidden');
    }));
    // Xóa thông báo: nút thùng rác
    list.querySelectorAll('[data-delete-notif]')?.forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation(); e.preventDefault();
      const id = btn.getAttribute('data-delete-notif');
      const mssv = getCurrentMSSV(); if (!id || !mssv) return;
      try {
        const r = await fetch(`${API_BASE}/api/student-notifications/${encodeURIComponent(id)}?mssv=${encodeURIComponent(mssv)}`, { method:'DELETE' });
        if (r.ok) {
          if (Array.isArray(window._svStudentNotifCache)) window._svStudentNotifCache = window._svStudentNotifCache.filter(x => String(getProp(x,['notificationId','NotificationId','id','Id'])) !== String(id));
          renderStudentNotifications();
        }
      } catch {}
    }));
  }

  function markActivitiesSeen() {
    const acts = Array.isArray(dbCache.HoatDongTruong) ? dbCache.HoatDongTruong : [];
    const latestKey = computeLatestActivityKey(acts);
    if (latestKey) localStorage.setItem('sv_last_seen_activity_key', latestKey);
  }

  function setupLoggedInNavigationEvents() {
    // Tất cả event listeners đã được xử lý bằng event delegation ở trên
    
    // Try load custom avatar from sessionStorage or fetch from server
    const headerImg = document.getElementById("header-avatar");
    try {
      const stored = sessionStorage.getItem("userAvatar");
      if (stored && headerImg) headerImg.src = stored;
      if (!stored && headerImg) {
        const raw = sessionStorage.getItem("loggedUserInfo");
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

  function setupLoggedInMobileNavigationEvents() {
    // Tất cả event listeners đã được xử lý bằng event delegation ở trên
    
    // Try load custom avatar for mobile
    const headerImg = document.getElementById("header-avatar-mobile");
    try {
      const stored = sessionStorage.getItem("userAvatar");
      if (stored && headerImg) headerImg.src = stored;
      if (!stored && headerImg) {
        const raw = sessionStorage.getItem("loggedUserInfo");
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

  // ====== QR Scanner (open/close/start/stop) ======
  let _qrScanner = null;
  let _qrActive = false;
  let _lastQrText = '';
  let _expectedQrMaHD = null; // nếu mở quét từ một hoạt động cụ thể, phải khớp mã này

  async function initQrScanner() {
    const video = document.getElementById('qr-video');
    if (!video) return false;
    try { if (_qrScanner) { await _qrScanner.stop(); _qrScanner.destroy?.(); } } catch {}
    try {
      if (window.QrScanner) {
        _qrScanner = new QrScanner(video, (result) => {
          try {
            const text = (result && (result.data || result)) || '';
            handleQrResult(String(text));
          } catch {}
        }, { returnDetailedScanResult: true });
        return true;
      }
    } catch {}
    return false;
  }

  async function startQrScan() {
    const startBtn = document.getElementById('start-qr-scan');
    const stopBtn = document.getElementById('stop-qr-scan');
    try {
      if (!_qrScanner) {
        const ok = await initQrScanner();
        if (!ok) throw new Error('Thiếu thư viện QrScanner');
      }
      await _qrScanner.start();
      _qrActive = true;
      startBtn?.classList.add('hidden');
      stopBtn?.classList.remove('hidden');
    } catch (e) {
      console.error('QR start error:', e);
      alert('Không thể khởi động máy quét QR. Vui lòng kiểm tra quyền camera.');
    }
  }

  async function stopQrScan() {
    const startBtn = document.getElementById('start-qr-scan');
    const stopBtn = document.getElementById('stop-qr-scan');
    try { await _qrScanner?.stop(); } catch {}
    _qrActive = false;
    stopBtn?.classList.add('hidden');
    startBtn?.classList.remove('hidden');
  }

  async function handleQrResult(text) {
    _lastQrText = text || '';
    let data = null;
    try { data = JSON.parse(_lastQrText); } catch {
      try { const obj = {}; _lastQrText.split(/[;&]/).forEach(kv => { const [k,v] = kv.split('='); if (k && v) obj[k.trim()] = decodeURIComponent(v.trim()); }); if (Object.keys(obj).length) data = obj; } catch {}
    }
    const maHD = (data && (data.maHD || data.MaHD || data.mhd)) ? String(data.maHD || data.MaHD || data.mhd).trim() : null;
    const tenHD = (data && (data.tenHD || data.TenHD)) ? String(data.tenHD || data.TenHD) : '';
    if (!maHD) { showQrError('QR không hợp lệ (thiếu mã hoạt động).'); return; }
    if (_expectedQrMaHD && _expectedQrMaHD !== maHD) { showQrError(`Sai hoạt động. Bạn đang mở ${_expectedQrMaHD} nhưng quét QR của ${maHD}.`); return; }
    try {
      sessionStorage.setItem('qr_maHD', maHD);
      if (tenHD) sessionStorage.setItem('qr_tenHD', tenHD);
      const url = new URL(location.href); url.searchParams.set('maHD', maHD); history.replaceState({}, '', url.toString());
    } catch {}
    stopQrScan();
    // Auto register (subscribe) nếu chưa đăng ký
    try {
      const mssv = getCurrentMSSV?.();
      if (mssv) {
        const res = await fetch(`/api/activities/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ MaHD: maHD, MSSV: mssv })});
        const txt = await res.text();
        if (!res.ok) {
          console.warn('Auto register thất bại:', txt);
        } else {
          // Cập nhật cache đăng ký tại chỗ để UI đổi ngay
          try {
            if (!window._svRegSet) window._svRegSet = new Set();
            window._svRegSet.add(String(maHD));
            if (!window._svRegDetail) window._svRegDetail = {};
            const det = window._svRegDetail[String(maHD)] || {};
            window._svRegDetail[String(maHD)] = Object.assign({}, det, { Registered: true, Eligible: true, Status: 'PENDING', TenHD: tenHD||'' });
          try { saveRegState(); } catch {}
            
            // ✅ CẬP NHẬT NÚT HOẠT ĐỘNG CỤ THỂ NGAY LẬP TỨC
            try {
              const card = document.querySelector(`[data-activity-id="${maHD}"]`);
              if (card) {
                // Cập nhật nút cho hoạt động này mà không cần re-render toàn bộ
                const actionWrap = card.querySelector('.pt-3.border-t') || card.querySelector('.pt-3');
                if (actionWrap) {
                  actionWrap.innerHTML = `
                    <button onclick="event.stopPropagation(); openAttendanceEvidenceModal('${maHD}');" 
                            class="w-full px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                      </svg>
                      <span>Nộp minh chứng</span>
                    </button>
                    <p class="text-xs text-gray-400 text-center">👆 Nhấp để xem chi tiết</p>
                  `;
                }
              }
            } catch(e) { console.warn('Lỗi cập nhật nút hoạt động:', e); }
            
            // Fallback: Re-render toàn bộ danh sách nếu cập nhật card không thành công
            try { if (Array.isArray(window.allActivities)) await renderActivities(window.allActivities); } catch {}
            
            // Cập nhật giao diện thành công, không đóng QR modal ngay
            try {
              // ✅ Không auto-open modal attendance - để người dùng tự bấm khi sẵn sàng
              console.log('✅ QR quét thành công, đã đăng ký hoạt động. Bạn có thể nộp minh chứng ngay hoặc sau.');
            } catch(e){ console.warn('Lỗi xử lý QR success:', e); }
          } catch {}
        }
      }
    } catch(e){ console.warn('Auto register error', e); }
    try { document.getElementById('qr-success-section')?.classList.remove('hidden'); document.getElementById('qr-activity-info')?.classList.add('hidden'); } catch {}
  }
  function showQrError(msg){ try { document.getElementById('qr-error-text').textContent = msg; document.getElementById('qr-error-message').classList.remove('hidden'); } catch {} }

  function wireQrModalButtons() {
    document.getElementById('start-qr-scan')?.addEventListener('click', startQrScan);
    document.getElementById('stop-qr-scan')?.addEventListener('click', stopQrScan);
    document.getElementById('retry-qr-scan')?.addEventListener('click', async () => {
      try {
        document.getElementById('qr-success-section')?.classList.add('hidden');
      } catch {}
      await startQrScan();
    });
    document.getElementById('back-to-qr-scan')?.addEventListener('click', async () => {
      document.getElementById('qr-activity-info')?.classList.add('hidden');
      await startQrScan();
    });
    document.getElementById('submit-evidence-btn')?.addEventListener('click', () => {
      // Đóng QR và mở wizard attendance (nộp minh chứng hoạt động)
      closeQRModal();
      let theMaHD = null;
      try { theMaHD = sessionStorage.getItem('qr_maHD') || new URLSearchParams(location.search).get('maHD') || null; } catch {}
      if (typeof openAttendanceEvidenceModal === 'function') {
        openAttendanceEvidenceModal(theMaHD || undefined);
      } else {
        // Fallback: mở modal tối thiểu
        const attModal = document.getElementById('attendance-wizard-modal');
        if (attModal) {
          attModal.classList.remove('hidden');
          document.getElementById('step-2-attendance-video')?.classList.remove('hidden');
        }
      }
    });
  }

  function openQRScanner(expectedMaHD) {
    // công khai global để dùng inline onclick
    const modal = document.getElementById('qr-modal');
    if (!modal) { alert('Không tìm thấy cửa sổ quét QR'); return; }
    _expectedQrMaHD = expectedMaHD || null;
    modal.classList.remove('hidden');
    wireQrModalButtons();
    // tự động bắt đầu quét nếu có thể
    startQrScan();
  }
  window.openQRScanner = openQRScanner;

  // ✅ CRITERION-BASED: Mở wizard lưu minh chứng vào tiêu chí
  function openEvidenceWizard(maHD) {
    console.log('Chuyển hướng openEvidenceWizard -> openAttendanceEvidenceModal');
    if (typeof window.openAttendanceEvidenceModal === 'function') {
      window.openAttendanceEvidenceModal(maHD);
    } else if (typeof openAttendanceEvidenceModal === 'function') {
      openAttendanceEvidenceModal(maHD);
    } else {
      alert('Lỗi: Tính năng nộp minh chứng đang được cập nhật. Vui lòng nhấn Ctrl + F5 để tải lại.');
    }
  }
  window.openEvidenceWizard = openEvidenceWizard;

  // ✅ ATTENDANCE-BASED: Mở wizard nộp minh chứng hoạt động (quét QR)
  function openAttendanceEvidenceModal(maHD){
    // ✅ CHECK LOGIN - OPEN LOGIN MODAL IF NOT LOGGED IN
    if (!isLoggedIn()) {
      // Lưu action pending để sau khi login xong sẽ execute
      pendingWizardAction = { action: 'openAttendanceEvidenceModal', maHD: maHD };
      ensureLoggedIn();
      return;
    }
    
    // Clear pending action vì đã login
    pendingWizardAction = null;

    const attModal = document.getElementById('attendance-wizard-modal');
    if (!attModal) { alert('Không tìm thấy cửa sổ nộp minh chứng hoạt động'); return; }
    
    // Mở modal
    attModal.classList.remove('hidden');

    // 🔧 POPULATE ACTIVITY INFO từ maHD hoặc sessionStorage.qr_maHD
    try {
      const theMaHD = maHD || String(sessionStorage.getItem('qr_maHD') || '').trim();
      
      // ✅ FIX: SAVE maHD to sessionStorage for Send button to use later
      if (theMaHD) {
        sessionStorage.setItem('qr_maHD', theMaHD);
        console.log('[openAttendanceEvidenceModal] ✅ Set qr_maHD to:', theMaHD);
      }
      
      let tenHD = sessionStorage.getItem('qr_tenHD') || localStorage.getItem('qr_tenHD') || '';
      
      // Tìm tên hoạt động từ cache
      try {
        const acts = (window.dbCache && Array.isArray(window.dbCache.HoatDongTruong)) ? window.dbCache.HoatDongTruong : (JSON.parse(sessionStorage.getItem('preload')||'{}').hoatDongTruong||[]);
        const found = Array.isArray(acts) ? acts.find(a => (a.MaHD||'').toString() === theMaHD) : null;
        if (found && found.TenHD) tenHD = found.TenHD;
      } catch {}
      
      // Cập nhật info box
      const infoNameEl = document.getElementById('attendance-activity-name');
      const infoCodeEl = document.getElementById('attendance-activity-code');
      if (infoNameEl) infoNameEl.textContent = tenHD || '(Chưa rõ tên)';
      if (infoCodeEl) infoCodeEl.textContent = `(Mã: ${theMaHD || '-'})`;
      
      console.log('✅ Attendance modal - Activity:', tenHD, 'Code:', theMaHD);
    } catch (e) {
      console.error('Error populating activity info:', e);
    }

    // ✅ Re-wire event listeners khi modal mở (để chắc chắn click listener được gắn)
    wireAttendanceModalButtons();
    
    // Tự động bật camera để SV có thể quay ngay
    setTimeout(() => {
      try { document.getElementById('btn-start-attendance')?.click(); } catch {}
    }, 100);
  }
  window.openAttendanceEvidenceModal = openAttendanceEvidenceModal;

  // Đăng ký tham gia hoạt động trực tiếp (không cần quét QR)
  async function registerActivity(maHD){
    try {
      const mssv = (function(){
        try { const raw = sessionStorage.getItem('loggedUserInfo'); if (!raw) return ''; const info = JSON.parse(raw); return String(info?.MaCaNhan || info?.MSSV || info?.MaSV || info?.TenTK || ''); } catch { return ''; }
      })();
      if (!mssv) { alert('Bạn cần đăng nhập tài khoản sinh viên để đăng ký.'); return; }
      const res = await fetch('/api/activities/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ MaHD: maHD, MSSV: mssv }) });
      const text = await res.text();
      let data = null; try { data = JSON.parse(text); } catch {}
      if (!res.ok) {
        const msg = (data && (data.error||data.message)) || text || 'Đăng ký thất bại';
        alert(msg);
        return;
      }
      // Cập nhật cache đăng ký để đổi nút ngay
      try {
        if (!window._svRegSet) window._svRegSet = new Set();
        window._svRegSet.add(String(maHD));
        if (!window._svRegDetail) window._svRegDetail = {};
        const det = window._svRegDetail[String(maHD)] || {};
        window._svRegDetail[String(maHD)] = Object.assign({}, det, { Eligible: true, Status: 'PENDING' });
      try { saveRegState(); } catch {}
      } catch {}
      alert((data && data.message) || 'Đăng ký thành công!');
      // Re-render danh sách để phản ánh nút "Nộp video minh chứng"
      try { if (Array.isArray(window.allActivities)) await renderActivities(window.allActivities); } catch {}
    } catch (e){
      console.error('registerActivity error', e);
      alert('Không thể đăng ký do lỗi kết nối.');
    }
  }
  window.registerActivity = registerActivity;

  function closeQRModal() {
    const modal = document.getElementById('qr-modal');
    try { stopQrScan(); } catch {}
    modal?.classList.add('hidden');
  }
  window.closeQRModal = closeQRModal;

  // ====== render hoạt động từ dbCache ======
  // ====== Render activity list ======
  async function renderActivities(list) {
    activitiesContainer.innerHTML = "";
    if (!list || list.length === 0) {
      noActivity.classList.remove("hidden");
      return;
    }
    noActivity.classList.add("hidden");
    console.warn('[renderActivities] Starting to render ' + list.length + ' activities');
    
    // Lưu dữ liệu gốc để tìm kiếm/lọc (chỉ khi là dữ liệu gốc từ API)
    if (!window.allActivities || list === dbCache.HoatDongTruong) {
      window.allActivities = list;
    }
    console.debug('[activities] render start count=', list.length, 'ids=', list.map(a=>a.MaHD));
    list.forEach((act, idx) => {
      try {
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

      // Get activity status based on date-only comparison to avoid timezone shifts
      const getActivityStatus = (activity) => {
        // robust parse (supports "YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss", Date, number)
        const sD = parseDateLoose(activity.NgayBD);
        const eD = parseDateLoose(activity.NgayKT);
        if (!sD || !eD) return { text: "Chưa có lịch", class: "bg-gray-500" };
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
        const startOnly = new Date(sD.getFullYear(), sD.getMonth(), sD.getDate(), 0, 0, 0, 0);
        const endOnly = new Date(eD.getFullYear(), eD.getMonth(), eD.getDate(), 23, 59, 59, 999);
        if (todayStart < startOnly) return { text: "Sắp diễn ra", class: "bg-blue-500" };
        if (todayStart > endOnly) return { text: "Đã kết thúc", class: "bg-red-500" };
        return { text: "Đang diễn ra", class: "bg-green-500" };
      };

      // Determine action button: QR (chưa đăng ký), Nộp minh chứng (đã đăng ký & còn hợp lệ), hoặc thông báo đã nộp
      // IMPORTANT: Dùng date-only comparison (không so sánh giờ) để consistent với getActivityStatus
      const sD = parseDateLoose(act.NgayBD);
      const eD = parseDateLoose(act.NgayKT);
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endOnly = eD ? new Date(eD.getFullYear(), eD.getMonth(), eD.getDate(), 23, 59, 59, 999) : null;
      const ended = endOnly ? (todayStart > endOnly) : false;  // Compare date-only, not time
      
      // Kiểm tra login state
      const isLoggedIn = (() => {
        try {
          const raw = localStorage.getItem("loggedUser");
          return Boolean(raw && raw.trim());
        } catch {
          return false;
        }
      })();
      
      // ✅ CẢI THIỆN: Không dùng isRegistered() (cache không reliable)
      // Thay vào đó: Hiển thị placeholder button
      // checkRegistrationStatus() sẽ update sau (từ API)
      const regDetail = window._svRegDetail ? window._svRegDetail[String(act.MaHD)] : null;
      const registered = regDetail ? regDetail.Registered : false;  // Từ API data, không từ memory cache
      const eligible = regDetail ? regDetail.Eligible !== false : true;
      console.warn('[renderActivities-BUTTON] MaHD=' + act.MaHD + ', regDetail=' + JSON.stringify(regDetail) + ', registered=' + registered);
      // Nếu minh chứng bị từ chối (Rejected) hoặc quality thấp (lowquality), cho phép nộp lại
      const evidenceVerdict = regDetail ? (regDetail.EvidenceVerdict || '').toLowerCase() : '';
      const isRejected = evidenceVerdict === 'rejected';
      const isLowQuality = evidenceVerdict === 'lowquality';
      const isApproved = evidenceVerdict === 'approved';
      const canResubmit = isRejected || isLowQuality;  // Nếu bị từ chối hoặc quality thấp, cho phép nộp lại
      let actionBtnHtml = '';
      
      if (!ended) {
        if (!isLoggedIn) {
          // Chưa đăng nhập → không hiển thị button
          actionBtnHtml = `<p class="text-xs text-gray-500 text-center">Đăng nhập để đăng ký hoạt động này</p>`;
        } else if (!registered && regDetail === null) {
          // ✅ CẢI THIỆN: Chưa có API data → hiển thị placeholder (spinner)
          actionBtnHtml = `
            <div class="flex items-center justify-center space-x-2 text-gray-500">
              <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v20m10-10H2"></path>
              </svg>
              <span class="text-xs">Đang tải...</span>
            </div>
          `;
        } else if (!registered) {
          // Đã đăng nhập nhưng chưa đăng ký (từ API) → hiển thị Quét QR
          actionBtnHtml = `
            <button onclick="event.stopPropagation(); openQRScanner('${act.MaHD}');" 
                    class="w-full px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              <span>Đăng ký tham gia</span>
            </button>`;
        } else if (isApproved) {
          // Minh chứng đã được duyệt → hiển thị "Đã nộp minh chứng"
          actionBtnHtml = `<p class="text-xs text-gray-500 text-center">Đã nộp minh chứng.</p>`;
        } else if (canResubmit || (registered && eligible)) {
          // Minh chứng bị từ chối/quality thấp hoặc chưa nộp → hiển thị Nộp minh chứng (cho phép nộp lại)
          actionBtnHtml = `
            <button onclick="event.stopPropagation(); openAttendanceEvidenceModal('${act.MaHD}');" 
                    class="w-full px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              <span>${canResubmit ? 'Nộp lại minh chứng' : 'Nộp minh chứng'}</span>
            </button>`;
        } else if (registered && !eligible) {
          // Đã đăng ký và đã nộp (nhưng không bị từ chối) → hiển thị "Đã nộp minh chứng"
          actionBtnHtml = `<p class="text-xs text-gray-500 text-center">Đã nộp minh chứng.</p>`;
        }
      }

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

          <!-- Action buttons -->
          <div class="pt-3 border-t border-gray-100 space-y-2">
            ${actionBtnHtml}
            <p class="text-xs text-gray-400 text-center">
              👆 Nhấp để xem chi tiết
            </p>
          </div>
        </div>
      `;
  // Identify card by activity id so we can update action area after async status checks
  try { card.dataset.activityId = String(act.MaHD || ''); } catch(e) { console.warn('Failed to set data-activity-id', e); }
      
      card.addEventListener("click", () => openModalHD(act));
      activitiesContainer.appendChild(card);
      } catch(err) {
        console.error('[activities] failed to render activity', act?.MaHD, err);
        // Fallback placeholder card so tổng số hoạt động vẫn hiển thị và giúp debug lỗi dữ liệu
        try {
          const ph = document.createElement('div');
          ph.className = 'bg-red-50 border border-red-200 p-4 rounded-lg text-sm text-red-700';
          ph.innerHTML = `Hoạt động <strong>${act?.MaHD || '?(MaHD)'}</strong> không thể hiển thị do lỗi dữ liệu. Mở Console để xem chi tiết.`;
          activitiesContainer.appendChild(ph);
        } catch {}
      }
    });
    
    // Kiểm tra trạng thái đăng ký sau khi render xong
    // Chờ checkRegistrationStatus() hoàn tất để update DOM trực tiếp
    // Pass activities list to avoid DOM query (which might not have data-activity-id yet)
    console.warn('[renderActivities] About to call checkRegistrationStatus with ' + list.length + ' activities');
    await checkRegistrationStatus(list);
    console.warn('[renderActivities] ✅ checkRegistrationStatus() completed, checking DOM now');
    
    // Debug: kiểm tra DOM sau khi update
    const cards = document.querySelectorAll('[data-activity-id]');
    console.warn('[renderActivities] DOM now has ' + cards.length + ' cards with data-activity-id');
    const buttons = document.querySelectorAll('button span');
    console.warn('[renderActivities] DOM has ' + buttons.length + ' total buttons');
  }

  // ====== modal hoạt động với thiết kế đẹp hơn ======
  function openModalHD(act) {
    console.log("openModalHD called with:", act);
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

    const now2 = new Date();
    const ended2 = act.NgayKT ? (new Date(act.NgayKT) < now2) : false;
    const reg2 = isRegistered(act.MaHD);
    const regDetail2 = window._svRegDetail ? window._svRegDetail[String(act.MaHD)] : null;
    const eligible2 = regDetail2 ? regDetail2.Eligible !== false : true;
    let qrModalBtn = '';
    if (ended2) {
      qrModalBtn = '<p class="text-sm text-gray-500">Hoạt động đã kết thúc.</p>';
    } else if (!reg2) {
      qrModalBtn = `
           <button onclick="openQRScanner('${act.MaHD}')" 
                   data-activity-id="${act.MaHD}"
                   class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2">
             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
             </svg>
             <span>Đăng ký tham gia</span>
           </button>`;
    } else if (reg2 && eligible2) {
      qrModalBtn = `
           <button onclick="openAttendanceEvidenceModal('${act.MaHD}')" 
                   data-activity-id="${act.MaHD}"
                   class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2">
             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
             </svg>
             <span>Nộp minh chứng</span>
           </button>`;
    } else {
  qrModalBtn = '<p class="text-sm text-gray-500">Bạn đã nộp minh chứng.</p>';
    }
  const qrInfoText = ended2 ? 'Hoạt động đã kết thúc.' : (!reg2 ? 'Quét QR code để đăng ký tham gia hoạt động này' : (eligible2 ? 'Bạn đã đăng ký - Nộp minh chứng' : 'Bạn đã nộp minh chứng.'));

    
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

         <!-- QR Code Section -->
         <div class="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
           <h4 class="text-sm font-bold text-blue-700 uppercase tracking-wide mb-2">
             Trạng thái tham gia
           </h4>
           <p class="text-sm text-blue-800 mb-3">
             ${qrInfoText}
           </p>
            ${qrModalBtn}
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
    console.log("About to show modal");
    document.getElementById("modal").classList.remove("hidden");
    console.log("Modal should be visible now");
  }
  window.closeModal = () => document.getElementById("modal").classList.add("hidden");

  // ====== PRELOAD dữ liệu cần cho cả phiên ======
  async function preloadData() {
    console.error('🔥🔥🔥 [preloadData] START - THIS IS INSIDE preloadData FUNCTION 🔥🔥🔥');
    console.warn('[preloadData] ⏳ START preloadData()');
    activitiesContainer.innerHTML = `<div class="text-gray-500">Đang tải dữ liệu...</div>`;
    try {
      console.warn('[preloadData] 🔍 Inside try block');
  // Cache-buster to avoid stale data after admin changes, and include mssv for server-side registrations
  let mssv = '';
  try {
    const raw = sessionStorage.getItem("loggedUserInfo");
    const info = raw ? JSON.parse(raw) : null;
    mssv = info?.MaCaNhan || info?.MSSV || info?.MaSV || info?.TenTK || '';
    if (mssv) mssv = String(mssv);
  } catch {}
  const url = `${API_BASE}/api/preload?t=${Date.now()}${mssv ? `&mssv=${encodeURIComponent(mssv)}` : ''}`;
      console.debug('[preload] fetching', url);
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) {
        let body = '';
        try { body = await res.text(); } catch {}
        throw new Error(`HTTP ${res.status} ${res.statusText || ''} ${body ? '- ' + body.slice(0,200) : ''}`);
      }
      let data;
      try { data = await res.json(); }
      catch (e) {
        const text = await res.clone().text().catch(() => '');
        try { data = JSON.parse((text || '').replace(/^\uFEFF/, '').trim()); }
        catch { throw new Error('JSON parse error: ' + (text || '(empty)')); }
      }

  dbCache.KHOA = data.khoa ?? [];
      dbCache.Lop = data.lop ?? [];
      dbCache.HoatDongTruong = data.hoatDongTruong ?? [];
      if ((!Array.isArray(dbCache.HoatDongTruong) || dbCache.HoatDongTruong.length === 0) && data) {
        const guess = data.HoatDongTruong || data.activities || null;
        if (Array.isArray(guess)) {
          console.warn('[preload] using fallback key for hoatDongTruong');
          dbCache.HoatDongTruong = guess;
        }
      }

      // lưu sessionStorage theo đúng shape của API
      try {
        const preloadData = {
          khoa: dbCache.KHOA,
          lop: dbCache.Lop,
          hoatDongTruong: dbCache.HoatDongTruong
        };
        sessionStorage.setItem('preload', JSON.stringify(preloadData));
        // Also save to localStorage as fallback
        try { localStorage.setItem('PRELOAD_CACHE', JSON.stringify(preloadData)); } catch {}
      } catch {}

      // Nếu server trả danh sách đăng ký → hydrate ngay để đồng bộ đa nền tảng
      try {
        const list = Array.isArray(data.studentRegistrations) ? data.studentRegistrations : [];
        if (list.length) {
          window._svRegSet = new Set();
          window._svRegDetail = {};
          list.forEach(it => {
            const ma = String(it.MaHD||''); if (!ma) return;
            window._svRegSet.add(ma);
            window._svRegDetail[ma] = {
              RegisteredAt: it.RegisteredAt,
              TenHD: it.TenHD || '',
              Status: it.Status || 'PENDING',
              Eligible: (typeof it.IsEligibleForEvidence === 'boolean') ? it.IsEligibleForEvidence : true,
              EvidenceVerdict: it.EvidenceVerdict || it.evidenceVerdict || ''
            };
          });
          try { saveRegState(); } catch {}
        } else if (mssv) {
          // Fallback: nếu chưa có từ server, gọi API riêng để nạp đăng ký
          await hydrateStudentRegistrations(String(mssv));
        }
        // Nếu có đúng 1 hoạt động đang mở và còn eligible → tự set maHD vào URL để SV không cần quét lại
        const activeRegs = getActiveEligibleRegistrations();
        if (activeRegs.length === 1) {
          const reg = activeRegs[0];
          try {
            sessionStorage.setItem('qr_maHD', reg.MaHD);
            if (reg.TenHD) sessionStorage.setItem('qr_tenHD', reg.TenHD);
            const u = new URL(location.href); u.searchParams.set('maHD', reg.MaHD); history.replaceState({}, '', u.toString());
          } catch {}
        }
      } catch {}

      // ✅ CẢI THIỆN: Render list TRƯỚC, rồi sau đó cập nhật button từ API
      // Bước 1: Render danh sách hoạt động + cập nhật button từ API
      console.warn('[preload] About to call renderActivities with', dbCache.HoatDongTruong?.length || 0, 'activities');
      console.warn('[preload] 🔄 NOW renderActivities()');
      await renderActivities(dbCache.HoatDongTruong);
      console.warn('[preload] ✅ renderActivities() done - all buttons updated from API');
      console.debug('[preload] rendered activities:', dbCache.HoatDongTruong.length);
      
      // Nếu đã từng quét QR → giữ trạng thái đã đăng ký đến khi hoạt động kết thúc
      try {
        const saved = sessionStorage.getItem('qr_maHD');
        if (saved) {
          const found = dbCache.HoatDongTruong.find(a => (a.MaHD||'').toString() === saved);
          let ended = false;
          if (found && found.NgayKT) {
            try { ended = new Date(found.NgayKT) < new Date(); } catch { ended = false; }
          }
          if (found && !ended) {
            const url = new URL(location.href); url.searchParams.set('maHD', saved); history.replaceState({}, '', url.toString());
            // Đánh dấu đã đăng ký trong cache để UI đồng bộ khi chưa đăng nhập
            try {
              if (!window._svRegSet) window._svRegSet = new Set();
              window._svRegSet.add(String(saved));
              if (!window._svRegDetail) window._svRegDetail = {};
              const det = window._svRegDetail[String(saved)] || {};
              window._svRegDetail[String(saved)] = Object.assign({}, det, { Eligible: true, Status: 'PENDING', TenHD: found.TenHD||'' });
              saveRegState();
            } catch {}
          } else {
            // hết hạn → xoá
            sessionStorage.removeItem('qr_maHD');
            sessionStorage.removeItem('qr_tenHD');
          }
        }
      } catch {}
      
      // Thêm chức năng tìm kiếm và lọc
      setupSearchAndFilter();
    } catch (e) {
      console.error('Không tải được /api/preload', e);
      activitiesContainer.innerHTML = "";
      noActivity.classList.remove("hidden");
      const p = noActivity.querySelector("p.text-lg");
      if (p) {
        const hint = (location.protocol === 'file:')
          ? " Hãy chạy backend qua http://localhost:PORT hoặc đặt localStorage api_base_url."
          : " Vui lòng kiểm tra backend và đường dẫn API.";
        p.textContent = "Không tải được dữ liệu từ máy chủ." + hint + (e && e.message ? ` (Chi tiết: ${e.message})` : '');
      }
    }
  }
  
  // ====== Đăng ký SV: cache để ẩn QR & tự nhận diện hoạt động ======
  if (!window._svRegSet) window._svRegSet = new Set();           // MaHD đã đăng ký
  if (!window._svRegDetail) window._svRegDetail = {};            // MaHD -> { RegisteredAt, Status, Eligible, TenHD, EvidenceVerdict }
  async function hydrateStudentRegistrations(mssv){
    try {
      // First, try to use preload data if available (faster, already in memory)
      const preloadData = window.dbCache || (sessionStorage.getItem('preload') ? JSON.parse(sessionStorage.getItem('preload')) : null);
      const preloadRegs = (preloadData && Array.isArray(preloadData.studentRegistrations)) ? preloadData.studentRegistrations : [];
      
      if (preloadRegs.length > 0) {
        console.log('[hydrateStudentRegistrations] Using preload data with', preloadRegs.length, 'registrations');
        window._svRegSet = new Set();
        window._svRegDetail = {};
        preloadRegs.forEach(it => {
          const ma = String(it.MaHD||''); if (!ma) return;
          window._svRegSet.add(ma);
          window._svRegDetail[ma] = {
            RegisteredAt: it.RegisteredAt,
            TenHD: it.TenHD || '',
            Status: it.Status || 'PENDING',
            Eligible: (typeof it.IsEligibleForEvidence === 'boolean') ? it.IsEligibleForEvidence : true,
            EvidenceVerdict: it.EvidenceVerdict || it.evidenceVerdict || ''
          };
        });
        try { saveRegState(); } catch {}
        return;
      }
      
      // Fallback: Retry logic for API call (iOS Safari aggressive caching)
      let res = null;
      let list = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // Add cache-busting timestamp to bypass aggressive iOS caching
          const timestamp = Date.now();
          const url = `${API_BASE}/api/students/${encodeURIComponent(mssv)}/registrations?_t=${timestamp}`;
          res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) {
            if (attempt === 0) continue; // Retry once on first failure
            console.warn('[hydrateStudentRegistrations] API returned', res.status, 'will use empty/fallback');
            return;
          }
          list = await res.json();
          break;
        } catch (e) {
          if (attempt === 1) throw e;
          // First attempt failed, retry with slight delay
          await new Promise(r => setTimeout(r, 100));
        }
      }
      
      if (!list || !Array.isArray(list)) {
        console.warn('[hydrateStudentRegistrations] API returned non-array or null');
        return;
      }
      
      if (list.length === 0) {
        console.log('[hydrateStudentRegistrations] API returned empty list');
        window._svRegSet = new Set();
        window._svRegDetail = {};
        return;
      }
      
      // Luôn reset để đồng bộ với DB (tránh hiển thị sai sau khi trạng thái đổi ở server)
      window._svRegSet = new Set();
      window._svRegDetail = {};
      (list||[]).forEach(it => {
        const ma = String(it.MaHD||''); if (!ma) return;
        window._svRegSet.add(ma);
        window._svRegDetail[ma] = {
          RegisteredAt: it.RegisteredAt,
          TenHD: it.TenHD || '',
          Status: it.Status || 'PENDING',
          Eligible: (typeof it.IsEligibleForEvidence === 'boolean') ? it.IsEligibleForEvidence : true,
          EvidenceVerdict: it.EvidenceVerdict || it.evidenceVerdict || ''  // Thêm verdict từ API
        };
      });
      try { saveRegState(); } catch {}
      console.log('[hydrateStudentRegistrations] Success: loaded', list.length, 'registrations for', mssv);
    } catch (e){ 
      console.warn('hydrateStudentRegistrations error (will fallback to cache)', e); 
      // Fallback: restore từ localStorage nếu API thất bại (cải thiện UX trên iOS)
      try {
        const saved = localStorage.getItem('_svRegState');
        if (saved) {
          const state = JSON.parse(saved);
          window._svRegSet = new Set(state.set || []);
          window._svRegDetail = state.detail || {};
          console.log('[hydrateStudentRegistrations] Fallback: restored from localStorage');
        }
      } catch {}
    }
  }
  function isRegistered(maHD){ try { return window._svRegSet && window._svRegSet.has(String(maHD)); } catch { return false; } }
  function getActiveEligibleRegistrations(){
    try {
      const acts = Array.isArray(dbCache.HoatDongTruong)? dbCache.HoatDongTruong : [];
      const now = new Date();
      const out = [];
      acts.forEach(a => {
        const ma = String(a.MaHD||''); if (!ma) return;
        if (!isRegistered(ma)) return;
        const ended = a.NgayKT ? (new Date(a.NgayKT) < now) : false;
        if (ended) return;
        const det = window._svRegDetail[ma] || { Eligible: true };
        if (det.Eligible !== false) out.push({ MaHD: ma, TenHD: a.TenHD||det.TenHD||'' });
      });
      return out;
    } catch { return []; }
  }

  // ====== Chức năng tìm kiếm và lọc hoạt động ======
  function setupSearchAndFilter() {
    const searchInput = document.getElementById("search");
    const filterSelect = document.getElementById("filter");
    
    if (!searchInput || !filterSelect) return;
    
    // Event listener cho tìm kiếm
    searchInput.addEventListener("input", (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      filterActivities(searchTerm, filterSelect.value);
    });
    
    // Event listener cho lọc
    filterSelect.addEventListener("change", (e) => {
      const filterValue = e.target.value;
      filterActivities(searchInput.value.toLowerCase().trim(), filterValue);
    });
  }
  
  // Hàm lọc hoạt động
  function filterActivities(searchTerm, filterValue) {
    if (!window.allActivities) return;
    
    let filteredActivities = [...window.allActivities];
    
    // Lọc theo từ khóa tìm kiếm
    if (searchTerm && searchTerm.trim() !== '') {
      filteredActivities = filteredActivities.filter(activity => {
        const tenHD = (activity.TenHD || '').toLowerCase();
        const ndHD = (activity.NDHD || '').toLowerCase();
        const diaDiem = (activity.DiaDiem || '').toLowerCase();
        const maHD = (activity.MaHD || '').toLowerCase();
        
        return tenHD.includes(searchTerm) || 
               ndHD.includes(searchTerm) || 
               diaDiem.includes(searchTerm) ||
               maHD.includes(searchTerm);
      });
    }
    
    // Lọc theo loại hoạt động
    if (filterValue && filterValue.trim() !== '') {
      filteredActivities = filteredActivities.filter(activity => {
        const tenHD = (activity.TenHD || '').toLowerCase();
        const ndHD = (activity.NDHD || '').toLowerCase();
        const filterLower = filterValue.toLowerCase();
        
        // Tìm kiếm trong cả tên hoạt động và nội dung
        return tenHD.includes(filterLower) || ndHD.includes(filterLower);
      });
    }
    
    // Hiển thị kết quả tìm kiếm
    console.log(`Tìm thấy ${filteredActivities.length} hoạt động`);
    
    // Render lại danh sách đã lọc (không cập nhật allActivities)
    renderFilteredActivities(filteredActivities);
  }
  
  // Hàm render hoạt động đã lọc (không cập nhật allActivities)
  function renderFilteredActivities(filteredList) {
    activitiesContainer.innerHTML = "";
    if (!filteredList || filteredList.length === 0) {
      noActivity.classList.remove("hidden");
      return;
    }
    noActivity.classList.add("hidden");

    filteredList.forEach((act, idx) => {
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

      // Get activity status based on date-only comparison to avoid timezone shifts
      const getActivityStatus = (activity) => {
        const sD = parseDateLoose(activity.NgayBD);
        const eD = parseDateLoose(activity.NgayKT);
        if (!sD || !eD) return { text: "Chưa có lịch", class: "bg-gray-500" };
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
        const startOnly = new Date(sD.getFullYear(), sD.getMonth(), sD.getDate(), 0, 0, 0, 0);
        const endOnly = new Date(eD.getFullYear(), eD.getMonth(), eD.getDate(), 23, 59, 59, 999);
        if (todayStart < startOnly) return { text: "Sắp diễn ra", class: "bg-blue-500" };
        if (todayStart > endOnly) return { text: "Đã kết thúc", class: "bg-red-500" };
        return { text: "Đang diễn ra", class: "bg-green-500" };
      };

      // Determine action button depending on registration + eligibility (match main renderer)
      // IMPORTANT: Dùng date-only comparison (không so sánh giờ) để consistent với getActivityStatus
      const sD = parseDateLoose(act.NgayBD);
      const eD = parseDateLoose(act.NgayKT);
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endOnly = eD ? new Date(eD.getFullYear(), eD.getMonth(), eD.getDate(), 23, 59, 59, 999) : null;
      const ended = endOnly ? (todayStart > endOnly) : false;  // Compare date-only, not time
      
      // Kiểm tra login state
      const isLoggedIn = (() => {
        try {
          const raw = localStorage.getItem("loggedUser");
          return Boolean(raw && raw.trim());
        } catch {
          return false;
        }
      })();
      
      const registered = isRegistered(act.MaHD);
      const regDetail = window._svRegDetail ? window._svRegDetail[String(act.MaHD)] : null;
      const eligible = regDetail ? regDetail.Eligible !== false : true;
      // ✅ CẢI THIỆN: Hiển thị placeholder, để checkRegistrationStatus() update từ server
      // Điều này tránh hiển thị sai khi dữ liệu local cũ
      let actionBtnHtml = '';
      
      // Nếu hoạt động kết thúc, hiển thị ngay (không cần gọi API)
      if (ended) {
        actionBtnHtml = `<p class="text-xs text-gray-500 text-center">Hoạt động đã kết thúc.</p>`;
      } else {
        // Chưa biết trạng thái → Hiển thị placeholder
        // checkRegistrationStatus() sẽ cập nhật sau
        actionBtnHtml = `
          <div class="flex items-center justify-center space-x-2 text-gray-500">
            <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-xs">Đang tải...</span>
          </div>
        `;
      }

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

          <!-- Action buttons -->
          <div class="pt-3 border-t border-gray-100 space-y-2">
            ${actionBtnHtml}
            <p class="text-xs text-gray-400 text-center">
              👆 Nhấp để xem chi tiết
            </p>
          </div>
        </div>
      `;
      
      // Click vào card để xem chi tiết (trừ khi click vào nút)
      card.addEventListener("click", (e) => {
        console.log("Card clicked!", e.target, e.target.closest('button'));
        // Chỉ mở modal nếu không click vào nút bên trong
        if (!e.target.closest('button')) {
          console.log("Opening modal for activity:", act.TenHD);
          openModalHD(act);
        } else {
          console.log("Clicked on button, not opening modal");
        }
      });
      
      activitiesContainer.appendChild(card);
    });
    
    // Kiểm tra trạng thái đăng ký sau khi render xong
    checkRegistrationStatus();
  }

  // ====== Kiểm tra trạng thái đăng ký (từ API server) ======
  // Sử dụng API làm source of truth: /api/students/{mssv}/registration-status/{maHD}
  async function checkRegistrationStatus(activitiesList = null) {
    try {
      // Lấy MSSV từ session/local storage
      const getMSSV = () => {
        try { const raw = sessionStorage.getItem('loggedUserInfo'); if (!raw) return ''; const info = JSON.parse(raw); return String(info?.MaCaNhan || info?.MSSV || info?.MaSV || info?.Ma || ''); } catch { try { const raw2 = localStorage.getItem('loggedUserInfo'); if (!raw2) return ''; const info2 = JSON.parse(raw2); return String(info2?.MaCaNhan || info2?.MSSV || info2?.MaSV || info2?.Ma || ''); } catch { return ''; } }
      };
      const mssv = getMSSV();
      
      // ✅ CẢI THIỆN: Accept activitiesList as parameter
      // Nếu không có, query DOM để tìm activities
      let activities = activitiesList;
      if (!activities || activities.length === 0) {
        const cards = Array.from(document.querySelectorAll('[data-activity-id]'));
        if (!cards.length) {
          console.debug('[checkRegistrationStatus] No activities found in DOM and no list provided');
          return;
        }
        activities = cards.map(card => ({ MaHD: card.dataset.activityId }));
      }
      
      if (!activities || activities.length === 0) {
        console.debug('[checkRegistrationStatus] No activities to check');
        return;
      }
      
      // ✅ CẢI THIỆN: Xử lý trường hợp chưa đăng nhập
      if (!mssv) {
        console.debug('[checkRegistrationStatus] Not logged in');
        // Chưa đăng nhập → Update DOM if elements exist
        const cards = Array.from(document.querySelectorAll('[data-activity-id]'));
        cards.forEach(card => {
          const actionWrap = card.querySelector('.pt-3.border-t') || card.querySelector('.pt-3');
          if (actionWrap) {
            actionWrap.innerHTML = `
              <p class="text-xs text-gray-500 text-center">Đăng nhập để đăng ký hoạt động này</p>
              <p class="text-xs text-gray-400 text-center">👆 Nhấp để xem chi tiết</p>
            `;
          }
        });
        return;
      }

      // ✅ CẢI THIỆN: Iterate qua activities list, không qua DOM cards
      const limit = 8;
      let idx = 0;
      console.warn('[checkRegistrationStatus] Starting to check ' + activities.length + ' activities for MSSV=' + mssv);
      while (idx < activities.length) {
        const batch = activities.slice(idx, idx + limit);
        await Promise.all(batch.map(async (activity) => {
          const maHD = activity.MaHD;
          if (!maHD) return;
          try {
            console.warn('[checkRegistrationStatus] Checking activity ' + maHD + '...');
            const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(mssv)}/registration-status/${encodeURIComponent(maHD)}`);
            console.debug(`[checkRegistrationStatus] GET /api/students/${mssv}/registration-status/${maHD} - status=${res.status}`);
            if (!res.ok) {
              console.warn(`[checkRegistrationStatus] API returned ${res.status} for ${maHD}, skipping`);
              return;
            }
            const data = await res.json();
            console.debug(`[checkRegistrationStatus] Response data for ${maHD}:`, data);
            
            // ✅ CẢI THIỆN: Update cache để renderActivities() có thể dùng lại
            if (!window._svRegDetail) window._svRegDetail = {};
            window._svRegDetail[String(maHD)] = {
              Registered: data.registered,
              EvidenceVerdict: data.evidenceVerdict,
              Eligible: data.isEligibleForEvidence
            };
            saveRegState();
            
            console.debug(`[checkRegistrationStatus] ${maHD}: registered=${data.registered}, verdict=${data.evidenceVerdict}`);
            
            // Update DOM if card exists
            const card = document.querySelector(`[data-activity-id="${maHD}"]`);
            if (!card) return;
            
            // Kiểm tra xem hoạt động có kết thúc không
            const ended = (() => {
              try { const txt = card.querySelector('.activity-status')?.textContent || ''; return /Đã kết thúc/i.test(txt); } catch { return false; }
            })();
            
            const actionWrap = card.querySelector('.pt-3.border-t') || card.querySelector('.pt-3');
            if (!actionWrap) return;

            let actionBtnHtml = '';
            
            // ✅ CẢI THIỆN: Logic rõ ràng hơn, dựa vào API response
            if (ended) {
              // Hoạt động kết thúc
              actionBtnHtml = `<p class="text-xs text-gray-500 text-center">Hoạt động đã kết thúc.</p>`;
            } else if (!data.registered) {
              // Chưa đăng ký → Nút Đăng ký
              actionBtnHtml = `
                <button onclick="event.stopPropagation(); openQRScanner('${maHD}');" 
                        class="w-full px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                  </svg>
                  <span>Đăng ký tham gia</span>
                </button>`;
            } else if (data.evidenceVerdict && String(data.evidenceVerdict).toLowerCase() === 'approved') {
              // Minh chứng đã được phê duyệt
              actionBtnHtml = `<p class="text-xs text-gray-500 text-center">Đã nộp minh chứng.</p>`;
            } else if (data.evidenceVerdict && String(data.evidenceVerdict).toLowerCase() === 'rejected') {
              // Minh chứng bị từ chối → Nút Nộp lại
              actionBtnHtml = `
                <button onclick="event.stopPropagation(); openAttendanceEvidenceModal('${maHD}');" 
                        class="w-full px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                  </svg>
                  <span>Nộp lại minh chứng</span>
                </button>`;
            } else if (data.registered && data.isEligibleForEvidence) {
              // Đã đăng ký và có thể nộp minh chứng → Nút Nộp
              actionBtnHtml = `
                <button onclick="event.stopPropagation(); openAttendanceEvidenceModal('${maHD}');" 
                        class="w-full px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                  </svg>
                  <span>Nộp minh chứng</span>
                </button>`;
            } else {
              // Các trường hợp khác (đã nộp, chưa thể nộp, v.v.)
              actionBtnHtml = `<p class="text-xs text-gray-500 text-center">Đã nộp minh chứng.</p>`;
            }

            // Giữ helper text dưới nút
            actionWrap.innerHTML = actionBtnHtml + '\n<p class="text-xs text-gray-400 text-center">👆 Nhấp để xem chi tiết</p>';
          } catch (e) {
            console.warn('[checkRegistrationStatus] Error processing activity ' + maHD + ':', e);
          }
        })).catch(err => {
          console.warn('[checkRegistrationStatus] Promise.all error in batch:', err);
        });
        idx += limit;
      }
    } catch (err) {
      console.warn('checkRegistrationStatus error (ignored):', err);
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
      
      if (res.status === 400) {
        try {
          const errorData = await res.json();
          showLoginError(errorData.message || "Tài khoản đã bị khóa!");
        } catch {
          showLoginError("Tài khoản đã bị khóa!");
        }
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

      // Lưu thông tin người dùng vào cả localStorage và sessionStorage
      localStorage.setItem("loggedUser", userInfo.TenNguoiDung || userInfo.TenTK || user);
      localStorage.setItem("loggedUserInfo", JSON.stringify(userInfo));
      sessionStorage.setItem("loggedUser", userInfo.TenNguoiDung || userInfo.TenTK || user);
      sessionStorage.setItem("loggedUserInfo", JSON.stringify(userInfo));
      
      // ✅ IMPORTANT: Save credentials for F5 auto-refresh
      localStorage.setItem("savedTenTK", user);
      localStorage.setItem("savedMatKhau", pass);
      console.log('💾 [LOGIN] Saved credentials for F5 auto-refresh');
      
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
      } else if (maQT === "TR01") {
        // Cấp trường - Chuyển đến giao diện trường
        console.log("Chuyển hướng đến giao diện Trường");
        window.location.href = "truong.html";
        return;
      } else if (maQT === "KH01") {
        // Cán bộ Khoa - Chuyển đến giao diện Khoa
        console.log("Chuyển hướng đến giao diện Khoa");
        window.location.href = "khoa.html";
        return;
      } else {
        // Sinh viên hoặc vai trò khác
        console.log("Xử lý vai trò sinh viên hoặc khác:", maQT);
        try {
          // Kiểm tra CBLop: nếu là cán bộ lớp thì chuyển giao diện CBL
          const mssvCandidateRaw = (userInfo.MaCaNhan || userInfo.MSSV || userInfo.MaSV || userInfo.TenTK || user || '').toString();
          const mssvCandidate = mssvCandidateRaw.trim();
          if (mssvCandidate) {
            const svRes = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssvCandidate)}`);
            if (svRes.ok) {
              const sv = await svRes.json();
              const isCBL = sv && (sv.CBLop === true || sv.CBLop === 1 || sv.CBLop === '1');
              if (isCBL) {
                console.log("CBLop=true → chuyển đến canbolop.html");
                window.location.href = "cblop.html";
                return;
              }
            } else if (svRes.status === 404 && userInfo.TenTK && userInfo.TenTK !== mssvCandidate) {
              // Fallback: thử với TenTK đã trim nếu khác
              const tk = (userInfo.TenTK || '').toString().trim();
              if (tk) {
                const svRes2 = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(tk)}`);
                if (svRes2.ok) {
                  const sv2 = await svRes2.json();
                  const isCBL2 = sv2 && (sv2.CBLop === true || sv2.CBLop === 1 || sv2.CBLop === '1');
                  if (isCBL2) {
                    window.location.href = "cblop.html";
                    return;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn("Không kiểm tra được CBLop, sẽ ở lại giao diện SV:", e);
        }

        // Mặc định: Ở lại trang chủ (SV)
        renderLoggedInUI(localStorage.getItem("loggedUser"));
        loginModal.classList.add("hidden");
        hideLoginError();
        showRoleMessage(maQT, userInfo.TenNguoiDung || userInfo.TenTK);
        
        // ✅ EXECUTE PENDING ACTION (nếu có - ví dụ openEvidenceWizard hoặc openAttendanceEvidenceModal)
        if (pendingWizardAction) {
          const action = pendingWizardAction;
          pendingWizardAction = null;
          if (action.action === 'openEvidenceWizard') {
            // Delay nhỏ để đảm bảo UI đã render xong
            setTimeout(() => {
              openEvidenceWizard(action.maHD);
            }, 100);
          } else if (action.action === 'openAttendanceEvidenceModal') {
            setTimeout(() => {
              openAttendanceEvidenceModal(action.maHD);
            }, 100);
          }
        }
        
        // 🔥 STEP 1: Nạp activities + registrations từ server
        console.log('[login] STEP 1: Loading activities + registrations from API');
        try {
          const preloadRes = await fetch(`${API_BASE}/api/preload?t=${Date.now()}`, { cache: 'no-store' });
          if (preloadRes.ok) {
            const preloadData = await preloadRes.json();
            console.log('[login] Preload API returned:', preloadData.hoatDongTruong?.length || 0, 'activities');
            
            // Set activities
            if (Array.isArray(preloadData.hoatDongTruong)) {
              window.allActivities = preloadData.hoatDongTruong;
              window.dbCache = preloadData; // Also cache full data
              sessionStorage.setItem('preload', JSON.stringify(preloadData));
              console.log('[login] ✅ Set window.allActivities:', window.allActivities.length, 'items');
            }
            
            // Set registrations from preload
            if (Array.isArray(preloadData.studentRegistrations)) {
              window._svRegSet = new Set();
              window._svRegDetail = {};
              preloadData.studentRegistrations.forEach(it => {
                const ma = String(it.MaHD||''); if (!ma) return;
                window._svRegSet.add(ma);
                window._svRegDetail[ma] = {
                  RegisteredAt: it.RegisteredAt,
                  TenHD: it.TenHD || '',
                  Status: it.Status || 'PENDING',
                  Eligible: (typeof it.IsEligibleForEvidence === 'boolean') ? it.IsEligibleForEvidence : true,
                  EvidenceVerdict: it.EvidenceVerdict || it.evidenceVerdict || ''
                };
              });
              console.log('[login] ✅ Set registrations:', window._svRegSet.size, 'items');
            }
          } else {
            console.warn('[login] Preload API failed:', preloadRes.status);
          }
        } catch (e) {
          console.warn('[login] Error loading preload data:', e);
        }
        
        // 🔥 STEP 2: Re-render activities với button status
        console.log('[login] STEP 2: Re-rendering activities with registration status');
        try {
          if (Array.isArray(window.allActivities)) {
            console.log('[login] Re-rendering', window.allActivities.length, 'activities with', window._svRegSet?.size || 0, 'registrations');
            await renderActivities(window.allActivities);
            console.log('[login] ✅ Activities re-rendered successfully');
          } else {
            console.warn('[login] window.allActivities not available yet');
          }
        } catch (e) {
          console.warn('[login] Error re-rendering activities:', e);
        }
      }
      
    } catch (err) {
      console.error("Lỗi khi gọi API:", err);
      
      // Fallback: sử dụng demo data nếu API không hoạt động
      console.log("API không hoạt động, sử dụng demo data");
      handleDemoLogin(user, pass);
    }
  });

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
      case "KH01":
        roleText = "Cán bộ Khoa";
        roleColor = "bg-indigo-100 border-indigo-300 text-indigo-800";
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
          ${window.isEkycApproved !== true ? `
          <div class="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mb-4 rounded shadow-sm">
            <div class="flex justify-between items-center">
              <div>
                <p class="font-bold"><svg style="width:16px;height:16px;display:inline-block;margin-right:8px;" fill="currentColor" viewBox="0 0 16 16"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>Chưa xác thực eKYC</p>
                <p class="text-sm">Tài khoản của bạn chưa được xác thực. Vui lòng xác thực khuôn mặt và Thẻ sinh viên để mở khóa toàn bộ tính năng.</p>
              </div>
              <a href="/ekyc.html" class="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded text-sm no-underline whitespace-nowrap ml-4">Xác thực ngay</a>
            </div>
          </div>` : ""}

          <!-- Trạng thái eKYC -->
          <div class="mt-6 border-t border-gray-200 pt-4">
             <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Xác thực danh tính (eKYC)</h4>
             <div id="preview-ekyc-status-display" class="bg-gray-50 p-4 rounded-lg border flex items-center justify-center">
                 <div class="spinner-border spinner-border-sm text-primary mr-2" role="status"></div> Đang tải trạng thái...
             </div>
          </div>

          <!-- Student Info Section -->
          <div class="flex items-start gap-6">
            <div class="flex flex-col items-center gap-3 relative">
              <img class="w-24 h-24 rounded-full object-cover ${window.isEkycApproved ? 'border-4 border-green-500' : 'border'}" src="${sv.AnhDD ? `data:image/jpeg;base64,${sv.AnhDD}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(sv.TenSV || sv.MSSV || mssv)}&background=0D8ABC&color=fff`}" alt="Avatar">
              ${window.isEkycApproved ? `
              <div class="absolute bg-green-500 text-white rounded-full p-1" style="bottom: 0px; right: 0; box-shadow: 0 0 0 2px white;">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
              </div>` : ""}
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
                    <div class="space-y-1">
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">Tổng điểm:</span>
                        <span class="font-bold text-lg">${currentGrade.TongDRL || "N/A"}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">VP Nhà trường:</span>
                        <span class="font-bold text-red-600">${currentGrade.viphamNT || 0}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">VP Xã hội:</span>
                        <span class="font-bold text-red-600">${currentGrade.viphamXH || 0}</span>
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
            <!-- Lịch sử điểm -->
            <div class="mt-6 border-t border-gray-200 pt-4">
              <div class="flex justify-between items-center mb-3">
                <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide">Lịch sử cộng điểm</h4>
                <button type="button" id="btn-history" class="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-200 font-semibold shadow-sm transition-colors duration-200">Xem chi tiết</button>
              </div>
              <div id="history-display" class="hidden">
                 <div class="text-center text-xs text-gray-500 py-4">Đang tải lịch sử...</div>
              </div>
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

      // Fetch eKYC Status dynamically
      const ekycContainer = document.getElementById('preview-ekyc-status-display');
      if (ekycContainer) {
          try {
              const ekycRes = await fetch(`${API_BASE}/api/ekyc/status`, { headers: { 'X-User': mssv } });
              if (ekycRes.ok) {
                  const ekycData = await ekycRes.json();
                  if (ekycData.status === 'Approved') {
                      ekycContainer.className = 'bg-green-50 p-4 rounded-lg border border-green-200 flex justify-between items-center';
                      ekycContainer.innerHTML = `
                          <div class="flex items-center gap-3">
                              <div class="bg-green-100 text-green-600 p-2 rounded-full"><i class="bi bi-shield-check" style="font-size: 1.5rem;"></i></div>
                              <div>
                                  <h5 class="text-sm font-bold text-green-800 mb-0">Đã xác thực thành công</h5>
                                  <p class="text-xs text-green-600 mb-0">Tài khoản đã được bảo vệ</p>
                              </div>
                          </div>
                          <a href="/ekyc.html" class="text-xs bg-white text-green-700 px-3 py-1.5 rounded-md border border-green-300 hover:bg-green-50">Xem hồ sơ</a>
                      `;
                  } else if (ekycData.status === 'Pending') {
                      ekycContainer.className = 'bg-yellow-50 p-4 rounded-lg border border-yellow-200 flex justify-between items-center';
                      ekycContainer.innerHTML = `
                          <div class="flex items-center gap-3">
                              <div class="bg-yellow-100 text-yellow-600 p-2 rounded-full"><i class="bi bi-hourglass-split" style="font-size: 1.5rem;"></i></div>
                              <div>
                                  <h5 class="text-sm font-bold text-yellow-800 mb-0">Đang chờ phê duyệt</h5>
                                  <p class="text-xs text-yellow-600 mb-0">Hồ sơ của bạn đang được cán bộ kiểm tra</p>
                              </div>
                          </div>
                          <a href="/ekyc.html" class="text-xs bg-white text-yellow-700 px-3 py-1.5 rounded-md border border-yellow-300 hover:bg-yellow-50">Xem tiến độ</a>
                      `;
                  } else {
                      ekycContainer.className = 'bg-orange-50 p-4 rounded-lg border border-orange-200 flex justify-between items-center';
                      ekycContainer.innerHTML = `
                          <div class="flex items-center gap-3">
                              <div class="bg-orange-100 text-orange-600 p-2 rounded-full"><i class="bi bi-shield-exclamation" style="font-size: 1.5rem;"></i></div>
                              <div>
                                  <h5 class="text-sm font-bold text-orange-800 mb-0">Chưa xác thực</h5>
                                  <p class="text-xs text-orange-600 mb-0">Vui lòng thực hiện eKYC để mở khóa tính năng</p>
                              </div>
                          </div>
                          <a href="/ekyc.html" class="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-md hover:bg-orange-600 font-bold">Xác thực ngay</a>
                      `;
                  }
              } else {
                  ekycContainer.innerHTML = '<div class="text-xs text-red-500">Lỗi tải trạng thái eKYC</div>';
              }
          } catch (e) {
              ekycContainer.innerHTML = '<div class="text-xs text-red-500">Không thể kết nối máy chủ</div>';
          }
      }

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
                    <div class="space-y-1">
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">Tổng điểm:</span>
                        <span class="font-bold text-lg">${grade.TongDRL || "N/A"}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">VP Nhà trường:</span>
                        <span class="font-bold text-red-600">${grade.viphamNT || 0}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">VP Xã hội:</span>
                        <span class="font-bold text-red-600">${grade.viphamXH || 0}</span>
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
            // Hide history if filter changes
            document.getElementById('history-display')?.classList.add('hidden');
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

      const btnHistory = document.getElementById('btn-history');
      if (btnHistory) {
        btnHistory.addEventListener('click', async () => {
          const disp = document.getElementById('history-display');
          if (!disp) return;
          if (!disp.classList.contains('hidden')) {
              disp.classList.add('hidden');
              return;
          }
          disp.classList.remove('hidden');
          disp.innerHTML = '<div class="text-center text-xs text-gray-500 py-4">Đang tải lịch sử...</div>';
          try {
              const y = document.getElementById('filter-namhoc').value;
              const hk = document.getElementById('filter-hocki').value;
              const res = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssv)}/points-history?${new URLSearchParams({ namHoc: y, hocKi: hk }).toString()}`);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const history = await res.json();
              if (Array.isArray(history) && history.length > 0) {
                  disp.innerHTML = `
                    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
                      <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                          <tr>
                            <th scope="col" class="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Thời gian</th>
                            <th scope="col" class="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Điểm</th>
                            <th scope="col" class="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lý do</th>
                            <th scope="col" class="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Người duyệt</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 bg-white text-xs">
                          ${history.map(h => `
                            <tr class="hover:bg-gray-50">
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
                  disp.innerHTML = '<div class="text-center text-xs text-gray-500 py-4 bg-gray-50 rounded-md">Không có lịch sử cộng điểm nào trong học kì này.</div>';
              }
          } catch(err) {
              disp.innerHTML = `<div class="text-center text-xs text-red-500 py-4">Lỗi: ${err.message || err}</div>`;
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

      
      let studentEkycApproved = false;
      try {
          const ekycRes = await fetch(`${API_BASE}/api/ekyc/status`, { headers: { 'X-User': mssv } });
          if (ekycRes.ok) {
              const ekycData = await ekycRes.json();
              if (ekycData.status === 'Approved') studentEkycApproved = true;
          }
      } catch(e) {}
      
      document.getElementById("modal-body").innerHTML = `
        <form id="sv-form" class="space-y-6">
          <div class="flex items-start gap-6">
            <div class="flex flex-col items-center gap-3">
              <img id="sv-avatar-img" class="w-24 h-24 rounded-full object-cover ${window.isEkycApproved ? 'border-4 border-green-500' : 'border'}" src="${sv.AnhDD ? `data:image/jpeg;base64,${sv.AnhDD}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(sv.TenSV || sv.MSSV || mssv)}&background=0D8ABC&color=fff`}" alt="Avatar">
              ${window.isEkycApproved ? `
                <span class="text-xs font-medium text-green-600 mt-2 text-center px-2"><i class="bi bi-shield-lock"></i> Ảnh đại diện đã được khóa bởi eKYC</span>
              ` : `
                <label class="text-xs font-medium mt-1">Đổi ảnh đại diện</label>
                <input id="sv-avatar" type="file" accept="image/*" class="text-xs" />
              `}
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

  // ====== AUTO-RESTORE LOGIN STATE FIRST (trước preloadData) ======
  console.log('🔍 [INIT] Checking auto-restore login state...');
  const savedUser = localStorage.getItem("loggedUser");
  const savedInfo = localStorage.getItem("loggedUserInfo");
  const savedTenTK = localStorage.getItem("savedTenTK");
  const savedMatKhau = localStorage.getItem("savedMatKhau");
  
  // Detect F5 using Performance API
  let isF5Reload = false;
  if (performance.getEntriesByType && performance.getEntriesByType("navigation").length > 0) {
    const navTiming = performance.getEntriesByType("navigation")[0];
    isF5Reload = navTiming.type === "reload";
  }
  
  // Confirm F5: if reload AND all credentials exist
  isF5Reload = isF5Reload && savedUser && savedInfo && savedTenTK && savedMatKhau;
  
  if (isF5Reload) {
    console.log('🔄 [INIT] F5 reload detected');
    // Clear most session state to force fresh login but PRESERVE registration/QR cache
    // (Important: users expect their "đã đăng ký" state to survive a refresh)
    let _preserve_sv_reg_set = null;
    let _preserve_sv_reg_detail = null;
    let _preserve_qr_maHD = null;
    let _preserve_qr_tenHD = null;
    let _preserve_loggedUser = null;
    let _preserve_loggedUserInfo = null;
    try {
      _preserve_sv_reg_set = sessionStorage.getItem('sv_reg_set');
      _preserve_sv_reg_detail = sessionStorage.getItem('sv_reg_detail');
      _preserve_qr_maHD = sessionStorage.getItem('qr_maHD');
      _preserve_qr_tenHD = sessionStorage.getItem('qr_tenHD');
      _preserve_loggedUser = sessionStorage.getItem('loggedUser');
      _preserve_loggedUserInfo = sessionStorage.getItem('loggedUserInfo');
    } catch {}
    // Clear sessionStorage but we'll restore the preserved keys below
    try { sessionStorage.clear(); } catch {}
    try {
      if (_preserve_sv_reg_set) sessionStorage.setItem('sv_reg_set', _preserve_sv_reg_set);
      if (_preserve_sv_reg_detail) sessionStorage.setItem('sv_reg_detail', _preserve_sv_reg_detail);
      if (_preserve_qr_maHD) sessionStorage.setItem('qr_maHD', _preserve_qr_maHD);
      if (_preserve_qr_tenHD) sessionStorage.setItem('qr_tenHD', _preserve_qr_tenHD);
      if (_preserve_loggedUser) {
        sessionStorage.setItem('loggedUser', _preserve_loggedUser);
        localStorage.setItem('loggedUser', _preserve_loggedUser); // ✅ Also restore to localStorage
      }
      if (_preserve_loggedUserInfo) {
        sessionStorage.setItem('loggedUserInfo', _preserve_loggedUserInfo);
        localStorage.setItem('loggedUserInfo', _preserve_loggedUserInfo); // ✅ Also restore to localStorage
      }
    } catch {}
    // DO NOT remove login data from localStorage - it's used for F5 auto-restore!
    localStorage.removeItem("preload");
    localStorage.removeItem("studentData");
    localStorage.removeItem("userAvatarFor");
    localStorage.removeItem("currentMSSV");
    
    // Set F5 auto-login flags
    localStorage.setItem("F5_AUTO_LOGIN_PENDING", "true");
    localStorage.setItem("F5_AUTO_LOGIN_TenTK", savedTenTK);
    localStorage.setItem("F5_AUTO_LOGIN_MatKhau", savedMatKhau);
    
    // Show login form and trigger auto-login
    renderLoggedOutUI();
    return; // Skip rest of init
  }
  
  if (savedUser && savedInfo) {
    // RESTORE sessionStorage từ localStorage (normal case, not F5)
    try {
      sessionStorage.setItem("loggedUser", savedUser);
      sessionStorage.setItem("loggedUserInfo", savedInfo);
      console.log('✅ [INIT] Restored login to sessionStorage from localStorage');
    } catch (e) {
      console.error('❌ [INIT] Failed to restore sessionStorage:', e);
    }
  }

  // ====== Khởi động: Fetch dữ liệu từ server và render ======
  console.warn('🔥 [INIT-BEFORE-FETCH] About to start initialization! 🔥🔥🔥');
  // Xóa cache sessionStorage cũ để buộc fetch fresh data từ server
  console.warn('🔥 [INIT-STEP-1] About to remove preload from sessionStorage');
  sessionStorage.removeItem("preload");
  // DON'T clear registration cache - user wants to stay registered after F5!
  // Only clear on logout (see logout handlers at lines 290, 307, 602)
  
  try {
    console.warn('🔥 [INIT-STEP-3] Fetching preload data from API...');
    
    // Get MSSV from logged-in user info
    const userInfoStr = sessionStorage.getItem('loggedUserInfo');
    let mssv = '';
    if (userInfoStr) {
      try {
        const userInfo = JSON.parse(userInfoStr);
        mssv = userInfo.MaCaNhan || userInfo.MSSV || userInfo.MaSV || userInfo.TenTK || '';
      } catch (e) {
        console.warn('🔥 [INIT-STEP-3a] Could not parse userInfo:', e.message);
      }
    }
    
    // ✅ Fetch API preload with MSSV filter
    const preloadUrl = mssv 
      ? `/api/preload?t=${Date.now()}&mssv=${encodeURIComponent(mssv)}`
      : `/api/preload?t=${Date.now()}`;
    const res = await fetch(preloadUrl);
    if (!res.ok) throw new Error('API returned ' + res.status);
    
    const data = await res.json();
    
    // Set global cache
    window.dbCache = window.dbCache || {};
    window.dbCache.KHOA = data.khoa || [];
    window.dbCache.Lop = data.lop || [];
    window.dbCache.HoatDongTruong = data.hoatDongTruong || [];
    window.allActivities = window.dbCache.HoatDongTruong;
    
    // ✅ STEP 1: Hydrate registration state from API (like QR was scanned successfully)
    console.warn('🔥 [INIT-STEP-5] Hydrating registration state from API...');
    try {
      const list = Array.isArray(data.studentRegistrations) ? data.studentRegistrations : [];
      if (list.length > 0) {
        window._svRegSet = new Set();
        window._svRegDetail = {};
        list.forEach(it => {
          const ma = String(it.MaHD||''); if (!ma) return;
          window._svRegSet.add(ma);
          window._svRegDetail[ma] = {
            Registered: true,
            RegisteredAt: it.RegisteredAt,
            TenHD: it.TenHD || '',
            Status: it.Status || 'PENDING',
            Eligible: (typeof it.IsEligibleForEvidence === 'boolean') ? it.IsEligibleForEvidence : true,
            EvidenceVerdict: it.EvidenceVerdict || it.evidenceVerdict || ''
          };
        });
        try { saveRegState(); } catch {}
      }
    } catch (e) {
      console.warn('[INIT] Could not hydrate registration state:', e.message);
    }
    
    // ✅ STEP 2: Render activities cards with updated registration status
    if (typeof renderActivities === 'function') {
      await renderActivities(window.dbCache.HoatDongTruong);
    } else {
      console.error('🔥 [INIT] renderActivities is NOT a function! Type:', typeof renderActivities);
    }
    
  } catch (err) {
    console.error('🔥 [INIT] Error:', err.message);
    activitiesContainer.innerHTML = "";
    noActivity.classList.remove("hidden");
  }

  // ====== Giữ trạng thái login như cũ (kiểm tra lần nữa sau preloadData) ======
  const currentUser = sessionStorage.getItem("loggedUser") || localStorage.getItem("loggedUser");
  if (currentUser) {
    console.log('✅ Found saved user:', currentUser);
    // Đồng bộ sessionStorage với localStorage (cho trường hợp trang được reload)
    try {
      const userInfo = sessionStorage.getItem("loggedUserInfo") || localStorage.getItem("loggedUserInfo");
      if (userInfo) {
        sessionStorage.setItem("loggedUser", currentUser);
        sessionStorage.setItem("loggedUserInfo", userInfo);
        console.log('✅ Restored sessionStorage from localStorage');
      }
    } catch {}
    
    // Kiểm tra xem người dùng có phải là admin hoặc giảng viên không
    const userInfo = sessionStorage.getItem("loggedUserInfo") || localStorage.getItem("loggedUserInfo");
    if (userInfo) {
      try {
        const info = JSON.parse(userInfo);
        const maQT = info.MaQT || "";
        console.log('🔍 User role (maQT):', maQT);
        
        if (maQT === "AD01") {
          // Nếu là admin, chuyển đến giao diện admin
          console.log('↪️ Redirecting to admin.html');
          window.location.href = "admin.html";
          return;
        } else if (maQT === "GV01") {
          // Nếu là giảng viên, chuyển đến giao diện giảng viên
          window.location.href = "giangvien.html";
          return;
        } else if (maQT === "TR01") {
          // Nếu là cấp trường, chuyển đến giao diện trường
          window.location.href = "truong.html";
          return;
        }
      } catch (error) {
        console.error("Error parsing user info:", error);
      }
    }
    
    // Nếu là sinh viên hoặc không xác định được vai trò, hiển thị giao diện sinh viên
    renderLoggedInUI(currentUser);
  } else {
    console.log('❌ [AFTER-PRELOAD] No saved user - showing logged out UI');
    renderLoggedOutUI();
  }

  // ====== Training Evaluation (Đánh giá rèn luyện) ======
  // Dynamic loader for shared eval module (student side)
  function loadEvalSharedCandidate(src){
    return new Promise(res=>{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=()=>res(true); s.onerror=()=>res(false); document.head.appendChild(s); });
  }
  async function ensureEvalShared(){
    if (typeof window.openTrainingEvaluationShared==='function' && typeof window.initEvalShared==='function') return true;
    const candidates = ['js/eval_shared.js','./js/eval_shared.js','/js/eval_shared.js'];
    for (const c of candidates){ const ok = await loadEvalSharedCandidate(c); if (ok && typeof window.openTrainingEvaluationShared==='function') return true; }
    return false;
  }

  // Wrapper: open phieu-list-modal menu instead of eval-modal directly
  async function openTrainingEvaluation() {
    console.log('[DEBUG] openTrainingEvaluation called');
    // ✅ Close any other modals first to prevent overlaps
    document.getElementById('modal')?.classList.add('hidden');
    document.getElementById('qr-modal')?.classList.add('hidden');
    document.getElementById('wizard-modal')?.classList.add('hidden');
    document.getElementById('attendance-wizard-modal')?.classList.add('hidden');
    document.getElementById('evidence-modal')?.classList.add('hidden');
    document.getElementById('evidence-preview-modal')?.classList.add('hidden');
    document.getElementById('eval-modal')?.classList.add('hidden');
    document.getElementById('sv-attach-evidence-modal')?.classList.add('hidden');
    
    // ✅ Open phieu-list-modal (menu to choose year/semester and create/select phieu)
    const phieuListModal = document.getElementById('phieu-list-modal');
    if (phieuListModal) {
      phieuListModal.classList.remove('hidden');
      console.log('[DEBUG] Opened phieu-list-modal');
    }
  }

  // Legacy local implementation retained as fallback
  async function openTrainingEvaluationLocal() {
    const modal = document.getElementById("eval-modal");
    const tbody = document.getElementById("eval-table-body");
    const emptyEl = document.getElementById("eval-empty");
    const totalEl = document.getElementById("eval-total");
    if (!modal || !tbody) return;

    // Gate by school settings (EvalStartDate .. SemesterEndDate)
    const gate = await canOpenEvaluationNow();
    if (!gate.ok) {
      // Use generic modal to show message and offer viewing approved forms
      const gModal = document.getElementById('modal');
      if (gModal) {
        document.getElementById('modal-title').textContent = 'Đánh giá rèn luyện';
        document.getElementById('modal-body').innerHTML = `
          <div class="p-4">
            <div class="mb-3 p-3 rounded bg-yellow-50 text-yellow-800">${gate.reason}</div>
            <div class="text-sm text-gray-600 mb-4">Bạn vẫn có thể xem lại các phiếu đã được Trường duyệt bất cứ lúc nào.</div>
            <div class="flex gap-2 justify-end">
              <button id="btn-view-approved" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Xem phiếu đã duyệt</button>
            </div>
          </div>`;
        gModal.classList.remove('hidden');
        document.getElementById('btn-view-approved')?.addEventListener('click', async () => {
          await openApprovedFormsDialog();
        });
      } else {
        alert(gate.reason);
      }
      return;
    }

    // Reset
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="py-6 text-center text-gray-600">
            <div class="loading-spinner mx-auto mb-3"></div>
            <p>Đang tải tiêu chí đánh giá...</p>
          </div>
        </td>
      </tr>`;
    totalEl.textContent = "0";
    emptyEl?.classList.add("hidden");
    modal.classList.remove("hidden");

    try {
      // Lấy dữ liệu nhóm + tiêu chí con theo schema mới
      const res = await fetch(`${API_BASE}/api/tieuchi`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Helper đọc thuộc tính hỗ trợ cả PascalCase/camelCase
      const get = (obj, keys) => {
        for (const k of keys) {
          if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
        }
        return undefined;
      };

      if (!data || data.length === 0) {
        tbody.innerHTML = "";
        emptyEl?.classList.remove("hidden");
        return;
      }

      // Render nhóm + tiêu chí con với đánh số phân cấp (1, 1.1, 1.2, ...)
      let html = "";
      data.forEach((group, gIdx) => {
        const groupIndex = gIdx + 1;
        const gMax = Number(get(group, ["DiemToiDa", "diemToiDa"]) ?? 0);
        const gCode = (get(group, ["MaSo", "maSo"]) || groupIndex).toString();
        const gName = get(group, ["TenNhom", "tenNhom"]) || `Nhóm ${groupIndex}`;

        // Hàng tiêu đề nhóm
        html += `
          <tr class="bg-slate-50">
            <td class="text-sm font-semibold text-gray-700">${groupIndex}</td>
            <td class="text-sm font-mono text-gray-800">${escapeHtml(gCode)}</td>
            <td class="text-sm font-semibold text-gray-900">${escapeHtml(gName)}</td>
            <td class="text-sm font-bold text-blue-700">${gMax}</td>
            <td>
              <span class="text-xs text-gray-500">Tổng nhóm: <b id="group-total-${groupIndex}">0</b></span>
            </td>
          </tr>`;

        // ✅ Kiểm tra TieuChi (từ API)
        const items = Array.isArray(group.TieuChi) ? group.TieuChi : (Array.isArray(group.tieuChi) ? group.tieuChi : []);
        if (!items || items.length === 0) {
          html += `
            <tr>
              <td></td>
              <td></td>
              <td class="text-sm text-gray-500 italic">(Nhóm chưa có tiêu chí con)</td>
              <td></td>
              <td></td>
            </tr>`;
        }
        items.forEach((item, iIdx) => {
          const childIndex = `${groupIndex}.${iIdx + 1}`;
          const iCode = (get(item, ["MaSo", "maSo"]) || childIndex).toString();
          const iName = get(item, ["TenTC", "tenTC"]) || `Tiêu chí ${childIndex}`;
          const iMax = Number(get(item, ["DiemToiDa", "diemToiDa"]) ?? 0);
          const needProof = !!get(item, ["CoMinhChung", "coMinhChung"]);
          const allowSelf = get(item, ["AllowSelfEval", "allowSelfEval"]);
          const maTC = get(item, ["MaTC", "maTC"]);

          html += `
            <tr>
              <!-- Ẩn STT cho tiêu chí con theo yêu cầu -->
              <td class="text-sm text-gray-700"></td>
              <td class="text-sm font-mono text-gray-800">${escapeHtml(iCode)}</td>
              <td class="text-sm text-gray-900">
                ${escapeHtml(iName)}
                ${needProof ? '<span class="ml-2 px-2 py-0.5 text-[10px] rounded-full border" data-ev-left-chip="1">Cần minh chứng</span>' : ''}
                ${allowSelf === false ? '<span class="ml-2 px-2 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-800 border border-slate-300">Tự động</span>' : ''}
                <div class="mt-1 overflow-x-auto whitespace-nowrap flex gap-2 pb-1" data-ev-inline="${maTC ?? ''}"></div>
              </td>
              <td class="text-sm font-semibold text-blue-700">${iMax}</td>
              <td>
                <div class="flex items-center gap-2">
                  ${allowSelf === false ? `<span class="text-xs text-gray-500">(tự tính)</span><span class="ml-2 text-sm font-semibold text-slate-700" data-auto-holder="1" data-matc="${maTC ?? ''}" data-group-index="${groupIndex}" data-group-max="${gMax}" data-max="${iMax}" data-code="${escapeHtml(iCode)}" data-name="${escapeHtml(iName)}"></span>` : `<input type="number" min="0" max="${iMax}" step="1" value="0" class="form-input w-24 eval-input" data-max="${iMax}" data-group-index="${groupIndex}" data-group-max="${gMax}" data-matc="${maTC ?? ''}" />`}
                  ${needProof ? `<button type="button" class="px-2 py-1 text-xs rounded-md border bg-white hover:bg-gray-50 btn-upload-proof" data-matc="${maTC ?? ''}" data-maso="${escapeHtml(iCode)}" data-ten="${escapeHtml(iName)}">Đính kèm</button>` : ''}
                </div>
              </td>
            </tr>`;
        });
      });

      tbody.innerHTML = html;

      // Wire inputs: giới hạn theo max, cập nhật tổng chung và tổng theo nhóm
      tbody.querySelectorAll(".eval-input").forEach(inp => {
        inp.addEventListener("input", () => {
          const max = Number(inp.getAttribute("data-max"));
          let val = Number(inp.value || 0);
          if (val < 0) val = 0;
          if (val > max) val = max;
          inp.value = String(val);
          recalcTotal();
          recalcGroupTotal(inp.getAttribute("data-group-index"));
        });
      });

      // Wire evidence buttons
      tbody.querySelectorAll(".btn-upload-proof").forEach(btn => {
        btn.addEventListener("click", () => {
          const maTC = btn.getAttribute("data-matc");
          const maSo = btn.getAttribute("data-maso") || "";
          const ten = btn.getAttribute("data-ten") || "";
          openUploadProofDialog(maTC, maSo, ten);
        });
      });

  // Auto-fill points for non-self-eval criteria based on GPA and violations; fallback to server preview if needed
      try {
        const getCase = (obj, names) => { if (!obj) return undefined; const lower = Object.keys(obj).reduce((m,k)=>{m[k.toLowerCase()]=k;return m;},{}); for(const n of names){ const k = lower[n.toLowerCase()] || n; if (obj[k] !== undefined && obj[k] !== null) return obj[k]; } return undefined; };
        const removeDiacritics = (s)=> (s||'').normalize('NFD').replace(/\p{Diacritic}+/gu,'').replace(/đ/gi,'d');
        const norm = (s)=> removeDiacritics(String(s||'').toLowerCase());
        const { namHoc, hocKi } = getEvalTermValues();
        let termY = namHoc; let termK = hocKi;
        const mssv = getCurrentMSSV();
        let grade = null;
        if (mssv) {
          let gres = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssv)}/diem?namHoc=${encodeURIComponent(termY)}&hocKi=${encodeURIComponent(termK)}`);
          let rows = gres.ok ? (await gres.json()) : [];
          grade = Array.isArray(rows) && rows.length ? rows[0] : null;
          // Fallback: if exact term not found, use latest LUUTRUDIEMSV row and sync term inputs
          if (!grade) {
            gres = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssv)}/diem`);
            rows = gres.ok ? (await gres.json()) : [];
            if (Array.isArray(rows) && rows.length) {
              grade = rows[0];
              const y = grade?.NamHoc ?? grade?.namHoc; const k = grade?.HocKi ?? grade?.hocKi;
              if (y != null && k != null) {
                termY = String(y);
                termK = Number(k);
                const yEl = document.getElementById('eval-namhoc');
                const kEl = document.getElementById('eval-hocki');
                if (yEl) yEl.value = termY;
                if (kEl) kEl.value = String(termK);
              }
            }
          }
        }
        const missingInfo = !grade;
        // Show/hide missing-info banner based on LUUTRUDIEMSV availability
        try {
          const summary = document.getElementById('eval-summary');
          const existingBanner = document.getElementById('eval-missing-info');
          if (missingInfo) {
            if (!existingBanner && summary) {
              summary.insertAdjacentHTML('afterend', `
                <div id="eval-missing-info" class="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded">
                  <div class="flex items-start gap-2 text-yellow-800">
                    <svg class="w-5 h-5 mt-0.5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z"></path>
                    </svg>
                    <div>
                      <div class="font-medium">Thiếu thông tin học tập để chấm tự động</div>
                      <div class="text-sm">Không tìm thấy dữ liệu LUUTRUDIEMSV cho kỳ này. Hãy liên hệ giảng viên để được cập nhật.</div>
                    </div>
                  </div>
                </div>`);
            }
          } else {
            existingBanner?.remove();
          }
        } catch {}
  // Use only DiemTBM_4 (hệ số 4) from LUUTRUDIEMSV to compare and classify
  const gpa = Number(getCase(grade, ['DiemTBM_4']) || 0);
        // previous term for improvement
        const parsePrev = (nh, hk)=>{
          const s = String(nh||'');
          const m = s.match(/(\d{4})-(\d{4})/);
          if (m) {
            const y1 = +m[1], y2 = +m[2];
            // 3 semesters per academic year: 1,2,3. Previous term logic:
            // prev(3) = (same year, 2), prev(2) = (same year, 1), prev(1) = (previous year, 3)
            const h = (+hk||0);
            if (h > 1) return { namHoc: `${y1}-${y2}`, hocKi: h - 1 };
            return { namHoc: `${y1-1}-${y2-1}`, hocKi: 3 };
          }
          // single-year format (e.g., "2025")
          const y = /^\d{4}$/.test(s) ? +s : new Date().getFullYear();
          const h = (+hk||0);
          if (h > 1) return { namHoc: String(y), hocKi: h - 1 };
          return { namHoc: String(y-1), hocKi: 3 };
        };
        let prevGPA = 0; let hasPrev = false;
        if (mssv) {
          const prev = parsePrev(termY, termK);
          const gres2 = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssv)}/diem?namHoc=${encodeURIComponent(prev.namHoc)}&hocKi=${encodeURIComponent(prev.hocKi)}`);
          const rows2 = gres2.ok ? (await gres2.json()) : [];
          const gradePrev = Array.isArray(rows2) && rows2.length ? rows2[0] : null;
          prevGPA = Number(getCase(gradePrev, ['DiemTBM_4']) || 0);
          hasPrev = !!gradePrev && prevGPA > 0;
        }
        const deltaGPA = gpa - prevGPA;
        let level = '';
        if (gpa >= 3.6) level = 'xuat sac';
        else if (gpa >= 3.2) level = 'gioi';
        else if (gpa >= 2.5) level = 'kha';
        else if (gpa >= 2.0) level = 'trung binh';
        else if (gpa > 0) level = 'yeu';
  const cntNT = Number(getCase(grade, ['viphamNT','ViPhamNT','ViPhamNoiQuy','viPhamNT','vpNT']) || 0) || 0;
  const cntXH = Number(getCase(grade, ['viphamXH','ViPhamXH','viPhamXH','vpXH']) || 0) || 0;

  const holders = Array.from(tbody.querySelectorAll('[data-auto-holder]'));
        // NEW: lấy thông tin SV để cộng điểm cán bộ lớp & NCKH
        let svInfo = null; let isClassOfficer = false; let hasResearch = false;
        if (mssv) {
          try { const svRes = await fetch(`${API_BASE}/api/sinhvien/${encodeURIComponent(mssv)}`); if (svRes.ok) svInfo = await svRes.json(); } catch {}
        }
        if (svInfo) {
          isClassOfficer = svInfo.CBLop === true || svInfo.CBLop === 1 || svInfo.CBLop === '1';
          const svHasNckh = Object.keys(svInfo).some(k => /nckh/i.test(k) && svInfo[k]);
          hasResearch = !!(svHasNckh || getCase(grade, ['TGNCKH']) || grade?.TGNCKH);
        } else {
          hasResearch = !!(getCase(grade, ['TGNCKH']) || grade?.TGNCKH);
        }
        const autoAwards = [];
        // If missing info, set 0 and skip auto compute/fallback
        if (missingInfo) {
          holders.forEach(h => {
            const maTC = Number(h.getAttribute('data-matc')||0);
            const iMax = Number(h.getAttribute('data-max')||0);
            const existing = h.parentElement?.querySelector(`input.eval-input[data-matc="${maTC}"]`);
            if (!existing) {
              const inp = document.createElement('input');
              inp.type = 'hidden'; inp.className = 'eval-input';
              inp.setAttribute('data-matc', String(maTC));
              inp.setAttribute('data-group-index', String(h.getAttribute('data-group-index')||''));
              inp.setAttribute('data-group-max', String(h.getAttribute('data-group-max')||''));
              inp.setAttribute('data-max', String(iMax));
              inp.value = '0';
              h.parentElement?.appendChild(inp);
            } else { existing.value = '0'; }
            h.textContent = '';
          });
        } else {
        holders.forEach(h => {
          const maTC = Number(h.getAttribute('data-matc')||0);
          const code = norm(h.getAttribute('data-code')||'');
          const name = norm(h.getAttribute('data-name')||'');
          const gIdx = h.getAttribute('data-group-index');
          const gMax = Number(h.getAttribute('data-group-max')||0);
          const iMax = Number(h.getAttribute('data-max')||0);
          let val = 0; let label = '';
          // NEW: tiêu chí cán bộ lớp & nghiên cứu khoa học (bao gồm mã 5.1 và 1.3)
          const isOfficerCriterion = /ban\s*can\s*su\s*lop|can.?bo.?lop|cblop|canbolop/.test(name) || /cblop|cbl/.test(code) || /^(5[\.,]?1)$/.test(code);
          const isResearchCriterion = /tham\s*gia\s*nghien\s*cuu|nghien\s*cuu|nckh|nghiencuu/.test(name) || /nckh/.test(code) || /^(1[\.,]?3)$/.test(code);
          const isHocLuc = /hoc luc|hocluc|hoc_tap|hoc-suc|hoc\s*l/.test(name) || /hoc_luc|hoc-luc/.test(code) || /hoc luc/.test(code);
          const isXuatSac = /xuat sac|xuatsac|xuat\s*sac/.test(name) || /xs/.test(code);
          const isGioi = /gioi/.test(name);
          const isKha = /kha/.test(name);
          const isTrungBinh = /trung binh|trungbinh|tb/.test(name);
          const isYeu = /yeu/.test(name);
          const isViPham = /vi pham|vipham/.test(name) || /vp/.test(code);
          const isNT = /nha truong|nhatruong|noi quy|noi quy nha truong|noiquy/.test(name) || /nt/.test(code);
          const isXH = /xa hoi|xahoi|cong dong|phap luat/.test(name) || /xh/.test(code);
          // Accept both "học kỳ" and "học kì" after normalizing (ky/ki)
          const isCaiThien = /tang\s*so\s*voi\s*hoc\s*k[yi]\s*truoc|cai thien|cai\s*thien|improve/.test(name) || /cai_thien|improve/.test(code);
          // Thứ tự ưu tiên: CBL/NCKH -> cải thiện -> học lực -> vi phạm
          if (isOfficerCriterion) {
            if (isClassOfficer) { val = iMax; label = `+${iMax} điểm (cán bộ lớp)`; autoAwards.push(label); }
          } else if (isResearchCriterion) {
            if (hasResearch) { val = iMax; label = `+${iMax} điểm (NCKH)`; autoAwards.push(label); }
          } else if (isCaiThien) {
            // Require previous GPA data & positive delta
            if (hasPrev && deltaGPA > 0) {
              val = Math.min(iMax, 5);
              label = `+${val} điểm (cải thiện)`;
            } else {
              val = 0; // missing previous or no improvement => hide
            }
          } else if (isHocLuc || isXuatSac || isGioi || isKha || isTrungBinh || isYeu) {
            if (level) {
              const match = (lvl)=>{
                if (lvl==='xuat sac') return isXuatSac || /xuat sac|xuatsac/.test(name);
                if (lvl==='gioi') return isGioi || /gioi/.test(name);
                if (lvl==='kha') return isKha || /kha/.test(name);
                if (lvl==='trung binh') return isTrungBinh || /trung binh|trungbinh/.test(name);
                if (lvl==='yeu') return isYeu || /yeu/.test(name);
                return false;
              };
              if (match(level)) { val = iMax; label = `+${iMax} điểm (${level})`; }
            }
          } else if (isNT) {
            const deduction = 5 * Math.max(0, cntNT);
            val = Math.max(0, iMax - deduction);
            label = cntNT > 0 ? `-${deduction} điểm (vi phạm${cntNT>1?` x${cntNT}`:''})` : `+${iMax} điểm`;
          } else if (isXH) {
            const deduction = 5 * Math.max(0, cntXH);
            val = Math.max(0, iMax - deduction);
            label = cntXH > 0 ? `-${deduction} điểm (vi phạm${cntXH>1?` x${cntXH}`:''})` : `+${iMax} điểm`;
          } else if (isViPham) {
            const total = Math.max(0, cntNT) + Math.max(0, cntXH);
            const deduction = 5 * total;
            val = Math.max(0, iMax - deduction);
            label = total > 0 ? `-${deduction} điểm (vi phạm${total>1?` x${total}`:''})` : `+${iMax} điểm`;
          }

          const existing = h.parentElement?.querySelector(`input.eval-input[data-matc="${maTC}"]`);
          if (!existing) {
            const inp = document.createElement('input');
            inp.type = 'hidden';
            inp.className = 'eval-input';
            inp.setAttribute('data-matc', String(maTC||''));
            inp.setAttribute('data-group-index', String(gIdx||''));
            inp.setAttribute('data-group-max', String(gMax||''));
            inp.setAttribute('data-max', String(iMax||''));
            inp.value = String(val||0);
            h.parentElement?.appendChild(inp);
          } else {
            existing.value = String(val||0);
          }
          if (label) {
            h.textContent = label;
          } else {
            // Với tiêu chí 'cải thiện': nếu không cải thiện (val=0) thì không hiển thị gì
            const hideZero = isCaiThien && (!val || Number(val) === 0);
            h.textContent = hideZero ? '' : String(val||0);
          }
        });

        // Thêm cảnh báo nhỏ tổng hợp các điểm cộng tự động đặc biệt
        try {
          if (autoAwards.length) {
            const summary = document.getElementById('eval-summary');
            if (summary) {
              const existing = document.getElementById('eval-auto-extra');
              const msg = autoAwards.join(', ');
              if (existing) {
                const span = existing.querySelector('span[data-msg]');
                if (span) span.textContent = msg;
              } else {
                summary.insertAdjacentHTML('afterend', `
                  <div id="eval-auto-extra" class="mt-2 bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
                    <div class="flex items-start gap-2 text-blue-700">
                      <svg class="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z"/></svg>
                      <div>
                        <div class="font-medium">Điểm cộng tự động</div>
                        <span data-msg class="text-sm">${msg}</span>
                      </div>
                    </div>
                  </div>`);
              }
            }
          } else {
            document.getElementById('eval-auto-extra')?.remove();
          }
        } catch {}

        // If nothing was set (grade missing) or all labels empty, fetch server preview as fallback
        const anySet = holders.some(h => (h.textContent||'').trim().length > 0);
        if (!anySet) {
          const resPrev = await fetch(`${API_BASE}/api/phieu-danh-gia/auto-preview?mssv=${encodeURIComponent(mssv)}&namHoc=${encodeURIComponent(termY)}&hocKi=${encodeURIComponent(termK)}`);
          if (resPrev.ok) {
            const rows = await resPrev.json();
            const map = new Map(rows.map(r => [Number(r.MaTC||r.maTC), Number(r.Diem||r.diem||0)]));
            holders.forEach(h => {
              const maTC = Number(h.getAttribute('data-matc')||0);
              if (!maTC) return;
              const iMax = Number(h.getAttribute('data-max')||0);
              let v = map.get(maTC); if (v == null) v = 0;
              v = Math.max(-iMax, Math.min(iMax, v));
              const existing = h.parentElement?.querySelector(`input.eval-input[data-matc="${maTC}"]`);
              if (!existing) {
                const inp = document.createElement('input');
                inp.type = 'hidden'; inp.className = 'eval-input';
                inp.setAttribute('data-matc', String(maTC));
                inp.setAttribute('data-group-index', String(h.getAttribute('data-group-index')||''));
                inp.setAttribute('data-group-max', String(h.getAttribute('data-group-max')||''));
                inp.setAttribute('data-max', String(iMax));
                inp.value = String(v||0);
                h.parentElement?.appendChild(inp);
              } else { existing.value = String(v||0); }
              // Với tiêu chí 'cải thiện': nếu 0 thì không hiển thị gì để tránh '0'
              const nm = norm(h.getAttribute('data-name')||'');
              const cd = norm(h.getAttribute('data-code')||'');
              const isImp = /(tang\s*so\s*voi\s*hoc\s*k[yi]\s*truoc|cai\s*thien|improve)/.test(nm) || /(cai_thien|improve)/.test(cd);
              if (isImp && (!hasPrev || deltaGPA <= 0)) {
                const existing2 = h.parentElement?.querySelector(`input.eval-input[data-matc="${maTC}"]`);
                if (existing2) existing2.value = '0';
                h.textContent = '';
              } else {
                h.textContent = (isImp && (!v || Number(v)===0)) ? '' : String(v||0);
              }
            });
          }
        }

        // Ensure only ONE academic-level row gets full points
        try {
          const aca = holders.map(h => ({
            el: h,
            name: norm(h.getAttribute('data-name')||''),
            code: norm(h.getAttribute('data-code')||''),
            max: Number(h.getAttribute('data-max')||0),
            matc: Number(h.getAttribute('data-matc')||0)
          })).filter(x => {
            const levelish = /ket qua hoc tap|hoc luc|hoc tap/.test(x.name) || /(xuat sac|gioi|kha|trung binh|yeu)/.test(x.name);
            const isImproveLike = /(tang\s*so\s*voi\s*hoc\s*k[yi]\s*truoc|cai\s*thien|improve)/.test(x.name) || /(cai_thien|improve)/.test(x.code);
            return levelish && !isImproveLike;
          });
          if (aca.length) {
            let target = '';
            if (level) target = level; else {
              const valued = aca.map(x=>{
                const existing = x.el.parentElement?.querySelector(`input.eval-input[data-matc="${x.matc}"]`);
                return { x, v: existing? Number(existing.value||0): 0 };
              }).sort((a,b)=> b.v - a.v);
              if (valued[0] && valued[0].v > 0) {
                const n = valued[0].x.name;
                if (/xuat sac/.test(n)) target = 'xuat sac';
                else if (/gioi/.test(n)) target = 'gioi';
                else if (/kha/.test(n)) target = 'kha';
                else if (/trung binh/.test(n)) target = 'trung binh';
                else if (/yeu/.test(n)) target = 'yeu';
              }
            }
            if (target) {
              aca.forEach(({el, name, max, matc})=>{
                const isTarget = (target==='xuat sac' && /xuat sac/.test(name)) || (target==='gioi' && /gioi/.test(name)) || (target==='kha' && /kha/.test(name)) || (target==='trung binh' && /trung binh/.test(name)) || (target==='yeu' && /yeu/.test(name));
                const existing = el.parentElement?.querySelector(`input.eval-input[data-matc="${matc}"]`);
                const v = isTarget ? max : 0;
                if (existing) existing.value = String(v); else {
                  const inp = document.createElement('input'); inp.type='hidden'; inp.className='eval-input'; inp.setAttribute('data-matc', String(matc)); inp.setAttribute('data-group-index', String(el.getAttribute('data-group-index')||'')); inp.setAttribute('data-group-max', String(el.getAttribute('data-group-max')||'')); inp.setAttribute('data-max', String(max)); inp.value = String(v); el.parentElement?.appendChild(inp);
                }
                el.textContent = v>0 ? `+${v} điểm (tự động)` : '';
              });
            }
          }
        } catch {}
        } // end else not missingInfo
      } catch (e) { console.warn('auto-eval inject failed (non-fatal):', e); }

      // Tính tổng ban đầu
      recalcTotal();
      // Tính tổng theo nhóm ban đầu
      const uniqueGroups = [...new Set(Array.from(tbody.querySelectorAll('.eval-input')).map(i => i.getAttribute('data-group-index')))].filter(Boolean);
      uniqueGroups.forEach(g => recalcGroupTotal(g));
    } catch (err) {
      console.error("Load HoatDongTC error", err);
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-6">
            <div class="text-center text-red-600">Không tải được dữ liệu tiêu chí. Vui lòng thử lại!</div>
          </td>
        </tr>`;
    }
  }

  async function canOpenEvaluationNow(){
    try {
      const res = await fetch(`${API_BASE}/api/settings/system`);
      if (!res.ok) return { ok: true };
      const s = await res.json();
      const now = new Date();
      const start = s.EvalStartDate || s.evalStartDate;
      const end = s.SemesterEndDate || s.semesterEndDate;
      const toDate = d => d ? new Date(d) : null;
      const sDate = toDate(start); const eDate = toDate(end);
      const sStart = sDate ? new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate(), 0, 0, 0, 0) : null;
      const eEnd = eDate ? new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate(), 23, 59, 59, 999) : null;
      if (sStart && now < sStart) {
        return { ok: false, reason: `Chưa đến ngày mở đánh giá rèn luyện (mở từ ${sDate.toLocaleDateString('vi-VN')}).` };
      }
      if (eEnd && now > eEnd) {
        return { ok: false, reason: `Đã hết hạn đánh giá rèn luyện (đến ${eDate.toLocaleDateString('vi-VN')}).` };
      }
      return { ok: true };
    } catch { return { ok: true }; }
  }

  async function openApprovedFormsDialog(){
    // If evaluation modal is open, hide it to avoid stacking
    document.getElementById('eval-modal')?.classList.add('hidden');
    // Open modal immediately with loading state
    document.getElementById('modal-title').textContent = 'Phiếu đã được Trường duyệt';
    document.getElementById('modal-body').innerHTML = `
      <div class="text-center py-8 text-gray-600">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-3">Đang tải danh sách phiếu...</p>
      </div>`;
    document.getElementById('modal')?.classList.remove('hidden');

    let mssv = getCurrentMSSV();
    if (!mssv) {
      const input = prompt('Nhập MSSV để xem phiếu đã duyệt:');
      if (!input) { document.getElementById('modal')?.classList.add('hidden'); return; }
      try {
        const info = JSON.parse(localStorage.getItem('loggedUserInfo') || '{}');
        info.MSSV = input;
        localStorage.setItem('loggedUserInfo', JSON.stringify(info));
      } catch {}
      mssv = input;
    }
    try {
      const res = await fetch(`${API_BASE}/api/phieu-danh-gia/mine-approved?mssv=${encodeURIComponent(mssv)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (!rows || rows.length === 0) {
        document.getElementById('modal-body').innerHTML = '<div class="p-4 text-gray-600">Bạn chưa có phiếu nào được Trường duyệt.</div>';
        return;
      }
      const list = rows.map(r => `
        <div class="flex items-center justify-between p-3 border rounded mb-2">
          <div>
            <div class="font-medium">Năm học ${r.NamHoc} - HK ${r.HocKi}</div>
            <div class="text-sm text-gray-600">Tổng điểm: <b>${r.TongDiem ?? ''}</b></div>
          </div>
          <div>
            <button class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700" data-view-approved-id="${r.Id}">Xem chi tiết</button>
          </div>
        </div>`).join('');
      document.getElementById('modal-body').innerHTML = `<div class="p-4">${list}</div>`;
      document.querySelectorAll('[data-view-approved-id]')?.forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-view-approved-id');
        await openApprovedFormDetail(id);
      }));
    } catch (e) { alert('Không tải được danh sách phiếu: '+ (e.message||e)); }
  }

  async function openApprovedFormDetail(id){
    try {
      const res = await fetch(`${API_BASE}/api/phieu-danh-gia/${id}/full`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const gp = (obj, ...keys) => { if (!obj) return undefined; for (const k of keys){ if (obj[k] !== undefined && obj[k] !== null) return obj[k]; } return undefined; };
      const header = data.header || {};
      const itemsHtml = (data.items || []).map(it => `
        <tr>
          <td class="px-2 py-1 text-sm">${gp(it,'MaTC','maTC') ?? ''}</td>
          <td class="px-2 py-1 text-sm">${gp(it,'TenTC','tenTC') || ''}</td>
          <td class="px-2 py-1 text-sm">${gp(it,'TenNhom','tenNhom') || ''}</td>
          <td class="px-2 py-1 text-sm text-gray-600">${gp(it,'DiemToiDaTC','diemToiDaTC') ?? ''}</td>
          <td class="px-2 py-1 text-sm font-semibold">${gp(it,'DiemSV','diemSV') ?? 0}</td>
        </tr>`).join('');
      document.getElementById('modal-title').textContent = `Phiếu ĐGRL: ${gp(header,'MSSV','mssv') || ''} - ${gp(header,'TenSV','tenSV') || ''} (${gp(header,'NamHoc','namHoc') || ''} - HK ${gp(header,'HocKi','hocKi') || ''})`;
      document.getElementById('modal-body').innerHTML = `
        <div class="p-4 space-y-3">
          <div class="flex justify-between text-sm">
            <div>Trạng thái: <span class="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">Trường đã duyệt</span></div>
            <div>Tổng điểm: <b>${gp(header,'TongDiem','tongDiem') ?? ''}</b></div>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50"><tr>
                <th class="px-2 py-1 text-left text-xs text-gray-500">MaTC</th>
                <th class="px-2 py-1 text-left text-xs text-gray-500">Tiêu chí</th>
                <th class="px-2 py-1 text-left text-xs text-gray-500">Nhóm</th>
                <th class="px-2 py-1 text-left text-xs text-gray-500">Max</th>
                <th class="px-2 py-1 text-left text-xs text-gray-500">Điểm SV</th>
              </tr></thead>
              <tbody>${itemsHtml || '<tr><td colspan="5" class="px-2 py-2 text-center text-gray-500">Không có chi tiết</td></tr>'}</tbody>
            </table>
          </div>
        </div>`;
      document.getElementById('modal')?.classList.remove('hidden');
    } catch (e) { alert('Không tải được chi tiết phiếu: ' + (e.message || e)); }
  }

  function recalcTotal() {
    const totalEl = document.getElementById("eval-total");
    // Tính theo nhóm và giới hạn bởi điểm tối đa nhóm
  const inputs = Array.from(document.querySelectorAll("#eval-table-body .eval-input"));
    const groups = [...new Set(inputs.map(i => i.getAttribute('data-group-index')).filter(Boolean))];
    let grand = 0;
    groups.forEach(g => {
      const groupInputs = inputs.filter(i => i.getAttribute('data-group-index') === g);
      const gMax = Number(groupInputs[0]?.getAttribute('data-group-max') || 0);
      const sum = groupInputs.reduce((s, i) => s + Number(i.value || 0), 0);
      const capped = Math.min(sum, isNaN(gMax) ? sum : gMax);
      const floored = Math.max(0, capped);
      grand += floored;
    });
    if (totalEl) totalEl.textContent = String(grand);
  }

  function recalcGroupTotal(groupIndex) {
    if (!groupIndex) return;
    const inputs = Array.from(document.querySelectorAll(`#eval-table-body .eval-input[data-group-index="${groupIndex}"]`));
    let sum = 0;
    inputs.forEach(inp => { sum += Number(inp.value || 0); });
    const gMax = Number(inputs[0]?.getAttribute('data-group-max') || 0);
    const capped = Math.min(sum, isNaN(gMax) ? sum : gMax);
    const floored = Math.max(0, capped);
    const el = document.getElementById(`group-total-${groupIndex}`);
    if (el) el.textContent = String(floored);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ====== Evidence Upload for tiêu chí con ======
  function getCurrentMSSV() {
    try {
      const raw = localStorage.getItem("loggedUserInfo");
      if (!raw) return "";
      const info = JSON.parse(raw);
      const candidate = info?.MaCaNhan || info?.MSSV || info?.MaSV || info?.TenTK;
      return candidate ? String(candidate) : "";
    } catch { return ""; }
  }

  function openUploadProofDialog(maTC, maSo, tenTC) {
    const modal = document.getElementById("evidence-modal");
    if (!modal) return alert("Không tìm thấy form nộp minh chứng.");
    const inpMaTC = document.getElementById("evidence-ma-tc");
    const inpMaSo = document.getElementById("evidence-ma-so");
    const inpTen = document.getElementById("evidence-ten-tc");
    const inpMSSV = document.getElementById("evidence-mssv");
    const inpNote = document.getElementById("evidence-note");
    const inpFile = document.getElementById("evidence-file");
    const status = document.getElementById("evidence-status");

    if (inpMaTC) inpMaTC.value = maTC || "";
    if (inpMaSo) inpMaSo.value = maSo || "";
    if (inpTen) inpTen.textContent = tenTC || "";
    if (inpMSSV) inpMSSV.value = getCurrentMSSV();
    if (inpNote) inpNote.value = "";
    if (inpFile) inpFile.value = "";
    if (status) { status.textContent = ""; status.classList.add("hidden"); }

    modal.classList.remove("hidden");
  }

  const closeEvidenceBtn = document.getElementById("evidence-cancel");
  if (closeEvidenceBtn) {
    closeEvidenceBtn.addEventListener("click", () => {
      const modal = document.getElementById("evidence-modal");
      if (modal) modal.classList.add("hidden");
    });
  }

  const closeEvidenceBtn2 = document.getElementById("evidence-cancel-2");
  if (closeEvidenceBtn2) {
    closeEvidenceBtn2.addEventListener("click", () => {
      const modal = document.getElementById("evidence-modal");
      if (modal) modal.classList.add("hidden");
    });
  }

  const submitEvidenceBtn = document.getElementById("evidence-submit");
  if (submitEvidenceBtn) {
    submitEvidenceBtn.addEventListener("click", async () => {
      const modal = document.getElementById("evidence-modal");
      const inpMaTC = document.getElementById("evidence-ma-tc");
      const inpMSSV = document.getElementById("evidence-mssv");
      const inpNote = document.getElementById("evidence-note");
      const inpFile = document.getElementById("evidence-file");
      const status = document.getElementById("evidence-status");

      const maTC = inpMaTC?.value?.trim();
      const mssv = inpMSSV?.value?.trim() || getCurrentMSSV();
      const note = inpNote?.value?.trim() || "";
      const file = inpFile?.files?.[0];

      if (!maTC) { alert("Thiếu mã tiêu chí (MaTC)."); return; }
      if (!mssv) { alert("Vui lòng nhập MSSV."); return; }
      if (!file) { alert("Vui lòng chọn ảnh minh chứng."); return; }

      try {
        const fd = new FormData();
        fd.append("mssv", mssv);
        fd.append("maTC", maTC);
        fd.append("note", note);
        fd.append("file", file);

        const res = await fetch(`${API_BASE}/api/tieuchi/evidence`, {
          method: "POST",
          body: fd
        });
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try { const j = await res.json(); if (j?.error || j?.message) msg += ` - ${j.error || j.message}`; } catch {}
          throw new Error(msg);
        }
        const data = await res.json();

        // Tự động đính kèm minh chứng vừa upload vào phiếu hiện tại
        try {
          const currentPhieuId = await ensureCurrentFormId();
          if (currentPhieuId && data.id) {
            const attachFd = new FormData();
            attachFd.append('evidenceIds', JSON.stringify([data.id]));
            await fetch(`${API_BASE}/api/phieu-danh-gia/${currentPhieuId}/criteria/${maTC}/attach`, {
              method: 'POST',
              headers: { 'X-User': mssv },
              body: attachFd
            });
            // Cập nhật lại UI sau khi đính kèm
            if (typeof openTrainingEvaluationLocal === 'function') {
              openTrainingEvaluationLocal(currentPhieuId);
            } else if (typeof openPhieuDetail === 'function') {
              openPhieuDetail(currentPhieuId);
            }
          }
        } catch (attachErr) {
          console.error('Lỗi auto-attach:', attachErr);
        }

        if (status) {
          status.classList.remove("hidden");
          status.classList.remove("text-red-600");
          status.classList.add("text-green-600");
          status.textContent = "Đã đính kèm minh chứng vào tiêu chí.";
        }

        // Đóng modal sau 1.2s
        setTimeout(() => { modal?.classList.add("hidden"); }, 1200);
      } catch (e) {
        if (status) {
          status.classList.remove("hidden");
          status.classList.remove("text-green-600");
          status.classList.add("text-red-600");
          status.textContent = `Đính kèm minh chứng thất bại: ${e?.message || e}`;
        }
        console.error(e);
      }
    });
  }

  // Close button for evaluation modal
  const closeEvalBtn = document.getElementById("close-eval-modal");
  if (closeEvalBtn) {
    closeEvalBtn.addEventListener("click", () => {
      const modal = document.getElementById("eval-modal");
      if (modal) modal.classList.add("hidden");
    });
  }

  // Default year/semester and submit handler for evaluation form
  function guessAcademicYear() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    // If Aug (8) or later, academic year y-(y+1), else (y-1)-y
    return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  function getEvalTermValues() {
    const namhocEl = document.getElementById("eval-namhoc");
    const hockiEl = document.getElementById("eval-hocki");
    if (namhocEl && !namhocEl.value) namhocEl.value = guessAcademicYear();
    if (hockiEl && !hockiEl.value) hockiEl.value = "1";
    return {
      namHoc: namhocEl ? namhocEl.value.trim() : guessAcademicYear(),
      hocKi: hockiEl ? Number(hockiEl.value) : 1
    };
  }

  const evalSubmitBtn = document.getElementById("eval-submit-btn");
  if (evalSubmitBtn) {
    evalSubmitBtn.addEventListener("click", async () => {
      const statusEl = document.getElementById("eval-submit-status");
      const { namHoc, hocKi } = getEvalTermValues();
      const mssv = getCurrentMSSV();
      if (!mssv) {
        const input = prompt("Nhập MSSV để gửi phiếu đánh giá:");
        if (!input) return;
        try {
          const info = JSON.parse(localStorage.getItem("loggedUserInfo") || "{}");
          info.MSSV = input;
          localStorage.setItem("loggedUserInfo", JSON.stringify(info));
        } catch {}
      }
      const useMssv = getCurrentMSSV();

  // Build items (only inputs exist for criteria that allow self evaluation)
  const inputs = Array.from(document.querySelectorAll("#eval-table-body .eval-input"));
      const items = inputs.map(inp => ({
        maTC: Number(inp.getAttribute("data-matc") || 0),
        diem: Number(inp.value || 0)
      })).filter(x => x.maTC > 0);

      const tong = items.reduce((s, x) => s + (x.diem || 0), 0);

      try {
        if (statusEl) { statusEl.classList.remove("hidden", "text-red-600"); statusEl.classList.add("text-gray-600"); statusEl.textContent = "Đang gửi phiếu..."; }
        evalSubmitBtn.setAttribute("disabled", "true");

        const res = await fetch(`${API_BASE}/api/phieu-danh-gia`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mssv: useMssv, namHoc, hocKi, tongDiem: tong, items })
        });
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try { const j = await res.json(); if (j?.error || j?.message) msg += ` - ${j.error || j.message}`; } catch {}
          throw new Error(msg);
        }
        const data = await res.json();
        if (statusEl) {
          statusEl.classList.remove("text-gray-600", "text-red-600");
          statusEl.classList.add("text-green-600");
          statusEl.textContent = "Đã gửi phiếu đánh giá thành công.";
        }
        setTimeout(() => {
          if (statusEl) statusEl.classList.add("hidden");
          evalSubmitBtn.removeAttribute("disabled");
        }, 1500);
      } catch (e) {
        console.error(e);
        if (statusEl) {
          statusEl.classList.remove("hidden", "text-gray-600");
          statusEl.classList.add("text-red-600");
          statusEl.textContent = `Gửi phiếu đánh giá thất bại: ${e?.message || e}`;
        }
        evalSubmitBtn.removeAttribute("disabled");
      }
    });
  }

  // Bind: View approved button inside evaluation modal
  const evalViewApprovedBtn = document.getElementById('eval-view-approved');
  if (evalViewApprovedBtn) {
    evalViewApprovedBtn.addEventListener('click', async () => {
      await openApprovedFormsDialog();
    });
  }

  // Delegated handler as fallback in case the button is re-rendered
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t && (t.id === 'eval-view-approved' || (t.closest && t.closest('#eval-view-approved')))) {
      e.preventDefault();
      await openApprovedFormsDialog();
    }
  });


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
      
      // Debug logging để kiểm tra dữ liệu
      console.log("=== RANKING DEBUG ===");
      console.log("Ranking data received:", rankingData);
      console.log("Data type:", typeof rankingData);
      console.log("Is array:", Array.isArray(rankingData));
      console.log("Length:", rankingData ? rankingData.length : "null/undefined");
      
      if (rankingData && rankingData.length > 0) {
        console.log("First student data:", rankingData[0]);
        console.log("Available fields:", Object.keys(rankingData[0]));
        console.log("Khoas field:", rankingData[0].Khoas, "Type:", typeof rankingData[0].Khoas);
        console.log("HocKi field:", rankingData[0].HocKi, "Type:", typeof rankingData[0].HocKi);
        console.log("NamHoc field:", rankingData[0].NamHoc, "Type:", typeof rankingData[0].NamHoc);
        console.log("TenKhoa field:", rankingData[0].TenKhoa, "Type:", typeof rankingData[0].TenKhoa);
        console.log("TenLop field:", rankingData[0].TenLop, "Type:", typeof rankingData[0].TenLop);
        
        // Kiểm tra tất cả giá trị Khoas
        const allKhoas = rankingData.map(s => s.Khoas).filter(k => k != null);
        console.log("All Khoas values:", allKhoas);
        console.log("Unique Khoas:", [...new Set(allKhoas)]);
      }
      console.log("=== END RANKING DEBUG ===");
      
      // Kiểm tra nếu dữ liệu có cấu trúc khác (wrapped trong object)
      let actualData = rankingData;
      if (rankingData.data && Array.isArray(rankingData.data)) {
        actualData = rankingData.data;
        console.log("Data is wrapped in object, using rankingData.data");
      }

      if (!actualData || actualData.length === 0) {
        
      document.getElementById("modal-body").innerHTML = `
          <div class="text-center py-8 text-gray-500">
            <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p class="mt-4 text-lg">Chưa có dữ liệu xếp hạng</p>
            <p class="text-sm text-gray-400">Hệ thống chưa có thông tin xếp hạng sinh viên.</p>
          </div>
        `;
        return;
      }

      // Sort by điểm (descending) - sử dụng trường TongDRL từ API
      const sortedRanking = actualData.sort((a, b) => {
        const pointsA = parseFloat(a.TongDRL || 0);
        const pointsB = parseFloat(b.TongDRL || 0);
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
              <p class="text-sm text-blue-700">Xếp hạng dựa trên điểm rèn luyện - ${sortedRanking.length} sinh viên</p>
            </div>

            <!-- Filter Controls -->
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Khóa</label>
                <select id="filter-khoa-hoc-ranking" class="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">Tất cả khóa</option>
                  <option value="">Đang tải...</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Khoa</label>
                <select id="filter-khoa-ranking" class="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">Tất cả khoa</option>
                  <option value="">Đang tải...</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Lớp</label>
                <select id="filter-lop-ranking" class="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">Tất cả lớp</option>
                  <option value="">Đang tải...</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Học kì</label>
                <select id="filter-hocki-ranking" class="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">Tất cả học kì</option>
                  <option value="1">Học kì 1</option>
                  <option value="2">Học kì 2</option>
                  <option value="3">Học kì 3</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Năm học</label>
                <select id="filter-namhoc-ranking" class="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="">Tất cả năm học</option>
                  <option value="">Đang tải...</option>
                </select>
              </div>
            </div>
            
            <div class="flex justify-center mt-4">
              <button id="btn-apply-ranking-filter" class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">Lọc</button>
            </div>

            <!-- Ranking Table -->
            <div class="table-wrapper overflow-x-auto">
              <table class="ranking-table">
                <thead>
                  <tr>
                    <th>Thứ hạng</th>
                    <th>Sinh viên</th>
                    <th>MSSV</th>
                    <th>Khóa</th>
                    <th>Lớp</th>
                    <th>Khoa</th>
                    <th>Học kì</th>
                    <th>Năm học</th>
                    <th>Điểm</th>
                    <th>Xếp loại</th>
                  </tr>
                </thead>
                <tbody id="ranking-table-body">
        `;

        // Add ranking rows cho trang hiện tại
        currentPageData.forEach((student, index) => {
          const globalRank = startIndex + index + 1;
          const points = parseFloat(student.TongDRL || 0);
          
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
              <td class="text-sm text-gray-900">${student.Khoas || 'N/A'}</td>
              <td class="text-sm text-gray-900">${student.TenLop || student.MaLop || 'N/A'}</td>
              <td class="text-sm text-gray-900">${student.TenKhoa || student.MaKhoa || 'N/A'}</td>
              <td class="text-sm text-gray-900">${student.HocKi || 'N/A'}</td>
              <td class="text-sm text-gray-900">${student.NamHoc || 'N/A'}</td>
              <td>
                <span class="points-display">
                  ${points} điểm
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
                    <p class="text-lg font-bold text-blue-900">${sortedRanking.filter(s => (parseFloat(s.TongDRL || 0)) >= 90).length}</p>
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
                    <p class="text-lg font-bold text-green-900">${(sortedRanking.reduce((sum, s) => sum + (parseFloat(s.TongDRL || 0)), 0) / sortedRanking.length).toFixed(1)}</p>
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
        
        // Load dữ liệu cho các dropdown từ API
        loadFilterData();
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

      // Hàm load dữ liệu cho các dropdown filter
      async function loadFilterData() {
        try {
          console.log("Loading filter data...");
          
          // Load dữ liệu từ API preload (chứa khoa, lớp, khóa học)
          const preloadResponse = await fetch(`${API_BASE}/api/preload`);
          if (preloadResponse.ok) {
            const preloadData = await preloadResponse.json();
            console.log("Preload data:", preloadData);
            
            // Load dữ liệu khóa học
            if (preloadData.khoaHoc && preloadData.khoaHoc.length > 0) {
              const khoasSelect = document.getElementById("filter-khoa-hoc-ranking");
              if (khoasSelect) {
                khoasSelect.innerHTML = '<option value="">Tất cả khóa</option>' + 
                  preloadData.khoaHoc.map(k => `<option value="${k.TenKhoa}">${k.TenKhoa}</option>`).join('');
              }
              console.log("Loaded khoas from preload:", preloadData.khoaHoc.map(k => k.TenKhoa));
            }
            
            // Load dữ liệu khoa
            if (preloadData.khoa && preloadData.khoa.length > 0) {
              const khoaSelect = document.getElementById("filter-khoa-ranking");
              if (khoaSelect) {
                khoaSelect.innerHTML = '<option value="">Tất cả khoa</option>' + 
                  preloadData.khoa.map(k => `<option value="${k.TenKhoa}">${k.TenKhoa}</option>`).join('');
              }
              console.log("Loaded khoa from preload:", preloadData.khoa.map(k => k.TenKhoa));
            }
            
            // Load dữ liệu lớp
            if (preloadData.lop && preloadData.lop.length > 0) {
              const lopSelect = document.getElementById("filter-lop-ranking");
              if (lopSelect) {
                lopSelect.innerHTML = '<option value="">Tất cả lớp</option>' + 
                  preloadData.lop.map(l => `<option value="${l.TenLop}">${l.TenLop}</option>`).join('');
              }
              console.log("Loaded lop from preload:", preloadData.lop.map(l => l.TenLop));
            }
          }
          
          // Load dữ liệu năm học từ API ranking
          const namhocResponse = await fetch(`${API_BASE}/api/luutrudiemsv/ranking`);
          if (namhocResponse.ok) {
            const namhocData = await namhocResponse.json();
            const uniqueNamHoc = [...new Set(namhocData.map(s => s.NamHoc).filter(n => n && n.toString().trim() !== ''))].sort((a, b) => b - a);
            
            const namhocSelect = document.getElementById("filter-namhoc-ranking");
            if (namhocSelect) {
              namhocSelect.innerHTML = '<option value="">Tất cả năm học</option>' + 
                uniqueNamHoc.map(namhoc => `<option value="${namhoc}">${namhoc}</option>`).join('');
            }
            console.log("Loaded namhoc:", uniqueNamHoc);
          }
          
          console.log("Filter data loaded successfully!");
        } catch (error) {
          console.error("Error loading filter data:", error);
        }
      }

      // Hàm thêm event listeners cho filter
      function addFilterEventListeners() {
        const applyFilterBtn = document.getElementById("btn-apply-ranking-filter");
        if (applyFilterBtn) {
          applyFilterBtn.addEventListener("click", () => {
            const selectedKhoaHoc = document.getElementById("filter-khoa-hoc-ranking").value;
            const selectedKhoa = document.getElementById("filter-khoa-ranking").value;
            const selectedLop = document.getElementById("filter-lop-ranking").value;
            const selectedHocKi = document.getElementById("filter-hocki-ranking").value;
            const selectedNamHoc = document.getElementById("filter-namhoc-ranking").value;
            
            let filteredData = [...sortedRanking];
            
            if (selectedKhoaHoc) {
              // Lọc theo khóa học - cần kiểm tra cả Khoas và TenKhoa
              filteredData = filteredData.filter(s => 
                s.Khoas === selectedKhoaHoc || 
                (s.Khoas === null && selectedKhoaHoc === 'N/A')
              );
            }
            
            if (selectedKhoa) {
              filteredData = filteredData.filter(s => s.TenKhoa === selectedKhoa);
            }
            
            if (selectedLop) {
              filteredData = filteredData.filter(s => s.TenLop === selectedLop);
            }
            
            if (selectedHocKi) {
              filteredData = filteredData.filter(s => s.HocKi === parseInt(selectedHocKi));
            }
            
            if (selectedNamHoc) {
              filteredData = filteredData.filter(s => s.NamHoc === parseInt(selectedNamHoc));
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
          <p class="text-sm text-red-400">Không thể tải bảng xếp hạng. Vui lòng thử lại sau.</p>
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
      const points = parseFloat(student.TongDRL || 0);
      
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
          <td class="text-sm text-gray-900">${student.Khoas || 'N/A'}</td>
          <td class="text-sm text-gray-900">${student.TenLop || student.MaLop || 'N/A'}</td>
          <td class="text-sm text-gray-900">${student.TenKhoa || student.MaKhoa || 'N/A'}</td>
          <td class="text-sm text-gray-900">${student.HocKi || 'N/A'}</td>
          <td class="text-sm text-gray-900">${student.NamHoc || 'N/A'}</td>
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

  function resetChunks() {
    recordedChunks = [];
    lastBlob = null;
    // để đoạn check “window.recordedChunks” của bạn không bị undefined
    window.recordedChunks = recordedChunks;
  }

  // 1) Chọn mimeType mà trình duyệt hỗ trợ
  function pickMime() {
    const M = window.MediaRecorder;
    if (!M) return "";
    if (M.isTypeSupported?.("video/webm;codecs=vp8")) return "video/webm;codecs=vp8";
    if (M.isTypeSupported?.("video/webm"))          return "video/webm";
    if (M.isTypeSupported?.("video/mp4;codecs=avc1,mp4a")) return "video/mp4;codecs=avc1,mp4a"; // iOS
    if (M.isTypeSupported?.("video/mp4"))           return "video/mp4";
    return "";
  }

  // 2) Chờ recorder 'stop' (dùng khi cần đợi hoàn tất)
  function waitForStop(rec) {
    return new Promise(res => {
      if (!rec || rec.state === "inactive") return res();
      rec.addEventListener("stop", () => res(), { once: true });
    });
  }

  // 3) Lấy Blob đã quay (tự ghép từ recordedChunks nếu cần)
  function buildBlob(mediaRecorder, recordedChunks) {
    const type =
      mediaRecorder?.mimeType ||
      (recordedChunks[0] && recordedChunks[0].type) ||
      "video/webm";
    return recordedChunks.length ? new Blob(recordedChunks, { type }) : null;
  }

  let mediaRecorder = null, recordedChunks = [], currentStream = null;
  let lastBlob = null;


  // Hàm helper để tắt camera hoàn toàn (hỗ trợ cả 2 hệ thống: cũ & mới)
  function stopCamera() {
    // ✅ SUPPORT CÓ HAI HỆ THỐNG VIDEO:
    // 1. Hệ thống cũ: mediaRecorder, currentStream, video-preview
    // 2. Hệ thống mới (Attendance): _attendanceRecorder, _attendanceStream, video-preview-attendance
    
    // Tắt media recorder cũ nếu còn ghi (check !== null, not typeof)
    if (mediaRecorder !== null && mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch {}
    }
    
    // Tắt media recorder mới (Attendance)
    if (window._attendanceRecorder && window._attendanceRecorder.state !== 'inactive') {
      try { window._attendanceRecorder.stop(); } catch {}
    }
    
    // Tắt stream cũ
    if (currentStream !== null && currentStream) {
      currentStream.getTracks().forEach(track => {
        track.stop();
        console.log('✓ Đã tắt camera track (cũ):', track.kind);
      });
      currentStream = null;
    }
    
    // Tắt stream mới (Attendance)
    if (window._attendanceStream) {
      window._attendanceStream.getTracks().forEach(track => {
        track.stop();
        console.log('✓ Đã tắt camera track (mới):', track.kind);
      });
      window._attendanceStream = null;
    }
    
    // Tắt video preview CỦA - cần tắt playback và xóa source
    const previewOld = document.getElementById("video-preview");
    if (previewOld) {
      previewOld.pause();  // ← Dừng playback
      previewOld.srcObject = null;  // ← Xóa stream
    }
    
    // Tắt video preview MỚI (Attendance)
    const previewNew = document.getElementById("video-preview-attendance");
    if (previewNew) {
      previewNew.pause();
      previewNew.srcObject = null;
    }
    
    // Ẩn overlay cũ nếu có
    const cameraOverlayOld = document.getElementById("camera-overlay");
    if (cameraOverlayOld) cameraOverlayOld.classList.add("opacity-0");
    
    // Ẩn overlay mới (Attendance) nếu có
    const cameraOverlayNew = document.getElementById("camera-overlay-attendance");
    if (cameraOverlayNew) cameraOverlayNew.classList.add("opacity-0");
    
    console.log('✓ Tất cả camera streams đã được tắt hoàn toàn');
  }

// Wizard điều hướng (an toàn nếu phần tử chưa tồn tại)
const _chooseVideoBtn = document.getElementById("choose-video");
if (_chooseVideoBtn) {
  _chooseVideoBtn.addEventListener("click", () => {
    document.getElementById("step-1")?.classList.add("hidden");
    document.getElementById("step-2-video")?.classList.remove("hidden");
    // Attendance mode UI: nếu đã có maHD từ QR → ẩn input tên/mô tả và hiển thị thông tin hoạt động
    try {
      const maHD = localStorage.getItem('qr_maHD') || new URLSearchParams(location.search).get('maHD');
      const nameInput = document.getElementById('activity-name');
      const descInput = document.getElementById('activity-desc');
      let infoBox = document.getElementById('attendance-activity-info');
      if (maHD) {
        // tìm tên hoạt động từ cache tải trước
        let tenHD = localStorage.getItem('qr_tenHD') || '';
        try {
          const acts = (window.dbCache && Array.isArray(window.dbCache.HoatDongTruong)) ? window.dbCache.HoatDongTruong : (JSON.parse(sessionStorage.getItem('preload')||'{}').hoatDongTruong||[]);
          const found = Array.isArray(acts) ? acts.find(a => (a.MaHD||'').toString() === maHD) : null;
          if (found && found.TenHD) tenHD = found.TenHD;
        } catch {}
        if (nameInput) { nameInput.parentElement.classList.add('hidden'); }
        if (descInput) { descInput.parentElement.classList.add('hidden'); }
        if (!infoBox) {
          infoBox = document.createElement('div');
          infoBox.id = 'attendance-activity-info';
          infoBox.className = 'p-3 rounded border bg-slate-50 text-sm';
          const container = document.querySelector('#step-2-video .grid');
          if (container) container.parentElement.insertBefore(infoBox, container);
        }
        infoBox.innerHTML = `<div><span class="font-semibold">Hoạt động đã quét:</span> ${tenHD || '(Chưa rõ tên)'} <span class="ml-2 text-xs text-gray-500">(Mã: ${maHD})</span></div>`;

          // Điều chỉnh nội dung trong modal nộp minh chứng theo yêu cầu: từ "đính kèm minh chứng" → "gửi minh chứng cho giảng viên"
          try {
            const container = document.getElementById('step-2-video') || document.getElementById('evidence-modal') || document;
            const nodes = container.querySelectorAll('*');
            nodes.forEach(node => {
              if (node.childNodes && node.childNodes.length) {
                node.childNodes.forEach(cn => {
                  if (cn.nodeType === Node.TEXT_NODE) {
                    const txt = cn.textContent || '';
                    if (/đính\s*kèm\s*minh\s*chứng/gi.test(txt)) {
                      cn.textContent = txt.replace(/đính\s*kèm\s*minh\s*chứng/gi, 'gửi minh chứng cho giảng viên');
                    }
                  }
                });
              }
            });
            // Cập nhật nhãn/nút phổ biến nếu có id cụ thể
            const sendBtn = document.getElementById('btn-send');
            if (sendBtn && /đính\s*kèm\s*minh\s*chứng/gi.test(sendBtn.textContent||'')) {
              sendBtn.textContent = (sendBtn.textContent||'').replace(/đính\s*kèm\s*minh\s*chứng/gi, 'gửi minh chứng cho giảng viên');
            }
          } catch {}
      } else {
        // không ở attendance mode → hiển thị input như cũ
        if (nameInput) nameInput.parentElement.classList.remove('hidden');
        if (descInput) descInput.parentElement.classList.remove('hidden');
        if (infoBox) infoBox.remove();
      }
    } catch {}
  });
}
const _chooseCertBtn = document.getElementById("choose-cert");
if (_chooseCertBtn) {
  _chooseCertBtn.addEventListener("click", () => {
    document.getElementById("step-1")?.classList.add("hidden");
    document.getElementById("step-2-cert")?.classList.remove("hidden");
  });
}

// Track desired camera facing, default to user (front camera) as required
let desiredFacingMode = 'user';

// Start quay video
const _btnStart = document.getElementById("btn-start");
if (_btnStart) _btnStart.addEventListener("click", async () => {
  try {
    // Tắt camera cũ trước khi bắt đầu camera mới
    stopCamera();
    
    // Hiện overlay khởi động camera
    const cameraOverlay = document.getElementById("camera-overlay");
    if (cameraOverlay) cameraOverlay.classList.remove("opacity-0");

    // Thử mở theo desiredFacingMode trước, fallback sang mode còn lại
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: desiredFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      });
    } catch (err1) {
      console.log('Không mở được camera theo chế độ', desiredFacingMode, '→ thử chế độ còn lại...', err1);
      const altFacing = desiredFacingMode === 'user' ? 'environment' : 'user';
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: altFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      });
      // Nếu fallback thành công, cập nhật desiredFacingMode để các lần sau dùng luôn
      desiredFacingMode = altFacing;
    }
    
    const preview = document.getElementById("video-preview");
    if (preview) {
      preview.srcObject = stream;
      // Mirror preview only for front camera
      if (desiredFacingMode === 'user') preview.classList.add('mirrored');
      else preview.classList.remove('mirrored');
      // Ẩn overlay khi stream phát
      const hideOverlay = () => { try { const o = document.getElementById("camera-overlay"); if (o) o.classList.add("opacity-0"); } catch {} };
      preview.onloadedmetadata = () => { preview.play?.(); hideOverlay(); };
      preview.onplaying = hideOverlay;
    }

    resetChunks();  
    // Lưu stream để có thể tắt sau này
    currentStream = stream;
    const opts = {};
    const mt = pickMime();   // dùng helper ở trên
    if (mt) opts.mimeType = mt;
    // 4) Bắt đầu quay video
    mediaRecorder = new MediaRecorder(stream, opts);
    recordedChunks = [];

  mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = buildBlob(mediaRecorder, recordedChunks);
    const url = URL.createObjectURL(blob);
    document.getElementById("video-preview").classList.add("hidden");
    const result = document.getElementById("video-result");
    result.src = url;
    result.classList.remove("hidden");
    document.getElementById("btn-send").classList.remove("hidden");
  };

    mediaRecorder.start(1000);
    document.getElementById("btn-start")?.classList.add("hidden");
    document.getElementById("btn-stop")?.classList.remove("hidden");
  } catch (error) {
    console.error('Lỗi khi khởi động camera:', error);
    alert('Không thể khởi động camera. Vui lòng kiểm tra quyền truy cập và thử lại.');
  }
});

// Stop quay
const _btnStop = document.getElementById("btn-stop");
if (_btnStop) _btnStop.addEventListener("click", () => {
  // Dừng ghi video
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.addEventListener("stop", () => {
      lastBlob = buildBlob(mediaRecorder, recordedChunks);  // lưu lại để Send dùng
      // Hiển thị preview
      const preview = document.getElementById("video-preview");
      if (preview) {
        preview.classList.add("hidden");
        preview.pause();  // ← Tắt playback
      }
      const result = document.getElementById("video-result");
      if (result && lastBlob) {
        result.src = URL.createObjectURL(lastBlob);
        result.classList.remove("hidden");
      }
      }, { once: true });

    try { mediaRecorder.requestData?.(); } catch {}
    mediaRecorder.stop();
  }
  
  // Tắt camera hoàn toàn
  stopCamera();
  
  document.getElementById("btn-stop")?.classList.add("hidden");
});

// (Đã loại bỏ tính năng đổi camera; luôn dùng camera trước với fallback môi trường nếu cần)

// Gửi AI
const _btnSend = document.getElementById("btn-send");
if (_btnSend) _btnSend.addEventListener("click", async () => {
  

  // Check if in attendance mode (QR scan) first to determine activity name
  const urlParams = new URLSearchParams(window.location.search);
  const qrMaHD = urlParams.get('maHD') || localStorage.getItem('qr_maHD');
  
  // Get activity name from backend for AI context mapping
  let activityName = 'Unknown';
  if (qrMaHD) {
    try {
      const actRes = await fetch(`/api/activities/${encodeURIComponent(qrMaHD)}/info`);
      if (actRes.ok) {
        const actData = await actRes.json();
        activityName = actData.name || actData.tenHD || qrMaHD;
        console.log('✅ Got activity name:', activityName);
      } else {
        // Fallback to maHD if API fails
        activityName = qrMaHD;
        console.warn('⚠️ Activity info API failed, using maHD');
      }
    } catch (e) {
      console.error('❌ Error fetching activity info:', e);
      activityName = qrMaHD;
    }
  } else {
    activityName = 'Minh chứng không đăng ký';
  }
  const activityDesc = '';


  const h =  await checkAiHealth();

  if (!h || !h.ok) throw new Error("AI chưa sẵn sàng!");
  // UI loading
  const btnSend = document.getElementById("btn-send");
  const originalText = btnSend.textContent;
  btnSend.textContent = "Đang phân tích...";
  btnSend.disabled = true;
  document.getElementById("ai-result")?.classList.add("hidden");

  try {
    // Nếu còn đang ghi → dừng & đợi hẳn stop (mobile)
    if (mediaRecorder?.state === "recording") {
      try { mediaRecorder.requestData?.(); } catch {}
      mediaRecorder.stop();
      await waitForStop(mediaRecorder);
    }

    // Ưu tiên blob đã lưu khi stop; fallback ghép từ mảng
    let blob = lastBlob || buildBlob(mediaRecorder, recordedChunks);
    if (!blob || !blob.size || blob.size < 1024) {
      alert("Hãy quay/DỪNG video trước khi gửi.");
      return;
    }

    const filename = blob.type.includes("mp4") ? "evidence.mp4"
                   : blob.type.includes("webm") ? "evidence.webm" : "evidence.bin";

    // Lấy MSSV & ảnh khuôn mặt
    const getCurrentMSSV = async () => {
      try {
        const raw = localStorage.getItem("loggedUserInfo");
        if (!raw) return null;
        const u = JSON.parse(raw);
        return u?.MaCaNhan ?? u?.mssv ?? u?.studentId ?? null;
      } catch { return null; }
    };
    const getFaceB64 = async () => {
      // Check sessionStorage first (where avatar is actually stored after login)
      let a = sessionStorage.getItem("userAvatar");
      if (!a) {
        // Fallback to localStorage (for persistence across sessions)
        a = localStorage.getItem("userAvatar");
      }
      console.log("[FACE-DEBUG] Kiểm tra userAvatar:", !!a, a ? a.substring(0, 50) + "..." : "null");
      if (a && a.startsWith("data:")) {
        const i = a.indexOf(",");
        console.log("[FACE-DEBUG] Tìm thấy userAvatar, length=", a.length);
        return a.slice(i + 1); // bỏ prefix data:
      }
      const img = document.getElementById("avatar-img") || document.getElementById("user-avatar-img");
      console.log("[FACE-DEBUG] Tìm HTML avatar element:", !!img, img?.src?.substring(0, 50) || "no src");
      if (img?.src) {
        try {
          const r = await fetch(img.src);
          const b = await r.blob();
          const fr = new FileReader();
          const dataUrl = await new Promise(res => { fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
          const i = String(dataUrl).indexOf(",");
          const result = i >= 0 ? String(dataUrl).slice(i + 1) : String(dataUrl);
          console.log("[FACE-DEBUG] Chuyển đổi avatar thành base64, length=", result.length);
          return result;
        } catch (e) {
          console.error("[FACE-ERROR] Lỗi khi fetch/convert avatar:", e);
          return "";
        }
      }
      console.log("[FACE-DEBUG] Không tìm thấy avatar ở đâu cả, trả về chuỗi rỗng");
      return "";
    };

    console.log(">>> Bắt đầu chuẩn bị gửi AI");

    const mssv = await getCurrentMSSV();
    console.log("Lấy MSSV xong:", mssv);
    
    const faceB64 = await getFaceB64();
    console.log("Lấy ảnh base64 xong, độ dài:", faceB64?.length);
    
    console.log("Tên hoạt động nhập:", activityName);
    console.log("Mô tả hoạt động:", activityDesc);
    
    const fd = new FormData();
    fd.append("file", blob, filename);
    fd.append("student_id", mssv || "");
    fd.append("activity_name", activityName || "");
    if (activityDesc) fd.append("activity_description", activityDesc);
    fd.append("student_face_image_b64", faceB64 || "");
    
    console.log(">>> FormData chuẩn bị gửi:", [...fd.entries()]);

    // ==== Attendance vs Extracurricular routing logic ====
    // Nếu URL có query param maHD (quét từ QR) thì dùng attendance pipeline mới
    let result;
    if (qrMaHD) {
      // Attendance mode
      console.log('[Attendance] Detected maHD from QR:', qrMaHD);
      
      // ===== OPTION A: Bắt buộc GPS =====
      // Lấy toạ độ GPS - REQUIRED (không chấp nhận skip)
      let lat = null, lng = null;
      let gpsCollected = false;
      
      console.log('📍 Requesting GPS location (REQUIRED for Attendance)...');
      
      if (!navigator.geolocation) {
        console.error('❌ Geolocation không được support trên device này');
        alert('❌ Lỗi: Device của bạn không hỗ trợ GPS.\n\nVui lòng sử dụng điện thoại hoặc thiết bị có GPS để điểm danh.');
        showMessage('❌ GPS không được support. Không thể tiếp tục.');
        return;
      }
      
      try {
        gpsCollected = await new Promise((resolve) => {
          console.log('📍 Requesting current position...');
          const gpsTimeout = setTimeout(() => {
            console.warn('⏱️ GPS timeout after 12 seconds');
            resolve(false);
          }, 12000);
          
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(gpsTimeout);
              lat = pos.coords.latitude;
              lng = pos.coords.longitude;
              console.log('✅ GPS collected successfully:', { lat, lng, accuracy: pos.coords.accuracy });
              resolve(true);
            },
            (err) => {
              clearTimeout(gpsTimeout);
              console.warn('⚠️ GPS Error - Code:', err.code, 'Message:', err.message);
              const errMsg = err.code === 1 ? 'Bạn từ chối truy cập GPS. Vui lòng cho phép GPS để tiếp tục.' :
                             err.code === 2 ? 'Vị trí không sẵn sàng trên device này.' :
                             'Timeout lấy GPS - vui lòng thử lại.';
              console.warn('GPS error detail:', errMsg);
              resolve(false);
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
          );
        });
      } catch(e) {
        console.warn('❌ GPS exception:', e);
        gpsCollected = false;
      }
      
      // Check if GPS collection failed
      if (!gpsCollected || lat === null || lng === null) {
        console.error('❌ GPS collection failed - cannot proceed with attendance');
        alert('❌ Không thể lấy vị trí GPS.\n\nVui lòng:\n1. Bật GPS trên điện thoại\n2. Cho phép ứng dụng truy cập GPS\n3. Thử lại');
        showMessage('❌ GPS collection failed. Please enable GPS and try again.');
        return;
      }
      
      console.log('✅ GPS successfully collected:', { lat, lng, hasGPS: true });

      // ===== Avatar Validation =====
      console.log('📷 Validating avatar...');
      if (!faceB64 || faceB64.trim() === '') {
        console.error('❌ Avatar validation failed - no avatar found');
        alert('❌ Lỗi: Ảnh đại diện không tìm thấy.\n\nVui lòng:\n1. Cập nhật ảnh đại diện trong hồ sơ cá nhân\n2. Tải lại trang (F5)\n3. Thử lại');
        showMessage('❌ Avatar not found. Please update your profile picture and refresh the page.');
        return;
      }
      
      // Validate base64 format
      if (!faceB64.match(/^[A-Za-z0-9+/=]+$/)) {
        console.error('❌ Avatar validation failed - invalid base64 format');
        alert('❌ Lỗi: Ảnh đại diện không hợp lệ (định dạng lỗi).\n\nVui lòng cập nhật ảnh đại diện và thử lại.');
        showMessage('❌ Invalid avatar format. Please update your profile picture.');
        return;
      }
      
      // Validate base64 length (avatar should be at least 100 bytes when decoded)
      const avatarSize = faceB64.length * 0.75; // Rough estimate of decoded size
      if (avatarSize < 100) {
        console.error('❌ Avatar validation failed - avatar too small:', avatarSize, 'bytes');
        alert('❌ Ảnh đại diện quá nhỏ hoặc bị hỏng.\n\nVui lòng cập nhật ảnh đại diện và thử lại.');
        showMessage('❌ Avatar too small or corrupted. Please update your profile picture.');
        return;
      }
      
      console.log('✅ Avatar validation passed:', { size: avatarSize, format: 'base64' });
      const mapActivityToContext = (actName) => {
        if (!actName) return '';
        const lower = actName.toLowerCase();
        // Mapping based on activity keywords
        if (lower.includes('sân') || lower.includes('ngoài')) return 'NgoaiTroi';
        if (lower.includes('lớp') || lower.includes('trong')) return 'TrongLop';
        if (lower.includes('sân khấu') || lower.includes('biểu diễn') || lower.includes('stage')) return 'SanKhau';
        if (lower.includes('giảng') || lower.includes('đường')) return 'GiangDuong';
        // Default to the name as-is (backend will use for expected_context)
        return actName;
      };
      const expectedContext = mapActivityToContext(activityName);
      console.log('🎯 Activity context mapping:', { activityName, expectedContext });
      const fdAttend = new FormData();
      // Attendance endpoint backend expects key 'video'
      fdAttend.append('video', blob, filename);
      fdAttend.append('studentId', mssv || '');
      if (lat != null) fdAttend.append('lat', String(lat));
      if (lng != null) fdAttend.append('lng', String(lng));
      if (faceB64) fdAttend.append('student_face_image_b64', faceB64);
      console.log('[Attendance] FormData gửi:', [...fdAttend.entries()]);
  // Đính kèm X-User để backend gắn người gửi minh chứng
  const userInfoRaw = localStorage.getItem('loggedUserInfo');
  let xUser = '';
  try { if (userInfoRaw){ const u = JSON.parse(userInfoRaw); xUser = u.MaCaNhan || u.MSSV || u.MaSV || u.TenTK || ''; } } catch {}
      let attendRes = await fetch(`/api/activities/${encodeURIComponent(qrMaHD)}/attendance/register`, { method: 'POST', headers: xUser? { 'X-User': xUser } : undefined, body: fdAttend });
      // Thử lại 1 lần nếu lỗi tạm thời (429/502/503)
      if (!attendRes.ok && [429,502,503].includes(attendRes.status)) {
        console.warn('[Attendance] transient error', attendRes.status, '→ retry once');
        await new Promise(r=>setTimeout(r, 1200));
        attendRes = await fetch(`/api/activities/${encodeURIComponent(qrMaHD)}/attendance/register`, { method: 'POST', headers: xUser? { 'X-User': xUser } : undefined, body: fdAttend });
      }
      if (!attendRes.ok) throw new Error(`Lỗi đăng ký attendance (${attendRes.status}): ${await attendRes.text()}`);
  result = await attendRes.json();
  // Ghi log evidenceId để đối chiếu trên giao diện Giảng viên
  try { console.info('[Attendance] Saved evidenceId:', result.evidenceId || result.id || result.EvidenceId); } catch {}
      // Chuẩn hoá field cho UI reuse
      result.weightedScore = result.weightedScore || result.weighted_score || 0;
      result.verdict = result.verdict || result.Verdict || 'Approved';
      // Không cần activityName/manual fields ở attendance mode

      // Đánh dấu hoàn tất đăng ký để ẩn QR và ngăn xác nhận nhiều lần
      try {
        const mssv = (await (async ()=>{ try { const raw = localStorage.getItem("loggedUserInfo"); return raw? JSON.parse(raw).MaCaNhan || JSON.parse(raw).MSSV || JSON.parse(raw).MaSV || JSON.parse(raw).TenTK : null; } catch { return null; } })());
        if (mssv) {
          const cRes = await fetch(`/api/activities/${encodeURIComponent(qrMaHD)}/registration/complete?mssv=${encodeURIComponent(String(mssv))}`, { method: 'POST' });
          if (!cRes.ok) console.warn('Không thể cập nhật trạng thái hoàn tất:', await cRes.text());
          // Cập nhật bộ nhớ cục bộ để ẩn QR ngay
          if (window._svRegSet) window._svRegSet.add(String(qrMaHD));
          if (window._svRegDetail) {
            window._svRegDetail[String(qrMaHD)] = Object.assign({}, window._svRegDetail[String(qrMaHD)]||{}, { Eligible: false, Status: 'COMPLETED' });
            try { saveRegState(); } catch {}
          }
          // Sau khi nộp minh chứng xong, bỏ ghim maHD để tránh gửi lại
          try { localStorage.removeItem('qr_maHD'); const url = new URL(location.href); url.searchParams.delete('maHD'); history.replaceState({}, '', url.toString()); } catch {}
        }
      } catch (e) { console.warn('complete registration update failed', e); }
    } else {
      // Legacy extracurricular evidence analyze
  // Legacy gửi minh chứng phân tích AI: thêm X-User để liên kết đúng chủ thể
  let xUser2 = '';
  const userInfoRaw2 = localStorage.getItem('loggedUserInfo');
  try { if (userInfoRaw2){ const u2 = JSON.parse(userInfoRaw2); xUser2 = u2.MaCaNhan || u2.MSSV || u2.MaSV || u2.TenTK || ''; } } catch {}
  const res = await fetch("/api/evidence/analyze", { method: "POST", headers: xUser2? { 'X-User': xUser2 } : undefined, body: fd });
      if (!res.ok) throw new Error(`Lỗi máy chủ (${res.status}): ${await res.text()}`);
      result = await res.json();

      // Sau khi AI phân tích: nếu gương mặt hợp lệ thì tự đính video vào tiêu chí ĐGRL đã chọn
      try {
        const sel = document.getElementById('criterion-select');
        const maTCSelected = sel ? Number(sel.value || 0) : 0;
        // Xác định hợp lệ theo verdict hoặc điểm khuôn mặt >= 80%
        const verdict = (result.verdict || result.Verdict || '').toString();
        const facePct = (() => {
          const v = result.face_score ?? result.faceScore ?? (result.Scores?.face || result.scores?.face) ?? null;
          const num = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) : null);
          if (num == null || !isFinite(num)) return null; return num <= 1 ? Math.round(num*100) : Math.round(num);
        })();
        const okFace = (verdict.toLowerCase() === 'approved') || (typeof facePct === 'number' && facePct >= 80);
        if (maTCSelected > 0 && okFace) {
          const attachFd = new FormData();
          attachFd.append('mssv', mssv || '');
          attachFd.append('maTC', String(maTCSelected));
          attachFd.append('note', `Đính kèm tự động từ video xác minh (${facePct ?? 'n/a'}%)`);
          attachFd.append('file', blob, filename);
          // Đính kèm luôn kết quả AI để backend lưu vào evidence (nếu hỗ trợ)
          try {
            const detailsJson = JSON.stringify(result);
            attachFd.append('detailsJson', detailsJson);
          } catch {}
          // Gửi một số trường tóm tắt để server dễ map
          const toPct = (v)=>{ if(v==null) return null; const n = typeof v==='number'? v : (typeof v==='string'? parseFloat(v) : NaN); if(!isFinite(n)) return null; return n<=1? Math.round(n*100) : Math.round(n); };
          const aiScore = toPct(result.weightedScore ?? result.weighted_score ?? result.AIWeighted ?? result.aiScore ?? result.confidenceScore);
          const faceScore = toPct(result.face_score ?? result.faceScore ?? result.Scores?.face ?? result.scores?.face);
          const contextScore = toPct(result.context_score ?? result.contextScore ?? result.banner_score ?? result.bannerScore ?? result.Scores?.context ?? result.scores?.context);
          const deviceScore = toPct(result.deviceScore ?? result.device_score);
          if (aiScore!=null) attachFd.append('AIScore', String(aiScore));
          if (faceScore!=null) attachFd.append('FacePercent', String(faceScore));
          if (contextScore!=null) attachFd.append('ContextPercent', String(contextScore));
          if (deviceScore!=null) attachFd.append('DevicePercent', String(deviceScore));
          const verdict2 = (result.verdict || result.Verdict || '').toString();
          if (verdict2) attachFd.append('Verdict', verdict2);
          const evId2 = result.evidenceId || result.id || result.EvidenceId; if (evId2) attachFd.append('SourceEvidenceId', String(evId2));
          const attachRes = await fetch(`${API_BASE}/api/tieuchi/evidence`, { method: 'POST', headers: xUser2? { 'X-User': xUser2 } : undefined, body: attachFd });
          if (!attachRes.ok) {
            console.warn('Đính kèm minh chứng vào tiêu chí thất bại:', attachRes.status);
          } else {
            console.info('Đã đính kèm minh chứng vào tiêu chí', maTCSelected);
          }
        }
      } catch(e){ console.warn('Auto-attach evidence error:', e); }
    }
    if (typeof displayAIResults === "function") displayAIResults(result);

    // Thông báo theo ngưỡng (đặt CHUNG scope với result)
    const weighted = (typeof result.weightedScore === 'number' ? result.weightedScore
                      : typeof result.Weighted_Score === 'number' ? result.Weighted_Score
                      : typeof result.confidenceScore === 'number' ? result.confidenceScore/100 : 0);
  const pct = Math.round(weighted * 100);
  // Hiển thị xác nhận có mã minh chứng để GV truy vết
  const evId = result.evidenceId || result.id || result.EvidenceId;
    if (qrMaHD && result.pointsAwarded > 0) {
      alert(`Điểm rèn luyện được cộng tự động: +${result.pointsAwarded}`);
    } else if (qrMaHD && result.verdict === 'ManualReview') {
  alert(`Đã gửi minh chứng cho giảng viên duyệt${evId? ` (mã: ${evId})` : ''}.`);
    } else if (qrMaHD && result.verdict === 'Rejected') {
      alert('Minh chứng Attendance bị từ chối (GPS hoặc AI).');
    } else if (result.awardedPoints > 0) {
      alert(`AI ${pct}% → CỘNG ${result.awardedPoints} điểm rèn luyện!`);
    } else if (result.verdict === "ManualReview") {
  alert(`AI ${pct}% → ĐÃ CHUYỂN GIẢNG VIÊN DUYỆT${evId? ` (mã: ${evId})` : ''}.`);
    } else if (result.verdict === "Rejected") {
      alert(`AI ${pct}% → Bị từ chối.`);
    } else {
      alert(`AI ${pct}% → ${result.verdict || "Đã xử lý"}`);
    }
 // Dọn camera nếu muốn
    if (typeof stopCamera === "function") stopCamera();
    // Sau khi gửi xong: xác minh đã có minh chứng trong danh sách theo MSSV (debug)
    try {
      const verifyId = (evId || result.id || result.EvidenceId || '').toString();
      const verifyMssv = mssv || '';
      if (verifyMssv) {
        const checkRes = await fetch(`/api/evidence?studentId=${encodeURIComponent(verifyMssv)}&page=1&pageSize=10`, { headers: xUser2? { 'X-User': xUser2 } : undefined });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const items = checkData.items || checkData.Items || [];
          const found = items.some(it => String(it.EvidenceId||it.evidenceId||'') === verifyId);
          console.info('[Verify] evidence list count:', items.length, 'foundById:', found);
        } else {
          console.warn('[Verify] evidence list fetch failed', checkRes.status);
        }
      }
    } catch (e) { console.warn('[Verify] post-submit check error', e); }
  } catch (err) {
    console.error(err);
    alert("Lỗi khi gửi video: " + err.message);
  } finally {
    btnSend.textContent = originalText;
    btnSend.disabled = false;
  }
});


// Function to display AI analysis results
function displayAIResults(result) {
  // Debug: log raw once
  try { console.debug('[AI] Raw result:', result); } catch {}
  const aiResult = document.getElementById("ai-result");
  const statusIcon = document.getElementById("ai-status-icon");
  const statusTitle = document.getElementById("ai-status-title");
  const confidenceScore = document.getElementById("confidence-score");
  const confidenceBar = document.getElementById("confidence-bar");
  const detectedList = document.getElementById("detected-list");
  const suggestionsList = document.getElementById("suggestions-list");
  const analysisDetails = document.getElementById("analysis-details");
  const detectedSection = document.getElementById("ai-detected-activities");
  const suggestionsSection = document.getElementById("ai-suggestions");
  // new category elements
  const faceScoreEl = document.getElementById('face-score');
  const faceStatusEl = document.getElementById('face-status');
  const bannerScoreEl = document.getElementById('banner-score');
  const bannerStatusEl = document.getElementById('banner-status');
  const bannerRawTextEl = document.getElementById('banner-raw-text');
  const tamperScoreEl = document.getElementById('tamper-score');
  const tamperStatusEl = document.getElementById('tamper-status');
  const deviceScoreEl = document.getElementById('device-score');
  const deviceStatusEl = document.getElementById('device-status');
  const deviceCatEl = document.getElementById('cat-device');
  const tamperCatEl = document.getElementById('cat-tamper');

  // Set status icon and title
  if (result.isValid || result.Verdict === 'Approved' || result.verdict === 'Approved') {
    statusIcon.innerHTML = `<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>`;
    // Wording update: reflect that valid evidence will be sent to lecturer
    const msg = result.message || result.Verdict || result.verdict;
    statusTitle.textContent = msg ? `${msg} — sẽ gửi minh chứng cho giảng viên duyệt` : 'Hợp lệ — sẽ gửi minh chứng cho giảng viên duyệt';
    statusTitle.className = "text-lg font-semibold text-green-800";
  } else {
    statusIcon.innerHTML = `<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>`;
    statusTitle.textContent = result.message || result.Verdict || result.verdict || 'Không hợp lệ';
    statusTitle.className = "text-lg font-semibold text-red-800";
  }

  // Helpers
  const toPct = (v) => {
    if (v == null) return null;
    let n = v;
    if (typeof v === 'string') { n = parseFloat(v); if (!isFinite(n)) return null; }
    if (typeof n !== 'number' || !isFinite(n)) return null;
    if (n <= 1) n = n * 100;
    n = Math.max(0, Math.min(100, Math.round(n)));
    return n;
  };
  const getCaseInsensitive = (obj, key) => {
    if (!obj) return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    const lower = key.toLowerCase();
    for (const k of Object.keys(obj)) { if (k.toLowerCase() === lower) return obj[k]; }
    return undefined;
  };
  const findFirstPct = (obj, keys) => {
    for (const k of keys) { const v = getCaseInsensitive(obj, k); const pct = toPct(v); if (pct != null) return pct; }
    return null;
  };
  const rootPct = findFirstPct(result || {}, ['weighted_score','Weighted_Score','WeightedScore','weightedScore','overall','final','final_score','score']);
  const confPct = toPct(result?.confidenceScore);
  const pctOverall = rootPct != null ? rootPct : (confPct != null ? confPct : 0);
  confidenceScore.textContent = pctOverall + '%';
  confidenceBar.style.width = pctOverall + '%';
  
  // Set confidence bar color based on score
  if (pctOverall >= 80) {
    confidenceBar.className = "h-2 rounded-full transition-all duration-500 bg-green-500";
  } else if (pctOverall >= 60) {
    confidenceBar.className = "h-2 rounded-full transition-all duration-500 bg-yellow-500";
  } else {
    confidenceBar.className = "h-2 rounded-full transition-all duration-500 bg-red-500";
  }

  // Extract category scores (face/banner/tamper) from Scores or Details with flexible naming
  const scores = result.Scores || result.scores || {};
  const details = result.Details || result.details || {};
  const findPctFlexible = (obj) => (syns) => {
    // 1) exact keys
    const pct1 = findFirstPct(obj, syns);
    if (pct1 != null) return pct1;
    // 2) partial includes search (case-insensitive)
    const keys = Object.keys(obj||{});
    for (const key of keys) {
      const l = key.toLowerCase();
      if (syns.some(s => l.includes(s.toLowerCase()))) {
        const pct = toPct(obj[key]);
        if (pct != null) return pct;
      }
    }
    return null;
  };
  const fromScores = findPctFlexible(scores);
  const fromDetails = findPctFlexible(details);

  const faceSyns = ['face','face_score','facematch','identity','recognition','khuon','person'];
  const bannerSyns = ['banner','poster','standee','text_banner','bg_text','logo'];
  // Extend bannerSyns to treat new context-based attendance scoring as "banner" equivalent for UI reuse
  // New pipeline replaced banner OCR with scene/context classification (predicted_context vs expected_context)
  // Include Vietnamese synonyms and interaction/environment keys so score extraction still works.
  const contextExtraSyns = ['context','boicanh','scene','environment','interaction'];
  bannerSyns.push(...contextExtraSyns);
  const tamperSyns = ['tamper','manipulation','splice','copy_move','deepfake','ai_generated'];

  let faceScorePct = fromScores(faceSyns);
  if (faceScorePct == null) faceScorePct = fromDetails(faceSyns);
  let bannerScorePct = fromScores(bannerSyns);
  if (bannerScorePct == null) bannerScorePct = fromDetails(bannerSyns);
  // Fallback for new context score top-level fields
  if (bannerScorePct == null) {
    const topCtx = result.context_score ?? result.contextScore;
    const pct = toPct(topCtx);
    if (pct != null) bannerScorePct = pct;
  }
  let tamperScorePct = fromScores(tamperSyns);
  if (tamperScorePct == null) tamperScorePct = fromDetails(tamperSyns);
  // Fallback: top-level keys for attendance pipeline (face_score, banner_score)
  if (faceScorePct == null) {
    const topFace = result.face_score ?? result.faceScore;
    const pct = toPct(topFace);
    if (pct != null) faceScorePct = pct;
  }
  if (bannerScorePct == null) {
    const topBanner = result.banner_score ?? result.bannerScore;
    const pct = toPct(topBanner);
    if (pct != null) bannerScorePct = pct;
  }
  // Attendance-specific device score (top-level, not in scores/details in current design)
  let deviceScoreRaw = null;
  if (result && typeof result === 'object') {
    deviceScoreRaw = result.deviceScore ?? result.device_score ?? null;
    if (deviceScoreRaw != null && typeof deviceScoreRaw === 'number' && deviceCatEl) {
      deviceCatEl.classList.remove('hidden');
    }
  }
  // Attendance mode detection to hide tamper category completely
  const isAttendanceMode = (result.mode === 'attendance') || (deviceScoreRaw != null && tamperScorePct == null && (result.bannerScore != null || result.banner_score != null));
  if (isAttendanceMode && tamperCatEl) {
    tamperCatEl.classList.add('hidden');
  } else if (tamperCatEl) {
    tamperCatEl.classList.remove('hidden');
  }

  function renderCategory(elScore, elStatus, raw, labels) {
    if (!elScore || !elStatus) return;
    if (raw == null) { elScore.textContent = '—'; elStatus.textContent = 'Không có'; elStatus.className = 'text-sm font-medium text-slate-500'; return; }
    const pct = Math.max(0, Math.min(100, Math.round(raw)));
    elScore.textContent = pct + '%';
    let status = labels(pct);
    elStatus.textContent = status.text;
    elStatus.className = 'text-sm font-medium ' + status.cls;
  }
  const catLabelsFace = (pct) => pct >= 60 ? { text:'Rõ', cls:'text-green-600' } : pct >= 30 ? { text:'Mờ', cls:'text-yellow-600' } : { text:'Không rõ', cls:'text-red-600' };
  // Adapt label semantics: for context score we interpret high score as context matches expected
  const catLabelsBanner = (pct) => {
    // Heuristic: display different wording if we have predicted/expected context fields
    const hasCtx = (result.predicted_context || result.expected_context || result.predictedContext || result.expectedContext);
    if (hasCtx) {
      if (pct >= 70) return { text:'Bối cảnh khớp', cls:'text-green-600' };
      if (pct >= 40) return { text:'Bối cảnh chưa rõ', cls:'text-yellow-600' };
      return { text:'Sai bối cảnh', cls:'text-red-600' };
    }
    return pct >= 70 ? { text:'Có banner', cls:'text-green-600' } : pct >= 30 ? { text:'Không nổi bật', cls:'text-yellow-600' } : { text:'Không thấy', cls:'text-red-600' };
  };
  const catLabelsTamper = (pct) => pct <= 20 ? { text:'Không cắt ghép', cls:'text-green-600' } : pct <= 50 ? { text:'Nghi vấn', cls:'text-yellow-600' } : { text:'Có thể cắt ghép', cls:'text-red-600' };
  renderCategory(faceScoreEl, faceStatusEl, faceScorePct, catLabelsFace);
  renderCategory(bannerScoreEl, bannerStatusEl, bannerScorePct, catLabelsBanner);
  // Hiển thị nội dung OCR đã đọc (ưu tiên recognized_texts rồi samples)
  if (bannerRawTextEl) {
    // Re-purpose raw text area to show context metrics (predicted vs expected + people/motion/interaction)
    const ctxDetails = details.context || details.Context || details.banner || {};
    const predictedCtx = result.predicted_context || result.predictedContext || ctxDetails.predicted_context;
    const expectedCtx = result.expected_context || result.expectedContext;
    const peopleAvg = result.people_count_avg || result.peopleCountAvg || ctxDetails.people_count_avg;
    const motionScore = result.motion_score || result.motionScore;
    const interactionScore = result.interaction_score || result.interactionScore;
    const texts = ctxDetails.recognized_texts || ctxDetails.samples || [];
    const parts = [];
    if (predictedCtx) parts.push(`Dự đoán: ${predictedCtx}`);
    if (expectedCtx) parts.push(`Mong đợi: ${expectedCtx}`);
    if (typeof peopleAvg === 'number') parts.push(`Người TB: ${Math.round(peopleAvg*10)/10}`);
    if (typeof motionScore === 'number') parts.push(`Chuyển động: ${(motionScore*100).toFixed(0)}%`);
    if (typeof interactionScore === 'number') parts.push(`Tương tác: ${(interactionScore*100).toFixed(0)}%`);
    if (Array.isArray(texts) && texts.length) parts.push(texts.slice(0,3).join(' • '));
    bannerRawTextEl.textContent = parts.join(' | ');
  }
  if (!isAttendanceMode) {
    renderCategory(tamperScoreEl, tamperStatusEl, tamperScorePct, catLabelsTamper);
  } else {
    // Attendance hides tamper; ensure placeholders cleared
    if (tamperScoreEl) tamperScoreEl.textContent = '—';
    if (tamperStatusEl) tamperStatusEl.textContent = 'Không áp dụng';
  }
  const catLabelsDevice = (pct) => pct >= 70 ? { text:'Hợp lệ', cls:'text-green-600' } : pct >= 40 ? { text:'Không rõ', cls:'text-yellow-600' } : { text:'Thiếu / sai', cls:'text-red-600' };
  if (deviceScoreEl && deviceStatusEl) renderCategory(deviceScoreEl, deviceStatusEl, toPct(deviceScoreRaw), catLabelsDevice);
  
  // Display GPS distance (similar to banner-raw-text format)
  const deviceDistanceEl = document.getElementById('device-distance');
  if (deviceDistanceEl) {
    const gpsDistKm = result.gps_distance_km || result.gpsDistanceKm;
    const gpsDistM = result.gps_distance_m || result.gpsDistanceM;
    const lat = result.lat || result.Lat;
    const lng = result.lng || result.Lng;
    const activityLat = result.activity_lat || result.activityLat;
    const activityLng = result.activity_lng || result.activityLng;
    
    const parts = [];
    
    // Format distance display
    const formatDistance = (km) => {
      if (km < 0.1) return `${Math.round(km * 1000)}m`;
      return `${km.toFixed(1)}km`;
    };
    
    // Calculate distance if both GPS points available but gpsDistKm not provided
    let finalDistanceKm = gpsDistKm;
    if ((finalDistanceKm == null || finalDistanceKm === undefined) && lat && lng && activityLat && activityLng) {
      try {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        const actLatNum = parseFloat(activityLat);
        const actLngNum = parseFloat(activityLng);
        
        // Haversine formula to calculate distance
        const R = 6371; // Earth radius in km
        const dLat = (actLatNum - latNum) * Math.PI / 180;
        const dLng = (actLngNum - lngNum) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(latNum * Math.PI / 180) * Math.cos(actLatNum * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        finalDistanceKm = R * c;
      } catch (e) {
        console.log('Failed to calculate distance:', e);
      }
    }
    
    if (finalDistanceKm != null && finalDistanceKm >= 0) {
      parts.push(`Cách ${formatDistance(finalDistanceKm)} nơi diễn ra`);
    } else if (lat && lng && activityLat && activityLng) {
      // Show "Không có dữ liệu vị trí" only if we can't calculate distance but have GPS data
      parts.push('Không thể tính khoảng cách');
    } else {
      parts.push('Không có dữ liệu vị trí');
    }
    
    // Add video location if available
    if (lat && lng) {
      parts.push(`Video: ${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`);
    }
    
    // Add activity location if available
    if (activityLat && activityLng) {
      parts.push(`Hoạt động: ${parseFloat(activityLat).toFixed(4)}, ${parseFloat(activityLng).toFixed(4)}`);
    }
    
    // Add distance in meters for precision
    if (finalDistanceKm != null && finalDistanceKm >= 0) {
      const distM = finalDistanceKm * 1000;
      parts.push(`Độ chính xác: ±${Math.round(distM)}m`);
    }
    
    deviceDistanceEl.textContent = parts.join(' | ');
  }

  // Set detected activities
  if (result.detectedActivities && result.detectedActivities.length > 0) {
    detectedList.innerHTML = "";
    result.detectedActivities.forEach(activity => {
      const tag = document.createElement("span");
      tag.className = "inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full";
      tag.textContent = activity;
      detectedList.appendChild(tag);
    });
    detectedSection.classList.remove("hidden");
  } else {
    detectedSection.classList.add("hidden");
  }

  // Set suggestions
  if (result.suggestions && result.suggestions.length > 0) {
    suggestionsList.innerHTML = "";
    result.suggestions.forEach(suggestion => {
      const li = document.createElement("li");
      li.className = "flex items-start";
      li.innerHTML = `<span class="text-yellow-500 mr-2">•</span><span>${suggestion}</span>`;
      suggestionsList.appendChild(li);
    });
    suggestionsSection.classList.remove("hidden");
  } else {
    suggestionsSection.classList.add("hidden");
  }

  // Set analysis details
  const prettyDetails = (obj) => {
    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
  };
  const detailsText = result.analysisDetails || (Object.keys(details||{}).length ? prettyDetails(details) : (result.message || ''));
  analysisDetails.textContent = detailsText || "Không có chi tiết phân tích.";

  // Show the result
  aiResult.classList.remove("hidden");
}

// Face upload functionality
const _uploadFaceBtn = document.getElementById("upload-face-btn");
if (_uploadFaceBtn) _uploadFaceBtn.addEventListener("click", async () => {
  const faceImageInput = document.getElementById("face-image-input");
  const uploadBtn = document.getElementById("upload-face-btn");
  const resultDiv = document.getElementById("face-upload-result");
  
  if (!faceImageInput.files || faceImageInput.files.length === 0) {
    showFaceUploadResult("Vui lòng chọn ảnh khuôn mặt", "error");
    return;
  }
  
  const file = faceImageInput.files[0];
  
  // Validation
  if (!file.type.startsWith("image/")) {
    showFaceUploadResult("Vui lòng chọn file ảnh hợp lệ", "error");
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    showFaceUploadResult("Kích thước ảnh không được vượt quá 5MB", "error");
    return;
  }
  
  // Show loading state
  uploadBtn.textContent = "Đang xử lý...";
  uploadBtn.disabled = true;
  resultDiv.classList.add("hidden");
  
  try {
    const formData = new FormData();
    formData.append("faceImage", file);
    
    // Get MSSV from logged user
    const loggedUser = localStorage.getItem("loggedUser");
    if (!loggedUser) {
      throw new Error("Chưa đăng nhập");
    }
    
    formData.append("mssv", loggedUser);
    
    const response = await fetch("/api/student/face-data", {
      method: "POST",
      body: formData,
      headers: {
        "X-User": loggedUser
      }
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showFaceUploadResult("✅ " + result.message, "success");
      // Update localStorage to indicate user has face data
      localStorage.setItem("hasFaceData", "true");
      // Hide face upload section after successful upload
      setTimeout(() => {
        document.getElementById("face-upload-section").classList.add("hidden");
      }, 2000);
    } else {
      showFaceUploadResult("❌ " + (result.error || "Lỗi upload ảnh khuôn mặt"), "error");
    }
  } catch (error) {
    console.error("Face upload error:", error);
    showFaceUploadResult("❌ Lỗi: " + error.message, "error");
  } finally {
    uploadBtn.textContent = "Upload ảnh khuôn mặt";
    uploadBtn.disabled = false;
  }
});

function showFaceUploadResult(message, type) {
  const resultDiv = document.getElementById("face-upload-result");
  resultDiv.textContent = message;
  resultDiv.className = `mt-3 text-sm ${type === "success" ? "text-green-600" : "text-red-600"}`;
  resultDiv.classList.remove("hidden");
}

// Show face upload section when video recording starts
if (_btnStart) _btnStart.addEventListener("click", () => {
  // Check if user has face data
  checkUserFaceData();
});

async function checkAiHealth() {
  try {
    const res = await fetch('/debug/ai/health');
    if (!res.ok) return { ok: false };
    const body = await res.json();
    return { ok: !!body?.ok, body };
  } catch {
    return { ok: false };
  }
}

async function checkUserFaceData() {
  try {
    const raw = localStorage.getItem("loggedUserInfo");
    if (!raw) return;

    let user;
    try {
      user = JSON.parse(raw); // parse JSON nếu có
    } catch {
      user = raw;
      console.error("Chưa có thông tin hợp lệ!");
    }

    // lấy MSSV theo tên field bạn đang lưu
    const mssv = user.MaCaNhan;

    if (!mssv) {
      console.warn("Không tìm thấy MSSV trong loggedUser:", user);
      return;
    }

    const res = await fetch(`/api/sinhvien/${encodeURIComponent(mssv)}`);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`GET /api/sinhvien/${mssv} => ${res.status}: ${txt}`);
    }

    const studentData = await res.json();

    // Kiểm tra avatar (linh hoạt khóa field)
    const imgB64 = studentData.AnhDD || studentData.anhDD || studentData.anhdd;
    if (!imgB64 || (typeof imgB64 === 'string' && imgB64.length === 0)) {
      document.getElementById("face-upload-section")?.classList.remove("hidden");
    } else {
      document.getElementById("face-upload-section")?.classList.add("hidden");
      localStorage.setItem("hasFaceData", "true");
    }
  } catch (error) {
    console.error("Error checking face data:", error);
    document.getElementById("face-upload-section")?.classList.remove("hidden");
  }
}

// Function to show AI error
function showAIError(message) {
  const aiResult = document.getElementById("ai-result");
  const statusIcon = document.getElementById("ai-status-icon");
  const statusTitle = document.getElementById("ai-status-title");
  const analysisDetails = document.getElementById("analysis-details");
  
  statusIcon.innerHTML = `<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
  </svg>`;
  statusTitle.textContent = "Lỗi phân tích";
  statusTitle.className = "text-lg font-semibold text-red-800";
  analysisDetails.textContent = message;
  
  // Hide other sections
  document.getElementById("ai-confidence").classList.add("hidden");
  document.getElementById("ai-detected-activities").classList.add("hidden");
  document.getElementById("ai-suggestions").classList.add("hidden");
  
  aiResult.classList.remove("hidden");
}

// ✅ Wire up attendance modal buttons (start/stop/send camera)


// Call on load
setTimeout(wireAttendanceModalButtons, 500);



  // Export UI update functions to window so attendance_wizard.js can use them
  if (typeof renderActivities === 'function') window.renderActivities = renderActivities;
  if (typeof checkRegistrationStatus === 'function') window.checkRegistrationStatus = checkRegistrationStatus;
  if (typeof saveRegState === 'function') window.saveRegState = saveRegState;
  if (typeof loadRegState === 'function') window.loadRegState = loadRegState;
});

