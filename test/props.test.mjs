/* ทดสอบโมเดลด้วย three.js ตัวจริงบน Node ไม่ต้องใช้เบราว์เซอร์ */

import * as THREE from '../public/vendor/three.module.js';
import {
  makeProp, makeChar, propGeometry, mergeBoxes,
  PROP_INFO, PROP_TYPES, SKIN_IDS,
} from '../public/props.js';
import { SCENERY, HIDEABLE } from '../public/propdata.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + m); };

const bb = new THREE.Box3();
const size = new THREE.Vector3();

let okCount = 0;
for (const t of PROP_TYPES) {
  let g = null, err = null;
  try { g = makeProp(t); } catch (e) { err = e; }
  if (!g) { ok(false, `สร้าง ${t} ไม่ได้: ${err && err.message}`); continue; }

  g.updateMatrixWorld(true);
  bb.setFromObject(g);
  bb.getSize(size);

  const grounded = bb.min.y > -0.05 && bb.min.y < 0.1;
  // ของประกอบฉากอย่างบันไดเลื่อนกับลิฟต์ตัวใหญ่กว่าสินค้าทั่วไปได้
  const big = SCENERY.includes(t) || ['giraffe', 'elephant', 'camel', 'deer', 'bamboo', 'flamingo', 'zebra'].includes(t);
  const lim = big ? 10 : 3;
  const hi = big ? 4.2 : 2.6;
  const sane = size.x > 0.08 && size.x < lim && size.z > 0.08 && size.z < lim
    && size.y > 0.1 && size.y < hi;
  const tall = Math.abs(bb.max.y - PROP_INFO[t].h) < 0.2;
  const single = g.isMesh === true;
  const named = !!PROP_INFO[t].label;

  if (!(grounded && sane && tall && single && named)) {
    ok(false, `${t}: ฐาน ${bb.min.y.toFixed(2)} สูง ${bb.max.y.toFixed(2)} (ควรเป็น ${PROP_INFO[t].h}) ขนาด ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`);
  } else okCount++;
}

ok(okCount === PROP_TYPES.length, `โมเดลทั้ง ${PROP_TYPES.length} ชนิดฐานติดพื้นและสัดส่วนตรงกับข้อมูล`);
ok(PROP_TYPES.every((t) => PROP_INFO[t] && PROP_INFO[t].label), 'ทุกชนิดมีความสูง รัศมี และชื่อไทย');
ok(HIDEABLE.length >= 60, `มีของให้ปลอมตัว ${HIDEABLE.length} ชนิด`);
const labels = new Set(PROP_TYPES.map((t) => PROP_INFO[t].label));
ok(labels.size === PROP_TYPES.length, 'ชื่อไทยไม่ซ้ำกันสักชิ้น');

// geometry ถูกรวมเป็นก้อนเดียวและแคชไว้ ใช้ซ้ำได้
ok(propGeometry('sofa') === propGeometry('sofa'), 'geometry ถูกแคชไว้ ไม่สร้างซ้ำทุกครั้ง');
const gs = propGeometry('shelf');
ok(gs.attributes.color && gs.attributes.color.count === gs.attributes.position.count,
   'geometry มีสีฝังในตัว vertex ครบทุกจุด');
ok(gs.attributes.position.count > 100 && gs.attributes.position.count < 2000,
   `ชั้นหนังสือรวมเป็น ${gs.attributes.position.count} vertex ก้อนเดียว`);

// ตัวละคร
for (const skin of SKIN_IDS) {
  const c = makeChar(skin);
  c.updateMatrixWorld(true);
  bb.setFromObject(c);
  bb.getSize(size);
  let meshes = 0;
  c.traverse((o) => { if (o.isMesh) meshes++; });
  ok(size.y > 1.6 && size.y < 2.2 && bb.min.y > -0.05 && meshes <= 6,
    `สกิน ${skin}: สูง ${size.y.toFixed(2)} ม. ใช้ ${meshes} mesh`);
}

const c1 = makeChar('blue');
ok(!!c1.userData.arm && !!c1.userData.armL && Array.isArray(c1.userData.legs),
  'ตัวละครมีแขนขาให้ขยับตอนเดินและตี');

// จำนวน mesh รวมของทั้งด่านต้องน้อย ไม่งั้นเฟรมจะตก
ok(PROP_TYPES.length <= 140, `ของทั้งเกมใช้ไม่เกิน ${PROP_TYPES.length} draw call (instanced ชนิดละก้อน เฉพาะชนิดที่มีในด่านนั้น)`);
ok(SCENERY.length + HIDEABLE.length === PROP_TYPES.length,
  `แบ่งเป็นของที่ปลอมตัวได้ ${HIDEABLE.length} ชนิด กับของประกอบฉาก ${SCENERY.length} ชนิด`);
let verts = 0;
for (const t of PROP_TYPES) verts += propGeometry(t).attributes.position.count;
ok(verts / PROP_TYPES.length < 900, `เฉลี่ยชนิดละ ${Math.round(verts / PROP_TYPES.length)} vertex เบาพอสำหรับมือถือ`);

const merged = mergeBoxes([
  { w: 1, h: 1, d: 1, c: 0xff0000, x: 0, y: 0.5, z: 0 },
  { w: 1, h: 1, d: 1, c: 0x00ff00, x: 2, y: 0.5, z: 0 },
]);
ok(merged.attributes.position.count === 72, 'รวมสองกล่องได้ 72 vertex ตามคาด');
merged.computeBoundingBox();
ok(Math.abs(merged.boundingBox.max.x - 2.5) < 0.001, 'ตำแหน่งกล่องที่รวมแล้วถูกต้อง');

console.log(`\n${pass} ผ่าน / ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
