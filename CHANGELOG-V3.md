# V3

- Removida a consulta da API Twitch para emotes globais e de canal.
- Removido o campo Canal da Twitch.
- Adicionado `emotes.csv` na raiz do projeto.
- Emotes são associados pelo `name` e renderizados pela URL do CSV.
- O formato esperado é `type,name,url`.
- Mantidos pesquisa, filtros, badges e modos de tempo.
