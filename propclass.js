'use strict';

/* จัดประเภทของกับตรวจคุณภาพผัง — ใช้ร่วมกันทุกด่าน
   (แยกออกมาจาก mapjson.js เดิมตอนเลิกใช้ด่านห้าง) */

const DISPLAY_PROPS = new Set([
  'soda', 'milk', 'water', 'snack', 'chips', 'noodle', 'chocopie', 'coffee', 'plate', 'tissue',
  'phone', 'tablet', 'earbuds', 'cable', 'usb', 'calculator', 'powerbank', 'radio',
  'book', 'notebook', 'pen', 'pencil', 'marker', 'perfume', 'lipstick', 'powder',
  'sunscreen', 'sanitizer', 'roll', 'watch', 'sunglasses', 'cap', 'handbag', 'backpack',
  'sneaker', 'keychain', 'thermos', 'medkit', 'cleaner', 'shopbag', 'cup', 'tray',
  'popcorn', 'slushie', 'icecream', 'zoocap', 'plushlion', 'plushpanda', 'soapbox', 'teddy',
  'pillow', 'umbrella', 'vase',
]);

/* ของที่วางบนพื้นได้ = ทุกอย่างที่ไม่ใช่ของชิ้นเล็กและไม่ใช่ของติดผนัง */
const FLOOR_PROPS = { has: (t) => !DISPLAY_PROPS.has(t) && !WALL_PROPS.has(t) };

/* โซนเปิด (ลานกลาง/ทางเข้า) ไม่เติมของอัตโนมัติเลย — ใน JSON วางน้ำพุ ม้านั่ง ต้นไม้ ป้ายไว้แล้ว */
const NO_AUTOFILL = new Set(['atrium']);

/* ของที่ต้องติดผนัง ไม่วางพื้นและไม่วางบนชั้น */
const WALL_PROPS = new Set(['extinguisher', 'wallclock', 'fan', 'mirror']);   // ป้ายสวนสัตว์มีเสาตั้งพื้น ไม่นับ

/* ระยะเว้นขั้นต่ำ (เมตร) */
const DOOR_CLEAR = 4.2;          // รอบประตู (เผื่อประตูกว้าง 6 ม. ด้วย)
const MAIN_AISLE = 4.0;          // ทางเดินหลัก
const SUB_AISLE = 2.5;           // ทางเดินรอง

/* โซนที่เป็นพื้นที่เปิด ไม่มีผนัง */
const OPEN_ZONES = new Set(['entrance', 'atrium_1', 'atrium_2', 'atrium_3']);
const OPEN_PAL = new Set(['atrium']);

/* จุดประตูของโซน: ถ้าผังระบุก็ใช้ ถ้าไม่ระบุให้เปิดด้านที่ใกล้กึ่งกลางแผนที่ที่สุด */
const doorCache = new Map();
function doorPoint(zn, cx, cz, handProps) {
  if (doorCache.has(zn.id)) return doorCache.get(zn.id);
  if (zn.door) {
    // ผังกำหนดด้านของประตูไว้ แต่ยังเลื่อนตำแหน่งตามแนวผนังได้ ถ้าของที่วางมือบังอยู่
    const side = sideOf(zn, cx, cz);
    const bx0 = cx(zn.rect.x), bx1 = cx(zn.rect.x + zn.rect.w);
    const bz0 = cz(zn.rect.z), bz1 = cz(zn.rect.z + zn.rect.d);
    const along = side === 'n' || side === 's';
    const base = { x: cx(zn.door.x), z: cz(zn.door.z) };
    const lim = along ? (bx1 - bx0) / 2 - 3 : (bz1 - bz0) / 2 - 3;
    const props = handProps || [];
    for (const off of [0, 2.5, -2.5, 5, -5, 7.5, -7.5]) {
      if (Math.abs(off) > lim) continue;
      const px = along ? base.x + off : base.x, pz = along ? base.z : base.z + off;
      if (props.some((q) => Math.hypot(q.x - px, q.z - pz) < 3.2)) continue;
      const r0 = { side, x: px, z: pz };
      doorCache.set(zn.id, r0);
      return r0;
    }
    const r1 = { side, x: base.x, z: base.z };
    doorCache.set(zn.id, r1);
    return r1;
  }
  const x0 = cx(zn.rect.x), x1 = cx(zn.rect.x + zn.rect.w);
  const z0 = cz(zn.rect.z), z1 = cz(zn.rect.z + zn.rect.d);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  // ด้านที่ใกล้กึ่งกลางแผนที่ที่สุด แล้วเลื่อนตำแหน่งประตูไปตามผนังจนไม่มีของที่วางมือบัง
  const cand = [
    { side: 'n', x: mx, z: z0, d: Math.hypot(mx, z0) },
    { side: 's', x: mx, z: z1, d: Math.hypot(mx, z1) },
    { side: 'w', x: x0, z: mz, d: Math.hypot(x0, mz) },
    { side: 'e', x: x1, z: mz, d: Math.hypot(x1, mz) },
  ].sort((a, b) => a.d - b.d);
  const best = cand[0];
  const props = handProps || [];
  const along = best.side === 'n' || best.side === 's';
  const lim = along ? (x1 - x0) / 2 - 4 : (z1 - z0) / 2 - 4;
  for (const off of [0, 3, -3, 6, -6, 9, -9, 12, -12]) {
    if (Math.abs(off) > lim) continue;
    const px = along ? best.x + off : best.x, pz = along ? best.z : best.z + off;
    if (!props.some((q) => Math.hypot(q.x - px, q.z - pz) < 5)) {
      const r = { side: best.side, x: px, z: pz };
      doorCache.set(zn.id, r);
      return r;
    }
  }
  doorCache.set(zn.id, best);
  return best;
}

function sideOf(z, cx, cz) {
  const x0 = cx(z.rect.x), x1 = cx(z.rect.x + z.rect.w), z0 = cz(z.rect.z), z1 = cz(z.rect.z + z.rect.d);
  const dx = cx(z.door.x), dz = cz(z.door.z);
  if (Math.abs(dz - z0) < 0.6) return 'n';
  if (Math.abs(dz - z1) < 0.6) return 's';
  if (Math.abs(dx - x0) < 0.6) return 'w';
  if (Math.abs(dx - x1) < 0.6) return 'e';
  return 'n';
}

/* ตรวจคุณภาพผังหลังสร้างเสร็จ — คืนรายการปัญหาเป็นข้อความ ถ้าไม่มีปัญหาคืนอาร์เรย์ว่าง
   ใช้ได้ทั้งตอนสตาร์ตเซิร์ฟเวอร์ (log warning) และในชุดเทสต์ */
function validateFloor(built, opts) {
  const o = Object.assign({
    minimumFreeFloor: 0.5,     // พื้นที่เดินได้ขั้นต่ำต่อห้อง
    minDoorClearance: 2.6,     // รัศมีโล่งรอบประตู
    maxOccupancy: 0.42,        // สัดส่วนพื้นที่ที่ของกินได้สูงสุด (ร้านทั่วไป)
    maxLooseSmallProps: 2,     // ของชิ้นเล็กที่หล่นกลางพื้นต่อห้อง
  }, opts || {});
  const SIZE = require('./maplayout').PROP_SIZE;
  const out = [];
  const floorProps = built.props.filter((p) => !(p.y > 0.05));

  for (const zn of built.zones || []) {
    const [x0, x1, z0, z1] = zn.box;
    const area = (x1 - x0) * (z1 - z0);
    const inside = floorProps.filter((p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);

    let occ = 0;
    for (const p of inside) occ += Math.PI * ((SIZE[p.t] ? SIZE[p.t][1] : 0.5) * 0.72) ** 2;
    if (occ / area > o.maxOccupancy) out.push(`${zn.name}: ของกินพื้นที่ ${(occ / area * 100).toFixed(0)}% เกิน ${(o.maxOccupancy * 100)}%`);

    let free = 0, tot = 0;
    for (let x = x0 + 0.5; x < x1; x += 0.6) {
      for (let z = z0 + 0.5; z < z1; z += 0.6) {
        tot++;
        if (!inside.some((p) => Math.hypot(p.x - x, p.z - z) < (SIZE[p.t] ? SIZE[p.t][1] : 0.5) * 0.72 + 0.42)) free++;
      }
    }
    if (free / tot < o.minimumFreeFloor) out.push(`${zn.name}: เดินได้แค่ ${(free / tot * 100).toFixed(0)}%`);

    if (zn.doorAt) {
      const blocked = inside.filter((p) => Math.hypot(p.x - zn.doorAt.x, p.z - zn.doorAt.z) < o.minDoorClearance);
      if (blocked.length) out.push(`${zn.name}: มีของ ${blocked.length} ชิ้นใกล้ประตูเกินไป`);
    }

    // ของชิ้นเล็กที่ไม่ได้อยู่บนเฟอร์นิเจอร์และไม่ได้ติดผนัง = หล่นกลางพื้น
    const stands = inside.filter((p) => ['shelf', 'desk', 'showcase', 'rack', 'fridge', 'sofa', 'chair'].includes(p.t));
    const loose = inside.filter((p) => !FLOOR_PROPS.has(p.t) && !WALL_PROPS.has(p.t)
      && !stands.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.6));
    if (loose.length > o.maxLooseSmallProps) {
      out.push(`${zn.name}: ของชิ้นเล็กหล่นกลางพื้น ${loose.length} ชิ้น (${[...new Set(loose.map((p) => p.t))].join(',')})`);
    }
  }
  return out;
}

module.exports = {
  DISPLAY_PROPS, FLOOR_PROPS, WALL_PROPS, DOOR_CLEAR, MAIN_AISLE, SUB_AISLE, validateFloor,
};
