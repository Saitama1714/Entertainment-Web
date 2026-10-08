@echo off
rem Holt die sammlung.json, die das Dashboard bei der automatischen Sicherung
rem in den Download-Ordner legt (Unterordner Dashboard-Sicherungen), nach
rem data\sammlung.json. Doppelklick genuegt.
setlocal
cd /d "%~dp0"
set "DL="
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path"`) do set "DL=%%d"
if not defined DL set "DL=%USERPROFILE%\Downloads"
set "QUELLE=%DL%\Dashboard-Sicherungen\sammlung.json"
if not exist "%QUELLE%" (
  echo Keine sammlung.json gefunden:
  echo   %QUELLE%
  echo Im Dashboard unter Einstellungen - Daten "Jetzt automatisch sichern" klicken.
  pause
  exit /b 1
)
for %%f in ("%QUELLE%") do echo Stand der Datei: %%~tf
copy /y "%QUELLE%" "data\sammlung.json" >nul
echo sammlung.json nach data\ uebernommen.
echo Jetzt in GitHub Desktop ansehen, was sich geaendert hat, dann committen und pushen.
pause
