# ⏯️ Connect Media

**Connect Media** é um ecossistema completo e autônomo para monitoramento, descoberta e download gerenciado de vídeos do YouTube. Construído para rodar localmente, o sistema varre canais pré-cadastrados, contorna bloqueios de bot através de cookies reais e permite o agendamento de downloads físicos em uma biblioteca particular classificada por assuntos.

## ✨ Principais Recursos

* **Monitoramento Autônomo:** Varredura periódica de canais cadastrados para descobrir novos vídeos automaticamente.
* **Bypass de Proteção:** Utiliza a extração de `cookies.txt` local para autenticação transparente no YouTube, evitando bloqueios (erro 403 / "Sign in to confirm you're not a bot").
* **Single Page Application (SPA):** Interface de usuário responsiva e fluida com Dark Mode nativo, sem recarregamento de página.
* **Fila de Downloads Real-Time:** Acompanhamento visual da porcentagem de download dos vídeos diretamente pela interface.
* **Acervo Organizado:** Classificação automática de vídeos baixados por assunto com integração de thumbnails em fallback inteligente (Tenta alta resolução, se falhar, gera card CSS estilizado).
* **Configurações Dinâmicas:** Definição da pasta de destino e quantidade de vídeos a varrer diretamente pelo frontend.

## 🛠️ Tecnologias Utilizadas

* **Backend:** Node.js, Express
* **Banco de Dados:** Firebird 5.0 (via `node-firebird`)
* **Core de Extração:** `yt-dlp` integrado por *child_process*
* **Frontend:** HTML5, JavaScript Vanilla, Tailwind CSS
* **Automação de Processos:** Scripts `.bat` e Workers isolados para garantir não-bloqueio (Non-blocking I/O).

## 🚀 Pré-requisitos

Antes de iniciar, certifique-se de ter instalado em sua máquina:

1. [Node.js](https://nodejs.org/) (v16 ou superior)
2. [Firebird 5.0](https://firebirdsql.org/)
3. [yt-dlp.exe](https://github.com/yt-dlp/yt-dlp/releases) (O executável deve estar na pasta raiz do projeto)
4. Extensão de navegador para exportar cookies (ex: *Get cookies.txt LOCALLY*)

## 📦 Instalação e Configuração

1. **Clone o repositório:**
   ```bash
   git clone git@github.com:mabreu2022/connectmedia.git
   cd "Connect Media"

   Instale as dependências:

Bash
npm install
Configuração do Banco de Dados:

Crie o banco de dados Firebird utilizando o script disponível na pasta Database/.

Certifique-se de que o caminho físico do banco (ex: C:\Projetos Antigravity\Connect Media\Database\BIBLIOTECA_YT.FDB) corresponde à configuração no arquivo Server.js e nos workers.

Configuração de Cookies (Importante para evitar bloqueios):

Logado no YouTube no seu navegador, utilize a extensão para exportar seus cookies.

Salve o arquivo como cookies.txt na raiz do projeto.

⚙️ Como Executar
O sistema foi arquitetado em três pilares simultâneos:

Servidor API: Expõe as rotas para o frontend.

Monitor de Canais: Roda em background buscando novos vídeos.

Worker de Download: Fila de execução do yt-dlp.

Para subir todo o ecossistema de uma vez, simplesmente execute o arquivo de lote:

DOS
iniciar_sistema.bat
Em seguida, acesse no seu navegador: http://localhost:3000

📂 Estrutura Básica
Plaintext
/
├── Database/               # Scripts SQL e arquivo .FDB
├── public/                 # Arquivos estáticos (se houver isolamento futuro)
├── downloads/              # Diretório padrão de saída de vídeos
├── index.html              # Interface do Usuário (SPA com Tailwind)
├── Server.js               # Servidor Web e API REST (Express)
├── popular_e_rodar.js      # Worker de Monitoramento do YouTube
├── worker_download.js      # Worker de Execução de Downloads
├── yt-dlp.exe              # Binário de extração de vídeos
├── cookies.txt             # Chave de acesso transparente (Não versionado)
└── iniciar_sistema.bat     # Inicializador Global
📝 Licença
Desenvolvido para uso gerencial e automatização local de acervos