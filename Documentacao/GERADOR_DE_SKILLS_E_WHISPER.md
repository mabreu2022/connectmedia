# Connect Media — Gerador de Skills & Transcrição Whisper

O **Gerador de Skills** é a funcionalidade que permite extrair o conhecimento contido em vídeos do YouTube e transformá-los em arquivos `.md` estruturados para consumo automático como Skills no **Antigravity IDE**.

---

## 🛠️ Arquitetura do Pipeline

```
1. Entrada da URL (Interface Web ou CLI)
                 ↓
2. Busca por Legendas Nativas (yt-dlp --write-subs / --write-auto-subs)
       ├─► [Legendas Encontradas] ──► Limpeza VTT/SRT ──┐
       └─► [Sem Legendas] ──► Download do Áudio (WAV) ──┤
                                          ↓              │
                           Transcrição Local Whisper AI ─┘
                                          ↓
                      Formatação YAML Frontmatter + Markdown
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
  Conhecimento extraído automaticamente do vídeo "O SaaS não morreu. O jogo mudou...".
  Use este skill para obter contexto técnico sobre o tema abordado.
tags: [video, transcricao, auto]
source: https://www.youtube.com/watch?v=9EcuIU4JrHw
generated_at: 2026-08-13
---

# O SaaS não morreu. O jogo mudou (e tem 5 regras novas)

> **Fonte**: [Assistir no YouTube](https://www.youtube.com/watch?v=9EcuIU4JrHw)
> **Idioma detectado**: automático
> **Gerado em**: 2026-08-13

## Resumo do Conteúdo
...

## Transcrição Estruturada
### Parte 1
...
```

---

## 💻 Uso via Linha de Comando (`gerar_skill.js`)

```bash
# Uso básico
node gerar_skill.js https://www.youtube.com/watch?v=VIDEO_ID

# Com título customizado e idioma forçado
node gerar_skill.js https://www.youtube.com/watch?v=VIDEO_ID --titulo "Setup Firebird 5.0" --idioma pt

# Atalho npm
npm run skill -- https://www.youtube.com/watch?v=VIDEO_ID
```
