@echo off
setlocal
title NOVA AI Desktop Companion
cd /d "%~dp0"
echo.
echo  NOVA AI - Desktop Companion
echo  --------------------------
where bun >nul 2>nul
if errorlevel 1 (
  echo Bun is not installed or is not on PATH.
  echo Install Bun from https://bun.sh/ then reopen this file.
  pause
  exit /b 1
)
if not exist "node_modules\edge-tts-universal" (
  echo Installing NOVA dependencies. This may take a few minutes...
  call bun install --frozen-lockfile
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
echo Starting NOVA Desktop Companion...
echo Keep this window open while using NOVA.
echo Copy the pairing token below into NOVA - Desktop Bridge.
echo.
call bun run desktop:companion
echo.
echo NOVA Desktop Companion has stopped.
pause
