@echo off
rem ============================================================
rem  AdventureSquad 安装脚本（由安装包自动调用）
rem  1) restore.cmd 把压平的载荷搬回目录结构，装到 %LOCALAPPDATA%\AdventureSquad
rem  2) 建桌面快捷方式（开始游戏 / 卸载）
rem  3) 在开始菜单里也放一个卸载入口
rem
rem  安装过程**不会删除任何已有文件**（同名文件直接覆盖），
rem  需要清理旧文件请跑桌面上的「卸载 AdventureSquad」。
rem ============================================================
chcp 65001 >nul
setlocal

set TARGET=%LOCALAPPDATA%\AdventureSquad
set PAYLOAD=%~dp0

echo.
echo   正在安装 AdventureSquad ...
echo.

rem ---- 解包并还原目录结构 ----
mkdir "%TARGET%" >nul 2>&1
call "%~dp0restore.cmd" "%TARGET%"

rem ---- 卸载脚本（先关掉游戏窗口，再运行这个）----
rem  注意：删除前会校验路径非空且以 \AdventureSquad 结尾，
rem  避免变量为空时误删到别处。
(
echo @echo off
echo chcp 65001 ^>nul
echo set T=%LOCALAPPDATA%\AdventureSquad
echo echo 正在卸载 AdventureSquad ...
echo if not "%%T%%"=="" goto ok
echo echo 路径异常，已跳过删除。
echo goto fin
echo :ok
echo if "%%T:~-15%%"=="AdventureSquad" rd /s /q "%%T%%"
echo del "%USERPROFILE%\Desktop\AdventureSquad.lnk" ^>nul 2^>nul
echo del "%USERPROFILE%\Desktop\卸载 AdventureSquad.lnk" ^>nul 2^>nul
echo :fin
echo echo 已卸载完成。
echo pause
) > "%TARGET%\uninstall.cmd"

rem ---- 桌面快捷方式 + 开始菜单 ----
powershell -NoProfile -Command ^
 "$ws=New-Object -ComObject WScript.Shell;" ^
 "$d=[Environment]::GetFolderPath('Desktop');" ^
 "$s=$ws.CreateShortcut($d+'\AdventureSquad.lnk');" ^
 "$s.TargetPath='%TARGET%\Game\play-game.bat';" ^
 "$s.WorkingDirectory='%TARGET%\Game';" ^
 "$s.Description='AdventureSquad';" ^
 "$s.Save();" ^
 "$u=$ws.CreateShortcut($d+'\卸载 AdventureSquad.lnk');" ^
 "$u.TargetPath='%TARGET%\uninstall.cmd';" ^
 "$u.WorkingDirectory='%TARGET%';" ^
 "$u.Save();" ^
 "$p=[Environment]::GetFolderPath('Programs');" ^
 "$m=$ws.CreateShortcut($p+'\卸载 AdventureSquad.lnk');" ^
 "$m.TargetPath='%TARGET%\uninstall.cmd';" ^
 "$m.Save();"

echo   安装完成：%TARGET%
echo.
echo   桌面上多了两个图标：
echo     AdventureSquad        双击开始游戏
echo     卸载 AdventureSquad   卸载本程序
echo.
echo   安装目录里的「安装与开发指引.txt」写了怎么玩，
echo   以及怎么用 Cocos Creator 打开源码继续开发。
echo.
timeout /t 6 >nul
endlocal
