# Twitch VOD Chat Viewer V4

Esta versão **não consulta mais a API da Twitch para descobrir emotes**.

Os emotes são carregados exclusivamente do arquivo `emotes.csv` na raiz do projeto, com o formato:

```csv
type,name,url
emote,LUL,https://static-cdn.jtvnw.net/emoticons/v2/425618/static/dark/3.0
```

Coloque nesse arquivo todos os emotes que deseja reconhecer. O visualizador lê a coluna `name`, procura o nome dentro da coluna `Comment` do CSV/Excel do chat e substitui o nome pela imagem da coluna `url`.

- Não exige URL do VOD.
- Não exige canal da Twitch.
- O tempo é somente informativo.
- Pesquisa por usuário ou palavra.
- Clique no nome para filtrar o usuário.
- Badges continuam sendo buscados para exibição como imagens.
- Emotes são exclusivamente carregados do `emotes.csv`.
- CSV/XLSX do chat continuam sendo aceitos.
