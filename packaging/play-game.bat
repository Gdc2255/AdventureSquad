@echo off
rem ============================================================
rem  AdventureSquad 启动器
rem  游戏资源需要通过 http 读取（浏览器的 file:// 不允许），
rem  所以这里起一个本地服务器再打开浏览器。
rem  优先用 Node.js，没有就退到 Python。
rem ============================================================
chcp 65001 >nul
title AdventureSquad
cd /d "%~dp0"

set PORT=8137

where node >nul 2>nul
if %errorlevel%==0 goto node

where py >nul 2>nul
if %errorlevel%==0 goto py

where python >nul 2>nul
if %errorlevel%==0 goto python

echo.
echo   没有找到 Node.js 或 Python，无法启动本地服务器。
echo.
echo   请安装其中任意一个后重新运行本文件：
echo     Node.js  https://nodejs.org
echo     Python  https://www.python.org
echo.
pause
exit /b 1

:node
start "" /b cmd /c "timeout /t 2 /nobreak >nul ^& start "" http://localhost:%PORT%/"
node server.js
goto end

:py
start "" /b cmd /c "timeout /t 2 /nobreak >nul ^& start "" http://localhost:%PORT%/"
py -m http.server %PORT%
goto end

:python
start "" /b cmd /c "timeout /t 2 /nobreak >nul ^& start "" http://localhost:%PORT%/"
python -m http.server %PORT%
goto end

:end
echo.
echo   服务已停止。
pause
