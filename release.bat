@echo off
chcp 65001 >nul
title 會計系統 - 一鍵發布

echo ========================================
echo    會計系統 一鍵發布工具
echo ========================================
echo.

REM ===== 檢查 GH_TOKEN =====
if "%GH_TOKEN%"=="" (
  echo [!] 尚未設定 GH_TOKEN
  echo.
  echo 請先到以下網址產生 token^(勾選 repo 權限^):
  echo   https://github.com/settings/tokens
  echo.
  set /p TOKEN=請輸入 GitHub Token: 
  if "%TOKEN%"=="" (
    echo [X] 沒有輸入 Token^，取消發布
    pause
    exit /b 1
  )
  set GH_TOKEN=%TOKEN%
  setx GH_TOKEN "%TOKEN%" >nul
  echo [OK] 已永久儲存 GH_TOKEN^(下次不用再輸入^)
  echo.
)

REM ===== 顯示目前版本 =====
echo [目前版本]
node -p "require('./package.json').version"
echo.

REM ===== 選擇版本類型 =====
echo 請選擇版本更新類型:
echo   [1] patch - 小幅修正    例如 2.1.4 到 2.1.5
echo   [2] minor - 新增功能    例如 2.1.4 到 2.2.0
echo   [3] major - 重大更新    例如 2.1.4 到 3.0.0
echo   [4] 不變更版本 - 直接重新打包上傳
echo.
set /p CHOICE=請輸入選項 [1/2/3/4]^(預設 1^): 
if "%CHOICE%"=="" set CHOICE=1

if "%CHOICE%"=="1" set BUMP=patch
if "%CHOICE%"=="2" set BUMP=minor
if "%CHOICE%"=="3" set BUMP=major
if "%CHOICE%"=="4" set BUMP=

echo.

REM ===== 檢查 git 狀態 =====
echo [檢查] git 狀態...
git status --porcelain > temp_git_status.txt 2>nul
if errorlevel 1 (
  echo [!] 此目錄不是 git 專案^，將跳過 git 同步
  set SKIP_GIT=1
) else (
  set SKIP_GIT=0
  for /f %%i in ('find /c /v "" ^< temp_git_status.txt') do set CHANGES=%%i
)
del temp_git_status.txt >nul 2>nul

if "%SKIP_GIT%"=="0" (
  if not "%CHANGES%"=="0" (
    echo [!] 目前有 %CHANGES% 個未 commit 的變更:
    git status --short
    echo.
    set /p PROCEED=是否一起 commit 這些變更? [Y/N]^(預設 Y^): 
    if /i "%PROCEED%"=="N" (
      echo [X] 使用者取消
      pause
      exit /b 1
    )
  ) else (
    echo [OK] git 工作區乾淨
  )
)
echo.

REM ===== 清除舊 dist =====
echo [1/4] 清除舊的 dist 資料夾...
if exist dist rmdir /s /q dist
echo [OK] 已清除
echo.

REM ===== 版本號更新 =====
if not "%BUMP%"=="" (
  echo [2/4] 更新版本號 ^(%BUMP%^)...
  call npm version %BUMP% --no-git-tag-version
  if errorlevel 1 (
    echo [X] 版本號更新失敗
    pause
    exit /b 1
  )
  for /f %%i in ('node -p "require('./package.json').version"') do set NEW_VERSION=%%i
  echo [OK] 版本號已更新為: %NEW_VERSION%
) else (
  for /f %%i in ('node -p "require('./package.json').version"') do set NEW_VERSION=%%i
  echo [2/4] 不變更版本號^(目前 %NEW_VERSION%^)
)
echo.

REM ===== 打包並上傳 =====
echo [3/4] 打包並上傳到 GitHub Release...
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo ========================================
  echo   [X] 打包失敗!
  echo ========================================
  pause
  exit /b 1
)
echo.
echo [OK] 打包與上傳完成
echo.

REM ===== git 同步 =====
echo [4/4] 同步到 git...
if "%SKIP_GIT%"=="1" (
  echo [!] 跳過 git 同步^(非 git 專案^)
  goto :done
)

git add -A
git commit -m "v%NEW_VERSION%"
if errorlevel 1 (
  echo [!] commit 失敗^(可能沒有變更^)
) else (
  echo [OK] 已 commit: v%NEW_VERSION%
)

git push
if errorlevel 1 (
  echo [!] push 失敗^，請手動執行: git push
) else (
  echo [OK] 已 push 到 GitHub
)

:done
echo.
echo ========================================
echo   [OK] 發布完成!
echo ========================================
echo.
echo GitHub Release:
echo   https://github.com/hyc628/SYSTEM/releases
echo.
echo 版本: %NEW_VERSION%
echo.
pause