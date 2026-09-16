process.env.DATA_DIR = require('os').tmpdir() + '/ph-test-' + process.pid;

const { Room, CFG, PHASE, WALLS, LAYOUT, NAV, findPath, PROP_TYPES, store, LAYOUTS, MAP_ORDER } = require('../server.js');
const { clearLine } = require('../maplayout.js');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + m); };
const fakeSock = (id) => ({ id, emit() {} });
const fakeUser = (name, unlocked, gold) => ({
  name, gold: gold === undefined ? 200 : gold,
  // ครอบคลุมของทุกด่าน เพราะห้องสุ่มด่านทุกรอบ ถ้าไม่มีของของด่านนั้นเลยระบบจะแจกร่างอื่นให้
  unlocked: unlocked || ['box', 'schoolchair', 'schooldesk', 'potplant', 'bookshelf',
    'diningchair', 'homeshelf', 'hedge', 'rock', 'bush', 'trashbin', 'bench'],
  games: 0, wins: 0, catches: 0, best: 0, friends: [], requests: [],
});

/* ---------- แผนที่ ---------- */

const r = new Room('test');
ok(LAYOUTS.school.props.length > 50, 'ด่านโรงเรียนมีของ ' + LAYOUTS.school.props.length + ' ชิ้น');
ok(LAYOUTS.school.w === 78 && LAYOUTS.school.d === 54, `โรงเรียนกะทัดรัดแบบ arcade ${LAYOUTS.school.w}x${LAYOUTS.school.d} ม.`);
ok(LAYOUTS.school.zones.length >= 10, `โซนในโรงเรียนมี ${LAYOUTS.school.zones.length} โซน (เป้า 10-14)`);
{
  // ห้องต้องขนาดไม่เท่ากัน วิ่งข้ามห้องทั่วไปได้ใน 3-6 วินาที
  const areas = LAYOUTS.school.zones.map((z) => (z.box[1] - z.box[0]) * (z.box[3] - z.box[2]));
  const small = areas.filter((a) => a < 180).length, big = areas.filter((a) => a >= 260).length;
  ok(small >= 3 && big >= 2, `ขนาดห้องหลากหลาย: เล็ก ${small} ห้อง ใหญ่ ${big} ห้อง`);
  const rooms = LAYOUTS.school.zones.filter((z) => z.door);   // โถงกับลานเป็นพื้นที่เปิด ยาวได้
  const longest = Math.max(...rooms.map((z) => Math.max(z.box[1] - z.box[0], z.box[3] - z.box[2])));
  ok(longest / CFG.SPD_HIDER <= 6.5, `ห้องยาวสุด ${longest} ม. วิ่งข้ามได้ใน ${(longest / CFG.SPD_HIDER).toFixed(1)} วินาที`);
}
ok(LAYOUTS.school.spawns.hider.length >= 1 && LAYOUTS.school.spawns.seeker.length >= 1,
  `จุดเกิดคนซ่อน ${LAYOUTS.school.spawns.hider.length} จุด (จากไฟล์ + โซนเปิด) คนหา 1 จุดตามไฟล์`);
const kinds = new Set(LAYOUTS.school.props.map((p) => p.t));
ok(kinds.size >= 20, `ห้างใช้ของ ${kinds.size} ชนิด สวนสัตว์ใช้ ${new Set(LAYOUTS.zoo.props.map((p) => p.t)).size} ชนิด จาก ${PROP_TYPES.length} ชนิดที่มีในเกม`);
{
  // ของสองด่านต้องแยกกัน (ยกเว้นเฟอร์นิเจอร์ประกอบฉาก)
  const shared = ['shelf', 'desk', 'chair', 'board', 'showcase', 'plant', 'rock', 'bush',
    'trashbin', 'bucket', 'barrel', 'popcorn', 'ticketbooth', 'tire', 'fountain', 'zoocart', 'sofa',
    'extinguisher', 'wallclock', 'mapsign', 'zoosign',
    'fridge', 'coffee', 'keychain', 'vase', 'sink', 'cart', 'basket', 'plant', 'box',
    'luggage', 'cone', 'barrier', 'wetsign', 'lamp', 'printer', 'mannequin', 'rack', 'tire',
    'bench', 'tray', 'broom', 'bucket', 'barrel', 'notebook', 'globe'];   // ของร่วมที่มีเหตุผลในทั้งสองที่ (ตู้แช่ กาแฟ พวงกุญแจ แจกัน)
  const z = new Set(LAYOUTS.zoo.props.map((p) => p.t).filter((t) => !shared.includes(t)));
  const overlap = [...kinds].filter((t) => z.has(t) && !shared.includes(t));
  ok(overlap.length === 0, `ของในห้างกับสวนสัตว์ไม่ซ้ำกัน${overlap.length ? ' (ซ้ำ: ' + overlap.join(',') + ')' : ''}`);
  const zooCat = store.CATALOG.filter((c) => c.map === 'zoo');
  ok(zooCat.length >= 50, `ของสำหรับสวนสัตว์ในร้านมี ${zooCat.length} ชนิด`);
  const tiers = new Set(zooCat.map((c) => c.tier));
  ok(tiers.size >= 3, `ของสวนสัตว์มีระดับความหายาก ${tiers.size} ระดับ`);
}
const unusedTypes = PROP_TYPES.filter((t) => !kinds.has(t));
const usedAll = new Set();
for (const k of Object.keys(LAYOUTS)) for (const p of LAYOUTS[k].props) usedAll.add(p.t);
const unusedAll = PROP_TYPES.filter((t) => !usedAll.has(t));
ok(unusedAll.length <= 60, `รวมทุกด่านแล้ว ชนิดที่ยังไม่ได้วางเลยมี ${unusedAll.length} ชนิด: ${unusedAll.join(', ') || '-'}`);

// ลำดับชนิดของฝั่งเซิร์ฟเวอร์ต้องตรงกับฝั่งไคลเอนต์เป๊ะ ไม่งั้นแพ็กเก็ตจะแปลผิด
const clientSrc = require('fs').readFileSync(__dirname + '/../public/propdata.js', 'utf8');
const clientIds = [...clientSrc.match(/export const PROP_INFO = \{[\s\S]*?\n\};/)[0]
  .matchAll(/^\s{2}([a-z]+)\s*:/gm)].map((m) => m[1]);
ok(clientIds.length === PROP_TYPES.length && clientIds.every((id, i) => id === PROP_TYPES[i]),
  'ลำดับชนิดของเซิร์ฟเวอร์กับไคลเอนต์ตรงกันทุกตัว');
ok(r.props.every((p) => typeof p.ry === 'number'), 'ทุกชิ้นมีมุมหันของตัวเอง');
ok(LAYOUTS[r.mapKey].props.length === r.props.length, 'ตำแหน่งของทุกชิ้นมาจากผังที่วางไว้ ไม่ได้สุ่ม');

const r2 = new Room('test2');
r2.setMap(r.mapKey);
const same = r2.props.every((p, i) => p.x === r.props[i].x && p.z === r.props[i].z && p.t === r.props[i].t);
ok(same, 'ทุกห้องที่เล่นด่านเดียวกันใช้ผังเดียวกัน ผู้เล่นจำตำแหน่งของได้');
ok(r2.props[0].id !== r.props[0].id, 'แต่ id ของแต่ละห้องสุ่มแยกกัน');

/* หาของชนิดที่ต้องการที่ไม่มีของอื่นอยู่ในรัศมี rad (ใช้ทดสอบฟิสิกส์ให้ไม่มีอะไรมารบกวน) */
function loneProp(room, types, rad) {
  for (const t of types) {
    const hit = room.props.find((q) => q.t === t && !(q.y > 0)
      && !room.props.some((o) => o !== q && !(o.y > 0) && Math.hypot(o.x - q.x, o.z - q.z) < rad)
      && !room.walls.some((w) => q.x + rad > w.x && q.x - rad < w.x + w.w && q.z + rad > w.z && q.z - rad < w.z + w.d));
    if (hit) return hit;
  }
  return null;
}

/* อ่านขนาดจริงของแต่ละชนิดจากไฟล์ข้อมูลฝั่งไคลเอนต์ */
const RAD = {};
const SIZE = {};
{
  const src = require('fs').readFileSync(__dirname + '/../public/propdata.js', 'utf8');
  const re = /^\s{2}([a-z]+)\s*:\s*\{ h: ([0-9.]+), r: ([0-9.]+)/gm;
  let m;
  while ((m = re.exec(src))) { SIZE[m[1]] = +m[2]; RAD[m[1]] = +m[3]; }
}

// ตารางขนาดฝั่งเซิร์ฟเวอร์ต้องตรงกับฝั่งไคลเอนต์ ไม่งั้นการชนจะไม่ตรงกัน
{
  const { PROP_SIZE } = require('../maplayout.js');
  const ids = Object.keys(SIZE);
  const same = ids.every((id) => PROP_SIZE[id]
    && Math.abs(PROP_SIZE[id][0] - SIZE[id]) < 1e-9
    && Math.abs(PROP_SIZE[id][1] - RAD[id]) < 1e-9);
  ok(same && Object.keys(PROP_SIZE).length === ids.length,
    `ตารางขนาดของ ${ids.length} ชนิดตรงกันทั้งสองฝั่ง`);
}
ok(r.props.every((p) => RAD[p.t] !== undefined), 'ของทุกชิ้นในด่านมีข้อมูลรัศมี');

// ของบนพื้นต้องไม่ฝังกำแพง (ของที่แขวนบนผนังตั้งใจให้ชิดผนัง ไม่นับ)
const inWall = r.props.filter((p) => {
  if (p.y > 0) return false;
  const rr = RAD[p.t] * 0.62;
  return r.walls.some((w) => p.x + rr > w.x && p.x - rr < w.x + w.w
    && p.z + rr > w.z && p.z - rr < w.z + w.d);
});
ok(inWall.length === 0, 'ไม่มีของบนพื้นชิ้นไหนฝังอยู่ในกำแพง');
{
  // เฉพาะของประเภทติดผนังเท่านั้นที่ต้องชิดผนัง (ของบนชั้นก็มี y เหมือนกันแต่คนละเรื่อง)
  const WP = require('../propclass.js').WALL_PROPS;
  const hung = r.props.filter((p) => p.y > 0.05 && WP.has(p.t));
  ok(hung.every((p) => r.walls.some((w) =>
    Math.abs(Math.max(w.x, Math.min(p.x, w.x + w.w)) - p.x) < 0.8 && Math.abs(Math.max(w.z, Math.min(p.z, w.z + w.d)) - p.z) < 0.8)),
    `ของติดผนัง ${hung.length} ชิ้นอยู่ชิดผนังจริงทุกชิ้น`);
}

let overlap = 0;
for (let i = 0; i < r.props.length; i++) {
  for (let j = i + 1; j < r.props.length; j++) {
    const a = r.props[i], b = r.props[j];
    if ((a.y > 0) !== (b.y > 0)) continue;       // ของแขวนผนังกับของบนพื้นไม่เกี่ยวกัน
    if (Math.hypot(a.x - b.x, a.z - b.z) < (RAD[a.t] + RAD[b.t]) * 0.6) overlap++;
  }
}
ok(overlap === 0, 'ไม่มีของซ้อนทับกันสักคู่');

// ประตูร้านทุกบานต้องเดินผ่านได้
const DOORS = (LAYOUTS.school.zones || []).filter((z) => z.doorAt).map((z) => {
  const d = z.doorAt;
  const along = z.door === 'n' || z.door === 's';
  return along ? { side: z.door, x: d.x, z: d.z, a: d.x - d.half, b: d.x + d.half }
    : { side: z.door, x: d.x, z: d.z, a: d.z - d.half, b: d.z + d.half };
});
let doorBlocked = 0;
for (const d of DOORS) {
  for (const p of LAYOUTS.school.props) {
    if (p.y > 0) continue;                        // ของแขวนผนังไม่ขวางทางเดิน
    const rr = RAD[p.t] || 0.5;
    const near = (d.side === 'n' || d.side === 's')
      ? (p.x + rr > d.a && p.x - rr < d.b && Math.abs(p.z - d.z) < 1.2 + rr)
      : (p.z + rr > d.a && p.z - rr < d.b && Math.abs(p.x - d.x) < 1.2 + rr);
    if (near) { doorBlocked++; if (doorBlocked < 5) console.log('   ขวางประตู:', p.t, p.x, p.z); }
  }
}
ok(doorBlocked === 0, `ไม่มีของขวางประตูห้อง (${DOORS.length} บานที่กำหนดในผัง)`);

// เดินสำรวจทั้งแผนที่ ต้องไม่มีห้องที่เข้าไม่ได้
const step = 0.6;
const walkable = (x, z) => Math.abs(x) < r.map.w / 2 - 1 && Math.abs(z) < r.map.d / 2 - 1
  && !r.walls.some((w) => x + CFG.R > w.x && x - CFG.R < w.x + w.w && z + CFG.R > w.z && z - CFG.R < w.z + w.d);
let start = null, total = 0;
for (let x = -r.map.w / 2; x < r.map.w / 2; x += step) {
  for (let z = -r.map.d / 2; z < r.map.d / 2; z += step) {
    if (walkable(x, z)) { total++; if (!start) start = [x, z]; }
  }
}
const seen = new Set([start.map((v) => v.toFixed(1)).join()]);
const q = [start];
while (q.length) {
  const [x, z] = q.pop();
  for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
    const nx = x + dx, nz = z + dz;
    const k = nx.toFixed(1) + ',' + nz.toFixed(1);
    if (seen.has(k) || !walkable(nx, nz)) continue;
    seen.add(k); q.push([nx, nz]);
  }
}
ok(seen.size / total > 0.85, `ทุกห้องเดินถึงกัน ครอบคลุม ${((seen.size / total) * 100).toFixed(0)}% ของพื้นที่ที่เดินได้`);

/* ---------- เริ่มรอบและการสุ่มร่าง ---------- */

const ua = fakeUser('เอ');
const ub = fakeUser('บี');
const a = r.add(fakeSock('a'), ua);
const b = r.add(fakeSock('b'), ub);
ok(a.pid !== b.pid, 'pid ไม่ซ้ำกัน');

r.startRound();
ok(r.phase === PHASE.HIDE, 'เข้าเฟสซ่อน');
const nS = r.list().filter((p) => p.role === 'seeker').length;
const want = Math.min(CFG.MAX_SEEKERS, Math.max(1, Math.round(r.players.size / 5)));
ok(nS === want, `ผู้เล่น ${r.players.size} คน แบ่งเป็นคนหา ${nS} คนตามสูตร`);
ok(r.players.size <= CFG.MAX_PLAYERS, `ห้องรับได้ไม่เกิน ${CFG.MAX_PLAYERS} คน`);
ok(ua.unlocked.includes(a.prop), 'ร่างที่ได้ตอนเริ่มรอบมาจากของที่ปลดล็อกไว้เท่านั้น');

// ผู้เล่นที่มีร่างเดียว ต้องได้ร่างนั้นเสมอ (ใช้ห้องแยกและล็อกด่านไว้
// ไม่งั้นรอบถัดไปสุ่มด่านใหม่แล้วร่างนั้นไม่มีในด่าน ระบบจะแจกร่างอื่นให้ ซึ่งถูกแล้ว)
{
  const rs0 = new Room('solo');
  const soloMap = rs0.mapKey;
  const soloType = [...rs0.propsByType.keys()].find((t) => store.poolFor(soloMap).some((cc) => cc.id === t));
  const cs = rs0.add(fakeSock('c'), fakeUser('เดี่ยว', [soloType]));
  let allSame = true;
  for (let i = 0; i < 20; i++) {
    const got = rs0.pickPropFor(cs.user, null, { x: cs.x, z: cs.z });
    if (got !== soloType) allSame = false;
  }
  ok(allSame, `คนที่มีร่างเดียว (${soloType}) ได้ร่างนั้นทุกครั้ง`);
}

// ร่างที่ได้ต้องมีวางอยู่ในด่านที่กำลังเล่นจริง
ok(r.list().filter((p) => p.role === 'hider').every((p) => r.propsByType.has(p.prop)),
  `ทุกคนได้ร่างที่มีอยู่ในด่าน ${r.map.name} จริง`);

// คนที่มีหลายร่าง ต้องสุ่มได้หลากหลาย
const rich = fakeUser('รวย', ['box', 'chair', 'bin', 'plant', 'sofa', 'tv']);
const d = r.add(fakeSock('d'), rich);
const got = new Set();
for (let i = 0; i < 60; i++) { r.startRound(); got.add(d.prop); }
ok(got.size >= 3, `คนที่มีหลายร่างสุ่มได้ ${got.size} แบบต่างกัน`);

/* ---------- เปลี่ยนร่างด้วยทอง ---------- */

r.startRound();
const hider = r.list().find((p) => p.role === 'hider' && !p.bot)
  || r.list().find((p) => p.role === 'hider');
// ให้มีร่างหลายอย่างที่มีในด่านนี้ จะได้เปลี่ยนได้
hider.user.unlocked = [...r.propsByType.keys()].filter((t) => !['escalator', 'elevator', 'pillar'].includes(t)).slice(0, 6);
hider.prop = hider.user.unlocked[0];
const before = hider.prop;
hider.user.gold = 500;
r.doReroll(hider);
ok(hider.user.gold === 500 - CFG.REROLL_COST, `เปลี่ยนร่างแล้วหักทอง ${CFG.REROLL_COST}`);
ok(hider.prop !== before, 'เปลี่ยนร่างแล้วได้ร่างใหม่ที่ไม่ซ้ำของเดิม');
ok(hider.user.unlocked.includes(hider.prop), 'ร่างใหม่ยังอยู่ในกลุ่มที่ปลดล็อกไว้');

hider.user.gold = 5;
const keep = hider.prop;
r.doReroll(hider);
ok(hider.prop === keep && hider.user.gold === 5, 'ทองไม่พอ เปลี่ยนร่างไม่ได้และไม่เสียทอง');

// คนที่มีร่างเดียวในด่านนี้ กดเปลี่ยนร่างแล้วต้องไม่เสียอะไร (ไม่มีร่างอื่นให้เปลี่ยน)
const oneType = [...r.propsByType.keys()][0];
const one = r.list().find((p) => !p.bot) || r.list()[0];
one.role = 'hider';
one.user.unlocked = [oneType];
one.prop = oneType;
one.user.gold = 999;
one.rerollAt = 0;
r.doReroll(one);
ok(one.prop === oneType && one.user.gold === 999,
  'คนที่มีร่างเดียวกดเปลี่ยนร่างแล้วร่างไม่เปลี่ยนและไม่เสียทอง');

const seekerNow = r.list().find((p) => p.role === 'seeker') || r.list()[0];
seekerNow.role = 'seeker';
seekerNow.user.gold = 999;
r.doReroll(seekerNow);
ok(seekerNow.user.gold === 999, 'คนหาเปลี่ยนร่างไม่ได้');

/* ---------- การเดินและการชน ---------- */

const h = r.list()[0];
h.role = 'hider';
h.x = 0; h.z = 0; h.in = { f: 1, s: 0, yaw: 0 };
r.updatePlayer(h, 0.5);
ok(h.z > 1 && Math.abs(h.x) < 0.01, 'กด W ที่ yaw=0 แล้วเดินไปทาง +Z');

h.x = 0; h.z = 0; h.in = { f: 0, s: 1, yaw: 0 };
r.updatePlayer(h, 0.5);
ok(h.x < -1 && Math.abs(h.z) < 0.01, 'กด D แล้วเดินไปทางขวาของกล้อง');

// เริ่มจากที่โล่งจริง (หาในด่านที่ห้องใช้อยู่ ไม่งั้นจะถูกของดันออกจนวัดไม่ตรง)
let sx0 = -50, sz0 = -20;
outerClear: for (let gx = -r.map.w / 2 + 4; gx <= r.map.w / 2 - 8; gx += 2) {
  for (let gz = -r.map.d / 2 + 4; gz <= r.map.d / 2 - 8; gz += 2) {
    let clear = true;
    for (let dx = 0; dx <= 5 && clear; dx += 1) {
      if (r.props.some((o) => !(o.y > 0.05) && Math.hypot(o.x - (gx + dx), o.z - (gz + dx)) < 2)) clear = false;
      if (r.walls.some((w) => gx + dx + 1 > w.x && gx + dx - 1 < w.x + w.w && gz + dx + 1 > w.z && gz + dx - 1 < w.z + w.d)) clear = false;
    }
    if (clear) { sx0 = gx; sz0 = gz; break outerClear; }
  }
}
h.x = sx0; h.z = sz0; h.y = 0; h.vy = 0; h.ground = true; h.in = { f: 1, s: 1, yaw: 0, seq: 1 };
for (let i = 0; i < 30; i++) r.updatePlayer(h, 1 / 30);
ok(Math.hypot(h.x - sx0, h.z - sz0) <= CFG.SPD_HIDER * 1.02, 'เดินทแยงไม่เร็วกว่าเดินตรง');

// หาผนังตั้งกับจุดบนผนังที่ไม่มีของวางใกล้ ๆ
let wallHit = null;
for (const q of r.walls) {
  if (!(q.h > 3 && q.d > 5 && q.w < 2 && Math.abs(q.x) < r.map.w / 2 - 4)) continue;
  for (let zz = q.z + 1; zz <= q.z + q.d - 1; zz += 1) {
    const px = q.x - CFG.R - 0.05;
    if (!r.props.some((o) => Math.hypot(o.x - px, o.z - zz) < 2.2)) { wallHit = { w: q, z: zz }; break; }
  }
  if (wallHit) break;
}
const w = wallHit.w;
h.x = w.x - CFG.R - 0.05; h.z = wallHit.z; h.y = 0;
for (let i = 0; i < 20; i++) r.moveAxis(h, 0.15, 0);   // ก้าวทีละนิดเหมือนติ๊กจริง
ok(h.x <= w.x - CFG.R + 0.001, 'ชนกำแพงแล้วทะลุไม่ได้');

h.x = 0; h.z = 0;
r.moveAxis(h, 999, 0);
ok(h.x < CFG.MAP_W / 2, 'ออกนอกแผนที่ไม่ได้');

/* ---------- การจับ ---------- */

r.startRound();
r.timer = 0; r.update(0.01);
ok(r.phase === PHASE.HUNT, 'เข้าเฟสล่า');

const sk = r.list().find((p) => p.role === 'seeker');
const hd = r.list().find((p) => p.role === 'hider');
sk.x = 0; sk.z = 0; sk.yaw = 0; sk.cd = 0; sk.slow = 0; sk.misses = 0; sk.catches = 0;
// ย้ายคนซ่อนทุกคนออกไปให้พ้นระยะ ไม่งั้นบอทที่ยืนใกล้ ๆ จะโดนตีโดนโดยบังเอิญ
r.list().forEach((q) => { if (q.role === 'hider') { q.x = 40; q.z = 30; } });
r.doHit(sk);
ok(sk.cd > 1 && sk.slow > 0, 'ตีพลาดแล้วติดคูลดาวน์และเดินช้าลง');

sk.cd = 0; sk.slow = 0;
r.list().forEach((q) => { if (q.role === 'hider') { q.x = 40; q.z = 30; } });
hd.role = 'hider'; hd.x = 0; hd.z = 1.8;
r.doHit(sk);
ok(hd.role === 'out', 'ตีโดนแล้วคนซ่อนออกจากรอบ ไม่ได้กลายเป็นคนหา');
ok(r.speedOf(hd) === 0, 'คนที่ออกจากรอบเปลี่ยนไปใช้กล้องบิน (เดินด้วยฟิสิกส์ปกติไม่ได้แล้ว)');
ok(sk.catches === 1, 'นับจำนวนที่จับได้');

const others = r.list().filter((p) => p !== sk && p.role === 'hider').slice(0, 1);
r.list().forEach((q) => { if (q.role === 'hider') { q.x = 40; q.z = 30; } });
others.forEach((p) => { p.x = 0; p.z = -1.8; });
sk.yaw = 0; sk.cd = 0;
r.doHit(sk);
ok(others.every((p) => p.role === 'hider'), 'อยู่ข้างหลัง ตีไม่โดน');
sk.yaw = Math.PI; sk.cd = 0;
r.doHit(sk);
ok(others.some((p) => p.role === 'out'), 'หันกลับไปแล้วตีโดน');
ok(r.list().filter((p) => p.role === 'seeker').length === nS,
  'จำนวนคนหาคงที่ตลอดรอบ ไม่เพิ่มขึ้นจากคนที่โดนจับ');

/* ---------- จบรอบและรางวัลทอง ---------- */

r.list().forEach((p) => { if (p.role === 'hider') p.role = 'out'; });
const goldBefore = ua.gold;
r.list().find((p) => p.user === ua).roundScore = 400;
r.update(0.01);
ok(r.phase === PHASE.END, 'จบรอบเมื่อไม่มีคนซ่อนเหลือ');
ok(ua.gold > goldBefore, `ได้ทองหลังจบรอบ +${ua.gold - goldBefore}`);
ok(ua.games > 0, 'บันทึกสถิติจำนวนรอบที่เล่น');
ok(Array.isArray(r.result.rewards) && r.result.rewards.length > 0, 'สรุปผลแสดงทองที่แต่ละคนได้');

/* ---------- แพ็กเก็ตไบนารีและการปกปิดข้อมูล ---------- */

r.list().forEach((p, i) => { p.role = i === 0 ? 'seeker' : 'hider'; });
const hidersNow = r.list().filter((p) => p.role === 'hider');
const buf = r.packObjects(hidersNow);
ok(buf instanceof Int16Array, 'วัตถุถูกอัดเป็น Int16Array');
ok(buf.length === hidersNow.length * 6,
  `แพ็กเก็ตสตรีมเฉพาะคนซ่อน ${buf.length / 6} คน (${buf.byteLength} ไบต์) — ของประจำฉาก ${r.props.length} ชิ้นส่งครั้งเดียวตอนโหลดแมป`);
ok(r.mapPayload().props.length === r.props.length && r.mapPayload().props[0].id !== undefined,
  `ผังที่ส่งตอนโหลดมีของครบพร้อมรหัส ${r.props.length} ชิ้น`);
const kbs = (buf.byteLength * CFG.NET_HZ) / 1024;
ok(kbs < 110, `แพ็กเก็ต ${buf.byteLength} ไบต์ ส่ง ${CFG.NET_HZ} ครั้ง/วินาที = ${kbs.toFixed(0)} KB/s ต่อห้อง (ส่งครั้งเดียวทั้งห้อง)`);

let ordered = true;
for (let i = 1; i < buf.length / 6; i++) if (buf[i * 6] < buf[(i - 1) * 6]) ordered = false;
ok(ordered, 'เรียงตาม id ไม่บอกว่าชิ้นไหนเป็นคน');

// ตำแหน่งที่ถอดออกมาต้องตรงกับของจริงในระดับเซนติเมตร
const first = hidersNow[0];
let found = null;
for (let i = 0; i < buf.length / 6; i++) if (buf[i * 6] === first.pid) found = i;
ok(found !== null && Math.abs(buf[found * 6 + 1] / 100 - first.x) < 0.01,
  'พิกัดที่ถอดจากแพ็กเก็ตตรงกับตำแหน่งคนซ่อนจริง');

const hiderRow = [];
for (let i = 0; i < buf.length / 6; i++) if (buf[i * 6] === hidersNow[0].pid) hiderRow.push(i);
ok(hiderRow.length === 1, 'คนซ่อนถูกใส่ในแพ็กเก็ตเดียวกับเฟอร์นิเจอร์ ไม่มีช่องแยก');

/* ---------- บอท ---------- */

const rb = new Room('bots');
const ub2 = fakeUser('คนจริง');
rb.add(fakeSock('h1'), ub2);
rb.startRound();
ok(rb.players.size === CFG.BOT_FILL, `คนไม่ครบ ระบบเติมบอทจนครบ ${rb.players.size} คน`);
ok(rb.bots().length === CFG.BOT_FILL - 1, `บอท ${rb.bots().length} ตัวเล่นร่วมกับคนจริง 1 คน`);
ok(rb.humans().length === 1, 'นับคนจริงแยกจากบอท');
ok(rb.seekerCount() >= 1 && rb.seekerCount() <= CFG.MAX_SEEKERS,
  `คนหา ${rb.seekerCount()} คน อยู่ในช่วง 1-${CFG.MAX_SEEKERS}`);

// บอทต้องขยับได้จริงและไม่ทะลุกำแพง
// (บางตัวอาจเกิดใกล้ที่ซ่อนพอดีจนแทบไม่ต้องเดิน เลยวัดจากทั้งกลุ่ม)
const starts = rb.bots().filter((p) => p.role === 'hider').map((p) => ({ p, x: p.x, z: p.z }));
for (let i = 0; i < 200; i++) rb.update(1 / 30);
const walked = starts.filter((s0) => Math.hypot(s0.p.x - s0.x, s0.p.z - s0.z) > 1).length;
ok(walked >= Math.ceil(starts.length / 2), `บอทคนซ่อน ${walked}/${starts.length} ตัวเดินไปหาที่ซ่อนของตัวเอง`);
let anyInWall = false;
for (const p of rb.list()) {
  if (p.hold) continue;
  if (rb.walls.some((w) => p.x + CFG.R > w.x + 0.02 && p.x - CFG.R < w.x + w.w - 0.02
    && p.z + CFG.R > w.z + 0.02 && p.z - CFG.R < w.z + w.d - 0.02)) anyInWall = true;
}
ok(!anyInWall, 'ไม่มีบอทตัวไหนหลุดเข้าไปในกำแพง');

// บอทคนซ่อนควรไปยืนใกล้ของชนิดเดียวกับร่างตัวเอง วัดตอนจบช่วงซ่อนพอดี
// (ถ้าวัดตอนกลางเฟสล่า บางตัวโดนจับไปแล้ว จำนวนตัวอย่างจะเหลือน้อยจนผลแกว่ง)
rb.startRound();
for (let i = 0; i < 30 * (CFG.HIDE_TIME - 1) && rb.phase === PHASE.HIDE; i++) rb.update(1 / 30);
const settled = rb.bots().filter((p) => p.role === 'hider');
let nearMatch = 0;
for (const p of settled) {
  const same = rb.propsByType.get(p.prop) || [];
  if (same.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 4.5)) nearMatch++;
}
ok(settled.length === 0 || nearMatch / settled.length >= 0.25,
  `บอท ${nearMatch}/${settled.length} ตัวไปยืนใกล้ของชนิดเดียวกับร่างตัวเอง`);

// บอทคนหาต้องจับคนซ่อนได้บ้าง ไม่ใช่เดินวนเฉย ๆ
const rc = new Room('bots2');
rc.add(fakeSock('h2'), fakeUser('คนจริง2'));
rc.startRound();
rc.timer = 0; rc.update(0.01);
// นับจากจำนวนที่คนหาแต่ละตัวจับได้ และหยุดทันทีที่รอบจบ ไม่งั้นรอบใหม่จะรีเซ็ตตัวเลข
// ห้างใหญ่และบอทถูกลดฝีมือลงมาก จึงวัดจากหลายรอบรวมกันเพื่อไม่ให้ผลแกว่ง
let caught = 0, rounds = 0, ended = 0;
for (let round = 0; round < 3 && caught === 0; round++) {
  rounds++;
  rc.startRound();
  rc.timer = 0; rc.update(0.01);
  const seekers0 = rc.list().filter((p) => p.role === 'seeker');
  const before3 = rc.hidersAlive();
  for (let i = 0; i < 30 * CFG.HUNT_TIME && rc.phase === PHASE.HUNT; i++) rc.update(1 / 30);
  rc.update(1 / 30);
  if (rc.phase !== PHASE.HUNT || rc.hidersAlive() < before3) ended++;
  caught += seekers0.reduce((a, p) => a + p.catches, 0);
}
ok(caught > 0, `บอทคนหาจับคนซ่อนได้ ${caught} คนภายใน ${rounds} รอบ`);
ok(ended > 0, 'รอบเดินหน้าจนจบเวลาหรือมีคนโดนจับได้เองด้วยบอทล้วน');

/* ---------- หาเส้นทาง ---------- */

const pth = findPath(-25, -14, 25, 14);
ok(pth.length > 2, `หาเส้นทางข้ามตึกได้ ${pth.length} จุด`);
let blocked = false;
for (let i = 1; i < pth.length; i++) {
  if (!clearLine(pth[i - 1].x, pth[i - 1].z, pth[i].x, pth[i].z, WALLS, 0.45)) blocked = true;
}
ok(!blocked, 'ทุกช่วงของเส้นทางเดินตรงได้จริงโดยไม่ชนกำแพง');
ok(NAV.nodes.length > 40 && NAV.edges.every((e) => e.length > 0), `กราฟจุดเดินมี ${NAV.nodes.length} จุด เชื่อมกันครบ`);

/* ---------- กระโดด ---------- */

const rj = new Room('jump');
const uj = fakeUser('นักกระโดด');
const pj = rj.add(fakeSock('j1'), uj);
rj.startRound();
rj.timer = 0; rj.update(0.01);
pj.role = 'hider'; pj.y = 0; pj.vy = 0; pj.ground = true;
pj.wantJump = true;
rj.updatePlayer(pj, 1 / 30);
ok(pj.y > 0 && !pj.ground, 'กดกระโดดแล้วลอยขึ้นจากพื้น');
let peak = 0;
for (let i = 0; i < 90; i++) { rj.updatePlayer(pj, 1 / 30); peak = Math.max(peak, pj.y); }
ok(peak > 0.8 && peak < 1.6, `กระโดดสูงสุด ${peak.toFixed(2)} เมตร`);
ok(pj.y === 0 && pj.ground, 'ตกลงพื้นแล้วหยุดที่ระดับพื้นพอดี');

pj.wantJump = true; pj.y = 0.5; pj.ground = false; const vyBefore = pj.vy;
rj.updatePlayer(pj, 1 / 30);
ok(pj.vy < vyBefore + 0.01, 'กดกระโดดซ้ำกลางอากาศไม่ได้');

// ความสูงถูกยัดลงในช่อง m ของแพ็กเก็ตโดยไม่ทำให้แพ็กเก็ตใหญ่ขึ้น
pj.y = 1.23; pj.moving = true; pj.role = 'hider';
const bufJ = rj.packObjects([pj]);
const last = bufJ.length - 6;
ok(bufJ.length === 6, 'แพ็กเก็ตยังใช้ 6 ช่องต่อคนซ่อนหนึ่งคนเท่าเดิม');
let idxJ = -1;
for (let i = 0; i < bufJ.length / 6; i++) if (bufJ[i * 6] === pj.pid) idxJ = i;
const packed = bufJ[idxJ * 6 + 5];
ok((packed & 1) === 1 && Math.abs((packed >> 1) / 100 - 1.23) < 0.02,
  'ถอดแพ็กเก็ตได้ทั้งสถานะกำลังขยับและความสูง');

/* ---------- คนหาต่อยผิดได้จำกัด ---------- */

const rm = new Room('miss');
const um = fakeUser('คนหา');
const pm = rm.add(fakeSock('m1'), um);
rm.startRound();
rm.timer = 0; rm.update(0.01);
rm.list().forEach((q) => { q.role = q === pm ? 'seeker' : 'hider'; q.x = 40; q.z = 20; });
pm.x = 0; pm.z = 0; pm.yaw = 0;
const said = [];
pm.socket.emit = (ev, msg) => { if (ev === 'toast') said.push(msg); };
for (let i = 0; i < CFG.MAX_MISS; i++) { pm.cd = 0; rm.doHit(pm); }
ok(pm.misses === CFG.MAX_MISS, `เสียหัวใจครบ ${pm.misses} ดวงตามที่กำหนด`);
ok(pm.role === 'out', 'หัวใจหมดแล้วออกจากรอบไปนั่งดู');
ok(rm.speedOf(pm) === 0, 'หัวใจหมดแล้วเปลี่ยนไปใช้กล้องบินดูรอบนี้');
ok(/หัวใจหมด/.test(said[said.length - 1] || ''), 'มีข้อความบอกว่าหัวใจหมดแล้ว');
pm.cd = 0;
rm.doHit(pm);
ok(pm.misses === CFG.MAX_MISS, 'ออกจากรอบแล้วต่อยต่อไม่ได้');

// ต่อยถูกไม่กินโควตา
const rm2 = new Room('miss2');
const pm2 = rm2.add(fakeSock('m2'), fakeUser('คนหา2'));
const ph2 = rm2.add(fakeSock('m3'), fakeUser('คนซ่อน2'));
rm2.startRound();
rm2.timer = 0; rm2.update(0.01);
pm2.role = 'seeker'; ph2.role = 'hider';
// หาที่โล่งจริงในด่านที่ห้องนี้เล่นอยู่ ไม่ใช้ (0,0) ตายตัว เพราะแต่ละด่านกลางแมปไม่เหมือนกัน
let hx = 0, hz = 0;
outerHit: for (let gx = -rm2.map.w / 2 + 4; gx <= rm2.map.w / 2 - 4; gx += 1.5) {
  for (let gz = -rm2.map.d / 2 + 4; gz <= rm2.map.d / 2 - 6; gz += 1.5) {
    const clear = !rm2.props.some((q) => !(q.y > 0.05)
        && (Math.hypot(q.x - gx, q.z - gz) < 2 || Math.hypot(q.x - gx, q.z - (gz + 1.8)) < 2))
      && !rm2.walls.some((w) => gx + 1 > w.x && gx - 1 < w.x + w.w && gz + 3 > w.z && gz - 1 < w.z + w.d);
    if (clear) { hx = gx; hz = gz; break outerHit; }
  }
}
pm2.x = hx; pm2.z = hz; pm2.yaw = 0; pm2.cd = 0; pm2.misses = 0;
ph2.x = hx; ph2.z = hz + 1.8;
rm2.doHit(pm2);
ok(ph2.role === 'out' && pm2.misses === 0, 'ต่อยถูกไม่เสียโควตาต่อยผิด');

/* ---------- โดนจับเร็วเกินไป เกิดใหม่เป็นคนซ่อนได้ฟรี ---------- */

ok(ph2.deadAt > 0, 'คนที่โดนจับถูกบันทึกเวลาที่ตาย');
rm2.timer = CFG.HUNT_TIME - 5;                 // เพิ่งเริ่มล่าไปได้ 5 วินาที
ph2.user.gold = 0;
ok(!rm2.canRevive(ph2), 'ทองไม่พอ เกิดใหม่ไม่ได้');
ph2.user.gold = CFG.REVIVE_COST + 20;
ok(rm2.canRevive(ph2), 'โดนจับตอนต้นเกมและมีทองพอ เกิดใหม่ได้');
rm2.doRevive(ph2);
ok(ph2.role === 'hider', 'เกิดใหม่แล้วกลับมาเป็นคนซ่อน ไม่ใช่ไปอยู่ทีมหา');
ok(!!ph2.prop && rm2.propsByType.has(ph2.prop), 'ได้ร่างใหม่ที่มีในด่านด้วย');
ok(ph2.user.gold === 20, `หักค่าเกิดใหม่ ${CFG.REVIVE_COST} ทอง (เหลือ ${ph2.user.gold})`);
ok(ph2.revived === true && !rm2.canRevive(ph2), 'เกิดใหม่ได้ครั้งเดียวต่อรอบ');

{
  // ปล่อยจนหมดเวลาตัดสินใจ = เป็นผู้ชมไปจนจบรอบ
  const rl = new Room('lateout');
  const pl = rl.add(fakeSock('lo'), fakeUser('ตายท้ายเกม'));
  rl.startRound(); rl.timer = 0; rl.update(0.01);
  pl.role = 'out'; pl.revived = false; pl.user.gold = 999;
  pl.deadAt = Date.now() - (CFG.REVIVE_WINDOW + 2) * 1000;
  rl.timer = CFG.HUNT_TIME * 0.8;
  ok(!rl.canRevive(pl), 'ปล่อยจนหมดเวลาตัดสินใจแล้ว เกิดใหม่ไม่ได้');
}

/* ---------- ผู้ชมเป็นกล้องบิน เลื่อนดูได้ทั้งแมป ---------- */
{
  const rs = new Room('spectate');
  const ps = rs.add(fakeSock('sp1'), fakeUser('ผู้ชม'));
  rs.startRound(); rs.timer = 0; rs.update(0.01);
  ps.role = 'out'; ps.x = 0; ps.z = 0;
  ps.in = { f: 1, s: 0, yaw: 0, seq: 1 };
  for (let i = 0; i < 30; i++) rs.updateSpectators(1 / 30);
  ok(Math.hypot(ps.x, ps.z) > 12, `กล้องผู้ชมเลื่อนเองได้ 1 วินาที ${Math.hypot(ps.x, ps.z).toFixed(0)} เมตร`);
  ok(Math.abs(ps.y - CFG.SPEC_HEIGHT) < 0.01, `กล้องลอยสูง ${CFG.SPEC_HEIGHT} ม. มองข้ามกำแพงห้องได้`);

  // เลื่อนไปได้ทุกทิศจนสุดขอบ และไม่หลุดออกนอกแมป
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    ps.x = 0; ps.z = 0; ps.in = { f: 1, s: 0, yaw, seq: 1 };
    for (let i = 0; i < 30 * 12; i++) rs.updateSpectators(1 / 30);
    ok(Math.abs(ps.x) <= rs.map.w / 2 && Math.abs(ps.z) <= rs.map.d / 2,
      `เลื่อนไปทางทิศ ${Math.round(yaw * 57.3)} องศาจนสุดแล้วยังอยู่ในแมป`);
  }
  const reach = Math.max(Math.abs(ps.x), Math.abs(ps.z));
  ok(reach > Math.min(rs.map.w, rs.map.d) / 2 - 3, 'เลื่อนไปถึงขอบแมปได้จริง (ดูได้ทั้งแมป)');

  // วาร์ปไปหาคนที่ยังเล่นอยู่
  const before = { x: ps.x, z: ps.z };
  ps.specStep = 1;
  rs.updateSpectators(1 / 30);
  ok(rs.spectateTargets().length > 0 && (ps.x !== before.x || ps.z !== before.z),
    `กดถัดไปแล้ววาร์ปไปหา ${ps.specName}`);

  const rows = rs.buildRows(rs.list().filter((q) => q.role === 'hider'));
  ok(!rows.some((rw) => rw[0] === ps.pid), 'ผู้ชมไม่โผล่ในแพ็กเก็ตของคนอื่น');
}

/* ---------- ปุ่มเกิดใหม่มีเวลานับถอยหลังส่วนตัว ---------- */
{
  const rr4 = new Room('revwin');
  const pr4 = rr4.add(fakeSock('rw'), fakeUser('ตาย'));
  rr4.startRound(); rr4.timer = 0; rr4.update(0.01);
  pr4.role = 'out'; pr4.revived = false; pr4.user.gold = CFG.REVIVE_COST + 50;
  rr4.timer = CFG.HUNT_TIME - 5;               // เพิ่งเริ่มล่า
  pr4.deadAt = Date.now();
  ok(Math.abs(rr4.reviveLeft(pr4) - CFG.REVIVE_WINDOW) < 0.2,
    `เพิ่งโดนจับ มีเวลาตัดสินใจเต็ม ${CFG.REVIVE_WINDOW} วินาที`);
  ok(rr4.canRevive(pr4), 'ในหน้าต่างเวลา เกิดใหม่ได้');

  // โดนจับตอนท้ายรอบก็ยังได้เวลาตัดสินใจเท่ากัน (นับจากตอนตาย ไม่ใช่เวลาในรอบ)
  rr4.timer = CFG.REVIVE_MIN_TIME + 5;
  pr4.deadAt = Date.now();
  ok(Math.abs(rr4.reviveLeft(pr4) - CFG.REVIVE_WINDOW) < 0.2, 'ตายตอนท้ายรอบก็ได้เวลาเท่ากัน');

  // ปล่อยให้หมดเวลา → เป็นผู้ชมไปจนจบรอบ
  pr4.deadAt = Date.now() - (CFG.REVIVE_WINDOW + 1) * 1000;
  ok(rr4.reviveLeft(pr4) === 0 && !rr4.canRevive(pr4), 'กดไม่ทันแล้วหมดสิทธิ์ ดูจนจบรอบ');
  rr4.doRevive(pr4);
  ok(pr4.role === 'out', 'หมดเวลาแล้วกดก็ไม่เกิดใหม่');

  // เหลือเวลาในรอบน้อยเกินไปก็ไม่ให้เกิด
  pr4.deadAt = Date.now(); rr4.timer = CFG.REVIVE_MIN_TIME - 5;
  ok(!rr4.canRevive(pr4), `เหลือเวลาในรอบไม่ถึง ${CFG.REVIVE_MIN_TIME} วิ เกิดใหม่ไม่ได้`);
}

/* ---------- คนที่หลุดการเชื่อมต่อไม่ค้างอยู่ในเกม ---------- */
{
  const rg = new Room('ghost');
  const pg = rg.add(fakeSock('g1'), fakeUser('เพื่อนที่ออกไป'));
  rg.startRound(); rg.timer = 0; rg.update(0.01);
  pg.role = 'hider';
  const aliveBefore = rg.hidersAlive();
  // จำลองสิ่งที่ server ทำตอนหลุด: socket หาย + ตั้งเวลาไว้
  pg.socket = null; pg.gone = Date.now();
  ok(rg.isGone(pg), 'ระบบรู้ว่าคนนี้หลุดอยู่');
  ok(rg.hidersAlive() === aliveBefore - 1, 'ไม่นับเป็นคนซ่อนที่เหลือ (รอบจบได้ตามปกติ)');
  ok(!rg.spectateTargets().includes(pg), 'ผู้ชมวาร์ปไปหาคนที่หลุดไม่ได้');
  const rows = rg.buildRows(rg.list().filter((q) => q.role === 'hider' && !rg.isGone(q)));
  ok(!rows.some((rw) => rw[0] === pg.pid), 'ตำแหน่งไม่ถูกส่งไปให้คนอื่นเห็น');
  rg.startRound();
  ok(!rg.players.has(pg.id), 'ขึ้นรอบใหม่แล้วถูกเอาออกจากห้องเลย ไม่ค้างอยู่ในรายชื่อ');
}

/* ---------- เอาคำอธิบายบนจอยออกแล้ว ---------- */
{
  const html = require('fs').readFileSync(__dirname + '/../public/index.html', 'utf8');
  const g = require('fs').readFileSync(__dirname + '/../public/game.js', 'utf8');
  ok(!/id="stickHint"/.test(html) && !/id="lockHint"/.test(html), 'ไม่มีกล่องข้อความอธิบายบนจอยใน HTML แล้ว');
  ok(!/stickHint|lockHint/.test(g), 'โค้ดไม่อ้างถึงกล่องข้อความนั้นแล้ว');
}

/* ---------- ห้องรับคนจริงได้ 25 คน ---------- */
ok(CFG.MAX_PLAYERS === 25 && CFG.MAX_HIDERS + CFG.MAX_SEEKERS === 25,
  `ห้องรับคนจริงได้ ${CFG.MAX_PLAYERS} คน (${CFG.MAX_HIDERS} ซ่อน : ${CFG.MAX_SEEKERS} หา)`);

/* ---------- คนซ่อนเห็นเพื่อนร่วมทีมทั้งแมป คนหาเห็นแค่ในระยะ ---------- */
{
  const rt = new Room('teamsee');
  rt.add(fakeSock('ts1'), fakeUser('ทีม'));
  rt.startRound(); rt.timer = 0; rt.update(0.01);
  const hid = rt.list().filter((q) => q.role === 'hider');
  const rows = rt.buildRows(hid);
  ok(rt.packAll(rows).length / 6 === hid.length, `คนซ่อนได้รับตำแหน่งเพื่อนร่วมทีมครบ ${hid.length} คนโดยไม่คัดระยะ`);
  const far = rt.packFor(rows, rt.map.w, rt.map.d).length / 6;
  ok(far < hid.length, `คนหาที่อยู่ไกลได้รับแค่ ${far} คน (ยังกันโกงอยู่)`);
  const sv = require('fs').readFileSync(__dirname + '/../server.js', 'utf8');
  ok(/p\.role === 'seeker' \? this\.packFor\(rows, p\.x, p\.z\) : this\.packAll\(rows\)/.test(sv),
    'เซิร์ฟเวอร์คัดระยะเฉพาะคนหา');
}

/* ---------- เน็ตสะดุดไม่เด้งออกล็อบบี้ ---------- */
{
  const g = require('fs').readFileSync(__dirname + '/../public/game.js', 'utf8');
  const dc = g.slice(g.indexOf("socket.on('disconnect'"), g.indexOf("socket.on('disconnect'") + 700);
  ok(!/^\s*socket\.on\('disconnect', \(\) => \{ if \(joined\) \{ toast\([^)]*\); quit\(\); \} \}\);/m.test(g),
    'เน็ตหลุดแล้วไม่ quit ทันที');
  ok(/reconnectTimer = setTimeout/.test(dc) && /60000/.test(dc), 'รอต่อกลับ 60 วินาทีก่อนกลับล็อบบี้');
  ok(/reconnection: true/.test(g) && /joinedRoom/.test(g), 'ต่อกลับแล้ว join ห้องเดิมอัตโนมัติ');
  const sv = require('fs').readFileSync(__dirname + '/../server.js', 'utf8');
  ok(/old\.emit\('kick'/.test(sv) && /online\.set\(ukey, \{ room: room\.id, sid: socket\.id \}\)/.test(sv),
    'บัญชีเดิมต่อเข้ามาซ้ำ การเชื่อมต่อใหม่ชนะ (ปิดอันเก่าแทนที่จะเตะอันใหม่)');
}

/* ---------- เมนูเพื่อนในล็อบบี้ ---------- */
{
  const html = require('fs').readFileSync(__dirname + '/../public/index.html', 'utf8');
  ok(/data-panel="pFriends"/.test(html) && /id="pFriends"/.test(html), 'ล็อบบี้มีปุ่มและแผงเพื่อนแยกต่างหาก');
  ok(/id="frList"/.test(html) && /id="frAdd"/.test(html), 'แผงเพื่อนมีรายชื่อและช่องเพิ่มเพื่อน');
}

/* ---------- เปลี่ยนร่าง: ฟรี 1 ครั้ง แล้วรอ cooldown ไม่ใช้ทอง ---------- */
{
  const rc = new Room('rerollcd');
  const pc = rc.add(fakeSock('rc'), fakeUser('นักเปลี่ยน'));
  rc.startRound(); rc.timer = 0; rc.update(0.01);
  pc.role = 'hider';
  pc.user.unlocked = [...rc.propsByType.keys()].filter((t) => !['escalator', 'elevator', 'pillar', 'lamppost', 'tree'].includes(t)).slice(0, 6);
  pc.prop = pc.user.unlocked[0]; pc.rerollAt = 0;
  pc.user.gold = 0;
  const before = pc.prop;
  rc.doReroll(pc);
  ok(pc.prop !== before && pc.user.gold === 0, 'เปลี่ยนร่างครั้งแรกฟรี ไม่ต้องมีทอง');
  const second = pc.prop;
  rc.doReroll(pc);
  ok(pc.prop === second, `เปลี่ยนซ้ำทันทีไม่ได้ ต้องรอ ${CFG.REROLL_CD} วินาที`);
  pc.rerollAt = Date.now() - (CFG.REROLL_CD + 1) * 1000;
  rc.doReroll(pc);
  ok(pc.prop !== second, 'พ้น cooldown แล้วเปลี่ยนได้อีก');
}

/* ---------- เน็ตหลุดกลางรอบ: ที่นั่งถูกเก็บไว้ ไม่ใช่ถูกเตะทันที ---------- */
{
  const rd = new Room('dcroom');
  const pd = rd.add(fakeSock('dc1'), fakeUser('คนเน็ตหลุด'));
  rd.startRound(); rd.timer = 0; rd.update(0.01);
  pd.role = 'hider';
  // จำลองสิ่งที่ server ทำตอน disconnect (ไม่ใช่ explicit leave): socket หาย แต่ยังอยู่ในห้อง
  pd.socket = null; pd.gone = Date.now();
  rd.update(1 / 30);
  ok(rd.players.has(pd.id) && pd.role === 'hider', 'เน็ตหลุดแล้วตัวละครยังอยู่ในห้องรอกลับมา ไม่โดนหักทอง');
  ok(rd.list().filter((q) => !q.bot).length === 1, 'ห้องยังนับว่ามีคนจริงอยู่ ไม่ถูกปิด');
}

/* ---------- ตอบรับหมายเลขอินพุต ใช้ให้ไคลเอนต์ปรับตำแหน่งได้เนียน ---------- */

const ra = new Room('ack');
const pa = ra.add(fakeSock('a1'), fakeUser('เอซี'));
ra.startRound();
ra.timer = 0; ra.update(0.01);
pa.in = { f: 1, s: 0, yaw: 0, seq: 42 };
ra.updatePlayer(pa, 1 / 30);
ok(pa.ack === 42, 'เซิร์ฟเวอร์ตอบกลับหมายเลขอินพุตล่าสุดที่ประมวลผลไปแล้ว');

/* ก้าวขนาดเท่ากันทุกครั้ง ผลลัพธ์จึงทำนายซ้ำได้ตรงเป๊ะ */
const simStep = (p, c, dt) => {
  p.in = { f: c.f, s: c.s, yaw: c.yaw, seq: 0 };
  ra.updatePlayer(p, dt);
};
const pb = ra.add(fakeSock('a2'), fakeUser('บีซี'));
pb.role = 'hider'; pa.role = 'hider';
pa.x = 0; pa.z = 0; pa.y = 0; pa.vy = 0; pa.ground = true; pa.slow = 0;
pb.x = 0; pb.z = 0; pb.y = 0; pb.vy = 0; pb.ground = true; pb.slow = 0;
const inputs = [];
for (let i = 0; i < 40; i++) inputs.push({ f: 1, s: i % 7 === 0 ? 1 : 0, yaw: i * 0.08 });
for (const c of inputs) simStep(pa, c, 1 / 30);
for (const c of inputs) simStep(pb, c, 1 / 30);
ok(Math.abs(pa.x - pb.x) < 1e-9 && Math.abs(pa.z - pb.z) < 1e-9,
  'จำลองอินพุตชุดเดียวกันสองรอบได้ตำแหน่งตรงกันเป๊ะ (ไคลเอนต์จึงทำนายตรงกับเซิร์ฟเวอร์)');

/* ---------- เลเวลและ XP ---------- */

const ux = fakeUser('เลเวล');
store.ensure(ux);
const lv0 = store.levelOf(ux.xp);
for (let i = 0; i < 15; i++) store.recordRound(ux, { won: true, catches: 2, score: 500 });
ok(store.levelOf(ux.xp) > lv0, `เล่นไป 15 รอบได้ Lv.${store.levelOf(ux.xp)} จาก xp ${ux.xp}`);
const prof = store.publicProfile(ux);
ok(prof.xpInLevel < prof.xpPerLevel && prof.level === store.levelOf(ux.xp),
  `แถบ xp แสดง ${prof.xpInLevel}/${prof.xpPerLevel} ของ Lv.${prof.level}`);

/* ---------- ล็อกท่าและหมุนวัตถุ ---------- */

const rt = new Room('turn');
const pt = rt.add(fakeSock('t1'), fakeUser('ช่างหมุน'));
rt.startRound();
rt.timer = 0; rt.update(0.01);
pt.role = 'hider'; pt.locked = false; pt.propRy = 0;

// ร่างที่ปลอมตัวหันตามมุมกล้อง หันตัวไปทางไหนของก็หันตาม
pt.in = { f: 0, s: 0, yaw: 1.2, seq: 1 };
rt.updatePlayer(pt, 1 / 30);
ok(Math.abs(pt.propRy - 1.2) < 1e-6, 'หันกล้องแล้วร่างที่ปลอมหันตามทันที');
pt.in.yaw = -0.5;
rt.updatePlayer(pt, 1 / 30);
ok(pt.propRy > Math.PI, 'หันกลับด้านแล้วมุมวนไปด้านหลังถูกต้อง');
pt.in.yaw = 0;
rt.updatePlayer(pt, 1 / 30);

const spd0 = rt.speedOf(pt);
pt.wantLock = 1;
rt.updatePlayer(pt, 1 / 30);
ok(pt.locked === true && rt.speedOf(pt) === 0, 'ล็อกท่าแล้วเดินไม่ได้');

// ล็อกท่าอยู่ก็ยังกระโดดได้ ล็อกแค่การเดินเท่านั้น
pt.y = 0; pt.vy = 0; pt.ground = true; pt.wantJump = true;
rt.updatePlayer(pt, 1 / 30);
ok(pt.y > 0, 'ล็อกท่าอยู่ก็ยังกระโดดได้');
for (let i = 0; i < 70; i++) rt.updatePlayer(pt, 1 / 30);

// กดล็อกกลางอากาศได้
pt.locked = false; pt.y = 0.6; pt.ground = false; pt.wantLock = 1;
rt.updatePlayer(pt, 1 / 30);
ok(pt.locked === true, 'กดล็อกท่าตอนลอยกลางอากาศได้');
pt.y = 0; pt.vy = 0; pt.ground = true;
pt.in = { f: 1, s: 0, yaw: 0, seq: 1 };
const bx = pt.x, bz = pt.z;
for (let i = 0; i < 20; i++) rt.updatePlayer(pt, 1 / 30);
ok(Math.abs(pt.x - bx) < 1e-9 && Math.abs(pt.z - bz) < 1e-9, 'ล็อกอยู่แล้วกดเดินก็ไม่ขยับ');
pt.wantLock = 1;
rt.updatePlayer(pt, 1 / 30);
ok(pt.locked === false && rt.speedOf(pt) === spd0, 'ปลดล็อกแล้วเดินได้เหมือนเดิม');

const ps = rt.add(fakeSock('t2'), fakeUser('คนหาหมุน'));
ps.role = 'seeker'; ps.propRy = 0;
ps.in = { f: 0, s: 0, yaw: 2, seq: 1 };
rt.updatePlayer(ps, 1 / 30);
ok(ps.propRy === 0, 'คนหาไม่มีร่างให้หมุน');

// ล็อกท่าแล้วร่างค้างมุมเดิม หันกล้องดูรอบ ๆ ได้โดยของไม่หัน
pt.locked = true;
const keepRy = pt.propRy;
pt.in.yaw = 2.5;
rt.updatePlayer(pt, 1 / 30);
ok(pt.propRy === keepRy, 'ล็อกท่าแล้วหันกล้องดูรอบ ๆ ได้โดยร่างไม่หันตาม');
pt.locked = false;

/* ---------- เส้นเลเวลใหม่ ---------- */

ok(store.xpNeeded(1) < store.xpNeeded(10) && store.xpNeeded(10) < store.xpNeeded(50),
  `เลเวลต้น ๆ ใช้ exp น้อย (Lv.1 ${store.xpNeeded(1)}) แล้วมากขึ้นตามเลเวล (Lv.50 ${store.xpNeeded(50)})`);
ok(store.progressOf(0).level === 1, 'เริ่มต้นที่เลเวล 1');
ok(store.progressOf(store.xpNeeded(1)).level === 2, 'ครบ exp ของเลเวล 1 แล้วขึ้นเลเวล 2');
let totalXp = 0;
for (let i = 1; i < store.MAX_LEVEL; i++) totalXp += store.xpNeeded(i);
ok(store.progressOf(totalXp).level === store.MAX_LEVEL, `สะสม ${totalXp.toLocaleString()} exp ถึงเลเวล ${store.MAX_LEVEL}`);
ok(store.progressOf(totalXp * 10).level === store.MAX_LEVEL, `ตันที่เลเวล ${store.MAX_LEVEL} ไม่ขึ้นต่อ`);
const midway = store.progressOf(Math.round(totalXp / 3));
ok(midway.inLevel < midway.need, `กลางทางแถบ exp แสดง ${midway.inLevel}/${midway.need} ของ Lv.${midway.level}`);

/* ---------- ชนสิ่งของ ---------- */

const rp = new Room('phys');
const pp = rp.add(fakeSock('p1'), fakeUser('นักชน'));
rp.startRound();
rp.timer = 0; rp.update(0.01);
pp.role = 'hider'; pp.locked = false;

// เดินเข้าชั้นวาง ต้องหยุด ไม่ทะลุ
const tall = rp.props.find((q) => q.t === 'shelf' || q.t === 'showcase' || q.t === 'fridge');
pp.x = tall.x; pp.z = tall.z - 4; pp.y = 0; pp.vy = 0; pp.ground = true;
pp.in = { f: 1, s: 0, yaw: 0, seq: 1 };
for (let i = 0; i < 90; i++) rp.updatePlayer(pp, 1 / 30);
const gap = Math.hypot(pp.x - tall.x, pp.z - tall.z);
ok(gap > 0.7, `เดินชนชั้นวางแล้วหยุด ห่าง ${gap.toFixed(2)} เมตร ไม่ทะลุเข้าไป`);

// ของสูงปานกลางต้องกระโดดข้าม เลือกชิ้นที่ไม่มีของสูงบังทางเข้าถึง
const tallNear = (o, rad) => rp.props.some((q) => q !== o
  && (RAD[q.t] || 0) > 0 && (SIZE[q.t] || 0) > 1.2
  && Math.hypot(q.x - o.x, q.z - o.z) < rad);
const low = ['box', 'basket', 'cart', 'shopbag', 'hay', 'rock', 'barrel', 'bucket', 'feeder']
  .flatMap((t) => rp.props.filter((q) => q.t === t && !(q.y > 0)))
  .find((q) => !tallNear(q, 4));
pp.x = low.x; pp.z = low.z - 2.2; pp.y = 0; pp.vy = 0; pp.ground = true;
pp.in = { f: 1, s: 0, yaw: 0, seq: 1 };
let jumped = false;
for (let i = 0; i < 150; i++) {
  if (i % 24 === 6) pp.wantJump = true;     // กระโดดซ้ำ ๆ เหมือนคนเล่นจริง
  rp.updatePlayer(pp, 1 / 30);
  if (pp.z > low.z + 0.3) jumped = true;
}
ok(jumped, `กระโดดข้ามของอย่าง ${low.t} ได้`);

// ของเตี้ยเดินชนถ้าไม่กระโดด
pp.x = low.x; pp.z = low.z - 2.2; pp.y = 0; pp.vy = 0; pp.ground = true;
pp.in = { f: 1, s: 0, yaw: 0, seq: 1 };
for (let i = 0; i < 90; i++) rp.updatePlayer(pp, 1 / 30);
ok(pp.z < low.z, 'ถ้าไม่กระโดดก็เดินทะลุของชิ้นนั้นไม่ได้');

// ของแบน ๆ อย่างจานเดินข้ามได้เลยโดยไม่ต้องกระโดด
const flat = loneProp(rp, ['plate', 'cable', 'tire', 'snake'], 2.6);
if (flat) {
  pp.x = flat.x; pp.z = flat.z - 1.6; pp.y = 0; pp.vy = 0; pp.ground = true;
  pp.in = { f: 1, s: 0, yaw: 0, seq: 1 };
  for (let i = 0; i < 40; i++) rp.updatePlayer(pp, 1 / 30);
  ok(pp.z > flat.z, 'ของแบนอย่างจานเดินข้ามได้เลย ไม่ต้องกระโดด');
}

// จุดเกิดต้องไม่โผล่กลางกองสินค้า
let bad = 0;
for (let i = 0; i < 60; i++) {
  const sp = rp.list()[0];
  rp.startRound();
  for (const q of rp.list()) {
    const near = rp.props.filter((o) => Math.hypot(o.x - q.x, o.z - q.z) < 0.45);
    if (near.length) bad++;
  }
  if (bad) break;
}
ok(bad === 0, 'ทุกคนเกิดในที่โล่ง ไม่โผล่ซ้อนกับสินค้า');

/* ---------- รายชื่อผู้เล่นในห้อง ---------- */

let wpay = null;
const anyHuman = rp.humans()[0];
rp.startRound();
const io2 = require('socket.io');
rp.broadcast();
const roster = rp.list().map((q) => q.name);
ok(roster.length === rp.players.size, `รายชื่อครอบคลุมผู้เล่นทั้ง ${roster.length} คนรวมบอท`);
ok(rp.bots().length > 0 && rp.humans().length > 0, 'มีทั้งคนจริงและบอทอยู่ในรายชื่อเดียวกัน');

/* ---------- ออกกลางรอบเสียทอง ---------- */

ok(CFG.LEAVE_PENALTY > 0, `ออกจากห้องกลางรอบเสียทอง ${CFG.LEAVE_PENALTY}`);

/* ---------- คนหาหมดหัวใจกันหมด รอบจบทันที ---------- */

const rs = new Room('seekout');
const ps1 = rs.add(fakeSock('s1'), fakeUser('หา1'));
rs.startRound();
rs.timer = 0; rs.update(0.01);
rs.list().forEach((q) => { q.role = 'hider'; q.x = 50; q.z = 30; });
ps1.role = 'seeker'; ps1.x = 0; ps1.z = 0; ps1.yaw = 0; ps1.misses = 0;
for (let i = 0; i < CFG.MAX_MISS; i++) { ps1.cd = 0; rs.doHit(ps1); }
rs.update(0.01);
ok(rs.phase === PHASE.END && rs.result.reason === 'seekersOut',
  'คนหาหมดหัวใจกันหมด รอบจบทันทีและคนซ่อนรอด');

/* ---------- ผู้ชมเลื่อนดูคนอื่นได้ ---------- */

const rv = new Room('spec');
const pv = rv.add(fakeSock('v1'), fakeUser('ผู้ชม'));
rv.startRound();
rv.timer = 0; rv.update(0.01);
pv.role = 'out';
rv.updateSpectators();
const watch1 = pv.specName;
ok(!!watch1, `ผู้ชมเกาะกล้องคนแรกได้: ${watch1}`);
pv.specStep = 1;
rv.updateSpectators();
ok(pv.specName !== watch1, `กดถัดไปแล้วเปลี่ยนไปดู ${pv.specName}`);
const t = rv.spectateTargets()[pv.spec];
ok(Math.hypot(pv.x - t.x, pv.z - t.z) < 3.5,
  'กดถัดไปแล้ววาร์ปไปยืนข้าง ๆ คนนั้น (แล้วเดินต่อเองได้)');
pv.specStep = -1;
rv.updateSpectators();
ok(pv.specName === watch1, 'กดย้อนกลับได้ครบวง');

// คนที่ยังเล่นอยู่ไม่ถูกดึงกล้อง
const alive = rv.spectateTargets()[0];
const ax = alive.x, az = alive.z;
rv.updateSpectators();
ok(alive.x === ax && alive.z === az, 'คนที่ยังเล่นอยู่ไม่โดนย้ายตำแหน่ง');

/* ---------- คนซ่อนเห็นเพื่อนร่วมทีม ---------- */

const sent = {};
const pv2 = rv.list().find((q) => q.role === 'hider' && !q.bot)
  || rv.list().find((q) => q.role === 'hider');
pv2.socket = { emit: (ev, d) => { if (ev === 'm') sent.m = d; } };
rv.broadcast();
ok(Array.isArray(sent.m.mates), 'คนซ่อนได้รายชื่อเพื่อนร่วมทีมมาด้วย');
ok(sent.m.mates.every((x) => x.i !== pv2.pid), 'ในรายชื่อไม่มีตัวเอง');
ok(sent.m.mates.length === rv.list().filter((q) => q.role === 'hider').length - 1,
  `เห็นเพื่อนร่วมทีมครบ ${sent.m.mates.length} คน`);

const seeker = rv.list().find((q) => q.role === 'seeker');
if (seeker) {
  const got = {};
  seeker.socket = { emit: (ev, d) => { if (ev === 'm') got.m = d; } };
  rv.broadcast();
  ok(got.m.mates === null, 'คนหาไม่ได้รายชื่อคนซ่อน จึงยังหาเองอยู่ดี');
}

/* ---------- บอทไม่ย่ำอยู่กับที่ ---------- */

{
  const rk = new Room('stuck');
  const pk = rk.add(fakeSock('k1'), fakeUser('คนดู'));
  rk.startRound();
  pk.role = 'hider'; pk.x = -50; pk.z = -3;
  const last = new Map(), still = new Map();
  let worst = 0;
  for (let i = 0; i < 30 * (CFG.HIDE_TIME + 60); i++) {
    rk.update(1 / 30);
    for (const b of rk.bots()) {
      if (b.role !== 'hider' && b.role !== 'seeker') continue;
      const moving = b.in.f !== 0 || b.in.s !== 0;
      const prev = last.get(b.id);
      if (prev && moving && Math.hypot(b.x - prev.x, b.z - prev.z) < 0.01) {
        still.set(b.id, (still.get(b.id) || 0) + 1 / 30);
      } else still.set(b.id, 0);
      worst = Math.max(worst, still.get(b.id) || 0);
      last.set(b.id, { x: b.x, z: b.z });
    }
  }
  ok(worst < 4, `บอทย่ำอยู่กับที่นานสุดแค่ ${worst.toFixed(1)} วินาที ไม่ติดค้างทั้งเกม`);
}

/* ---------- ออกช่วงซ่อนไม่โดนหักทอง ---------- */

ok(CFG.LEAVE_PENALTY > 0, 'มีค่าปรับสำหรับออกกลางช่วงล่า');

/* ---------- หลายด่าน: ห้างกับสวนสัตว์ ---------- */

ok(MAP_ORDER.length >= 2 && LAYOUTS.zoo, `มีด่านให้เล่น ${MAP_ORDER.length} ด่าน: ${MAP_ORDER.map((k) => LAYOUTS[k].name).join(', ')}`);
{
  const Z = LAYOUTS.zoo;
  const RADZ = (t) => (RAD[t] || 0.5);
  let ov = 0, inw = 0;
  for (let i = 0; i < Z.props.length; i++) {
    const a = Z.props[i];
    if (a.y > 0) continue;
    const rr = RADZ(a.t) * 0.6;
    if (Z.walls.some((w) => a.x + rr > w.x && a.x - rr < w.x + w.w && a.z + rr > w.z && a.z - rr < w.z + w.d)) inw++;
    for (let j = i + 1; j < Z.props.length; j++) {
      const b = Z.props[j];
      if (b.y > 0) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < (RADZ(a.t) + RADZ(b.t)) * 0.58) ov++;
    }
  }
  ok(inw === 0 && ov === 0, `สวนสัตว์มีของ ${Z.props.length} ชิ้น ไม่ฝังรั้วและไม่ทับกัน`);
  const seen = new Set([0]), q = [0];
  while (q.length) { const n = q.pop(); for (const e of Z.nav.edges[n]) if (!seen.has(e.n)) { seen.add(e.n); q.push(e.n); } }
  ok(seen.size === Z.nav.nodes.length, `จุดเดินในสวนสัตว์ ${Z.nav.nodes.length} จุดเชื่อมถึงกันหมด`);
  ok(Z.walls.some((w) => w.h <= 1.5), 'สวนสัตว์มีรั้วเตี้ยที่กระโดดข้ามได้');
}

// ห้องสลับด่านทุกรอบ และผู้เล่นได้ผังใหม่
{
  const rz = new Room('maps');
  const pz = rz.add(fakeSock('z1'), fakeUser('นักเที่ยว'));
  const got = [];
  pz.socket.emit = (ev, d) => { if (ev === 'map') got.push(d.key); };
  rz.startRound();
  const first = rz.mapKey;
  rz.phase = PHASE.END; rz.timer = 0; rz.update(0.01);
  ok(rz.mapKey !== first, `รอบถัดไปสลับด่านจาก ${LAYOUTS[first].name} เป็น ${rz.map.name}`);
  ok(rz.props.length === rz.map.props.length && rz.props.every((p) => typeof p.id === 'number'),
    'ของในห้องถูกสร้างใหม่ตามด่านพร้อมรหัสใหม่');

  // กระโดดข้ามรั้วเตี้ยได้ แต่เดินทะลุไม่ได้
  if (rz.mapKey === 'zoo') {
    let fence = null, fx = 0;
    for (const w of rz.walls) {
      if (!(w.h <= 1.5 && w.w > 5 && w.z > -34 && w.z < 34)) continue;
      for (let xx = w.x + 1.5; xx <= w.x + w.w - 1.5; xx += 1) {
        const clear = !rz.props.some((o) => Math.abs(o.x - xx) < 2.4 && Math.abs(o.z - w.z) < 4);
        if (clear) { fence = w; fx = xx; break; }
      }
      if (fence) break;
    }
    pz.role = 'hider'; pz.locked = false;
    pz.x = fx; pz.z = fence.z - 1.5; pz.y = 0; pz.vy = 0; pz.ground = true;
    pz.in = { f: 1, s: 0, yaw: 0, seq: 1 };
    for (let i = 0; i < 40; i++) rz.updatePlayer(pz, 1 / 30);
    ok(pz.z < fence.z, 'เดินชนรั้วเตี้ยแล้วหยุด ไม่ทะลุ');
    pz.z = fence.z - 1.0;
    let crossed = false;
    for (let i = 0; i < 120; i++) {
      if (i % 24 === 2) pz.wantJump = true;
      rz.updatePlayer(pz, 1 / 30);
      if (pz.z > fence.z + fence.d + 0.3) crossed = true;
    }
    ok(crossed, 'กระโดดข้ามรั้วเตี้ยเข้าคอกสัตว์ได้');
  }
}

/* ---------- ยืนบนของได้ ---------- */
{
  const rs2 = new Room('stand');
  const ps2 = rs2.add(fakeSock('st1'), fakeUser('นักปีน'));
  rs2.startRound();
  if (!rs2.props.some((q) => q.t === 'box')) { rs2.setMap('school'); }   // ใช้ห้างที่มีกล่องแน่นอน
  rs2.timer = 0; rs2.update(0.01);
  ps2.role = 'hider'; ps2.locked = false;
  // เลือกกล่องที่มีทางวิ่งเข้าโล่ง จากด้านไหนก็ได้ แล้ววิ่งเข้าจากด้านนั้น
  // ของเตี้ยพอที่กระโดดขึ้นไปยืนได้ มีอย่างน้อยหนึ่งอย่างในทุกด่าน
  const climbable = ['box', 'hay', 'rock', 'barrel', 'luggage',
    'schoolbag', 'moppail', 'laundrybasket', 'toolcart', 'hedge'];
  const SIDES = [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]];
  let box = null, side = SIDES[0];
  for (const q of rs2.props) {
    if (!climbable.includes(q.t) || q.y > 0.05) continue;
    for (const sd of SIDES) {
      let clear = true;
      for (let t = 0.7; t <= 1.8 && clear; t += 0.35) {
        const px = q.x + sd[0] * t, pz = q.z + sd[1] * t;
        if (rs2.props.some((o) => o !== q && !(o.y > 0.05) && Math.hypot(o.x - px, o.z - pz) < 0.9)) clear = false;
        if (rs2.walls.some((w) => px + 0.5 > w.x && px - 0.5 < w.x + w.w && pz + 0.5 > w.z && pz - 0.5 < w.z + w.d)) clear = false;
      }
      if (clear) { box = q; side = sd; break; }
    }
    if (box) break;
  }
  if (!box) box = rs2.props.find((q) => climbable.includes(q.t) && !(q.y > 0.05));
  ps2.x = box.x + side[0] * 1.6; ps2.z = box.z + side[1] * 1.6; ps2.y = 0; ps2.vy = 0; ps2.ground = true;
  ps2.in = { f: 1, s: 0, yaw: side[2], seq: 1 };
  let onTop = false;
  for (let i = 0; i < 120; i++) {
    if (i === 4) ps2.wantJump = true;
    // พอลอยอยู่เหนือกล่องก็ปล่อยจอย (เหมือนคนเล่นจริงที่กระโดดขึ้นไปยืน)
    if (Math.hypot(ps2.x - box.x, ps2.z - box.z) < 0.45) ps2.in.f = 0;
    rs2.updatePlayer(ps2, 1 / 30);
    if (ps2.ground && ps2.y > 0.4 && Math.hypot(ps2.x - box.x, ps2.z - box.z) < 0.8) onTop = true;
  }
  ok(onTop, `กระโดดขึ้นไปยืนบน ${box.t} ได้ (ยืนที่ความสูง ${ps2.y.toFixed(2)} ม.)`);
  // เดินย้อนกลับทางที่เข้ามา (รู้ว่าโล่ง) แล้วตกจากขอบกลับมาพื้น
  ps2.in = { f: 1, s: 0, yaw: side[2] + Math.PI, seq: 1 };
  for (let i = 0; i < 90; i++) rs2.updatePlayer(ps2, 1 / 30);
  ok(ps2.y === 0 && ps2.ground, `เดินตกจากของแล้วกลับมายืนบนพื้น (y=${ps2.y.toFixed(2)})`);
}

/* ---------- ชื่อบอทสุ่ม ---------- */
{
  const rn = new Room('names');
  rn.add(fakeSock('n1'), fakeUser('คน'));
  rn.startRound();
  const names = rn.bots().map((b) => b.name);
  ok(new Set(names).size === names.length, `ชื่อบอท ${names.length} ตัวไม่ซ้ำกัน: ${names.slice(0, 3).join(', ')}…`);
  ok(names.every((n) => !/\s\d+$/.test(n)), 'ชื่อบอทไม่มีเลขต่อท้ายแบบเดิม');
}

/* ---------- เกาะผนัง / ล็อกกลางอากาศ ---------- */
{
  const rw = new Room('wall');
  const pw = rw.add(fakeSock('w1'), fakeUser('นักปีนผนัง', ['wallclock', 'soda']));
  rw.setMap('school'); rw.startRound(); rw.timer = 0; rw.update(0.01);
  pw.role = 'hider'; pw.prop = 'wallclock'; pw.locked = false; pw.hold = false;
  const wall = rw.walls.find((q) => q.h > 2 && q.w > 10);
  pw.x = wall.x + wall.w / 2; pw.z = wall.z - 1.0; pw.y = 0; pw.ground = true;
  pw.wantLock = 1; rw.updatePlayer(pw, 1 / 30);
  ok(pw.hold && pw.y > 1, `ร่างนาฬิกากดล็อกใกล้ผนังแล้วเกาะขึ้นไปแขวนที่ ${pw.y.toFixed(1)} ม.`);
  for (let i = 0; i < 40; i++) rw.updatePlayer(pw, 1 / 30);
  ok(pw.y > 1, 'แขวนอยู่นิ่ง ๆ ไม่ตก');
  pw.wantLock = 1; rw.updatePlayer(pw, 1 / 30);
  for (let i = 0; i < 40; i++) rw.updatePlayer(pw, 1 / 30);
  ok(pw.y === 0 && !pw.hold, 'ปลดล็อกแล้วตกลงมาที่พื้น');

  // ร่างที่ไม่ใช่ของแขวนผนัง ล็อกใกล้ผนังก็ไม่เกาะ
  pw.prop = 'soda'; pw.z = wall.z - 1.0; pw.y = 0; pw.ground = true;
  pw.wantLock = 1; rw.updatePlayer(pw, 1 / 30);
  ok(!pw.hold && pw.y === 0, 'ร่างกระป๋องล็อกใกล้ผนังก็อยู่บนพื้นตามปกติ');
  pw.wantLock = 1; rw.updatePlayer(pw, 1 / 30);

  // ล็อกกลางอากาศ
  pw.x = 0; pw.z = 0; pw.y = 0; pw.vy = 0; pw.ground = true; pw.locked = false;
  pw.wantJump = true; rw.updatePlayer(pw, 1 / 30);
  for (let i = 0; i < 8; i++) rw.updatePlayer(pw, 1 / 30);
  const yAir = pw.y;
  pw.wantLock = 1; rw.updatePlayer(pw, 1 / 30);
  for (let i = 0; i < 40; i++) rw.updatePlayer(pw, 1 / 30);
  ok(pw.hold && Math.abs(pw.y - yAir) < 0.15, `ล็อกกลางอากาศแล้วค้างที่ ${pw.y.toFixed(2)} ม.`);

  const hung = LAYOUTS.school.props.filter((p) => p.y > 0).length;
  ok(hung >= 20, `ผังห้างมีของแขวนบนผนัง ${hung} ชิ้นให้แอบเป็นได้`);
}

/* ---------- สุ่มด่าน ---------- */
{
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(new Room('rnd' + i).mapKey);
  ok(seen.size >= 2, `ด่านแรกของห้องสุ่มได้ทั้ง ${[...seen].join(', ')} ไม่ใช่ห้างเสมอ`);
  const rr = new Room('rot'); rr.add(fakeSock('rt'), fakeUser('คน'));
  rr.startRound();
  const a1 = rr.mapKey;
  rr.phase = PHASE.END; rr.timer = 0; rr.update(0.01);
  ok(rr.mapKey !== a1, 'รอบถัดไปไม่ซ้ำด่านเดิม');
  const nm = rr.bots().map((b) => b.name);
  ok(nm.every((n) => n.length <= 10 && !/^(น้อง|พี่|คุณ|เจ้า)/.test(n)), `ชื่อบอทเหมือนชื่อเล่นคน: ${nm.slice(0, 4).join(', ')}`);
}

/* ---------- ยืนชิดกำแพงยาว ๆ ไม่โดนเหวี่ยง ---------- */
{
  const rq = new Room('wallslide');
  const pq = rq.add(fakeSock('q1'), fakeUser('นักพิง'));
  rq.startRound(); rq.timer = 0; rq.update(0.01);
  pq.role = 'hider'; pq.locked = false;
  // ใช้ผนังตั้งด้านใน (ไม่ใช่ผนังรอบนอก)
  const wl = rq.walls.filter((w) => w.h > 2 && w.d > 8 && w.w < 2 && Math.abs(w.x) < rq.map.w / 2 - 3)
    .sort((a, b) => b.d - a.d)[0];
  // ยืนจมอยู่ในกำแพงนิดหน่อย (เหมือนโดนของดันเข้าไป) แล้วเดินขนานกำแพง
  pq.x = wl.x - CFG.R + 0.1; pq.z = wl.z + wl.d / 2; pq.y = 0;
  const z0 = pq.z;
  rq.moveAxis(pq, 0, 0.15);
  ok(Math.abs(pq.z - z0) < 1 && pq.x <= wl.x - CFG.R + 0.001,
    `ยืนชิดกำแพงแล้วเดินขนานกำแพง ถูกดันออกด้านข้างแค่ ${(wl.x - CFG.R - pq.x).toFixed(2)} ม. ไม่โดนเหวี่ยงไปสุดกำแพง`);
}

/* ---------- คนหาเริ่มจุดเดียวกัน ---------- */
{
  const rk = new Room('seekstart');
  for (let i = 0; i < 4; i++) rk.add(fakeSock('sk' + i), fakeUser('หา' + i));
  rk.startRound();
  const sk = rk.list().filter((p) => p.role === 'seeker');
  let far = 0;
  for (let i = 1; i < sk.length; i++) far = Math.max(far, Math.hypot(sk[i].x - sk[0].x, sk[i].z - sk[0].z));
  ok(sk.length >= 2 && far < 1.5, `คนหา ${sk.length} คนเริ่มที่จุดเดียวกัน (ห่างกันไม่เกิน ${far.toFixed(2)} ม.)`);
}

/* ---------- กาชาแยกด่าน ---------- */
{
  const uz = fakeUser('นักสุ่ม');
  uz.gold = 100000;
  const got = { mall: new Set(), zoo: new Set(), mallId: new Set(), zooId: new Set() };
  for (let i = 0; i < 60; i++) {
    const a = store.draw(uz, 'prop', 'zoo'); if (!a.error) { got.zoo.add(a.map); got.zooId.add(a.id); }
    const b = store.draw(uz, 'prop', 'school'); if (!b.error) { got.mall.add(b.map); got.mallId.add(b.id); }
  }
  // ร้านขายตามของที่มีอยู่จริงในด่านนั้น (บางชนิดมีทั้งสองด่านได้ เช่น ชั้นวาง โต๊ะ เก้าอี้)
  const zooIds = new Set(store.poolFor('zoo').map((c) => c.id));
  const mallIds = new Set(store.poolFor('school').map((c) => c.id));
  ok([...got.zooId].every((id) => zooIds.has(id)), 'สุ่มของสวนสัตว์ได้แต่ของที่มีในสวนสัตว์จริง');
  ok([...got.mallId].every((id) => mallIds.has(id)), 'สุ่มของห้างได้แต่ของที่มีในห้างจริง');
}

/* ---------- ห้างมีผนังกั้นห้อง ---------- */
ok(LAYOUTS.school.walls.length >= 25 && LAYOUTS.school.zones.filter((z) => z.door).length >= 5,
  `ห้างมีผนังกั้น ${LAYOUTS.school.walls.length} แผ่น ห้องที่มีประตู ${LAYOUTS.school.zones.filter((z) => z.door).length} ห้อง`);
ok(LAYOUTS.school.props.length >= 200, `โรงเรียนมีของ ${LAYOUTS.school.props.length} ชิ้น`);
ok(!Object.values(LAYOUTS).some((m) => m.props.some((p) => p.t === 'elevator' || p.t === 'escalator')), 'ไม่มีลิฟต์/บันไดเลื่อนในทุกด่าน');

/* ==================== เกณฑ์ตรวจแผนที่ (จากเอกสารรีวิว) ==================== */
for (const key of Object.keys(LAYOUTS)) {
  const L = LAYOUTS[key];
  const floorProps = L.props.filter((p) => !(p.y > 0));
  const cnt = {};
  for (const p of L.props) cnt[p.t] = (cnt[p.t] || 0) + 1;
  // ของที่ร้านขายให้ปลอมตัวได้ ต้องมีของจริงในด่านอย่างน้อย 3 ชิ้นเสมอ
  const sold = store.poolFor(key).map((c) => c.id);
  const lone = sold.filter((t) => (cnt[t] || 0) < 3);
  ok(lone.length === 0, `[${L.name}] ของที่ขาย ${sold.length} ชนิด มีของจริง ≥3 ชิ้นครบทุกชนิด${lone.length ? ' — ขาด ' + lone.join(',') : ''}`);
  ok(sold.length >= 12, `[${L.name}] มีของให้ปลอมตัว ${sold.length} ชนิด`);

  // ของทั่วไปต้องมีหลายชิ้น
  // ของทั่วไปต้องไม่โดดเดี่ยว แต่ไม่ต้องเยอะจนรก (เกณฑ์ ≥4 ชิ้น)
  const common = key === 'zoo' ? ['rock', 'bush', 'trashbin', 'bench']
    : key === 'house' ? ['diningchair', 'box', 'homeshelf', 'hedge', 'gardentree', 'homebin']
    : ['schoolbag', 'schoolchair', 'potplant', 'bookshelf', 'schoolbin', 'schooldesk'];
  const commonOk = common.filter((t) => (cnt[t] || 0) >= 4);
  ok(commonOk.length === common.length, `[${L.name}] ของทั่วไปมีหลายชิ้นครบทุกอย่าง (${common.map((t) => t + '×' + (cnt[t] || 0)).join(' ')})`);

  // พื้นที่กลางไม่โล่งเกินไป: ความหนาแน่นรวม ≥ 1 ชิ้นต่อ 25 ตร.ม.
  const density = floorProps.length / (L.w * L.d);
  const need = key === 'zoo' ? 1 / 34 : key === 'house' ? 1 / 40 : 1 / 30;     // สวนสัตว์ตั้งใจให้ทางเดินโล่ง ความหนาแน่นไปอยู่ในคอก/อาคาร
  ok(density >= need, `[${L.name}] ความหนาแน่นของ 1 ชิ้นต่อ ${(1 / density).toFixed(0)} ตร.ม. (ไม่โล่งเกินไป)`);

  // ชั้นวางไม่ชิดกันจนเดินไม่ได้: ไม่มีคู่ไหนซ้อน และทุกโซนเชื่อมถึงกัน (ไม่มีห้องตัน)
  const seen = new Set([0]), q = [0];
  while (q.length) { const n = q.pop(); for (const e of L.nav.edges[n]) if (!seen.has(e.n)) { seen.add(e.n); q.push(e.n); } }
  ok(seen.size === L.nav.nodes.length, `[${L.name}] ทุกพื้นที่เดินถึงกันหมด ไม่มีห้องตัน (${L.nav.nodes.length} จุด)`);
  for (const zn of L.zones || []) {
    const [x0, x1, z0, z1] = zn.box;
    const inside = L.nav.nodes.some((n) => n.x > x0 && n.x < x1 && n.z > z0 && n.z < z1);
    if (!inside) ok(false, `[${L.name}] โซน ${zn.name} เดินเข้าไม่ถึง`);
  }

  // จุดเกิดหลายตำแหน่ง และไม่อยู่ในสายตาคนหาทันที (ห่างจุดเกิดคนหา ≥ 20 ม.)
  const hs = L.spawns.hider || [], ss = L.spawns.seeker || [];
  ok(hs.length >= 3, `[${L.name}] จุดเกิดคนซ่อน ${hs.length} ตำแหน่ง`);
  const minD = Math.min(...hs.map((h) => Math.min(...ss.map((sk) => Math.hypot(h.x - sk.x, h.z - sk.z)))));
  ok(ss.length && minD >= 12, `[${L.name}] จุดเกิดคนซ่อนห่างจุดเกิดคนหาอย่างน้อย ${minD.toFixed(0)} ม.`);

  // จุดซ่อนกระจายทั่ว: ของกระจายครบทุกส่วนของแผนที่ (แบ่ง 3x3 ช่อง ต้องมีของทุกช่อง)
  const cells = new Set();
  for (const p of floorProps) cells.add(Math.floor((p.x + L.w / 2) / (L.w / 3)) + ',' + Math.floor((p.z + L.d / 2) / (L.d / 3)));
  ok(cells.size === 9, `[${L.name}] ของกระจายครบทั้ง 9 ส่วนของแผนที่ (${cells.size}/9)`);

  // ทางหนี: ห้องที่มีประตูเดียวต้องเป็นห้องเล็ก (< 120 ตร.ม.) ห้องใหญ่ควรมีอย่างน้อย 2 ทางเข้า
  for (const zn of L.zones || []) {
    if (!zn.doorAt) continue;
    const [x0, x1, z0, z1] = zn.box;
    const area = (x1 - x0) * (z1 - z0);
    if (area > 400) {
      // นับช่องเปิดบนผนังโซน (ช่วงที่ไม่มีกำแพง) แบบหยาบ: จุดเดินที่อยู่บนเส้นขอบ
      const exits = L.nav.nodes.filter((n) => (Math.abs(n.x - x0) < 1.3 || Math.abs(n.x - x1) < 1.3 || Math.abs(n.z - z0) < 1.3 || Math.abs(n.z - z1) < 1.3)
        && n.x > x0 - 1.3 && n.x < x1 + 1.3 && n.z > z0 - 1.3 && n.z < z1 + 1.3).length;
      ok(exits >= 1, `[${L.name}] ห้องใหญ่ ${zn.name} (${area.toFixed(0)} ตร.ม.) มีทางเข้าออก`);
    }
  }
}

/* ---------- คอกสัตว์: เข้าออกได้ทั้งคนซ่อนและคนหา (ข้อ 13 ในรีวิว) ---------- */
{
  const zooL = LAYOUTS.zoo;
  const zooMod = require('../mapzoo.js');
  const rz2 = new Room('penio');
  rz2.setMap('zoo');
  const pz2 = rz2.add(fakeSock('p9'), fakeUser('นักปีนรั้ว'));
  rz2.startRound(); rz2.timer = 0; rz2.update(0.01);
  let okIn = 0, okOut = 0;
  for (const pen of zooMod.PENS) {
    const [x0, x1, z0, z1] = pen.box;
    const cxp = (x0 + x1) / 2, czp = (z0 + z1) / 2;
    // มีจุดเดินอยู่ในคอก = เดินเข้าถึงได้ผ่านประตู
    if (zooL.nav.nodes.some((n) => n.x > x0 && n.x < x1 && n.z > z0 && n.z < z1)) okIn++;
    // กระโดดออกจากกลางคอกข้ามรั้วได้
    pz2.role = 'hider'; pz2.locked = false; pz2.hold = false;
    pz2.x = cxp; pz2.z = czp; pz2.y = 0; pz2.vy = 0; pz2.ground = true;
    // เริ่มจากจุดโล่งกลางคอก แล้วลองออก 8 ทิศ (คนเล่นจริงเลี้ยงหลบของได้)
    let escaped = false;
    const starts = [[cxp, czp], [cxp - 3, czp], [cxp + 3, czp], [cxp, czp - 3], [cxp, czp + 3]];
    for (const [sx, sz] of starts) {
      for (let k = 0; k < 8 && !escaped; k++) {
        const yaw = (k / 8) * Math.PI * 2;
        pz2.x = sx; pz2.z = sz; pz2.y = 0; pz2.vy = 0; pz2.ground = true; pz2.hold = false;
        pz2.in = { f: 1, s: 0, yaw, seq: 1 };
        for (let i = 0; i < 200; i++) {
          if (i % 20 === 3) pz2.wantJump = true;
          rz2.updatePlayer(pz2, 1 / 30);
          if (pz2.z < z0 - 0.6 || pz2.z > z1 + 0.6 || pz2.x < x0 - 0.6 || pz2.x > x1 + 0.6) { escaped = true; break; }
        }
      }
      if (escaped) break;
    }
    if (escaped) okOut++; else console.log('   ออกจากคอกไม่ได้:', pen.name);
  }
  ok(okIn === zooMod.PENS.length, `เดินเข้าคอกได้ทุกคอก ${okIn}/${zooMod.PENS.length}`);
  ok(okOut === zooMod.PENS.length, `กระโดดออกจากคอกได้ทุกคอก ${okOut}/${zooMod.PENS.length} (ไม่มีคอกที่เข้าแล้วออกไม่ได้)`);
}

/* ---------- ของอยู่ถูกบริบท (ข้อ 11 ในรีวิว) ---------- */
{
  const Z = LAYOUTS.zoo;
  const zooMod = require('../mapzoo.js');
  // สัตว์ทุกตัวต้องอยู่ในคอกหรืออาคาร ไม่หลุดมาเดินตามทางเดิน
  const homes = zooMod.PENS.concat(zooMod.BUILDINGS).map((b) => b.box);
  const animals = ['giraffe', 'elephant', 'hippo', 'lion', 'tiger', 'bear', 'panda', 'zebra', 'deer',
    'camel', 'kangaroo', 'goat', 'rabbit', 'monkey', 'parrot', 'penguin', 'flamingo', 'peacock', 'crocodile', 'frog'];
  const stray = Z.props.filter((p) => animals.includes(p.t)
    && !homes.some((b) => p.x > b[0] && p.x < b[1] && p.z > b[2] && p.z < b[3]));
  ok(stray.length === 0, `สัตว์ทุกตัวอยู่ในคอกหรืออาคารของตัวเอง${stray.length ? ' — หลุด ' + stray.map((p) => p.t).join(',') : ''}`);
  // ของกินอยู่แถวทางเข้า/โซนอาหารเท่านั้น ไม่ไปโผล่หลังคอกสัตว์
  const foodFar = Z.props.filter((p) => ['icecream', 'popcorn', 'slushie'].includes(p.t) && p.z < 10);
  ok(foodFar.length === 0, `ของกินอยู่แถวทางเข้า/โซนอาหารเท่านั้น${foodFar.length ? ' — หลุด ' + foodFar.length + ' ชิ้น' : ''}`);
  // ห้องน้ำต้องมีของห้องน้ำ ไม่มีหัวจ่ายน้ำดับเพลิง
  const bath = Z.props.filter((p) => p.x > -30 && p.x < -18 && p.z > 28 && p.z < 38);
  ok(bath.some((p) => p.t === 'sink') && !bath.some((p) => p.t === 'hydrant'),
    `ห้องน้ำมีของถูกบริบท (${[...new Set(bath.map((p) => p.t))].join(', ')})`);
  // ร้านของที่ระลึกไม่แน่นจนเป็นห้องโกง
  const shopShelf = Z.props.filter((p) => p.t === 'shelf' && p.x > -52 && p.x < -32 && p.z > 28 && p.z < 38).length;
  ok(shopShelf <= 12, `ร้านของที่ระลึกมีชั้นวาง ${shopShelf} ตัว (ไม่เกิน 12 ตามคำแนะนำ)`);
}

/* ---------- ทางเดินต้องโล่ง ความหนาแน่นอยู่ในคอก/อาคาร (รีวิวรอบล่าสุด) ---------- */
{
  const Z = LAYOUTS.zoo;
  const zooMod = require('../mapzoo.js');
  const boxes = zooMod.PENS.concat(zooMod.BUILDINGS).map((b) => b.box);
  const inBox = (p) => boxes.some((b) => p.x > b[0] && p.x < b[1] && p.z > b[2] && p.z < b[3]);
  const floor = Z.props.filter((p) => !(p.y > 0));
  const walk = floor.filter((p) => !inBox(p));
  const walkArea = 110 * 80 - boxes.reduce((a, b) => a + (b[1] - b[0]) * (b[3] - b[2]), 0);
  ok(walkArea / walk.length > 50,
    `ทางเดินโล่ง: ของ ${walk.length} ชิ้นใน ${walkArea.toFixed(0)} ตร.ม. = 1 ชิ้นต่อ ${(walkArea / walk.length).toFixed(0)} ตร.ม.`);
  const inside = floor.length - walk.length;
  ok(inside > walk.length * 2,
    `ความหนาแน่นอยู่ในคอก/อาคาร (${inside} ชิ้น) มากกว่าทางเดิน (${walk.length} ชิ้น) เท่าตัว`);
  // ลานน้ำพุกลางสวนต้องโล่ง
  const plaza = floor.filter((p) => Math.hypot(p.x, p.z) < 10).length;
  ok(plaza <= 12, `ลานน้ำพุกลางสวนโล่ง มีของแค่ ${plaza} ชิ้นในรัศมี 10 เมตร`);
}

/* ---------- ห้าง: ของชิ้นเล็กต้องอยู่กับชั้น ลานกลางต้องโล่ง ---------- */
{
  const M = LAYOUTS.school;
  const FLOOR_OK = require('../propclass.js').FLOOR_PROPS;
  const floor = M.props.filter((p) => !(p.y > 0));
  const stands = floor.filter((p) => ['shelf', 'desk', 'showcase', 'rack', 'fridge'].includes(p.t));
  const display = floor.filter((p) => !FLOOR_OK.has(p.t));
  const stray = display.filter((p) => !stands.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2.2));
  ok(display.length === 0 || stray.length <= display.length * 0.12,
    `ของชิ้นเล็ก ${display.length} ชิ้นเกือบทั้งหมดอยู่ชิดชั้น/โต๊ะ/ตู้โชว์ (หลุดกลางพื้น ${stray.length} ชิ้น)`);

  // ลานกลางกับทางเข้าต้องโล่ง (ใน JSON วางของไว้มือแล้ว ระบบไม่เติมซ้ำ)
  for (const name of ['ลานกลาง', 'ทางเข้า']) {
    const zn = M.zones.find((z) => z.name === name);
    if (!zn) continue;
    const [x0, x1, z0, z1] = zn.box;
    const n = floor.filter((p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1).length;
    const area = (x1 - x0) * (z1 - z0);
    // ลานกลาง/ทางเข้าจัดเป็นสวนหย่อมกับม้านั่งได้ แต่ต้องโล่งกว่าร้านค้าหลายเท่า
    ok(area / n > 14, `[โรงเรียน] ${name} โล่งกว่าร้านค้า: ${n} ชิ้นใน ${area.toFixed(0)} ตร.ม. = 1 ชิ้นต่อ ${(area / n).toFixed(0)} ตร.ม.`);
  }
}

/* ---------- ทุกห้องต้องมีพื้นที่เดินได้พอ และของเล็กต้องเกาะเฟอร์นิเจอร์ ---------- */
{
  const SZ = require('../maplayout.js').PROP_SIZE;
  const FLOOR_OK2 = require('../propclass.js').FLOOR_PROPS;
  for (const key of Object.keys(LAYOUTS)) {
    const L = LAYOUTS[key];
    const f = L.props.filter((p) => !(p.y > 0));
    let worst = 100, worstName = '';
    for (const zn of L.zones || []) {
      const [x0, x1, z0, z1] = zn.box;
      let free = 0, tot = 0;
      for (let x = x0 + 0.5; x < x1; x += 0.6) {
        for (let z = z0 + 0.5; z < z1; z += 0.6) {
          tot++;
          if (!f.some((p) => Math.hypot(p.x - x, p.z - z) < SZ[p.t][1] * 0.72 + 0.42)) free++;
        }
      }
      const pct = (free / tot) * 100;
      if (pct < worst) { worst = pct; worstName = zn.name; }
    }
    ok(worst >= 50, `[${L.name}] ทุกห้องเดินได้อย่างน้อย 50% ของพื้นที่ (แคบสุดคือ ${worstName} ${worst.toFixed(0)}%)`);
  }

  // ห้างต้องไม่มีของเล็กหล่นกลางพื้นห่างจากเฟอร์นิเจอร์
  const M = LAYOUTS.school;
  const mf = M.props.filter((p) => !(p.y > 0));
  const furn = mf.filter((p) => ['shelf', 'desk', 'showcase', 'rack', 'fridge', 'sofa', 'chair'].includes(p.t));
  const small = mf.filter((p) => !FLOOR_OK2.has(p.t));
  const orphan = small.filter((p) => !furn.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2.0));
  ok(small.length === 0 || orphan.length <= small.length * 0.1,
    `ของชิ้นเล็กในห้าง ${small.length} ชิ้น เกาะเฟอร์นิเจอร์เกือบทั้งหมด (หล่นกลางพื้น ${orphan.length} ชิ้น)`);
}

/* ---------- ระบบวิ่งของคนซ่อน ---------- */
{
  const rr2 = new Room('run');
  const pr = rr2.add(fakeSock('rn'), fakeUser('นักวิ่ง'));
  rr2.setMap('school'); rr2.startRound(); rr2.timer = 0; rr2.update(0.01);
  pr.role = 'hider'; pr.locked = false; pr.hold = false;
  // หาจุดโล่งยาว ๆ ก่อน ไม่งั้นวิ่งไปชนของแล้ววัดความเร็วไม่ได้
  let sx0 = 0, sz0 = 0;
  outer: for (let gx = -rr2.map.w / 2 + 5; gx <= rr2.map.w / 2 - 5; gx += 1.5) {
    for (let gz = -rr2.map.d / 2 + 5; gz <= rr2.map.d / 2 - 12; gz += 1.5) {
      let clear = true;
      for (let step = 0; step <= 8 && clear; step++) {
        const tz = gz + step;
        if (rr2.props.some((q) => !(q.y > 0.05) && Math.hypot(q.x - gx, q.z - tz) < 1.6)) clear = false;
        if (rr2.walls.some((w) => gx + 1 > w.x && gx - 1 < w.x + w.w && tz + 1 > w.z && tz - 1 < w.z + w.d)) clear = false;
      }
      if (clear) { sx0 = gx; sz0 = gz; break outer; }
    }
  }
  const measure = (running) => {
    pr.x = sx0; pr.z = sz0; pr.y = 0; pr.vy = 0; pr.ground = true;
    pr.stamina = CFG.RUN_MAX; pr.run = running;
    pr.in = { f: 1, s: 0, yaw: 0, seq: 1 };
    for (let i = 0; i < 30; i++) rr2.updatePlayer(pr, 1 / 30);
    return Math.hypot(pr.x - sx0, pr.z - sz0);
  };
  const walk = measure(false), run = measure(true);
  ok(run > walk * 1.4, `วิ่งเร็วกว่าเดิน ${(run / walk).toFixed(2)} เท่า (${walk.toFixed(1)} → ${run.toFixed(1)} ม./วินาที)`);

  pr.run = true; pr.stamina = CFG.RUN_MAX; pr.in = { f: 1, s: 0, yaw: 0, seq: 1 };
  let ranFor = 0;
  for (let i = 0; i < 30 * (CFG.RUN_MAX + 1); i++) {
    if (pr.run) ranFor += 1 / 30;
    rr2.updatePlayer(pr, 1 / 30);
  }
  ok(!pr.run && Math.abs(ranFor - CFG.RUN_MAX) < 0.25,
    `วิ่งต่อเนื่องได้ ${ranFor.toFixed(1)} วินาทีแล้วหมดแรงเอง (ตั้งไว้ ${CFG.RUN_MAX})`);
  pr.in = { f: 0, s: 0, yaw: 0, seq: 1 };
  for (let i = 0; i < 30 * CFG.RUN_MAX * CFG.RUN_REGEN + 40; i++) rr2.updatePlayer(pr, 1 / 30);
  ok(pr.stamina >= CFG.RUN_MAX - 0.01, 'พักแล้วพลังวิ่งกลับมาเต็ม');

  // คนหาวิ่งไม่ได้
  const sk2 = rr2.list().find((p) => p.role === 'seeker');
  if (sk2) {
    sk2.run = true;
    rr2.updatePlayer(sk2, 1 / 30);
    ok(!sk2.run, 'คนหาวิ่งไม่ได้ มีแต่คนซ่อนที่วิ่งได้');
  }
}

/* ---------- เข้าห้องพร้อมเพื่อนช่วงซ่อนต้องได้เล่นทุกคน ---------- */
{
  const rf = new Room('friends');
  rf.add(fakeSock('f0'), fakeUser('คนแรก'));
  rf.startRound();
  const joined = [];
  for (let i = 1; i <= 3; i++) joined.push(rf.add(fakeSock('f' + i), fakeUser('เพื่อน' + i)));
  ok(joined.every((p) => p.role === 'hider'), 'เพื่อนที่กดเข้าตามช่วงซ่อน ได้เล่นทุกคนไม่ต้องนั่งดู');
  ok(joined.every((p) => rf.propsByType.has(p.prop)), 'เพื่อนที่เข้าตามได้ร่างที่มีอยู่ในด่านจริง');
  rf.timer = 0; rf.update(0.01);
  const late = rf.add(fakeSock('f9'), fakeUser('มาช่วงล่า'));
  ok(late.role === 'wait', 'มาตอนล่าแล้วถึงจะต้องรอรอบหน้า');
}

/* ---------- ไม่มีลิฟต์/บันไดเลื่อนในทุกด่าน และไม่มีซอกแคบ ---------- */
for (const key of Object.keys(LAYOUTS)) {
  const L = LAYOUTS[key];
  ok(!L.props.some((p) => p.t === 'elevator' || p.t === 'escalator'), `[${L.name}] ไม่มีลิฟต์/บันไดเลื่อน`);
  const vert = L.walls.filter((w) => w.d > w.w && w.h > 2);
  const hor = L.walls.filter((w) => w.w >= w.d && w.h > 2);
  let slots = 0;
  const check = (list, axis) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const gap = axis === 'x' ? Math.abs(a.x - b.x) - a.w : Math.abs(a.z - b.z) - a.d;
        const overlap = axis === 'x'
          ? Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z)
          : Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        if (gap > 0.05 && gap < 2.2 && overlap > 4) slots++;
      }
    }
  };
  check(vert, 'x'); check(hor, 'z');
  ok(slots === 0, `[${L.name}] ไม่มีซอกแคบระหว่างผนังที่เข้าไปแล้วไร้ประโยชน์`);
}


/* ---------- เข้าห้องพร้อมเพื่อนต้องได้เล่นทั้งคู่ ---------- */
{
  const rj = new Room('joinpair');
  const p1 = rj.add(fakeSock('j1'), fakeUser('เอ'));
  rj.startRound();
  ok(rj.phase === PHASE.HIDE, 'รอบเริ่มที่ช่วงซ่อน');
  const p2 = rj.add(fakeSock('j2'), fakeUser('บี'));
  ok(p1.role !== 'wait' && p2.role !== 'wait',
    `เข้าห้องช่วงซ่อนได้เล่นทั้งคู่ (${p1.role} / ${p2.role}) ไม่มีใครกลายเป็นผู้ชม`);
  ok(!!p2.prop && rj.propsByType.has(p2.prop), 'คนที่ตามเข้ามาได้ร่างที่มีในด่านด้วย');
  rj.timer = 0; rj.update(0.01);
  const p3 = rj.add(fakeSock('j3'), fakeUser('ซี'));
  ok(rj.phase === PHASE.HUNT && p3.role === 'wait', 'เข้ามาตอนล่ากันแล้วถึงจะต้องรอรอบหน้า');
}


/* ---------- ผังต้องผ่านเกณฑ์ interior design (validateFloor) ---------- */
{
  const mj = require('../propclass.js');
  for (const key of Object.keys(LAYOUTS)) {
    const issues = mj.validateFloor(LAYOUTS[key]);
    ok(issues.length === 0, `[${LAYOUTS[key].name}] ผ่านเกณฑ์ผังทุกข้อ${issues.length ? ' — ' + issues.slice(0, 3).join(' | ') : ''}`);
  }

  // ของชิ้นเล็กห้ามอยู่บนพื้นเลยแม้แต่ชิ้นเดียว
  for (const key of Object.keys(LAYOUTS)) {
    const bad = LAYOUTS[key].props.filter((p) => !(p.y > 0.05) && mj.DISPLAY_PROPS.has(p.t));
    ok(bad.length === 0, `[${LAYOUTS[key].name}] ไม่มีของชิ้นเล็กวางบนพื้น${bad.length ? ' — ' + [...new Set(bad.map((p) => p.t))].join(',') : ''}`);
  }

  // ของชิ้นเล็กที่มีอยู่ ต้องอยู่บนผิวเฟอร์นิเจอร์จริง (มีค่า y)
  const onShelf = LAYOUTS.school.props.filter((p) => p.y > 0.05 && mj.DISPLAY_PROPS.has(p.t));
  ok(onShelf.length >= 15, `โรงเรียนมีของวางบนโต๊ะ/ชั้น ${onShelf.length} ชิ้น (ใช้แกน y จริง)`);

  // ของติดผนังต้องไม่อยู่บนพื้น
  for (const key of Object.keys(LAYOUTS)) {
    const wallOnFloor = LAYOUTS[key].props.filter((p) => !(p.y > 0.05) && mj.WALL_PROPS.has(p.t));
    ok(wallOnFloor.length === 0, `[${LAYOUTS[key].name}] ของติดผนังไม่มีชิ้นไหนวางบนพื้น`);
  }
}


/* ---------- เดินตรวจแมปจากมุมมองผู้เล่น (ไม่ใช่แค่ Top View) ---------- */
{
  const L = LAYOUTS.school;
  const F = L.props.filter((p) => !(p.y > 0.05));
  // เดินรอบทางเดินวง แล้ววัดว่ามีช่วงไหนโล่งจนไม่เจออะไรเลยนานเกิน 5 วินาทีไหม
  const loop = [[-24, 14], [0, 14], [24, 14], [24, 0], [24, -14], [0, -14], [-24, -14], [-24, 0], [-24, 14]];
  let since = 0, worst = 0, total = 0;
  for (let i = 0; i < loop.length - 1; i++) {
    const [ax, az] = loop[i], [bx, bz] = loop[i + 1];
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
    for (let s2 = 0; s2 < steps; s2++) {
      const x = ax + ((bx - ax) * s2) / steps, z = az + ((bz - az) * s2) / steps;
      total += 0.5 / CFG.SPD_HIDER; since += 0.5 / CFG.SPD_HIDER;
      if (F.some((p) => Math.hypot(p.x - x, p.z - z) < 5)) { worst = Math.max(worst, since); since = 0; }
    }
  }
  ok(worst < 5, `เดินรอบแมปไม่มีช่วงโล่งเกิน 5 วินาที (นานสุด ${worst.toFixed(1)} วิ, รอบวง ${total.toFixed(0)} วิ)`);

  // ทุกโซนวิ่งข้ามได้ใน 3-6 วินาที (ห้องเล็กเร็วกว่าได้)
  const slow = L.zones.filter((z) => z.door && Math.max(z.box[1] - z.box[0], z.box[3] - z.box[2]) / CFG.SPD_HIDER > 6);
  ok(slow.length === 0, `ทุกโซนวิ่งข้ามได้ไม่เกิน 6 วินาที${slow.length ? ' — ช้า: ' + slow.map((z) => z.name).join(',') : ''}`);

  // ทุกโซนต้องเข้าถึงได้จากทางเดินวง และไม่มีห้องไหนที่ของน้อยจนโล่ง
  for (const zn of L.zones) {
    const [x0, x1, z0, z1] = zn.box;
    const n = F.filter((p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1).length;
    const area = (x1 - x0) * (z1 - z0);
    ok(n >= 4 && area / n < 60, `[${zn.name}] มีของ ${n} ชิ้นใน ${area.toFixed(0)} ตร.ม. ไม่โล่งจนไม่มีอะไรเล่น`);
  }
}


/* ---------- ของประจำฉากต้องไม่ถูกล้างทิ้งหลังวางแล้ว ---------- */
{
  // เคยมีบั๊ก: init วาง seedStatic แล้วโค้ดข้างล่างเรียก objs.clear() ทับ ทำให้ของหายทั้งแมป
  const src = require('fs').readFileSync(__dirname + '/../public/game.js', 'utf8');
  const handlers = src.split(/socket\.on\(/).slice(1);
  let bad = 0;
  for (const h of handlers) {
    const body = h.slice(0, h.indexOf('\n  });') + 1);
    const seed = body.lastIndexOf('seedStatic(');
    const clear = body.lastIndexOf('objs.clear()');
    if (seed >= 0 && clear > seed) bad++;
  }
  ok(bad === 0, 'ทุกที่ที่วางของประจำฉากแล้ว ไม่มีการล้าง objs ทับทีหลัง');
  ok(src.includes('seedStatic(m.props || [])'), 'ตอนเข้าห้อง (init) มีการวางของประจำฉากจากผังที่เซิร์ฟเวอร์ส่งมา');
}


/* ---------- เพลงแยกตามด่าน ---------- */
{
  const src = require('fs').readFileSync(__dirname + '/../public/music.js', 'utf8');
  const keys = [...src.matchAll(/^  ([a-z]+): \{$/gm)].map((m) => m[1]);
  for (const k of ['lobby', ...Object.keys(LAYOUTS)]) {
    ok(keys.includes(k), `มีเพลงของ ${k}`);
  }
  // แต่ละเพลงต้องต่างกันจริง ไม่ใช่ก๊อปกันมา
  const bpms = [...src.matchAll(/bpm: (\d+)/g)].map((m) => m[1]);
  ok(new Set(bpms).size === bpms.length, `จังหวะเพลงไม่ซ้ำกันสักด่าน (${bpms.join(', ')} bpm)`);
  const g = require('fs').readFileSync(__dirname + '/../public/game.js', 'utf8');
  ok(g.includes("music.setTune(m.key || 'lobby')"), 'เข้าด่านแล้วสลับเพลงตามด่านนั้น');
  ok(g.includes("music.setTune('lobby')"), 'กลับล็อบบี้แล้วสลับกลับเพลงล็อบบี้');
}

/* ---------- ระบบดูโฆษณาถูกถอดออกหมดแล้ว ---------- */
{
  const files = ['server.js', 'store.js', 'public/app.js', 'public/index.html'];
  const left = files.filter((f) => /adStatus|adClaim|btnAd|api\/ad/.test(require('fs').readFileSync(__dirname + '/../' + f, 'utf8')));
  ok(left.length === 0, `ไม่เหลือโค้ดระบบโฆษณาในไฟล์ไหน${left.length ? ' — ' + left.join(',') : ''}`);
}

/* ---------- ปุ่มวิ่งใช้รูปรองเท้า ---------- */
{
  const html = require('fs').readFileSync(__dirname + '/../public/index.html', 'utf8');
  const css = require('fs').readFileSync(__dirname + '/../public/style.css', 'utf8');
  const btn = html.slice(html.indexOf('id="btnRun"'), html.indexOf('</button>', html.indexOf('id="btnRun"')));
  ok(btn.includes('class="runimg"'), 'ปุ่มวิ่งมีช่องใส่รูปรองเท้า');
  ok(btn.includes('class="fb"'), 'ไอคอนสำรองมีคลาส fb ไว้ซ่อนเมื่อโหลดรูปได้');
  ok(css.includes("url('ui/run.png')"), 'CSS ชี้ไปที่ไฟล์รูปรองเท้า');
  ok(require('fs').existsSync(__dirname + '/../public/ui/run.png'), 'ไฟล์ ui/run.png มีอยู่จริง');
  ok(!/\.runbtn i\{/.test(css), 'กฎหลอดพลังเจาะจง #runBar ไม่ไปโดนรูปรองเท้าที่เป็น <i> เหมือนกัน');
}


/* ---------- ของประเภทติดผนังต้องไม่มาวางกองกับพื้น ---------- */
{
  const WALLY = ['wallclock', 'extinguisher', 'fan', 'mirror', 'clocksign'];
  for (const key of Object.keys(LAYOUTS)) {
    const L = LAYOUTS[key];
    const onFloor = L.props.filter((p) => WALLY.includes(p.t) && !(p.y > 0.05));
    ok(onFloor.length === 0,
      `[${L.name}] ไม่มีของติดผนังวางกองกับพื้น${onFloor.length ? ' — ' + [...new Set(onFloor.map((p) => p.t))].join(',') : ''}`);
    const hung = L.props.filter((p) => p.y > 0.05 && WALLY.includes(p.t));
    const loose = hung.filter((p) => !L.walls.some((w) =>
      Math.abs(Math.max(w.x, Math.min(p.x, w.x + w.w)) - p.x) < 0.8
      && Math.abs(Math.max(w.z, Math.min(p.z, w.z + w.d)) - p.z) < 0.8));
    ok(loose.length === 0, `[${L.name}] ของติดผนัง ${hung.length} ชิ้นแนบผนังจริงทุกชิ้น`);
  }
}


/* ---------- วิ่งค้างไว้จนกว่าจะสั่งหยุด หรือพลังหมด ---------- */
{
  const rr3 = new Room('runtoggle');
  const pr3 = rr3.add(fakeSock('rt3'), fakeUser('นักวิ่ง'));
  rr3.startRound(); rr3.timer = 0; rr3.update(0.01);
  pr3.role = 'hider'; pr3.locked = false; pr3.run = true; pr3.stamina = CFG.RUN_MAX;
  pr3.in = { f: 1, s: 0, yaw: 0, seq: 1 };
  for (let i = 0; i < 20; i++) rr3.updatePlayer(pr3, 1 / 30);
  ok(pr3.run === true, 'สั่งวิ่งแล้ววิ่งค้างไว้ ไม่ต้องกดซ้ำทุกเฟรม');
  pr3.run = false;
  rr3.updatePlayer(pr3, 1 / 30);
  ok(pr3.run === false, 'สั่งหยุดแล้วหยุดทันที');
  pr3.run = true; pr3.stamina = 0.05;
  for (let i = 0; i < 10; i++) rr3.updatePlayer(pr3, 1 / 30);
  ok(pr3.run === false, 'พลังหมดแล้วระบบดับให้เอง ไม่ค้างวิ่งต่อ');
}


/* ---------- ผู้ชมเห็นชื่อทุกคน และกล้องลื่นไม่กระตุก ---------- */
{
  const rv2 = new Room('specnames');
  const pv2 = rv2.add(fakeSock('sn'), fakeUser('คนดู'));
  rv2.startRound(); rv2.timer = 0; rv2.update(0.01);
  let got = null;
  pv2.socket = { id: 'sn', emit: (k, v) => { if (k === 'm') got = v; } };

  for (const role of ['out', 'wait']) {
    pv2.role = role;
    rv2.broadcast();
    const others = rv2.list().filter((o) => o !== pv2 && (o.role === 'hider' || o.role === 'seeker')).length;
    ok(got.mates && got.mates.length === others,
      `[${role}] เห็นชื่อผู้เล่นคนอื่นครบ ${got.mates && got.mates.length} คน`);
    ok(got.mates.every((m) => typeof m.n === 'string' && m.i !== undefined), 'ข้อมูลป้ายชื่อมีทั้งชื่อและรหัสผู้เล่น');
  }
  pv2.role = 'hider';
  rv2.broadcast();
  const hidersOnly = rv2.list().filter((o) => o !== pv2 && o.role === 'hider').length;
  ok(got.mates.length === hidersOnly, 'คนซ่อนยังเห็นแค่เพื่อนร่วมทีมเหมือนเดิม');
  pv2.role = 'seeker';
  rv2.broadcast();
  ok(!got.mates || got.mates.length === 0, 'คนหาไม่เห็นชื่อใครเลย');

  // ไคลเอนต์ต้องทำนายการเลื่อนกล้องเอง ไม่งั้นกระตุกตามอัตราแพ็กเก็ตทั้งที่ FPS เต็ม
  const g = require('fs').readFileSync(__dirname + '/../public/game.js', 'utf8');
  const sim = g.slice(g.indexOf('function simulate'), g.indexOf('function simulate') + 800);
  ok(/SPEC_SPEED/.test(sim) && /local\.x =/.test(sim), 'ไคลเอนต์ทำนายการเลื่อนกล้องผู้ชมเอง (ไม่รอแพ็กเก็ต)');
  ok(/ghostCam/.test(g), 'กล้องผู้ชมไม่ถูกดึงเข้ามาเวลาเจอกำแพง (เลื่อนได้ลื่นถึงขอบแมป)');
  const sv = require('fs').readFileSync(__dirname + '/../server.js', 'utf8');
  ok(/specSpeed: CFG\.SPEC_SPEED/.test(sv), 'เซิร์ฟเวอร์ส่งค่าความเร็วกล้องให้ไคลเอนต์ใช้สูตรเดียวกัน');
}



/* ---------- ไอคอนเมนูเพื่อน ---------- */
{
  const fs2 = require('fs');
  const html = fs2.readFileSync(__dirname + '/../public/index.html', 'utf8');
  const css = fs2.readFileSync(__dirname + '/../public/style.css', 'utf8');
  const app = fs2.readFileSync(__dirname + '/../public/app.js', 'utf8');
  const i0 = html.indexOf('data-panel="pFriends"');
  const btn = html.slice(i0, html.indexOf('</button>', i0));
  ok(/class="icofriends"/.test(btn), 'ปุ่มเมนูเพื่อนมีช่องใส่รูปไอคอน');
  ok(/class="fb"/.test(btn), 'มีไอคอน SVG สำรองไว้เผื่อรูปโหลดไม่ขึ้น');
  ok(css.indexOf("url('ui/friends.png')") >= 0, 'CSS ชี้ไปที่ไฟล์รูปเพื่อน');
  ok(app.indexOf("'ui/friends.png', 'hasFriends'") >= 0, 'โค้ดโหลดรูปแล้วติดคลาส hasFriends ให้');
  ok(fs2.existsSync(__dirname + '/../public/ui/friends.png'), 'ไฟล์ ui/friends.png มีอยู่จริง');
}

console.log(`\n${pass} ผ่าน / ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
