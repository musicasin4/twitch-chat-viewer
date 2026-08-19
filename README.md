# Twitch VOD Chat Viewer

Página para Render que importa o CSV/XLSX produzido pelo Twitch VOD Chat Exporter e exibe o chat em estilo escuro inspirado no Twitch.

## Recursos
- CSV, XLSX e XLS;
- badges como imagens;
- emotes Twitch, BTTV, FFZ e 7TV quando encontrados;
- nome de exibição e cor do usuário;
- pesquisa por usuário ou palavra;
- clique no usuário para filtrar;
- clique no timestamp para abrir o VOD em outra aba exatamente no ponto da mensagem;
- tempo do VOD, hora real de Brasília e data/hora real;
- URL do VOD informada no carregamento.

## Render
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: `Node`
- Opcional: `TWITCH_CLIENT_ID` com o Client-ID da aplicação Twitch usada no projeto anterior.
