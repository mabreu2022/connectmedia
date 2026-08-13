@echo off
title Connect Media - Ecossistema Completo

:: Navega para a pasta correta do projeto
cd /d "D:\Projetos AntiGravity\Connect Media"

echo [0/3] Verificando e Inicializando Banco Firebird...
node init_db.js

echo [1/3] Iniciando Servidor Web Node.js...
start "Connect Media - Servidor" cmd /k "node Server.js"

echo [2/3] Iniciando Monitor de Canais Automatico...
start "Connect Media - Monitor" cmd /k "node popular_e_rodar.js"

echo [3/3] Iniciando Worker de Downloads Físicos...
start "Connect Media - Worker" cmd /k "node worker_download.js"

echo.
echo ========================================================
echo   Todos os servicos foram iniciados em janelas separadas!
echo   Acesse no navegador: http://localhost:3000
echo ========================================================
echo.
pause