@echo off
rem Holt die gemeinsamen Dateien aus dem Dashboard-Ordner nebenan (..\Dashboard).
rem Welche Dateien das sind, steht in gemeinsam.txt. Doppelklick genuegt.
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "QUELLE=..\Dashboard"
if not exist "%QUELLE%\manifest.json" (
  echo Dashboard-Ordner nicht gefunden: %QUELLE%
  echo Er muss direkt neben diesem Ordner liegen.
  pause
  exit /b 1
)
set /a KOPIERT=0
set /a FEHLT=0
for /f "usebackq delims=" %%f in ("gemeinsam.txt") do (
  if exist "%QUELLE%\%%f" (
    if not exist "%%~dpf" mkdir "%%~dpf"
    copy /y "%QUELLE%\%%f" "%%f" >nul
    set /a KOPIERT+=1
  ) else (
    echo FEHLT im Dashboard: %%f
    set /a FEHLT+=1
  )
)
echo.
echo !KOPIERT! Dateien aus dem Dashboard uebernommen, !FEHLT! fehlen.
echo Jetzt in GitHub Desktop ansehen, was sich geaendert hat, dann committen und pushen.
pause
