# Connect Media — Gerador de Skills & Transcrição Whisper

O **Gerador de Skills** é a funcionalidade que permite extrair o conhecimento contido em vídeos do YouTube (individuais ou em lote) e transformá-los em arquivos `.md` altamente estruturados para consumo automático como Skills no **Antigravity IDE**.

---

## 🛠️ Arquitetura do Pipeline

```
1. Entrada da URL Única ou Lista de URLs (Interface Web ou CLI)
                 ↓
2. Auto-Obtenção do Título via oEmbed / yt-dlp (< 100ms)
                 ↓
3. Extração de Legendas (yt-dlp --write-subs / --write-auto-subs)
       ├─► [Legendas Encontradas] ──► Limpeza VTT/SRT ──┐
       └─► [Sem Legendas] ──► Download do Áudio (WAV) ──┤
                                          ↓              │
                           Transcrição Local Whisper AI ─┘
                                          ↓
4. Processamento Inteligente do Conteúdo:
   ├── Extração de Comandos CLI (npm, git, docker, SQL, etc.)
   ├── Mapeamento de Conceitos Chave e Diretrizes
   └── Construção do Passo a Passo Numerado
                                          ↓
5. Formatação YAML Frontmatter + Markdown Técnico
                                          ↓
   Salva em .agents/skills/<slug-do-titulo>/SKILL.md
```

---

## 🎙️ Transcrição Local com Whisper (Gratuito e Offline)

Quando o vídeo do YouTube não possui legendas automáticas ou manuais disponíveis:
1. O sistema utiliza o `yt-dlp` para baixar a faixa de áudio em formato WAV (16kHz mono).
2. O pacote `@xenova/transformers` é acionado para carregar o modelo **Whisper** (`Xenova/whisper-tiny`) 100% offline.
3. O áudio é convertido e transcrito diretamente na CPU/GPU local, sem custo e sem necessidade de chave de API.

---

## 📁 Estrutura de um Arquivo de Skill (`SKILL.md`)

```markdown
---
name: O SaaS não morreu. O jogo mudou (e tem 5 regras novas)
description: >
  Skill técnica extraída do vídeo "O SaaS não morreu. O jogo mudou...".
  Contém diretrizes de implementação, comandos práticos e transcrição estruturada.
tags: [video-skill, transcricao, auto]
source: https://www.youtube.com/watch?v=9EcuIU4JrHw
generated_at: 2026-08-13
file_path: "D:\Projetos AntiGravity\Connect Media\.agents\skills\o_saas_no_morreu_o_jogo_mudou_e_tem_5_regras_novas\SKILL.md"
---

# O SaaS não morreu. O jogo mudou (e tem 5 regras novas)

> **Diretiva para a IA Antigravity**: Utilize este documento como base de conhecimento técnico e contexto de referência para código, comandos e arquitetura do projeto.

---

### 📋 Ficha Técnica da Skill
- 📌 **Título**: O SaaS não morreu...
- 🔗 **Vídeo Fonte**: [Assistir no YouTube](https://www.youtube.com/watch?v=9EcuIU4JrHw)
- 📁 **Diretório do Arquivo**: `D:\Projetos AntiGravity\Connect Media\.agents\skills\...`

## 🎯 Conceitos Chave e Diretrizes
- Ponto importante 1...

## 💻 Comandos e Snippets Identificados
```bash
npm install express
node Server.js
```

## 📋 Passo a Passo & Fluxo de Implementação
1. Passo 1...

## 📜 Transcrição Completa Estruturada
### Seção 1
...
```

---

## 💻 Uso via Linha de Comando (`gerar_skill.js`)

```bash
# Vídeo Único
node gerar_skill.js https://www.youtube.com/watch?v=VIDEO_ID

# Com título customizado e idioma forçado
node gerar_skill.js https://www.youtube.com/watch?v=VIDEO_ID --titulo "Setup Firebird 5.0" --idioma pt

# Geração em Lote (Passando múltiplas URLs)
node gerar_skill.js https://youtube.com/watch?v=URL1 https://youtube.com/watch?v=URL2

# Geração em Lote (Lendo de um arquivo de texto)
node gerar_skill.js --lista links.txt

# Atalho npm
npm run skill -- https://www.youtube.com/watch?v=VIDEO_ID
```
