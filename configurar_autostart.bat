@echo off
chcp 65001 >nul
title Configurar Inicialização Automática - Connect Media
color 0B

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_DIR%\Connect Media.lnk"
set "TARGET_PATH=%~dp0iniciar_invisivel.vbs"
set "WORKING_DIR=%~dp0"

:MENU
cls
echo.
echo =======================================================================
echo     ⚙️ CONFIGURAÇÃO DE INICIALIZAÇÃO AUTOMÁTICA (STARTUP DO WINDOWS)
echo =======================================================================
echo.
if exist "%SHORTCUT_PATH%" (
    echo  Status atual: 🟢 ATIVADO (Connect Media irá iniciar com o Windows)
) else (
    echo  Status atual: 🔴 DESATIVADO (Connect Media não inicia com o Windows)
)
echo.
echo  [1] 🚀 Ativar inicialização automática ao ligar o Windows
echo  [2] 🛑 Desativar inicialização automática ao ligar o Windows
echo  [3] ❌ Sair
echo.
echo =======================================================================
echo.
set /p OPCAO="Digite a opção desejada (1, 2 ou 3): "

if "%OPCAO%"=="1" goto :ATIVAR
if "%OPCAO%"=="2" goto :DESATIVAR
if "%OPCAO%"=="3" goto :FIM
goto :MENU

:ATIVAR
cls
echo.
echo ⏳ Criando atalho na pasta de Inicialização do Windows (Startup)...
set "VBS_SCRIPT=%TEMP%\criar_autostart_connectmedia.vbs"

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo Set oLink = WshShell.CreateShortcut("%SHORTCUT_PATH%") >> "%VBS_SCRIPT%"
echo oLink.TargetPath = "%TARGET_PATH%" >> "%VBS_SCRIPT%"
echo oLink.WorkingDirectory = "%WORKING_DIR%" >> "%VBS_SCRIPT%"
echo oLink.Description = "Connect Media - Inicialização Automática em Segundo Plano" >> "%VBS_SCRIPT%"
echo oLink.Save >> "%VBS_SCRIPT%"

cscript //nologo "%VBS_SCRIPT%" >nul 2>&1
del "%VBS_SCRIPT%" >nul 2>&1

if exist "%SHORTCUT_PATH%" (
    echo.
    echo ✅ SUCESSO: Connect Media foi configurado para iniciar automaticamente com o Windows!
    echo    Atalho criado em: %SHORTCUT_PATH%
) else (
    echo.
    echo ❌ ERRO: Não foi possível criar o atalho de inicialização.
)
echo.
pause
goto :MENU

:DESATIVAR
cls
echo.
if exist "%SHORTCUT_PATH%" (
    del "%SHORTCUT_PATH%" >nul 2>&1
    echo ✅ SUCESSO: Inicialização automática desativada com sucesso!
) else (
    echo ℹ️ A inicialização automática já estava desativada.
)
echo.
pause
goto :MENU

:FIM
exit /b 0
