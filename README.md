# Hệ thống Quản lý Điểm Rèn luyện (QLDRL)

## Tổng quan
Hệ thống quản lý điểm rèn luyện cho Trường Đại học Kiên Giang, được phát triển bằng ASP.NET Core và JavaScript.

## Tính năng chính

### 🔐 Xác thực và Phân quyền
- Đăng nhập với 3 loại tài khoản: Admin, Giảng viên, Sinh viên
- Phân quyền truy cập theo vai trò
- Bảo mật thông tin người dùng

### 👨‍🏫 Giao diện Giảng viên
- **Dashboard**: Thống kê tổng quan, hoạt động gần đây, sinh viên xuất sắc
- **Quản lý sinh viên**: Xem danh sách, tìm kiếm, lọc theo lớp/khoa
- **Quản lý điểm rèn luyện**: Nhập, sửa, xem lịch sử điểm
- **Quản lý hoạt động**: Thêm hoạt động mới, xem danh sách
- **Báo cáo**: Tạo báo cáo thống kê

### 👨‍💼 Giao diện Admin
- **Dashboard**: Thống kê hệ thống, trạng thái hoạt động
- **Quản lý người dùng**: Xem danh sách tài khoản
- **Quản lý khoa/lớp**: Thêm, sửa khoa và lớp học
- **Quản lý hoạt động**: Thêm, sửa, xóa hoạt động
- **Cấu hình hệ thống**: Thiết lập thông số
- **Nhật ký hệ thống**: Xem log hoạt động

### 📊 Bảng xếp hạng
- Xếp hạng sinh viên theo điểm rèn luyện
- Hiển thị thông tin chi tiết sinh viên
- Phân loại đánh giá (Xuất sắc, Giỏi, Khá, Trung bình, Yếu)

## Cấu trúc dự án

```
QLDRL/
├── Program.cs                 # Backend API chính
├── database/
│   └── TaoCSDL_QLDRL.sql     # Script tạo cơ sở dữ liệu
├── wwwroot/
│   ├── index.html            # Trang đăng nhập
│   ├── giangvien.html        # Giao diện giảng viên
│   ├── admin.html            # Giao diện admin
│   ├── css/
│   │   └── style.css         # CSS tùy chỉnh
│   └── js/
│       ├── giangvien.js      # JavaScript cho giảng viên
│       └── admin.js          # JavaScript cho admin
└── README.md                 # Hướng dẫn này
```

## Cài đặt và Chạy

### Yêu cầu hệ thống
- .NET 9.0 SDK
- SQL Server (LocalDB hoặc SQL Server Express)
- Visual Studio Code hoặc Visual Studio

### Bước 1: Tạo cơ sở dữ liệu
1. Mở SQL Server Management Studio
2. Chạy script `database/TaoCSDL_QLDRL.sql`
3. Kiểm tra kết nối trong `appsettings.json`

### Bước 2: Cấu hình kết nối
Chỉnh sửa file `appsettings.json`:
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=(localdb)\\mssqllocaldb;Database=QLDRL;Trusted_Connection=true;"
  }
}
```

### Bước 3: Chạy ứng dụng
```bash
dotnet run
```

Ứng dụng sẽ chạy tại: `http://localhost:5204`

## Tài khoản mặc định

### Admin
- **Tài khoản**: `yakhiem1412`
- **Mật khẩu**: `Special1210`
- **Quyền**: Toàn quyền quản lý hệ thống

### Giảng viên
- **Tài khoản**: `kien.dt`
- **Mật khẩu**: `Kien123`
- **Quyền**: Quản lý sinh viên, điểm, hoạt động

### Sinh viên
- **Tài khoản**: `doakhoa`
- **Mật khẩu**: `Khoa123`
- **Quyền**: Xem thông tin cá nhân

## API Endpoints

### Xác thực
- `POST /api/auth/login` - Đăng nhập

### Sinh viên
- `GET /api/sinhvien` - Lấy danh sách sinh viên (có filter)
- `GET /api/sinhvien/{mssv}` - Chi tiết sinh viên
- `PUT /api/sinhvien/{mssv}` - Cập nhật thông tin sinh viên
- `POST /api/sinhvien/{mssv}/avatar` - Upload avatar
- `GET /api/sinhvien/{mssv}/diem` - Lấy điểm sinh viên

### Điểm rèn luyện
- `POST /api/diem` - Thêm/sửa điểm
- `GET /api/luutrudiemsv/ranking` - Bảng xếp hạng

### AI minh chứng
- `POST /api/ai/check-video` - Tải video minh chứng (multipart/form-data: video, name, desc). Trả về đánh giá AI sơ bộ và lưu file vào `/wwwroot/evidence/` đồng thời ghi nhận vào bảng `ActivityEvidence`.

### Hoạt động
- `GET /api/preload` - Dữ liệu cơ bản (khoa, lớp, hoạt động)
- `POST /api/hoatdong` - Thêm hoạt động mới

### Quản lý
- `GET /api/users` - Danh sách người dùng
- `POST /api/khoa` - Thêm khoa
- `POST /api/lop` - Thêm lớp
- `GET /api/stats` - Thống kê tổng quan
- `GET /api/logs` - Nhật ký hệ thống

## Cấu trúc cơ sở dữ liệu

### Bảng chính
- **TK**: Tài khoản người dùng
- **SINHVIEN**: Thông tin sinh viên
- **KHOA**: Danh sách khoa
- **Lop**: Danh sách lớp
- **HoatDongTruong**: Hoạt động rèn luyện
- **LUUTRUDIEMSV**: Điểm rèn luyện sinh viên
- **UserLog**: Nhật ký hoạt động

## Tính năng nổi bật

### 🎨 Giao diện hiện đại
- Responsive design với Tailwind CSS
- Animation mượt mà
- Dark/Light mode support
- Mobile-friendly

### 🔍 Tìm kiếm và lọc
- Tìm kiếm sinh viên theo MSSV, tên
- Lọc theo lớp, khoa
- Sắp xếp theo điểm rèn luyện

### 📈 Thống kê trực quan
- Dashboard với biểu đồ
- Bảng xếp hạng động
- Báo cáo chi tiết

### 🔒 Bảo mật
- Xác thực JWT
- Phân quyền chi tiết
- Log hoạt động
- Validation đầu vào

## Phát triển thêm

### Tính năng có thể mở rộng
- [ ] Upload ảnh đại diện
- [ ] Xuất báo cáo PDF/Excel
- [ ] Thông báo real-time
- [ ] API cho mobile app
- [ ] Backup/Restore dữ liệu
- [ ] Quản lý lịch hoạt động

### Cải tiến kỹ thuật
- [ ] Unit testing
- [ ] Integration testing
- [ ] Docker containerization
- [ ] CI/CD pipeline
- [ ] Performance optimization
- [ ] Security audit

## Hỗ trợ

Nếu gặp vấn đề, vui lòng:
1. Kiểm tra log trong console
2. Xem nhật ký hệ thống
3. Kiểm tra kết nối database
4. Liên hệ team phát triển

## Giấy phép

Dự án này được phát triển cho mục đích học tập và nghiên cứu tại Trường Đại học Kiên Giang.

---

**Phiên bản**: 1.0.0  
**Cập nhật cuối**: 2024  
**Tác giả**: Team QLDRL - Trường Đại học Kiên Giang
