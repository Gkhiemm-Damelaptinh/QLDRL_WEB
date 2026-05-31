using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.RateLimiting;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Primitives;
using QLDRL.API.Infrastructure;
using QLDRL.API.Services;
using QRCoder;

[CompilerGenerated]
internal partial class Program
{
	private static async Task Main(string[] args)
	{
		WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
		if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
		{
			Console.WriteLine("[STARTUP] Running on Windows - POSIX signal handling may be limited");
			try
			{
			}
			catch
			{
			}
		}
		builder.Host.ConfigureHostOptions(delegate(HostOptions options)
		{
			options.ShutdownTimeout = TimeSpan.FromSeconds(300L);
		});
		builder.Services.AddHttpContextAccessor();
		string[] allowedOrigins = builder.Configuration.GetSection("Security:AllowedOrigins").Get<string[]>() ?? new string[1] { "*" };
		builder.Services.AddCors(delegate(CorsOptions options)
		{
			options.AddPolicy("DefaultCors", delegate(CorsPolicyBuilder policy)
			{
				if (allowedOrigins.Length == 1 && allowedOrigins[0] == "*")
				{
					policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
				}
				else
				{
					policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
				}
			});
		});
		bool isDev = builder.Environment.IsDevelopment();
		builder.Services.AddRateLimiter(delegate(RateLimiterOptions options)
		{
			options.GlobalLimiter = PartitionedRateLimiter.Create(delegate(HttpContext httpContext)
			{
				if (isDev)
				{
					return RateLimitPartition.GetNoLimiter("dev");
				}
				string method = httpContext.Request.Method;
				if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
				{
					return RateLimitPartition.GetNoLimiter("safe");
				}
				string partitionKey = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
				return RateLimitPartition.GetFixedWindowLimiter(partitionKey, (string _) => new FixedWindowRateLimiterOptions
				{
					PermitLimit = 120,
					Window = TimeSpan.FromMinutes(1L),
					QueueLimit = 100,
					QueueProcessingOrder = QueueProcessingOrder.OldestFirst
				});
			});
			options.RejectionStatusCode = 429;
		});
		builder.Services.AddHttpClient<AiClient>(delegate(HttpClient client)
		{
			string uriString = builder.Configuration["AI:BaseUrl"] ?? builder.Configuration["AIService:BaseUrl"] ?? "http://127.0.0.1:7001";
			client.BaseAddress = new Uri(uriString);
		});
		builder.Services.Configure<AiOptions>(builder.Configuration.GetSection("AI"));
		WebApplication app = builder.Build();
		try
		{
			IConfigurationSection aiSection = app.Configuration.GetSection("AI");
			bool aiAutoStart = aiSection.GetValue("AutoStart", defaultValue: false);
			int aiPort = aiSection.GetValue("Port", 7001);
			string aiWorkingDir = aiSection.GetValue<string>("WorkingDir") ?? Path.Combine(AppContext.BaseDirectory, "AIService");
			string aiPython = aiSection.GetValue<string>("Python") ?? "python";
			string aiModule = aiSection.GetValue<string>("Module") ?? "uvicorn";
			string aiModuleArgs = aiSection.GetValue<string>("ModuleArgs") ?? "app.main:app --host 0.0.0.0 --port {PORT}";
			Console.WriteLine($"[AI] Environment: {app.Environment.EnvironmentName}, IsDevelopment: {app.Environment.IsDevelopment()}");
			Console.WriteLine($"[AI] Config - AutoStart: {aiAutoStart}, Port: {aiPort}, WorkingDir: '{aiWorkingDir}'");
			Console.WriteLine("[AI] Python: '" + aiPython + "'");
			if (aiAutoStart && !string.IsNullOrWhiteSpace(aiWorkingDir) && Directory.Exists(aiWorkingDir))
			{
				bool aiAlreadyRunning = false;
				try
				{
					using TcpClient tcpTest = new TcpClient();
					Task connectTask = tcpTest.ConnectAsync("127.0.0.1", aiPort);
					aiAlreadyRunning = connectTask.Wait(1000) && tcpTest.Connected;
				}
				catch
				{
					aiAlreadyRunning = false;
				}
				if (aiAlreadyRunning)
				{
					Console.WriteLine($"[AI] Port {aiPort} already in use — AI service already running, skipping spawn.");
				}
				else
				{
					Console.WriteLine("[AI] Starting AI service...");
					string aiArgs = "-m " + aiModule + " " + (aiModuleArgs ?? "app.main:app --host 0.0.0.0 --port {PORT}").Replace("{PORT}", aiPort.ToString());
					Console.WriteLine("[AI] Executing: " + aiPython + " " + aiArgs);
					Console.WriteLine("[AI] WorkingDir: " + aiWorkingDir);
					ProcessStartInfo psi = new ProcessStartInfo
					{
						FileName = aiPython,
						Arguments = aiArgs,
						WorkingDirectory = aiWorkingDir,
						UseShellExecute = false,
						CreateNoWindow = false,
						RedirectStandardOutput = true,
						RedirectStandardError = true
					};
					if (!string.IsNullOrWhiteSpace(aiWorkingDir))
					{
						string parentDir = Path.GetDirectoryName(aiWorkingDir) ?? aiWorkingDir;
						string currentPythonPath = Environment.GetEnvironmentVariable("PYTHONPATH") ?? string.Empty;
						psi.Environment["PYTHONPATH"] = parentDir + (string.IsNullOrWhiteSpace(currentPythonPath) ? "" : (";" + currentPythonPath));
						Console.WriteLine("[AI] Set PYTHONPATH: " + psi.Environment["PYTHONPATH"]);
					}
					Process aiProcess = Process.Start(psi);
					if (aiProcess != null)
					{
						Console.WriteLine($"[AI] ? Spawned AIService process (PID: {aiProcess.Id}) on port {aiPort}");
						aiProcess.OutputDataReceived += delegate(object s, DataReceivedEventArgs e)
						{
							if (!string.IsNullOrEmpty(e.Data))
							{
								Console.WriteLine("[AI-OUT] " + e.Data);
							}
						};
						aiProcess.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e)
						{
							if (!string.IsNullOrEmpty(e.Data))
							{
								Console.WriteLine("[AI-ERR] " + e.Data);
							}
						};
						aiProcess.BeginOutputReadLine();
						aiProcess.BeginErrorReadLine();
					}
					else
					{
						Console.WriteLine("[AI] ❌ Failed to start AI process");
					}
				}
			}
			else
			{
				Console.WriteLine("[AI] AutoStart disabled or WorkingDir not found");
			}
		}
		catch (Exception ex)
		{
			Console.WriteLine("[AI] ? Startup error: " + ex.Message);
		}
		Console.WriteLine("[APP] Builder built successfully, starting middleware setup...");
		app.Use(async delegate(HttpContext ctx, Func<Task> next)
		{
			try
			{
				await next();
			}
			catch (Exception ex3)
			{
				try
				{
					Console.WriteLine("[ERROR-HANDLER] Caught exception: " + ex3.GetType().Name + ": " + ex3.Message);
					Console.WriteLine($"[ERROR-HANDLER] Path: {ctx.Request.Path}");
					Console.WriteLine("[ERROR-HANDLER] Stack: " + ex3.StackTrace);
					ctx.Response.StatusCode = 500;
					await ctx.Response.WriteAsJsonAsync(new
					{
						error = "Internal server error",
						message = ex3.Message
					});
				}
				catch (Exception ex4)
				{
					Exception writeEx = ex4;
					Console.WriteLine("[ERROR-HANDLER] Failed to write error response: " + writeEx.Message);
				}
			}
		});
		app.Use(async delegate(HttpContext ctx, Func<Task> next)
		{
			IHeaderDictionary headers = ctx.Response.Headers;
			headers["X-Content-Type-Options"] = "nosniff";
			headers["X-Frame-Options"] = "DENY";
			headers["Referrer-Policy"] = "no-referrer";
			headers["X-XSS-Protection"] = "0";
			headers["Content-Security-Policy-Report-Only"] = "default-src 'self'; img-src 'self' data: https:; media-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; connect-src 'self' http: https:;";
			await next();
		});
		if (!app.Environment.IsDevelopment())
		{
			app.UseHsts();
			app.UseHttpsRedirection();
		}
		app.UseCors("DefaultCors");
		app.UseRateLimiter();
		app.UseStatusCodePages();
		bool requireApiKey = builder.Configuration.GetValue<bool>("Security:RequireApiKey");
		string apiKey = builder.Configuration["Security:ApiKey"] ?? string.Empty;
		app.Use(async delegate(HttpContext ctx, Func<Task> next)
		{
			if (requireApiKey && (HttpMethods.IsPost(ctx.Request.Method) || HttpMethods.IsPut(ctx.Request.Method) || HttpMethods.IsPatch(ctx.Request.Method) || HttpMethods.IsDelete(ctx.Request.Method)) && ctx.Request.Path.StartsWithSegments("/api"))
			{
				string key = ctx.Request.Headers["X-Api-Key"].ToString();
				if (string.IsNullOrWhiteSpace(key) || !string.Equals(key, apiKey, StringComparison.Ordinal))
				{
					ctx.Response.StatusCode = 401;
					await ctx.Response.WriteAsJsonAsync(new
					{
						error = "API key required"
					});
					return;
				}
			}
			await next();
		});
		string connStr = builder.Configuration.GetConnectionString("DefaultConnection") ?? builder.Configuration["ConnectionStrings:Default"] ?? builder.Configuration["ConnectionStrings:DefaultConnection"] ?? "Server=localhost;Database=QLDRL_Data;Trusted_Connection=True;TrustServerCertificate=True";
		Console.WriteLine("[CONNSTR-DEBUG] Using connection string: " + connStr.Substring(0, Math.Min(100, connStr.Length)) + "...");
		string uploadRoot = Path.Combine(AppContext.BaseDirectory, "uploads");
		Console.WriteLine("[Startup] Database schema check skipped (handled by SQL scripts)");
		IHostApplicationLifetime lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
		lifetime.ApplicationStarted.Register(delegate
		{
			Console.WriteLine("[LIFETIME] ApplicationStarted");
			Console.WriteLine("[LIFETIME] Main thread ID: " + Thread.CurrentThread.ManagedThreadId);
		});
		Console.WriteLine("[STARTUP] Just registered ApplicationStarted callback");
		lifetime.ApplicationStopping.Register(delegate
		{
			Console.WriteLine("[LIFETIME] ApplicationStopping from thread: " + Thread.CurrentThread.ManagedThreadId);
			StackTrace stackTrace = new StackTrace(fNeedFileInfo: true);
			if (stackTrace.FrameCount > 0)
			{
				StackFrame frame = stackTrace.GetFrame(0);
				Console.WriteLine("[LIFETIME] StopApplication called from: " + frame?.GetMethod()?.DeclaringType?.Name + "." + frame?.GetMethod()?.Name);
			}
		});
		Console.WriteLine("[STARTUP] Just registered ApplicationStopping callback");
		lifetime.ApplicationStopped.Register(delegate
		{
			Console.WriteLine("[LIFETIME] ApplicationStopped");
		});
		Console.WriteLine("[STARTUP] Just registered ApplicationStopped callback");
		Console.WriteLine("[STARTUP] All lifetime hooks registered, about to register first endpoint...");
		app.MapGet("/health", (Func<IResult>)delegate
		{
			Console.WriteLine($"[ENDPOINT] Health check called at {DateTime.Now:HH:mm:ss.fff}");
			return Results.Ok(new
			{
				status = "healthy",
				timestamp = DateTime.Now
			});
		});
		bool shuttingDown = false;
		lifetime.ApplicationStopping.Register(async delegate
		{
			if (!shuttingDown)
			{
				shuttingDown = true;
				Console.WriteLine("[STARTUP] Server received shutdown signal - ATTEMPTING CANCELLATION BLOCK");
				Console.WriteLine("[STARTUP] SHUTDOWN STACK TRACE:");
				StackTrace st = new StackTrace(fNeedFileInfo: true);
				for (int i = 0; i < Math.Min(st.FrameCount, 15); i++)
				{
					StackFrame frame = st.GetFrame(i);
					Console.WriteLine($"  Frame {i}: {frame?.GetMethod()?.DeclaringType?.FullName}.{frame?.GetMethod()?.Name} @ line {frame?.GetFileLineNumber()}");
				}
			}
		});
		app.MapGet("/api/classes/{maLop}/students", (Func<HttpRequest, string, Task<IResult>>)async delegate(HttpRequest req, string maLop)
		{
			try
			{
				string xuser = req.Headers["X-User"].ToString();
				if (!string.IsNullOrWhiteSpace(xuser))
				{
					using SqlConnection conAuth = new SqlConnection(connStr);
					await conAuth.OpenAsync();
					List<string> altIds = new List<string> { xuser.Trim() };
					try
					{
						List<Dictionary<string, object?>> tkRows = await QueryAsync(conAuth, "SELECT TOP 1 MaCaNhan, TenTK FROM TK WHERE MaCaNhan=@id OR TenTK=@id", new SqlParameter[1]
						{
							new SqlParameter("@id", xuser.Trim())
						});
						if (tkRows.Count > 0)
						{
							Dictionary<string, object?> r = tkRows[0];
							string mc = ((!r.ContainsKey("MaCaNhan")) ? null : r["MaCaNhan"]?.ToString());
							string tk = ((!r.ContainsKey("TenTK")) ? null : r["TenTK"]?.ToString());
							if (!string.IsNullOrWhiteSpace(mc))
							{
								altIds.Add(mc.Trim());
							}
							if (!string.IsNullOrWhiteSpace(tk))
							{
								altIds.Add(tk.Trim());
							}
						}
					}
					catch
					{
					}
					altIds = altIds.Distinct<string>(StringComparer.OrdinalIgnoreCase).ToList();
					List<SqlParameter> gParams2 = new List<SqlParameter>();
					List<string> gIn2 = new List<string>();
					for (int i = 0; i < altIds.Count; i++)
					{
						string pn = "@g2" + i;
						gIn2.Add(pn);
						gParams2.Add(new SqlParameter(pn, altIds[i]));
					}
					if ((await QueryAsync(conAuth, "SELECT LopCV FROM GiangVien WHERE MaCaNhan IN (" + string.Join(",", gIn2) + ") AND LopCV IS NOT NULL", gParams2.ToArray())).Count > 0)
					{
						List<SqlParameter> gParams3 = new List<SqlParameter>();
						List<string> gIn3 = new List<string>();
						for (int j = 0; j < altIds.Count; j++)
						{
							string pn2 = "@g" + j;
							gIn3.Add(pn2);
							gParams3.Add(new SqlParameter(pn2, altIds[j]));
						}
						if ((await QueryAsync(conAuth, "SELECT 1 FROM GiangVien WHERE LopCV=@lop AND MaCaNhan IN (" + string.Join(",", gIn3) + ")", new SqlParameter[1]
						{
							new SqlParameter("@lop", maLop)
						}.Concat(gParams3).ToArray())).Count == 0)
						{
							return Results.StatusCode(403);
						}
					}
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand checkClass = new SqlCommand("SELECT 1 FROM Lop WHERE MaLop=@lop", con))
				{
					checkClass.Parameters.AddWithValue("@lop", maLop);
					if (await checkClass.ExecuteScalarAsync() == null)
					{
						return Results.NotFound(new
						{
							message = "L?p kh\ufffdng t?n t?i"
						});
					}
				}
				SqlCommand cmd = new SqlCommand("SELECT MSSV, TenSV AS HoTen FROM SINHVIEN WHERE MaLop=@lop ORDER BY TenSV", con);
				cmd.Parameters.AddWithValue("@lop", maLop);
				List<object> list = new List<object>();
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				while (await rd.ReadAsync())
				{
					list.Add(new
					{
						MSSV = rd["MSSV"]?.ToString(),
						HoTen = rd["HoTen"]?.ToString()
					});
				}
				rd.Close();
				(int Year, int Semester) tuple = await GetSystemYearSemesterAsync(con);
				int year = tuple.Year;
				int semester = tuple.Semester;
				SqlCommand rolesCmd = new SqlCommand("\r\n            SELECT MSSV, Role FROM ClassOfficers\r\n            WHERE MaLop=@lop\r\n              AND Year=@y AND Semester=@s\r\n            UNION ALL\r\n            SELECT co.MSSV, co.Role FROM ClassOfficers co\r\n            INNER JOIN (\r\n                SELECT MSSV, MAX(ISNULL(Year,0)*10+ISNULL(Semester,0)) AS MaxKey\r\n                FROM ClassOfficers WHERE MaLop=@lop\r\n                GROUP BY MSSV\r\n            ) latest ON co.MSSV=latest.MSSV\r\n                AND ISNULL(co.Year,0)*10+ISNULL(co.Semester,0)=latest.MaxKey\r\n            WHERE co.MaLop=@lop\r\n              AND NOT EXISTS (\r\n                SELECT 1 FROM ClassOfficers x\r\n                WHERE x.MaLop=@lop AND x.MSSV=co.MSSV AND x.Year=@y AND x.Semester=@s\r\n              )", con);
				rolesCmd.Parameters.AddWithValue("@lop", maLop);
				rolesCmd.Parameters.AddWithValue("@y", year);
				rolesCmd.Parameters.AddWithValue("@s", semester);
				Dictionary<string, string> roles = new Dictionary<string, string>();
				using SqlDataReader rd2 = await rolesCmd.ExecuteReaderAsync();
				while (await rd2.ReadAsync())
				{
					string m = rd2["MSSV"]?.ToString();
					string r2 = rd2["Role"]?.ToString();
					if (!string.IsNullOrWhiteSpace(m) && !string.IsNullOrWhiteSpace(r2))
					{
						roles[m] = r2;
					}
				}
				return Results.Ok(new
				{
					students = list,
					roles = roles,
					year = year,
					semester = semester
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[API][ERROR] Load students failed for '" + maLop + "': " + ex4.Message);
				int? statusCode = 500;
				return Results.Problem(ex4.Message, null, statusCode, "Load students failed");
			}
		});
		app.MapPost("/api/classes/{maLop}/officers", (Func<string, HttpRequest, Task<IResult>>)async delegate(string maLop, HttpRequest req)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string xuser = req.Headers["X-User"].ToString();
				if (!string.IsNullOrWhiteSpace(xuser))
				{
					List<string> altIds = new List<string> { xuser.Trim() };
					try
					{
						List<Dictionary<string, object?>> tkRows = await QueryAsync(con, "SELECT TOP 1 MaCaNhan, TenTK FROM TK WHERE MaCaNhan=@id OR TenTK=@id", new SqlParameter[1]
						{
							new SqlParameter("@id", xuser.Trim())
						});
						if (tkRows.Count > 0)
						{
							Dictionary<string, object?> r = tkRows[0];
							string mc = ((!r.ContainsKey("MaCaNhan")) ? null : r["MaCaNhan"]?.ToString());
							string tk = ((!r.ContainsKey("TenTK")) ? null : r["TenTK"]?.ToString());
							if (!string.IsNullOrWhiteSpace(mc))
							{
								altIds.Add(mc.Trim());
							}
							if (!string.IsNullOrWhiteSpace(tk))
							{
								altIds.Add(tk.Trim());
							}
						}
					}
					catch
					{
					}
					altIds = altIds.Distinct<string>(StringComparer.OrdinalIgnoreCase).ToList();
					List<SqlParameter> gParams2 = new List<SqlParameter>();
					List<string> gIn2 = new List<string>();
					for (int i = 0; i < altIds.Count; i++)
					{
						string pn = "@h" + i;
						gIn2.Add(pn);
						gParams2.Add(new SqlParameter(pn, altIds[i]));
					}
					if ((await QueryAsync(con, "SELECT LopCV FROM GiangVien WHERE MaCaNhan IN (" + string.Join(",", gIn2) + ") AND LopCV IS NOT NULL", gParams2.ToArray())).Count > 0)
					{
						List<SqlParameter> gParams3 = new List<SqlParameter>();
						List<string> gIn3 = new List<string>();
						for (int j = 0; j < altIds.Count; j++)
						{
							string pn2 = "@g" + j;
							gIn3.Add(pn2);
							gParams3.Add(new SqlParameter(pn2, altIds[j]));
						}
						if ((await QueryAsync(con, "SELECT 1 FROM GiangVien WHERE LopCV=@lop AND MaCaNhan IN (" + string.Join(",", gIn3) + ")", new SqlParameter[1]
						{
							new SqlParameter("@lop", maLop)
						}.Concat(gParams3).ToArray())).Count == 0)
						{
							return Results.StatusCode(403);
						}
					}
				}
				var (year, semester) = await GetSystemYearSemesterAsync(con);
				using StreamReader sr = new StreamReader(req.Body);
				JsonDocument doc = JsonDocument.Parse(await sr.ReadToEndAsync());
				if (!doc.RootElement.TryGetProperty("assignments", out var arr) || arr.ValueKind != JsonValueKind.Array)
				{
					return Results.BadRequest(new
					{
						message = "assignments[] required"
					});
				}
				using (SqlCommand del = new SqlCommand("DELETE FROM ClassOfficers WHERE MaLop=@lop AND ISNULL(Year,@y)=@y AND ISNULL(Semester,@s)=@s", con))
				{
					del.Parameters.AddWithValue("@lop", maLop);
					del.Parameters.AddWithValue("@y", year);
					del.Parameters.AddWithValue("@s", semester);
					await del.ExecuteNonQueryAsync();
				}
				foreach (JsonElement el in arr.EnumerateArray())
				{
					string mssv = el.GetProperty("MSSV").GetString();
					string role = el.GetProperty("Role").GetString();
					if (!string.IsNullOrWhiteSpace(mssv) && !string.IsNullOrWhiteSpace(role))
					{
						using SqlCommand ins = new SqlCommand("INSERT INTO ClassOfficers (MaLop, MSSV, Role, Year, Semester) VALUES (@lop,@mssv,@role,@y,@s)", con);
						ins.Parameters.AddWithValue("@lop", maLop);
						ins.Parameters.AddWithValue("@mssv", mssv);
						ins.Parameters.AddWithValue("@role", role);
						ins.Parameters.AddWithValue("@y", year);
						ins.Parameters.AddWithValue("@s", semester);
						await ins.ExecuteNonQueryAsync();
					}
				}
				try
				{
					await LogAsync(null, con, $"ASSIGN_OFFICERS Lop={maLop} RoleCount={arr.GetArrayLength()}");
				}
				catch
				{
				}
				return Results.Ok(new
				{
					ok = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				int? statusCode = 500;
				return Results.Problem(ex4.Message, null, statusCode, "Save officers failed");
			}
		});
		app.MapGet("/api/khoa", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				SqlCommand cmd = new SqlCommand("SELECT MaKH, TenKhoa FROM KHOA ORDER BY TenKhoa", con);
				List<object> items = new List<object>();
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				while (await rd.ReadAsync())
				{
					items.Add(new
					{
						MaKH = rd["MaKH"],
						TenKhoa = rd["TenKhoa"]
					});
				}
				return Results.Ok(new { items });
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				int? statusCode = 500;
				return Results.Problem(ex4.Message, null, statusCode, "Load Khoa failed");
			}
		});
		app.MapGet("/api/khoa/{maKhoa}/lops", (Func<string, Task<IResult>>)async delegate(string maKhoa)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				SqlCommand cmd = new SqlCommand("SELECT MaLop, TenLop FROM Lop WHERE MaKH=@mk ORDER BY TenLop, MaLop", con);
				cmd.Parameters.AddWithValue("@mk", maKhoa);
				List<object> items = new List<object>();
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				while (await rd.ReadAsync())
				{
					items.Add(new
					{
						MaLop = rd["MaLop"],
						TenLop = rd["TenLop"]
					});
				}
				return Results.Ok(new { items });
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				int? statusCode = 500;
				return Results.Problem(ex4.Message, null, statusCode, "Load L?p failed");
			}
		});
		app.MapGet("/api/evidence", (Func<HttpContext, ILogger<Program>, int?, int?, string, string, string, string, Task<IResult>>)async delegate(HttpContext http, ILogger<Program> log, int? page, int? pageSize, string? studentId, string? verdict, string? status, string? maLop)
		{
			try
			{
				int pg = page ?? 1;
				int ps = pageSize ?? 50;
				if (pg <= 0)
				{
					pg = 1;
				}
				if (ps <= 0 || ps > 500)
				{
					ps = 50;
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<string> where = new List<string>();
				if (!string.IsNullOrWhiteSpace(studentId))
				{
					where.Add("StudentId = @studentId");
				}
				if (!string.IsNullOrWhiteSpace(verdict))
				{
					where.Add("Verdict = @verdict");
				}
				if (!string.IsNullOrWhiteSpace(status))
				{
					where.Add("Status = @status");
				}
				if (!string.IsNullOrWhiteSpace(maLop))
				{
					where.Add("EXISTS (SELECT 1 FROM SINHVIEN sv WHERE sv.MSSV = Evidence.StudentId AND sv.MaLop = @maLop)");
				}
				where.Add("Status <> 'Deleted'");
				if (string.IsNullOrWhiteSpace(verdict) && string.IsNullOrWhiteSpace(status))
				{
					where.Add("Verdict <> 'Attached'");
				}
				string whereSql = ((where.Count > 0) ? ("WHERE " + string.Join(" AND ", where)) : string.Empty);
				log.LogInformation("[EVIDENCE-FILTER] studentId={studentId}, verdict={verdict}, status={status}, maLop={maLop}", studentId, verdict, status, maLop);
				SqlCommand cmdCount = new SqlCommand("SELECT COUNT(1) FROM Evidence " + whereSql, con);
				if (studentId != null)
				{
					cmdCount.Parameters.AddWithValue("@studentId", studentId.Trim());
				}
				if (verdict != null)
				{
					cmdCount.Parameters.AddWithValue("@verdict", verdict.Trim());
				}
				if (status != null)
				{
					cmdCount.Parameters.AddWithValue("@status", status.Trim());
				}
				if (maLop != null)
				{
					cmdCount.Parameters.AddWithValue("@maLop", maLop.Trim());
				}
				int total = Convert.ToInt32((await cmdCount.ExecuteScalarAsync()) ?? ((object)0));
				log.LogInformation("[EVIDENCE-COUNT] whereSql={whereSql}, total={total}", whereSql, total);
				int skip = (pg - 1) * ps;
				SqlCommand cmd = new SqlCommand("SELECT EvidenceId, StudentId, ActivityName, Status, Verdict, TamperScore, FaceScore, ContextScore, DeviceScore, BannerScore, WeightedScore, ModelVersion, PredictedContext, GpsDistanceKm, ProcessedAt, CreatedAt\r\nFROM Evidence " + whereSql + "\r\nORDER BY CreatedAt DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY", con);
				cmd.Parameters.AddWithValue("@skip", skip);
				cmd.Parameters.AddWithValue("@take", ps);
				if (studentId != null)
				{
					cmd.Parameters.AddWithValue("@studentId", studentId.Trim());
				}
				if (verdict != null)
				{
					cmd.Parameters.AddWithValue("@verdict", verdict.Trim());
				}
				if (status != null)
				{
					cmd.Parameters.AddWithValue("@status", status.Trim());
				}
				if (maLop != null)
				{
					cmd.Parameters.AddWithValue("@maLop", maLop.Trim());
				}
				List<object> list = new List<object>();
				using (SqlDataReader rd = await cmd.ExecuteReaderAsync())
				{
					while (await rd.ReadAsync())
					{
						list.Add(new
						{
							EvidenceId = rd["EvidenceId"],
							StudentId = rd["StudentId"],
							ActivityName = rd["ActivityName"],
							Status = rd["Status"],
							Verdict = rd["Verdict"],
							TamperScore = rd["TamperScore"],
							FaceScore = rd["FaceScore"],
							ContextScore = rd["ContextScore"],
							DeviceScore = rd["DeviceScore"],
							BannerScore = rd["BannerScore"],
							WeightedScore = rd["WeightedScore"],
							ModelVersion = rd["ModelVersion"],
							PredictedContext = rd["PredictedContext"],
							GpsDistanceKm = ((rd["GpsDistanceKm"] == DBNull.Value) ? ((double?)null) : new double?(Convert.ToDouble(rd["GpsDistanceKm"]))),
							ProcessedAt = rd["ProcessedAt"],
							CreatedAt = rd["CreatedAt"]
						});
					}
				}
				log.LogInformation("[EVIDENCE-RESULTS] Returned {count} items", list.Count);
				return Results.Ok(new
				{
					items = list,
					total = total,
					page = pg,
					pageSize = ps
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				if (EvidenceLogThrottler.ShouldLog())
				{
					log.LogError(ex4, "[Evidence] list failed");
					EvidenceLogThrottler.MarkLogged();
				}
				int? statusCode = 500;
				return Results.Problem(ex4.Message, null, statusCode, "Evidence list failed");
			}
		});
		app.MapGet("/api/evidence/{id:guid}", (Func<Guid, Task<IResult>>)async delegate(Guid id)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			SqlCommand cmd = new SqlCommand("SELECT TOP 1 * FROM Evidence WHERE EvidenceId=@id", con);
			cmd.Parameters.AddWithValue("@id", id);
			using SqlDataReader rd = await cmd.ExecuteReaderAsync();
			if (!(await rd.ReadAsync()))
			{
				return Results.NotFound(new
				{
					message = "Kh\ufffdng t\ufffdm th?y minh ch?ng"
				});
			}
			string scoresJson = ((rd["ScoresJson"] == DBNull.Value) ? null : rd["ScoresJson"].ToString());
			string detailsJson = ((rd["DetailsJson"] == DBNull.Value) ? scoresJson : rd["DetailsJson"].ToString());
			object parsedDetails = null;
			if (!string.IsNullOrWhiteSpace(detailsJson))
			{
				try
				{
					parsedDetails = JsonSerializer.Deserialize<object>(detailsJson);
				}
				catch
				{
					parsedDetails = detailsJson;
				}
			}
			double? tamperScore = ((rd["TamperScore"] == DBNull.Value) ? ((double?)null) : ((double?)rd["TamperScore"]));
			double? faceScore = ((rd["FaceScore"] == DBNull.Value) ? ((double?)null) : ((double?)rd["FaceScore"]));
			double? contextScore = ((rd["ContextScore"] == DBNull.Value) ? ((double?)null) : ((double?)rd["ContextScore"]));
			double? bannerScore = ((rd["BannerScore"] == DBNull.Value) ? ((double?)null) : ((double?)rd["BannerScore"]));
			double? deviceScore = ((rd["DeviceScore"] == DBNull.Value) ? ((double?)null) : ((double?)rd["DeviceScore"]));
			Dictionary<string, double?> scoresDict = new Dictionary<string, double?>();
			if (!string.IsNullOrWhiteSpace(scoresJson))
			{
				try
				{
					Dictionary<string, object> parsedScores = JsonSerializer.Deserialize<Dictionary<string, object>>(scoresJson);
					if (parsedScores != null)
					{
						foreach (KeyValuePair<string, object> kvp in parsedScores)
						{
							if (double.TryParse(kvp.Value?.ToString() ?? "", out var scoreVal))
							{
								scoresDict[kvp.Key] = scoreVal;
							}
						}
					}
				}
				catch
				{
				}
			}
			if (scoresDict.Count == 0)
			{
				if (tamperScore.HasValue)
				{
					scoresDict["tamper"] = tamperScore;
				}
				if (faceScore.HasValue)
				{
					scoresDict["face"] = faceScore;
				}
				if (contextScore.HasValue)
				{
					scoresDict["context"] = contextScore;
				}
				if (bannerScore.HasValue)
				{
					scoresDict["banner"] = bannerScore;
				}
				if (deviceScore.HasValue)
				{
					scoresDict["device"] = deviceScore;
				}
			}
			return Results.Ok(new
			{
				EvidenceId = rd["EvidenceId"],
				StudentId = rd["StudentId"],
				ActivityName = rd["ActivityName"],
				FilePath = rd["FilePath"],
				Status = rd["Status"],
				Verdict = rd["Verdict"],
				TamperScore = tamperScore,
				FaceScore = faceScore,
				ContextScore = contextScore,
				BannerScore = bannerScore,
				DeviceScore = deviceScore,
				WeightedScore = rd["WeightedScore"],
				ModelVersion = rd["ModelVersion"],
				ProcessedAt = rd["ProcessedAt"],
				CreatedAt = rd["CreatedAt"],
				Scores = scoresDict,
				Details = parsedDetails
			});
		});
		app.MapDelete("/api/evidence/{id:guid}", (Func<Guid, HttpContext, ILogger<Program>, Task<IResult>>)async delegate(Guid id, HttpContext ctx, ILogger<Program> log)
		{
			try
			{
				string userId = ctx.Request.Headers["X-User"].ToString();
				if (string.IsNullOrEmpty(userId))
				{
					log.LogWarning("[DELETE-EVIDENCE] Unauthorized delete attempt for evidence {id}", id);
					return Results.Unauthorized();
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand checkCmd = new SqlCommand("SELECT TOP 1 EvidenceId FROM Evidence WHERE EvidenceId=@id", con);
				checkCmd.Parameters.AddWithValue("@id", id);
				using SqlDataReader checkRd = await checkCmd.ExecuteReaderAsync();
				bool exists = await checkRd.ReadAsync();
				await checkRd.CloseAsync();
				if (!exists)
				{
					log.LogWarning("[DELETE-EVIDENCE] Evidence not found: {id}", id);
					return Results.NotFound(new
					{
						message = "Không tìm thấy minh chứng"
					});
				}
				using SqlCommand deleteCmd = new SqlCommand("\r\nUPDATE Evidence \r\nSET Status = 'Deleted', DeletedAt = GETDATE()\r\nWHERE EvidenceId = @id", con);
				deleteCmd.Parameters.AddWithValue("@id", id);
				if (await deleteCmd.ExecuteNonQueryAsync() > 0)
				{
					log.LogInformation("[DELETE-EVIDENCE] Soft-deleted evidence {id} by user {userId}", id, userId);
					await LogAsync(ctx, con, $"DELETE_EVIDENCE evidenceId={id}");
					return Results.Ok(new
					{
						success = true,
						message = "Xóa minh chứng thành công"
					});
				}
				log.LogWarning("[DELETE-EVIDENCE] Failed to soft-delete evidence {id}", id);
				return Results.BadRequest(new
				{
					message = "Không thể xóa minh chứng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				log.LogError("[DELETE-EVIDENCE] Error deleting evidence: {error}", ex4.Message);
				int? statusCode = 500;
				return Results.Problem(ex4.Message, null, statusCode, "Delete evidence failed");
			}
		});
		app.MapGet("/api/evidence/{id:guid}/status", (Func<Guid, Task<IResult>>)async delegate(Guid id)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			SqlCommand cmd = new SqlCommand("SELECT TOP 1 Status, Verdict, WeightedScore, ModelVersion, ProcessedAt FROM Evidence WHERE EvidenceId=@id", con);
			cmd.Parameters.AddWithValue("@id", id);
			using SqlDataReader rd = await cmd.ExecuteReaderAsync();
			if (!(await rd.ReadAsync()))
			{
				return Results.NotFound(new
				{
					message = "Kh\ufffdng t\ufffdm th?y minh ch?ng"
				});
			}
			return Results.Ok(new
			{
				EvidenceId = id,
				Status = rd["Status"],
				Verdict = rd["Verdict"],
				WeightedScore = rd["WeightedScore"],
				ModelVersion = rd["ModelVersion"],
				ProcessedAt = rd["ProcessedAt"]
			});
		});
		app.MapGet("/api/test/face/{studentId}", (Func<string, ILogger<Program>, Task<IResult>>)async delegate(string studentId, ILogger<Program> log)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				log.LogInformation("[TEST-FACE] Opened connection, querying student {StudentId}", studentId);
				using SqlCommand cmd = new SqlCommand("SELECT MSSV, TenSV, LEN(AnhDD) as AnhDDSize, AnhDD FROM SINHVIEN WHERE MSSV=@mssv", con);
				cmd.Parameters.AddWithValue("@mssv", studentId);
				using SqlDataReader reader = await cmd.ExecuteReaderAsync();
				if (await reader.ReadAsync())
				{
					object mssv = reader["MSSV"];
					object tenSV = reader["TenSV"];
					object size = reader["AnhDDSize"];
					object anhDD = reader["AnhDD"];
					log.LogInformation("[TEST-FACE] Found student: MSSV={MSSV}, TenSV={TenSV}, AnhDD Size={Size}, Type={Type}", mssv, tenSV, size, anhDD?.GetType().Name ?? "NULL");
					if (anhDD != null && anhDD != DBNull.Value)
					{
						byte[] imageBytes = (byte[])anhDD;
						log.LogInformation("[TEST-FACE] Got {ByteCount} bytes", imageBytes.Length);
						if (imageBytes.Length != 0)
						{
							string header = string.Empty;
							if (imageBytes.Length >= 4)
							{
								header = $"{imageBytes[0]:X2}{imageBytes[1]:X2}{imageBytes[2]:X2}{imageBytes[3]:X2}";
							}
							string base64 = Convert.ToBase64String(imageBytes);
							return Results.Ok(new
							{
								found = true,
								mssv = mssv,
								tenSV = tenSV,
								byteCount = imageBytes.Length,
								header = header,
								base64Length = base64.Length,
								base64Preview = base64.Substring(0, Math.Min(100, base64.Length))
							});
						}
						return Results.Ok(new
						{
							found = false,
							message = "AnhDD is empty (0 bytes)"
						});
					}
					return Results.Ok(new
					{
						found = false,
						message = "AnhDD is null"
					});
				}
				return Results.Ok(new
				{
					found = false,
					message = "Student " + studentId + " not found"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				log.LogError(ex4, "[TEST-ERROR] Error: {Message}", ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/evidence/{id}/preview", (Func<string, Task<IResult>>)async delegate(string id)
		{
			try
			{
				Console.WriteLine("[DOWNLOAD] GET /api/evidence/" + id + "/preview called");
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if (int.TryParse(id, out var idInt))
				{
					Console.WriteLine($"[DOWNLOAD] Parsed ID as integer: {idInt}");
					SqlCommand cmdPhieu = new SqlCommand("SELECT EvidenceData, EvidenceFileName FROM dbo.PhieuDanhGiaChiTiet WHERE Id = @id", con);
					cmdPhieu.Parameters.AddWithValue("@id", idInt);
					using (SqlDataReader reader = await cmdPhieu.ExecuteReaderAsync())
					{
						if (await reader.ReadAsync())
						{
							object evidenceData = reader["EvidenceData"];
							Console.WriteLine($"[DOWNLOAD] Found in PhieuDanhGiaChiTiet - Data is null: {evidenceData == null || evidenceData == DBNull.Value}");
							if (evidenceData != null && evidenceData != DBNull.Value)
							{
								byte[] fileBytes = (byte[])evidenceData;
								string fileName = (reader.IsDBNull(1) ? "evidence" : reader.GetString(1));
								Console.WriteLine($"[DOWNLOAD] Got {fileBytes.Length} bytes from PhieuDanhGiaChiTiet");
								string contentType = DetectContentType(fileBytes, fileName);
								Console.WriteLine($"[DOWNLOAD] Returning {fileName} ({contentType}) - {fileBytes.Length} bytes");
								return Results.File(fileBytes, contentType, fileName);
							}
						}
					}
					SqlCommand cmdMinhChung = new SqlCommand("SELECT ImageData FROM dbo.MinhChungTieuChi WHERE Id = @id", con);
					cmdMinhChung.Parameters.AddWithValue("@id", idInt);
					using SqlDataReader reader2 = await cmdMinhChung.ExecuteReaderAsync();
					if (await reader2.ReadAsync())
					{
						object imageData = reader2["ImageData"];
						Console.WriteLine($"[DOWNLOAD] Found in MinhChungTieuChi - Data is null: {imageData == null || imageData == DBNull.Value}");
						if (imageData != null && imageData != DBNull.Value)
						{
							byte[] fileBytes2 = (byte[])imageData;
							Console.WriteLine($"[DOWNLOAD] Got {fileBytes2.Length} bytes from MinhChungTieuChi");
							string contentType2 = DetectContentType(fileBytes2, "evidence");
							Console.WriteLine($"[DOWNLOAD] Returning evidence ({contentType2}) - {fileBytes2.Length} bytes");
							return Results.File(fileBytes2, contentType2, "evidence");
						}
					}
				}
				if (Guid.TryParse(id, out var idGuid))
				{
					SqlCommand cmdEv = new SqlCommand("SELECT FilePath, OriginalFileName, Status FROM dbo.Evidence WHERE EvidenceId = @id", con);
					cmdEv.Parameters.AddWithValue("@id", idGuid);
					string dbFilePath = null;
					string dbOrigName = null;
					string dbStatus = null;
					using (SqlDataReader reader3 = await cmdEv.ExecuteReaderAsync())
					{
						if (await reader3.ReadAsync())
						{
							dbFilePath = reader3["FilePath"]?.ToString();
							dbOrigName = (reader3.IsDBNull(reader3.GetOrdinal("OriginalFileName")) ? null : reader3["OriginalFileName"]?.ToString());
							dbStatus = reader3["Status"]?.ToString();
						}
					}
					if (dbFilePath != null && dbStatus != "Deleted")
					{
						string absPath = (Path.IsPathRooted(dbFilePath) ? dbFilePath : Path.Combine(uploadRoot, dbFilePath.Replace('/', Path.DirectorySeparatorChar).Replace('\\', Path.DirectorySeparatorChar)));
						if (!File.Exists(absPath))
						{
							Console.WriteLine("[DOWNLOAD] File not found at " + absPath + ", trying uploadRoot fallback...");
							string guidStr = idGuid.ToString();
							List<string> candidates = new List<string>();
							string[] array = new string[10] { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".pdf", ".avi", ".mov" };
							for (int i = 0; i < array.Length; i++)
							{
								string candidate = Path.Combine(path2: guidStr + array[i], path1: uploadRoot);
								if (File.Exists(candidate))
								{
									candidates.Add(candidate);
								}
							}
							if (candidates.Count == 0)
							{
								try
								{
									candidates.AddRange(Directory.GetFiles(uploadRoot, guidStr + ".*", SearchOption.AllDirectories));
								}
								catch
								{
								}
							}
							if (candidates.Count > 0)
							{
								absPath = candidates.OrderBy(delegate(string f)
								{
									string text2 = Path.GetExtension(f).ToLower();
									bool flag = ((text2 == ".jpg" || text2 == ".jpeg") ? true : false);
									return (!flag) ? (text2 switch
									{
										".webm" => 3, 
										".mp4" => 2, 
										".png" => 1, 
										_ => 4, 
									}) : 0;
								}).First();
								Console.WriteLine("[DOWNLOAD] Found fallback file: " + absPath);
							}
						}
						if (File.Exists(absPath))
						{
							byte[] fileBytes3 = await File.ReadAllBytesAsync(absPath);
							string ext = Path.GetExtension(absPath).ToLower();
							if (1 == 0)
							{
							}
							string text;
							switch (ext)
							{
							case ".mp4":
								text = "video/mp4";
								break;
							case ".webm":
								text = "video/webm";
								break;
							case ".avi":
								text = "video/x-msvideo";
								break;
							case ".mov":
								text = "video/quicktime";
								break;
							case ".jpg":
							case ".jpeg":
								text = "image/jpeg";
								break;
							case ".png":
								text = "image/png";
								break;
							case ".gif":
								text = "image/gif";
								break;
							case ".webp":
								text = "image/webp";
								break;
							case ".pdf":
								text = "application/pdf";
								break;
							default:
								text = "application/octet-stream";
								break;
							}
							if (1 == 0)
							{
							}
							string contentType3 = text;
							string downloadName = dbOrigName ?? Path.GetFileName(absPath);
							Console.WriteLine($"[DOWNLOAD] Serving {Path.GetFileName(absPath)} as {contentType3} ({fileBytes3.Length} bytes)");
							return Results.File(fileBytes3, contentType3, downloadName);
						}
						Console.WriteLine("[DOWNLOAD] File not found anywhere for GUID " + id);
					}
				}
				return Results.NotFound(new
				{
					error = "Evidence not found"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/evidence/{id}/debug", (Func<string, Task<IResult>>)async delegate(string id)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				SqlCommand cmd = new SqlCommand("SELECT ImageData FROM dbo.MinhChungTieuChi WHERE Id = @id", con);
				cmd.Parameters.AddWithValue("@id", int.TryParse(id, out var idInt) ? idInt : (-1));
				using (SqlDataReader reader = await cmd.ExecuteReaderAsync())
				{
					if (await reader.ReadAsync())
					{
						object imageDataObj = reader["ImageData"];
						if (imageDataObj == null || imageDataObj == DBNull.Value)
						{
							return Results.Ok(new
							{
								status = "NULL",
								message = "ImageData is NULL"
							});
						}
						if (imageDataObj is byte[] bytes)
						{
							return Results.Ok(new
							{
								status = "BINARY",
								type = "byte[]",
								length = bytes.Length,
								first20Bytes = string.Join(",", bytes.Take(20)),
								first20Hex = string.Join(" ", from b in bytes.Take(20)
									select b.ToString("X2"))
							});
						}
						string str = imageDataObj.ToString() ?? "";
						return Results.Ok(new
						{
							status = "STRING",
							type = "string",
							length = str.Length,
							content = str.Substring(0, Math.Min(200, str.Length)),
							fileExists = File.Exists(str)
						});
					}
				}
				return Results.NotFound(new
				{
					error = "Evidence not found"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/evidence/upload", (Func<HttpRequest, AiClient, ILogger<Program>, Task<IResult>>)async delegate(HttpRequest req, AiClient aiClient, ILogger<Program> log)
		{
			Console.WriteLine("[UPLOAD-ENDPOINT] POST /api/evidence/upload called");
			log.LogInformation("[UPLOAD-ENDPOINT] Received upload request");
			if (!req.HasFormContentType)
			{
				return Results.BadRequest(new
				{
					message = "FormData required"
				});
			}
			IFormCollection form = await req.ReadFormAsync();
			Console.WriteLine($"[UPLOAD-ENDPOINT] Form has {form.Files.Count} files, {form.Count} fields");
			log.LogInformation("[UPLOAD-FORMDATA] Received FormData fields:");
			foreach (string key in form.Keys)
			{
				string val = form[key].ToString();
				log.LogInformation("[UPLOAD-FORMDATA]   {Key} = {Value} (length={Length})", key, (val.Length > 50) ? (val.Substring(0, 50) + "...") : val, val.Length);
			}
			IFormFile file = form.Files.GetFile("file");
			if (file == null || file.Length == 0)
			{
				return Results.BadRequest(new
				{
					message = "Thi?u file minh ch?ng"
				});
			}
			string studentId = form["student_id"].ToString();
			string activityName = form["activity_name"].ToString();
			string faceB64 = form["student_face_image_b64"].ToString();
			string latStr = form["lat"].ToString();
			string lngStr = form["lng"].ToString();
			log.LogInformation("[UPLOAD-FACE-CHECK] Face field status: exists={Exists}, empty={Empty}, length={Length}", form.ContainsKey("student_face_image_b64"), string.IsNullOrWhiteSpace(faceB64), faceB64?.Length ?? 0);
			log.LogInformation("[UPLOAD-DEBUG] studentId='{StudentId}' (type={Type}, len={Len}), faceB64Empty={FaceB64Empty}", studentId, studentId?.GetType().Name ?? "null", studentId?.Length ?? 0, string.IsNullOrWhiteSpace(faceB64));
			log.LogInformation("[UPLOAD-DEBUG-CONDITION] string.IsNullOrWhiteSpace(faceB64)={FaceB64Empty}, !string.IsNullOrWhiteSpace(studentId)={StudentIdNotEmpty}", string.IsNullOrWhiteSpace(faceB64), !string.IsNullOrWhiteSpace(studentId));
			if (string.IsNullOrWhiteSpace(faceB64) && !string.IsNullOrWhiteSpace(studentId))
			{
				try
				{
					log.LogInformation("[FACE-FETCH-START] Attempting to fetch face for student {StudentId} from database", studentId);
					using SqlConnection con = new SqlConnection(connStr);
					log.LogInformation("[FACE-FETCH-CONNECTION] Opening SQL connection with: {ConnStr}", connStr.Substring(0, Math.Min(50, connStr.Length)));
					await con.OpenAsync();
					log.LogInformation("[FACE-FETCH-OPEN] Connection opened successfully for student {StudentId}", studentId);
					using SqlCommand cmd = new SqlCommand("SELECT AnhDD FROM SINHVIEN WHERE MSSV=@mssv", con);
					cmd.Parameters.AddWithValue("@mssv", studentId);
					object result = await cmd.ExecuteScalarAsync();
					log.LogInformation("[FACE-FETCH-DEBUG] Query SINHVIEN.AnhDD for student {StudentId}: result={Result}, isNull={IsNull}", studentId, result?.GetType().Name ?? "null", result == null || result == DBNull.Value);
					if (result != null && result != DBNull.Value)
					{
						byte[] imageBytes = (byte[])result;
						log.LogInformation("[FACE-FETCH-DEBUG] Got {ByteCount} bytes from SINHVIEN.AnhDD", imageBytes.Length);
						string header = string.Empty;
						if (imageBytes.Length >= 4)
						{
							header = $"{imageBytes[0]:X2}{imageBytes[1]:X2}{imageBytes[2]:X2}{imageBytes[3]:X2}";
						}
						log.LogInformation("[FACE-FETCH-DEBUG] Image header: {Header} (JPEG=FFD8FF, PNG=89504E47)", header);
						faceB64 = Convert.ToBase64String(imageBytes);
						log.LogInformation("[FACE-FETCH] Retrieved face from SINHVIEN.AnhDD for student {StudentId}, size={Size}", studentId, faceB64.Length);
					}
					else
					{
						log.LogWarning("[FACE-FETCH-DEBUG] SINHVIEN.AnhDD is null/empty for student {StudentId}, trying StudentFaceData", studentId);
						using SqlCommand cmd2 = new SqlCommand("SELECT TOP 1 FaceImage FROM StudentFaceData WHERE MSSV=@mssv ORDER BY CreatedAt DESC", con);
						cmd2.Parameters.AddWithValue("@mssv", studentId);
						object result2 = await cmd2.ExecuteScalarAsync();
						log.LogInformation("[FACE-FETCH-DEBUG] Query StudentFaceData for student {StudentId}: result={Result}", studentId, result2?.GetType().Name ?? "null");
						if (result2 != null && result2 != DBNull.Value)
						{
							byte[] imageBytes2 = (byte[])result2;
							log.LogInformation("[FACE-FETCH-DEBUG] Got {ByteCount} bytes from StudentFaceData", imageBytes2.Length);
							string header2 = string.Empty;
							if (imageBytes2.Length >= 4)
							{
								header2 = $"{imageBytes2[0]:X2}{imageBytes2[1]:X2}{imageBytes2[2]:X2}{imageBytes2[3]:X2}";
							}
							log.LogInformation("[FACE-FETCH-DEBUG] Image header: {Header}", header2);
							faceB64 = Convert.ToBase64String(imageBytes2);
							log.LogInformation("[FACE-FETCH] Retrieved face from StudentFaceData for student {StudentId}", studentId);
						}
						else
						{
							log.LogWarning("[FACE-FETCH] No face found in SINHVIEN or StudentFaceData for student {StudentId}", studentId);
						}
					}
				}
				catch (Exception ex3)
				{
					Exception ex4 = ex3;
					log.LogError(ex4, "[FACE-FETCH-ERROR] Error fetching face from DB for student {StudentId}: {Error}", studentId, ex4.Message);
				}
			}
			else if (!string.IsNullOrWhiteSpace(faceB64))
			{
				log.LogInformation("[FACE-FETCH] Face already provided by frontend for student {StudentId}", studentId);
			}
			else
			{
				log.LogWarning("[FACE-FETCH] No studentId or faceB64 available (studentId={StudentId})", studentId);
			}
			Directory.CreateDirectory(uploadRoot);
			Guid evidenceId = Guid.NewGuid();
			string origExt = Path.GetExtension(file.FileName).ToLowerInvariant();
			string initialPath = Path.Combine(uploadRoot, evidenceId.ToString() + (string.IsNullOrWhiteSpace(origExt) ? ".webm" : origExt));
			await using (FileStream fsInit = File.Create(initialPath))
			{
				await file.CopyToAsync(fsInit);
			}
			string finalPath = initialPath;
			try
			{
				if (!IsValidMedia(initialPath) || origExt == ".webm")
				{
					string mp4Path = Path.Combine(uploadRoot, evidenceId.ToString() + ".mp4");
					ProcessStartInfo psi2 = new ProcessStartInfo("ffmpeg", $"-y -i \"{initialPath}\" -c:v libx264 -c:a aac \"{mp4Path}\"")
					{
						RedirectStandardOutput = true,
						RedirectStandardError = true,
						UseShellExecute = false,
						CreateNoWindow = true
					};
					using Process p = Process.Start(psi2);
					string stderr = p.StandardError.ReadToEnd();
					p.WaitForExit(20000);
					if (p.ExitCode == 0)
					{
						finalPath = mp4Path;
						Console.WriteLine("[FFMPEG] Transcoded to MP4: " + finalPath);
					}
					else
					{
						Console.WriteLine("[FFMPEG][ERROR] Transcode failed: " + stderr);
					}
				}
			}
			catch (Exception ex5)
			{
				Console.WriteLine("[FFMPEG][WARN] Validate/transcode error: " + ex5.Message);
			}
			string maTCFromForm = form["maTC"].ToString();
			int? maTC = null;
			if (!string.IsNullOrWhiteSpace(maTCFromForm) && int.TryParse(maTCFromForm, out var maTCVal))
			{
				maTC = maTCVal;
			}
			using (SqlConnection con2 = new SqlConnection(connStr))
			{
				await con2.OpenAsync();
				if (maTC.HasValue)
				{
					using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MinhChungTieuChi' AND xtype='U')\r\nBEGIN\r\n  CREATE TABLE MinhChungTieuChi (\r\n    Id INT IDENTITY(1,1) PRIMARY KEY,\r\n    MSSV CHAR(11) NOT NULL,\r\n    MaTC INT NOT NULL,\r\n    ImageData VARBINARY(MAX) NOT NULL,\r\n    Note NVARCHAR(500) NULL,\r\n    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',\r\n    CreatedAt DATETIME DEFAULT GETDATE(),\r\n    ReviewedAt DATETIME NULL,\r\n    ReviewedBy NVARCHAR(50) NULL,\r\n    FileName NVARCHAR(255) NULL\r\n  );\r\n  CREATE INDEX IX_MinhChungTieuChi_MSSV ON MinhChungTieuChi(MSSV);\r\n  CREATE INDEX IX_MinhChungTieuChi_MaTC ON MinhChungTieuChi(MaTC);\r\nEND\r\n\r\nIF COL_LENGTH('MinhChungTieuChi', 'FileName') IS NULL\r\nBEGIN\r\n    ALTER TABLE MinhChungTieuChi ADD FileName NVARCHAR(255) NULL;\r\nEND", con2))
					{
						await ensure.ExecuteNonQueryAsync();
					}
					await using FileStream fsRead = File.OpenRead(finalPath);
					using MemoryStream msRead = new MemoryStream();
					await fsRead.CopyToAsync(msRead);
					byte[] fileBytes = msRead.ToArray();
					SqlCommand insertMinhChung = new SqlCommand("\r\nINSERT INTO MinhChungTieuChi(MSSV, MaTC, ImageData, Note, Status, CreatedAt) \r\nVALUES(@mssv, @maTC, @imageData, @note, 'Pending', GETDATE());\r\nSELECT SCOPE_IDENTITY();", con2);
					insertMinhChung.Parameters.AddWithValue("@mssv", ((object)studentId) ?? ((object)DBNull.Value));
					insertMinhChung.Parameters.AddWithValue("@maTC", maTC.Value);
					insertMinhChung.Parameters.Add("@imageData", SqlDbType.VarBinary, -1).Value = fileBytes;
					insertMinhChung.Parameters.AddWithValue("@note", "Hoạt động: " + activityName);
					int newId = Convert.ToInt32((await insertMinhChung.ExecuteScalarAsync()) ?? ((object)0));
					log.LogInformation("[UPLOAD-MINCHUNG] Minh chứng lưu vào MinhChungTieuChi: Id={Id} SinhVien={StudentId} MaTC={MaTC} Activity={Activity}", newId, studentId, maTC, activityName);
				}
				else
				{
					using SqlCommand ins = new SqlCommand("INSERT INTO Evidence(EvidenceId, StudentId, ActivityName, FilePath, Status, Verdict, CreatedAt) VALUES(@id,@stu,@act,@fp,'PendingAnalyze','ManualReview',GETDATE())", con2);
					ins.Parameters.AddWithValue("@id", evidenceId);
					ins.Parameters.AddWithValue("@stu", ((object)studentId) ?? ((object)DBNull.Value));
					ins.Parameters.AddWithValue("@act", ((object)activityName) ?? ((object)DBNull.Value));
					ins.Parameters.AddWithValue("@fp", finalPath);
					await ins.ExecuteNonQueryAsync();
					log.LogInformation("[UPLOAD] Minh chứng lưu vào Evidence: SinhVien={StudentId} EvidenceId={EvidenceId} Activity={Activity} FilePath={FilePath}", studentId, evidenceId, activityName, finalPath);
				}
				try
				{
					using (SqlCommand ensure2 = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.Notifications (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        Title NVARCHAR(200) NULL,\r\n        Message NVARCHAR(1000) NULL,\r\n        Link NVARCHAR(500) NULL,\r\n        EvidenceId UNIQUEIDENTIFIER NULL,\r\n        StudentId NVARCHAR(50) NULL,\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()\r\n    );\r\nEND\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationReads' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationReads (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        ReadAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationReads PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con2))
					{
						await ensure2.ExecuteNonQueryAsync();
					}
					string maLop = null;
					using (SqlCommand sel = new SqlCommand("SELECT TOP 1 MaLop FROM SINHVIEN WHERE MSSV=@m", con2))
					{
						sel.Parameters.AddWithValue("@m", ((object)studentId) ?? ((object)DBNull.Value));
						maLop = (await sel.ExecuteScalarAsync())?.ToString();
					}
					if (!string.IsNullOrWhiteSpace(maLop))
					{
						List<Dictionary<string, object?>> gvRows = await QueryAsync(con2, "SELECT TOP 1 MaCaNhan, TenGV FROM GiangVien WHERE LopCV = @lop", new SqlParameter[1]
						{
							new SqlParameter("@lop", maLop)
						});
						if (gvRows.Count > 0)
						{
							string gvId = gvRows[0]["MaCaNhan"]?.ToString() ?? "";
							if (gvRows[0]["TenGV"]?.ToString() == null)
							{
							}
							string title = "Sinh vi\ufffdn n?p minh ch?ng";
							string msg = (maTC.HasValue ? $"Sinh vi\ufffdn {studentId} v?a n?p minh ch?ng cho tiêu chí {maTC}." : $"Sinh vi\ufffdn {studentId} v?a n?p minh ch?ng cho ho?t d?ng '{activityName}'.");
							string link = "/giangvien.html#evidence";
							using SqlCommand insNoti = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, Link, EvidenceId, StudentId) VALUES(@r,@t,@m,@l,@e,@s)", con2);
							insNoti.Parameters.AddWithValue("@r", gvId);
							insNoti.Parameters.AddWithValue("@t", title);
							insNoti.Parameters.AddWithValue("@m", msg);
							insNoti.Parameters.AddWithValue("@l", link);
							insNoti.Parameters.AddWithValue("@e", maTC.HasValue ? DBNull.Value : ((object)evidenceId));
							insNoti.Parameters.AddWithValue("@s", ((object)studentId) ?? ((object)DBNull.Value));
							await insNoti.ExecuteNonQueryAsync();
						}
					}
				}
				catch
				{
				}
			}
			if (!string.IsNullOrWhiteSpace(faceB64) && faceB64.Contains(','))
			{
				int idx = faceB64.IndexOf(',');
				faceB64 = faceB64.Substring(idx + 1);
				log.LogInformation("[UPLOAD-FACE-CLEAN] Removed data URL prefix from face image");
			}
			object[] obj4 = new object[3]
			{
				!string.IsNullOrWhiteSpace(faceB64),
				faceB64?.Length ?? 0,
				null
			};
			string text = faceB64;
			obj4[2] = ((text != null && text.Length > 50) ? (faceB64.Substring(0, 50) + "...") : (faceB64 ?? "NULL"));
			log.LogInformation("[UPLOAD-FACE-FINAL] Face image status: has_face={HasFace}, length={Length}, first_50chars={Preview}", obj4);
			AiHealthDto aiResult = null;
			try
			{
				log.LogInformation("[UPLOAD-AI-CALL] About to call AI with faceB64 present: {HasFace}, faceB64 length: {Length}", !string.IsNullOrWhiteSpace(faceB64), faceB64?.Length ?? 0);
				Dictionary<string, string> fields = new Dictionary<string, string>
				{
					["student_id"] = studentId ?? "",
					["activity_name"] = activityName ?? "",
					["student_face_image_b64"] = faceB64 ?? "",
					["lat"] = latStr ?? "",
					["lng"] = lngStr ?? ""
				};
				object[] obj5 = new object[3]
				{
					!string.IsNullOrWhiteSpace(faceB64),
					faceB64?.Length ?? 0,
					null
				};
				string text2 = faceB64;
				obj5[2] = ((text2 != null && text2.Length > 50) ? (faceB64.Substring(0, 50) + "...") : faceB64);
				log.LogInformation("[UPLOAD-AI-FACE-DEBUG] Sending face to AI: has_face={HasFace}, face_length={FaceLen}, face_first_50={FacePreview}", obj5);
				log.LogInformation("[UPLOAD-AI-CALL] Fields being sent: student_id={StudentId}, activity_name={Activity}, face_present={FacePresent}, lat={Lat}, lng={Lng}", fields["student_id"], fields["activity_name"], !string.IsNullOrWhiteSpace(fields["student_face_image_b64"]), fields["lat"], fields["lng"]);
				using FileStream fsSend = File.OpenRead(finalPath);
				aiResult = await aiClient.AnalyzeVideoAsync(contentType: Path.GetExtension(finalPath).Equals(".mp4", StringComparison.OrdinalIgnoreCase) ? "video/mp4" : "video/webm", stream: fsSend, fileName: Path.GetFileName(finalPath), fields: fields, ct: CancellationToken.None);
			}
			catch (Exception ex6)
			{
				log.LogError(ex6, "[UPLOAD-AI-ERROR] AI analyze failed: {Detail}", ex6.Message);
				try
				{
					using SqlConnection con3 = new SqlConnection(connStr);
					await con3.OpenAsync();
					using SqlCommand updFail = new SqlCommand("UPDATE Evidence SET Status='AnalyzeFailed', Verdict='LowQuality' WHERE EvidenceId=@id", con3);
					updFail.Parameters.AddWithValue("@id", evidenceId);
					await updFail.ExecuteNonQueryAsync();
				}
				catch (Exception ex7)
				{
					Exception innerEx = ex7;
					log.LogError(innerEx, "[UPLOAD-AI-ERROR] Failed to update Evidence status: {Detail}", innerEx.Message);
				}
				aiResult = null;
			}
			if (aiResult != null)
			{
				double? weighted = aiResult.weighted_score;
				double t;
				double? tamper = ((aiResult.scores != null && aiResult.scores.TryGetValue("tamper", out t)) ? new double?(t) : ((double?)null));
				double f;
				double? face = aiResult.face_score ?? ((aiResult.scores != null && aiResult.scores.TryGetValue("face", out f)) ? new double?(f) : ((double?)null));
				double c;
				double b;
				double? banner = aiResult.context_score ?? ((aiResult.scores != null && aiResult.scores.TryGetValue("context", out c)) ? new double?(c) : ((aiResult.scores != null && aiResult.scores.TryGetValue("banner", out b)) ? new double?(b) : ((double?)null)));
				string verdict = ComputeVerdict(weighted);
				log.LogInformation("[UPLOAD-SCORES-DEBUG] face_score field={FaceScoreField}, face calculated={Face}, banner={Banner}, weighted={Weighted}", aiResult.face_score, face, banner, weighted);
				log.LogInformation("[UPLOAD-SCORES-DICT] scores dict: {ScoresJson}", (aiResult.scores != null) ? JsonSerializer.Serialize(aiResult.scores) : "null");
				string detailsJson = JsonSerializer.Serialize(new { aiResult.verdict, aiResult.weighted_score, aiResult.scores });
				using SqlConnection con4 = new SqlConnection(connStr);
				await con4.OpenAsync();
				using SqlCommand upd = new SqlCommand("UPDATE Evidence SET Status='Analyzed', Verdict=@verdict, TamperScore=@tamper, FaceScore=@face, BannerScore=@banner, WeightedScore=@weighted, ScoresJson=@scores, DetailsJson=@details, ModelVersion='v1', ProcessedAt=GETDATE() WHERE EvidenceId=@id", con4);
				upd.Parameters.AddWithValue("@verdict", ((object)verdict) ?? ((object)DBNull.Value));
				upd.Parameters.AddWithValue("@tamper", ((object)tamper) ?? DBNull.Value);
				upd.Parameters.AddWithValue("@face", ((object)face) ?? DBNull.Value);
				upd.Parameters.AddWithValue("@banner", ((object)banner) ?? DBNull.Value);
				upd.Parameters.AddWithValue("@weighted", ((object)weighted) ?? DBNull.Value);
				upd.Parameters.AddWithValue("@scores", ((object)((aiResult.scores == null) ? null : JsonSerializer.Serialize(aiResult.scores))) ?? ((object)DBNull.Value));
				upd.Parameters.AddWithValue("@details", ((object)detailsJson) ?? ((object)DBNull.Value));
				upd.Parameters.AddWithValue("@id", evidenceId);
				await upd.ExecuteNonQueryAsync();
				log.LogInformation("[UPLOAD] Ph\ufffdn t\ufffdch xong: EvidenceId={EvidenceId} Verdict={Verdict} Weighted={Weighted}", evidenceId, verdict, weighted);
			}
			return maTC.HasValue ? Results.Ok(new
			{
				message = "Minh chứng được lưu vào tiêu chí, chờ xử lý",
				status = "Pending",
				table = "MinhChungTieuChi"
			}) : Results.Ok(new
			{
				evidenceId = evidenceId,
				analyzed = (aiResult != null),
				verdict = aiResult?.verdict,
				face_score = aiResult?.face_score,
				context_score = aiResult?.context_score,
				device_score = aiResult?.device_score,
				weighted_score = aiResult?.weighted_score,
				scores = aiResult?.scores,
				expected_context = aiResult?.expected_context,
				predicted_context = aiResult?.predicted_context,
				activity_name = activityName,
				gps_distance = aiResult?.gps_distance_m,
				face_analysis = ((aiResult?.details != null && aiResult.details.ContainsKey("face")) ? aiResult.details["face"].ToString() : null),
				context_analysis = ((aiResult?.details != null && aiResult.details.ContainsKey("context")) ? aiResult.details["context"].ToString() : null),
				device_analysis = ((aiResult?.details != null && aiResult.details.ContainsKey("device")) ? aiResult.details["device"].ToString() : null),
				ok = (aiResult?.ok ?? false),
				message = ((aiResult != null) ? "Hoạt động được ghi nhận và phân tích" : "Hoạt động được ghi nhận"),
				status = ((aiResult != null) ? "Analyzed" : "AnalyzeFailed"),
				table = "Evidence"
			});
		});
		app.MapPost("/api/evidence/{id:guid}/reanalyze", (Func<Guid, AiClient, Task<IResult>>)async delegate(Guid id, AiClient aiClient)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			string filePath = null;
			using (SqlCommand sel = new SqlCommand("SELECT TOP 1 FilePath FROM Evidence WHERE EvidenceId=@id", con))
			{
				sel.Parameters.AddWithValue("@id", id);
				filePath = (await sel.ExecuteScalarAsync())?.ToString();
			}
			if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
			{
				return Results.NotFound(new
				{
					message = "Kh\ufffdng t\ufffdm th?y file minh ch?ng"
				});
			}
			using (SqlCommand mark = new SqlCommand("UPDATE Evidence SET Status='Reanalyzing' WHERE EvidenceId=@id", con))
			{
				mark.Parameters.AddWithValue("@id", id);
				await mark.ExecuteNonQueryAsync();
			}
			AiHealthDto aiResult = null;
			try
			{
				using FileStream fs = File.OpenRead(filePath);
				aiResult = await aiClient.AnalyzeVideoAsync(fs, Path.GetFileName(filePath), "video/mp4", null, CancellationToken.None);
			}
			catch (Exception ex3)
			{
				using SqlCommand fail = new SqlCommand("UPDATE Evidence SET Status='ReanalyzeFailed' WHERE EvidenceId=@id", con);
				fail.Parameters.AddWithValue("@id", id);
				await fail.ExecuteNonQueryAsync();
				return Results.Ok(new
				{
					evidenceId = id,
					reanalyzed = false,
					error = ex3.Message
				});
			}
			if (aiResult != null)
			{
				double? weighted = aiResult.weighted_score;
				double t;
				double? tamper = ((aiResult.scores != null && aiResult.scores.TryGetValue("tamper", out t)) ? new double?(t) : ((double?)null));
				double f;
				double? face = ((aiResult.scores != null && aiResult.scores.TryGetValue("face", out f)) ? new double?(f) : ((double?)null));
				double b;
				double? banner = ((aiResult.scores != null && aiResult.scores.TryGetValue("banner", out b)) ? new double?(b) : ((double?)null));
				string verdict = ComputeVerdict(weighted);
				string detailsJson = JsonSerializer.Serialize(new { aiResult.verdict, aiResult.weighted_score, aiResult.scores });
				using SqlCommand upd = new SqlCommand("UPDATE Evidence SET Status='Analyzed', Verdict=@verdict, TamperScore=@tamper, FaceScore=@face, BannerScore=@banner, WeightedScore=@weighted, ScoresJson=@scores, DetailsJson=@details, ModelVersion='v1', ProcessedAt=GETDATE() WHERE EvidenceId=@id", con);
				upd.Parameters.AddWithValue("@verdict", ((object)verdict) ?? ((object)DBNull.Value));
				upd.Parameters.AddWithValue("@tamper", ((object)tamper) ?? DBNull.Value);
				upd.Parameters.AddWithValue("@face", ((object)face) ?? DBNull.Value);
				upd.Parameters.AddWithValue("@banner", ((object)banner) ?? DBNull.Value);
				upd.Parameters.AddWithValue("@weighted", ((object)weighted) ?? DBNull.Value);
				upd.Parameters.AddWithValue("@scores", ((object)((aiResult.scores == null) ? null : JsonSerializer.Serialize(aiResult.scores))) ?? ((object)DBNull.Value));
				upd.Parameters.AddWithValue("@details", ((object)detailsJson) ?? ((object)DBNull.Value));
				upd.Parameters.AddWithValue("@id", id);
				await upd.ExecuteNonQueryAsync();
			}
			return Results.Ok(new
			{
				evidenceId = id,
				reanalyzed = true
			});
		});
		app.MapPost("/api/evidence/{id:guid}/approve", (_003C_003Ef__AnonymousDelegate0<Guid, string, HttpContext, int?, int?, Task<IResult>>)async delegate(Guid id, string mssv, HttpContext ctx, int? y, int? s)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			using SqlTransaction tx = con.BeginTransaction();
			if (string.IsNullOrWhiteSpace(mssv))
			{
				tx.Rollback();
				return Results.BadRequest(new
				{
					message = "Thi?u MSSV khi duy?t minh ch?ng"
				});
			}
			try
			{
				using SqlCommand ensureCol = new SqlCommand("IF COL_LENGTH('Evidence','PointsAwarded') IS NULL ALTER TABLE Evidence ADD PointsAwarded BIT NOT NULL DEFAULT 0;", con, tx);
				await ensureCol.ExecuteNonQueryAsync();
			}
			catch
			{
			}
			try
			{
				using SqlCommand ensureCol2 = new SqlCommand("IF COL_LENGTH('Evidence','ContextScore') IS NULL ALTER TABLE Evidence ADD ContextScore FLOAT NULL;", con, tx);
				await ensureCol2.ExecuteNonQueryAsync();
			}
			catch
			{
			}
			try
			{
				using SqlCommand ensureCol3 = new SqlCommand("IF COL_LENGTH('Evidence','DeletedAt') IS NULL ALTER TABLE Evidence ADD DeletedAt DATETIME NULL;", con, tx);
				await ensureCol3.ExecuteNonQueryAsync();
			}
			catch
			{
			}
			try
			{
				using SqlCommand ensureIdx = new SqlCommand("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Evidence_Status_DeletedAt' AND object_id=OBJECT_ID('Evidence')) CREATE INDEX IX_Evidence_Status_DeletedAt ON Evidence(Status, DeletedAt);", con, tx);
				await ensureIdx.ExecuteNonQueryAsync();
			}
			catch
			{
			}
			string currentVerdict = null;
			bool pointsAwarded = false;
			using (SqlCommand get = new SqlCommand("SELECT TOP 1 Verdict, ISNULL(PointsAwarded,0) AS PointsAwarded FROM dbo.Evidence WHERE EvidenceId=@id", con, tx))
			{
				get.Parameters.AddWithValue("@id", id);
				using SqlDataReader rd = await get.ExecuteReaderAsync();
				if (await rd.ReadAsync())
				{
					currentVerdict = rd["Verdict"]?.ToString();
					pointsAwarded = Convert.ToInt32(rd["PointsAwarded"]) != 0;
				}
			}
			if (currentVerdict == null)
			{
				tx.Rollback();
				return Results.NotFound(new
				{
					message = "Kh\ufffdng t\ufffdm th?y Evidence."
				});
			}
			if (string.Equals(currentVerdict, "Approved", StringComparison.OrdinalIgnoreCase))
			{
				if (!pointsAwarded)
				{
					(int Year, int Semester) tuple = await GetSystemYearSemesterAsync(con);
					int yDefault = tuple.Year;
					int sDefault = tuple.Semester;
					int year2 = y ?? yDefault;
					int sem2 = s ?? sDefault;
					int points2;
					try
					{
						points2 = await ResolveEvidencePointsAsync(con, id);
					}
					catch
					{
						points2 = 5;
					}
					bool ok2 = await AwardPointsAsync(con, mssv, year2, sem2, points2, "Giảng viên duyệt lại minh chứng, cộng điểm bổ sung", ctx.Request.Headers["X-User-Name"].ToString() ?? ctx.Request.Headers["X-User"].ToString(), tx);
					if (ok2)
					{
						using SqlCommand mark2 = new SqlCommand("UPDATE dbo.Evidence SET PointsAwarded=1 WHERE EvidenceId=@id", con, tx);
						mark2.Parameters.AddWithValue("@id", id);
						await mark2.ExecuteNonQueryAsync();
					}
					tx.Commit();
					try
					{
						await LogAsync(ctx, con, $"APPROVE_EVIDENCE {id} MSSV={mssv} (post-approved award)");
					}
					catch
					{
					}
					return Results.Ok(new
					{
						approved = true,
						pointsAdded = (ok2 ? points2 : 0),
						year = year2,
						semester = sem2,
						message = "\ufffd\ufffd duy?t tru?c d\ufffd, c?ng di?m b? sung."
					});
				}
				tx.Rollback();
				return Results.Ok(new
				{
					approved = true,
					pointsAdded = 0,
					message = "\ufffd\ufffd duy?t tru?c d\ufffd."
				});
			}
			SqlCommand upd = new SqlCommand("UPDATE dbo.Evidence SET Status='Approved', Verdict='Approved', PointsAwarded=0 WHERE EvidenceId=@id", con, tx);
			upd.Parameters.AddWithValue("@id", id);
			await upd.ExecuteNonQueryAsync();
			(int Year, int Semester) tuple2 = await GetSystemYearSemesterAsync(con);
			int yDef = tuple2.Year;
			int sDef = tuple2.Semester;
			int year3 = y ?? yDef;
			int sem3 = s ?? sDef;
			int points3;
			try
			{
				points3 = await ResolveEvidencePointsAsync(con, id);
			}
			catch
			{
				points3 = 5;
			}
			bool ok3 = await AwardPointsAsync(con, mssv, year3, sem3, points3, "Giảng viên duyệt minh chứng", ctx.Request.Headers["X-User-Name"].ToString() ?? ctx.Request.Headers["X-User"].ToString(), tx);
			try
			{
				using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='Notifications' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.Notifications (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        Title NVARCHAR(200) NULL,\r\n        Message NVARCHAR(1000) NULL,\r\n        Link NVARCHAR(500) NULL,\r\n        EvidenceId UNIQUEIDENTIFIER NULL,\r\n        StudentId NVARCHAR(50) NULL,\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()\r\n    );\r\nEND", con, tx))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string title = "Minh chứng được duyệt";
				string msg = (ok3 ? $"Minh chứng của bạn đã được duyệt (+{points3} điểm)." : "Minh chứng của bạn đã được duyệt.");
				using SqlCommand ins = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, EvidenceId, StudentId, Link) VALUES(@r,@t,@m,@e,@s,@l)", con, tx);
				ins.Parameters.AddWithValue("@r", mssv);
				ins.Parameters.AddWithValue("@t", title);
				ins.Parameters.AddWithValue("@m", msg);
				ins.Parameters.AddWithValue("@e", id);
				ins.Parameters.AddWithValue("@s", mssv);
				ins.Parameters.AddWithValue("@l", "/index.html#evidence");
				await ins.ExecuteNonQueryAsync();
			}
			catch
			{
			}
			if (ok3)
			{
				using SqlCommand markOk = new SqlCommand("UPDATE dbo.Evidence SET PointsAwarded=1 WHERE EvidenceId=@id", con, tx);
				markOk.Parameters.AddWithValue("@id", id);
				await markOk.ExecuteNonQueryAsync();
			}
			tx.Commit();
			try
			{
				await LogAsync(ctx, con, $"APPROVE_EVIDENCE {id} MSSV={mssv}");
			}
			catch
			{
			}
			return Results.Ok(new
			{
				approved = true,
				pointsAdded = (ok3 ? points3 : 0),
				year = year3,
				semester = sem3
			});
		});
		app.MapPost("/api/evidence/{id:guid}/reject", (Func<Guid, string, HttpContext, Task<IResult>>)async delegate(Guid id, string? reason, HttpContext ctx)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			SqlCommand upd = new SqlCommand("UPDATE dbo.Evidence SET Status='Rejected', Verdict='Rejected' WHERE EvidenceId=@id", con);
			upd.Parameters.AddWithValue("@id", id);
			if (await upd.ExecuteNonQueryAsync() == 0)
			{
				return Results.NotFound(new
				{
					message = "Kh\ufffdng t\ufffdm th?y Evidence."
				});
			}
			string mssv = null;
			try
			{
				using SqlCommand sel = new SqlCommand("SELECT TOP 1 StudentId FROM Evidence WHERE EvidenceId=@id", con);
				sel.Parameters.AddWithValue("@id", id);
				mssv = (await sel.ExecuteScalarAsync())?.ToString();
			}
			catch
			{
			}
			try
			{
				await LogAsync(ctx, con, $"REJECT_EVIDENCE {id} REASON={(reason ?? string.Empty).Replace('\n', ' ').Replace('\r', ' ')}");
			}
			catch
			{
			}
			if (!string.IsNullOrWhiteSpace(mssv))
			{
				try
				{
					using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='Notifications' AND xtype='U')\r\nBEGIN\r\n  CREATE TABLE dbo.Notifications (\r\n    NotificationId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),\r\n    Recipient NVARCHAR(100) NOT NULL,\r\n    Title NVARCHAR(200) NULL,\r\n    Message NVARCHAR(1000) NULL,\r\n    Link NVARCHAR(500) NULL,\r\n    EvidenceId UNIQUEIDENTIFIER NULL,\r\n    StudentId NVARCHAR(50) NULL,\r\n    CreatedAt DATETIME NOT NULL DEFAULT GETDATE()\r\n  );\r\nEND", con))
					{
						await ensure.ExecuteNonQueryAsync();
					}
					string title = "Minh chứng bị từ chối";
					string msg = (string.IsNullOrWhiteSpace(reason) ? "Minh chứng của bạn đã bị từ chối. Vui lòng kiểm tra và gửi lại." : ("Minh chứng của bạn đã bị từ chối. Lý do: " + reason));
					using SqlCommand ins = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, EvidenceId, StudentId, Link) VALUES(@r,@t,@m,@e,@s,@l)", con);
					ins.Parameters.AddWithValue("@r", mssv);
					ins.Parameters.AddWithValue("@t", title);
					ins.Parameters.AddWithValue("@m", msg);
					ins.Parameters.AddWithValue("@e", id);
					ins.Parameters.AddWithValue("@s", mssv);
					ins.Parameters.AddWithValue("@l", "/index.html#evidence");
					await ins.ExecuteNonQueryAsync();
				}
				catch
				{
				}
			}
			return Results.Ok(new
			{
				rejected = true
			});
		});
		app.MapPost("/api/evidence/{id:guid}/complaint", (Func<Guid, string, string, HttpContext, Task<IResult>>)async delegate(Guid id, string mssv, string? reason, HttpContext ctx)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			if (string.IsNullOrWhiteSpace(mssv))
			{
				return Results.BadRequest(new
				{
					message = "Thi?u MSSV khi khi?u n?i"
				});
			}
			using (SqlCommand get = new SqlCommand("SELECT TOP 1 StudentId, Verdict FROM Evidence WHERE EvidenceId=@id", con))
			{
				get.Parameters.AddWithValue("@id", id);
				using SqlDataReader rd = await get.ExecuteReaderAsync();
				if (!(await rd.ReadAsync()))
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y minh ch?ng."
					});
				}
				string studentId = rd["StudentId"]?.ToString() ?? string.Empty;
				string verdict = rd["Verdict"]?.ToString() ?? string.Empty;
				if (!string.Equals(studentId, mssv, StringComparison.OrdinalIgnoreCase))
				{
					return Results.Forbid();
				}
				if (!string.Equals(verdict, "Rejected", StringComparison.OrdinalIgnoreCase))
				{
					return Results.BadRequest(new
					{
						message = "Ch? c\ufffd th? khi?u n?i minh ch?ng b? t? ch?i"
					});
				}
			}
			using (SqlCommand check = new SqlCommand("SELECT COUNT(*) FROM Complaints WHERE EvidenceId=@id AND Status='Pending'", con))
			{
				check.Parameters.AddWithValue("@id", id);
				int count = (int)((await check.ExecuteScalarAsync()) ?? ((object)0));
				if (count > 0)
				{
					return Results.BadRequest(new
					{
						message = "\ufffd\ufffd c\ufffd khi?u n?i dang ch? x? l\ufffd cho minh ch?ng n\ufffdy"
					});
				}
			}
			Guid complaintId = Guid.NewGuid();
			using (SqlCommand ins = new SqlCommand("\r\nINSERT INTO Complaints(ComplaintId, EvidenceId, StudentId, Reason, Status, CreatedAt)\r\nVALUES(@cid, @eid, @sid, @reason, 'Pending', GETDATE())", con))
			{
				ins.Parameters.AddWithValue("@cid", complaintId);
				ins.Parameters.AddWithValue("@eid", id);
				ins.Parameters.AddWithValue("@sid", mssv);
				SqlParameterCollection parameters = ins.Parameters;
				object obj3 = reason ?? string.Empty;
				if (obj3 == null)
				{
					obj3 = DBNull.Value;
				}
				parameters.AddWithValue("@reason", obj3);
				await ins.ExecuteNonQueryAsync();
			}
			try
			{
				await LogAsync(ctx, con, $"FILE_COMPLAINT {id} BY {mssv} REASON={(reason ?? string.Empty).Replace('\n', ' ')}");
			}
			catch
			{
			}
			try
			{
				string title = "Khi?u n?i d\ufffd du?c ghi nh?n";
				string msg = "Khi?u n?i c?a b?n v? minh ch?ng b? t? ch?i d\ufffd du?c ghi nh?n. H?i d?ng s? xem x\ufffdt trong v\ufffdng 48 gi?.";
				using SqlCommand ins2 = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, EvidenceId, StudentId, Link) VALUES(@r,@t,@m,@e,@s,@l)", con);
				ins2.Parameters.AddWithValue("@r", mssv);
				ins2.Parameters.AddWithValue("@t", title);
				ins2.Parameters.AddWithValue("@m", msg);
				ins2.Parameters.AddWithValue("@e", id);
				ins2.Parameters.AddWithValue("@s", mssv);
				ins2.Parameters.AddWithValue("@l", "/index.html#evidence");
				await ins2.ExecuteNonQueryAsync();
			}
			catch
			{
			}
			return Results.Ok(new
			{
				complaintId = complaintId,
				message = "Khi?u n?i d\ufffd du?c ghi nh?n"
			});
		});
		app.MapGet("/api/evidence/{id}/file", (Func<string, Task<IResult>>)async delegate(string id)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				SqlCommand cmd = new SqlCommand("SELECT FilePath, Status FROM dbo.Evidence WHERE CAST(EvidenceId AS VARCHAR(MAX))=@id OR (TRY_CAST(EvidenceId AS UNIQUEIDENTIFIER)=@idGuid AND @idGuid IS NOT NULL)", con);
				cmd.Parameters.AddWithValue("@id", id);
				if (Guid.TryParse(id, out var idGuid))
				{
					cmd.Parameters.AddWithValue("@idGuid", idGuid);
				}
				else
				{
					cmd.Parameters.AddWithValue("@idGuid", DBNull.Value);
				}
				string pathObj = null;
				string status = null;
				using (SqlDataReader reader = await cmd.ExecuteReaderAsync())
				{
					if (await reader.ReadAsync())
					{
						pathObj = reader["FilePath"]?.ToString();
						status = reader["Status"]?.ToString();
					}
				}
				if (pathObj == null)
				{
					return Results.NotFound(new
					{
						error = "Evidence not found"
					});
				}
				if (status == "Deleted")
				{
					return Results.StatusCode(410);
				}
				string rawPath = pathObj.ToString() ?? string.Empty;
				string absPath = (Path.IsPathRooted(rawPath) ? rawPath : Path.Combine(uploadRoot, rawPath.Replace('\\', '/')));
				Console.WriteLine($"[FILE-DEBUG] ID={id}, Status={status}, DB_Path={rawPath}, Abs_Path={absPath}, Exists={File.Exists(absPath)}");
				if (string.IsNullOrWhiteSpace(absPath) || !File.Exists(absPath))
				{
					string uploadsDir = uploadRoot;
					if (!Directory.Exists(uploadsDir))
					{
						Console.WriteLine("[FILE-DEBUG] FAIL: Upload dir not found: " + uploadsDir);
						return Results.NotFound(new
						{
							error = "Upload directory not accessible"
						});
					}
					string idLower = id.ToLowerInvariant();
					string[] possibleFiles = Directory.GetFiles(uploadsDir, idLower + ".*");
					Console.WriteLine($"[FILE-DEBUG] Fallback search: id_lower={idLower}, pattern={idLower}.*,found={possibleFiles.Length} files");
					if (possibleFiles.Length == 0)
					{
						Console.WriteLine("[FILE-DEBUG] FAIL: No file found for " + id);
						return Results.NotFound(new
						{
							error = "Video file not found or deleted"
						});
					}
					absPath = possibleFiles[0];
					Console.WriteLine("[FILE-DEBUG] Fallback SUCCESS: using " + absPath);
				}
				if (!File.Exists(absPath))
				{
					return Results.NotFound(new
					{
						error = "File not accessible"
					});
				}
				string contentType = "application/octet-stream";
				string ext = Path.GetExtension(absPath).ToLowerInvariant();
				int num;
				switch (ext)
				{
				case ".mp4":
					contentType = "video/mp4";
					break;
				case ".webm":
					contentType = "video/webm";
					break;
				default:
					num = ((ext == ".jpeg") ? 1 : 0);
					goto IL_065e;
				case ".jpg":
					{
						num = 1;
						goto IL_065e;
					}
					IL_065e:
					if (num != 0)
					{
						contentType = "image/jpeg";
					}
					else if (ext == ".png")
					{
						contentType = "image/png";
					}
					break;
				}
				return Results.File(absPath, contentType);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Problem(ex4.Message);
			}
		});
		app.MapGet("/api/complaints", (Func<HttpContext, string, int?, int?, Task<IResult>>)async delegate(HttpContext http, string? status, int? page, int? pageSize)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int pageNum = page ?? 1;
				int pageSz = pageSize ?? 20;
				int offset = (pageNum - 1) * pageSz;
				string where = "WHERE 1=1";
				if (!string.IsNullOrWhiteSpace(status))
				{
					where += " AND Status = @status";
				}
				using SqlCommand cnt = new SqlCommand("SELECT COUNT(*) FROM Complaints " + where, con);
				if (!string.IsNullOrWhiteSpace(status))
				{
					cnt.Parameters.AddWithValue("@status", status);
				}
				int total = ((int?)(await cnt.ExecuteScalarAsync())).GetValueOrDefault();
				string sql = "\r\nSELECT\r\n    ComplaintId, EvidenceId, StudentId, Reason, Status, CreatedAt, ResolvedAt, ResolvedBy, ResolutionNote, PointsAwarded,\r\n    (SELECT TOP 1 ActivityName FROM Evidence WHERE EvidenceId = Complaints.EvidenceId) AS ActivityName,\r\n    (SELECT TOP 1 Verdict FROM Evidence WHERE EvidenceId = Complaints.EvidenceId) AS CurrentVerdict\r\nFROM Complaints\r\n" + where + "\r\nORDER BY CreatedAt DESC\r\nOFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@pageSize", pageSz);
				cmd.Parameters.AddWithValue("@offset", offset);
				if (!string.IsNullOrWhiteSpace(status))
				{
					cmd.Parameters.AddWithValue("@status", status);
				}
				List<object> complaints = new List<object>();
				using (SqlDataReader rd = await cmd.ExecuteReaderAsync())
				{
					while (await rd.ReadAsync())
					{
						complaints.Add(new
						{
							complaintId = rd["ComplaintId"],
							evidenceId = rd["EvidenceId"],
							studentId = rd["StudentId"],
							reason = rd["Reason"],
							status = rd["Status"],
							createdAt = rd["CreatedAt"],
							resolvedAt = rd["ResolvedAt"],
							resolvedBy = rd["ResolvedBy"],
							resolutionNote = rd["ResolutionNote"],
							pointsAwarded = rd["PointsAwarded"],
							activityName = rd["ActivityName"],
							currentVerdict = rd["CurrentVerdict"]
						});
					}
				}
				return Results.Ok(new
				{
					complaints = complaints,
					total = total,
					page = pageNum,
					pageSize = pageSz
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Problem("Error fetching complaints: " + ex4.Message);
			}
		});
		app.MapGet("/api/tieuchi/evidence", (Func<HttpContext, Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				SqlCommand cmd = new SqlCommand("\r\nSELECT EvidenceId, StudentId, ActivityName, Status, Verdict, WeightedScore, CreatedAt\r\nFROM Evidence\r\nWHERE Status IN ('ManualReview', 'Pending')\r\nORDER BY CreatedAt DESC", con);
				List<object> list = new List<object>();
				using (SqlDataReader rd = await cmd.ExecuteReaderAsync())
				{
					while (await rd.ReadAsync())
					{
						list.Add(new
						{
							evidenceId = rd["EvidenceId"],
							mssv = rd["StudentId"],
							MSSV = rd["StudentId"],
							activityName = rd["ActivityName"],
							status = rd["Status"],
							Status = rd["Status"],
							verdict = rd["Verdict"],
							weightedScore = rd["WeightedScore"],
							createdAt = rd["CreatedAt"]
						});
					}
				}
				return Results.Ok(list);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Problem("Error fetching tieuchi evidence: " + ex4.Message);
			}
		});
		app.MapPost("/api/complaints/{id:guid}/approve", (_003C_003Ef__AnonymousDelegate0<Guid, string, HttpContext, int?, int?, Task<IResult>>)async delegate(Guid id, string mssv, HttpContext ctx, int? y, int? s)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlTransaction tx = con.BeginTransaction();
				Guid evidenceId = Guid.Empty;
				string studentId = null;
				using (SqlCommand get = new SqlCommand("SELECT EvidenceId, StudentId FROM Complaints WHERE ComplaintId=@id", con, tx))
				{
					get.Parameters.AddWithValue("@id", id);
					using SqlDataReader rd = await get.ExecuteReaderAsync();
					if (await rd.ReadAsync())
					{
						evidenceId = (Guid)rd["EvidenceId"];
						studentId = rd["StudentId"]?.ToString();
					}
				}
				if (evidenceId == Guid.Empty)
				{
					tx.Rollback();
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y khi?u n?i"
					});
				}
				using (SqlCommand upd = new SqlCommand("UPDATE Complaints SET Status='Approved', ResolvedAt=GETDATE(), ResolvedBy=@by WHERE ComplaintId=@id", con, tx))
				{
					upd.Parameters.AddWithValue("@id", id);
					SqlParameterCollection parameters = upd.Parameters;
					object obj3 = GetUserName(ctx) ?? "System";
					if (obj3 == null)
					{
						obj3 = DBNull.Value;
					}
					parameters.AddWithValue("@by", obj3);
					await upd.ExecuteNonQueryAsync();
				}
				using (SqlCommand upd2 = new SqlCommand("UPDATE Evidence SET Verdict='Approved', Status='Approved' WHERE EvidenceId=@id", con, tx))
				{
					upd2.Parameters.AddWithValue("@id", evidenceId);
					await upd2.ExecuteNonQueryAsync();
				}
				if (!string.IsNullOrWhiteSpace(studentId) && !string.IsNullOrWhiteSpace(mssv))
				{
					try
					{
						(int Year, int Semester) tuple = await GetSystemYearSemesterAsync(con);
						int yDefault = tuple.Year;
						int sDefault = tuple.Semester;
						int year = y ?? yDefault;
						int sem = s ?? sDefault;
						int points = 5;
						try
						{
							points = await ResolveEvidencePointsAsync(con, evidenceId);
						}
						catch
						{
						}
						if (await AwardPointsAsync(con, mssv, year, sem, points, "Cộng điểm rèn luyện (API)", "System", tx))
						{
							using SqlCommand mark = new SqlCommand("UPDATE Complaints SET PointsAwarded=@pts WHERE ComplaintId=@id", con, tx);
							mark.Parameters.AddWithValue("@pts", points);
							mark.Parameters.AddWithValue("@id", id);
							await mark.ExecuteNonQueryAsync();
						}
					}
					catch
					{
					}
				}
				tx.Commit();
				try
				{
					await LogAsync(ctx, con, $"APPROVE_COMPLAINT {id} FOR {studentId}");
				}
				catch
				{
				}
				try
				{
					if (!string.IsNullOrWhiteSpace(studentId))
					{
						string title = "Khi?u n?i du?c ph\ufffd duy?t";
						string msg = "Khi?u n?i c?a b?n d\ufffd du?c h?i d?ng ph\ufffd duy?t. Minh ch?ng d\ufffd du?c ch?p nh?n.";
						using SqlCommand ins = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, EvidenceId, StudentId, Link) VALUES(@r,@t,@m,@e,@s,@l)", con);
						ins.Parameters.AddWithValue("@r", studentId);
						ins.Parameters.AddWithValue("@t", title);
						ins.Parameters.AddWithValue("@m", msg);
						ins.Parameters.AddWithValue("@e", evidenceId);
						ins.Parameters.AddWithValue("@s", studentId);
						ins.Parameters.AddWithValue("@l", "/index.html#evidence");
						await ins.ExecuteNonQueryAsync();
					}
				}
				catch
				{
				}
				return Results.Ok(new
				{
					approved = true,
					message = "Khi?u n?i d\ufffd du?c ph\ufffd duy?t"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Problem("Error approving complaint: " + ex4.Message);
			}
		});
		app.MapPost("/api/complaints/{id:guid}/reject", (Func<Guid, string, HttpContext, Task<IResult>>)async delegate(Guid id, string? reason, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string studentId = null;
				Guid evidenceId = Guid.Empty;
				using (SqlCommand get = new SqlCommand("SELECT StudentId, EvidenceId FROM Complaints WHERE ComplaintId=@id", con))
				{
					get.Parameters.AddWithValue("@id", id);
					using SqlDataReader rd = await get.ExecuteReaderAsync();
					if (await rd.ReadAsync())
					{
						studentId = rd["StudentId"]?.ToString();
						evidenceId = (Guid)rd["EvidenceId"];
					}
				}
				if (evidenceId == Guid.Empty)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y khi?u n?i"
					});
				}
				using (SqlCommand upd = new SqlCommand("UPDATE Complaints SET Status='Rejected', ResolvedAt=GETDATE(), ResolvedBy=@by, ResolutionNote=@note WHERE ComplaintId=@id", con))
				{
					upd.Parameters.AddWithValue("@id", id);
					SqlParameterCollection parameters = upd.Parameters;
					object obj3 = GetUserName(ctx) ?? "System";
					if (obj3 == null)
					{
						obj3 = DBNull.Value;
					}
					parameters.AddWithValue("@by", obj3);
					upd.Parameters.AddWithValue("@note", ((object)(reason ?? string.Empty)) ?? ((object)DBNull.Value));
					await upd.ExecuteNonQueryAsync();
				}
				try
				{
					await LogAsync(ctx, con, $"REJECT_COMPLAINT {id} REASON={(reason ?? string.Empty).Replace('\n', ' ')}");
				}
				catch
				{
				}
				try
				{
					if (!string.IsNullOrWhiteSpace(studentId))
					{
						string title = "Khi?u n?i kh\ufffdng du?c ch?p nh?n";
						string msg = (string.IsNullOrWhiteSpace(reason) ? "Khi?u n?i c?a b?n d\ufffd kh\ufffdng du?c ch?p nh?n." : ("Khi?u n?i c?a b?n kh\ufffdng du?c ch?p nh?n. L\ufffd do: " + reason));
						using SqlCommand ins = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, EvidenceId, StudentId, Link) VALUES(@r,@t,@m,@e,@s,@l)", con);
						ins.Parameters.AddWithValue("@r", studentId);
						ins.Parameters.AddWithValue("@t", title);
						ins.Parameters.AddWithValue("@m", msg);
						ins.Parameters.AddWithValue("@e", evidenceId);
						ins.Parameters.AddWithValue("@s", studentId);
						ins.Parameters.AddWithValue("@l", "/index.html#evidence");
						await ins.ExecuteNonQueryAsync();
					}
				}
				catch
				{
				}
				return Results.Ok(new
				{
					rejected = true,
					message = "Khi?u n?i d\ufffd b? t? ch?i"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Problem("Error rejecting complaint: " + ex4.Message);
			}
		});
		app.MapGet("/api/settings/cleanup-config", (Func<HttpContext, Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				Dictionary<string, object> settings = new Dictionary<string, object>();
				try
				{
					using SqlCommand cmd = new SqlCommand("\r\nSELECT SettingKey, SettingValue FROM AppSettings WHERE SettingKey LIKE 'Cleanup_%'", con);
					using SqlDataReader rd = await cmd.ExecuteReaderAsync();
					while (await rd.ReadAsync())
					{
						string key = rd["SettingKey"]?.ToString() ?? "";
						string val = rd["SettingValue"]?.ToString() ?? "";
						settings[key] = val;
					}
				}
				catch
				{
				}
				return Results.Ok(new
				{
					enabled = (!settings.ContainsKey("Cleanup_Enabled") || bool.Parse(settings["Cleanup_Enabled"]?.ToString() ?? "true")),
					daysToKeep = (settings.ContainsKey("Cleanup_DaysToKeep") ? int.Parse(settings["Cleanup_DaysToKeep"]?.ToString() ?? "5") : 5),
					cleanupTime = ((!settings.ContainsKey("Cleanup_Time")) ? "02:00" : (settings["Cleanup_Time"]?.ToString() ?? "02:00")),
					notifyBefore = (!settings.ContainsKey("Cleanup_NotifyBefore") || bool.Parse(settings["Cleanup_NotifyBefore"]?.ToString() ?? "true"))
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Problem("Error loading cleanup config: " + ex4.Message);
			}
		});
		app.MapPost("/api/settings/cleanup-config", (Func<HttpContext, Task<IResult>>)async delegate(HttpContext ctx)
		{
			try
			{
				using StreamReader sr = new StreamReader(ctx.Request.Body);
				JsonDocument doc = JsonDocument.Parse(await sr.ReadToEndAsync());
				JsonElement body = doc.RootElement;
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				Dictionary<string, string> settings = new Dictionary<string, string>
				{
					["Cleanup_Enabled"] = body.GetProperty("enabled").GetBoolean().ToString()
						.ToLower(),
					["Cleanup_DaysToKeep"] = body.GetProperty("daysToKeep").GetInt32().ToString(),
					["Cleanup_Time"] = body.GetProperty("cleanupTime").GetString() ?? "02:00",
					["Cleanup_NotifyBefore"] = body.GetProperty("notifyBefore").GetBoolean().ToString()
						.ToLower()
				};
				foreach (var (key, val) in settings)
				{
					using SqlCommand upsert = new SqlCommand("\r\nIF EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey=@key)\r\n    UPDATE AppSettings SET SettingValue=@val, UpdatedAt=GETDATE() WHERE SettingKey=@key\r\nELSE\r\n    INSERT INTO AppSettings(SettingKey, SettingValue) VALUES(@key, @val)", con);
					upsert.Parameters.AddWithValue("@key", key);
					upsert.Parameters.AddWithValue("@val", val);
					await upsert.ExecuteNonQueryAsync();
				}
				try
				{
					await LogAsync(ctx, con, "UPDATE_CLEANUP_CONFIG");
				}
				catch
				{
				}
				return Results.Ok(new
				{
					success = true,
					message = "Cleanup config updated"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Problem("Error saving cleanup config: " + ex4.Message);
			}
		});
		app.MapPost("/api/maintenance/cleanup-test", (Func<HttpContext, Task<IResult>>)async delegate(HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int daysToKeep = 5;
				try
				{
					using SqlCommand cmd = new SqlCommand("SELECT SettingValue FROM AppSettings WHERE SettingKey='Cleanup_DaysToKeep'", con);
					object val = await cmd.ExecuteScalarAsync();
					if (val != null && int.TryParse(val.ToString(), out var parsed))
					{
						daysToKeep = parsed;
					}
				}
				catch
				{
				}
				List<object> stage1Records = new List<object>();
				using (SqlCommand find = new SqlCommand("\r\nSELECT EvidenceId, StudentId, ActivityName, FilePath, CreatedAt FROM Evidence \r\nWHERE Verdict = 'Rejected' \r\n  AND Status != 'Deleted'\r\n  AND CreatedAt < DATEADD(DAY, -@days, GETDATE())\r\nORDER BY CreatedAt DESC", con))
				{
					find.Parameters.AddWithValue("@days", daysToKeep);
					using SqlDataReader rd = await find.ExecuteReaderAsync();
					while (await rd.ReadAsync())
					{
						stage1Records.Add(new
						{
							evidenceId = rd["EvidenceId"],
							studentId = (rd["StudentId"]?.ToString() ?? "(no student)"),
							activityName = (rd["ActivityName"]?.ToString() ?? "(no activity)"),
							filePath = (rd["FilePath"]?.ToString() ?? "(no filepath)"),
							createdAt = rd["CreatedAt"],
							action = "Mark as Deleted (Soft Delete)"
						});
					}
				}
				List<object> stage2Records = new List<object>();
				using (SqlCommand find2 = new SqlCommand("\r\nSELECT EvidenceId, StudentId, ActivityName, FilePath, Status, DeletedAt FROM Evidence \r\nWHERE Status = 'Deleted'\r\n  AND DeletedAt IS NOT NULL\r\n  AND DeletedAt < DATEADD(DAY, -@days, GETDATE())\r\nORDER BY DeletedAt DESC", con))
				{
					find2.Parameters.AddWithValue("@days", daysToKeep);
					using SqlDataReader rd2 = await find2.ExecuteReaderAsync();
					while (await rd2.ReadAsync())
					{
						stage2Records.Add(new
						{
							evidenceId = rd2["EvidenceId"],
							studentId = (rd2["StudentId"]?.ToString() ?? "(no student)"),
							activityName = (rd2["ActivityName"]?.ToString() ?? "(no activity)"),
							filePath = (rd2["FilePath"]?.ToString() ?? "(no filepath)"),
							deletedAt = rd2["DeletedAt"],
							action = "Hard Delete (Remove file + DB)"
						});
					}
				}
				try
				{
					await LogAsync(ctx, con, $"CLEANUP_TEST STAGE1={stage1Records.Count} STAGE2={stage2Records.Count}");
				}
				catch
				{
				}
				return Results.Ok(new
				{
					daysToKeep = daysToKeep,
					stage1 = new
					{
						count = stage1Records.Count,
						description = $"Minh ch?ng b? reject qu\ufffd {daysToKeep} ng\ufffdy - S? du?c d\ufffdnh d?u l\ufffd '\ufffd\ufffd x\ufffda' (Soft Delete)",
						records = stage1Records
					},
					stage2 = new
					{
						count = stage2Records.Count,
						description = $"Minh ch?ng d\ufffd b? x\ufffda qu\ufffd {daysToKeep} ng\ufffdy - S? b? x\ufffda ho\ufffdn to\ufffdn (Hard Delete)",
						records = stage2Records
					},
					total = stage1Records.Count + stage2Records.Count,
					test = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Problem("Error in cleanup test: " + ex4.Message);
			}
		});
		app.MapPost("/api/maintenance/cleanup-execute", (Func<HttpContext, Task<IResult>>)async delegate(HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int daysToKeep = 5;
				int stage1Updated = 0;
				int stage2FilesDeleted = 0;
				int stage2DbDeleted = 0;
				try
				{
					using SqlCommand cmd = new SqlCommand("SELECT SettingKey, SettingValue FROM AppSettings WHERE SettingKey LIKE 'Cleanup_%'", con);
					using SqlDataReader rd = await cmd.ExecuteReaderAsync();
					while (await rd.ReadAsync())
					{
						string key = rd["SettingKey"]?.ToString() ?? "";
						if (key == "Cleanup_DaysToKeep" && int.TryParse(rd["SettingValue"]?.ToString() ?? "5", out var parsed))
						{
							daysToKeep = parsed;
						}
					}
				}
				catch
				{
				}
				Console.WriteLine($"[CLEANUP-STAGE1] Starting soft delete process (daysToKeep={daysToKeep})");
				try
				{
					using SqlCommand updateSoft = new SqlCommand("\r\nUPDATE Evidence \r\nSET Status = 'Deleted', DeletedAt = GETDATE()\r\nWHERE Verdict = 'Rejected' \r\n  AND Status != 'Deleted'\r\n  AND CreatedAt < DATEADD(DAY, -@days, GETDATE())", con);
					updateSoft.Parameters.AddWithValue("@days", daysToKeep);
					stage1Updated = await updateSoft.ExecuteNonQueryAsync();
					Console.WriteLine($"[CLEANUP-STAGE1] Soft-deleted {stage1Updated} records (marked as '\ufffd\ufffd x\ufffda')");
				}
				catch (Exception ex3)
				{
					Exception ex4 = ex3;
					Console.WriteLine("[CLEANUP-STAGE1] Error: " + ex4.Message);
				}
				Console.WriteLine("[CLEANUP-STAGE2] Starting hard delete process");
				List<(Guid id, string filePath)> stage2Records = new List<(Guid, string)>();
				using (SqlCommand find = new SqlCommand("\r\nSELECT EvidenceId, FilePath FROM Evidence\r\nWHERE Status = 'Deleted'\r\n  AND DeletedAt IS NOT NULL\r\n  AND DeletedAt < DATEADD(DAY, -@days, GETDATE())", con))
				{
					find.Parameters.AddWithValue("@days", daysToKeep);
					using SqlDataReader rd2 = await find.ExecuteReaderAsync();
					while (await rd2.ReadAsync())
					{
						object fpObj = rd2["FilePath"];
						stage2Records.Add(new ValueTuple<Guid, string>(item2: (fpObj == null || fpObj == DBNull.Value) ? "" : (fpObj.ToString() ?? ""), item1: (Guid)rd2["EvidenceId"]));
					}
				}
				Console.WriteLine($"[CLEANUP-STAGE2] Found {stage2Records.Count} records to hard-delete");
				foreach (var (id, filePath) in stage2Records)
				{
					try
					{
						if (!string.IsNullOrWhiteSpace(filePath))
						{
							if (File.Exists(filePath))
							{
								File.Delete(filePath);
								Console.WriteLine("[CLEANUP-STAGE2] Deleted file: " + filePath);
								stage2FilesDeleted++;
							}
							else
							{
								Console.WriteLine("[CLEANUP-STAGE2] File not found, skipping: " + filePath);
							}
						}
					}
					catch (Exception ex5)
					{
						Console.WriteLine("[CLEANUP-STAGE2] Failed to delete file " + filePath + ": " + ex5.Message);
					}
					try
					{
						using SqlCommand del = new SqlCommand("DELETE FROM Evidence WHERE EvidenceId=@id", con);
						del.Parameters.AddWithValue("@id", id);
						if (await del.ExecuteNonQueryAsync() > 0)
						{
							stage2DbDeleted++;
							Console.WriteLine($"[CLEANUP-STAGE2] Deleted DB record: {id}");
						}
					}
					catch (Exception ex6)
					{
						Console.WriteLine($"[CLEANUP-STAGE2] Failed to delete DB record {id}: {ex6.Message}");
					}
				}
				try
				{
					await LogAsync(ctx, con, $"CLEANUP_STAGE1={stage1Updated} STAGE2_FILES={stage2FilesDeleted} STAGE2_DB={stage2DbDeleted}");
				}
				catch
				{
				}
				return Results.Ok(new
				{
					success = true,
					stage1 = new
					{
						action = "Soft Delete (Mark as '\ufffd\ufffd x\ufffda')",
						updated = stage1Updated,
						description = $"\ufffd\ufffdnh d?u {stage1Updated} minh ch?ng b? reject qu\ufffd {daysToKeep} ng\ufffdy l\ufffd '\ufffd\ufffd x\ufffda'"
					},
					stage2 = new
					{
						action = "Hard Delete (Remove completely)",
						filesDeleted = stage2FilesDeleted,
						dbDeleted = stage2DbDeleted,
						description = $"X\ufffda ho\ufffdn to\ufffdn {stage2FilesDeleted} file + {stage2DbDeleted} records"
					},
					summary = $"Stage 1: {stage1Updated} updated | Stage 2: {stage2FilesDeleted} files + {stage2DbDeleted} DB deleted"
				});
			}
			catch (Exception ex3)
			{
				Exception ex7 = ex3;
				return Results.Problem("Error in cleanup execution: " + ex7.Message);
			}
		});
		app.MapGet("/api/maintenance/file-status", (Func<string, Task<IResult>>)async delegate(string? mssv)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string query = "\r\nSELECT TOP 100\r\n  EvidenceId,\r\n  StudentId,\r\n  FilePath,\r\n  Status,\r\n  Verdict,\r\n  CreatedAt\r\nFROM Evidence\r\nWHERE 1=1\r\n";
				if (!string.IsNullOrWhiteSpace(mssv))
				{
					query += " AND StudentId = @mssv";
				}
				query += " ORDER BY CreatedAt DESC";
				SqlCommand cmd = new SqlCommand(query, con);
				if (!string.IsNullOrWhiteSpace(mssv))
				{
					cmd.Parameters.AddWithValue("@mssv", mssv);
				}
				List<object> results = new List<object>();
				using (SqlDataReader reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						string evidenceId = reader["EvidenceId"]?.ToString() ?? "";
						string filePath = reader["FilePath"]?.ToString() ?? "";
						string status = reader["Status"]?.ToString() ?? "";
						string verdict = reader["Verdict"]?.ToString() ?? "";
						string absPath = null;
						bool fileExists = false;
						if (!string.IsNullOrWhiteSpace(filePath))
						{
							absPath = (Path.IsPathRooted(filePath) ? filePath : Path.Combine(uploadRoot, filePath.Replace('\\', '/')));
							fileExists = File.Exists(absPath);
						}
						results.Add(new
						{
							evidenceId = evidenceId,
							studentId = (reader["StudentId"]?.ToString() ?? ""),
							dbFilePath = filePath,
							dbStatus = status,
							dbVerdict = verdict,
							createdAt = (reader["CreatedAt"]?.ToString() ?? ""),
							fileExists = fileExists,
							absolutePath = absPath,
							issue = ((!fileExists) ? "FILE_MISSING" : ((fileExists && status == "Deleted") ? "SOFT_DELETED_WITH_FILE" : "OK"))
						});
					}
				}
				int totalRecords = results.Count;
				int missingFiles = results.Count((object r) => r.GetType().GetProperty("fileExists")?.GetValue(r)?.ToString() == "False");
				List<object> withIssues = results.Where((object r) => r.GetType().GetProperty("issue")?.GetValue(r)?.ToString() != "OK").ToList();
				return Results.Ok(new
				{
					uploadRoot = uploadRoot,
					totalRecords = totalRecords,
					filesMissing = missingFiles,
					recordsWithIssues = withIssues.Count,
					issues = withIssues,
					allRecords = results
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Problem("Error checking file status: " + ex4.Message);
			}
		});
		app.MapGet("/api/maintenance/cleanup-history", (_003C_003Ef__AnonymousDelegate1<int, Task<IResult>>)async delegate(int limit)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<object> history = new List<object>();
				try
				{
					using SqlCommand cmd = new SqlCommand($"SELECT TOP {Math.Min(limit, 100)} ExecutedAt, DeletedCount, NotifiedCount, Status FROM CleanupHistory ORDER BY ExecutedAt DESC", con);
					using SqlDataReader rd = await cmd.ExecuteReaderAsync();
					while (await rd.ReadAsync())
					{
						history.Add(new
						{
							executedAt = rd["ExecutedAt"],
							deletedCount = rd["DeletedCount"],
							notifiedCount = rd["NotifiedCount"],
							status = rd["Status"]
						});
					}
				}
				catch
				{
				}
				return Results.Ok(history);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Problem("Error loading cleanup history: " + ex4.Message);
			}
		});
		app.UseDefaultFiles();
		app.UseStaticFiles();
		try
		{
			using SqlConnection conTk = new SqlConnection(connStr);
			await conTk.OpenAsync();
			string schemaSql = @"
IF COL_LENGTH('TK','PasswordHash') IS NULL ALTER TABLE TK ADD PasswordHash NVARCHAR(MAX) NULL;
IF COL_LENGTH('TK','PasswordSalt') IS NULL ALTER TABLE TK ADD PasswordSalt NVARCHAR(200) NULL;
IF COL_LENGTH('TK','PasswordAlgo') IS NULL ALTER TABLE TK ADD PasswordAlgo NVARCHAR(50) NULL;
IF COL_LENGTH('TK','CreatedAt') IS NULL ALTER TABLE TK ADD CreatedAt DATETIME NULL;
IF COL_LENGTH('TK','UpdatedAt') IS NULL ALTER TABLE TK ADD UpdatedAt DATETIME NULL;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U')
BEGIN
    CREATE TABLE dbo.Notifications (
        NotificationId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        Recipient NVARCHAR(100) NOT NULL,
        Title NVARCHAR(200) NULL,
        Message NVARCHAR(1000) NULL,
        Link NVARCHAR(500) NULL,
        EvidenceId UNIQUEIDENTIFIER NULL,
        StudentId NVARCHAR(50) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
END

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationReads' AND xtype='U')
BEGIN
    CREATE TABLE dbo.NotificationReads (
        NotificationId UNIQUEIDENTIFIER NOT NULL,
        Recipient NVARCHAR(100) NOT NULL,
        ReadAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_NotificationReads PRIMARY KEY (NotificationId, Recipient)
    );
END

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationDeletes' AND xtype='U')
BEGIN
    CREATE TABLE dbo.NotificationDeletes (
        NotificationId UNIQUEIDENTIFIER NOT NULL,
        Recipient NVARCHAR(100) NOT NULL,
        DeletedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT PK_NotificationDeletes PRIMARY KEY (NotificationId, Recipient)
    );
END
";
			using SqlCommand alter = new SqlCommand(schemaSql, conTk);
			await alter.ExecuteNonQueryAsync();
		}
		catch (Exception ex2)
		{
			Console.WriteLine("[Startup][WARN] Database schema migration failed: " + ex2.Message);
		}
		app.MapPost("/api/admin/users", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string caller = req.Headers["X-User"].ToString();
				if (!(await IsAdminAsync(con, caller)))
				{
					return Results.StatusCode(403);
				}
				using StreamReader sr = new StreamReader(req.Body);
				using JsonDocument doc = JsonDocument.Parse(await sr.ReadToEndAsync());
				JsonElement root = doc.RootElement;
				JsonElement pTenTk;
				string tenTk = (root.TryGetProperty("TenTK", out pTenTk) ? pTenTk.GetString() : null);
				JsonElement pMa;
				string maCaNhan = (root.TryGetProperty("MaCaNhan", out pMa) ? pMa.GetString() : null);
				JsonElement pRole;
				string maQt = (root.TryGetProperty("MaQT", out pRole) ? pRole.GetString() : null);
				JsonElement pPass;
				string password = (root.TryGetProperty("Password", out pPass) ? pPass.GetString() : null);
				if (string.IsNullOrWhiteSpace(tenTk) || string.IsNullOrWhiteSpace(password))
				{
					return Results.BadRequest(new
					{
						message = "Thi?u TenTK ho?c Password"
					});
				}
				(string Hash, string Salt, string Algo) hp = HashPassword(password);
				DateTime now = DateTime.UtcNow;
				using (SqlCommand upd = new SqlCommand("UPDATE TK SET PasswordHash=@h, PasswordSalt=@s, PasswordAlgo=@a, UpdatedAt=@u, MaQT=ISNULL(@role, MaQT), MaCaNhan=ISNULL(@macn, MaCaNhan) WHERE TenTK=@tk", con))
				{
					upd.Parameters.AddWithValue("@h", ((object)hp.Hash) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@s", ((object)hp.Salt) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@a", ((object)hp.Algo) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@u", now);
					upd.Parameters.AddWithValue("@role", ((object)maQt) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@macn", ((object)maCaNhan) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@tk", tenTk);
					if (await upd.ExecuteNonQueryAsync() == 0)
					{
						using SqlCommand ins = new SqlCommand("INSERT INTO TK (TenTK, MaCaNhan, MaQT, PasswordHash, PasswordSalt, PasswordAlgo, CreatedAt, UpdatedAt) VALUES (@tk, @macn, @role, @h, @s, @a, @c, @u)", con);
						ins.Parameters.AddWithValue("@tk", tenTk);
						ins.Parameters.AddWithValue("@macn", ((object)maCaNhan) ?? ((object)DBNull.Value));
						ins.Parameters.AddWithValue("@role", ((object)maQt) ?? ((object)DBNull.Value));
						ins.Parameters.AddWithValue("@h", hp.Hash);
						ins.Parameters.AddWithValue("@s", hp.Salt);
						ins.Parameters.AddWithValue("@a", hp.Algo);
						ins.Parameters.AddWithValue("@c", now);
						ins.Parameters.AddWithValue("@u", now);
						await ins.ExecuteNonQueryAsync();
					}
				}
				await LogAsync(req.HttpContext, con, "ADMIN_CREATE_USER TenTK=" + tenTk, null, "SECURITY");
				return Results.Ok(new
				{
					ok = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				int? statusCode = 500;
				return Results.Problem(ex4.Message, null, statusCode, "Create user failed");
			}
		});
		app.MapGet("/api/notifications/count", (Func<string, Task<IResult>>)async delegate(string? gvId)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			if (string.IsNullOrWhiteSpace(gvId))
			{
				return Results.BadRequest(new
				{
					message = "Thi?u gvId"
				});
			}
			string sql = "\r\n      SELECT COUNT(1)\r\n      FROM dbo.Notifications n\r\n      LEFT JOIN dbo.NotificationReads r\r\n        ON r.NotificationId = n.NotificationId AND r.Recipient = @gv\r\n      WHERE (n.Recipient = @gv OR n.Recipient = 'ALL_GIANGVIEN')\r\n        AND r.NotificationId IS NULL;";
			using SqlCommand cmd = new SqlCommand(sql, con);
			cmd.Parameters.AddWithValue("@gv", gvId);
			int count = Convert.ToInt32((await cmd.ExecuteScalarAsync()) ?? ((object)0));
			return Results.Ok(new
			{
				unread = count
			});
		});
		app.MapGet("/api/notifications", async delegate(string? gvId, int? top)
		{
			if (top == null || top < 1 || top > 100)
			{
				top = 20;
			}
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			if (string.IsNullOrWhiteSpace(gvId))
			{
				return Results.BadRequest(new
				{
					message = "Thi?u gvId"
				});
			}
			string sql = "\r\n      SELECT TOP (@top)\r\n        n.NotificationId, n.Title, n.Message, n.Link, n.EvidenceId, n.StudentId, n.CreatedAt,\r\n        CASE WHEN r.NotificationId IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS IsRead\r\n      FROM dbo.Notifications n\r\n      LEFT JOIN dbo.NotificationReads r\r\n        ON r.NotificationId = n.NotificationId AND r.Recipient = @gv\r\n      WHERE n.Recipient = @gv OR n.Recipient = 'ALL_GIANGVIEN'\r\n      ORDER BY n.CreatedAt DESC;";
			using SqlCommand cmd = new SqlCommand(sql, con);
			cmd.Parameters.AddWithValue("@gv", gvId);
			cmd.Parameters.AddWithValue("@top", top);
			using SqlDataReader rd = await cmd.ExecuteReaderAsync();
			List<object> list = new List<object>();
			while (await rd.ReadAsync())
			{
				list.Add(new
				{
					NotificationId = rd["NotificationId"],
					Title = rd["Title"],
					Message = rd["Message"],
					Link = rd["Link"],
					EvidenceId = rd["EvidenceId"],
					StudentId = rd["StudentId"],
					CreatedAt = rd["CreatedAt"],
					IsRead = (bool)rd["IsRead"]
				});
			}
			return Results.Ok(list);
		});
		app.MapPost("/api/notifications/send", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using JsonDocument doc = await JsonDocument.ParseAsync(req.Body);
				JsonElement root = doc.RootElement;
				JsonElement toEl;
				string to = (root.TryGetProperty("to", out toEl) ? toEl.GetString() : null);
				if (string.IsNullOrWhiteSpace(to))
				{
					return Results.BadRequest(new
					{
						message = "Thi?u tru?ng 'to'"
					});
				}
				JsonElement tEl;
				string title = (root.TryGetProperty("title", out tEl) ? tEl.GetString() : null);
				JsonElement typeEl;
				string type = (root.TryGetProperty("type", out typeEl) ? typeEl.GetString() : null);
				JsonElement mEl;
				string message = (root.TryGetProperty("message", out mEl) ? mEl.GetString() : null);
				JsonElement lEl;
				string link = (root.TryGetProperty("link", out lEl) ? lEl.GetString() : null);
				JsonElement sEl;
				string studentId = (root.TryGetProperty("studentId", out sEl) ? sEl.GetString() : null);
				Guid? evidenceId = null;
				if (root.TryGetProperty("evidenceId", out var eEl) && eEl.ValueKind == JsonValueKind.String && Guid.TryParse(eEl.GetString(), out var g))
				{
					evidenceId = g;
				}
				string finalRecipient = clamp(to.Trim(), 50);
				string finalTitle = clamp((!string.IsNullOrWhiteSpace(title)) ? title : (string.IsNullOrWhiteSpace(type) ? "Th\ufffdng b\ufffdo" : type), 255);
				string finalMsg = message ?? "";
				string finalLink = clamp(link ?? "", 500);
				string finalStudent = (string.IsNullOrWhiteSpace(studentId) ? null : clamp(studentId, 50));
				using (SqlCommand cmd = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, Link, EvidenceId, StudentId) VALUES(@r,@t,@m,@l,@e,@s)", con))
				{
					cmd.Parameters.AddWithValue("@r", finalRecipient);
					cmd.Parameters.AddWithValue("@t", finalTitle);
					cmd.Parameters.AddWithValue("@m", ((object)finalMsg) ?? ((object)DBNull.Value));
					cmd.Parameters.AddWithValue("@l", ((object)finalLink) ?? ((object)DBNull.Value));
					cmd.Parameters.AddWithValue("@e", ((object)evidenceId) ?? DBNull.Value);
					cmd.Parameters.AddWithValue("@s", ((object)finalStudent) ?? ((object)DBNull.Value));
					await cmd.ExecuteNonQueryAsync();
				}
				return Results.Ok(new
				{
					ok = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Ok(new
				{
					ok = false,
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/notifications/{id:guid}/read", (Func<Guid, string, Task<IResult>>)async delegate(Guid id, string gvId)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			string sql = "\r\n      IF NOT EXISTS (SELECT 1 FROM dbo.NotificationReads WHERE NotificationId=@id AND Recipient=@gv)\r\n        INSERT INTO dbo.NotificationReads(NotificationId, Recipient) VALUES(@id, @gv);";
			using SqlCommand cmd = new SqlCommand(sql, con);
			cmd.Parameters.AddWithValue("@id", id);
			cmd.Parameters.AddWithValue("@gv", gvId);
			await cmd.ExecuteNonQueryAsync();
			return Results.Ok(new
			{
				ok = true
			});
		});
		app.MapPost("/api/notifications/delete-read", (Func<string, string, string, Task<IResult>>)async delegate(string? gvId, string? scope, string? user)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationDeletes' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationDeletes (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        DeletedAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationDeletes PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string effScope = scope;
				string effUser = user;
				if (!string.IsNullOrWhiteSpace(gvId) && string.IsNullOrWhiteSpace(scope))
				{
					effScope = "giangvien";
					effUser = gvId;
				}
				if (string.IsNullOrWhiteSpace(effScope) || string.IsNullOrWhiteSpace(effUser))
				{
					return Results.BadRequest(new
					{
						message = "Thi?u scope ho?c user"
					});
				}
				if (string.IsNullOrWhiteSpace(effScope))
				{
					return Results.BadRequest(new
					{
						message = "Scope kh\ufffdng h?p l?"
					});
				}
				string text = effScope.ToLower();
				if (1 == 0)
				{
				}
				string text2 = text switch
				{
					"giangvien" => "ALL_GIANGVIEN", 
					"khoa" => "ALL_KHOA", 
					"truong" => "ALL_TRUONG", 
					"student" => "ALL_STUDENT", 
					_ => null, 
				};
				if (1 == 0)
				{
				}
				string roleAll = text2;
				if (roleAll == null)
				{
					return Results.BadRequest(new
					{
						message = "scope kh\ufffdng h?p l? (giangvien|khoa|truong|student)"
					});
				}
				string sql = "INSERT INTO dbo.NotificationDeletes(NotificationId, Recipient)\r\nSELECT n.NotificationId, @u\r\nFROM dbo.Notifications n\r\nLEFT JOIN dbo.NotificationReads r ON r.NotificationId = n.NotificationId AND r.Recipient=@u\r\nLEFT JOIN dbo.NotificationDeletes d ON d.NotificationId = n.NotificationId AND d.Recipient=@u\r\nWHERE (n.Recipient=@u OR n.Recipient=@all) AND r.NotificationId IS NOT NULL AND d.NotificationId IS NULL";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@u", effUser);
				cmd.Parameters.AddWithValue("@all", roleAll);
				return Results.Ok(new
				{
					deletedRead = await cmd.ExecuteNonQueryAsync(),
					scope = effScope,
					user = effUser
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/notifications/reads", (Func<Guid?, Guid?, string, string, string, Task<IResult>>)async delegate(Guid? id, Guid? evidenceId, string? scope, string? user, string? gvId)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationReads' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationReads (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        ReadAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationReads PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string effUser = user;
				if (string.IsNullOrWhiteSpace(effUser) && !string.IsNullOrWhiteSpace(gvId))
				{
					effUser = gvId;
				}
				int affected = 0;
				if (id.HasValue && !string.IsNullOrWhiteSpace(effUser))
				{
					using SqlCommand cmd = new SqlCommand("IF NOT EXISTS (SELECT 1 FROM dbo.NotificationReads WHERE NotificationId=@id AND Recipient=@u)\r\nINSERT INTO dbo.NotificationReads(NotificationId, Recipient) VALUES(@id, @u);", con);
					cmd.Parameters.AddWithValue("@id", id.Value);
					cmd.Parameters.AddWithValue("@u", effUser);
					affected = await cmd.ExecuteNonQueryAsync();
				}
				else if (evidenceId.HasValue && !string.IsNullOrWhiteSpace(effUser))
				{
					using SqlCommand cmd2 = new SqlCommand("INSERT INTO dbo.NotificationReads(NotificationId, Recipient)\r\nSELECT n.NotificationId, @u\r\nFROM dbo.Notifications n\r\nLEFT JOIN dbo.NotificationReads r ON r.NotificationId = n.NotificationId AND r.Recipient=@u\r\nWHERE n.EvidenceId=@e AND r.NotificationId IS NULL;", con);
					cmd2.Parameters.AddWithValue("@u", effUser);
					cmd2.Parameters.AddWithValue("@e", evidenceId.Value);
					affected = await cmd2.ExecuteNonQueryAsync();
				}
				else if (!string.IsNullOrWhiteSpace(scope) && !string.IsNullOrWhiteSpace(effUser))
				{
					if (string.IsNullOrWhiteSpace(scope))
					{
						return Results.BadRequest(new
						{
							message = "Scope kh\ufffdng h?p l?"
						});
					}
					string text = scope.ToLower();
					if (1 == 0)
					{
					}
					string text2 = text switch
					{
						"giangvien" => "ALL_GIANGVIEN", 
						"khoa" => "ALL_KHOA", 
						"truong" => "ALL_TRUONG", 
						"student" => "ALL_STUDENT", 
						_ => null, 
					};
					if (1 == 0)
					{
					}
					string roleAll = text2;
					if (roleAll == null)
					{
						return Results.BadRequest(new
						{
							message = "scope kh\ufffdng h?p l? (giangvien|khoa|truong|student)"
						});
					}
					using SqlCommand cmd3 = new SqlCommand("INSERT INTO dbo.NotificationReads(NotificationId, Recipient)\r\nSELECT n.NotificationId, @u\r\nFROM dbo.Notifications n\r\nLEFT JOIN dbo.NotificationReads r ON r.NotificationId = n.NotificationId AND r.Recipient=@u\r\nWHERE (n.Recipient=@u OR n.Recipient=@all) AND r.NotificationId IS NULL;", con);
					cmd3.Parameters.AddWithValue("@u", effUser);
					cmd3.Parameters.AddWithValue("@all", roleAll);
					affected = await cmd3.ExecuteNonQueryAsync();
				}
				return Results.Ok(new
				{
					ok = true,
					marked = affected,
					scope = scope,
					user = effUser,
					id = id,
					evidenceId = evidenceId
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Ok(new
				{
					ok = false,
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/student-notifications/count", (Func<string, Task<IResult>>)async delegate(string mssv)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.Notifications (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        Title NVARCHAR(200) NULL,\r\n        Message NVARCHAR(1000) NULL,\r\n        Link NVARCHAR(500) NULL,\r\n        EvidenceId UNIQUEIDENTIFIER NULL,\r\n        StudentId NVARCHAR(50) NULL,\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()\r\n    );\r\nEND\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationReads' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationReads (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        ReadAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationReads PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationDeletes' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationDeletes (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        DeletedAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationDeletes PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con))
			{
				await ensure.ExecuteNonQueryAsync();
			}
			string sql = "\r\n      SELECT COUNT(1)\r\n      FROM dbo.Notifications n\r\n      LEFT JOIN dbo.NotificationReads r\r\n        ON r.NotificationId = n.NotificationId AND r.Recipient = @sv\r\n      LEFT JOIN dbo.NotificationDeletes d\r\n        ON d.NotificationId = n.NotificationId AND d.Recipient = @sv\r\n      WHERE (n.Recipient = @sv OR n.Recipient = 'ALL_STUDENT')\r\n        AND r.NotificationId IS NULL\r\n        AND d.NotificationId IS NULL;";
			using SqlCommand cmd = new SqlCommand(sql, con);
			cmd.Parameters.AddWithValue("@sv", mssv);
			int count = Convert.ToInt32((await cmd.ExecuteScalarAsync()) ?? ((object)0));
			return Results.Ok(new
			{
				unread = count
			});
		});
		app.MapGet("/api/student-notifications", async delegate(string mssv, int? top)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.Notifications (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        Title NVARCHAR(200) NULL,\r\n        Message NVARCHAR(1000) NULL,\r\n        Link NVARCHAR(500) NULL,\r\n        EvidenceId UNIQUEIDENTIFIER NULL,\r\n        StudentId NVARCHAR(50) NULL,\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()\r\n    );\r\nEND\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationReads' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationReads (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        ReadAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationReads PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationDeletes' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationDeletes (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        DeletedAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationDeletes PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con))
			{
				await ensure.ExecuteNonQueryAsync();
			}
			string sql = "\r\n            SELECT TOP (@top)\r\n                n.NotificationId, n.Title, n.Message, n.Link, n.EvidenceId, n.StudentId, n.CreatedAt,\r\n                CASE WHEN r.NotificationId IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS IsRead\r\n            FROM dbo.Notifications n\r\n            LEFT JOIN dbo.NotificationReads r\r\n                ON r.NotificationId = n.NotificationId AND r.Recipient = @sv\r\n            LEFT JOIN dbo.NotificationDeletes d\r\n                ON d.NotificationId = n.NotificationId AND d.Recipient = @sv\r\n            WHERE (n.Recipient = @sv OR n.Recipient = 'ALL_STUDENT')\r\n                AND d.NotificationId IS NULL\r\n            ORDER BY n.CreatedAt DESC;";
			using SqlCommand cmd = new SqlCommand(sql, con);
			cmd.Parameters.AddWithValue("@sv", mssv);
			cmd.Parameters.AddWithValue("@top", top ?? 50);
			using SqlDataReader rd = await cmd.ExecuteReaderAsync();
			List<object> list = new List<object>();
			while (await rd.ReadAsync())
			{
				list.Add(new
				{
					NotificationId = rd["NotificationId"],
					Title = rd["Title"],
					Message = rd["Message"],
					Link = rd["Link"],
					EvidenceId = rd["EvidenceId"],
					StudentId = rd["StudentId"],
					CreatedAt = rd["CreatedAt"],
					IsRead = (bool)rd["IsRead"]
				});
			}
			return Results.Ok(list);
		});
		app.MapPost("/api/student-notifications/{id:guid}/read", (Func<Guid, string, Task<IResult>>)async delegate(Guid id, string mssv)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			string sql = "\r\n      IF NOT EXISTS (SELECT 1 FROM dbo.NotificationReads WHERE NotificationId=@id AND Recipient=@sv)\r\n        INSERT INTO dbo.NotificationReads(NotificationId, Recipient) VALUES(@id, @sv);";
			using SqlCommand cmd = new SqlCommand(sql, con);
			cmd.Parameters.AddWithValue("@id", id);
			cmd.Parameters.AddWithValue("@sv", mssv);
			await cmd.ExecuteNonQueryAsync();
			return Results.Ok(new
			{
				ok = true
			});
		});
		app.MapPost("/api/student-notifications/delete-read", (Func<string, Task<IResult>>)async delegate(string mssv)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationDeletes' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationDeletes (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        DeletedAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationDeletes PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string sql = "INSERT INTO dbo.NotificationDeletes(NotificationId, Recipient)\r\nSELECT n.NotificationId, @sv\r\nFROM dbo.Notifications n\r\nLEFT JOIN dbo.NotificationReads r ON r.NotificationId = n.NotificationId AND r.Recipient=@sv\r\nLEFT JOIN dbo.NotificationDeletes d ON d.NotificationId = n.NotificationId AND d.Recipient=@sv\r\nWHERE (n.Recipient=@sv OR n.Recipient='ALL_STUDENT') AND r.NotificationId IS NOT NULL AND d.NotificationId IS NULL";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@sv", mssv);
				return Results.Ok(new
				{
					deletedRead = await cmd.ExecuteNonQueryAsync()
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapDelete("/api/student-notifications/{id:guid}", (Func<Guid, string, Task<IResult>>)async delegate(Guid id, string mssv)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationDeletes' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationDeletes (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        DeletedAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationDeletes PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string sql = "\r\nIF EXISTS (SELECT 1 FROM dbo.Notifications WHERE NotificationId=@id AND (Recipient=@sv OR Recipient='ALL_STUDENT'))\r\nBEGIN\r\n    IF NOT EXISTS (SELECT 1 FROM dbo.NotificationDeletes WHERE NotificationId=@id AND Recipient=@sv)\r\n        INSERT INTO dbo.NotificationDeletes(NotificationId, Recipient) VALUES(@id, @sv);\r\n    SELECT CAST(1 AS INT);\r\nEND\r\nELSE SELECT CAST(0 AS INT);";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@id", id);
				cmd.Parameters.AddWithValue("@sv", mssv);
				if (Convert.ToInt32((await cmd.ExecuteScalarAsync()) ?? ((object)0)) != 1)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y th\ufffdng b\ufffdo"
					});
				}
				return Results.Ok(new
				{
					deleted = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/student-notifications/mark-all-read", (Func<string, Task<IResult>>)async delegate(string mssv)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationReads' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationReads (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        ReadAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationReads PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con))
			{
				await ensure.ExecuteNonQueryAsync();
			}
			string sql = "\r\n      INSERT INTO dbo.NotificationReads(NotificationId, Recipient)\r\n      SELECT n.NotificationId, @sv\r\n      FROM dbo.Notifications n\r\n      LEFT JOIN dbo.NotificationReads r\r\n        ON r.NotificationId = n.NotificationId AND r.Recipient = @sv\r\n      WHERE (n.Recipient = @sv OR n.Recipient = 'ALL_STUDENT') AND r.NotificationId IS NULL;";
			using SqlCommand cmd = new SqlCommand(sql, con);
			cmd.Parameters.AddWithValue("@sv", mssv);
			return Results.Ok(new
			{
				marked = await cmd.ExecuteNonQueryAsync()
			});
		});
		app.MapPost("/api/student-notifications/read-bulk", (Func<HttpRequest, string, Task<IResult>>)async delegate(HttpRequest req, string mssv)
		{
			try
			{
				Guid[] ids = (await JsonSerializer.DeserializeAsync<Guid[]>(req.Body)) ?? Array.Empty<Guid>();
				if (ids.Length == 0)
				{
					return Results.Ok(new
					{
						marked = 0
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				DataTable table = new DataTable
				{
					Columns = { 
					{
						"Id",
						typeof(Guid)
					} }
				};
				foreach (Guid id in ids.Distinct())
				{
					table.Rows.Add(id);
				}
				using (SqlCommand createTemp = new SqlCommand("IF OBJECT_ID('tempdb..#ids') IS NOT NULL DROP TABLE #ids; CREATE TABLE #ids(Id UNIQUEIDENTIFIER NOT NULL);", con))
				{
					await createTemp.ExecuteNonQueryAsync();
				}
				using (SqlBulkCopy bulk = new SqlBulkCopy(con))
				{
					bulk.DestinationTableName = "#ids";
					await bulk.WriteToServerAsync(table);
				}
				string sql = "\r\n          INSERT INTO dbo.NotificationReads(NotificationId, Recipient)\r\n          SELECT i.Id, @sv FROM #ids i\r\n          WHERE NOT EXISTS (SELECT 1 FROM dbo.NotificationReads r WHERE r.NotificationId=i.Id AND r.Recipient=@sv);";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@sv", mssv);
				return Results.Ok(new
				{
					marked = await cmd.ExecuteNonQueryAsync()
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/student-notifications/delete-bulk", (Func<HttpRequest, string, Task<IResult>>)async delegate(HttpRequest req, string mssv)
		{
			try
			{
				Guid[] ids = (await JsonSerializer.DeserializeAsync<Guid[]>(req.Body)) ?? Array.Empty<Guid>();
				if (ids.Length == 0)
				{
					return Results.Ok(new
					{
						deleted = 0
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				DataTable table = new DataTable
				{
					Columns = { 
					{
						"Id",
						typeof(Guid)
					} }
				};
				foreach (Guid id in ids.Distinct())
				{
					table.Rows.Add(id);
				}
				using (SqlCommand createTemp = new SqlCommand("IF OBJECT_ID('tempdb..#ids') IS NOT NULL DROP TABLE #ids; CREATE TABLE #ids(Id UNIQUEIDENTIFIER NOT NULL);", con))
				{
					await createTemp.ExecuteNonQueryAsync();
				}
				using (SqlBulkCopy bulk = new SqlBulkCopy(con))
				{
					bulk.DestinationTableName = "#ids";
					await bulk.WriteToServerAsync(table);
				}
				string sql = "\r\n          INSERT INTO dbo.NotificationDeletes(NotificationId, Recipient)\r\n          SELECT i.Id, @sv FROM #ids i\r\n          WHERE NOT EXISTS (SELECT 1 FROM dbo.NotificationDeletes d WHERE d.NotificationId=i.Id AND d.Recipient=@sv);";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@sv", mssv);
				return Results.Ok(new
				{
					deleted = await cmd.ExecuteNonQueryAsync()
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/student-notifications/summary", (_003C_003Ef__AnonymousDelegate3<string, int, string, Task<IResult>>)async delegate(string mssv, int top, string? after)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			DateTime? afterDt = null;
			if (!string.IsNullOrWhiteSpace(after))
			{
				if (DateTime.TryParse(after, out var dt))
				{
					afterDt = dt;
				}
				else
				{
					try
					{
						afterDt = DateTime.ParseExact(after, "yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
					}
					catch
					{
						afterDt = null;
					}
				}
			}
			string unreadSql = "\r\n      SELECT COUNT(1)\r\n      FROM dbo.Notifications n\r\n      LEFT JOIN dbo.NotificationReads r\r\n        ON r.NotificationId = n.NotificationId AND r.Recipient = @sv\r\n      LEFT JOIN dbo.NotificationDeletes d\r\n        ON d.NotificationId = n.NotificationId AND d.Recipient = @sv\r\n      WHERE (n.Recipient = @sv OR n.Recipient = 'ALL_STUDENT')\r\n        AND r.NotificationId IS NULL\r\n        AND d.NotificationId IS NULL;";
			using SqlCommand unreadCmd = new SqlCommand(unreadSql, con);
			unreadCmd.Parameters.AddWithValue("@sv", mssv);
			int unread = Convert.ToInt32((await unreadCmd.ExecuteScalarAsync()) ?? ((object)0));
			string itemsSql = "\r\n            SELECT TOP (@top)\r\n                n.NotificationId, n.Title, n.Message, n.Link, n.EvidenceId, n.StudentId, n.CreatedAt,\r\n                CASE WHEN r.NotificationId IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS IsRead\r\n            FROM dbo.Notifications n\r\n            LEFT JOIN dbo.NotificationDeletes d\r\n                ON d.NotificationId = n.NotificationId AND d.Recipient = @sv\r\n            LEFT JOIN dbo.NotificationReads r\r\n                ON r.NotificationId = n.NotificationId AND r.Recipient = @sv\r\n            WHERE (n.Recipient = @sv OR n.Recipient = 'ALL_STUDENT')\r\n                AND d.NotificationId IS NULL\r\n                {0}\r\n            ORDER BY n.CreatedAt DESC;";
			string cursorCond = (afterDt.HasValue ? "AND n.CreatedAt < @after" : string.Empty);
			using SqlCommand itemsCmd = new SqlCommand(string.Format(itemsSql, cursorCond), con);
			itemsCmd.Parameters.AddWithValue("@sv", mssv);
			itemsCmd.Parameters.AddWithValue("@top", top);
			if (afterDt.HasValue)
			{
				itemsCmd.Parameters.AddWithValue("@after", afterDt.Value);
			}
			List<object> items = new List<object>();
			DateTime? last = null;
			using (SqlDataReader rd = await itemsCmd.ExecuteReaderAsync())
			{
				DateTime created;
				DateTime? dateTime2;
				for (; await rd.ReadAsync(); last = dateTime2, items.Add(new
				{
					id = rd["NotificationId"],
					title = rd["Title"],
					message = rd["Message"],
					link = rd["Link"],
					evidenceId = rd["EvidenceId"],
					studentId = rd["StudentId"],
					createdAt = created,
					isRead = (bool)rd["IsRead"]
				}))
				{
					created = (DateTime)rd["CreatedAt"];
					if (last.HasValue)
					{
						DateTime value = created;
						DateTime? dateTime = last;
						if (!(value < dateTime))
						{
							dateTime2 = last;
							continue;
						}
					}
					dateTime2 = created;
				}
			}
			string nextCursor = last?.ToString("o");
			return Results.Ok(new
			{
				unreadCount = unread,
				items = items,
				nextCursor = nextCursor
			});
		});
		app.MapGet("/api/notifications/summary", (_003C_003Ef__AnonymousDelegate4<string, string, int, Task<IResult>>)async delegate(string scope, string user, int top)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				bool isStudent = scope.Equals("student", StringComparison.OrdinalIgnoreCase);
				bool isLecturer = scope.Equals("giangvien", StringComparison.OrdinalIgnoreCase);
				bool isFaculty = scope.Equals("khoa", StringComparison.OrdinalIgnoreCase);
				bool isSchool = scope.Equals("truong", StringComparison.OrdinalIgnoreCase);
				if (!(isStudent || isLecturer || isFaculty || isSchool))
				{
					return Results.BadRequest(new
					{
						message = "scope kh\ufffdng h?p l?"
					});
				}
				using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationReads' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationReads (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        ReadAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationReads PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationDeletes' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationDeletes (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        DeletedAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationDeletes PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string roleAll = (isStudent ? "ALL_STUDENT" : (isLecturer ? "ALL_GIANGVIEN" : (isFaculty ? "ALL_KHOA" : "ALL_TRUONG")));
				string sql = "SELECT TOP (@top)\r\n        n.NotificationId, n.Title, n.Message, n.Link, n.EvidenceId, n.StudentId, n.CreatedAt,\r\n        CASE WHEN r.NotificationId IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS IsRead\r\n          FROM dbo.Notifications n\r\n          LEFT JOIN dbo.NotificationReads r ON r.NotificationId = n.NotificationId AND r.Recipient = @u\r\n          LEFT JOIN dbo.NotificationDeletes d ON d.NotificationId = n.NotificationId AND d.Recipient = @u\r\n          WHERE (n.Recipient=@u OR n.Recipient=@all) AND d.NotificationId IS NULL\r\n          ORDER BY n.CreatedAt DESC";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@u", user);
				cmd.Parameters.AddWithValue("@all", roleAll);
				cmd.Parameters.AddWithValue("@top", top);
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				List<Dictionary<string, object?>> rows = new List<Dictionary<string, object>>();
				while (await rd.ReadAsync())
				{
					Dictionary<string, object?> map = new Dictionary<string, object>();
					for (int i = 0; i < rd.FieldCount; i++)
					{
						map[rd.GetName(i)] = rd.GetValue(i);
					}
					rows.Add(map);
				}
				await rd.CloseAsync();
				string unreadSql = "SELECT COUNT(1) FROM dbo.Notifications n\r\n          LEFT JOIN dbo.NotificationReads r ON r.NotificationId = n.NotificationId AND r.Recipient=@u\r\n          LEFT JOIN dbo.NotificationDeletes d ON d.NotificationId = n.NotificationId AND d.Recipient=@u\r\n          WHERE (n.Recipient=@u OR n.Recipient=@all) AND r.NotificationId IS NULL AND d.NotificationId IS NULL";
				using SqlCommand unreadCmd = new SqlCommand(unreadSql, con);
				unreadCmd.Parameters.AddWithValue("@u", user);
				unreadCmd.Parameters.AddWithValue("@all", roleAll);
				int unread = Convert.ToInt32((await unreadCmd.ExecuteScalarAsync()) ?? ((object)0));
				List<string> order = new List<string> { "Minh ch?ng", "Phi?u \ufffdGRL", "Ho?t d?ng", "Nh?c nh?", "Kh\ufffdc" };
				Dictionary<string, List<object>> groups = new Dictionary<string, List<object>>();
				foreach (Dictionary<string, object> r in rows)
				{
					string grp = Classify(r.GetValueOrDefault("Title")?.ToString(), r.GetValueOrDefault("Message")?.ToString(), r.GetValueOrDefault("EvidenceId"));
					if (!groups.ContainsKey(grp))
					{
						groups[grp] = new List<object>();
					}
					groups[grp].Add(new
					{
						id = r.GetValueOrDefault("NotificationId"),
						title = r.GetValueOrDefault("Title"),
						message = r.GetValueOrDefault("Message"),
						link = r.GetValueOrDefault("Link"),
						evidenceId = r.GetValueOrDefault("EvidenceId"),
						studentId = r.GetValueOrDefault("StudentId"),
						createdAt = r.GetValueOrDefault("CreatedAt"),
						isRead = r.GetValueOrDefault("IsRead")
					});
				}
				var ordered = (from g in order
					where groups.ContainsKey(g)
					select new
					{
						name = g,
						items = groups[g]
					}).ToList();
				return Results.Ok(new
				{
					unreadCount = unread,
					groups = ordered,
					total = rows.Count
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/{id:int}/delete-cbl", (Func<int, HttpContext, Task<IResult>>)async delegate(int id, HttpContext ctx)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			try
			{
				using SqlCommand sel = new SqlCommand("SELECT TOP 1 Id, MSSV, NamHoc, HocKi, Status, ISNULL(LastStatusReason,'') AS LastStatusReason FROM PhieuDanhGia WHERE Id=@id", con);
				sel.Parameters.AddWithValue("@id", id);
				using SqlDataReader rd = await sel.ExecuteReaderAsync();
				if (!(await rd.ReadAsync()))
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y phi?u"
					});
				}
				string mssv = rd["MSSV"].ToString() ?? "";
				string namHoc = rd["NamHoc"].ToString() ?? "";
				int hocKi = Convert.ToInt32(rd["HocKi"]);
				string status = rd["Status"].ToString() ?? "";
				string reason = rd["LastStatusReason"].ToString() ?? "";
				if (!status.StartsWith("Rejected", StringComparison.OrdinalIgnoreCase))
				{
					return Results.BadRequest(new
					{
						message = "Ch? x\ufffda khi phi?u d\ufffd b? t? ch?i. Tr?ng th\ufffdi hi?n t?i: " + status
					});
				}
				await rd.CloseAsync();
				using (SqlCommand del = new SqlCommand("DELETE FROM PhieuDanhGia WHERE Id=@id", con))
				{
					del.Parameters.AddWithValue("@id", id);
					await del.ExecuteNonQueryAsync();
				}
				using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.Notifications (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        Title NVARCHAR(200) NULL,\r\n        Message NVARCHAR(1000) NULL,\r\n        Link NVARCHAR(500) NULL,\r\n        EvidenceId UNIQUEIDENTIFIER NULL,\r\n        StudentId NVARCHAR(50) NULL,\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()\r\n    );\r\nEND\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationReads' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationReads (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        ReadAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationReads PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string title = "Phi?u \ufffdGRL b? x\ufffda \ufffd vui l\ufffdng l?p l?i";
				string msg = $"CB L?p d\ufffd x\ufffda phi?u \ufffdGRL c?a b?n (Nam h?c {namHoc} - HK {hocKi}) do b? t? ch?i. L\ufffd do: {(string.IsNullOrWhiteSpace(reason) ? "(kh\ufffdng c\ufffd)" : reason)}";
				string link = "/index.html#eval";
				using (SqlCommand ins = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, Link, StudentId) VALUES(@r,@t,@m,@l,@sv)", con))
				{
					ins.Parameters.AddWithValue("@r", mssv);
					ins.Parameters.AddWithValue("@t", title);
					ins.Parameters.AddWithValue("@m", msg);
					ins.Parameters.AddWithValue("@l", link);
					ins.Parameters.AddWithValue("@sv", mssv);
					await ins.ExecuteNonQueryAsync();
				}
				try
				{
					await LogAsync(ctx, con, $"CBL_DELETE_PHIEU {id}");
				}
				catch
				{
				}
				return Results.Ok(new
				{
					deleted = true,
					notified = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/preload", (Func<HttpContext, Task<IResult>>)async delegate(HttpContext ctx)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			List<Dictionary<string, object?>> khoa = await QueryAsync(con, "SELECT MaKH, TenKhoa FROM KHOA ORDER BY TenKhoa;", Array.Empty<SqlParameter>());
			List<Dictionary<string, object?>> lop = await QueryAsync(con, "SELECT L.MaLop, L.TenLop, L.MaKH, K.TenKhoa\r\n                                      FROM Lop L\r\n                                      LEFT JOIN KHOA K ON K.MaKH = L.MaKH\r\n                                      ORDER BY L.TenLop;", Array.Empty<SqlParameter>());
			List<Dictionary<string, object?>> khoaHoc = await QueryAsync(con, "SELECT MaKhoa, TenKhoa FROM KhoaHoc ORDER BY MaKhoa;", Array.Empty<SqlParameter>());
			List<Dictionary<string, object?>> hoatDongTruong = await QueryAsync(con, "SELECT MaHD, TenHD, DiemRL, NDHD, NgayBD, NgayKT, SoSvDK, DiaDiem, TUKHOA FROM HoatDongTruong ORDER BY MaHD DESC;", Array.Empty<SqlParameter>());
			string mssvParam = ctx.Request.Query["mssv"].ToString();
			List<Dictionary<string, object?>> studentRegs = new List<Dictionary<string, object>>();
			if (!string.IsNullOrWhiteSpace(mssvParam))
			{
				try
				{
					List<Dictionary<string, object?>> stuRows = await QueryAsync(con, "SELECT TOP 1 MSSV FROM SINHVIEN WHERE MSSV=@id OR MaCaNhan=@id", new SqlParameter[1]
					{
						new SqlParameter("@id", mssvParam.Trim())
					});
					string resolvedMssv = ((stuRows.Count <= 0) ? mssvParam.Trim() : (stuRows[0]["MSSV"]?.ToString() ?? mssvParam.Trim()));
					string sqlRegs = "\r\n                SELECT ar.MaHD, ar.RegisteredAt, ar.Status, hd.TenHD,\r\n                       ISNULL((SELECT TOP 1 Verdict FROM Evidence WHERE StudentId = ar.MSSV AND ActivityName = hd.TenHD AND Status != 'Deleted' ORDER BY UploadedAt DESC), '') AS EvidenceVerdict\r\n                FROM ActivityRegistrations ar\r\n                INNER JOIN HoatDongTruong hd ON ar.MaHD = hd.MaHD\r\n                WHERE ar.MSSV = @mssv\r\n                ORDER BY ar.RegisteredAt DESC";
					studentRegs = await QueryAsync(con, sqlRegs, new SqlParameter[1]
					{
						new SqlParameter("@mssv", resolvedMssv)
					});
				}
				catch
				{
				}
			}
			try
			{
				ctx.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
				ctx.Response.Headers["Pragma"] = "no-cache";
				ctx.Response.Headers["Expires"] = "0";
			}
			catch
			{
			}
			return Results.Ok(new
			{
				khoa = khoa,
				lop = lop,
				khoaHoc = khoaHoc,
				hoatDongTruong = hoatDongTruong,
				studentRegistrations = studentRegs
			});
		});
		app.MapGet("/api/user-info/{maCaNhan}", (Func<string, Task<IResult>>)async delegate(string maCaNhan)
		{
			if (string.IsNullOrWhiteSpace(maCaNhan))
			{
				return Results.BadRequest(new
				{
					error = "maCaNhan required"
				});
			}
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			List<Dictionary<string, object?>> tkRows = await QueryAsync(con, "SELECT TOP 1 MaCaNhan, TenTK, TenNguoiDung, MaQT FROM TK WHERE MaCaNhan=@id OR TenTK=@id", new SqlParameter[1]
			{
				new SqlParameter("@id", maCaNhan.Trim())
			});
			if (tkRows.Count == 0)
			{
				return Results.NotFound(new
				{
					error = "Không tìm thấy tài khoản"
				});
			}
			Dictionary<string, object?> tk = tkRows[0];
			object q;
			string maQT = ((!tk.TryGetValue("MaQT", out q)) ? null : q?.ToString());
			bool isAdmin = !string.IsNullOrWhiteSpace(maQT) && (maQT == "1" || maQT.Equals("admin", StringComparison.OrdinalIgnoreCase));
			bool hasSinhVienInfo = (await QueryAsync(con, "SELECT TOP 1 MSSV FROM SINHVIEN WHERE MSSV=@id OR MaCaNhan=@id", new SqlParameter[1]
			{
				new SqlParameter("@id", maCaNhan.Trim())
			})).Count > 0;
			bool hasGiangVienInfo = (await QueryAsync(con, "SELECT TOP 1 MaCaNhan FROM GiangVien WHERE MaCaNhan=@id", new SqlParameter[1]
			{
				new SqlParameter("@id", maCaNhan.Trim())
			})).Count > 0;
			string infoType;
			bool hasInfo;
			if (isAdmin)
			{
				infoType = "admin";
				hasInfo = true;
			}
			else if (hasGiangVienInfo)
			{
				infoType = "giangvien";
				hasInfo = true;
			}
			else if (hasSinhVienInfo)
			{
				infoType = "sinhvien";
				hasInfo = true;
			}
			else
			{
				infoType = "unknown";
				hasInfo = false;
			}
			object tn;
			return Results.Ok(new
			{
				maCaNhan = maCaNhan.Trim(),
				tenNguoiDung = ((!tk.TryGetValue("TenNguoiDung", out tn)) ? null : tn?.ToString()),
				infoType = infoType,
				hasInfo = hasInfo,
				hasSinhVienInfo = hasSinhVienInfo,
				hasGiangVienInfo = hasGiangVienInfo,
				isAdmin = isAdmin
			});
		});
		app.MapPost("/api/auth/login", (Func<LoginDto, HttpContext, Task<IResult>>)async delegate(LoginDto dto, HttpContext ctx)
		{
			if (string.IsNullOrWhiteSpace(dto.TenTK) || string.IsNullOrWhiteSpace(dto.MatKhau))
			{
				return Results.BadRequest(new
				{
					message = "Thiếu TenTK/MatKhau"
				});
			}
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			string sql = "SELECT t.MaCaNhan, t.TenTK, t.TenNguoiDung, t.MaQT, t.TrangThai,\r\n                       t.PasswordHash, t.PasswordSalt, t.PasswordAlgo,\r\n                       sv.MSSV, sv.TenSV, sv.AnhDD AS AnhDD_bytes\r\n                FROM TK t\r\n                LEFT JOIN SINHVIEN sv ON sv.MaCaNhan = t.MaCaNhan\r\n                WHERE t.TenTK = @u;";
			List<Dictionary<string, object?>> rows = await QueryAsync(con, sql, new SqlParameter[1]
			{
				new SqlParameter("@u", dto.TenTK.Trim())
			});
			if (rows.Count == 0)
			{
				Console.WriteLine("[LOGIN-DEBUG] User not found: " + dto.TenTK);
				return Results.Unauthorized();
			}
			Dictionary<string, object?> user = rows[0];
			Console.WriteLine("[LOGIN-DEBUG] User found: " + dto.TenTK);
			bool passwordValid = false;
			object h;
			string hashB64 = ((!user.TryGetValue("PasswordHash", out h)) ? null : h?.ToString());
			object s;
			string saltB64 = ((!user.TryGetValue("PasswordSalt", out s)) ? null : s?.ToString());
			object a;
			string algo = ((!user.TryGetValue("PasswordAlgo", out a)) ? null : a?.ToString());
			Console.WriteLine($"[LOGIN-DEBUG] Hash exists: {!string.IsNullOrEmpty(hashB64)}, Salt exists: {!string.IsNullOrEmpty(saltB64)}");
			if (!string.IsNullOrEmpty(hashB64) && !string.IsNullOrEmpty(saltB64))
			{
				Console.WriteLine("[LOGIN-DEBUG] Using HASHED password verification");
				passwordValid = VerifyPassword(dto.MatKhau, hashB64, saltB64, algo ?? "PBKDF2-SHA256:100000:32");
				Console.WriteLine($"[LOGIN-DEBUG] Hash verification result: {passwordValid}");
			}
			else
			{
				object p;
				string plainPassword = ((!user.TryGetValue("MatKhau", out p)) ? null : p?.ToString());
				Console.WriteLine("[LOGIN-DEBUG] Using PLAIN TEXT password verification");
				Console.WriteLine($"[LOGIN-DEBUG] Plain password exists: {!string.IsNullOrEmpty(plainPassword)}");
				if (!string.IsNullOrEmpty(plainPassword))
				{
					string plainTrimmed = plainPassword.Trim();
					string inputTrimmed = dto.MatKhau.Trim();
					Console.WriteLine("[LOGIN-DEBUG] Verifying plain-text password (trimmed comparison)");
					if (plainTrimmed == inputTrimmed)
					{
						passwordValid = true;
						Console.WriteLine("[LOGIN-DEBUG] Password matched! Starting auto-upgrade...");
						(string Hash, string Salt, string Algo) newHash = HashPassword(dto.MatKhau);
						string updateSql = "UPDATE TK SET PasswordHash = @h, PasswordSalt = @s, PasswordAlgo = @a WHERE TenTK = @u";
						using SqlCommand updateCmd = new SqlCommand(updateSql, con);
						updateCmd.Parameters.AddWithValue("@h", newHash.Hash);
						updateCmd.Parameters.AddWithValue("@s", newHash.Salt);
						updateCmd.Parameters.AddWithValue("@a", newHash.Algo);
						updateCmd.Parameters.AddWithValue("@u", dto.TenTK.Trim());
						try
						{
							await updateCmd.ExecuteNonQueryAsync();
							Console.WriteLine("[LOGIN-DEBUG] Auto-upgrade successful");
						}
						catch (Exception ex3)
						{
							Exception ex4 = ex3;
							Console.WriteLine("[LOGIN-UPGRADE-ERROR] Failed to upgrade password for " + dto.TenTK + ": " + ex4.Message);
						}
					}
				}
			}
			Console.WriteLine($"[LOGIN-DEBUG] Final passwordValid: {passwordValid}");
			if (!passwordValid)
			{
				return Results.Unauthorized();
			}
			object tt;
			object trangThai = (user.TryGetValue("TrangThai", out tt) ? tt : null);
			if (trangThai == null || !(bool)trangThai)
			{
				return Results.BadRequest(new
				{
					message = "Tài khoản đã bị khóa"
				});
			}
			await LogAsync(ctx, con, "LOGIN", user["MaCaNhan"]?.ToString());
			byte[] anhBytes = default(byte[]);
			int num;
			if (user.TryGetValue("AnhDD_bytes", out object anhRaw))
			{
				anhBytes = anhRaw as byte[];
				if (anhBytes != null)
				{
					num = ((anhBytes.Length != 0) ? 1 : 0);
					goto IL_07ef;
				}
			}
			num = 0;
			goto IL_07ef;
			IL_07ef:
			if (num != 0)
			{
				user["AnhDD"] = Convert.ToBase64String(anhBytes);
			}
			else
			{
				user["AnhDD"] = null;
			}
			user.Remove("AnhDD_bytes");
			if (!user.ContainsKey("MSSV") || user["MSSV"] == null)
			{
				user["MSSV"] = (user.TryGetValue("MaCaNhan", out object mc) ? mc : null);
			}
			return Results.Ok(user);
		});
		app.MapPost("/api/auth/logout", (Func<HttpContext, Task<IResult>>)async delegate(HttpContext ctx)
		{
			try
			{
				foreach (string key in ctx.Request.Cookies.Keys)
				{
					ctx.Response.Cookies.Delete(key);
				}
			}
			catch
			{
			}
			return Results.Ok(new
			{
				message = "Logged out"
			});
		});
		app.MapPost("/api/test/password-debug", (Func<string, string, Task<IResult>>)async delegate(string username, string password)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "SELECT MaCaNhan, TenTK, PasswordHash, PasswordSalt, PasswordAlgo \r\n                   FROM TK WHERE TenTK = @u";
				List<Dictionary<string, object?>> rows = await QueryAsync(con, sql, new SqlParameter[1]
				{
					new SqlParameter("@u", username.Trim())
				});
				if (rows.Count == 0)
				{
					return Results.Ok(new
					{
						error = "User not found"
					});
				}
				Dictionary<string, object?> user = rows[0];
				object h;
				string hashB64 = ((!user.TryGetValue("PasswordHash", out h)) ? null : h?.ToString());
				object s;
				string saltB64 = ((!user.TryGetValue("PasswordSalt", out s)) ? null : s?.ToString());
				object a;
				string algo = ((!user.TryGetValue("PasswordAlgo", out a)) ? null : a?.ToString());
				object p;
				string plainPassword = ((!user.TryGetValue("MatKhau", out p)) ? null : p?.ToString());
				bool hashValid = false;
				bool plainValid = false;
				if (!string.IsNullOrEmpty(hashB64) && !string.IsNullOrEmpty(saltB64))
				{
					hashValid = VerifyPassword(password, hashB64, saltB64, algo ?? "PBKDF2-SHA256:100000:32");
				}
				if (!string.IsNullOrEmpty(plainPassword))
				{
					plainValid = plainPassword == password || plainPassword == password.Trim();
				}
				return Results.Ok(new
				{
					username = username,
					hashedPassword = !string.IsNullOrEmpty(hashB64),
					plainTextPassword = !string.IsNullOrEmpty(plainPassword),
					plainPasswordValue = plainPassword,
					inputLength = password.Length,
					inputTrimmedLength = password.Trim().Length,
					hashValid = hashValid,
					plainValid = plainValid,
					finalResult = (hashValid || plainValid),
					message = (hashValid ? "Hash valid" : (plainValid ? "Plain text valid" : "Password invalid"))
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/sinhvien/{mssv}", (Func<string, Task<IResult>>)async delegate(string mssv)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			string sql = "\r\nSELECT SV.MSSV, SV.TenSV, SV.SDT, SV.Email, SV.DiaChi, SV.MaLop, SV.MaKhoa, SV.AnhDD,\r\n       SV.CBLop, SV.TVCLBKhoa, SV.TVCLBTruong,\r\n       L.MaKH AS MaKH, L.TenLop, K.TenKhoa, KH.TenKhoa as TenKhoaHoc\r\nFROM SINHVIEN SV\r\nLEFT JOIN Lop L ON L.MaLop = SV.MaLop\r\nLEFT JOIN KHOA K ON K.MaKH = L.MaKH\r\nLEFT JOIN KhoaHoc KH ON KH.MaKhoa = SV.MaKhoa\r\nWHERE SV.MSSV = @mssv;";
			List<Dictionary<string, object?>> rows = await QueryAsync(con, sql, new SqlParameter[1]
			{
				new SqlParameter("@mssv", mssv.Trim())
			});
			if (rows.Count == 0)
			{
				return Results.NotFound();
			}
			Dictionary<string, object?> row = rows[0];
			try
			{
				List<Dictionary<string, object?>> colChk = await QueryAsync(con, "SELECT COL_LENGTH('dbo.SINHVIEN','NCKH') AS L", Array.Empty<SqlParameter>());
				bool hasCol = false;
				if (colChk.Count > 0)
				{
					object lv;
					object L = (colChk[0].TryGetValue("L", out lv) ? lv : null);
					hasCol = L != null && L != DBNull.Value;
				}
				if (hasCol)
				{
					List<Dictionary<string, object?>> rN = await QueryAsync(con, "SELECT TOP 1 NCKH FROM SINHVIEN WHERE MSSV=@m", new SqlParameter[1]
					{
						new SqlParameter("@m", mssv.Trim())
					});
					if (rN.Count > 0 && rN[0].TryGetValue("NCKH", out object v) && v != null)
					{
						row["ThamGiaNCKH"] = ((v is bool b) ? b : (Convert.ToInt32(v) != 0));
					}
				}
				if (!row.ContainsKey("ThamGiaNCKH") || row["ThamGiaNCKH"] == null)
				{
					List<Dictionary<string, object?>> r2 = await QueryAsync(con, "SELECT TOP 1 TGNCKH FROM LUUTRUDIEMSV WHERE MSSV=@m ORDER BY NamHoc DESC, HocKi DESC", new SqlParameter[1]
					{
						new SqlParameter("@m", mssv.Trim())
					});
					if (r2.Count > 0)
					{
						object v2 = (r2[0].ContainsKey("TGNCKH") ? r2[0]["TGNCKH"] : null);
						if (v2 != null)
						{
							row["ThamGiaNCKH"] = ((v2 is bool bb) ? bb : (Convert.ToInt32(v2) != 0));
						}
					}
				}
			}
			catch
			{
			}
			byte[] bytes = default(byte[]);
			int num;
			if (row.TryGetValue("AnhDD", out object bin))
			{
				bytes = bin as byte[];
				num = ((bytes != null) ? 1 : 0);
			}
			else
			{
				num = 0;
			}
			if (num != 0)
			{
				row["AnhDD"] = Convert.ToBase64String(bytes);
			}
			return Results.Ok(row);
		});
		app.MapPut("/api/sinhvien/{mssv}", (Func<string, UpdateSinhVienDto, Task<IResult>>)async delegate(string mssv, UpdateSinhVienDto dto)
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			string sql = "\r\nUPDATE SINHVIEN\r\nSET\r\n    SDT = COALESCE(@SDT, SDT),\r\n    DiaChi = COALESCE(@DiaChi, DiaChi)\r\nWHERE MSSV = @MSSV;";
			using SqlCommand cmd = new SqlCommand(sql, con);
			cmd.Parameters.AddRange(new SqlParameter[3]
			{
				new SqlParameter("@SDT", ((object)dto.SDT) ?? ((object)DBNull.Value)),
				new SqlParameter("@DiaChi", ((object)dto.DiaChi) ?? ((object)DBNull.Value)),
				new SqlParameter("@MSSV", mssv.Trim())
			});
			if (await cmd.ExecuteNonQueryAsync() == 0)
			{
				using (SqlCommand chkCmd = new SqlCommand("SELECT 1 FROM SINHVIEN WHERE MSSV = @MSSV", con))
				{
					chkCmd.Parameters.Add(new SqlParameter("@MSSV", mssv.Trim()));
					if (await chkCmd.ExecuteScalarAsync() != null)
					{
						return Results.NoContent();
					}
					return Results.NotFound();
				}
			}
			return Results.NoContent();
		});
		app.MapGet("/api/sinhvien/{mssv}/avatar", (Func<string, ILogger<Program>, Task<IResult>>)async delegate(string mssv, ILogger<Program> log)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				byte[] imageBytes = null;
				using (SqlCommand cmd = new SqlCommand("SELECT AnhDD FROM SINHVIEN WHERE MSSV = @m", con))
				{
					cmd.Parameters.Add("@m", SqlDbType.Char, 11).Value = mssv.Trim();
					using SqlDataReader reader = await cmd.ExecuteReaderAsync();
					if (await reader.ReadAsync())
					{
						object anhDD = reader["AnhDD"];
						if (anhDD != null && anhDD != DBNull.Value)
						{
							imageBytes = (byte[])anhDD;
						}
					}
				}
				if (imageBytes == null || imageBytes.Length == 0)
				{
					using SqlCommand cmd2 = new SqlCommand("SELECT FaceImage FROM StudentFaceData WHERE MSSV = @m", con);
					cmd2.Parameters.Add("@m", SqlDbType.Char, 11).Value = mssv.Trim();
					using SqlDataReader reader2 = await cmd2.ExecuteReaderAsync();
					if (await reader2.ReadAsync())
					{
						object faceImage = reader2["FaceImage"];
						if (faceImage != null && faceImage != DBNull.Value)
						{
							imageBytes = (byte[])faceImage;
						}
					}
				}
				if (imageBytes == null || imageBytes.Length == 0)
				{
					log.LogWarning("[AVATAR-GET] No avatar found for {MSSV}", mssv);
					return Results.NotFound(new
					{
						message = "Avatar not found"
					});
				}
				string mimeType = "image/jpeg";
				if (imageBytes.Length >= 4)
				{
					if (imageBytes[0] == 137 && imageBytes[1] == 80 && imageBytes[2] == 78 && imageBytes[3] == 71)
					{
						mimeType = "image/png";
					}
					else if (imageBytes[0] == 82 && imageBytes[1] == 73 && imageBytes[2] == 70 && imageBytes[3] == 70)
					{
						mimeType = "image/webp";
					}
					else if (imageBytes.Length >= 12 && imageBytes[4] == 102 && imageBytes[5] == 116 && imageBytes[6] == 121 && imageBytes[7] == 112)
					{
						try
						{
							string fourCC = Encoding.ASCII.GetString(imageBytes, 8, 4);
							if (fourCC.Contains("heic") || fourCC.Contains("heix"))
							{
								mimeType = "image/heic";
							}
							else if (fourCC.Contains("hevc") || fourCC.Contains("hevx"))
							{
								mimeType = "image/hevc";
							}
						}
						catch
						{
						}
					}
				}
				log.LogInformation("[AVATAR-GET] ✅ Avatar loaded for {MSSV}, size={Size}, type={Type}", mssv, imageBytes.Length, mimeType);
				return Results.File(imageBytes, mimeType, mssv + "_avatar");
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				log.LogError(ex4, "[AVATAR-GET] ❌ Error loading avatar for {MSSV}", mssv);
				int? statusCode = 500;
				return Results.Problem(ex4.Message, null, statusCode, "Load avatar failed");
			}
		});
		app.MapPost("/api/sinhvien/{mssv}/avatar", (Func<HttpRequest, string, ILogger<Program>, Task<IResult>>)async delegate(HttpRequest req, string mssv, ILogger<Program> log)
		{
			try
			{
				if (!req.HasFormContentType)
				{
					return Results.BadRequest(new
					{
						message = "FormData required"
					});
				}
				IFormFile file = (await req.ReadFormAsync()).Files["file"];
				if (file == null || file.Length == 0)
				{
					return Results.BadRequest(new
					{
						message = "No file"
					});
				}
				log.LogInformation("[AVATAR-UPLOAD] Uploading avatar for {MSSV}, ContentType={CT}, Size={Size}", mssv, file.ContentType, file.Length);
				if (file.Length > 10485760)
				{
					return Results.BadRequest(new
					{
						message = "File quá lớn (tối đa 10MB)"
					});
				}
				IResult result;
				await using (MemoryStream ms = new MemoryStream())
				{
					await file.CopyToAsync(ms);
					byte[] bytes = ms.ToArray();
					if (!IsValidImageBytes(bytes))
					{
						result = Results.BadRequest(new
						{
							message = "File không phải hình ảnh hợp lệ (hỗ trợ JPEG, PNG, WebP, GIF, BMP, TIFF, HEIC)"
						});
					}
					else
					{
						if (bytes.Length >= 12 && bytes[4] == 102 && bytes[5] == 116 && bytes[6] == 121 && bytes[7] == 112)
						{
							string fourCC = Encoding.ASCII.GetString(bytes, 8, 4);
							if (fourCC.Contains("hei") || fourCC.Contains("hev"))
							{
								log.LogInformation("[AVATAR-UPLOAD] HEIC format detected: {FourCC}, requesting conversion from AI Service...", fourCC);
								try
								{
									using HttpClient client = new HttpClient
									{
										Timeout = TimeSpan.FromSeconds(30L)
									};
									ByteArrayContent content = new ByteArrayContent(bytes);
									content.Headers.ContentType = new MediaTypeHeaderValue("image/heic");
									HttpResponseMessage response = await client.PostAsync("http://localhost:7001/convert/heic-to-jpg", content);
									if (response.IsSuccessStatusCode)
									{
										bytes = await response.Content.ReadAsByteArrayAsync();
										log.LogInformation("[AVATAR-UPLOAD] ✅ HEIC converted to JPG via AI Service, new size={NewSize} bytes", bytes.Length);
									}
									else
									{
										log.LogWarning("[AVATAR-UPLOAD] ⚠\ufe0f AI Service conversion returned {StatusCode}, using original", response.StatusCode);
									}
								}
								catch (Exception ex3)
								{
									Exception convertEx = ex3;
									log.LogWarning("[AVATAR-UPLOAD] ⚠\ufe0f HEIC conversion via AI Service failed: {Error}, using original", convertEx.Message);
								}
							}
						}
						using SqlConnection con = new SqlConnection(connStr);
						await con.OpenAsync();
						string sql = "UPDATE SINHVIEN SET AnhDD = @bin WHERE MSSV = @m";
						using (SqlCommand cmd = new SqlCommand(sql, con))
						{
							cmd.Parameters.Add("@bin", SqlDbType.VarBinary, -1).Value = bytes;
							cmd.Parameters.Add(new SqlParameter("@m", mssv.Trim()));
							if (await cmd.ExecuteNonQueryAsync() != 0)
							{
								goto end_IL_06c6;
							}
							result = Results.NotFound(new
							{
								message = "Sinh viên không tồn tại"
							});
							goto end_IL_0690;
							end_IL_06c6:;
						}
						try
						{
							using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='StudentFaceData' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE StudentFaceData (\r\n        MSSV CHAR(11) PRIMARY KEY,\r\n        FaceImage VARBINARY(MAX) NOT NULL,\r\n        CreatedAt DATETIME DEFAULT GETDATE(),\r\n        UpdatedAt DATETIME DEFAULT GETDATE()\r\n    );\r\nEND", con))
							{
								await ensure.ExecuteNonQueryAsync();
							}
							using SqlCommand upsert = new SqlCommand("\r\nIF EXISTS (SELECT 1 FROM StudentFaceData WHERE MSSV = @m)\r\n    UPDATE StudentFaceData SET FaceImage = @img, UpdatedAt = GETDATE() WHERE MSSV = @m\r\nELSE\r\n    INSERT INTO StudentFaceData (MSSV, FaceImage, CreatedAt, UpdatedAt) VALUES (@m, @img, GETDATE(), GETDATE())", con);
							upsert.Parameters.Add("@m", SqlDbType.Char, 11).Value = mssv.Trim();
							upsert.Parameters.Add("@img", SqlDbType.VarBinary, -1).Value = bytes;
							await upsert.ExecuteNonQueryAsync();
							log.LogInformation("[AVATAR-UPLOAD] ✅ Avatar updated for {MSSV}, size={Size} bytes", mssv, bytes.Length);
						}
						catch (Exception ex4)
						{
							log.LogWarning("[AVATAR-UPLOAD] ⚠\ufe0f StudentFaceData update failed: {Error}", ex4.Message);
						}
						string mimeType = GetMimeType(bytes);
						result = Results.Ok(new
						{
							ok = true,
							message = "Avatar được cập nhật thành công",
							mssv = mssv.Trim(),
							size = bytes.Length,
							mimeType = mimeType,
							originalContentType = file.ContentType,
							fileName = file.FileName,
							base64 = "data:" + mimeType + ";base64," + Convert.ToBase64String(bytes)
						});
						end_IL_0690:;
					}
				}
				return result;
			}
			catch (Exception ex3)
			{
				Exception ex5 = ex3;
				log.LogError(ex5, "[AVATAR-UPLOAD] ❌ Error uploading avatar for {MSSV}", mssv);
				int? statusCode = 500;
				return Results.Problem(ex5.Message, null, statusCode, "Upload avatar failed");
			}
			bool IsValidImageBytes(byte[] data)
			{
				if (data.Length < 2)
				{
					return false;
				}
				if (data[0] == byte.MaxValue && data[1] == 216 && data[2] == byte.MaxValue)
				{
					log.LogInformation("[AVATAR-UPLOAD] Detected JPEG format");
					return true;
				}
				if (data[0] == 137 && data[1] == 80 && data[2] == 78 && data[3] == 71)
				{
					log.LogInformation("[AVATAR-UPLOAD] Detected PNG format");
					return true;
				}
				if (data[0] == 82 && data[1] == 73 && data[2] == 70 && data[3] == 70 && data.Length >= 12 && data[8] == 87 && data[9] == 69 && data[10] == 66 && data[11] == 80)
				{
					log.LogInformation("[AVATAR-UPLOAD] Detected WebP format");
					return true;
				}
				if (data[0] == 71 && data[1] == 73 && data[2] == 70 && data[3] == 56)
				{
					log.LogInformation("[AVATAR-UPLOAD] Detected GIF format");
					return true;
				}
				if (data[0] == 66 && data[1] == 77)
				{
					log.LogInformation("[AVATAR-UPLOAD] Detected BMP format");
					return true;
				}
				if ((data[0] == 73 && data[1] == 73 && data[2] == 42 && data[3] == 0) || (data[0] == 77 && data[1] == 77 && data[2] == 0 && data[3] == 42))
				{
					log.LogInformation("[AVATAR-UPLOAD] Detected TIFF format");
					return true;
				}
				if (data.Length >= 12 && data[4] == 102 && data[5] == 116 && data[6] == 121 && data[7] == 112)
				{
					string text = Encoding.ASCII.GetString(data, 8, 4);
					if (text.Contains("hei") || text.Contains("hev"))
					{
						log.LogInformation("[AVATAR-UPLOAD] Detected HEIC/HEIF format: {FourCC}", text);
						return true;
					}
				}
				log.LogWarning("[AVATAR-UPLOAD] Unknown image format, hex={Hex}", BitConverter.ToString(data, 0, Math.Min(16, data.Length)));
				return false;
			}
		});
		app.MapGet("/api/sinhvien/{mssv}/diem", (_003C_003Ef__AnonymousDelegate5<HttpContext, string, string, int?, Task<IResult>>)async delegate(HttpContext ctx, string mssv, string? namHoc, int? hocKi)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				try
				{
					string gv = ctx.Request.Headers["X-User"].FirstOrDefault();
					if (!string.IsNullOrWhiteSpace(gv))
					{
						string maLopSv = (await QueryAsync(con, "SELECT MaLop FROM SINHVIEN WHERE MSSV=@m", new SqlParameter[1]
						{
							new SqlParameter("@m", mssv.Trim())
						})).FirstOrDefault()?["MaLop"]?.ToString();
						if (!string.IsNullOrWhiteSpace(maLopSv))
						{
							HashSet<string> allowed = await GetLecturerClassesByLopCVAsync(con, gv);
							if (allowed.Count == 0 || !allowed.Contains(maLopSv))
							{
								return Results.StatusCode(403);
							}
						}
					}
				}
				catch
				{
				}
				string sql = "\r\nSELECT MSSV, Khoas, HocKi, DiemTBM_4, DiemTBM_10, TongDRL, NamHoc, viphamNT, viphamXH, TGNCKH\r\nFROM LUUTRUDIEMSV \r\nWHERE MSSV = @mssv";
				List<SqlParameter> parameters = new List<SqlParameter>
				{
					new SqlParameter("@mssv", mssv.Trim())
				};
				int? namHocInt = null;
				if (!string.IsNullOrWhiteSpace(namHoc))
				{
					if (int.TryParse(namHoc, out var nInt))
					{
						namHocInt = nInt;
					}
					else
					{
						Match m = Regex.Match(namHoc, "^(\\d{4})-(\\d{4})$");
						if (m.Success && int.TryParse(m.Groups[2].Value, out var y2))
						{
							namHocInt = y2;
						}
					}
				}
				if (namHocInt.HasValue)
				{
					sql += " AND NamHoc = @namHoc";
					parameters.Add(new SqlParameter("@namHoc", namHocInt.Value));
				}
				if (hocKi.HasValue)
				{
					sql += " AND HocKi = @hocKi";
					parameters.Add(new SqlParameter("@hocKi", hocKi.Value));
				}
				sql += " ORDER BY NamHoc DESC, HocKi DESC";
				return Results.Ok(await QueryAsync(con, sql, parameters.ToArray()));
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/test/diem-table", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if ((await QueryAsync(con, "\r\n            SELECT COUNT(*) as count \r\n            FROM INFORMATION_SCHEMA.TABLES \r\n            WHERE TABLE_NAME = 'LUUTRUDIEMSV'", Array.Empty<SqlParameter>()))[0]["count"]?.ToString() == "0")
				{
					return Results.BadRequest(new
					{
						error = "Table LUUTRUDIEMSV does not exist"
					});
				}
				List<Dictionary<string, object?>> sampleData = await QueryAsync(con, "SELECT TOP 5 * FROM LUUTRUDIEMSV", Array.Empty<SqlParameter>());
				return Results.Ok(new
				{
					tableExists = true,
					sampleData = sampleData,
					totalRecords = sampleData.Count
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/luutrudiemsv/ranking", (Func<HttpContext, Task<IResult>>)async delegate(HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if ((await QueryAsync(con, "\r\n            SELECT COUNT(*) as count \r\n            FROM INFORMATION_SCHEMA.TABLES \r\n            WHERE TABLE_NAME = 'LUUTRUDIEMSV'", Array.Empty<SqlParameter>()))[0]["count"]?.ToString() == "0")
				{
					return Results.Ok(new
					{
						success = false,
						message = "B?ng LUUTRUDIEMSV chua t?n t?i trong co s? d? li?u",
						total = 0,
						data = Array.Empty<object>()
					});
				}
				string baseSql = "SELECT \r\n                L.MSSV,\r\n                S.TenSV,\r\n                S.AnhDD,\r\n                L.Khoas,\r\n                L.HocKi,\r\n                L.DiemTBM_4,\r\n                L.DiemTBM_10,\r\n                L.TongDRL,\r\n                L.NamHoc,\r\n                L.viphamNT,\r\n                L.viphamXH,\r\n                L.TGNCKH,\r\n                LP.TenLop,\r\n                K.TenKhoa\r\n            FROM LUUTRUDIEMSV L\r\n            LEFT JOIN SINHVIEN S ON S.MSSV = L.MSSV\r\n            LEFT JOIN Lop LP ON LP.MaLop = S.MaLop\r\n            LEFT JOIN KHOA K ON K.MaKH = S.MaKH\r\n            WHERE L.TongDRL IS NOT NULL";
				List<SqlParameter> parameters = new List<SqlParameter>();
				try
				{
					string gv = ctx.Request.Headers["X-User"].FirstOrDefault();
					if (!string.IsNullOrWhiteSpace(gv))
					{
						HashSet<string> allowed = await GetLecturerClassesByLopCVAsync(con, gv);
						if (allowed.Count == 0)
						{
							return Results.Ok(Array.Empty<object>());
						}
						List<string> inParts = new List<string>();
						List<string> list = allowed.ToList();
						for (int i = 0; i < list.Count; i++)
						{
							string pname = "@cls" + i;
							inParts.Add(pname);
							parameters.Add(new SqlParameter(pname, list[i]));
						}
						baseSql = baseSql + " AND S.MaLop IN (" + string.Join(",", inParts) + ")";
					}
				}
				catch
				{
				}
				baseSql += " ORDER BY L.TongDRL DESC, L.DiemTBM_10 DESC";
				List<Dictionary<string, object?>> rankingData = await QueryAsync(con, baseSql, parameters.ToArray());
				byte[] bytes = default(byte[]);
				foreach (Dictionary<string, object> row in rankingData)
				{
					int num;
					if (row.TryGetValue("AnhDD", out var bin))
					{
						bytes = bin as byte[];
						num = ((bytes != null) ? 1 : 0);
					}
					else
					{
						num = 0;
					}
					if (num != 0)
					{
						row["AnhDD"] = Convert.ToBase64String(bytes);
					}
					bin = null;
					bytes = null;
				}
				return Results.Ok(rankingData);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.Ok(new
				{
					success = false,
					message = "L?i server: " + ex4.Message,
					total = 0,
					data = Array.Empty<object>()
				});
			}
		});
		app.MapGet("/api/sinhvien", (_003C_003Ef__AnonymousDelegate6<HttpContext, string, string, string, Task<IResult>>)async delegate(HttpContext ctx, string? search, string? maLop, string? maKhoa)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "\r\nSELECT SV.MSSV, SV.TenSV, SV.SDT, SV.Email, SV.DiaChi, SV.MaLop, SV.MaKH, SV.AnhDD,\r\n       SV.CBLop, SV.TVCLBKhoa, SV.TVCLBTruong,\r\n       L.TenLop, K.TenKhoa\r\nFROM SINHVIEN SV\r\nLEFT JOIN Lop L ON L.MaLop = SV.MaLop\r\nLEFT JOIN KHOA K ON K.MaKH = SV.MaKH\r\nWHERE 1=1";
				List<SqlParameter> parameters = new List<SqlParameter>();
				try
				{
					string gv = ctx.Request.Headers["X-User"].FirstOrDefault();
					if (!string.IsNullOrWhiteSpace(gv))
					{
						HashSet<string> allowed = await GetLecturerClassesByLopCVAsync(con, gv);
						if (allowed.Count == 0)
						{
							return Results.Ok(Array.Empty<object>());
						}
						List<string> inParts = new List<string>();
						List<string> list = allowed.ToList();
						for (int i = 0; i < list.Count; i++)
						{
							string pname = "@cls" + i;
							inParts.Add(pname);
							parameters.Add(new SqlParameter(pname, list[i]));
						}
						sql = sql + " AND SV.MaLop IN (" + string.Join(",", inParts) + ")";
					}
				}
				catch
				{
				}
				if (!string.IsNullOrWhiteSpace(search))
				{
					sql += " AND (SV.MSSV LIKE @search OR SV.TenSV LIKE @search)";
					parameters.Add(new SqlParameter("@search", "%" + search.Trim() + "%"));
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
				List<Dictionary<string, object?>> students = await QueryAsync(con, sql, parameters.ToArray());
				byte[] bytes = default(byte[]);
				foreach (Dictionary<string, object> student in students)
				{
					int num;
					if (student.TryGetValue("AnhDD", out var bin))
					{
						bytes = bin as byte[];
						num = ((bytes != null) ? 1 : 0);
					}
					else
					{
						num = 0;
					}
					if (num != 0)
					{
						student["AnhDD"] = Convert.ToBase64String(bytes);
					}
					bin = null;
					bytes = null;
				}
				return Results.Ok(students);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting students: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/users", (Func<string, string, string, string, string, string, Task<IResult>>)async delegate(string? search, string? filterType, string? chucVu, string? lop, string? khoa, string? khoahoc)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "\r\nSELECT TK.MaCaNhan, TK.TenTK, TK.TenNguoiDung, TK.MaQT, QT.TenCAP AS ChucVu, TK.TrangThai\r\nFROM TK\r\nLEFT JOIN QuanTri QT ON QT.MaQT = TK.MaQT\r\nWHERE 1=1";
				List<SqlParameter> prms = new List<SqlParameter>();
				if (!string.IsNullOrWhiteSpace(search))
				{
					sql += " AND (TK.TenTK LIKE @search OR TK.TenNguoiDung LIKE @search)";
					prms.Add(new SqlParameter("@search", "%" + search.Trim() + "%"));
				}
				if (!string.IsNullOrWhiteSpace(filterType))
				{
					switch (filterType.ToLower())
					{
					case "chucvu":
						if (!string.IsNullOrWhiteSpace(chucVu))
						{
							sql += " AND TK.MaQT IN (SELECT MaQT FROM QuanTri WHERE TenCAP = @chucVu)";
							prms.Add(new SqlParameter("@chucVu", chucVu.Trim()));
						}
						break;
					case "lop":
						if (!string.IsNullOrWhiteSpace(lop))
						{
							sql += " AND TK.MaCaNhan IN (\r\n                            SELECT SV.MSSV FROM SINHVIEN SV WHERE SV.MaLop = @lop\r\n                        )";
							prms.Add(new SqlParameter("@lop", lop.Trim()));
						}
						break;
					case "khoa":
						if (!string.IsNullOrWhiteSpace(khoa))
						{
							sql += " AND (\r\n                            TK.MaCaNhan IN (SELECT SV.MSSV FROM SINHVIEN SV WHERE SV.MaKH = @khoa) OR\r\n                            TK.MaCaNhan IN (SELECT GV.MaCaNhan FROM GiangVien GV WHERE GV.MaKH = @khoa)\r\n                        )";
							prms.Add(new SqlParameter("@khoa", khoa.Trim()));
						}
						break;
					case "khoahoc":
						if (!string.IsNullOrWhiteSpace(khoahoc))
						{
							sql += " AND TK.MaCaNhan IN (\r\n                            SELECT SV.MSSV FROM SINHVIEN SV WHERE SV.MaKhoa = @khoahoc\r\n                        )";
							prms.Add(new SqlParameter("@khoahoc", khoahoc.Trim()));
						}
						break;
					}
				}
				sql += " ORDER BY TK.MaCaNhan";
				return Results.Ok(await QueryAsync(con, sql, prms.ToArray()));
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting users: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/users/{maCaNhan}/password", (Func<string, ChangePasswordDto, Task<IResult>>)async delegate(string maCaNhan, ChangePasswordDto dto)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(dto.NewPassword))
				{
					return Results.BadRequest(new
					{
						message = "Thi?u m?t kh?u m?i"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<Dictionary<string, object?>> userRows = await QueryAsync(con, "SELECT TOP 1 PasswordHash, PasswordSalt, PasswordAlgo FROM TK WHERE MaCaNhan = @m OR TenTK = @m", new SqlParameter[1]
				{
					new SqlParameter("@m", maCaNhan.Trim())
				});
				if (userRows.Count == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y ngu?i d\ufffdng"
					});
				}
				Dictionary<string, object?> user = userRows[0];
				if (!string.IsNullOrEmpty(dto.OldPassword))
				{
					object h;
					string hashB64 = ((!user.TryGetValue("PasswordHash", out h)) ? null : h?.ToString());
					object s;
					string saltB64 = ((!user.TryGetValue("PasswordSalt", out s)) ? null : s?.ToString());
					object a;
					string algo = ((!user.TryGetValue("PasswordAlgo", out a)) ? null : a?.ToString());
					if (!string.IsNullOrEmpty(hashB64) && !string.IsNullOrEmpty(saltB64))
					{
						if (!VerifyPassword(dto.OldPassword, hashB64, saltB64, algo ?? "PBKDF2-SHA256:100000:32"))
						{
							return Results.BadRequest(new
							{
								message = "M?t kh?u cu kh\ufffdng d\ufffdng"
							});
						}
					}
					else
					{
						object op;
						string oldPass = ((!user.TryGetValue("MatKhau", out op)) ? null : op?.ToString());
						if (string.IsNullOrEmpty(oldPass) || (oldPass != dto.OldPassword && oldPass != dto.OldPassword.Trim()))
						{
							return Results.BadRequest(new
							{
								message = "M?t kh?u cu kh\ufffdng d\ufffdng"
							});
						}
					}
				}
				(string Hash, string Salt, string Algo) newHash = HashPassword(dto.NewPassword);
				DateTime now = DateTime.UtcNow;
				string sql = "UPDATE TK SET PasswordHash = @h, PasswordSalt = @s, PasswordAlgo = @a, UpdatedAt = @u \r\n                   WHERE MaCaNhan = @m OR TenTK = @m";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@h", newHash.Hash);
				cmd.Parameters.AddWithValue("@s", newHash.Salt);
				cmd.Parameters.AddWithValue("@a", newHash.Algo);
				cmd.Parameters.AddWithValue("@u", now);
				cmd.Parameters.AddWithValue("@m", maCaNhan.Trim());
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y ngu?i d\ufffdng"
					});
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "CHANGE_PASSWORD " + maCaNhan);
				return Results.NoContent();
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error changing password: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/admin/users/{maCaNhan}/reset-password", (Func<string, AdminResetPasswordDto, Task<IResult>>)async delegate(string maCaNhan, AdminResetPasswordDto dto)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(dto.NewPassword))
				{
					return Results.BadRequest(new
					{
						message = "❌ Thiếu mật khẩu mới"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if ((await QueryAsync(con, "SELECT TOP 1 MaCaNhan FROM TK WHERE MaCaNhan = @m", new SqlParameter[1]
				{
					new SqlParameter("@m", maCaNhan.Trim())
				})).Count == 0)
				{
					return Results.NotFound(new
					{
						message = "❌ Không tìm thấy người dùng"
					});
				}
				(string Hash, string Salt, string Algo) newHash = HashPassword(dto.NewPassword);
				DateTime now = DateTime.UtcNow;
				string sql = "UPDATE TK SET \r\n                       PasswordHash = @h, \r\n                       PasswordSalt = @s, \r\n                       PasswordAlgo = @a, \r\n                       UpdatedAt = @u \r\n                   WHERE MaCaNhan = @m";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@h", newHash.Hash);
				cmd.Parameters.AddWithValue("@s", newHash.Salt);
				cmd.Parameters.AddWithValue("@a", newHash.Algo);
				cmd.Parameters.AddWithValue("@u", now);
				cmd.Parameters.AddWithValue("@m", maCaNhan.Trim());
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound(new
					{
						message = "❌ Không thể cập nhật mật khẩu"
					});
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "ADMIN_RESET_PASSWORD " + maCaNhan);
				return Results.Ok(new
				{
					message = "✅ Đặt lại mật khẩu thành công"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error admin resetting password: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/quantri", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				return Results.Ok(await QueryAsync(con, "SELECT MaQT, TenCAP FROM QuanTri ORDER BY TenCAP", Array.Empty<SqlParameter>()));
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting roles: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/roles", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				return Results.Ok(await QueryAsync(con, "SELECT MaQT, TenCAP as TenQT FROM QuanTri ORDER BY TenCAP", Array.Empty<SqlParameter>()));
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting roles: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/users", (Func<UserCreateDto, Task<IResult>>)async delegate(UserCreateDto dto)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(dto.MaCaNhan) || string.IsNullOrWhiteSpace(dto.TenTK) || string.IsNullOrWhiteSpace(dto.MatKhau) || string.IsNullOrWhiteSpace(dto.MaQT))
				{
					return Results.BadRequest(new
					{
						message = "Thiếu thông tin bắt buộc (MaCaNhan, TenTK, MatKhau, MaQT)"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if ((await QueryAsync(con, "SELECT 1 FROM TK WHERE MaCaNhan = @m", new SqlParameter[1]
				{
					new SqlParameter("@m", dto.MaCaNhan.Trim())
				})).Count > 0)
				{
					return Results.BadRequest(new
					{
						message = "Mã cá nhân đã tồn tại"
					});
				}
				if ((await QueryAsync(con, "SELECT 1 FROM TK WHERE TenTK = @u", new SqlParameter[1]
				{
					new SqlParameter("@u", dto.TenTK.Trim())
				})).Count > 0)
				{
					return Results.BadRequest(new
					{
						message = "Tên tài khoản đã tồn tại"
					});
				}
				if ((await QueryAsync(con, "SELECT 1 FROM QuanTri WHERE MaQT = @r", new SqlParameter[1]
				{
					new SqlParameter("@r", dto.MaQT.Trim())
				})).Count == 0)
				{
					return Results.BadRequest(new
					{
						message = "Mã quyền (MaQT) không hợp lệ"
					});
				}
				(string Hash, string Salt, string Algo) passwordHash = HashPassword(dto.MatKhau);
				DateTime now = DateTime.UtcNow;
				string sql = "INSERT INTO TK (MaCaNhan, TenTK, PasswordHash, PasswordSalt, PasswordAlgo, TenNguoiDung, MaQT, TrangThai, CreatedAt, UpdatedAt)\r\n                    VALUES (@MaCaNhan, @TenTK, @PasswordHash, @PasswordSalt, @PasswordAlgo, @TenNguoiDung, @MaQT, 1, @CreatedAt, @UpdatedAt)";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddRange(new SqlParameter[9]
				{
					new SqlParameter("@MaCaNhan", dto.MaCaNhan.Trim()),
					new SqlParameter("@TenTK", dto.TenTK.Trim()),
					new SqlParameter("@PasswordHash", passwordHash.Hash),
					new SqlParameter("@PasswordSalt", passwordHash.Salt),
					new SqlParameter("@PasswordAlgo", passwordHash.Algo),
					new SqlParameter("@TenNguoiDung", ((object)dto.TenNguoiDung?.Trim()) ?? ((object)DBNull.Value)),
					new SqlParameter("@MaQT", dto.MaQT.Trim()),
					new SqlParameter("@CreatedAt", now),
					new SqlParameter("@UpdatedAt", now)
				});
				await cmd.ExecuteNonQueryAsync();
				string maQT = dto.MaQT.Trim().ToUpper();
				if (maQT == "SV01")
				{
					if ((await QueryAsync(con, "SELECT 1 FROM SINHVIEN WHERE MSSV = @id", new SqlParameter[1]
					{
						new SqlParameter("@id", dto.MaCaNhan.Trim())
					})).Count == 0)
					{
						using SqlCommand svCmd = new SqlCommand("INSERT INTO SINHVIEN (MSSV, MaCaNhan, TenSV) VALUES (@mssv, @macn, @ten)", con);
						svCmd.Parameters.AddWithValue("@mssv", dto.MaCaNhan.Trim());
						svCmd.Parameters.AddWithValue("@macn", dto.MaCaNhan.Trim());
						svCmd.Parameters.AddWithValue("@ten", ((object)dto.TenNguoiDung?.Trim()) ?? ((object)DBNull.Value));
						await svCmd.ExecuteNonQueryAsync();
						Console.WriteLine("[CREATE_USER] Auto-created SINHVIEN record for " + dto.MaCaNhan);
					}
				}
				else if (maQT == "GV01" && (await QueryAsync(con, "SELECT 1 FROM GiangVien WHERE MaCaNhan = @id", new SqlParameter[1]
				{
					new SqlParameter("@id", dto.MaCaNhan.Trim())
				})).Count == 0)
				{
					using SqlCommand gvCmd = new SqlCommand("INSERT INTO GiangVien (MaCaNhan, TenGV) VALUES (@macn, @ten)", con);
					gvCmd.Parameters.AddWithValue("@macn", dto.MaCaNhan.Trim());
					gvCmd.Parameters.AddWithValue("@ten", ((object)dto.TenNguoiDung?.Trim()) ?? ((object)DBNull.Value));
					await gvCmd.ExecuteNonQueryAsync();
					Console.WriteLine("[CREATE_USER] Auto-created GiangVien record for " + dto.MaCaNhan);
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "CREATE_USER", dto.MaCaNhan);
				return Results.Ok(new
				{
					message = "Thêm người dùng thành công"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error creating user: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/users/{maCaNhan}", (Func<string, UserUpdateDto, Task<IResult>>)async delegate(string maCaNhan, UserUpdateDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if (!string.IsNullOrWhiteSpace(dto.MatKhau))
				{
					return Results.BadRequest(new
					{
						message = "❌ Lỗi bảo mật: Không được cập nhật mật khẩu qua endpoint này.\n\ud83d\udc49 Hãy dùng: PUT /api/users/{maCaNhan}/password"
					});
				}
				string newMaCaNhan = dto.MaCaNhan?.Trim();
				bool updateMaCaNhan = !string.IsNullOrEmpty(newMaCaNhan) && newMaCaNhan != maCaNhan.Trim();
				
				List<SqlParameter> cmdParams = new List<SqlParameter>
				{
					new SqlParameter("@TenTK", ((object)dto.TenTK?.Trim()) ?? ((object)DBNull.Value)),
					new SqlParameter("@TenNguoiDung", ((object)dto.TenNguoiDung?.Trim()) ?? ((object)DBNull.Value)),
					new SqlParameter("@MaQT", ((object)dto.MaQT?.Trim()) ?? ((object)DBNull.Value)),
					new SqlParameter("@UpdatedAt", DateTime.UtcNow),
					new SqlParameter("@MaCaNhan", maCaNhan.Trim())
				};
				
				string sql = "UPDATE TK SET\r\n                        TenTK = COALESCE(@TenTK, TenTK),\r\n                        TenNguoiDung = COALESCE(@TenNguoiDung, TenNguoiDung),\r\n                        MaQT = COALESCE(@MaQT, MaQT),\r\n                        UpdatedAt = @UpdatedAt";
				
				if (updateMaCaNhan)
				{
					sql += ",\r\n                        MaCaNhan = @NewMaCaNhan";
					cmdParams.Add(new SqlParameter("@NewMaCaNhan", newMaCaNhan));
				}
				sql += "\r\n                    WHERE MaCaNhan = @MaCaNhan";
				
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddRange(cmdParams.ToArray());
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound(new
					{
						message = "Không tìm thấy người dùng"
					});
				}
				if (updateMaCaNhan)
				{
					using SqlCommand updateSV = new SqlCommand("UPDATE SINHVIEN SET MSSV=@new, MaCaNhan=@new WHERE MSSV=@old", con);
					updateSV.Parameters.AddWithValue("@new", newMaCaNhan);
					updateSV.Parameters.AddWithValue("@old", maCaNhan.Trim());
					await updateSV.ExecuteNonQueryAsync();
					using SqlCommand updateGV = new SqlCommand("UPDATE GiangVien SET MaCaNhan=@new WHERE MaCaNhan=@old", con);
					updateGV.Parameters.AddWithValue("@new", newMaCaNhan);
					updateGV.Parameters.AddWithValue("@old", maCaNhan.Trim());
					await updateGV.ExecuteNonQueryAsync();
				}
				if (!string.IsNullOrWhiteSpace(dto.TenNguoiDung))
				{
					string mc = updateMaCaNhan ? newMaCaNhan : maCaNhan.Trim();
					string ten = dto.TenNguoiDung.Trim();
					using SqlCommand syncSV = new SqlCommand("IF EXISTS (SELECT 1 FROM SINHVIEN WHERE MSSV=@mc) UPDATE SINHVIEN SET TenSV=@ten WHERE MSSV=@mc", con);
					syncSV.Parameters.AddWithValue("@mc", mc);
					syncSV.Parameters.AddWithValue("@ten", ten);
					await syncSV.ExecuteNonQueryAsync();
					using SqlCommand syncGV = new SqlCommand("IF EXISTS (SELECT 1 FROM GiangVien WHERE MaCaNhan=@mc) UPDATE GiangVien SET TenGV=@ten WHERE MaCaNhan=@mc", con);
					syncGV.Parameters.AddWithValue("@mc", mc);
					syncGV.Parameters.AddWithValue("@ten", ten);
					await syncGV.ExecuteNonQueryAsync();
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "UPDATE_USER " + maCaNhan);
				return Results.Ok(new
				{
					message = "Cập nhật thành công"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error updating user: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/users/{maCaNhan}/details", (Func<string, Task<IResult>>)async delegate(string maCaNhan)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string tkSql = "\r\n            SELECT TK.MaCaNhan, TK.TenTK, TK.TenNguoiDung, TK.MaQT, QT.TenCAP AS ChucVu, TK.TrangThai\r\n            FROM TK\r\n            LEFT JOIN QuanTri QT ON QT.MaQT = TK.MaQT\r\n            WHERE TK.MaCaNhan = @maCaNhan";
				List<Dictionary<string, object?>> rows = await QueryAsync(con, tkSql, new SqlParameter[1]
				{
					new SqlParameter("@maCaNhan", maCaNhan.Trim())
				});
				if (rows.Count == 0)
				{
					return Results.NotFound(new
					{
						message = "Không tìm thấy người dùng"
					});
				}
				Dictionary<string, object?> row = rows[0];
				return Results.Ok(new
				{
					maCaNhan = (row["MaCaNhan"]?.ToString() ?? ""),
					tenTK = (row["TenTK"]?.ToString() ?? ""),
					tenNguoiDung = (row["TenNguoiDung"]?.ToString() ?? ""),
					maQT = (row["MaQT"]?.ToString() ?? ""),
					chucVu = (row["ChucVu"]?.ToString() ?? ""),
					trangThai = row["TrangThai"]
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting user details: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/giangvien-detail/{maCaNhan}", (Func<string, GiangVienDetailDto, Task<IResult>>)async delegate(string maCaNhan, GiangVienDetailDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if ((await QueryAsync(con, "SELECT 1 FROM GiangVien WHERE MaCaNhan = @id", new SqlParameter[1]
				{
					new SqlParameter("@id", maCaNhan.Trim())
				})).Count == 0)
				{
					return Results.NotFound(new
					{
						message = "Không tìm thấy giảng viên"
					});
				}
				string sql = "UPDATE GiangVien SET\r\n                        TenGV = COALESCE(@TenGV, TenGV),\r\n                        SDT = COALESCE(@SDT, SDT),\r\n                        Email = COALESCE(@Email, Email),\r\n                        MaKH = COALESCE(@MaKH, MaKH),\r\n                        LopCV = COALESCE(@LopCV, LopCV),\r\n                        DiaChi = COALESCE(@DiaChi, DiaChi)\r\n                    WHERE MaCaNhan = @maCaNhan";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@TenGV", ((object)dto.TenGV) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@SDT", ((object)dto.SDT) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@Email", ((object)dto.Email) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@MaKH", ((object)dto.MaKH) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@LopCV", ((object)dto.LopCV) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@DiaChi", ((object)dto.DiaChi) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@maCaNhan", maCaNhan.Trim()));
				await cmd.ExecuteNonQueryAsync();
				if (!string.IsNullOrWhiteSpace(dto.TenGV))
				{
					using SqlCommand syncTK = new SqlCommand("IF EXISTS (SELECT 1 FROM TK WHERE MaCaNhan=@mc) UPDATE TK SET TenNguoiDung=@ten WHERE MaCaNhan=@mc", con);
					syncTK.Parameters.AddWithValue("@mc", maCaNhan.Trim());
					syncTK.Parameters.AddWithValue("@ten", dto.TenGV.Trim());
					await syncTK.ExecuteNonQueryAsync();
				}
				return Results.Ok(new
				{
					message = "Cập nhật thông tin giảng viên thành công"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error updating giangvien detail: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/sinhvien-detail/{mssv}", (Func<string, SinhVienDetailDto, Task<IResult>>)async delegate(string mssv, SinhVienDetailDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if ((await QueryAsync(con, "SELECT 1 FROM SINHVIEN WHERE MSSV = @mssv", new SqlParameter[1]
				{
					new SqlParameter("@mssv", mssv.Trim())
				})).Count == 0)
				{
					return Results.NotFound(new
					{
						message = "Không tìm thấy sinh viên"
					});
				}
				string sql = "UPDATE SINHVIEN SET\r\n                        TenSV = COALESCE(@TenSV, TenSV),\r\n                        SDT = COALESCE(@SDT, SDT),\r\n                        Email = COALESCE(@Email, Email),\r\n                        DiaChi = COALESCE(@DiaChi, DiaChi),\r\n                        MaLop = COALESCE(@MaLop, MaLop),\r\n                        MaKH = COALESCE(@MaKH, MaKH),\r\n                        MaKhoa = COALESCE(@MaKhoa, MaKhoa),\r\n                        TVCLBKhoa = @TVCLBKhoa,\r\n                        TVCLBTruong = @TVCLBTruong,\r\n                        CBLop = @CBLop\r\n                    WHERE MSSV = @mssv";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@TenSV", ((object)dto.TenSV) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@SDT", ((object)dto.SDT) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@Email", ((object)dto.Email) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@DiaChi", ((object)dto.DiaChi) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@MaLop", ((object)dto.MaLop) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@MaKH", ((object)dto.MaKH) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@MaKhoa", ((object)dto.MaKhoa) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@TVCLBKhoa", ((object)dto.TVCLBKhoa) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@TVCLBTruong", ((object)dto.TVCLBTruong) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@CBLop", ((object)dto.CBLop) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@mssv", mssv.Trim()));
				await cmd.ExecuteNonQueryAsync();
				if (!string.IsNullOrWhiteSpace(dto.TenSV))
				{
					using SqlCommand syncTK = new SqlCommand("IF EXISTS (SELECT 1 FROM TK WHERE MaCaNhan=@mc) UPDATE TK SET TenNguoiDung=@ten WHERE MaCaNhan=@mc", con);
					syncTK.Parameters.AddWithValue("@mc", mssv.Trim());
					syncTK.Parameters.AddWithValue("@ten", dto.TenSV.Trim());
					await syncTK.ExecuteNonQueryAsync();
				}
				return Results.Ok(new
				{
					message = "Cập nhật thông tin sinh viên thành công"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error updating sinhvien detail: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/users/{maCaNhan}/lock", (Func<string, Task<IResult>>)async delegate(string maCaNhan)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "UPDATE TK SET TrangThai = 0 WHERE MaCaNhan = @maCaNhan";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@maCaNhan", maCaNhan.Trim()));
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y t\ufffdi kho?n"
					});
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "LOCK_USER " + maCaNhan);
				return Results.Ok(new
				{
					message = "\ufffd\ufffd kh\ufffda t\ufffdi kho?n th\ufffdnh c\ufffdng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error locking user: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/users/{maCaNhan}/unlock", (Func<string, Task<IResult>>)async delegate(string maCaNhan)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "UPDATE TK SET TrangThai = 1 WHERE MaCaNhan = @maCaNhan";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@maCaNhan", maCaNhan.Trim()));
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y t\ufffdi kho?n"
					});
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "UNLOCK_USER " + maCaNhan);
				return Results.Ok(new
				{
					message = "\ufffd\ufffd m? kh\ufffda t\ufffdi kho?n th\ufffdnh c\ufffdng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error unlocking user: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapDelete("/api/users/{maCaNhan}", (Func<string, Task<IResult>>)async delegate(string maCaNhan)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string checkSql = "SELECT COUNT(*) FROM TK WHERE MaCaNhan = @maCaNhan";
				using SqlCommand checkCmd = new SqlCommand(checkSql, con);
				checkCmd.Parameters.Add(new SqlParameter("@maCaNhan", maCaNhan.Trim()));
				if ((int)((await checkCmd.ExecuteScalarAsync()) ?? ((object)0)) == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y ngu?i d\ufffdng"
					});
				}
				string sql = "DELETE FROM TK WHERE MaCaNhan = @maCaNhan";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@maCaNhan", maCaNhan.Trim()));
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng th? x\ufffda ngu?i d\ufffdng"
					});
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "DELETE_USER " + maCaNhan);
				return Results.Ok(new
				{
					message = "\ufffd\ufffd x\ufffda ngu?i d\ufffdng th\ufffdnh c\ufffdng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error deleting user: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/diem", (Func<HttpContext, DiemDto, Task<IResult>>)async delegate(HttpContext ctx, DiemDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				try
				{
					string gv = ctx.Request.Headers["X-User"].FirstOrDefault();
					if (!string.IsNullOrWhiteSpace(gv))
					{
						string maLopSv = (await QueryAsync(con, "SELECT MaLop FROM SINHVIEN WHERE MSSV=@m", new SqlParameter[1]
						{
							new SqlParameter("@m", dto.MSSV.Trim())
						})).FirstOrDefault()?["MaLop"]?.ToString();
						if (string.IsNullOrWhiteSpace(maLopSv))
						{
							return Results.BadRequest(new
							{
								message = "Sinh vi\ufffdn kh\ufffdng t?n t?i ho?c thi?u MaLop"
							});
						}
						HashSet<string> allowed = await GetLecturerClassesByLopCVAsync(con, gv);
						if (allowed.Count == 0 || !allowed.Contains(maLopSv))
						{
							return Results.StatusCode(403);
						}
					}
				}
				catch
				{
				}
				int currentYear = DateTime.UtcNow.Year;
				int currentSemester = 1;
				try
				{
					using SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE Id = 1)\r\nBEGIN\r\n  INSERT INTO SystemSettings (Id, SchoolName, CurrentYear, CurrentSemester)\r\n  VALUES (1, N'Tru?ng \ufffd?i h?c Ki\ufffdn Giang', YEAR(GETDATE()), 1);\r\nEND", con);
					await ensure.ExecuteNonQueryAsync();
					List<Dictionary<string, object?>> srows = await QueryAsync(con, "SELECT TOP 1 SchoolName, CurrentYear, CurrentSemester FROM SystemSettings WHERE Id = 1", Array.Empty<SqlParameter>());
					if (srows.Count > 0)
					{
						object obj4 = srows[0]["CurrentYear"];
						int y = default(int);
						int num;
						if (obj4 is int)
						{
							y = (int)obj4;
							num = 1;
						}
						else
						{
							num = 0;
						}
						currentYear = ((num == 0) ? DateTime.UtcNow.Year : y);
						obj4 = srows[0]["CurrentSemester"];
						int sem = default(int);
						int num2;
						if (obj4 is int)
						{
							sem = (int)obj4;
							num2 = 1;
						}
						else
						{
							num2 = 0;
						}
						currentSemester = ((num2 == 0) ? 1 : sem);
					}
				}
				catch
				{
				}
				if ((await QueryAsync(con, "SELECT 1 FROM SINHVIEN WHERE MSSV = @mssv", new SqlParameter[1]
				{
					new SqlParameter("@mssv", dto.MSSV)
				})).Count == 0)
				{
					return Results.BadRequest(new
					{
						message = "Sinh vi\ufffdn kh\ufffdng t?n t?i"
					});
				}
				int useYear = dto.NamHoc ?? currentYear;
				int useSemester = dto.HocKi ?? currentSemester;
				if ((await QueryAsync(con, "SELECT 1 FROM LUUTRUDIEMSV WHERE MSSV = @mssv AND NamHoc = @namHoc AND HocKi = @hocKi", new SqlParameter[3]
				{
					new SqlParameter("@mssv", dto.MSSV),
					new SqlParameter("@namHoc", useYear),
					new SqlParameter("@hocKi", useSemester)
				})).Count > 0)
				{
					string updateSql = "\r\nUPDATE LUUTRUDIEMSV \r\nSET DiemTBM_4 = @diemTBM4, DiemTBM_10 = @diemTBM10, TongDRL = @tongDRL, Khoas = @khoas,\r\n    viphamNT = @viphamNT, viphamXH = @viphamXH, TGNCKH = @TGNCKH\r\nWHERE MSSV = @mssv AND NamHoc = @namHoc AND HocKi = @hocKi";
					using SqlCommand cmd = new SqlCommand(updateSql, con);
					cmd.Parameters.AddRange(new SqlParameter[10]
					{
						new SqlParameter("@diemTBM4", ((object)dto.DiemTBM_4) ?? DBNull.Value),
						new SqlParameter("@diemTBM10", ((object)dto.DiemTBM_10) ?? DBNull.Value),
						new SqlParameter("@tongDRL", ((object)dto.TongDRL) ?? DBNull.Value),
						new SqlParameter("@khoas", ((object)dto.Khoas) ?? ((object)DBNull.Value)),
						new SqlParameter("@viphamNT", ((object)dto.viphamNT) ?? DBNull.Value),
						new SqlParameter("@viphamXH", ((object)dto.viphamXH) ?? DBNull.Value),
						new SqlParameter("@TGNCKH", ((object)dto.TGNCKH) ?? DBNull.Value),
						new SqlParameter("@mssv", dto.MSSV),
						new SqlParameter("@namHoc", useYear),
						new SqlParameter("@hocKi", useSemester)
					});
					await cmd.ExecuteNonQueryAsync();
				}
				else
				{
					string insertSql = "\r\nINSERT INTO LUUTRUDIEMSV (MSSV, Khoas, HocKi, DiemTBM_4, DiemTBM_10, TongDRL, NamHoc, viphamNT, viphamXH, TGNCKH)\r\nVALUES (@mssv, @khoas, @hocKi, @diemTBM4, @diemTBM10, @tongDRL, @namHoc, @viphamNT, @viphamXH, @TGNCKH)";
					using SqlCommand cmd2 = new SqlCommand(insertSql, con);
					cmd2.Parameters.AddRange(new SqlParameter[10]
					{
						new SqlParameter("@mssv", dto.MSSV),
						new SqlParameter("@khoas", ((object)dto.Khoas) ?? ((object)DBNull.Value)),
						new SqlParameter("@hocKi", useSemester),
						new SqlParameter("@diemTBM4", ((object)dto.DiemTBM_4) ?? DBNull.Value),
						new SqlParameter("@diemTBM10", ((object)dto.DiemTBM_10) ?? DBNull.Value),
						new SqlParameter("@tongDRL", ((object)dto.TongDRL) ?? DBNull.Value),
						new SqlParameter("@namHoc", useYear),
						new SqlParameter("@viphamNT", ((object)dto.viphamNT) ?? DBNull.Value),
						new SqlParameter("@viphamXH", ((object)dto.viphamXH) ?? DBNull.Value),
						new SqlParameter("@TGNCKH", ((object)dto.TGNCKH) ?? DBNull.Value)
					});
					await cmd2.ExecuteNonQueryAsync();
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, $"SAVE_GRADE MSSV={dto.MSSV} Y={useYear} K={useSemester}");
				return Results.Ok(new
				{
					message = "Luu di?m th\ufffdnh c\ufffdng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error saving grade: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/diem/list", (Func<HttpContext, string, int?, string, string, string, Task<IResult>>)async delegate(HttpContext ctx, string? namHoc, int? hocKi, string? mssv, string? maLop, string? maKhoa)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<string> conditions = new List<string> { "1=1" };
				List<SqlParameter> @params = new List<SqlParameter>();
				if (!string.IsNullOrWhiteSpace(namHoc) && int.TryParse(namHoc, out var nh))
				{
					conditions.Add("L.NamHoc = @namHoc");
					@params.Add(new SqlParameter("@namHoc", nh));
				}
				if (hocKi.HasValue)
				{
					conditions.Add("L.HocKi = @hocKi");
					@params.Add(new SqlParameter("@hocKi", hocKi.Value));
				}
				if (!string.IsNullOrWhiteSpace(mssv))
				{
					conditions.Add("L.MSSV LIKE @mssv");
					@params.Add(new SqlParameter("@mssv", "%" + mssv + "%"));
				}
				if (!string.IsNullOrWhiteSpace(maLop))
				{
					List<string> lops = (from x in maLop.Split(',', StringSplitOptions.RemoveEmptyEntries)
						select x.Trim()).ToList();
					if (lops.Count == 1)
					{
						conditions.Add("S.MaLop = @maLop");
						@params.Add(new SqlParameter("@maLop", lops[0]));
					}
					else if (lops.Count > 1)
					{
						List<string> lopParams = new List<string>();
						for (int i = 0; i < lops.Count; i++)
						{
							string pName = $"@maLop{i}";
							lopParams.Add(pName);
							@params.Add(new SqlParameter(pName, lops[i]));
						}
						conditions.Add("S.MaLop IN (" + string.Join(",", lopParams) + ")");
					}
				}
				if (!string.IsNullOrWhiteSpace(maKhoa))
				{
					conditions.Add("S.MaKhoa = @maKhoa");
					@params.Add(new SqlParameter("@maKhoa", maKhoa));
				}
				string sql = "SELECT L.*, S.TenSV, S.MaLop, S.MaKhoa FROM LUUTRUDIEMSV L LEFT JOIN SINHVIEN S ON L.MSSV = S.MSSV WHERE " + string.Join(" AND ", conditions) + " ORDER BY L.NamHoc DESC, L.HocKi DESC";
				return Results.Ok(await QueryAsync(con, sql, @params.ToArray()));
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/diem/check-exists", (Func<HttpContext, CheckExistsReq, Task<IResult>>)async delegate(HttpContext ctx, CheckExistsReq req)
		{
			try
			{
				if (req.records == null || req.records.Count == 0)
				{
					return Results.Ok(new List<string>());
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<string> existingMssvs = new List<string>();
				foreach (DiemDto r in req.records)
				{
					int nh = r.NamHoc ?? DateTime.UtcNow.Year;
					int hk = r.HocKi ?? 1;
					if ((await QueryAsync(con, "SELECT 1 FROM LUUTRUDIEMSV WHERE MSSV=@m AND NamHoc=@nh AND HocKi=@hk", new SqlParameter[3]
					{
						new SqlParameter("@m", r.MSSV ?? ""),
						new SqlParameter("@nh", nh),
						new SqlParameter("@hk", hk)
					})).Count > 0)
					{
						existingMssvs.Add(r.MSSV ?? "");
					}
				}
				return Results.Ok(existingMssvs);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/diem/bulk-import", (Func<HttpContext, BulkImportReq, Task<IResult>>)async delegate(HttpContext ctx, BulkImportReq req)
		{
			try
			{
				if (req.records == null || req.records.Count == 0)
				{
					return Results.BadRequest(new
					{
						error = "No records provided"
					});
				}
				int successCount = 0;
				int skipCount = 0;
				List<object> errors = new List<object>();
				string userId = ctx.Request.Headers["X-User"].ToString();
				string userRole = "";
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if (!string.IsNullOrEmpty(userId))
				{
					List<Dictionary<string, object?>> roleRows = await QueryAsync(con, "\r\n                SELECT QT.TenCAP AS Quyen \r\n                FROM TK \r\n                LEFT JOIN QuanTri QT ON QT.MaQT = TK.MaQT \r\n                WHERE TK.TenTK=@u OR TK.MaCaNhan=@u", new SqlParameter[1]
					{
						new SqlParameter("@u", userId)
					});
					if (roleRows.Count > 0)
					{
						userRole = roleRows[0]["Quyen"]?.ToString() ?? "";
					}
				}
				HashSet<string> allowedClasses = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
				if (userRole == "Giảng viên")
				{
					allowedClasses = await GetLecturerClassesByLopCVAsync(con, userId);
				}
				for (int i = 0; i < req.records.Count; i++)
				{
					DiemDto dto = req.records[i];
					if (string.IsNullOrWhiteSpace(dto.MSSV))
					{
						errors.Add(new
						{
							row = i + 1,
							mssv = "",
							error = "Missing MSSV"
						});
					}
					else
					{
						string mssv = dto.MSSV.Trim();
						int nh = dto.NamHoc ?? DateTime.UtcNow.Year;
						int hk = dto.HocKi ?? 1;
						if (userRole == "Giảng viên")
						{
							List<Dictionary<string, object?>> svRows = await QueryAsync(con, "SELECT MaLop FROM SINHVIEN WHERE MSSV=@m", new SqlParameter[1]
							{
								new SqlParameter("@m", mssv)
							});
							if (svRows.Count == 0)
							{
								errors.Add(new
								{
									row = i + 1,
									mssv = mssv,
									error = "Sinh viên không tồn tại"
								});
								continue;
							}
							string svMaLop = svRows[0]["MaLop"]?.ToString() ?? "";
							if (!allowedClasses.Contains(svMaLop))
							{
								errors.Add(new
								{
									row = i + 1,
									mssv = mssv,
									error = "Sinh viên không thuộc lớp bạn chủ nhiệm"
								});
								continue;
							}
						}
						if ((await QueryAsync(con, "SELECT 1 FROM LUUTRUDIEMSV WHERE MSSV=@m AND NamHoc=@nh AND HocKi=@hk", new SqlParameter[3]
						{
							new SqlParameter("@m", mssv),
							new SqlParameter("@nh", nh),
							new SqlParameter("@hk", hk)
						})).Count > 0)
						{
							if (req.mode == "skip")
							{
								skipCount++;
							}
							else if (req.mode == "merge")
							{
								string updateSql = "UPDATE LUUTRUDIEMSV SET TongDRL = ISNULL(TongDRL,0) + @addDrl WHERE MSSV=@m AND NamHoc=@nh AND HocKi=@hk";
								using SqlCommand cmd = new SqlCommand(updateSql, con);
								cmd.Parameters.AddWithValue("@addDrl", dto.TongDRL.GetValueOrDefault());
								cmd.Parameters.AddWithValue("@m", mssv);
								cmd.Parameters.AddWithValue("@nh", nh);
								cmd.Parameters.AddWithValue("@hk", hk);
								await cmd.ExecuteNonQueryAsync();
								successCount++;
							}
							else
							{
								string updateSql2 = "UPDATE LUUTRUDIEMSV SET \r\n                        DiemTBM_4 = ISNULL(@d4, DiemTBM_4), \r\n                        DiemTBM_10 = ISNULL(@d10, DiemTBM_10), \r\n                        TongDRL = ISNULL(@drl, TongDRL), \r\n                        Khoas = ISNULL(@kh, Khoas),\r\n                        viphamNT = ISNULL(@vpnt, viphamNT),\r\n                        viphamXH = ISNULL(@vpxh, viphamXH)\r\n                        WHERE MSSV=@m AND NamHoc=@nh AND HocKi=@hk";
								using SqlCommand cmd2 = new SqlCommand(updateSql2, con);
								cmd2.Parameters.Add(new SqlParameter("@d4", ((object)dto.DiemTBM_4) ?? DBNull.Value));
								cmd2.Parameters.Add(new SqlParameter("@d10", ((object)dto.DiemTBM_10) ?? DBNull.Value));
								cmd2.Parameters.Add(new SqlParameter("@drl", ((object)dto.TongDRL) ?? DBNull.Value));
								cmd2.Parameters.Add(new SqlParameter("@kh", ((object)dto.Khoas) ?? ((object)DBNull.Value)));
								cmd2.Parameters.Add(new SqlParameter("@vpnt", ((object)dto.viphamNT) ?? DBNull.Value));
								cmd2.Parameters.Add(new SqlParameter("@vpxh", ((object)dto.viphamXH) ?? DBNull.Value));
								cmd2.Parameters.AddWithValue("@m", mssv);
								cmd2.Parameters.AddWithValue("@nh", nh);
								cmd2.Parameters.AddWithValue("@hk", hk);
								await cmd2.ExecuteNonQueryAsync();
								successCount++;
							}
						}
						else
						{
							string insertSql = "INSERT INTO LUUTRUDIEMSV (MSSV, NamHoc, HocKi, DiemTBM_4, DiemTBM_10, TongDRL, Khoas, viphamNT, viphamXH) \r\n                    VALUES (@m, @nh, @hk, @d4, @d10, @drl, @kh, @vpnt, @vpxh)";
							using SqlCommand cmd3 = new SqlCommand(insertSql, con);
							cmd3.Parameters.AddWithValue("@m", mssv);
							cmd3.Parameters.AddWithValue("@nh", nh);
							cmd3.Parameters.AddWithValue("@hk", hk);
							cmd3.Parameters.Add(new SqlParameter("@d4", ((object)dto.DiemTBM_4) ?? DBNull.Value));
							cmd3.Parameters.Add(new SqlParameter("@d10", ((object)dto.DiemTBM_10) ?? DBNull.Value));
							cmd3.Parameters.Add(new SqlParameter("@drl", ((object)dto.TongDRL) ?? DBNull.Value));
							cmd3.Parameters.Add(new SqlParameter("@kh", ((object)dto.Khoas) ?? ((object)DBNull.Value)));
							cmd3.Parameters.Add(new SqlParameter("@vpnt", ((object)dto.viphamNT) ?? ((object)0)));
							cmd3.Parameters.Add(new SqlParameter("@vpxh", ((object)dto.viphamXH) ?? ((object)0)));
							await cmd3.ExecuteNonQueryAsync();
							successCount++;
						}
					}
				}
				return Results.Ok(new
				{
					success = successCount,
					skipped = skipCount,
					errors = errors
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/hoatdong", (Func<HoatDongDto, Task<IResult>>)async delegate(HoatDongDto dto)
		{
			try
			{
				Console.WriteLine("=== Adding Activity ===");
				Console.WriteLine("MaHD: " + dto.MaHD);
				Console.WriteLine("TenHD: " + dto.TenHD);
				Console.WriteLine($"DiemRL: {dto.DiemRL}");
				Console.WriteLine("NDHD: " + dto.NDHD);
				Console.WriteLine($"NgayBD: {dto.NgayBD}");
				Console.WriteLine($"NgayKT: {dto.NgayKT}");
				Console.WriteLine($"SoSvDK: {dto.SoSvDK}");
				Console.WriteLine("DiaDiem: " + dto.DiaDiem);
				Console.WriteLine("TUKHOA: " + dto.TUKHOA);
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if ((await QueryAsync(con, "SELECT 1 FROM HoatDongTruong WHERE MaHD = @maHD", new SqlParameter[1]
				{
					new SqlParameter("@maHD", dto.MaHD)
				})).Count > 0)
				{
					return Results.BadRequest(new
					{
						message = "M\ufffd ho?t d?ng d\ufffd t?n t?i"
					});
				}
				string sql = "\r\nINSERT INTO HoatDongTruong (MaHD, TenHD, DiemRL, SoSvDK, NDHD, NgayBD, NgayKT, DiaDiem, TUKHOA)\r\nVALUES (@maHD, @tenHD, @diemRL, @soSvDK, @ndHD, @ngayBD, @ngayKT, @diaDiem, @tuKhoa)";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddRange(new SqlParameter[9]
				{
					new SqlParameter("@maHD", dto.MaHD),
					new SqlParameter("@tenHD", dto.TenHD),
					new SqlParameter("@diemRL", dto.DiemRL),
					new SqlParameter("@soSvDK", ((object)dto.SoSvDK) ?? DBNull.Value),
					new SqlParameter("@ndHD", ((object)dto.NDHD) ?? ((object)DBNull.Value)),
					new SqlParameter("@ngayBD", dto.NgayBD),
					new SqlParameter("@ngayKT", dto.NgayKT),
					new SqlParameter("@diaDiem", ((object)dto.DiaDiem) ?? ((object)DBNull.Value)),
					new SqlParameter("@tuKhoa", ((object)dto.TUKHOA) ?? ((object)DBNull.Value))
				});
				await cmd.ExecuteNonQueryAsync();
				try
				{
					string kw = dto.TUKHOA;
					string ctxName = null;
					if (!string.IsNullOrWhiteSpace(kw))
					{
						string norm = RemoveDiacritics(kw).ToLowerInvariant();
						if (norm.Contains("sankhau"))
						{
							ctxName = "SanKhau";
						}
						else if (norm.Contains("giangduong") || norm.Contains("hoitruong"))
						{
							ctxName = "GiangDuong";
						}
						else if (norm.Contains("ngoaitroi") || norm.Contains("outdoor"))
						{
							ctxName = "NgoaiTroi";
						}
						else if (norm.Contains("tronglop") || norm.Contains("classroom") || (norm.Contains("lop") && !norm.Contains("giangduong")))
						{
							ctxName = "TrongLop";
						}
					}
					if (ctxName != null)
					{
						using SqlCommand updCtx = new SqlCommand("UPDATE HoatDongTruong SET ContextId = (SELECT ContextId FROM ActivityContexts WHERE Name=@n) WHERE MaHD=@ma", con);
						updCtx.Parameters.AddWithValue("@n", ctxName);
						updCtx.Parameters.AddWithValue("@ma", dto.MaHD);
						await updCtx.ExecuteNonQueryAsync();
						Console.WriteLine("[Activity] Set ContextId by keyword '" + kw + "' => " + ctxName);
					}
					else
					{
						Console.WriteLine("[Activity] Keyword '" + kw + "' did not map to a known context.");
					}
				}
				catch (Exception ex3)
				{
					Console.WriteLine("[Activity][WARN] Failed to map keyword to context: " + ex3.Message);
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "ADD_ACTIVITY " + dto.MaHD);
				return Results.Ok(new
				{
					message = "Th\ufffdm ho?t d?ng th\ufffdnh c\ufffdng"
				});
			}
			catch (Exception ex4)
			{
				Exception ex5 = ex4;
				Console.WriteLine("Error adding activity: " + ex5.Message);
				return Results.BadRequest(new
				{
					error = ex5.Message
				});
			}
		});
		app.MapPost("/api/hoatdong/request", (Func<HttpRequest, HttpContext, Task<IResult>>)async delegate(HttpRequest req, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string bodyText;
				using (StreamReader sr = new StreamReader(req.Body))
				{
					bodyText = await sr.ReadToEndAsync();
				}
				if (string.IsNullOrWhiteSpace(bodyText))
				{
					return Results.BadRequest(new
					{
						message = "Empty body"
					});
				}
				using JsonDocument doc = JsonDocument.Parse(bodyText);
				JsonElement root = doc.RootElement;
				string title = root.GetProperty("title").GetString() ?? "Y\ufffdu c?u t?o ho?t d?ng";
				string body = root.GetProperty("body").GetString() ?? string.Empty;
				JsonElement sb;
				string submittedBy = (root.TryGetProperty("submittedBy", out sb) ? (sb.GetString() ?? string.Empty) : string.Empty);
				using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ActivityRequests' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE ActivityRequests(\r\n        RequestId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),\r\n        Title NVARCHAR(300) NOT NULL,\r\n        Body NVARCHAR(MAX) NULL,\r\n        SubmittedBy NVARCHAR(100) NULL,\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				using (SqlCommand ins = new SqlCommand("INSERT INTO ActivityRequests(Title, Body, SubmittedBy) VALUES(@t, @b, @s);", con))
				{
					ins.Parameters.AddWithValue("@t", title);
					ins.Parameters.AddWithValue("@b", ((object)body) ?? ((object)DBNull.Value));
					ins.Parameters.AddWithValue("@s", ((object)submittedBy) ?? ((object)DBNull.Value));
					await ins.ExecuteNonQueryAsync();
				}
				using (SqlCommand ensure2 = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.Notifications (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        Title NVARCHAR(200) NULL,\r\n        Message NVARCHAR(1000) NULL,\r\n        Link NVARCHAR(500) NULL,\r\n        EvidenceId UNIQUEIDENTIFIER NULL,\r\n        StudentId NVARCHAR(50) NULL,\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()\r\n    );\r\nEND\r\n", con))
				{
					await ensure2.ExecuteNonQueryAsync();
				}
				string titleFor = "Y\ufffdu c?u t?o ho?t d?ng m?i t? Gi?ng vi\ufffdn";
				string safeSubmittedBy = (string.IsNullOrWhiteSpace(submittedBy) ? "(kh\ufffdng r\ufffd)" : submittedBy.Trim());
				string safeTitle = (string.IsNullOrWhiteSpace(title) ? "(kh\ufffdng ti\ufffdu d?)" : title.Trim());
				string safeBody = (string.IsNullOrWhiteSpace(body) ? "(kh\ufffdng c\ufffd m\ufffd t?)" : body.Trim());
				if (safeBody.Length > 200)
				{
					safeBody = safeBody.Substring(0, 200) + "...";
				}
				string msg = safeSubmittedBy + ": " + safeTitle + " - " + safeBody;
				using (SqlCommand ins2 = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, Link) VALUES(@rcp,@t,@m,@lnk);", con))
				{
					ins2.Parameters.AddWithValue("@rcp", "ALL_KHOA");
					ins2.Parameters.AddWithValue("@t", titleFor);
					ins2.Parameters.AddWithValue("@m", msg);
					ins2.Parameters.AddWithValue("@lnk", "/admin.html#activity-requests");
					await ins2.ExecuteNonQueryAsync();
					ins2.Parameters.Clear();
					ins2.Parameters.AddWithValue("@rcp", "ALL_TRUONG");
					ins2.Parameters.AddWithValue("@t", titleFor);
					ins2.Parameters.AddWithValue("@m", msg);
					ins2.Parameters.AddWithValue("@lnk", "/truong.html#activity-requests");
					await ins2.ExecuteNonQueryAsync();
				}
				await LogAsync(ctx, con, "REQUEST_ACTIVITY by=" + submittedBy + " title=" + title);
				return Results.Ok(new
				{
					ok = true,
					message = "Y\ufffdu c?u d\ufffd du?c g?i t?i Khoa/Tru?ng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error POST /api/hoatdong/request: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/activity-requests", async (string? status, int? top) =>
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF COL_LENGTH('ActivityRequests','Status') IS NULL ALTER TABLE ActivityRequests ADD Status NVARCHAR(30) NOT NULL DEFAULT 'Pending';\r\nIF COL_LENGTH('ActivityRequests','ReviewedBy') IS NULL ALTER TABLE ActivityRequests ADD ReviewedBy NVARCHAR(100) NULL;\r\nIF COL_LENGTH('ActivityRequests','ReviewedAt') IS NULL ALTER TABLE ActivityRequests ADD ReviewedAt DATETIME NULL;\r\nIF COL_LENGTH('ActivityRequests','ResponseNote') IS NULL ALTER TABLE ActivityRequests ADD ResponseNote NVARCHAR(500) NULL;\r\nIF COL_LENGTH('ActivityRequests','CreatedActivityMaHD') IS NULL ALTER TABLE ActivityRequests ADD CreatedActivityMaHD NVARCHAR(50) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string sql = "SELECT TOP (@top) RequestId, Title, Body, SubmittedBy, CreatedAt, Status, ReviewedBy, ReviewedAt, ResponseNote, CreatedActivityMaHD\r\nFROM ActivityRequests\r\nWHERE (@status IS NULL OR Status = @status)\r\nORDER BY CreatedAt DESC";
				using SqlCommand cmd = new SqlCommand(sql, con);
				int topVal = top ?? 50;
				cmd.Parameters.AddWithValue("@top", topVal);
				cmd.Parameters.AddWithValue("@status", ((object)status) ?? ((object)DBNull.Value));
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				List<object> list = new List<object>();
				while (await rd.ReadAsync())
				{
					list.Add(new
					{
						RequestId = rd["RequestId"],
						Title = rd["Title"],
						Body = rd["Body"],
						SubmittedBy = rd["SubmittedBy"],
						CreatedAt = rd["CreatedAt"],
						Status = rd["Status"],
						ReviewedBy = rd["ReviewedBy"],
						ReviewedAt = rd["ReviewedAt"],
						ResponseNote = rd["ResponseNote"],
						CreatedActivityMaHD = rd["CreatedActivityMaHD"]
					});
				}
				return Results.Ok(list);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/activity-requests/{id}/approve", (Func<Guid, HttpRequest, Task<IResult>>)async delegate(Guid id, HttpRequest req)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF COL_LENGTH('ActivityRequests','Status') IS NULL ALTER TABLE ActivityRequests ADD Status NVARCHAR(30) NOT NULL DEFAULT 'Pending';\r\nIF COL_LENGTH('ActivityRequests','ReviewedBy') IS NULL ALTER TABLE ActivityRequests ADD ReviewedBy NVARCHAR(100) NULL;\r\nIF COL_LENGTH('ActivityRequests','ReviewedAt') IS NULL ALTER TABLE ActivityRequests ADD ReviewedAt DATETIME NULL;\r\nIF COL_LENGTH('ActivityRequests','ResponseNote') IS NULL ALTER TABLE ActivityRequests ADD ResponseNote NVARCHAR(500) NULL;\r\nIF COL_LENGTH('ActivityRequests','CreatedActivityMaHD') IS NULL ALTER TABLE ActivityRequests ADD CreatedActivityMaHD NVARCHAR(50) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				using (SqlCommand getReq = new SqlCommand("SELECT RequestId, Title, Body, SubmittedBy, Status FROM ActivityRequests WHERE RequestId=@id", con))
				{
					getReq.Parameters.AddWithValue("@id", id);
					using SqlDataReader rd = await getReq.ExecuteReaderAsync();
					if (!(await rd.ReadAsync()))
					{
						return Results.NotFound(new
						{
							message = "Kh\ufffdng t\ufffdm th?y y\ufffdu c?u"
						});
					}
					string status = rd["Status"]?.ToString();
					if (status != null && status != "Pending")
					{
						return Results.BadRequest(new
						{
							message = "Y\ufffdu c?u d\ufffd du?c x? l\ufffd"
						});
					}
				}
				string bodyText;
				using (StreamReader sr = new StreamReader(req.Body))
				{
					bodyText = await sr.ReadToEndAsync();
				}
				if (string.IsNullOrWhiteSpace(bodyText))
				{
					return Results.BadRequest(new
					{
						message = "Thi?u n?i dung JSON"
					});
				}
				using JsonDocument doc = JsonDocument.Parse(bodyText);
				JsonElement root = doc.RootElement;
				string maHD = root.GetProperty("maHD").GetString() ?? string.Empty;
				string tenHD = root.GetProperty("tenHD").GetString() ?? string.Empty;
				JsonElement dRL;
				int diemRL = (root.TryGetProperty("diemRL", out dRL) ? dRL.GetInt32() : 0);
				JsonElement soDK;
				object soSvDK = (root.TryGetProperty("soSvDK", out soDK) ? ((object)soDK.GetInt32()) : DBNull.Value);
				JsonElement nd;
				object ndHD = (root.TryGetProperty("ndhd", out nd) ? ((IConvertible)nd.GetString()) : ((IConvertible)DBNull.Value));
				JsonElement nbd;
				DateTime ngayBD = (root.TryGetProperty("ngayBD", out nbd) ? DateTime.Parse(nbd.GetString() ?? DateTime.UtcNow.ToString("yyyy-MM-dd")) : DateTime.UtcNow);
				JsonElement nkt;
				DateTime ngayKT = (root.TryGetProperty("ngayKT", out nkt) ? DateTime.Parse(nkt.GetString() ?? DateTime.UtcNow.ToString("yyyy-MM-dd")) : DateTime.UtcNow.AddDays(1.0));
				JsonElement dd;
				object diaDiem = (root.TryGetProperty("diaDiem", out dd) ? ((IConvertible)dd.GetString()) : ((IConvertible)DBNull.Value));
				JsonElement rb;
				string reviewer = (root.TryGetProperty("reviewedBy", out rb) ? (rb.GetString() ?? "KHOA/TRUONG") : "KHOA/TRUONG");
				JsonElement rn;
				object responseNote = (root.TryGetProperty("note", out rn) ? ((IConvertible)rn.GetString()) : ((IConvertible)DBNull.Value));
				if (string.IsNullOrWhiteSpace(maHD))
				{
					return Results.BadRequest(new
					{
						message = "Thi?u m\ufffd ho?t d?ng (maHD)"
					});
				}
				using (SqlCommand check = new SqlCommand("SELECT 1 FROM HoatDongTruong WHERE MaHD=@m", con))
				{
					check.Parameters.AddWithValue("@m", maHD);
					if (await check.ExecuteScalarAsync() != null)
					{
						return Results.BadRequest(new
						{
							message = "M\ufffd ho?t d?ng d\ufffd t?n t?i"
						});
					}
				}
				using (SqlCommand insAct = new SqlCommand("INSERT INTO HoatDongTruong(MaHD, TenHD, DiemRL, SoSvDK, NDHD, NgayBD, NgayKT, DiaDiem) VALUES(@ma,@ten,@diem,@so,@nd,@bd,@kt,@dd)", con))
				{
					insAct.Parameters.AddWithValue("@ma", maHD);
					insAct.Parameters.AddWithValue("@ten", tenHD);
					insAct.Parameters.AddWithValue("@diem", diemRL);
					insAct.Parameters.AddWithValue("@so", soSvDK);
					insAct.Parameters.AddWithValue("@nd", ndHD);
					insAct.Parameters.AddWithValue("@bd", ngayBD);
					insAct.Parameters.AddWithValue("@kt", ngayKT);
					insAct.Parameters.AddWithValue("@dd", diaDiem);
					await insAct.ExecuteNonQueryAsync();
				}
				using (SqlCommand upd = new SqlCommand("UPDATE ActivityRequests SET Status='Approved', ReviewedBy=@rv, ReviewedAt=GETDATE(), ResponseNote=@note, CreatedActivityMaHD=@ma WHERE RequestId=@id", con))
				{
					upd.Parameters.AddWithValue("@rv", reviewer);
					upd.Parameters.AddWithValue("@note", responseNote ?? DBNull.Value);
					upd.Parameters.AddWithValue("@ma", maHD);
					upd.Parameters.AddWithValue("@id", id);
					await upd.ExecuteNonQueryAsync();
				}
				using (SqlCommand getSb = new SqlCommand("SELECT SubmittedBy FROM ActivityRequests WHERE RequestId=@id", con))
				{
					getSb.Parameters.AddWithValue("@id", id);
					string submittedBy = ((string)(await getSb.ExecuteScalarAsync())) ?? "";
					using (SqlCommand ensureN = new SqlCommand("IF COL_LENGTH('Notifications','IsRead') IS NULL ALTER TABLE Notifications ADD IsRead BIT NOT NULL DEFAULT 0;\r\nIF COL_LENGTH('Notifications','RecipientRole') IS NULL ALTER TABLE Notifications ADD RecipientRole NVARCHAR(50) NULL;\r\nIF COL_LENGTH('Notifications','RecipientUser') IS NULL ALTER TABLE Notifications ADD RecipientUser NVARCHAR(100) NULL;", con))
					{
						await ensureN.ExecuteNonQueryAsync();
					}
					string msg = "Y\ufffdu c?u t?o ho?t d?ng d\ufffd du?c duy?t: " + maHD + " - " + tenHD;
					using SqlCommand insN = new SqlCommand("INSERT INTO Notifications(Recipient, Title, Message, Link, RecipientRole, RecipientUser) VALUES(@r,@t,@m,@l,@rr,@ru)", con);
					insN.Parameters.AddWithValue("@r", "GIANGVIEN");
					insN.Parameters.AddWithValue("@t", "Duy?t y\ufffdu c?u ho?t d?ng");
					insN.Parameters.AddWithValue("@m", msg);
					insN.Parameters.AddWithValue("@l", "/giangvien.html#notifications");
					insN.Parameters.AddWithValue("@rr", "GIANGVIEN");
					insN.Parameters.AddWithValue("@ru", ((object)submittedBy) ?? ((object)DBNull.Value));
					await insN.ExecuteNonQueryAsync();
					insN.Parameters.Clear();
					insN.Parameters.AddWithValue("@r", "ALL_KHOA");
					insN.Parameters.AddWithValue("@t", "Y\ufffdu c?u d\ufffd duy?t");
					insN.Parameters.AddWithValue("@m", msg);
					insN.Parameters.AddWithValue("@l", "/khoa.html#activities");
					insN.Parameters.AddWithValue("@rr", "KHOA");
					insN.Parameters.AddWithValue("@ru", DBNull.Value);
					await insN.ExecuteNonQueryAsync();
					insN.Parameters.Clear();
					insN.Parameters.AddWithValue("@r", "ALL_TRUONG");
					insN.Parameters.AddWithValue("@t", "Y\ufffdu c?u d\ufffd duy?t");
					insN.Parameters.AddWithValue("@m", msg);
					insN.Parameters.AddWithValue("@l", "/truong.html#activities");
					insN.Parameters.AddWithValue("@rr", "TRUONG");
					insN.Parameters.AddWithValue("@ru", DBNull.Value);
					await insN.ExecuteNonQueryAsync();
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, $"APPROVE_REQUEST {id} MAHD={maHD}");
				return Results.Ok(new
				{
					message = "\ufffd\ufffd duy?t y\ufffdu c?u v\ufffd t?o ho?t d?ng",
					maHD = maHD
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Approve error: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/activity-requests/{id}/reject", (Func<Guid, HttpRequest, Task<IResult>>)async delegate(Guid id, HttpRequest req)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF COL_LENGTH('ActivityRequests','Status') IS NULL ALTER TABLE ActivityRequests ADD Status NVARCHAR(30) NOT NULL DEFAULT 'Pending';\r\nIF COL_LENGTH('ActivityRequests','ReviewedBy') IS NULL ALTER TABLE ActivityRequests ADD ReviewedBy NVARCHAR(100) NULL;\r\nIF COL_LENGTH('ActivityRequests','ReviewedAt') IS NULL ALTER TABLE ActivityRequests ADD ReviewedAt DATETIME NULL;\r\nIF COL_LENGTH('ActivityRequests','ResponseNote') IS NULL ALTER TABLE ActivityRequests ADD ResponseNote NVARCHAR(500) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				using (SqlCommand getReq = new SqlCommand("SELECT SubmittedBy, Status FROM ActivityRequests WHERE RequestId=@id", con))
				{
					getReq.Parameters.AddWithValue("@id", id);
					using SqlDataReader rd = await getReq.ExecuteReaderAsync();
					if (!(await rd.ReadAsync()))
					{
						return Results.NotFound(new
						{
							message = "Kh\ufffdng t\ufffdm th?y y\ufffdu c?u"
						});
					}
					string status = rd["Status"]?.ToString();
					if (status != "Pending")
					{
						return Results.BadRequest(new
						{
							message = "Y\ufffdu c?u d\ufffd x? l\ufffd"
						});
					}
					string submittedBy = rd["SubmittedBy"]?.ToString() ?? string.Empty;
					rd.Close();
					string bodyText;
					using (StreamReader sr = new StreamReader(req.Body))
					{
						bodyText = await sr.ReadToEndAsync();
					}
					using JsonDocument doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(bodyText) ? "{}" : bodyText);
					JsonElement root = doc.RootElement;
					JsonElement rb;
					string reviewer = (root.TryGetProperty("reviewedBy", out rb) ? (rb.GetString() ?? "KHOA/TRUONG") : "KHOA/TRUONG");
					JsonElement nt;
					string note = (root.TryGetProperty("note", out nt) ? (nt.GetString() ?? string.Empty) : string.Empty);
					using (SqlCommand upd = new SqlCommand("UPDATE ActivityRequests SET Status='Rejected', ReviewedBy=@rv, ReviewedAt=GETDATE(), ResponseNote=@note WHERE RequestId=@id", con))
					{
						upd.Parameters.AddWithValue("@rv", reviewer);
						upd.Parameters.AddWithValue("@note", ((object)note) ?? ((object)DBNull.Value));
						upd.Parameters.AddWithValue("@id", id);
						await upd.ExecuteNonQueryAsync();
					}
					using (SqlCommand ensureN = new SqlCommand("IF COL_LENGTH('Notifications','IsRead') IS NULL ALTER TABLE Notifications ADD IsRead BIT NOT NULL DEFAULT 0;\r\nIF COL_LENGTH('Notifications','RecipientRole') IS NULL ALTER TABLE Notifications ADD RecipientRole NVARCHAR(50) NULL;\r\nIF COL_LENGTH('Notifications','RecipientUser') IS NULL ALTER TABLE Notifications ADD RecipientUser NVARCHAR(100) NULL;", con))
					{
						await ensureN.ExecuteNonQueryAsync();
					}
					string msg = "Y\ufffdu c?u t?o ho?t d?ng b? t? ch?i" + (string.IsNullOrWhiteSpace(note) ? "" : (": " + note));
					using (SqlCommand insN = new SqlCommand("INSERT INTO Notifications(Recipient, Title, Message, Link, RecipientRole, RecipientUser) VALUES(@r,@t,@m,@l,@rr,@ru)", con))
					{
						insN.Parameters.AddWithValue("@r", "GIANGVIEN");
						insN.Parameters.AddWithValue("@t", "T? ch?i y\ufffdu c?u ho?t d?ng");
						insN.Parameters.AddWithValue("@m", msg);
						insN.Parameters.AddWithValue("@l", "/giangvien.html#notifications");
						insN.Parameters.AddWithValue("@rr", "GIANGVIEN");
						insN.Parameters.AddWithValue("@ru", ((object)submittedBy) ?? ((object)DBNull.Value));
						await insN.ExecuteNonQueryAsync();
					}
					await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, $"REJECT_REQUEST {id} NOTE={note ?? ""}");
				}
				return Results.Ok(new
				{
					message = "\ufffd\ufffd t? ch?i y\ufffdu c?u"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/notifications/{scope}", (Func<string, string, Task<IResult>>)async delegate(string scope, string? user)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF COL_LENGTH('Notifications','IsRead') IS NULL ALTER TABLE Notifications ADD IsRead BIT NOT NULL DEFAULT 0;\r\nIF COL_LENGTH('Notifications','RecipientRole') IS NULL ALTER TABLE Notifications ADD RecipientRole NVARCHAR(50) NULL;\r\nIF COL_LENGTH('Notifications','RecipientUser') IS NULL ALTER TABLE Notifications ADD RecipientUser NVARCHAR(100) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string text = scope.ToLower();
				if (1 == 0)
				{
				}
				string text2 = text switch
				{
					"giangvien" => "GIANGVIEN", 
					"khoa" => "ALL_KHOA", 
					"truong" => "ALL_TRUONG", 
					_ => "ALL", 
				};
				if (1 == 0)
				{
				}
				string roleFilter = text2;
				string sql = "SELECT TOP 200 NotificationId, Recipient, Title, Message, Link, CreatedAt, IsRead, RecipientRole, RecipientUser\r\nFROM Notifications\r\nWHERE (Recipient = @r OR @r IN ('ALL'))\r\nAND (@u IS NULL OR RecipientUser=@u OR RecipientUser IS NULL)\r\nORDER BY CreatedAt DESC";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@r", roleFilter);
				cmd.Parameters.AddWithValue("@u", ((object)user) ?? ((object)DBNull.Value));
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				List<object> list = new List<object>();
				while (await rd.ReadAsync())
				{
					list.Add(new
					{
						NotificationId = rd["NotificationId"],
						Recipient = rd["Recipient"],
						Title = rd["Title"],
						Message = rd["Message"],
						Link = rd["Link"],
						CreatedAt = rd["CreatedAt"],
						IsRead = rd["IsRead"],
						RecipientRole = rd["RecipientRole"],
						RecipientUser = rd["RecipientUser"]
					});
				}
				return Results.Ok(list);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/notifications/{id}/read", (Func<Guid, Task<IResult>>)async delegate(Guid id)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand upd = new SqlCommand("UPDATE Notifications SET IsRead=1 WHERE NotificationId=@id", con))
				{
					upd.Parameters.AddWithValue("@id", id);
					await upd.ExecuteNonQueryAsync();
				}
				return Results.Ok(new
				{
					ok = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/students/{mssv}/registrations", (Func<string, Task<IResult>>)async delegate(string mssv)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				var result = (await QueryAsync(con, "\r\nSELECT\r\n    r.MaHD,\r\n    r.MSSV,\r\n    r.RegisteredAt,\r\n    r.Status,\r\n    r.IsEligibleForEvidence,\r\n    r.Notes,\r\n    h.TenHD,\r\n    -- EvidenceVerdict: lấy verdict mới nhất từ Evidence table cho sinh viên + hoạt động này\r\n    (SELECT TOP 1 Verdict FROM Evidence\r\n     WHERE StudentId = r.MSSV\r\n       AND ActivityName = h.TenHD\r\n       AND Status != 'Deleted'\r\n     ORDER BY UploadedAt DESC) AS EvidenceVerdict\r\nFROM ActivityRegistration r\r\nLEFT JOIN HoatDongTruong h ON h.MaHD = r.MaHD\r\nWHERE r.MSSV = @mssv\r\nORDER BY r.RegisteredAt DESC", new SqlParameter[1]
				{
					new SqlParameter("@mssv", mssv.Trim())
				})).Select((Dictionary<string, object> r) => new
				{
					MaHD = r["MaHD"]?.ToString()?.Trim(),
					MSSV = r["MSSV"]?.ToString()?.Trim(),
					TenHD = (r["TenHD"]?.ToString() ?? ""),
					RegisteredAt = r["RegisteredAt"],
					Status = (r["Status"]?.ToString() ?? "PENDING"),
					IsEligibleForEvidence = ((r["IsEligibleForEvidence"] is bool flag) ? flag : (r["IsEligibleForEvidence"] is DBNull || Convert.ToBoolean(r["IsEligibleForEvidence"] ?? ((object)true)))),
					EvidenceVerdict = (r["EvidenceVerdict"]?.ToString() ?? ""),
					Notes = (r["Notes"]?.ToString() ?? "")
				});
				return Results.Ok(result);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[ERROR] GET /api/students/" + mssv + "/registrations: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/students/{mssv}/registration-status/{maHD}", (Func<string, string, Task<IResult>>)async delegate(string mssv, string maHD)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<Dictionary<string, object?>> actRows = await QueryAsync(con, "SELECT TOP 1 TenHD FROM HoatDongTruong WHERE MaHD=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maHD.Trim())
				});
				if (actRows.Count == 0)
				{
					Console.WriteLine("[DEBUG] Activity not found: " + maHD);
					return Results.Ok(new
					{
						registered = false,
						isEligibleForEvidence = false,
						status = "NOT_FOUND",
						evidenceVerdict = ""
					});
				}
				string tenHD = actRows[0]["TenHD"]?.ToString() ?? "";
				string sql = "SELECT r.MaHD, r.MSSV, ISNULL(r.Status,'PENDING') AS Status\r\n                  FROM ActivityRegistrations r\r\n                  WHERE r.MSSV = @mssv AND r.MaHD = @maHD";
				if ((await QueryAsync(con, sql, new SqlParameter[2]
				{
					new SqlParameter("@mssv", mssv.Trim()),
					new SqlParameter("@maHD", maHD.Trim())
				})).Count == 0)
				{
					Console.WriteLine("[DEBUG] Student " + mssv + " NOT registered for activity " + maHD);
					return Results.Ok(new
					{
						registered = false,
						isEligibleForEvidence = false,
						status = "NOT_REGISTERED",
						evidenceVerdict = ""
					});
				}
				string evSql = "SELECT TOP 1 LOWER(ISNULL(Verdict, '')) AS Verdict\r\n                     FROM Evidence\r\n                     WHERE StudentId = @stu AND ActivityName = @actName AND Status != 'Deleted'\r\n                     ORDER BY UploadedAt DESC";
				List<Dictionary<string, object?>> evRows = await QueryAsync(con, evSql, new SqlParameter[2]
				{
					new SqlParameter("@stu", mssv.Trim()),
					new SqlParameter("@actName", tenHD)
				});
				string verdict = ((evRows.Count <= 0) ? "" : (evRows[0]["Verdict"]?.ToString() ?? ""));
				bool isEligible = string.IsNullOrEmpty(verdict);
				Console.WriteLine($"[DEBUG] GET /api/students/{mssv}/registration-status/{maHD}:");
				Console.WriteLine("  - Registered: true");
				Console.WriteLine("  - ActivityName: " + tenHD);
				Console.WriteLine("  - EvidenceVerdict: '" + verdict + "'");
				Console.WriteLine($"  - IsEligible: {isEligible}");
				return Results.Ok(new
				{
					registered = true,
					isEligibleForEvidence = isEligible,
					status = "REGISTERED",
					evidenceVerdict = verdict
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine($"[ERROR] GET /api/students/{mssv}/registration-status/{maHD}: {ex4.Message}");
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/hoatdong/{maHD}", (Func<string, Task<IResult>>)async delegate(string maHD)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "SELECT MaHD, TenHD, DiemRL, SoSvDK, NDHD, NgayBD, NgayKT, DiaDiem, TUKHOA\r\n                    FROM HoatDongTruong WHERE MaHD = @maHD";
				List<Dictionary<string, object?>> rows = await QueryAsync(con, sql, new SqlParameter[1]
				{
					new SqlParameter("@maHD", maHD)
				});
				if (rows.Count == 0)
				{
					return Results.NotFound();
				}
				return Results.Ok(rows[0]);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting activity detail: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/admin/activity-registrations", (Func<int?, Task<IResult>>)async delegate(int? top)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int limit = ((top.HasValue && top.Value > 0 && top.Value <= 2000) ? top.Value : 200);
				string sql = $"SELECT TOP ({limit})\r\n    ar.Id,\r\n    ar.MaHD,\r\n    ISNULL(h.TenHD, '') AS TenHD,\r\n    ar.MSSV,\r\n    ISNULL(sv.TenSV, '') AS TenSV,\r\n    ISNULL(sv.MaLop, '') AS MaLop,\r\n    ISNULL(lp.TenLop, '') AS TenLop,\r\n    ar.RegisteredAt,\r\n    ISNULL(ar.Status, 'PENDING') AS Status\r\nFROM ActivityRegistrations ar\r\nLEFT JOIN HoatDongTruong h ON h.MaHD = ar.MaHD\r\nLEFT JOIN SINHVIEN sv ON sv.MSSV = ar.MSSV\r\nLEFT JOIN Lop lp ON lp.MaLop = sv.MaLop\r\nORDER BY ar.RegisteredAt DESC";
				var list = (await QueryAsync(con, sql, Array.Empty<SqlParameter>())).Select((Dictionary<string, object> r) => new
				{
					Id = (r.ContainsKey("Id") ? r["Id"] : null),
					MaHD = ((!r.ContainsKey("MaHD")) ? "" : (r["MaHD"]?.ToString()?.Trim() ?? "")),
					TenHD = ((!r.ContainsKey("TenHD")) ? "" : (r["TenHD"]?.ToString() ?? "")),
					MSSV = ((!r.ContainsKey("MSSV")) ? "" : (r["MSSV"]?.ToString()?.Trim() ?? "")),
					TenSV = ((!r.ContainsKey("TenSV")) ? "" : (r["TenSV"]?.ToString() ?? "")),
					MaLop = ((!r.ContainsKey("MaLop")) ? "" : (r["MaLop"]?.ToString() ?? "")),
					TenLop = ((!r.ContainsKey("TenLop")) ? "" : (r["TenLop"]?.ToString() ?? "")),
					RegisteredAt = (r.ContainsKey("RegisteredAt") ? r["RegisteredAt"] : null),
					Status = ((!r.ContainsKey("Status")) ? "PENDING" : (r["Status"]?.ToString() ?? "PENDING"))
				});
				return Results.Ok(list);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[ERROR] GET /api/admin/activity-registrations: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/hoatdong/{maHD}", (Func<string, HoatDongDto, Task<IResult>>)async delegate(string maHD, HoatDongDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "UPDATE HoatDongTruong SET\r\n                        TenHD = @tenHD,\r\n                        DiemRL = @diemRL,\r\n                        SoSvDK = @soSvDK,\r\n                        NDHD = @ndHD,\r\n                        NgayBD = @ngayBD,\r\n                        NgayKT = @ngayKT,\r\n                        DiaDiem = @diaDiem,\r\n                        TUKHOA = @tuKhoa\r\n                    WHERE MaHD = @maHD";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddRange(new SqlParameter[9]
				{
					new SqlParameter("@tenHD", dto.TenHD),
					new SqlParameter("@diemRL", dto.DiemRL),
					new SqlParameter("@soSvDK", ((object)dto.SoSvDK) ?? DBNull.Value),
					new SqlParameter("@ndHD", ((object)dto.NDHD) ?? ((object)DBNull.Value)),
					new SqlParameter("@ngayBD", dto.NgayBD),
					new SqlParameter("@ngayKT", dto.NgayKT),
					new SqlParameter("@diaDiem", ((object)dto.DiaDiem) ?? ((object)DBNull.Value)),
					new SqlParameter("@tuKhoa", ((object)dto.TUKHOA) ?? ((object)DBNull.Value)),
					new SqlParameter("@maHD", maHD)
				});
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound();
				}
				try
				{
					string kw = dto.TUKHOA;
					string ctxName = null;
					if (!string.IsNullOrWhiteSpace(kw))
					{
						string norm = RemoveDiacritics(kw).ToLowerInvariant();
						if (norm.Contains("sankhau"))
						{
							ctxName = "SanKhau";
						}
						else if (norm.Contains("giangduong") || norm.Contains("hoitruong"))
						{
							ctxName = "GiangDuong";
						}
						else if (norm.Contains("ngoaitroi") || norm.Contains("outdoor"))
						{
							ctxName = "NgoaiTroi";
						}
						else if (norm.Contains("tronglop") || norm.Contains("classroom") || (norm.Contains("lop") && !norm.Contains("giangduong")))
						{
							ctxName = "TrongLop";
						}
					}
					if (ctxName != null)
					{
						using SqlCommand updCtx = new SqlCommand("UPDATE HoatDongTruong SET ContextId = (SELECT ContextId FROM ActivityContexts WHERE Name=@n) WHERE MaHD=@ma", con);
						updCtx.Parameters.AddWithValue("@n", ctxName);
						updCtx.Parameters.AddWithValue("@ma", maHD);
						await updCtx.ExecuteNonQueryAsync();
						Console.WriteLine("[Activity] UPDATE mapped keyword '" + kw + "' => " + ctxName);
					}
				}
				catch (Exception ex3)
				{
					Console.WriteLine("[Activity][WARN] Failed to update context mapping: " + ex3.Message);
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "UPDATE_ACTIVITY " + maHD);
				return Results.NoContent();
			}
			catch (Exception ex4)
			{
				Exception ex5 = ex4;
				Console.WriteLine("Error updating activity: " + ex5.Message);
				return Results.BadRequest(new
				{
					error = ex5.Message
				});
			}
		});
		app.MapDelete("/api/hoatdong/{maHD}", (Func<string, Task<IResult>>)async delegate(string maHD)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using DbTransaction tran = await con.BeginTransactionAsync();
				string sql = "DELETE FROM HoatDongTruong WHERE MaHD = @maHD";
				using SqlCommand cmd = new SqlCommand(sql, con, (SqlTransaction)tran);
				cmd.Parameters.Add(new SqlParameter("@maHD", maHD));
				int affected = await cmd.ExecuteNonQueryAsync();
				await tran.CommitAsync();
				if (affected == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y ho?t d?ng"
					});
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "DELETE_ACTIVITY " + maHD);
				return Results.NoContent();
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error deleting activity: " + ex4.Message);
				return Results.BadRequest(new
				{
					message = ex4.Message
				});
			}
		});
		app.MapGet("/api/hoatdong/{maHD}/location", (Func<string, Task<IResult>>)async delegate(string maHD)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("\r\nIF COL_LENGTH('HoatDongTruong','Latitude') IS NULL ALTER TABLE HoatDongTruong ADD Latitude FLOAT NULL;\r\nIF COL_LENGTH('HoatDongTruong','Longitude') IS NULL ALTER TABLE HoatDongTruong ADD Longitude FLOAT NULL;\r\nIF COL_LENGTH('HoatDongTruong','LocationUpdatedAt') IS NULL ALTER TABLE HoatDongTruong ADD LocationUpdatedAt DATETIME NULL;\r\nIF COL_LENGTH('HoatDongTruong','LocationUpdatedBy') IS NULL ALTER TABLE HoatDongTruong ADD LocationUpdatedBy NVARCHAR(100) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				List<Dictionary<string, object?>> rows = await QueryAsync(con, "SELECT Latitude, Longitude, LocationUpdatedAt, LocationUpdatedBy FROM HoatDongTruong WHERE MaHD=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maHD.Trim())
				});
				if (rows.Count == 0)
				{
					return Results.NotFound();
				}
				return Results.Ok(rows[0]);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/hoatdong/{maHD}/location", (Func<string, HttpRequest, HttpContext, Task<IResult>>)async delegate(string maHD, HttpRequest req, HttpContext ctx)
		{
			try
			{
				if (!double.TryParse(req.Query["lat"], out var lat) || !double.TryParse(req.Query["lng"], out var lng))
				{
					return Results.BadRequest(new
					{
						message = "Thi?u ho?c sai d?nh d?ng lat/lng"
					});
				}
				string user = req.Headers["X-User"].ToString();
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("\r\nIF COL_LENGTH('HoatDongTruong','Latitude') IS NULL ALTER TABLE HoatDongTruong ADD Latitude FLOAT NULL;\r\nIF COL_LENGTH('HoatDongTruong','Longitude') IS NULL ALTER TABLE HoatDongTruong ADD Longitude FLOAT NULL;\r\nIF COL_LENGTH('HoatDongTruong','LocationUpdatedAt') IS NULL ALTER TABLE HoatDongTruong ADD LocationUpdatedAt DATETIME NULL;\r\nIF COL_LENGTH('HoatDongTruong','LocationUpdatedBy') IS NULL ALTER TABLE HoatDongTruong ADD LocationUpdatedBy NVARCHAR(100) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				List<Dictionary<string, object?>> chk = await QueryAsync(con, "SELECT Latitude, Longitude FROM HoatDongTruong WHERE MaHD=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maHD.Trim())
				});
				if (chk.Count == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y ho?t d?ng"
					});
				}
				bool has = chk[0]["Latitude"] != null && chk[0]["Longitude"] != null;
				string before = null;
				if (has)
				{
					try
					{
						object la0 = chk[0]["Latitude"];
						object lo0 = chk[0]["Longitude"];
						if (la0 != null && lo0 != null)
						{
							before = $"{Convert.ToDouble(la0):0.######},{Convert.ToDouble(lo0):0.######}";
						}
					}
					catch
					{
					}
				}
				using (SqlCommand upd = new SqlCommand("UPDATE HoatDongTruong SET Latitude=@la, Longitude=@lo, LocationUpdatedAt=GETDATE(), LocationUpdatedBy=@u WHERE MaHD=@m", con))
				{
					upd.Parameters.AddWithValue("@la", lat);
					upd.Parameters.AddWithValue("@lo", lng);
					upd.Parameters.AddWithValue("@u", ((object)user) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@m", maHD.Trim());
					await upd.ExecuteNonQueryAsync();
				}
				if (has)
				{
					try
					{
						await LogAsync(ctx, con, $"UPDATE_ACTIVITY_LOCATION {maHD} {before ?? "-"} -> {lat:0.######},{lng:0.######}");
					}
					catch
					{
					}
				}
				else
				{
					try
					{
						await LogAsync(ctx, con, $"ADD_ACTIVITY_LOCATION {maHD} {lat:0.######},{lng:0.######}");
					}
					catch
					{
					}
				}
				return Results.Ok(new
				{
					added = !has,
					updated = has
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/hoatdong/{maHD}/location", (Func<string, HttpRequest, HttpContext, Task<IResult>>)async delegate(string maHD, HttpRequest req, HttpContext ctx)
		{
			try
			{
				if (!double.TryParse(req.Query["lat"], out var lat) || !double.TryParse(req.Query["lng"], out var lng))
				{
					return Results.BadRequest(new
					{
						message = "Thi?u ho?c sai d?nh d?ng lat/lng"
					});
				}
				string user = req.Headers["X-User"].ToString();
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("\r\nIF COL_LENGTH('HoatDongTruong','Latitude') IS NULL ALTER TABLE HoatDongTruong ADD Latitude FLOAT NULL;\r\nIF COL_LENGTH('HoatDongTruong','Longitude') IS NULL ALTER TABLE HoatDongTruong ADD Longitude FLOAT NULL;\r\nIF COL_LENGTH('HoatDongTruong','LocationUpdatedAt') IS NULL ALTER TABLE HoatDongTruong ADD LocationUpdatedAt DATETIME NULL;\r\nIF COL_LENGTH('HoatDongTruong','LocationUpdatedBy') IS NULL ALTER TABLE HoatDongTruong ADD LocationUpdatedBy NVARCHAR(100) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				List<Dictionary<string, object?>> prev = await QueryAsync(con, "SELECT Latitude, Longitude FROM HoatDongTruong WHERE MaHD=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maHD.Trim())
				});
				if (prev.Count == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y ho?t d?ng"
					});
				}
				string before = null;
				try
				{
					object la0 = prev[0]["Latitude"];
					object lo0 = prev[0]["Longitude"];
					if (la0 != null && lo0 != null)
					{
						before = $"{Convert.ToDouble(la0):0.######},{Convert.ToDouble(lo0):0.######}";
					}
				}
				catch
				{
				}
				using (SqlCommand upd = new SqlCommand("UPDATE HoatDongTruong SET Latitude=@la, Longitude=@lo, LocationUpdatedAt=GETDATE(), LocationUpdatedBy=@u WHERE MaHD=@m", con))
				{
					upd.Parameters.AddWithValue("@la", lat);
					upd.Parameters.AddWithValue("@lo", lng);
					upd.Parameters.AddWithValue("@u", ((object)user) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@m", maHD.Trim());
					await upd.ExecuteNonQueryAsync();
				}
				try
				{
					await LogAsync(ctx, con, $"UPDATE_ACTIVITY_LOCATION {maHD} {before ?? "-"} -> {lat:0.######},{lng:0.######}");
				}
				catch
				{
				}
				return Results.Ok(new
				{
					updated = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/activities/{maHD}/generate-qr", (Func<string, HttpRequest, HttpContext, Task<IResult>>)async delegate(string maHD, HttpRequest req, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("\r\nIF COL_LENGTH('HoatDongTruong','QrCodeData') IS NULL ALTER TABLE HoatDongTruong ADD QrCodeData VARBINARY(MAX) NULL;\r\nIF COL_LENGTH('HoatDongTruong','QrCreatedAt') IS NULL ALTER TABLE HoatDongTruong ADD QrCreatedAt DATETIME NULL;\r\nIF COL_LENGTH('HoatDongTruong','QrCreatedBy') IS NULL ALTER TABLE HoatDongTruong ADD QrCreatedBy NVARCHAR(100) NULL;\r\nIF COL_LENGTH('HoatDongTruong','QrLatitude') IS NULL ALTER TABLE HoatDongTruong ADD QrLatitude FLOAT NULL;\r\nIF COL_LENGTH('HoatDongTruong','QrLongitude') IS NULL ALTER TABLE HoatDongTruong ADD QrLongitude FLOAT NULL;\r\nIF COL_LENGTH('HoatDongTruong','QrLocationCapturedAt') IS NULL ALTER TABLE HoatDongTruong ADD QrLocationCapturedAt DATETIME NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				if ((await QueryAsync(con, "SELECT MaHD FROM HoatDongTruong WHERE MaHD=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maHD.Trim())
				})).Count == 0)
				{
					return Results.NotFound(new
					{
						error = "Không tìm thấy hoạt động"
					});
				}
				List<Dictionary<string, object?>> actInfo = await QueryAsync(con, "SELECT TOP 1 TenHD, DiemRL FROM HoatDongTruong WHERE MaHD=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maHD.Trim())
				});
				string tenHD = ((actInfo.Count <= 0) ? "" : (actInfo[0]["TenHD"]?.ToString() ?? ""));
				int diemRL = ((actInfo.Count > 0 && actInfo[0]["DiemRL"] != DBNull.Value) ? Convert.ToInt32(actInfo[0]["DiemRL"]) : 0);
				double? lat = null;
				double? lng = null;
				if (double.TryParse(req.Query["lat"], out var latVal) && double.TryParse(req.Query["lng"], out var lngVal))
				{
					lat = latVal;
					lng = lngVal;
				}
				string qrContent = JsonSerializer.Serialize(new
				{
					maHD = maHD.Trim(),
					tenHD = tenHD,
					diemRL = diemRL
				});
				byte[] pngBytes;
				using (QRCodeGenerator qrGenerator = new QRCodeGenerator())
				{
					QRCodeData qrData = qrGenerator.CreateQrCode(qrContent, QRCodeGenerator.ECCLevel.Q);
					using PngByteQRCode qrCode = new PngByteQRCode(qrData);
					pngBytes = qrCode.GetGraphic(10);
				}
				string createdBy = req.Query["createdBy"].ToString();
				if (string.IsNullOrEmpty(createdBy))
				{
					createdBy = req.Headers["X-User"].ToString();
				}
				if (string.IsNullOrEmpty(createdBy))
				{
					createdBy = "SYSTEM";
				}
				string sql = ((lat.HasValue && lng.HasValue) ? "UPDATE HoatDongTruong SET QrCodeData=@d, QrCreatedAt=GETDATE(), QrCreatedBy=@u,\r\n                QrLatitude=@la, QrLongitude=@lo, QrLocationCapturedAt=GETDATE() WHERE MaHD=@m" : "UPDATE HoatDongTruong SET QrCodeData=@d, QrCreatedAt=GETDATE(), QrCreatedBy=@u WHERE MaHD=@m");
				using (SqlCommand cmd = new SqlCommand(sql, con))
				{
					cmd.Parameters.AddWithValue("@d", pngBytes);
					cmd.Parameters.AddWithValue("@u", ((object)createdBy) ?? ((object)DBNull.Value));
					cmd.Parameters.AddWithValue("@m", maHD.Trim());
					if (lat.HasValue && lng.HasValue)
					{
						cmd.Parameters.AddWithValue("@la", lat.Value);
						cmd.Parameters.AddWithValue("@lo", lng.Value);
					}
					await cmd.ExecuteNonQueryAsync();
				}
				try
				{
					await LogAsync(ctx, con, "GENERATE_QR " + maHD + " by " + createdBy);
				}
				catch
				{
				}
				return Results.Ok(new
				{
					success = true,
					maHD = maHD.Trim(),
					qrContent = qrContent
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error generating QR: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/activities/{maHD}/qr", (Func<string, Task<IResult>>)async delegate(string maHD)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("\r\nIF COL_LENGTH('HoatDongTruong','QrCodeData') IS NULL ALTER TABLE HoatDongTruong ADD QrCodeData VARBINARY(MAX) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				List<Dictionary<string, object?>> rows = await QueryAsync(con, "SELECT QrCodeData FROM HoatDongTruong WHERE MaHD=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maHD.Trim())
				});
				if (rows.Count == 0)
				{
					return Results.NotFound();
				}
				object raw = rows[0]["QrCodeData"];
				if (raw == null || raw == DBNull.Value)
				{
					return Results.NotFound();
				}
				byte[] pngBytes = (byte[])raw;
				return Results.File(pngBytes, "image/png");
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/activities/{maHD}/qr-info", (Func<string, Task<IResult>>)async delegate(string maHD)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("\r\nIF COL_LENGTH('HoatDongTruong','QrCodeData') IS NULL ALTER TABLE HoatDongTruong ADD QrCodeData VARBINARY(MAX) NULL;\r\nIF COL_LENGTH('HoatDongTruong','QrCreatedAt') IS NULL ALTER TABLE HoatDongTruong ADD QrCreatedAt DATETIME NULL;\r\nIF COL_LENGTH('HoatDongTruong','QrCreatedBy') IS NULL ALTER TABLE HoatDongTruong ADD QrCreatedBy NVARCHAR(100) NULL;\r\nIF COL_LENGTH('HoatDongTruong','QrLatitude') IS NULL ALTER TABLE HoatDongTruong ADD QrLatitude FLOAT NULL;\r\nIF COL_LENGTH('HoatDongTruong','QrLongitude') IS NULL ALTER TABLE HoatDongTruong ADD QrLongitude FLOAT NULL;\r\nIF COL_LENGTH('HoatDongTruong','QrLocationCapturedAt') IS NULL ALTER TABLE HoatDongTruong ADD QrLocationCapturedAt DATETIME NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				List<Dictionary<string, object?>> rows = await QueryAsync(con, "SELECT QrCreatedAt, QrCreatedBy, QrLatitude, QrLongitude, QrLocationCapturedAt,\r\n            CASE WHEN QrCodeData IS NOT NULL THEN 1 ELSE 0 END AS HasQR\r\n            FROM HoatDongTruong WHERE MaHD=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maHD.Trim())
				});
				if (rows.Count == 0)
				{
					return Results.NotFound();
				}
				return Results.Ok(rows[0]);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/khoa", (Func<KhoaDto, Task<IResult>>)async delegate(KhoaDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if ((await QueryAsync(con, "SELECT 1 FROM KHOA WHERE MaKH = @maKH", new SqlParameter[1]
				{
					new SqlParameter("@maKH", dto.MaKH)
				})).Count > 0)
				{
					return Results.BadRequest(new
					{
						message = "M\ufffd khoa d\ufffd t?n t?i"
					});
				}
				string sql = "INSERT INTO KHOA (MaKH, TenKhoa) VALUES (@maKH, @tenKhoa)";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@maKH", dto.MaKH));
				cmd.Parameters.Add(new SqlParameter("@tenKhoa", dto.TenKhoa));
				await cmd.ExecuteNonQueryAsync();
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "ADD_KHOA " + dto.MaKH);
				return Results.Ok(new
				{
					message = "Th\ufffdm khoa th\ufffdnh c\ufffdng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error adding faculty: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/khoa/{maKH}", (Func<string, KhoaDto, Task<IResult>>)async delegate(string maKH, KhoaDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "UPDATE KHOA SET TenKhoa = @tenKhoa WHERE MaKH = @maKH";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@tenKhoa", dto.TenKhoa));
				cmd.Parameters.Add(new SqlParameter("@maKH", maKH));
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y khoa"
					});
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "UPDATE_KHOA " + maKH);
				return Results.Ok(new
				{
					message = "C?p nh?t khoa th\ufffdnh c\ufffdng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error updating faculty: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapDelete("/api/khoa/{maKH}", (Func<string, Task<IResult>>)async delegate(string maKH)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "DELETE FROM KHOA WHERE MaKH = @maKH";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@maKH", maKH));
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y khoa"
					});
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "DELETE_KHOA " + maKH);
				return Results.NoContent();
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error deleting faculty: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/lop", (Func<LopDto, Task<IResult>>)async delegate(LopDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if ((await QueryAsync(con, "SELECT 1 FROM Lop WHERE MaLop = @maLop", new SqlParameter[1]
				{
					new SqlParameter("@maLop", dto.MaLop)
				})).Count > 0)
				{
					return Results.BadRequest(new
					{
						message = "M\ufffd l?p d\ufffd t?n t?i"
					});
				}
				if ((await QueryAsync(con, "SELECT 1 FROM KHOA WHERE MaKH = @maKH", new SqlParameter[1]
				{
					new SqlParameter("@maKH", dto.MaKH)
				})).Count == 0)
				{
					return Results.BadRequest(new
					{
						message = "Khoa kh\ufffdng t?n t?i"
					});
				}
				string sql = "INSERT INTO Lop (MaLop, TenLop, MaKH) VALUES (@maLop, @tenLop, @maKH)";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@maLop", dto.MaLop));
				cmd.Parameters.Add(new SqlParameter("@tenLop", dto.TenLop));
				cmd.Parameters.Add(new SqlParameter("@maKH", dto.MaKH));
				await cmd.ExecuteNonQueryAsync();
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "ADD_LOP " + dto.MaLop);
				return Results.Ok(new
				{
					message = "Th\ufffdm l?p th\ufffdnh c\ufffdng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error adding class: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/lop/{maLop}", (Func<string, LopDto, Task<IResult>>)async delegate(string maLop, LopDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if (!string.IsNullOrWhiteSpace(dto.MaKH) && (await QueryAsync(con, "SELECT 1 FROM KHOA WHERE MaKH = @maKH", new SqlParameter[1]
				{
					new SqlParameter("@maKH", dto.MaKH)
				})).Count == 0)
				{
					return Results.BadRequest(new
					{
						message = "Khoa kh\ufffdng t?n t?i"
					});
				}
				string sql = "UPDATE Lop SET TenLop = @tenLop, MaKH = @maKH WHERE MaLop = @maLop";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@tenLop", dto.TenLop));
				cmd.Parameters.Add(new SqlParameter("@maKH", dto.MaKH));
				cmd.Parameters.Add(new SqlParameter("@maLop", maLop));
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y l?p"
					});
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "UPDATE_LOP " + maLop);
				return Results.Ok(new
				{
					message = "C?p nh?t l?p th\ufffdnh c\ufffdng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error updating class: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapDelete("/api/lop/{maLop}", (Func<string, Task<IResult>>)async delegate(string maLop)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "DELETE FROM Lop WHERE MaLop = @maLop";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@maLop", maLop));
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y l?p"
					});
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "DELETE_LOP " + maLop);
				return Results.NoContent();
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error deleting class: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/lecturers/{maGV}/classes", (Func<string, Task<IResult>>)async delegate(string maGV)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<string> resolvedIds = new List<string> { maGV.Trim() };
				try
				{
					foreach (Dictionary<string, object> r in await QueryAsync(con, "SELECT MaCaNhan FROM TK WHERE TenTK=@id OR MaCaNhan=@id", new SqlParameter[1]
					{
						new SqlParameter("@id", maGV.Trim())
					}))
					{
						string mc = r["MaCaNhan"]?.ToString();
						if (!string.IsNullOrWhiteSpace(mc))
						{
							resolvedIds.Add(mc.Trim());
						}
					}
				}
				catch
				{
				}
				resolvedIds = resolvedIds.Distinct<string>(StringComparer.OrdinalIgnoreCase).ToList();
				string inParams = string.Join(",", resolvedIds.Select((string _, int i) => "@id" + i));
				SqlParameter[] sqlParams = resolvedIds.Select((string id, int i) => new SqlParameter("@id" + i, id)).ToArray();
				string sql = "\r\nSELECT L.MaLop, L.TenLop, L.MaKH, K.TenKhoa\r\nFROM Lop L\r\nLEFT JOIN KHOA K ON K.MaKH = L.MaKH\r\nWHERE L.MaLop IN (\r\n    SELECT GV.LopCV FROM GiangVien GV WHERE GV.MaCaNhan IN (" + inParams + ") AND GV.LopCV IS NOT NULL\r\n)\r\nORDER BY L.TenLop";
				List<Dictionary<string, object?>> result = await QueryAsync(con, sql, sqlParams);
				if (result.Count == 0)
				{
					string sqlAll = "\r\nSELECT L.MaLop, L.TenLop, L.MaKH, K.TenKhoa\r\nFROM Lop L\r\nLEFT JOIN KHOA K ON K.MaKH = L.MaKH\r\nORDER BY K.TenKhoa, L.TenLop";
					result = await QueryAsync(con, sqlAll, Array.Empty<SqlParameter>());
				}
				var lopList = result.Select((Dictionary<string, object> row) => new
				{
					MaLop = (row["MaLop"]?.ToString() ?? ""),
					TenLop = (row["TenLop"]?.ToString() ?? ""),
					MaKH = (row["MaKH"]?.ToString() ?? ""),
					TenKhoa = (row["TenKhoa"]?.ToString() ?? "")
				}).ToList();
				return Results.Ok(lopList);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting lecturer classes: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/reports/years", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "SELECT DISTINCT NamHoc FROM PhieuDanhGia WHERE NamHoc IS NOT NULL ORDER BY NamHoc DESC";
				List<string> years = (from r in await QueryAsync(con, sql, Array.Empty<SqlParameter>())
					select r["NamHoc"]?.ToString() ?? "" into y
					where y != ""
					select y).ToList();
				if (years.Count == 0)
				{
					int currentYear = DateTime.Now.Year;
					years.Add($"{currentYear - 1}-{currentYear}");
				}
				return Results.Ok(years);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting report years: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/reports/class/{maLop}/students", (Func<string, string, int?, HttpContext, Task<IResult>>)async delegate(string maLop, string? namHoc, int? hocKi, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string gv = ctx.Request.Headers["X-User"].FirstOrDefault();
				HashSet<string> authorizedClasses = new HashSet<string>();
				if (!string.IsNullOrWhiteSpace(gv))
				{
					foreach (string c in await GetLecturerClassesByLopCVAsync(con, gv))
					{
						authorizedClasses.Add(c);
					}
					try
					{
						HashSet<string> ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { gv.Trim() };
						List<Dictionary<string, object?>> tkRows = await QueryAsync(con, "SELECT TOP 1 MaCaNhan FROM TK WHERE MaCaNhan=@id OR TenTK=@id", new SqlParameter[1]
						{
							new SqlParameter("@id", gv.Trim())
						});
						if (tkRows.Count > 0)
						{
							object mcV;
							string mc = ((!tkRows[0].TryGetValue("MaCaNhan", out mcV)) ? null : mcV?.ToString());
							if (!string.IsNullOrWhiteSpace(mc))
							{
								ids.Add(mc.Trim());
							}
						}
						List<SqlParameter> prms = new List<SqlParameter>();
						List<string> conds = new List<string>();
						int i = 0;
						foreach (string id in ids)
						{
							string pn = "@gvmc" + i++;
							prms.Add(new SqlParameter(pn, id));
							conds.Add("UPPER(GL.MaGV) = UPPER(" + pn + ")");
						}
						if (conds.Count > 0)
						{
							foreach (Dictionary<string, object> r in await QueryAsync(con, "SELECT DISTINCT GL.MaLop\r\nFROM GVLOP GL\r\nWHERE (" + string.Join(" OR ", conds) + ")", prms.ToArray()))
							{
								object v;
								string lop = ((!r.TryGetValue("MaLop", out v)) ? null : v?.ToString());
								if (!string.IsNullOrWhiteSpace(lop))
								{
									authorizedClasses.Add(lop.Trim());
								}
								v = null;
							}
						}
					}
					catch
					{
					}
				}
				if (authorizedClasses.Count == 0)
				{
					return Results.Ok(Array.Empty<object>());
				}
				if (!authorizedClasses.Contains(maLop.Trim()))
				{
					return Results.Forbid();
				}
				List<string> filters = new List<string> { "SV.MaLop = @maLop" };
				List<SqlParameter> sqlParams = new List<SqlParameter>
				{
					new SqlParameter("@maLop", maLop.Trim())
				};
				if (!string.IsNullOrEmpty(namHoc))
				{
					filters.Add("(LD.NamHoc = @namHoc OR LD.NamHoc IS NULL)");
					sqlParams.Add(new SqlParameter("@namHoc", namHoc));
				}
				if (hocKi.HasValue)
				{
					filters.Add("(LD.HocKi = @hocKi OR LD.HocKi IS NULL)");
					sqlParams.Add(new SqlParameter("@hocKi", hocKi.Value));
				}
				string whereClause = string.Join(" AND ", filters);
				string sql = $"\r\nSELECT\r\n    SV.MSSV,\r\n    SV.TenSV  AS HoTen,\r\n    SV.MaLop,\r\n    L.TenLop,\r\n    LD.NamHoc,\r\n    LD.HocKi,\r\n    LD.TongDRL,\r\n    LD.viphamNT,\r\n    LD.viphamXH,\r\n    LD.TGNCKH\r\nFROM SINHVIEN SV\r\nLEFT JOIN Lop L ON L.MaLop = SV.MaLop\r\nLEFT JOIN LUUTRUDIEMSV LD ON LD.MSSV = SV.MSSV\r\n    {((!string.IsNullOrEmpty(namHoc) || hocKi.HasValue) ? "" : "AND LD.NamHoc = (SELECT TOP 1 NamHoc FROM LUUTRUDIEMSV WHERE MSSV=SV.MSSV ORDER BY NamHoc DESC)")}\r\nWHERE {whereClause}\r\nORDER BY SV.TenSV";
				var result = (await QueryAsync(con, sql, sqlParams.ToArray())).Select((Dictionary<string, object> dictionary) => new
				{
					MSSV = (dictionary["MSSV"]?.ToString() ?? ""),
					HoTen = (dictionary["HoTen"]?.ToString() ?? ""),
					TenSV = (dictionary["HoTen"]?.ToString() ?? ""),
					MaLop = (dictionary["MaLop"]?.ToString() ?? ""),
					TenLop = (dictionary["TenLop"]?.ToString() ?? ""),
					NamHoc = (dictionary["NamHoc"]?.ToString() ?? ""),
					HocKi = ((dictionary["HocKi"] is DBNull || dictionary["HocKi"] == null) ? ((int?)null) : new int?(Convert.ToInt32(dictionary["HocKi"]))),
					TongDRL = ((dictionary["TongDRL"] is DBNull || dictionary["TongDRL"] == null) ? ((decimal?)null) : new decimal?(Convert.ToDecimal(dictionary["TongDRL"]))),
					viphamNT = ((!(dictionary["viphamNT"] is DBNull) && dictionary["viphamNT"] != null) ? Convert.ToInt32(dictionary["viphamNT"]) : 0),
					viphamXH = ((!(dictionary["viphamXH"] is DBNull) && dictionary["viphamXH"] != null) ? Convert.ToInt32(dictionary["viphamXH"]) : 0),
					TGNCKH = (!(dictionary["TGNCKH"] is DBNull) && dictionary["TGNCKH"] != null && Convert.ToBoolean(dictionary["TGNCKH"]))
				}).ToList();
				return Results.Ok(result);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[reports/class] Error: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/my-students", (Func<HttpContext, Task<IResult>>)async delegate(HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string gv = ctx.Request.Headers["X-User"].FirstOrDefault();
				if (string.IsNullOrWhiteSpace(gv))
				{
					return Results.Unauthorized();
				}
				List<Dictionary<string, object?>> tkRows = await QueryAsync(con, "SELECT TOP 1 MaCaNhan FROM TK WHERE MaCaNhan=@id OR TenTK=@id", new SqlParameter[1]
				{
					new SqlParameter("@id", gv.Trim())
				});
				if (tkRows.Count == 0)
				{
					return Results.Unauthorized();
				}
				object mcV;
				string maCaNhan = ((!tkRows[0].TryGetValue("MaCaNhan", out mcV)) ? null : mcV?.ToString());
				if (string.IsNullOrWhiteSpace(maCaNhan))
				{
					return Results.Unauthorized();
				}
				List<Dictionary<string, object?>> gvlopRows = await QueryAsync(con, "SELECT DISTINCT LopCV as MaLop FROM GiangVien WHERE MaCaNhan = @gv", new SqlParameter[1]
				{
					new SqlParameter("@gv", maCaNhan)
				});
				if (gvlopRows.Count == 0)
				{
					return Results.Ok(Array.Empty<object>());
				}
				List<string> classes = (from r in gvlopRows
					select r["MaLop"]?.ToString() into c
					where !string.IsNullOrEmpty(c)
					select c).ToList();
				List<string> inParts = new List<string>();
				List<SqlParameter> sqlParams = new List<SqlParameter>();
				for (int i = 0; i < classes.Count; i++)
				{
					string pn = "@cls" + i;
					inParts.Add(pn);
					sqlParams.Add(new SqlParameter(pn, classes[i]));
				}
				string sql = "\r\nSELECT\r\n    SV.MSSV,\r\n    SV.TenSV  AS HoTen,\r\n    SV.MaLop,\r\n    L.TenLop,\r\n    LD.NamHoc,\r\n    LD.HocKi,\r\n    LD.TongDRL,\r\n    LD.viphamNT,\r\n    LD.viphamXH,\r\n    LD.TGNCKH\r\nFROM SINHVIEN SV\r\nLEFT JOIN Lop L ON L.MaLop = SV.MaLop\r\nLEFT JOIN LUUTRUDIEMSV LD ON LD.MSSV = SV.MSSV\r\n    AND LD.NamHoc = (SELECT TOP 1 NamHoc FROM LUUTRUDIEMSV WHERE MSSV=SV.MSSV ORDER BY NamHoc DESC)\r\nWHERE SV.MaLop IN (" + string.Join(",", inParts) + ")\r\nORDER BY SV.TenSV";
				var result = (await QueryAsync(con, sql, sqlParams.ToArray())).Select((Dictionary<string, object> r) => new
				{
					MSSV = (r["MSSV"]?.ToString() ?? ""),
					HoTen = (r["HoTen"]?.ToString() ?? ""),
					TenSV = (r["HoTen"]?.ToString() ?? ""),
					MaLop = (r["MaLop"]?.ToString() ?? ""),
					TenLop = (r["TenLop"]?.ToString() ?? ""),
					NamHoc = (r["NamHoc"]?.ToString() ?? ""),
					HocKi = ((r["HocKi"] is DBNull || r["HocKi"] == null) ? ((int?)null) : new int?(Convert.ToInt32(r["HocKi"]))),
					TongDRL = ((r["TongDRL"] is DBNull || r["TongDRL"] == null) ? ((decimal?)null) : new decimal?(Convert.ToDecimal(r["TongDRL"]))),
					viphamNT = ((!(r["viphamNT"] is DBNull) && r["viphamNT"] != null) ? Convert.ToInt32(r["viphamNT"]) : 0),
					viphamXH = ((!(r["viphamXH"] is DBNull) && r["viphamXH"] != null) ? Convert.ToInt32(r["viphamXH"]) : 0),
					TGNCKH = (!(r["TGNCKH"] is DBNull) && r["TGNCKH"] != null && Convert.ToBoolean(r["TGNCKH"]))
				}).ToList();
				return Results.Ok(result);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[my-students] Error: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/reports/summary", (Func<int?, Task<IResult>>)async delegate(int? year)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string yFilter = (year.HasValue ? "AND LD.NamHoc = @y" : "");
				string yFilterSub = (year.HasValue ? "AND NamHoc = @y" : "");
				SqlParameter[] ps = ((!year.HasValue) ? Array.Empty<SqlParameter>() : new SqlParameter[1]
				{
					new SqlParameter("@y", year.Value)
				});
				string sql = $"\r\nSELECT\r\n    COUNT(DISTINCT SV.MSSV) AS TotalStudents,\r\n    COUNT(DISTINCT L.MaLop)  AS TotalClasses,\r\n    ISNULL(AVG(CAST(LD.TongDRL AS FLOAT)),0) AS AverageScore,\r\n    SUM(CASE WHEN LD.TongDRL >= 90 THEN 1 ELSE 0 END) AS ExcellentCount,\r\n    SUM(CASE WHEN LD.TongDRL >= 80 AND LD.TongDRL < 90 THEN 1 ELSE 0 END) AS GoodCount,\r\n    SUM(CASE WHEN LD.TongDRL >= 70 AND LD.TongDRL < 80 THEN 1 ELSE 0 END) AS FairCount,\r\n    SUM(CASE WHEN LD.TongDRL >= 60 AND LD.TongDRL < 70 THEN 1 ELSE 0 END) AS AverageCount,\r\n    SUM(CASE WHEN LD.TongDRL < 60  AND LD.TongDRL IS NOT NULL THEN 1 ELSE 0 END) AS PoorCount,\r\n    (SELECT COUNT(*) FROM HoatDongTruong) AS TotalActivities,\r\n    (SELECT COUNT(DISTINCT MSSV) FROM LUUTRUDIEMSV WHERE ISNULL(TGNCKH,0)=1 {yFilterSub}) AS StudentsWithResearch,\r\n    (SELECT COUNT(DISTINCT MSSV) FROM LUUTRUDIEMSV WHERE ISNULL(viphamNT,0)>0 {yFilterSub}) AS StudentsWithSchoolViolations,\r\n    (SELECT COUNT(DISTINCT MSSV) FROM LUUTRUDIEMSV WHERE ISNULL(viphamXH,0)>0 {yFilterSub}) AS StudentsWithSocialViolations\r\nFROM SINHVIEN SV\r\nLEFT JOIN Lop L ON L.MaLop = SV.MaLop\r\nLEFT JOIN LUUTRUDIEMSV LD ON LD.MSSV = SV.MSSV {yFilter}";
				List<Dictionary<string, object?>> rows = await QueryAsync(con, sql, ps);
				if (rows.Count == 0)
				{
					return Results.Ok(new
					{
						TotalStudents = 0,
						TotalClasses = 0,
						AverageScore = 0.0,
						ExcellentCount = 0,
						GoodCount = 0,
						FairCount = 0,
						AverageCount = 0,
						PoorCount = 0,
						TotalActivities = 0,
						StudentsWithResearch = 0,
						StudentsWithSchoolViolations = 0,
						StudentsWithSocialViolations = 0
					});
				}
				Dictionary<string, object?> r = rows[0];
				return Results.Ok(new
				{
					TotalStudents = Int("TotalStudents"),
					TotalClasses = Int("TotalClasses"),
					AverageScore = Math.Round(Dbl("AverageScore"), 1),
					ExcellentCount = Int("ExcellentCount"),
					GoodCount = Int("GoodCount"),
					FairCount = Int("FairCount"),
					AverageCount = Int("AverageCount"),
					PoorCount = Int("PoorCount"),
					TotalActivities = Int("TotalActivities"),
					StudentsWithResearch = Int("StudentsWithResearch"),
					StudentsWithSchoolViolations = Int("StudentsWithSchoolViolations"),
					StudentsWithSocialViolations = Int("StudentsWithSocialViolations")
				});
				double Dbl(string k)
				{
					return (r[k] is DBNull || r[k] == null) ? 0.0 : Convert.ToDouble(r[k]);
				}
				int Int(string k)
				{
					return (!(r[k] is DBNull) && r[k] != null) ? Convert.ToInt32(r[k]) : 0;
				}
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[reports/summary] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/reports/faculty", (Func<int?, Task<IResult>>)async delegate(int? year)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string yFilter = (year.HasValue ? "AND LD.NamHoc = @y" : "");
				SqlParameter[] ps = ((!year.HasValue) ? Array.Empty<SqlParameter>() : new SqlParameter[1]
				{
					new SqlParameter("@y", year.Value)
				});
				string sql = "\r\nSELECT\r\n    K.MaKH, K.TenKhoa,\r\n    COUNT(DISTINCT L.MaLop)  AS TotalClasses,\r\n    COUNT(DISTINCT SV.MSSV)  AS TotalStudents,\r\n    ISNULL(AVG(CAST(LD.TongDRL AS FLOAT)),0) AS AverageScore,\r\n    SUM(CASE WHEN LD.TongDRL >= 90 THEN 1 ELSE 0 END) AS ExcellentCount,\r\n    SUM(CASE WHEN LD.TongDRL >= 80 AND LD.TongDRL < 90 THEN 1 ELSE 0 END) AS GoodCount,\r\n    SUM(CASE WHEN LD.TongDRL >= 70 AND LD.TongDRL < 80 THEN 1 ELSE 0 END) AS FairCount,\r\n    SUM(CASE WHEN LD.TongDRL >= 60 AND LD.TongDRL < 70 THEN 1 ELSE 0 END) AS AverageCount,\r\n    SUM(CASE WHEN LD.TongDRL < 60  AND LD.TongDRL IS NOT NULL THEN 1 ELSE 0 END) AS PoorCount\r\nFROM KHOA K\r\nLEFT JOIN Lop L ON L.MaKH = K.MaKH\r\nLEFT JOIN SINHVIEN SV ON SV.MaLop = L.MaLop\r\nLEFT JOIN LUUTRUDIEMSV LD ON LD.MSSV = SV.MSSV " + yFilter + "\r\nGROUP BY K.MaKH, K.TenKhoa\r\nORDER BY K.TenKhoa";
				var result = (await QueryAsync(con, sql, ps)).Select((Dictionary<string, object> r) => new
				{
					MaKH = r["MaKH"]?.ToString(),
					TenKhoa = r["TenKhoa"]?.ToString(),
					TotalClasses = ((!(r["TotalClasses"] is DBNull)) ? Convert.ToInt32(r["TotalClasses"]) : 0),
					TotalStudents = ((!(r["TotalStudents"] is DBNull)) ? Convert.ToInt32(r["TotalStudents"]) : 0),
					AverageScore = ((r["AverageScore"] is DBNull) ? 0.0 : Math.Round(Convert.ToDouble(r["AverageScore"]), 1)),
					ExcellentCount = ((!(r["ExcellentCount"] is DBNull)) ? Convert.ToInt32(r["ExcellentCount"]) : 0),
					GoodCount = ((!(r["GoodCount"] is DBNull)) ? Convert.ToInt32(r["GoodCount"]) : 0),
					FairCount = ((!(r["FairCount"] is DBNull)) ? Convert.ToInt32(r["FairCount"]) : 0),
					AverageCount = ((!(r["AverageCount"] is DBNull)) ? Convert.ToInt32(r["AverageCount"]) : 0),
					PoorCount = ((!(r["PoorCount"] is DBNull)) ? Convert.ToInt32(r["PoorCount"]) : 0)
				}).ToList();
				return Results.Ok(result);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[reports/faculty] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/reports/class", (Func<int?, Task<IResult>>)async delegate(int? year)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string yFilter = (year.HasValue ? "AND LD.NamHoc = @y" : "");
				SqlParameter[] ps = ((!year.HasValue) ? Array.Empty<SqlParameter>() : new SqlParameter[1]
				{
					new SqlParameter("@y", year.Value)
				});
				string sql = "\r\nSELECT\r\n    L.MaLop, L.TenLop,\r\n    K.MaKH, K.TenKhoa,\r\n    COUNT(DISTINCT SV.MSSV)  AS TotalStudents,\r\n    ISNULL(AVG(CAST(LD.TongDRL AS FLOAT)),0) AS AverageScore,\r\n    SUM(CASE WHEN LD.TongDRL >= 90 THEN 1 ELSE 0 END) AS ExcellentCount,\r\n    SUM(CASE WHEN LD.TongDRL >= 80 AND LD.TongDRL < 90 THEN 1 ELSE 0 END) AS GoodCount,\r\n    SUM(CASE WHEN LD.TongDRL >= 70 AND LD.TongDRL < 80 THEN 1 ELSE 0 END) AS FairCount,\r\n    SUM(CASE WHEN LD.TongDRL >= 60 AND LD.TongDRL < 70 THEN 1 ELSE 0 END) AS AverageCount,\r\n    SUM(CASE WHEN LD.TongDRL < 60  AND LD.TongDRL IS NOT NULL THEN 1 ELSE 0 END) AS PoorCount\r\nFROM Lop L\r\nLEFT JOIN KHOA K ON K.MaKH = L.MaKH\r\nLEFT JOIN SINHVIEN SV ON SV.MaLop = L.MaLop\r\nLEFT JOIN LUUTRUDIEMSV LD ON LD.MSSV = SV.MSSV " + yFilter + "\r\nGROUP BY L.MaLop, L.TenLop, K.MaKH, K.TenKhoa\r\nORDER BY K.TenKhoa, L.TenLop";
				var result = (await QueryAsync(con, sql, ps)).Select((Dictionary<string, object> r) => new
				{
					MaLop = r["MaLop"]?.ToString(),
					TenLop = r["TenLop"]?.ToString()?.Trim(),
					MaKH = r["MaKH"]?.ToString(),
					TenKhoa = r["TenKhoa"]?.ToString(),
					TotalStudents = ((!(r["TotalStudents"] is DBNull)) ? Convert.ToInt32(r["TotalStudents"]) : 0),
					AverageScore = ((r["AverageScore"] is DBNull) ? 0.0 : Math.Round(Convert.ToDouble(r["AverageScore"]), 1)),
					ExcellentCount = ((!(r["ExcellentCount"] is DBNull)) ? Convert.ToInt32(r["ExcellentCount"]) : 0),
					GoodCount = ((!(r["GoodCount"] is DBNull)) ? Convert.ToInt32(r["GoodCount"]) : 0),
					FairCount = ((!(r["FairCount"] is DBNull)) ? Convert.ToInt32(r["FairCount"]) : 0),
					AverageCount = ((!(r["AverageCount"] is DBNull)) ? Convert.ToInt32(r["AverageCount"]) : 0),
					PoorCount = ((!(r["PoorCount"] is DBNull)) ? Convert.ToInt32(r["PoorCount"]) : 0)
				}).ToList();
				return Results.Ok(result);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[reports/class-list] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/reports/activity", (Func<int?, Task<IResult>>)async delegate(int? year)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string yFilter = (year.HasValue ? "WHERE YEAR(ISNULL(HD.NgayBD, HD.NgayKT)) = @y" : "");
				SqlParameter[] ps = ((!year.HasValue) ? Array.Empty<SqlParameter>() : new SqlParameter[1]
				{
					new SqlParameter("@y", year.Value)
				});
				string sql = "\r\nSELECT\r\n    HD.MaHD, HD.TenHD, HD.DiemRL, HD.NgayBD, HD.NgayKT, HD.DiaDiem, HD.SoSvDK,\r\n    COUNT(DISTINCT AR.MSSV) AS ActualParticipants,\r\n    CASE WHEN ISNULL(HD.SoSvDK,0)>0\r\n         THEN CAST(COUNT(DISTINCT AR.MSSV)*100.0/HD.SoSvDK AS FLOAT)\r\n         ELSE NULL END AS ParticipationRate\r\nFROM HoatDongTruong HD\r\nLEFT JOIN ActivityRegistration AR ON AR.MaHD = HD.MaHD\r\n" + yFilter + "\r\nGROUP BY HD.MaHD, HD.TenHD, HD.DiemRL, HD.NgayBD, HD.NgayKT, HD.DiaDiem, HD.SoSvDK\r\nORDER BY HD.NgayBD DESC";
				var result = (await QueryAsync(con, sql, ps)).Select((Dictionary<string, object> r) => new
				{
					MaHD = r["MaHD"]?.ToString(),
					TenHD = r["TenHD"]?.ToString(),
					DiemRL = ((!(r["DiemRL"] is DBNull)) ? Convert.ToInt32(r["DiemRL"]) : 0),
					NgayBD = ((r["NgayBD"] is DBNull) ? ((DateTime?)null) : new DateTime?(Convert.ToDateTime(r["NgayBD"]))),
					NgayKT = ((r["NgayKT"] is DBNull) ? ((DateTime?)null) : new DateTime?(Convert.ToDateTime(r["NgayKT"]))),
					DiaDiem = r["DiaDiem"]?.ToString(),
					SoSvDK = ((r["SoSvDK"] is DBNull) ? ((int?)null) : new int?(Convert.ToInt32(r["SoSvDK"]))),
					ActualParticipants = ((!(r["ActualParticipants"] is DBNull)) ? Convert.ToInt32(r["ActualParticipants"]) : 0),
					ParticipationRate = ((r["ParticipationRate"] is DBNull) ? ((double?)null) : new double?(Convert.ToDouble(r["ParticipationRate"])))
				}).ToList();
				return Results.Ok(result);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[reports/activity] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/lop/by-khoa/{maKH}", (Func<string, Task<IResult>>)async delegate(string maKH)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "\r\nSELECT L.MaLop, L.TenLop, L.MaKH, K.TenKhoa\r\nFROM Lop L\r\nLEFT JOIN KHOA K ON K.MaKH = L.MaKH\r\nWHERE L.MaKH = @maKH\r\nORDER BY L.TenLop";
				var lopList = (await QueryAsync(con, sql, new SqlParameter[1]
				{
					new SqlParameter("@maKH", maKH)
				})).Select((Dictionary<string, object> row) => new
				{
					MaLop = row["MaLop"]?.ToString(),
					TenLop = row["TenLop"]?.ToString(),
					MaKH = row["MaKH"]?.ToString(),
					TenKhoa = row["TenKhoa"]?.ToString()
				}).ToList();
				return Results.Ok(lopList);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/khoa/classes-overview", (Func<string, string, int?, Task<IResult>>)async delegate(string maKH, string? namHoc, int? hocKi)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if (!string.IsNullOrWhiteSpace(namHoc) && hocKi.HasValue)
				{
					_ = hocKi.Value;
				}
				else
				{
					(int Year, int Semester) sys = await GetSystemYearSemesterAsync(con);
					_ = sys.Year;
					_ = sys.Semester;
					namHoc = sys.Year.ToString();
					hocKi = sys.Semester;
				}
				using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PhieuDanhGia' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.PhieuDanhGia (\r\n        Id INT IDENTITY(1,1) PRIMARY KEY,\r\n        MSSV CHAR(11) NOT NULL,\r\n        NamHoc NVARCHAR(20) NOT NULL,\r\n        HocKi INT NOT NULL,\r\n        TongDiem INT NOT NULL DEFAULT 0,\r\n        Status NVARCHAR(20) NOT NULL DEFAULT 'Submitted',\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        UpdatedAt DATETIME NULL,\r\n        CONSTRAINT UQ_PhieuDanhGia UNIQUE (MSSV, NamHoc, HocKi)\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string sql = "\r\nSELECT \r\n  l.MaLop,\r\n  l.TenLop,\r\n  l.MaKH,\r\n  gv.MaCaNhan AS GVCN_MaCaNhan,\r\n  gv.TenGV     AS GVCN_TenGV,\r\n  COUNT(DISTINCT sv.MSSV) AS TotalStudents,\r\n  COUNT(p.Id) AS TotalForms,\r\n  SUM(CASE WHEN p.Status = 'Submitted' THEN 1 ELSE 0 END) AS Submitted,\r\n  SUM(CASE WHEN p.Status = 'ApprovedByGV' THEN 1 ELSE 0 END) AS ApprovedByGV,\r\n  SUM(CASE WHEN p.Status = 'ForwardedToFaculty' THEN 1 ELSE 0 END) AS ForwardedToFaculty,\r\n  SUM(CASE WHEN p.Status = 'ApprovedBySchool' THEN 1 ELSE 0 END) AS ApprovedBySchool\r\nFROM Lop l\r\nLEFT JOIN GiangVien gv ON gv.LopCV = l.MaLop\r\nLEFT JOIN SINHVIEN sv ON sv.MaLop = l.MaLop\r\nLEFT JOIN PhieuDanhGia p ON p.MSSV = sv.MSSV AND p.NamHoc = @nam AND p.HocKi = @hk\r\nWHERE l.MaKH = @maKH\r\nGROUP BY l.MaLop, l.TenLop, l.MaKH, gv.MaCaNhan, gv.TenGV\r\nORDER BY l.TenLop";
				SqlParameter[] obj3 = new SqlParameter[3]
				{
					new SqlParameter("@maKH", maKH),
					new SqlParameter("@nam", ((object)namHoc) ?? ((object)DBNull.Value)),
					null
				};
				int? num = hocKi;
				obj3[2] = new SqlParameter("@hk", num.HasValue ? ((object)num.GetValueOrDefault()) : DBNull.Value);
				return Results.Ok(await QueryAsync(con, sql, obj3));
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/khoa/renluyen/summary", (Func<string, string, int?, Task<IResult>>)async delegate(string maKH, string? namHoc, int? hocKi)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int useYear;
				int useSem;
				if (string.IsNullOrWhiteSpace(namHoc) || !hocKi.HasValue)
				{
					(useYear, useSem) = await GetSystemYearSemesterAsync(con);
				}
				else
				{
					int.TryParse(namHoc, out useYear);
					useSem = hocKi.Value;
				}
				List<Dictionary<string, object?>> check = await QueryAsync(con, "SELECT COUNT(*) c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='LUUTRUDIEMSV'", Array.Empty<SqlParameter>());
				if (check.Count == 0 || (check[0]["c"]?.ToString() ?? "0") == "0")
				{
					return Results.Ok(new
					{
						TotalStudents = 0,
						Average = 0,
						Min = 0,
						Max = 0,
						Buckets = new
						{
							XS = 0,
							TOT = 0,
							KHA = 0,
							TB = 0,
							YEU = 0,
							KEM = 0
						}
					});
				}
				string sql = "\r\nSELECT \r\n  COUNT(*) AS Total,\r\n  AVG(CAST(L.TongDRL AS float)) AS AvgDRL,\r\n  MIN(L.TongDRL) AS MinDRL,\r\n  MAX(L.TongDRL) AS MaxDRL,\r\n  SUM(CASE WHEN L.TongDRL >= 90 THEN 1 ELSE 0 END) AS XS,\r\n  SUM(CASE WHEN L.TongDRL >= 80 AND L.TongDRL < 90 THEN 1 ELSE 0 END) AS TOT,\r\n  SUM(CASE WHEN L.TongDRL >= 65 AND L.TongDRL < 80 THEN 1 ELSE 0 END) AS KHA,\r\n  SUM(CASE WHEN L.TongDRL >= 50 AND L.TongDRL < 65 THEN 1 ELSE 0 END) AS TB,\r\n  SUM(CASE WHEN L.TongDRL >= 35 AND L.TongDRL < 50 THEN 1 ELSE 0 END) AS YEU,\r\n  SUM(CASE WHEN L.TongDRL < 35 THEN 1 ELSE 0 END) AS KEM\r\nFROM LUUTRUDIEMSV L\r\nJOIN SINHVIEN S ON S.MSSV = L.MSSV\r\nWHERE S.MaKH = @maKH AND L.NamHoc = @y AND L.HocKi = @hk AND L.TongDRL IS NOT NULL";
				List<Dictionary<string, object?>> rows = await QueryAsync(con, sql, new SqlParameter[3]
				{
					new SqlParameter("@maKH", maKH),
					new SqlParameter("@y", useYear),
					new SqlParameter("@hk", useSem)
				});
				if (rows.Count == 0)
				{
					return Results.Ok(new
					{
						TotalStudents = 0,
						Average = 0,
						Min = 0,
						Max = 0,
						Buckets = new
						{
							XS = 0,
							TOT = 0,
							KHA = 0,
							TB = 0,
							YEU = 0,
							KEM = 0
						}
					});
				}
				Dictionary<string, object?> r = rows[0];
				double.TryParse(r["AvgDRL"]?.ToString(), out var avg);
				return Results.Ok(new
				{
					TotalStudents = toInt(r["Total"]),
					Average = avg,
					Min = toInt(r["MinDRL"]),
					Max = toInt(r["MaxDRL"]),
					Buckets = new
					{
						XS = toInt(r["XS"]),
						TOT = toInt(r["TOT"]),
						KHA = toInt(r["KHA"]),
						TB = toInt(r["TB"]),
						YEU = toInt(r["YEU"]),
						KEM = toInt(r["KEM"])
					}
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/khoa/renluyen/classes", (Func<string, string, int?, Task<IResult>>)async delegate(string maKH, string? namHoc, int? hocKi)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int useYear;
				int useSem;
				if (string.IsNullOrWhiteSpace(namHoc) || !hocKi.HasValue)
				{
					(useYear, useSem) = await GetSystemYearSemesterAsync(con);
				}
				else
				{
					int.TryParse(namHoc, out useYear);
					useSem = hocKi.Value;
				}
				string sql = "\r\nSELECT \r\n  SV.MaLop,\r\n  LP.TenLop,\r\n  COUNT(*) AS SoSV,\r\n  AVG(CAST(L.TongDRL AS float)) AS AvgDRL,\r\n  SUM(CASE WHEN L.TongDRL >= 90 THEN 1 ELSE 0 END) AS XS,\r\n  SUM(CASE WHEN L.TongDRL >= 80 AND L.TongDRL < 90 THEN 1 ELSE 0 END) AS TOT,\r\n  SUM(CASE WHEN L.TongDRL >= 65 AND L.TongDRL < 80 THEN 1 ELSE 0 END) AS KHA,\r\n  SUM(CASE WHEN L.TongDRL >= 50 AND L.TongDRL < 65 THEN 1 ELSE 0 END) AS TB,\r\n  SUM(CASE WHEN L.TongDRL >= 35 AND L.TongDRL < 50 THEN 1 ELSE 0 END) AS YEU,\r\n  SUM(CASE WHEN L.TongDRL < 35 THEN 1 ELSE 0 END) AS KEM\r\nFROM LUUTRUDIEMSV L\r\nJOIN SINHVIEN SV ON SV.MSSV = L.MSSV\r\nLEFT JOIN Lop LP ON LP.MaLop = SV.MaLop\r\nWHERE SV.MaKH = @maKH AND L.NamHoc = @y AND L.HocKi = @hk AND L.TongDRL IS NOT NULL\r\nGROUP BY SV.MaLop, LP.TenLop\r\nORDER BY AvgDRL DESC";
				return Results.Ok(await QueryAsync(con, sql, new SqlParameter[3]
				{
					new SqlParameter("@maKH", maKH),
					new SqlParameter("@y", useYear),
					new SqlParameter("@hk", useSem)
				}));
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/khoa/renluyen/top-students", (Func<string, string, int?, int?, Task<IResult>>)async delegate(string maKH, string? namHoc, int? hocKi, int? top)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int useYear;
				int useSem;
				if (string.IsNullOrWhiteSpace(namHoc) || !hocKi.HasValue)
				{
					(useYear, useSem) = await GetSystemYearSemesterAsync(con);
				}
				else
				{
					int.TryParse(namHoc, out useYear);
					useSem = hocKi.Value;
				}
				int useTop = Math.Max(1, Math.Min(200, top ?? 20));
				string sql = "\r\nSELECT TOP (@top)\r\n  L.MSSV, S.TenSV, S.MaLop, LP.TenLop, L.TongDRL, L.DiemTBM_10\r\nFROM LUUTRUDIEMSV L\r\nJOIN SINHVIEN S ON S.MSSV = L.MSSV\r\nLEFT JOIN Lop LP ON LP.MaLop = S.MaLop\r\nWHERE S.MaKH = @maKH AND L.NamHoc = @y AND L.HocKi = @hk AND L.TongDRL IS NOT NULL\r\nORDER BY L.TongDRL DESC, L.DiemTBM_10 DESC";
				return Results.Ok(await QueryAsync(con, sql, new SqlParameter[4]
				{
					new SqlParameter("@maKH", maKH),
					new SqlParameter("@y", useYear),
					new SqlParameter("@hk", useSem),
					new SqlParameter("@top", useTop)
				}));
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/khoa/classes/{maLop}/remind", (Func<string, HttpContext, Task<IResult>>)async delegate(string maLop, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<Dictionary<string, object?>> gvRows = await QueryAsync(con, "SELECT TOP 1 MaCaNhan, TenGV FROM GiangVien WHERE LopCV = @lop", new SqlParameter[1]
				{
					new SqlParameter("@lop", maLop)
				});
				if (gvRows.Count == 0)
				{
					return Results.BadRequest(new
					{
						message = "Chua thi?t l?p GVCN cho l?p n\ufffdy"
					});
				}
				string gvId = gvRows[0]["MaCaNhan"]?.ToString() ?? "";
				string gvTen = gvRows[0]["TenGV"]?.ToString() ?? "GVCN";
				using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Notifications' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.Notifications (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        Title NVARCHAR(200) NULL,\r\n        Message NVARCHAR(1000) NULL,\r\n        Link NVARCHAR(500) NULL,\r\n        EvidenceId UNIQUEIDENTIFIER NULL,\r\n        StudentId NVARCHAR(50) NULL,\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()\r\n    );\r\nEND\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationReads' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.NotificationReads (\r\n        NotificationId UNIQUEIDENTIFIER NOT NULL,\r\n        Recipient NVARCHAR(100) NOT NULL,\r\n        ReadAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        CONSTRAINT PK_NotificationReads PRIMARY KEY (NotificationId, Recipient)\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string title = "Nh?c duy?t \ufffdGRL cho l?p " + maLop;
				string msg = $"Khoa nh?c {gvTen} duy?t v\ufffd g?i phi?u \ufffdGRL cho l?p {maLop}.";
				string link = "/giangvien.html#eval";
				using SqlCommand ins = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, Link) VALUES(@r,@t,@m,@l)", con);
				ins.Parameters.AddWithValue("@r", gvId);
				ins.Parameters.AddWithValue("@t", title);
				ins.Parameters.AddWithValue("@m", msg);
				ins.Parameters.AddWithValue("@l", link);
				await ins.ExecuteNonQueryAsync();
				try
				{
					await LogAsync(ctx, con, "FACULTY_REMIND_GVCN MaLop=" + maLop + " GVCN=" + gvId);
				}
				catch
				{
				}
				return Results.Ok(new
				{
					reminded = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/giangvien/{maCaNhan}", (Func<string, Task<IResult>>)async delegate(string maCaNhan)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "\r\nSELECT GV.MaCaNhan, GV.TenGV, GV.Email, GV.SDT, GV.DiaChi, GV.MaKH, GV.LopCV,\r\n       K.TenKhoa, L.TenLop,\r\n       TK.MaQT, QT.TenCAP,\r\n       SV.AnhDD\r\nFROM GiangVien GV\r\nLEFT JOIN KHOA K ON K.MaKH = GV.MaKH\r\nLEFT JOIN Lop L ON L.MaLop = GV.LopCV\r\nLEFT JOIN TK ON TK.MaCaNhan = GV.MaCaNhan\r\nLEFT JOIN QuanTri QT ON QT.MaQT = TK.MaQT\r\nLEFT JOIN SINHVIEN SV ON SV.MSSV = GV.MaCaNhan\r\nWHERE GV.MaCaNhan = @id";
				List<Dictionary<string, object?>> rows = await QueryAsync(con, sql, new SqlParameter[1]
				{
					new SqlParameter("@id", maCaNhan.Trim())
				});
				if (rows.Count == 0)
				{
					return Results.NotFound(new
					{
						error = "Không tìm thấy giảng viên"
					});
				}
				Dictionary<string, object?> row = rows[0];
				string anhDDBase64 = null;
				byte[] anhBytes = default(byte[]);
				int num;
				if (row.TryGetValue("AnhDD", out object anhRaw))
				{
					anhBytes = anhRaw as byte[];
					if (anhBytes != null)
					{
						num = ((anhBytes.Length != 0) ? 1 : 0);
						goto IL_01d7;
					}
				}
				num = 0;
				goto IL_01d7;
				IL_01d7:
				if (num != 0)
				{
					anhDDBase64 = Convert.ToBase64String(anhBytes);
				}
				object mc;
				object tgv;
				object em;
				object sdt;
				object dc;
				object mkh;
				object tk2;
				object lop;
				object tl;
				object cv;
				object mq;
				return Results.Ok(new
				{
					maCaNhan = ((!row.TryGetValue("MaCaNhan", out mc)) ? null : mc?.ToString()),
					tenGV = ((!row.TryGetValue("TenGV", out tgv)) ? null : tgv?.ToString()),
					email = ((!row.TryGetValue("Email", out em)) ? null : em?.ToString()),
					sdt = ((!row.TryGetValue("SDT", out sdt)) ? null : sdt?.ToString()),
					diaChi = ((!row.TryGetValue("DiaChi", out dc)) ? null : dc?.ToString()),
					maKH = ((!row.TryGetValue("MaKH", out mkh)) ? null : mkh?.ToString()),
					tenKhoa = ((!row.TryGetValue("TenKhoa", out tk2)) ? null : tk2?.ToString()),
					lopCV = ((!row.TryGetValue("LopCV", out lop)) ? null : lop?.ToString()),
					tenLop = ((!row.TryGetValue("TenLop", out tl)) ? null : tl?.ToString()),
					chucVu = ((!row.TryGetValue("TenCAP", out cv)) ? null : cv?.ToString()),
					maQT = ((!row.TryGetValue("MaQT", out mq)) ? null : mq?.ToString()),
					anhDD = anhDDBase64
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/giangvien", (Func<string, Task<IResult>>)async delegate(string? maKH)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string sql = "\r\nSELECT DISTINCT\r\n    GV.MaCaNhan, GV.TenGV, GV.Email, GV.SDT, GV.MaKH, GV.LopCV,\r\n    TK.MaQT, QT.TenCAP\r\nFROM GiangVien GV\r\nLEFT JOIN TK ON TK.MaCaNhan = GV.MaCaNhan\r\nLEFT JOIN QuanTri QT ON QT.MaQT = TK.MaQT\r\nLEFT JOIN Lop L ON L.MaLop = GV.LopCV\r\nWHERE 1=1";
				List<SqlParameter> prms = new List<SqlParameter>();
				if (!string.IsNullOrWhiteSpace(maKH))
				{
					sql += " AND (GV.MaKH = @k OR L.MaKH = @k)";
					prms.Add(new SqlParameter("@k", maKH));
				}
				sql += " ORDER BY GV.TenGV";
				return Results.Ok(await QueryAsync(con, sql, prms.ToArray()));
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/khoa/classes/{maLop}/assign-gv", (Func<string, string, HttpContext, Task<IResult>>)async delegate(string maLop, string maGV, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlTransaction tx = con.BeginTransaction();
				using (SqlCommand clear = new SqlCommand("UPDATE GiangVien SET LopCV = NULL WHERE LopCV = @lop", con, tx))
				{
					clear.Parameters.AddWithValue("@lop", maLop);
					await clear.ExecuteNonQueryAsync();
				}
				using (SqlCommand set = new SqlCommand("UPDATE GiangVien SET LopCV = @lop WHERE MaCaNhan = @gv", con, tx))
				{
					set.Parameters.AddWithValue("@lop", maLop);
					set.Parameters.AddWithValue("@gv", maGV);
					if (await set.ExecuteNonQueryAsync() == 0)
					{
						tx.Rollback();
						return Results.NotFound(new
						{
							message = "Kh\ufffdng t\ufffdm th?y gi?ng vi\ufffdn"
						});
					}
				}
				tx.Commit();
				try
				{
					await LogAsync(ctx, con, "ASSIGN_GVCN Lop=" + maLop + " GV=" + maGV);
				}
				catch
				{
				}
				return Results.Ok(new
				{
					assigned = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/giangvien/{maCaNhan}/set-role", (Func<string, string, HttpContext, Task<IResult>>)async delegate(string maCaNhan, string maQT, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if ((await QueryAsync(con, "SELECT 1 FROM TK WHERE MaCaNhan=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maCaNhan)
				})).Count == 0)
				{
					return Results.NotFound(new
					{
						message = "Kh\ufffdng t\ufffdm th?y t\ufffdi kho?n c?a gi?ng vi\ufffdn"
					});
				}
				using SqlCommand cmd = new SqlCommand("UPDATE TK SET MaQT = @r WHERE MaCaNhan = @m", con);
				cmd.Parameters.AddWithValue("@r", maQT);
				cmd.Parameters.AddWithValue("@m", maCaNhan);
				await cmd.ExecuteNonQueryAsync();
				try
				{
					await LogAsync(ctx, con, "SET_ROLE GV=" + maCaNhan + " ROLE=" + maQT);
				}
				catch
				{
				}
				return Results.Ok(new
				{
					updated = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/stats", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				Dictionary<string, object> stats = new Dictionary<string, object>
				{
					["totalStudents"] = (await QueryAsync(con, "SELECT COUNT(*) as count FROM SINHVIEN", Array.Empty<SqlParameter>()))[0]["count"] ?? ((object)0),
					["totalFaculties"] = (await QueryAsync(con, "SELECT COUNT(*) as count FROM KHOA", Array.Empty<SqlParameter>()))[0]["count"] ?? ((object)0),
					["totalClasses"] = (await QueryAsync(con, "SELECT COUNT(*) as count FROM Lop", Array.Empty<SqlParameter>()))[0]["count"] ?? ((object)0),
					["totalActivities"] = (await QueryAsync(con, "SELECT COUNT(*) as count FROM HoatDongTruong", Array.Empty<SqlParameter>()))[0]["count"] ?? ((object)0),
					["totalUsers"] = (await QueryAsync(con, "SELECT COUNT(*) as count FROM TK", Array.Empty<SqlParameter>()))[0]["count"] ?? ((object)0),
					["totalRecords"] = (await QueryAsync(con, "SELECT COUNT(*) as count FROM LUUTRUDIEMSV", Array.Empty<SqlParameter>()))[0]["count"] ?? ((object)0),
					["avgTrainingScore"] = (await QueryAsync(con, "SELECT AVG(CAST(TongDRL as FLOAT)) as avg FROM LUUTRUDIEMSV WHERE TongDRL IS NOT NULL", Array.Empty<SqlParameter>()))[0]["avg"] ?? ((object)0)
				};
				try
				{
					List<Dictionary<string, object?>> srows = await QueryAsync(con, "SELECT TOP 1 SchoolName, CurrentYear, CurrentSemester FROM SystemSettings WHERE Id = 1", Array.Empty<SqlParameter>());
					if (srows.Count > 0)
					{
						stats["schoolName"] = srows[0]["SchoolName"] ?? "";
						stats["currentYear"] = srows[0]["CurrentYear"] ?? ((object)0);
						stats["currentSemester"] = srows[0]["CurrentSemester"] ?? ((object)0);
					}
				}
				catch
				{
				}
				return Results.Ok(stats);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting stats: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/logs", (_003C_003Ef__AnonymousDelegate8<int?, string, string, DateTime?, DateTime?, Task<IResult>>)async delegate(int? limit, string? user, string? actionLike, DateTime? from, DateTime? to)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserLog' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE UserLog (\r\n        Id INT IDENTITY PRIMARY KEY,\r\n        MaTK NVARCHAR(50),\r\n        Action NVARCHAR(255),\r\n        IPAddress NVARCHAR(50),\r\n        UserAgent NVARCHAR(255),\r\n        Category NVARCHAR(50) NULL,\r\n        Details NVARCHAR(1000) NULL,\r\n        ThoiGian DATETIME DEFAULT GETDATE()\r\n    )\r\nEND\r\nIF COL_LENGTH('UserLog','Category') IS NULL ALTER TABLE UserLog ADD Category NVARCHAR(50) NULL;\r\nIF COL_LENGTH('UserLog','Details') IS NULL ALTER TABLE UserLog ADD Details NVARCHAR(1000) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string sql = "SELECT TOP (@limit)\r\n    ul.Id, ul.MaTK, ul.Action, ul.IPAddress, ul.UserAgent, ul.Category, ul.Details, ul.ThoiGian,\r\n    COALESCE(t1.TenNguoiDung, t2.TenNguoiDung) AS TenNguoiDung\r\nFROM UserLog ul\r\nLEFT JOIN TK t1 ON t1.MaCaNhan = ul.MaTK\r\nLEFT JOIN TK t2 ON t2.TenTK = ul.MaTK\r\nWHERE 1=1";
				List<SqlParameter> prms = new List<SqlParameter>
				{
					new SqlParameter("@limit", limit ?? 100)
				};
				if (!string.IsNullOrWhiteSpace(user))
				{
					sql += " AND (ul.MaTK = @u OR t1.TenNguoiDung LIKE @uLike OR t2.TenNguoiDung LIKE @uLike)";
					prms.Add(new SqlParameter("@u", user));
					prms.Add(new SqlParameter("@uLike", "%" + user + "%"));
				}
				if (!string.IsNullOrWhiteSpace(actionLike))
				{
					sql += " AND (ul.Action LIKE @a)";
					prms.Add(new SqlParameter("@a", "%" + actionLike + "%"));
				}
				if (from.HasValue)
				{
					sql += " AND ul.ThoiGian >= @f";
					prms.Add(new SqlParameter("@f", from.Value));
				}
				if (to.HasValue)
				{
					sql += " AND ul.ThoiGian <= @t";
					prms.Add(new SqlParameter("@t", to.Value));
				}
				sql += " ORDER BY ul.ThoiGian DESC";
				List<Dictionary<string, object?>> rows = await QueryAsync(con, sql, prms.ToArray());
				Dictionary<string, string> map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
				{
					["LOGIN"] = "Đăng nhập hệ thống",
					["CHANGE_PASSWORD"] = "Đổi mật khẩu",
					["CREATE_USER"] = "Tạo tài khoản",
					["UPDATE_USER"] = "Cập nhật tài khoản",
					["LOCK_USER"] = "Khóa tài khoản",
					["UNLOCK_USER"] = "Mở khóa tài khoản",
					["DELETE_USER"] = "Xóa tài khoản",
					["ADD_KHOA"] = "Thêm khoa",
					["UPDATE_KHOA"] = "Cập nhật khoa",
					["DELETE_KHOA"] = "Xóa khoa",
					["ADD_LOP"] = "Thêm lớp",
					["UPDATE_LOP"] = "Cập nhật lớp",
					["DELETE_LOP"] = "Xóa lớp",
					["ADD_ACTIVITY"] = "Thêm hoạt động",
					["UPDATE_ACTIVITY"] = "Cập nhật hoạt động",
					["DELETE_ACTIVITY"] = "Xóa hoạt động",
					["SAVE_GRADE"] = "Lưu điểm rèn luyện",
					["APPROVE_EVIDENCE"] = "Duyệt minh chứng",
					["REJECT_EVIDENCE"] = "Từ chối minh chứng",
					["ASSIGN_OFFICERS"] = "Gán cán bộ lớp",
					["ADMIN_CREATE_USER"] = "Admin tạo tài khoản",
					["CBL_DELETE_PHIEU"] = "CBL xóa phiếu ĐGRL",
					["DELETE_REJECTED_PHIEU"] = "Xóa phiếu bị từ chối",
					["CBL_FORWARD_TO_GV"] = "CB lớp chuyển phiếu cho giảng viên",
					["GV_APPROVE_AND_FORWARD_TO_FACULTY"] = "Giảng viên duyệt và chuyển lên khoa",
					["FACULTY_BULK_FORWARD_TO_SCHOOL"] = "Khoa chuyển nhiều phiếu lên trường",
					["FACULTY_BULK_REJECT"] = "Khoa từ chối nhiều phiếu",
					["APPROVE_COMPLAINT"] = "Duyệt khiếu nại",
					["REJECT_COMPLAINT"] = "Từ chối khiếu nại",
					["FILE_COMPLAINT"] = "Nộp khiếu nại",
					["UPDATE_SYSTEM_SETTINGS"] = "Cập nhật thiết lập hệ thống",
					["CLIENT_ACTION"] = "Tác vụ giao diện người dùng",
					["UPDATE_SYSTEM_SETTINGS_UI"] = "Cập nhật thiết lập (UI)",
					["EXPORT_EVAL_CSV"] = "Xuất CSV điểm rèn luyện",
					["ADD_FACULTY_UI"] = "Thêm khoa (UI)",
					["ADD_CLASS_UI"] = "Thêm lớp (UI)",
					["ADD_ACTIVITY_UI"] = "Thêm hoạt động (UI)",
					["CLEANUP_STAGE1"] = "Dọn dẹp dữ liệu giai đoạn 1",
					["CLEANUP_TEST"] = "Kiểm tra dọn dẹp dữ liệu",
					["UPDATE_CLEANUP_CONFIG"] = "Cập nhật cấu hình dọn dẹp"
				};
				var enriched = rows.Select(delegate(Dictionary<string, object> r)
				{
					object value;
					string text = ((!r.TryGetValue("Action", out value)) ? "" : (value?.ToString() ?? ""));
					string text2 = text.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? text;
					map.TryGetValue(text2, out string value2);
					string text3 = ((text.Length > text2.Length) ? text.Substring(text2.Length).TrimStart() : string.Empty);
					string text4 = CultureInfo.GetCultureInfo("vi-VN").TextInfo.ToTitleCase((text2 ?? "").Replace('_', ' ').ToLowerInvariant());
					string text5 = value2 ?? text4;
					if (!string.IsNullOrEmpty(text3))
					{
						text5 = text5 + "  " + text3;
					}
					object value3;
					object user2 = ((r.TryGetValue("TenNguoiDung", out value3) && value3 != null && value3 != DBNull.Value) ? value3 : r["MaTK"]);
					return new
					{
						Id = r["Id"],
						User = user2,
						MaTK = r["MaTK"],
						ActionCode = text2,
						Friendly = text5,
						RawAction = text,
						IP = r["IPAddress"],
						UserAgent = r["UserAgent"],
						Category = (r.ContainsKey("Category") ? r["Category"] : null),
						Details = (r.ContainsKey("Details") ? r["Details"] : null),
						Time = r["ThoiGian"]
					};
				}).ToList();
				return Results.Ok(enriched);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting logs: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/logs/client", (Func<ClientLogDto, HttpContext, Task<IResult>>)async delegate(ClientLogDto dto, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserLog' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE UserLog (\r\n        Id INT IDENTITY PRIMARY KEY,\r\n        MaTK NVARCHAR(50),\r\n        Action NVARCHAR(255),\r\n        IPAddress NVARCHAR(50),\r\n        UserAgent NVARCHAR(255),\r\n        Category NVARCHAR(50) NULL,\r\n        Details NVARCHAR(1000) NULL,\r\n        ThoiGian DATETIME DEFAULT GETDATE()\r\n    )\r\nEND\r\nIF COL_LENGTH('UserLog','Category') IS NULL ALTER TABLE UserLog ADD Category NVARCHAR(50) NULL;\r\nIF COL_LENGTH('UserLog','Details') IS NULL ALTER TABLE UserLog ADD Details NVARCHAR(1000) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string userHeader = ctx.Request.Headers["X-User"].ToString();
				string actionCode = (string.IsNullOrWhiteSpace(dto.ActionCode) ? "CLIENT_ACTION" : dto.ActionCode.Trim().ToUpperInvariant());
				string safeDetails = (dto.Details ?? string.Empty).Replace('\n', ' ').Replace('\r', ' ');
				string action = actionCode + (string.IsNullOrWhiteSpace(safeDetails) ? string.Empty : (" " + safeDetails));
				await LogAsync(ctx, con, action, (!string.IsNullOrWhiteSpace(userHeader)) ? userHeader : null, dto.Category ?? "UI", dto.Details);
				return Results.Ok(new
				{
					logged = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/settings/system", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE SystemSettings (\r\n    Id INT PRIMARY KEY,\r\n    SchoolName NVARCHAR(200),\r\n    CurrentYear INT,\r\n    CurrentSemester INT,\r\n        EvalStartDate DATETIME,\r\n    SemesterEndDate DATETIME,\r\n    AutoPointEnabled BIT DEFAULT 0,\r\n        AutoEnable_ClassOfficer BIT DEFAULT 1,\r\n        AutoEnable_Research BIT DEFAULT 1,\r\n        AutoEnable_Improvement BIT DEFAULT 1,\r\n        AutoEnable_AcademicLevel BIT DEFAULT 1,\r\n        AutoEnable_Violations BIT DEFAULT 1,\r\n    UpdatedAt DATETIME DEFAULT GETDATE()\r\n  );\r\nEND\r\n", con);
				await ensure.ExecuteNonQueryAsync();
				using (SqlCommand ensureCols = new SqlCommand("\r\n-- Robust add columns if missing (avoid named constraints to prevent duplicates across upgrades)\r\nIF COL_LENGTH('SystemSettings','EvalStartDate') IS NULL ALTER TABLE SystemSettings ADD EvalStartDate DATETIME NULL;\r\nIF COL_LENGTH('SystemSettings','SemesterEndDate') IS NULL ALTER TABLE SystemSettings ADD SemesterEndDate DATETIME NULL;\r\nIF COL_LENGTH('SystemSettings','AutoPointEnabled') IS NULL ALTER TABLE SystemSettings ADD AutoPointEnabled BIT NULL DEFAULT 0;\r\nIF COL_LENGTH('SystemSettings','AutoEnable_ClassOfficer') IS NULL ALTER TABLE SystemSettings ADD AutoEnable_ClassOfficer BIT NULL DEFAULT 1;\r\nIF COL_LENGTH('SystemSettings','AutoEnable_Research') IS NULL ALTER TABLE SystemSettings ADD AutoEnable_Research BIT NULL DEFAULT 1;\r\nIF COL_LENGTH('SystemSettings','AutoEnable_Improvement') IS NULL ALTER TABLE SystemSettings ADD AutoEnable_Improvement BIT NULL DEFAULT 1;\r\nIF COL_LENGTH('SystemSettings','AutoEnable_AcademicLevel') IS NULL ALTER TABLE SystemSettings ADD AutoEnable_AcademicLevel BIT NULL DEFAULT 1;\r\nIF COL_LENGTH('SystemSettings','AutoEnable_Violations') IS NULL ALTER TABLE SystemSettings ADD AutoEnable_Violations BIT NULL DEFAULT 1;\r\n-- Ensure row has non-null values for new columns\r\nUPDATE SystemSettings SET \r\n    AutoPointEnabled = ISNULL(AutoPointEnabled, 0),\r\n    AutoEnable_ClassOfficer = ISNULL(AutoEnable_ClassOfficer, 1),\r\n    AutoEnable_Research = ISNULL(AutoEnable_Research, 1),\r\n    AutoEnable_Improvement = ISNULL(AutoEnable_Improvement, 1),\r\n    AutoEnable_AcademicLevel = ISNULL(AutoEnable_AcademicLevel, 1),\r\n    AutoEnable_Violations = ISNULL(AutoEnable_Violations, 1)\r\nWHERE Id = 1;\r\n", con))
				{
					await ensureCols.ExecuteNonQueryAsync();
				}
				using (SqlCommand ensureRow = new SqlCommand("\r\nIF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE Id = 1)\r\nBEGIN\r\n    INSERT INTO SystemSettings (Id, SchoolName, CurrentYear, CurrentSemester, AutoPointEnabled,\r\n        AutoEnable_ClassOfficer, AutoEnable_Research, AutoEnable_Improvement, AutoEnable_AcademicLevel, AutoEnable_Violations)\r\n    VALUES (1, N'Tru?ng \ufffd?i h?c Ki\ufffdn Giang', YEAR(GETDATE()), 1, 0, 1,1,1,1,1);\r\nEND", con))
				{
					await ensureRow.ExecuteNonQueryAsync();
				}
				List<Dictionary<string, object?>> rows = await QueryAsync(con, "SELECT TOP 1 SchoolName, CurrentYear, CurrentSemester, EvalStartDate, SemesterEndDate, AutoPointEnabled, AutoEnable_ClassOfficer, AutoEnable_Research, AutoEnable_Improvement, AutoEnable_AcademicLevel, AutoEnable_Violations, COALESCE(UseAutoYearSemester, 1) AS UseAutoYearSemester FROM SystemSettings WHERE Id = 1", Array.Empty<SqlParameter>());
				if (rows.Count == 0)
				{
					return Results.NotFound();
				}
				Dictionary<string, object?> settings = rows[0];
				if (!settings.ContainsKey("UseAutoYearSemester") || settings["UseAutoYearSemester"] == null || Convert.ToBoolean(settings["UseAutoYearSemester"]))
				{
					(int Year, int Semester) tuple = await GetSystemYearSemesterAsync(con);
					int year = tuple.Year;
					int semester = tuple.Semester;
					settings["CurrentYear"] = year;
					settings["CurrentSemester"] = semester;
				}
				if (settings.ContainsKey("CurrentYear") && settings["CurrentYear"] != null)
				{
					try
					{
						int yearInt = Convert.ToInt32(settings["CurrentYear"]);
						settings["FormattedYear"] = $"{yearInt - 1}-{yearInt}";
					}
					catch
					{
						settings["FormattedYear"] = settings["CurrentYear"]?.ToString() ?? "";
					}
				}
				return Results.Ok(settings);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/settings/system", (Func<SystemSettingsDto, Task<IResult>>)async delegate(SystemSettingsDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE SystemSettings (\r\n    Id INT PRIMARY KEY,\r\n    SchoolName NVARCHAR(200),\r\n    CurrentYear INT,\r\n    CurrentSemester INT,\r\n        EvalStartDate DATETIME,\r\n    SemesterEndDate DATETIME,\r\n    AutoPointEnabled BIT DEFAULT 0,\r\n        AutoEnable_ClassOfficer BIT DEFAULT 1,\r\n        AutoEnable_Research BIT DEFAULT 1,\r\n        AutoEnable_Improvement BIT DEFAULT 1,\r\n        AutoEnable_AcademicLevel BIT DEFAULT 1,\r\n        AutoEnable_Violations BIT DEFAULT 1,\r\n    UpdatedAt DATETIME DEFAULT GETDATE()\r\n  );\r\nEND\r\n-- Th\ufffdm c?t m?i n?u chua c\ufffd\r\nIF COL_LENGTH('SystemSettings','EvalStartDate') IS NULL ALTER TABLE SystemSettings ADD EvalStartDate DATETIME NULL;\r\nIF COL_LENGTH('SystemSettings','SemesterEndDate') IS NULL ALTER TABLE SystemSettings ADD SemesterEndDate DATETIME NULL;\r\nIF COL_LENGTH('SystemSettings','AutoPointEnabled') IS NULL ALTER TABLE SystemSettings ADD AutoPointEnabled BIT NULL DEFAULT 0;\r\nIF COL_LENGTH('SystemSettings','AutoEnable_ClassOfficer') IS NULL ALTER TABLE SystemSettings ADD AutoEnable_ClassOfficer BIT NULL DEFAULT 1;\r\nIF COL_LENGTH('SystemSettings','AutoEnable_Research') IS NULL ALTER TABLE SystemSettings ADD AutoEnable_Research BIT NULL DEFAULT 1;\r\nIF COL_LENGTH('SystemSettings','AutoEnable_Improvement') IS NULL ALTER TABLE SystemSettings ADD AutoEnable_Improvement BIT NULL DEFAULT 1;\r\nIF COL_LENGTH('SystemSettings','AutoEnable_AcademicLevel') IS NULL ALTER TABLE SystemSettings ADD AutoEnable_AcademicLevel BIT NULL DEFAULT 1;\r\nIF COL_LENGTH('SystemSettings','AutoEnable_Violations') IS NULL ALTER TABLE SystemSettings ADD AutoEnable_Violations BIT NULL DEFAULT 1;\r\nIF COL_LENGTH('SystemSettings','UseAutoYearSemester') IS NULL ALTER TABLE SystemSettings ADD UseAutoYearSemester BIT NULL DEFAULT 1;\r\nIF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE Id = 1)\r\nBEGIN\r\n    INSERT INTO SystemSettings (Id, SchoolName, CurrentYear, CurrentSemester, AutoPointEnabled,\r\n        AutoEnable_ClassOfficer, AutoEnable_Research, AutoEnable_Improvement, AutoEnable_AcademicLevel, AutoEnable_Violations, UseAutoYearSemester)\r\n    VALUES (1, N'Tru?ng \ufffd?i h?c Ki\ufffdn Giang', YEAR(GETDATE()), 1, 0, 1,1,1,1,1, 1);\r\nEND", con);
				await ensure.ExecuteNonQueryAsync();
				string sql = "UPDATE SystemSettings SET\r\n                        SchoolName = COALESCE(@name, SchoolName),\r\n                        CurrentYear = COALESCE(@year, CurrentYear),\r\n                        CurrentSemester = COALESCE(@sem, CurrentSemester),\r\n                                                EvalStartDate = @evalStartDate,\r\n                        SemesterEndDate = @semesterEndDate,\r\n                        AutoPointEnabled = @autoPointEnabled,\r\n                        AutoEnable_ClassOfficer = COALESCE(@autoClassOfficer, AutoEnable_ClassOfficer),\r\n                        AutoEnable_Research = COALESCE(@autoResearch, AutoEnable_Research),\r\n                        AutoEnable_Improvement = COALESCE(@autoImprovement, AutoEnable_Improvement),\r\n                        AutoEnable_AcademicLevel = COALESCE(@autoAcademic, AutoEnable_AcademicLevel),\r\n                        AutoEnable_Violations = COALESCE(@autoViolations, AutoEnable_Violations),\r\n                        UseAutoYearSemester = COALESCE(@useAutoYearSemester, UseAutoYearSemester),\r\n                        UpdatedAt = GETDATE()\r\n                    WHERE Id = 1";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@name", ((object)dto.SchoolName) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@year", ((object)dto.CurrentYear) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@sem", ((object)dto.CurrentSemester) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@evalStartDate", ((object)dto.EvalStartDate) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@semesterEndDate", ((object)dto.SemesterEndDate) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@autoPointEnabled", ((object)dto.AutoPointEnabled) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@autoClassOfficer", ((object)dto.AutoEnable_ClassOfficer) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@autoResearch", ((object)dto.AutoEnable_Research) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@autoImprovement", ((object)dto.AutoEnable_Improvement) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@autoAcademic", ((object)dto.AutoEnable_AcademicLevel) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@autoViolations", ((object)dto.AutoEnable_Violations) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@useAutoYearSemester", ((object)dto.UseAutoYearSemester) ?? DBNull.Value));
				await cmd.ExecuteNonQueryAsync();
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "UPDATE_SYSTEM_SETTINGS");
				return Results.NoContent();
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine($"[SystemSettings][PUT][ERROR] {ex4.GetType().Name}: {ex4.Message}\n{ex4.StackTrace}");
				return Results.BadRequest(new
				{
					error = ex4.Message,
					type = ex4.GetType().Name
				});
			}
		});
		app.MapGet("/api/test/system-settings", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE SystemSettings (\r\n        Id INT PRIMARY KEY,\r\n        SchoolName NVARCHAR(200),\r\n        CurrentYear INT, CurrentSemester INT,\r\n        EvalStartDate DATETIME, SemesterEndDate DATETIME,\r\n        AutoPointEnabled BIT DEFAULT 0,\r\n        AutoEnable_ClassOfficer BIT DEFAULT 1,\r\n        AutoEnable_Research BIT DEFAULT 1,\r\n        AutoEnable_Improvement BIT DEFAULT 1,\r\n        AutoEnable_AcademicLevel BIT DEFAULT 1,\r\n        AutoEnable_Violations BIT DEFAULT 1,\r\n        UpdatedAt DATETIME DEFAULT GETDATE()\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				List<Dictionary<string, object?>> cols = await QueryAsync(con, "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='SystemSettings' ORDER BY ORDINAL_POSITION", Array.Empty<SqlParameter>());
				List<Dictionary<string, object?>> row = await QueryAsync(con, "SELECT TOP 1 * FROM SystemSettings WHERE Id=1", Array.Empty<SqlParameter>());
				return Results.Ok(new
				{
					columns = cols,
					row = row.FirstOrDefault(),
					rowExists = (row.Count > 0)
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[SystemSettings][TEST][ERROR] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/settings/points", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PointSettings' AND xtype='U')\r\nBEGIN\r\n  CREATE TABLE PointSettings (\r\n    Id INT PRIMARY KEY,\r\n    MaxPoints INT DEFAULT 100,\r\n    MinPoints INT DEFAULT 0,\r\n    ExcellentPoints INT DEFAULT 90,\r\n    GoodPoints INT DEFAULT 80,\r\n    UpdatedAt DATETIME DEFAULT GETDATE()\r\n  );\r\nEND\r\nIF NOT EXISTS (SELECT 1 FROM PointSettings WHERE Id = 1)\r\nBEGIN\r\n  INSERT INTO PointSettings (Id, MaxPoints, MinPoints, ExcellentPoints, GoodPoints)\r\n  VALUES (1, 100, 0, 90, 80);\r\nEND", con);
				await ensure.ExecuteNonQueryAsync();
				List<Dictionary<string, object?>> rows = await QueryAsync(con, "SELECT TOP 1 MaxPoints, MinPoints, ExcellentPoints, GoodPoints FROM PointSettings WHERE Id = 1", Array.Empty<SqlParameter>());
				if (rows.Count == 0)
				{
					return Results.NotFound();
				}
				return Results.Ok(rows[0]);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPut("/api/settings/points", (Func<PointSettingsDto, Task<IResult>>)async delegate(PointSettingsDto dto)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PointSettings' AND xtype='U')\r\nBEGIN\r\n  CREATE TABLE PointSettings (\r\n    Id INT PRIMARY KEY,\r\n    MaxPoints INT DEFAULT 100,\r\n    MinPoints INT DEFAULT 0,\r\n    ExcellentPoints INT DEFAULT 90,\r\n    GoodPoints INT DEFAULT 80,\r\n    FairPoints INT DEFAULT 70,\r\n    AveragePoints INT DEFAULT 60,\r\n    WeakPoints INT DEFAULT 40,\r\n    PoorPoints INT DEFAULT 0,\r\n    UpdatedAt DATETIME DEFAULT GETDATE()\r\n  );\r\nEND\r\nIF NOT EXISTS (SELECT 1 FROM PointSettings WHERE Id = 1)\r\nBEGIN\r\n  INSERT INTO PointSettings (Id, MaxPoints, MinPoints, ExcellentPoints, GoodPoints, FairPoints, AveragePoints, WeakPoints, PoorPoints)\r\n  VALUES (1, 100, 0, 90, 80, 70, 60, 40, 0);\r\nEND\r\n-- Add new columns if they don't exist (for existing databases)\r\nIF COL_LENGTH('PointSettings','FairPoints') IS NULL ALTER TABLE PointSettings ADD FairPoints INT DEFAULT 70;\r\nIF COL_LENGTH('PointSettings','AveragePoints') IS NULL ALTER TABLE PointSettings ADD AveragePoints INT DEFAULT 60;\r\nIF COL_LENGTH('PointSettings','WeakPoints') IS NULL ALTER TABLE PointSettings ADD WeakPoints INT DEFAULT 40;\r\nIF COL_LENGTH('PointSettings','PoorPoints') IS NULL ALTER TABLE PointSettings ADD PoorPoints INT DEFAULT 0;", con);
				await ensure.ExecuteNonQueryAsync();
				string sql = "UPDATE PointSettings SET\r\n                        MaxPoints = COALESCE(@max, MaxPoints),\r\n                        MinPoints = COALESCE(@min, MinPoints),\r\n                        ExcellentPoints = COALESCE(@excellent, ExcellentPoints),\r\n                        GoodPoints = COALESCE(@good, GoodPoints),\r\n                        FairPoints = COALESCE(@fair, FairPoints),\r\n                        AveragePoints = COALESCE(@average, AveragePoints),\r\n                        WeakPoints = COALESCE(@weak, WeakPoints),\r\n                        PoorPoints = COALESCE(@poor, PoorPoints),\r\n                        UpdatedAt = GETDATE()\r\n                    WHERE Id = 1";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.Add(new SqlParameter("@max", ((object)dto.MaxPoints) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@min", ((object)dto.MinPoints) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@excellent", ((object)dto.ExcellentPoints) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@good", ((object)dto.GoodPoints) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@fair", ((object)dto.FairPoints) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@average", ((object)dto.AveragePoints) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@weak", ((object)dto.WeakPoints) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@poor", ((object)dto.PoorPoints) ?? DBNull.Value));
				await cmd.ExecuteNonQueryAsync();
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, "UPDATE_POINT_SETTINGS");
				return Results.NoContent();
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});

		app.MapGet("/api/diem/import-settings", async () =>
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand ensure = new SqlCommand(@"
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ImportSettings' AND xtype='U')
BEGIN
    CREATE TABLE ImportSettings (
        Id INT PRIMARY KEY,
        ConflictMode NVARCHAR(50) DEFAULT 'overwrite',
        RequireMSSV BIT DEFAULT 1,
        ValidateRange BIT DEFAULT 1,
        BatchSize INT DEFAULT 1000,
        AllowedYears NVARCHAR(200),
        AutoCalcKhoas BIT DEFAULT 1,
        AutoCalcDTB4 BIT DEFAULT 1,
        UpdatedAt DATETIME DEFAULT GETDATE()
    );
END
IF NOT EXISTS (SELECT 1 FROM ImportSettings WHERE Id = 1)
BEGIN
    INSERT INTO ImportSettings (Id) VALUES (1);
END", con);
				await ensure.ExecuteNonQueryAsync();
				
				var rows = await QueryAsync(con, "SELECT TOP 1 * FROM ImportSettings WHERE Id = 1");
				if (rows.Count == 0) return Results.NotFound();
				
				return Results.Ok(new
				{
					conflictMode = rows[0]["ConflictMode"]?.ToString(),
					requireMSSV = rows[0]["RequireMSSV"],
					validateRange = rows[0]["ValidateRange"],
					batchSize = rows[0]["BatchSize"],
					allowedYears = rows[0]["AllowedYears"]?.ToString(),
					autoCalcKhoas = rows[0]["AutoCalcKhoas"],
					autoCalcDTB4 = rows[0]["AutoCalcDTB4"]
				});
			}
			catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
		});

		app.MapPost("/api/diem/import-settings", async (HttpRequest req) =>
		{
			try
			{
				using var reader = new StreamReader(req.Body);
				var body = await reader.ReadToEndAsync();
				if (string.IsNullOrWhiteSpace(body)) return Results.BadRequest();
				
				var doc = JsonDocument.Parse(body).RootElement;
				
				string conflictMode = doc.TryGetProperty("conflictMode", out var cm) ? cm.GetString() : "overwrite";
				bool requireMSSV = doc.TryGetProperty("requireMSSV", out var rm) && (rm.GetString() == "true" || rm.GetString() == "1");
				bool validateRange = doc.TryGetProperty("validateRange", out var vr) && (vr.GetString() == "true" || vr.GetString() == "1");
				int batchSize = doc.TryGetProperty("batchSize", out var bs) && int.TryParse(bs.GetString(), out var bsi) ? bsi : 1000;
				string allowedYears = doc.TryGetProperty("allowedYears", out var ay) ? ay.GetString() : "";
				bool autoCalcKhoas = doc.TryGetProperty("autoCalcKhoas", out var ack) && (ack.GetString() == "true" || ack.GetString() == "1");
				bool autoCalcDTB4 = doc.TryGetProperty("autoCalcDTB4", out var acd) && (acd.GetString() == "true" || acd.GetString() == "1");
				
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				
				using SqlCommand ensure = new SqlCommand(@"
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ImportSettings' AND xtype='U')
BEGIN
    CREATE TABLE ImportSettings (
        Id INT PRIMARY KEY,
        ConflictMode NVARCHAR(50) DEFAULT 'overwrite',
        RequireMSSV BIT DEFAULT 1,
        ValidateRange BIT DEFAULT 1,
        BatchSize INT DEFAULT 1000,
        AllowedYears NVARCHAR(200),
        AutoCalcKhoas BIT DEFAULT 1,
        AutoCalcDTB4 BIT DEFAULT 1,
        UpdatedAt DATETIME DEFAULT GETDATE()
    );
END
IF NOT EXISTS (SELECT 1 FROM ImportSettings WHERE Id = 1)
BEGIN
    INSERT INTO ImportSettings (Id) VALUES (1);
END", con);
				await ensure.ExecuteNonQueryAsync();

				string sql = @"UPDATE ImportSettings SET 
					ConflictMode = @cm, RequireMSSV = @rm, ValidateRange = @vr, BatchSize = @bs, 
					AllowedYears = @ay, AutoCalcKhoas = @ack, AutoCalcDTB4 = @acd, UpdatedAt = GETDATE() WHERE Id = 1";
					
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@cm", conflictMode ?? (object)DBNull.Value);
				cmd.Parameters.AddWithValue("@rm", requireMSSV);
				cmd.Parameters.AddWithValue("@vr", validateRange);
				cmd.Parameters.AddWithValue("@bs", batchSize);
				cmd.Parameters.AddWithValue("@ay", allowedYears ?? (object)DBNull.Value);
				cmd.Parameters.AddWithValue("@ack", autoCalcKhoas);
				cmd.Parameters.AddWithValue("@acd", autoCalcDTB4);
				
				await cmd.ExecuteNonQueryAsync();
				return Results.Ok(new { success = true });
			}
			catch (Exception ex) { return Results.BadRequest(new { error = ex.Message }); }
		});

		app.MapGet("/api/tieuchi", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NhomTieuChi' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE NhomTieuChi (\r\n        MaNhom INT IDENTITY(1,1) PRIMARY KEY,\r\n        MaSo NVARCHAR(50) NULL,\r\n        TenNhom NVARCHAR(200) NOT NULL,\r\n        DiemToiDa INT NULL\r\n    );\r\nEND\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TieuChiCon' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE TieuChiCon (\r\n        MaTC INT IDENTITY(1,1) PRIMARY KEY,\r\n        MaNhom INT NOT NULL REFERENCES NhomTieuChi(MaNhom),\r\n        MaSo NVARCHAR(50) NULL,\r\n        TenTC NVARCHAR(200) NOT NULL,\r\n        DiemToiDa INT NULL,\r\n        CoMinhChung BIT NULL,\r\n        AllowSelfEval BIT NOT NULL DEFAULT 1\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				using (SqlCommand ensureCol = new SqlCommand("IF COL_LENGTH('TieuChiCon','AllowSelfEval') IS NULL ALTER TABLE TieuChiCon ADD AllowSelfEval BIT NOT NULL DEFAULT 1;", con))
				{
					await ensureCol.ExecuteNonQueryAsync();
				}
				List<Dictionary<string, object?>> groups = await QueryAsync(con, "SELECT MaNhom, MaSo, TenNhom, DiemToiDa FROM NhomTieuChi ORDER BY MaNhom", Array.Empty<SqlParameter>());
				Dictionary<int, List<Dictionary<string, object>>> childLookup = (from c in await QueryAsync(con, "SELECT MaTC, MaNhom, MaSo, TenTC, DiemToiDa, CoMinhChung, AllowSelfEval FROM TieuChiCon ORDER BY MaNhom, MaTC", Array.Empty<SqlParameter>())
					group c by Convert.ToInt32(c["MaNhom"])).ToDictionary((IGrouping<int, Dictionary<string, object>> g) => g.Key, (IGrouping<int, Dictionary<string, object>> g) => g.ToList());
				var result = groups.Select(delegate(Dictionary<string, object> g)
				{
					object maNhom = g["MaNhom"];
					object maSo = (g.ContainsKey("MaSo") ? g["MaSo"] : null);
					object tenNhom = (g.ContainsKey("TenNhom") ? g["TenNhom"] : null);
					object diemToiDa = (g.ContainsKey("DiemToiDa") ? g["DiemToiDa"] : null);
					IEnumerable<object> tieuChi;
					if (!childLookup.TryGetValue(Convert.ToInt32(g["MaNhom"]), out var value))
					{
						tieuChi = Enumerable.Empty<object>();
					}
					else
					{
						IEnumerable<object> enumerable = value.Select((Dictionary<string, object> c) => new
						{
							MaTC = c["MaTC"],
							MaSo = (c.ContainsKey("MaSo") ? c["MaSo"] : null),
							TenTC = (c.ContainsKey("TenTC") ? c["TenTC"] : null),
							DiemToiDa = (c.ContainsKey("DiemToiDa") ? c["DiemToiDa"] : null),
							CoMinhChung = (c.ContainsKey("CoMinhChung") ? c["CoMinhChung"] : null),
							AllowSelfEval = (c.ContainsKey("AllowSelfEval") ? c["AllowSelfEval"] : null)
						});
						tieuChi = enumerable;
					}
					return new
					{
						MaNhom = maNhom,
						MaSo = maSo,
						TenNhom = tenNhom,
						DiemToiDa = diemToiDa,
						TieuChi = tieuChi
					};
				});
				return Results.Ok(result);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error getting /api/tieuchi: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/tieuchi/nhom", (Func<CreateNhomTieuChiDto, Task<IResult>>)async delegate(CreateNhomTieuChiDto dto)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(dto.TenNhom))
				{
					return Results.BadRequest(new
					{
						message = "Thi?u TenNhom"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand cmd = new SqlCommand("INSERT INTO NhomTieuChi(TenNhom, DiemToiDa, MaSo)\r\nVALUES(@ten, @diem, @maso); SELECT SCOPE_IDENTITY();", con);
				cmd.Parameters.Add(new SqlParameter("@ten", dto.TenNhom));
				cmd.Parameters.Add(new SqlParameter("@diem", ((object)dto.DiemToiDa) ?? DBNull.Value));
				cmd.Parameters.Add(new SqlParameter("@maso", ((object)dto.MaSo) ?? ((object)DBNull.Value)));
				int newId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, $"ADD_NHOM_TIEUCHI {newId}");
				return Results.Ok(new
				{
					MaNhom = newId
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapDelete("/api/tieuchi/nhom/{maNhom:int}", (Func<int, Task<IResult>>)async delegate(int maNhom)
		{
			try
			{
				using (SqlConnection con = new SqlConnection(connStr))
				{
					await con.OpenAsync();
					using SqlTransaction tran = (SqlTransaction)(await con.BeginTransactionAsync());
					try
					{
						using (SqlCommand delChild = new SqlCommand("DELETE FROM TieuChiCon WHERE MaNhom=@mn", con, tran))
						{
							delChild.Parameters.Add(new SqlParameter("@mn", maNhom));
							await delChild.ExecuteNonQueryAsync();
						}
						using (SqlCommand delGrp = new SqlCommand("DELETE FROM NhomTieuChi WHERE MaNhom=@mn", con, tran))
						{
							delGrp.Parameters.Add(new SqlParameter("@mn", maNhom));
							if (await delGrp.ExecuteNonQueryAsync() == 0)
							{
								await tran.RollbackAsync();
								return Results.NotFound();
							}
						}
						await tran.CommitAsync();
						await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, $"DELETE_NHOM_TIEUCHI {maNhom}");
						return Results.NoContent();
					}
					catch (Exception)
					{
						try
						{
							await tran.RollbackAsync();
						}
						catch
						{
						}
						throw;
					}
				}
				IL_0647:;
			}
			catch (Exception ex4)
			{
				Exception ex5 = ex4;
				return Results.BadRequest(new
				{
					error = ex5.Message
				});
			}
			throw null;
		});
		app.MapDelete("/api/tieuchi/con/{maTC:int}", (Func<int, Task<IResult>>)async delegate(int maTC)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand cmd = new SqlCommand("DELETE FROM TieuChiCon WHERE MaTC=@tc", con);
				cmd.Parameters.Add(new SqlParameter("@tc", maTC));
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.NotFound();
				}
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, $"DELETE_TIEUCHI_CON {maTC}");
				return Results.NoContent();
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/tieuchi/evidence", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			try
			{
				if (!req.HasFormContentType)
				{
					return Results.BadRequest(new
					{
						message = "FormData required"
					});
				}
				IFormCollection form = await req.ReadFormAsync();
				string mssv = form["mssv"].ToString();
				string maTCStr = form["maTC"].ToString();
				string note = form["note"].ToString();
				IFormFile file = form.Files["file"];
				string statusStr = form["status"].ToString() ?? "Pending";
				if (string.IsNullOrWhiteSpace(mssv) || string.IsNullOrWhiteSpace(maTCStr) || file == null || file.Length == 0)
				{
					return Results.BadRequest(new
					{
						message = "Thi?u mssv/maTC/file"
					});
				}
				if (!int.TryParse(maTCStr, out var maTC))
				{
					return Results.BadRequest(new
					{
						message = "maTC kh\ufffdng h?p l?"
					});
				}
				IResult result;
				await using (MemoryStream ms = new MemoryStream())
				{
					await file.CopyToAsync(ms);
					byte[] bytes = ms.ToArray();
					using SqlConnection con = new SqlConnection(connStr);
					await con.OpenAsync();
					using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MinhChungTieuChi' AND xtype='U')\r\nBEGIN\r\n  CREATE TABLE MinhChungTieuChi (\r\n    Id INT IDENTITY(1,1) PRIMARY KEY,\r\n    MSSV CHAR(11) NOT NULL,\r\n    MaTC INT NOT NULL,\r\n    ImageData VARBINARY(MAX) NOT NULL,\r\n    Note NVARCHAR(500) NULL,\r\n    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',\r\n    CreatedAt DATETIME DEFAULT GETDATE(),\r\n    ReviewedAt DATETIME NULL,\r\n    ReviewedBy NVARCHAR(50) NULL,\r\n    FileName NVARCHAR(255) NULL\r\n  );\r\n  CREATE INDEX IX_MinhChungTieuChi_MSSV ON MinhChungTieuChi(MSSV);\r\n  CREATE INDEX IX_MinhChungTieuChi_MaTC ON MinhChungTieuChi(MaTC);\r\nEND\r\n\r\nIF COL_LENGTH('MinhChungTieuChi', 'FileName') IS NULL\r\nBEGIN\r\n    ALTER TABLE MinhChungTieuChi ADD FileName NVARCHAR(255) NULL;\r\nEND", con))
					{
						await ensure.ExecuteNonQueryAsync();
					}
					SqlCommand insert = new SqlCommand("INSERT INTO MinhChungTieuChi(MSSV, MaTC, ImageData, Note, Status, FileName) VALUES(@m, @tc, @img, @note, @status, @fn);\r\nSELECT SCOPE_IDENTITY();", con);
					insert.Parameters.Add(new SqlParameter("@m", mssv.Trim()));
					insert.Parameters.Add(new SqlParameter("@tc", maTC));
					insert.Parameters.Add("@img", SqlDbType.VarBinary, -1).Value = bytes;
					insert.Parameters.Add(new SqlParameter("@note", ((object)note) ?? ((object)DBNull.Value)));
					insert.Parameters.Add(new SqlParameter("@status", statusStr ?? "Pending"));
					insert.Parameters.Add(new SqlParameter("@fn", file.FileName));
					int newId = Convert.ToInt32((await insert.ExecuteScalarAsync()) ?? ((object)0));
					Console.WriteLine($"[TIEUCHI-EVIDENCE] Evidence saved to MinhChungTieuChi (ID={newId}) with Status=Pending - awaiting manual attachment");
					await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, $"UPLOAD_TC_EVIDENCE MSSV={mssv} MaTC={maTC} Status={statusStr}");
					result = Results.Ok(new
					{
						id = newId,
						status = statusStr,
						message = "Minh chứng được lưu, chờ bạn định kèm vào phiếu"
					});
				}
				return result;
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error upload tieuchi evidence: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			try
			{
				using StreamReader reader = new StreamReader(req.Body);
				string body = await reader.ReadToEndAsync();
				string mssv = null;
				string namHoc = null;
				int hocKi = 0;
				List<JsonElement> items = new List<JsonElement>();
				if (!string.IsNullOrWhiteSpace(body))
				{
					JsonDocument doc = JsonDocument.Parse(body);
					JsonElement root = doc.RootElement;
					mssv = (root.TryGetProperty("mssv", out var mEl) ? mEl.GetString() : null);
					namHoc = (root.TryGetProperty("namHoc", out var nEl) ? nEl.GetString() : null);
					if (root.TryGetProperty("hocKi", out var hkEl))
					{
						int hkVal;
						if (hkEl.ValueKind == JsonValueKind.Number)
						{
							hocKi = hkEl.GetInt32();
						}
						else if (hkEl.ValueKind == JsonValueKind.String && int.TryParse(hkEl.GetString(), out hkVal))
						{
							hocKi = hkVal;
						}
					}
					if (root.TryGetProperty("tongDiem", out var tdEl))
					{
						int tdVal;
						if (tdEl.ValueKind == JsonValueKind.Number)
						{
							tdEl.GetInt32();
						}
						else if (tdEl.ValueKind != JsonValueKind.String || !int.TryParse(tdEl.GetString(), out tdVal))
						{
						}
					}
					if (root.TryGetProperty("items", out var itemsEl) && itemsEl.ValueKind == JsonValueKind.Array)
					{
						items = itemsEl.EnumerateArray().ToList();
					}
					int? directPhieuId = null;
					if (root.TryGetProperty("phieuId", out var pidEl) && pidEl.ValueKind == JsonValueKind.Number)
					{
						directPhieuId = pidEl.GetInt32();
					}
					if (directPhieuId.HasValue && directPhieuId.Value > 0)
					{
						using SqlConnection conCheck = new SqlConnection(connStr);
						await conCheck.OpenAsync();
						using SqlCommand cmdCheck = new SqlCommand("SELECT MSSV, NamHoc, HocKi FROM PhieuDanhGia WHERE Id=@id", conCheck);
						cmdCheck.Parameters.AddWithValue("@id", directPhieuId.Value);
						using SqlDataReader rdCheck = await cmdCheck.ExecuteReaderAsync();
						if (await rdCheck.ReadAsync())
						{
							mssv = rdCheck["MSSV"]?.ToString() ?? mssv;
							namHoc = rdCheck["NamHoc"]?.ToString() ?? namHoc;
							hocKi = Convert.ToInt32(rdCheck["HocKi"]);
						}
					}
				}
				if (string.IsNullOrWhiteSpace(mssv))
				{
					mssv = req.Query["mssv"].ToString();
				}
				if (string.IsNullOrWhiteSpace(mssv))
				{
					string xUser = req.Headers["X-User"].ToString();
					if (!string.IsNullOrWhiteSpace(xUser))
					{
						mssv = xUser.Trim();
					}
				}
				if (string.IsNullOrWhiteSpace(namHoc))
				{
					namHoc = req.Query["namHoc"].ToString();
				}
				if (hocKi <= 0 && int.TryParse(req.Query["hocKi"].ToString(), out var hkQ))
				{
					hocKi = hkQ;
				}
				if (string.IsNullOrWhiteSpace(namHoc) || hocKi <= 0)
				{
					using SqlConnection conTmp = new SqlConnection(connStr);
					await conTmp.OpenAsync();
					var (sysYear, sysSem) = await GetSystemYearSemesterAsync(conTmp);
					if (string.IsNullOrWhiteSpace(namHoc))
					{
						namHoc = sysYear + "-" + (sysYear + 1);
					}
					if (hocKi <= 0)
					{
						hocKi = sysSem;
					}
				}
				if (string.IsNullOrWhiteSpace(mssv) || string.IsNullOrWhiteSpace(namHoc) || hocKi <= 0)
				{
					return Results.BadRequest(new
					{
						message = "Thi?u mssv/namHoc/hocKi"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand checkFace = new SqlCommand("SELECT 1 FROM StudentFaceData WHERE MSSV=@mssv", con))
				{
					checkFace.Parameters.AddWithValue("@mssv", mssv);
					if (await checkFace.ExecuteScalarAsync() == null)
					{
						return Results.Json(new { error = "EKYC_REQUIRED", message = "Bạn chưa hoàn tất xác thực khuôn mặt (eKYC). Vui lòng xác thực trước khi thực hiện chức năng này." }, statusCode: 403);
					}
				}
				using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PhieuDanhGia' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.PhieuDanhGia (\r\n        Id INT IDENTITY(1,1) PRIMARY KEY,\r\n        MSSV CHAR(11) NOT NULL,\r\n        NamHoc NVARCHAR(20) NOT NULL,\r\n        HocKi INT NOT NULL,\r\n        TongDiem INT NOT NULL DEFAULT 0,\r\n        Status NVARCHAR(20) NOT NULL DEFAULT 'Submitted',\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        UpdatedAt DATETIME NULL,\r\n        CONSTRAINT UQ_PhieuDanhGia UNIQUE (MSSV, NamHoc, HocKi)\r\n    );\r\nEND;\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PhieuDanhGiaChiTiet' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.PhieuDanhGiaChiTiet (\r\n        Id INT IDENTITY(1,1) PRIMARY KEY,\r\n        PhieuId INT NOT NULL,\r\n        MaTC INT NOT NULL,\r\n        DiemSV INT NOT NULL,\r\n        Note NVARCHAR(500) NULL,\r\n        EvidenceData VARBINARY(MAX) NULL,\r\n        EvidenceFileName NVARCHAR(256) NULL,\r\n        CONSTRAINT UQ_PhieuDanhGiaChiTiet UNIQUE (PhieuId, MaTC),\r\n        CONSTRAINT FK_PhieuDanhGiaChiTiet_Phieu FOREIGN KEY (PhieuId) REFERENCES dbo.PhieuDanhGia(Id) ON DELETE CASCADE\r\n    );\r\n    CREATE INDEX IX_PhieuDanhGiaChiTiet_Phieu ON dbo.PhieuDanhGiaChiTiet(PhieuId);\r\nEND;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				using (SqlCommand alterCmd = new SqlCommand("\r\nIF COL_LENGTH('PhieuDanhGiaChiTiet','EvidenceData') IS NULL\r\n    ALTER TABLE PhieuDanhGiaChiTiet ADD EvidenceData VARBINARY(MAX) NULL;\r\nIF COL_LENGTH('PhieuDanhGiaChiTiet','EvidenceFileName') IS NULL\r\n    ALTER TABLE PhieuDanhGiaChiTiet ADD EvidenceFileName NVARCHAR(256) NULL;", con))
				{
					await alterCmd.ExecuteNonQueryAsync();
				}
				DateTime? evalStart = null;
				DateTime? semEnd = null;
				try
				{
					using SqlCommand cmdSet = new SqlCommand("\r\nDECLARE @hasTbl bit = CASE WHEN OBJECT_ID('SystemSettings','U') IS NULL THEN 0 ELSE 1 END;\r\nIF @hasTbl = 1\r\nBEGIN\r\n    DECLARE @hasStart bit = CASE WHEN COL_LENGTH('SystemSettings','EvalStartDate') IS NULL THEN 0 ELSE 1 END;\r\n    DECLARE @hasEnd bit = CASE WHEN COL_LENGTH('SystemSettings','SemesterEndDate') IS NULL THEN 0 ELSE 1 END;\r\n    IF @hasStart = 1 OR @hasEnd = 1\r\n        SELECT TOP 1 EvalStartDate, SemesterEndDate FROM SystemSettings;\r\n    ELSE\r\n        SELECT CAST(NULL as datetime) AS EvalStartDate, CAST(NULL as datetime) AS SemesterEndDate;\r\nEND\r\nELSE\r\n    SELECT CAST(NULL as datetime) AS EvalStartDate, CAST(NULL as datetime) AS SemesterEndDate;", con);
					using SqlDataReader rdSet = await cmdSet.ExecuteReaderAsync();
					if (await rdSet.ReadAsync())
					{
						evalStart = (rdSet.IsDBNull(0) ? ((DateTime?)null) : new DateTime?(rdSet.GetDateTime(0)));
						semEnd = (rdSet.IsDBNull(1) ? ((DateTime?)null) : new DateTime?(rdSet.GetDateTime(1)));
					}
				}
				catch
				{
				}
				DateTime today = DateTime.Today;
				List<(int MaTC, int Diem)> itemList = new List<(int, int)>();
				foreach (JsonElement it in items)
				{
					int maTCv = it.GetProperty("maTC").GetInt32();
					int diemv = it.GetProperty("diem").GetInt32();
					itemList.Add((maTCv, diemv));
				}
				int computedTotal = 0;
				if (itemList.Count > 0)
				{
					Dictionary<int, int> mapMaTCtoNhom = new Dictionary<int, int>();
					Dictionary<int, int> mapNhomMax = new Dictionary<int, int>();
					using (SqlCommand ensureCol = new SqlCommand("IF COL_LENGTH('TieuChiCon','AllowSelfEval') IS NULL ALTER TABLE TieuChiCon ADD AllowSelfEval BIT NOT NULL DEFAULT 1;", con))
					{
						await ensureCol.ExecuteNonQueryAsync();
					}
					using (SqlCommand cmd = new SqlCommand("SELECT MaTC, MaNhom, ISNULL(AllowSelfEval,1) AS AllowSelfEval, TenTC, MaSo, DiemToiDa FROM TieuChiCon", con))
					{
						using SqlDataReader rdr = await cmd.ExecuteReaderAsync();
						while (await rdr.ReadAsync())
						{
							int mtc = Convert.ToInt32(rdr["MaTC"]);
							mapMaTCtoNhom[mtc] = Convert.ToInt32(rdr["MaNhom"]);
						}
					}
					using (SqlCommand cmd2 = new SqlCommand("SELECT MaNhom, DiemToiDa FROM NhomTieuChi", con))
					{
						using SqlDataReader rdr2 = await cmd2.ExecuteReaderAsync();
						while (await rdr2.ReadAsync())
						{
							mapNhomMax[Convert.ToInt32(rdr2["MaNhom"])] = Convert.ToInt32(rdr2["DiemToiDa"]);
						}
					}
					Dictionary<int, int> groupSums = new Dictionary<int, int>();
					foreach (var (MaTC, Diem) in itemList)
					{
						if (mapMaTCtoNhom.TryGetValue(MaTC, out var maNhom))
						{
							if (!groupSums.ContainsKey(maNhom))
							{
								groupSums[maNhom] = 0;
							}
							groupSums[maNhom] += Math.Max(0, Diem);
						}
					}
					foreach (KeyValuePair<int, int> kv in groupSums)
					{
						int g = kv.Key;
						int sum = kv.Value;
						int m;
						int gMax = (mapNhomMax.TryGetValue(g, out m) ? m : sum);
						computedTotal += Math.Min(sum, gMax);
					}
				}
				int phieuId;
				using (SqlCommand sel = new SqlCommand("SELECT Id, Status FROM PhieuDanhGia WHERE MSSV=@m AND NamHoc=@n AND HocKi=@h", con))
				{
					sel.Parameters.AddWithValue("@m", mssv.Trim());
					sel.Parameters.AddWithValue("@n", namHoc.Trim());
					sel.Parameters.AddWithValue("@h", hocKi);
					using SqlDataReader rdSel = await sel.ExecuteReaderAsync();
					if (await rdSel.ReadAsync())
					{
						phieuId = Convert.ToInt32(rdSel["Id"]);
						string curStatus = rdSel["Status"]?.ToString() ?? string.Empty;
						if (string.Equals(curStatus, "ApprovedBySchool", StringComparison.OrdinalIgnoreCase))
						{
							await rdSel.CloseAsync();
							return Results.Ok(new
							{
								phieuId = phieuId,
								saved = 0,
								status = curStatus
							});
						}
						await rdSel.CloseAsync();
						if (items.Count > 0)
						{
							using SqlCommand upd = new SqlCommand("UPDATE PhieuDanhGia SET TongDiem=@t, UpdatedAt=GETDATE() WHERE Id=@id", con);
							upd.Parameters.AddWithValue("@t", computedTotal);
							upd.Parameters.AddWithValue("@id", phieuId);
							await upd.ExecuteNonQueryAsync();
						}
					}
					else
					{
						await rdSel.CloseAsync();
						if (evalStart.HasValue && today < evalStart.Value.Date)
						{
							return Results.BadRequest(new
							{
								message = "Chưa đến ngày mở đánh giá rèn luyện"
							});
						}
						if (semEnd.HasValue && today > semEnd.Value.Date)
						{
							return Results.BadRequest(new
							{
								message = "Đã hết hạn đánh giá rèn luyện"
							});
						}
						string initialStatus = "Draft";
						using SqlCommand ins = new SqlCommand("INSERT INTO PhieuDanhGia(MSSV, NamHoc, HocKi, TongDiem, Status) VALUES(@m,@n,@h,@t,'" + initialStatus + "'); SELECT SCOPE_IDENTITY();", con);
						ins.Parameters.AddWithValue("@m", mssv.Trim());
						ins.Parameters.AddWithValue("@n", namHoc.Trim());
						ins.Parameters.AddWithValue("@h", hocKi);
						ins.Parameters.AddWithValue("@t", computedTotal);
						phieuId = Convert.ToInt32(await ins.ExecuteScalarAsync());
					}
				}
				if (items.Count > 0)
				{
					HashSet<int> submittedMaTCs = itemList.Select(((int MaTC, int Diem) x) => x.MaTC).ToHashSet();
					using (SqlCommand delOld = new SqlCommand("\r\n                DELETE FROM PhieuDanhGiaChiTiet\r\n                WHERE PhieuId=@id\r\n                  AND MaTC NOT IN (SELECT value FROM STRING_SPLIT(@matcs, ','))\r\n                  AND ISNULL(AttachmentStatus,'Pending') <> 'Attached'", con))
					{
						delOld.Parameters.AddWithValue("@id", phieuId);
						delOld.Parameters.AddWithValue("@matcs", string.Join(",", submittedMaTCs));
						await delOld.ExecuteNonQueryAsync();
					}
					int saved = 0;
					foreach (JsonElement it2 in items)
					{
						int maTC = it2.GetProperty("maTC").GetInt32();
						int diem = it2.GetProperty("diem").GetInt32();
						JsonElement noteEl;
						string note = (it2.TryGetProperty("note", out noteEl) ? noteEl.GetString() : null);
						using (SqlCommand upsD = new SqlCommand("\r\n                    IF EXISTS (SELECT 1 FROM PhieuDanhGiaChiTiet WHERE PhieuId=@p AND MaTC=@tc)\r\n                        UPDATE PhieuDanhGiaChiTiet\r\n                        SET DiemSV=@d,\r\n                            Note=COALESCE(@note, Note),\r\n                            AttachmentStatus=CASE WHEN ISNULL(AttachmentStatus,'Pending')='Attached' THEN 'Attached' ELSE 'Pending' END\r\n                        WHERE PhieuId=@p AND MaTC=@tc\r\n                    ELSE\r\n                        INSERT INTO PhieuDanhGiaChiTiet(PhieuId, MaTC, DiemSV, Note, AttachmentStatus)\r\n                        VALUES(@p, @tc, @d, @note, 'Pending')", con))
						{
							upsD.Parameters.AddWithValue("@p", phieuId);
							upsD.Parameters.AddWithValue("@tc", maTC);
							upsD.Parameters.AddWithValue("@d", diem);
							upsD.Parameters.AddWithValue("@note", ((object)note) ?? ((object)DBNull.Value));
							int num = saved;
							saved = num + await upsD.ExecuteNonQueryAsync();
						}
						noteEl = default(JsonElement);
					}
					return Results.Ok(new
					{
						phieuId = phieuId,
						saved = saved,
						status = "Submitted"
					});
				}
				return Results.Ok(new
				{
					phieuId = phieuId,
					saved = 0,
					status = "Submitted"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error /api/phieu-danh-gia: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/phieu-danh-gia/list", (Func<HttpContext, Task<IResult>>)async delegate(HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string search = ctx.Request.Query["search"].ToString() ?? "";
				string namHoc = ctx.Request.Query["namHoc"].ToString() ?? "";
				string hocKi = ctx.Request.Query["hocKi"].ToString();
				string status = ctx.Request.Query["status"].ToString() ?? "";
				string maLop = ctx.Request.Query["maLop"].ToString() ?? "";
				string maKhoa = ctx.Request.Query["maKhoa"].ToString() ?? "";
				int topNum;
				int top = (int.TryParse(ctx.Request.Query["top"].ToString(), out topNum) ? topNum : 500);
				string sql = "\r\n            SELECT TOP (@top)\r\n                p.Id, p.MSSV, p.Status, p.NamHoc, p.HocKi, \r\n                p.TongDiem,\r\n                ISNULL((SELECT SUM(ct.DiemSV) FROM PhieuDanhGiaChiTiet ct WHERE ct.PhieuId = p.Id), 0) AS TongDiemThucTe,\r\n                p.CreatedAt, p.UpdatedAt,\r\n                s.TenSV, \r\n                s.MaLop,\r\n                s.MaKH,\r\n                k.TenKhoa\r\n            FROM PhieuDanhGia p\r\n            LEFT JOIN SINHVIEN s ON s.MSSV = p.MSSV\r\n            LEFT JOIN KHOA k ON k.MaKH = s.MaKH\r\n            WHERE 1=1";
				List<SqlParameter> prms = new List<SqlParameter>
				{
					new SqlParameter("@top", top)
				};
				if (!string.IsNullOrWhiteSpace(search))
				{
					sql += " AND (p.MSSV LIKE @search OR ISNULL(s.TenSV, '') LIKE @search)";
					prms.Add(new SqlParameter("@search", "%" + search + "%"));
				}
				else
				{
					if (!string.IsNullOrWhiteSpace(namHoc))
					{
						sql += " AND p.NamHoc = @namHoc";
						prms.Add(new SqlParameter("@namHoc", namHoc));
					}
					if (!string.IsNullOrWhiteSpace(hocKi) && int.TryParse(hocKi, out var hk))
					{
						sql += " AND p.HocKi = @hocKi";
						prms.Add(new SqlParameter("@hocKi", hk));
					}
				}
				if (!string.IsNullOrWhiteSpace(status))
				{
					sql += " AND p.Status = @status";
					prms.Add(new SqlParameter("@status", status));
				}
				if (!string.IsNullOrWhiteSpace(maLop))
				{
					sql += " AND s.MaLop = @maLop";
					prms.Add(new SqlParameter("@maLop", maLop));
				}
				if (!string.IsNullOrWhiteSpace(maKhoa))
				{
					sql += " AND s.MaKH = @maKhoa";
					prms.Add(new SqlParameter("@maKhoa", maKhoa));
				}
				sql += " ORDER BY p.UpdatedAt DESC";
				List<Dictionary<string, object?>> rows = await QueryAsync(con, sql, prms.ToArray());
				DateTime? deadline = null;
				try
				{
					int hocKiInt = 1;
					if (!string.IsNullOrWhiteSpace(hocKi) && int.TryParse(hocKi, out var hocKiValue))
					{
						hocKiInt = hocKiValue;
					}
					deadline = await GetDeadlineAsync(con, namHoc, hocKiInt);
					if (!deadline.HasValue)
					{
						deadline = DateTime.Now.AddDays(30.0);
					}
				}
				catch
				{
					deadline = DateTime.Now.AddDays(30.0);
				}
				var list = rows.Select(delegate(Dictionary<string, object> r)
				{
					object id = r["Id"];
					string? mssv = r["MSSV"]?.ToString() ?? "";
					string? tenSV = r["TenSV"]?.ToString() ?? "";
					string? maLop2 = r["MaLop"]?.ToString() ?? "";
					string? maKH = r["MaKH"]?.ToString() ?? "";
					string? tenKhoa = r["TenKhoa"]?.ToString() ?? "";
					string? status2 = r["Status"]?.ToString() ?? "";
					string namHoc2 = FormatNamHoc(r["NamHoc"], (int?)r["HocKi"]);
					int valueOrDefault = ((int?)r["HocKi"]).GetValueOrDefault();
					int tongDiem = ((((int?)r["TongDiemThucTe"]).GetValueOrDefault() > 0) ? ((int?)r["TongDiemThucTe"]).GetValueOrDefault() : ((int?)r["TongDiem"]).GetValueOrDefault());
					string createdAt = ((r["CreatedAt"] == null) ? "" : ((DateTime?)r["CreatedAt"])?.ToString("yyyy-MM-dd HH:mm:ss"));
					string updatedAt = ((r["UpdatedAt"] == null) ? "" : ((DateTime?)r["UpdatedAt"])?.ToString("yyyy-MM-dd HH:mm:ss"));
					string approvedDeadline = deadline?.ToString("yyyy-MM-ddTHH:mm:ssZ");
					int daysRemaining = (deadline.HasValue ? Math.Max(0, (int)(deadline.Value - DateTime.Now).TotalDays) : 0);
					int isDeadlineExpired;
					if (deadline.HasValue)
					{
						DateTime now = DateTime.Now;
						DateTime? dateTime = deadline;
						isDeadlineExpired = ((now > dateTime) ? 1 : 0);
					}
					else
					{
						isDeadlineExpired = 0;
					}
					return new
					{
						id = id,
						mssv = mssv,
						tenSV = tenSV,
						maLop = maLop2,
						maKH = maKH,
						tenKhoa = tenKhoa,
						status = status2,
						namHoc = namHoc2,
						hocKi = valueOrDefault,
						tongDiem = tongDiem,
						createdAt = createdAt,
						updatedAt = updatedAt,
						approvedDeadline = approvedDeadline,
						daysRemaining = daysRemaining,
						isDeadlineExpired = ((byte)isDeadlineExpired != 0)
					};
				}).ToList();
				Console.WriteLine($"[LIST] Returning {list.Count} records (after INNER JOIN filter):");
				foreach (var item in list)
				{
					Console.WriteLine($"  - Id={item.id}, MSSV={item.mssv}, TenSV='{item.tenSV}', Status={item.status}");
				}
				string json = JsonSerializer.Serialize(list, new JsonSerializerOptions
				{
					WriteIndented = true
				});
				Console.WriteLine("[LIST-JSON]\n" + json);
				return Results.Ok(list);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine($"[ERROR] /api/phieu-danh-gia/list: {ex4.Message}");
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/phieu-danh-gia/get-or-create/{mssv}", (_003C_003Ef__AnonymousDelegate9<string, string, int, Task<IResult>>)async delegate(string mssv, string? namHoc, int hocKi)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(mssv))
				{
					return Results.BadRequest(new
					{
						error = "MSSV required",
						reasonCode = "MISSING_MSSV"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				if (string.IsNullOrWhiteSpace(namHoc) || hocKi <= 0)
				{
					try
					{
						var (sysYear, sysSem) = await GetSystemYearSemesterAsync(con);
						if (string.IsNullOrWhiteSpace(namHoc))
						{
							namHoc = sysYear + "-" + (sysYear + 1);
						}
						if (hocKi <= 0)
						{
							hocKi = sysSem;
						}
					}
					catch
					{
						if (string.IsNullOrWhiteSpace(namHoc))
						{
							namHoc = "2025-2026";
						}
						if (hocKi <= 0)
						{
							hocKi = 1;
						}
					}
				}
				DateTime? deadline = await GetDeadlineAsync(con, namHoc, hocKi);
				if (!deadline.HasValue)
				{
					deadline = DateTime.Now.AddDays(30.0);
				}
				DateTime now = DateTime.Now;
				DateTime? dateTime = deadline;
				if (now > dateTime)
				{
					return Results.BadRequest(new
					{
						error = "Hạn chót đã qua, không thể tạo phiếu mới",
						reasonCode = "DEADLINE_EXPIRED",
						deadline = deadline.Value.ToString("yyyy-MM-dd HH:mm:ss")
					});
				}
				int luuTruNamHoc = DateTime.Now.Year;
				if (!string.IsNullOrWhiteSpace(namHoc))
				{
					string[] parts = namHoc.Trim().Split('-');
					int y3;
					if (parts.Length == 2 && int.TryParse(parts[1], out var y2))
					{
						luuTruNamHoc = y2;
					}
					else if (parts.Length != 0 && int.TryParse(parts[0], out y3))
					{
						luuTruNamHoc = y3;
					}
				}
				bool gradeDataExists = false;
				using (SqlCommand cmd = new SqlCommand("\r\n            SELECT COUNT(*) FROM LUUTRUDIEMSV \r\n            WHERE MSSV=@m AND NamHoc=@n AND HocKi=@h", con))
				{
					cmd.Parameters.AddWithValue("@m", mssv.Trim());
					cmd.Parameters.AddWithValue("@n", luuTruNamHoc);
					cmd.Parameters.AddWithValue("@h", hocKi);
					int count = ((int?)(await cmd.ExecuteScalarAsync())).GetValueOrDefault();
					gradeDataExists = count > 0;
					Console.WriteLine($"[GET-OR-CREATE] Grade data check: mssv={mssv}, namHoc={namHoc}, hocKi={hocKi}, exists={gradeDataExists}");
				}
				if (!gradeDataExists)
				{
					return Results.BadRequest(new
					{
						error = $"Không tìm thấy thông tin học tập cho {namHoc} - Học kì {hocKi}. Hãy liên hệ giảng viên hoặc trường để được cập nhật.",
						reasonCode = "NO_GRADE_DATA",
						detail = "LUUTRUDIEMSV không tồn tại cho học kì này"
					});
				}
				bool approvedExists = false;
				using (SqlCommand cmd2 = new SqlCommand("\r\n            SELECT Id FROM PhieuDanhGia \r\n            WHERE MSSV=@m AND NamHoc=@n AND HocKi=@h AND Status='Approved'", con))
				{
					cmd2.Parameters.AddWithValue("@m", mssv.Trim());
					cmd2.Parameters.AddWithValue("@n", namHoc.Trim());
					cmd2.Parameters.AddWithValue("@h", hocKi);
					using SqlDataReader reader = await cmd2.ExecuteReaderAsync();
					approvedExists = await reader.ReadAsync();
				}
				if (approvedExists)
				{
					return Results.BadRequest(new
					{
						error = "Phiếu đã được duyệt cho học kì này, không thể tạo mới",
						reasonCode = "APPROVED_FORM_EXISTS"
					});
				}
				int existingPhieuId = 0;
				string existingStatus = "";
				using (SqlCommand cmd3 = new SqlCommand("\r\n            SELECT Id, Status FROM PhieuDanhGia \r\n            WHERE MSSV=@m AND NamHoc=@n AND HocKi=@h", con))
				{
					cmd3.Parameters.AddWithValue("@m", mssv.Trim());
					cmd3.Parameters.AddWithValue("@n", namHoc.Trim());
					cmd3.Parameters.AddWithValue("@h", hocKi);
					using SqlDataReader reader2 = await cmd3.ExecuteReaderAsync();
					if (await reader2.ReadAsync())
					{
						existingPhieuId = (int)reader2["Id"];
						existingStatus = (string)reader2["Status"];
					}
				}
				HashSet<string> editableStatuses = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Draft", "Submitted", "NeedsFixByGVCN", "NeedsFixByFaculty", "RejectedByCBL", "RejectedByGVCN", "RejectedByFaculty" };
				int phieuId;
				string foundStatus;
				bool isNewPhieu;
				if (existingPhieuId > 0)
				{
					if (!editableStatuses.Contains(existingStatus))
					{
						return Results.Ok(new
						{
							success = true,
							phieuId = existingPhieuId,
							isNew = false,
							namHoc = namHoc,
							hocKi = hocKi,
							status = existingStatus,
							readOnly = true,
							deadline = DateTime.Now.AddDays(30.0).ToString("yyyy-MM-ddTHH:mm:ssZ")
						});
					}
					phieuId = existingPhieuId;
					foundStatus = existingStatus;
					isNewPhieu = false;
					Console.WriteLine($"[GET-OR-CREATE] REUSING phieu (status={existingStatus}): phieuId={phieuId}");
				}
				else
				{
					using SqlCommand ins = new SqlCommand("\r\n                INSERT INTO PhieuDanhGia(MSSV, NamHoc, HocKi, Status, CreatedAt) \r\n                VALUES(@m, @n, @h, 'Draft', GETDATE()); \r\n                SELECT SCOPE_IDENTITY();", con);
					ins.Parameters.AddWithValue("@m", mssv.Trim());
					ins.Parameters.AddWithValue("@n", namHoc.Trim());
					ins.Parameters.AddWithValue("@h", hocKi);
					phieuId = Convert.ToInt32(await ins.ExecuteScalarAsync());
					foundStatus = "Draft";
					isNewPhieu = true;
					Console.WriteLine($"[GET-OR-CREATE] Created new phieu: phieuId={phieuId}");
				}
				return Results.Ok(new
				{
					success = true,
					phieuId = phieuId,
					isNew = isNewPhieu,
					namHoc = namHoc,
					hocKi = hocKi,
					status = foundStatus,
					deadline = deadline.Value.ToString("yyyy-MM-ddTHH:mm:ssZ")
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error /api/phieu-danh-gia/get-or-create: " + ex4.Message);
				Console.WriteLine("Stack trace: " + ex4.StackTrace);
				return Results.BadRequest(new
				{
					error = ex4.Message,
					reasonCode = "EXCEPTION"
				});
			}
		});
		app.MapGet("/api/phieu-danh-gia/status", (Func<string, string, int, Task<IResult>>)async delegate(string mssv, string namHoc, int hocKi)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(mssv) || string.IsNullOrWhiteSpace(namHoc) || hocKi <= 0)
				{
					return Results.BadRequest(new
					{
						error = "mssv, namHoc, hocKi required"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand cmd = new SqlCommand("\r\n            SELECT Id, MSSV, Status, NamHoc, HocKi, TongDiem, CreatedAt, UpdatedAt \r\n            FROM PhieuDanhGia \r\n            WHERE MSSV = @mssv AND NamHoc = @namHoc AND HocKi = @hocKi", con);
				cmd.Parameters.AddWithValue("@mssv", mssv.Trim());
				cmd.Parameters.AddWithValue("@namHoc", namHoc.Trim());
				cmd.Parameters.AddWithValue("@hocKi", hocKi);
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				if (await rd.ReadAsync())
				{
					return Results.Ok(new
					{
						exists = true,
						header = new
						{
							Id = rd.GetInt32(0),
							MSSV = rd.GetString(1),
							Status = rd.GetString(2),
							NamHoc = rd.GetString(3),
							HocKi = rd.GetInt32(4),
							TongDiem = rd.GetInt32(5),
							CreatedAt = rd.GetDateTime(6),
							UpdatedAt = (rd.IsDBNull(7) ? ((DateTime?)null) : new DateTime?(rd.GetDateTime(7)))
						}
					});
				}
				return Results.Ok(new
				{
					exists = false,
					header = (object)null
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[ERROR] /api/phieu-danh-gia/status: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/phieu-danh-gia/deadline", (_003C_003Ef__AnonymousDelegate10<string, int, Task<IResult>>)async delegate(string? namHoc, int hocKi)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				DateTime? deadline = await GetDeadlineAsync(con, namHoc ?? "2025-2026", hocKi);
				if (!deadline.HasValue)
				{
					deadline = DateTime.Now.AddDays(30.0);
				}
				DateTime now = DateTime.Now;
				int daysRemaining = Math.Max(0, (int)(deadline.Value - now).TotalDays);
				bool isExpired = now > deadline.Value;
				return Results.Ok(new
				{
					deadline = deadline.Value.ToString("yyyy-MM-ddTHH:mm:ssZ"),
					daysRemaining = daysRemaining,
					isExpired = isExpired,
					formattedDeadline = deadline.Value.ToString("dd/MM/yyyy HH:mm:ss")
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[ERROR] /api/phieu-danh-gia/deadline: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapDelete("/api/phieu-danh-gia/{phieuId:int}/reset", (Func<int, Task<IResult>>)async delegate(int phieuId)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand cmd = new SqlCommand("\r\n            DELETE FROM PhieuDanhGiaChiTiet \r\n            WHERE PhieuId = @phieuId", con))
				{
					cmd.Parameters.AddWithValue("@phieuId", phieuId);
					await cmd.ExecuteNonQueryAsync();
				}
				using (SqlCommand cmd2 = new SqlCommand("\r\n            UPDATE PhieuDanhGia \r\n            SET TongDiem = 0, UpdatedAt = GETDATE(), Status = 'Submitted'\r\n            WHERE Id = @phieuId", con))
				{
					cmd2.Parameters.AddWithValue("@phieuId", phieuId);
					await cmd2.ExecuteNonQueryAsync();
				}
				Console.WriteLine($"[RESET] Phiếu {phieuId} reset successfully");
				return Results.Ok(new
				{
					success = true,
					message = "Phiếu đã được reset",
					phieuId = phieuId
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[ERROR] /api/phieu-danh-gia/reset: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapDelete("/api/phieu-danh-gia/{phieuId:int}/evidence/{maTC}", (Func<int, string, Task<IResult>>)async delegate(int phieuId, string maTC)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand cmd = new SqlCommand("\r\nUPDATE PhieuDanhGiaChiTiet \r\nSET EvidenceData = NULL, EvidenceFileName = NULL, Note = ''\r\nWHERE PhieuId=@p AND MaTC=@t", con);
				cmd.Parameters.AddWithValue("@p", phieuId);
				cmd.Parameters.AddWithValue("@t", maTC ?? "");
				if (await cmd.ExecuteNonQueryAsync() > 0)
				{
					Console.WriteLine($"[DELETE-EVIDENCE] Deleted evidence from PhieuId={phieuId}, MaTC={maTC}");
					return Results.Ok(new
					{
						message = "Minh chứng đã được xóa"
					});
				}
				return Results.NotFound(new
				{
					message = "Không tìm thấy minh chứng để xóa"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error DELETE evidence: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/debug/evidence-status", (Func<HttpContext, Task<IResult>>)async delegate(HttpContext httpContext)
		{
			try
			{
				string mssv = httpContext.Session.GetString("MaCaNhan") ?? httpContext.User?.FindFirst("MaCaNhan")?.Value;
				if (httpContext.Request.Headers.TryGetValue("X-User", out var xUser) && string.IsNullOrEmpty(mssv))
				{
					mssv = xUser.ToString();
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int totalEvidence = 0;
				int studentEvidence = 0;
				List<int> allCriteria = new List<int>();
				if (!string.IsNullOrEmpty(mssv))
				{
					using (SqlCommand cmd = new SqlCommand("SELECT COUNT(*) FROM MinhChungTieuChi WHERE MSSV=@m", con))
					{
						cmd.Parameters.AddWithValue("@m", mssv.Trim());
						studentEvidence = (int)((await cmd.ExecuteScalarAsync()) ?? ((object)0));
					}
					using SqlCommand cmd2 = new SqlCommand("SELECT DISTINCT MaTC FROM MinhChungTieuChi WHERE MSSV=@m ORDER BY MaTC", con);
					cmd2.Parameters.AddWithValue("@m", mssv.Trim());
					using SqlDataReader rdr = await cmd2.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						allCriteria.Add(rdr.GetInt32(0));
					}
				}
				using (SqlCommand cmd3 = new SqlCommand("SELECT COUNT(*) FROM MinhChungTieuChi", con))
				{
					totalEvidence = (int)((await cmd3.ExecuteScalarAsync()) ?? ((object)0));
				}
				StringValues xu;
				var result = new
				{
					currentMSSV = mssv,
					sessionMSSV = httpContext.Session.GetString("MaCaNhan"),
					claimsMSSV = httpContext.User?.FindFirst("MaCaNhan")?.Value,
					headerXUser = (httpContext.Request.Headers.TryGetValue("X-User", out xu) ? xu.ToString() : null),
					totalEvidence = totalEvidence,
					studentEvidence = studentEvidence,
					allCriteria = allCriteria
				};
				Console.WriteLine("[DEBUG-EVIDENCE] Status: " + JsonSerializer.Serialize(result));
				return Results.Ok(result);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/debug/simple-evidence/{maTC:int}", (Func<int, HttpContext, Task<IResult>>)async delegate(int maTC, HttpContext httpContext)
		{
			try
			{
				Console.WriteLine($"[SIMPLE-EVIDENCE] Test endpoint called. maTC={maTC}");
				string mssv = httpContext.Session.GetString("MaCaNhan");
				Console.WriteLine("[SIMPLE-EVIDENCE] Session MSSV: " + mssv);
				if (httpContext.Request.Headers.TryGetValue("X-User", out var xUser))
				{
					Console.WriteLine($"[SIMPLE-EVIDENCE] X-User header: {xUser}");
					if (string.IsNullOrEmpty(mssv))
					{
						mssv = xUser.ToString();
					}
				}
				if (string.IsNullOrEmpty(mssv))
				{
					return Results.Ok(new
					{
						error = "No MSSV",
						status = "FAILED"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand cmd = new SqlCommand("SELECT COUNT(*) FROM MinhChungTieuChi WHERE MSSV=@m AND MaTC=@tc", con);
				cmd.Parameters.AddWithValue("@m", mssv.Trim());
				cmd.Parameters.AddWithValue("@tc", maTC);
				int count = (int)((await cmd.ExecuteScalarAsync()) ?? ((object)0));
				Console.WriteLine($"[SIMPLE-EVIDENCE] Result: MSSV={mssv}, MaTC={maTC}, Count={count}");
				return Results.Ok(new { mssv, maTC, count });
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[SIMPLE-EVIDENCE] ERROR: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/phieu-danh-gia/{phieuId:int}/criteria/{maTC:int}/pending-evidence", (Func<int, int, HttpContext, Task<IResult>>)async delegate(int phieuId, int maTC, HttpContext httpContext)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string mssv = "";
				try
				{
					mssv = httpContext.Session.GetString("MaCaNhan");
				}
				catch
				{
				}
				if (string.IsNullOrEmpty(mssv))
				{
					mssv = httpContext.User?.FindFirst("MaCaNhan")?.Value;
				}
				if (string.IsNullOrEmpty(mssv) && httpContext.Request.Headers.TryGetValue("X-User", out var xUser))
				{
					mssv = xUser.ToString();
				}
				if (string.IsNullOrEmpty(mssv) && phieuId > 0)
				{
					using SqlCommand phieu = new SqlCommand("SELECT MSSV FROM PhieuDanhGia WHERE Id=@id", con);
					phieu.Parameters.AddWithValue("@id", phieuId);
					mssv = (await phieu.ExecuteScalarAsync()) as string;
				}
				Console.WriteLine($"[GET-PENDING-EVIDENCE] phieuId={phieuId}, maTC={maTC}, mssv={mssv}");
				if (string.IsNullOrEmpty(mssv))
				{
					Console.WriteLine("[GET-PENDING-EVIDENCE] FAILED: No MSSV found. Session=" + httpContext.Session.GetString("MaCaNhan") + ", Claims=" + httpContext.User?.FindFirst("MaCaNhan")?.Value);
					return Results.BadRequest(new
					{
						error = "Không thể xác định sinh viên. Vui lòng đăng nhập lại."
					});
				}
				string namHoc = null;
				int hocKi = 0;
				using (SqlCommand getPhieu = new SqlCommand("\r\nSELECT ISNULL(NamHoc,''), ISNULL(HocKi,0) \r\nFROM PhieuDanhGia \r\nWHERE Id=@phieuId", con))
				{
					getPhieu.Parameters.AddWithValue("@phieuId", phieuId);
					using SqlDataReader reader = await getPhieu.ExecuteReaderAsync();
					if (await reader.ReadAsync())
					{
						namHoc = reader.GetString(0);
						hocKi = reader.GetInt32(1);
					}
				}
				Console.WriteLine($"[GET-PENDING-EVIDENCE] Filtering by NamHoc={namHoc}, HocKi={hocKi}");
				using SqlCommand cmd = new SqlCommand("\r\nSELECT TOP 100 Id, MSSV, MaTC, Note, Status, CreatedAt, ImageData, NamHoc, HocKi\r\nFROM MinhChungTieuChi WITH (NOLOCK)\r\nWHERE MSSV=@m AND MaTC=@tc \r\n  AND Status IN ('Pending', 'Analyzed', 'Approved', 'Saved', 'Attached')\r\n  AND ISNULL(NamHoc,'')=@namHoc\r\n  AND ISNULL(HocKi,0)=@hocKi\r\nORDER BY \r\n  CASE WHEN Status = 'Pending' THEN 0 ELSE 1 END,\r\n  CreatedAt DESC", con)
				{
					CommandTimeout = 5
				};
				cmd.Parameters.AddWithValue("@m", mssv.Trim());
				cmd.Parameters.AddWithValue("@tc", maTC);
				cmd.Parameters.AddWithValue("@namHoc", namHoc ?? "");
				cmd.Parameters.AddWithValue("@hocKi", hocKi);
				Console.WriteLine($"[GET-PENDING-EVIDENCE] QUERY PARAMS: @m={mssv.Trim()}, @tc={maTC}, @namHoc='{namHoc}', @hocKi={hocKi}");
				List<object> pendingItems = new List<object>();
				List<object> savedItems = new List<object>();
				using SqlDataReader rdr = await cmd.ExecuteReaderAsync();
				while (await rdr.ReadAsync())
				{
					string status = rdr["Status"].ToString();
					object imageData = rdr["ImageData"];
					string imageBase64 = "";
					if (imageData != null && imageData != DBNull.Value)
					{
						try
						{
							imageBase64 = Convert.ToBase64String((byte[])imageData);
						}
						catch
						{
						}
					}
					var item = new
					{
						Id = Convert.ToInt32(rdr["Id"]),
						source = "MinhChungTieuChi",
						MSSV = rdr["MSSV"]?.ToString(),
						MaTC = Convert.ToInt32(rdr["MaTC"]),
						note = rdr["Note"]?.ToString(),
						status = status,
						createdAt = rdr["CreatedAt"],
						ImageBase64 = imageBase64,
						NamHoc = rdr["NamHoc"]?.ToString(),
						HocKi = ((rdr["HocKi"] != DBNull.Value) ? new int?(Convert.ToInt32(rdr["HocKi"])) : ((int?)null))
					};
					if (status == "Pending")
					{
						pendingItems.Add(item);
					}
					else
					{
						savedItems.Add(item);
					}
				}
				rdr.Close();
				try
				{
					using SqlCommand ensureCol = new SqlCommand("IF COL_LENGTH('Evidence','AttachedPhieuId') IS NULL ALTER TABLE Evidence ADD AttachedPhieuId INT NULL;", con);
					await ensureCol.ExecuteNonQueryAsync();
				}
				catch
				{
				}
				Console.WriteLine($"[GET-EVIDENCE] PhieuId={phieuId}, MaTC={maTC}, Pending={pendingItems.Count}, Saved={savedItems.Count}");
				return Results.Ok(new
				{
					phieuId = phieuId,
					maTC = maTC,
					pending = new
					{
						count = pendingItems.Count,
						items = pendingItems
					},
					saved = new
					{
						count = savedItems.Count,
						items = savedItems
					}
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error GET evidence: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/{id:int}/submit", (Func<int, HttpContext, Task<IResult>>)async delegate(int id, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string targetStatus = ((ctx.Request.Headers.ContainsKey("X-IsCBL") && ctx.Request.Headers["X-IsCBL"] == "true") ? "ForwardedToGVCN" : "Submitted");
				using SqlCommand cmd = new SqlCommand("\r\n            UPDATE PhieuDanhGia \r\n            SET Status = @targetStatus, UpdatedAt = GETDATE()\r\n            WHERE Id = @id AND Status = 'Draft'", con);
				cmd.Parameters.AddWithValue("@id", id);
				cmd.Parameters.AddWithValue("@targetStatus", targetStatus);
				if (await cmd.ExecuteNonQueryAsync() == 0)
				{
					return Results.BadRequest(new
					{
						message = "Không tìm thấy phiếu hoặc phiếu không ở trạng thái Chưa gửi (Draft)."
					});
				}
				return Results.Ok(new
				{
					success = true,
					status = targetStatus
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapDelete("/api/phieu-danh-gia/{id:int}", (Func<int, Task<IResult>>)async delegate(int id)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand check = new SqlCommand("SELECT Status FROM PhieuDanhGia WHERE Id = @id", con);
				check.Parameters.AddWithValue("@id", id);
				if (!(await check.ExecuteScalarAsync() is string status))
				{
					return Results.NotFound(new
					{
						message = "Không tìm thấy phiếu."
					});
				}
				if (status != "Draft")
				{
					return Results.BadRequest(new
					{
						message = "Chỉ có thể xóa phiếu khi ở trạng thái Chưa gửi (Draft)."
					});
				}
				using SqlCommand delDetails = new SqlCommand("DELETE FROM PhieuDanhGiaChiTiet WHERE PhieuId = @id", con);
				delDetails.Parameters.AddWithValue("@id", id);
				await delDetails.ExecuteNonQueryAsync();
				using SqlCommand delPhieu = new SqlCommand("DELETE FROM PhieuDanhGia WHERE Id = @id", con);
				delPhieu.Parameters.AddWithValue("@id", id);
				await delPhieu.ExecuteNonQueryAsync();
				return Results.Ok(new
				{
					success = true
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/{phieuId:int}/criteria/{maTC:int}/evidence", (Func<HttpRequest, int, int, Task<IResult>>)async delegate(HttpRequest req, int phieuId, int maTC)
		{
			try
			{
				Console.WriteLine($"[AUTO-ATTACH-ENDPOINT] POST /api/phieu-danh-gia/{phieuId}/criteria/{maTC}/evidence called");
				if (!req.HasFormContentType)
				{
					return Results.BadRequest(new
					{
						message = "FormData required"
					});
				}
				IFormCollection form = await req.ReadFormAsync();
				IFormFile file = form.Files.GetFile("file");
				if (file == null || file.Length == 0)
				{
					return Results.BadRequest(new
					{
						message = "Missing file field"
					});
				}
				form["student_id"].ToString();
				string activityNameForm = form["activity_name"].ToString();
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string mssv = null;
				using (SqlCommand phieu = new SqlCommand("SELECT MSSV FROM PhieuDanhGia WHERE Id=@id", con))
				{
					phieu.Parameters.AddWithValue("@id", phieuId);
					mssv = (await phieu.ExecuteScalarAsync()) as string;
				}
				if (string.IsNullOrEmpty(mssv))
				{
					Console.WriteLine($"[AUTO-ATTACH-ENDPOINT] Phiếu {phieuId} not found");
					return Results.NotFound(new
					{
						message = "Phiếu không tồn tại"
					});
				}
				Console.WriteLine($"[AUTO-ATTACH-ENDPOINT] Found phiếu {phieuId} with MSSV={mssv}");
				Directory.CreateDirectory(uploadRoot);
				Guid evidenceId = Guid.NewGuid();
				string origExt = Path.GetExtension(file.FileName).ToLowerInvariant();
				string filePath = Path.Combine(uploadRoot, evidenceId.ToString() + (string.IsNullOrWhiteSpace(origExt) ? ".webm" : origExt));
				await using (FileStream fs = File.Create(filePath))
				{
					await file.CopyToAsync(fs);
				}
				Console.WriteLine("[AUTO-ATTACH-ENDPOINT] Saved file to " + filePath);
				string namHoc = null;
				int hocKi = 0;
				using (SqlCommand getPhieu = new SqlCommand("\r\nSELECT ISNULL(NamHoc,''), ISNULL(HocKi,0) \r\nFROM PhieuDanhGia \r\nWHERE Id=@phieuId", con))
				{
					getPhieu.Parameters.AddWithValue("@phieuId", phieuId);
					using SqlDataReader reader = await getPhieu.ExecuteReaderAsync();
					if (await reader.ReadAsync())
					{
						namHoc = reader.GetString(0);
						hocKi = reader.GetInt32(1);
					}
				}
				Console.WriteLine($"[AUTO-ATTACH-ENDPOINT] Got NamHoc={namHoc}, HocKi={hocKi} from Phiếu {phieuId}");
				IResult result;
				await using (FileStream fsRead = File.OpenRead(filePath))
				{
					using MemoryStream msRead = new MemoryStream();
					await fsRead.CopyToAsync(msRead);
					byte[] fileBytes = msRead.ToArray();
					int minhChungId = 0;
					using (SqlCommand ensure = new SqlCommand("\r\nIF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MinhChungTieuChi' AND xtype='U')\r\nBEGIN\r\n  CREATE TABLE MinhChungTieuChi (\r\n    Id INT IDENTITY(1,1) PRIMARY KEY,\r\n    MSSV CHAR(11) NOT NULL,\r\n    MaTC INT NOT NULL,\r\n    ImageData VARBINARY(MAX) NOT NULL,\r\n    Note NVARCHAR(500) NULL,\r\n    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',\r\n    CreatedAt DATETIME DEFAULT GETDATE(),\r\n    ReviewedAt DATETIME NULL,\r\n    ReviewedBy NVARCHAR(50) NULL,\r\n    NamHoc VARCHAR(20) NULL,\r\n    HocKi INT NULL\r\n  );\r\n  CREATE INDEX IX_MinhChungTieuChi_MSSV ON MinhChungTieuChi(MSSV);\r\n  CREATE INDEX IX_MinhChungTieuChi_MaTC ON MinhChungTieuChi(MaTC);\r\nEND", con))
					{
						await ensure.ExecuteNonQueryAsync();
					}
					using (SqlCommand insertMinhChung = new SqlCommand("\r\nINSERT INTO MinhChungTieuChi(MSSV, MaTC, ImageData, Note, Status, NamHoc, HocKi, CreatedAt) \r\nVALUES(@mssv, @maTC, @imageData, @note, 'Attached', @namHoc, @hocKi, GETDATE());\r\nSELECT SCOPE_IDENTITY();", con))
					{
						insertMinhChung.Parameters.AddWithValue("@mssv", mssv.Trim());
						insertMinhChung.Parameters.AddWithValue("@maTC", maTC);
						insertMinhChung.Parameters.Add("@imageData", SqlDbType.VarBinary, -1).Value = fileBytes;
						insertMinhChung.Parameters.AddWithValue("@note", "AUTO-ATTACH: " + activityNameForm);
						insertMinhChung.Parameters.AddWithValue("@namHoc", namHoc ?? "");
						insertMinhChung.Parameters.AddWithValue("@hocKi", hocKi);
						minhChungId = Convert.ToInt32((await insertMinhChung.ExecuteScalarAsync()) ?? ((object)0));
					}
					Console.WriteLine($"[AUTO-ATTACH-ENDPOINT] Saved MinhChungTieuChi Id={minhChungId} with NamHoc={namHoc}, HocKi={hocKi}");
					using (SqlCommand check = new SqlCommand("SELECT 1 FROM PhieuDanhGiaChiTiet WHERE PhieuId=@p AND MaTC=@tc", con))
					{
						check.Parameters.AddWithValue("@p", phieuId);
						check.Parameters.AddWithValue("@tc", maTC);
						if (await check.ExecuteScalarAsync() == null)
						{
							using SqlCommand ins = new SqlCommand("\r\nINSERT INTO PhieuDanhGiaChiTiet(PhieuId, MaTC, DiemSV, EvidenceData, EvidenceFileName) \r\nVALUES(@p, @tc, 0, @data, @fn)", con);
							ins.Parameters.AddWithValue("@p", phieuId);
							ins.Parameters.AddWithValue("@tc", maTC);
							ins.Parameters.Add("@data", SqlDbType.VarBinary, -1).Value = fileBytes;
							ins.Parameters.AddWithValue("@fn", file.FileName);
							await ins.ExecuteNonQueryAsync();
							Console.WriteLine($"[AUTO-ATTACH-ENDPOINT] Created PhieuDanhGiaChiTiet for phiếu={phieuId}, maTC={maTC}");
						}
						else
						{
							using SqlCommand upd = new SqlCommand("\r\nUPDATE PhieuDanhGiaChiTiet \r\nSET EvidenceData=@data, EvidenceFileName=@fn\r\nWHERE PhieuId=@p AND MaTC=@tc", con);
							upd.Parameters.AddWithValue("@p", phieuId);
							upd.Parameters.AddWithValue("@tc", maTC);
							upd.Parameters.Add("@data", SqlDbType.VarBinary, -1).Value = fileBytes;
							upd.Parameters.AddWithValue("@fn", file.FileName);
							await upd.ExecuteNonQueryAsync();
							Console.WriteLine("[AUTO-ATTACH-ENDPOINT] Updated PhieuDanhGiaChiTiet with evidence data");
						}
					}
					Console.WriteLine($"[AUTO-ATTACH-ENDPOINT] SUCCESS: Auto-attached video for phiếu={phieuId}, maTC={maTC}, mssv={mssv}");
					result = Results.Ok(new
					{
						success = true,
						minhChungId = minhChungId,
						phieuId = phieuId,
						maTC = maTC,
						message = "Minh chứng được tự động ghi nhận"
					});
				}
				return result;
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[AUTO-ATTACH-ENDPOINT] ERROR: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/{phieuId:int}/criteria/{maTC:int}/attach", (Func<HttpRequest, int, int, Task<IResult>>)async delegate(HttpRequest req, int phieuId, int maTC)
		{
			try
			{
				if (!req.HasFormContentType)
				{
					return Results.BadRequest(new
					{
						message = "FormData required"
					});
				}
				IFormCollection form = await req.ReadFormAsync();
				string evidenceIdsStr = form["evidenceIds"].ToString();
				bool selectAll = form["selectAll"].ToString().Equals("true", StringComparison.OrdinalIgnoreCase);
				Console.WriteLine($"[ATTACH-ENDPOINT] phieuId={phieuId}, maTC={maTC}");
				Console.WriteLine($"[ATTACH-ENDPOINT] evidenceIdsStr='{evidenceIdsStr}' (length={evidenceIdsStr?.Length})");
				Console.WriteLine($"[ATTACH-ENDPOINT] selectAll={selectAll}");
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand phieu = new SqlCommand("SELECT MSSV FROM PhieuDanhGia WHERE Id=@id", con);
				phieu.Parameters.AddWithValue("@id", phieuId);
				string mssv = (await phieu.ExecuteScalarAsync()) as string;
				if (string.IsNullOrEmpty(mssv))
				{
					return Results.NotFound(new
					{
						message = "Phiếu không tồn tại"
					});
				}
				List<int> selectedIntIds = new List<int>();
				List<string> selectedGuidIds = new List<string>();
				if (selectAll)
				{
					using SqlCommand getAllCmd = new SqlCommand("\r\nSELECT Id FROM MinhChungTieuChi \r\nWHERE MSSV=@m AND MaTC=@tc AND Status='Pending'", con);
					getAllCmd.Parameters.AddWithValue("@m", mssv.Trim());
					getAllCmd.Parameters.AddWithValue("@tc", maTC);
					using SqlDataReader rdr = await getAllCmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						selectedIntIds.Add(Convert.ToInt32(rdr["Id"]));
					}
				}
				else if (!string.IsNullOrWhiteSpace(evidenceIdsStr))
				{
					try
					{
						JsonDocument doc = JsonDocument.Parse(evidenceIdsStr);
						if (doc.RootElement.ValueKind == JsonValueKind.Array)
						{
							foreach (JsonElement elem in doc.RootElement.EnumerateArray())
							{
								if (elem.ValueKind == JsonValueKind.Number && elem.TryGetInt32(out var intId))
								{
									selectedIntIds.Add(intId);
								}
								else if (elem.ValueKind == JsonValueKind.String)
								{
									string strId = elem.GetString() ?? "";
									int parsedInt;
									if (Guid.TryParse(strId, out var _))
									{
										selectedGuidIds.Add(strId);
									}
									else if (int.TryParse(strId, out parsedInt))
									{
										selectedIntIds.Add(parsedInt);
									}
								}
							}
						}
					}
					catch
					{
						return Results.BadRequest(new
						{
							message = "Invalid evidenceIds JSON"
						});
					}
				}
				if (selectedIntIds.Count == 0 && selectedGuidIds.Count == 0)
				{
					return Results.BadRequest(new
					{
						message = "No evidence selected"
					});
				}
				using (SqlCommand check = new SqlCommand("SELECT 1 FROM PhieuDanhGiaChiTiet WHERE PhieuId=@p AND MaTC=@tc", con))
				{
					check.Parameters.AddWithValue("@p", phieuId);
					check.Parameters.AddWithValue("@tc", maTC);
					if (await check.ExecuteScalarAsync() == null)
					{
						using SqlCommand ins = new SqlCommand("\r\nINSERT INTO PhieuDanhGiaChiTiet(PhieuId, MaTC, DiemSV, AttachmentStatus) \r\nVALUES(@p, @tc, 0, 'Pending')", con);
						ins.Parameters.AddWithValue("@p", phieuId);
						ins.Parameters.AddWithValue("@tc", maTC);
						await ins.ExecuteNonQueryAsync();
						Console.WriteLine($"[ATTACH] Created new PhieuDanhGiaChiTiet row for PhieuId={phieuId}, MaTC={maTC}");
					}
				}
				int attachedCount = 0;
				foreach (int evidId in selectedIntIds)
				{
					using SqlCommand update = new SqlCommand("\r\nUPDATE MinhChungTieuChi \r\nSET Status='Attached', AttachedPhieuId=@p\r\nWHERE Id=@id AND MSSV=@m AND MaTC=@tc", con);
					update.Parameters.AddWithValue("@p", phieuId);
					update.Parameters.AddWithValue("@id", evidId);
					update.Parameters.AddWithValue("@m", mssv.Trim());
					update.Parameters.AddWithValue("@tc", maTC);
					int updated = await update.ExecuteNonQueryAsync();
					if (updated > 0)
					{
						attachedCount += updated;
						byte[] imgBytes = null;
						string imgNote = "minhchung.jpg";
						using (SqlCommand fetchImg = new SqlCommand("SELECT ImageData, Note FROM MinhChungTieuChi WHERE Id=@id", con))
						{
							fetchImg.Parameters.AddWithValue("@id", evidId);
							using SqlDataReader rdrImg = await fetchImg.ExecuteReaderAsync();
							if (await rdrImg.ReadAsync())
							{
								object imgData = rdrImg["ImageData"];
								if (imgData != DBNull.Value && imgData != null)
								{
									imgBytes = (byte[])imgData;
									imgNote = rdrImg["Note"]?.ToString() ?? "minhchung.jpg";
								}
							}
						}
						if (imgBytes != null)
						{
							using SqlCommand updPct = new SqlCommand("\r\nUPDATE PhieuDanhGiaChiTiet \r\nSET EvidenceData=@data, EvidenceFileName=@fn, AttachmentStatus='Attached', AttachedAt=GETDATE()\r\nWHERE PhieuId=@p AND MaTC=@tc;", con);
							updPct.Parameters.AddWithValue("@p", phieuId);
							updPct.Parameters.AddWithValue("@tc", maTC);
							updPct.Parameters.Add("@data", SqlDbType.VarBinary, -1).Value = imgBytes;
							updPct.Parameters.AddWithValue("@fn", string.IsNullOrWhiteSpace(imgNote) ? "minhchung.jpg" : imgNote);
							await updPct.ExecuteNonQueryAsync();
						}
					}
				}
				foreach (string guidId in selectedGuidIds)
				{
					string filePath = null;
					using (SqlCommand selEv = new SqlCommand("SELECT FilePath, ActivityName FROM Evidence WHERE EvidenceId=@id AND StudentId=@m", con))
					{
						selEv.Parameters.AddWithValue("@id", guidId);
						selEv.Parameters.AddWithValue("@m", mssv.Trim());
						using SqlDataReader rEv = await selEv.ExecuteReaderAsync();
						if (await rEv.ReadAsync())
						{
							filePath = rEv["FilePath"]?.ToString();
						}
					}
					if (!string.IsNullOrEmpty(filePath) && File.Exists(filePath))
					{
						try
						{
							byte[] fileBytes = await File.ReadAllBytesAsync(filePath);
							string fileName = Path.GetFileName(filePath);
							using SqlCommand updPct2 = new SqlCommand("\r\nUPDATE PhieuDanhGiaChiTiet \r\nSET EvidenceData=@data, EvidenceFileName=@fn, AttachmentStatus='Attached', AttachedAt=GETDATE()\r\nWHERE PhieuId=@p AND MaTC=@tc;", con);
							updPct2.Parameters.AddWithValue("@p", phieuId);
							updPct2.Parameters.AddWithValue("@tc", maTC);
							updPct2.Parameters.Add("@data", SqlDbType.VarBinary, -1).Value = fileBytes;
							updPct2.Parameters.AddWithValue("@fn", fileName);
							await updPct2.ExecuteNonQueryAsync();
							using SqlCommand markUsed = new SqlCommand("UPDATE Evidence SET AttachedPhieuId=@pid WHERE CAST(EvidenceId AS NVARCHAR(50))=@gid AND StudentId=@m", con);
							markUsed.Parameters.AddWithValue("@pid", phieuId);
							markUsed.Parameters.AddWithValue("@gid", guidId);
							markUsed.Parameters.AddWithValue("@m", mssv.Trim());
							await markUsed.ExecuteNonQueryAsync();
							attachedCount++;
						}
						catch (Exception ex3)
						{
							Exception exEv = ex3;
							Console.WriteLine("[ATTACH] Error copying Evidence file " + guidId + ": " + exEv.Message);
						}
					}
					else
					{
						using SqlCommand markEv = new SqlCommand("\r\nUPDATE PhieuDanhGiaChiTiet \r\nSET AttachmentStatus='Attached', AttachedAt=GETDATE()\r\nWHERE PhieuId=@p AND MaTC=@tc;", con);
						markEv.Parameters.AddWithValue("@p", phieuId);
						markEv.Parameters.AddWithValue("@tc", maTC);
						await markEv.ExecuteNonQueryAsync();
						using SqlCommand markUsed2 = new SqlCommand("UPDATE Evidence SET AttachedPhieuId=@pid WHERE CAST(EvidenceId AS NVARCHAR(50))=@gid AND StudentId=@m", con);
						markUsed2.Parameters.AddWithValue("@pid", phieuId);
						markUsed2.Parameters.AddWithValue("@gid", guidId);
						markUsed2.Parameters.AddWithValue("@m", mssv.Trim());
						await markUsed2.ExecuteNonQueryAsync();
						attachedCount++;
						Console.WriteLine("[ATTACH] Evidence file not found on disk for " + guidId + ", marked attached anyway");
					}
				}
				using (SqlCommand upd = new SqlCommand("\r\nUPDATE PhieuDanhGiaChiTiet \r\nSET AttachmentStatus='Attached', AttachedAt=GETDATE(), AttachedCount=@cnt \r\nWHERE PhieuId=@p AND MaTC=@tc", con))
				{
					upd.Parameters.AddWithValue("@p", phieuId);
					upd.Parameters.AddWithValue("@tc", maTC);
					upd.Parameters.AddWithValue("@cnt", attachedCount);
					await upd.ExecuteNonQueryAsync();
				}
				Console.WriteLine($"[ATTACH] PhieuId={phieuId}, MaTC={maTC}, Attached {attachedCount} evidence items (MinhChung={selectedIntIds.Count}, Evidence={selectedGuidIds.Count})");
				return Results.Ok(new
				{
					phieuId = phieuId,
					maTC = maTC,
					attachedCount = attachedCount,
					message = $"Đã đính kèm {attachedCount} minh chứng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error POST attach: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/{phieuId:int}/criteria/{maTC:int}/detach", (Func<HttpRequest, int, int, Task<IResult>>)async delegate(HttpRequest req, int phieuId, int maTC)
		{
			try
			{
				string evidenceIdStr = req.Query["evidenceId"];
				if (req.HasFormContentType && string.IsNullOrEmpty(evidenceIdStr))
				{
					evidenceIdStr = (await req.ReadFormAsync())["evidenceId"].ToString();
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand phieu = new SqlCommand("SELECT MSSV FROM PhieuDanhGia WHERE Id=@id", con);
				phieu.Parameters.AddWithValue("@id", phieuId);
				string mssv = (await phieu.ExecuteScalarAsync()) as string;
				if (string.IsNullOrEmpty(mssv))
				{
					return Results.NotFound(new
					{
						message = "Phiếu không tồn tại"
					});
				}
				int detachedCount = 0;
				if (!string.IsNullOrEmpty(evidenceIdStr))
				{
					int intId;
					if (Guid.TryParse(evidenceIdStr, out var guidId))
					{
						using SqlCommand update2 = new SqlCommand("DELETE FROM PhieuDanhGiaEvidence WHERE EvidenceId = @id AND PhieuId = @p AND MaTC = @tc", con);
						update2.Parameters.AddWithValue("@id", guidId);
						update2.Parameters.AddWithValue("@p", phieuId);
						update2.Parameters.AddWithValue("@tc", maTC);
						int num = detachedCount;
						detachedCount = num + await update2.ExecuteNonQueryAsync();
					}
					else if (int.TryParse(evidenceIdStr, out intId))
					{
						using SqlCommand update3 = new SqlCommand("\r\nUPDATE MinhChungTieuChi \r\nSET Status='Pending', AttachedPhieuId = NULL\r\nWHERE Id=@id AND MSSV=@m AND MaTC=@tc", con);
						update3.Parameters.AddWithValue("@id", intId);
						update3.Parameters.AddWithValue("@m", mssv.Trim());
						update3.Parameters.AddWithValue("@tc", maTC);
						int num2 = detachedCount;
						detachedCount = num2 + await update3.ExecuteNonQueryAsync();
						if (detachedCount == 0)
						{
							using SqlCommand updChiTiet = new SqlCommand("\r\nUPDATE PhieuDanhGiaChiTiet \r\nSET AttachmentStatus='Pending', AttachedAt=NULL, AttachedCount=0, EvidenceData=NULL, EvidenceFileName=NULL\r\nWHERE Id=@id AND PhieuId=@p AND MaTC=@tc", con);
							updChiTiet.Parameters.AddWithValue("@id", intId);
							updChiTiet.Parameters.AddWithValue("@p", phieuId);
							updChiTiet.Parameters.AddWithValue("@tc", maTC);
							int num3 = detachedCount;
							detachedCount = num3 + await updChiTiet.ExecuteNonQueryAsync();
						}
					}
					using SqlCommand upd = new SqlCommand("\r\nUPDATE PhieuDanhGiaChiTiet \r\nSET AttachedCount = (SELECT COUNT(*) FROM MinhChungTieuChi WHERE MSSV=@m AND MaTC=@tc AND Status='Attached' AND (AttachedPhieuId=@p OR AttachedPhieuId IS NULL)) + \r\n                    (SELECT COUNT(*) FROM PhieuDanhGiaEvidence WHERE PhieuId=@p AND MaTC=@tc)\r\nWHERE PhieuId=@p AND MaTC=@tc", con);
					upd.Parameters.AddWithValue("@p", phieuId);
					upd.Parameters.AddWithValue("@tc", maTC);
					upd.Parameters.AddWithValue("@m", mssv.Trim());
					await upd.ExecuteNonQueryAsync();
				}
				else
				{
					using SqlCommand update4 = new SqlCommand("\r\nUPDATE MinhChungTieuChi \r\nSET Status='Pending', AttachedPhieuId = NULL\r\nWHERE MSSV=@m AND MaTC=@tc AND Status='Attached'", con);
					update4.Parameters.AddWithValue("@m", mssv.Trim());
					update4.Parameters.AddWithValue("@tc", maTC);
					detachedCount = await update4.ExecuteNonQueryAsync();
					using SqlCommand updateEv = new SqlCommand("DELETE FROM PhieuDanhGiaEvidence WHERE PhieuId = @p AND MaTC = @tc", con);
					updateEv.Parameters.AddWithValue("@p", phieuId);
					updateEv.Parameters.AddWithValue("@tc", maTC);
					await updateEv.ExecuteNonQueryAsync();
					using SqlCommand upd2 = new SqlCommand("\r\nUPDATE PhieuDanhGiaChiTiet \r\nSET AttachmentStatus='Pending', AttachedAt=NULL, AttachedCount=0, EvidenceData=NULL, EvidenceFileName=NULL\r\nWHERE PhieuId=@p AND MaTC=@tc", con);
					upd2.Parameters.AddWithValue("@p", phieuId);
					upd2.Parameters.AddWithValue("@tc", maTC);
					await upd2.ExecuteNonQueryAsync();
				}
				Console.WriteLine($"[DETACH] PhieuId={phieuId}, MaTC={maTC}, Detached {detachedCount} evidence items");
				await LogAsync(app.Services.GetRequiredService<IHttpContextAccessor>()?.HttpContext, con, $"DETACH_EVIDENCE PhieuId={phieuId} MaTC={maTC} Count={detachedCount}");
				return Results.Ok(new
				{
					phieuId = phieuId,
					maTC = maTC,
					detachedCount = detachedCount,
					message = $"Đã bỏ định kèm {detachedCount} minh chứng"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error POST detach: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/phieu-danh-gia/{phieuId:int}/criteria/{maTC:int}/evidence", (Func<int, int, Task<IResult>>)async delegate(int phieuId, int maTC)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<object> list = new List<object>();
				using (SqlCommand cmd = new SqlCommand("SELECT MSSV FROM PhieuDanhGia WHERE Id = @id", con))
				{
					cmd.Parameters.AddWithValue("@id", phieuId);
					object mssv = await cmd.ExecuteScalarAsync();
					if (mssv == null)
					{
						return Results.NotFound(new
						{
							message = "Phiếu không tìm thấy"
						});
					}
					using SqlCommand cmd2 = new SqlCommand("\r\nSELECT CAST(pde.EvidenceId AS NVARCHAR(50)) AS EvidenceId, ev.ActivityName, ev.OriginalFileName, ev.FilePath, 'PhieuDanhGiaEvidence' AS SourceTable\r\nFROM PhieuDanhGiaEvidence pde\r\nINNER JOIN Evidence ev ON pde.EvidenceId = ev.EvidenceId\r\nWHERE pde.PhieuId = @id AND pde.MaTC = @tc\r\n\r\nUNION ALL\r\n\r\nSELECT CAST(m.Id AS NVARCHAR(50)) AS EvidenceId, ISNULL(m.Note, 'Minh chứng hoạt động') AS ActivityName, ISNULL(m.FileName, 'minhchung.jpg') AS OriginalFileName, NULL AS FilePath, 'MinhChungTieuChi' AS SourceTable\r\nFROM MinhChungTieuChi m\r\nWHERE m.MSSV = @mssv AND m.MaTC = @tc AND m.Status = 'Attached' AND m.AttachedPhieuId = @id\r\n\r\nUNION ALL\r\n\r\nSELECT CAST(c.Id AS NVARCHAR(50)) AS EvidenceId, N'Minh chứng tải lên' AS ActivityName, c.EvidenceFileName AS OriginalFileName, NULL AS FilePath, 'PhieuDanhGiaChiTiet' AS SourceTable\r\nFROM PhieuDanhGiaChiTiet c\r\nWHERE c.PhieuId = @id AND c.MaTC = @tc AND c.EvidenceData IS NOT NULL\r\n  AND NOT EXISTS (\r\n      SELECT 1 FROM MinhChungTieuChi mm \r\n      WHERE mm.MSSV = @mssv AND mm.MaTC = c.MaTC AND mm.Status = 'Attached' AND mm.AttachedPhieuId = @id\r\n  )", con);
					cmd2.Parameters.AddWithValue("@id", phieuId);
					cmd2.Parameters.AddWithValue("@tc", maTC);
					cmd2.Parameters.AddWithValue("@mssv", mssv.ToString());
					using SqlDataReader rdr = await cmd2.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						string evidenceId = rdr["EvidenceId"]?.ToString() ?? "";
						string originalFileName = rdr["OriginalFileName"]?.ToString() ?? "minhchung.jpg";
						string sourceTable = rdr["SourceTable"]?.ToString() ?? "";
						string activityName = rdr["ActivityName"]?.ToString() ?? "";
						list.Add(new { evidenceId, sourceTable, originalFileName, activityName });
					}
				}
				return Results.Ok(list);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("Error GET criteria evidence list: " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/phieu-danh-gia/auto-preview", (Func<string, string, int, Task<IResult>>)async delegate(string mssv, string namHoc, int hocKi)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensureCol = new SqlCommand("IF COL_LENGTH('TieuChiCon','AllowSelfEval') IS NULL ALTER TABLE TieuChiCon ADD AllowSelfEval BIT NOT NULL DEFAULT 1;", con))
				{
					await ensureCol.ExecuteNonQueryAsync();
				}
				List<Dictionary<string, object?>> list = new List<Dictionary<string, object>>();
				using (SqlCommand cmd = new SqlCommand("SELECT MaTC, TenTC, MaSo, DiemToiDa FROM TieuChiCon WHERE ISNULL(AllowSelfEval,1)=0 ORDER BY MaNhom, MaTC", con))
				{
					using SqlDataReader rd = await cmd.ExecuteReaderAsync();
					while (await rd.ReadAsync())
					{
						int maTC = Convert.ToInt32(rd["MaTC"]);
						int diem = await ComputeAutoScoreAsync(tenTc: rd["TenTC"]?.ToString() ?? string.Empty, maSo: rd["MaSo"]?.ToString() ?? string.Empty, max: (rd["DiemToiDa"] != DBNull.Value) ? Convert.ToInt32(rd["DiemToiDa"]) : 0, con: con, mssv: mssv.Trim(), namHoc: namHoc.Trim(), hocKi: hocKi);
						list.Add(new Dictionary<string, object>
						{
							["MaTC"] = maTC,
							["Diem"] = diem
						});
					}
				}
				return Results.Ok(list);
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/phieu-danh-gia/mine-approved", (Func<string, Task<IResult>>)async delegate(string mssv)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PhieuDanhGia' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE dbo.PhieuDanhGia (\r\n        Id INT IDENTITY(1,1) PRIMARY KEY,\r\n        MSSV CHAR(11) NOT NULL,\r\n        NamHoc NVARCHAR(20) NOT NULL,\r\n        HocKi INT NOT NULL,\r\n        TongDiem INT NOT NULL DEFAULT 0,\r\n        Status NVARCHAR(20) NOT NULL DEFAULT 'Submitted',\r\n        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),\r\n        UpdatedAt DATETIME NULL,\r\n        CONSTRAINT UQ_PhieuDanhGia UNIQUE (MSSV, NamHoc, HocKi)\r\n    );\r\nEND", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string sql = "SELECT p.Id, p.MSSV, p.NamHoc, p.HocKi, p.TongDiem, p.Status, \r\n                          s.TenSV AS TenSV, p.CreatedAt, p.UpdatedAt\r\n                    FROM PhieuDanhGia p\r\n                    LEFT JOIN SinhVien s ON p.MSSV = s.MSSV\r\n                    WHERE p.MSSV=@m AND p.Status='ApprovedBySchool'\r\n                    ORDER BY p.NamHoc DESC, p.HocKi DESC, p.UpdatedAt DESC";
				return Results.Ok(await QueryAsync(con, sql, new SqlParameter[1]
				{
					new SqlParameter("@m", mssv.Trim())
				}));
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/phieu-danh-gia/{id:int}/full", (Func<int, Task<IResult>>)async delegate(int id)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<Dictionary<string, object?>> headers = await QueryAsync(con, "\r\n            SELECT p.Id, p.MSSV, p.NamHoc, p.HocKi, p.TongDiem, p.Status,\r\n                   p.CreatedAt, p.UpdatedAt,\r\n                   p.ForwardedToLecturerAt, p.ForwardedToLecturerBy,\r\n                   p.ApprovedByGVAt, p.ApprovedByGVBy,\r\n                   p.ForwardedToFacultyAt, p.ForwardedToFacultyBy,\r\n                   p.ForwardedToSchoolAt, p.ForwardedToSchoolBy,\r\n                   p.ApprovedBySchoolAt, p.ApprovedBySchoolBy,\r\n                   p.RejectedAt, p.RejectedBy, p.rejection_reason,\r\n                   p.LastStatusReason,\r\n                   sv.TenSV, l.TenLop, k.TenKhoa\r\n            FROM PhieuDanhGia p\r\n            LEFT JOIN SINHVIEN sv ON sv.MSSV = p.MSSV\r\n            LEFT JOIN LOP l ON l.MaLop = sv.MaLop\r\n            LEFT JOIN KHOA k ON k.MaKH = l.MaKH\r\n            WHERE p.Id = @id", new SqlParameter[1]
				{
					new SqlParameter("@id", id)
				});
				if (!headers.Any())
				{
					return Results.NotFound(new
					{
						message = "Phieu khong tim thay"
					});
				}
				Dictionary<string, object?> header = headers[0];
				List<Dictionary<string, object?>> items = await QueryAsync(con, "\r\n            SELECT ct.Id, ct.MaTC, ct.DiemSV, ct.Note,\r\n                   ct.EvidenceFileName, ct.AttachmentStatus,\r\n                   tc.TenTC, tc.DiemToiDa AS DiemToiDaTC, tc.MaNhom, tc.MaSo,\r\n                   nh.TenNhom, nh.DiemToiDa AS DiemToiDaNhom\r\n            FROM PhieuDanhGiaChiTiet ct\r\n            LEFT JOIN TieuChiCon tc ON tc.MaTC = ct.MaTC\r\n            LEFT JOIN NhomTieuChi nh ON nh.MaNhom = tc.MaNhom\r\n            WHERE ct.PhieuId = @id\r\n            ORDER BY tc.MaNhom, tc.MaSo", new SqlParameter[1]
				{
					new SqlParameter("@id", id)
				});
				List<Dictionary<string, object?>> groups = await QueryAsync(con, "SELECT MaNhom, TenNhom, DiemToiDa FROM NhomTieuChi ORDER BY MaNhom", Array.Empty<SqlParameter>());
				List<Dictionary<string, object?>> evidences = new List<Dictionary<string, object>>();
				try
				{
					string mssvParam = header["MSSV"]?.ToString()?.Trim() ?? "";
					evidences = await QueryAsync(con, "\r\n                SELECT pde.MaTC, CAST(pde.EvidenceId AS NVARCHAR(50)) AS EvidenceId, ev.ActivityName, ev.OriginalFileName, ev.FilePath, 'PhieuDanhGiaEvidence' AS SourceTable\r\n                FROM PhieuDanhGiaEvidence pde\r\n                LEFT JOIN Evidence ev ON pde.EvidenceId = ev.EvidenceId\r\n                WHERE pde.PhieuId = @id\r\n                \r\n                UNION ALL\r\n                \r\n                SELECT m.MaTC, CAST(m.Id AS NVARCHAR(50)) AS EvidenceId, ISNULL(m.Note, 'Minh chứng hoạt động') AS ActivityName, ISNULL(m.FileName, 'minhchung.jpg') AS OriginalFileName, NULL AS FilePath, 'MinhChungTieuChi' AS SourceTable\r\n                FROM MinhChungTieuChi m\r\n                WHERE m.MSSV = @mssv AND m.Status = 'Attached' AND (m.AttachedPhieuId = @id OR m.AttachedPhieuId IS NULL)\r\n                \r\n                UNION ALL\r\n                \r\n                SELECT c.MaTC, CAST(c.Id AS NVARCHAR(50)) AS EvidenceId, N'Minh chứng tải lên' AS ActivityName, c.EvidenceFileName AS OriginalFileName, NULL AS FilePath, 'PhieuDanhGiaChiTiet' AS SourceTable\r\n                FROM PhieuDanhGiaChiTiet c\r\n                WHERE c.PhieuId = @id AND c.EvidenceFileName IS NOT NULL AND NOT EXISTS (\r\n                    SELECT 1 FROM MinhChungTieuChi mm WHERE mm.MSSV = @mssv AND mm.MaTC = c.MaTC AND mm.Status = 'Attached' AND mm.AttachedPhieuId = @id\r\n                )\r\n            ", new SqlParameter[2]
					{
						new SqlParameter("@id", id),
						new SqlParameter("@mssv", mssvParam)
					});
				}
				catch
				{
				}
				return Results.Ok(new { header, items, groups, evidences });
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[PHIEU_FULL_ERROR] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/cbl/bulk-approve-forward", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			try
			{
				using StreamReader reader = new StreamReader(req.Body);
				JsonDocument doc = JsonDocument.Parse(await reader.ReadToEndAsync());
				JsonElement root = doc.RootElement;
				string currentUser = req.Headers["X-User"].ToString() ?? "Unknown";
				JsonElement idsEl;
				List<int> ids = ((root.TryGetProperty("ids", out idsEl) && idsEl.ValueKind == JsonValueKind.Array) ? (from x in idsEl.EnumerateArray()
					select x.GetInt32()).ToList() : new List<int>());
				if (!ids.Any())
				{
					return Results.BadRequest(new
					{
						error = "Không có phiếu nào được chọn"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int processed = 0;
				foreach (int id in ids)
				{
					using SqlCommand upd = new SqlCommand("\r\n                UPDATE PhieuDanhGia\r\n                SET Status='ForwardedToGVCN', ApprovedByCBLAt=GETDATE(), ApprovedByCBLBy=@by, UpdatedAt=GETDATE()\r\n                OUTPUT INSERTED.MSSV\r\n                WHERE Id=@id AND Status='Submitted'", con);
					upd.Parameters.AddWithValue("@by", currentUser);
					upd.Parameters.AddWithValue("@id", id);
					object mssvObj = await upd.ExecuteScalarAsync();
					if (mssvObj != null)
					{
						processed++;
						string mssvStr = mssvObj.ToString();
						using SqlCommand notif = new SqlCommand("INSERT INTO Notifications (Recipient, Title, Message, Link, StudentId) VALUES (@uid, N'CBL đã duyệt phiếu ĐGRL', N'Phiếu ĐGRL của bạn đã được CBL duyệt, hiện đang chờ GVCN xem xét.', '/index.html#eval', @uid)", con);
						notif.Parameters.AddWithValue("@uid", mssvStr);
						await notif.ExecuteNonQueryAsync();
					}
				}
				return Results.Ok(new
				{
					processed = processed,
					total = ids.Count
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[CBL_BULK_APPROVE_ERROR] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/{id:int}/update-item", (Func<int, HttpRequest, Task<IResult>>)async delegate(int id, HttpRequest req)
		{
			try
			{
				using StreamReader body = new StreamReader(req.Body);
				JsonDocument doc = JsonDocument.Parse(await body.ReadToEndAsync());
				JsonElement root = doc.RootElement;
				if (!root.TryGetProperty("maTC", out var pMaTC))
				{
					throw new Exception("Thiếu maTC");
				}
				int maTC = pMaTC.GetInt32();
				if (!root.TryGetProperty("diemSV", out var pDiem))
				{
					throw new Exception("Thiếu diemSV");
				}
				int diemSV = pDiem.GetInt32();
				JsonElement pNote;
				string note = (root.TryGetProperty("note", out pNote) ? pNote.GetString() : null);
				JsonElement pItem;
				int? itemId = ((root.TryGetProperty("itemId", out pItem) && pItem.ValueKind != JsonValueKind.Null) ? new int?(pItem.GetInt32()) : ((int?)null));
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand chk = new SqlCommand("SELECT Id FROM PhieuDanhGia WHERE Id=@id", con))
				{
					chk.Parameters.AddWithValue("@id", id);
					if (await chk.ExecuteScalarAsync() == null)
					{
						return Results.NotFound(new
						{
							message = "Phiếu không tìm thấy"
						});
					}
				}
				if (itemId.HasValue)
				{
					using SqlCommand upd = new SqlCommand("\r\n                UPDATE PhieuDanhGiaChiTiet\r\n                SET DiemSV=@diem, Note=@note\r\n                WHERE Id=@itemId AND PhieuId=@phieuId", con);
					upd.Parameters.AddWithValue("@diem", diemSV);
					upd.Parameters.AddWithValue("@note", ((object)note) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@itemId", itemId.Value);
					upd.Parameters.AddWithValue("@phieuId", id);
					await upd.ExecuteNonQueryAsync();
				}
				else
				{
					using SqlCommand ups = new SqlCommand("\r\n                IF EXISTS (SELECT 1 FROM PhieuDanhGiaChiTiet WHERE PhieuId=@p AND MaTC=@tc)\r\n                    UPDATE PhieuDanhGiaChiTiet SET DiemSV=@diem, Note=@note WHERE PhieuId=@p AND MaTC=@tc\r\n                ELSE\r\n                    INSERT INTO PhieuDanhGiaChiTiet(PhieuId, MaTC, DiemSV, Note, AttachmentStatus)\r\n                    VALUES(@p, @tc, @diem, @note, 'Pending')", con);
					ups.Parameters.AddWithValue("@p", id);
					ups.Parameters.AddWithValue("@tc", maTC);
					ups.Parameters.AddWithValue("@diem", diemSV);
					ups.Parameters.AddWithValue("@note", ((object)note) ?? ((object)DBNull.Value));
					await ups.ExecuteNonQueryAsync();
				}
				using SqlCommand recalc = new SqlCommand("\r\n            UPDATE PhieuDanhGia\r\n            SET TongDiem = (SELECT COALESCE(SUM(DiemSV),0) FROM PhieuDanhGiaChiTiet WHERE PhieuId=@id),\r\n                UpdatedAt = GETDATE()\r\n            WHERE Id=@id", con);
				recalc.Parameters.AddWithValue("@id", id);
				await recalc.ExecuteNonQueryAsync();
				return Results.Ok(new
				{
					message = "Đã lưu"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/cbl/bulk-reject", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			try
			{
				using StreamReader reader = new StreamReader(req.Body);
				JsonDocument doc = JsonDocument.Parse(await reader.ReadToEndAsync());
				JsonElement root = doc.RootElement;
				if (req.Headers["X-User"].ToString() == null)
				{
				}
				JsonElement rEl;
				string reason = (root.TryGetProperty("reason", out rEl) ? (rEl.GetString() ?? "") : "");
				JsonElement idsEl;
				List<int> ids = ((root.TryGetProperty("ids", out idsEl) && idsEl.ValueKind == JsonValueKind.Array) ? (from x in idsEl.EnumerateArray()
					select x.GetInt32()).ToList() : new List<int>());
				if (!ids.Any())
				{
					return Results.BadRequest(new
					{
						error = "Không có phiếu nào được chọn"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int processed = 0;
				foreach (int id in ids)
				{
					using SqlCommand upd = new SqlCommand("\r\n                UPDATE PhieuDanhGia\r\n                SET Status='RejectedByCBL', CBLNotes=@reason, UpdatedAt=GETDATE()\r\n                OUTPUT INSERTED.MSSV\r\n                WHERE Id=@id AND Status='Submitted'", con);
					upd.Parameters.AddWithValue("@reason", ((object)reason) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@id", id);
					object mssvObj = await upd.ExecuteScalarAsync();
					if (mssvObj != null)
					{
						processed++;
						string mssvStr = mssvObj.ToString();
						string msg = string.IsNullOrEmpty(reason) ? "Phiếu ĐGRL của bạn đã bị CBL từ chối." : "Phiếu ĐGRL của bạn đã bị CBL từ chối. Lý do: " + reason;
						using SqlCommand notif = new SqlCommand("INSERT INTO Notifications (Recipient, Title, Message, Link, StudentId) VALUES (@uid, N'CBL từ chối phiếu ĐGRL', @msg, '/index.html#eval', @uid)", con);
						notif.Parameters.AddWithValue("@uid", mssvStr);
						notif.Parameters.AddWithValue("@msg", msg);
						await notif.ExecuteNonQueryAsync();
					}
				}
				return Results.Ok(new
				{
					processed = processed,
					total = ids.Count
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[CBL_BULK_REJECT_ERROR] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/{id:int}/approve-cbl", (Func<int, HttpContext, Task<IResult>>)async delegate(int id, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string currentUser = ctx.User?.FindFirst("sub")?.Value ?? ctx.Request.Headers["X-User"].ToString() ?? "Unknown";
				SqlCommand cmd = new SqlCommand("\r\n            SELECT TOP 1 Id, MSSV, Status, NamHoc, HocKi\r\n            FROM PhieuDanhGia WHERE Id=@id", con);
				cmd.Parameters.AddWithValue("@id", id);
				string mssv = null;
				using (SqlDataReader rd = await cmd.ExecuteReaderAsync())
				{
					if (!(await rd.ReadAsync()))
					{
						return Results.NotFound(new
						{
							message = "Phi?u kh\ufffdng t\ufffdm th?y"
						});
					}
					mssv = rd["MSSV"]?.ToString();
					rd["NamHoc"]?.ToString();
					_ = rd["HocKi"];
				}
				SqlCommand check = new SqlCommand("\r\n                SELECT 1 FROM SINHVIEN \r\n                WHERE MSSV=@mssv AND MaLop=(\r\n                    SELECT LopCV FROM GiangVien WHERE MaCaNhan=@cbl\r\n                )", con);
				check.Parameters.AddWithValue("@mssv", mssv);
				check.Parameters.AddWithValue("@cbl", currentUser);
				bool isCBLOwn = await check.ExecuteScalarAsync() != null;
				string newStatus = (isCBLOwn ? "ForwardedToGVCN" : "ApprovedByCBL");
				SqlCommand upd = new SqlCommand("\r\n            UPDATE PhieuDanhGia \r\n            SET \r\n                Status = @status,\r\n                ApprovedByCBLAt = GETDATE(),\r\n                ApprovedByCBLBy = @cblId,\r\n                CBLNotes = @notes,\r\n                UpdatedAt = GETDATE()\r\n            WHERE Id = @id", con);
				upd.Parameters.AddWithValue("@status", newStatus);
				upd.Parameters.AddWithValue("@cblId", currentUser);
				upd.Parameters.AddWithValue("@notes", DBNull.Value);
				upd.Parameters.AddWithValue("@id", id);
				await upd.ExecuteNonQueryAsync();
				if (!isCBLOwn)
				{
					await LogAsync(ctx, con, $"CBL_APPROVED Id={id} MSSV={mssv}");
				}
				else
				{
					await LogAsync(ctx, con, $"CBL_APPROVED_AND_FORWARDED_TO_GVCN Id={id} MSSV={mssv}");
				}
				if (isCBLOwn)
				{
					try
					{
						SqlCommand fwd = new SqlCommand("\r\n                    INSERT INTO ForwardedLog (PhieuDanhGiaId, FromRole, ToRole, ByUserId, Reason, ForwardedAt)\r\n                    VALUES (@pId, @from, @to, @byId, @reason, GETDATE())", con);
						fwd.Parameters.AddWithValue("@pId", id);
						fwd.Parameters.AddWithValue("@from", "CBL");
						fwd.Parameters.AddWithValue("@to", "GVCN");
						fwd.Parameters.AddWithValue("@byId", currentUser);
						fwd.Parameters.AddWithValue("@reason", DBNull.Value);
						await fwd.ExecuteNonQueryAsync();
					}
					catch
					{
					}
				}
				try
				{
					SqlCommand notif = new SqlCommand("\r\n                INSERT INTO Notifications (Recipient, Title, Message, Link, StudentId)\r\n                VALUES (@uid, @title, @msg, '/index.html#eval', @sId)", con);
					notif.Parameters.AddWithValue("@uid", ((object)mssv) ?? ((object)DBNull.Value));
					notif.Parameters.AddWithValue("@title", isCBLOwn ? "CBL đã duyệt - Chờ GVCN" : "CBL đã duyệt phiếu ĐGRL");
					notif.Parameters.AddWithValue("@msg", isCBLOwn ? "Phiếu ĐGRL của bạn đã được CBL duyệt, hiện đang chờ GVCN xem xét." : "Phiếu ĐGRL của bạn đã được CBL duyệt.");
					notif.Parameters.AddWithValue("@sId", ((object)mssv) ?? ((object)DBNull.Value));
					await notif.ExecuteNonQueryAsync();
				}
				catch
				{
				}
				return Results.Ok(new
				{
					message = "Approved by CBL",
					status = newStatus
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/{id:int}/gvcn-action", (Func<int, HttpContext, Task<IResult>>)async delegate(int id, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string currentUser = ctx.User?.FindFirst("sub")?.Value ?? ctx.Request.Headers["X-User"].ToString() ?? "Unknown";
				string action = (ctx.Request.Query["action"].ToString() ?? "").ToLower();
				string reason = ctx.Request.Query["reason"].ToString() ?? "";
				if (!Enumerable.Contains(new string[3] { "approve", "reject", "request-fix" }, action))
				{
					return Results.BadRequest(new
					{
						message = "Action pháº£i lÃ\u00a0: approve, reject, hoáº·c request-fix"
					});
				}
				SqlCommand cmd = new SqlCommand("SELECT TOP 1 Id, MSSV, Status FROM PhieuDanhGia WHERE Id=@id", con);
				cmd.Parameters.AddWithValue("@id", id);
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				if (!(await rd.ReadAsync()))
				{
					return Results.NotFound(new
					{
						message = "Phieu khong tim thay"
					});
				}
				string mssv = rd["MSSV"]?.ToString();
				string currentStatus = rd["Status"]?.ToString();
				await rd.CloseAsync();
				string[] allowedGvcnStatuses = new string[2] { "ForwardedToGVCN", "NeedsFixByGVCN" };
				if (!allowedGvcnStatuses.Contains<string>(currentStatus, StringComparer.OrdinalIgnoreCase))
				{
					return Results.BadRequest(new
					{
						message = "Phieu dang o trang thai '" + currentStatus + "', khong the thuc hien thao tac nay"
					});
				}
				if (1 == 0)
				{
				}
				string text = action switch
				{
					"approve" => "ForwardedToFaculty", 
					"reject" => "RejectedByGVCN", 
					"request-fix" => "NeedsFixByGVCN", 
					_ => currentStatus ?? "Unknown", 
				};
				if (1 == 0)
				{
				}
				string newStatus = text;
				if (1 == 0)
				{
				}
				text = action switch
				{
					"approve" => "Duyet", 
					"reject" => "Tu choi", 
					"request-fix" => "Yeu cau sua", 
					_ => "Thay doi", 
				};
				if (1 == 0)
				{
				}
				string actionLabel = text;
				SqlCommand upd = new SqlCommand("\r\n            UPDATE PhieuDanhGia \r\n            SET \r\n                Status = @status,\r\n                ApprovedByGVAt = GETDATE(),\r\n                ApprovedByGVBy = @gvcnId,\r\n                LastStatusReason = @reason,\r\n                UpdatedAt = GETDATE()\r\n            WHERE Id = @id", con);
				upd.Parameters.AddWithValue("@status", newStatus);
				upd.Parameters.AddWithValue("@gvcnId", currentUser);
				upd.Parameters.AddWithValue("@reason", ((object)reason) ?? ((object)DBNull.Value));
				upd.Parameters.AddWithValue("@id", id);
				await upd.ExecuteNonQueryAsync();
				SqlCommand ins = new SqlCommand("\r\n            INSERT INTO ForwardedLog(PhieuId, FromRole, ToRole, Status, ForwardedAt, ForwardedBy, Notes)\r\n            VALUES(@phieu, 'GVCN', @toRole, @status, GETDATE(), @by, @notes)", con);
				ins.Parameters.AddWithValue("@phieu", id);
				ins.Parameters.AddWithValue("@toRole", (action == "approve") ? "Faculty" : "Student");
				ins.Parameters.AddWithValue("@status", newStatus);
				ins.Parameters.AddWithValue("@by", currentUser);
				ins.Parameters.AddWithValue("@notes", ((object)reason) ?? ((object)DBNull.Value));
				await ins.ExecuteNonQueryAsync();
				try
				{
					SqlCommand noti = new SqlCommand("\r\n                INSERT INTO Notifications(Recipient, Title, Message, Link, StudentId)\r\n                VALUES(@uid, @title, @msg, @link, @sId)", con);
					string notifRecipient = ((action == "approve") ? "ALL_KHOA" : (mssv ?? "student"));
					string notifTitle = "GVCN đã " + actionLabel.ToLower() + " phiếu ĐGRL";
					string notifMsg = ((!string.IsNullOrEmpty(reason)) ? ("GVCN đã " + actionLabel.ToLower() + " phiếu ĐGRL của bạn. Lý do: " + reason) : ("GVCN đã " + actionLabel.ToLower() + " phiếu ĐGRL của bạn."));
					if (action == "approve") notifMsg = "GVCN đã duyệt phiếu ĐGRL của sinh viên " + mssv + ". Vui lòng duyệt cấp Khoa.";
					noti.Parameters.AddWithValue("@uid", notifRecipient);
					noti.Parameters.AddWithValue("@title", notifTitle);
					noti.Parameters.AddWithValue("@msg", notifMsg);
					noti.Parameters.AddWithValue("@link", action == "approve" ? "/khoa.html#approval" : "/index.html#eval");
					noti.Parameters.AddWithValue("@sId", ((object)mssv) ?? ((object)DBNull.Value));
					await noti.ExecuteNonQueryAsync();
				}
				catch
				{
				}
				await LogAsync(ctx, con, $"[GVCN_{action.ToUpper()}] PhieuId={id} MSSV={mssv} By={currentUser} Reason={reason}");
				return Results.Ok(new
				{
					status = newStatus,
					action = action,
					message = "GVCN da " + actionLabel.ToLower() + " phieu"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[GVCN_ACTION_ERROR] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/{id:int}/approve-faculty", (Func<int, HttpContext, Task<IResult>>)async delegate(int id, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string currentUser = ctx.User?.FindFirst("sub")?.Value ?? ctx.Request.Headers["X-User"].ToString() ?? "Unknown";
				SqlCommand cmd = new SqlCommand("SELECT TOP 1 Id, MSSV, Status FROM PhieuDanhGia WHERE Id=@id", con);
				cmd.Parameters.AddWithValue("@id", id);
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				if (!(await rd.ReadAsync()))
				{
					return Results.NotFound(new
					{
						message = "Phieu khong tim thay"
					});
				}
				string mssv = rd["MSSV"]?.ToString();
				string curStatus = rd["Status"]?.ToString();
				await rd.CloseAsync();
				if (!string.Equals(curStatus, "ForwardedToFaculty", StringComparison.OrdinalIgnoreCase))
				{
					return Results.BadRequest(new
					{
						message = "Phieu dang o trang thai '" + curStatus + "', khoa khong the duyet"
					});
				}
				SqlCommand upd = new SqlCommand("\r\n            UPDATE PhieuDanhGia \r\n            SET \r\n                Status = 'ForwardedToSchool',\r\n                ApprovedByFacultyAt = GETDATE(),\r\n                ApprovedByFacultyBy = @facultyId,\r\n                FacultyNotes = @notes,\r\n                UpdatedAt = GETDATE()\r\n            WHERE Id = @id", con);
				upd.Parameters.AddWithValue("@facultyId", currentUser);
				upd.Parameters.AddWithValue("@notes", ((object)ctx.Request.Query["notes"].ToString()) ?? ((object)DBNull.Value));
				upd.Parameters.AddWithValue("@id", id);
				await upd.ExecuteNonQueryAsync();
				try
				{
					SqlCommand ins = new SqlCommand("\r\n                INSERT INTO ForwardedLog(PhieuId, FromRole, ToRole, Status, ForwardedAt, ForwardedBy, Notes)\r\n                VALUES(@phieu, 'Faculty', 'School', 'ForwardedToSchool', GETDATE(), @by, @notes)", con);
					ins.Parameters.AddWithValue("@phieu", id);
					ins.Parameters.AddWithValue("@by", currentUser);
					ins.Parameters.AddWithValue("@notes", ((object)ctx.Request.Query["notes"].ToString()) ?? ((object)DBNull.Value));
					await ins.ExecuteNonQueryAsync();
				}
				catch
				{
				}
				try
				{
					SqlCommand noti = new SqlCommand("\r\n                INSERT INTO Notifications(Recipient, Title, Message, Link, StudentId)\r\n                VALUES('ALL_TRUONG', N'Phiếu ĐGRL từ Khoa cần duyệt', @msg, '/truong.html#approval', @sId)", con);
					noti.Parameters.AddWithValue("@msg", "Khoa đã xét duyệt phiếu ĐGRL của SV " + mssv + ". Vui lòng duyệt và cộng điểm cuối.");
					noti.Parameters.AddWithValue("@sId", ((object)mssv) ?? ((object)DBNull.Value));
					await noti.ExecuteNonQueryAsync();
				}
				catch
				{
				}
				await LogAsync(ctx, con, $"[FACULTY_APPROVE] PhieuId={id} MSSV={mssv} By={currentUser}");
				return Results.Ok(new
				{
					status = "ForwardedToSchool",
					message = "Phieu da xet duyet, gui cho Truong duyet cuoi"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[FACULTY_APPROVE_ERROR] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/faculty/bulk-approve-forward", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			try
			{
				using StreamReader reader = new StreamReader(req.Body);
				JsonDocument doc = JsonDocument.Parse(await reader.ReadToEndAsync());
				JsonElement root = doc.RootElement;
				string currentUser = req.Headers["X-User"].ToString() ?? "Unknown";
				JsonElement idsEl;
				List<int> ids = ((root.TryGetProperty("Ids", out idsEl) && idsEl.ValueKind == JsonValueKind.Array) ? (from x in idsEl.EnumerateArray()
					select x.GetInt32()).ToList() : new List<int>());
				if (!ids.Any())
				{
					return Results.BadRequest(new
					{
						error = "Khong co phieu nao duoc chon"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int count = 0;
				string userMaKH = null;
				using (SqlCommand gvCmd = new SqlCommand("SELECT TOP 1 MaKH FROM GiangVien WHERE MaCaNhan=@uid", con))
				{
					gvCmd.Parameters.AddWithValue("@uid", currentUser);
					userMaKH = (await gvCmd.ExecuteScalarAsync())?.ToString();
				}
				foreach (int id in ids)
				{
					using SqlCommand upd = new SqlCommand("\r\n                UPDATE p\r\n                SET p.Status='ForwardedToSchool', p.ForwardedToSchoolAt=GETDATE(), p.ForwardedToSchoolBy=@by, p.UpdatedAt=GETDATE()\r\n                OUTPUT INSERTED.MSSV\r\n                FROM PhieuDanhGia p\r\n                LEFT JOIN SINHVIEN s ON s.MSSV = p.MSSV\r\n                WHERE p.Id=@id AND p.Status='ForwardedToFaculty'\r\n                  AND (@maKH IS NULL OR s.MaKH = @maKH)", con);
					upd.Parameters.AddWithValue("@by", currentUser);
					upd.Parameters.AddWithValue("@id", id);
					upd.Parameters.AddWithValue("@maKH", ((object)userMaKH) ?? ((object)DBNull.Value));
					object mssvObj = await upd.ExecuteScalarAsync();
					if (mssvObj != null)
					{
						count++;
						string mssvStr = mssvObj.ToString();
						using SqlCommand notif = new SqlCommand("INSERT INTO Notifications (Recipient, Title, Message, Link, StudentId) VALUES ('ALL_TRUONG', N'Phiếu ĐGRL từ Khoa cần duyệt', N'Khoa đã xét duyệt phiếu ĐGRL của SV ' + @uid + '. Vui lòng duyệt cấp trường.', '/truong.html#approval', @uid)", con);
						notif.Parameters.AddWithValue("@uid", mssvStr);
						await notif.ExecuteNonQueryAsync();
					}
				}
				return Results.Ok(new
				{
					count = count,
					total = ids.Count
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[FACULTY_BULK_APPROVE_ERROR] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/faculty/bulk-needs-fix", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			try
			{
				using StreamReader reader = new StreamReader(req.Body);
				JsonDocument doc = JsonDocument.Parse(await reader.ReadToEndAsync());
				JsonElement root = doc.RootElement;
				string currentUser = req.Headers["X-User"].ToString() ?? "Unknown";
				JsonElement rEl;
				string reason = (root.TryGetProperty("reason", out rEl) ? (rEl.GetString() ?? "") : "");
				JsonElement idsEl;
				List<int> ids = ((root.TryGetProperty("Ids", out idsEl) && idsEl.ValueKind == JsonValueKind.Array) ? (from x in idsEl.EnumerateArray()
					select x.GetInt32()).ToList() : new List<int>());
				if (!ids.Any())
				{
					return Results.BadRequest(new
					{
						error = "Khong co phieu nao duoc chon"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int count = 0;
				string userMaKHNF = null;
				using (SqlCommand gvCmd = new SqlCommand("SELECT TOP 1 MaKH FROM GiangVien WHERE MaCaNhan=@uid", con))
				{
					gvCmd.Parameters.AddWithValue("@uid", currentUser);
					userMaKHNF = (await gvCmd.ExecuteScalarAsync())?.ToString();
				}
				foreach (int id in ids)
				{
					using SqlCommand upd = new SqlCommand("\r\n                UPDATE p\r\n                SET p.Status='NeedsFixByFaculty', p.LastStatusReason=@reason, p.UpdatedAt=GETDATE()\r\n                OUTPUT INSERTED.MSSV\r\n                FROM PhieuDanhGia p\r\n                LEFT JOIN SINHVIEN s ON s.MSSV = p.MSSV\r\n                WHERE p.Id=@id AND p.Status='ForwardedToFaculty'\r\n                  AND (@maKH IS NULL OR s.MaKH = @maKH)", con);
					upd.Parameters.AddWithValue("@reason", ((object)reason) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@id", id);
					upd.Parameters.AddWithValue("@maKH", ((object)userMaKHNF) ?? ((object)DBNull.Value));
					object mssvObj = await upd.ExecuteScalarAsync();
					if (mssvObj != null)
					{
						count++;
						string mssvStr = mssvObj.ToString();
						string msg = string.IsNullOrEmpty(reason) ? "Phiếu ĐGRL của bạn cần sửa chữa theo yêu cầu của Khoa." : "Khoa yêu cầu sửa phiếu ĐGRL của bạn. Lý do: " + reason;
						using SqlCommand notif = new SqlCommand("INSERT INTO Notifications (Recipient, Title, Message, Link, StudentId) VALUES (@uid, N'Khoa yêu cầu sửa phiếu ĐGRL', @msg, '/index.html#eval', @uid)", con);
						notif.Parameters.AddWithValue("@uid", mssvStr);
						notif.Parameters.AddWithValue("@msg", msg);
						await notif.ExecuteNonQueryAsync();
					}
				}
				return Results.Ok(new
				{
					count = count,
					total = ids.Count
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[FACULTY_BULK_NEEDSFIX_ERROR] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/faculty/bulk-reject", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			try
			{
				using StreamReader reader = new StreamReader(req.Body);
				JsonDocument doc = JsonDocument.Parse(await reader.ReadToEndAsync());
				JsonElement root = doc.RootElement;
				string currentUser = req.Headers["X-User"].ToString() ?? "Unknown";
				JsonElement rEl;
				string reason = (root.TryGetProperty("reason", out rEl) ? (rEl.GetString() ?? "") : "");
				JsonElement idsEl;
				List<int> ids = ((root.TryGetProperty("Ids", out idsEl) && idsEl.ValueKind == JsonValueKind.Array) ? (from x in idsEl.EnumerateArray()
					select x.GetInt32()).ToList() : new List<int>());
				if (!ids.Any())
				{
					return Results.BadRequest(new
					{
						error = "Khong co phieu nao duoc chon"
					});
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				int count = 0;
				string userMaKHR = null;
				using (SqlCommand gvCmd = new SqlCommand("SELECT TOP 1 MaKH FROM GiangVien WHERE MaCaNhan=@uid", con))
				{
					gvCmd.Parameters.AddWithValue("@uid", currentUser);
					userMaKHR = (await gvCmd.ExecuteScalarAsync())?.ToString();
				}
				foreach (int id in ids)
				{
					using SqlCommand upd = new SqlCommand("\r\n                UPDATE p\r\n                SET p.Status='RejectedByFaculty', p.RejectedByFacultyAt=GETDATE(), p.RejectedByFacultyBy=@by, p.LastStatusReason=@reason, p.UpdatedAt=GETDATE()\r\n                OUTPUT INSERTED.MSSV\r\n                FROM PhieuDanhGia p\r\n                LEFT JOIN SINHVIEN s ON s.MSSV = p.MSSV\r\n                WHERE p.Id=@id AND p.Status='ForwardedToFaculty'\r\n                  AND (@maKH IS NULL OR s.MaKH = @maKH)", con);
					upd.Parameters.AddWithValue("@by", currentUser);
					upd.Parameters.AddWithValue("@reason", ((object)reason) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@id", id);
					upd.Parameters.AddWithValue("@maKH", ((object)userMaKHR) ?? ((object)DBNull.Value));
					object mssvObj = await upd.ExecuteScalarAsync();
					if (mssvObj != null)
					{
						count++;
						string mssvStr = mssvObj.ToString();
						string msg = string.IsNullOrEmpty(reason) ? "Phiếu ĐGRL của bạn đã bị Khoa từ chối." : "Phiếu ĐGRL của bạn đã bị Khoa từ chối. Lý do: " + reason;
						using SqlCommand notif = new SqlCommand("INSERT INTO Notifications (Recipient, Title, Message, Link, StudentId) VALUES (@uid, N'Khoa từ chối phiếu ĐGRL', @msg, '/index.html#eval', @uid)", con);
						notif.Parameters.AddWithValue("@uid", mssvStr);
						notif.Parameters.AddWithValue("@msg", msg);
						await notif.ExecuteNonQueryAsync();
					}
				}
				return Results.Ok(new
				{
					count = count,
					total = ids.Count
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[FACULTY_BULK_REJECT_ERROR] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapPost("/api/phieu-danh-gia/{id:int}/approve-school", (Func<int, HttpContext, Task<IResult>>)async delegate(int id, HttpContext ctx)
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				string currentUser = ctx.User?.FindFirst("sub")?.Value ?? ctx.Request.Headers["X-User"].ToString() ?? "Unknown";
				if (!int.TryParse(ctx.Request.Query["diem"].ToString(), out var diemTruong) || diemTruong < 0 || diemTruong > 100)
				{
					return Results.BadRequest(new
					{
						message = "Diem phai tu 0-100"
					});
				}
				SqlCommand cmd = new SqlCommand("\r\n            SELECT TOP 1 Id, MSSV, NamHoc, HocKi, Status\r\n            FROM PhieuDanhGia WHERE Id=@id", con);
				cmd.Parameters.AddWithValue("@id", id);
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				if (!(await rd.ReadAsync()))
				{
					return Results.NotFound(new
					{
						message = "Phieu khong tim thay"
					});
				}
				string mssv = rd["MSSV"]?.ToString();
				string namHoc = rd["NamHoc"]?.ToString();
				object hocKi = rd["HocKi"];
				string curSt = rd["Status"]?.ToString();
				await rd.CloseAsync();
				if (!string.Equals(curSt, "ForwardedToSchool", StringComparison.OrdinalIgnoreCase))
				{
					return Results.BadRequest(new
					{
						message = "Phieu dang o trang thai '" + curSt + "', truong khong the duyet"
					});
				}
				SqlCommand upd = new SqlCommand("\r\n            UPDATE PhieuDanhGia \r\n            SET \r\n                Status = 'ApprovedBySchool',\r\n                TongDiem = @diem,\r\n                ApprovedBySchoolAt = GETDATE(),\r\n                ApprovedBySchoolBy = @schoolId,\r\n                LastStatusReason = @notes,\r\n                UpdatedAt = GETDATE()\r\n            WHERE Id = @id", con);
				upd.Parameters.AddWithValue("@diem", diemTruong);
				upd.Parameters.AddWithValue("@schoolId", currentUser);
				upd.Parameters.AddWithValue("@notes", ((object)ctx.Request.Query["notes"].ToString()) ?? ((object)DBNull.Value));
				upd.Parameters.AddWithValue("@id", id);
				await upd.ExecuteNonQueryAsync();
				SqlCommand upsertLuu = new SqlCommand("\r\n            IF EXISTS (SELECT 1 FROM LUUTRUDIEMSV WHERE MSSV=@mssv AND NamHoc=@nh AND HocKi=@hk)\r\n            BEGIN\r\n                UPDATE LUUTRUDIEMSV \r\n                SET TongDRL = @diem\r\n                WHERE MSSV=@mssv AND NamHoc=@nh AND HocKi=@hk\r\n            END\r\n            ELSE\r\n            BEGIN\r\n                INSERT INTO LUUTRUDIEMSV(MSSV, NamHoc, HocKi, TongDRL)\r\n                VALUES(@mssv, @nh, @hk, @diem)\r\n            END", con);
				int namHocInt = 0;
				if (!string.IsNullOrEmpty(namHoc))
				{
					string[] parts = namHoc.Split('-');
					int singleYear;
					if (parts.Length == 2 && int.TryParse(parts[1], out var parsedYear))
					{
						namHocInt = parsedYear;
					}
					else if (int.TryParse(namHoc, out singleYear))
					{
						namHocInt = singleYear;
					}
				}
				upsertLuu.Parameters.AddWithValue("@mssv", mssv);
				upsertLuu.Parameters.AddWithValue("@nh", namHocInt);
				upsertLuu.Parameters.AddWithValue("@hk", hocKi ?? ((object)0));
				upsertLuu.Parameters.AddWithValue("@diem", diemTruong);
				await upsertLuu.ExecuteNonQueryAsync();
				Console.WriteLine($"[SCHOOL_APPROVE] Diem ren luyen da cong: MSSV={mssv}, TongDRL={diemTruong}, NamHoc={namHoc}, HocKi={hocKi}");
				try
				{
					SqlCommand ins = new SqlCommand("\r\n                INSERT INTO ForwardedLog(PhieuId, FromRole, ToRole, Status, ForwardedAt, ForwardedBy, Notes)\r\n                VALUES(@phieu, 'School', 'Student', 'ApprovedBySchool', GETDATE(), @by, @notes)", con);
					ins.Parameters.AddWithValue("@phieu", id);
					ins.Parameters.AddWithValue("@by", currentUser);
					ins.Parameters.AddWithValue("@notes", ((object)ctx.Request.Query["notes"].ToString()) ?? ((object)DBNull.Value));
					await ins.ExecuteNonQueryAsync();
				}
				catch
				{
				}
				try
				{
					SqlCommand noti = new SqlCommand("\r\n                INSERT INTO Notifications(UserId, Title, Message, Type, RelatedPhieuId, IsRead, CreatedAt)\r\n                VALUES(@uid, @title, @msg, 'SchoolApproval', @phId, 0, GETDATE())", con);
					noti.Parameters.AddWithValue("@uid", ((object)mssv) ?? ((object)DBNull.Value));
					noti.Parameters.AddWithValue("@title", $"Hoan thanh danh gia ren luyen - Diem: {diemTruong}");
					noti.Parameters.AddWithValue("@msg", $"Phieu danh gia ren luyen cua ban da hoan thanh! Diem ren luyen: {diemTruong}/100");
					noti.Parameters.AddWithValue("@phId", id);
					await noti.ExecuteNonQueryAsync();
				}
				catch
				{
				}
				await LogAsync(ctx, con, $"[SCHOOL_APPROVE_FINAL] PhieuId={id} MSSV={mssv} DiemTruong={diemTruong} IsFinal=1 By={currentUser}");
				return Results.Ok(new
				{
					status = "ApprovedBySchool",
					diemTruong = diemTruong,
					isFinal = true,
					message = $"Hoan thanh! Diem ren luyen {diemTruong}/100 da duoc cong cho SV {mssv}"
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[SCHOOL_APPROVE_ERROR] " + ex4.Message);
				return Results.BadRequest(new
				{
					error = ex4.Message
				});
			}
		});
		app.MapGet("/api/system-info", (Func<Task<IResult>>)async delegate
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				(int Year, int Semester) tuple = await GetSystemYearSemesterAsync(con);
				int year = tuple.Year;
				int semester = tuple.Semester;
				string namHoc = $"{year - 1}-{year}";
				return Results.Ok(new
				{
					NamHoc = namHoc,
					HocKi = semester
				});
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[SYSTEM_INFO_ERROR] " + ex4.Message);
				return Results.Ok(new
				{
					NamHoc = (string)null,
					HocKi = (int?)null
				});
			}
		});
		app.MapGet("/api/health/ai", (Func<IConfiguration, Task<IResult>>)async delegate(IConfiguration config)
		{
			string baseUrl = config["AI:BaseUrl"] ?? config["AIService:BaseUrl"] ?? "http://127.0.0.1:7001";
			try
			{
				using HttpClient http = new HttpClient
				{
					Timeout = TimeSpan.FromSeconds(3L)
				};
				HttpResponseMessage resp = await http.GetAsync(baseUrl.TrimEnd('/') + "/health");
				return Results.Ok(new
				{
					ok = resp.IsSuccessStatusCode,
					status = (int)resp.StatusCode
				});
			}
			catch
			{
				return Results.Ok(new
				{
					ok = false,
					status = 0
				});
			}
		});
		app.MapPost("/api/audit/log", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			try
			{
				using StreamReader reader = new StreamReader(req.Body);
				Console.WriteLine("[AUDIT_LOG] " + await reader.ReadToEndAsync());
				return Results.Ok(new
				{
					ok = true
				});
			}
			catch
			{
				return Results.Ok(new
				{
					ok = false
				});
			}
		});
		app.MapGet("/api/qr/activity-info", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			string qrDataRaw = req.Query["qrData"].ToString();
			if (string.IsNullOrWhiteSpace(qrDataRaw))
			{
				return Results.BadRequest(new
				{
					error = "qrData is required"
				});
			}
			string maHD = qrDataRaw;
			try
			{
				JsonElement parsed = JsonSerializer.Deserialize<JsonElement>(qrDataRaw);
				JsonElement maHDEl2;
				if (parsed.TryGetProperty("maHD", out var maHDEl))
				{
					maHD = maHDEl.GetString() ?? qrDataRaw;
				}
				else if (parsed.TryGetProperty("MaHD", out maHDEl2))
				{
					maHD = maHDEl2.GetString() ?? qrDataRaw;
				}
			}
			catch
			{
			}
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand cmd = new SqlCommand("SELECT TOP 1 MaHD, TenHD, DiemRL, NDHD, NgayBD, NgayKT, DiaDiem FROM HoatDongTruong WHERE MaHD = @maHD", con);
				cmd.Parameters.AddWithValue("@maHD", maHD);
				using SqlDataReader dr = await cmd.ExecuteReaderAsync();
				if (!(await dr.ReadAsync()))
				{
					return Results.NotFound(new
					{
						error = "Không tìm thấy hoạt động: " + maHD
					});
				}
				return Results.Ok(new
				{
					MaHD = dr["MaHD"]?.ToString(),
					TenHD = dr["TenHD"]?.ToString(),
					DiemRL = ((dr["DiemRL"] != DBNull.Value) ? Convert.ToInt32(dr["DiemRL"]) : 0),
					SoDiemToiDa = ((dr["DiemRL"] != DBNull.Value) ? Convert.ToInt32(dr["DiemRL"]) : 0),
					NDHD = dr["NDHD"]?.ToString(),
					NgayBD = ((dr["NgayBD"] == DBNull.Value) ? ((DateTime?)null) : new DateTime?(Convert.ToDateTime(dr["NgayBD"]))),
					NgayKT = ((dr["NgayKT"] == DBNull.Value) ? ((DateTime?)null) : new DateTime?(Convert.ToDateTime(dr["NgayKT"]))),
					DiaDiem = dr["DiaDiem"]?.ToString()
				});
			}
			catch (Exception ex3)
			{
				Console.WriteLine("[QR_ACTIVITY_INFO_ERROR] " + ex3.Message);
				return Results.Problem(ex3.Message);
			}
		});
		app.MapPost("/api/activities/register", (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			RegisterActivityDto dto = null;
			try
			{
				dto = await req.ReadFromJsonAsync<RegisterActivityDto>();
			}
			catch
			{
			}
			if (dto == null || string.IsNullOrWhiteSpace(dto.MaHD) || string.IsNullOrWhiteSpace(dto.MSSV))
			{
				return Results.BadRequest(new
				{
					error = "MaHD và MSSV là bắt buộc"
				});
			}
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand checkFace = new SqlCommand("SELECT 1 FROM StudentFaceData WHERE MSSV=@mssv", con))
				{
					checkFace.Parameters.AddWithValue("@mssv", dto.MSSV);
					if (await checkFace.ExecuteScalarAsync() == null)
					{
						return Results.Json(new { error = "EKYC_REQUIRED", message = "Bạn chưa hoàn tất xác thực khuôn mặt (eKYC). Vui lòng xác thực trước khi thực hiện chức năng này." }, statusCode: 403);
					}
				}
				using SqlCommand checkAct = new SqlCommand("SELECT TOP 1 TenHD, DiemRL FROM HoatDongTruong WHERE MaHD=@maHD", con);
				checkAct.Parameters.AddWithValue("@maHD", dto.MaHD);
				using SqlDataReader drAct = await checkAct.ExecuteReaderAsync();
				if (!(await drAct.ReadAsync()))
				{
					return Results.NotFound(new
					{
						error = "Không tìm thấy hoạt động: " + dto.MaHD
					});
				}
				string tenHD = drAct["TenHD"]?.ToString();
				int diemRL = ((drAct["DiemRL"] != DBNull.Value) ? Convert.ToInt32(drAct["DiemRL"]) : 0);
				drAct.Close();
				try
				{
					using SqlCommand checkReg = new SqlCommand("SELECT TOP 1 Id FROM ActivityRegistrations WHERE MaHD=@maHD AND MSSV=@mssv", con);
					checkReg.Parameters.AddWithValue("@maHD", dto.MaHD);
					checkReg.Parameters.AddWithValue("@mssv", dto.MSSV);
					if (await checkReg.ExecuteScalarAsync() != null)
					{
						return Results.Ok(new
						{
							success = true,
							message = "Đã đăng ký trước đó",
							alreadyRegistered = true,
							TenHD = tenHD,
							DiemRL = diemRL
						});
					}
					using SqlCommand ins = new SqlCommand("INSERT INTO ActivityRegistrations (MaHD, MSSV, RegisteredAt) VALUES (@maHD, @mssv, GETDATE())", con);
					ins.Parameters.AddWithValue("@maHD", dto.MaHD);
					ins.Parameters.AddWithValue("@mssv", dto.MSSV);
					await ins.ExecuteNonQueryAsync();
				}
				catch (SqlException ex3) when (ex3.Message.Contains("Invalid object name"))
				{
					using SqlCommand createTbl = new SqlCommand("\r\n                CREATE TABLE ActivityRegistrations (\r\n                    Id INT IDENTITY(1,1) PRIMARY KEY,\r\n                    MaHD NVARCHAR(50) NOT NULL,\r\n                    MSSV NVARCHAR(20) NOT NULL,\r\n                    RegisteredAt DATETIME DEFAULT GETDATE(),\r\n                    CONSTRAINT UQ_ActivityReg UNIQUE (MaHD, MSSV)\r\n                )", con);
					await createTbl.ExecuteNonQueryAsync();
					using SqlCommand ins2 = new SqlCommand("INSERT INTO ActivityRegistrations (MaHD, MSSV, RegisteredAt) VALUES (@maHD, @mssv, GETDATE())", con);
					ins2.Parameters.AddWithValue("@maHD", dto.MaHD);
					ins2.Parameters.AddWithValue("@mssv", dto.MSSV);
					await ins2.ExecuteNonQueryAsync();
				}
				Console.WriteLine($"[ACTIVITY_REGISTER] MSSV={dto.MSSV} MaHD={dto.MaHD} TenHD={tenHD}");
				return Results.Ok(new
				{
					success = true,
					message = "Đăng ký thành công",
					TenHD = tenHD,
					DiemRL = diemRL
				});
			}
			catch (Exception ex4)
			{
				Console.WriteLine("[ACTIVITY_REGISTER_ERROR] " + ex4.Message);
				return Results.Problem(ex4.Message);
			}
		});
		app.MapPost("/api/student/face-data", (Func<HttpRequest, ILogger<Program>, Task<IResult>>)async delegate(HttpRequest req, ILogger<Program> log)
		{
			if (!req.HasFormContentType)
			{
				return Results.BadRequest(new
				{
					error = "Yêu cầu multipart/form-data"
				});
			}
			try
			{
				IFormCollection form = await req.ReadFormAsync();
				string mssv = form["mssv"].ToString();
				if (string.IsNullOrWhiteSpace(mssv))
				{
					mssv = req.Headers["X-User"].ToString();
				}
				if (string.IsNullOrWhiteSpace(mssv))
				{
					return Results.BadRequest(new
					{
						error = "MSSV là bắt buộc"
					});
				}
				IFormFile faceFile = form.Files.GetFile("faceImage");
				if (faceFile == null || faceFile.Length == 0)
				{
					return Results.BadRequest(new
					{
						error = "faceImage là bắt buộc"
					});
				}
				using MemoryStream ms = new MemoryStream();
				await faceFile.CopyToAsync(ms);
				byte[] imageBytes = ms.ToArray();
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				try
				{
					using SqlCommand upsert = new SqlCommand("\r\n                IF EXISTS (SELECT 1 FROM StudentFaceData WHERE MSSV=@mssv)\r\n                    UPDATE StudentFaceData SET FaceImage=@img, UpdatedAt=GETDATE() WHERE MSSV=@mssv\r\n                ELSE\r\n                    INSERT INTO StudentFaceData (MSSV, FaceImage, FaceEncoding, CreatedAt)\r\n                    VALUES (@mssv, @img, @enc, GETDATE())", con);
					upsert.Parameters.AddWithValue("@mssv", mssv);
					upsert.Parameters.AddWithValue("@img", imageBytes);
					upsert.Parameters.AddWithValue("@enc", Array.Empty<byte>());
					await upsert.ExecuteNonQueryAsync();
				}
				catch (SqlException ex3) when (ex3.Message.Contains("Invalid column name") || ex3.Message.Contains("Invalid object name"))
				{
					using SqlCommand fallback = new SqlCommand("\r\n                IF EXISTS (SELECT 1 FROM StudentFaceData WHERE MSSV=@mssv)\r\n                    UPDATE StudentFaceData SET FaceImage=@img WHERE MSSV=@mssv\r\n                ELSE\r\n                    INSERT INTO StudentFaceData (MSSV, FaceImage) VALUES (@mssv, @img)", con);
					fallback.Parameters.AddWithValue("@mssv", mssv);
					fallback.Parameters.AddWithValue("@img", imageBytes);
					await fallback.ExecuteNonQueryAsync();
				}
				try
				{
					using SqlCommand updSV = new SqlCommand("UPDATE SINHVIEN SET AnhDD=@img WHERE MSSV=@mssv", con);
					updSV.Parameters.AddWithValue("@img", imageBytes);
					updSV.Parameters.AddWithValue("@mssv", mssv);
					await updSV.ExecuteNonQueryAsync();
				}
				catch
				{
				}
				log.LogInformation("[FACE_DATA_UPLOAD] MSSV={Mssv} Size={Size}bytes", mssv, imageBytes.Length);
				return Results.Ok(new
				{
					message = "Lưu ảnh khuôn mặt thành công"
				});
			}
			catch (Exception ex4)
			{
				Console.WriteLine("[FACE_DATA_ERROR] " + ex4.Message);
				return Results.Problem(ex4.Message);
			}
		});
		app.MapMethods("/api/school-notifications", new string[2] { "GET", "HEAD" }, (Func<HttpRequest, Task<IResult>>)async delegate(HttpRequest req)
		{
			if (req.Method == "HEAD")
			{
				return Results.Ok();
			}
			string topStr = req.Query["top"].ToString();
			int t;
			int top = (int.TryParse(topStr, out t) ? t : 10);
			if (top <= 0 || top > 100)
			{
				top = 10;
			}
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand cmd = new SqlCommand("\r\n            SELECT TOP (@top) \r\n                Id,\r\n                COALESCE(Title, N'Thông báo') AS TieuDe,\r\n                COALESCE(Message, N'') AS NoiDung,\r\n                CASE WHEN IsRead = 1 THEN 1 ELSE 0 END AS IsRead,\r\n                COALESCE(CreatedAt, GETDATE()) AS CreatedAt,\r\n                Link\r\n            FROM dbo.Notifications\r\n            WHERE Recipient = N'truong'\r\n               OR RecipientRole = N'truong'\r\n            ORDER BY CreatedAt DESC", con);
				cmd.Parameters.AddWithValue("@top", top);
				List<object> results = new List<object>();
				using SqlDataReader dr = await cmd.ExecuteReaderAsync();
				while (await dr.ReadAsync())
				{
					results.Add(new
					{
						Id = Convert.ToInt32(dr["Id"]),
						id = Convert.ToInt32(dr["Id"]),
						TieuDe = dr["TieuDe"]?.ToString(),
						NoiDung = dr["NoiDung"]?.ToString(),
						IsRead = Convert.ToBoolean(dr["IsRead"]),
						CreatedAt = Convert.ToDateTime(dr["CreatedAt"]),
						Link = dr["Link"]?.ToString()
					});
				}
				return Results.Ok(results);
			}
			catch (Exception ex3)
			{
				Console.WriteLine("[SCHOOL_NOTIFICATIONS_ERROR] " + ex3.Message);
				return Results.Ok(new List<object>());
			}
		});
		app.MapPost("/api/activities/{maHD}/attendance/register", (Func<string, HttpRequest, AiClient, ILogger<Program>, Task<IResult>>)async delegate(string maHD, HttpRequest req, AiClient aiClient, ILogger<Program> log)
		{
			if (!req.HasFormContentType)
			{
				return Results.BadRequest(new
				{
					error = "FormData required"
				});
			}
			try
			{
				IFormCollection form = await req.ReadFormAsync();
				IFormFile videoFile = form.Files.GetFile("file") ?? form.Files.GetFile("video");
				if (videoFile == null || videoFile.Length == 0)
				{
					return Results.BadRequest(new
					{
						error = "Thiếu file video (field 'file' or 'video')"
					});
				}
				string studentId = form["student_id"].ToString();
				if (string.IsNullOrWhiteSpace(studentId))
				{
					studentId = form["studentId"].ToString();
				}
				if (string.IsNullOrWhiteSpace(studentId))
				{
					studentId = req.Headers["X-User"].ToString();
				}
				if (string.IsNullOrWhiteSpace(studentId))
				{
					return Results.BadRequest(new
					{
						error = "Thiếu studentId"
					});
				}
				studentId = studentId.Trim();
				string latStr = form["lat"].ToString();
				string lngStr = form["lng"].ToString();
				string faceB64 = form["student_face_image_b64"].ToString();
				string gpsSamplesStr = form["gps_samples_count"].ToString();
				string gpsAccuracyStr = form["gps_accuracy_m"].ToString();
				log.LogInformation("[ATTEND-FORMDATA-CHECK] Face field status: exists={Exists}, empty={Empty}, length={Length}", form.ContainsKey("student_face_image_b64"), string.IsNullOrWhiteSpace(faceB64), faceB64?.Length ?? 0);
				log.LogInformation("[ATTEND-GPS-DEBUG] Frontend sent: lat={Lat}, lng={Lng}, (lat empty: {LatEmpty}, lng empty: {LngEmpty})", latStr, lngStr, string.IsNullOrWhiteSpace(latStr), string.IsNullOrWhiteSpace(lngStr));
				if (!string.IsNullOrWhiteSpace(gpsSamplesStr) || !string.IsNullOrWhiteSpace(gpsAccuracyStr))
				{
					log.LogInformation("[GPS-SMOOTHING] Frontend GPS smoothing: samples={GpsSamples}, accuracy={GpsAccuracy}m", gpsSamplesStr ?? "?", gpsAccuracyStr ?? "?");
				}
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<Dictionary<string, object?>> actRows = await QueryAsync(con, "SELECT TOP 1 TenHD, DiemRL FROM HoatDongTruong WHERE MaHD=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maHD.Trim())
				});
				if (actRows.Count == 0)
				{
					return Results.NotFound(new
					{
						error = "Không tìm thấy hoạt động: " + maHD
					});
				}
				string tenHD = actRows[0]["TenHD"]?.ToString() ?? maHD;
				if (string.IsNullOrWhiteSpace(faceB64))
				{
					log.LogInformation("[ATTEND-FACE-FETCH] Frontend did not send face image, fetching from DB for student: {StudentId} (length={StudentIdLen})", studentId, studentId?.Length ?? 0);
					try
					{
						using SqlCommand cmd = new SqlCommand("SELECT AnhDD FROM SINHVIEN WHERE MSSV=@mssv", con);
						cmd.Parameters.AddWithValue("@mssv", studentId ?? "");
						object r = await cmd.ExecuteScalarAsync();
						log.LogInformation("[ATTEND-FACE-DB1] Query SINHVIEN.AnhDD for {StudentId}: result_type={ResultType}, is_null={IsNull}, is_dbnull={IsDbNull}", studentId, r?.GetType().Name ?? "null", r == null, r == DBNull.Value);
						if (r != null && r != DBNull.Value)
						{
							byte[] bytes = (byte[])r;
							log.LogInformation("[ATTEND-FACE-DB1-SUCCESS] Got {ByteCount} bytes from SINHVIEN.AnhDD", bytes.Length);
							faceB64 = Convert.ToBase64String(bytes);
						}
						else
						{
							log.LogInformation("[ATTEND-FACE-DB1-EMPTY] SINHVIEN.AnhDD is empty, trying StudentFaceData table");
							using SqlCommand cmd2 = new SqlCommand("SELECT TOP 1 FaceImage FROM StudentFaceData WHERE MSSV=@mssv ORDER BY CreatedAt DESC", con);
							cmd2.Parameters.AddWithValue("@mssv", studentId);
							object r2 = await cmd2.ExecuteScalarAsync();
							log.LogInformation("[ATTEND-FACE-DB2] Query StudentFaceData for {StudentId}: result_type={ResultType}, is_null={IsNull}, is_dbnull={IsDbNull}", studentId, r2?.GetType().Name ?? "null", r2 == null, r2 == DBNull.Value);
							if (r2 != null && r2 != DBNull.Value)
							{
								byte[] bytes2 = (byte[])r2;
								log.LogInformation("[ATTEND-FACE-DB2-SUCCESS] Got {ByteCount} bytes from StudentFaceData", bytes2.Length);
								faceB64 = Convert.ToBase64String(bytes2);
							}
							else
							{
								log.LogWarning("[ATTEND-FACE-DB-FAIL] No face image found in either SINHVIEN.AnhDD or StudentFaceData for {StudentId}", studentId);
							}
						}
					}
					catch (Exception ex3)
					{
						log.LogError("[ATTEND-FACE-ERROR] Exception while fetching face: {ExceptionType}: {Message}\n{StackTrace}", ex3.GetType().Name, ex3.Message, ex3.StackTrace);
					}
				}
				else
				{
					log.LogInformation("[ATTEND-FACE-FRONTEND] Frontend sent face image, length={Length}", faceB64?.Length ?? 0);
				}
				if (!string.IsNullOrWhiteSpace(faceB64) && faceB64.Contains(','))
				{
					int idx = faceB64.IndexOf(',');
					faceB64 = faceB64.Substring(idx + 1);
					log.LogInformation("[ATTEND-FACE-CLEAN] Removed data URL prefix from face image");
				}
				object[] obj3 = new object[3]
				{
					!string.IsNullOrWhiteSpace(faceB64),
					faceB64?.Length ?? 0,
					null
				};
				string text = faceB64;
				obj3[2] = ((text != null && text.Length > 50) ? (faceB64.Substring(0, 50) + "...") : (faceB64 ?? "NULL"));
				log.LogInformation("[ATTEND-FACE-FINAL] Face image status: has_face={HasFace}, length={Length}, first_50chars={Preview}", obj3);
				Directory.CreateDirectory(uploadRoot);
				Guid evidenceId = Guid.NewGuid();
				string origExt = Path.GetExtension(videoFile.FileName).ToLowerInvariant();
				string filePath = Path.Combine(uploadRoot, evidenceId.ToString() + (string.IsNullOrEmpty(origExt) ? ".webm" : origExt));
				await using (FileStream fs = File.Create(filePath))
				{
					await videoFile.CopyToAsync(fs);
				}
				string finalPath = filePath;
				try
				{
					if (origExt == ".webm" || origExt != ".mp4")
					{
						string mp4Path = Path.Combine(uploadRoot, evidenceId.ToString() + ".mp4");
						ProcessStartInfo psi2 = new ProcessStartInfo("ffmpeg", $"-y -i \"{filePath}\" -c:v libx264 -c:a aac \"{mp4Path}\"")
						{
							RedirectStandardOutput = true,
							RedirectStandardError = true,
							UseShellExecute = false,
							CreateNoWindow = true
						};
						using Process p = Process.Start(psi2);
						p.StandardError.ReadToEnd();
						p.WaitForExit(20000);
						if (p.ExitCode == 0)
						{
							finalPath = mp4Path;
						}
					}
				}
				catch
				{
				}
				using SqlCommand ins = new SqlCommand("INSERT INTO Evidence(EvidenceId, StudentId, ActivityName, FilePath, Status, Verdict, CreatedAt)\r\n            VALUES(@id,@stu,@act,@fp,'PendingAnalyze','ManualReview',GETDATE())", con);
				ins.Parameters.AddWithValue("@id", evidenceId);
				ins.Parameters.AddWithValue("@stu", studentId);
				ins.Parameters.AddWithValue("@act", tenHD);
				ins.Parameters.AddWithValue("@fp", finalPath);
				await ins.ExecuteNonQueryAsync();
				AiHealthDto aiResult = null;
				try
				{
					string expectedContext = tenHD;
					double? activity_lat = null;
					double? activity_lng = null;
					try
					{
						using SqlCommand ctxCmd = new SqlCommand("SELECT h.MaHD, h.TenHD, h.ContextId, ac.Name, h.Latitude, h.Longitude FROM HoatDongTruong h LEFT JOIN ActivityContexts ac ON h.ContextId = ac.ContextId WHERE h.MaHD=@m", con);
						ctxCmd.Parameters.AddWithValue("@m", maHD ?? "");
						using SqlDataReader reader = await ctxCmd.ExecuteReaderAsync();
						if (await reader.ReadAsync())
						{
							int? contextId = ((reader["ContextId"] == DBNull.Value) ? ((int?)null) : new int?((int)reader["ContextId"]));
							string contextName = ((reader["Name"] == DBNull.Value) ? null : reader["Name"].ToString());
							double? latitude = ((reader["Latitude"] == DBNull.Value) ? ((double?)null) : new double?((double)reader["Latitude"]));
							double? longitude = ((reader["Longitude"] == DBNull.Value) ? ((double?)null) : new double?((double)reader["Longitude"]));
							activity_lat = latitude;
							activity_lng = longitude;
							log.LogInformation("[ATTEND-AI-DEBUG] DB Query: MaHD={MaHD}, TenHD={TenHD}, ContextId={ContextId}, ContextName={ContextName}, ActivityLat={ActivityLat}, ActivityLng={ActivityLng}", reader["MaHD"], reader["TenHD"], contextId, contextName, activity_lat, activity_lng);
							if (!string.IsNullOrEmpty(contextName))
							{
								expectedContext = contextName;
								log.LogInformation("[ATTEND-AI] ✅ Using context from DB: {ContextName}", expectedContext);
							}
							else
							{
								log.LogWarning("[ATTEND-AI] ⚠\ufe0f ContextId={ContextId} is NULL/not found, using TenHD: {TenHD}", contextId, tenHD);
							}
						}
						else
						{
							log.LogWarning("[ATTEND-AI] ⚠\ufe0f Activity {MaHD} not found in database", maHD);
						}
					}
					catch (Exception ex4)
					{
						Exception ex5 = ex4;
						log.LogError("[ATTEND-AI] ❌ Could not get context from DB: {Msg}, using name: {TenHD}", ex5.Message, tenHD);
					}
					Dictionary<string, string> fields = new Dictionary<string, string>
					{
						["student_id"] = studentId,
						["activity_name"] = expectedContext,
						["student_face_image_b64"] = faceB64 ?? "",
						["lat"] = latStr ?? "",
						["lng"] = lngStr ?? "",
						["activity_lat"] = activity_lat?.ToString() ?? "",
						["activity_lng"] = activity_lng?.ToString() ?? ""
					};
					log.LogInformation("[ATTEND-AI-GPS-DEBUG] Sending GPS to AI: student_gps=({StudentLat},{StudentLng}), activity_gps=({ActivityLat},{ActivityLng})", latStr, lngStr, activity_lat, activity_lng);
					object[] obj5 = new object[3]
					{
						!string.IsNullOrWhiteSpace(faceB64),
						faceB64?.Length ?? 0,
						null
					};
					string text2 = faceB64;
					obj5[2] = ((text2 != null && text2.Length > 50) ? (faceB64.Substring(0, 50) + "...") : faceB64);
					log.LogInformation("[ATTEND-AI-FACE-DEBUG] Sending face to AI: has_face={HasFace}, face_length={FaceLen}, face_first_50={FacePreview}", obj5);
					using FileStream fsSend = File.OpenRead(finalPath);
					aiResult = await aiClient.AnalyzeVideoAsync(contentType: finalPath.EndsWith(".mp4") ? "video/mp4" : "video/webm", stream: fsSend, fileName: Path.GetFileName(finalPath), fields: fields, ct: CancellationToken.None);
				}
				catch (Exception ex6)
				{
					log.LogError("[ATTEND-AI-ERROR] {Msg}", ex6.Message);
					using SqlCommand updFail = new SqlCommand("UPDATE Evidence SET Status='AnalyzeFailed', Verdict='LowQuality' WHERE EvidenceId=@id", con);
					updFail.Parameters.AddWithValue("@id", evidenceId);
					await updFail.ExecuteNonQueryAsync();
				}
				if (aiResult != null)
				{
					double f = default(double);
					double? face = aiResult.face_score ?? ((aiResult.scores?.TryGetValue("face", out f) ?? false) ? new double?(f) : ((double?)null));
					double c = default(double);
					double? banner = aiResult.context_score ?? ((aiResult.scores?.TryGetValue("context", out c) ?? false) ? new double?(c) : ((double?)null));
					double t = default(double);
					double? tamper = ((aiResult.scores?.TryGetValue("tamper", out t) ?? false) ? new double?(t) : ((double?)null));
					string verdict = ComputeVerdict(aiResult.weighted_score);
					using SqlCommand upd = new SqlCommand("UPDATE Evidence SET Status='Analyzed', Verdict=@verdict,\r\n                TamperScore=@tamper, FaceScore=@face, BannerScore=@banner, WeightedScore=@weighted,\r\n                ModelVersion='v1', ProcessedAt=GETDATE() WHERE EvidenceId=@id", con);
					upd.Parameters.AddWithValue("@verdict", ((object)verdict) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@tamper", ((object)tamper) ?? DBNull.Value);
					upd.Parameters.AddWithValue("@face", ((object)face) ?? DBNull.Value);
					upd.Parameters.AddWithValue("@banner", ((object)banner) ?? DBNull.Value);
					upd.Parameters.AddWithValue("@weighted", ((object)aiResult.weighted_score) ?? DBNull.Value);
					upd.Parameters.AddWithValue("@id", evidenceId);
					await upd.ExecuteNonQueryAsync();
				}
				try
				{
					using SqlCommand selLop = new SqlCommand("SELECT TOP 1 MaLop FROM SINHVIEN WHERE MSSV=@m", con);
					selLop.Parameters.AddWithValue("@m", studentId);
					string maLop = (await selLop.ExecuteScalarAsync())?.ToString();
					if (!string.IsNullOrWhiteSpace(maLop))
					{
						List<Dictionary<string, object?>> gvRows = await QueryAsync(con, "SELECT TOP 1 MaCaNhan FROM GiangVien WHERE LopCV=@lop", new SqlParameter[1]
						{
							new SqlParameter("@lop", maLop)
						});
						if (gvRows.Count > 0)
						{
							string gvId = gvRows[0]["MaCaNhan"]?.ToString() ?? "";
							using SqlCommand insN = new SqlCommand("INSERT INTO dbo.Notifications(Recipient, Title, Message, Link, EvidenceId, StudentId) VALUES(@r,@t,@m,@l,@e,@s)", con);
							insN.Parameters.AddWithValue("@r", gvId);
							insN.Parameters.AddWithValue("@t", "Sinh viên nộp minh chứng hoạt động");
							insN.Parameters.AddWithValue("@m", $"Sinh viên {studentId} vừa nộp minh chứng cho hoạt động '{tenHD}' (QR).");
							insN.Parameters.AddWithValue("@l", "/giangvien.html#evidence");
							insN.Parameters.AddWithValue("@e", evidenceId);
							insN.Parameters.AddWithValue("@s", studentId);
							await insN.ExecuteNonQueryAsync();
						}
					}
				}
				catch
				{
				}
				log.LogInformation("[ATTEND] MSSV={Mssv} MaHD={MaHD} EvidenceId={Id} Verdict={V}", studentId, maHD, evidenceId, aiResult?.verdict ?? "N/A");
				return Results.Ok(new
				{
					evidenceId = evidenceId,
					analyzed = (aiResult != null),
					verdict = aiResult?.verdict,
					face_score = aiResult?.face_score,
					context_score = aiResult?.context_score,
					weighted_score = aiResult?.weighted_score,
					weightedScore = aiResult?.weighted_score,
					scores = aiResult?.scores,
					ok = (aiResult?.ok ?? false),
					message = ((aiResult != null) ? "Điểm danh và phân tích thành công" : "Điểm danh được ghi nhận"),
					status = ((aiResult != null) ? "Analyzed" : "AnalyzeFailed")
				});
			}
			catch (Exception ex7)
			{
				Console.WriteLine("[ATTEND_ERROR] " + ex7.Message);
				return Results.Problem(ex7.Message);
			}
		});
		app.MapPost("/api/activities/{maHD}/evidence", (Func<string, HttpRequest, AiClient, ILogger<Program>, Task<IResult>>)async delegate(string maHD, HttpRequest req, AiClient aiClient, ILogger<Program> log)
		{
			if (!req.HasFormContentType)
			{
				return Results.BadRequest(new
				{
					error = "FormData required"
				});
			}
			try
			{
				IFormCollection form = await req.ReadFormAsync();
				IFormFile videoFile = form.Files.GetFile("file");
				if (videoFile == null || videoFile.Length == 0)
				{
					return Results.BadRequest(new
					{
						error = "Thiếu file video (field 'file')"
					});
				}
				string mssv = form["mssv"].ToString().Trim();
				if (string.IsNullOrWhiteSpace(mssv))
				{
					mssv = req.Headers["X-User"].ToString();
				}
				if (string.IsNullOrWhiteSpace(mssv))
				{
					return Results.BadRequest(new
					{
						error = "Thiếu studentId/mssv"
					});
				}
				string latStr = form["lat"].ToString().Trim();
				string lngStr = form["lng"].ToString().Trim();
				double.TryParse(latStr, out var latVal);
				double.TryParse(lngStr, out var lngVal);
				Console.WriteLine("[EVIDENCE-GPS-DETAILED] ========== GPS DATA RECEIVED ==========");
				Console.WriteLine($"[EVIDENCE-GPS-DETAILED] Raw FormData lat: '{latStr}' (length={latStr?.Length ?? 0})");
				Console.WriteLine($"[EVIDENCE-GPS-DETAILED] Raw FormData lng: '{lngStr}' (length={lngStr?.Length ?? 0})");
				Console.WriteLine($"[EVIDENCE-GPS-DETAILED] Parsed latVal: {latVal}");
				Console.WriteLine($"[EVIDENCE-GPS-DETAILED] Parsed lngVal: {lngVal}");
				Console.WriteLine($"[EVIDENCE-GPS-DETAILED] GPS Valid? lat={latVal != 0.0}, lng={lngVal != 0.0}");
				Console.WriteLine("[EVIDENCE-GPS-DETAILED] FormData keys available: " + string.Join(", ", form.Keys));
				Console.WriteLine("[EVIDENCE-GPS-DETAILED] ======================================");
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				List<Dictionary<string, object?>> actRows = await QueryAsync(con, "SELECT TOP 1 TenHD, DiemRL, NgayBD FROM HoatDongTruong WHERE MaHD=@m", new SqlParameter[1]
				{
					new SqlParameter("@m", maHD.Trim())
				});
				if (actRows.Count == 0)
				{
					return Results.NotFound(new
					{
						error = "Không tìm thấy hoạt động: " + maHD
					});
				}
				string tenHD = actRows[0]["TenHD"]?.ToString() ?? maHD;
				if ((await QueryAsync(con, "SELECT TOP 1 MaHD FROM ActivityRegistrations WHERE MaHD=@m AND MSSV=@s", new SqlParameter[2]
				{
					new SqlParameter("@m", maHD.Trim()),
					new SqlParameter("@s", mssv)
				})).Count == 0)
				{
					Console.WriteLine($"[EVIDENCE] Auto-registering {mssv} for {maHD} (was not registered)");
					using SqlCommand reg = new SqlCommand("INSERT INTO ActivityRegistrations(MaHD, MSSV, RegisteredAt, Status)\r\n                VALUES(@m,@s,GETDATE(),'PENDING')", con);
					reg.Parameters.AddWithValue("@m", maHD.Trim());
					reg.Parameters.AddWithValue("@s", mssv);
					try
					{
						await reg.ExecuteNonQueryAsync();
					}
					catch
					{
					}
				}
				Directory.CreateDirectory(uploadRoot);
				Guid evidenceId = Guid.NewGuid();
				string origExt = Path.GetExtension(videoFile.FileName).ToLowerInvariant();
				string filePath = Path.Combine(uploadRoot, evidenceId.ToString() + (string.IsNullOrEmpty(origExt) ? ".webm" : origExt));
				await using (FileStream fs = File.Create(filePath))
				{
					await videoFile.CopyToAsync(fs);
				}
				string finalPath = filePath;
				try
				{
					if (origExt == ".webm" || origExt != ".mp4")
					{
						string mp4Path = Path.Combine(uploadRoot, evidenceId.ToString() + ".mp4");
						ProcessStartInfo psi2 = new ProcessStartInfo("ffmpeg", $"-y -i \"{filePath}\" -c:v libx264 -c:a aac \"{mp4Path}\"")
						{
							RedirectStandardOutput = true,
							RedirectStandardError = true,
							UseShellExecute = false,
							CreateNoWindow = true
						};
						using Process p = Process.Start(psi2);
						p.StandardError.ReadToEnd();
						p.WaitForExit(20000);
						if (p.ExitCode == 0)
						{
							finalPath = mp4Path;
						}
					}
				}
				catch
				{
				}
				using SqlCommand ins = new SqlCommand("INSERT INTO Evidence(EvidenceId, StudentId, ActivityName, FilePath, Status, Verdict, UploadedAt)\r\n            VALUES(@id,@stu,@act,@fp,'PendingAnalyze','ManualReview',GETDATE())", con);
				ins.Parameters.AddWithValue("@id", evidenceId);
				ins.Parameters.AddWithValue("@stu", mssv);
				ins.Parameters.AddWithValue("@act", tenHD);
				ins.Parameters.AddWithValue("@fp", finalPath);
				await ins.ExecuteNonQueryAsync();
				AiHealthDto aiResult = null;
				string expectedContext = tenHD;
				double? activity_lat = null;
				double? activity_lng = null;
				try
				{
					Console.WriteLine($"[EVIDENCE-AI] Calling AI analysis for evidence: {evidenceId}");
					try
					{
						using SqlCommand ctxCmd = new SqlCommand("SELECT h.MaHD, h.TenHD, h.ContextId, ac.Name, h.Latitude, h.Longitude FROM HoatDongTruong h LEFT JOIN ActivityContexts ac ON h.ContextId = ac.ContextId WHERE h.MaHD=@m", con);
						ctxCmd.Parameters.AddWithValue("@m", maHD ?? "");
						using SqlDataReader reader = await ctxCmd.ExecuteReaderAsync();
						if (await reader.ReadAsync())
						{
							int? contextId = ((reader["ContextId"] == DBNull.Value) ? ((int?)null) : new int?((int)reader["ContextId"]));
							string contextName = ((reader["Name"] == DBNull.Value) ? null : reader["Name"].ToString());
							double? latitude = ((reader["Latitude"] == DBNull.Value) ? ((double?)null) : new double?((double)reader["Latitude"]));
							double? longitude = ((reader["Longitude"] == DBNull.Value) ? ((double?)null) : new double?((double)reader["Longitude"]));
							activity_lat = latitude;
							activity_lng = longitude;
							log.LogInformation("[QR-EVIDENCE-DEBUG] DB Query: MaHD={MaHD}, TenHD={TenHD}, ContextId={ContextId}, ContextName={ContextName}, ActivityLat={ActivityLat}, ActivityLng={ActivityLng}", reader["MaHD"], reader["TenHD"], contextId, contextName, activity_lat, activity_lng);
							if (!string.IsNullOrEmpty(contextName))
							{
								expectedContext = contextName;
								log.LogInformation("[QR-EVIDENCE] ✅ Using context from DB: {ContextName}", expectedContext);
							}
							else
							{
								log.LogWarning("[QR-EVIDENCE] ⚠\ufe0f ContextId={ContextId} is NULL/not found, using TenHD: {TenHD}", contextId, tenHD);
							}
						}
						else
						{
							log.LogWarning("[QR-EVIDENCE] ⚠\ufe0f Activity {MaHD} not found in database", maHD);
						}
					}
					catch (Exception ex3)
					{
						Exception ex4 = ex3;
						log.LogError("[QR-EVIDENCE] ❌ Could not get context from DB: {Msg}, using name: {TenHD}", ex4.Message, tenHD);
					}
					string faceB64 = form["student_face_image_b64"].ToString() ?? "";
					log.LogInformation("[EVIDENCE-FORMDATA-CHECK] Face field status: exists={Exists}, empty={Empty}, length={Length}", form.ContainsKey("student_face_image_b64"), string.IsNullOrWhiteSpace(faceB64), faceB64?.Length ?? 0);
					if (string.IsNullOrWhiteSpace(faceB64))
					{
						log.LogInformation("[EVIDENCE-FACE-FETCH] Frontend did not send face, fetching from DB for student: {StudentId}", mssv);
						try
						{
							using SqlCommand cmd = new SqlCommand("SELECT AnhDD FROM SINHVIEN WHERE MSSV=@mssv", con);
							cmd.Parameters.AddWithValue("@mssv", mssv);
							object result = await cmd.ExecuteScalarAsync();
							log.LogInformation("[EVIDENCE-FACE-DB1] Query SINHVIEN.AnhDD for {StudentId}: result_type={ResultType}, is_null={IsNull}", mssv, result?.GetType().Name ?? "null", result == null || result == DBNull.Value);
							if (result != null && result != DBNull.Value)
							{
								byte[] imageBytes = (byte[])result;
								log.LogInformation("[EVIDENCE-FACE-DB1-SUCCESS] Got {ByteCount} bytes from SINHVIEN.AnhDD", imageBytes.Length);
								faceB64 = Convert.ToBase64String(imageBytes);
							}
							else
							{
								log.LogInformation("[EVIDENCE-FACE-DB1-EMPTY] SINHVIEN.AnhDD is empty, trying StudentFaceData table");
								using SqlCommand cmd2 = new SqlCommand("SELECT TOP 1 FaceImage FROM StudentFaceData WHERE MSSV=@mssv ORDER BY CreatedAt DESC", con);
								cmd2.Parameters.AddWithValue("@mssv", mssv);
								object result2 = await cmd2.ExecuteScalarAsync();
								log.LogInformation("[EVIDENCE-FACE-DB2] Query StudentFaceData for {StudentId}: result_type={ResultType}, is_null={IsNull}", mssv, result2?.GetType().Name ?? "null", result2 == null || result2 == DBNull.Value);
								if (result2 != null && result2 != DBNull.Value)
								{
									byte[] imageBytes2 = (byte[])result2;
									log.LogInformation("[EVIDENCE-FACE-DB2-SUCCESS] Got {ByteCount} bytes from StudentFaceData", imageBytes2.Length);
									faceB64 = Convert.ToBase64String(imageBytes2);
								}
								else
								{
									log.LogWarning("[EVIDENCE-FACE-DB-FAIL] No face image found in either SINHVIEN.AnhDD or StudentFaceData for {StudentId}", mssv);
								}
							}
						}
						catch (Exception ex3)
						{
							Exception ex5 = ex3;
							log.LogError("[EVIDENCE-FACE-ERROR] Exception while fetching face: {Message}", ex5.Message);
						}
					}
					else
					{
						log.LogInformation("[EVIDENCE-FACE-FRONTEND] Frontend sent face image, length={Length}", faceB64?.Length ?? 0);
					}
					Dictionary<string, string> fields = new Dictionary<string, string>
					{
						["student_id"] = mssv ?? "",
						["activity_name"] = expectedContext ?? tenHD ?? "",
						["student_face_image_b64"] = faceB64 ?? "",
						["lat"] = latStr ?? "",
						["lng"] = lngStr ?? "",
						["activity_lat"] = activity_lat?.ToString() ?? "",
						["activity_lng"] = activity_lng?.ToString() ?? ""
					};
					Console.WriteLine("[EVIDENCE-AI-FIELDS] Student GPS: lat=" + latStr + ", lng=" + lngStr);
					Console.WriteLine($"[EVIDENCE-AI-FIELDS] Activity GPS: lat={activity_lat}, lng={activity_lng}");
					using FileStream fsSend = File.OpenRead(finalPath);
					aiResult = await aiClient.AnalyzeVideoAsync(contentType: Path.GetExtension(finalPath).Equals(".mp4", StringComparison.OrdinalIgnoreCase) ? "video/mp4" : "video/webm", stream: fsSend, fileName: Path.GetFileName(finalPath), fields: fields, ct: CancellationToken.None);
					Console.WriteLine($"[EVIDENCE-AI] AI analysis done: verdict={aiResult?.verdict}, weighted={aiResult?.weighted_score}");
				}
				catch (Exception ex3)
				{
					Exception ex6 = ex3;
					Console.WriteLine("[EVIDENCE-AI-ERROR] AI analysis failed: " + ex6.Message);
					aiResult = null;
				}
				if (aiResult != null)
				{
					double? weighted = aiResult.weighted_score;
					double t;
					double? tamper = ((aiResult.scores != null && aiResult.scores.TryGetValue("tamper", out t)) ? new double?(t) : ((double?)null));
					double f;
					double? face = aiResult.face_score ?? ((aiResult.scores != null && aiResult.scores.TryGetValue("face", out f)) ? new double?(f) : ((double?)null));
					double c;
					double b;
					double? context = aiResult.context_score ?? ((aiResult.scores != null && aiResult.scores.TryGetValue("context", out c)) ? new double?(c) : ((aiResult.scores != null && aiResult.scores.TryGetValue("banner", out b)) ? new double?(b) : ((double?)null)));
					string verdict = ComputeVerdict(weighted);
					string detailsJson = JsonSerializer.Serialize(new { aiResult.verdict, aiResult.weighted_score, aiResult.scores });
					using SqlCommand upd = new SqlCommand("UPDATE Evidence SET Status='Analyzed', Verdict=@verdict, TamperScore=@tamper, FaceScore=@face, BannerScore=@context, WeightedScore=@weighted, ScoresJson=@scores, DetailsJson=@details, ModelVersion='v1', ProcessedAt=GETDATE() WHERE EvidenceId=@id", con);
					upd.Parameters.AddWithValue("@verdict", ((object)verdict) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@tamper", ((object)tamper) ?? DBNull.Value);
					upd.Parameters.AddWithValue("@face", ((object)face) ?? DBNull.Value);
					upd.Parameters.AddWithValue("@context", ((object)context) ?? DBNull.Value);
					upd.Parameters.AddWithValue("@weighted", ((object)weighted) ?? DBNull.Value);
					upd.Parameters.AddWithValue("@scores", ((object)((aiResult.scores == null) ? null : JsonSerializer.Serialize(aiResult.scores))) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@details", ((object)detailsJson) ?? ((object)DBNull.Value));
					upd.Parameters.AddWithValue("@id", evidenceId);
					await upd.ExecuteNonQueryAsync();
					Console.WriteLine($"[EVIDENCE-UPLOAD] Evidence analyzed: EvidenceId={evidenceId} Verdict={verdict} Weighted={weighted}");
					
					if (string.Equals(verdict, "Approved", StringComparison.OrdinalIgnoreCase) || string.Equals(verdict, "Accepted", StringComparison.OrdinalIgnoreCase))
					{
						int awardedPoints = await ResolveEvidencePointsAsync(con, evidenceId);
						int curY = 2024; int curS = 1;
						using (SqlCommand cmdS = new SqlCommand("SELECT TOP 1 CurrentYear, CurrentSemester FROM SystemSettings", con)) {
							using SqlDataReader rS = await cmdS.ExecuteReaderAsync();
							if (await rS.ReadAsync()) {
								curY = rS["CurrentYear"] != DBNull.Value ? Convert.ToInt32(rS["CurrentYear"]) : 2024;
								curS = rS["CurrentSemester"] != DBNull.Value ? Convert.ToInt32(rS["CurrentSemester"]) : 1;
							}
						}
						bool ok = await AwardPointsAsync(con, mssv, curY, curS, awardedPoints, "AI duyệt tự động minh chứng", "AI");
						Console.WriteLine($"[EVIDENCE-UPLOAD] Auto-approved by AI. Awarded {awardedPoints} points to Year={curY}, Sem={curS}. Success={ok}");
					}
				}
				return Results.Ok(new
				{
					success = true,
					evidenceId = evidenceId.ToString(),
					message = "Minh chứng được gửi thành công",
					analyzed = (aiResult != null),
					verdict = aiResult?.verdict,
					face_score = aiResult?.face_score,
					context_score = aiResult?.context_score,
					device_score = aiResult?.device_score,
					weighted_score = aiResult?.weighted_score,
					scores = aiResult?.scores,
					expected_context = aiResult?.expected_context,
					predicted_context = aiResult?.predicted_context,
					activity_name = tenHD,
					activity_context = expectedContext,
					gps_distance_m = aiResult?.gps_distance_m,
					gps_distance_km = aiResult?.gps_distance_km,
					lat = ((latVal != 0.0) ? new double?(latVal) : ((double?)null)),
					lng = ((lngVal != 0.0) ? new double?(lngVal) : ((double?)null)),
					activity_lat = activity_lat,
					activity_lng = activity_lng,
					has_gps = (latVal != 0.0 && lngVal != 0.0),
					face_analysis = ((aiResult?.details != null && aiResult.details.ContainsKey("face")) ? aiResult.details["face"].ToString() : null),
					context_analysis = ((aiResult?.details != null && aiResult.details.ContainsKey("context")) ? aiResult.details["context"].ToString() : null),
					device_analysis = ((aiResult?.details != null && aiResult.details.ContainsKey("device")) ? aiResult.details["device"].ToString() : null)
				});
			}
			catch (Exception ex7)
			{
				Console.WriteLine("[EVIDENCE-ERROR] " + ex7.Message);
				return Results.BadRequest(new
				{
					error = ex7.Message
				});
			}
		});
		app.MapPost("/api/activities/{maHD}/registration/complete", (Func<string, HttpRequest, Task<IResult>>)async delegate(string maHD, HttpRequest req)
		{
			string mssv = req.Query["mssv"].ToString();
			if (string.IsNullOrWhiteSpace(mssv))
			{
				mssv = req.Headers["X-User"].ToString();
			}
			if (string.IsNullOrWhiteSpace(mssv))
			{
				return Results.BadRequest(new
				{
					error = "Thiếu mssv"
				});
			}
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				try
				{
					using SqlCommand upsert = new SqlCommand("\r\n                IF EXISTS (SELECT 1 FROM ActivityRegistrations WHERE MaHD=@maHD AND MSSV=@mssv)\r\n                    UPDATE ActivityRegistrations SET Status='COMPLETED', UpdatedAt=GETDATE() WHERE MaHD=@maHD AND MSSV=@mssv\r\n                ELSE\r\n                    INSERT INTO ActivityRegistrations(MaHD, MSSV, RegisteredAt, Status) VALUES(@maHD,@mssv,GETDATE(),'COMPLETED')", con);
					upsert.Parameters.AddWithValue("@maHD", maHD.Trim());
					upsert.Parameters.AddWithValue("@mssv", mssv.Trim());
					await upsert.ExecuteNonQueryAsync();
				}
				catch (SqlException ex3) when (ex3.Message.Contains("Invalid object name"))
				{
					using SqlCommand create = new SqlCommand("\r\n                CREATE TABLE ActivityRegistrations (\r\n                    Id INT IDENTITY(1,1) PRIMARY KEY,\r\n                    MaHD NVARCHAR(50) NOT NULL,\r\n                    MSSV NVARCHAR(20) NOT NULL,\r\n                    RegisteredAt DATETIME DEFAULT GETDATE(),\r\n                    UpdatedAt DATETIME NULL,\r\n                    Status NVARCHAR(20) DEFAULT 'PENDING',\r\n                    CONSTRAINT UQ_ActivityReg UNIQUE (MaHD, MSSV)\r\n                )", con);
					await create.ExecuteNonQueryAsync();
					using SqlCommand ins2 = new SqlCommand("INSERT INTO ActivityRegistrations(MaHD,MSSV,RegisteredAt,Status) VALUES(@maHD,@mssv,GETDATE(),'COMPLETED')", con);
					ins2.Parameters.AddWithValue("@maHD", maHD.Trim());
					ins2.Parameters.AddWithValue("@mssv", mssv.Trim());
					await ins2.ExecuteNonQueryAsync();
				}
				catch (SqlException ex4) when (ex4.Message.Contains("Invalid column name"))
				{
					try
					{
						using SqlCommand addCol = new SqlCommand("\r\n                    IF COL_LENGTH('ActivityRegistrations','Status') IS NULL ALTER TABLE ActivityRegistrations ADD Status NVARCHAR(20) DEFAULT 'PENDING';\r\n                    IF COL_LENGTH('ActivityRegistrations','UpdatedAt') IS NULL ALTER TABLE ActivityRegistrations ADD UpdatedAt DATETIME NULL;", con);
						await addCol.ExecuteNonQueryAsync();
						using SqlCommand upd = new SqlCommand("UPDATE ActivityRegistrations SET Status='COMPLETED', UpdatedAt=GETDATE() WHERE MaHD=@maHD AND MSSV=@mssv", con);
						upd.Parameters.AddWithValue("@maHD", maHD.Trim());
						upd.Parameters.AddWithValue("@mssv", mssv.Trim());
						await upd.ExecuteNonQueryAsync();
					}
					catch
					{
					}
				}
				Console.WriteLine($"[REGISTRATION_COMPLETE] MSSV={mssv} MaHD={maHD} → COMPLETED");
				return Results.Ok(new
				{
					ok = true,
					message = "Cập nhật trạng thái hoàn tất"
				});
			}
			catch (Exception ex5)
			{
				Console.WriteLine("[REGISTRATION_COMPLETE_ERROR] " + ex5.Message);
				return Results.Problem(ex5.Message);
			}
		});
		app.MapGet("/api/admin/ai-config", async (IConfiguration config) =>
		{
			using HttpClient client = new HttpClient();
			string aiUrl = config["AI:BaseUrl"] ?? config["AIService:BaseUrl"] ?? "http://127.0.0.1:7001";
			var response = await client.GetAsync($"{aiUrl}/config");
			var content = await response.Content.ReadAsStringAsync();
			return Results.Content(content, "application/json");
		});

		app.MapPut("/api/admin/ai-config", async (HttpRequest req, IConfiguration config) =>
		{
			using StreamReader reader = new StreamReader(req.Body);
			string body = await reader.ReadToEndAsync();
			using HttpClient client = new HttpClient();
			string aiUrl = config["AI:BaseUrl"] ?? config["AIService:BaseUrl"] ?? "http://127.0.0.1:7001";
			var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
			var response = await client.PutAsync($"{aiUrl}/config", content);
			var responseContent = await response.Content.ReadAsStringAsync();
			return Results.Content(responseContent, "application/json");
		});

		app.MapPost("/api/admin/ai-train", async (HttpRequest req, IConfiguration config) =>
		{
			if (!req.HasFormContentType) return Results.BadRequest("Missing form data.");
			var form = await req.ReadFormAsync();
			string? contextType = form["context_type"];
			var file = form.Files.GetFile("file");
			if (string.IsNullOrEmpty(contextType) || file == null) return Results.BadRequest("Missing context_type or file.");

			try {
				var saveDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "ai_training");
				if (!Directory.Exists(saveDir)) Directory.CreateDirectory(saveDir);
				var savePath = Path.Combine(saveDir, $"{contextType}.mp4");
				using (var fileStreamCopy = new FileStream(savePath, FileMode.Create)) {
					await file.CopyToAsync(fileStreamCopy);
				}
			} catch (Exception ex) {
				Console.WriteLine($"[WARN] Could not save training video locally: {ex.Message}");
			}

			using HttpClient client = new HttpClient();
			client.Timeout = TimeSpan.FromMinutes(5);
			using var content = new MultipartFormDataContent();
			content.Add(new StringContent(contextType), "context_type");
			
			using var fileStream = file.OpenReadStream();
			var fileContent = new StreamContent(fileStream);
			if (file.ContentType != null)
			{
				fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(file.ContentType);
			}
			content.Add(fileContent, "file", file.FileName);
			
			string aiUrl = config["AI:BaseUrl"] ?? config["AIService:BaseUrl"] ?? "http://127.0.0.1:7001";
			var response = await client.PostAsync($"{aiUrl}/train/context-video", content);
			var responseContent = await response.Content.ReadAsStringAsync();
			return Results.Content(responseContent, "application/json");
		});

		app.MapGet("/api/admin/ai-trained-contexts", () =>
		{
			var saveDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "ai_training");
			var list = new List<object>();
			if (Directory.Exists(saveDir)) {
				var files = Directory.GetFiles(saveDir, "*.mp4");
				foreach (var f in files) {
					var info = new FileInfo(f);
					list.Add(new {
						context_type = Path.GetFileNameWithoutExtension(info.Name),
						file_name = info.Name,
						size = info.Length,
						date = info.LastWriteTime,
						url = $"/uploads/ai_training/{info.Name}"
					});
				}
			}
			return Results.Ok(list);
		});

		app.MapPost("/api/admin/ai-test", async (HttpRequest req, IConfiguration config) =>
		{
			if (!req.HasFormContentType) return Results.BadRequest("Missing form data.");
			var form = await req.ReadFormAsync();
			string? expectedContext = form["expected_context"];
			var file = form.Files.GetFile("file");
			if (file == null) return Results.BadRequest("Missing file.");

			using HttpClient client = new HttpClient();
			client.Timeout = TimeSpan.FromMinutes(2);
			using var content = new MultipartFormDataContent();
			
			using var fileStream = file.OpenReadStream();
			var fileContent = new StreamContent(fileStream);
			if (file.ContentType != null)
			{
				fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(file.ContentType);
			}
			content.Add(fileContent, "file", file.FileName);

			content.Add(new StringContent("ADMIN_TEST"), "student_id");
			content.Add(new StringContent(expectedContext ?? ""), "activity_name");

			string aiUrl = config["AI:BaseUrl"] ?? config["AIService:BaseUrl"] ?? "http://127.0.0.1:7001";
			var response = await client.PostAsync($"{aiUrl}/analyze/video", content);
			var responseContent = await response.Content.ReadAsStringAsync();
			return Results.Content(responseContent, "application/json");
		});

		app.MapPost("/api/admin/ekyc-test-card", async (HttpRequest req, IConfiguration config) =>
		{
			try {
				if (!req.HasFormContentType) return Results.BadRequest("Missing form data.");
				var form = await req.ReadFormAsync();
				var cardFile = form.Files.GetFile("card");
				if (cardFile == null) return Results.BadRequest("Missing card image.");

				using var ms2 = new MemoryStream(); await cardFile.CopyToAsync(ms2); byte[] cardBytes = ms2.ToArray();
				string cardB64 = Convert.ToBase64String(cardBytes);

				using SqlConnection con = new SqlConnection(connStr); await con.OpenAsync();
				using SqlCommand getTpl = new SqlCommand("SELECT TOP 1 TemplateImage FROM eKYCTemplates WHERE IsActive=1", con);
				var tplBytes = (byte[])await getTpl.ExecuteScalarAsync();
				if (tplBytes == null) return Results.BadRequest("Chưa có thẻ mẫu trong hệ thống.");
				string tplB64 = Convert.ToBase64String(tplBytes);

				using var client = new HttpClient();
				client.Timeout = TimeSpan.FromSeconds(60);
				string aiBaseUrl = config["AI:BaseUrl"] ?? config["AIService:BaseUrl"] ?? "http://127.0.0.1:7001";
				var aiUrl = $"{aiBaseUrl}/ekyc/verify";
				// Provide the card as selfie as well just to satisfy the python backend which expects both
				var payload = new { selfie = cardB64, card = cardB64, template = tplB64 };
				var resp = await client.PostAsJsonAsync(aiUrl, payload);
				
				if (resp.IsSuccessStatusCode) {
					var resJson = await resp.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
					float cardScore = resJson.TryGetProperty("cardScore", out var cs) ? (float)cs.GetDouble() : 0f;
					string extractedText = resJson.TryGetProperty("extractedText", out var ext) ? ext.GetString() : "";
					
					object parsedInfo = null;
					if (resJson.TryGetProperty("parsedInfo", out var pi)) {
						var piDict = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(pi.GetRawText());
						
						if (piDict != null && piDict.TryGetValue("mssv", out string mssv) && !string.IsNullOrEmpty(mssv)) {
							using SqlCommand cmd = new SqlCommand("SELECT TOP 1 TenSV FROM SINHVIEN WHERE MSSV=@m", con);
							cmd.Parameters.AddWithValue("@m", mssv);
							using var reader = await cmd.ExecuteReaderAsync();
							if (await reader.ReadAsync()) {
								string dbName = reader["TenSV"]?.ToString();
								if (!string.IsNullOrEmpty(dbName)) {
									piDict["name"] = dbName;
								}
							}
						}
						parsedInfo = piDict;
					}
					
					return Results.Ok(new { status = "success", cardScore, extractedText, parsedInfo });
				} else {
					return Results.BadRequest("AI Service Error: " + await resp.Content.ReadAsStringAsync());
				}
			} catch (Exception ex) { return Results.Problem(ex.Message); }
		});
		app.MapGet("/api/sinhvien/{mssv}/points-history", async (string mssv, HttpContext ctx, int? namHoc, int? hocKi) =>
		{
			using SqlConnection con = new SqlConnection(connStr);
			await con.OpenAsync();
			using SqlCommand cmd = new SqlCommand("SELECT Id, MSSV, NamHoc, HocKi, PointsChanged, Reason, ApprovedBy, CreatedAt FROM PointHistory WHERE MSSV=@mssv" + ((namHoc.HasValue) ? " AND NamHoc=@y" : "") + ((hocKi.HasValue) ? " AND HocKi=@s" : "") + " ORDER BY CreatedAt DESC", con);
			cmd.Parameters.AddWithValue("@mssv", mssv);
			if (namHoc.HasValue)
			{
				cmd.Parameters.AddWithValue("@y", namHoc.Value);
			}
			if (hocKi.HasValue)
			{
				cmd.Parameters.AddWithValue("@s", hocKi.Value);
			}
			var list = new List<object>();
			using SqlDataReader rd = await cmd.ExecuteReaderAsync();
			while (await rd.ReadAsync())
			{
				list.Add(new
				{
					Id = rd["Id"],
					MSSV = rd["MSSV"]?.ToString(),
					NamHoc = rd["NamHoc"],
					HocKi = rd["HocKi"],
					PointsChanged = rd["PointsChanged"],
					Reason = rd["Reason"]?.ToString(),
					ApprovedBy = rd["ApprovedBy"]?.ToString(),
					CreatedAt = rd["CreatedAt"]
				});
			}
			return Results.Ok(list);
		});

				// ==========================================
		// eKYC ENDPOINTS
		// ==========================================
		app.MapPost("/api/ekyc/template", async (HttpRequest req) =>
		{
			try
			{
				if (!req.HasFormContentType) return Results.BadRequest("Need form-data");
				var form = await req.ReadFormAsync();
				
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();

				string threshold = form["threshold"].FirstOrDefault();
				string ocr = form["ocr"].FirstOrDefault();
				string antiglare = form["antiglare"].FirstOrDefault();
				string blink = form["blink"].FirstOrDefault();
				string turnLeft = form["turnLeft"].FirstOrDefault();
				string turnRight = form["turnRight"].FirstOrDefault();

				if (threshold != null) {
					using SqlCommand cmd = new SqlCommand("IF EXISTS(SELECT 1 FROM AppSettings WHERE SettingKey='EKYC_THRESHOLD') UPDATE AppSettings SET SettingValue=@v, UpdatedAt=GETDATE() WHERE SettingKey='EKYC_THRESHOLD' ELSE INSERT INTO AppSettings(SettingKey, SettingValue) VALUES('EKYC_THRESHOLD', @v)", con);
					cmd.Parameters.AddWithValue("@v", threshold);
					await cmd.ExecuteNonQueryAsync();
				}
				if (ocr != null) {
					using SqlCommand cmd = new SqlCommand("IF EXISTS(SELECT 1 FROM AppSettings WHERE SettingKey='EKYC_OCR_CONFIDENCE') UPDATE AppSettings SET SettingValue=@v, UpdatedAt=GETDATE() WHERE SettingKey='EKYC_OCR_CONFIDENCE' ELSE INSERT INTO AppSettings(SettingKey, SettingValue) VALUES('EKYC_OCR_CONFIDENCE', @v)", con);
					cmd.Parameters.AddWithValue("@v", ocr);
					await cmd.ExecuteNonQueryAsync();
				}
				if (antiglare != null) {
					using SqlCommand cmd = new SqlCommand("IF EXISTS(SELECT 1 FROM AppSettings WHERE SettingKey='EKYC_ANTI_GLARE') UPDATE AppSettings SET SettingValue=@v, UpdatedAt=GETDATE() WHERE SettingKey='EKYC_ANTI_GLARE' ELSE INSERT INTO AppSettings(SettingKey, SettingValue) VALUES('EKYC_ANTI_GLARE', @v)", con);
					cmd.Parameters.AddWithValue("@v", antiglare);
					await cmd.ExecuteNonQueryAsync();
				}
				if (blink != null) {
					using SqlCommand cmd = new SqlCommand("IF EXISTS(SELECT 1 FROM AppSettings WHERE SettingKey='EKYC_BLINK_THRESHOLD') UPDATE AppSettings SET SettingValue=@v, UpdatedAt=GETDATE() WHERE SettingKey='EKYC_BLINK_THRESHOLD' ELSE INSERT INTO AppSettings(SettingKey, SettingValue) VALUES('EKYC_BLINK_THRESHOLD', @v)", con);
					cmd.Parameters.AddWithValue("@v", blink);
					await cmd.ExecuteNonQueryAsync();
				}
				if (turnLeft != null) {
					using SqlCommand cmd = new SqlCommand("IF EXISTS(SELECT 1 FROM AppSettings WHERE SettingKey='EKYC_TURN_LEFT') UPDATE AppSettings SET SettingValue=@v, UpdatedAt=GETDATE() WHERE SettingKey='EKYC_TURN_LEFT' ELSE INSERT INTO AppSettings(SettingKey, SettingValue) VALUES('EKYC_TURN_LEFT', @v)", con);
					cmd.Parameters.AddWithValue("@v", turnLeft);
					await cmd.ExecuteNonQueryAsync();
				}
				if (turnRight != null) {
					using SqlCommand cmd = new SqlCommand("IF EXISTS(SELECT 1 FROM AppSettings WHERE SettingKey='EKYC_TURN_RIGHT') UPDATE AppSettings SET SettingValue=@v, UpdatedAt=GETDATE() WHERE SettingKey='EKYC_TURN_RIGHT' ELSE INSERT INTO AppSettings(SettingKey, SettingValue) VALUES('EKYC_TURN_RIGHT', @v)", con);
					cmd.Parameters.AddWithValue("@v", turnRight);
					await cmd.ExecuteNonQueryAsync();
				}

				var file = form.Files.GetFile("image");
				if (file != null && file.Length > 0) {
					using var ms = new MemoryStream();
					await file.CopyToAsync(ms);
					byte[] imgBytes = ms.ToArray();

					using (SqlCommand ensure = new SqlCommand(@"
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='eKYCTemplates' AND xtype='U')
BEGIN
    CREATE TABLE eKYCTemplates (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        TemplateImage VARBINARY(MAX) NOT NULL,
        IsActive BIT DEFAULT 1,
        CreatedAt DATETIME DEFAULT GETDATE()
    );
END", con)) { await ensure.ExecuteNonQueryAsync(); }

					using SqlCommand update = new SqlCommand("UPDATE eKYCTemplates SET IsActive=0", con);
					await update.ExecuteNonQueryAsync();

					using SqlCommand insert = new SqlCommand("INSERT INTO eKYCTemplates(TemplateImage) VALUES(@img)", con);
					insert.Parameters.Add("@img", System.Data.SqlDbType.VarBinary, -1).Value = imgBytes;
					await insert.ExecuteNonQueryAsync();
				}

				return Results.Ok(new { status = "success", message = "Settings updated successfully" });
			}
			catch (Exception ex)
			{
				Console.WriteLine("[EKYC-TEMPLATE] Error: " + ex.Message);
				return Results.Problem(ex.Message);
			}
		});

		app.MapGet("/api/ekyc/template", async () =>
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				
				using SqlCommand check = new SqlCommand("IF OBJECT_ID('eKYCTemplates', 'U') IS NOT NULL SELECT TOP 1 Id FROM eKYCTemplates WHERE IsActive=1 ELSE SELECT NULL", con);
				var id = await check.ExecuteScalarAsync();
				
				// Fetch settings
				using SqlCommand getSettings = new SqlCommand("SELECT SettingKey, SettingValue FROM AppSettings WHERE SettingKey LIKE 'EKYC_%'", con);
				using var reader = await getSettings.ExecuteReaderAsync();
				string threshold = "80";
				string ocr = "85";
				string antiglare = "1";
				string blink = "0.20";
				string turnLeft = "0.40";
				string turnRight = "0.60";
				while (await reader.ReadAsync()) {
					string key = reader.GetString(0);
					string val = reader.GetString(1);
					if (key == "EKYC_THRESHOLD") threshold = val;
					else if (key == "EKYC_OCR_CONFIDENCE") ocr = val;
					else if (key == "EKYC_ANTI_GLARE") antiglare = val;
					else if (key == "EKYC_BLINK_THRESHOLD") blink = val;
					else if (key == "EKYC_TURN_LEFT") turnLeft = val;
					else if (key == "EKYC_TURN_RIGHT") turnRight = val;
				}
				reader.Close();

				return Results.Ok(new { status = "success", id = id, threshold = threshold, ocr = ocr, antiglare = antiglare, blink = blink, turnLeft = turnLeft, turnRight = turnRight });
			}
			catch { return Results.Problem(); }
		});

		app.MapGet("/api/ekyc/template/image", async () =>
		{
			try
			{
				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using SqlCommand check = new SqlCommand("IF OBJECT_ID('eKYCTemplates', 'U') IS NOT NULL SELECT TOP 1 TemplateImage FROM eKYCTemplates WHERE IsActive=1 ELSE SELECT NULL", con);
				var bytes = (byte[])await check.ExecuteScalarAsync();
				if (bytes == null) return Results.NotFound();
				return Results.File(bytes, "image/jpeg");
			}
			catch { return Results.Problem(); }
		});

		app.MapPost("/api/ekyc/submit", async (HttpRequest req, IConfiguration config) =>
		{
			try
			{
				string mssv = req.Headers["X-User"].ToString()?.Trim(); if (string.IsNullOrEmpty(mssv)) return Results.Unauthorized();

				if (!req.HasFormContentType) return Results.BadRequest("Need form-data");
				var form = await req.ReadFormAsync();
				var selfieVideo = form.Files.GetFile("selfie");
				var selfieFrame = form.Files.GetFile("selfieFrame");
				var cardFile = form.Files.GetFile("card");
				if (selfieVideo == null || selfieFrame == null || cardFile == null) return Results.BadRequest("Missing files");

				using var msVideo = new MemoryStream(); await selfieVideo.CopyToAsync(msVideo); byte[] selfieVideoBytes = msVideo.ToArray();
				using var msFrame = new MemoryStream(); await selfieFrame.CopyToAsync(msFrame); byte[] selfieFrameBytes = msFrame.ToArray();
				using var ms2 = new MemoryStream(); await cardFile.CopyToAsync(ms2); byte[] cardBytes = ms2.ToArray();

				string selfieB64 = Convert.ToBase64String(selfieFrameBytes); // Frame sent to AI for scoring
				string cardB64 = Convert.ToBase64String(cardBytes);

				using SqlConnection con = new SqlConnection(connStr);
				await con.OpenAsync();
				using (SqlCommand ensure = new SqlCommand(@"
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='eKYCRequests' AND xtype='U')
BEGIN
    CREATE TABLE eKYCRequests (
        RequestId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        MSSV VARCHAR(20) NOT NULL,
        SelfieImage VARBINARY(MAX) NOT NULL,
        IdCardImage VARBINARY(MAX) NOT NULL,
        AiFaceScore FLOAT NULL,
        AiCardScore FLOAT NULL,
        AiExtractedText NVARCHAR(MAX) NULL,
        Status NVARCHAR(50) DEFAULT 'Pending',
        ReviewedBy NVARCHAR(100) NULL,
        ReviewedAt DATETIME NULL,
    );
END", con)) { await ensure.ExecuteNonQueryAsync(); }

				using (SqlCommand ensureCol = new SqlCommand(@"
IF COL_LENGTH('eKYCRequests', 'SelfieFrame') IS NULL
BEGIN
    ALTER TABLE eKYCRequests ADD SelfieFrame VARBINARY(MAX) NULL;
END", con)) { await ensureCol.ExecuteNonQueryAsync(); }

				// Get Template B64
				using SqlCommand getTpl = new SqlCommand("SELECT TOP 1 TemplateImage FROM eKYCTemplates WHERE IsActive=1", con);
				var tplBytes = (byte[])await getTpl.ExecuteScalarAsync();
				if (tplBytes == null) return Results.BadRequest("Admin chưa upload Thẻ Sinh viên Mẫu");
				string tplB64 = Convert.ToBase64String(tplBytes);

				// Call AI Service
				float faceScore = 0f; float cardScore = 0f; string extractedText = "";
				Dictionary<string, string> parsedInfo = null;
				try {
					using var client = new HttpClient();
					client.Timeout = TimeSpan.FromSeconds(60);
					string aiBaseUrl = config["AI:BaseUrl"] ?? config["AIService:BaseUrl"] ?? "http://127.0.0.1:7001";
					var aiUrl = $"{aiBaseUrl}/ekyc/verify";
					var payload = new { selfie = selfieB64, card = cardB64, template = tplB64 };
					var resp = await client.PostAsJsonAsync(aiUrl, payload);
					if (resp.IsSuccessStatusCode) {
						var resJson = await resp.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
						faceScore = resJson.TryGetProperty("faceScore", out var fs) ? (float)fs.GetDouble() : 0f;
						cardScore = resJson.TryGetProperty("cardScore", out var cs) ? (float)cs.GetDouble() : 0f;
						extractedText = resJson.TryGetProperty("extractedText", out var ext) ? ext.GetString() : "";
						
						if (resJson.TryGetProperty("parsedInfo", out var pi)) {
							parsedInfo = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(pi.GetRawText());
							
							if (parsedInfo != null && parsedInfo.TryGetValue("mssv", out string matchedMssv) && !string.IsNullOrEmpty(matchedMssv)) {
								using SqlCommand cmd = new SqlCommand("SELECT TOP 1 TenSV FROM SINHVIEN WHERE MSSV=@m", con);
								cmd.Parameters.AddWithValue("@m", matchedMssv);
								using var reader = await cmd.ExecuteReaderAsync();
								if (await reader.ReadAsync()) {
									string dbName = reader["TenSV"]?.ToString();
									if (!string.IsNullOrEmpty(dbName)) {
										parsedInfo["name"] = dbName;
									}
								}
							}
						}
					}
				} catch (Exception ex) { Console.WriteLine("[EKYC-AI] " + ex.Message); }

				using SqlCommand insert = new SqlCommand(@"
INSERT INTO eKYCRequests (MSSV, SelfieImage, IdCardImage, SelfieFrame, AiFaceScore, AiCardScore, AiExtractedText, Status)
VALUES (@m, @s, @c, @sf, @fs, @cs, @ext, 'Pending')", con);
				insert.Parameters.AddWithValue("@m", mssv);
				insert.Parameters.Add("@s", SqlDbType.VarBinary, -1).Value = selfieVideoBytes;
				insert.Parameters.Add("@c", SqlDbType.VarBinary, -1).Value = cardBytes;
				insert.Parameters.Add("@sf", SqlDbType.VarBinary, -1).Value = selfieFrameBytes;
				insert.Parameters.AddWithValue("@fs", faceScore);
				insert.Parameters.AddWithValue("@cs", cardScore);
				insert.Parameters.AddWithValue("@ext", extractedText ?? "");
				await insert.ExecuteNonQueryAsync();

				return Results.Ok(new { status = "success", faceScore, cardScore, extractedText, parsedInfo });
			}
			catch (Exception ex) { return Results.Problem(ex.Message); }
		});

		app.MapGet("/api/ekyc/status", async (HttpContext ctx) =>
		{
			try {
				string mssv = ctx.Request.Headers["X-User"].ToString()?.Trim(); if (string.IsNullOrEmpty(mssv)) return Results.Unauthorized();

				using SqlConnection con = new SqlConnection(connStr); await con.OpenAsync();
				using SqlCommand cmd = new SqlCommand("IF OBJECT_ID('eKYCRequests', 'U') IS NOT NULL SELECT TOP 1 Status, AiFaceScore, AiCardScore, CreatedAt, RequestId, AiExtractedText FROM eKYCRequests WHERE MSSV=@m ORDER BY CreatedAt DESC ELSE SELECT NULL", con);
				cmd.Parameters.AddWithValue("@m", mssv);
				using var rd = await cmd.ExecuteReaderAsync();
				if (await rd.ReadAsync()) return Results.Ok(new { status = rd.GetString(0), faceScore = rd.IsDBNull(1) ? 0 : rd.GetDouble(1), cardScore = rd.IsDBNull(2) ? 0 : rd.GetDouble(2), date = rd.GetDateTime(3), id = rd.GetGuid(4).ToString(), text = rd.IsDBNull(5) ? "" : rd.GetString(5) });
				return Results.Ok(new { status = "None" });
			} catch (Exception ex) { Console.WriteLine("EKYC PENDING ERROR: " + ex.Message + "\n" + ex.StackTrace); return Results.Problem(ex.Message); }
		});

		app.MapGet("/api/ekyc/pending", async (HttpContext ctx) =>
		{
			try {
				string mssv = ctx.Request.Headers["X-User"].ToString()?.Trim(); if (string.IsNullOrEmpty(mssv)) return Results.Unauthorized(); string role = mssv.Equals("admin", StringComparison.OrdinalIgnoreCase) ? "Admin" : "User";
				using SqlConnection con = new SqlConnection(connStr); await con.OpenAsync();
				
				string whereClause = "WHERE r.Status='Pending'";
				if (role != "Admin") {
					using SqlCommand getTk = new SqlCommand("SELECT TOP 1 MaCaNhan FROM TK WHERE MaCaNhan=@m OR TenTK=@m", con);
					getTk.Parameters.AddWithValue("@m", mssv);
					object tkRes = await getTk.ExecuteScalarAsync();
					string maCaNhan = (tkRes == null || tkRes == DBNull.Value) ? mssv : tkRes.ToString();
					
					using SqlCommand getGvLop = new SqlCommand("SELECT LopCV FROM GiangVien WHERE MaCaNhan=@m", con);
					getGvLop.Parameters.AddWithValue("@m", maCaNhan);
					using var rdGV = await getGvLop.ExecuteReaderAsync();
					List<string> gvClasses = new List<string>();
					while(await rdGV.ReadAsync()) {
						if (!rdGV.IsDBNull(0)) {
							gvClasses.Add(rdGV.GetString(0));
						}
					}
					rdGV.Close();

					if (gvClasses.Count > 0) {
						string classList = string.Join(",", gvClasses.Select(c => $"'{c}'"));
						whereClause += $" AND sv.MaLop IN ({classList})";
					} else {
						using SqlCommand getLop = new SqlCommand("SELECT MaLop FROM SINHVIEN WHERE MSSV=@m", con);
						getLop.Parameters.AddWithValue("@m", mssv);
						object lopRes = await getLop.ExecuteScalarAsync();
						string maLop = (lopRes == null || lopRes == DBNull.Value) ? null : lopRes.ToString();
						if (string.IsNullOrEmpty(maLop)) return Results.Unauthorized();
						whereClause += $" AND sv.MaLop='{maLop}'";
					}
				}

				using SqlCommand cmd = new SqlCommand($@"
SELECT r.RequestId, r.MSSV, sv.TenSV, sv.MaLop, r.AiFaceScore, r.AiCardScore, r.AiExtractedText, r.CreatedAt
FROM eKYCRequests r JOIN SINHVIEN sv ON r.MSSV = sv.MSSV
{whereClause} ORDER BY r.CreatedAt DESC", con);
				var list = new List<object>();
				using var rd = await cmd.ExecuteReaderAsync();
				while (await rd.ReadAsync()) list.Add(new { id = rd.GetGuid(0), mssv = rd.GetString(1), name = rd.GetString(2), className = rd.GetString(3), faceScore = rd.IsDBNull(4)?0:rd.GetDouble(4), cardScore = rd.IsDBNull(5)?0:rd.GetDouble(5), text = rd.IsDBNull(6)?"":rd.GetString(6), date = rd.GetDateTime(7) });
				return Results.Ok(list);
			} catch (Exception ex) { Console.WriteLine("EKYC PENDING ERROR: " + ex.Message + "\n" + ex.StackTrace); return Results.Problem(ex.Message); }
		});

		app.MapGet("/api/ekyc/image/{id}/{type}", async (Guid id, string type) =>
		{
			try {
				using SqlConnection con = new SqlConnection(connStr); await con.OpenAsync();
				using SqlCommand cmd = new SqlCommand(type == "selfie" ? "SELECT SelfieImage FROM eKYCRequests WHERE RequestId=@id" : "SELECT IdCardImage FROM eKYCRequests WHERE RequestId=@id", con);
				cmd.Parameters.AddWithValue("@id", id);
				var bytes = (byte[])await cmd.ExecuteScalarAsync();
				if (bytes == null) return Results.NotFound();
				
				string contentType = type == "selfie" ? "video/webm" : "image/jpeg";
				return Results.File(bytes, contentType);
			} catch (Exception ex) { Console.WriteLine("EKYC PENDING ERROR: " + ex.Message + "\n" + ex.StackTrace); return Results.Problem(ex.Message); }
		});

		app.MapPost("/api/ekyc/approve", async (HttpRequest req) =>
		{
			try {
				string reviewer = req.Headers["X-User"].ToString()?.Trim(); if (string.IsNullOrEmpty(reviewer)) return Results.Unauthorized();
				
				var form = await req.ReadFormAsync();
				string reqId = form["requestId"];
				string action = form["action"]; // "Approve" or "Reject"
				if (string.IsNullOrEmpty(reqId) || string.IsNullOrEmpty(action)) return Results.BadRequest();

				using SqlConnection con = new SqlConnection(connStr); await con.OpenAsync();
				using SqlCommand upd = new SqlCommand("UPDATE eKYCRequests SET Status=@s, ReviewedBy=@rv, ReviewedAt=GETDATE() WHERE RequestId=@id", con);
				upd.Parameters.AddWithValue("@s", action == "Approve" ? "Approved" : "Rejected");
				upd.Parameters.AddWithValue("@rv", reviewer);
				upd.Parameters.AddWithValue("@id", Guid.Parse(reqId));
				await upd.ExecuteNonQueryAsync();

				if (action == "Approve") {
					using SqlCommand getImg = new SqlCommand("SELECT MSSV, ISNULL(SelfieFrame, SelfieImage) FROM eKYCRequests WHERE RequestId=@id", con);
					getImg.Parameters.AddWithValue("@id", Guid.Parse(reqId));
					using var rd = await getImg.ExecuteReaderAsync();
					if (await rd.ReadAsync()) {
						string m = rd.GetString(0);
						byte[] img = rd[1] as byte[];
						rd.Close();
						
						if (img != null && img.Length > 0) {
							using SqlCommand upsertFace = new SqlCommand(@"
IF EXISTS (SELECT 1 FROM StudentFaceData WHERE MSSV=@m) UPDATE StudentFaceData SET FaceImage=@img, UpdatedAt=GETDATE() WHERE MSSV=@m
ELSE INSERT INTO StudentFaceData (MSSV, FaceImage, CreatedAt, UpdatedAt) VALUES (@m, @img, GETDATE(), GETDATE())", con);
							upsertFace.Parameters.AddWithValue("@m", m);
							upsertFace.Parameters.Add("@img", SqlDbType.VarBinary, -1).Value = img;
							await upsertFace.ExecuteNonQueryAsync();
							
							// Cập nhật Avatar cho Sinh viên (Dùng chính frame tốt nhất này làm avatar vĩnh viễn)
							using SqlCommand updAvatar = new SqlCommand("UPDATE SINHVIEN SET AnhDD=@img WHERE MSSV=@m", con);
							updAvatar.Parameters.Add("@img", SqlDbType.VarBinary, -1).Value = img;
							updAvatar.Parameters.AddWithValue("@m", m);
							await updAvatar.ExecuteNonQueryAsync();
						}
					}
				}
				return Results.Ok(new { status = "success" });
			} catch (Exception ex) { 
				Console.WriteLine("API EKYC APPROVE ERROR: " + ex.Message + "\n" + ex.StackTrace); 
				return Results.Problem(ex.Message); 
			}
		});

		app.Run();
		static async Task<bool> AwardPointsAsync(SqlConnection con, string mssv, int year, int semester, int points, string reason, string approvedBy, SqlTransaction? tx = null)
		{
			try
			{
				using (SqlCommand sync = ((tx != null) ? new SqlCommand("IF EXISTS (SELECT 1 FROM LUUTRUDIEMSV WHERE MSSV=@m AND NamHoc=@y AND HocKi=@s)\r\nBEGIN\r\n    UPDATE LUUTRUDIEMSV SET TongDRL = ISNULL(TongDRL,0) + @p WHERE MSSV=@m AND NamHoc=@y AND HocKi=@s;\r\nEND\r\nELSE\r\nBEGIN\r\n    INSERT INTO LUUTRUDIEMSV (MSSV, NamHoc, HocKi, TongDRL) VALUES (@m, @y, @s, @p);\r\nEND", con, tx) : new SqlCommand("IF EXISTS (SELECT 1 FROM LUUTRUDIEMSV WHERE MSSV=@m AND NamHoc=@y AND HocKi=@s)\r\nBEGIN\r\n    UPDATE LUUTRUDIEMSV SET TongDRL = ISNULL(TongDRL,0) + @p WHERE MSSV=@m AND NamHoc=@y AND HocKi=@s;\r\nEND\r\nELSE\r\nBEGIN\r\n    INSERT INTO LUUTRUDIEMSV (MSSV, NamHoc, HocKi, TongDRL) VALUES (@m, @y, @s, @p);\r\nEND", con)))
				{
					sync.Parameters.AddWithValue("@m", mssv);
					sync.Parameters.AddWithValue("@y", year);
					sync.Parameters.AddWithValue("@s", semester);
					sync.Parameters.AddWithValue("@p", points);
					await sync.ExecuteNonQueryAsync();
				}
				using (SqlCommand hist = ((tx != null) ? new SqlCommand("INSERT INTO PointHistory (MSSV, NamHoc, HocKi, PointsChanged, Reason, ApprovedBy) VALUES (@m, @y, @s, @p, @r, @a)", con, tx) : new SqlCommand("INSERT INTO PointHistory (MSSV, NamHoc, HocKi, PointsChanged, Reason, ApprovedBy) VALUES (@m, @y, @s, @p, @r, @a)", con)))
				{
					hist.Parameters.AddWithValue("@m", mssv);
					hist.Parameters.AddWithValue("@y", year);
					hist.Parameters.AddWithValue("@s", semester);
					hist.Parameters.AddWithValue("@p", points);
					hist.Parameters.AddWithValue("@r", (object)reason ?? DBNull.Value);
					hist.Parameters.AddWithValue("@a", (object)approvedBy ?? DBNull.Value);
					await hist.ExecuteNonQueryAsync();
				}
				return true;
			}
			catch (Exception ex)
			{
				Console.WriteLine($"[AWARD-POINTS-ERROR] Failed to award points: {ex.Message}");
				return false;
			}
		}
		static string Classify(string? title, string? message, object? evidenceId)
		{
			string text = (title + " " + message).ToLowerInvariant();
			if (evidenceId != null && evidenceId != DBNull.Value)
			{
				return "Minh ch?ng";
			}
			if (text.Contains("dgrl") || text.Contains("phi?u"))
			{
				return "Phi?u \ufffdGRL";
			}
			if (text.Contains("ho?t d?ng") || text.Contains("hoat dong"))
			{
				return "Ho?t d?ng";
			}
			if (text.Contains("nh?c") || text.Contains("remind") || text.Contains("c?n b? sung") || text.Contains("can bo sung"))
			{
				return "Nh?c nh?";
			}
			return "Kh\ufffdc";
		}
		static async Task<int> ComputeAutoScoreAsync(SqlConnection con, string mssv, string namHoc, int hocKi, string tenTc, string maSo, int max)
		{
			int? namInt = null;
			if (!string.IsNullOrWhiteSpace(namHoc))
			{
				if (int.TryParse(namHoc, out var nn))
				{
					namInt = nn;
				}
				else
				{
					Match m = Regex.Match(namHoc, "^(\\d{4})-(\\d{4})$");
					if (m.Success && int.TryParse(m.Groups[2].Value, out var y2))
					{
						namInt = y2;
					}
				}
			}
			double gpa4 = 0.0;
			int vpNT = 0;
			int vpXH = 0;
			double prevGpa4 = 0.0;
			bool hasPrev = false;
			try
			{
				string sql = "SELECT TOP 1 DiemTBM_4, ISNULL(viphamNT,0) viphamNT, ISNULL(viphamXH,0) viphamXH\r\nFROM LUUTRUDIEMSV WHERE MSSV=@m" + (namInt.HasValue ? " AND NamHoc=@n" : "") + " AND HocKi=@h ORDER BY NamHoc DESC, HocKi DESC";
				using SqlCommand cmd = new SqlCommand(sql, con);
				cmd.Parameters.AddWithValue("@m", mssv.Trim());
				if (namInt.HasValue)
				{
					cmd.Parameters.AddWithValue("@n", namInt.Value);
				}
				cmd.Parameters.AddWithValue("@h", hocKi);
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				if (await rd.ReadAsync())
				{
					gpa4 = ((rd["DiemTBM_4"] == DBNull.Value) ? 0.0 : Convert.ToDouble(rd["DiemTBM_4"]));
					vpNT = Convert.ToInt32(rd["viphamNT"]);
					vpXH = Convert.ToInt32(rd["viphamXH"]);
				}
				await rd.CloseAsync();
				string sqlPrev = "SELECT TOP 1 DiemTBM_4 FROM LUUTRUDIEMSV WHERE MSSV=@m " + (namInt.HasValue ? "AND (NamHoc<@n OR (NamHoc=@n AND HocKi<@h))" : "") + " ORDER BY NamHoc DESC, HocKi DESC";
				using SqlCommand cmd2 = new SqlCommand(sqlPrev, con);
				cmd2.Parameters.AddWithValue("@m", mssv.Trim());
				if (namInt.HasValue)
				{
					cmd2.Parameters.AddWithValue("@n", namInt.Value);
				}
				cmd2.Parameters.AddWithValue("@h", hocKi);
				object prev = await cmd2.ExecuteScalarAsync();
				if (prev != null && prev != DBNull.Value)
				{
					prevGpa4 = Convert.ToDouble(prev);
					hasPrev = true;
				}
			}
			catch
			{
			}
			string tag = (maSo ?? string.Empty).Trim().ToUpperInvariant();
			string name = tenTc ?? string.Empty;
			if (tag.Contains("HOC_LUC") || tag.Contains("GPA") || HasKeyword(name, new string[3] { "hoc luc", "hoc tap", "hoc van" }))
			{
				if (max <= 0)
				{
					max = 10;
				}
				int pts = ((gpa4 >= 3.6) ? max : ((gpa4 >= 3.2) ? ((int)Math.Round((double)max * 0.9)) : ((gpa4 >= 2.5) ? ((int)Math.Round((double)max * 0.8)) : ((gpa4 >= 2.0) ? ((int)Math.Round((double)max * 0.6)) : 0))));
				return Clamp(pts);
			}
			if (tag.Contains("CAI_THIEN") || tag.Contains("IMPROVE") || HasKeyword(name, new string[2] { "cai thien", "tien bo" }))
			{
				if (!hasPrev)
				{
					return 0;
				}
				double delta = gpa4 - prevGpa4;
				if (delta <= 0.0)
				{
					return 0;
				}
				int pts2 = 5;
				if (max > 0)
				{
					pts2 = Math.Min(pts2, max);
				}
				return Clamp(pts2);
			}
			if (tag.Contains("VP_NT") || HasKeyword(name, new string[2] { "vi pham noi quy", "vi pham nha truong" }))
			{
				if (max <= 0)
				{
					max = 10;
				}
				int deduction = 5 * Math.Max(0, vpNT);
				int pts3 = Math.Max(0, max - deduction);
				return Clamp(pts3);
			}
			if (tag.Contains("VP_XH") || HasKeyword(name, new string[2] { "vi pham xa hoi", "vi pham phap luat" }))
			{
				if (max <= 0)
				{
					max = 10;
				}
				int deduction2 = 5 * Math.Max(0, vpXH);
				int pts4 = Math.Max(0, max - deduction2);
				return Clamp(pts4);
			}
			return 0;
			int Clamp(int v)
			{
				return Math.Max(0, (max <= 0) ? v : Math.Min(v, max));
			}
		}
		static string ComputeVerdict(double? weighted)
		{
			if (!weighted.HasValue)
			{
				return "ManualReview";
			}
			if (weighted.Value >= 0.85)
			{
				return "Approved";
			}
			if (weighted.Value >= 0.5)
			{
				return "ManualReview";
			}
			return "Rejected";
		}
		static string DetectContentType(byte[] fileBytes, string fileName)
		{
			string result = "application/octet-stream";
			if (fileBytes.Length >= 4)
			{
				if (fileBytes[0] == byte.MaxValue && fileBytes[1] == 216)
				{
					result = "image/jpeg";
				}
				else if (fileBytes[0] == 137 && fileBytes[1] == 80 && fileBytes[2] == 78 && fileBytes[3] == 71)
				{
					result = "image/png";
				}
				else if (fileBytes.Length >= 8 && fileBytes[4] == 102 && fileBytes[5] == 116 && fileBytes[6] == 121 && fileBytes[7] == 112)
				{
					result = "video/mp4";
				}
				else if (fileBytes.Length >= 4 && fileBytes[0] == 82 && fileBytes[1] == 73 && fileBytes[2] == 70 && fileBytes[3] == 70)
				{
					result = "video/webm";
				}
				else if (fileBytes.Length >= 4 && fileBytes[0] == 26 && fileBytes[1] == 69 && fileBytes[2] == 223 && fileBytes[3] == 163)
				{
					result = "video/webm";
				}
				else if (fileBytes[0] == 37 && fileBytes[1] == 80 && fileBytes[2] == 68 && fileBytes[3] == 70)
				{
					result = "application/pdf";
				}
			}
			return result;
		}
		static string FormatNamHoc(object? year, int? semester)
		{
			if (year == null)
			{
				return "";
			}
			if (year is string text && text.Contains("-"))
			{
				return text;
			}
			if (int.TryParse(year?.ToString(), out var result))
			{
				int value = result + 1;
				return $"{result}-{value}";
			}
			return year?.ToString() ?? "";
		}
		static async Task<DateTime?> GetDeadlineAsync(SqlConnection con, string namHoc, int hocKi)
		{
			try
			{
				using SqlCommand cmd = new SqlCommand("SELECT TOP 1 SemesterEndDate FROM SystemSettings WHERE Id=1", con);
				object result = await cmd.ExecuteScalarAsync();
				if (result != null && result != DBNull.Value)
				{
					return Convert.ToDateTime(result);
				}
				return null;
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine("[ERROR] GetDeadlineAsync: " + ex4.Message);
				return null;
			}
		}
		static async Task<HashSet<string>> GetLecturerClassesByLopCVAsync(SqlConnection con, string userId)
		{
			HashSet<string> result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
			if (string.IsNullOrWhiteSpace(userId))
			{
				return result;
			}
			HashSet<string> ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { userId.Trim() };
			try
			{
				List<Dictionary<string, object?>> tkRows = await QueryAsync(con, "SELECT TOP 1 MaCaNhan FROM TK WHERE MaCaNhan=@id OR TenTK=@id", new SqlParameter[1]
				{
					new SqlParameter("@id", userId.Trim())
				});
				if (tkRows.Count > 0)
				{
					object mcV;
					string mc = ((!tkRows[0].TryGetValue("MaCaNhan", out mcV)) ? null : mcV?.ToString());
					if (!string.IsNullOrWhiteSpace(mc))
					{
						ids.Add(mc.Trim());
					}
				}
			}
			catch
			{
			}
			List<SqlParameter> prms = new List<SqlParameter>();
			List<string> conds = new List<string>();
			int i = 0;
			foreach (string id in ids)
			{
				string pn = "@mc" + i++;
				prms.Add(new SqlParameter(pn, id));
				conds.Add("UPPER(GV.MaCaNhan) = UPPER(" + pn + ")");
			}
			if (conds.Count == 0)
			{
				return result;
			}
			foreach (Dictionary<string, object> r in await QueryAsync(con, "SELECT GV.LopCV\r\nFROM GiangVien GV\r\nWHERE (" + string.Join(" OR ", conds) + ") AND GV.LopCV IS NOT NULL AND LTRIM(RTRIM(GV.LopCV)) <> ''", prms.ToArray()))
			{
				object v;
				string lop = ((!r.TryGetValue("LopCV", out v)) ? null : v?.ToString());
				if (!string.IsNullOrWhiteSpace(lop))
				{
					result.Add(lop.Trim());
				}
				v = null;
			}
			return result;
		}
		static string GetMimeType(byte[] data)
		{
			if (data.Length >= 4)
			{
				if (data[0] == byte.MaxValue && data[1] == 216)
				{
					return "image/jpeg";
				}
				if (data[0] == 137 && data[1] == 80)
				{
					return "image/png";
				}
				if (data[0] == 71 && data[1] == 73)
				{
					return "image/gif";
				}
				if (data[0] == 66 && data[1] == 77)
				{
					return "image/bmp";
				}
				if (data[0] == 82 && data[1] == 73)
				{
					return "image/webp";
				}
				if ((data[0] == 73 && data[1] == 73) || (data[0] == 77 && data[1] == 77))
				{
					return "image/tiff";
				}
				if (data.Length >= 12 && data[4] == 102 && data[5] == 116 && data[6] == 121 && data[7] == 112)
				{
					string text = Encoding.ASCII.GetString(data, 8, 4);
					if (text.Contains("heic") || text.Contains("heix") || text.Contains("hevc") || text.Contains("hevx"))
					{
						if (text.Contains("heic") || text.Contains("heix"))
						{
							return "image/heic";
						}
						return "image/hevc";
					}
				}
			}
			return "image/jpeg";
		}
		static async Task<(int Year, int Semester)> GetSystemYearSemesterAsync(SqlConnection con)
		{
			DateTime today = DateTime.Now;
			int currentMonth = today.Month;
			int currentYear = today.Year;
			int semester;
			int academicYear;
			if (currentMonth >= 9)
			{
				semester = 1;
				academicYear = currentYear + 1;
			}
			else
			{
				semester = 2;
				academicYear = currentYear;
			}
			try
			{
				using SqlCommand cmd = new SqlCommand("SELECT TOP 1 UseAutoYearSemester FROM SystemSettings ORDER BY Id", con);
				using SqlDataReader rd = await cmd.ExecuteReaderAsync();
				if (await rd.ReadAsync())
				{
					bool useAuto = true;
					if (!rd.IsDBNull(0))
					{
						useAuto = Convert.ToBoolean(rd["UseAutoYearSemester"]);
					}
					if (!useAuto)
					{
						await rd.CloseAsync();
						using SqlCommand cmd2 = new SqlCommand("SELECT TOP 1 ISNULL(CurrentYear,@y) AS Y, ISNULL(CurrentSemester,@s) AS S FROM SystemSettings ORDER BY Id", con);
						cmd2.Parameters.AddWithValue("@y", academicYear);
						cmd2.Parameters.AddWithValue("@s", semester);
						using SqlDataReader rd2 = await cmd2.ExecuteReaderAsync();
						if (await rd2.ReadAsync())
						{
							academicYear = Convert.ToInt32(rd2["Y"]);
							semester = Convert.ToInt32(rd2["S"]);
						}
					}
				}
			}
			catch
			{
			}
			return (Year: academicYear, Semester: semester);
		}
		static string? GetUserName(HttpContext ctx)
		{
			try
			{
				if (ctx?.User?.Identity?.Name != null)
				{
					return ctx.User.Identity.Name;
				}
				Claim claim = ctx?.User?.FindFirst((Claim c) => c.Type == "name" || c.Type == "sub" || c.Type == "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name");
				if (claim != null)
				{
					return claim.Value;
				}
				StringValues value = default(StringValues);
				if (ctx != null && ctx.Request?.Headers.TryGetValue("X-User-Name", out value) == true)
				{
					return value.FirstOrDefault();
				}
				return null;
			}
			catch
			{
				return null;
			}
		}
		static bool HasKeyword(string s, params string[] kws)
		{
			string text = RemoveDiacritics(s ?? string.Empty).ToLowerInvariant();
			foreach (string text2 in kws)
			{
				string value = RemoveDiacritics(text2).ToLowerInvariant();
				if (text.Contains(value))
				{
					return true;
				}
			}
			return false;
		}
		static (string Hash, string Salt, string Algo) HashPassword(string password, int iterations = 100000)
		{
			using RandomNumberGenerator randomNumberGenerator = RandomNumberGenerator.Create();
			byte[] array = new byte[16];
			randomNumberGenerator.GetBytes(array);
			using Rfc2898DeriveBytes rfc2898DeriveBytes = new Rfc2898DeriveBytes(password, array, iterations, HashAlgorithmName.SHA256);
			byte[] bytes = rfc2898DeriveBytes.GetBytes(32);
			string item = Convert.ToBase64String(array);
			string item2 = Convert.ToBase64String(bytes);
			string item3 = $"PBKDF2-SHA256:{iterations}:32";
			return (Hash: item2, Salt: item, Algo: item3);
		}
		static async Task<bool> IsAdminAsync(SqlConnection con, string? userId)
		{
			if (string.IsNullOrWhiteSpace(userId))
			{
				return false;
			}
			try
			{
				List<Dictionary<string, object?>> rows = await QueryAsync(con, "SELECT TOP 1 MaQT FROM TK WHERE MaCaNhan=@id OR TenTK=@id", new SqlParameter[1]
				{
					new SqlParameter("@id", userId.Trim())
				});
				if (rows.Count == 0)
				{
					return false;
				}
				object v;
				string maqt = ((!rows[0].TryGetValue("MaQT", out v)) ? null : v?.ToString());
				return string.Equals(maqt, "ADMIN", StringComparison.OrdinalIgnoreCase) || string.Equals(maqt, "QLADMIN", StringComparison.OrdinalIgnoreCase);
			}
			catch
			{
				return false;
			}
		}
		static bool IsValidMedia(string path)
		{
			ProcessStartInfo startInfo = new ProcessStartInfo("ffprobe", "-v error -show_format -show_streams -of json \"" + path + "\"")
			{
				RedirectStandardOutput = true,
				RedirectStandardError = true,
				UseShellExecute = false,
				CreateNoWindow = true
			};
			using Process process = Process.Start(startInfo);
			string value = process.StandardOutput.ReadToEnd();
			string value2 = process.StandardError.ReadToEnd();
			process.WaitForExit(5000);
			bool flag = process.ExitCode == 0 && !string.IsNullOrWhiteSpace(value);
			if (!flag)
			{
				Console.WriteLine($"[FFPROBE][INVALID] path='{path}' exit={process.ExitCode} err='{value2}'");
			}
			return flag;
		}
		static async Task LogAsync(HttpContext? ctx, SqlConnection con, string action, string? maTkOverride = null, string? category = null, string? details = null)
		{
			try
			{
				using (SqlCommand ensure = new SqlCommand("IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserLog' AND xtype='U')\r\nBEGIN\r\n    CREATE TABLE UserLog (\r\n        Id INT IDENTITY PRIMARY KEY,\r\n        MaTK NVARCHAR(50),\r\n        Action NVARCHAR(255),\r\n        IPAddress NVARCHAR(50),\r\n        UserAgent NVARCHAR(255),\r\n        Category NVARCHAR(50) NULL,\r\n        Details NVARCHAR(1000) NULL,\r\n        ThoiGian DATETIME DEFAULT GETDATE()\r\n    )\r\nEND\r\n-- Add new columns if missing (safe idempotent)\r\nIF COL_LENGTH('UserLog','Category') IS NULL ALTER TABLE UserLog ADD Category NVARCHAR(50) NULL;\r\nIF COL_LENGTH('UserLog','Details') IS NULL ALTER TABLE UserLog ADD Details NVARCHAR(1000) NULL;", con))
				{
					await ensure.ExecuteNonQueryAsync();
				}
				string ip = null;
				string ua = null;
				string maHeader = null;
				if (ctx != null)
				{
					ip = ctx.Request.Headers["X-Forwarded-For"].FirstOrDefault() ?? ctx.Connection.RemoteIpAddress?.ToString();
					ua = ctx.Request.Headers["User-Agent"].ToString();
					maHeader = ctx.Request.Headers["X-User"].ToString();
				}
				string ma = ((!string.IsNullOrWhiteSpace(maTkOverride)) ? maTkOverride : maHeader);
				Console.WriteLine($"[UserLog] action='{action}', user='{ma}', ip='{ip}'");
				using SqlCommand cmd = new SqlCommand("INSERT INTO UserLog (MaTK, Action, IPAddress, UserAgent, Category, Details) VALUES (@ma, @ac, @ip, @ua, @cat, @det)", con);
				cmd.Parameters.Add(new SqlParameter("@ma", ((object)ma) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@ac", action));
				cmd.Parameters.Add(new SqlParameter("@ip", ((object)ip) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@ua", ((object)ua) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@cat", ((object)category) ?? ((object)DBNull.Value)));
				cmd.Parameters.Add(new SqlParameter("@det", ((object)details) ?? ((object)DBNull.Value)));
				await cmd.ExecuteNonQueryAsync();
			}
			catch (Exception ex3)
			{
				Exception ex4 = ex3;
				Console.WriteLine($"[UserLog][ERROR] action='{action}' err='{ex4.Message}'");
			}
		}
		static async Task<List<Dictionary<string, object?>>> QueryAsync(SqlConnection con, string sql, params SqlParameter[] prms)
		{
			using SqlCommand cmd = new SqlCommand(sql, con);
			if (prms != null && prms.Length != 0)
			{
				cmd.Parameters.AddRange(prms);
			}
			using SqlDataReader rd = await cmd.ExecuteReaderAsync();
			List<Dictionary<string, object?>> list = new List<Dictionary<string, object>>();
			while (await rd.ReadAsync())
			{
				Dictionary<string, object?> row = new Dictionary<string, object>();
				for (int i = 0; i < rd.FieldCount; i++)
				{
					row[rd.GetName(i)] = (rd.IsDBNull(i) ? null : rd.GetValue(i));
				}
				list.Add(row);
			}
			return list;
		}
		static string RemoveDiacritics(string text)
		{
			if (string.IsNullOrWhiteSpace(text))
			{
				return string.Empty;
			}
			string text2 = text.Normalize(NormalizationForm.FormD);
			StringBuilder stringBuilder = new StringBuilder();
			string text3 = text2;
			foreach (char c in text3)
			{
				UnicodeCategory unicodeCategory = CharUnicodeInfo.GetUnicodeCategory(c);
				if (unicodeCategory != UnicodeCategory.NonSpacingMark)
				{
					stringBuilder.Append(c);
				}
			}
			return stringBuilder.ToString().Normalize(NormalizationForm.FormC);
		}
		static async Task<int> ResolveEvidencePointsAsync(SqlConnection con, Guid evidenceId)
		{
			string actName = null;
			using (SqlCommand sel = new SqlCommand("SELECT TOP 1 ActivityName FROM dbo.Evidence WHERE EvidenceId=@id", con))
			{
				sel.Parameters.AddWithValue("@id", evidenceId);
				actName = (await sel.ExecuteScalarAsync())?.ToString();
			}
			if (string.IsNullOrWhiteSpace(actName))
			{
				return 5;
			}
			using (SqlCommand getByName = new SqlCommand("SELECT TOP 1 DiemRL FROM dbo.HoatDongTruong WHERE TenHD=@n", con))
			{
				getByName.Parameters.AddWithValue("@n", actName.Trim());
				object r = await getByName.ExecuteScalarAsync();
				if (r != null && r != DBNull.Value && int.TryParse(r.ToString(), out var ptsByName))
				{
					return ptsByName;
				}
			}
			using (SqlCommand getById = new SqlCommand("SELECT TOP 1 DiemRL FROM dbo.HoatDongTruong WHERE MaHD=@m", con))
			{
				getById.Parameters.AddWithValue("@m", actName.Trim());
				object r2 = await getById.ExecuteScalarAsync();
				if (r2 != null && r2 != DBNull.Value && int.TryParse(r2.ToString(), out var ptsById))
				{
					return ptsById;
				}
			}
			return 5;
		}
		static bool VerifyPassword(string password, string hashB64, string saltB64, string algo)
		{
			try
			{
				int result = 100000;
				int result2 = 32;
				HashAlgorithmName hashAlgorithm = HashAlgorithmName.SHA256;
				if (!string.IsNullOrWhiteSpace(algo))
				{
					string[] array = algo.Split(':');
					if (array.Length >= 3)
					{
						int.TryParse(array[1], out result);
						int.TryParse(array[2], out result2);
						hashAlgorithm = (array[0].Contains("SHA512") ? HashAlgorithmName.SHA512 : HashAlgorithmName.SHA256);
					}
				}
				byte[] salt = Convert.FromBase64String(saltB64);
				using Rfc2898DeriveBytes rfc2898DeriveBytes = new Rfc2898DeriveBytes(password, salt, result, hashAlgorithm);
				byte[] bytes = rfc2898DeriveBytes.GetBytes(result2);
				string s = Convert.ToBase64String(bytes);
				return CryptographicOperations.FixedTimeEquals(Convert.FromBase64String(hashB64), Convert.FromBase64String(s));
			}
			catch
			{
				return false;
			}
		}
		static string clamp(string? s, int max)
		{
			return string.IsNullOrEmpty(s) ? "" : ((s.Length <= max) ? s : s.Substring(0, max));
		}
		static int toInt(object? v)
		{
			int result;
			return int.TryParse(v?.ToString(), out result) ? result : 0;
		}
	}
}



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate0<T1, T2, T3, T4, T5, TResult>(T1 arg1, T2 arg2, T3 arg3, T4 arg4, T5 arg5) where T1 : allows ref struct where T2 : allows ref struct where T3 : allows ref struct where T4 : allows ref struct where T5 : allows ref struct where TResult : allows ref struct;



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate1<T1, TResult>(T1 arg) where T1 : allows ref struct where TResult : allows ref struct;



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate10<T1, T2, TResult>(T1 arg1, T2 arg2) where T1 : allows ref struct where T2 : allows ref struct where TResult : allows ref struct;



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate2<T1, T2, TResult>(T1 arg1, T2 arg2) where T1 : allows ref struct where T2 : allows ref struct where TResult : allows ref struct;



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate3<T1, T2, T3, TResult>(T1 arg1, T2 arg2, T3 arg3) where T1 : allows ref struct where T2 : allows ref struct where T3 : allows ref struct where TResult : allows ref struct;



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate4<T1, T2, T3, TResult>(T1 arg1, T2 arg2, T3 arg3) where T1 : allows ref struct where T2 : allows ref struct where T3 : allows ref struct where TResult : allows ref struct;



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate5<T1, T2, T3, T4, TResult>(T1 arg1, T2 arg2, T3 arg3, T4 arg4) where T1 : allows ref struct where T2 : allows ref struct where T3 : allows ref struct where T4 : allows ref struct where TResult : allows ref struct;



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate6<T1, T2, T3, T4, TResult>(T1 arg1, T2 arg2, T3 arg3, T4 arg4) where T1 : allows ref struct where T2 : allows ref struct where T3 : allows ref struct where T4 : allows ref struct where TResult : allows ref struct;



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate7<T1, T2, TResult>(T1 arg1, T2 arg2) where T1 : allows ref struct where T2 : allows ref struct where TResult : allows ref struct;



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate8<T1, T2, T3, T4, T5, TResult>(T1 arg1, T2 arg2, T3 arg3, T4 arg4, T5 arg5) where T1 : allows ref struct where T2 : allows ref struct where T3 : allows ref struct where T4 : allows ref struct where T5 : allows ref struct where TResult : allows ref struct;



[CompilerGenerated]
internal delegate TResult _003C_003Ef__AnonymousDelegate9<T1, T2, T3, TResult>(T1 arg1, T2 arg2, T3 arg3) where T1 : allows ref struct where T2 : allows ref struct where T3 : allows ref struct where TResult : allows ref struct;


public record AdminResetPasswordDto(string NewPassword);


public class AttendanceAnalyzeResponse
{
	public double face_score { get; set; }

	public double device_score { get; set; }

	public double weighted_score { get; set; }

	public string verdict { get; set; } = string.Empty;
}



public record BulkIdsDto(List<int> Ids);



public record BulkImportReq(List<DiemDto> records, string mode);



public record BulkModerateDto(List<int> Ids, string? Reason);


public record ChangePasswordDto(string? OldPassword, string NewPassword);



public record CheckExistsReq(List<DiemDto> records);


public record ClientLogDto(string? ActionCode, string? Category, string? Details);


public record CreateNhomTieuChiDto(string TenNhom, int? DiemToiDa, string? MaSo);


public record CreateTieuChiConDto(int MaNhom, string TenTC, int DiemToiDa, bool? CoMinhChung, bool? AllowSelfEval, string? MaSo);


public record DiemDto(string MSSV, int? NamHoc, int? HocKi, decimal? DiemTBM_4 = null, decimal? DiemTBM_10 = null, int? TongDRL = null, string? Khoas = null, int? viphamNT = null, int? viphamXH = null, bool? TGNCKH = null);



internal static class EvidenceLogThrottler
{
	public static DateTime LastErrorUtc = DateTime.MinValue;

	public static bool ShouldLog()
	{
		return DateTime.UtcNow - LastErrorUtc > TimeSpan.FromSeconds(30L);
	}

	public static void MarkLogged()
	{
		LastErrorUtc = DateTime.UtcNow;
	}
}



public record FacultyBulkApproveDto(string MaKhoa, string? NamHoc, int? HocKi, List<int>? Ids);



public record FacultyBulkModerateDto(string MaKhoa, string? NamHoc, int? HocKi, List<int>? Ids, string? Reason);


public record GiangVienDetailDto(string? TenGV, string? SDT, string? Email, string? MaKH, string? LopCV, string? DiaChi);


public record GiangVienInfoDto(string MaCaNhan, string TenGV, string? SDT, string? Email, string? MaKH, string? LopCV, string? DiaChi);



public record HoatDongDto(string MaHD, string TenHD, int DiemRL, DateTime NgayBD, DateTime NgayKT, int? SoSvDK = null, string? NDHD = null, string? DiaDiem = null, string? TUKHOA = null);


public record HoatDongTcDto(string TenHD, int? SoDiemToiDa, bool? TDTT, string? IDHoatDong);


public record KhoaDto(string MaKH, string TenKhoa);


public record LoginDto(string TenTK, string MatKhau);


public record LopDto(string MaLop, string TenLop, string MaKH);


public record PointSettingsDto(int? MaxPoints, int? MinPoints, int? ExcellentPoints, int? GoodPoints, int? FairPoints, int? AveragePoints, int? WeakPoints, int? PoorPoints);


public record RegisterActivityDto(string MaHD, string MSSV);


public record SinhVienDetailDto(string? TenSV, string? SDT, string? Email, string? DiaChi, string? MaLop, string? MaKH, string? MaKhoa, bool? TVCLBKhoa, bool? TVCLBTruong, bool? CBLop);


public record SinhVienInfoDto(string MSSV, string TenSV, string? SDT, string? Email, string? DiaChi, string? MaLop, string? MaKH, string? MaKhoa, bool? TVCLBKhoa, bool? TVCLBTruong, bool? CBLop);



public class StudentFaceData
{
	public byte[] FaceEncoding { get; set; } = Array.Empty<byte>();

	public byte[] FaceImage { get; set; } = Array.Empty<byte>();
}



public record SystemSettingsDto(string? SchoolName, int? CurrentYear, int? CurrentSemester, DateTime? EvalStartDate, DateTime? SemesterEndDate, bool? AutoPointEnabled, bool? AutoEnable_ClassOfficer, bool? AutoEnable_Research, bool? AutoEnable_Improvement, bool? AutoEnable_AcademicLevel, bool? AutoEnable_Violations, bool? UseAutoYearSemester);


public record UpdateCBLopDto(bool CBLop);


public record UpdateItemDto(int MaTC, int? ItemId, int DiemSV, string? Note);


public record UpdateNhomTieuChiDto(string? TenNhom, int? DiemToiDa, string? MaSo);


public record UpdateSinhVienDto(string? SDT, string? DiaChi);


public record UpdateTieuChiConDto(string? TenTC, int? DiemToiDa, bool? CoMinhChung, int? MaNhom, bool? AllowSelfEval, string? MaSo);


public record UserCreateDto(string MaCaNhan, string TenTK, string MatKhau, string TenNguoiDung, string ChucVu, string MaQT);


public record UserUpdateDto(string? TenTK, string? MatKhau, string? TenNguoiDung, string? ChucVu, string? MaQT, string? MaCaNhan);


public record VideoAnalysisRequest(string ActivityName, string ActivityDescription);


public record VideoAnalysisResponse(bool IsValid, string Message, int ConfidenceScore, string[] DetectedActivities, string[] Suggestions, string AnalysisDetails);




