import { startGame, toast, initScene, makePreviews, music } from './game.js';
import { PROP_TYPES, SKIN_IDS, PROP_INFO } from './props.js';

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'ph_token';

let token = null;
let profile = null;
let shopCache = null;
let IMG = {};
let roomTimer = null;

const LANG_KEY = 'ph_lang';
let lang = 'th';
try { lang = localStorage.getItem(LANG_KEY) || 'th'; } catch (e) {}

const I18N = {
  th: {
    join: 'เข้าร่วมเกม', roomNo: 'ห้อง {n}', roomEmpty: 'ห้องนี้ยังไม่มีใคร กดเข้าร่วมเกมเพื่อเปิดห้อง',
    roomIdle: 'กำลังรอผู้เล่น',
    rHide: 'ทีมซ่อน', rSeek: 'ทีมหา', rOut: 'ถูกจับ', rWait: 'รอรอบหน้า',
    tabSeek: 'ทีมค้นหา', tabHide: 'ทีมซ่อนแอบ', tabShop: 'ร้านค้า',
    tabSwitch: 'เปลี่ยนห้อง', tabRoom: 'ห้อง', tabOpt: 'ตัวเลือก',
    language: 'ภาษา', avatar: 'รูปประจำตัว', friends: 'เพื่อน', logout: 'ออกจากระบบ',
    picked: 'เลือก {r} แล้ว กดเข้าร่วมเกมได้เลย',
  },
  en: {
    join: 'Join game', roomNo: 'Room {n}', roomEmpty: 'Nobody here yet — press join to open it',
    roomIdle: 'Waiting for players',
    rHide: 'Hiding', rSeek: 'Seeking', rOut: 'Caught', rWait: 'Next round',
    tabSeek: 'Seekers', tabHide: 'Hiders', tabShop: 'Shop',
    tabSwitch: 'Switch room', tabRoom: 'Rooms', tabOpt: 'Options',
    language: 'Language', avatar: 'Avatar', friends: 'Friends', logout: 'Log out',
    picked: 'Picked {r} — press join when ready',
  },
};

function t(key, vars) {
  let v = (I18N[lang] && I18N[lang][key]) || (I18N.th[key] || key);
  if (vars) for (const k in vars) v = v.replace('{' + k + '}', vars[k]);
  return v;
}

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('#langRow button').forEach((b) => {
    b.classList.toggle('on', b.dataset.lang === lang);
  });
  paintTopRoom();
}

document.querySelectorAll('#langRow button').forEach((b) => {
  b.onclick = () => {
    lang = b.dataset.lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    applyLang();
  };
});

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function api(path, body, method) {
  const opt = { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' } };
  if (token) opt.headers.Authorization = 'Bearer ' + token;
  if (body) opt.body = JSON.stringify(body);
  let res, json;
  try { res = await fetch('/api' + path, opt); }
  catch (e) { throw new Error('ต่อเซิร์ฟเวอร์ไม่ได้'); }
  try { json = await res.json(); } catch (e) { json = {}; }
  if (!res.ok) throw new Error(json.error || 'ผิดพลาด (' + res.status + ')');
  return json;
}

/* ------------------------------------------------------------------ */
/* สลับหน้าและแผง                                                       */
/* ------------------------------------------------------------------ */

function showScreen(id) {
  for (const s of ['auth', 'lobby']) $(s).classList.toggle('hidden', s !== id);
  if (id !== 'lobby') stopRoomPoll();
  else startRoomPoll();
}

const PANELS = ['pHide', 'pSeek', 'pShop', 'pRooms', 'pOptions'];
let curPanel = null;

function showPanel(id) {
  const same = curPanel === id;
  curPanel = same ? null : id;
  for (const p of PANELS) $(p).classList.toggle('hidden', p !== curPanel);
  for (const b of document.querySelectorAll('[data-panel]')) {
    b.classList.toggle('on', b.dataset.panel === curPanel);
  }
  if (curPanel === 'pHide' || curPanel === 'pSeek' || curPanel === 'pShop') loadShop();
  if (curPanel === 'pRooms') loadRooms();
  if (curPanel === 'pOptions') { loadFriends(); loadAvatars(); loadAd(); }
}
document.querySelectorAll('[data-panel]').forEach((b) => {
  b.onclick = () => {
    if (b.dataset.panel === 'pRooms') { showPanel(null); openRoomAsk(); return; }
    showPanel(b.dataset.panel);
  };
});
$('panelClose').onclick = () => showPanel(null);

/* ------------------------------------------------------------------ */
/* เข้าสู่ระบบ                                                          */
/* ------------------------------------------------------------------ */

let mode = 'login';
function setMode(m) {
  mode = m;
  $('tabLogin').classList.toggle('on', m === 'login');
  $('tabReg').classList.toggle('on', m === 'register');
  $('auGo').textContent = m === 'login' ? 'เข้าสู่ระบบ' : 'สมัครและเริ่มเล่น';
  $('auMsg').textContent = '';
}
$('tabLogin').onclick = () => setMode('login');
$('tabReg').onclick = () => setMode('register');

async function submitAuth() {
  const name = $('auName').value.trim();
  const pw = $('auPw').value;
  $('auMsg').textContent = '';
  $('auGo').disabled = true;
  try {
    const r = await api('/' + mode, { name, pw });
    setSession(r.token, r.profile);
  } catch (e) {
    $('auMsg').textContent = e.message;
    $('auMsg').className = 'msg bad';
  } finally { $('auGo').disabled = false; }
}
$('auGo').onclick = submitAuth;
$('auPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
$('auName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('auPw').focus(); });

$('auGuest').onclick = async () => {
  try {
    const r = await api('/guest', { name: $('auName').value.trim() });
    setSession(r.token, r.profile);
    toast('เล่นแบบผู้มาเยือน ทองกับของที่สุ่มได้จะไม่ถูกเก็บถาวร');
  } catch (e) {
    $('auMsg').textContent = e.message;
    $('auMsg').className = 'msg bad';
  }
};

function setSession(t, p) {
  token = t;
  profile = p;
  shopCache = null;
  try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {}
  paintProfile();
  showScreen('lobby');
  showPanel(null);
}

$('meAvatar').onclick = () => showPanel('pOptions');
$('btnLogout2').onclick = () => doLogout();
$('btnLogout').onclick = () => doLogout();
async function doLogout() {
  try { await api('/logout', {}); } catch (e) {}
  token = null; profile = null; shopCache = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  showScreen('auth');
}

/* ------------------------------------------------------------------ */
/* แถบบน                                                               */
/* ------------------------------------------------------------------ */

function paintProfile() {
  if (!profile) return;
  const s = profile.stats || {};
  const lv = profile.level || 1;
  const cur = profile.xpInLevel || 0;
  const per = profile.xpPerLevel || 600;
  $('meLv').textContent = 'Lv.' + lv;
  $('meAvatarEmoji').textContent = profile.avatar || '🙂';
  const av = $('meAvatar');
  if (profile.avatarImg) {
    av.classList.add('hasimg');
    av.style.backgroundImage = `url(${profile.avatarImg})`;
  } else {
    av.classList.remove('hasimg');
    av.style.backgroundImage = '';
  }
  $('xpFill').style.width = Math.round((cur / per) * 100) + '%';
  $('xpText').textContent = cur + ' / ' + per;
  $('meName').textContent = profile.name + (profile.guest ? ' (ชั่วคราว)' : '');
  $('meGold').textContent = profile.gold;
  $('meStats').textContent = `เล่น ${s.games || 0} · ชนะ ${s.wins || 0} · จับได้ ${s.catches || 0} · สูงสุด ${s.best || 0}`;
}

async function refreshProfile() {
  try {
    const r = await api('/me');
    profile = r.profile;
    shopCache = null;
    paintProfile();
  } catch (e) { /* ไม่เป็นไร */ }
}

/* ตัวเลขบนหัวจอ ดึงจากห้องที่คนเยอะที่สุดที่กำลังเล่นอยู่ */
let roomsCache = [];
let pickedRoom = null;      // ห้องที่เล็งไว้ กดเข้าร่วมเกมแล้วจะเข้าห้องนี้

const PHASE_SHORT = { lobby: 'lobbyWait', hide: 'phHide', hunt: 'phHunt', end: 'phEnd' };

function firstFreeRoomId() {
  const used = new Set(roomsCache.filter((x) => x.players >= x.max).map((x) => x.id));
  for (let i = 1; i <= 200; i++) if (!used.has('ห้อง ' + i)) return 'ห้อง ' + i;
  return 'ห้อง 1';
}

function paintTopRoom() {
  if (!pickedRoom) pickedRoom = (roomsCache[0] && roomsCache[0].id) || firstFreeRoomId();
  const show = roomsCache.find((x) => x.id === pickedRoom) || null;
  const no = (/(\d+)/.exec(pickedRoom) || [])[1] || '1';

  $('topRoom').textContent = t('roomNo', { n: no });
  $('lobRoom').textContent = t('roomNo', { n: no });
  $('topHiders').textContent = show ? show.hiders : 0;
  $('topSeekers').textContent = show ? show.seekers : 0;
  $('topTimer').textContent = show ? fmt(show.tl) : '--:--';

  // รายชื่อผู้เล่นในห้องที่เลือกอยู่
  $('rpTitle').textContent = t('roomNo', { n: no });
  $('rpCount').textContent = show ? `${show.players + show.bots}/${show.max}` : `0/30`;
  const list = (show && show.roster) || [];
  const box = $('rpList');
  if (!list.length) {
    box.innerHTML = `<p class="rpempty">${t(show ? 'roomIdle' : 'roomEmpty')}</p>`;
    return;
  }
  const RL = { hider: 'rHide', seeker: 'rSeek', out: 'rOut', wait: 'rWait' };
  const CLS = { hider: 'hide', seeker: 'seek', out: 'gone', wait: 'gone' };
  box.innerHTML = list.map((p) => `<div class="rprow">`
    + `<b class="lv">Lv.${p.lv || 1}</b>`
    + `<span class="nm">${esc(p.n)}</span>`
    + `<span class="rl ${CLS[p.r] || ''}">${t(RL[p.r] || 'rHide')}</span></div>`).join('');
}

async function pollRooms() {
  try {
    const r = await api('/rooms');
    roomsCache = r.rooms;
    paintTopRoom();
  } catch (e) { /* เงียบไว้ */ }
}
const fmt = (t) => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
function startRoomPoll() {
  stopRoomPoll();
  pollRooms();
  roomTimer = setInterval(pollRooms, 3000);
}
function stopRoomPoll() { if (roomTimer) { clearInterval(roomTimer); roomTimer = null; } }

/* ------------------------------------------------------------------ */
/* รายการของและสกิน                                                     */
/* ------------------------------------------------------------------ */

const TIER_CLASS = { 'ธรรมดา': 't0', 'ไม่ธรรมดา': 't1', 'หายาก': 't2', 'พิเศษ': 't3' };

async function loadShop(force) {
  if (shopCache && !force) { paintShop(); return; }
  try {
    shopCache = await api('/shop');
    if (profile) { profile.gold = shopCache.gold; paintProfile(); }
    paintShop();
  } catch (e) {
    $('propGrid').innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

function card(it, imgKey, idx) {
  const d = document.createElement('div');
  d.className = 'card2 ' + (TIER_CLASS[it.tier] || 't0') + (it.owned ? '' : ' locked');
  const img = IMG[imgKey];
  const pic = img
    ? `<img src="${img}" alt="">`
    : '<div class="noimg"></div>';
  d.innerHTML = `<span class="idx">${idx}</span>
    <div class="pic">${pic}${it.owned ? '' : '<span class="q">?</span>'}</div>
    <b>${it.owned ? esc(it.name) : 'อะไรเอ่ย'}</b>
    <em>${esc(it.tier)} · ${it.chance}%</em>`;
  return d;
}

function paintShop() {
  if (!shopCache) return;
  const items = shopCache.items;
  const skins = shopCache.skins || [];

  $('hideCount').textContent = `${items.filter((i) => i.owned).length} / ${items.length}`;
  // ของแยกตามด่าน ไม่ปนกัน
  const mallItems = items.filter((i) => i.map !== 'zoo');
  const zooItems = items.filter((i) => i.map === 'zoo');
  $('hideCountMall').textContent = `${mallItems.filter((i) => i.owned).length} / ${mallItems.length}`;
  $('hideCountZoo').textContent = `${zooItems.filter((i) => i.owned).length} / ${zooItems.length}`;
  $('propGrid').innerHTML = '';
  mallItems.forEach((it, i) => $('propGrid').appendChild(card(it, it.id, i + 1)));
  $('propGridZoo').innerHTML = '';
  zooItems.forEach((it, i) => $('propGridZoo').appendChild(card(it, it.id, i + 1)));

  $('skinCount').textContent = `${skins.filter((s) => s.owned).length} / ${skins.length}`;
  $('skinGrid').innerHTML = '';
  skins.forEach((sk, i) => {
    const d = card(sk, 'skin:' + sk.id, i + 1);
    if (sk.owned) {
      const btn = document.createElement('button');
      btn.className = 'mini' + (sk.selected ? ' ok' : '');
      btn.textContent = sk.selected ? 'ใช้อยู่' : 'ใช้สกินนี้';
      btn.disabled = sk.selected;
      btn.onclick = async () => {
        try {
          await api('/skin/select', { id: sk.id });
          if (profile) profile.skin = sk.id;
          loadShop(true);
        } catch (e) { toast(e.message); }
      };
      d.appendChild(btn);
      if (sk.selected) d.classList.add('sel');
    }
    $('skinGrid').appendChild(d);
  });

  const c = shopCache.cost || { prop: 100, skin: 150, dupBack: 0.35 };
  $('costProp').textContent = c.prop;
  $('costZoo').textContent = c.prop;
  $('costSkin').textContent = c.skin;
  $('dupBack').textContent = Math.round(c.prop * c.dupBack);
  $('shopGold').textContent = shopCache.gold;
  $('shopOwn').textContent = `ของ ${items.filter((i) => i.owned).length}/${items.length} · สกิน ${skins.filter((s) => s.owned).length}/${skins.length}`;
}

/* ------------------------------------------------------------------ */
/* กาชา                                                                */
/* ------------------------------------------------------------------ */

let rolling = false;

async function gacha(kind, map) {
  if (rolling) return;
  rolling = true;
  $('gachaProp').disabled = true;
  $('gachaZoo').disabled = true;
  $('gachaSkin').disabled = true;
  try {
    const r = await api('/gacha', { kind, map });
    if (profile) {
      profile.gold = r.gold;
      profile.unlocked = r.unlocked;
      profile.skin = r.skin;
    }
    paintProfile();
    shopCache = null;
    await spin(kind, r);
    loadShop(true);
  } catch (e) {
    toast(e.message);
  } finally {
    rolling = false;
    $('gachaProp').disabled = false;
    $('gachaZoo').disabled = false;
    $('gachaSkin').disabled = false;
  }
}

/* หมุนไล่รูปสักครู่ก่อนเฉลยว่าได้อะไร */
function spin(kind, r) {
  return new Promise((done) => {
    const pool = kind === 'skin' ? SKIN_IDS.map((s) => 'skin:' + s) : PROP_TYPES.slice();
    $('gachaBox').classList.remove('hidden');
    $('gachaName').textContent = 'กำลังสุ่ม…';
    $('gachaTier').textContent = '';
    $('gachaMsg').textContent = '';
    $('gachaCard').className = 'gcard';

    let i = 0, ticks = 0;
    const iv = setInterval(() => {
      const key = pool[i++ % pool.length];
      $('gachaImg').src = IMG[key] || '';
      ticks++;
      if (ticks > 14) {
        clearInterval(iv);
        const key2 = kind === 'skin' ? 'skin:' + r.id : r.id;
        $('gachaImg').src = IMG[key2] || '';
        $('gachaName').textContent = r.name;
        $('gachaTier').textContent = r.tier;
        $('gachaCard').className = 'gcard reveal ' + (TIER_CLASS[r.tier] || 't0');
        $('gachaMsg').textContent = r.dup
          ? `ได้ชิ้นที่มีอยู่แล้ว คืนทองให้ ${r.back}`
          : (kind === 'skin' ? 'ปลดล็อกสกินใหม่' : 'ปลดล็อกร่างใหม่');
        setTimeout(done, 200);
      }
    }, 70);
  });
}

$('gachaProp').onclick = () => gacha('prop', 'mall');
$('gachaZoo').onclick = () => gacha('prop', 'zoo');
$('gachaSkin').onclick = () => gacha('skin');
$('gachaClose').onclick = () => $('gachaBox').classList.add('hidden');

/* ------------------------------------------------------------------ */
/* ห้อง                                                                */
/* ------------------------------------------------------------------ */

const PHASE_TH = { lobby: 'กำลังจะเริ่ม', hide: 'ช่วงซ่อน', hunt: 'กำลังล่า', end: 'จบรอบ' };

async function loadRooms() {
  $('roomList').innerHTML = '<p class="muted">กำลังโหลด…</p>';
  try {
    const r = await api('/rooms');
    $('roomList').innerHTML = r.rooms.length ? ''
      : '<p class="muted">ยังไม่มีห้องที่เปิดอยู่ กดเข้าร่วมเกมเพื่อเปิดห้องใหม่</p>';
    for (const rm of r.rooms) {
      const row = document.createElement('div');
      row.className = 'frow';
      row.innerHTML = `<span><b>${esc(rm.id)}</b>
        <em>${PHASE_TH[rm.phase] || rm.phase} · ซ่อน ${rm.hiders} · หา ${rm.seekers}</em></span>
        <span><b class="cnt">${rm.players}/${rm.max}</b>
        <button class="mini ok" data-room="${esc(rm.id)}">เข้า</button></span>`;
      row.querySelector('[data-room]').onclick = () => {
        pickedRoom = rm.id;
        paintTopRoom();
        showPanel(null);
        toast(t('picked', { r: rm.id }));
      };
      $('roomList').appendChild(row);
    }
  } catch (e) {
    $('roomList').innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}
$('roomRefresh').onclick = loadRooms;

/* กดเปลี่ยนห้อง = สลับไปเลขห้องถัดไปทันที ไม่ต้องเลือกเอง */
$('btnSwitch').onclick = async () => {
  try {
    const r = await api('/rooms');
    roomsCache = r.rooms;
    const open = roomsCache.filter((x) => x.players < x.max).map((x) => x.id);
    // ถ้ามีห้องเปิดอยู่หลายห้อง ก็วนไปห้องถัดไป ถ้าไม่มีก็ขยับไปเลขที่ยังว่าง
    if (open.length > 1 || (open.length === 1 && open[0] !== pickedRoom)) {
      const i = open.indexOf(pickedRoom);
      pickedRoom = open[(i + 1) % open.length];
    } else {
      const used = new Set(roomsCache.map((x) => x.id));
      let no = 1;
      const cur = /(\d+)/.exec(pickedRoom || '');
      if (cur) no = parseInt(cur[1], 10) + 1;
      const max = r.maxRoomNo || 200;
      while (no <= max && used.has('ห้อง ' + no)) no++;
      pickedRoom = 'ห้อง ' + (no > max ? 1 : no);
    }
    paintTopRoom();
    toast(t('picked', { r: pickedRoom }));
  } catch (e) { toast(e.message); }
};

/* กดปุ่มห้อง = กรอกเลขห้องที่อยากเข้า */
function openRoomAsk() {
  $('roomAsk').classList.remove('hidden');
  const cur = /(\d+)/.exec(pickedRoom || '');
  $('roomNo').value = cur ? cur[1] : '';
  $('roomNo').focus();
  const q = $('roomQuick');
  q.innerHTML = '';
  for (const rm of roomsCache.slice(0, 8)) {
    const b = document.createElement('button');
    const full = rm.players >= rm.max;
    b.type = 'button';
    b.className = full ? 'full' : '';
    b.textContent = rm.id.replace('ห้อง ', '#') + ' · ' + rm.players + '/' + rm.max;
    b.onclick = () => { $('roomNo').value = (/(\d+)/.exec(rm.id) || [])[1] || ''; };
    q.appendChild(b);
  }
}
function goRoom() {
  const no = parseInt($('roomNo').value, 10);
  if (!(no >= 1 && no <= 200)) { toast('ใส่เลขห้อง 1 ถึง 200'); return; }
  $('roomAsk').classList.add('hidden');
  pickedRoom = 'ห้อง ' + no;
  paintTopRoom();
  toast(t('picked', { r: pickedRoom }));
}
$('roomGo').onclick = goRoom;
$('roomCancel').onclick = () => $('roomAsk').classList.add('hidden');
$('roomNo').addEventListener('keydown', (e) => { if (e.key === 'Enter') goRoom(); });

/* ------------------------------------------------------------------ */
/* เพื่อน                                                              */
/* ------------------------------------------------------------------ */

/* ---- ครอปรูปโปรไฟล์ ลากเลื่อนและซูมได้ก่อนบันทึก ---- */
const crop = { img: null, zoom: 1, ox: 0, oy: 0, drag: null };
const cvs = $('avCanvas');
const cctx = cvs.getContext('2d');

function drawCrop() {
  if (!crop.img) return;
  const S = cvs.width;
  cctx.clearRect(0, 0, S, S);
  const base = Math.max(S / crop.img.width, S / crop.img.height);
  const sc = base * crop.zoom;
  const w = crop.img.width * sc, h = crop.img.height * sc;
  // จำกัดไม่ให้เลื่อนจนเห็นขอบว่าง
  crop.ox = Math.max(S - w, Math.min(0, crop.ox));
  crop.oy = Math.max(S - h, Math.min(0, crop.oy));
  cctx.drawImage(crop.img, crop.ox, crop.oy, w, h);
  // วงกลมบอกขอบเขตที่จะเห็นจริง
  cctx.save();
  cctx.strokeStyle = 'rgba(255,255,255,.9)';
  cctx.lineWidth = 3;
  cctx.beginPath(); cctx.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2); cctx.stroke();
  cctx.restore();
}

function cropToDataUrl() {
  const S = 96;
  const out = document.createElement('canvas');
  out.width = S; out.height = S;
  const x = out.getContext('2d');
  const k = S / cvs.width;
  const base = Math.max(cvs.width / crop.img.width, cvs.width / crop.img.height);
  const sc = base * crop.zoom * k;
  x.drawImage(crop.img, crop.ox * k, crop.oy * k, crop.img.width * sc, crop.img.height * sc);
  return out.toDataURL('image/jpeg', 0.82);
}

const cropPos = (e) => {
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX, y: t.clientY };
};
const cropStart = (e) => { crop.drag = { ...cropPos(e), ox: crop.ox, oy: crop.oy }; e.preventDefault(); };
const cropMove = (e) => {
  if (!crop.drag) return;
  const pnt = cropPos(e);
  const k = cvs.width / cvs.getBoundingClientRect().width;
  crop.ox = crop.drag.ox + (pnt.x - crop.drag.x) * k;
  crop.oy = crop.drag.oy + (pnt.y - crop.drag.y) * k;
  drawCrop();
  e.preventDefault();
};
const cropEnd = () => { crop.drag = null; };
cvs.addEventListener('mousedown', cropStart);
cvs.addEventListener('touchstart', cropStart, { passive: false });
addEventListener('mousemove', cropMove);
addEventListener('touchmove', cropMove, { passive: false });
addEventListener('mouseup', cropEnd);
addEventListener('touchend', cropEnd);
$('avZoom').oninput = (e) => {
  const old = crop.zoom, nz = parseFloat(e.target.value);
  // ซูมรอบจุดกึ่งกลาง
  const S = cvs.width;
  crop.ox = S / 2 - (S / 2 - crop.ox) * (nz / old);
  crop.oy = S / 2 - (S / 2 - crop.oy) * (nz / old);
  crop.zoom = nz;
  drawCrop();
};

$('avUpload').onclick = () => $('avFile').click();
$('avFile').onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      crop.img = img; crop.zoom = 1; crop.ox = 0; crop.oy = 0;
      $('avZoom').value = '1';
      $('avCrop').classList.remove('hidden');
      drawCrop();
    };
    img.onerror = () => toast('ไฟล์นี้ไม่ใช่รูปภาพ');
    img.src = fr.result;
  };
  fr.readAsDataURL(f);
};
$('avCancel').onclick = () => { $('avCrop').classList.add('hidden'); crop.img = null; };
$('avSave').onclick = async () => {
  if (!crop.img) return;
  try {
    const r = await api('/avatar/image', { img: cropToDataUrl() });
    if (profile) profile.avatarImg = r.avatarImg;
    $('avCrop').classList.add('hidden');
    crop.img = null;
    paintProfile();
    paintAvatarPreview();
    toast('เปลี่ยนรูปประจำตัวแล้ว');
  } catch (err) { toast(err.message); }
};
$('avClear').onclick = async () => {
  try {
    await api('/avatar/image', { img: '' });
    if (profile) profile.avatarImg = '';
    paintProfile();
    paintAvatarPreview();
  } catch (err) { toast(err.message); }
};

function paintAvatarPreview() {
  const box = $('avPreview');
  const img = profile && profile.avatarImg;
  box.classList.toggle('on', !!img);
  box.style.backgroundImage = img ? `url(${img})` : '';
}

async function loadAvatars() {
  paintAvatarPreview();
  try {
    const r = await api('/avatars');
    const g = $('avatarGrid');
    g.innerHTML = '';
    for (const em of r.list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = em;
      if (profile && profile.avatar === em) b.className = 'on';
      b.onclick = async () => {
        try {
          const res = await api('/avatar', { emoji: em });
          if (profile) profile.avatar = res.avatar;
          paintProfile();
          loadAvatars();
        } catch (e) { toast(e.message); }
      };
      g.appendChild(b);
    }
  } catch (e) { /* เงียบไว้ */ }
}

/* ---- ดูโฆษณารับทอง ---- */
let adTimer = null;
async function loadAd() {
  try {
    const st = await api('/ad');
    $('adGold').textContent = st.reward;
    $('btnAd').disabled = st.left <= 0 || st.wait > 0;
    $('adInfo').textContent = st.left <= 0
      ? 'วันนี้ดูครบโควตาแล้ว พรุ่งนี้มาใหม่นะ'
      : st.wait > 0
        ? `รออีก ${st.wait} วินาทีค่อยดูรอบต่อไป (เหลือวันนี้ ${st.left} ครั้ง)`
        : `ดูโฆษณา ${st.watchSec} วินาที รับ ${st.reward} ทอง — วันนี้เหลืออีก ${st.left} ครั้ง`;
  } catch (e) { /* เงียบไว้ */ }
}

$('btnAd').onclick = async () => {
  let st;
  try { st = await api('/ad/start', {}); } catch (e) { toast(e.message); loadAd(); return; }
  $('adPlay').classList.remove('hidden');
  $('adGold').textContent = st.reward;
  let left = st.watchSec;
  $('adCount').textContent = left;
  $('adFill').style.width = '0%';
  clearInterval(adTimer);
  adTimer = setInterval(async () => {
    left -= 1;
    $('adCount').textContent = Math.max(0, left);
    $('adFill').style.width = Math.round((1 - left / st.watchSec) * 100) + '%';
    if (left > 0) return;
    clearInterval(adTimer);
    try {
      const r = await api('/ad/claim', { token: st.token });
      if (profile) profile.gold = r.gold;
      paintProfile();
      toast(`ได้รับ ${r.got} ทอง`);
    } catch (e) { toast(e.message); }
    $('adPlay').classList.add('hidden');
    loadAd();
  }, 1000);
};
$('adClose').onclick = () => {
  clearInterval(adTimer);
  $('adPlay').classList.add('hidden');
  toast('ปิดก่อนดูจบ เลยยังไม่ได้ทอง');
  loadAd();
};

async function loadFriends() {
  $('frList').innerHTML = '<p class="muted">กำลังโหลด…</p>';
  $('frReq').innerHTML = '';
  try {
    const r = await api('/friends');
    if (r.requests.length) {
      $('frReq').innerHTML = '<h4>คำขอเป็นเพื่อน</h4>';
      for (const n of r.requests) {
        const row = document.createElement('div');
        row.className = 'frow';
        row.innerHTML = `<span>${esc(n)}</span><span>
          <button class="mini ok" data-a="accept">รับ</button>
          <button class="mini" data-a="decline">ปฏิเสธ</button></span>`;
        row.querySelectorAll('button').forEach((b) => {
          b.onclick = async () => {
            try {
              const res = await api('/friends/' + b.dataset.a, { name: n });
              if (res.msg) toast(res.msg);
              loadFriends();
            } catch (e) { toast(e.message); }
          };
        });
        $('frReq').appendChild(row);
      }
    }
    $('frList').innerHTML = r.friends.length ? ''
      : '<p class="muted">ยังไม่มีเพื่อน ใส่ชื่อด้านล่างเพื่อส่งคำขอ</p>';
    for (const f of r.friends) {
      const row = document.createElement('div');
      row.className = 'frow';
      const joinBtn = f.online && f.room
        ? `<button class="mini ok" data-join="${esc(f.room)}">ตามเข้าห้อง</button>` : '';
      row.innerHTML = `<span><i class="dot ${f.online ? 'on' : ''}"></i>${esc(f.name)}
        <em>${f.online ? esc(f.room || 'ออนไลน์') : 'ออฟไลน์'}</em></span>
        <span>${joinBtn}<button class="mini" data-del="1">ลบ</button></span>`;
      const j = row.querySelector('[data-join]');
      if (j) j.onclick = () => play(j.dataset.join);
      row.querySelector('[data-del]').onclick = async () => {
        try { await api('/friends/remove', { name: f.name }); loadFriends(); }
        catch (e) { toast(e.message); }
      };
      $('frList').appendChild(row);
    }
  } catch (e) {
    $('frList').innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

$('frAdd').onclick = async () => {
  const name = $('frName').value.trim();
  if (!name) return;
  try {
    const r = await api('/friends/add', { name });
    toast(r.msg || 'ส่งคำขอแล้ว');
    $('frName').value = '';
    loadFriends();
  } catch (e) { toast(e.message); }
};
$('frName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('frAdd').click(); });

/* ------------------------------------------------------------------ */
/* เข้าเกม                                                             */
/* ------------------------------------------------------------------ */

function play(room) {
  if (room) pickedRoom = room;
  showPanel(null);
  $('roomAsk').classList.add('hidden');
  $('lobby').classList.add('hidden');
  stopRoomPoll();
  startGame({
    token,
    room: room || null,
    skin: (profile && profile.skin) || 'blue',
    onEnter: () => { let w = '1'; try { w = localStorage.getItem(MUSIC_KEY) || '1'; } catch (e) {} if (w === '1') { music.start(); music.setVolume(0.4); paintMusic(); } },
    onGold: (g) => { if (profile) profile.gold = g; },
    onExit: () => {
      $('lobby').classList.remove('hidden');
      startRoomPoll();
      refreshProfile();
    },
  });
}
$('btnPlay').onclick = () => play(pickedRoom);

/* ---- เพลงประกอบ ---- */
const MUSIC_KEY = 'ph_music';
function paintMusic() {
  const on = music.isPlaying();
  const b = $('btnMusic');
  if (b) {
    b.classList.toggle('on', on);
    b.textContent = on ? '♪ เพลงประกอบ: เปิด' : '♪ เพลงประกอบ: ปิด';
  }
}
function toggleMusic() {
  const on = music.toggle();
  try { localStorage.setItem(MUSIC_KEY, on ? '1' : '0'); } catch (e) {}
  paintMusic();
}
$('btnMusic').onclick = toggleMusic;
/* เบราว์เซอร์ห้ามเล่นเสียงก่อนผู้ใช้แตะจอ จึงรอสัมผัสแรกแล้วค่อยเริ่ม */
function autoMusic() {
  let want = '1';
  try { want = localStorage.getItem(MUSIC_KEY) || '1'; } catch (e) {}
  if (want === '1') { music.start(); music.setVolume(0.45); }
  paintMusic();
  removeEventListener('pointerdown', autoMusic);
  removeEventListener('keydown', autoMusic);
}
addEventListener('pointerdown', autoMusic);
addEventListener('keydown', autoMusic);

/* ------------------------------------------------------------------ */
/* เริ่มต้น                                                            */
/* ------------------------------------------------------------------ */

/* ถ้ามีชีตไอคอน 3 มิติวางไว้ที่ public/ui/icons.png ก็สลับไปใช้รูปนั้นแทน SVG */
(function loadIconSheets() {
  const sheets = [['ui/icons.png', 'has3d'], ['ui/icons2.png', 'has2'],
    ['ui/timer.png', 'hasTimer'], ['ui/lock.png', 'hasLock']];
  for (const [src, cls] of sheets) {
    const img = new Image();
    img.onload = () => document.body.classList.add(cls);
    img.src = src;
  }
})();

(async function boot() {
  setMode('login');
  applyLang();
  try {
    // หน้าล็อบบี้สุ่มด่านที่โชว์เป็นฉากหลัง ไม่ใช่ห้างตลอด
    let map = await fetch('/api/map').then((r) => r.json());
    if (map.maps && map.maps.length > 1) {
      const pickMap = map.maps[(Math.random() * map.maps.length) | 0];
      if (pickMap.key !== map.key) map = await fetch('/api/map?name=' + pickMap.key).then((r) => r.json());
    }
    initScene(map);
  } catch (e) {
    $('auMsg').textContent = 'โหลดฉากไม่สำเร็จ: ' + e.message;
    $('auMsg').className = 'msg bad';
  }

  try { IMG = makePreviews(PROP_TYPES, SKIN_IDS, 168); } catch (e) { IMG = {}; }

  $('boot').classList.add('hidden');

  let saved = null;
  try { saved = localStorage.getItem(TOKEN_KEY); } catch (e) {}
  if (saved) {
    token = saved;
    try {
      const r = await api('/me');
      profile = r.profile;
      paintProfile();
      showScreen('lobby');
      return;
    } catch (e) {
      token = null;
      try { localStorage.removeItem(TOKEN_KEY); } catch (e2) {}
    }
  }
  showScreen('auth');
})();
