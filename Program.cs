using Microsoft.Data.SqlClient;
using System.Data;
using System.Linq;
using QRCoder;
using System.Drawing;
using System.Drawing.Imaging;
using System.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);
var connStr = builder.Configuration.GetConnectionString("DefaultConnection");

// CORS cho dev
builder.Services.AddCors(o =>
{
    o.AddDefaultPolicy(p => p
        .AllowAnyOrigin()
        .AllowAnyHeader()
        .AllowAnyMethod());
});
builder.Services.AddHttpContextAccessor();

var app = builder.Build();
app.UseCors();
app.Urls.Add("http://*:5204"); // Cho phép mọi địa chỉ mạng

try
{
    using var con = new SqlConnection(connStr);
    await con.OpenAsync();
    
    // Kiểm tra xem cột MaCaNhan đã tồn tại chưa
    var checkColumnSql = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SINHVIEN' AND COLUMN_NAME = 'MaCaNhan'";
    var columnExists = await QueryAsync(con, checkColumnSql);
    
    if ((int)(columnExists[0].Values.First() ?? 0) == 0)
    {
        // Cập nhật MaCaNhan cho các sinh viên hiện có
        var updateSql = "UPDATE SINHVIEN SET MaCaNhan = MSSV WHERE MaCaNhan IS NULL";
        await ExecuteNonQueryAsync(con, updateSql);
    }

}
catch (Exception ex)
{
    Console.WriteLine($"Lỗi khi thêm cột MaCaNhan: {ex.Message}");
}

// Helper method để thay thế ExecuteNonQueryAsync
async Task<int> ExecuteNonQueryAsync(SqlConnection connection, string sql, params SqlParameter[] parameters)
{
    using var cmd = new SqlCommand(sql, connection);
    cmd.Parameters.AddRange(parameters);
    return await cmd.ExecuteNonQueryAsync();
}

app.UseDefaultFiles();
app.UseStaticFiles();

// Helpers
static async Task<List<Dictionary<string, object?>>> QueryAsync(SqlConnection con, string sql, params SqlParameter[] prms)
{
    using var cmd = new SqlCommand(sql, con);
    if (prms != null && prms.Length > 0) cmd.Parameters.AddRange(prms);
    using var rd = await cmd.ExecuteReaderAsync();

    var list = new List<Dictionary<string, object?>>();
    while (await rd.ReadAsync())
    {
        var row = new Dictionary<string, object?>();
        for (int i = 0; i < rd.FieldCount; i++)
            row[rd.GetName(i)] = rd.IsDBNull(i) ? null : rd.GetValue(i);
        list.Add(row);
    }
    return list;
}

static async Task LogAsync(HttpContext? ctx, SqlConnection con, string action, string? maTkOverride = null)
{
    try
    {
        // Ensure UserLog table exists
        using (var ensure = new SqlCommand(@"IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserLog' AND xtype='U')
BEGIN
  CREATE TABLE UserLog (
    Id INT IDENTITY PRIMARY KEY,
    MaTK NVARCHAR(50),
    Action NVARCHAR(255),
    IPAddress NVARCHAR(50),
    UserAgent NVARCHAR(255),
    ThoiGian DATETIME DEFAULT GETDATE()
  )
END", con))
        {
            await ensure.ExecuteNonQueryAsync();
        }

        string? ip = null;
        string? ua = null;
        string? maHeader = null;
        if (ctx != null)
        {
            ip = (string?)ctx.Request.Headers["X-Forwarded-For"].FirstOrDefault()
                 ?? ctx.Connection.RemoteIpAddress?.ToString();
            ua = ctx.Request.Headers["User-Agent"].ToString();
            maHeader = ctx.Request.Headers["X-User"].ToString();
        }
        var ma = !string.IsNullOrWhiteSpace(maTkOverride) ? maTkOverride : maHeader;

        Console.WriteLine($"[UserLog] action='{action}', user='{ma}', ip='{ip}'");

        using var cmd = new SqlCommand("INSERT INTO UserLog (MaTK, Action, IPAddress, UserAgent) VALUES (@ma, @ac, @ip, @ua)", con);
        cmd.Parameters.Add(new SqlParameter("@ma", (object?)ma ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@ac", action));
        cmd.Parameters.Add(new SqlParameter("@ip", (object?)ip ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@ua", (object?)ua ?? DBNull.Value));
        await cmd.ExecuteNonQueryAsync();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[UserLog][ERROR] action='{action}' err='{ex.Message}'");
    }
}

// app.MapGet("/", () => Results.Ok(new { ok = true, service = "QLDRLApi" }));

// 2.1) Preload: chỉ tải dữ liệu KHÔNG nhạy cảm (Khoa, Lớp, HoạtĐộngTC)
app.MapGet("/api/preload", async () =>
{
    using var con = new SqlConnection(connStr);
    await con.OpenAsync();

    var khoa = await QueryAsync(con, "SELECT MaKH, TenKhoa FROM KHOA ORDER BY TenKhoa;");
    var lop = await QueryAsync(con, @"SELECT L.MaLop, L.TenLop, L.MaKH, K.TenKhoa
                                      FROM Lop L
                                      LEFT JOIN KHOA K ON K.MaKH = L.MaKH
                                      ORDER BY L.TenLop;");
    var khoaHoc = await QueryAsync(con, "SELECT MaKhoa, TenKhoa FROM KhoaHoc ORDER BY MaKhoa;");
    var hoatDongTruong = await QueryAsync(con, "SELECT MaHD, TenHD, DiemRL, NDHD, NgayBD, NgayKT, SoSvDK, DiaDiem, TUKHOA FROM HoatDongTruong ORDER BY MaHD DESC;");
    Console.WriteLine($"Số hoạt động đọc được: {hoatDongTruong.Count}");

    return Results.Ok(new
    {
        khoa = khoa,
        lop = lop,
        khoaHoc = khoaHoc,
        hoatDongTruong = hoatDongTruong
    });
});

// AI: Kiểm tra video minh chứng
app.MapPost("/api/ai/check-video", async (HttpRequest req) =>
{
	try
	{
		if (!req.HasFormContentType)
		{
			return Results.BadRequest(new { message = "Yêu cầu phải là multipart/form-data" });
		}

		var form = await req.ReadFormAsync();
		var file = form.Files.GetFile("video");
		var name = form["name"].ToString();
		var desc = form["desc"].ToString();

		if (file == null || file.Length == 0)
		{
			return Results.BadRequest(new { message = "Thiếu file video" });
		}

		var webRoot = app.Environment.WebRootPath ?? "wwwroot";
		var evidenceDir = System.IO.Path.Combine(webRoot, "evidence");
		System.IO.Directory.CreateDirectory(evidenceDir);

		var ext = System.IO.Path.GetExtension(file.FileName);
		var stamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
		var guid = Guid.NewGuid().ToString("N").Substring(0, 8);
		var newFileName = $"{stamp}_{guid}{ext}";
		var savePath = System.IO.Path.Combine(evidenceDir, newFileName);

		using (var fs = new System.IO.FileStream(savePath, System.IO.FileMode.Create))
		{
			await file.CopyToAsync(fs);
		}

		var sizeMb = file.Length / 1024d / 1024d;
		var verdict = sizeMb >= 0.2 ? "Hợp lệ" : "Không rõ ràng";
		var explanation = sizeMb >= 0.2
			? "Video có dung lượng đủ lớn, khả năng là minh chứng hợp lệ."
			: "Video quá ngắn/nhẹ, có thể không đủ để xác minh.";

		using var con = new SqlConnection(connStr);
		await con.OpenAsync();

		var notes = $"Tên: {name}; Mô tả: {desc}; SizeMB: {sizeMb:F2}";
		using (var cmd = new SqlCommand(@"INSERT INTO ActivityEvidence
			(RegistrationId, VideoFileName, VideoPath, VideoSize, Duration, Status, Notes)
			VALUES (@reg, @fn, @path, @size, @dur, @status, @notes);", con))
		{
			cmd.Parameters.Add(new SqlParameter("@reg", DBNull.Value));
			cmd.Parameters.Add(new SqlParameter("@fn", newFileName));
			cmd.Parameters.Add(new SqlParameter("@path", $"/evidence/{newFileName}"));
			cmd.Parameters.Add(new SqlParameter("@size", file.Length));
			cmd.Parameters.Add(new SqlParameter("@dur", DBNull.Value));
			cmd.Parameters.Add(new SqlParameter("@status", "PENDING"));
			cmd.Parameters.Add(new SqlParameter("@notes", (object?)notes ?? DBNull.Value));
			await cmd.ExecuteNonQueryAsync();
		}

		await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, "AI_CHECK_VIDEO");

		return Results.Ok(new
		{
			message = $"{verdict}. {explanation}",
			path = $"/evidence/{newFileName}",
			sizeBytes = file.Length
		});
	}
	catch (Exception ex)
	{
		return Results.BadRequest(new { message = "Lỗi xử lý video", error = ex.Message });
	}
});

// 2.2) Đăng nhập: kiểm tra trên server (không gửi mật khẩu ra client)
app.MapPost("/api/auth/login", async (LoginDto dto) =>
{
    if (string.IsNullOrWhiteSpace(dto.TenTK) || string.IsNullOrWhiteSpace(dto.MatKhau))
        return Results.BadRequest(new { message = "Thiếu TenTK/MatKhau" });

    using var con = new SqlConnection(connStr);
    await con.OpenAsync();

    var sql = @"SELECT MaCaNhan, TenTK, TenNguoiDung, ChucVu, MaQT, TrangThai
                FROM TK
                WHERE TenTK = @u AND MatKhau = @p;";
    var rows = await QueryAsync(con, sql,
        new SqlParameter("@u", dto.TenTK.Trim()),
        new SqlParameter("@p", dto.MatKhau.Trim()));

    if (rows.Count == 0) return Results.Unauthorized();
    
    // Kiểm tra trạng thái tài khoản
    var trangThai = rows[0]["TrangThai"];
    if (trangThai == null || !(bool)trangThai)
    {
        return Results.BadRequest(new { message = "Tài khoản đã bị khóa" });
    }

    await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, "LOGIN", rows[0]["MaCaNhan"]?.ToString());
    return Results.Ok(rows[0]); // chỉ trả thông tin tối thiểu
});

// 2.3) Xem chi tiết sinh viên (join Khoa/Lớp)
app.MapGet("/api/sinhvien/{mssv}", async (string mssv) =>
{
    using var con = new SqlConnection(connStr);
    await con.OpenAsync();

    var sql = @"
SELECT SV.MSSV, SV.TenSV, SV.SDT, SV.Email, SV.DiaChi, SV.MaLop, SV.MaKH, SV.MaKhoa, SV.AnhDD,
       SV.CBLop, SV.TVCLBKhoa, SV.TVCLBTruong,
       L.TenLop, K.TenKhoa, KH.TenKhoa as TenKhoaHoc
FROM SINHVIEN SV
LEFT JOIN Lop L ON L.MaLop = SV.MaLop
LEFT JOIN KHOA K ON K.MaKH = SV.MaKH
LEFT JOIN KhoaHoc KH ON KH.MaKhoa = SV.MaKhoa
WHERE SV.MSSV = @mssv;";
    var rows = await QueryAsync(con, sql, new SqlParameter("@mssv", mssv.Trim()));
    if (rows.Count == 0) return Results.NotFound();
    var row = rows[0];
    if (row.TryGetValue("AnhDD", out var bin) && bin is byte[] bytes)
    {
        row["AnhDD"] = Convert.ToBase64String(bytes);
    }
    return Results.Ok(row);
});

// 2.4) Cập nhật thông tin sinh viên
app.MapPut("/api/sinhvien/{mssv}", async (string mssv, UpdateSinhVienDto dto) =>
{
    using var con = new SqlConnection(connStr);
    await con.OpenAsync();

    var sql = @"
UPDATE SINHVIEN
SET
    SDT = COALESCE(@SDT, SDT),
    DiaChi = COALESCE(@DiaChi, DiaChi)
WHERE MSSV = @MSSV;";

    using var cmd = new SqlCommand(sql, con);
    cmd.Parameters.AddRange(new[]
    {
        new SqlParameter("@SDT", (object?)dto.SDT ?? DBNull.Value),
        new SqlParameter("@DiaChi", (object?)dto.DiaChi ?? DBNull.Value),
        new SqlParameter("@MSSV", mssv.Trim())
    });

    var affected = await cmd.ExecuteNonQueryAsync();
    if (affected == 0)
    {
        // Có thể do MSSV không tồn tại hoặc dữ liệu không thay đổi
        using var chkCmd = new SqlCommand("SELECT 1 FROM SINHVIEN WHERE MSSV = @MSSV", con);
        chkCmd.Parameters.Add(new SqlParameter("@MSSV", mssv.Trim()));
        var exists = await chkCmd.ExecuteScalarAsync();
        if (exists is not null) return Results.NoContent(); // tồn tại nhưng không có gì để cập nhật
        return Results.NotFound(); // không tồn tại MSSV
    }
    return Results.NoContent();
});

// 2.5) Upload avatar (VARBINARY(MAX))
app.MapPost("/api/sinhvien/{mssv}/avatar", async (HttpRequest req, string mssv) =>
{
    if (!req.HasFormContentType) return Results.BadRequest(new { message = "FormData required" });
    var form = await req.ReadFormAsync();
    var file = form.Files["file"];
    if (file == null || file.Length == 0) return Results.BadRequest(new { message = "No file" });

    await using var ms = new MemoryStream();
    await file.CopyToAsync(ms);
    var bytes = ms.ToArray();

    using var con = new SqlConnection(connStr);
    await con.OpenAsync();

    var sql = "UPDATE SINHVIEN SET AnhDD = @bin WHERE MSSV = @m";
    using var cmd = new SqlCommand(sql, con);
    cmd.Parameters.Add("@bin", SqlDbType.VarBinary, -1).Value = bytes;
    cmd.Parameters.Add(new SqlParameter("@m", mssv.Trim()));
    var affected = await cmd.ExecuteNonQueryAsync();
    if (affected == 0) return Results.NotFound();
    return Results.NoContent();
});

// 2.6) Lấy điểm sinh viên
app.MapGet("/api/sinhvien/{mssv}/diem", async (string mssv, int? namHoc = null, int? hocKi = null) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
SELECT MSSV, Khoas, HocKi, DiemTBM_4, DiemTBM_10, TongDRL, NamHoc, viphamNT, viphamXH, TGNCKH
FROM LUUTRUDIEMSV 
WHERE MSSV = @mssv";
        
        var parameters = new List<SqlParameter> { new SqlParameter("@mssv", mssv.Trim()) };
        
        if (namHoc.HasValue)
        {
            sql += " AND NamHoc = @namHoc";
            parameters.Add(new SqlParameter("@namHoc", namHoc.Value));
        }
        
        if (hocKi.HasValue)
        {
            sql += " AND HocKi = @hocKi";
            parameters.Add(new SqlParameter("@hocKi", hocKi.Value));
        }
        
        sql += " ORDER BY NamHoc DESC, HocKi DESC";
        
        Console.WriteLine($"Query: {sql}");
        Console.WriteLine($"Parameters: MSSV={mssv}, NamHoc={namHoc}, HocKi={hocKi}");
        
        var rows = await QueryAsync(con, sql, parameters.ToArray());
        Console.WriteLine($"Found {rows.Count} records");
        
        return Results.Ok(rows);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error in diem endpoint: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Test endpoint to check table structure
app.MapGet("/api/test/diem-table", async () =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();
        
        // Check if table exists
        var checkTable = await QueryAsync(con, @"
            SELECT COUNT(*) as count 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'LUUTRUDIEMSV'");
        
        if (checkTable[0]["count"]?.ToString() == "0")
        {
            return Results.BadRequest(new { error = "Table LUUTRUDIEMSV does not exist" });
        }
        
        // Get sample data
        var sampleData = await QueryAsync(con, "SELECT TOP 5 * FROM LUUTRUDIEMSV");
        
        return Results.Ok(new { 
            tableExists = true, 
            sampleData = sampleData,
            totalRecords = sampleData.Count
        });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.7) Bảng xếp hạng sinh viên từ bảng LUUTRUDIEMSV
app.MapGet("/api/luutrudiemsv/ranking", async () =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra bảng có tồn tại không
        var checkTable = await QueryAsync(con, @"
            SELECT COUNT(*) as count 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'LUUTRUDIEMSV'");

        if (checkTable[0]["count"]?.ToString() == "0")
        {
            return Results.Ok(new
            {
                success = false,
                message = "Bảng LUUTRUDIEMSV chưa tồn tại trong cơ sở dữ liệu",
                total = 0,
                data = Array.Empty<object>()
            });
        }

        // Lấy dữ liệu xếp hạng với thông tin sinh viên, lớp, khoa
        var sql = @"
            SELECT 
                L.MSSV,
                S.TenSV,
                S.AnhDD,
                L.Khoas,
                L.HocKi,
                L.DiemTBM_4,
                L.DiemTBM_10,
                L.TongDRL,
                L.NamHoc,
                L.viphamNT,
                L.viphamXH,
                L.TGNCKH,
                LP.TenLop,
                K.TenKhoa
            FROM LUUTRUDIEMSV L
            LEFT JOIN SINHVIEN S ON S.MSSV = L.MSSV
            LEFT JOIN Lop LP ON LP.MaLop = S.MaLop
            LEFT JOIN KHOA K ON K.MaKH = S.MaKH
            WHERE L.TongDRL IS NOT NULL
            ORDER BY L.TongDRL DESC, L.DiemTBM_10 DESC";

        var rankingData = await QueryAsync(con, sql);

        // Debug logging
        Console.WriteLine($"Found {rankingData.Count} ranking records");
        if (rankingData.Count > 0)
        {
            var firstRow = rankingData[0];
            Console.WriteLine("First row data:");
            foreach (var kvp in firstRow)
            {
                Console.WriteLine($"  {kvp.Key}: {kvp.Value} (Type: {kvp.Value?.GetType()})");
            }
        }

        // Xử lý ảnh đại diện (chuyển byte[] -> base64 string)
        foreach (var row in rankingData)
        {
            if (row.TryGetValue("AnhDD", out var bin) && bin is byte[] bytes)
            {
                row["AnhDD"] = Convert.ToBase64String(bytes);
            }
        }

        return Results.Ok(rankingData);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error in ranking endpoint: {ex.Message}");
        return Results.Ok(new
        {
            success = false,
            message = $"Lỗi server: {ex.Message}",
            total = 0,
            data = Array.Empty<object>()
        });
    }
});

// 2.8) Lấy danh sách tất cả sinh viên
app.MapGet("/api/sinhvien", async (string? search = null, string? maLop = null, string? maKhoa = null) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
SELECT SV.MSSV, SV.TenSV, SV.SDT, SV.Email, SV.DiaChi, SV.MaLop, SV.MaKH, SV.AnhDD,
       SV.CBLop, SV.TVCLBKhoa, SV.TVCLBTruong,
       L.TenLop, K.TenKhoa
FROM SINHVIEN SV
LEFT JOIN Lop L ON L.MaLop = SV.MaLop
LEFT JOIN KHOA K ON K.MaKH = SV.MaKH
WHERE 1=1";

        var parameters = new List<SqlParameter>();

        if (!string.IsNullOrWhiteSpace(search))
        {
            sql += " AND (SV.MSSV LIKE @search OR SV.TenSV LIKE @search)";
            parameters.Add(new SqlParameter("@search", $"%{search.Trim()}%"));
        }

        if (!string.IsNullOrWhiteSpace(maLop))
        {
            sql += " AND SV.MaLop = @maLop";
            parameters.Add(new SqlParameter("@maLop", maLop.Trim()));
        }

        if (!string.IsNullOrWhiteSpace(maKhoa))
        {
            sql += " AND SV.MaKH = @maKhoa";
            parameters.Add(new SqlParameter("@maKhoa", maKhoa.Trim()));
        }

        sql += " ORDER BY SV.MSSV";

        var students = await QueryAsync(con, sql, parameters.ToArray());

        // Xử lý ảnh đại diện
        foreach (var student in students)
        {
            if (student.TryGetValue("AnhDD", out var bin) && bin is byte[] bytes)
            {
                student["AnhDD"] = Convert.ToBase64String(bytes);
            }
        }

        return Results.Ok(students);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting students: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.9) Lấy danh sách tất cả người dùng (cho admin)
app.MapGet("/api/users", async (string? search, string? filterType, string? chucVu, string? lop, string? khoa, string? khoahoc) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
SELECT TK.MaCaNhan, TK.TenTK, TK.TenNguoiDung, TK.ChucVu, TK.MaQT, QT.TenCAP, TK.TrangThai
FROM TK
LEFT JOIN QuanTri QT ON QT.MaQT = TK.MaQT
WHERE 1=1";

        var prms = new List<SqlParameter>();
        
        // Search term
        if (!string.IsNullOrWhiteSpace(search))
        {
            sql += " AND (TK.TenTK LIKE @search OR TK.TenNguoiDung LIKE @search)";
            prms.Add(new SqlParameter("@search", $"%{search.Trim()}%"));
        }

        // Filter by type
        if (!string.IsNullOrWhiteSpace(filterType))
        {
            switch (filterType.ToLower())
            {
                case "chucvu":
                    if (!string.IsNullOrWhiteSpace(chucVu))
                    {
                        sql += " AND TK.ChucVu = @chucVu";
                        prms.Add(new SqlParameter("@chucVu", chucVu.Trim()));
                    }
                    break;
                    
                case "lop":
                    if (!string.IsNullOrWhiteSpace(lop))
                    {
                        sql += @" AND TK.MaCaNhan IN (
                            SELECT SV.MSSV FROM SINHVIEN SV WHERE SV.MaLop = @lop
                        )";
                        prms.Add(new SqlParameter("@lop", lop.Trim()));
                    }
                    break;
                    
                case "khoa":
                    if (!string.IsNullOrWhiteSpace(khoa))
                    {
                        sql += @" AND (
                            TK.MaCaNhan IN (SELECT SV.MSSV FROM SINHVIEN SV WHERE SV.MaKH = @khoa) OR
                            TK.MaCaNhan IN (SELECT GV.MaCaNhan FROM GiangVien GV WHERE GV.MaKH = @khoa)
                        )";
                        prms.Add(new SqlParameter("@khoa", khoa.Trim()));
                    }
                    break;
                    
                case "khoahoc":
                    if (!string.IsNullOrWhiteSpace(khoahoc))
                    {
                        // Filter by khoa hoc (khóa học) - sử dụng MaKhoa từ bảng KhoaHoc
                        sql += @" AND TK.MaCaNhan IN (
                            SELECT SV.MSSV FROM SINHVIEN SV WHERE SV.MaKhoa = @khoahoc
                        )";
                        prms.Add(new SqlParameter("@khoahoc", khoahoc.Trim()));
                    }
                    break;
            }
        }

        sql += " ORDER BY TK.MaCaNhan";

        var users = await QueryAsync(con, sql, prms.ToArray());
        return Results.Ok(users);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting users: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Đổi mật khẩu người dùng
app.MapPut("/api/users/{maCaNhan}/password", async (string maCaNhan, ChangePasswordDto dto) =>
{
    try
    {
        if (string.IsNullOrWhiteSpace(dto.NewPassword))
            return Results.BadRequest(new { message = "Thiếu mật khẩu mới" });

        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Optional: verify old password if provided
        if (!string.IsNullOrEmpty(dto.OldPassword))
        {
            var chk = await QueryAsync(con, "SELECT 1 FROM TK WHERE MaCaNhan = @m AND MatKhau = @old",
                new SqlParameter("@m", maCaNhan.Trim()),
                new SqlParameter("@old", dto.OldPassword.Trim()));
            if (chk.Count == 0)
                return Results.BadRequest(new { message = "Mật khẩu cũ không đúng" });
        }

        var sql = "UPDATE TK SET MatKhau = @p WHERE MaCaNhan = @m";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@p", dto.NewPassword.Trim()));
        cmd.Parameters.Add(new SqlParameter("@m", maCaNhan.Trim()));
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return Results.NotFound(new { message = "Không tìm thấy người dùng" });

        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"CHANGE_PASSWORD {maCaNhan}");
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error changing password: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.9b) Lấy danh sách quyền quản trị (QuanTri)
app.MapGet("/api/quantri", async () =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var roles = await QueryAsync(con, "SELECT MaQT, TenCAP FROM QuanTri ORDER BY TenCAP");
        return Results.Ok(roles);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting roles: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.9c) Lấy danh sách quyền quản trị (alias cho roles)
app.MapGet("/api/roles", async () =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var roles = await QueryAsync(con, "SELECT MaQT, TenCAP as TenQT FROM QuanTri ORDER BY TenCAP");
        return Results.Ok(roles);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting roles: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.9d) Thêm người dùng mới (TK)
app.MapPost("/api/users", async (UserCreateDto dto) =>
{
    try
    {
        // Validate
        if (string.IsNullOrWhiteSpace(dto.MaCaNhan) ||
            string.IsNullOrWhiteSpace(dto.TenTK) ||
            string.IsNullOrWhiteSpace(dto.MatKhau) ||
            string.IsNullOrWhiteSpace(dto.TenNguoiDung) ||
            string.IsNullOrWhiteSpace(dto.ChucVu) ||
            string.IsNullOrWhiteSpace(dto.MaQT))
        {
            return Results.BadRequest(new { message = "Thiếu thông tin bắt buộc" });
        }

        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Check duplicate keys/usernames
        var existById = await QueryAsync(con, "SELECT 1 FROM TK WHERE MaCaNhan = @m",
            new SqlParameter("@m", dto.MaCaNhan.Trim()));
        if (existById.Count > 0)
            return Results.BadRequest(new { message = "Mã cá nhân đã tồn tại" });

        var existByUsername = await QueryAsync(con, "SELECT 1 FROM TK WHERE TenTK = @u",
            new SqlParameter("@u", dto.TenTK.Trim()));
        if (existByUsername.Count > 0)
            return Results.BadRequest(new { message = "Tên tài khoản đã tồn tại" });

        // Check role exists
        var role = await QueryAsync(con, "SELECT 1 FROM QuanTri WHERE MaQT = @r",
            new SqlParameter("@r", dto.MaQT.Trim()));
        if (role.Count == 0)
            return Results.BadRequest(new { message = "Mã quyền (MaQT) không hợp lệ" });

        // Insert
        var sql = @"INSERT INTO TK (MaCaNhan, TenTK, MatKhau, TenNguoiDung, ChucVu, MaQT, TrangThai)
                    VALUES (@MaCaNhan, @TenTK, @MatKhau, @TenNguoiDung, @ChucVu, @MaQT, 1)";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.AddRange(new[]
        {
            new SqlParameter("@MaCaNhan", dto.MaCaNhan.Trim()),
            new SqlParameter("@TenTK", dto.TenTK.Trim()),
            new SqlParameter("@MatKhau", dto.MatKhau.Trim()),
            new SqlParameter("@TenNguoiDung", dto.TenNguoiDung.Trim()),
            new SqlParameter("@ChucVu", dto.ChucVu.Trim()),
            new SqlParameter("@MaQT", dto.MaQT.Trim())
        });
        await cmd.ExecuteNonQueryAsync();

        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, "CREATE_USER", dto.MaCaNhan);

        return Results.Ok(new { message = "Thêm người dùng thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error creating user: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Cập nhật thông tin người dùng (bao gồm mật khẩu nếu cung cấp)
app.MapPut("/api/users/{maCaNhan}", async (string maCaNhan, UserUpdateDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"UPDATE TK SET
                        TenTK = COALESCE(@TenTK, TenTK),
                        MatKhau = COALESCE(@MatKhau, MatKhau),
                        TenNguoiDung = COALESCE(@TenNguoiDung, TenNguoiDung),
                        ChucVu = COALESCE(@ChucVu, ChucVu),
                        MaQT = COALESCE(@MaQT, MaQT)
                    WHERE MaCaNhan = @MaCaNhan";

        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@TenTK", (object?)dto.TenTK ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@MatKhau", (object?)dto.MatKhau ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@TenNguoiDung", (object?)dto.TenNguoiDung ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@ChucVu", (object?)dto.ChucVu ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@MaQT", (object?)dto.MaQT ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@MaCaNhan", maCaNhan.Trim()));
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return Results.NotFound(new { message = "Không tìm thấy người dùng" });

        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"UPDATE_USER {maCaNhan}");
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error updating user: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.9d) Khóa tài khoản
app.MapPost("/api/users/{maCaNhan}/lock", async (string maCaNhan) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = "UPDATE TK SET TrangThai = 0 WHERE MaCaNhan = @maCaNhan";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@maCaNhan", maCaNhan.Trim()));
        
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) 
            return Results.NotFound(new { message = "Không tìm thấy tài khoản" });

        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"LOCK_USER {maCaNhan}");
        return Results.Ok(new { message = "Đã khóa tài khoản thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error locking user: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.9e) Mở khóa tài khoản
app.MapPost("/api/users/{maCaNhan}/unlock", async (string maCaNhan) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = "UPDATE TK SET TrangThai = 1 WHERE MaCaNhan = @maCaNhan";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@maCaNhan", maCaNhan.Trim()));
        
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) 
            return Results.NotFound(new { message = "Không tìm thấy tài khoản" });

        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"UNLOCK_USER {maCaNhan}");
        return Results.Ok(new { message = "Đã mở khóa tài khoản thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error unlocking user: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.9f) Xóa người dùng
app.MapDelete("/api/users/{maCaNhan}", async (string maCaNhan) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra xem người dùng có tồn tại không
        var checkSql = "SELECT COUNT(*) FROM TK WHERE MaCaNhan = @maCaNhan";
        using var checkCmd = new SqlCommand(checkSql, con);
        checkCmd.Parameters.Add(new SqlParameter("@maCaNhan", maCaNhan.Trim()));
        
        var exists = (int)(await checkCmd.ExecuteScalarAsync() ?? 0);
        if (exists == 0)
            return Results.NotFound(new { message = "Không tìm thấy người dùng" });

        // Xóa người dùng
        var sql = "DELETE FROM TK WHERE MaCaNhan = @maCaNhan";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@maCaNhan", maCaNhan.Trim()));
        
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) 
            return Results.NotFound(new { message = "Không thể xóa người dùng" });

        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"DELETE_USER {maCaNhan}");
        return Results.Ok(new { message = "Đã xóa người dùng thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error deleting user: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.10) Thêm/sửa điểm rèn luyện
app.MapPost("/api/diem", async (DiemDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Get defaults for year/semester if missing
        int currentYear = DateTime.UtcNow.Year;
        int currentSemester = 1;
        try
        {
            using var ensure = new SqlCommand(@"
IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE Id = 1)
BEGIN
  INSERT INTO SystemSettings (Id, SchoolName, CurrentYear, CurrentSemester)
  VALUES (1, N'Trường Đại học Kiên Giang', YEAR(GETDATE()), 1);
END", con);
            await ensure.ExecuteNonQueryAsync();

            var srows = await QueryAsync(con, "SELECT TOP 1 SchoolName, CurrentYear, CurrentSemester FROM SystemSettings WHERE Id = 1");
            if (srows.Count > 0)
            {
                if (srows[0]["CurrentYear"] is int y) currentYear = y; else currentYear = DateTime.UtcNow.Year;
                if (srows[0]["CurrentSemester"] is int sem) currentSemester = sem; else currentSemester = 1;
            }
        }
        catch { /* ignore settings errors */ }

        // Kiểm tra sinh viên có tồn tại không
        var checkStudent = await QueryAsync(con, "SELECT 1 FROM SINHVIEN WHERE MSSV = @mssv", 
            new SqlParameter("@mssv", dto.MSSV));
        
        if (checkStudent.Count == 0)
        {
            return Results.BadRequest(new { message = "Sinh viên không tồn tại" });
        }

        // Use defaults if not provided
        var useYear = dto.NamHoc ?? currentYear;
        var useSemester = dto.HocKi ?? currentSemester;

        // Kiểm tra bản ghi đã tồn tại chưa
        var existingRecord = await QueryAsync(con, 
            "SELECT 1 FROM LUUTRUDIEMSV WHERE MSSV = @mssv AND NamHoc = @namHoc AND HocKi = @hocKi",
            new SqlParameter("@mssv", dto.MSSV),
            new SqlParameter("@namHoc", useYear),
            new SqlParameter("@hocKi", useSemester));

        if (existingRecord.Count > 0)
        {
            // Cập nhật bản ghi hiện có
            var updateSql = @"
UPDATE LUUTRUDIEMSV 
SET DiemTBM_4 = @diemTBM4, DiemTBM_10 = @diemTBM10, TongDRL = @tongDRL, Khoas = @khoas,
    viphamNT = @viphamNT, viphamXH = @viphamXH, TGNCKH = @TGNCKH
WHERE MSSV = @mssv AND NamHoc = @namHoc AND HocKi = @hocKi";

            using var cmd = new SqlCommand(updateSql, con);
            cmd.Parameters.AddRange(new[]
            {
                new SqlParameter("@diemTBM4", (object?)dto.DiemTBM_4 ?? DBNull.Value),
                new SqlParameter("@diemTBM10", (object?)dto.DiemTBM_10 ?? DBNull.Value),
                new SqlParameter("@tongDRL", (object?)dto.TongDRL ?? DBNull.Value),
                new SqlParameter("@khoas", (object?)dto.Khoas ?? DBNull.Value),
                new SqlParameter("@viphamNT", (object?)dto.viphamNT ?? DBNull.Value),
                new SqlParameter("@viphamXH", (object?)dto.viphamXH ?? DBNull.Value),
                new SqlParameter("@TGNCKH", (object?)dto.TGNCKH ?? DBNull.Value),
                new SqlParameter("@mssv", dto.MSSV),
                new SqlParameter("@namHoc", useYear),
                new SqlParameter("@hocKi", useSemester)
            });

            await cmd.ExecuteNonQueryAsync();
        }
        else
        {
            // Thêm bản ghi mới
            var insertSql = @"
INSERT INTO LUUTRUDIEMSV (MSSV, Khoas, HocKi, DiemTBM_4, DiemTBM_10, TongDRL, NamHoc, viphamNT, viphamXH, TGNCKH)
VALUES (@mssv, @khoas, @hocKi, @diemTBM4, @diemTBM10, @tongDRL, @namHoc, @viphamNT, @viphamXH, @TGNCKH)";

            using var cmd = new SqlCommand(insertSql, con);
            cmd.Parameters.AddRange(new[]
            {
                new SqlParameter("@mssv", dto.MSSV),
                new SqlParameter("@khoas", (object?)dto.Khoas ?? DBNull.Value),
                new SqlParameter("@hocKi", useSemester),
                new SqlParameter("@diemTBM4", (object?)dto.DiemTBM_4 ?? DBNull.Value),
                new SqlParameter("@diemTBM10", (object?)dto.DiemTBM_10 ?? DBNull.Value),
                new SqlParameter("@tongDRL", (object?)dto.TongDRL ?? DBNull.Value),
                new SqlParameter("@namHoc", useYear),
                new SqlParameter("@viphamNT", (object?)dto.viphamNT ?? DBNull.Value),
                new SqlParameter("@viphamXH", (object?)dto.viphamXH ?? DBNull.Value),
                new SqlParameter("@TGNCKH", (object?)dto.TGNCKH ?? DBNull.Value)
            });

            await cmd.ExecuteNonQueryAsync();
        }

        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"SAVE_GRADE MSSV={dto.MSSV} Y={useYear} K={useSemester}");
        return Results.Ok(new { message = "Lưu điểm thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error saving grade: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.11) Thêm hoạt động mới
app.MapPost("/api/hoatdong", async (HoatDongDto dto) =>
{
    try
    {
        Console.WriteLine($"=== Adding Activity ===");
        Console.WriteLine($"MaHD: {dto.MaHD}");
        Console.WriteLine($"TenHD: {dto.TenHD}");
        Console.WriteLine($"DiemRL: {dto.DiemRL}");
        Console.WriteLine($"NDHD: {dto.NDHD}");
        Console.WriteLine($"NgayBD: {dto.NgayBD}");
        Console.WriteLine($"NgayKT: {dto.NgayKT}");
        Console.WriteLine($"SoSvDK: {dto.SoSvDK}");
        Console.WriteLine($"DiaDiem: {dto.DiaDiem}");
        Console.WriteLine($"TUKHOA: {dto.TUKHOA}");

        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra mã hoạt động đã tồn tại chưa
        var existingActivity = await QueryAsync(con, "SELECT 1 FROM HoatDongTruong WHERE MaHD = @maHD",
            new SqlParameter("@maHD", dto.MaHD));

        if (existingActivity.Count > 0)
        {
            return Results.BadRequest(new { message = "Mã hoạt động đã tồn tại" });
        }

        var sql = @"
INSERT INTO HoatDongTruong (MaHD, TenHD, DiemRL, SoSvDK, NDHD, NgayBD, NgayKT, DiaDiem, TUKHOA)
VALUES (@maHD, @tenHD, @diemRL, @soSvDK, @ndHD, @ngayBD, @ngayKT, @diaDiem, @tuKhoa)";

        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.AddRange(new[]
        {
            new SqlParameter("@maHD", dto.MaHD),
            new SqlParameter("@tenHD", dto.TenHD),
            new SqlParameter("@diemRL", dto.DiemRL),
            new SqlParameter("@soSvDK", (object?)dto.SoSvDK ?? DBNull.Value),
            new SqlParameter("@ndHD", (object?)dto.NDHD ?? DBNull.Value),
            new SqlParameter("@ngayBD", dto.NgayBD),
            new SqlParameter("@ngayKT", dto.NgayKT),
            new SqlParameter("@diaDiem", (object?)dto.DiaDiem ?? DBNull.Value),
            new SqlParameter("@tuKhoa", (object?)dto.TUKHOA ?? DBNull.Value)
        });

        await cmd.ExecuteNonQueryAsync();
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"ADD_ACTIVITY {dto.MaHD}");
        return Results.Ok(new { message = "Thêm hoạt động thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error adding activity: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Lấy chi tiết hoạt động
app.MapGet("/api/hoatdong/{maHD}", async (string maHD) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"SELECT MaHD, TenHD, DiemRL, SoSvDK, NDHD, NgayBD, NgayKT, DiaDiem, TUKHOA
                    FROM HoatDongTruong WHERE MaHD = @maHD";
        var rows = await QueryAsync(con, sql, new SqlParameter("@maHD", maHD));
        if (rows.Count == 0) return Results.NotFound();
        return Results.Ok(rows[0]);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting activity detail: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Cập nhật hoạt động
app.MapPut("/api/hoatdong/{maHD}", async (string maHD, HoatDongDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"UPDATE HoatDongTruong SET
                        TenHD = @tenHD,
                        DiemRL = @diemRL,
                        SoSvDK = @soSvDK,
                        NDHD = @ndHD,
                        NgayBD = @ngayBD,
                        NgayKT = @ngayKT,
                        DiaDiem = @diaDiem,
                        TUKHOA = @tuKhoa
                    WHERE MaHD = @maHD";

        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.AddRange(new[]
        {
            new SqlParameter("@tenHD", dto.TenHD),
            new SqlParameter("@diemRL", dto.DiemRL),
            new SqlParameter("@soSvDK", (object?)dto.SoSvDK ?? DBNull.Value),
            new SqlParameter("@ndHD", (object?)dto.NDHD ?? DBNull.Value),
            new SqlParameter("@ngayBD", dto.NgayBD),
            new SqlParameter("@ngayKT", dto.NgayKT),
            new SqlParameter("@diaDiem", (object?)dto.DiaDiem ?? DBNull.Value),
            new SqlParameter("@tuKhoa", (object?)dto.TUKHOA ?? DBNull.Value),
            new SqlParameter("@maHD", maHD)
        });

        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return Results.NotFound();
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"UPDATE_ACTIVITY {maHD}");
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error updating activity: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Xóa hoạt động
app.MapDelete("/api/hoatdong/{maHD}", async (string maHD) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        using var tran = await con.BeginTransactionAsync();
        // Xóa tiêu chí liên quan (nếu có FK hoặc ràng buộc logic)
        using (var cmdTc = new SqlCommand("DELETE FROM HoatDongTC WHERE IDHoatDong = @maHD", con, (SqlTransaction)tran))
        {
            cmdTc.Parameters.Add(new SqlParameter("@maHD", maHD));
            await cmdTc.ExecuteNonQueryAsync();
        }

        var sql = "DELETE FROM HoatDongTruong WHERE MaHD = @maHD";
        using var cmd = new SqlCommand(sql, con, (SqlTransaction)tran);
        cmd.Parameters.Add(new SqlParameter("@maHD", maHD));
        var affected = await cmd.ExecuteNonQueryAsync();
        await tran.CommitAsync();
        if (affected == 0) return Results.NotFound(new { message = "Không tìm thấy hoạt động" });
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"DELETE_ACTIVITY {maHD}");
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error deleting activity: {ex.Message}");
        return Results.BadRequest(new { message = ex.Message });
    }
});

// 2.12) Thêm khoa mới
app.MapPost("/api/khoa", async (KhoaDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra mã khoa đã tồn tại chưa
        var existingKhoa = await QueryAsync(con, "SELECT 1 FROM KHOA WHERE MaKH = @maKH",
            new SqlParameter("@maKH", dto.MaKH));

        if (existingKhoa.Count > 0)
        {
            return Results.BadRequest(new { message = "Mã khoa đã tồn tại" });
        }

        var sql = "INSERT INTO KHOA (MaKH, TenKhoa) VALUES (@maKH, @tenKhoa)";

        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@maKH", dto.MaKH));
        cmd.Parameters.Add(new SqlParameter("@tenKhoa", dto.TenKhoa));

        await cmd.ExecuteNonQueryAsync();
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"ADD_KHOA {dto.MaKH}");
        return Results.Ok(new { message = "Thêm khoa thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error adding faculty: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Cập nhật khoa
app.MapPut("/api/khoa/{maKH}", async (string maKH, KhoaDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = "UPDATE KHOA SET TenKhoa = @tenKhoa WHERE MaKH = @maKH";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@tenKhoa", dto.TenKhoa));
        cmd.Parameters.Add(new SqlParameter("@maKH", maKH));
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return Results.NotFound(new { message = "Không tìm thấy khoa" });
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"UPDATE_KHOA {maKH}");
        return Results.Ok(new { message = "Cập nhật khoa thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error updating faculty: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Xóa khoa
app.MapDelete("/api/khoa/{maKH}", async (string maKH) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = "DELETE FROM KHOA WHERE MaKH = @maKH";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@maKH", maKH));
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return Results.NotFound(new { message = "Không tìm thấy khoa" });
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"DELETE_KHOA {maKH}");
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error deleting faculty: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.13) Thêm lớp mới
app.MapPost("/api/lop", async (LopDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra mã lớp đã tồn tại chưa
        var existingLop = await QueryAsync(con, "SELECT 1 FROM Lop WHERE MaLop = @maLop",
            new SqlParameter("@maLop", dto.MaLop));

        if (existingLop.Count > 0)
        {
            return Results.BadRequest(new { message = "Mã lớp đã tồn tại" });
        }

        // Kiểm tra khoa có tồn tại không
        var existingKhoa = await QueryAsync(con, "SELECT 1 FROM KHOA WHERE MaKH = @maKH",
            new SqlParameter("@maKH", dto.MaKH));

        if (existingKhoa.Count == 0)
        {
            return Results.BadRequest(new { message = "Khoa không tồn tại" });
        }

        var sql = "INSERT INTO Lop (MaLop, TenLop, MaKH) VALUES (@maLop, @tenLop, @maKH)";

        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@maLop", dto.MaLop));
        cmd.Parameters.Add(new SqlParameter("@tenLop", dto.TenLop));
        cmd.Parameters.Add(new SqlParameter("@maKH", dto.MaKH));

        await cmd.ExecuteNonQueryAsync();
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"ADD_LOP {dto.MaLop}");
        return Results.Ok(new { message = "Thêm lớp thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error adding class: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Cập nhật lớp
app.MapPut("/api/lop/{maLop}", async (string maLop, LopDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra khoa có tồn tại không (nếu đổi khoa)
        if (!string.IsNullOrWhiteSpace(dto.MaKH))
        {
            var existingKhoa = await QueryAsync(con, "SELECT 1 FROM KHOA WHERE MaKH = @maKH",
                new SqlParameter("@maKH", dto.MaKH));
            if (existingKhoa.Count == 0)
                return Results.BadRequest(new { message = "Khoa không tồn tại" });
        }

        var sql = "UPDATE Lop SET TenLop = @tenLop, MaKH = @maKH WHERE MaLop = @maLop";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@tenLop", dto.TenLop));
        cmd.Parameters.Add(new SqlParameter("@maKH", dto.MaKH));
        cmd.Parameters.Add(new SqlParameter("@maLop", maLop));
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return Results.NotFound(new { message = "Không tìm thấy lớp" });
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"UPDATE_LOP {maLop}");
        return Results.Ok(new { message = "Cập nhật lớp thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error updating class: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Xóa lớp
app.MapDelete("/api/lop/{maLop}", async (string maLop) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = "DELETE FROM Lop WHERE MaLop = @maLop";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@maLop", maLop));
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return Results.NotFound(new { message = "Không tìm thấy lớp" });
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"DELETE_LOP {maLop}");
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error deleting class: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Lấy danh sách lớp theo khoa
app.MapGet("/api/lop/by-khoa/{maKH}", async (string maKH) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
SELECT L.MaLop, L.TenLop, L.MaKH, K.TenKhoa
FROM Lop L
LEFT JOIN KHOA K ON K.MaKH = L.MaKH
WHERE L.MaKH = @maKH
ORDER BY L.TenLop";

        var result = await QueryAsync(con, sql, new SqlParameter("@maKH", maKH));
        
        var lopList = result.Select(row => new {
            MaLop = row["MaLop"]?.ToString(),
            TenLop = row["TenLop"]?.ToString(),
            MaKH = row["MaKH"]?.ToString(),
            TenKhoa = row["TenKhoa"]?.ToString()
        }).ToList();

        return Results.Ok(lopList);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.14) Thống kê tổng quan
app.MapGet("/api/stats", async () =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var stats = new Dictionary<string, object>();

        // Đếm tổng sinh viên
        var totalStudents = await QueryAsync(con, "SELECT COUNT(*) as count FROM SINHVIEN");
        stats["totalStudents"] = totalStudents[0]["count"] ?? 0;

        // Đếm tổng khoa
        var totalFaculties = await QueryAsync(con, "SELECT COUNT(*) as count FROM KHOA");
        stats["totalFaculties"] = totalFaculties[0]["count"] ?? 0;

        // Đếm tổng lớp
        var totalClasses = await QueryAsync(con, "SELECT COUNT(*) as count FROM Lop");
        stats["totalClasses"] = totalClasses[0]["count"] ?? 0;

        // Đếm tổng hoạt động
        var totalActivities = await QueryAsync(con, "SELECT COUNT(*) as count FROM HoatDongTruong");
        stats["totalActivities"] = totalActivities[0]["count"] ?? 0;

        // Đếm tổng người dùng
        var totalUsers = await QueryAsync(con, "SELECT COUNT(*) as count FROM TK");
        stats["totalUsers"] = totalUsers[0]["count"] ?? 0;

        // Đếm tổng bản ghi điểm
        var totalRecords = await QueryAsync(con, "SELECT COUNT(*) as count FROM LUUTRUDIEMSV");
        stats["totalRecords"] = totalRecords[0]["count"] ?? 0;

        // Điểm trung bình rèn luyện
        var avgScore = await QueryAsync(con, "SELECT AVG(CAST(TongDRL as FLOAT)) as avg FROM LUUTRUDIEMSV WHERE TongDRL IS NOT NULL");
        stats["avgTrainingScore"] = avgScore[0]["avg"] ?? 0;

        // Also include current settings
        try
        {
            var srows = await QueryAsync(con, "SELECT TOP 1 SchoolName, CurrentYear, CurrentSemester FROM SystemSettings WHERE Id = 1");
            if (srows.Count > 0)
            {
                stats["schoolName"] = srows[0]["SchoolName"] ?? "";
                stats["currentYear"] = srows[0]["CurrentYear"] ?? 0;
                stats["currentSemester"] = srows[0]["CurrentSemester"] ?? 0;
            }
        }
        catch { }

        return Results.Ok(stats);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting stats: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// 2.15) Lấy nhật ký hệ thống
app.MapGet("/api/logs", async (int? limit = 100) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
SELECT TOP (@limit) Id, MaTK, Action, IPAddress, UserAgent, ThoiGian
FROM UserLog
ORDER BY ThoiGian DESC";

        var logs = await QueryAsync(con, sql, new SqlParameter("@limit", limit ?? 100));
        return Results.Ok(logs);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting logs: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// System settings endpoints
app.MapGet("/api/settings/system", async () =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();
        using var ensure = new SqlCommand(@"
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
BEGIN
  CREATE TABLE SystemSettings (
    Id INT PRIMARY KEY,
    SchoolName NVARCHAR(200),
    CurrentYear INT,
    CurrentSemester INT,
    SemesterEndDate DATETIME,
    AutoPointEnabled BIT DEFAULT 0,
    UpdatedAt DATETIME DEFAULT GETDATE()
  );
END
IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE Id = 1)
BEGIN
  INSERT INTO SystemSettings (Id, SchoolName, CurrentYear, CurrentSemester, AutoPointEnabled)
  VALUES (1, N'Trường Đại học Kiên Giang', YEAR(GETDATE()), 1, 0);
END", con);
        await ensure.ExecuteNonQueryAsync();

        var rows = await QueryAsync(con, "SELECT TOP 1 SchoolName, CurrentYear, CurrentSemester, SemesterEndDate, AutoPointEnabled FROM SystemSettings WHERE Id = 1");
        if (rows.Count == 0) return Results.NotFound();
        return Results.Ok(rows[0]);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapPut("/api/settings/system", async (SystemSettingsDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        using var ensure = new SqlCommand(@"
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
BEGIN
  CREATE TABLE SystemSettings (
    Id INT PRIMARY KEY,
    SchoolName NVARCHAR(200),
    CurrentYear INT,
    CurrentSemester INT,
    SemesterEndDate DATETIME,
    AutoPointEnabled BIT DEFAULT 0,
    UpdatedAt DATETIME DEFAULT GETDATE()
  );
END
-- Thêm cột mới nếu chưa có
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('SystemSettings') AND name = 'SemesterEndDate')
BEGIN
  ALTER TABLE SystemSettings ADD SemesterEndDate DATETIME;
END
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('SystemSettings') AND name = 'AutoPointEnabled')
BEGIN
  ALTER TABLE SystemSettings ADD AutoPointEnabled BIT DEFAULT 0;
END
IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE Id = 1)
BEGIN
  INSERT INTO SystemSettings (Id, SchoolName, CurrentYear, CurrentSemester, AutoPointEnabled)
  VALUES (1, N'Trường Đại học Kiên Giang', YEAR(GETDATE()), 1, 0);
END", con);
        await ensure.ExecuteNonQueryAsync();

        var sql = @"UPDATE SystemSettings SET
                        SchoolName = COALESCE(@name, SchoolName),
                        CurrentYear = COALESCE(@year, CurrentYear),
                        CurrentSemester = COALESCE(@sem, CurrentSemester),
                        SemesterEndDate = @semesterEndDate,
                        AutoPointEnabled = @autoPointEnabled,
                        UpdatedAt = GETDATE()
                    WHERE Id = 1";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@name", (object?)dto.SchoolName ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@year", (object?)dto.CurrentYear ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@sem", (object?)dto.CurrentSemester ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@semesterEndDate", (object?)dto.SemesterEndDate ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@autoPointEnabled", (object?)dto.AutoPointEnabled ?? DBNull.Value));
        await cmd.ExecuteNonQueryAsync();
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, "UPDATE_SYSTEM_SETTINGS");
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Point settings endpoints
app.MapGet("/api/settings/points", async () =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();
        using var ensure = new SqlCommand(@"
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PointSettings' AND xtype='U')
BEGIN
  CREATE TABLE PointSettings (
    Id INT PRIMARY KEY,
    MaxPoints INT DEFAULT 100,
    MinPoints INT DEFAULT 0,
    ExcellentPoints INT DEFAULT 90,
    GoodPoints INT DEFAULT 80,
    UpdatedAt DATETIME DEFAULT GETDATE()
  );
END
IF NOT EXISTS (SELECT 1 FROM PointSettings WHERE Id = 1)
BEGIN
  INSERT INTO PointSettings (Id, MaxPoints, MinPoints, ExcellentPoints, GoodPoints)
  VALUES (1, 100, 0, 90, 80);
END", con);
        await ensure.ExecuteNonQueryAsync();

        var rows = await QueryAsync(con, "SELECT TOP 1 MaxPoints, MinPoints, ExcellentPoints, GoodPoints FROM PointSettings WHERE Id = 1");
        if (rows.Count == 0) return Results.NotFound();
        return Results.Ok(rows[0]);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapPut("/api/settings/points", async (PointSettingsDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        using var ensure = new SqlCommand(@"
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PointSettings' AND xtype='U')
BEGIN
  CREATE TABLE PointSettings (
    Id INT PRIMARY KEY,
    MaxPoints INT DEFAULT 100,
    MinPoints INT DEFAULT 0,
    ExcellentPoints INT DEFAULT 90,
    GoodPoints INT DEFAULT 80,
    UpdatedAt DATETIME DEFAULT GETDATE()
  );
END
IF NOT EXISTS (SELECT 1 FROM PointSettings WHERE Id = 1)
BEGIN
  INSERT INTO PointSettings (Id, MaxPoints, MinPoints, ExcellentPoints, GoodPoints)
  VALUES (1, 100, 0, 90, 80);
END", con);
        await ensure.ExecuteNonQueryAsync();

        var sql = @"UPDATE PointSettings SET
                        MaxPoints = COALESCE(@max, MaxPoints),
                        MinPoints = COALESCE(@min, MinPoints),
                        ExcellentPoints = COALESCE(@excellent, ExcellentPoints),
                        GoodPoints = COALESCE(@good, GoodPoints),
                        UpdatedAt = GETDATE()
                    WHERE Id = 1";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@max", (object?)dto.MaxPoints ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@min", (object?)dto.MinPoints ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@excellent", (object?)dto.ExcellentPoints ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@good", (object?)dto.GoodPoints ?? DBNull.Value));
        await cmd.ExecuteNonQueryAsync();
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, "UPDATE_POINT_SETTINGS");
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// HoatDongTC: tiêu chí đánh giá
app.MapGet("/api/hoatdongtc", async () =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();
        var rows = await QueryAsync(con, "SELECT Ma, TenHD, SoDiemToiDa, TDTT, IDHoatDong FROM HoatDongTC ORDER BY Ma ASC");
        return Results.Ok(rows);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting HoatDongTC: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// (removed duplicate MapPut for /api/hoatdongtc/{ma})

app.MapPost("/api/hoatdongtc", async (HoatDongTcDto dto) =>
{
    try
    {
        if (string.IsNullOrWhiteSpace(dto.TenHD) || dto.SoDiemToiDa is null)
            return Results.BadRequest(new { message = "Thiếu TenHD/SoDiem" });

        using var con = new SqlConnection(connStr);
        await con.OpenAsync();
        var sql = @"INSERT INTO HoatDongTC (TenHD, SoDiemToiDa, TDTT, IDHoatDong)
                    VALUES (@ten, @diem, @tdtt, @id)";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@ten", dto.TenHD));
        cmd.Parameters.Add(new SqlParameter("@diem", dto.SoDiemToiDa));
        cmd.Parameters.Add(new SqlParameter("@tdtt", dto.TDTT ?? false));
        cmd.Parameters.Add(new SqlParameter("@id", (object?)dto.IDHoatDong ?? DBNull.Value));
        await cmd.ExecuteNonQueryAsync();
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"ADD_HOATDONGTC {dto.IDHoatDong}");
        return Results.Ok(new { message = "Thêm tiêu chí thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error adding HoatDongTC: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapPut("/api/hoatdongtc/{ma}", async (int ma, HoatDongTcDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();
        var sql = @"UPDATE HoatDongTC SET TenHD = COALESCE(@ten, TenHD), SoDiemToiDa = COALESCE(@diem, SoDiemToiDa) WHERE Ma = @ma";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@ten", (object?)dto.TenHD ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@diem", (object?)dto.SoDiemToiDa ?? DBNull.Value));
        cmd.Parameters.Add(new SqlParameter("@ma", ma));
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return Results.NotFound();
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"UPDATE_HOATDONGTC {ma}");
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapDelete("/api/hoatdongtc/{ma}", async (int ma) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();
        var sql = "DELETE FROM HoatDongTC WHERE Ma = @ma";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@ma", ma));
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return Results.NotFound();
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"DELETE_HOATDONGTC {ma}");
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Xóa điểm sinh viên
app.MapDelete("/api/diem/{mssv}/{namHoc}/{hocKi}", async (string mssv, int namHoc, int hocKi) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra bản ghi có tồn tại không
        var checkRecord = await QueryAsync(con, 
            "SELECT 1 FROM LUUTRUDIEMSV WHERE MSSV = @mssv AND NamHoc = @namHoc AND HocKi = @hocKi",
            new SqlParameter("@mssv", mssv.Trim()),
            new SqlParameter("@namHoc", namHoc),
            new SqlParameter("@hocKi", hocKi));

        if (checkRecord.Count == 0)
        {
            return Results.NotFound(new { message = "Không tìm thấy bản ghi điểm" });
        }

        var sql = "DELETE FROM LUUTRUDIEMSV WHERE MSSV = @mssv AND NamHoc = @namHoc AND HocKi = @hocKi";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@mssv", mssv.Trim()));
        cmd.Parameters.Add(new SqlParameter("@namHoc", namHoc));
        cmd.Parameters.Add(new SqlParameter("@hocKi", hocKi));
        
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return Results.NotFound(new { message = "Không tìm thấy bản ghi điểm" });
        
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"DELETE_GRADE MSSV={mssv} Y={namHoc} K={hocKi}");
        return Results.Ok(new { message = "Xóa điểm thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error deleting grade: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Cập nhật trạng thái cán bộ lớp
app.MapPut("/api/sinhvien/{mssv}/cblop", async (string mssv, UpdateCBLopDto dto) =>
{
    try
    {
        Console.WriteLine($"=== CBLop Update Request ===");
        Console.WriteLine($"MSSV: {mssv}");
        Console.WriteLine($"DTO: {System.Text.Json.JsonSerializer.Serialize(dto)}");
        
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra sinh viên có tồn tại không
        var checkStudent = await QueryAsync(con, "SELECT 1 FROM SINHVIEN WHERE MSSV = @mssv", 
            new SqlParameter("@mssv", mssv.Trim()));
        
        Console.WriteLine($"Student exists check: {checkStudent.Count > 0}");
        
        if (checkStudent.Count == 0)
        {
            Console.WriteLine("Student not found");
            return Results.NotFound(new { message = "Không tìm thấy sinh viên" });
        }

        var sql = "UPDATE SINHVIEN SET CBLop = @cblop WHERE MSSV = @mssv";
        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.Add(new SqlParameter("@cblop", dto.CBLop));
        cmd.Parameters.Add(new SqlParameter("@mssv", mssv.Trim()));
        
        Console.WriteLine($"Executing SQL: {sql}");
        Console.WriteLine($"Parameters: CBLop={dto.CBLop}, MSSV={mssv.Trim()}");
        
        var affected = await cmd.ExecuteNonQueryAsync();
        Console.WriteLine($"Rows affected: {affected}");
        
        if (affected == 0) 
        {
            Console.WriteLine("No rows affected");
            return Results.NotFound(new { message = "Không tìm thấy sinh viên" });
        }
        
        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, $"UPDATE_CBLOP MSSV={mssv} CBLop={dto.CBLop}");
        Console.WriteLine("Update successful");
        return Results.Ok(new { message = "Cập nhật trạng thái cán bộ lớp thành công", success = true });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error updating CBLop: {ex.Message}");
        Console.WriteLine($"Stack trace: {ex.StackTrace}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// ==== REPORTS API ====
// Báo cáo tổng hợp
app.MapGet("/api/reports/summary", async (int? year = null) =>
{
    try
    {
        Console.WriteLine($"=== Summary Report Request ===");
        Console.WriteLine($"Year: {year}");
        
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var yearFilter = year.HasValue ? "AND L.NamHoc = @year" : "";
        var parameters = new List<SqlParameter>();
        if (year.HasValue)
        {
            parameters.Add(new SqlParameter("@year", year.Value));
        }

        var sql = $@"
            SELECT 
                COUNT(DISTINCT L.MSSV) as TotalStudents,
                COUNT(DISTINCT L.MSSV) as StudentsWithGrades,
                AVG(CAST(L.TongDRL as FLOAT)) as AverageScore,
                COUNT(CASE WHEN L.TongDRL >= 90 THEN 1 END) as ExcellentCount,
                COUNT(CASE WHEN L.TongDRL >= 80 AND L.TongDRL < 90 THEN 1 END) as GoodCount,
                COUNT(CASE WHEN L.TongDRL >= 70 AND L.TongDRL < 80 THEN 1 END) as FairCount,
                COUNT(CASE WHEN L.TongDRL >= 60 AND L.TongDRL < 70 THEN 1 END) as AverageCount,
                COUNT(CASE WHEN L.TongDRL < 60 THEN 1 END) as PoorCount,
                COUNT(DISTINCT HD.MaHD) as TotalActivities,
                COUNT(CASE WHEN L.viphamNT > 0 THEN 1 END) as StudentsWithSchoolViolations,
                COUNT(CASE WHEN L.viphamXH > 0 THEN 1 END) as StudentsWithSocialViolations,
                COUNT(CASE WHEN L.TGNCKH = 1 THEN 1 END) as StudentsWithResearch
            FROM LUUTRUDIEMSV L
            LEFT JOIN HoatDongTruong HD ON 1=1
            WHERE L.TongDRL IS NOT NULL {yearFilter}";

        var result = await QueryAsync(con, sql, parameters.ToArray());
        return Results.Ok(result.FirstOrDefault() ?? new Dictionary<string, object?>());
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error in summary report: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Báo cáo theo khoa
app.MapGet("/api/reports/faculty", async (int? year = null) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var yearFilter = year.HasValue ? "AND L.NamHoc = @year" : "";
        var parameters = new List<SqlParameter>();
        if (year.HasValue)
        {
            parameters.Add(new SqlParameter("@year", year.Value));
        }

        var sql = $@"
            SELECT 
                K.MaKH,
                K.TenKhoa,
                COUNT(DISTINCT LP.MaLop) as TotalClasses,
                AVG(CAST(L.TongDRL as FLOAT)) as AverageScore,
                COUNT(CASE WHEN L.TongDRL >= 90 THEN 1 END) as ExcellentCount,
                COUNT(CASE WHEN L.TongDRL >= 80 AND L.TongDRL < 90 THEN 1 END) as GoodCount,
                COUNT(CASE WHEN L.TongDRL >= 70 AND L.TongDRL < 80 THEN 1 END) as FairCount,
                COUNT(CASE WHEN L.TongDRL >= 60 AND L.TongDRL < 70 THEN 1 END) as AverageCount,
                COUNT(CASE WHEN L.TongDRL < 60 THEN 1 END) as PoorCount
            FROM KHOA K
            LEFT JOIN Lop LP ON LP.MaKH = K.MaKH
            LEFT JOIN SINHVIEN S ON S.MaLop = LP.MaLop
            LEFT JOIN LUUTRUDIEMSV L ON L.MSSV = S.MSSV AND L.TongDRL IS NOT NULL {yearFilter}
            GROUP BY K.MaKH, K.TenKhoa
            ORDER BY AverageScore DESC";

        var result = await QueryAsync(con, sql, parameters.ToArray());
        Console.WriteLine($"Faculty report query result: {result.Count} faculties found");
        foreach (var faculty in result)
        {
            Console.WriteLine($"Faculty: {faculty["TenKhoa"]}, Classes: {faculty["TotalClasses"]}, AvgScore: {faculty["AverageScore"]}");
        }
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error in faculty report: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Báo cáo theo lớp
app.MapGet("/api/reports/class", async (int? year = null) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var yearFilter = year.HasValue ? "AND L.NamHoc = @year" : "";
        var parameters = new List<SqlParameter>();
        if (year.HasValue)
        {
            parameters.Add(new SqlParameter("@year", year.Value));
        }

        var sql = $@"
            SELECT 
                LP.MaLop,
                LP.TenLop,
                K.TenKhoa,
                COUNT(DISTINCT L.MSSV) as TotalStudents,
                AVG(CAST(L.TongDRL as FLOAT)) as AverageScore,
                COUNT(CASE WHEN L.TongDRL >= 90 THEN 1 END) as ExcellentCount,
                COUNT(CASE WHEN L.TongDRL >= 80 AND L.TongDRL < 90 THEN 1 END) as GoodCount,
                COUNT(CASE WHEN L.TongDRL >= 70 AND L.TongDRL < 80 THEN 1 END) as FairCount,
                COUNT(CASE WHEN L.TongDRL >= 60 AND L.TongDRL < 70 THEN 1 END) as AverageCount,
                COUNT(CASE WHEN L.TongDRL < 60 THEN 1 END) as PoorCount
            FROM Lop LP
            LEFT JOIN KHOA K ON K.MaKH = LP.MaKH
            LEFT JOIN SINHVIEN S ON S.MaLop = LP.MaLop
            LEFT JOIN LUUTRUDIEMSV L ON L.MSSV = S.MSSV AND L.TongDRL IS NOT NULL {yearFilter}
            GROUP BY LP.MaLop, LP.TenLop, K.TenKhoa
            ORDER BY AverageScore DESC";

        var result = await QueryAsync(con, sql, parameters.ToArray());
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error in class report: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Báo cáo hoạt động
app.MapGet("/api/reports/activity", async (int? year = null) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var yearFilter = year.HasValue ? "AND YEAR(HD.NgayBD) = @year" : "";
        var parameters = new List<SqlParameter>();
        if (year.HasValue)
        {
            parameters.Add(new SqlParameter("@year", year.Value));
        }

        var sql = $@"
            SELECT 
                HD.MaHD,
                HD.TenHD,
                HD.DiemRL,
                HD.SoSvDK,
                HD.NgayBD,
                HD.NgayKT,
                HD.DiaDiem,
                COUNT(DISTINCT SVDG.MSSV) as ActualParticipants,
                CASE 
                    WHEN HD.SoSvDK IS NOT NULL THEN 
                        CAST(COUNT(DISTINCT SVDG.MSSV) as FLOAT) / HD.SoSvDK * 100
                    ELSE NULL 
                END as ParticipationRate
            FROM HoatDongTruong HD
            LEFT JOIN SinhvienDG SVDG ON SVDG.IDHoatDong = HD.MaHD
            WHERE 1=1 {yearFilter}
            GROUP BY HD.MaHD, HD.TenHD, HD.DiemRL, HD.SoSvDK, HD.NgayBD, HD.NgayKT, HD.DiaDiem
            ORDER BY HD.NgayBD DESC";

        var result = await QueryAsync(con, sql, parameters.ToArray());
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error in activity report: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Lấy danh sách năm học có dữ liệu
app.MapGet("/api/reports/years", async () =>
{
    try
    {
        Console.WriteLine($"=== Years Report Request ===");
        
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
            SELECT DISTINCT NamHoc 
            FROM LUUTRUDIEMSV 
            WHERE NamHoc IS NOT NULL 
            ORDER BY NamHoc DESC";

        var result = await QueryAsync(con, sql);
        return Results.Ok(result.Select(r => r["NamHoc"]));
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting years: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Lấy chi tiết sinh viên trong lớp
app.MapGet("/api/reports/class/{maLop}/students", async (string maLop, int? year = null) =>
{
    try
    {
        Console.WriteLine($"=== Class Students Detail Request ===");
        Console.WriteLine($"MaLop: {maLop}, Year: {year}");
        
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var yearFilter = year.HasValue ? "AND L.NamHoc = @year" : "";
        var parameters = new List<SqlParameter>
        {
            new SqlParameter("@maLop", maLop)
        };
        if (year.HasValue)
        {
            parameters.Add(new SqlParameter("@year", year.Value));
        }

        var sql = $@"
            SELECT 
                S.MSSV,
                S.TenSV as HoTen,
                S.Email,
                S.SDT,
                S.DiaChi,
                S.CBLop,
                K.TenKhoa,
                LP.TenLop,
                L.NamHoc,
                L.HocKi,
                L.DiemTBM_4,
                L.DiemTBM_10,
                L.TongDRL,
                L.viphamNT,
                L.viphamXH,
                L.TGNCKH,
                CASE 
                    WHEN L.TongDRL >= 90 THEN N'Xuất sắc'
                    WHEN L.TongDRL >= 80 THEN N'Giỏi'
                    WHEN L.TongDRL >= 70 THEN N'Khá'
                    WHEN L.TongDRL >= 60 THEN N'Trung bình'
                    ELSE N'Yếu'
                END as XepLoai
            FROM SINHVIEN S
            LEFT JOIN KHOA K ON K.MaKH = S.MaKH
            LEFT JOIN Lop LP ON LP.MaLop = S.MaLop
            LEFT JOIN (
                SELECT 
                    MSSV,
                    NamHoc,
                    HocKi,
                    DiemTBM_4,
                    DiemTBM_10,
                    TongDRL,
                    viphamNT,
                    viphamXH,
                    TGNCKH,
                    ROW_NUMBER() OVER (PARTITION BY MSSV ORDER BY NamHoc DESC, HocKi DESC) as rn
                FROM LUUTRUDIEMSV
                WHERE TongDRL IS NOT NULL {yearFilter}
            ) L ON L.MSSV = S.MSSV AND L.rn = 1
            WHERE S.MaLop = @maLop
            ORDER BY L.TongDRL DESC, S.TenSV";

        var result = await QueryAsync(con, sql, parameters.ToArray());
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting class students: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// ==================== QR CODE APIs ====================

// Tạo QR code cho hoạt động
app.MapPost("/api/activities/{maHD}/generate-qr", async (string maHD, string? createdBy) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra hoạt động có tồn tại không
        var checkActivity = "SELECT MaHD, TenHD FROM HoatDongTruong WHERE MaHD = @maHD";
        var activityResult = await QueryAsync(con, checkActivity, new SqlParameter("@maHD", maHD));
        
        if (activityResult.Count == 0)
        {
            return Results.NotFound(new { error = "Hoạt động không tồn tại" });
        }

        var activity = activityResult[0];
        var activityName = activity["TenHD"]?.ToString() ?? "Unknown";

        // Tạo dữ liệu QR code (URL để sinh viên quét)
        var qrData = $"{{\"maHD\":\"{maHD}\",\"tenHD\":\"{activityName}\",\"timestamp\":{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}}}";
        
        // Tạo QR code image
        using var qrGenerator = new QRCodeGenerator();
        using var qrCodeData = qrGenerator.CreateQrCode(qrData, QRCodeGenerator.ECCLevel.Q);
        using var qrCode = new PngByteQRCode(qrCodeData);
        var qrCodeBytes = qrCode.GetGraphic(20);

        // qrCodeBytes đã được tạo từ PngByteQRCode

        // Lưu QR code vào database
        var insertQR = @"
            INSERT INTO ActivityQRCode (MaHD, QRCodeData, QRCodeImage, CreatedBy, ExpiresAt)
            VALUES (@maHD, @qrData, @qrImage, @createdBy, @expiresAt)";
        
        var parameters = new[]
        {
            new SqlParameter("@maHD", maHD),
            new SqlParameter("@qrData", qrData),
            new SqlParameter("@qrImage", qrCodeBytes),
            new SqlParameter("@createdBy", createdBy ?? "SYSTEM"),
            new SqlParameter("@expiresAt", DateTime.Now.AddDays(30)) // QR code hết hạn sau 30 ngày
        };

        await ExecuteNonQueryAsync(con, insertQR, parameters);

        // Cập nhật trạng thái hoạt động - Tự động bật QR registration và HasQRCode
        var updateActivity = @"
            UPDATE HoatDongTruong 
            SET HasQRCode = 1, AllowQRRegistration = 1 
            WHERE MaHD = @maHD";
        await ExecuteNonQueryAsync(con, updateActivity, new SqlParameter("@maHD", maHD));
        
        Console.WriteLine($"✓ Updated activity {maHD}: HasQRCode=1, AllowQRRegistration=1");

        return Results.Ok(new { 
            success = true, 
            message = "QR code đã được tạo thành công",
            qrData = qrData,
            activityName = activityName
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error generating QR code: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Lấy QR code của hoạt động
app.MapGet("/api/activities/{maHD}/qr", async (string maHD) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
            SELECT TOP 1 Id, QRCodeData, QRCodeImage, CreatedAt, ExpiresAt, IsActive
            FROM ActivityQRCode 
            WHERE MaHD = @maHD AND IsActive = 1
            ORDER BY CreatedAt DESC";

        var result = await QueryAsync(con, sql, new SqlParameter("@maHD", maHD));
        
        if (result.Count == 0)
        {
            return Results.NotFound(new { error = "Không tìm thấy QR code cho hoạt động này" });
        }

        var qrCode = result[0];
        var qrImageBytes = qrCode["QRCodeImage"] as byte[];
        
        if (qrImageBytes == null)
        {
            return Results.NotFound(new { error = "QR code image không tồn tại" });
        }

        return Results.File(qrImageBytes, "image/png", $"qr-{maHD}.png");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting QR code: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Lấy thông tin hoạt động từ QR data
// API để cập nhật tất cả hoạt động cho phép QR registration
app.MapPost("/api/debug/fix-qr-permissions", async () =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Cập nhật tất cả hoạt động có AllowQRRegistration = NULL thành 1
        var updateAll = @"
            UPDATE HoatDongTruong 
            SET AllowQRRegistration = 1 
            WHERE AllowQRRegistration IS NULL";
        
        var affectedRows = await ExecuteNonQueryAsync(con, updateAll);
        
        Console.WriteLine($"✓ Updated {affectedRows} activities to allow QR registration");

        return Results.Ok(new { 
            success = true, 
            message = $"Đã cập nhật {affectedRows} hoạt động cho phép đăng ký QR",
            updatedCount = affectedRows
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error fixing QR permissions: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Lấy danh sách hoạt động đã đăng ký của sinh viên
app.MapGet("/api/students/{mssv}/registrations", async (string mssv) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
            SELECT ar.MaHD, ar.RegisteredAt, hd.TenHD
            FROM ActivityRegistration ar
            INNER JOIN HoatDongTruong hd ON ar.MaHD = hd.MaHD
            WHERE ar.MSSV = @mssv
            ORDER BY ar.RegisteredAt DESC";

        var result = await QueryAsync(con, sql, new SqlParameter("@mssv", mssv));
        
        Console.WriteLine($"Found {result.Count} registrations for student {mssv}");

        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting student registrations: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Debug endpoint để kiểm tra dữ liệu hoạt động
app.MapGet("/api/debug/activities", async () =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
            SELECT MaHD, TenHD, DiemRL, AllowQRRegistration, HasQRCode, NDHD
            FROM HoatDongTruong 
            ORDER BY MaHD";

        var result = await QueryAsync(con, sql);
        
        Console.WriteLine($"Found {result.Count} activities in database");
        foreach (var activity in result)
        {
            Console.WriteLine($"- {activity["MaHD"]}: {activity["TenHD"]} (AllowQR: {activity["AllowQRRegistration"]}, HasQR: {activity["HasQRCode"]})");
        }

        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting activities: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapGet("/api/qr/activity-info", async (string qrData) =>
{
    try
    {
        // Parse QR data để lấy maHD
        var qrInfo = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object>>(qrData);
        if (qrInfo == null || !qrInfo.ContainsKey("maHD"))
        {
            return Results.BadRequest(new { error = "QR code không hợp lệ" });
        }

        var maHD = qrInfo["maHD"].ToString();
        
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
            SELECT hd.MaHD, hd.TenHD, hd.DiemRL as SoDiemToiDa, hd.NgayBD, hd.NgayKT, hd.DiaDiem,
                   hd.SoSvDK, hd.TUKHOA, hd.NDHD as MoTa, hd.AllowQRRegistration
            FROM HoatDongTruong hd
            WHERE hd.MaHD = @maHD AND hd.AllowQRRegistration = 1";

        var result = await QueryAsync(con, sql, new SqlParameter("@maHD", maHD));
        
        Console.WriteLine($"QR Activity Info Query - MaHD: {maHD}");
        Console.WriteLine($"Query result count: {result.Count}");
        
        if (result.Count == 0)
        {
            Console.WriteLine("No activity found for QR code");
            
            // Kiểm tra xem hoạt động có tồn tại không (không cần AllowQRRegistration)
            var checkExists = "SELECT MaHD, TenHD, AllowQRRegistration FROM HoatDongTruong WHERE MaHD = @maHD";
            var existsResult = await QueryAsync(con, checkExists, new SqlParameter("@maHD", maHD));
            
            if (existsResult.Count > 0)
            {
                var activity = existsResult[0];
                Console.WriteLine($"Activity exists but AllowQRRegistration = {activity["AllowQRRegistration"]}");
                return Results.BadRequest(new { error = $"Hoạt động {maHD} tồn tại nhưng không cho phép đăng ký qua QR code" });
            }
            else
            {
                Console.WriteLine($"Activity {maHD} does not exist in database");
                return Results.NotFound(new { error = "Hoạt động không tồn tại trong hệ thống" });
            }
        }

        var activityInfo = result[0];
        Console.WriteLine($"Activity found: {activityInfo["TenHD"]}");
        Console.WriteLine($"SoDiemToiDa: {activityInfo["SoDiemToiDa"]}");
        Console.WriteLine($"MoTa: {activityInfo["MoTa"]}");

        return Results.Ok(activityInfo);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting activity info from QR: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Đăng ký hoạt động qua QR
app.MapPost("/api/activities/register", async (RegisterActivityDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra sinh viên có tồn tại không
        var checkStudent = "SELECT MSSV, TenSV FROM SINHVIEN WHERE MSSV = @mssv";
        var studentResult = await QueryAsync(con, checkStudent, new SqlParameter("@mssv", dto.MSSV));
        
        if (studentResult.Count == 0)
        {
            return Results.NotFound(new { error = "Sinh viên không tồn tại" });
        }

        // Kiểm tra đã đăng ký chưa
        var checkRegistration = @"
            SELECT Id FROM ActivityRegistration 
            WHERE MaHD = @maHD AND MSSV = @mssv";
        
        var existingRegistration = await QueryAsync(con, checkRegistration, 
            new SqlParameter("@maHD", dto.MaHD), 
            new SqlParameter("@mssv", dto.MSSV));
        
        if (existingRegistration.Count > 0)
        {
            return Results.BadRequest(new { error = "Bạn đã đăng ký hoạt động này rồi" });
        }

        // Lấy QR code ID
        var getQRCode = @"
            SELECT TOP 1 Id FROM ActivityQRCode 
            WHERE MaHD = @maHD AND IsActive = 1
            ORDER BY CreatedAt DESC";
        
        var qrResult = await QueryAsync(con, getQRCode, new SqlParameter("@maHD", dto.MaHD));
        
        if (qrResult.Count == 0)
        {
            return Results.BadRequest(new { error = "Hoạt động chưa có QR code" });
        }

        var qrCodeId = qrResult[0]["Id"];

        // Tạo đăng ký
        var insertRegistration = @"
            INSERT INTO ActivityRegistration (MaHD, MSSV, QRCodeId, Status, IsEligibleForEvidence)
            VALUES (@maHD, @mssv, @qrCodeId, 'PENDING', 1)";
        
        await ExecuteNonQueryAsync(con, insertRegistration,
            new SqlParameter("@maHD", dto.MaHD),
            new SqlParameter("@mssv", dto.MSSV),
            new SqlParameter("@qrCodeId", qrCodeId));

        return Results.Ok(new { 
            success = true, 
            message = "Đăng ký thành công! Bạn có thể nộp minh chứng ngay bây giờ.",
            canSubmitEvidence = true
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error registering activity: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// Lấy danh sách đăng ký của hoạt động (cho giảng viên)
app.MapGet("/api/activities/{maHD}/registrations", async (string maHD) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
            SELECT ar.Id, ar.MSSV, s.TenSV, s.Email, s.SDT, ar.RegisteredAt, 
                   ar.Status, ar.IsEligibleForEvidence, ar.ApprovedAt, ar.Notes
            FROM ActivityRegistration ar
            JOIN SINHVIEN s ON s.MSSV = ar.MSSV
            WHERE ar.MaHD = @maHD
            ORDER BY ar.RegisteredAt DESC";

        var result = await QueryAsync(con, sql, new SqlParameter("@maHD", maHD));
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting activity registrations: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// API để thêm thông tin Giảng viên
app.MapPost("/api/giangvien", async (GiangVienInfoDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra xem đã có thông tin chưa
        var checkSql = "SELECT COUNT(*) FROM GiangVien WHERE MaCaNhan = @maCaNhan";
        var existing = await QueryAsync(con, checkSql, new SqlParameter("@maCaNhan", dto.MaCaNhan));
        
        if ((int)(existing[0].Values.First() ?? 0) > 0)
        {
            return Results.BadRequest(new { error = "Thông tin giảng viên đã tồn tại" });
        }

        var sql = @"INSERT INTO GiangVien (MaCaNhan, TenGV, SDT, Email, MaKH, LopCV, DiaChi) 
                    VALUES (@maCaNhan, @tenGV, @sdt, @email, @maKH, @lopCV, @diaChi)";

        await ExecuteNonQueryAsync(con, sql,
            new SqlParameter("@maCaNhan", dto.MaCaNhan),
            new SqlParameter("@tenGV", dto.TenGV),
            new SqlParameter("@sdt", (object?)dto.SDT ?? DBNull.Value),
            new SqlParameter("@email", (object?)dto.Email ?? DBNull.Value),
            new SqlParameter("@maKH", (object?)dto.MaKH ?? DBNull.Value),
            new SqlParameter("@lopCV", (object?)dto.LopCV ?? DBNull.Value),
            new SqlParameter("@diaChi", (object?)dto.DiaChi ?? DBNull.Value)
        );

        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, "ADD_GIANGVIEN_INFO", dto.MaCaNhan);
        return Results.Ok(new { message = "Thêm thông tin giảng viên thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error adding giangvien info: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// API để thêm thông tin Sinh viên
app.MapPost("/api/sinhvien-info", async (SinhVienInfoDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra xem đã có thông tin chưa
        var checkSql = "SELECT COUNT(*) FROM SINHVIEN WHERE MaCaNhan = @maCaNhan";
        var existing = await QueryAsync(con, checkSql, new SqlParameter("@maCaNhan", dto.MSSV));
        
        if ((int)(existing[0].Values.First() ?? 0) > 0)
        {
            return Results.BadRequest(new { error = "Thông tin sinh viên đã tồn tại" });
        }

        var sql = @"INSERT INTO SINHVIEN (MSSV, MaCaNhan, TenSV, SDT, Email, DiaChi, MaLop, MaKH, MaKhoa, TVCLBKhoa, TVCLBTruong, CBLop) 
                    VALUES (@mssv, @maCaNhan, @tenSV, @sdt, @email, @diaChi, @maLop, @maKH, @maKhoa, @tvclbkhoa, @tvclbtruong, @cblop)";

        await ExecuteNonQueryAsync(con, sql,
            new SqlParameter("@mssv", dto.MSSV),
            new SqlParameter("@maCaNhan", dto.MSSV), // MaCaNhan = MSSV
            new SqlParameter("@tenSV", dto.TenSV),
            new SqlParameter("@sdt", (object?)dto.SDT ?? DBNull.Value),
            new SqlParameter("@email", (object?)dto.Email ?? DBNull.Value),
            new SqlParameter("@diaChi", (object?)dto.DiaChi ?? DBNull.Value),
            new SqlParameter("@maLop", (object?)dto.MaLop ?? DBNull.Value),
            new SqlParameter("@maKH", (object?)dto.MaKH ?? DBNull.Value),
            new SqlParameter("@maKhoa", (object?)dto.MaKhoa ?? DBNull.Value),
            new SqlParameter("@tvclbkhoa", dto.TVCLBKhoa ?? false),
            new SqlParameter("@tvclbtruong", dto.TVCLBTruong ?? false),
            new SqlParameter("@cblop", dto.CBLop ?? false)
        );

        await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext!, con, "ADD_SINHVIEN_INFO", dto.MSSV);
        return Results.Ok(new { message = "Thêm thông tin sinh viên thành công" });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error adding sinhvien info: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// API để lấy thông tin chi tiết người dùng (bao gồm mật khẩu)
app.MapGet("/api/users/{maCaNhan}/details", async (string maCaNhan) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = "SELECT MaCaNhan, TenTK, MatKhau, TenNguoiDung, ChucVu, MaQT, TrangThai FROM TK WHERE MaCaNhan = @maCaNhan";
        var result = await QueryAsync(con, sql, new SqlParameter("@maCaNhan", maCaNhan));
        
        if (result.Count == 0)
        {
            return Results.NotFound(new { error = "Không tìm thấy người dùng" });
        }

        var user = result[0];
        return Results.Ok(new {
            MaCaNhan = user["MaCaNhan"]?.ToString(),
            TenTK = user["TenTK"]?.ToString(),
            MatKhau = user["MatKhau"]?.ToString(), // Trả về mật khẩu để hiển thị
            TenNguoiDung = user["TenNguoiDung"]?.ToString(),
            ChucVu = user["ChucVu"]?.ToString(),
            MaQT = user["MaQT"]?.ToString(),
            TrangThai = user["TrangThai"]
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting user details: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// API để lấy thông tin chi tiết giảng viên
app.MapGet("/api/giangvien/{maCaNhan}", async (string maCaNhan) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
SELECT GV.MaCaNhan, GV.TenGV, GV.SDT, GV.Email, GV.DiaChi, GV.MaKH, GV.LopCV,
       K.TenKhoa, L.TenLop
FROM GiangVien GV
LEFT JOIN KHOA K ON K.MaKH = GV.MaKH
LEFT JOIN Lop L ON L.MaLop = GV.LopCV
WHERE GV.MaCaNhan = @maCaNhan;";
        
        var result = await QueryAsync(con, sql, new SqlParameter("@maCaNhan", maCaNhan));
        
        if (result.Count == 0)
        {
            return Results.NotFound(new { error = "Không tìm thấy thông tin giảng viên" });
        }

        var giangVien = result[0];
        return Results.Ok(new {
            MaCaNhan = giangVien["MaCaNhan"]?.ToString(),
            TenGV = giangVien["TenGV"]?.ToString(),
            SDT = giangVien["SDT"]?.ToString(),
            Email = giangVien["Email"]?.ToString(),
            DiaChi = giangVien["DiaChi"]?.ToString(),
            MaKH = giangVien["MaKH"]?.ToString(),
            TenKhoa = giangVien["TenKhoa"]?.ToString(),
            LopCV = giangVien["LopCV"]?.ToString(),
            TenLop = giangVien["TenLop"]?.ToString()
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error getting giangvien details: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// API để kiểm tra thông tin đã tồn tại chưa
app.MapGet("/api/user-info/{maCaNhan}", async (string maCaNhan) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        // Kiểm tra người dùng có tồn tại trong bảng TK không
        var userSql = "SELECT MaQT FROM TK WHERE MaCaNhan = @maCaNhan";
        var userInfo = await QueryAsync(con, userSql, new SqlParameter("@maCaNhan", maCaNhan));
        
        if (userInfo.Count == 0)
        {
            return Results.NotFound(new { error = "Không tìm thấy người dùng" });
        }

        var maQT = userInfo[0]["MaQT"]?.ToString();

        // Kiểm tra trong cả 2 bảng SINHVIEN và GiangVien bằng MaCaNhan
        var sinhVienSql = "SELECT COUNT(*) FROM SINHVIEN WHERE MaCaNhan = @maCaNhan";
        var giangVienSql = "SELECT COUNT(*) FROM GiangVien WHERE MaCaNhan = @maCaNhan";
        
        var sinhVienResult = await QueryAsync(con, sinhVienSql, new SqlParameter("@maCaNhan", maCaNhan));
        var giangVienResult = await QueryAsync(con, giangVienSql, new SqlParameter("@maCaNhan", maCaNhan));
        
        var hasSinhVienInfo = (int)(sinhVienResult[0].Values.First() ?? 0) > 0;
        var hasGiangVienInfo = (int)(giangVienResult[0].Values.First() ?? 0) > 0;
        
        Console.WriteLine($"User {maCaNhan}: MaQT={maQT}, hasSinhVienInfo={hasSinhVienInfo}, hasGiangVienInfo={hasGiangVienInfo}");
        
        // Xác định infoType dựa trên thông tin thực tế có trong database
        string infoType;
        bool hasInfo;
        
        if (maQT == "AD01") // Admin luôn là admin, không cần thông tin chi tiết
        {
            infoType = "admin";
            hasInfo = false; // Admin không cần thông tin chi tiết
        }
        else
        {
            hasInfo = hasSinhVienInfo || hasGiangVienInfo;
            
            // Xác định infoType dựa trên thông tin có sẵn trong database
            if (hasGiangVienInfo)
            {
                infoType = "giangvien";
            }
            else if (hasSinhVienInfo)
            {
                infoType = "sinhvien";
            }
            else
            {
                // Nếu không có thông tin chi tiết, xác định dựa trên MaQT
                if (maQT == "GV01")
                {
                    infoType = "giangvien";
                }
                else if (maQT == "SV01")
                {
                    infoType = "sinhvien";
                }
                else
                {
                    infoType = "other";
                }
            }
        }

        var result = new { 
            hasInfo, 
            infoType, 
            maQT,
            hasSinhVienInfo,
            hasGiangVienInfo
        };
        
        Console.WriteLine($"User {maCaNhan} result: {System.Text.Json.JsonSerializer.Serialize(result)}");
        
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error checking user info: {ex.Message}");
        return Results.BadRequest(new { error = ex.Message });
    }
});

// API để cập nhật thông tin chi tiết sinh viên
app.MapPut("/api/sinhvien-detail/{mssv}", async (string mssv, SinhVienInfoDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
UPDATE SINHVIEN
SET
    TenSV = @TenSV,
    SDT = @SDT,
    Email = @Email,
    DiaChi = @DiaChi,
    MaLop = @MaLop,
    MaKH = @MaKH,
    MaKhoa = @MaKhoa,
    TVCLBKhoa = @TVCLBKhoa,
    TVCLBTruong = @TVCLBTruong,
    CBLop = @CBLop
WHERE MSSV = @MSSV;";

        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.AddRange(new[]
        {
            new SqlParameter("@TenSV", dto.TenSV),
            new SqlParameter("@SDT", (object?)dto.SDT ?? DBNull.Value),
            new SqlParameter("@Email", (object?)dto.Email ?? DBNull.Value),
            new SqlParameter("@DiaChi", (object?)dto.DiaChi ?? DBNull.Value),
            new SqlParameter("@MaLop", (object?)dto.MaLop ?? DBNull.Value),
            new SqlParameter("@MaKH", (object?)dto.MaKH ?? DBNull.Value),
            new SqlParameter("@MaKhoa", (object?)dto.MaKhoa ?? DBNull.Value),
            new SqlParameter("@TVCLBKhoa", dto.TVCLBKhoa ?? false),
            new SqlParameter("@TVCLBTruong", dto.TVCLBTruong ?? false),
            new SqlParameter("@CBLop", dto.CBLop ?? false),
            new SqlParameter("@MSSV", mssv.Trim())
        });

        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0)
        {
            return Results.NotFound(new { error = "Không tìm thấy sinh viên" });
        }

        return Results.Ok(new { message = "Cập nhật thông tin sinh viên thành công" });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Lỗi cập nhật thông tin sinh viên: {ex.Message}");
    }
});

// API để cập nhật thông tin chi tiết giảng viên
app.MapPut("/api/giangvien-detail/{maCaNhan}", async (string maCaNhan, GiangVienInfoDto dto) =>
{
    try
    {
        using var con = new SqlConnection(connStr);
        await con.OpenAsync();

        var sql = @"
UPDATE GIANGVIEN
SET
    TenGV = @TenGV,
    SDT = @SDT,
    Email = @Email,
    MaKH = @MaKH,
    LopCV = @LopCV,
    DiaChi = @DiaChi
WHERE MaCaNhan = @MaCaNhan;";

        using var cmd = new SqlCommand(sql, con);
        cmd.Parameters.AddRange(new[]
        {
            new SqlParameter("@TenGV", dto.TenGV),
            new SqlParameter("@SDT", (object?)dto.SDT ?? DBNull.Value),
            new SqlParameter("@Email", (object?)dto.Email ?? DBNull.Value),
            new SqlParameter("@MaKH", (object?)dto.MaKH ?? DBNull.Value),
            new SqlParameter("@LopCV", (object?)dto.LopCV ?? DBNull.Value),
            new SqlParameter("@DiaChi", (object?)dto.DiaChi ?? DBNull.Value),
            new SqlParameter("@MaCaNhan", maCaNhan.Trim())
        });

        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0)
        {
            return Results.NotFound(new { error = "Không tìm thấy giảng viên" });
        }

        return Results.Ok(new { message = "Cập nhật thông tin giảng viên thành công" });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Lỗi cập nhật thông tin giảng viên: {ex.Message}");
    }
});

app.Run();

public record LoginDto(string TenTK, string MatKhau);
public record UpdateSinhVienDto(string? SDT, string? DiaChi);
public record UpdateCBLopDto(bool CBLop);
public record RegisterActivityDto(string MaHD, string MSSV);
public record DiemDto(string MSSV, int? NamHoc, int? HocKi, decimal? DiemTBM_4 = null, decimal? DiemTBM_10 = null, int? TongDRL = null, string? Khoas = null, int? viphamNT = null, int? viphamXH = null, bool? TGNCKH = null);
public record HoatDongDto(
    string MaHD,
    string TenHD,
    int DiemRL,
    DateTime NgayBD,
    DateTime NgayKT,
    int? SoSvDK = null,
    string? NDHD = null,
    string? DiaDiem = null,
    string? TUKHOA = null
);
public record KhoaDto(string MaKH, string TenKhoa);
public record LopDto(string MaLop, string TenLop, string MaKH);
public record UserCreateDto(
    string MaCaNhan,
    string TenTK,
    string MatKhau,
    string TenNguoiDung,
    string ChucVu,
    string MaQT
);
public record ChangePasswordDto(string? OldPassword, string NewPassword);
public record UserUpdateDto(
    string? TenTK,
    string? MatKhau,
    string? TenNguoiDung,
    string? ChucVu,
    string? MaQT
);
public record HoatDongTcDto(string TenHD, int? SoDiemToiDa, bool? TDTT, string? IDHoatDong);
public record SystemSettingsDto(string? SchoolName, int? CurrentYear, int? CurrentSemester, DateTime? SemesterEndDate, bool? AutoPointEnabled);
public record PointSettingsDto(int? MaxPoints, int? MinPoints, int? ExcellentPoints, int? GoodPoints);
public record GiangVienInfoDto(string MaCaNhan, string TenGV, string? SDT, string? Email, string? MaKH, string? LopCV, string? DiaChi);
public record SinhVienInfoDto(string MSSV, string TenSV, string? SDT, string? Email, string? DiaChi, string? MaLop, string? MaKH, string? MaKhoa, bool? TVCLBKhoa, bool? TVCLBTruong, bool? CBLop);
