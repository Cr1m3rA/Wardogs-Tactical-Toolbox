@echo off
chcp 65001 >nul
setlocal

REM =====================================================================
REM  WARDOGS Artillery Toolbox - build the single-file exe
REM ---------------------------------------------------------------------
REM  Cross-compiles the MSVC target from inside WSL via cargo-xwin,
REM  so no Visual Studio install is needed.
REM  Output is one WARDOGS-Toolbox.exe with a static CRT: copy it to any
REM  Win10/11 machine and double-click.
REM
REM  First build takes 5-10 min (downloads the Windows SDK headers and all
REM  dependencies); later builds are incremental and much faster.
REM  The target dir lives inside WSL ($HOME/wardogs-target) instead of on
REM  /mnt/d -- compiling over the 9p filesystem is several times slower.
REM
REM  Paths below are derived from this script's own location, so the repo
REM  can be cloned anywhere.
REM
REM  NOTE: keep every message in this file ASCII. cmd.exe re-seeks batch
REM  files byte-wise, and a multi-byte character (Chinese, etc.) makes it
REM  lose sync -- it then executes the tail of a REM line as a command and
REM  reports "is not recognized as an internal or external command".
REM  A UTF-8 BOM does not help. The Chinese docs live in README.md.
REM =====================================================================

REM Folder this script sits in (drop the trailing backslash), then ask WSL
REM to translate that Windows path into a Linux one.
set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"
set "WDIR="
for /f "usebackq delims=" %%i in (`wsl -e bash -lc "wslpath -a -u '%HERE%'" 2^>nul`) do set "WDIR=%%i"
if not defined WDIR goto nowsl

set SRC=%WDIR%/app/src-tauri
set TGT=x86_64-pc-windows-msvc
set NAME=wardogs-toolbox.exe
set OUT=%WDIR%/WARDOGS-Toolbox.exe
set EXE=%~dp0WARDOGS-Toolbox.exe

echo.
echo Repo     %HERE%
echo   -^> WSL %WDIR%
echo.
echo [1/2] Compiling (slow on the first run, please wait)...
echo.

REM llvm-rc / llvm-lib are the MSVC rc.exe / lib.exe equivalents. They ship
REM with Ubuntu's LLVM packages but are not on PATH, and cargo-xwin fails
REM outright if it cannot find them, so link them into ~/.cargo/bin.
REM Do not hardcode the version suffix: distros ship llvm-rc-18 / -19 / -21,
REM and pinning one breaks the build on the next machine.
REM NOTE: no embedded double quotes below -- cmd.exe handles \" unreliably.
wsl -e bash -lc "set -e; mkdir -p ~/.cargo/bin; for t in rc lib; do command -v llvm-$t >/dev/null && continue; f=$(ls /usr/bin/llvm-$t-* 2>/dev/null | sort -V | tail -1); [ -n $f ] && ln -sf $f ~/.cargo/bin/llvm-$t || true; done; cd '%SRC%' && CARGO_TARGET_DIR=$HOME/wardogs-target cargo xwin build --release --target %TGT%"
if errorlevel 1 goto fail

echo.
echo [2/2] Copying the artifact out...
wsl -e bash -lc "cp -f $HOME/wardogs-target/%TGT%/release/%NAME% '%OUT%'"
if errorlevel 1 goto busy

echo.
echo Done: %EXE%
echo (Config and map tiles live next to the exe; copy the whole folder.)
echo.
exit /b 0

:nowsl
echo.
echo WSL not found, or wslpath is unavailable inside it.
echo The build has to run inside WSL -- see "Build environment" in README.md.
echo.
exit /b 1

:busy
echo.
echo Could not overwrite WARDOGS-Toolbox.exe -- it is probably still running.
echo Close the app and run this script again; the compiled binary is already
echo built, so the second run will only redo this copy step.
echo.
exit /b 1

:fail
echo.
echo Build failed. Common causes:
echo   - WSL missing, or no Rust toolchain inside it: see "Build environment"
echo     in README.md
echo   - the first build needs network access to fetch dependencies
echo.
exit /b 1
