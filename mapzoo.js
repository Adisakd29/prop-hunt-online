'use strict';

/* ด่านที่ 2 — สวนสัตว์ 110 x 80 เมตร ตามภาพอ้างอิง
   ทางเข้าอยู่ด้านล่างกลาง (z บวก) ลานน้ำพุกลางสวน
   คอกสัตว์กระจายรอบ: ลิง เพนกวิน สิงโต ช้าง (แถวบน) จระเข้ ฟลามิงโก (ซ้าย)
   ยีราฟ หมี (ขวา) ร้านของที่ระลึก ห้องน้ำ (ล่างซ้าย) คาเฟ่ (กลางซ้าย) พิพิธภัณฑ์ (ล่างขวา)
   รั้วคอกเตี้ย 1.2 ม. กระโดดข้ามได้ อาคารผนังสูง */

const MAP_W = 110;
const MAP_D = 80;
const T = 0.8;
const FENCE_H = 1.2;
const WALL_H = 4;
const R0 = 0, R90 = Math.PI / 2, R180 = Math.PI, R270 = -Math.PI / 2;

/* คอก: box [x0,x1,z0,z1], gate = ด้านที่มีประตู, animals = สัตว์ในคอก, deco = ของตกแต่ง */
const PENS = [
  { name: 'โซนลิง',          box: [-52, -30, -38, -22], gate: 's',
    animals: ['monkey', 'monkey', 'monkey', 'parrot'], deco: ['tree', 'log', 'bamboo', 'tire', 'rock', 'bush'] },
  { name: 'โซนเพนกวิน',      box: [-26, -4, -38, -22], gate: 's', water: true,
    animals: ['penguin', 'penguin', 'penguin'], deco: ['rock', 'pond', 'rock', 'lowfence', 'bucket', 'feeder', 'rock'] },
  { name: 'โซนสัตว์นักล่า',   box: [4, 28, -38, -22], gate: 's',
    animals: ['lion', 'lion', 'tiger', 'tiger'], deco: ['rock', 'log', 'bush', 'tree', 'rock', 'hay'] },
  { name: 'โซนช้างและฮิปโป',  box: [32, 52, -38, -18], gate: 'w', water: true,
    animals: ['elephant', 'elephant', 'hippo', 'hippo'], deco: ['pond', 'hay', 'log', 'tree', 'bush', 'feeder'] },
  { name: 'โซนจระเข้',       box: [-52, -32, -16, 0], gate: 'e', water: true,
    animals: ['crocodile', 'crocodile', 'crocodile', 'frog'], deco: ['pond', 'rock', 'log', 'bush', 'lowfence'] },
  { name: 'โซนนกน้ำ',        box: [-52, -32, 4, 22], gate: 'e', water: true,
    animals: ['flamingo', 'flamingo', 'flamingo', 'peacock', 'peacock'],
    deco: ['pond', 'bush', 'flowerbed', 'rock', 'lowfence', 'feeder', 'bush', 'bamboo'] },
  { name: 'โซนทุ่งหญ้า',      box: [10, 34, -12, 8], gate: 'w',
    animals: ['giraffe', 'zebra', 'deer'],
    deco: ['tree', 'bush', 'feeder', 'bush', 'tree'] },
  { name: 'โซนหมี',          box: [38, 54, -12, 10], gate: 'w',
    animals: ['bear', 'panda'], deco: ['rock', 'bamboo', 'tree', 'bush'] },
  { name: 'โซนฟาร์ม',        box: [8, 30, 14, 28], gate: 'w',
    animals: ['goat', 'rabbit', 'camel', 'kangaroo'],
    deco: ['hay', 'feeder', 'bucket', 'lowfence', 'hay', 'wheelbarrow'] },
];


/* อาคารผนังสูง มีประตู */
const BUILDINGS = [
  { name: 'ร้านของที่ระลึก', box: [-50, -32, 25, 35], door: 'n',
    items: ['plushlion', 'plushpanda', 'zoocap', 'balloon', 'keychain', 'popcorn', 'slushie', 'icecream'], shelfStep: 2.6 },
  { name: 'ห้องน้ำ',         box: [-28, -16, 25, 35], door: 'n', small: true,
    items: ['sink', 'soapbox', 'trashbin', 'broom', 'bucket', 'sink'] },
  { name: 'คาเฟ่',           box: [-28, -6, -10, 4], door: 'e', dining: true,
    items: ['cup', 'tray', 'icebox', 'coffee'] },
  { name: 'พิพิธภัณฑ์',       box: [32, 51, 20, 35], door: 'w', museum: true,
    items: ['snake', 'owl', 'tortoise', 'frog'] },
];


function buildWalls() {
  const out = [];
  const h = (x1, x2, z, hh) => { if (x2 - x1 > 0.05) out.push({ x: x1, z: z - T / 2, w: x2 - x1, d: T, h: hh }); };
  const v = (x, z1, z2, hh) => { if (z2 - z1 > 0.05) out.push({ x: x - T / 2, z: z1, w: T, d: z2 - z1, h: hh }); };
  const boxWalls = (box, side, hh, gap) => {
    const [x0, x1, z0, z1] = box;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, g = gap / 2;
    if (side === 'n') { h(x0, cx - g, z0, hh); h(cx + g, x1, z0, hh); } else h(x0, x1, z0, hh);
    if (side === 's') { h(x0, cx - g, z1, hh); h(cx + g, x1, z1, hh); } else h(x0, x1, z1, hh);
    if (side === 'w') { v(x0, z0, cz - g, hh); v(x0, cz + g, z1, hh); } else v(x0, z0, z1, hh);
    if (side === 'e') { v(x1, z0, cz - g, hh); v(x1, cz + g, z1, hh); } else v(x1, z0, z1, hh);
  };

  // รั้วรอบสวน เว้นประตูทางเข้าด้านล่างกลาง
  h(-MAP_W / 2, MAP_W / 2, -MAP_D / 2 + T / 2, WALL_H);
  h(-MAP_W / 2, -3.5, MAP_D / 2 - T / 2, WALL_H);
  h(3.5, MAP_W / 2, MAP_D / 2 - T / 2, WALL_H);
  v(-MAP_W / 2 + T / 2, -MAP_D / 2, MAP_D / 2, WALL_H);
  v(MAP_W / 2 - T / 2, -MAP_D / 2, MAP_D / 2, WALL_H);

  for (const p of PENS) boxWalls(p.box, p.gate, FENCE_H, 4.6);
  for (const b of BUILDINGS) boxWalls(b.box, b.door, WALL_H, 3.6);

  /* ซอกแคบระหว่างผนังสองอันที่ขนานกัน ไม่มีใครเข้าไปแอบได้จริง ปิดหัวท้ายไปเลย */
  const seal = [];
  for (let a = 0; a < out.length; a++) {
    for (let b = a + 1; b < out.length; b++) {
      const A = out[a], B = out[b];
      if (A.h < 2 || B.h < 2) continue;
      const vA = A.d > A.w, vB = B.d > B.w;
      if (vA !== vB) continue;
      if (vA) {
        const gap = Math.abs(A.x - B.x) - A.w;
        const ov = Math.min(A.z + A.d, B.z + B.d) - Math.max(A.z, B.z);
        if (gap <= 0.05 || gap >= 2.4 || ov <= 3) continue;
        const x = Math.min(A.x, B.x) + A.w, z1s = Math.max(A.z, B.z), z2s = Math.min(A.z + A.d, B.z + B.d);
        seal.push({ x, z: z1s, w: gap, d: T, h: WALL_H });
        seal.push({ x, z: z2s - T, w: gap, d: T, h: WALL_H });
      } else {
        const gap = Math.abs(A.z - B.z) - A.d;
        const ov = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
        if (gap <= 0.05 || gap >= 2.4 || ov <= 3) continue;
        const z = Math.min(A.z, B.z) + A.d, x1s = Math.max(A.x, B.x), x2s = Math.min(A.x + A.w, B.x + B.w);
        seal.push({ x: x1s, z, w: T, d: gap, h: WALL_H });
        seal.push({ x: x2s - T, z, w: T, d: gap, h: WALL_H });
      }
    }
  }
  out.push(...seal);
  return out;
}

function gateOf(box, side) {
  const [x0, x1, z0, z1] = box;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (side === 'n') return { x: cx, z: z0 };
  if (side === 's') return { x: cx, z: z1 };
  if (side === 'w') return { x: x0, z: cz };
  return { x: x1, z: cz };
}

function buildProps() {
  const P = [];
  const add = (t, x, z, ry) => P.push({ t, x, z, ry: ry || 0 });

  /* คอก: ของตกแต่งวางตามมุมและขอบ สัตว์อยู่กลาง ๆ เว้นทางเดินหน้าประตู */
  for (const p of PENS) {
    const [x0, x1, z0, z1] = p.box;
    const w = x1 - x0, d = z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g = gateOf(p.box, p.gate);
    // ของตกแต่งตามมุมกับกึ่งกลางด้าน
    const spots = [
      [x0 + 2.4, z0 + 2.4], [x1 - 2.4, z0 + 2.4], [x0 + 2.4, z1 - 2.4], [x1 - 2.4, z1 - 2.4],
      [cx, z0 + 2.4], [cx, z1 - 2.4], [x0 + 2.4, cz], [x1 - 2.4, cz],
    ];
    let k = 0;
    for (const [x, z] of spots) {
      if (Math.hypot(x - g.x, z - g.z) < 5.5) continue;      // ไม่วางบังประตู
      if (k >= p.deco.length) break;
      add(p.deco[k++], x, z, (k % 4) * R90);
    }
    // สัตว์กระจายเป็นวงกลางคอก
    const n = p.animals.length;
    const rad = Math.min(w, d) * 0.22;
    p.animals.forEach((a, i) => {
      const ang = (i / n) * Math.PI * 2 + 0.4;
      add(a, +(cx + Math.cos(ang) * rad).toFixed(2), +(cz + Math.sin(ang) * rad).toFixed(2), (i * 2) % 7 * 0.9);
    });
    // คอกใหญ่เติมของธรรมชาติอีกวงด้านใน ให้มีที่ให้กลืนตัวมากขึ้น
    if (w * d > 280) {
      const inner = ['rock', 'bush', 'log', 'hay', 'rock', 'bush'];
      let j = 0;
      for (const [fx, fz] of [[0.25, 0.5], [0.75, 0.5], [0.5, 0.28], [0.5, 0.72], [0.3, 0.3], [0.7, 0.7]]) {
        const x = x0 + w * fx, z = z0 + d * fz;
        if (Math.hypot(x - g.x, z - g.z) < 5.5) continue;
        if (P.some((q) => Math.hypot(q.x - x, q.z - z) < 2.4)) continue;
        add(inner[j++ % inner.length], +x.toFixed(2), +z.toFixed(2), (j % 4) * R90);
      }
    }
    // ป้ายชื่อคอกติดรั้วด้านในข้างประตู (ไม่กินพื้นที่ทางเดินนอกคอกที่บางช่วงแคบ)
    const off = p.gate === 'n' ? [4.6, 1.1] : p.gate === 's' ? [4.6, -1.1] : p.gate === 'w' ? [1.1, 4.6] : [-1.1, 4.6];
    add('zoosign', g.x + off[0], g.z + off[1], p.gate === 'n' ? R0 : p.gate === 's' ? R180 : p.gate === 'w' ? R90 : R270);
  }

  /* อาคาร */
  for (const b of BUILDINGS) {
    const [x0, x1, z0, z1] = b.box;
    const w = x1 - x0, d = z1 - z0;
    const g = gateOf(b.box, b.door);
    let k = 0;
    const next = () => b.items[k++ % b.items.length];
    if (b.dining) {
      // โต๊ะน้อยลงให้เดินสะดวก แล้วเติมของที่เป็นร้านจริง: เคาน์เตอร์ ตู้แช่ เครื่องชง ถังขยะ เมนู
      let seat = 0;
      for (let x = x0 + 4.6; x <= x1 - 4 && seat < 5; x += 5.2) {
        for (let z = z0 + 6.5; z <= z1 - 3.5 && seat < 5; z += 5.4) {   // เว้นแถวเคาน์เตอร์ด้านบน
          if (Math.hypot(x - g.x, z - g.z) < 4.5) continue;
          add('desk', +x.toFixed(2), +z.toFixed(2), R0);
          add('chair', +x.toFixed(2), +(z - 1.5).toFixed(2), R0);
          add('chair', +x.toFixed(2), +(z + 1.5).toFixed(2), R180);
          seat++;
        }
      }
      for (let x = x0 + 3.2; x <= x0 + 9; x += 2.2) add('desk', +x.toFixed(2), z0 + 2.2, R0);   // เคาน์เตอร์สั่ง
      add('fridge', x0 + 1.8, z1 - 2.4, R90);
      add('coffee', x0 + 3.4, z0 + 3.8); add('cup', x0 + 5, z0 + 3.8);
      add('tray', x0 + 6.6, z0 + 3.8); add('icebox', x0 + 8.4, z0 + 4);
      add('trashbin', x1 - 2.6, z0 + 2.4);
      continue;
    }
    if (b.museum) {
      /* จัดเป็นห้องนิทรรศการ: ตู้โชว์เรียงชิดผนังบนล่าง เว้นทางเดินกลางกว้าง
         ของจัดแสดงวางบนแท่นเป็นจุด ๆ ไม่กองเต็มห้อง */
      for (let x = x0 + 4; x <= x1 - 4; x += 5.5) {
        add('showcase', +x.toFixed(2), z0 + 2.2, R0);
        add(next(), +x.toFixed(2), z0 + 3.5, R0);
        add('showcase', +x.toFixed(2), z1 - 2.2, R180);
        add(next(), +x.toFixed(2), z1 - 3.5, R180);
      }
      // จุดเด่นกลางห้อง: โครงกระดูกตรงกลาง รูปปั้นสองข้าง
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      add('skeleton', mx, mz, R0);
      add('statue', mx - 5, mz, R0);
      add('statue', mx + 5, mz, R0);
      add('board', x1 - 2, mz, R270);
      continue;
    }
    // ร้านของที่ระลึก / ห้องน้ำ: ชั้นชิดผนังด้านที่ไม่ใช่ประตู + สินค้าหน้าชั้น
    for (const side of ['n', 's', 'w', 'e']) {
      if (side === b.door) continue;
      const along = side === 'n' || side === 's';
      if ((along ? w : d) < 9) continue;
      const fixed = side === 'n' ? z0 + 1.3 : side === 's' ? z1 - 1.3 : side === 'w' ? x0 + 1.3 : x1 - 1.3;
      const inner = side === 'n' ? z0 + 2.6 : side === 's' ? z1 - 2.6 : side === 'w' ? x0 + 2.6 : x1 - 2.6;
      const face = side === 'n' ? R0 : side === 's' ? R180 : side === 'w' ? R90 : R270;
      const s0 = (along ? x0 : z0) + 3, s1 = (along ? x1 : z1) - 3;
      const step = b.shelfStep || 1.4;
      if (!b.small) for (let t = s0; t <= s1 + 0.01; t += step) { if (along) add('shelf', +t.toFixed(2), fixed, face); else add('shelf', fixed, +t.toFixed(2), face); }
      for (let t = s0 + 0.4; t <= s1 - 0.4; t += 1.7) { if (along) add(next(), +t.toFixed(2), inner, face); else add(next(), inner, +t.toFixed(2), face); }
    }
    if (!b.small) add('desk', g.x + 4.8, g.z + (b.door === 'n' ? 2.6 : -2.6), R0);
  }

  /* ลานน้ำพุกลางสวน */
  add('fountain', 0, 0, R0);
  for (const [x, z, r] of [[-5, 0, R90], [5, 0, R270]]) add('bench', x, z, r);
  for (const [x, z] of [[-5, -5], [5, 5]]) add('flowerbed', x, z);
  for (const [x, z] of [[-8, -8], [8, 8]]) add('lamppost', x, z);

  /* ต้นไม้ริมทางเดิน จัดเป็นแนวสองฝั่งทางเดินหลัก ไม่กระจายทั่ว */
  for (const z of [-28, 16]) { add('tree', -28, z); add('tree', 1.5, z + 4); }
  // รถเข็นขายของ ตู้ขายตั๋ว ลูกโป่ง หน้าทางเข้า
  add('ticketbooth', -12, 33.5, R0); add('ticketbooth', 12, 33.5, R0);
  add('zoocart', -11, 30.5, R0); add('zoocart', 11, 30.5, R180);
  add('mapsign', -7, 30, R0); add('mapsign', 7, 30, R0);
  add('hydrant', 52, 20); add('hydrant', -52, 24);
  add('barrel', -34, -19); add('barrel', 30, -18); add('wheelbarrow', 36, 12, R90);
  add('mushroom', -6, -16); add('mushroom', -4.6, -16.8);

  /* ของตามทางเดิน — วางเองเฉพาะจุดที่มีเหตุผล ไม่เติมอัตโนมัติทุกช่วง
     หลักการ: ทางเดินหลักโล่ง มีแค่ม้านั่ง ถังขยะ เสาไฟ ป้ายแผนที่ เว้นระยะห่าง ๆ
              ของประเภทเดียวกันรวมเป็นกลุ่ม อุปกรณ์สวนอยู่ใกล้คอก อาหารอยู่ใกล้ร้าน
              ป้ายมีเฉพาะจุดตัดทาง */
  const WALK_PROPS = [
    // ทางเดินบน (หน้าคอกสัตว์แถวบน) — ม้านั่งกับถังขยะเป็นระยะ
    [-38, -19, 'bench'], [-34.5, -19, 'trashbin'],
    [12, -19, 'bench'], [15.5, -19, 'trashbin'],
    [-14, -19.6, 'lamppost'], [30, -19.6, 'lamppost'],
    // อุปกรณ์ดูแลสวนอยู่ใกล้คอก รวมเป็นกลุ่มเดียว
    [30.5, -25, 'toolbox'], [30.5, -26.8, 'barrel'], [30.5, -28.6, 'wheelbarrow'],
    [30.5, -30.4, 'bucket'], [29.2, -27.6, 'broom'],
    // ทางเดินกลาง (ระหว่างลานน้ำพุกับคอกฝั่งขวา)
    [-20, 11, 'bench'], [-16.5, 11, 'trashbin'],
    [-24, 11.8, 'lamppost'], [24, 11.8, 'lamppost'],
    // ป้ายแผนที่เฉพาะจุดตัดทาง
    [-26.4, -11, 'mapsign'], [4.6, 12.5, 'mapsign'], [33.4, 12.5, 'mapsign'],
    // สวนหย่อมริมทาง รวมเป็นกลุ่ม ไม่กระจาย
    [-18, 20, 'flowerbed'], [-16.4, 20, 'flowerbed'], [-14.8, 20, 'flowerbed'],
    [-6, -30, 'tree'], [-4, -32.5, 'tree'],
    [-8, 18, 'tree'], [8, 18, 'tree'],
    [-2, 16, 'mushroom'], [-0.6, 16.8, 'mushroom'],
    // หน้าทางเข้า (Plaza) — ของเยอะได้ แต่กระจุกตรงนี้เท่านั้น
    [-12, 33.5, 'ticketbooth'], [12, 33.5, 'ticketbooth'],
    [-11, 30.5, 'zoocart'], [16, 30.5, 'zoocart'],
    [-7, 30, 'mapsign'], [7, 30, 'mapsign'],
    [-3, 28, 'balloon'], [3, 28, 'balloon'],
    [-20, 33, 'bench'], [20, 33, 'bench'],
    [-23.5, 33, 'trashbin'], [23.5, 33, 'trashbin'],
    [-16, 36.2, 'flowerbed'], [-14.4, 36.2, 'flowerbed'], [16, 36.2, 'flowerbed'],
    // หัวจ่ายน้ำดับเพลิงอยู่นอกอาคารตามจริง
    [-52.5, 24, 'hydrant'], [52.5, 20, 'hydrant'],
  ];
  const wallsW = buildWalls();
  const clearOfWall = (x, z, r) => !wallsW.some((w) => x + r > w.x - 0.3 && x - r < w.x + w.w + 0.3 && z + r > w.z - 0.3 && z - r < w.z + w.d + 0.3);
  const insideBox = (x, z) => PENS.concat(BUILDINGS).some((b) => x > b.box[0] - 0.8 && x < b.box[1] + 0.8 && z > b.box[2] - 0.8 && z < b.box[3] + 0.8);
  for (const [x, z, t] of WALK_PROPS) {
    if (insideBox(x, z)) continue;
    if (!clearOfWall(x, z, 0.9)) continue;
    if (P.some((q) => Math.hypot(q.x - x, q.z - z) < 1.5)) continue;
    add(t, x, z, 0);
  }

  return P;
}

/* จุดเดินตั้งต้นให้บอทตามทางเดินหลักและหน้าประตูทุกคอก */
function seeds() {
  const s = [];
  for (let x = -50; x <= 50; x += 4) { s.push([x, -18]); s.push([x, 11]); s.push([x, 26]); }
  for (let z = -36; z <= 36; z += 4) { s.push([-29, z]); s.push([2, z]); s.push([36, z]); }
  // จุดหน้าและหลังประตูทุกบาน (ห่างแนวรั้ว 1.3 ม.) ให้เส้นทางลอดประตูได้
  const gateSeeds = (box, side) => {
    const g = gateOf(box, side);
    const along = side === 'n' || side === 's';
    for (const off of [-1.3, 1.3]) s.push(along ? [g.x, g.z + off] : [g.x + off, g.z]);
  };
  for (const p of PENS) gateSeeds(p.box, p.gate);
  for (const b of BUILDINGS) gateSeeds(b.box, b.door);
  return s;
}

/* โซนบรรยากาศของจุดหนึ่ง ๆ ใช้ทั้งตอนวางของและตอนเติมของอัตโนมัติ
   จะได้ไม่มีป๊อปคอร์นไปโผล่หลังคอกสิงโต */
function areaAt(x, z) {
  if (z > 24) return 'entrance';
  if (z > 14 && x < -6) return 'food';
  if (Math.abs(x) < 14 && Math.abs(z) < 16) return 'garden';
  if (z < -12) return 'animal';
  if (x > 28) return 'service';
  return 'garden';
}

/* ของชนิดไหนควรอยู่โซนบรรยากาศไหน (ชนิดที่ไม่อยู่ในตารางนี้วางที่ไหนก็ได้) */
const AREA_OF = {
  popcorn: ['entrance', 'food'], slushie: ['entrance', 'food'], icecream: ['entrance', 'food'],
  tray: ['entrance', 'food'], cup: ['entrance', 'food'], icebox: ['entrance', 'food'],
  ticketbooth: ['entrance'], balloon: ['entrance'], zoocart: ['entrance', 'food'],
  plushlion: ['entrance', 'food'], plushpanda: ['entrance', 'food'], zoocap: ['entrance', 'food'],
  toolbox: ['service'], broom: ['service'], wheelbarrow: ['service', 'animal'],
  barrel: ['service', 'animal'], feeder: ['animal', 'service'], hay: ['animal', 'service'],
  flowerbed: ['garden', 'entrance'], mushroom: ['garden'], bamboo: ['garden', 'animal'],
  sink: ['entrance', 'food'], soapbox: ['entrance', 'food'],
};

module.exports = { MAP_W, MAP_D, buildWalls, buildProps, seeds, PENS, BUILDINGS, FENCE_H, gateOf, areaAt, AREA_OF };
