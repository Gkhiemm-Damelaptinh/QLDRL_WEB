CREATE DATABASE QLDRL
ON PRIMARY
    (Name = 'QLDRL_Data',
    Filename = 'C:\Users\admin\Documents\BAITAP\CSDL\QLDRL_Data.mdf',
    Size = 5MB, Maxsize = UNLIMITED, Filegrowth = 10%)
LOG ON
    (Name = 'QLDRL_Log',
    Filename = 'C:\Users\admin\Documents\BAITAP\CSDL\QLDRL_Log.ldf',
    Size = 5MB, Maxsize = UNLIMITED, Filegrowth = 10%)
GO
USE QLDRL
GO

CREATE TABLE AppImages (
    Type NVARCHAR(50) PRIMARY KEY,
    ImageData VARBINARY(MAX)
);

CREATE TABLE UserLog (
    Id INT IDENTITY PRIMARY KEY,
    MaTK CHAR(20),
    Action NVARCHAR(255),
    IPAddress NVARCHAR(50),
    UserAgent NVARCHAR(255),
    ThoiGian DATETIME DEFAULT GETDATE()
);

  CREATE TABLE SystemSettings (
    Id INT PRIMARY KEY,
    SchoolName NVARCHAR(200),
    CurrentYear INT,
    CurrentSemester INT,
    SemesterEndDate DATETIME,
    AutoPointEnabled BIT DEFAULT 0,
    UpdatedAt DATETIME DEFAULT GETDATE()
  ); 

CREATE TABLE QuanTri
(
    MaQT char(4) PRIMARY KEY,
    TenCAP nvarchar(50)
);

CREATE TABLE TK
(
    MaCaNhan char(11) PRIMARY KEY,
    TenTK char(50),
    MatKhau char(20),
    TenNguoiDung nvarchar(100),
    ChucVu nvarchar(30),
    MaQT char(4) REFERENCES QuanTri(MaQT) ON DELETE CASCADE,
    TrangThai bit DEFAULT 1
);

CREATE TABLE KHOA
(
    MaKH char(4) PRIMARY KEY,
    TenKhoa nvarchar(50)
);

CREATE TABLE Lop
(
    MaLop char(4) PRIMARY KEY,
    TenLop char(10),
    MaKH char(4) REFERENCES KHOA(MaKH) ON DELETE CASCADE
);

CREATE TABLE SINHVIEN
(
    MSSV char(11) PRIMARY KEY,
    MaCaNhan char(11), -- Thêm cột MaCaNhan để liên kết với TK
    TenSV nvarchar(100),
    SDT char(10),
    Email char(50),
    DiaChi nvarchar(150),
    MaLop char(4) REFERENCES Lop(MaLop) ON DELETE CASCADE,
    MaKH char(4) REFERENCES KHOA(MaKH),
    MaKhoa char(4) REFERENCES KhoaHoc(MaKhoa),
    TVCLBKhoa bit,
    TVCLBTruong bit,
    CBLop bit,
    AnhDD VARBINARY(MAX)
);

CREATE TABLE GiangVien
(
    MaCaNhan char(11) PRIMARY KEY,
    TenGV nvarchar(100),
    SDT char(10),
    Email char(50),
    MaKH char(4) REFERENCES KHOA(MaKH),
    LopCV char(4) REFERENCES Lop(MaLop),
    DiaChi nvarchar(150)
);

CREATE TABLE HoatDongTC
(
    Ma INT IDENTITY(1,1),
    IDHoatDong char(5),
    TenHD nvarchar(500),
    SoDiemToiDa int,
    TDTT bit
);

CREATE TABLE SinhvienDG
(
    ID int IDENTITY(1,1) PRIMARY KEY,
    MSSV char(11),
    IDHoatDong char(5),
    DiemDanhGia int
);

CREATE TABLE HoatDongTruong
(
    MaHD char(4) PRIMARY KEY,
    TenHD nvarchar(500),
    DiemRL int,
    SoSvDK int,
    NDHD nvarchar(1000),
    DiaDiem nvarchar(200),
    NgayBD Date,
    NgayKT Date,
    HasQRCode BIT DEFAULT 0,
    AllowQRRegistration BIT DEFAULT 1,
    AnhMH VARBINARY(MAX),
    TUKHOA nvarchar(100)
);

CREATE TABLE KhoaHoc
(
    MaKhoa char(4) PRIMARY KEY,
    TenKhoa nvarchar(50)
);

CREATE TABLE LUUTRUDIEMSV
(
    MSSV char(11),
    Khoas nvarchar(100),
    HocKi int,
    DiemTBM_4 decimal(10,2),
    DiemTBM_10 decimal(10,2),
    viphamNT int,
    viphamXH int,
    TGNCKH bit,
    TongDRL int,
    NamHoc int
);

-- Script thêm bảng QR Code và đăng ký hoạt động
USE QLDRL
GO

-- Bảng QR Code cho hoạt động
CREATE TABLE ActivityQRCode (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    MaHD CHAR(4) REFERENCES HoatDongTruong(MaHD),
    QRCodeData NVARCHAR(500) NOT NULL, -- Dữ liệu QR code (URL hoặc JSON)
    QRCodeImage VARBINARY(MAX), -- Hình ảnh QR code (PNG)
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE(),
    ExpiresAt DATETIME, -- Thời hạn QR code (có thể NULL nếu không giới hạn)
    CreatedBy CHAR(11) -- MSSV của giảng viên tạo
);

-- Bảng đăng ký hoạt động qua QR
CREATE TABLE ActivityRegistration (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    MaHD CHAR(4) REFERENCES HoatDongTruong(MaHD),
    MSSV CHAR(11) REFERENCES SINHVIEN(MSSV),
    QRCodeId INT REFERENCES ActivityQRCode(Id),
    RegisteredAt DATETIME DEFAULT GETDATE(),
    Status NVARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    IsEligibleForEvidence BIT DEFAULT 0, -- Có thể nộp minh chứng
    ApprovedAt DATETIME,
    ApprovedBy CHAR(11), -- MSSV của giảng viên duyệt
    Notes NVARCHAR(500) -- Ghi chú từ giảng viên
);

-- Bảng minh chứng video (chuẩn bị cho AI sau này)
CREATE TABLE ActivityEvidence (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    RegistrationId INT REFERENCES ActivityRegistration(Id),
    VideoFileName NVARCHAR(255),
    VideoPath NVARCHAR(500),
    VideoSize BIGINT,
    Duration INT, -- Thời lượng video (giây)
    SubmittedAt DATETIME DEFAULT GETDATE(),
    Status NVARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    ProcessedAt DATETIME,
    ProcessedBy CHAR(11), -- MSSV của giảng viên xử lý
    Notes NVARCHAR(500) -- Ghi chú từ giảng viên
);

-- Index để tối ưu performance
CREATE INDEX IX_ActivityQRCode_MaHD ON ActivityQRCode(MaHD);
CREATE INDEX IX_ActivityQRCode_IsActive ON ActivityQRCode(IsActive);
CREATE INDEX IX_ActivityRegistration_MSSV ON ActivityRegistration(MSSV);
CREATE INDEX IX_ActivityRegistration_MaHD ON ActivityRegistration(MaHD);
CREATE INDEX IX_ActivityRegistration_Status ON ActivityRegistration(Status);
CREATE INDEX IX_ActivityEvidence_RegistrationId ON ActivityEvidence(RegistrationId);

INSERT INTO QuanTri(MaQT, TenCAP)
VALUES  ('AD01','ADMIN'),
        ('GV01',N'Giảng viên'),
        ('SV01',N'Sinh viên')
        ;

INSERT INTO TK (MaCaNhan,TenTK, MatKhau, TenNguoiDung, ChucVu, MaQT, TrangThai)
VALUES  ('23092006119','yakhiem1412','Special1210',N'Trần Gia Khiêm','ADMIN','AD01', 1),
        ('23092006120','doakhoa','Khoa123',N'Đỗ Anh Khoa','Sinh viên','SV01', 1),
        ('23092006117','kien.dt','Kien123',N'Đỗ Trung Kiên','Giảng viên','GV01', 1)
        ;

INSERT INTO KHOA
VALUES  ('TTTT',N'Thông tin - Truyền thông'),
        ('QTKD',N'Quản trị kinh doanh')
        ;

INSERT INTO LOP
VALUES  ('23T3','B023TT3','TTTT'),
        ('23Q3','B023QT3','QTKD')
        ;

INSERT INTO SINHVIEN (MSSV, TenSV, SDT, Email, DiaChi, MaLop, MaKH, TVCLBKhoa, TVCLBTruong, CBLop, AnhDD)
VALUES  ('23092006119',N'Trần Gia Khiêm','0863831431','kkhiem23092006119@vnkgu.edu.vn','','23T3','TTTT', 0, 1, 1, null),
        ('23092006120',N'Đỗ Anh Khoa','0123456789','khoa23092006120@vnkgu.edu.vn','','23Q3','QTKD',1 ,0, 0, null)
        ;

-- Thêm dữ liệu mẫu cho bảng HoatDongTruong
INSERT INTO HoatDongTruong (MaHD, TenHD, DiemRL, SoSvDK, NDHD, DiaDiem, NgayBD, NgayKT, HasQRCode, AllowQRRegistration, TUKHOA)
VALUES 
    ('HD01', N'Hội thảo công nghệ thông tin', 5, 100, N'Tham gia hội thảo về xu hướng công nghệ mới', N'Phòng họp A1', '2024-12-01', '2024-12-01', 1, 1, N'2024-2025'),
    ('HD02', N'Cuộc thi lập trình sinh viên', 10, 50, N'Tham gia cuộc thi lập trình cấp trường', N'Phòng máy tính B2', '2024-12-15', '2024-12-15', 1, 1, N'2024-2025'),
    ('HD03', N'Hoạt động tình nguyện', 3, 200, N'Tham gia các hoạt động tình nguyện cộng đồng', N'Trung tâm thành phố', '2024-12-20', '2024-12-20', 0, 0, N'2024-2025');

-- Thêm dữ liệu mẫu cho bảng LUUTRUDIEMSV
INSERT INTO LUUTRUDIEMSV (MSSV, Khoas, HocKi, DiemTBM_4, DiemTBM_10, viphamNT, viphamXH, TGNCKH, TongDRL, NamHoc)
VALUES 
    ('23092006119', 9, 1, 3.8, 9.2, 1, null, 1, 95, 2024),
    ('23092006119', 9, 2, 3.9, 9.5, null, 2, 0, 98, 2024)

