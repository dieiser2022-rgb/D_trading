@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0criar_atalho.ps1"
if errorlevel 1 (
 echo Nao foi possivel criar o atalho. Voce ainda pode usar INICIAR_DIARIO.bat.
)
pause
