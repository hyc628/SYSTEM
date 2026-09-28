@echo off
chcp 65001 >nul
echo ========================================
echo   會計系統 - 自動打包工具
echo ========================================
echo.

echo [1/3] 關閉執行中的會計系統...
taskkill /F /IM "會計系統.exe" 2>nul
taskkill /F /IM "electron.exe" 2>nul
timeout /t 2 /nobreak >nul

echo [2/3] 清除舊的 dist 資料夾...
rmdir /s /q "dist" 2>nul
timeout /t 1 /nobreak >nul

echo [3/3] 開始打包...
call npm run build

echo.
echo ========================================
echo   打包完成！請查看 dist 資料夾
echo ========================================
pause