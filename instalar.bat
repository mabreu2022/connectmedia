@echo off
chcp 65001 >nul
title Instalador e Assistente de Configuração - Connect Media v2.2
color 0A

echo.
echo =======================================================================
echo               🚀 CONNECT MEDIA — ASSISTENTE DE INSTALAÇÃO
echo =======================================================================
echo  Este assistente irá configurar o Connect Media neste computador.
echo =======================================================================
echo.

:: 1. Verificação do Node.js
echo [1/5] Verificando ambiente Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ⚠️  Node.js não foi encontrado no seu computador!
    echo ⏳ Tentando instalar o Node.js automaticamente via Windows Package Manager (winget)...
    echo.
    winget install OpenJS.NodeJS -e --silent >nul 2>&1
    where node >nul 2>&1
    if %errorlevel% neq 0 (
        echo ❌ Não foi possível instalar o Node.js automaticamente.
        echo 💡 Por favor, baixe e instale o Node.js em: https://nodejs.org
        echo.
        pause
        exit /b 1
    )
    echo ✅ Node.js instalado com sucesso!
) else (
    for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
    echo ✅ Node.js encontrado (%NODE_VER%).
)

:: 2. Instalação de Dependências
echo.
echo [2/5] Instalando dependências do aplicativo (npm install)...
cd /d "%~dp0"
call npm install --production
if %errorlevel% neq 0 (
    echo ⚠️  Aviso ao instalar dependências. Tentando continuar...
) else (
    echo ✅ Dependências verificadas e instaladas com sucesso.
)

:: 3. Inicialização e Migração do Banco Firebird
echo.
echo [3/5] Inicializando Banco de Dados Firebird 5.0...
node init_db.js
if %errorlevel% neq 0 (
    echo ❌ Falha ao inicializar o banco de dados.
    pause
    exit /b 1
)
echo ✅ Banco de Dados Firebird configurado e pronto!

:: 4. Criação do Atalho na Área de Trabalho
echo.
echo [4/5] Criando atalho na Área de Trabalho...
set "VBS_SCRIPT=%TEMP%\criar_atalho_connectmedia.vbs"
set "DESKTOP_DIR=%USERPROFILE%\Desktop"
set "TARGET_PATH=%~dp0iniciar_invisivel.vbs"
set "WORKING_DIR=%~dp0"

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo Set oLink = WshShell.CreateShortcut("%DESKTOP_DIR%\Connect Media.lnk") >> "%VBS_SCRIPT%"
echo oLink.TargetPath = "%TARGET_PATH%" >> "%VBS_SCRIPT%"
echo oLink.WorkingDirectory = "%WORKING_DIR%" >> "%VBS_SCRIPT%"
echo oLink.Description = "Connect Media - Gerenciador de Mídia e Monitor do YouTube" >> "%VBS_SCRIPT%"
echo oLink.Save >> "%VBS_SCRIPT%"

cscript //nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%" >nul 2>&1
echo ✅ Atalho "Connect Media" criado com sucesso na Área de Trabalho!

:: 5. Conclusão e Inicialização Opcional
echo.
echo [5/5] Instalação Concluída com Sucesso! 🎉
echo.
echo =======================================================================
echo   Você pode abrir o aplicativo a qualquer momento pelo atalho
echo   "Connect Media" na sua Área de Trabalho ou acessando:
echo   http://localhost:3000
echo =======================================================================
echo.

set /p RESP="Deseja iniciar o Connect Media agora? (S/N): "
if /i "%RESP%"=="S" (
    echo.
    echo 🚀 Iniciando serviços do Connect Media em segundo plano...
    start "" wscript.exe "%~dp0iniciar_invisivel.vbs"
    timeout /t 3 >nul
    echo 🌐 Abrindo o painel no seu navegador...
    start "" "http://localhost:3000"
)

echo.
echo Obrigado por utilizar o Connect Media! Pressione qualquer tecla para sair.
pause >nul
exit /b 0
