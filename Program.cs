using Microsoft.Data.SqlClient;
using System.Data;

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

var app = builder.Build();
app.UseCors();

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

// app.MapGet("/", () => Results.Ok(new { ok = true, service = "QLDRLApi" }));

// 2.1) Preload: chỉ tải dữ liệu KHÔNG nhạy cảm (Khoa, Lớp, HoạtĐộngTC)
app.MapGet("/api/preload", async () =>
{
    using var con = new SqlConnection(connStr);
    await con.OpenAsync();

    var khoa = await QueryAsync(con, "SELECT MaKH, TenKhoa FROM KHOA ORDER BY TenKhoa;");
    var lop = await QueryAsync(con, "SELECT MaLop, TenLop, MaKH FROM Lop ORDER BY TenLop;");
    var hoatDongTruong = await QueryAsync(con, "SELECT MaHD, TenHD, DiemRL, NDHD, NgayBD, NgayKT, SoSvDK FROM HoatDongTruong ORDER BY MaHD DESC;");
    Console.WriteLine($"Số hoạt động đọc được: {hoatDongTruong.Count}");

    return Results.Ok(new
    {
        khoa = khoa,
        lop = lop,
        hoatDongTruong = hoatDongTruong
    });
});

// 2.2) Đăng nhập: kiểm tra trên server (không gửi mật khẩu ra client)
app.MapPost("/api/auth/login", async (LoginDto dto) =>
{
    if (string.IsNullOrWhiteSpace(dto.TenTK) || string.IsNullOrWhiteSpace(dto.MatKhau))
        return Results.BadRequest(new { message = "Thiếu TenTK/MatKhau" });

    using var con = new SqlConnection(connStr);
    await con.OpenAsync();

    var sql = @"SELECT MaCaNhan, TenTK, TenNguoiDung, ChucVu
                FROM TK
                WHERE TenTK = @u AND MatKhau = @p;";
    var rows = await QueryAsync(con, sql,
        new SqlParameter("@u", dto.TenTK.Trim()),
        new SqlParameter("@p", dto.MatKhau.Trim()));

    if (rows.Count == 0) return Results.Unauthorized();

    return Results.Ok(rows[0]); // chỉ trả thông tin tối thiểu
});

// 2.3) Xem chi tiết sinh viên (join Khoa/Lớp)
app.MapGet("/api/sinhvien/{mssv}", async (string mssv) =>
{
    using var con = new SqlConnection(connStr);
    await con.OpenAsync();

    var sql = @"
SELECT SV.MSSV, SV.TenSV, SV.SDT, SV.Email, SV.DiaChi, SV.MaLop, SV.MaKH, SV.AnhDD,
       L.TenLop, K.TenKhoa
FROM SINHVIEN SV
LEFT JOIN Lop L ON L.MaLop = SV.MaLop
LEFT JOIN KHOA K ON K.MaKH = SV.MaKH
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
SELECT MSSV, Khoas, HocKi, DiemTBM_4, DiemTBM_10, TongDRL, NamHoc
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
        
        if (checkTable[0]["count"].ToString() == "0")
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

app.Run();

public record LoginDto(string TenTK, string MatKhau);
public record UpdateSinhVienDto(string? SDT, string? DiaChi);
