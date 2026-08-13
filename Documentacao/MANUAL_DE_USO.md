# Connect Media — Manual do Usuário

O **Connect Media** é um gerenciador de biblioteca de mídias locais, monitor de canais do YouTube e sistema de inteligência artificial para geração de contexto (Skills) para o Antigravity IDE.

---

## 📱 Seções da Aplicação

### 1. 🔍 Descoberta / Pendentes
Exibe novos vídeos encontrados nos canais monitorados aguardando a decisão de download.
- **Seleção Individual ou em Massa**: Clique no card para marcar os vídeos ou use o botão **Marcar Todos**.
- **Escolha do Formato para Download**:
  - 🎥 **MP4 (Vídeo)**: Baixa o vídeo completo em formato MP4.
  - 🎵 **MP3 (Áudio)**: Extrai apenas a faixa de áudio em formato MP3 (qualidade máxima).
- **Ações Individuais nos Cards**: Cada vídeo contém botões diretos `MP4` e `MP3`.
- **Limpar Tudo**: Remove todos os vídeos da lista de descoberta de uma só vez.

---

### 2. 📁 Acervo Baixado
Armazena todos os conteúdos que já foram baixados para o computador.
- Permite assistir aos vídeos ou ouvir aos áudios diretamente no aplicativo via player embutido.
- Filtro por canal ou busca textual por palavra-chave.

---

### 3. 📺 Canais Monitorados
Gerencia a lista de canais do YouTube acompanhados pelo sistema.
- **Adicionar Novo Canal**: Insira a URL do canal do YouTube (ex: `https://www.youtube.com/@CanalTech`).
- **Atualizar Agora**: Força o monitor a realizar uma varredura imediata.
- **Excluir Canal**: Remove o canal e desvincula seus conteúdos.

---

### 4. 📥 Fila de Downloads
Acompanhamento do progresso em tempo real das transferências físicas executadas pelo `worker_download.js`.
- Atualização automática do percentual de download a cada 3 segundos.
- Status do ciclo: `DOWNLOAD_AGENDADO` → `BAIXANDO` → `DOWNLOAD_CONCLUIDO`.

---

### 5. ⚙️ Configurações
Ajustes globais do aplicativo:
- **Pasta de Downloads**: Diretório onde os arquivos `.mp4` e `.mp3` serão salvos.
- **Quantidade de Vídeos por Buscas**: Quantos vídeos recentes o monitor verifica por canal.
- **Tipos de Conteúdo**: Filtro para Vídeos Normais, Shorts e Lives.
- **Intervalo de Varredura**: Tempo em minutos entre as buscas automáticas.

---

### 6. 🧠 Gerador de Skills para Antigravity
Ferramenta de IA para transformar vídeos técnicos em conhecimento estruturado para o agente Antigravity.

#### ⚡ Recursos Avançados:
- **Auto-Preenchimento Instantâneo do Título**: Ao colar uma URL no campo de Vídeo Único, o título do vídeo é obtido automaticamente em `< 100ms`.
- **Geração em Lote (Múltiplas URLs)**: Alterne para a aba **`📋 Processar em Lote`** e insira uma lista de URLs do YouTube (uma por linha) para gerar todas as skills em sequência.
- **Estruturação Inteligente para IA**: Extração automática de **comandos CLI (`npm`, `git`, `docker`, `SQL`, etc.)**, **passo a passo numerado** e **diretivas de contextualização** (`@slug`).
- **Transcrição Offline via Whisper**: Quando o vídeo não tem legendas, o áudio é transcrito localmente via Whisper AI (100% gratuito e offline).

---

### 7. 🎓 Skills Aprendidas
Biblioteca visual com todas as Skills já geradas e disponíveis para o Antigravity IDE.
- **Exibição do Diretório Exato no Disco**: Exibe o caminho absoluto do arquivo `.md` (ex: `D:\Projetos AntiGravity\Connect Media\.agents\skills\<slug>\SKILL.md`).
- **Copiar Caminho**: Botão direto para copiar a localização física do arquivo para a área de transferência.
- **Assistir no YouTube**: Link direto para abrir o vídeo fonte no navegador.
- **Ler Conteúdo**: Modal interativo para visualizar todo o Markdown estruturado sem abrir o arquivo externamente.
