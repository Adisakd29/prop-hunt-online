import * as THREE from './vendor/three.module.js';
import { PROP_PARTS, PROP_INFO, PROP_TYPES } from './propdata.js';

export { PROP_PARTS, PROP_INFO, PROP_TYPES };

/* โมเดลทุกอย่างประกอบจากกล่อง แล้วถูก "รวม" เป็น geometry ชิ้นเดียวต่อชนิด
   พร้อมสีฝังในตัว vertex ทำให้เฟอร์นิเจอร์ทั้งด่านวาดได้ด้วย draw call ไม่กี่ครั้ง
   แทนที่จะเป็นหลักพันเหมือนตอนแยกเป็น mesh ย่อย ๆ

   หน่วยเป็นเมตร ฐานอยู่ที่ y = 0 หน้าหันไปทาง +Z
   part = { w, h, d, c, x, y, z } โดย y คือกึ่งกลางกล่อง */

/* ------------------------------------------------------------------ */
/* ตัวช่วยรวม geometry                                                  */
/* ------------------------------------------------------------------ */

export const vertexColorMat = new THREE.MeshLambertMaterial({ vertexColors: true });

export function mergeBoxes(parts) {
  const chunks = [];
  let total = 0;
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.w, p.h, p.d).toNonIndexed();
    g.translate(p.x || 0, p.y || 0, p.z || 0);
    const col = new THREE.Color().setHex(p.c, THREE.SRGBColorSpace);
    chunks.push({ g, col });
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const c of chunks) {
    const n = c.g.attributes.position.count;
    pos.set(c.g.attributes.position.array, o * 3);
    nor.set(c.g.attributes.normal.array, o * 3);
    for (let i = 0; i < n; i++) {
      col[(o + i) * 3] = c.col.r;
      col[(o + i) * 3 + 1] = c.col.g;
      col[(o + i) * 3 + 2] = c.col.b;
    }
    o += n;
    c.g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/* ------------------------------------------------------------------ */
/* ข้อมูลของแต่ละชนิด                                                    */
/* ------------------------------------------------------------------ */

const B = (w, h, d, c, x, y, z) => ({ w, h, d, c, x: x || 0, y: y || 0, z: z || 0 });

const geoCache = new Map();

export function propGeometry(type) {
  if (!geoCache.has(type)) {
    geoCache.set(type, mergeBoxes(PROP_PARTS[type] || PROP_PARTS.soda));
  }
  return geoCache.get(type);
}

/* mesh เดี่ยว ใช้กับร่างของตัวเองและรูปตัวอย่างในเมนู */
export function makeProp(type) {
  const m = new THREE.Mesh(propGeometry(type), vertexColorMat);
  const info = PROP_INFO[type] || { h: 1, r: 0.6 };
  m.userData.h = info.h;
  m.userData.r = info.r;
  m.userData.type = type;
  return m;
}

/* ------------------------------------------------------------------ */
/* เงาใต้วัตถุ                                                          */
/* ------------------------------------------------------------------ */

export function shadowGeometry() {
  const g = new THREE.CircleGeometry(1, 12);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.02, 0);
  return g;
}

export const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x2a3444, transparent: true, opacity: 0.22, depthWrite: false,
});

/* ------------------------------------------------------------------ */
/* ตัวละคร                                                             */
/* ------------------------------------------------------------------ */

/* ทรงหมวก: cap = แก๊ปมีปีก, beanie = ไหมพรม, helmet = กันน็อก, band = ผ้าคาดหัว, none = ไม่ใส่ */
export const SKINS = {
  blue:   { name: 'ตำรวจน้ำเงิน', shirt: 0x2f4f8f, pants: 0x24406f, hat: 0x2f4f8f, skin: 0xf2c9a0, cap: 'cap' },
  green:  { name: 'หน่วยพราง',    shirt: 0x3f7d4f, pants: 0x2f5c3a, hat: 0x3f7d4f, skin: 0xe0a878, cap: 'cap' },
  red:    { name: 'หัวหน้าทีม',    shirt: 0xc0392b, pants: 0x8e2a20, hat: 0xc0392b, skin: 0xc98c5e, cap: 'cap' },
  purple: { name: 'สายลับม่วง',    shirt: 0x7d4fa8, pants: 0x5c3a7d, hat: 0x7d4fa8, skin: 0xf2c9a0, cap: 'cap' },
  gold:   { name: 'นายพลทอง',     shirt: 0xd4a017, pants: 0x9c7410, hat: 0xd4a017, skin: 0xe0a878, cap: 'cap' },
  dark:   { name: 'หน่วยกลางคืน',  shirt: 0x2b303b, pants: 0x1f232b, hat: 0x2b303b, skin: 0x8d5f3c, cap: 'cap' },
  guard:  { name: 'รปภ.ห้าง',      shirt: 0x3b4250, pants: 0x2b303b, hat: 0x1f232b, skin: 0xe0a878, cap: 'cap' },
  janitor:{ name: 'แม่บ้าน',       shirt: 0x4fb0a8, pants: 0x2f7d78, hat: 0xf2f4f7, skin: 0xf2c9a0, cap: 'band' },
  chef:   { name: 'พ่อครัว',       shirt: 0xf4f6f9, pants: 0x3b4250, hat: 0xffffff, skin: 0xe8bb8e, cap: 'beanie' },
  worker: { name: 'ช่างซ่อมบำรุง',  shirt: 0xf0902c, pants: 0x4a5464, hat: 0xf0c429, skin: 0xc98c5e, cap: 'helmet' },
  hoodie: { name: 'วัยรุ่นฮู้ด',    shirt: 0x6a5acd, pants: 0x2b303b, hat: 0x5548b0, skin: 0xf2c9a0, cap: 'beanie' },
  shopper:{ name: 'ขาช้อป',        shirt: 0xe8709a, pants: 0x5f6b7d, hat: 0xe8709a, skin: 0xf6d7b8, cap: 'none' },

  /* ---------- ชุดนักล่าปีศาจยุคไทโช (ออกแบบเองทั้งหมด ไม่อิงตัวละครจากเรื่องไหน) ----------
     ใช้ลายพื้นบ้านญี่ปุ่นที่หมดลิขสิทธิ์แล้ว: เซกาอิฮะ (คลื่น) อาซาโนฮะ (ใบป่าน)
     ยามามิจิ (ทางภูเขา) และคิกโค (กระดองเต่า) */
  slayerWave:  { name: 'นักล่าลายคลื่น', gender: 'm', shirt: 0x1f2430, pants: 0x161a23, skin: 0xe8bb8e,
    hat: 0x1f2430, cap: 'topknot', hair: 0x2a1c14, haori: 0x2f6f9f, haori2: 0xdff0ff, pattern: 'wave', katana: 0x3f9fd4 },
  slayerLeaf:  { name: 'นักล่าลายใบป่าน', gender: 'f', shirt: 0x1f2430, pants: 0x161a23, skin: 0xf6d7b8,
    hat: 0x1f2430, cap: 'ponytail', hair: 0x4a2f1c, haori: 0x3f8f5a, haori2: 0xe6f7e2, pattern: 'leaf', katana: 0x62c07a },
  slayerFlame: { name: 'นักล่าลายเปลวไฟ', gender: 'm', shirt: 0x1f2430, pants: 0x161a23, skin: 0xc98c5e,
    hat: 0x1f2430, cap: 'headband', hair: 0x1a1410, haori: 0xd4562c, haori2: 0xffd9a0, pattern: 'flame', katana: 0xf0902c },
  slayerSakura: { name: 'นักล่าลายซากุระ', gender: 'f', shirt: 0x1f2430, pants: 0x161a23, skin: 0xf2c9a0,
    hat: 0x1f2430, cap: 'bun', hair: 0x2a1c14, haori: 0xd9738f, haori2: 0xffe6ee, pattern: 'sakura', katana: 0xff9fc0 },
  slayerNight: { name: 'นักล่าลายราตรี', gender: 'm', shirt: 0x161a23, pants: 0x101319, skin: 0x8d5f3c,
    hat: 0x161a23, cap: 'oni', hair: 0x14100c, haori: 0x4a3f8f, haori2: 0xc9c2ff, pattern: 'tortoise', katana: 0x9f8fe0 },
  slayerMoon:  { name: 'นักล่าลายจันทรา', gender: 'f', shirt: 0x1f2430, pants: 0x161a23, skin: 0xe0a878,
    hat: 0x1f2430, cap: 'ponytail', hair: 0xc9b89a, haori: 0xe8d68a, haori2: 0x4a4230, pattern: 'wave', katana: 0xf2e6a0 },
};

export const SKIN_IDS = Object.keys(SKINS);

const charGeoCache = new Map();

/* หมวกแต่ละทรง ทำให้ตัวละครแต่ละแบบดูต่างกันจริง ๆ ไม่ใช่แค่เปลี่ยนสี */
function hatParts(s) {
  const style = s.cap || 'cap';
  if (style === 'none') return [];
  if (style === 'band') {
    return [
      B(0.54, 0.1, 0.54, s.hat, 0, 1.9, 0),
      B(0.12, 0.14, 0.12, s.hat, -0.2, 1.99, -0.18),
      B(0.12, 0.14, 0.12, s.hat, 0.2, 1.99, -0.18),
    ];
  }
  if (style === 'beanie') {
    return [
      B(0.56, 0.26, 0.56, s.hat, 0, 2.02, 0),
      B(0.58, 0.09, 0.58, s.hat, 0, 1.9, 0),
      B(0.16, 0.12, 0.16, s.hat, 0, 2.2, 0),
    ];
  }
  // ---- ทรงผมชุดนักล่าปีศาจ (ยุคไทโช) ----
  if (style === 'topknot') {           // ผมมัดจุกชาย
    return [
      B(0.54, 0.16, 0.54, s.hair, 0, 1.92, 0),
      B(0.56, 0.2, 0.1, s.hair, 0, 1.84, -0.24),
      B(0.2, 0.14, 0.2, s.hair, 0, 2.04, -0.06),
      B(0.13, 0.2, 0.13, s.hair, 0, 2.18, -0.1),
      B(0.16, 0.05, 0.16, 0x8a2b2b, 0, 2.06, -0.08),
      B(0.5, 0.08, 0.06, s.hair, 0, 1.86, 0.25),    // ผมหน้าม้า
    ];
  }
  if (style === 'ponytail') {          // ผมหางม้าหญิง
    return [
      B(0.54, 0.18, 0.54, s.hair, 0, 1.93, 0),
      B(0.5, 0.34, 0.12, s.hair, 0, 1.74, -0.23),
      B(0.52, 0.1, 0.08, s.hair, 0, 1.87, 0.25),
      B(0.16, 0.5, 0.16, s.hair, 0, 1.62, -0.34),   // หางม้า
      B(0.13, 0.22, 0.13, s.hair, 0, 1.34, -0.36),
      B(0.18, 0.07, 0.18, 0xd94f7a, 0, 1.86, -0.34),  // โบว์
      B(0.12, 0.3, 0.06, s.hair, -0.27, 1.72, 0.1),   // ผมข้างแก้ม
      B(0.12, 0.3, 0.06, s.hair, 0.27, 1.72, 0.1),
    ];
  }
  if (style === 'bun') {               // ผมมวยหญิง + ปิ่นปักผม
    return [
      B(0.54, 0.18, 0.54, s.hair, 0, 1.93, 0),
      B(0.5, 0.24, 0.12, s.hair, 0, 1.8, -0.23),
      B(0.52, 0.1, 0.08, s.hair, 0, 1.87, 0.25),
      B(0.26, 0.24, 0.26, s.hair, 0, 2.1, -0.1),     // มวยผม
      B(0.05, 0.34, 0.05, 0xd9a441, 0.16, 2.12, -0.1), // ปิ่น
      B(0.09, 0.09, 0.03, 0xe8709a, 0.22, 2.26, -0.1),
      B(0.12, 0.28, 0.06, s.hair, -0.27, 1.74, 0.1),
      B(0.12, 0.28, 0.06, s.hair, 0.27, 1.74, 0.1),
    ];
  }
  if (style === 'headband') {          // ผ้าคาดหัว
    return [
      B(0.54, 0.16, 0.54, s.hair, 0, 1.92, 0),
      B(0.56, 0.16, 0.1, s.hair, 0, 1.86, -0.24),
      B(0.56, 0.1, 0.56, 0xf2f4f7, 0, 1.84, 0),
      B(0.2, 0.1, 0.05, 0xc0271c, 0, 1.84, 0.28),    // วงกลมแดงกลางผ้า
      B(0.1, 0.34, 0.05, 0xf2f4f7, -0.22, 1.7, -0.26),  // ชายผ้า
      B(0.1, 0.3, 0.05, 0xf2f4f7, 0.22, 1.66, -0.26),
      B(0.5, 0.09, 0.06, s.hair, 0, 1.78, 0.25),
    ];
  }
  if (style === 'oni') {               // หน้ากากปีศาจเลื่อนขึ้นไว้บนหัว
    return [
      B(0.54, 0.16, 0.54, s.hair, 0, 1.92, 0),
      B(0.56, 0.22, 0.1, s.hair, 0, 1.82, -0.24),
      B(0.46, 0.34, 0.16, 0xf2ead8, 0, 2.06, 0.14),
      B(0.4, 0.05, 0.03, 0xc0271c, 0, 2.14, 0.23),
      B(0.1, 0.07, 0.03, 0x2b303b, -0.12, 2.02, 0.23),
      B(0.1, 0.07, 0.03, 0x2b303b, 0.12, 2.02, 0.23),
      B(0.08, 0.16, 0.08, 0xe8e0c8, -0.17, 2.28, 0.1),   // เขา
      B(0.08, 0.16, 0.08, 0xe8e0c8, 0.17, 2.28, 0.1),
    ];
  }
  if (style === 'helmet') {
    return [
      B(0.58, 0.3, 0.58, s.hat, 0, 2.04, 0),
      B(0.62, 0.08, 0.4, s.hat, 0, 1.92, 0.16),
      B(0.18, 0.2, 0.06, 0xf2f4f7, 0, 2.06, 0.3),
    ];
  }
  return [
    B(0.54, 0.16, 0.54, s.hat, 0, 2.0, 0),
    B(0.5, 0.06, 0.24, s.pants, 0, 1.92, 0.3),
    B(0.14, 0.1, 0.02, 0xf0c04a, 0, 2.02, 0.28),
  ];
}

/* ปรับสีให้สว่าง/เข้มขึ้น ใช้ทำเงาและไฮไลต์โดยไม่ต้องเพิ่มวัสดุใหม่ (คง instancing ไว้) */
function shade(hex, amt) {
  const r = (hex >> 16) & 255, g2 = (hex >> 8) & 255, b = hex & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return (f(r) << 16) | (f(g2) << 8) | f(b);
}

/* ฮาโอริ (เสื้อคลุมนอก) พร้อมลายพื้นบ้านญี่ปุ่น — วาดด้วยกล่องบาง ๆ ทาบบนตัว
   ลายที่ใช้เป็นลายโบราณที่หมดลิขสิทธิ์แล้ว ไม่ได้ลอกลายของตัวละครเรื่องใด */
function haoriParts(s) {
  if (!s.haori) return [];
  const a = s.haori, b = s.haori2, out = [];
  // ตัวเสื้อคลุม คลุมไหล่ลงมาถึงสะโพก
  out.push(B(0.62, 0.62, 0.36, a, 0, 1.06, 0));
  out.push(B(0.64, 0.08, 0.38, shade(a, -0.12), 0, 1.35, 0));      // ไหล่
  out.push(B(0.16, 0.66, 0.02, b, -0.2, 1.06, 0.19));              // สาบหน้าซ้าย
  out.push(B(0.16, 0.66, 0.02, b, 0.2, 1.06, 0.19));               // สาบหน้าขวา
  out.push(B(0.64, 0.07, 0.38, shade(a, -0.2), 0, 0.76, 0));       // ชายเสื้อ
  out.push(B(0.66, 0.05, 0.4, b, 0, 0.8, 0));                      // ขลิบชาย

  const pat = s.pattern || 'wave';
  const back = -0.19, front = 0.19;
  if (pat === 'wave') {             // เซกาอิฮะ — คลื่นซ้อน
    for (let i = 0; i < 3; i++) {
      const y = 0.92 + i * 0.16;
      out.push(B(0.5, 0.05, 0.02, b, 0, y, back));
      out.push(B(0.2, 0.05, 0.02, b, -0.18, y + 0.06, back));
      out.push(B(0.2, 0.05, 0.02, b, 0.18, y + 0.06, back));
    }
  } else if (pat === 'leaf') {      // อาซาโนฮะ — ใบป่าน (สามเหลี่ยมสลับ)
    for (let i = 0; i < 4; i++) {
      const x = -0.21 + (i % 2) * 0.42, y = 0.94 + Math.floor(i / 2) * 0.28;
      out.push(B(0.22, 0.04, 0.02, b, x, y, back));
      out.push(B(0.04, 0.22, 0.02, b, x, y + 0.1, back));
      out.push(B(0.16, 0.04, 0.02, b, x, y + 0.2, back));
    }
  } else if (pat === 'flame') {     // ยามามิจิ — ทางภูเขา (ซิกแซก)
    for (let i = 0; i < 5; i++) {
      const x = -0.24 + i * 0.12;
      out.push(B(0.1, 0.3 - (i % 2) * 0.12, 0.02, b, x, 1.05 + (i % 2) * 0.06, back));
    }
    out.push(B(0.56, 0.05, 0.02, b, 0, 0.86, back));
  } else if (pat === 'sakura') {    // ดอกไม้ห้ากลีบแบบเรขาคณิต
    for (const [cx2, cy] of [[-0.16, 1.18], [0.18, 1.02], [-0.04, 0.9]]) {
      out.push(B(0.09, 0.09, 0.02, b, cx2, cy, back));
      out.push(B(0.07, 0.07, 0.02, b, cx2 - 0.09, cy + 0.06, back));
      out.push(B(0.07, 0.07, 0.02, b, cx2 + 0.09, cy + 0.06, back));
      out.push(B(0.07, 0.07, 0.02, b, cx2 - 0.07, cy - 0.08, back));
      out.push(B(0.07, 0.07, 0.02, b, cx2 + 0.07, cy - 0.08, back));
    }
  } else {                          // คิกโค — กระดองเต่า (หกเหลี่ยม)
    for (let i = 0; i < 3; i++) {
      const x = -0.18 + i * 0.18, y = 1.0 + (i % 2) * 0.2;
      out.push(B(0.14, 0.05, 0.02, b, x, y + 0.1, back));
      out.push(B(0.14, 0.05, 0.02, b, x, y - 0.1, back));
      out.push(B(0.04, 0.16, 0.02, b, x - 0.07, y, back));
      out.push(B(0.04, 0.16, 0.02, b, x + 0.07, y, back));
    }
  }
  out.push(B(0.34, 0.05, 0.02, b, 0, 1.24, front));                // ลายเล็กด้านหน้า
  return out;
}

function charGeos(skinId) {
  if (charGeoCache.has(skinId)) return charGeoCache.get(skinId);
  const s = SKINS[skinId] || SKINS.blue;

  // ส่วนที่ไม่ขยับ รวมเป็นก้อนเดียว
  const body = mergeBoxes([
    B(s.gender === 'f' ? 0.5 : 0.56, 0.66, s.gender === 'f' ? 0.28 : 0.3, s.shirt, 0, 1.05, 0),
    B(s.gender === 'f' ? 0.54 : 0.58, 0.1, 0.32, shade(s.shirt, -0.12), 0, 1.36, 0),   // ไหล่เข้มขึ้นนิด ให้ดูมีมิติ
    B(0.2, 0.3, 0.02, shade(s.shirt, 0.16), 0, 1.12, 0.16),  // สาบเสื้อ
    B(0.58, 0.14, 0.32, s.belt || 0xf0c04a, 0, 0.82, 0),
    B(0.14, 0.1, 0.03, shade(s.belt || 0xf0c04a, -0.25), 0, 0.82, 0.17),  // หัวเข็มขัด
    B(0.16, 0.16, 0.02, s.belt || 0xf0c04a, -0.16, 1.2, 0.16),
    B(0.2, 0.12, 0.26, s.skin, 0, 1.44, 0),                  // คอ
    B(0.5, 0.5, 0.5, s.skin, 0, 1.68, 0),
    B(0.52, 0.06, 0.52, shade(s.skin, -0.1), 0, 1.44, 0),    // เงาใต้คาง
    B(0.13, 0.13, 0.03, 0xf6f8fb, -0.12, 1.73, 0.25),        // ตาขาว
    B(0.13, 0.13, 0.03, 0xf6f8fb, 0.12, 1.73, 0.25),
    B(0.07, 0.08, 0.02, 0x27272e, -0.11, 1.72, 0.27),        // ตาดำ
    B(0.07, 0.08, 0.02, 0x27272e, 0.11, 1.72, 0.27),
    B(0.03, 0.03, 0.02, 0xffffff, -0.13, 1.75, 0.28),        // ประกายตา
    B(0.03, 0.03, 0.02, 0xffffff, 0.09, 1.75, 0.28),
    B(0.11, 0.05, 0.02, 0xd98e7a, -0.16, 1.62, 0.25),        // แก้ม
    B(0.11, 0.05, 0.02, 0xd98e7a, 0.16, 1.62, 0.25),
    B(0.18, 0.05, 0.02, 0xb5715c, 0, 1.56, 0.26),            // ปาก
    B(0.06, 0.12, 0.06, s.skin, -0.26, 1.68, 0),             // หู
    B(0.06, 0.12, 0.06, s.skin, 0.26, 1.68, 0),
  ].concat(haoriParts(s)).concat(hatParts(s)));

  // ขาและแขน หมุนรอบข้อต่อด้านบน จึงวางกล่องให้ห้อยลงจากจุด 0
  const leg = mergeBoxes([
    B(0.22, 0.62, 0.24, s.pants, 0, -0.31, 0),
    B(0.23, 0.06, 0.25, shade(s.pants, -0.18), 0, -0.6, 0),   // ขากางเกง
    B(0.24, 0.1, 0.3, 0x3a3f4a, 0, -0.67, 0.03),              // รองเท้า
    B(0.25, 0.04, 0.31, 0xf2f4f7, 0, -0.71, 0.03),            // พื้นรองเท้า
  ]);
  const arm = mergeBoxes([
    B(0.18, 0.58, 0.2, s.shirt, 0, -0.29, 0),
    B(0.19, 0.06, 0.21, shade(s.shirt, -0.15), 0, -0.56, 0),  // ปลายแขนเสื้อ
    B(0.19, 0.16, 0.21, s.skin, 0, -0.66, 0),
  ]);
  const tool = s.katana ? mergeBoxes([
    // ดาบคาทานะ: ด้ามพันเชือก การ์ดกลม ใบดาบสีตามชุด
    B(0.06, 0.26, 0.06, 0x2b303b, 0, -0.62, 0.1),
    B(0.07, 0.04, 0.07, 0xd9a441, 0, -0.5, 0.1),
    B(0.07, 0.04, 0.07, 0xd9a441, 0, -0.6, 0.1),
    B(0.07, 0.04, 0.07, 0xd9a441, 0, -0.7, 0.1),
    B(0.16, 0.05, 0.16, 0x8a6a22, 0, -0.46, 0.1),        // การ์ด (สึบะ)
    B(0.05, 0.86, 0.09, s.katana, 0, 0.0, 0.1),          // ใบดาบ
    B(0.02, 0.86, 0.1, 0xf6f8fb, 0.015, 0.0, 0.1),       // คมดาบ
    B(0.05, 0.1, 0.09, s.katana, 0, 0.45, 0.1),
  ]) : mergeBoxes([
    B(0.07, 0.5, 0.07, 0xa07c4c, 0, -0.62, 0.12),
    B(0.08, 0.06, 0.08, 0x7a5c33, 0, -0.86, 0.12),
    B(0.24, 0.22, 0.36, 0xe0574a, 0, -0.3, 0.12),
    B(0.26, 0.06, 0.38, 0xf2f4f7, 0, -0.3, 0.12),
    B(0.25, 0.05, 0.37, 0xc0271c, 0, -0.41, 0.12),
  ]);

  const set = { body, leg, arm, tool };
  charGeoCache.set(skinId, set);
  return set;
}

/* ตัวละคร 5 ชิ้น: ลำตัวรวม + ขาสองข้าง + แขนสองข้าง */
export function makeChar(skinId) {
  const g = charGeos(skinId);
  const root = new THREE.Group();

  const body = new THREE.Mesh(g.body, vertexColorMat);
  root.add(body);

  const legL = new THREE.Mesh(g.leg, vertexColorMat);
  legL.position.set(-0.13, 0.72, 0);
  const legR = new THREE.Mesh(g.leg, vertexColorMat);
  legR.position.set(0.13, 0.72, 0);
  root.add(legL, legR);

  const armL = new THREE.Mesh(g.arm, vertexColorMat);
  armL.position.set(-0.37, 1.36, 0);
  const armR = new THREE.Group();
  armR.position.set(0.37, 1.36, 0);
  armR.add(new THREE.Mesh(g.arm, vertexColorMat));
  armR.add(new THREE.Mesh(g.tool, vertexColorMat));
  root.add(armL, armR);

  root.scale.setScalar(0.9);
  root.userData.legs = [legL, legR];
  root.userData.armL = armL;
  root.userData.arm = armR;
  return root;
}

/* ------------------------------------------------------------------ */
/* ป้ายชื่อ                                                             */
/* ------------------------------------------------------------------ */

export function makeLabel(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = '700 34px "IBM Plex Sans Thai", system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 8;
  x.strokeStyle = 'rgba(20,26,38,.8)';
  x.strokeText(text, 128, 34);
  x.fillStyle = color || '#ffffff';
  x.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.set(2.1, 0.53, 1);
  sp.position.y = 2.5;
  return sp;
}

/* ------------------------------------------------------------------ */
/* รูปตัวอย่างสำหรับหน้าล็อบบี้                                          */
/* ------------------------------------------------------------------ */

/* เรนเดอร์โมเดลแต่ละชิ้นเป็นรูปเล็ก ๆ ครั้งเดียวตอนเปิดเว็บ
   แล้วเก็บเป็น data URL ไว้ใช้ในรายการของและร้านกาชา */
export function makePreviews(propTypes, skinIds, size) {
  const px = size || 168;
  const out = {};
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) {
    return out;
  }
  r.setPixelRatio(1);
  r.setSize(px, px);

  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x93a3b8, 1.35));
  const dl = new THREE.DirectionalLight(0xfff6e6, 0.95);
  dl.position.set(4, 7, 5);
  sc.add(dl);

  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const box = new THREE.Box3();
  const sph = new THREE.Sphere();

  const shoot = (obj) => {
    sc.add(obj);
    obj.updateMatrixWorld(true);
    box.setFromObject(obj);
    box.getBoundingSphere(sph);
    const dist = (sph.radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.06;
    const dir = new THREE.Vector3(0.72, 0.52, 1).normalize();
    cam.position.copy(dir.multiplyScalar(dist).add(sph.center));
    cam.lookAt(sph.center);
    r.render(sc, cam);
    const url = r.domElement.toDataURL('image/png');
    sc.remove(obj);
    return url;
  };

  for (const t of propTypes || []) {
    try { out[t] = shoot(makeProp(t)); } catch (e) { /* ข้ามชิ้นที่มีปัญหา */ }
  }
  for (const k of skinIds || []) {
    try { out['skin:' + k] = shoot(makeChar(k)); } catch (e) { /* ข้าม */ }
  }

  r.dispose();
  if (r.forceContextLoss) r.forceContextLoss();
  return out;
}
