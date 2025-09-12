# Hướng dẫn sử dụng nhanh QLDRL

## 🚀 Khởi động nhanh

### 1. Chạy ứng dụng
```bash
dotnet run
```
Truy cập: http://localhost:5204

### 2. Đăng nhập
- **Admin**: `yakhiem1412` / `Special1210`
- **Giảng viên**: `kien.dt` / `Kien123`
- **Sinh viên**: `doakhoa` / `Khoa123`

## 📋 Chức năng chính

### Giảng viên
1. **Dashboard**: Xem thống kê tổng quan
2. **Quản lý sinh viên**: 
   - Tìm kiếm sinh viên
   - Xem chi tiết (click "Xem")
   - Sửa điểm (click "Sửa điểm")
3. **Quản lý điểm**: 
   - Nhập điểm mới
   - Sửa điểm hiện có
4. **Quản lý hoạt động**: 
   - Thêm hoạt động mới
   - Xem danh sách hoạt động

### Admin
1. **Dashboard**: Thống kê hệ thống
2. **Quản lý người dùng**: Xem danh sách tài khoản
3. **Quản lý khoa/lớp**: 
   - Thêm khoa mới
   - Thêm lớp mới
4. **Quản lý hoạt động**: Thêm hoạt động
5. **Nhật ký**: Xem log hệ thống

## 🎯 Các thao tác thường dùng

### Nhập điểm sinh viên
1. Vào "Quản lý điểm rèn luyện"
2. Điền MSSV, năm học, học kì, điểm
3. Click "Lưu điểm"

### Thêm hoạt động mới
1. Vào "Quản lý hoạt động"
2. Click "Thêm hoạt động mới"
3. Điền thông tin hoạt động
4. Click "Thêm hoạt động"

### Xem bảng xếp hạng
- Truy cập trang ranking để xem xếp hạng sinh viên

## ⚠️ Lưu ý quan trọng

- Đảm bảo database đã được tạo từ script SQL
- Kiểm tra kết nối database trong appsettings.json
- Sử dụng đúng tài khoản theo vai trò
- Dữ liệu mẫu đã có sẵn trong database

## 🆘 Xử lý lỗi thường gặp

### Lỗi kết nối database
- Kiểm tra SQL Server đang chạy
- Xem lại connection string

### Lỗi 404
- Kiểm tra API endpoint
- Xem console log

### Lỗi quyền truy cập
- Đăng nhập lại
- Kiểm tra vai trò tài khoản
