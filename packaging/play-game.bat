@echo off
rem ============================================================
rem  AdventureSquad launcher
rem
rem  The game loads its assets over http (browsers block file://),
rem  so this starts a tiny local server and opens the browser.
rem  Node.js is used if available, otherwise Python.
rem
rem  IMPORTANT: keep this file ASCII-only. cmd.exe reads .bat files
rem  with the system OEM codepage, so UTF-8 Chinese text here can
rem  break the script.
rem ============================================================
title AdventureSquad
cd /d "%~dp0"

set PORT=8137

where node >nul 2>&1
if errorlevel 1 goto try_python
goto run_node

:try_python
where py >nul 2>&1
if errorlevel 1 goto try_python3
goto run_py

:try_python3
where python >nul 2>&1
if errorlevel 1 goto no_runtime
goto run_python

rem node 的服务器自己会打开浏览器
:run_node
node server.js %PORT%
goto the_end

rem python 不会开浏览器，用一个单独的脚本延迟两秒再打开
:run_py
start "" /b "%~dp0open-browser.cmd" %PORT%
py -m http.server --bind 127.0.0.1 %PORT%
goto the_end

:run_python
start "" /b "%~dp0open-browser.cmd" %PORT%
python -m http.server --bind 127.0.0.1 %PORT%
goto the_end

:no_runtime
echo.
echo   Neither Node.js nor Python was found.
echo.
echo   The game needs a small local web server. Please install one of:
echo     Node.js    https://nodejs.org
echo     Python     https://www.python.org
echo.
echo   Then run this file again.
echo.
pause
exit /b 1

:the_end
echo.
echo   Server stopped.
pause
