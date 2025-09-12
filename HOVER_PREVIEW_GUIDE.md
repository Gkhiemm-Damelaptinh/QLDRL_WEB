# Hướng dẫn sử dụng chức năng Hover Preview

## Tổng quan
Chức năng hover preview cho phép xem trước thông tin chi tiết của người dùng khi hover vào chữ "Đã có thông tin" trong phần quản lý người dùng.

## Cách sử dụng

### 1. Truy cập giao diện Admin
- Đăng nhập với tài khoản Admin
- Vào phần "Người dùng" trong sidebar

### 2. Xem preview thông tin
- Hover chuột vào chữ "Đã có thông tin" trong cột "Thông tin"
- Chờ 300ms để preview hiển thị
- Preview sẽ hiển thị thông tin chi tiết của người dùng

### 3. Các loại thông tin hiển thị

#### Đối với Sinh viên:
- MSSV
- Họ và tên
- Số điện thoại
- Email
- Lớp
- Khoa
- Địa chỉ
- TVCLB Khoa (Có/Không)
- TVCLB Trường (Có/Không)
- CBLớp (Có/Không)

#### Đối với Giảng viên:
- Mã cá nhân
- Họ và tên
- Số điện thoại
- Email
- Khoa
- Lớp CV
- Địa chỉ

## Tính năng

### 1. Animation mượt mà
- Preview xuất hiện với hiệu ứng fade-in
- Hiển thị bên ngoài bảng để tránh bị che khuất
- Transition mượt mà khi hiển thị/ẩn
- Tự động điều chỉnh vị trí để không tràn ra ngoài màn hình

### 2. Responsive design
- Tự động điều chỉnh kích thước trên mobile
- Layout 2 cột trên desktop, 1 cột trên mobile

### 3. Smart positioning
- Tooltip hiển thị bên phải element mặc định
- Tự động chuyển sang bên trái nếu không đủ chỗ
- Căn giữa theo chiều dọc với element
- Điều chỉnh vị trí sau khi load nội dung để tránh tràn màn hình

### 4. Loading state
- Hiển thị spinner khi đang tải dữ liệu
- Thời gian loading được mô phỏng để test

### 5. Error handling
- Hiển thị thông báo lỗi nếu không tải được dữ liệu
- Graceful fallback khi API không khả dụng

## API Endpoints

### 1. Kiểm tra thông tin người dùng
```
GET /api/user-info/{maCaNhan}
```

### 2. Lấy thông tin chi tiết sinh viên
```
GET /api/sinhvien/{mssv}
```

### 3. Lấy thông tin chi tiết giảng viên
```
GET /api/giangvien/{maCaNhan}
```

## Cấu trúc CSS

### Classes chính:
- `.user-info-preview`: Container cho text có thể hover
- `.user-info-tooltip`: Tooltip hiển thị thông tin (position: fixed)
- `.preview-header`: Header với avatar và tên
- `.preview-content`: Nội dung thông tin chi tiết
- `.preview-field`: Mỗi trường thông tin

### Positioning:
- `position: fixed`: Tooltip hiển thị bên ngoài bảng
- `z-index: 9999`: Đảm bảo hiển thị trên cùng
- `max-height: 80vh`: Giới hạn chiều cao và cho phép cuộn
- `overflow-y: auto`: Cuộn dọc khi nội dung quá dài

### Animation:
- `opacity: 0` → `opacity: 1`
- `visibility: hidden` → `visibility: visible`
- `transition: all 0.3s ease`

## Test

### File test:
- `wwwroot/test-hover-preview.html`: File test độc lập với mock data

### Cách test:
1. Mở file test trong browser
2. Hover vào các dòng "Đã có thông tin"
3. Kiểm tra animation và nội dung hiển thị

## Troubleshooting

### 1. Preview không hiển thị
- Kiểm tra console để xem lỗi API
- Đảm bảo người dùng có thông tin chi tiết
- Kiểm tra network connection
- Sử dụng file test `wwwroot/test-giangvien-api.html` để debug API

### 2. Thông tin giảng viên không hiển thị
- Kiểm tra console logs để xem API response
- Đảm bảo giảng viên có thông tin trong bảng `GiangVien`
- Kiểm tra `MaCaNhan` có đúng không
- Test API trực tiếp: `GET /api/giangvien/{maCaNhan}`

### 3. Animation không mượt
- Kiểm tra CSS transition
- Đảm bảo browser hỗ trợ CSS3

### 4. Layout bị vỡ
- Kiểm tra responsive CSS
- Test trên các kích thước màn hình khác nhau

### 5. Debug API
- Mở Developer Tools (F12)
- Xem tab Console để thấy debug logs
- Kiểm tra tab Network để xem API calls
- Sử dụng file test API để kiểm tra endpoints

## Cập nhật

### Version 1.0
- ✅ Hover preview cơ bản
- ✅ Support sinh viên và giảng viên
- ✅ Animation mượt mà
- ✅ Responsive design
- ✅ Error handling
- ✅ Loading state

### Future enhancements:
- [ ] Thêm animation khi hover vào các trường khác
- [ ] Support edit inline trong preview
- [ ] Thêm keyboard navigation
- [ ] Cache data để tăng performance
