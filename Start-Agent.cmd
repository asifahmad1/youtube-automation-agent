@echo off
REM Start-Agent.cmd — double-click this file to run Asif-YouTube-Agent.
REM It installs the needed packages on the first run, then shows the menu.
cd /d "%~dp0"
title Asif-YouTube-Agent

node --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Node.js is not installed on this computer.
  echo  Please install it first: see SETUP-GUIDE.md, step 1.
  echo  Download: https://nodejs.org (choose LTS)
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing the needed packages. This takes a minute...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  The install did not finish. Check your internet connection and try again.
    echo.
    pause
    exit /b 1
  )
)

node index.js
echo.
pause
