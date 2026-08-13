const http = require('http');

console.log("🧪 ============================================");
console.log("   TESTE AUTOMATIZADO DO SAAS MULTI-TENANT E AUTH");
console.log("============================================\n");

function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
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

async function rodarTestesSaaS() {
    try {
        // 1. Login com o Usuário Admin Padrão
        console.log("1️⃣ Testando Login Admin (admin@connectmedia.com.br / admin123)...");
        const resLoginAdmin = await request('POST', '/api/auth/login', { email: 'admin@connectmedia.com.br', senha: 'admin123' });
        console.log(`   Status: ${resLoginAdmin.status}`);
        if (resLoginAdmin.status !== 200 || !resLoginAdmin.body.token) {
            throw new Error("Falha no login de Administrador.");
        }
        const adminToken = resLoginAdmin.body.token;
        console.log(`   ✅ Token Admin recebido! Usuário: ${resLoginAdmin.body.user.nome} [${resLoginAdmin.body.user.perfil}]`);

        // 2. Acesso às Métricas do Painel Admin SaaS
        console.log("\n2️⃣ Testando GET /api/admin/metricas (Exclusivo Admin)...");
        const resMet = await request('GET', '/api/admin/metricas', null, adminToken);
        console.log(`   Status: ${resMet.status}`);
        console.log(`   Usuários Cadastrados: ${resMet.body.totalUsuarios}`);
        console.log(`   Faturamento Pix Total: R$ ${resMet.body.faturamentoTotal}`);
        if (resMet.status !== 200) throw new Error("Falha ao obter métricas do Admin.");
        console.log("   ✅ Métricas do SaaS obtidas com sucesso!");

        // 3. Atualização da Chave Pix Mestre da Empresa
        console.log("\n3️⃣ Testando POST /api/admin/config-pix...");
        const resPixMestre = await request('POST', '/api/admin/config-pix', {
            chavePixMestre: 'pix.empresa@meusaas.com.br',
            nomeRecebedor: 'Connect Media SaaS LTDA',
            cidadeRecebedor: 'Sao Paulo'
        }, adminToken);
        console.log(`   Status: ${resPixMestre.status}`);
        console.log(`   Mensagem: ${resPixMestre.body.message}`);
        if (resPixMestre.status !== 200) throw new Error("Falha ao salvar Chave Pix Mestre.");
        console.log("   ✅ Chave Pix Mestre salva com sucesso!");

        // 4. Cadastro de Novo Usuário Cliente
        const emailCliente = `cliente_${Date.now()}@teste.com`;
        console.log(`\n4️⃣ Testando Cadastro de Novo Cliente (${emailCliente})...`);
        const resReg = await request('POST', '/api/auth/register', {
            nome: 'Cliente Teste SaaS',
            email: emailCliente,
            senha: 'senha123'
        });
        console.log(`   Status: ${resReg.status}`);
        if (resReg.status !== 200 || !resReg.body.token) throw new Error("Falha ao registrar novo cliente.");
        const clienteToken = resReg.body.token;
        console.log(`   ✅ Cliente cadastrado! Token recebido (#${resReg.body.user.id})`);

        // 5. Teste de Bloqueio de Segurança: Cliente tenta acessar rota Admin
        console.log("\n5️⃣ Testando bloqueio de segurança: Cliente tentando acessar Rota Admin...");
        const resBlock = await request('GET', '/api/admin/metricas', null, clienteToken);
        console.log(`   Status: ${resBlock.status} (Esperado: 403 Forbidden)`);
        if (resBlock.status !== 403) throw new Error("Segurança falhou: Cliente conseguiu acessar rota restrita de Admin!");
        console.log("   ✅ Bloqueio de segurança 100% verificado!");

        // 6. Teste de Esqueci Minha Senha e Redefinição
        console.log("\n6️⃣ Testando Esqueci Minha Senha e Redefinição...");
        const resEsqueci = await request('POST', '/api/auth/esqueci-senha', { email: emailCliente });
        const codigoRecuperacao = resEsqueci.body.tokenSimulado;
        console.log(`   Código gerado: ${codigoRecuperacao}`);

        const resRedef = await request('POST', '/api/auth/redefinir-senha', {
            email: emailCliente,
            token: codigoRecuperacao,
            novaSenha: 'novasenha456'
        });
        console.log(`   Status: ${resRedef.status}`);
        if (resRedef.status !== 200) throw new Error("Falha ao redefinir senha.");
        console.log("   ✅ Senha redefinida com sucesso!");

        // 7. Login com a Nova Senha
        console.log("\n7️⃣ Testando Login com a Nova Senha...");
        const resLoginNovo = await request('POST', '/api/auth/login', { email: emailCliente, senha: 'novasenha456' });
        console.log(`   Status: ${resLoginNovo.status}`);
        if (resLoginNovo.status !== 200) throw new Error("Falha ao fazer login com a nova senha.");
        console.log("   ✅ Login com nova senha efetuado com sucesso!");

        console.log("\n🎉 ============================================");
        console.log("   TODOS OS TESTES DO SAAS & AUTH PASSARAM!");
        console.log("   SISTEMA SAAS MULTI-TENANT 100% OPERACIONAL!");
        console.log("============================================\n");

    } catch(e) {
        console.error("❌ ERRO NO TESTE DO SAAS:", e.message);
        process.exit(1);
    }
}

rodarTestesSaaS();
