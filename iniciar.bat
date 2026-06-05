@echo off
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo Instalando dependencias...
call npm.cmd install
if errorlevel 1 exit /b 1

echo Compilando...
call npm.cmd run build
if errorlevel 1 exit /b 1

echo Iniciando en http://localhost:3000
call npm.cmd run start
