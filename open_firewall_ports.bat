@echo off
echo Opening ports for QLDRL API...

REM Open port 5204 (HTTP)
netsh advfirewall firewall add rule name="QLDRL API HTTP" dir=in action=allow protocol=TCP localport=5204

REM Open port 7118 (HTTPS)
netsh advfirewall firewall add rule name="QLDRL API HTTPS" dir=in action=allow protocol=TCP localport=7118

echo Ports opened successfully!
echo.
echo Your IP addresses:
ipconfig | findstr "IPv4"
echo.
echo Access URLs:
echo - HTTP: http://[YOUR_IP]:5204
echo - HTTPS: https://[YOUR_IP]:7118
echo.
pause
