const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const PORT = process.env.PORT || 10000;
const CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'kimne78kx3ncx6brgo4mv6wki5h1ko';

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function gql(query) {
  const r = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-ID': CLIENT_ID },
    body: JSON.stringify({ query, variables: {} })
  });
  if (!r.ok) throw new Error(`Twitch GraphQL HTTP ${r.status}`);
  const d = await r.json();
  if (d.errors?.length) throw new Error(d.errors[0].message || 'Twitch GraphQL error');
  return d.data || {};
}

function loadEmotesCsv() {
  const file = path.join(__dirname, 'emotes.csv');
  if (!fs.existsSync(file)) return new Map();
  const wb = XLSX.readFile(file, { cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const map = new Map();
  for (const r of rows) {
    const type = String(r.type ?? r.Type ?? '').trim().toLowerCase();
    const name = String(r.name ?? r.Name ?? '').trim();
    const url = String(r.url ?? r.URL ?? r.Url ?? '').trim();
    if (
  (type === 'emote' || type === 'bits') &&
  name &&
  /^https?:\/\//i.test(url)
) {
  map.set(name, {
    code: name,
    url,
    type,
    provider: type === 'bits' ? 'Twitch Bits' : 'Twitch'
  });
}
  }
  return map;
}

const emoteMap = loadEmotesCsv();
console.log(`Emotes carregados de emotes.csv: ${emoteMap.size}`);

function addBadge(b, map) {
  const set = String(b?.setID ?? b?.setId ?? '').trim().toLowerCase();
  const version = String(b?.version ?? '').trim();
  const url = String(b?.imageURL ?? b?.imageUrl ?? b?.image_url ?? '').trim();
  if (set && version && url) map.set(`${set}:${version}`, { setId: set, version, title: b.title || set, url });
}

async function getBadges(ownerId) {
  const map = new Map();
  try {
    const d = await gql(`query{badges{imageURL(size:DOUBLE),title,setID,version}}`);
    (d.badges || []).forEach(b => addBadge(b, map));
  } catch (e) { console.warn('badges:', e.message); }
  if (ownerId) {
    try {
      const d = await gql(`query{user(id:${JSON.stringify(String(ownerId))}){broadcastBadges{imageURL(size:DOUBLE),title,setID,version}}}`);
      (d.user?.broadcastBadges || []).forEach(b => addBadge(b, map));
    } catch (e) { console.warn('channel badges:', e.message); }
  }
  return [...map.values()];
}

function badgeNameCandidates(name) {
  const s = String(name || '').trim().toLowerCase();
  const sub = s.match(/^subscriber(?:\s+|[-_])?(\d+)?/i);
  if (sub) return [{ set: 'subscriber', version: sub[1] || '1' }];
  const map = { moderator:'moderator', mod:'moderator', vip:'vip', broadcaster:'broadcaster', partner:'partner', founder:'founder', staff:'staff', admin:'admin', global_mod:'global_mod', turbo:'turbo', prime:'premium', premium:'premium', bits:'bits', artist:'artist', predictions:'predictions' };
  const set = map[s.replace(/\s+/g, '_')];
  return set ? [{ set, version:'1' }] : [];
}

function resolveBadges(raw, badgeAssets) {
  const names = String(raw || '').split('|').map(x => x.trim()).filter(Boolean);
  return names.map(name => {
    let found = badgeAssets.find(b => b.title.toLowerCase() === name.toLowerCase());
    if (!found) {
      for (const c of badgeNameCandidates(name)) {
        found = badgeAssets.find(b => b.setId === c.set && b.version === c.version);
        if (found) break;
      }
    }
    return { name, url: found?.url || '', title: found?.title || name };
  });
}

function parseTime(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim();
  if (!s) return 0;
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  let m = s.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (m) return Number(m[1])*3600 + Number(m[2])*60 + Number(m[3]) + Number(`0.${m[4] || 0}`);
  m = s.match(/^(\d+):(\d{2})$/);
  if (m) return Number(m[1])*60 + Number(m[2]);
  return 0;
}

function normalizeRow(r) {
  const get=(...keys)=>{for(const k of keys){if(r[k] !== undefined && r[k] !== null) return r[k];}return '';};
  return {
    Date: String(get('Date','date','posted_at') || ''),
    time: parseTime(get('Comment video time','Comment Video Time','timestamp','time')),
    Badge: String(get('Badge','badges') || ''),
    Name: String(get('Name','name','display_name','username') || ''),
    Color: String(get('Color','color') || ''),
    Comment: String(get('Comment','comment','message') || '')
  };
}

function getBitsAmount(name) {
  const match = String(name).match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function getBitsBaseName(name) {
  return String(name).replace(/\d+$/, '');
}

function getBitsTier(amount) {
  if (amount >= 100000) return 100000;
  if (amount >= 10000) return 10000;
  if (amount >= 5000) return 5000;
  if (amount >= 1000) return 1000;
  if (amount >= 100) return 100;

  return 1;
}

function getBitsColor(amount) {
  if (amount >= 100000) return '#f3a71a';
  if (amount >= 10000) return '#f43021';
  if (amount >= 5000) return '#0099fe';
  if (amount >= 1000) return '#1db2a5';
  if (amount >= 100) return '#9c3ee8';

  return '#979797';
}

function tokenize(text, map) {
  const s = String(text || '');

  if (!map.size) {
    return [{ type: 'text', text: s }];
  }

  const codes = [...map.keys()].sort((a, b) => b.length - a.length);

  const escaped = codes.map(code =>
    code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );

  const re = new RegExp(
    `(^|\\s)(${escaped.join('|')})(?=$|\\s)`,
    'gi'
  );

  const out = [];
  let last = 0;
  let match;

  while ((match = re.exec(s))) {
    if (match.index > last) {
      out.push({
        type: 'text',
        text: s.slice(last, match.index)
      });
    }

    if (match[1]) {
      out.push({
        type: 'text',
        text: match[1]
      });
    }

    const code = match[2];

    const data =
      map.get(code) ||
      map.get(
        [...map.keys()].find(
          key => key.toLowerCase() === code.toLowerCase()
        )
      );

    if (!data) {
      out.push({
        type: 'text',
        text: code
      });

      last = re.lastIndex;
      continue;
    }

    if (data.type === 'bits') {
  const amount = getBitsAmount(data.code);

  const baseName = getBitsBaseName(data.code);

  const tier = getBitsTier(amount);

  // Procura a imagem correspondente à faixa do bit.
  // Exemplo:
  // Cheer99 -> Cheer1
  // Cheer100 -> Cheer100
  // Cheer1000 -> Cheer1000
  const imageName = `${baseName}${tier}`;

  const imageData =
    map.get(imageName) ||
    map.get(
      [...map.keys()].find(
        key => key.toLowerCase() === imageName.toLowerCase()
      )
    );

  out.push({
    type: 'bits',
    text: data.code,
    amount,
    color: getBitsColor(amount),
    url: imageData?.url || data.url
  });
}
}olor: getBitsColor(amount)
      });
    } else {
      out.push({
        type: 'emote',
        text: code,
        url: data.url
      });
    }

    last = re.lastIndex;
  }

  if (last < s.length) {
    out.push({
      type: 'text',
      text: s.slice(last)
    });
  }

  return out.length
    ? out
    : [{ type: 'text', text: s }];
}

app.post('/api/prepare', upload.single('file'), async (req,res) => {
  try {
    if (!req.file) return res.status(400).json({error:'Envie um arquivo CSV ou Excel.'});
    const wb = XLSX.read(req.file.buffer, {type:'buffer', cellDates:true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws,{defval:''}).map(normalizeRow);
    if (!rows.length) return res.status(400).json({error:'Não encontrei mensagens na primeira planilha.'});
    const badges = await getBadges('');
    const data = rows.map(x=>({...x, BadgeImages:resolveBadges(x.Badge,badges), Parts:tokenize(x.Comment,emoteMap)}));
    res.json({ok:true,comments:data,assets:{emotes:emoteMap.size,badges:badges.length}});
  } catch(e) { console.error(e); res.status(500).json({error:e.message||'Erro ao processar arquivo.'}); }
});

app.get('/api/image', async (req,res)=>{
  try {
    const u=new URL(String(req.query.url||''));
    const allowed=['static-cdn.jtvnw.net','cdn.betterttv.net','7tv.io','cdn.7tv.app','cdn.frankerfacez.com','emotes.7tv.app'];
    if(!allowed.includes(u.hostname)) return res.status(403).end();
    const r=await fetch(u,{headers:{'User-Agent':'Twitch-Chat-Viewer/3.0'}});
    if(!r.ok) return res.status(r.status).end();
    res.set('Content-Type',r.headers.get('content-type')||'image/png');
    res.set('Cache-Control','public,max-age=86400');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch(e){res.status(502).end();}
});

app.get('/api/emotes/status',(req,res)=>res.json({count:emoteMap.size,source:'emotes.csv'}));

app.listen(PORT,()=>console.log(`Twitch Chat Viewer listening on ${PORT}`));
