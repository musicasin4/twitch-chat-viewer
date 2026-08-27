# Twitch VOD Chat Viewer V5

## Emotes e Bits

O arquivo `emotes.csv` agora aceita dois tipos:

```csv
type,name,url
emote,LUL,https://static-cdn.jtvnw.net/emoticons/v2/425618/static/dark/3.0
bits,cheer1,https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/1/3.gif
```

Para Bits, o nome no CSV deve usar `1` como sufixo para indicar o asset-base de 1 bit. Exemplos: `cheer1`, `cheerwhal1`, `Corgo1`, `uni1`, `ShowLove1` etc.

No chat, `Cheer100000`, `cheerwhal1000`, `Corgo5000` etc. são reconhecidos automaticamente. O viewer troca o trecho `/animated/1/` da URL pelo tier correspondente:

- 1–99 → `/animated/1/`
- 100–999 → `/animated/100/`
- 1000–4999 → `/animated/1000/`
- 5000–9999 → `/animated/5000/`
- 10000–99999 → `/animated/10000/`
- 100000 → `/animated/100000/`

As cores do número seguem a Twitch:

- 1–99: `#979797`
- 100–999: `#9c3ee8`
- 1000–4999: `#1db2a5`
- 5000–9999: `#0099fe`
- 10000–99999: `#f43021`
- 100000: `#f3a71a`

Emotes continuam com 28×28 px. O tempo não é clicável e não exige URL de VOD.
