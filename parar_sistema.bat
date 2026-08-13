@echo off
chcp 65001 >nul
title Parar Connect Media
color 0C

echo.
echo =======================================================================
echo               🛑 PARANDO SERVIÇOS DO CONNECT MEDIA
echo =======================================================================
echo.

echo ⏳ Encerrando processos do Connect Media (Servidor Web, Monitor e Worker)...
taskkill /F /FI "WINDOWTITLE eq Connect Media*" >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

echo.
echo ✅ Todos os serviços do Connect Media foram encerrados com sucesso!
echo.
timeout /t 3 >nul
exit /b 0
