@echo off
setlocal
rem ============================================================
rem  WARDOGS map tiles bulk downloader (aria2c)
rem  List file: scripts\aria2.txt   (URL + dir + out per tile)
rem ============================================================

rem ---- edit these if needed ----
set "PROXY=http://127.0.0.1:1080"
set "PAR=16"
set "ROOT=%~dp0"
rem ------------------------------

set "SCRIPTS=%ROOT%scripts"
set "TILES=%ROOT%tiles"

echo.
echo  WARDOGS map tiles downloader
echo  root : %TILES%
echo  proxy: %PROXY%
echo.

rem 1) refresh the list, skipping tiles that are already on disk
where python >nul 2>nul
if %errorlevel%==0 (
  python "%SCRIPTS%\gen_urls.py" --out "%TILES%"
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    py "%SCRIPTS%\gen_urls.py" --out "%TILES%"
  ) else (
    echo  [i] python not found, using the list as-is.
  )
)

rem 2) need aria2c
where aria2c >nul 2>nul
if not %errorlevel%==0 (
  echo.
  echo  [X] aria2c.exe not found in PATH.
  echo.
  echo      Option A: install it, then re-run this file
  echo          winget install aria2
  echo      Option B: GUI downloader - import  scripts\urls.txt  into
  echo          Motrix / Free Download Manager / IDM
  echo      Option C: run the python downloader instead
  echo          python "%SCRIPTS%\fetch_tiles.py" --out "%TILES%"
  echo.
  pause
  exit /b 1
)

rem 3) download
pushd "%SCRIPTS%"
aria2c -i aria2.txt ^
  --max-concurrent-downloads=%PAR% ^
  --split=1 --min-split-size=1M ^
  --continue=true ^
  --auto-file-renaming=false ^
  --allow-overwrite=false ^
  --all-proxy=%PROXY% ^
  --connect-timeout=15 --timeout=60 ^
  --max-tries=3 --retry-wait=2 ^
  --console-log-level=warn --summary-interval=30 ^
  --file-allocation=none
set "RC=%errorlevel%"
popd

echo.
if "%RC%"=="0" (
  echo  [OK] done. tiles are in: %TILES%
) else (
  echo  [!] aria2 exited with code %RC% - some tiles may be missing.
  echo      just re-run this file, it skips what is already on disk.
)
echo.
pause
