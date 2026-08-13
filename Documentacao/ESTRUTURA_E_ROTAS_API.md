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
├── popular_e_rodar.js           # Worker monitor de canais do YouTube
├── Server.js                    # Servidor Express com a API REST
├── worker_download.js           # Worker gerenciador de downloads (yt-dlp)
├── yt-dlp.exe                   # Binário executável do yt-dlp
├── iniciar_sistema.bat          # Script de inicialização do sistema
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
| `GET` | `/api/video-info` | Obtém instantaneamente metadados do vídeo (título/autor) via oEmbed/yt-dlp (`?url=...`) |
| `POST` | `/api/gerar-skill` | Executa o gerador de skills (`{ url, urls, titulo, idioma }`), suporta URL única ou lote |
| `GET` | `/api/skills` | Lista todas as skills aprendidas (`.agents/skills/`) com caminhos de diretórios absolutos |
| `GET` | `/api/skills/:slug` | Retorna o conteúdo Markdown completo de uma skill |
