const http = require('http');

console.log("🧪 ============================================");
console.log("   TESTE AUTOMATIZADO DA LOJA DE PROMPTS E PIX");
console.log("============================================\n");

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (_) { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function rodarTestes() {
    try {
        // 1. Testa listagem do catálogo de prompts
        console.log("1️⃣ Testando GET /api/prompts...");
        const resCat = await request('GET', '/api/prompts');
        console.log(`   Status: ${resCat.status}`);
        console.log(`   Prompts encontrados: ${resCat.body.length}`);
        if (!Array.isArray(resCat.body) || resCat.body.length === 0) {
            throw new Error("Catálogo de prompts retornou vazio.");
        }
        console.log(`   ✅ Primeiro prompt: "${resCat.body[0].titulo}" - R$ ${resCat.body[0].preco}`);

        const promptId = resCat.body[0].id;

        // 2. Testa geração de Ordem Pix
        console.log("\n2️⃣ Testando POST /api/prompts/gerar-pix...");
        const resPix = await request('POST', '/api/prompts/gerar-pix', { promptIds: [promptId] });
        console.log(`   Status: ${resPix.status}`);
        console.log(`   Ordem criada ID: #${resPix.body.idVenda}`);
        console.log(`   Valor Total: R$ ${resPix.body.valorTotal}`);
        console.log(`   Payload Pix EMV: ${resPix.body.codigoPix ? resPix.body.codigoPix.substring(0, 45) + '...' : 'ERRO'}`);
        if (!resPix.body.idVenda || !resPix.body.codigoPix) {
            throw new Error("Falha ao gerar Ordem Pix.");
        }
        console.log("   ✅ Payload Pix EMV gerado com sucesso!");

        // 3. Testa confirmação de pagamento Pix
        console.log("\n3️⃣ Testando POST /api/prompts/confirmar-pix...");
        const resConf = await request('POST', '/api/prompts/confirmar-pix', { idVenda: resPix.body.idVenda });
        console.log(`   Status: ${resConf.status}`);
        console.log(`   Mensagem: ${resConf.body.message}`);

        // 4. Testa listagem de prompts comprados (Meus Prompts)
        console.log("\n4️⃣ Testando GET /api/prompts/meus...");
        const resMeus = await request('GET', '/api/prompts/meus');
        console.log(`   Status: ${resMeus.status}`);
        console.log(`   Prompts adquiridos: ${resMeus.body.length}`);
        if (!Array.isArray(resMeus.body) || resMeus.body.length === 0) {
            throw new Error("Meus prompts retornou vazio após pagamento.");
        }
        console.log(`   ✅ Prompt desbloqueado: "${resMeus.body[0].titulo}"`);

        console.log("\n🎉 ============================================");
        console.log("   TODOS OS TESTES DA LOJA DE PROMPTS PASSARAM!");
        console.log("   O sistema de carrinho e Pix está 100% funcional!");
        console.log("============================================\n");
    } catch (e) {
        console.error("❌ ERRO NO TESTE DA LOJA DE PROMPTS:", e.message);
        process.exit(1);
    }
}

rodarTestes();
