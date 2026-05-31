// Shared profile editor logic for both student (index) and CBL interfaces
// Usage: initProfileEditorShared({
//   API_BASE: '',
//   modalId: 'profile-modal',
//   openButtonId: 'cbl-avatar-btn', // button that opens modal
//   phoneInputId: 'profile-sdt', // or 'sv-sdt'
//   addressInputId: 'profile-diachi', // or 'sv-diachi'
//   avatarImgId: 'cbl-avatar', // main displayed avatar img element
//   avatarFileInputId: 'profile-avatar-file',
//   avatarPreviewImgId: 'profile-avatar-preview',
//   saveButtonId: 'save-profile'
// })
// For student page you can pass mapping with student-specific IDs.

(function(global){
  let PROFILE_API_BASE = '';
  function initProfileShared(opts){ PROFILE_API_BASE = (opts&&opts.API_BASE) || ''; }
  function safeJson(str){ try{return JSON.parse(str);}catch{return null;} }
  function getCurrentMSSV(){
    const raw = localStorage.getItem('loggedUserInfo');
    if (!raw) return null;
    const u = safeJson(raw) || {};
    return u.MaCaNhan || u.MSSV || u.MaSV || u.TenTK || null;
  }

  async function fetchStudent(mssv, API_BASE){
    if (!mssv) return null;
    try {
      const base = (API_BASE!==undefined ? API_BASE : PROFILE_API_BASE) || '';
      const r = await fetch(`${base}/api/sinhvien/${encodeURIComponent(mssv)}`);
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  function validatePhone(v){
    if (!v) return true; // optional
    const digits = v.replace(/\D/g,'');
    return digits.length >= 9 && digits.length <= 13;
  }

  // ✅ HEIC Loading Spinner Functions
  function showHEICLoadingSpinner(fileInput) {
    // Remove existing spinner if any
    hideHEICLoadingSpinner();
    
    const spinnerHTML = `
      <div id="heic-loading-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: white; padding: 2rem; border-radius: 12px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
          <div style="margin-bottom: 1rem;">
            <div style="display: inline-block; width: 50px; height: 50px; border: 4px solid #e5e7eb; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <style>
              @keyframes spin { 
                0% { transform: rotate(0deg); } 
                100% { transform: rotate(360deg); } 
              }
            </style>
          </div>
          <p style="font-weight: 600; color: #1f2937; margin: 0.5rem 0;">Đang chuyển đổi HEIC...</p>
          <p style="font-size: 0.875rem; color: #6b7280; margin: 0;">Vui lòng chờ trong giây lát</p>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', spinnerHTML);
  }

  function hideHEICLoadingSpinner() {
    const overlay = document.getElementById('heic-loading-overlay');
    if (overlay) overlay.remove();
  }


  function wireAvatarFile(fileInput, preview){
    if (!fileInput || !preview) return;
    fileInput.addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      
      // ✅ Handle HEIC format - convert to JPEG before preview
      let fileToProcess = f;
      if (f.type === 'image/heic' || f.type === 'image/heif' || f.name.toLowerCase().endsWith('.heic') || f.name.toLowerCase().endsWith('.heif')) {
        console.log('[AVATAR] Phát hiện HEIC format, đang convert sang JPEG...');
        
        // Show loading spinner
        showHEICLoadingSpinner(fileInput);
        
        try {
          // Try using heic2any library if available
          if (window.heic2any) {
            const blob = await heic2any({ blob: f, toType: 'image/jpeg', quality: 0.9 });
            // Create a new File object with JPEG type
            fileToProcess = new File([blob], f.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
            console.log('[AVATAR] ✓ Convert HEIC → JPEG thành công');
          } else {
            console.warn('[AVATAR] heic2any not available, trying canvas fallback...');
            // Fallback: use canvas (may not work for all HEIC)
            const img = new Image();
            img.onload = async () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              canvas.toBlob((blob) => {
                fileToProcess = new File([blob], f.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
                hideHEICLoadingSpinner();
                updatePreview();
              }, 'image/jpeg', 0.9);
            };
            img.onerror = () => {
              console.error('[AVATAR] Canvas fallback failed, using original');
              hideHEICLoadingSpinner();
              updatePreview();
            };
            img.src = URL.createObjectURL(f);
            return;
          }
        } catch (err) {
          console.warn('[AVATAR] HEIC conversion failed:', err);
          hideHEICLoadingSpinner();
          alert('Lỗi convert ảnh HEIC. Vui lòng thử format khác.');
          return;
        }
        
        // Hide spinner after conversion
        hideHEICLoadingSpinner();
      }
      
      // Update preview
      const updatePreview = () => {
        const reader = new FileReader();
        reader.onload = () => { preview.src = reader.result; };
        reader.readAsDataURL(fileToProcess);
      };
      updatePreview();
    });
  }

  async function saveProfile(opts){
    const {
      API_BASE,
      phoneInputId,
      addressInputId,
      avatarFileInputId,
      avatarImgId,
      avatarPreviewImgId,
      modalId
    } = opts;
    const mssv = getCurrentMSSV(); if (!mssv) return alert('Không tìm thấy MSSV đăng nhập');
    const phoneEl = document.getElementById(phoneInputId);
    const addrEl  = document.getElementById(addressInputId);
    if (!phoneEl || !addrEl) return;
    const phone = phoneEl.value.trim();
    const addr  = addrEl.value.trim();
    if (!validatePhone(phone)) return alert('Số điện thoại không hợp lệ (cần 9-13 chữ số).');

    try {
      const body = { SDT: phone || null, DiaChi: addr || null };
      const base = (API_BASE!==undefined ? API_BASE : PROFILE_API_BASE) || '';
      const resp = await fetch(`${base}/api/sinhvien/${encodeURIComponent(mssv)}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
      if (!resp.ok && resp.status !== 204) throw new Error(`HTTP ${resp.status}`);

      // Upload avatar if selected
      const fileInput = document.getElementById(avatarFileInputId);
      if (fileInput && fileInput.files && fileInput.files[0]){
        let fileToUpload = fileInput.files[0];
        
        // ✅ Convert HEIC to JPEG if needed
        if (fileToUpload.type === 'image/heic' || fileToUpload.type === 'image/heif' || fileToUpload.name.toLowerCase().endsWith('.heic') || fileToUpload.name.toLowerCase().endsWith('.heif')) {
          console.log('[AVATAR-SAVE] Phát hiện HEIC format, đang convert sang JPEG...');
          showHEICLoadingSpinner();
          try {
            if (window.heic2any) {
              const blob = await heic2any({ blob: fileToUpload, toType: 'image/jpeg', quality: 0.9 });
              fileToUpload = new File([blob], fileToUpload.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
              console.log('[AVATAR-SAVE] ✓ Convert HEIC → JPEG thành công, size:', fileToUpload.size);
            } else {
              console.warn('[AVATAR-SAVE] heic2any not available, trying canvas...');
              const img = new Image();
              img.src = URL.createObjectURL(fileToUpload);
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                canvas.getContext('2d').drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                  fileToUpload = new File([blob], fileToUpload.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
                  console.log('[AVATAR-SAVE] ✓ Canvas convert thành công');
                }, 'image/jpeg', 0.9);
              };
            }
          } catch (err) {
            console.warn('[AVATAR-SAVE] HEIC conversion failed:', err);
            hideHEICLoadingSpinner();
            alert('⚠️ Không thể convert ảnh HEIC. Vui lòng upload format JPG/PNG.');
            return;
          }
          hideHEICLoadingSpinner();
        }
        
        const fd = new FormData(); fd.append('file', fileToUpload);
        const up = await fetch(`${base}/api/sinhvien/${encodeURIComponent(mssv)}/avatar`, { method:'POST', body: fd });
        if (!up.ok && up.status !== 204) throw new Error(`Upload avatar HTTP ${up.status}`);
        const preview = document.getElementById(avatarPreviewImgId);
        if (preview){
          const mainAva = document.getElementById(avatarImgId);
          if (mainAva) mainAva.src = preview.src;
          try { localStorage.setItem('userAvatar', preview.src); } catch {}
        }
      }
      alert('Đã lưu thông tin');
      const modal = document.getElementById(modalId); modal?.classList.add('hidden');
    } catch(e){ alert('Lỗi lưu thông tin: ' + (e.message||e)); }
  }

  async function openModal(opts){
    const { API_BASE, modalId, phoneInputId, addressInputId, avatarImgId, avatarPreviewImgId, metricsContainerId } = opts;
    const mssv = getCurrentMSSV(); if (!mssv) return alert('Không tìm thấy MSSV');
    const sv = await fetchStudent(mssv, API_BASE);
    const modal = document.getElementById(modalId); if (!modal) return;
    const phoneEl = document.getElementById(phoneInputId);
    const addrEl  = document.getElementById(addressInputId);
    const prevEl  = document.getElementById(avatarPreviewImgId);
    if (phoneEl) phoneEl.value = sv?.SDT || '';
    if (addrEl) addrEl.value = sv?.DiaChi || '';
    const mainAva = document.getElementById(avatarImgId);
    if (prevEl && mainAva) prevEl.src = mainAva.src;

    // Optionally render basic metrics (GPA/ĐRL) like student preview
    if (metricsContainerId){
      const box = document.getElementById(metricsContainerId);
      if (box){
        box.innerHTML = '<div class="text-sm text-gray-500">Đang tải kết quả học tập...</div>';
        try {
          const now = new Date();
          const currentYear = now.getFullYear();
          // simple guess: months < 6 -> HK2 else HK1, aligns with student preview logic
          const currentSemester = now.getMonth() < 6 ? 2 : 1;
          const base = (API_BASE!==undefined ? API_BASE : PROFILE_API_BASE) || '';
          const res = await fetch(`${base}/api/sinhvien/${encodeURIComponent(mssv)}/diem?namHoc=${currentYear}&hocKi=${currentSemester}`);
          const grades = res.ok ? await res.json() : [];
          const g = Array.isArray(grades) && grades.length ? grades[0] : null;
          function evalGrade(score, type){
            if (!score || score === 0) return { text: 'Chưa có', cls: 'bg-gray-500' };
            if (type==='gpa'){
              if (score >= 3.6) return { text:'Xuất sắc', cls:'bg-purple-500' };
              if (score >= 3.2) return { text:'Giỏi', cls:'bg-green-500' };
              if (score >= 2.5) return { text:'Khá', cls:'bg-blue-500' };
              if (score >= 2.0) return { text:'Trung bình', cls:'bg-yellow-500' };
              return { text:'Yếu', cls:'bg-red-500' };
            } else {
              if (score >= 90) return { text:'Xuất sắc', cls:'bg-purple-500' };
              if (score >= 80) return { text:'Giỏi', cls:'bg-green-500' };
              if (score >= 70) return { text:'Khá', cls:'bg-blue-500' };
              if (score >= 60) return { text:'Trung bình', cls:'bg-yellow-500' };
              return { text:'Yếu', cls:'bg-red-500' };
            }
          }
          if (g){
            const gpa = evalGrade(g.DiemTBM_4, 'gpa');
            const drl = evalGrade(g.TongDRL, 'training');
            box.innerHTML = `
              <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">Kết quả học tập</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded border-l-4 border-green-500">
                  <div class="text-xs text-green-700 font-bold uppercase mb-1">Điểm trung bình</div>
                  <div class="flex justify-between text-sm"><span class="text-gray-600">Hệ số 4</span><span class="font-semibold">${g.DiemTBM_4 ?? 'N/A'}</span></div>
                  <div class="flex justify-between text-sm"><span class="text-gray-600">Hệ số 10</span><span class="font-semibold">${g.DiemTBM_10 ?? 'N/A'}</span></div>
                  <span class="mt-2 inline-block activity-status ${gpa.cls} text-[11px]">${gpa.text}</span>
                </div>
                <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded border-l-4 border-blue-500">
                  <div class="text-xs text-blue-700 font-bold uppercase mb-1">Điểm rèn luyện</div>
                  <div class="flex justify-between text-sm"><span class="text-gray-600">Tổng điểm</span><span class="font-semibold">${g.TongDRL ?? 'N/A'}</span></div>
                  <div class="flex justify-between text-sm mt-1"><span class="text-gray-600">VP Nhà trường</span><span class="font-semibold text-red-600">${g.viphamNT || 0}</span></div>
                  <div class="flex justify-between text-sm mt-1"><span class="text-gray-600">VP Xã hội</span><span class="font-semibold text-red-600">${g.viphamXH || 0}</span></div>
                  <span class="mt-2 inline-block activity-status ${drl.cls} text-[11px]">${drl.text}</span>
                </div>
              </div>
              <div class="text-[11px] text-gray-500 mt-1">Năm học: ${g.NamHoc} • Học kì: ${g.HocKi}</div>
            `;
          } else {
            box.innerHTML = '<div class="text-sm text-gray-500">Chưa có dữ liệu điểm cho năm học hiện tại.</div>';
          }
        } catch {
          box.innerHTML = '<div class="text-sm text-gray-500">Không tải được kết quả học tập.</div>';
        }
      }
    }
    modal.classList.remove('hidden');
  }

  // ===== Student-like Preview (shared) =====
  async function openStudentPreviewShared(mssv){
    const id = mssv || getCurrentMSSV(); if (!id) return alert('Không tìm thấy MSSV');
    try {
      const base = PROFILE_API_BASE || '';
      const res = await fetch(`${base}/api/sinhvien/${encodeURIComponent(id)}`);
      if (res.status === 404) return alert('Không tìm thấy sinh viên.');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sv = await res.json();
      const currentYear = new Date().getFullYear();
      const currentSemester = new Date().getMonth() < 6 ? 2 : 1;
      const gradesRes = await fetch(`${base}/api/sinhvien/${encodeURIComponent(id)}/diem?namHoc=${currentYear}&hocKi=${currentSemester}`);
      const grades = gradesRes.ok ? await gradesRes.json() : [];
      const years = Array.from({length:6}, (_,i)=> currentYear - i);
      const semesters = [1,2,3];
      const evaluate = (score, type)=>{
        if (!score || score===0) return { text:'Chưa có', class:'bg-gray-500' };
        if (type==='gpa'){
          if (score>=3.6) return { text:'Xuất sắc', class:'bg-purple-500' };
          if (score>=3.2) return { text:'Giỏi', class:'bg-green-500' };
          if (score>=2.5) return { text:'Khá', class:'bg-blue-500' };
          if (score>=2.0) return { text:'Trung bình', class:'bg-yellow-500' };
          return { text:'Yếu', class:'bg-red-500' };
        } else {
          if (score>=90) return { text:'Xuất sắc', class:'bg-purple-500' };
          if (score>=80) return { text:'Giỏi', class:'bg-green-500' };
          if (score>=70) return { text:'Khá', class:'bg-blue-500' };
          if (score>=60) return { text:'Trung bình', class:'bg-yellow-500' };
          return { text:'Yếu', class:'bg-red-500' };
        }
      };
      const currentGrade = Array.isArray(grades) && grades.length ? grades[0] : null;
      const gpaEval = evaluate(currentGrade?.DiemTBM_4,'gpa');
      const trainingEval = evaluate(currentGrade?.TongDRL,'training');
      
      let studentEkycApproved = false;
      let ekycBannerHTML = '<div class="spinner-border spinner-border-sm text-primary mr-2" role="status"></div> Đang tải trạng thái...';
      try {
          const ekycRes = await fetch(`${base}/api/ekyc/status`, { headers: { 'X-User': id } });
          if (ekycRes.ok) {
              const ekycData = await ekycRes.json();
              if (ekycData.status === 'Approved') {
                  studentEkycApproved = true;
                  ekycBannerHTML = `
                      <div class="bg-green-50 p-4 rounded-lg border border-green-200 flex justify-between items-center">
                          <div class="flex items-center gap-3">
                              <div class="bg-green-100 text-green-600 p-2 rounded-full"><i class="bi bi-shield-check" style="font-size: 1.5rem;"></i></div>
                              <div>
                                  <h5 class="text-sm font-bold text-green-800 mb-0">Đã xác thực thành công</h5>
                                  <p class="text-xs text-green-600 mb-0">Tài khoản đã được bảo vệ</p>
                              </div>
                          </div>
                          <a href="/ekyc.html" class="text-xs bg-white text-green-700 px-3 py-1.5 rounded-md border border-green-300 hover:bg-green-50">Xem hồ sơ</a>
                      </div>
                  `;
              } else if (ekycData.status === 'Pending') {
                  ekycBannerHTML = `
                      <div class="bg-yellow-50 p-4 rounded-lg border border-yellow-200 flex justify-between items-center">
                          <div class="flex items-center gap-3">
                              <div class="bg-yellow-100 text-yellow-600 p-2 rounded-full"><i class="bi bi-hourglass-split" style="font-size: 1.5rem;"></i></div>
                              <div>
                                  <h5 class="text-sm font-bold text-yellow-800 mb-0">Đang chờ phê duyệt</h5>
                                  <p class="text-xs text-yellow-600 mb-0">Hồ sơ của bạn đang được cán bộ kiểm tra</p>
                              </div>
                          </div>
                          <a href="/ekyc.html" class="text-xs bg-white text-yellow-700 px-3 py-1.5 rounded-md border border-yellow-300 hover:bg-yellow-50">Xem tiến độ</a>
                      </div>
                  `;
              } else {
                  ekycBannerHTML = `
                      <div class="bg-orange-50 p-4 rounded-lg border border-orange-200 flex justify-between items-center">
                          <div class="flex items-center gap-3">
                              <div class="bg-orange-100 text-orange-600 p-2 rounded-full"><i class="bi bi-shield-exclamation" style="font-size: 1.5rem;"></i></div>
                              <div>
                                  <h5 class="text-sm font-bold text-orange-800 mb-0">Chưa xác thực</h5>
                                  <p class="text-xs text-orange-600 mb-0">Vui lòng thực hiện eKYC để mở khóa tính năng</p>
                              </div>
                          </div>
                          <a href="/ekyc.html" class="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-md hover:bg-orange-600 font-bold">Xác thực ngay</a>
                      </div>
                  `;
              }
          }
      } catch (e) {
          ekycBannerHTML = '<div class="text-xs text-red-500">Lỗi tải trạng thái eKYC</div>';
      }

      const t = document.getElementById('modal-title');
      const b = document.getElementById('modal-body');
      if (!t || !b) return;
      t.textContent = `Thông tin sinh viên - ${sv.TenSV || 'N/A'} (${sv.MSSV || id})`;
      b.innerHTML = `
        <div class="space-y-6">
          <div class="flex items-start gap-6">
            <div class="flex flex-col items-center gap-3 relative">
              <img class="w-24 h-24 rounded-full object-cover border ${studentEkycApproved ? 'border-4 border-green-500' : ''}" src="${sv.AnhDD ? `data:image/jpeg;base64,${sv.AnhDD}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(sv.TenSV || sv.MSSV || id)}&background=0D8ABC&color=fff`}" alt="Avatar">
              ${studentEkycApproved ? `
              <div class="absolute bg-green-500 text-white rounded-full p-1" style="bottom: 30px; right: 0; box-shadow: 0 0 0 2px white;">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
              </div>` : ""}
            </div>
            <div class="flex-1 space-y-4">
              <div class="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                <h4 class="text-sm font-bold text-blue-700 uppercase tracking-wide mb-2">Mã số sinh viên</h4>
                <p class="text-lg font-mono font-bold text-blue-800">${sv.MSSV || id}</p>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Họ và tên</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.TenSV || 'Chưa có thông tin'}</p>
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Email</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.Email || 'Chưa có email'}</p>
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Số điện thoại</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.SDT || 'Chưa có số điện thoại'}</p>
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Địa chỉ</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.DiaChi || 'Chưa có địa chỉ'}</p>
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Lớp</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.TenLop ?? sv.MaLop ?? 'Chưa có thông tin'}</p>
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Khoa</label>
                  <p class="text-sm font-semibold text-gray-800">${sv.TenKhoa ?? sv.MaKH ?? 'Chưa có thông tin'}</p>
                </div>
              </div>
            </div>
            </div>
          </div>
          <!-- Trạng thái eKYC -->
          <div class="mt-6 border-t border-gray-200 pt-4">
             <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Xác thực danh tính (eKYC)</h4>
             <div id="preview-ekyc-status-display">
                 ${ekycBannerHTML}
             </div>
          </div>
          <div class="space-y-4 mt-6 border-t border-gray-200 pt-4">
            <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-2">Kết quả học tập</h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Năm học</label>
                <select id="preview-filter-namhoc" class="w-full border rounded-md px-3 py-2 text-sm">
                  ${years.map(y => `<option value="${y}" ${y===currentYear?'selected':''}>${y}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Học kì</label>
                <select id="preview-filter-hocki" class="w-full border rounded-md px-3 py-2 text-sm">
                  ${semesters.map(s => `<option value="${s}" ${s===currentSemester?'selected':''}>${s}</option>`).join('')}
                </select>
              </div>
              <div class="flex items-end">
                <button id="preview-apply-filter" class="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">Áp dụng</button>
              </div>
            </div>
            <div id="preview-grades-display" class="space-y-4">
              ${currentGrade ? `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-l-4 border-green-500">
                    <h5 class="text-sm font-bold text-green-700 uppercase tracking-wide mb-2">Điểm trung bình môn</h5>
                    <div class="space-y-2">
                      <div class="flex justify-between"><span class="text-sm text-gray-600">Hệ số 4:</span><span class="font-bold text-lg">${currentGrade.DiemTBM_4 || 'N/A'}</span></div>
                      <div class="flex justify-between"><span class="text-sm text-gray-600">Hệ số 10:</span><span class="font-bold text-lg">${currentGrade.DiemTBM_10 || 'N/A'}</span></div>
                      <div class="mt-2"><span class="activity-status ${gpaEval.class} text-xs">${gpaEval.text}</span></div>
                    </div>
                  </div>
                  <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border-l-4 border-blue-500">
                    <h5 class="text-sm font-bold text-blue-700 uppercase tracking-wide mb-2">Điểm rèn luyện</h5>
                    <div class="space-y-1">
                      <div class="flex justify-between"><span class="text-sm text-gray-600">Tổng điểm:</span><span class="font-bold text-lg">${currentGrade.TongDRL || 'N/A'}</span></div>
                      <div class="flex justify-between"><span class="text-sm text-gray-600">VP Nhà trường:</span><span class="font-bold text-red-600">${currentGrade.viphamNT || 0}</span></div>
                      <div class="flex justify-between"><span class="text-sm text-gray-600">VP Xã hội:</span><span class="font-bold text-red-600">${currentGrade.viphamXH || 0}</span></div>
                      <div class="mt-2"><span class="activity-status ${trainingEval.class} text-xs">${trainingEval.text}</span></div>
                    </div>
                  </div>
                </div>
                <div class="text-xs text-gray-500 text-center">Năm học: ${currentGrade.NamHoc} - Học kì: ${currentGrade.HocKi}</div>
              ` : `
                <div class="text-center py-8 text-gray-500"><p>Chưa có dữ liệu điểm cho năm học và học kì đã chọn.</p></div>
              `}
            </div>
            <!-- Lịch sử điểm -->
            <div class="mt-6 border-t border-gray-200 pt-4">
              <div class="flex justify-between items-center mb-3">
                <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide">Lịch sử cộng điểm</h4>
                <button type="button" id="preview-btn-history" class="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-200 font-semibold shadow-sm transition-colors duration-200">Xem chi tiết</button>
              </div>
              <div id="preview-history-display" class="hidden">
                 <div class="text-center text-xs text-gray-500 py-4">Đang tải lịch sử...</div>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <button type="button" id="preview-btn-edit" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Chỉnh sửa thông tin</button>
            <button type="button" id="preview-btn-close" class="px-4 py-2 border rounded-md hover:bg-gray-100">Đóng</button>
          </div>
        </div>`;
      document.getElementById('preview-btn-close')?.addEventListener('click', ()=> document.getElementById('modal')?.classList.add('hidden'));
      document.getElementById('preview-btn-edit')?.addEventListener('click', ()=> openStudentEditShared(id));
      document.getElementById('preview-apply-filter')?.addEventListener('click', async ()=>{
        const y = document.getElementById('preview-filter-namhoc').value;
        const hk = document.getElementById('preview-filter-hocki').value;
        const base2 = PROFILE_API_BASE || '';
        try{
          const res2 = await fetch(`${base2}/api/sinhvien/${encodeURIComponent(id)}/diem?${new URLSearchParams({ namHoc: y, hocKi: hk }).toString()}`);
          if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
          const newGrades = await res2.json();
          const disp = document.getElementById('preview-grades-display');
          if (Array.isArray(newGrades) && newGrades.length){
            const grade = newGrades[0];
            const gpa = evaluate(grade.DiemTBM_4,'gpa');
            const drl = evaluate(grade.TongDRL,'training');
            disp.innerHTML = `
              <div class=\"grid grid-cols-1 md:grid-cols-2 gap-4\"> 
                <div class=\"bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-l-4 border-green-500\"> 
                  <h5 class=\"text-sm font-bold text-green-700 uppercase tracking-wide mb-2\">Điểm trung bình môn</h5>
                  <div class=\"space-y-2\"><div class=\"flex justify-between\"><span class=\"text-sm text-gray-600\">Hệ số 4:</span><span class=\"font-bold text-lg\">${grade.DiemTBM_4 || 'N/A'}</span></div><div class=\"flex justify-between\"><span class=\"text-sm text-gray-600\">Hệ số 10:</span><span class=\"font-bold text-lg\">${grade.DiemTBM_10 || 'N/A'}</span></div><div class=\"mt-2\"><span class=\"activity-status ${gpa.class} text-xs\">${gpa.text}</span></div></div>
                </div>
                <div class=\"bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border-l-4 border-blue-500\">
                  <h5 class=\"text-sm font-bold text-blue-700 uppercase tracking-wide mb-2\">Điểm rèn luyện</h5>
                  <div class=\"space-y-1\">
                    <div class=\"flex justify-between\"><span class=\"text-sm text-gray-600\">Tổng điểm:</span><span class=\"font-bold text-lg\">${grade.TongDRL || 'N/A'}</span></div>
                    <div class=\"flex justify-between\"><span class=\"text-sm text-gray-600\">VP Nhà trường:</span><span class=\"font-bold text-red-600\">${grade.viphamNT || 0}</span></div>
                    <div class=\"flex justify-between\"><span class=\"text-sm text-gray-600\">VP Xã hội:</span><span class=\"font-bold text-red-600\">${grade.viphamXH || 0}</span></div>
                    <div class=\"mt-2\"><span class=\"activity-status ${drl.class} text-xs\">${drl.text}</span></div>
                  </div>
                </div>
              </div>
              <div class=\"text-xs text-gray-500 text-center\">Năm học: ${grade.NamHoc} - Học kì: ${grade.HocKi}</div>`;
          } else {
            disp.innerHTML = '<div class="text-center py-8 text-gray-500"><p>Chưa có dữ liệu điểm cho năm học và học kì đã chọn.</p></div>';
          }
          // Hide history if filter changes
          document.getElementById('preview-history-display')?.classList.add('hidden');
        }catch(err){ alert('Không thể tải dữ liệu điểm: '+(err.message||err)); }
      });
      document.getElementById('preview-btn-history')?.addEventListener('click', async ()=>{
        const disp = document.getElementById('preview-history-display');
        if (!disp) return;
        if (!disp.classList.contains('hidden')) {
            disp.classList.add('hidden');
            return;
        }
        disp.classList.remove('hidden');
        disp.innerHTML = '<div class="text-center text-xs text-gray-500 py-4">Đang tải lịch sử...</div>';
        try {
            const y = document.getElementById('preview-filter-namhoc').value;
            const hk = document.getElementById('preview-filter-hocki').value;
            const base3 = PROFILE_API_BASE || '';
            const res3 = await fetch(`${base3}/api/sinhvien/${encodeURIComponent(id)}/points-history?${new URLSearchParams({ namHoc: y, hocKi: hk }).toString()}`);
            if (!res3.ok) throw new Error(`HTTP ${res3.status}`);
            const history = await res3.json();
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
    } catch(e){ alert('Không tải được thông tin sinh viên: '+(e.message||e)); }
  }

  async function openStudentEditShared(mssv){
    const id = mssv || getCurrentMSSV(); if (!id) return alert('Không tìm thấy MSSV');
    try {
      const base = PROFILE_API_BASE || '';
      const res = await fetch(`${base}/api/sinhvien/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sv = await res.json();
      let studentEkycApproved = false;
      let editEkycBannerHTML = '';
      try {
          const ekycRes = await fetch(`${base}/api/ekyc/status`, { headers: { 'X-User': id } });
          if (ekycRes.ok) {
              const ekycData = await ekycRes.json();
              if (ekycData.status === 'Approved') {
                  studentEkycApproved = true;
                  editEkycBannerHTML = `
                      <div class="bg-green-50 border-l-4 border-green-500 text-green-800 p-4 mb-4 rounded shadow-sm flex justify-between items-center">
                          <div>
                              <p class="font-bold flex items-center gap-2"><i class="bi bi-shield-check"></i> Đã xác thực eKYC</p>
                              <p class="text-sm">Tài khoản của bạn đã được xác minh an toàn.</p>
                          </div>
                          <a href="/ekyc.html" class="bg-white hover:bg-green-100 text-green-700 border border-green-300 font-bold py-1.5 px-3 rounded text-xs no-underline whitespace-nowrap ml-4">Xem hồ sơ</a>
                      </div>
                  `;
              } else if (ekycData.status === 'Pending') {
                  editEkycBannerHTML = `
                      <div class="bg-yellow-50 border-l-4 border-yellow-500 text-yellow-800 p-4 mb-4 rounded shadow-sm flex justify-between items-center">
                          <div>
                              <p class="font-bold flex items-center gap-2"><i class="bi bi-hourglass-split"></i> Đang chờ phê duyệt</p>
                              <p class="text-sm">Yêu cầu eKYC của bạn đang được cán bộ kiểm tra.</p>
                          </div>
                          <a href="/ekyc.html" class="bg-white hover:bg-yellow-100 text-yellow-700 border border-yellow-300 font-bold py-1.5 px-3 rounded text-xs no-underline whitespace-nowrap ml-4">Xem tiến độ</a>
                      </div>
                  `;
              } else {
                  editEkycBannerHTML = `
                      <div class="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mb-4 rounded shadow-sm flex justify-between items-center">
                          <div>
                              <p class="font-bold flex items-center gap-2"><i class="bi bi-shield-exclamation"></i> Chưa xác thực eKYC</p>
                              <p class="text-sm">Tài khoản của bạn chưa được xác thực. Vui lòng xác thực khuôn mặt và Thẻ sinh viên để mở khóa toàn bộ tính năng.</p>
                          </div>
                          <a href="/ekyc.html" class="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded text-sm no-underline whitespace-nowrap ml-4">Xác thực ngay</a>
                      </div>
                  `;
              }
          }
      } catch(e) {}

      const t = document.getElementById('modal-title');
      const b = document.getElementById('modal-body');
      t.textContent = `${sv.TenSV || 'Thông tin sinh viên'} (${sv.MSSV || id})`;
      b.innerHTML = `
        <form id=\"sv-form\" class=\"space-y-6\">
          <div id="edit-ekyc-status-banner">${editEkycBannerHTML}</div>
          <div class=\"flex items-start gap-6\">
            <div class=\"flex flex-col items-center gap-3 relative\">
              <img id=\"sv-avatar-img\" class=\"w-24 h-24 rounded-full object-cover ${studentEkycApproved ? 'border-4 border-green-500' : 'border'}\" src=\"${sv.AnhDD ? `data:image/jpeg;base64,${sv.AnhDD}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(sv.TenSV || sv.MSSV || id)}&background=0D8ABC&color=fff`}\" alt=\"Avatar\">
              ${studentEkycApproved ? `
              <div class=\"absolute bg-green-500 text-white rounded-full p-1\" style=\"bottom: 30px; right: 0; box-shadow: 0 0 0 2px white;\">
                <svg class=\"w-4 h-4\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"3\" d=\"M5 13l4 4L19 7\"></path></svg>
              </div>` : `
              <label class=\"text-xs font-medium\">Đổi ảnh đại diện</label>
              <input id=\"sv-avatar\" type=\"file\" accept=\"image/*\" class=\"text-xs\" />
              `}
            </div>
            <div class=\"flex-1 space-y-4\">
              <div class=\"bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400\">
                <h4 class=\"text-sm font-bold text-blue-700 uppercase tracking-wide mb-2\">Mã số sinh viên</h4>
                <input type=\"text\" class=\"w-full border rounded-md px-3 py-2 bg-gray-100\" value=\"${sv.MSSV || id}\" disabled />
              </div>
              <div class=\"grid grid-cols-1 md:grid-cols-2 gap-4\">
                <div><label class=\"block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1\">Họ và tên</label>
                  <input id=\"sv-ten\" type=\"text\" class=\"w-full border rounded-md px-3 py-2 bg-gray-100\" value=\"${sv.TenSV || ''}\" disabled></div>
                <div><label class=\"block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1\">Email</label>
                  <input id=\"sv-email\" type=\"email\" class=\"w-full border rounded-md px-3 py-2 bg-gray-100\" value=\"${sv.Email || ''}\" disabled></div>
              </div>
              <div class=\"grid grid-cols-1 md:grid-cols-2 gap-4\">
                <div><label class=\"block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1\">Số điện thoại</label>
                  <input id=\"sv-sdt\" type=\"text\" class=\"w-full border rounded-md px-3 py-2\" value=\"${sv.SDT || ''}\"></div>
                <div><label class=\"block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1\">Địa chỉ</label>
                  <input id=\"sv-diachi\" type=\"text\" class=\"w-full border rounded-md px-3 py-2\" value=\"${sv.DiaChi || ''}\"></div>
              </div>
              <div class=\"grid grid-cols-1 md:grid-cols-2 gap-4\">
                <div><label class=\"block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1\">Lớp</label>
                  <input type=\"text\" class=\"w-full border rounded-md px-3 py-2 bg-gray-100\" value=\"${sv.TenLop ?? sv.MaLop ?? ''}\" disabled /></div>
                <div><label class=\"block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1\">Khoa</label>
                  <input type=\"text\" class=\"w-full border rounded-md px-3 py-2 bg-gray-100\" value=\"${sv.TenKhoa ?? sv.MaKH ?? ''}\" disabled /></div>
              </div>
              <div class=\"flex justify-end gap-2 pt-2 border-t border-gray-100\">
                <button type=\"button\" id=\"btn-cancel-sv\" class=\"px-3 py-2 border rounded-md hover:bg-gray-100\">Hủy</button>
                <button type=\"button\" id=\"btn-save-sv\" class=\"px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700\">Lưu thay đổi</button>
              </div>
            </div>
          </div>
        </form>`;
      document.getElementById('modal')?.classList.remove('hidden');
      document.getElementById('btn-cancel-sv')?.addEventListener('click', ()=> document.getElementById('modal')?.classList.add('hidden'));
      document.getElementById('btn-save-sv')?.addEventListener('click', async ()=>{
        const phone = (document.getElementById('sv-sdt').value||'').trim();
        const addr  = (document.getElementById('sv-diachi').value||'').trim();
        if (!validatePhone(phone)) return alert('Số điện thoại không hợp lệ (cần 9-13 chữ số).');
        try{
          const resp = await fetch(`${base}/api/sinhvien/${encodeURIComponent(sv.MSSV || id)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ SDT: phone||null, DiaChi: addr||null }) });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          alert('Cập nhật thông tin sinh viên thành công!');
          document.getElementById('modal')?.classList.add('hidden');
        }catch(err){ alert('Cập nhật thất bại: '+(err.message||err)); }
      });
      const avatarInput = document.getElementById('sv-avatar');
      avatarInput?.addEventListener('change', async (ev)=>{
        let file = ev.target.files && ev.target.files[0]; if (!file) return;
        
        // ✅ Convert HEIC to JPEG if needed
        if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
          console.log('[AVATAR-DIRECT] Phát hiện HEIC format, đang convert sang JPEG...');
          showHEICLoadingSpinner();
          try {
            if (window.heic2any) {
              const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
              file = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
              console.log('[AVATAR-DIRECT] ✓ Convert HEIC → JPEG thành công');
            } else {
              console.warn('[AVATAR-DIRECT] heic2any not available, trying canvas...');
              const img = new Image();
              img.src = URL.createObjectURL(ev.target.files[0]);
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                canvas.getContext('2d').drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                  file = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
                  hideHEICLoadingSpinner();
                  doUpload();
                }, 'image/jpeg', 0.9);
              };
              return;
            }
          } catch (err) {
            console.warn('[AVATAR-DIRECT] HEIC conversion failed:', err);
            hideHEICLoadingSpinner();
            alert('⚠️ Không thể convert ảnh HEIC. Vui lòng upload format JPG/PNG.');
            return;
          }
          hideHEICLoadingSpinner();
        }
        
        doUpload();
        
        async function doUpload() {
          const fd = new FormData(); fd.append('file', file);
          try{
            const resp = await fetch(`${base}/api/sinhvien/${encodeURIComponent(sv.MSSV || id)}/avatar`, { method:'POST', body: fd });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const img = document.getElementById('sv-avatar-img'); if (img) img.src = URL.createObjectURL(file);
            const reader = new FileReader(); reader.onload = ()=>{ const url = typeof reader.result==='string' ? reader.result : null; if (url){ try{ localStorage.setItem('userAvatar', url); }catch{} const header = document.getElementById('cbl-avatar')||document.getElementById('header-avatar'); if (header) header.src = url; } }; reader.readAsDataURL(file);
            alert('✓ Đổi ảnh đại diện thành công!');
          }catch(err){ alert('Tải ảnh thất bại: '+(err.message||err)); }
        }
      });
    } catch(e){ alert('Không tải được thông tin sinh viên: '+(e.message||e)); }
  }

  function initProfileEditorShared(opts){
    if (!opts || initProfileEditorShared._inited) return; initProfileEditorShared._inited = true;
    const {
      API_BASE = '',
      openButtonId,
      saveButtonId,
      avatarFileInputId,
      avatarPreviewImgId,
      phoneInputId,
      addressInputId,
      metricsContainerId
    } = opts;
    wireAvatarFile(document.getElementById(avatarFileInputId), document.getElementById(avatarPreviewImgId));
    const openBtn = document.getElementById(openButtonId);
    if (openBtn) openBtn.addEventListener('click', ()=> openModal(opts));
    const saveBtn = document.getElementById(saveButtonId);
    if (saveBtn) saveBtn.addEventListener('click', ()=> saveProfile(opts));
  }

  global.initProfileEditorShared = initProfileEditorShared;
  global.initProfileShared = initProfileShared;
  global.openStudentPreviewShared = openStudentPreviewShared;
  global.openStudentEditShared = openStudentEditShared;
})(window);
