@echo off
rem ------------------------------------------------------------
rem  start a tiny local web server so mortar-map.html can load
rem  the local tiles/ folder reliably (file:// often blocks them)
rem
rem  NOTE 1: keep this file pure ASCII. cmd.exe seeks to "goto"
rem  labels by BYTE OFFSET, but it decodes the file using the OEM
rem  codepage (GBK on zh-CN). UTF-8 Chinese comments make those
rem  offsets drift, cmd lands mid-character and executes garbage.
rem  The original version only had Chinese after all logic, so it
rem  never tripped this. Do not add non-ASCII here.
rem
rem  NOTE 3: pass the root as "%~dp0." not "%~dp0". %~dp0 always
rem  ends with a backslash, so "%ROOT%" becomes "...Artillery\"
rem  and the \" escapes the quote -- the server then receives
rem  ...Artillery" as its root directory and 404s everything.
rem  Appending a dot gives "D:\path\." which resolves correctly.
rem
rem  NOTE 2: do NOT trust "where python". The python.exe shipped
rem  in %LOCALAPPDATA%\Microsoft\WindowsApps is a Microsoft Store
rem  alias: "where" finds it, running it prints "Python was not
rem  found", and the server silently never starts. So actually
rem  run it once to decide. Node is tried first because app/ needs
rem  Node anyway, so it is the more reliable bet.
rem ------------------------------------------------------------
setlocal
set "ROOT=%~dp0"
set "PORT=8099"
set "URL=http://127.0.0.1:%PORT%/mortar-map.html"

rem ---- 1) prefer Node (zero-dep, scripts/serve.js) ----
where node >nul 2>nul
if %errorlevel%==0 (
  echo  serving %ROOT%
  echo  %URL%
  echo  Ctrl+C to stop.
  start "" "%URL%"
  node "%~dp0scripts\serve.js" %PORT% "%~dp0."
  exit /b 0
)

rem ---- 2) fall back to Python, but only if it really runs ----
set "PYEXE="
python -c "pass" >nul 2>nul
if %errorlevel%==0 set "PYEXE=python"
if not defined PYEXE (
  py -c "pass" >nul 2>nul
  if %errorlevel%==0 set "PYEXE=py"
)
if defined PYEXE goto pyserve
goto nopy

:pyserve
echo  serving %ROOT%
echo  %URL%
echo  Ctrl+C to stop.
start "" "%URL%"
%PYEXE% -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0."
exit /b 0

:nopy
echo  [X] No usable Node and no usable Python found.
echo      Options:
echo        - open mortar-map.html directly (switch basemap to "online")
echo        - install Node:   winget install OpenJS.NodeJS
echo        - install Python: winget install python
pause
