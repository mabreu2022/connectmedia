# Connect Media — Loja de Prompts, Checkout PIX & Painel Admin SaaS

Esta documentação descreve os recursos de e-commerce, checkout PIX com envio de comprovante e o painel de administração multi-tenant SaaS do **Connect Media**.

---

## 🛒 Loja de Prompts & Checkout PIX (Cliente)

Qualquer usuário ou cliente (sem necessidade de perfil Administrador) pode acessar o catálogo de prompts e realizar compras via PIX de forma autônoma.

### Fluxo de Compra do Cliente:
1. **Navegação no Catálogo (`GET /api/prompts`)**:
   - Visualização dos System Prompts organizados por categorias, preços e tags.
2. **Carrinho de Compras**:
   - Adição e remoção de prompts no carrinho flutuante (`drawer-carrinho`).
3. **Geração de PIX (`POST /api/prompts/gerar-pix`)**:
   - Geração automática de Ordem de Venda com QR Code visual (EMV padrão BACEN) e código **PIX Copia e Cola**.
4. **Envio de Comprovante de Pagamento (`POST /api/prompts/enviar-comprovante`)**:
   - Botão **`📎 Anexar / Enviar Comprovante de Pagamento`** no próprio modal do PIX.
   - O cliente pode anexar comprovantes em formato de Imagem (PNG, JPG, WEBP) ou PDF.
   - O arquivo é enviado em Base64 e armazenado na tabela `TB_VENDAS_PIX.COMPROVANTE`.
5. **Confirmação e Desbloqueio (`POST /api/prompts/confirmar-pix`)**:
   - Liberação imediata dos prompts adquiridos para a aba **Meus Prompts** (`GET /api/prompts/meus`).

---

## 🛡️ Painel Administrativo Master SaaS (Admin)

O Painel Admin SaaS é restrito a usuários com o perfil `ADMIN`.

### Como Acessar o Painel Admin SaaS:
1. **Faça login** na aplicação (botão `👤 Acessar Conta` no topo) com as credenciais de Administrador Master:
   - **E-mail:** `admin@connectmedia.com.br`
   - **Senha:** `admin123`
2. Após o login, o menu lateral esquerdo exibirá o botão em destaque roxo: **`🛡️ Painel Admin SaaS`**.
3. Clique no botão para navegar para o painel de gestão central.

---

## ⚡ Recursos do Painel Admin SaaS

1. **Métricas Globais e Faturamento (`GET /api/admin/metricas`)**:
   - Total de usuários cadastrados no SaaS.
   - Faturamento acumulado via vendas PIX (R$).
   - Total de vendas concluídas.
   - Total de prompts ativos no catálogo.

2. **Gestão de Usuários (`GET /api/admin/usuarios` e `POST /api/admin/usuarios/:id/status`)**:
   - Listagem completa de usuários com busca por nome/email e perfil (`ADMIN` / `CLIENTE`).
   - Botão de bloqueio ou ativação instantânea de contas.

3. **Extrato Global de Vendas Pix & Visualização de Comprovantes (`GET /api/admin/vendas`)**:
   - Histórico detalhado de todas as ordens de pagamento Pix geradas na plataforma.
   - Coluna **Comprovante**: Exibe o botão **`📄 Ver Comprovante`** para ordens que receberam anexo de comprovante.
   - Modal interativo para o Administrador visualizar a imagem ou documento enviado pelo cliente.

4. **Configuração da Chave PIX Mestre (`POST /api/admin/config-pix`)**:
   - Cadastro da Chave PIX (CPF/CNPJ/Email/EVP), Nome e Cidade do Recebedor Mestre da empresa.
   - Todas as compras de prompts feitas por qualquer cliente utilizarão estes dados para gerar o QR Code.

---

## 🔒 Segurança e Perfis de Acesso

- **Perfis Existentes:** `ADMIN` e `CLIENTE`.
- **Rotas Restritas:** Todas as rotas `/api/admin/*` validam o cabeçalho `Authorization: Bearer <token>` e retornam `HTTP 403 Forbidden` para usuários clientes ou não autenticados.
