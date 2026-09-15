'use strict';

/* ด่านที่ 3 — บ้านเดี่ยวพร้อมสนาม 84 x 60 เมตร
   ตัวบ้านอยู่กลางซ้าย มีโถงทางเดินกลางบ้าน ห้องเรียงสองฝั่ง
   สนามหญ้ารอบบ้านล้อมด้วยรั้วเตี้ย (กระโดดข้ามได้) มีสวนหลังบ้าน สระเล็ก บ้านหมา โรงรถ
   จัดของแบบบ้านจริง: ของชิ้นเล็กอยู่บนโต๊ะ/ชั้น ไม่โปรยพื้น */

const MAP_W = 84;
const MAP_D = 60;
const T = 0.7;
const WALL_H = 3.4;
const FENCE_H = 1.1;
const R0 = 0, R90 = Math.PI / 2, R180 = Math.PI, R270 = -Math.PI / 2;

/* ตัวบ้าน x -36..16, z -22..18 โถงกลาง z -2..2 */
const HOUSE = [-36, 16, -22, 18];
const ROOMS = [
  { name: 'ห้องนั่งเล่น', box: [-36, -14, -22, -2], door: 's', kind: 'room', color: '#e9dcc4' },
  { name: 'ห้องครัว',    box: [-14, 4, -22, -2],   door: 's', kind: 'room', color: '#dfe6ea' },
  { name: 'ห้องนอนใหญ่', box: [4, 16, -22, -2],    door: 's', kind: 'room', color: '#f1e3ea' },
  { name: 'ห้องอาหาร',   box: [-36, -18, 2, 18],   door: 'n', kind: 'room', color: '#ead9c9' },
  { name: 'ห้องน้ำ',     box: [-18, -8, 2, 18],    door: 'n', kind: 'room', color: '#d9e8ee' },
  { name: 'ห้องนอนเล็ก', box: [-8, 4, 2, 18],      door: 'n', kind: 'room', color: '#e8e2f1' },
  { name: 'โรงรถ',       box: [4, 16, 2, 18],      door: 'e', kind: 'room', color: '#cfd2d6' },
];
/* พื้นที่นอกบ้าน (ไม่มีผนัง) */
const YARDS = [
  { name: 'สนามหน้าบ้าน', box: [-40, 40, 20, 28], kind: 'yard' },
  { name: 'สวนหลังบ้าน',  box: [-40, 40, -28, -24], kind: 'yard' },
  { name: 'สนามข้างบ้าน', box: [18, 40, -22, 18], kind: 'yard' },
];

function buildWalls() {
  const out = [];
  const h = (x1, x2, z, hh) => { if (x2 - x1 > 0.05) out.push({ x: x1, z: z - T / 2, w: x2 - x1, d: T, h: hh }); };
  const v = (x, z1, z2, hh) => { if (z2 - z1 > 0.05) out.push({ x: x - T / 2, z: z1, w: T, d: z2 - z1, h: hh }); };

  // ขอบแผนที่ (สูง)
  h(-MAP_W / 2, MAP_W / 2, -MAP_D / 2 + T / 2, 4);
  h(-MAP_W / 2, MAP_W / 2, MAP_D / 2 - T / 2, 4);
  v(-MAP_W / 2 + T / 2, -MAP_D / 2, MAP_D / 2, 4);
  v(MAP_W / 2 - T / 2, -MAP_D / 2, MAP_D / 2, 4);

  // รั้วบ้านเตี้ย ล้อมสนาม เว้นประตูรั้วหน้าบ้าน
  h(-40, -4, 28, FENCE_H); h(4, 40, 28, FENCE_H);
  h(-40, 40, -28, FENCE_H);
  v(-40, -28, 28, FENCE_H); v(40, -28, 28, FENCE_H);

  // ผนังนอกตัวบ้าน เว้นประตูหน้าบ้าน (ปลายโถงฝั่งตะวันตก) และประตูโรงรถ (ตะวันออก)
  const [hx0, hx1, hz0, hz1] = HOUSE;
  h(hx0, hx1, hz0, WALL_H);
  h(hx0, hx1, hz1, WALL_H);
  v(hx0, hz0, -1.8, WALL_H); v(hx0, 1.8, hz1, WALL_H);           // ประตูหน้าบ้านที่โถง
  v(hx1, hz0, 2, WALL_H); v(hx1, 6.2, 12.4, WALL_H); v(hx1, 16.6, hz1, WALL_H);   // ประตูโรงรถ 2 ช่อง

  // ผนังห้อง: แต่ละห้องมีประตูด้านโถง กว้าง 2.4 ม.
  for (const r of ROOMS) {
    const [x0, x1, z0, z1] = r.box;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g = 1.2;
    // ด้านที่ติดโถง
    if (r.door === 's') { h(x0, cx - g, z1, WALL_H); h(cx + g, x1, z1, WALL_H); }
    if (r.door === 'n') { h(x0, cx - g, z0, WALL_H); h(cx + g, x1, z0, WALL_H); }
    if (r.door === 'e') { h(x0, x1, z0, WALL_H); }
    // ผนังกั้นระหว่างห้องข้าง ๆ (เฉพาะขอบใน)
    if (x0 > hx0) v(x0, z0, z1, WALL_H);
    if (r.door === 'e') { v(x0, z0, z1, WALL_H); }
  }
  // ประตูโรงรถเข้าบ้าน: ผนังฝั่งตะวันตกของโรงรถมีช่อง
  return dedupe(out);
}

function dedupe(walls) {
  const seen = new Set();
  return walls.filter((w) => {
    const k = [w.x, w.z, w.w, w.d].map((n) => n.toFixed(2)).join(',');
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

function buildProps() {
  const P = [];
  const SZ = require('./maplayout').PROP_SIZE;
  const add = (t, x, z, ry) => P.push({ t, x: +x.toFixed(2), z: +z.toFixed(2), ry: ry || 0 });
  const slot = new Map();
  /* วางของชิ้นเล็กบนผิวบนของเฟอร์นิเจอร์ที่ระบุ */
  const on = (base, t) => {
    const k = base.x + ',' + base.z;
    const u = slot.get(k) || 0;
    slot.set(k, u + 1);
    if (u >= 3) return;
    const oa = [0, -0.6, 0.6][u], oo = 0;
    const a = base.ry || 0;
    P.push({ t, x: +(base.x + Math.cos(a) * oa + Math.sin(a) * oo).toFixed(2),
      z: +(base.z - Math.sin(a) * oa + Math.cos(a) * oo).toFixed(2), ry: a, y: +(SZ[base.t] ? SZ[base.t][0] : 0.8).toFixed(2) });
  };
  const furn = (t, x, z, ry) => { add(t, x, z, ry); return P[P.length - 1]; };

  /* ---- ห้องนั่งเล่น [-36,-14,-22,-2]: โซฟาหันหาทีวี โต๊ะกลาง ชั้นหนังสือ ---- */
  {
    const tv = furn('coffeetable', -25, -20.4, R0); on(tv, 'tv');
    const sf = furn('sofa', -25, -14.5, R0); on(sf, 'pillow');
    add('sofa', -30.5, -17, R90); add('sofa', -19.5, -17, R270);
    const ct = furn('coffeetable', -25, -17, R0); on(ct, 'vase'); on(ct, 'cup');
    const bs = furn('homeshelf', -34.6, -12, R90); on(bs, 'book'); on(bs, 'radio'); on(bs, 'teddy');
    add('homeshelf', -34.6, -9, R90);
    add('plant', -16, -20.4); add('plant', -34.6, -20.4); add('lamp', -16, -6, R0);
    add('homebin', -34.6, -4.5);
  }
  /* ---- ห้องครัว [-14,4,-22,-2]: เคาน์เตอร์ตัว L ตู้เย็น เตา โต๊ะเล็ก ---- */
  {
    for (let x = -11; x <= 1; x += 2.2) { const c = furn('coffeetable', x, -20.4, R0); on(c, ['plate', 'cup', 'microwave', 'tray', 'coffee', 'milk'][Math.round((x + 11) / 2.2) % 6]); }
    add('fridge', -12.6, -16.5, R90); add('stove', -12.6, -13.5, R90);
    add('washer', 2.6, -16.5, R270); add('kitchensink', 2.6, -13.5, R270);
    const kt = furn('coffeetable', -5, -10, R0); on(kt, 'plate'); on(kt, 'cup');
    add('diningchair', -5, -11.6, R0); add('diningchair', -5, -8.4, R180);
    add('homebin', 2.6, -4.5); add('laundrybasket', -12.6, -4.5); add('laundrybasket', -12.6, -6); add('laundrybasket', 2.6, -7);
  }
  /* ---- ห้องนอนใหญ่ [4,16,-22,-2]: เตียง ตู้เสื้อผ้า โต๊ะเครื่องแป้ง ---- */
  {
    const bd1 = furn('bed', 10, -17, R0); on(bd1, 'pillow'); on(bd1, 'pillow'); on(bd1, 'teddy');
    add('wardrobe', 5.5, -8, R90); add('wardrobe', 5.5, -5.5, R90);
    const dr = furn('dresser', 14.4, -8, R270); on(dr, 'perfume'); on(dr, 'lipstick');
    add('diningchair', 12.8, -8, R90);
    add('lamp', 14.4, -20.4); add('lamp', 6, -20.4);
    add('box', 14.4, -4); add('box', 13.3, -4);
  }
  /* ---- ห้องอาหาร [-36,-18,2,18]: โต๊ะยาว เก้าอี้รอบ ตู้โชว์ ---- */
  {
    const d1 = furn('coffeetable', -28, 10, R0); on(d1, 'plate'); on(d1, 'vase');
    const d2 = furn('coffeetable', -25.6, 10, R0); on(d2, 'cup'); on(d2, 'plate');
    for (const x of [-29, -26.5, -24]) { add('diningchair', x, 8.4, R0); add('diningchair', x, 11.6, R180); }
    const sc = furn('homeshelf', -34.6, 8, R90); on(sc, 'cup'); on(sc, 'vase');
    add('homeshelf', -34.6, 12, R90); add('homeshelf', -34.6, 4.5, R90);
    add('plant', -19.4, 16.4); add('plant', -34.6, 16.4); add('homebin', -19.4, 4);
  }
  /* ---- ห้องน้ำ [-18,-8,2,18]: อ่างอาบน้ำ ชักโครก อ่างล้างมือ ---- */
  {
    add('bathtub', -13, 16.4, R0);
    add('toilet', -16.6, 9, R90);
    const sk = furn('kitchensink', -9.4, 9, R270); on(sk, 'soapbox');
    add('kitchensink', -9.4, 12, R270);
    add('homebin', -16.6, 4); add('laundrybasket', -9.4, 4.5); add('moppail', -16.6, 14);
  }
  /* ---- ห้องนอนเล็ก [-8,4,2,18]: เตียง โต๊ะอ่านหนังสือ ชั้น ---- */
  {
    const bd2 = furn('bed', -2, 13, R180); on(bd2, 'pillow'); on(bd2, 'teddy');
    const ds = furn('coffeetable', 2.4, 6, R270); on(ds, 'book'); on(ds, 'pen'); on(ds, 'lamp');
    add('diningchair', 0.8, 6, R270);
    const sh = furn('homeshelf', -6.6, 6, R90); on(sh, 'book'); on(sh, 'notebook'); on(sh, 'teddy');
    add('wardrobe', -6.6, 10, R90);
    add('box', -6.6, 16.4); add('box', -5.4, 16.4); add('homebin', 2.4, 3.2); add('rack', 2.4, 15.5, R270);
  }
  /* ---- โรงรถ [4,16,2,18]: จักรยาน ชั้นเครื่องมือ ยาง ถัง ---- */
  {
    add('bike', 8, 7, R0); add('bike', 8, 9.6, R0); add('bike', 8, 12.2, R0);
    const tr = furn('rack', 5.5, 15, R90); on(tr, 'toolcart');
    add('rack', 5.5, 5, R90);
    add('toolcart', 14.4, 15); add('toolcart', 14.4, 13.6); add('toolcart', 13, 16);
    add('toolcart', 14.4, 4); add('toolcart', 13.2, 4); add('laundrybasket', 11.8, 4); add('box', 10, 16.2); add('box', 11.2, 16.2); add('box', 10, 15);
    add('toolcart', 8, 15, R90); add('moppail', 5.5, 10); add('moppail', 5.5, 12.5);
  }
  /* ---- สนามหน้าบ้าน z 20..28: ทางเดิน ตู้จดหมาย ม้านั่ง กระถาง ---- */
  {
    add('mailbox', -6, 26.5); add('mailbox', 6, 26.5); add('mailbox', -38, 26.5);
    add('coffeetable', -20, 24, R0); add('coffeetable', 20, 24, R0);
    for (const x of [-32, -14, 14, 32]) add('hedge', x, 22.5);
    add('gardentree', -36, 25); add('gardentree', 36, 25); add('gardentree', -26, 21.5); add('gardentree', 26, 21.5);
    add('hedge', -10, 21.8); add('hedge', 10, 21.8); add('homebin', 22.5, 26);
    add('gardenlamp', -8, 20.4); add('gardenlamp', 8, 20.4); add('gardenlamp', 38, 20.4);
  }
  /* ---- สวนหลังบ้าน z -28..-24 (แคบ) + สนามข้างบ้าน x 18..40 ---- */
  {
    for (const x of [-34, -24, -14, -4, 6, 16, 26]) add('hedge', x, -26);
    add('gardentree', -38, -26); add('gardentree', 36, -26);
    // สนามข้างบ้าน: สระ บ้านหมา เตาย่าง โต๊ะปิกนิก
    add('pond', 30, -12, R0);
    add('doghouse', 22, 4, R270); add('doghouse', 36, 12, R90); add('doghouse', 36, -22, R180);
    add('grill', 24, -4, R0); add('grill', 30, 14, R0); add('grill', 36, -4, R0);
    const pt = furn('coffeetable', 30, 2, R0); on(pt, 'plate'); on(pt, 'cup');
    add('coffeetable', 30, -0.2, R0); add('coffeetable', 30, 4.2, R180);
    add('gardentree', 36, -18); add('gardentree', 22, -18); add('gardentree', 38, 2); add('hedge', 20, -8); add('hedge', 38, -8); add('hedge', 22, 14);
    add('hedge', 20, 16.4); add('hedge', 38, 16.4);
    add('toolcart', 20, -20, R0); add('toolcart', 34, -26, R0); add('laundrybasket', 22, -21); add('toolcart', 20, -24);
    add('hedge', 28, -18.4, R0); add('hedge', 32, -18.4, R0); add('hedge', 28, 8.6, R0); add('hedge', 32, 8.6, R0);
    add('plant', 18.5, 0); add('plant', 18.5, -14);
  }
  return P;
}

function seeds() {
  const s = [];
  // โถงกลางบ้าน + ประตูทุกห้อง + ประตูบ้าน + ทางรอบบ้าน
  for (let x = -34; x <= 14; x += 3) s.push([x, 0]);
  for (const r of ROOMS) {
    const [x0, x1, z0, z1] = r.box; const cx = (x0 + x1) / 2;
    if (r.door === 's') { s.push([cx, z1 - 1.5]); s.push([cx, z1 + 1.5]); }
    if (r.door === 'n') { s.push([cx, z0 + 1.5]); s.push([cx, z0 - 1.5]); }
    if (r.door === 'e') { s.push([x1 - 1.5, 9.3]); s.push([x1 + 1.5, 9.3]); }
  }
  s.push([-37.5, 0]); s.push([-34.5, 0]);
  for (let z = -26; z <= 26; z += 3) { s.push([-38, z]); s.push([38, z]); s.push([22, z]); }
  for (let x = -38; x <= 38; x += 3) { s.push([x, 24]); s.push([x, -26]); }
  return s;
}

module.exports = { MAP_W, MAP_D, buildWalls, buildProps, seeds, ROOMS, YARDS, HOUSE, FENCE_H };
