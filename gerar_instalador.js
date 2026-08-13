const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const outputDir = path.join(rootDir, 'Dist_Instalador_ConnectMedia');

console.log("📦 ============================================");
console.log("   GERADOR DE PACOTE DE INSTALAÇÃO CONNECT MEDIA");
console.log("============================================\n");

// 1. Limpa ou cria diretório de saída
if (fs.existsSync(outputDir)) {
    console.log(`🧹 Limpando pasta de distribuição anterior: ${outputDir}`);
    fs.rmSync(outputDir, { recursive: true, force: true });
}
fs.mkdirSync(outputDir, { recursive: true });

// 2. Lista de arquivos e diretórios para incluir no pacote do cliente
const itemsToCopy = [
    'instalar.bat',
    'configurar_autostart.bat',
    'iniciar_sistema.bat',
    'iniciar_invisivel.vbs',
    'Server.js',
    'worker_download.js',
    'popular_e_rodar.js',
    'init_db.js',
    'dbConfig.js',
    'logger.js',
    'processador.js',
    'gerar_skill.js',
    'package.json',
    'package-lock.json',
    'yt-dlp.exe',
    'Manual.html',
    'Readme.md',
    'Public',
    'Documentacao',
    'Database'
];

function copyRecursive(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach((childItemName) => {
            // Ignora arquivos temporários e arquivos de trava .lock ou .fdb grandes se for cópia limpa
            if (childItemName === '.fdb.lock' || childItemName === '.monitor.lock') return;
            copyRecursive(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else if (exists) {
        fs.copyFileSync(src, dest);
    }
}

console.log("📋 Copiando arquivos e estruturas para a pasta do instalador...");

let totalCopiados = 0;
for (const item of itemsToCopy) {
    const srcPath = path.join(rootDir, item);
    const destPath = path.join(outputDir, item);

    if (fs.existsSync(srcPath)) {
        copyRecursive(srcPath, destPath);
        console.log(`  ✅ Incluído: ${item}`);
        totalCopiados++;
    } else {
        console.warn(`  ⚠️ Item não encontrado (pulado): ${item}`);
    }
}

// Criar pasta de downloads padrão vazia se não existir
const destDownloadsDir = path.join(outputDir, 'downloads');
if (!fs.existsSync(destDownloadsDir)) {
    fs.mkdirSync(destDownloadsDir, { recursive: true });
}

console.log("\n🎉 ============================================");
console.log(`   PACOTE DE INSTALAÇÃO GERADO COM SUCESSO! (${totalCopiados} itens)`);
console.log(`   Localização: ${outputDir}`);
console.log("   Para enviar a clientes, basta compactar esta pasta em ZIP.");
console.log("============================================\n");
