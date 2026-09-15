@echo off
rem ------------------------------------------------------------
rem  start a tiny local web server so mortar-map.html can load
rem  the local tiles/ folder reliably (file:// often blocks them)
rem ------------------------------------------------------------
setlocal
set "ROOT=%~dp0"
set "PORT=8099"

where python >nul 2>nul
if %errorlevel%==0 (
  echo  serving %ROOT%  at  http://127.0.0.1:%PORT%/mortar-map.html
  echo  Ctrl+C to stop.
  start "" "http://127.0.0.1:%PORT%/mortar-map.html"
  python -m http.server %PORT% --bind 127.0.0.1 --directory "%ROOT%"
  exit /b 0
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo  serving %ROOT%  at  http://127.0.0.1:%PORT%/mortar-map.html
  echo  Ctrl+C to stop.
  start "" "http://127.0.0.1:%PORT%/mortar-map.html"
  py -m http.server %PORT% --bind 127.0.0.1 --directory "%ROOT%"
  exit /b 0
)

echo  [X] python not found. alternatives:
echo      - just double-click mortar-map.html (may need "底图 在线" mode)
echo      - or install python:  winget install python
pause
