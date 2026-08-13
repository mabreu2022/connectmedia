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
if (args.length === 0 || args[0] === '--help') {
    console.log(`
┌─────────────────────────────────────────────────────┐
│         Connect Media → Gerador de Skills .md        │
└─────────────────────────────────────────────────────┘

Uso:
  node gerar_skill.js <URL_YouTube>
  node gerar_skill.js <URL_YouTube> --idioma pt
  node gerar_skill.js <URL_YouTube> --titulo "Meu Tópico"
  node gerar_skill.js <URL_YouTube> --destino /caminho/custom

Exemplos:
  node gerar_skill.js https://youtube.com/watch?v=9EcuIU4JrHw
  node gerar_skill.js https://youtube.com/watch?v=abc123 --idioma pt --titulo "Firebird 5.0 Setup"
`);
    process.exit(0);
}

const url = args[0];
const idiomaIdx = args.indexOf('--idioma');
const idioma = idiomaIdx !== -1 ? args[idiomaIdx + 1] : null;
const tituloIdx = args.indexOf('--titulo');
const tituloManual = tituloIdx !== -1 ? args[tituloIdx + 1] : null;
const destinoIdx = args.indexOf('--destino');
const destinoManual = destinoIdx !== -1 ? args[destinoIdx + 1] : null;

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

function gerarConteudoMD({ titulo, url, idioma, transcricao, dataGeracao }) {
    const segmentos = dividirEmSegmentos(transcricao, 1200);
    const numTopicos = Math.min(segmentos.length, 8);

    let md = `---
name: ${titulo}
description: >
  Conhecimento extraído automaticamente do vídeo "${titulo}".
  Use este skill para obter contexto técnico sobre o tema abordado.
tags: [video, transcricao, ${idioma || 'auto'}]
source: ${url}
generated_at: ${dataGeracao}
---

# ${titulo}

> **Fonte**: [Assistir no YouTube](${url})
> **Idioma detectado**: ${idioma || 'automático'}
> **Gerado em**: ${dataGeracao}

## Resumo do Conteúdo

Este documento contém o conhecimento extraído da transcrição do vídeo acima.
Utilize como referência técnica para entender o tema e orientar implementações.

---

## Transcrição Estruturada

`;

    segmentos.slice(0, numTopicos).forEach((seg, i) => {
        md += `### Parte ${i + 1}\n\n${seg}\n\n`;
    });

    if (segmentos.length > numTopicos) {
        md += `### Conteúdo Adicional\n\n`;
        md += segmentos.slice(numTopicos).join(' ') + '\n\n';
    }

    md += `---

## Como Usar Este Skill

Quando precisar de orientações sobre os temas abordados neste vídeo, você pode referenciar
este documento diretamente em suas instruções para o Antigravity.

\`\`\`
@${slugify(titulo)} — use o contexto deste skill para...
\`\`\`

---
*Gerado automaticamente pelo Connect Media Skill Generator*
`;
    return md;
}

// ─── Pipeline Principal ────────────────────────────────────────────────────────
async function main() {
    if (!fs.existsSync(YT_DLP)) {
        console.error(`❌ yt-dlp.exe não encontrado em: ${YT_DLP}`);
        console.error(`   Baixe em: https://github.com/yt-dlp/yt-dlp/releases/latest`);
        process.exit(1);
    }

    console.log(`\n🎬 Connect Media → Gerador de Skill\n${'─'.repeat(50)}`);
    console.log(`📎 URL/Arquivo: ${url}`);

    // 1. Descobre o título do vídeo
    let titulo = tituloManual;
    if (!titulo) {
        console.log('\n🔍 Obtendo informações do vídeo...');
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
    console.log('\n📄 Baixando transcrição/legendas...');

    const langArgs = idioma ? ['--sub-lang', `${idioma},${idioma}-*`] : ['--sub-lang', 'pt,pt-BR,pt-PT,en,en-US'];

    // Tenta primeiro legendas manuais, depois auto-geradas
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

        const dlResult = spawnSync(YT_DLP, dlArgs, {
            encoding: 'utf8',
            timeout: 60000,
            cwd: TEMP_DIR
        });

        // Procura arquivo de legenda gerado
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
        // 3. Processa o texto da legenda
        console.log('\n🔄 Processando transcrição da legenda...');
        const rawContent = fs.readFileSync(subFile, 'utf8');
        transcricao = limparVTT(rawContent);
        try { fs.unlinkSync(subFile); } catch (_) {}
    } else {
        console.log('\n🎙️ Legendas automáticas não encontradas. Tentando transcrição por áudio (Whisper local)...');
        const wavFile = `${tempBase}.wav`;
        
        // Baixa áudio em WAV 16kHz mono para o Whisper
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
            console.error('\n❌ Nenhuma legenda ou áudio foi transcrito com sucesso.');
            console.error('   Dica: Certifique-se de que o vídeo possui legendas no YouTube ou que ffmpeg está instalado.');
            process.exit(1);
        }
    }

    console.log(`   ✅ Transcrição final: ${transcricao.length} caracteres`);

    // 4. Gera o Markdown
    console.log('\n✍️  Gerando Skill .md...');
    const dataGeracao = new Date().toISOString().split('T')[0];
    const conteudoMD = gerarConteudoMD({ titulo, url, idioma, transcricao, dataGeracao });

    // 5. Salva na pasta correta
    const destDir = destinoManual
        ? path.resolve(destinoManual, slug)
        : path.join(AGENTS_DIR, slug);

    fs.mkdirSync(destDir, { recursive: true });

    const destFile = path.join(destDir, 'SKILL.md');
    fs.writeFileSync(destFile, conteudoMD, 'utf8');

    // 6. Limpa arquivos temporários
    try { fs.unlinkSync(subFile); } catch (_) {}

    console.log(`\n✅ Skill gerado com sucesso!`);
    console.log(`   📁 Salvo em: ${destFile}`);
    console.log(`   📏 Tamanho: ${(conteudoMD.length / 1024).toFixed(1)} KB`);
    console.log(`\n💡 Para usar no Antigravity, o skill já está disponível em:`);
    console.log(`   .agents/skills/${slug}/SKILL.md\n`);
}

main().catch(err => {
    console.error('❌ Erro inesperado:', err.message);
    process.exit(1);
});
