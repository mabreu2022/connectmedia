# Connect Media — Documentação do Sistema

> **Versão**: 2.2.0  
> **Data de Atualização**: 13 de Agosto de 2026  
> **Tecnologias**: Node.js, Express, Firebird 5.0, yt-dlp, @xenova/transformers (Whisper), Vanilla JS, Tailwind CSS  
> **Repositório Git**: `git@github.com:mabreu2022/connectmedia.git`

---

## 📌 Índice da Documentação

1. [Visão Geral e Arquitetura](./README.md)
2. [Manual do Usuário](./MANUAL_DE_USO.md)
3. [Banco de Dados Firebird 5.0](./BANCO_DE_DADOS.md)
4. [Gerador de Skills & Whisper Local](./GERADOR_DE_SKILLS_E_WHISPER.md)
5. [Rotas da API REST](./ESTRUTURA_E_ROTAS_API.md)

---

## 🚀 Como Iniciar o Sistema

### Método Rápido (Windows)
Dê um duplo clique ou execute via terminal:
```cmd
iniciar_sistema.bat
```

### Método Manual (3 Processos)
Abra 3 terminais na raiz do projeto:

```bash
# Terminal 1 — Servidor Web & API REST
node Server.js

# Terminal 2 — Monitor de Canais do YouTube
node popular_e_rodar.js

# Terminal 3 — Worker de Downloads (MP4 e MP3)
node worker_download.js
```

Acesse o painel web em: [http://localhost:3000](http://localhost:3000)

---

## 🎨 Principais Recursos Desenvolvidos
- **Monitoramento Automático de Canais**: Varredura periódica configurável de canais do YouTube.
- **Suporte a Formatos MP4 e MP3**: Opção de download de vídeo completo ou extração de áudio em alta qualidade.
- **Gerador de Skills em Lote**: Suporte para colar múltiplos links de vídeos (um por linha) e gerar todas as skills em lote.
- **Auto-Preenchimento Instantâneo do Título**: Carregamento do título do vídeo em `< 100ms` via API oEmbed ao colar a URL.
- **Extração Inteligente de Conteúdo Técnico**: Identificação de comandos de terminal CLI (`npm`, `git`, `docker`, `SQL`, etc.), conceitos chave e passos numerados para orientar o Antigravity IDE.
- **Visualizador de Skills Aprendidas**: Exibição dos diretórios físicos absolutos no disco (`D:\Projetos...`), botão para copiar o caminho, link direto para o vídeo no YouTube e leitor modal.
- **Fallback com Whisper Local**: Transcrição automática 100% offline via IA quando o vídeo não possui legendas no YouTube.
- **Trava de Arquivo Cross-Process com Auto-Healing (`.fdb.lock`)**: Mecanismo de concorrência com backoff exponencial, limpeza automática de locks órfãos (mesmo PID ou idade > 45s), nomes únicos em scripts temporários e semáforo isolado de worker para gerenciar o Firebird 5.0 sem colisões ou timeouts.
