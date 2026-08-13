@echo off
chcp 65001 >nul
title Assistente de Instalação Interativo - Connect Media v2.2
color 0A

:: Variáveis globais de controle de componentes (1 = Instalar, 0 = Ignorar)
set "INSTALL_NODE=1"
set "INSTALL_FIREBIRD=1"
set "INSTALL_NPM=1"
set "INSTALL_DB=1"
set "INSTALL_SHORTCUT=1"

:: Variáveis de resultado final para a tabela de resumo
set "STATUS_NODE=PENDENTE"
set "STATUS_FIREBIRD=PENDENTE"
set "STATUS_NPM=PENDENTE"
set "STATUS_DB=PENDENTE"
set "STATUS_SHORTCUT=PENDENTE"

cls
echo.
echo =======================================================================
echo               🚀 CONNECT MEDIA — ASSISTENTE DE INSTALAÇÃO
echo =======================================================================
echo  Seja bem-vindo ao assistente de instalação do Connect Media!
echo  Este programa irá preparar todos os pré-requisitos no seu computador.
echo =======================================================================
echo.

echo 📋 Componentes que podem ser instalados:
echo.
echo   [1] 🟢 Node.js Runtime (v18+ 64-bit/32-bit)
echo       Ambiente de execução dos scripts da API REST e Workers.
echo.
echo   [2] 🟢 Firebird 5.0 (32-bit / x86)
echo       Motor de Banco de Dados de mídias (Arquitetura 32-bits).
echo.
echo   [3] 🟢 Pacotes e Dependências NPM
echo       Bibliotecas Node.js (express, node-firebird, cors, etc).
echo.
echo   [4] 🟢 Banco de Dados de Mídias (Firebird DDL)
echo       Criação da estrutura e tabelas no arquivo BIBLIOTECA_YT.FDB.
echo.
echo   [5] 🟢 Atalho na Área de Trabalho
echo       Atalho "Connect Media" para inicialização invisível em 1-clique.
echo.
echo =======================================================================
echo.
echo Como você deseja prosseguir?
echo.
echo   [1] 🚀 Instalação Completa Recomendada (Instala e configura tudo)
echo   [2] ⚙️  Instalação Personalizada (Escolher o que instalar)
echo.
set /p MOPC="Digite a opção desejada (1 ou 2) [Padrão: 1]: "
if "%MOPC%"=="2" goto :MENU_CUSTOM
goto :INICIAR_INSTALACAO

:MENU_CUSTOM
cls
echo.
echo =======================================================================
echo               ⚙️  SELEÇÃO PERSONALIZADA DE COMPONENTES
echo =======================================================================
echo  Responda com S (Sim) ou N (Não) para cada componente:
echo.

set /p C1="> Deseja verificar/instalar o Node.js Runtime? (S/N) [S]: "
if /i "%C1%"=="N" set "INSTALL_NODE=0"

set /p C2="> Deseja instalar o Firebird 5.0 (32-bit / x86)? (S/N) [S]: "
if /i "%C2%"=="N" set "INSTALL_FIREBIRD=0"

set /p C3="> Deseja instalar as dependências NPM? (S/N) [S]: "
if /i "%C3%"=="N" set "INSTALL_NPM=0"

set /p C4="> Deseja inicializar a estrutura do Banco de Dados? (S/N) [S]: "
if /i "%C4%"=="N" set "INSTALL_DB=0"

set /p C5="> Deseja criar o atalho na Área de Trabalho? (S/N) [S]: "
if /i "%C5%"=="N" set "INSTALL_SHORTCUT=0"

echo.
echo -----------------------------------------------------------------------
echo Componentes Selecionados:
if "%INSTALL_NODE%"=="1" (echo  - Node.js Runtime: SIM) else (echo  - Node.js Runtime: NÃO)
if "%INSTALL_FIREBIRD%"=="1" (echo  - Firebird 5.0 (32-bit): SIM) else (echo  - Firebird 5.0 (32-bit): NÃO)
if "%INSTALL_NPM%"=="1" (echo  - Dependências NPM: SIM) else (echo  - Dependências NPM: NÃO)
if "%INSTALL_DB%"=="1" (echo  - Banco de Dados Firebird: SIM) else (echo  - Banco de Dados Firebird: NÃO)
if "%INSTALL_SHORTCUT%"=="1" (echo  - Atalho na Área de Trabalho: SIM) else (echo  - Atalho na Área de Trabalho: NÃO)
echo -----------------------------------------------------------------------
echo.
pause

:INICIAR_INSTALACAO
cls
echo.
echo =======================================================================
echo               🔄 EXECUÇÃO E DETALHAMENTO DA INSTALAÇÃO
echo =======================================================================
echo.

:: -------------------------------------------------------------------------
:: COMPONENTE 1: NODE.JS
:: -------------------------------------------------------------------------
echo -----------------------------------------------------------------------
echo [Etapa 1/5] Verificando Node.js Runtime...
echo -----------------------------------------------------------------------
if "%INSTALL_NODE%"=="0" (
    echo ℹ️  Node.js ignorado pelo usuário.
    set "STATUS_NODE=IGNORADO"
    goto :ETAPA_FIREBIRD
)

where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
    echo ✅ Node.js já está instalado na máquina: %NODE_VER%
    set "STATUS_NODE=OK (Já Instalado)"
) else (
    echo ⏳ Node.js não encontrado. Instalando Node.js automaticamente...
    winget install OpenJS.NodeJS -e --silent >nul 2>&1
    where node >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ Node.js instalado com SUCESSO via Windows Package Manager!
        set "STATUS_NODE=SUCESSO (Instalado)"
    ) else (
        echo ❌ Não foi possível instalar o Node.js automaticamente via winget.
        echo 💡 Baixe manualmente em: https://nodejs.org
        set "STATUS_NODE=FALHA"
    )
)

:ETAPA_FIREBIRD
echo.
:: -------------------------------------------------------------------------
:: COMPONENTE 2: FIREBIRD 5.0 (32-BIT / X86)
:: -------------------------------------------------------------------------
echo -----------------------------------------------------------------------
echo [Etapa 2/5] Verificando/Instalando Firebird 5.0 32-bit (x86)...
echo -----------------------------------------------------------------------
if "%INSTALL_FIREBIRD%"=="0" (
    echo ℹ️  Firebird 5.0 (32-bit) ignorado pelo usuário.
    set "STATUS_FIREBIRD=IGNORADO"
    goto :ETAPA_NPM
)

:: Verifica se o serviço FirebirdServer está rodando ou se o diretório Firebird de 32 bits existe
sc query FirebirdServer >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Serviço do Firebird Server (32-bit) detectado e ativo!
    set "STATUS_FIREBIRD=OK (Já Instalado)"
    goto :ETAPA_NPM
)

if exist "C:\Program Files (x86)\Firebird\Firebird_5_0\firebird.exe" (
    echo ✅ Firebird 5.0 (32-bit) encontrado em C:\Program Files (x86)\Firebird.
    set "STATUS_FIREBIRD=OK (Já Instalado)"
    goto :ETAPA_NPM
)

echo ⏳ Firebird 5.0 (32-bit) não detectado. Iniciando download do instalador 32-bit (x86)...
set "FB_SETUP=%TEMP%\Firebird-5.0-x86_Setup.exe"

:: Tenta primeiro via winget forçando arquitetura 32-bit (x86)
winget install Firebird.Firebird.5 -a x86 --silent --accept-source-agreements --accept-package-agreements >nul 2>&1
sc query FirebirdServer >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Firebird 5.0 (32-bit) instalado com SUCESSO via winget!
    set "STATUS_FIREBIRD=SUCESSO (Instalado)"
    goto :ETAPA_NPM
)

:: Fallback: Download direto do executável oficial de 32-bits via PowerShell
echo 📥 Baixando instalador oficial de 32-bits via PowerShell...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/FirebirdSQL/firebird/releases/download/v5.0.0/Firebird-5.0.0.1306-0-x86.exe' -OutFile '%FB_SETUP%'" >nul 2>&1

if exist "%FB_SETUP%" (
    echo ⚙️ Executando instalação silenciosa do Firebird 5.0 32-bit...
    "%FB_SETUP%" /SILENT /NOCANCEL /NORESTART
    if %errorlevel% equ 0 (
        echo ✅ Firebird 5.0 (32-bit) instalado com SUCESSO no sistema!
        set "STATUS_FIREBIRD=SUCESSO (Instalado)"
    ) else (
        echo ⚠️ O instalador retornou o código %errorlevel%. Verifique o serviço Firebird.
        set "STATUS_FIREBIRD=AVISO (Verificar)"
    )
    del "%FB_SETUP%" >nul 2>&1
) else (
    echo ❌ Não foi possível baixar o Firebird 5.0 32-bit automaticamente.
    echo 💡 Baixe manualmente em: https://firebirdsql.org/en/firebird-5-0/
    set "STATUS_FIREBIRD=FALHA"
)

:ETAPA_NPM
echo.
:: -------------------------------------------------------------------------
:: COMPONENTE 3: DEPENDÊNCIAS NPM
:: -------------------------------------------------------------------------
echo -----------------------------------------------------------------------
echo [Etapa 3/5] Instalando Dependências do Projeto (npm install)...
echo -----------------------------------------------------------------------
if "%INSTALL_NPM%"=="0" (
    echo ℹ️  Dependências NPM ignoradas pelo usuário.
    set "STATUS_NPM=IGNORADO"
    goto :ETAPA_DB
)

cd /d "%~dp0"
call npm install --production
if %errorlevel% equ 0 (
    echo ✅ Dependências NPM instaladas com SUCESSO!
    set "STATUS_NPM=SUCESSO (Instalado)"
) else (
    echo ⚠️  Aviso na instalação do npm. Algumas dependências podem precisar de ajuste.
    set "STATUS_NPM=AVISO"
)

:ETAPA_DB
echo.
:: -------------------------------------------------------------------------
:: COMPONENTE 4: BANCO DE DADOS FIREBIRD (INIT_DB)
:: -------------------------------------------------------------------------
echo -----------------------------------------------------------------------
echo [Etapa 4/5] Inicializando Banco de Dados e Tabelas Firebird...
echo -----------------------------------------------------------------------
if "%INSTALL_DB%"=="0" (
    echo ℹ️  Inicialização do banco ignorada pelo usuário.
    set "STATUS_DB=IGNORADO"
    goto :ETAPA_SHORTCUT
)

node init_db.js
if %errorlevel% equ 0 (
    echo ✅ Banco de Dados BIBLIOTECA_YT.FDB e tabelas configuradas com SUCESSO!
    set "STATUS_DB=SUCESSO (Criado/Verificado)"
) else (
    echo ❌ Falha ao executar o script de inicialização do banco.
    set "STATUS_DB=FALHA"
)

:ETAPA_SHORTCUT
echo.
:: -------------------------------------------------------------------------
:: COMPONENTE 5: ATALHO NA ÁREA DE TRABALHO
:: -------------------------------------------------------------------------
echo -----------------------------------------------------------------------
echo [Etapa 5/5] Criando Atalho na Área de Trabalho...
echo -----------------------------------------------------------------------
if "%INSTALL_SHORTCUT%"=="0" (
    echo ℹ️  Criação de atalho ignorada pelo usuário.
    set "STATUS_SHORTCUT=IGNORADO"
    goto :EXIBIR_RESUMO
)

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

cscript //nologo "%VBS_SCRIPT%" >nul 2>&1
del "%VBS_SCRIPT%" >nul 2>&1

if exist "%DESKTOP_DIR%\Connect Media.lnk" (
    echo ✅ Atalho "Connect Media" criado com SUCESSO na Área de Trabalho!
    set "STATUS_SHORTCUT=SUCESSO (Criado)"
) else (
    echo ⚠️ Não foi possível gerar o arquivo de atalho no Desktop.
    set "STATUS_SHORTCUT=AVISO"
)

:EXIBIR_RESUMO
echo.
echo =======================================================================
echo               📊 RELATÓRIO E RESUMO DA INSTALAÇÃO
echo =======================================================================
echo.
echo  Componente                          | Status Resultante
echo -----------------------------------------------------------------------
echo  1. Node.js Runtime                 | %STATUS_NODE%
echo  2. Firebird 5.0 32-bit (x86)       | %STATUS_FIREBIRD%
echo  3. Dependências do Projeto (NPM)   | %STATUS_NPM%
echo  4. Banco de Dados Firebird (FDB)   | %STATUS_DB%
echo  5. Atalho Área de Trabalho         | %STATUS_SHORTCUT%
echo -----------------------------------------------------------------------
echo.
echo =======================================================================
echo 🎉 Processo de Instalação Finalizado!
echo =======================================================================
echo.

set /p RESP="Deseja iniciar os serviços do Connect Media agora? (S/N) [S]: "
if /i "%RESP%"=="N" goto :FIM

echo.
echo 🚀 Iniciando o Connect Media em segundo plano...
start "" wscript.exe "%~dp0iniciar_invisivel.vbs"
timeout /t 3 >nul
echo 🌐 Abrindo o painel no seu navegador (http://localhost:3000)...
start "" "http://localhost:3000"

:FIM
echo.
echo Pressione qualquer tecla para fechar o assistente.
pause >nul
exit /b 0
