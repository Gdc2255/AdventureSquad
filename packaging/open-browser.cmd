@echo off
rem Wait for the server, then open the browser.
rem "ping -n 3" is about two seconds and works everywhere
rem (unlike "timeout", which some systems lack).
rem ASCII only: cmd.exe reads batch files with the system OEM codepage,
rem so non-ASCII text here can break the script.
ping -n 3 127.0.0.1 >nul
start "" http://127.0.0.1:%1
