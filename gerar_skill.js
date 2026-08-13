#!/usr/bin/env node
/**
 * gerar_skill.js — Connect Media → Antigravity Skill Generator
 *
 * Uso:
 *   node gerar_skill.js <URL_do_YouTube_ou_caminho_do_MP4>
 *   node gerar_skill.js <URL> --idioma pt       (força idioma, padrão: auto)
 *   node gerar_skill.js <URL> --destino ./custom/path
 *   node gerar_skill.js <URL> --titulo "Meu Tópico"
 *
 * O script:
 *   1. Baixa legenda automática do YouTube (via yt-dlp)
 *   2. Limpa e processa o texto VTT/SRT
 *   3. Gera um SKILL.md estruturado
 *   4. Salva em .agents/skills/<slug-do-titulo>/SKILL.md
 */

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Configurações ─────────────────────────────────────────────────────────────
const PROJETO_DIR = __dirname;
const YT_DLP = path.join(PROJETO_DIR, 'yt-dlp.exe');
const AGENTS_DIR = path.join(PROJETO_DIR, '.agents', 'skills');
const TEMP_DIR = os.tmpdir();

// ─── Argumentos CLI ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
    console.log(`
┌─────────────────────────────────────────────────────┐
│    Connect Media → Gerador de Skills .md (Em Lote)   │
└─────────────────────────────────────────────────────┘

Uso:
  node gerar_skill.js <URL_1> [URL_2] [URL_3]...
  node gerar_skill.js --lista urls.txt
  node gerar_skill.js <URL> --idioma pt --titulo "Meu Tópico"

Exemplos:
  node gerar_skill.js https://youtube.com/watch?v=9EcuIU4JrHw https://youtube.com/watch?v=abc123
  node gerar_skill.js --lista links.txt
`);
    process.exit(0);
}

const idiomaIdx = args.indexOf('--idioma');
const idioma = idiomaIdx !== -1 ? args[idiomaIdx + 1] : null;
const tituloIdx = args.indexOf('--titulo');
const tituloManual = tituloIdx !== -1 ? args[tituloIdx + 1] : null;
const destinoIdx = args.indexOf('--destino');
const destinoManual = destinoIdx !== -1 ? args[destinoIdx + 1] : null;
const listaIdx = args.indexOf('--lista');

let targetUrls = [];

if (listaIdx !== -1 && args[listaIdx + 1]) {
    const listaPath = path.resolve(args[listaIdx + 1]);
    if (fs.existsSync(listaPath)) {
        const fileContent = fs.readFileSync(listaPath, 'utf8');
        targetUrls = fileContent.split(/\r?\n/).map(u => u.trim()).filter(u => u.startsWith('http'));
    }
} else {
    // Filtra todas as URLs passadas por parâmetro (que iniciam com http)
    targetUrls = args.filter(a => a.startsWith('http'));
}

if (targetUrls.length === 0) {
    console.error('❌ Nenhuma URL válida fornecida.');
    process.exit(1);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function slugify(str) {
    return str
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .substring(0, 60);
}

function limparVTT(conteudo) {
    return conteudo
        .split('\n')
        .filter(l => {
            if (!l.trim()) return false;
            if (l.startsWith('WEBVTT')) return false;
            if (/^\d+$/.test(l.trim())) return false;
            if (/\d{2}:\d{2}[\d:.,]+ -->/.test(l)) return false;
            if (l.startsWith('NOTE') || l.startsWith('Kind:') || l.startsWith('Language:')) return false;
            return true;
        })
        .map(l => l.replace(/<[^>]+>/g, '').trim())
        .filter(l => l.length > 0)
        .join(' ')
        .replace(/ {2,}/g, ' ')
        .trim();
}

function dividirEmSegmentos(texto, tamanhoMax = 800) {
    const frases = texto.match(/[^.!?]+[.!?]+/g) || [texto];
    const segmentos = [];
    let atual = '';
    for (const f of frases) {
        if ((atual + f).length > tamanhoMax) {
            if (atual.trim()) segmentos.push(atual.trim());
            atual = f;
        } else {
            atual += ' ' + f;
        }
    }
    if (atual.trim()) segmentos.push(atual.trim());
    return segmentos;
}

function extrairComandosEFormatar(texto) {
    const comandos = [];
    const padroesComandos = [
        /(?:npm|npx|yarn|pnpm)\s+[a-z0-9@/_-]+/gi,
        /(?:git)\s+[a-z0-9_-]+/gi,
        /(?:docker|docker-compose)\s+[a-z0-9_-]+/gi,
        /(?:pip|pip3|python|python3)\s+[a-z0-9._-]+/gi,
        /(?:node|deno|bun)\s+[a-z0-9._-]+\.js/gi,
        /(?:SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE|DROP TABLE)\s+[^.;\n]+/gi,
        /(?:chcp|cd|mkdir|rmdir|copy|xcopy|del|powershell|cmd)\s+[^;\n]+/gi,
        /(?:apt|apt-get|brew|choco|winget)\s+install\s+[a-z0-9_-]+/gi
    ];

    for (const regex of padroesComandos) {
        const matches = texto.match(regex);
        if (matches) {
            matches.forEach(m => {
                const limpo = m.trim().replace(/[.,;:!]+$/, '');
                if (limpo.length > 4 && !comandos.includes(limpo)) {
                    comandos.push(limpo);
                }
            });
        }
    }
    return comandos;
}

function extrairPassosEPontosChave(texto) {
    const frases = texto.match(/[^.!?]+[.!?]+/g) || [texto];
    const passos = [];
    const conceitos = [];

    const marcadoresPasso = /primeir|segund|terceir|em seguida|depois|próximo passo|passo \d|para começar|em seguida|por fim|finalmente|configurar|instalar|executar/i;
    const marcadoresConceito = /importante|atenção|regra|conceito|dica|arquitetura|vantagem|problema|solução|diferença|padrão/i;

    for (const f of frases) {
        const limpa = f.trim();
        if (limpa.length < 20) continue;

        if (marcadoresPasso.test(limpa) && passos.length < 10) {
            passos.push(limpa);
        } else if (marcadoresConceito.test(limpa) && conceitos.length < 8) {
            conceitos.push(limpa);
        }
    }

    return { passos, conceitos };
}

function gerarConteudoMD({ titulo, url, idioma, transcricao, dataGeracao, pastaAbsoluta }) {
    const comandosEncontrados = extrairComandosEFormatar(transcricao);
    const { passos, conceitos } = extrairPassosEPontosChave(transcricao);
    const segmentos = dividirEmSegmentos(transcricao, 1500);

    const slug = slugify(titulo);
    const caminhoCompleto = pastaAbsoluta ? path.join(pastaAbsoluta, 'SKILL.md') : `.agents/skills/${slug}/SKILL.md`;

    let md = `---
name: ${titulo}
description: >
  Skill técnica extraída do vídeo "${titulo}". Contém diretrizes de implementação,
  comandos práticos e transcrição estruturada para contextualização do Antigravity IDE.
tags: [video-skill, transcricao, ${idioma || 'auto'}]
source: ${url}
generated_at: ${dataGeracao}
file_path: "${caminhoCompleto}"
---

# ${titulo}

> **Diretiva para a IA Antigravity**: Utilize este documento como base de conhecimento técnico e contexto de referência para código, comandos e arquitetura do projeto.

---

### 📋 Ficha Técnica da Skill
- 📌 **Título**: ${titulo}
- 🔗 **Vídeo Fonte**: [Assistir no YouTube](${url})
- 📁 **Diretório do Arquivo**: \`${caminhoCompleto}\`
- 📅 **Data de Aprendizado**: ${dataGeracao}
- 🌐 **Idioma**: ${idioma || 'detectado automaticamente'}

---

## 🎯 Conceitos Chave e Diretrizes

${conceitos.length > 0 ? conceitos.map(c => `- ${c}`).join('\n') : '- Conhecimento técnico extraído e disponível para orientação de desenvolvimento no Antigravity IDE.'}

---

## 💻 Comandos e Snippets Identificados

${comandosEncontrados.length > 0 ? '```bash\n# Comandos detectados durante o tutorial:\n' + comandosEncontrados.join('\n') + '\n```' : '> *Nenhum comando de terminal explícito detectado na fala; consulte as seções abaixo.*'}

---

## 📋 Passo a Passo & Fluxo de Implementação

${passos.length > 0 ? passos.map((p, i) => `**${i + 1}.** ${p}`).join('\n\n') : 'Consulte a transcrição detalhada para os passos completos.'}

---

## 📜 Transcrição Completa Estruturada

`;

    segmentos.forEach((seg, i) => {
        md += `### Seção ${i + 1}\n\n${seg}\n\n`;
    });

    md += `---

## 🤖 Instrução de Uso no Antigravity

Para referenciar esta skill em qualquer chat com o Antigravity IDE, utilize:

\`\`\`
@${slug} — aplique o contexto deste skill nesta tarefa
\`\`\`

---
*Skill gerada automaticamente pelo Connect Media v2.0*
`;
    return md;
}

async function processarVideo(url, index, total) {
    console.log(`\n──────────────────────────────────────────────────`);
    console.log(`📌 [${index + 1}/${total}] Processando vídeo: ${url}`);

    // 1. Descobre o título do vídeo
    let titulo = (total === 1 ? tituloManual : null);
    if (!titulo) {
        console.log('🔍 Obtendo informações do vídeo...');
        const infoResult = spawnSync(YT_DLP, ['--get-title', '--no-playlist', url], { encoding: 'utf8', timeout: 30000 });
        titulo = (infoResult.stdout || '').trim();
        if (!titulo) {
            titulo = `video_${Date.now()}`;
            console.log(`   ⚠️  Não foi possível obter o título. Usando: ${titulo}`);
        } else {
            console.log(`   ✅ Título: ${titulo}`);
        }
    }

    const slug = slugify(titulo);
    const tempBase = path.join(TEMP_DIR, `skill_${slug}_${Date.now()}`);

    // 2. Baixa legendas
    console.log('📄 Baixando transcrição/legendas...');
    const langArgs = idioma ? ['--sub-lang', `${idioma},${idioma}-*`] : ['--sub-lang', 'pt,pt-BR,pt-PT,en,en-US'];

    let subFile = null;
    for (const subType of [['--write-subs'], ['--write-auto-subs']]) {
        const dlArgs = [
            '--no-playlist',
            '--skip-download',
            ...subType,
            '--sub-format', 'vtt/srt/best',
            ...langArgs,
            '-o', tempBase,
            url
        ];

        spawnSync(YT_DLP, dlArgs, { encoding: 'utf8', timeout: 60000, cwd: TEMP_DIR });

        const arquivos = fs.readdirSync(TEMP_DIR).filter(f =>
            f.startsWith(path.basename(tempBase)) && (f.endsWith('.vtt') || f.endsWith('.srt'))
        );

        if (arquivos.length > 0) {
            subFile = path.join(TEMP_DIR, arquivos[0]);
            console.log(`   ✅ Legenda encontrada: ${arquivos[0]}`);
            break;
        }
    }

    let transcricao = '';

    if (subFile) {
        console.log('🔄 Processando transcrição da legenda...');
        const rawContent = fs.readFileSync(subFile, 'utf8');
        transcricao = limparVTT(rawContent);
        try { fs.unlinkSync(subFile); } catch (_) {}
    } else {
        console.log('🎙️ Legendas não encontradas. Tentando transcrição por áudio (Whisper local)...');
        const audioArgs = [
            '--no-playlist',
            '-x',
            '--audio-format', 'wav',
            '--postprocessor-args', 'ffmpeg:-ar 16000 -ac 1',
            '-o', `${tempBase}.%(ext)s`,
            url
        ];

        console.log('   📥 Baixando faixa de áudio...');
        spawnSync(YT_DLP, audioArgs, { encoding: 'utf8', timeout: 120000, cwd: TEMP_DIR });

        const arquivosAudio = fs.readdirSync(TEMP_DIR).filter(f =>
            f.startsWith(path.basename(tempBase)) && (f.endsWith('.wav') || f.endsWith('.mp3') || f.endsWith('.m4a'))
        );

        if (arquivosAudio.length > 0) {
            const audioPath = path.join(TEMP_DIR, arquivosAudio[0]);
            try {
                const { pipeline, wavefile } = require('@xenova/transformers');
                console.log('   🤖 Carregando modelo Whisper local...');
                const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
                
                const buffer = fs.readFileSync(audioPath);
                const wav = new wavefile.WaveFile(buffer);
                wav.toBitDepth('32f');
                wav.toSampleRate(16000);
                let samples = wav.getSamples();
                if (Array.isArray(samples)) {
                    if (samples.length > 1) {
                        for (let i = 0; i < samples[0].length; ++i) {
                            samples[0][i] = (samples[0][i] + samples[1][i]) / 2;
                        }
                    }
                    samples = samples[0];
                }

                const result = await transcriber(samples, {
                    task: 'transcribe',
                    language: idioma === 'pt' ? 'portuguese' : (idioma === 'en' ? 'english' : undefined)
                });
                transcricao = result.text || '';
                console.log('   ✅ Transcrição via Whisper concluída!');
            } catch (e) {
                console.error('   ⚠️ Não foi possível rodar o Whisper local:', e.message);
            } finally {
                try { fs.unlinkSync(audioPath); } catch (_) {}
            }
        }

        if (!transcricao || transcricao.length < 50) {
            console.error('❌ Nenhuma legenda ou áudio foi transcrito com sucesso.');
            return null;
        }
    }

    console.log(`   ✅ Transcrição final: ${transcricao.length} caracteres`);

    // Salva na pasta correta
    const destDir = destinoManual
        ? path.resolve(destinoManual, slug)
        : path.join(AGENTS_DIR, slug);

    fs.mkdirSync(destDir, { recursive: true });
    const destFile = path.join(destDir, 'SKILL.md');

    console.log('✍️  Gerando Skill .md...');
    const dataGeracao = new Date().toISOString().split('T')[0];
    const conteudoMD = gerarConteudoMD({ titulo, url, idioma, transcricao, dataGeracao, pastaAbsoluta: destDir });

    fs.writeFileSync(destFile, conteudoMD, 'utf8');

    console.log(`✅ Skill gerado com sucesso!`);
    console.log(`   📁 Salvo em: ${destFile}`);
    console.log(`   📏 Tamanho: ${(conteudoMD.length / 1024).toFixed(1)} KB`);

    // Tenta registrar automaticamente o Prompt Especialista Sênior na TB_PROMPTS_LOJA
    try {
        const Firebird = require('node-firebird');
        const dbOptions = require('./dbConfig');
        const comandosEncontrados = extrairComandosEFormatar(transcricao);

        const promptSenior = `Você é um Analista de Sistemas Sênior e Especialista Principal em "${titulo}".

SUA MISSÃO:
Atuar como consultor técnico sênior, arquiteto de software e par de programação, orientando a implementação prática das melhores soluções aprendidas no treinamento oficial.

DIRETIVAS RÍGIDAS DE RESPOSTA E CÓDIGO:
1. Responda com clareza técnica, dividindo a solução em arquitetura, código e boas práticas.
2. Todo snippet de código deve ser legível, seguro, desacoplado e pronto para produção.
3. Tratamento de erros e exceções deve ser incluído por padrão em todas as funções.
4. Utilize as ferramentas de terminal e comandos de referência sempre que aplicável.

CONHECIMENTO TÉCNICO DE REFERÊNCIA:
${comandosEncontrados.length > 0 ? 'Comandos e utilitários chave:\n' + comandosEncontrados.join('\n') : 'Princípios aprendidos no vídeo original.'}

RESUMO E CONTEXTO DE EXECUÇÃO:
${transcricao.substring(0, 800)}...`;

        Firebird.attach(dbOptions, (err, db) => {
            if (!err && db) {
                const query = `
                    INSERT INTO TB_PROMPTS_LOJA (TITULO, CATEGORIA, DESCRICAO_CURTA, PROMPT_SISTEMA, PRECO_REAIS, TAGS)
                    VALUES (?, 'Treinamentos Video', ?, ?, 14.90, 'Especialista, Video, Antigravity')
                `;
                const desc = `Prompt especialista sênior gerado a partir do treinamento "${titulo}".`;
                db.query(query, [titulo, desc, promptSenior], () => {
                    console.log('   🛒 Prompt Especialista Sênior publicado automaticamente na Loja de Prompts!');
                    db.detach();
                });
            }
        });
    } catch (_) {}

    return destFile;
}

// ─── Pipeline Principal ────────────────────────────────────────────────────────
async function main() {
    if (!fs.existsSync(YT_DLP)) {
        console.error(`❌ yt-dlp.exe não encontrado em: ${YT_DLP}`);
        console.error(`   Baixe em: https://github.com/yt-dlp/yt-dlp/releases/latest`);
        process.exit(1);
    }

    console.log(`\n🎬 Connect Media → Gerador de Skills (Lote de ${targetUrls.length} vídeo(s))\n${'═'.repeat(55)}`);

    const concluidos = [];
    for (let i = 0; i < targetUrls.length; i++) {
        try {
            const resPath = await processarVideo(targetUrls[i], i, targetUrls.length);
            if (resPath) concluidos.push(resPath);
        } catch(e) {
            console.error(`❌ Erro ao processar URL [${targetUrls[i]}]:`, e.message);
        }
    }

    console.log(`\n${'═'.repeat(55)}`);
    console.log(`🎉 Processamento em lote concluído! ${concluidos.length}/${targetUrls.length} skill(s) gerada(s).`);
}

main().catch(err => {
    console.error('❌ Erro inesperado:', err.message);
    process.exit(1);
});
