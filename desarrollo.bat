@echo off
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo Modo desarrollo - http://localhost:3000
call npm.cmd install
call npm.cmd run dev
