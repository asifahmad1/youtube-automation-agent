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

REM Install (or repair) the packages if they are missing. Checking for the
REM dotenv package specifically, so a half-finished earlier install is
REM repaired instead of skipped.
if not exist node_modules\dotenv (
  echo Installing the needed packages. This takes a minute...
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

echo Starting Asif-YouTube-Agent...
node index.js
if errorlevel 1 (
  echo.
  echo  The agent stopped with an error. The message above explains why.
  echo  Full help: open SETUP-GUIDE.md in this folder.
)
echo.
pause
