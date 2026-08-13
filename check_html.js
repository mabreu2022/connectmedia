const http = require('http');
http.get('http://localhost:3000', res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const nomeCount = (data.match(/modal-nome/g) || []).length;
        const canalCount = (data.match(/id="modal-canal"/g) || []).length;
        const btnCount = (data.match(/btn-adicionar-canal/g) || []).length;
        const scriptCount = (data.match(/abrirCanal/g) || []).length;
        console.log('modal-nome ocorrencias:', nomeCount);
        console.log('id=modal-canal ocorrencias:', canalCount);
        console.log('btn-adicionar-canal ocorrencias:', btnCount);
        console.log('abrirCanal ocorrencias:', scriptCount);
        // Verifica se o script esta no final do html
        const posBody = data.lastIndexOf('</body>');
        const posScript = data.lastIndexOf('abrirCanal');
        console.log('posicao </body>:', posBody, ' | posicao abrirCanal:', posScript);
        console.log('Script esta DEPOIS do body?', posScript > posBody ? 'SIM' : 'NAO');
    });
});
