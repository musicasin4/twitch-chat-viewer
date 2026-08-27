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

function loadChatAssetsCsv() {
  const file = path.join(__dirname, 'emotes.csv');
  const emotes = new Map();
  const bits = new Map();
  if (!fs.existsSync(file)) return { emotes, bits };
  const wb = XLSX.readFile(file, { cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  for (const r of rows) {
    const type = String(r.type ?? r.Type ?? '').trim().toLowerCase();
    const name = String(r.name ?? r.Name ?? '').trim();
    const url = String(r.url ?? r.URL ?? r.Url ?? '').trim();
    if (!name || !/^https?:\/\//i.test(url)) continue;
    if (type === 'emote') {
      emotes.set(name, { code: name, url, provider: 'Twitch' });
    } else if (type === 'bits') {
      // In the CSV, names such as cheer1, cheerwhal1, Corgo1 mean the 1-bit form.
      // The trailing 1 is the base asset; the viewer changes the URL path for the tier.
      const baseName = name.replace(/1$/, '').toLowerCase();
      if (baseName) bits.set(baseName, { code: baseName, sourceName: name, url, provider: 'Twitch Bits' });
    }
  }
  return { emotes, bits };
}

const chatAssets = loadChatAssetsCsv();
const emoteMap = chatAssets.emotes;
const bitsMap = chatAssets.bits;
console.log(`Emotes carregados de emotes.csv: ${emoteMap.size}`);
console.log(`Tipos de bits carregados de emotes.csv: ${bitsMap.size}`);
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

const BIT_TIERS = [1, 100, 1000, 5000, 10000, 100000];
function bitTier(amount) {
  if (amount >= 100000) return 100000;
  if (amount >= 10000) return 10000;
  if (amount >= 5000) return 5000;
  if (amount >= 1000) return 1000;
  if (amount >= 100) return 100;
  return 1;
}
function bitColor(amount) {
  if (amount >= 100000) return '#f3a71a';
  if (amount >= 10000) return '#f43021';
  if (amount >= 5000) return '#0099fe';
  if (amount >= 1000) return '#1db2a5';
  if (amount >= 100) return '#9c3ee8';
  return '#979797';
}
function bitUrl(baseUrl, tier) {
  // Twitch Bits animation URLs use /animated/{amount}/3.gif.
  return String(baseUrl).replace(/(\/animated\/)\d+(\/)/i, `$1${tier}$2`);
}
function findBitToken(token, bits) {
  const m = String(token || '').match(/^(.+?)(\d+)$/);
  if (!m) return null;
  const base = m[1].toLowerCase();
  const amount = Number(m[2]);
  if (!Number.isFinite(amount) || amount < 1) return null;
  const asset = bits.get(base);
  if (!asset) return null;
  const tier = bitTier(Math.min(amount, 100000));
  return { type: 'bits', text: token, amount: Math.min(amount, 100000), url: bitUrl(asset.url, tier), color: bitColor(Math.min(amount, 100000)), tier };
}
function tokenize(text, emotes, bits) {
  const s = String(text || '');
  const out=[];
  // Tokenize by whitespace so both emotes and cheer words remain intact.
  const chunks = s.split(/(\s+)/);
  for (const chunk of chunks) {
    if (!chunk) continue;
    if (/^\s+$/.test(chunk)) { out.push({type:'text', text:chunk}); continue; }
    const bit = findBitToken(chunk, bits);
    if (bit) { out.push(bit); continue; }
    const e = emotes.get(chunk) || emotes.get([...emotes.keys()].find(k => k.toLowerCase() === chunk.toLowerCase()));
    if (e) out.push({type:'emote',text:chunk,url:e.url});
    else out.push({type:'text',text:chunk});
  }
  return out.length ? out : [{type:'text',text:s}];
}
app.post('/api/prepare', upload.single('file'), async (req,res) => {
  try {
    if (!req.file) return res.status(400).json({error:'Envie um arquivo CSV ou Excel.'});
    const wb = XLSX.read(req.file.buffer, {type:'buffer', cellDates:true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws,{defval:''}).map(normalizeRow);
    if (!rows.length) return res.status(400).json({error:'Não encontrei mensagens na primeira planilha.'});
    const badges = await getBadges('');
    const data = rows.map(x=>({...x, BadgeImages:resolveBadges(x.Badge,badges), Parts:tokenize(x.Comment,emoteMap,bitsMap)}));
    res.json({ok:true,comments:data,assets:{emotes:emoteMap.size,bits:bitsMap.size,badges:badges.length}});
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
