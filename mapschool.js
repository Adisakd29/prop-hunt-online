'use strict';

/* ด่านโรงเรียน 78 x 54 เมตร — Compact Arena แบบเดียวกับที่รีวิวแนะนำ
   อาคารเรียนรูปตัว U ล้อมลานหน้าเสาธง มีสนามบาสด้านหลัง
   12 โซนต่อกันเป็นวง ทางเดินกว้าง 4 ม. ทุกห้องมีประตูหันเข้าโถงกลาง */

const MAP_W = 78;
const MAP_D = 54;
const T = 0.7;
const WALL_H = 3.4;
const R0 = 0, R90 = Math.PI / 2, R180 = Math.PI, R270 = -Math.PI / 2;

/* กรอบโซน [x0, x1, z0, z1] ในพิกัดกลางแมป (x -39..39, z -27..27) */
const ROOMS = [
  // แถวบน z 8..24 — ห้องเรียนสามห้อง ประตูเปิดลงโถง z 4..8
  { id: 'class1', name: 'ห้องเรียน 1', box: [-35, -19, 8, 24], door: 'n', color: '#e8eedd', kind: 'class' },
  { id: 'class2', name: 'ห้องเรียน 2', box: [-15, 1, 8, 24], door: 'n', color: '#e3ecf5', kind: 'class' },
  { id: 'lab', name: 'ห้องวิทยาศาสตร์', box: [5, 23, 8, 24], door: 'n', color: '#dff0e8', kind: 'lab' },
  { id: 'music', name: 'ห้องดนตรี', box: [27, 35, 8, 24], door: 'w', color: '#f2e3f5', kind: 'music' },
  // แถวกลาง z -8..4 คือโถงกลาง (เปิด) มีล็อกเกอร์กับที่กดน้ำ
  { id: 'hall', name: 'โถงกลาง', box: [-35, 25, -8, 4], door: null, color: '#e6e2d8', kind: 'open' },
  // แถวล่าง z -24..-12 — ห้องสมุด โรงอาหาร ห้องพัสดุ ห้องน้ำ ประตูเปิดขึ้นโถง
  { id: 'library', name: 'ห้องสมุด', box: [-35, -17, -24, -12], door: 's', color: '#f0e6d2', kind: 'library' },
  { id: 'canteen', name: 'โรงอาหาร', box: [-13, 9, -24, -12], door: 's', color: '#ecd9c6', kind: 'canteen' },
  { id: 'store', name: 'ห้องพัสดุ', box: [13, 23, -24, -16], door: 's', color: '#c9c2b6', kind: 'store' },
  { id: 'toilet', name: 'ห้องน้ำ', box: [27, 35, -24, -16], door: 's', color: '#d5e0e6', kind: 'toilet' },
  // ฝั่งซ้ายบน + ขวาล่าง
  { id: 'office', name: 'ห้องพักครู', box: [-35, -25, -8, 4], door: 'e', color: '#e5ded0', kind: 'office' },
  { id: 'gym', name: 'สนามบาส', box: [27, 37, -12, 4], door: 'w', color: '#d8a66a', kind: 'gym' },
  { id: 'yard', name: 'ลานหน้าเสาธง', box: [-19, 9, -10, -8.5], door: null, color: '#cfcabf', kind: 'open' },
];

/* ห้องที่อยู่ชิดรั้ว: ขยายขอบห้องให้ชนรั้วพอดี แล้วใช้รั้วเป็นผนังหลังห้อง
   (เดิมข้ามการสร้างผนังด้านนั้นแต่ห้องยังห่างรั้ว 3 ม. เลยเดินทะลุหลังห้องออกไปได้) */
const NEAR_EDGE = 3.6;
const INNER_X = MAP_W / 2 - T, INNER_Z = MAP_D / 2 - T;
for (const r of ROOMS) {
  if (!r.door) continue;
  if (r.box[0] < -INNER_X + NEAR_EDGE) r.box[0] = -INNER_X;
  if (r.box[1] > INNER_X - NEAR_EDGE) r.box[1] = INNER_X;
  if (r.box[2] < -INNER_Z + NEAR_EDGE) r.box[2] = -INNER_Z;
  if (r.box[3] > INNER_Z - NEAR_EDGE) r.box[3] = INNER_Z;
}

function buildWalls() {
  const out = [];
  const h = (x1, x2, z, hh) => { if (x2 - x1 > 0.05) out.push({ x: x1, z: z - T / 2, w: x2 - x1, d: T, h: hh }); };
  const v = (x, z1, z2, hh) => { if (z2 - z1 > 0.05) out.push({ x: x - T / 2, z: z1, w: T, d: z2 - z1, h: hh }); };

  // รั้วรอบโรงเรียน
  h(-MAP_W / 2, MAP_W / 2, -MAP_D / 2 + T / 2, 4);
  h(-MAP_W / 2, MAP_W / 2, MAP_D / 2 - T / 2, 4);
  v(-MAP_W / 2 + T / 2, -MAP_D / 2, MAP_D / 2, 4);
  v(MAP_W / 2 - T / 2, -MAP_D / 2, MAP_D / 2, 4);

  for (const r of ROOMS) {
    if (!r.door) continue;                       // โถงกลางกับลานไม่มีผนัง
    const [x0, x1, z0, z1] = r.box;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const g = 1.8;                               // ประตูกว้าง 3.6 ม.
    // ด้านที่ชนรั้วพอดี ใช้รั้วเป็นผนังแทน ด้านอื่นสร้างผนังครบทุกด้าน
    const eN = Math.abs(z0 + INNER_Z) < 0.01, eS = Math.abs(z1 - INNER_Z) < 0.01;
    const eW = Math.abs(x0 + INNER_X) < 0.01, eE = Math.abs(x1 - INNER_X) < 0.01;
    if (!eN) { if (r.door === 'n') { h(x0, cx - g, z0, WALL_H); h(cx + g, x1, z0, WALL_H); } else h(x0, x1, z0, WALL_H); }
    if (!eS) { if (r.door === 's') { h(x0, cx - g, z1, WALL_H); h(cx + g, x1, z1, WALL_H); } else h(x0, x1, z1, WALL_H); }
    if (!eW) { if (r.door === 'w') { v(x0, z0, cz - g, WALL_H); v(x0, cz + g, z1, WALL_H); } else v(x0, z0, z1, WALL_H); }
    if (!eE) { if (r.door === 'e') { v(x1, z0, cz - g, WALL_H); v(x1, cz + g, z1, WALL_H); } else v(x1, z0, z1, WALL_H); }
  }
  return out;
}

function buildProps() {
  const P = [];
  const SZ = require('./maplayout').PROP_SIZE;
  const rad = (t) => (SZ[t] ? SZ[t][1] : 0.5);
  const add = (t, x, z, ry) => { P.push({ t, x: +x.toFixed(2), z: +z.toFixed(2), ry: ry || 0 }); return P[P.length - 1]; };
  const slot = new Map();
  /* วางของชิ้นเล็กบนผิวบนของเฟอร์นิเจอร์ */
  const on = (base, t) => {
    const k = base.x + ',' + base.z;
    const u = slot.get(k) || 0;
    if (u >= 3) return;
    slot.set(k, u + 1);
    const oa = [0, -0.6, 0.6][u];
    const a = base.ry || 0;
    P.push({ t, x: +(base.x + Math.cos(a) * oa).toFixed(2), z: +(base.z - Math.sin(a) * oa).toFixed(2),
      ry: a, y: +(SZ[base.t] ? SZ[base.t][0] : 0.8).toFixed(2) });
  };
  const doorPt = (r) => {
    const [x0, x1, z0, z1] = r.box, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    return r.door === 'n' ? { x: cx, z: z0 } : r.door === 's' ? { x: cx, z: z1 }
      : r.door === 'w' ? { x: x0, z: cz } : { x: x1, z: cz };
  };
  /* วางบนพื้น: เว้นขอบห้อง เว้นประตู 3.6 ม. และไม่ทับของเดิม */
  const put = (r, t, x, z, ry, pad) => {
    const [x0, x1, z0, z1] = r.box;
    const m = rad(t) + 0.7;
    if (x < x0 + m || x > x1 - m || z < z0 + m || z > z1 - m) return null;
    if (r.door) { const d = doorPt(r); if (Math.hypot(x - d.x, z - d.z) < 3.6) return null; }
    const gap = pad === undefined ? 0.55 : pad;
    if (P.some((q) => !(q.y > 0.05) && Math.hypot(q.x - x, q.z - z) < (rad(t) + rad(q.t)) * 0.66 + gap)) return null;
    return add(t, x, z, ry);
  };

  for (const r of ROOMS) {
    const [x0, x1, z0, z1] = r.box;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

    if (r.kind === 'class') {
      // กระดานดำหน้าห้อง โต๊ะนักเรียนเรียงเป็นตาราง เก้าอี้คู่ทุกตัว
      const front = r.door === 'n' ? z1 - 1.2 : z0 + 1.2;
      const face = r.door === 'n' ? R180 : R0;
      add('blackboard', cx, front, face);
      add('podium', cx + 4, front - (r.door === 'n' ? 1.8 : -1.8), face);
      const td = add('teacherdesk', cx - 4.5, front - (r.door === 'n' ? 2 : -2), face);
      on(td, 'bookstack'); on(td, 'chalkbox');
      const dz = r.door === 'n' ? -1 : 1;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const x = x0 + 3 + col * 3.4;
          const z = front + dz * (4 + row * 3.2);
          const d = put(r, 'schooldesk', x, z, face);
          if (d) { on(d, row % 2 ? 'bookstack' : 'notebook'); put(r, 'schoolchair', x, z - dz * 1.2, face, 0.25); }
        }
      }
      const bb = P.find((q) => q.t === 'blackboard' && Math.abs(q.x - cx) < 0.1);
      if (bb) { on(bb, 'chalkbox'); }
      put(r, 'schoolbin', x1 - 1.6, front + dz * 1.6, 0);
      put(r, 'bookshelf', x0 + 1.4, cz, R90);
      put(r, 'potplant', x0 + 1.4, z1 - 2, 0);
      // พัดลมตั้งพื้นสองมุม นาฬิกาบนชั้น โปรเจกเตอร์บนโต๊ะครู
      put(r, 'standfan', x0 + 1.6, front + dz * 2.4, 0, 0.3);
      put(r, 'standfan', x1 - 1.6, front + dz * 6, 0, 0.3);
      const sh2 = P.filter((q) => q.t === 'bookshelf' && q.x > x0 && q.x < x1 && q.z > z0 && q.z < z1);
      if (sh2[0]) { on(sh2[0], 'bookstack'); on(sh2[0], 'globe'); }
      add('clocksign', cx - 3.5, front, face);          // นาฬิกาแขวนเหนือกระดาน
      // กระเป๋านักเรียนวางข้างโต๊ะบางตัว
      const desks = P.filter((q) => q.t === 'schooldesk' && q.x > x0 && q.x < x1 && q.z > z0 && q.z < z1);
      desks.forEach((q, i2) => { if (i2 % 4 === 1) put(r, 'schoolbag', q.x + 1.1, q.z, 0, 0.2); });
    } else if (r.kind === 'lab') {
      // โต๊ะแล็บเป็นเกาะ มีอุปกรณ์บนโต๊ะ
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          const t2 = put(r, 'labtable', x0 + 4.5 + j * 8, z0 + 4 + i * 4.5, R0);
          if (t2) { on(t2, 'microscope'); on(t2, i % 2 ? 'globe' : 'bookstack'); }
        }
      }
      add('blackboard', cx, z1 - 1.2, R180);
      put(r, 'bookshelf', x1 - 1.5, cz, R270);
      for (let i2 = 0; i2 < 3; i2++) put(r, 'watercooler', x0 + 1.5, cz - 1.6 + i2 * 1.6, R90, 0.2);
      put(r, 'schoolbin', x1 - 1.8, z0 + 2, 0);
      put(r, 'standfan', x0 + 1.6, z0 + 2.2, 0, 0.3);
      put(r, 'binset', x1 - 2.2, z1 - 2.6, 0, 0.3);
      const lt = P.filter((q) => q.t === 'labtable' && q.x > x0 && q.x < x1 && q.z > z0 && q.z < z1);
      if (lt[0]) on(lt[0], 'projector');
    } else if (r.kind === 'music') {
      add('piano', cx, z1 - 3, R180);
      for (let i = 0; i < 4; i++) put(r, 'schoolchair', x0 + 2 + i * 1.7, cz, R0);
      for (let i = 0; i < 3; i++) put(r, 'schoolchair', x0 + 2.8 + i * 1.7, cz - 2, R0);
      put(r, 'bookshelf', x0 + 1.4, z0 + 3, R90);
      put(r, 'schoolbin', x1 - 1.6, z0 + 2, 0);
      put(r, 'benchlong', cx, z0 + 2.4, R0, 0.3);
      put(r, 'standfan', x1 - 1.6, cz + 2, 0, 0.3);
    } else if (r.kind === 'library') {
      // ชั้นหนังสือเรียงเป็นแนว โต๊ะอ่านหนังสือกลางห้อง
      for (let i = 0; i < 3; i++) {
        for (let x = x0 + 3; x <= x1 - 3; x += 1.5) put(r, 'bookshelf', x, z0 + 2.2 + i * 3.4, R0, 0.15);
      }
      for (let i = 0; i < 2; i++) {
        const d = put(r, 'teacherdesk', x0 + 5 + i * 6, z1 - 3, R0);
        if (d) { on(d, 'bookstack'); on(d, 'lamp'); put(r, 'schoolchair', x0 + 5 + i * 6, z1 - 4.4, R0, 0.25); }
      }
      put(r, 'globe', x1 - 2, z1 - 2.4, 0);
      put(r, 'schoolbin', x0 + 1.8, z1 - 2, 0);
      put(r, 'noticeboard', x1 - 2.2, z0 + 2.2, R0, 0.3);
      put(r, 'standfan', x0 + 1.8, z0 + 2.2, 0, 0.3);
    } else if (r.kind === 'canteen') {
      // โต๊ะยาวเป็นแถว เก้าอี้สองฝั่ง เคาน์เตอร์อาหารชิดผนัง
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          const x = x0 + 5 + j * 9, z = z0 + 3 + i * 3.6;
          const d = put(r, 'teacherdesk', x, z, R0);
          if (d) { on(d, i % 2 ? 'lunchtray' : 'plate'); put(r, 'schoolchair', x - 1.5, z, R90, 0.25); put(r, 'schoolchair', x + 1.5, z, R270, 0.25); }
        }
      }
      for (let x = x1 - 5; x >= x1 - 8; x -= 1.5) put(r, 'teacherdesk', x, z1 - 1.6, R180, 0.2);
      put(r, 'fridge', x1 - 1.8, z1 - 3, R270);
      put(r, 'binset', x0 + 2.4, z1 - 2, 0, 0.3);
      put(r, 'waterjar', x0 + 1.9, z0 + 2.2, 0, 0.1);
      put(r, 'waterjar', x0 + 3.1, z0 + 2.2, 0, 0.1);
      put(r, 'benchlong', cx, z1 - 2.4, R0, 0.3);
      put(r, 'standfan', x1 - 1.8, z0 + 2.2, 0, 0.3);
    } else if (r.kind === 'store') {
      for (const [bx, bz] of [[x0 + 2.2, z0 + 2.2], [x1 - 2.6, z0 + 2.2], [x0 + 2.2, z1 - 2.6]]) {
        for (const [ox, oz] of [[0, 0], [1, 0], [0, 1]]) put(r, 'schoolbag', bx + ox, bz + oz, 0, 0.15);
      }
      put(r, 'rack', x1 - 1.5, cz, R270);
      put(r, 'barrel', x1 - 3, z1 - 2.4, 0);
      put(r, 'broom', x0 + 4.6, z1 - 2.2, 0, 0.1);
      put(r, 'broom', x0 + 5.5, z1 - 2.2, 0, 0.1);
      put(r, 'moppail', x0 + 6.4, z1 - 2.2, 0, 0.1);
      put(r, 'moppail', x0 + 7.3, z1 - 2.2, 0, 0.1);
      put(r, 'basket', x1 - 4.2, z0 + 2.2, 0, 0.1);
      put(r, 'basket', x1 - 5.1, z0 + 2.2, 0, 0.1);
      for (let i2 = 0; i2 < 4; i2++) put(r, 'conesport', x0 + 4.5 + i2 * 0.8, z0 + 2.2, 0, 0.12);
      put(r, 'shoerack', cx, z1 - 2.4, R0, 0.3);
    } else if (r.kind === 'toilet') {
      for (let x = x0 + 2; x <= x1 - 2; x += 1.5) put(r, 'watercooler', x, z0 + 1.3, R0, 0.15);
      put(r, 'schoolbin', x1 - 1.6, z1 - 1.8, 0);
      put(r, 'moppail', x0 + 1.6, z1 - 1.8, 0);
      put(r, 'broom', x0 + 1.6, z1 - 3, 0, 0.1);
      put(r, 'broom', x0 + 2.5, z1 - 3, 0, 0.1);
      put(r, 'moppail', x0 + 2.5, z1 - 1.8, 0, 0.1);
      put(r, 'basket', x1 - 1.6, z1 - 3.2, 0);
      put(r, 'schoolbag', x0 + 3.2, z1 - 1.8, 0);
      put(r, 'waterjar', x0 + 1.7, z1 - 1.9, 0, 0.1);
    } else if (r.kind === 'office') {
      for (let i = 0; i < 3; i++) {
        const d = put(r, 'teacherdesk', cx, z0 + 2.6 + i * 3.4, R0);
        if (d) { on(d, 'bookstack'); on(d, 'notebook'); put(r, 'schoolchair', cx, z0 + 1.4 + i * 3.4, R0, 0.25); }
      }
      put(r, 'bookshelf', x0 + 1.4, z1 - 2.5, R90);
      put(r, 'potplant', x0 + 1.4, z0 + 2, 0);
      put(r, 'schoolbin', x1 - 1.6, z1 - 2, 0);
      put(r, 'noticeboard', x1 - 1.8, z0 + 2.4, R270, 0.3);
      put(r, 'standfan', x0 + 1.6, cz + 1, 0, 0.3);
      put(r, 'schoolbag', x1 - 1.8, cz, 0, 0.25);
    } else if (r.kind === 'gym') {
      add('hoop', cx, z0 + 1.6, R0);
      add('hoop', cx, z1 - 1.6, R180);
      for (const [bx, bz] of [[x0 + 2, cz - 3], [x0 + 2.9, cz - 3], [x0 + 2, cz - 2.2],
        [x1 - 2, cz + 3], [x1 - 2.8, cz + 3], [x0 + 2.6, cz + 5]]) put(r, 'basketball', bx, bz, 0, 0.1);
      put(r, 'benchlong', x0 + 1.7, cz, R90, 0.3);
      put(r, 'benchlong', x1 - 1.7, cz - 4, R270, 0.3);
      put(r, 'schoolbin', x1 - 1.6, z0 + 2.2, 0);
      for (let i2 = 0; i2 < 4; i2++) put(r, 'conesport', x0 + 2.4 + i2 * 1.4, z1 - 2.4, 0, 0.12);
      put(r, 'binset', x1 - 2.2, z1 - 2.4, 0, 0.3);
    } else if (r.id === 'hall') {
      // โถงกลาง: ล็อกเกอร์ชิดผนังสองฝั่ง ที่กดน้ำ กระถาง ม้านั่ง
      // ล็อกเกอร์ชิดผนัง เว้นช่องหน้าประตูห้องพักครู (x -25) กับกลางโถง (ป้ายประกาศ)
      for (let x = -31; x <= 19; x += 6) {
        if (Math.abs(x - (-25)) < 3 || Math.abs(x) < 3) continue;
        add('lockerbay', x, z0 + 1.2, R0);
      }
      for (const x of [-16, 8, 22]) add('waterfountain', x, z0 + 1.2, R0);
      for (let x = -28; x <= 20; x += 9) add('benchlong', x, z1 - 1.8, R180);
      for (const x of [-24, -6, 12, 22]) add('potplant', x, z1 - 3.2, 0);
      add('noticeboard', 0, z0 + 1.2, R0);
      add('noticeboard', -30, z1 - 1.4, R180);
      add('noticeboard', 24, z1 - 1.4, R180);
      add('binset', -16, z1 - 1.4, R180);
      add('binset', 20, z1 - 1.4, R180);
      add('binset', 2, z1 - 1.4, R180);
      for (const x of [-34, -3, 10]) add('shoerack', x, z1 - 1.5, R180);
      for (const x of [-31, 21]) add('waterjar', x, z1 - 1.5, R180);
      for (const x of [-22, 2, 20]) add('clocksign', x, z0 + 1.3, R0);
      for (const x of [-28, -8, 16]) add('schoolbag', x, z1 - 3.4, 0);
      add('standfan', -20, z1 - 3.4, 0);
      add('standfan', 14, z1 - 3.4, 0);
      add('standfan', 4, z1 - 3.4, 0);
    } else if (r.id === 'yard') {
      // ลานหน้าเสาธง
      add('flagpole', -5, -9.2, R0);
      add('podium', -1, -9.2, R0);
      for (const x of [-14, -10, 4]) add('potplant', x, -9.2, 0);
      add('benchlong', -17, -9.2, R0);
      add('benchlong', 8, -9.2, R0);
      for (const x of [-12, -8, 1, 5]) add('conesport', x, -9.9, 0);
    }
  }
  return P;
}

function seeds() {
  const s = [];
  for (let x = -34; x <= 34; x += 3) { s.push([x, -2]); s.push([x, 2]); }   // โถงกลาง
  for (let x = -18; x <= 8; x += 3) s.push([x, -9.2]);                      // ลานเสาธง
  for (const r of ROOMS) {
    if (!r.door) continue;
    const [x0, x1, z0, z1] = r.box, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (r.door === 'n') { s.push([cx, z0 - 1.6]); s.push([cx, z0 + 1.6]); s.push([cx, cz]); }
    if (r.door === 's') { s.push([cx, z1 + 1.6]); s.push([cx, z1 - 1.6]); s.push([cx, cz]); }
    if (r.door === 'w') { s.push([x0 - 1.6, cz]); s.push([x0 + 1.6, cz]); s.push([cx, cz]); }
    if (r.door === 'e') { s.push([x1 + 1.6, cz]); s.push([x1 - 1.6, cz]); s.push([cx, cz]); }
  }
  for (let z = -24; z <= 24; z += 3) { s.push([-37, z]); s.push([25, z]); }
  for (let x = -36; x <= 36; x += 3) { s.push([x, 26]); s.push([x, -26]); }
  return s;
}

module.exports = { MAP_W, MAP_D, buildWalls, buildProps, seeds, ROOMS };
