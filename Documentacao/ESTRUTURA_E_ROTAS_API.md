# Connect Media — Estrutura do Projeto & Rotas da API REST

---

## 📁 Estrutura de Arquivos

```
Connect Media/
├── .agents/
│   └── skills/                  # Skills geradas para o Antigravity IDE
├── Database/
│   ├── BIBLIOTECA_YT.FDB        # Banco de dados Firebird 5.0
│   └── script criacao banco.sql # Scripts de criação DDL
├── Documentacao/                # Documentação técnica do projeto
│   ├── README.md
│   ├── MANUAL_DE_USO.md
│   ├── BANCO_DE_DADOS.md
│   ├── GERADOR_DE_SKILLS_E_WHISPER.md
│   └── ESTRUTURA_E_ROTAS_API.md
├── Public/
│   └── index.html               # Single Page Application (Dashboard Web)
├── dbConfig.js                  # Conexão e trava de concorrência (.fdb.lock)
├── gerar_skill.js               # Script CLI e batch para extração de Skills e Whisper
├── init_db.js                   # Inicializador e migrador do banco
├── logger.js                    # Módulo centralizador de logs em memória e broadcast SSE
├── popular_e_rodar.js           # Worker monitor de canais do YouTube
├── Server.js                    # Servidor Express com a API REST
├── worker_download.js           # Worker gerenciador de downloads (yt-dlp)
├── yt-dlp.exe                   # Binário executável do yt-dlp
├── iniciar_sistema.bat          # Script de inicialização do sistema
├── iniciar_invisivel.vbs        # Script VBScript para inicialização em background sem janela
└── package.json                 # Manifesto de dependências e scripts npm
```

---

## 🌐 Endpoints da API REST (`Server.js`)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/videos` | Lista vídeos pendentes (Descoberta), suporta filtro `?canal=ID` |
| `GET` | `/api/videos/baixados` | Lista vídeos com `STATUS_DOWNLOAD = 'DOWNLOAD_CONCLUIDO'` |
| `GET` | `/api/videos/fila` | Lista vídeos em processamento ou agendados |
| `POST` | `/api/videos/agendar` | Agenda download de um vídeo (`{ idVideo, formato: 'MP4' \| 'MP3' }`) |
| `DELETE` | `/api/videos/limpar-descoberta` | Deleta todos os vídeos com status `PENDENTE` |
| `DELETE` | `/api/videos/:id` | Deleta um vídeo específico por ID |
| `GET` | `/api/canais` | Lista todos os canais monitorados |
| `POST` | `/api/canais` | Cadastra um novo canal do YouTube |
| `DELETE` | `/api/canais/:id` | Deleta um canal e seus vídeos vinculados |
| `GET` | `/api/configuracoes` | Retorna as configurações do sistema |
| `POST` | `/api/configuracoes` | Salva as configurações do sistema |
| `GET` | `/api/logs` | Retorna histórico recente de logs em formato JSON |
| `GET` | `/api/logs/stream` | Stream contínuo em tempo real via Server-Sent Events (SSE) |
| `POST` | `/api/logs` | Registra uma nova entrada de log (`{ fonte, nivel, mensagem }`) |
| `GET` | `/api/video-info` | Obtém instantaneamente metadados do vídeo (título/autor) via oEmbed/yt-dlp (`?url=...`) |
| `POST` | `/api/auth/register` | Cadastro de novo usuário (`{ nome, email, senha }`) |
| `POST` | `/api/auth/login` | Login de usuário (`{ email, senha }`) |
| `POST` | `/api/auth/esqueci-senha` | Solicita código de 6 dígitos para recuperação de senha |
| `POST` | `/api/auth/redefinir-senha` | Redefine senha com o código recebido |
| `GET` | `/api/auth/me` | Retorna o perfil do usuário logado |
| `GET` | `/api/prompts` | Lista o catálogo de prompts disponíveis para compra |
| `GET` | `/api/prompts/meus` | Lista os prompts comprados pelo usuário |
| `POST` | `/api/prompts/gerar-pix` | Gera Ordem Pix e QR Code Copia e Cola (`{ promptIds }`) |
| `POST` | `/api/prompts/enviar-comprovante` | Envia comprovante de pagamento Pix (`{ idVenda, comprovante }`) |
| `POST` | `/api/prompts/confirmar-pix` | Confirma pagamento e libera prompts adquiridos (`{ idVenda }`) |
| `GET` | `/api/admin/metricas` | [Admin] Retorna métricas globais e faturamento do SaaS |
| `GET` | `/api/admin/usuarios` | [Admin] Lista todos os usuários cadastrados |
| `POST` | `/api/admin/usuarios/:id/status` | [Admin] Altera o status do usuário (Ativo / Bloqueado) |
| `GET` | `/api/admin/vendas` | [Admin] Retorna o extrato global de vendas Pix com comprovantes |
| `POST` | `/api/admin/config-pix` | [Admin] Atualiza a Chave Pix Mestre da empresa |
