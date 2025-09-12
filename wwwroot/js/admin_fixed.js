// Admin JavaScript - Fixed Version
document.addEventListener("DOMContentLoaded", function() {
  console.log('Admin script loaded');

  // API Configuration
  const API_BASE = 'http://192.168.2.2:5204';
  
  // Helper function to add user header
  function withUserHeader(options = {}) {
    const userInfo = JSON.parse(localStorage.getItem('loggedUserInfo') || '{}');
    return {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userInfo.token || ''}`,
        ...options.headers
      }
    };
  }

  // Check user info function
  async function checkUserInfo(maCaNhan) {
    try {
      const response = await fetch(`${API_BASE}/api/user-info/${maCaNhan}`, withUserHeader({}));
      if (response.ok) {
        const data = await response.json();
        console.log('User info data:', data);
        
        const statusElement = document.getElementById(`info-status-${maCaNhan}`);
        const addInfoBtn = document.getElementById(`add-info-btn-${maCaNhan}`);
        
        if (data.infoType === 'admin') {
          statusElement.textContent = 'Không cần thông tin';
          statusElement.className = 'text-gray-500 font-medium';
          if (addInfoBtn) addInfoBtn.style.display = 'none';
        } else if (data.hasInfo) {
          let statusText = "Đã có thông tin";
          let statusClass = "text-green-600 font-medium user-info-preview";
          
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
          
          // Add hover preview listeners
          addHoverPreviewListeners(statusElement, maCaNhan);
        } else {
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

  // Add hover preview listeners
  function addHoverPreviewListeners(element, maCaNhan) {
    let tooltip = null;
    let hoverTimeout = null;
    
    element.addEventListener('mouseenter', () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      
      hoverTimeout = setTimeout(() => {
        showUserPreview(maCaNhan, element);
      }, 500);
    });
    
    element.addEventListener('mouseleave', () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      hideUserPreview();
    });
  }

  // Show user preview
  function showUserPreview(maCaNhan, element) {
    hideUserPreview();
    
    const tooltip = createUserPreviewTooltip();
    document.body.appendChild(tooltip);
    
    showLoadingState(tooltip);
    
    fetchUserDetails(maCaNhan)
      .then(data => {
        if (data) {
          populateUserPreview(tooltip, data);
        } else {
          showErrorState(tooltip, 'Không thể tải thông tin');
        }
      })
      .catch(error => {
        console.error('Error fetching user details:', error);
        showErrorState(tooltip, 'Lỗi tải thông tin');
      });
    
    // Position tooltip
    const rect = element.getBoundingClientRect();
    tooltip.style.left = Math.min(rect.left, window.innerWidth - 400) + 'px';
    tooltip.style.top = (rect.bottom + 10) + 'px';
  }

  // Hide user preview
  function hideUserPreview() {
    const existing = document.querySelector('.user-info-tooltip');
    if (existing) {
      existing.remove();
    }
  }

  // Create user preview tooltip
  function createUserPreviewTooltip() {
    const tooltip = document.createElement('div');
    tooltip.className = 'user-info-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
      padding: 16px;
      max-width: 400px;
      z-index: 1000;
      font-size: 14px;
    `;
    return tooltip;
  }

  // Show loading state
  function showLoadingState(tooltip) {
    tooltip.innerHTML = '<div class="text-center text-gray-500">Đang tải...</div>';
  }

  // Show error state
  function showErrorState(tooltip, message) {
    tooltip.innerHTML = `<div class="text-center text-red-500">${message}</div>`;
  }

  // Fetch user details
  async function fetchUserDetails(maCaNhan) {
    try {
      const response = await fetch(`${API_BASE}/api/user-info/${maCaNhan}`, withUserHeader({}));
      if (response.ok) {
        const data = await response.json();
        if (data.hasInfo) {
          if (data.infoType === 'giangvien') {
            return await fetchGiangVienDetails(maCaNhan);
          } else if (data.infoType === 'sinhvien') {
            return await fetchSinhVienDetails(maCaNhan);
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error fetching user details:', error);
      return null;
    }
  }

  // Fetch giang vien details
  async function fetchGiangVienDetails(maCaNhan) {
    try {
      const response = await fetch(`${API_BASE}/api/giangvien/${maCaNhan}`, withUserHeader({}));
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching giangvien details:', error);
    }
    return null;
  }

  // Fetch sinh vien details
  async function fetchSinhVienDetails(maCaNhan) {
    try {
      const response = await fetch(`${API_BASE}/api/sinhvien/${maCaNhan}`, withUserHeader({}));
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching sinhvien details:', error);
    }
    return null;
  }

  // Populate user preview
  function populateUserPreview(tooltip, data) {
    let content = '<div class="space-y-2">';
    
    if (data.TenGV) {
      content += `<div><strong>Họ tên:</strong> ${data.TenGV}</div>`;
      content += `<div><strong>SĐT:</strong> ${data.SDT || 'Chưa có'}</div>`;
      content += `<div><strong>Email:</strong> ${data.Email || 'Chưa có'}</div>`;
      content += `<div><strong>Lớp CN:</strong> ${data.LopCV || 'Chưa có'}</div>`;
      content += `<div><strong>Địa chỉ:</strong> ${data.DiaChi || 'Chưa có'}</div>`;
    } else if (data.TenSV) {
      content += `<div><strong>Họ tên:</strong> ${data.TenSV}</div>`;
      content += `<div><strong>SĐT:</strong> ${data.SDT || 'Chưa có'}</div>`;
      content += `<div><strong>Email:</strong> ${data.Email || 'Chưa có'}</div>`;
      content += `<div><strong>Lớp:</strong> ${data.MaLop || 'Chưa có'}</div>`;
      content += `<div><strong>Khóa học:</strong> ${data.MaKhoa || 'Chưa có'}</div>`;
      content += `<div><strong>Địa chỉ:</strong> ${data.DiaChi || 'Chưa có'}</div>`;
    }
    
    content += '</div>';
    tooltip.innerHTML = content;
  }

  // Load users function
  async function loadUsers(searchTerm = '') {
    try {
      const tbody = document.getElementById('users-table-body');
      if (!tbody) return;
      
      tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Đang tải dữ liệu...</td></tr>';
      
      const url = searchTerm ? 
        `${API_BASE}/api/users?search=${encodeURIComponent(searchTerm)}` : 
        `${API_BASE}/api/users`;
      
      const response = await fetch(url, withUserHeader({}));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const users = await response.json();
      
      if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Không có người dùng nào</td></tr>';
        return;
      }
      
      tbody.innerHTML = users.map(user => `
        <tr class="hover:bg-gray-50">
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.TenTK}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.TenNguoiDung}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.ChucVu}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <span id="info-status-${user.MaCaNhan}" class="text-gray-500">Đang kiểm tra...</span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <div class="action-buttons">
              <button onclick="editUser('${user.MaCaNhan}')" 
                      class="action-btn bg-blue-500"
                      title="Chỉnh sửa thông tin người dùng">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
                <span>Chỉnh sửa</span>
              </button>
              
              <button onclick="lockUser('${user.MaCaNhan}')" 
                     class="action-btn ${user.TrangThai ? 'bg-orange-500' : 'bg-emerald-500'}"
                     title="${user.TrangThai ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
                <span>${user.TrangThai ? 'Khóa' : 'Mở khóa'}</span>
              </button>
              
              <button onclick="deleteUser('${user.MaCaNhan}')" 
                     class="action-btn bg-red-500"
                     title="Xóa người dùng">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                <span>Xóa</span>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
      
      // Check user info for each user
      users.forEach(user => {
        checkUserInfo(user.MaCaNhan);
      });
      
    } catch (error) {
      console.error('Error loading users:', error);
      const tbody = document.getElementById('users-table-body');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Lỗi tải dữ liệu</td></tr>';
      }
    }
  }

  // Open add user modal
  async function openAddUserModal() {
    const modal = document.getElementById("user-modal");
    const closeBtn = document.getElementById("user-modal-close");
    const cancelBtn = document.getElementById("user-cancel");
    const form = document.getElementById("user-form");
    const roleSelect = document.getElementById("u-maqt");
    const modalTitle = modal.querySelector("h3");
    
    modalTitle.textContent = "Thêm người dùng mới";
    form.reset();

    // Load roles
    try {
      const res = await fetch(`${API_BASE}/api/quantri`);
      if (res.ok) {
        const roles = await res.json();
        roleSelect.innerHTML = '<option value="">Chọn quyền</option>';
        roles.forEach(role => {
          const option = document.createElement('option');
          option.value = role.MaQT;
          option.textContent = role.TenQT;
          roleSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error loading roles:', error);
    }

    modal.classList.remove("hidden");

    const close = () => {
      modal.classList.add("hidden");
      form.reset();
      modalTitle.textContent = "Thêm người dùng mới";
    };

    closeBtn.onclick = close;
    cancelBtn.onclick = close;

    // Auto-fill role name to Chức vụ
    roleSelect.addEventListener('change', function() {
      const selectedOption = this.options[this.selectedIndex];
      if (selectedOption.value) {
        document.getElementById("u-chucvu").value = selectedOption.textContent;
      }
    });

    // Form submit handler
    form.onsubmit = async (e) => {
      e.preventDefault();
      
      const payload = {
        MaCaNhan: document.getElementById("u-macanhan").value.trim(),
        TenTK: document.getElementById("u-tentk").value.trim(),
        TenNguoiDung: document.getElementById("u-tennguoidung").value.trim(),
        ChucVu: document.getElementById("u-chucvu").value.trim(),
        MaQT: document.getElementById("u-maqt").value,
        MatKhau: document.getElementById("u-matkhau").value
      };

      try {
        const resp = await fetch(`${API_BASE}/api/users`, withUserHeader({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }));

        if (resp.ok) {
          alert('Thêm người dùng thành công');
          modal.classList.add("hidden");
          loadUsers();
        } else {
          const err = await resp.json().catch(() => ({}));
          alert('Lỗi thêm người dùng: ' + (err.message || 'Unknown error'));
        }
      } catch (e) {
        alert('Lỗi thêm người dùng: ' + e.message);
      }
    };
  }

  // Edit user function
  window.editUser = async function editUser(maCaNhan) {
    console.log('=== EDIT USER START ===', maCaNhan);
    
    const modal = document.getElementById("user-modal");
    const form = document.getElementById("user-form");
    
    if (!modal) {
      alert('Không tìm thấy modal user-modal');
      return;
    }
    
    if (!form) {
      alert('Không tìm thấy form user-form');
      return;
    }
    
    const modalTitle = modal.querySelector("h3");
    
    // Get user data
    let userData = null;
    try {
      const response = await fetch(`${API_BASE}/api/users/${maCaNhan}/details`, withUserHeader({}));
      if (response.ok) {
        userData = await response.json();
      } else {
        console.error('Failed to load user details:', response.status);
      }
    } catch (error) {
      console.error('Error loading user details:', error);
    }
    
    if (!userData) {
      alert('Không thể tải thông tin người dùng');
      return;
    }
    
    // Update title
    modalTitle.textContent = "Chỉnh sửa người dùng";
    
    // Load roles
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
        }
      }
    } catch (error) {
      console.error('Error loading roles:', error);
    }
    
    // Show modal
    modal.classList.remove("hidden");
    
    // Fill form data
    setTimeout(() => {
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
        }
      });
      
      // Select role
      const roleSelect = document.getElementById("u-maqt");
      if (roleSelect && userData.MaQT) {
        roleSelect.value = userData.MaQT;
      }
      
      // Auto-fill role name to Chức vụ
      roleSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption.value) {
          document.getElementById("u-chucvu").value = selectedOption.textContent;
        }
      });
      
      // Form submit handler
      form.onsubmit = async (e) => {
        e.preventDefault();
        
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
      
      // Close handlers
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

  // Lock user function
  window.lockUser = async function lockUser(maCaNhan) {
    if (!confirm('Bạn có chắc chắn muốn khóa tài khoản này?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/users/${maCaNhan}/lock`, withUserHeader({
        method: 'POST'
      }));
      
      if (response.ok) {
        alert('Khóa tài khoản thành công');
        loadUsers();
      } else {
        const error = await response.json().catch(() => ({}));
        alert('Lỗi khóa tài khoản: ' + (error.message || 'Unknown error'));
      }
    } catch (error) {
      alert('Lỗi khóa tài khoản: ' + error.message);
    }
  };

  // Unlock user function
  window.unlockUser = async function unlockUser(maCaNhan) {
    if (!confirm('Bạn có chắc chắn muốn mở khóa tài khoản này?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/users/${maCaNhan}/unlock`, withUserHeader({
        method: 'POST'
      }));
      
      if (response.ok) {
        alert('Mở khóa tài khoản thành công');
        loadUsers();
      } else {
        const error = await response.json().catch(() => ({}));
        alert('Lỗi mở khóa tài khoản: ' + (error.message || 'Unknown error'));
      }
    } catch (error) {
      alert('Lỗi mở khóa tài khoản: ' + error.message);
    }
  };

  // Delete user function
  window.deleteUser = async function deleteUser(maCaNhan) {
    if (!confirm('Bạn có chắc chắn muốn xóa người dùng này?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/users/${maCaNhan}`, withUserHeader({
        method: 'DELETE'
      }));
      
      if (response.ok) {
        alert('Xóa người dùng thành công');
        loadUsers();
      } else {
        const error = await response.json().catch(() => ({}));
        alert('Lỗi xóa người dùng: ' + (error.message || 'Unknown error'));
      }
    } catch (error) {
      alert('Lỗi xóa người dùng: ' + error.message);
    }
  };

  // Initialize
  function init() {
    loadUsers();
  }

  // Start the application
  try {
    init();
  } catch (error) {
    console.error('Error initializing application:', error);
  }
});
