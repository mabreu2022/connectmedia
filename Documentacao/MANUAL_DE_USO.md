# Connect Media — Manual do Usuário

O **Connect Media** é um gerenciador de biblioteca de mídias locais e monitor de canais do YouTube com inteligência artificial para geração de contexto (Skills) para o Antigravity IDE.

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
1. Cole a URL do vídeo do YouTube.
2. Defina o título e idioma (opcional).
3. Clique em **Gerar Skill .md**.
4. O arquivo será criado em `.agents/skills/<nome_do_topico>/SKILL.md`.

---

### 7. 🎓 Skills Aprendidas
Biblioteca visual com todas as Skills já geradas e disponíveis para o Antigravity IDE.
- Exibe o slug da skill (`@slug`), resumo do conteúdo e data de geração.
- **Link do YouTube**: Clique em "Ver no YouTube" para abrir o vídeo fonte.
- **Ler Transcrição**: Abre um modal para leitura completa do Markdown gerado.
