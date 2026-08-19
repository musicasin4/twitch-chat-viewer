const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
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

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Twitch-Chat-Viewer/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function vodIdFromUrl(v) {
  const s = String(v || '').trim();
  const m = s.match(/(?:twitch\.tv\/videos\/|twitch\.tv\/[^/]+\/v\/)(\d+)/i) || s.match(/^(\d+)$/);
  return m ? m[1] : '';
}

async function getVodMeta(vodId) {
  const d = await gql(`query{video(id:"${vodId}"){id,title,createdAt,owner{id,login,displayName}}}`);
  return d.video || {};
}

async function getAssets(ownerId) {
  const badges = new Map();
  const emotes = new Map();
  const addBadge = b => {
    const set = String(b?.setID ?? b?.setId ?? '').trim().toLowerCase();
    const version = String(b?.version ?? '').trim();
    const url = String(b?.imageURL ?? b?.imageUrl ?? b?.image_url ?? '').trim();
    if (set && version && url) badges.set(`${set}:${version}`, { setId: set, version, title: b.title || set, url });
  };
  try {
    const d = await gql(`query{badges{imageURL(size:DOUBLE),title,setID,version}}`);
    (d.badges || []).forEach(addBadge);
  } catch(e) { console.warn('badges', e.message); }
  if (ownerId) {
    try {
      const d = await gql(`query{user(id:"${ownerId}"){broadcastBadges{imageURL(size:DOUBLE),title,setID,version}}}`);
      (d.user?.broadcastBadges || []).forEach(addBadge);
    } catch(e) { console.warn('channel badges', e.message); }
  }

  const addEmote = (code, url, provider) => {
    if (code && url && !emotes.has(code)) emotes.set(code, { code, url, provider });
  };
  const tasks = [
    getJson('https://api.betterttv.net/3/cached/emotes/global').then(a => a.forEach(e => addEmote(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`, 'BTTV'))).catch(()=>{}),
    getJson('https://api.betterttv.net/3/cached/frankerfacez/emotes/global').then(a => a.forEach(e => addEmote(e.code, e.animated ? `https://cdn.betterttv.net/frankerfacez_emote/${e.id}/animated/2` : `https://cdn.betterttv.net/frankerfacez_emote/${e.id}/2`, 'FFZ'))).catch(()=>{}),
    getJson('https://7tv.io/v3/emote-sets/global').then(x => (x.emotes || []).forEach(e => {
      const f = (e.data?.host?.files || []).find(x => String(x.format).toLowerCase() === 'webp') || e.data?.host?.files?.[0];
      if (f && e.data?.host?.url) addEmote(e.name, `https:${e.data.host.url}/2x.${f.format}`, '7TV');
    })).catch(()=>{})
  ];
  if (ownerId) {
    tasks.push(getJson(`https://api.betterttv.net/3/cached/users/twitch/${ownerId}`).then(x => { [...(x.channelEmotes || []), ...(x.sharedEmotes || [])].forEach(e => addEmote(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`, 'BTTV')); }).catch(()=>{}));
    tasks.push(getJson(`https://api.betterttv.net/3/cached/frankerfacez/users/twitch/${ownerId}`).then(a => { a.forEach(e => addEmote(e.code, e.animated ? `https://cdn.betterttv.net/frankerfacez_emote/${e.id}/animated/2` : `https://cdn.betterttv.net/frankerfacez_emote/${e.id}/2`, 'FFZ')); }).catch(()=>{}));
    tasks.push(getJson(`https://7tv.io/v3/users/twitch/${ownerId}`).then(async x => {
      if (!x.emote_set_id) return;
      const set = await getJson(`https://7tv.io/v3/emote-sets/${x.emote_set_id}`);
      (set.emotes || []).forEach(e => {
        const f = (e.data?.host?.files || []).find(x => String(x.format).toLowerCase() === 'webp') || e.data?.host?.files?.[0];
        if (f && e.data?.host?.url) addEmote(e.name, `https:${e.data.host.url}/2x.${f.format}`, '7TV');
      });
    }).catch(()=>{}));
  }
  await Promise.all(tasks);
  return { badges: [...badges.values()], emotes: [...emotes.values()] };
}

function badgeNameCandidates(name) {
  const s = String(name || '').trim().toLowerCase();
  const m = s.match(/subscriber(?:\s+|[-_])?(\d+)?/i);
  if (m) return [{set:'subscriber', version:m[1] || '1'}];
  const map = {
    moderator:'moderator', mod:'moderator', vip:'vip', broadcaster:'broadcaster', partner:'partner', founder:'founder', staff:'staff', admin:'admin', global_mod:'global_mod', turbo:'turbo', prime:'premium', premium:'premium', bits:'bits', artist:'artist'
  };
  const set = map[s.replace(/\s+/g,'_')];
  return set ? [{set, version:'1'}] : [];
}

function resolveBadges(raw, badgeAssets) {
  const names = String(raw || '').split('|').map(x=>x.trim()).filter(Boolean);
  const out=[];
  for (const name of names) {
    let found = badgeAssets.find(b => b.title.toLowerCase() === name.toLowerCase());
    if (!found) {
      for (const c of badgeNameCandidates(name)) { found = badgeAssets.find(b => b.setId === c.set && b.version === c.version); if (found) break; }
    }
    out.push({ name, url: found?.url || '', title: found?.title || name });
  }
  return out;
}

function parseTime(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim();
  if (!s) return 0;
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (m) return Number(m[1])*3600 + Number(m[2])*60 + Number(m[3]) + Number(`0.${m[4] || 0}`);
  const m2 = s.match(/^(\d+):(\d{2})$/);
  if (m2) return Number(m2[1])*60 + Number(m2[2]);
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

app.post('/api/prepare', upload.single('file'), async (req,res) => {
  try {
    if (!req.file) return res.status(400).json({ error:'Envie um arquivo CSV ou Excel.' });
    const vodId = vodIdFromUrl(req.body.vodUrl || '');
    if (!vodId) return res.status(400).json({ error:'Informe a URL ou ID do VOD para ativar os links de tempo e buscar badges/emotes do canal.' });
    const wb = XLSX.read(req.file.buffer, { type:'buffer', cellDates:true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval:'' }).map(normalizeRow);
    if (!rows.length) return res.status(400).json({ error:'Não encontrei mensagens na primeira planilha.' });
    const vod = await getVodMeta(vodId);
    const assets = await getAssets(vod.owner?.id || '');
    const badgeByName = assets.badges;
    const emoteMap = Object.fromEntries(assets.emotes.map(e => [e.code, e]));
    const data = rows.map(x => ({ ...x, BadgeImages: resolveBadges(x.Badge, badgeByName), Parts: tokenize(x.Comment, emoteMap) }));
    res.json({ ok:true, vod:{id:vodId,title:vod.title||'',owner:vod.owner||{},createdAt:vod.createdAt||''}, comments:data, assets:{emotes:assets.emotes.length,badges:assets.badges.length} });
  } catch(e) { console.error(e); res.status(500).json({ error:e.message || 'Erro ao processar arquivo.' }); }
});

function tokenize(text, map) {
  const s=String(text||''); const codes=Object.keys(map).sort((a,b)=>b.length-a.length); if(!codes.length) return [{type:'text',text:s}];
  const esc=codes.map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')); const re=new RegExp(`(^|\\s)(${esc.join('|')})(?=$|\\s)`,'g');
  const out=[]; let last=0,m; while((m=re.exec(s))){ if(m.index>last) out.push({type:'text',text:s.slice(last,m.index)}); if(m[1]) out.push({type:'text',text:m[1]}); out.push({type:'emote',text:m[2],url:map[m[2]].url}); last=re.lastIndex; } if(last<s.length) out.push({type:'text',text:s.slice(last)}); return out.length?out:[{type:'text',text:s}];
}

app.get('/api/image', async (req,res)=>{
  try { const u=new URL(String(req.query.url||'')); const allowed=['static-cdn.jtvnw.net','cdn.betterttv.net','7tv.io','cdn.7tv.app','cdn.frankerfacez.com','emotes.7tv.app']; if(!allowed.includes(u.hostname)) return res.status(403).end(); const r=await fetch(u,{headers:{'User-Agent':'Twitch-Chat-Viewer/1.0'}}); if(!r.ok) return res.status(r.status).end(); res.set('Content-Type',r.headers.get('content-type')||'image/png');res.set('Cache-Control','public,max-age=86400');res.send(Buffer.from(await r.arrayBuffer())); } catch(e){res.status(502).end();}
});

app.listen(PORT,()=>console.log(`Twitch Chat Viewer listening on ${PORT}`));
