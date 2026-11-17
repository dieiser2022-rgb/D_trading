@echo off
setlocal
cd /d "%~dp0"
title D_Trading Local - Diario de Trade
where py >nul 2>nul
if not errorlevel 1 goto usa_py
where python >nul 2>nul
if not errorlevel 1 goto usa_python
echo.
echo Python 3 nao foi encontrado no computador.
echo Instale Python 3.9 ou superior em https://www.python.org/downloads/windows/
echo Durante a instalacao, marque "Add python.exe to PATH".
echo.
pause
exit /b 1
:usa_py
py -3 app.py
if errorlevel 1 pause
exit /b
:usa_python
python app.py
if errorlevel 1 pause
exit /b
