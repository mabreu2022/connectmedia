const logHistory = [];
const MAX_LOGS = 500;
const sseClients = new Set();

function formatTime(date = new Date()) {
    return date.toLocaleTimeString('pt-BR', { hour12: false });
}

function addLog(fonte, nivel, mensagem) {
    const logEntry = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        timestamp: formatTime(),
        fonte: fonte || 'SERVIDIOR',
        nivel: (nivel || 'INFO').toUpperCase(), // INFO, SUCCESS, WARN, ERROR
        mensagem: typeof mensagem === 'object' ? JSON.stringify(mensagem) : String(mensagem)
    };

    // Mantém no máximo MAX_LOGS entradas na memória
    logHistory.push(logEntry);
    if (logHistory.length > MAX_LOGS) {
        logHistory.shift();
    }

    // Saída no console local
    const icone = logEntry.nivel === 'SUCCESS' ? '✅' : logEntry.nivel === 'ERROR' ? '❌' : logEntry.nivel === 'WARN' ? '⚠️' : 'ℹ️';
    console.log(`[${logEntry.timestamp}] [${logEntry.fonte}] ${icone} ${logEntry.mensagem}`);

    // Transmite para todos os navegadores conectados via SSE
    const payload = `data: ${JSON.stringify(logEntry)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(payload);
        } catch (err) {
            sseClients.delete(client);
        }
    }

    return logEntry;
}

function getLogs() {
    return logHistory;
}

function handleSSE(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Envia o histórico existente assim que conecta
    const initialPayload = `data: ${JSON.stringify({ type: 'INIT', history: logHistory })}\n\n`;
    res.write(initialPayload);

    sseClients.add(res);

    req.on('close', () => {
        sseClients.delete(res);
    });
}

module.exports = {
    addLog,
    getLogs,
    handleSSE,
    info: (fonte, msg) => addLog(fonte, 'INFO', msg),
    success: (fonte, msg) => addLog(fonte, 'SUCCESS', msg),
    warn: (fonte, msg) => addLog(fonte, 'WARN', msg),
    error: (fonte, msg) => addLog(fonte, 'ERROR', msg)
};
