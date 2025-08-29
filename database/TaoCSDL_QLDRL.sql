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
)

CREATE TABLE UserLog (
    Id INT IDENTITY PRIMARY KEY,
    MaTK CHAR(4),
    Action NVARCHAR(255),
    IPAddress NVARCHAR(50),
    UserAgent NVARCHAR(255),
    ThoiGian DATETIME DEFAULT GETDATE()
)

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
    MaQT char(4) REFERENCES QuanTri(MaQT) ON DELETE CASCADE
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
    TenSV nvarchar(100),
    SDT char(10),
    Email char(50),
    DiaChi nvarchar(150),
    MaLop char(4) REFERENCES Lop(MaLop) ON DELETE CASCADE,
    MaKH char(4) REFERENCES KHOA(MaKH),
    AnhDD VARBINARY(MAX)
);

CREATE TABLE HoatDongTC
(
    Ma INT IDENTITY(1,1) PRIMARY KEY,
    TenHD nvarchar(500),
    SoDiem int
);

CREATE TABLE HoatDongTruong
(
    MaHD char(4) PRIMARY KEY,
    TenHD nvarchar(500),
    DiemRL int,
    SoSvDK int,
    NDHD nvarchar(1000),
    NgayBD Date,
    NgayKT Date,
    AnhMH VARBINARY(MAX),
    TUKHOA nvarchar(100)
);

CREATE TABLE LUUTRUDIEMSV
(
    MSSV char(11),
    Khoas nvarchar(100),
    HocKi int,
    DiemTBM_4 decimal(10,2),
    DiemTBM_10 decimal(10,2),
    TongDRL int,
    NamHoc int
);

INSERT INTO QuanTri(MaQT, TenCAP)
VALUES  ('AD01','ADMIN'),
        ('GV01',N'Giảng viên'),
        ('SV01',N'Sinh viên')
        ;

INSERT INTO TK (MaCaNhan,TenTK, MatKhau, TenNguoiDung, ChucVu, MaQT)
VALUES  ('23092006119','yakhiem1412','Special1210',N'Trần Gia Khiêm','ADMIN','AD01'),
        ('23092006120','doakhoa','Khoa123',N'Đỗ Anh Khoa','Sinh viên','SV01'),
        ('23092006117','kien.dt','Kien123',N'Đỗ Trung Kiên','Giảng viên','GV01')
        ;

INSERT INTO KHOA
VALUES  ('TTTT',N'Thông tin - Truyền thông'),
        ('QTKD',N'Quản trị kinh doanh')
        ;

INSERT INTO LOP
VALUES  ('23T3','B023TT3','TTTT'),
        ('23Q3','B023QT3','QTKD')
        ;

INSERT INTO SINHVIEN
VALUES  ('23092006119',N'Trần Gia Khiêm','0863831431','kkhiem23092006119@vnkgu.edu.vn','','23T3','TTTT','')
        ;



