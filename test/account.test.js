/* ทดสอบผ่าน HTTP API จริง โดยเปิดเซิร์ฟเวอร์บนพอร์ตว่างและใช้ fetch */

const os = require('os');
const fs = require('fs');
const path = require('path');

// ใส่เวลาและเลขสุ่มด้วย ไม่งั้นถ้า pid ซ้ำกับรอบก่อนจะเจอข้อมูลเก่าค้าง (เคยทำให้เทสต์ล้มแบบสุ่ม)
const DIR = path.join(os.tmpdir(), `ph-acct-${process.pid}-${Date.now()}-${(Math.random() * 1e6) | 0}`);
fs.rmSync(DIR, { recursive: true, force: true });
process.env.DATA_DIR = DIR;

const { httpServer } = require('../server.js');
const store = require('../store.js');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + m); };

let base = '';

async function call(p, body, token, method) {
  const opt = { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' } };
  if (token) opt.headers.Authorization = 'Bearer ' + token;
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(base + '/api' + p, opt);
  let j = {};
  try { j = await res.json(); } catch (e) {}
  return { status: res.status, body: j };
}

(async function run() {
  await new Promise((res) => httpServer.listen(0, res));
  base = 'http://127.0.0.1:' + httpServer.address().port;

  /* ---------- สมัครและเข้าสู่ระบบ ---------- */

  let r = await call('/register', { name: 'ab', pw: '1234' });
  ok(r.status === 400, 'ชื่อสั้นเกินไปสมัครไม่ได้');

  r = await call('/register', { name: 'สมชาย', pw: '12' });
  ok(r.status === 400, 'รหัสผ่านสั้นเกินไปสมัครไม่ได้');

  r = await call('/register', { name: 'สมชาย', pw: 'secret1' });
  ok(r.status === 200 && r.body.token, 'สมัครด้วยชื่อภาษาไทยได้');
  const tokA = r.body.token;
  ok(r.body.profile.gold === store.START_GOLD, `ผู้เล่นใหม่ได้ทองเริ่มต้น ${store.START_GOLD}`);
  ok(store.CATALOG.length >= 56, `ร้านมีของให้สุ่ม ${store.CATALOG.length} ชนิด`);
  ok(r.body.profile.unlocked.length === store.STARTER.length,
    `ผู้เล่นใหม่ได้ร่างเริ่มต้น ${store.STARTER.length} อย่าง`);

  r = await call('/register', { name: 'สมชาย', pw: 'other' });
  ok(r.status === 400, 'ชื่อซ้ำสมัครไม่ได้');

  r = await call('/login', { name: 'สมชาย', pw: 'ผิด' });
  ok(r.status === 400, 'รหัสผ่านผิดเข้าไม่ได้');

  r = await call('/login', { name: 'สมชาย', pw: 'secret1' });
  ok(r.status === 200 && r.body.token, 'เข้าสู่ระบบด้วยรหัสที่ถูกต้องได้');

  // ล็อกอินซ้ำหลายรอบด้วยรหัสเดิมต้องผ่านทุกครั้ง ไม่ใช่ต้องไปสมัครใหม่
  let again = 0;
  for (let i = 0; i < 5; i++) {
    const l = await call('/login', { name: 'สมชาย', pw: 'secret1' });
    if (l.status === 200) again++;
  }
  ok(again === 5, 'ล็อกอินด้วยรหัสเดิมซ้ำ 5 รอบผ่านหมด');
  ok(r.body.profile.level >= 1 && r.body.profile.xpPerLevel > 0 && r.body.profile.maxLevel === store.MAX_LEVEL,
    `โปรไฟล์มีเลเวลและแถบ xp: Lv.${r.body.profile.level} ${r.body.profile.xpInLevel}/${r.body.profile.xpPerLevel} (ตันที่ ${r.body.profile.maxLevel})`);

  // ข้อมูลต้องถูกเขียนลงไฟล์ทันทีตั้งแต่สมัครเสร็จ ไม่ต้องรอรอบเซฟอัตโนมัติ
  const onDisk = JSON.parse(fs.readFileSync(path.join(DIR, 'users.json'), 'utf8'));
  ok(!!onDisk.users['สมชาย'.toLowerCase()], 'บัญชีถูกเขียนลงไฟล์ทันทีหลังสมัคร');
  ok(Object.keys(onDisk.tokens).length > 0, 'token ถูกเก็บลงไฟล์ด้วย ปิดเปิดเซิร์ฟเวอร์แล้วยังค้างล็อกอิน');

  await call('/register', { name: 'BoxKing', pw: 'secret3' });
  r = await call('/login', { name: 'boxking', pw: 'secret3' });
  ok(r.status === 200, 'เข้าสู่ระบบไม่สนตัวพิมพ์เล็กใหญ่');
  r = await call('/register', { name: 'BOXKING', pw: 'secret4' });
  ok(r.status === 400, 'สมัครชื่อซ้ำแบบต่างตัวพิมพ์ไม่ได้');

  store._flush();
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'users.json'), 'utf8'));
  const stored = raw.users[Object.keys(raw.users)[0]];
  ok(!JSON.stringify(stored).includes('secret1'), 'รหัสผ่านไม่ได้ถูกเก็บเป็นข้อความธรรมดา');
  ok(!!stored.salt && !!stored.hash, 'เก็บเป็น salt กับ hash แทน');

  /* ---------- ต้องมี token ---------- */

  r = await call('/me');
  ok(r.status === 401, 'ไม่ส่ง token เรียก /me ไม่ได้');
  r = await call('/gacha', { kind: 'prop' }, 'aaaabbbbccccdddd');
  ok(r.status === 401, 'token ปลอมสุ่มของไม่ได้');

  /* ---------- ร้านค้าแบบสุ่ม ---------- */

  r = await call('/shop', null, tokA);
  // ร้านขายเฉพาะของที่มีอยู่จริงในด่าน (poolFor) ไม่ขายของที่ไม่มีต้นแบบ
  ok(r.status === 200 && r.body.items.length === store.poolFor(null).length,
    `ร้านมีของ ${r.body.items.length} ชิ้น (จาก ${store.CATALOG.length} ชนิดในเกม มีอยู่จริงในด่านเท่านี้)`);
  ok(r.body.items.every((i) => i.price === undefined && typeof i.chance === 'number'),
    'ของทุกชิ้นบอกโอกาสออกแทนราคา เพราะซื้อตรงไม่ได้');
  const sumChance = r.body.items.reduce((a, i) => a + i.chance, 0);
  // โอกาสคิดแยกตามด่าน (สุ่มของห้าง / สุ่มของสวนสัตว์) แต่ละด่านต้องรวมได้ราว 100%
  for (const mp of ['mall', 'zoo']) {
    const sub = r.body.items.filter((i) => i.map === mp);
    const tot = sub.reduce((a, i) => a + i.chance, 0);
    ok(Math.abs(tot - 100) < 4, `โอกาสออกของ${mp === 'zoo' ? 'สวนสัตว์' : 'ห้าง'}รวมกันได้ ${tot.toFixed(1)}% จาก ${sub.length} ชิ้น`);
  }
  ok(r.body.cost && r.body.cost.prop > 0 && r.body.cost.skin > 0, 'ร้านบอกราคาสุ่มทั้งสองแบบ');

  const poor = store.userByToken(tokA);
  poor.gold = 10;
  r = await call('/gacha', { kind: 'prop' }, tokA);
  ok(r.status === 400 && /ทองไม่พอ/.test(r.body.error), 'ทองไม่พอสุ่มไม่ได้');

  // สุ่มจนได้ครบทุกชิ้น ต้องได้ของซ้ำระหว่างทางด้วย
  poor.gold = 400000;
  let dup = 0, fresh = 0, spent = 0;
  for (let i = 0; i < 4000; i++) {
    const before = store.userByToken(tokA).gold;
    const g = await call('/gacha', { kind: 'prop' }, tokA);
    if (g.status !== 200) break;
    spent += before - g.body.gold;
    if (g.body.dup) dup++; else fresh++;
    if (g.body.unlocked.length === store.CATALOG.length) break;
  }
  ok(fresh > 0, `สุ่มได้ของใหม่ ${fresh} ชิ้น`);
  ok(dup > 0, `ได้ของซ้ำ ${dup} ครั้ง ซึ่งเป็นเรื่องปกติของการสุ่ม`);
  ok(store.userByToken(tokA).unlocked.length === store.poolFor(null).length, 'สุ่มไปเรื่อย ๆ ได้ครบทุกชิ้นที่ร้านขาย');
  ok(spent > 0, `ใช้ทองไปทั้งหมด ${spent}`);

  // ของซ้ำต้องได้ทองคืน
  const before2 = store.userByToken(tokA).gold;
  const g2 = await call('/gacha', { kind: 'prop' }, tokA);
  ok(g2.body.dup === true, 'ปลดล็อกครบแล้ว สุ่มอีกได้ของซ้ำแน่นอน');
  ok(g2.body.back > 0 && g2.body.gold === before2 - store.GACHA.prop + g2.body.back,
    `ของซ้ำคืนทองให้ ${g2.body.back}`);

  r = await call('/gacha', { kind: 'prop' });
  ok(r.status === 401, 'ไม่ล็อกอินสุ่มไม่ได้');

  /* ---------- สกิน ---------- */

  r = await call('/shop', null, tokA);
  ok(Array.isArray(r.body.skins) && r.body.skins.length === store.SKIN_CATALOG.length,
    `ร้านมีสกิน ${r.body.skins.length} แบบ`);
  ok(r.body.skins.filter((s) => s.owned).length === 1, 'ผู้เล่นใหม่มีสกินเริ่มต้น 1 แบบ');
  ok(r.body.skins.find((s) => s.selected).id === 'blue', 'สกินที่เลือกอยู่คือสกินเริ่มต้น');

  const locked = store.SKIN_CATALOG.find((sk) => !store.userByToken(tokA).skins.includes(sk.id));
  r = await call('/skin/select', { id: locked.id }, tokA);
  ok(r.status === 400, 'เลือกสกินที่ยังไม่ได้ปลดล็อกไม่ได้');

  const gs = store.userByToken(tokA).gold;
  r = await call('/gacha', { kind: 'skin' }, tokA);
  ok(r.status === 200 && r.body.kind === 'skin', 'สุ่มสกินได้');
  ok(r.body.gold <= gs - store.GACHA.skin + Math.round(store.GACHA.skin * store.GACHA.dupBack),
    `สุ่มสกินหักทอง ${store.GACHA.skin}`);
  if (!r.body.dup) ok(r.body.skin === r.body.id, 'ได้สกินใหม่แล้วเปลี่ยนไปใช้ทันที');
  else ok(r.body.back > 0, 'ได้สกินซ้ำแล้วคืนทองให้');

  r = await call('/skin/select', { id: 'blue' }, tokA);
  ok(r.status === 200 && r.body.skin === 'blue', 'สลับกลับไปใช้สกินเดิมได้');

  /* ---------- ผังด่านสำหรับหน้าล็อบบี้ ---------- */

  const mp = await fetch(base + '/api/map').then((x) => x.json());
  ok(mp.walls.length > 10 && mp.props.length > 50,
    `เปิดผังด่านได้โดยไม่ต้องล็อกอิน: กำแพง ${mp.walls.length} ของ ${mp.props.length} ชิ้น`);
  ok(mp.types.length >= store.CATALOG.length && mp.props.every((p) => mp.types.includes(p.t)),
    `ของทุกชิ้นในผังใช้ชนิดที่รู้จัก (ทั้งหมด ${mp.types.length} ชนิด สุ่มได้ ${store.CATALOG.length} ชนิด)`);

  /* ---------- รายการห้อง ---------- */

  const { newRoom, roomList } = require('../server.js');
  const testRoom = newRoom();
  r = await call('/rooms', null, tokA);
  ok(r.status === 200 && r.body.rooms.some((x) => x.id === testRoom.id), 'เรียกรายการห้องได้');
  ok(r.body.max === 30, 'ห้องรับได้สูงสุด 30 คน');
  ok(r.body.maxRoomNo >= 100, `กรอกเลขห้องได้ถึง ${r.body.maxRoomNo}`);
  ok(/^ห้อง \d+$/.test(testRoom.id), `ชื่อห้องเป็นเลขล้วน: ${testRoom.id}`);
  r = await call('/rooms');
  ok(r.status === 401, 'ไม่ล็อกอินดูรายการห้องไม่ได้');

  /* ---------- ผู้เล่นชั่วคราว ---------- */

  r = await call('/guest', { name: 'ทดลอง' });
  ok(r.status === 200 && r.body.profile.guest === true, 'เล่นแบบผู้มาเยือนได้');
  const tokG = r.body.token;

  /* ---------- เพื่อน ---------- */

  r = await call('/register', { name: 'สมหญิง', pw: 'secret2' });
  const tokB = r.body.token;

  r = await call('/friends/add', { name: 'ไม่มีคนนี้' }, tokA);
  ok(r.status === 400, 'เพิ่มเพื่อนที่ไม่มีตัวตนไม่ได้');

  r = await call('/friends/add', { name: 'สมชาย' }, tokA);
  ok(r.status === 400, 'เพิ่มตัวเองเป็นเพื่อนไม่ได้');

  r = await call('/friends/add', { name: 'ทดลอง' }, tokA);
  ok(r.status === 400, 'เพิ่มผู้เล่นชั่วคราวเป็นเพื่อนไม่ได้');

  r = await call('/friends/add', { name: 'สมหญิง' }, tokA);
  ok(r.status === 200, 'ส่งคำขอเป็นเพื่อนได้');

  r = await call('/friends', null, tokB);
  ok(r.body.requests.includes('สมชาย'), 'อีกฝ่ายเห็นคำขอในรายการ');

  r = await call('/friends', null, tokA);
  ok(r.body.friends.length === 0, 'ยังไม่เป็นเพื่อนจนกว่าอีกฝ่ายจะกดรับ');

  r = await call('/friends/add', { name: 'สมหญิง' }, tokA);
  ok(r.status === 400, 'ส่งคำขอซ้ำไม่ได้');

  r = await call('/friends/accept', { name: 'สมชาย' }, tokB);
  ok(r.status === 200, 'กดรับคำขอได้');

  r = await call('/friends', null, tokA);
  ok(r.body.friends.length === 1 && r.body.friends[0].name === 'สมหญิง', 'ฝั่งผู้ส่งเห็นเพื่อนแล้ว');
  ok(r.body.friends[0].online === false, 'ยังไม่ได้เข้าเกม สถานะเป็นออฟไลน์');

  r = await call('/friends', null, tokB);
  ok(r.body.friends.length === 1 && r.body.requests.length === 0, 'ฝั่งผู้รับเป็นเพื่อนและคำขอหายไป');

  // จำลองว่าสมหญิงกำลังอยู่ในห้อง
  const { online } = require('../server.js');
  online.set(store.key('สมหญิง'), { room: 'ห้อง-1' });
  r = await call('/friends', null, tokA);
  ok(r.body.friends[0].online === true && r.body.friends[0].room === 'ห้อง-1',
    'เห็นว่าเพื่อนออนไลน์อยู่ห้องไหน');
  online.delete(store.key('สมหญิง'));

  r = await call('/friends/remove', { name: 'สมหญิง' }, tokA);
  ok(r.status === 200, 'ลบเพื่อนได้');
  r = await call('/friends', null, tokB);
  ok(r.body.friends.length === 0, 'ลบแล้วหายจากรายชื่อของทั้งสองฝ่าย');

  /* ---------- ออกจากระบบ ---------- */

  r = await call('/logout', {}, tokG);
  ok(r.status === 200, 'ออกจากระบบได้');
  r = await call('/me', null, tokG);
  ok(r.status === 401, 'token ที่ออกจากระบบแล้วใช้ไม่ได้อีก');

  /* ---------- ข้อมูลอยู่รอดหลังรีสตาร์ต ---------- */

  store._flush();
  const raw2 = JSON.parse(fs.readFileSync(path.join(DIR, 'users.json'), 'utf8'));
  const key = store.key('สมชาย');
  ok(raw2.users[key] && raw2.users[key].unlocked.length === store.poolFor(null).length,
    'ของที่สุ่มได้ถูกบันทึกลงไฟล์ ไม่หายตอนเซิร์ฟเวอร์รีสตาร์ต');

  console.log(`\n${pass} ผ่าน / ${fail} ไม่ผ่าน`);
  httpServer.close();
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('เทสต์ล้มเหลว:', e);
  process.exit(1);
});
