# V6 — correção das imagens dos Bits

- Corrigido o reconhecimento de linhas como `bits,ShowLove100,...`: o número no nome é tratado como a quantidade/tier do Bit.
- O caminho da ação agora é preservado: `showlove` continua `showlove`, `cheer` continua `cheer`, etc.
- Adicionado `d3aqoihi2n8ty8.cloudfront.net` à lista de domínios permitidos pelo proxy de imagens.
- Assim, `ShowLove100` usa `https://d3aqoihi2n8ty8.cloudfront.net/actions/showlove/dark/animated/100/3.gif` e o valor `100` mantém a cor da faixa de 100 Bits.
- Adicionado um exemplo `ShowLove100` ao `emotes.csv`.
