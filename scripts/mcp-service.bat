@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0..") do set "ROOT_DIR=%%~fI"
set "ENV_FILE=%ROOT_DIR%\.env"

if exist "%ENV_FILE%" (
  for /f "usebackq eol=# tokens=1* delims==" %%A in ("%ENV_FILE%") do (
    set "ENV_KEY=%%A"
    set "ENV_VALUE=%%B"
    if defined ENV_KEY (
      if "!ENV_KEY:~0,7!"=="export " set "ENV_KEY=!ENV_KEY:~7!"
      if defined ENV_KEY set "!ENV_KEY!=!ENV_VALUE!"
    )
  )
)

set "ACTION=%~1"
set "PORT=%~2"
set "CONFIG_PATH=%~3"

if "%ACTION%"=="" goto :usage
if "%PORT%"=="" (
  if "%MCP_PORT%"=="" (
    set "PORT=3003"
  ) else (
    set "PORT=%MCP_PORT%"
  )
)

if "%MCP_HOST%"=="" (
  set "HOST=127.0.0.1"
) else (
  set "HOST=%MCP_HOST%"
)

if "%MCP_PATH%"=="" (
  set "MCP_HTTP_PATH=/mcp"
) else (
  set "MCP_HTTP_PATH=%MCP_PATH%"
)

if "%NODE_BIN%"=="" (
  set "NODE_BIN=node"
) else (
  set "NODE_BIN=%NODE_BIN%"
)

if "%D365_MCP_HOME%"=="" (
  if "%USERPROFILE%"=="" (
    set "APP_HOME=%ROOT_DIR%\.dynamics-365-mcp"
  ) else (
    set "APP_HOME=%USERPROFILE%\.dynamics-365-mcp"
  )
) else (
  set "APP_HOME=%D365_MCP_HOME%"
)

if "%D365_MCP_RUN_DIR%"=="" (
  set "RUN_DIR=%APP_HOME%\run"
) else (
  set "RUN_DIR=%D365_MCP_RUN_DIR%"
)

if "%D365_MCP_SERVICE_LOG_DIR%"=="" (
  set "LOG_DIR=%APP_HOME%\logs"
) else (
  set "LOG_DIR=%D365_MCP_SERVICE_LOG_DIR%"
)

set "PID_FILE=%RUN_DIR%\dynamics-365-mcp-%PORT%.pid"
set "LOG_FILE=%LOG_DIR%\dynamics-365-mcp-%PORT%.log"
set "ENTRY_FILE=%ROOT_DIR%\dist\index.js"
set "HEALTH_URL=http://%HOST%:%PORT%/health"

if /I "%ACTION%"=="start" goto :start
if /I "%ACTION%"=="stop" goto :stop
if /I "%ACTION%"=="restart" goto :restart
if /I "%ACTION%"=="status" goto :status
goto :usage

:usage
echo Usage: %~nx0 ^<start^|stop^|restart^|status^> [port] [config-path]
exit /b 1

:prepare
if not exist "%RUN_DIR%" mkdir "%RUN_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
exit /b 0

:read_pid
set "PID="
if exist "%PID_FILE%" set /p PID=<"%PID_FILE%"
exit /b 0

:is_running
call :read_pid
if not defined PID exit /b 1
tasklist /FI "PID eq %PID%" | findstr /R /C:" %PID% " >nul
exit /b %ERRORLEVEL%

:wait_for_health
set /A ATTEMPT=0
:wait_loop
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%' | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 exit /b 0
set /A ATTEMPT+=1
if %ATTEMPT% GEQ 20 exit /b 1
timeout /t 1 /nobreak >nul
goto :wait_loop

:start
call :prepare

if not exist "%ENTRY_FILE%" (
  echo Build file not found: %ENTRY_FILE%
  echo Run "npm run build" first.
  exit /b 1
)

call :is_running
if not errorlevel 1 (
  echo Dynamics 365 MCP is already running on port %PORT% ^(PID %PID%^).
  exit /b 0
)

if exist "%PID_FILE%" del "%PID_FILE%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$env:MCP_TRANSPORT = 'http';" ^
  "$env:MCP_PORT = '%PORT%';" ^
  "$env:MCP_HOST = '%HOST%';" ^
  "$env:MCP_PATH = '%MCP_HTTP_PATH%';" ^
  "if ('%CONFIG_PATH%' -ne '') { $env:D365_MCP_CONFIG = '%CONFIG_PATH%' }" ^
  "$command = '%NODE_BIN% dist\index.js >> ""%LOG_FILE%"" 2>&1';" ^
  "$process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $command -WorkingDirectory '%ROOT_DIR%' -WindowStyle Hidden -PassThru;" ^
  "Set-Content -Path '%PID_FILE%' -Value $process.Id;"

call :wait_for_health
if errorlevel 1 (
  echo Dynamics 365 MCP failed to start. Check %LOG_FILE%
  call :read_pid
  if defined PID taskkill /PID %PID% /T /F >nul 2>&1
  if exist "%PID_FILE%" del "%PID_FILE%"
  exit /b 1
)

call :read_pid
echo Dynamics 365 MCP started on http://%HOST%:%PORT%%MCP_HTTP_PATH% ^(PID %PID%^).
echo Health: %HEALTH_URL%
echo Log: %LOG_FILE%
exit /b 0

:stop
call :is_running
if errorlevel 1 (
  echo Dynamics 365 MCP is not running on port %PORT%.
  if exist "%PID_FILE%" del "%PID_FILE%"
  exit /b 0
)

taskkill /PID %PID% /T /F >nul 2>&1
if exist "%PID_FILE%" del "%PID_FILE%"
echo Dynamics 365 MCP stopped on port %PORT%.
exit /b 0

:restart
call :stop
call :start
exit /b 0

:status
call :is_running
if errorlevel 1 (
  echo Dynamics 365 MCP is not running on port %PORT%.
  exit /b 1
)

echo Dynamics 365 MCP is running on port %PORT% ^(PID %PID%^).
echo Health: %HEALTH_URL%
exit /b 0
