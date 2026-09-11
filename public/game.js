import * as THREE from './vendor/three.module.js';
import {
  makeProp, makeChar, makeLabel, propGeometry, mergeBoxes, makePreviews,
  vertexColorMat, shadowGeometry, shadowMat, PROP_INFO,
} from './props.js';

export { makePreviews };
import * as music from './music.js';
export { music };

/* ======================================================================= */
/* DOM                                                                      */
/* ======================================================================= */

const $ = (id) => document.getElementById(id);
const el = {
  hud: $('hud'),
  timer: $('timer'), phaseName: $('phaseName'), hidersLeft: $('hidersLeft'), seekerCount: $('seekerCount'),
  roleCard: $('roleCard'), roleName: $('roleName'), roleHint: $('roleHint'), propName: $('propName'),
  myScore: $('myScore'), goldNow: $('goldNow'), feed: $('feed'),
  result: $('result'), resTitle: $('resTitle'), resText: $('resText'), resBoard: $('resBoard'),
  touch: $('touch'), stick: $('stick'), knob: $('knob'),
  btnMain: $('btnMain'), btnRoll: $('btnRoll'), btnJump: $('btnJump'),
  btnLock: $('btnLock'),
  hearts: $('hearts'), vitals: $('vitals'), gxpFill: $('gxpFill'), gxpText: $('gxpText'),
  roster: $('roster'), btnRoster: $('btnRoster'), waitBox: $('waitBox'),
  propChip: $('propChip'), specBar: $('specBar'), specName: $('specName'),
  btnRun: $('btnRun'), runBar: $('runBar'),
  quitAsk: $('quitAsk'), quitCost: $('quitCost'), quitYes: $('quitYes'), quitNo: $('quitNo'),
  specPrev: $('specPrev'), specNext: $('specNext'),
  stickHint: $('stickHint'),
  chatSend: $('chatSend'), lockHint: $('lockHint'),
  spect: $('spect'),
  rollCost: $('rollCost'), btnQuit: $('btnQuit'), roomTag: $('roomTag'),
  revive: $('revive'), reviveCost: $('reviveCost'),
  reviveLeft: $('reviveLeft'), btnRevive: $('btnRevive'),
  flash: $('flash'), chatBox: $('chatBox'), chatInput: $('chatInput'),
  topbar: document.querySelector('.topbar'), toast: $('toast'), fps: $('fps'),
};
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

/* ======================================================================= */
/* ฉาก                                                                      */
/* ======================================================================= */

const SKY = 0x8fcdf2;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(0xb6e0f7, 90, 210);   // ค่าเริ่มต้นใช้ตอนล็อบบี้ที่มองทั้งห้าง

const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 400);

let renderer = null;
function initRenderer() {
  if (renderer) return true;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !isTouch,
      powerPreference: 'high-performance',
      stencil: false,
    });
  } catch (e) { return false; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.domElement.id = 'gl';
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xd6ecff, 0x8e9a72, 1.15));
  const sun = new THREE.DirectionalLight(0xfff5e2, 0.85);
  sun.position.set(28, 48, 18);
  scene.add(sun);
  scene.add(camera);

  addEventListener('resize', onResize);
  bindPointer();
  requestAnimationFrame(frame);
  return true;
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e6e2d8'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#dcd7cb'; x.fillRect(0, 0, 64, 64); x.fillRect(64, 64, 64, 64);
  x.strokeStyle = 'rgba(140,132,118,.55)'; x.lineWidth = 2;
  x.strokeRect(1, 1, 126, 126);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ======================================================================= */
/* สถานะ                                                                    */
/* ======================================================================= */

let socket = null, hooks = {};
let MAP = null, TYPES = [], joined = false, ready = false, built = false;
let sceneReady = false, lobbyOrbit = 0;
let LOBBY_PROPS = [];
let W = { ph: 'lobby', tl: 0, hl: 0, tot: 0, bd: [], res: null };
let ME = null;

const objs = new Map();
const chars = new Map();

const local = { x: 0, z: 0, y: 0, vy: 0, ground: true, spd: 0 };
const err = { x: 0, z: 0, y: 0 };          // ส่วนต่างที่ค่อย ๆ กลืนให้เนียน
const pending = [];                        // อินพุตที่เซิร์ฟเวอร์ยังไม่ตอบรับ
let inSeq = 0, stepAcc = 0, jumpQueued = false;
const prevPos = { x: 0, z: 0, y: 0 };      // ตำแหน่งของก้าวก่อนหน้า ใช้เกลี่ยภาพระหว่างก้าว
let FIXED = 1 / 30, JUMPV = 6, GRAV = 16;
let yaw = 0, pitch = 0.25;
const move = { f: 0, s: 0 };
let camShake = 0, hurtFlash = 0, prevCd = 0, mySwing = 0;
let camDist = 5.4;
const CAM_MIN = 2.2, CAM_MAX = 60;
/* ซูมแบบคูณ ทำให้ตอนอยู่ไกลเลื่อนได้ทีละมาก ตอนอยู่ใกล้ขยับละเอียด */
function zoomBy(v) {
  camDist = Math.max(CAM_MIN, Math.min(CAM_MAX, camDist * (1 + v * 0.16)));
}
let myProp = null, myPropType = null, myChar = null, myCharSkin = null;
const fxList = [];
const clouds = [];

/* ======================================================================= */
/* เสียงและ toast                                                           */
/* ======================================================================= */

let AC = null;
function beep(freq, dur, type, vol) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, AC.currentTime);
    g.gain.setValueAtTime(vol || 0.05, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  } catch (e) { /* เงียบไว้ */ }
}

let toastTimer = null;
export function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 2600);
}

/* ======================================================================= */
/* สร้างฉาก — รวมทุกอย่างที่อยู่นิ่งเป็น mesh ไม่กี่ชิ้น                        */
/* ======================================================================= */

let mapGroup = null;
let mapKeyBuilt = '';

/* สร้างฉากของด่าน เรียกซ้ำได้เมื่อเปลี่ยนด่าน ของเก่าถูกถอดทิ้งทั้งก้อน */
function buildMap(m) {
  const key = m.key || (m.map && m.map.key) || 'mall';
  if (built && mapKeyBuilt === key) return;
  if (mapGroup) {
    scene.remove(mapGroup);
    mapGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  mapGroup = new THREE.Group();
  scene.add(mapGroup);
  built = true;
  mapKeyBuilt = key;
  const zoo = (m.theme || (m.map && m.map.theme)) === 'zoo';

  if (!clouds.length) {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshLambertMaterial({ color: 0x7cb85c }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.12;
    scene.add(lawn);
  }

  if (zoo) {
    // สวนสัตว์: พื้นหญ้ากับทางเดินปูน
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(m.w, m.d), new THREE.MeshLambertMaterial({ color: 0x8ccf6a }));
    grass.rotation.x = -Math.PI / 2;
    mapGroup.add(grass);
    const paths = [
      { w: m.w - 4, h: 0.03, d: 5, c: 0xd9d2c4, x: 0, y: 0.012, z: -18 },
      { w: m.w - 4, h: 0.03, d: 5, c: 0xd9d2c4, x: 0, y: 0.012, z: 11 },
      { w: m.w - 4, h: 0.03, d: 4, c: 0xd9d2c4, x: 0, y: 0.012, z: 26 },
      { w: 5, h: 0.03, d: m.d - 4, c: 0xd9d2c4, x: -29, y: 0.012, z: 0 },
      { w: 5, h: 0.03, d: m.d - 4, c: 0xd9d2c4, x: 2, y: 0.012, z: 0 },
      { w: 5, h: 0.03, d: m.d - 4, c: 0xd9d2c4, x: 36, y: 0.012, z: 0 },
      { w: 20, h: 0.03, d: 20, c: 0xe6dfd0, x: 0, y: 0.014, z: 0 },
    ];
    mapGroup.add(new THREE.Mesh(mergeBoxes(paths), vertexColorMat));
  } else {
    const floorMat = new THREE.MeshLambertMaterial({ map: tileTexture() });
    floorMat.map.repeat.set(m.w / 4, m.d / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(m.w, m.d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    mapGroup.add(floor);
  }

  // ผนังทั้งหมดรวมเป็น mesh เดียว รั้วเตี้ยของสวนสัตว์เป็นสีไม้
  const wallParts = [{ w: m.w + 1.6, h: 0.5, d: m.d + 1.6, c: zoo ? 0x6f9a55 : 0xcfc7b6, x: 0, y: -0.26, z: 0 }];
  for (const w of m.walls) {
    const outer = w.h > 3;
    const fence = w.h <= 1.5;
    const cx = w.x + w.w / 2, cz = w.z + w.d / 2;
    if (fence) {
      // รั้วไม้: เสาเป็นช่วง ๆ กับราวสองเส้น
      const len = Math.max(w.w, w.d), along = w.w >= w.d;
      for (let t = 0; t <= len; t += 2) {
        wallParts.push({ w: 0.18, h: w.h, d: 0.18, c: 0x8a5c34,
          x: along ? w.x + t : cx, y: w.h / 2, z: along ? cz : w.z + t });
      }
      wallParts.push({ w: along ? w.w : 0.12, h: 0.12, d: along ? 0.12 : w.d, c: 0xa8743f, x: cx, y: w.h - 0.1, z: cz });
      wallParts.push({ w: along ? w.w : 0.12, h: 0.12, d: along ? 0.12 : w.d, c: 0xa8743f, x: cx, y: w.h * 0.5, z: cz });
      continue;
    }
    wallParts.push({ w: w.w, h: w.h, d: w.d, c: outer ? (zoo ? 0xd8c9a8 : 0xf3ede1) : 0xe4dccc, x: cx, y: w.h / 2, z: cz });
    wallParts.push({ w: w.w + 0.16, h: 0.22, d: w.d + 0.16, c: outer ? (zoo ? 0x5f8f4a : 0x6aa8d8) : 0xb7ab95, x: cx, y: w.h + 0.05, z: cz });
    wallParts.push({ w: w.w + 0.1, h: 0.18, d: w.d + 0.1, c: 0xb7ab95, x: cx, y: 0.09, z: cz });
  }
  mapGroup.add(new THREE.Mesh(mergeBoxes(wallParts), vertexColorMat));

  // ป้ายชื่อโซน พื้นแยกสี กระจกหน้าร้าน — ใช้ข้อมูลโซนที่เซิร์ฟเวอร์ส่งมา
  {
    const zones = m.zones || [];
    const cols = [0xe0574a, 0x2f7fd4, 0xf0b429, 0x8b5cf6, 0x3fb894, 0xe8467a, 0xf0902c, 0x4fb0a8];
    const floorCols = zoo
      ? { pen: 0xc9b27a, water: 0x7fc0e8, building: 0xe6dfd0 }
      : { shop: null };
    const parts = [], floors = [];
    zones.forEach((zn, i) => {
      const [x0, x1, z0, z1] = zn.box;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const w = x1 - x0, d = z1 - z0;
      // พื้นโซน
      const fc = zn.color ? parseInt(zn.color.replace('#', ''), 16)
        : zoo ? floorCols[zn.kind] : [0xf3e2de, 0xdfeaf7, 0xf7efd8, 0xeae0f7, 0xdff0e8, 0xf7e0ea][i % 6];
      if (fc) floors.push({ w: w - 1.2, h: 0.02, d: d - 1.2, c: fc, x: cx, y: 0.011, z: cz });
      // ป้ายชื่อเหนือประตู (เฉพาะร้าน/อาคาร)
      if (zn.kind === 'pen' || zn.kind === 'water') return;
      const c = cols[i % cols.length];
      if (!zn.door) {
        // โซนเปิด (ไม่มีผนัง): ป้ายลอยกลางโซน
        parts.push({ w: Math.min(w, 12), h: 0.9, d: 0.3, c, x: cx, y: 3.7, z: z0 + 0.6 });
        parts.push({ w: Math.min(w, 12) - 1, h: 0.22, d: 0.05, c: 0xffffff, x: cx, y: 3.7, z: z0 + 0.78 });
        return;
      }
      const horiz = zn.door === 'n' || zn.door === 's';
      const dz = zn.door === 'n' ? z0 : zn.door === 's' ? z1 : cz;
      const dx = zn.door === 'w' ? x0 : zn.door === 'e' ? x1 : cx;
      const out = zn.door === 'n' ? -0.55 : zn.door === 's' ? 0.55 : 0;
      const outx = zn.door === 'w' ? -0.55 : zn.door === 'e' ? 0.55 : 0;
      const len = Math.min(horiz ? w : d, 14) - 1;
      if (horiz) {
        parts.push({ w: len, h: 1.0, d: 0.35, c, x: dx, y: 3.85, z: dz + out });
        parts.push({ w: len - 1.2, h: 0.26, d: 0.06, c: 0xffffff, x: dx, y: 3.85, z: dz + out * 1.35 });
        for (const s2 of [-1, 1]) parts.push({ w: (len - 5) / 2, h: 2.1, d: 0.12, c: 0xbfe4f7, x: dx + s2 * (2.5 + (len - 5) / 4), y: 1.9, z: dz + out * 0.8 });
      } else {
        parts.push({ w: 0.35, h: 1.0, d: len, c, x: dx + outx, y: 3.85, z: dz });
        parts.push({ w: 0.06, h: 0.26, d: len - 1.2, c: 0xffffff, x: dx + outx * 1.35, y: 3.85, z: dz });
        for (const s2 of [-1, 1]) parts.push({ w: 0.12, h: 2.1, d: (len - 5) / 2, c: 0xbfe4f7, x: dx + outx * 0.8, y: 1.9, z: dz + s2 * (2.5 + (len - 5) / 4) });
      }
    });
    if (parts.length) mapGroup.add(new THREE.Mesh(mergeBoxes(parts), vertexColorMat));
    if (floors.length) mapGroup.add(new THREE.Mesh(mergeBoxes(floors), vertexColorMat));
    if (!zoo) {
      // ลานกลางห้าง
      mapGroup.add(new THREE.Mesh(mergeBoxes([{ w: 30, h: 0.02, d: 30, c: 0xe8d9b8, x: 0, y: 0.013, z: 0 }]), vertexColorMat));
    }
  }

  // เมฆ ก้อนละ mesh เดียว สร้างครั้งเดียว
  const needClouds = !clouds.length;
  for (let i = 0; i < 9 && needClouds; i++) {
    const parts = [];
    const n = 3 + ((Math.random() * 3) | 0);
    for (let j = 0; j < n; j++) {
      const s = 4 + Math.random() * 7;
      parts.push({
        w: s, h: s * 0.5, d: s * 0.8, c: 0xffffff,
        x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 8,
      });
    }
    const g = new THREE.Mesh(mergeBoxes(parts), vertexColorMat);
    g.position.set((Math.random() - 0.5) * 220, 30 + Math.random() * 16, (Math.random() - 0.5) * 220);
    scene.add(g);
    clouds.push(g);
  }
}

/* ======================================================================= */
/* เฟอร์นิเจอร์แบบ instanced — วาดทั้งด่านด้วย draw call หลักสิบ               */
/* ======================================================================= */

const fields = new Map();     // ชนิด -> InstancedMesh
const dummy = new THREE.Object3D();
let shadowField = null;

function ensureField(type, need) {
  let f = fields.get(type);
  if (f && f.cap >= need) return f;
  if (f) { scene.remove(f.mesh); f.mesh.dispose(); }
  const cap = Math.max(16, need * 2);
  const mesh = new THREE.InstancedMesh(propGeometry(type), vertexColorMat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  f = { mesh, cap };
  fields.set(type, f);
  return f;
}

function ensureShadow(need) {
  if (shadowField && shadowField.cap >= need) return shadowField;
  if (shadowField) { scene.remove(shadowField.mesh); shadowField.mesh.dispose(); }
  const cap = Math.max(64, need * 2);
  const mesh = new THREE.InstancedMesh(shadowGeometry(), shadowMat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  shadowField = { mesh, cap };
  return shadowField;
}

const typeCount = new Map();
const slots = new Map();       // id -> { t, i, s } ช่องประจำของแต่ละชิ้น
let slotDirty = true;

/* จัดช่องใหม่ทั้งชุด ทำเฉพาะตอนมีของเพิ่ม หาย หรือเปลี่ยนชนิดเท่านั้น */
function rebuildSlots() {
  typeCount.clear();
  let need = 0;
  for (const c of objs.values()) {
    if (ME && c.i === ME.i) continue;
    typeCount.set(c.t, (typeCount.get(c.t) || 0) + 1);
    need++;
  }
  for (const [t, n] of typeCount) ensureField(t, n);
  ensureShadow(need);

  const used = new Map();
  let si = 0;
  slots.clear();
  for (const c of objs.values()) {
    if (ME && c.i === ME.i) continue;
    const i = used.get(c.t) || 0;
    used.set(c.t, i + 1);
    slots.set(c.i, { t: c.t, i, s: si++ });
    c.dirty = true;
  }
  for (const [t, f] of fields) {
    f.mesh.count = used.get(t) || 0;
    f.mesh.instanceMatrix.needsUpdate = true;
  }
  shadowField.mesh.count = si;
  shadowField.mesh.instanceMatrix.needsUpdate = true;
  slotDirty = false;
}

function drawProps(dt, bob) {
  typeCount.clear();
  let shadowNeed = 0;
  for (const c of objs.values()) {
    if (ME && c.i === ME.i) continue;
    typeCount.set(c.t, (typeCount.get(c.t) || 0) + 1);
    shadowNeed++;
  }
  for (const [t, n] of typeCount) ensureField(t, n);
  ensureShadow(shadowNeed);

  const used = new Map();
  let si = 0;
  const sh = shadowField.mesh;

  for (const c of objs.values()) {
    if (ME && c.i === ME.i) continue;
    c.rx += (c.x - c.rx) * Math.min(1, dt * 14);
    c.rz += (c.z - c.rz) * Math.min(1, dt * 14);

    const f = fields.get(c.t);
    const idx = used.get(c.t) || 0;
    used.set(c.t, idx + 1);

    c.ry2 += ((c.h || 0) - c.ry2) * Math.min(1, dt * 18);
    dummy.position.set(c.rx, c.ry2 + (c.m ? Math.abs(bob) * 0.06 : 0), c.rz);
    dummy.rotation.set(c.m ? bob * 0.05 : 0, c.r, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    f.mesh.setMatrixAt(idx, dummy.matrix);

    const r = (PROP_INFO[c.t] || { r: 0.6 }).r;
    dummy.position.set(c.rx, 0, c.rz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(r);
    dummy.updateMatrix();
    sh.setMatrixAt(si++, dummy.matrix);
  }

  for (const [t, f] of fields) {
    f.mesh.count = used.get(t) || 0;
    f.mesh.instanceMatrix.needsUpdate = true;
  }
  sh.count = si;
  sh.instanceMatrix.needsUpdate = true;
}

/* ======================================================================= */
/* เริ่ม/จบเกม                                                              */
/* ======================================================================= */

/* เตรียมฉากไว้ตั้งแต่เปิดเว็บ ใช้เป็นภาพพื้นหลังของหน้าล็อบบี้ */
let LOBBY_MAP = null;
export function initScene(map) {
  if (!initRenderer()) return false;
  MAP = map;
  LOBBY_MAP = map;
  TYPES = map.types;
  LOBBY_PROPS = map.props || [];
  buildSolids(LOBBY_PROPS);
  buildMap(map);
  fillLobbyProps();
  sceneReady = true;
  return true;
}

/* ตารางแบ่งช่องของสิ่งกีดขวาง ต้องคำนวณเหมือนฝั่งเซิร์ฟเวอร์เป๊ะ
   ไม่งั้นการทำนายตำแหน่งจะเพี้ยนแล้วภาพจะกระตุก */
const CELL = 4;
const GRID = new Map();
const STEP_OVER = 0.35;
const gkey = (cx, cz) => cx * 1000 + cz;

function buildSolids(props) {
  GRID.clear();
  for (const p of props) {
    const info = PROP_INFO[p.t];
    if (!info) continue;
    if (p.y && p.y > 0.6) continue;              // ของที่แขวนบนผนัง เดินลอดได้
    const solid = { x: p.x, z: p.z, r: info.r * 0.72, h: info.h };
    const k = gkey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    if (!GRID.has(k)) GRID.set(k, []);
    GRID.get(k).push(solid);
  }
}

const _fl = [];
function floorAt(x, z, y) {
  let gh = 0;
  _fl.length = 0;
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const arr = GRID.get(gkey(cx + i, cz + j));
      if (arr) for (const s of arr) _fl.push(s);
    }
  }
  const R = (MAP && MAP.r) || 0.42;
  for (const s of _fl) {
    if (s.h > y + 0.35) continue;
    if (s.h <= gh) continue;
    const rr = s.r + R;
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz < rr * rr) gh = s.h;
  }
  return gh;
}

const _near = [];
function solveProps(dx, dz, R) {
  _near.length = 0;
  const cx = Math.floor(local.x / CELL), cz = Math.floor(local.z / CELL);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const arr = GRID.get(gkey(cx + i, cz + j));
      if (arr) for (const s of arr) _near.push(s);
    }
  }
  for (const s of _near) {
    if (local.y >= s.h - STEP_OVER) continue;
    const rr = R + s.r;
    const ddx = local.x - s.x, ddz = local.z - s.z;
    if (Math.abs(ddx) > rr || Math.abs(ddz) > rr) continue;
    if (ddx * ddx + ddz * ddz >= rr * rr) continue;
    if (dx !== 0) local.x = s.x + (ddx >= 0 ? rr : -rr);
    else if (dz !== 0) local.z = s.z + (ddz >= 0 ? rr : -rr);
  }
}

function fillLobbyProps() {
  objs.clear();
  slotDirty = true;
  let id = 1;
  for (const p of LOBBY_PROPS) {
    objs.set(id, { i: id, x: p.x, z: p.z, rx: p.x, rz: p.z, ry2: 0, t: p.t, r: p.r, m: 0, dirty: true });
    id++;
  }
}

export function startGame(opts) {
  hooks = opts || {};
  if (!initRenderer()) { toast('เบราว์เซอร์นี้เปิด 3D ไม่ได้'); if (hooks.onExit) hooks.onExit(); return; }

  socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => socket.emit('join', { token: opts.token, room: opts.room || null }));
  socket.on('connect_error', () => { toast('เชื่อมต่อไม่ได้'); quit(); });
  socket.on('kick', (msg) => { toast(msg || 'ถูกตัดการเชื่อมต่อ'); quit(); });
  socket.on('toast', (msg) => toast(msg));
  socket.on('disconnect', () => { if (joined) { toast('หลุดการเชื่อมต่อ'); quit(); } });

  socket.on('init', (m) => {
    if (hooks.onEnter) hooks.onEnter();
    if (m.map) {
      m.key = m.map.key; m.theme = m.map.theme; m.name = m.map.name; m.zones = m.map.zones || [];
      buildSolids(m.map.props || []);
    }
    // ในเกมมองไม่ไกล หมอกช่วยกลบขอบของที่ยังไม่ถูกส่งมา
    scene.fog.near = 22;
    scene.fog.far = (m.viewR || 34) - 2;
    MAP = m;
    TYPES = m.types;
    if (m.tickHz) FIXED = 1 / m.tickHz;
    if (m.jumpV) JUMPV = m.jumpV;
    if (m.gravity) GRAV = m.gravity;
    buildMap(m);
    objs.clear();
    slotDirty = true;
    pending.length = 0;
    inSeq = 0;
    joined = true;
    el.hud.classList.remove('hidden');
    el.roomTag.textContent = m.room;
    if (isTouch) el.touch.classList.remove('hidden');
    if (el.stickHint) el.stickHint.style.animation = 'none';
  });

  socket.on('w', onWorld);
  socket.on('m', onMe);
  socket.on('map', (m) => {
    MAP = Object.assign({}, MAP || {}, { w: m.w, d: m.d, walls: m.walls, key: m.key, theme: m.theme, name: m.name, zones: m.zones || [] });
    buildSolids(m.props || []);
    buildMap(MAP);
    objs.clear();
    slotDirty = true;
  });
}

export function quit() {
  if (socket) {
    try { socket.emit('leave'); socket.close(); } catch (e) {}
    socket = null;
  }
  joined = false; ready = false; ME = null;
  if (LOBBY_MAP) { MAP = LOBBY_MAP; buildSolids(LOBBY_PROPS); buildMap(LOBBY_MAP); }
  fillLobbyProps();
  for (const [, c] of chars) scene.remove(c.mesh);
  chars.clear();
  for (const [, tag] of mateTags) scene.remove(tag.sprite);
  mateTags.clear();
  for (const f of fields.values()) f.mesh.count = 0;
  if (shadowField) shadowField.mesh.count = 0;
  if (myProp) { scene.remove(myProp); myProp = null; myPropType = null; }
  if (myChar) { scene.remove(myChar); myChar = null; myCharSkin = null; }
  el.hud.classList.add('hidden');
  el.result.classList.add('hidden');
  el.touch.classList.add('hidden');
  el.spect.classList.add('hidden');
  el.quitAsk.classList.add('hidden');
  camDist = 5.4;
  scene.fog.near = 90;
  scene.fog.far = 210;
  el.feed.innerHTML = '';
  if (hooks.onExit) hooks.onExit();
}

/* ---- แกะแพ็กเก็ตวัตถุ (Int16Array 6 ช่องต่อชิ้น) ----
   เบราว์เซอร์ส่งมาเป็น ArrayBuffer ส่วน Node ส่งมาเป็น Buffer จึงรองรับทั้งสองแบบ */
function toI16(b) {
  if (b instanceof Int16Array) return b;
  if (b instanceof ArrayBuffer) return new Int16Array(b);
  if (ArrayBuffer.isView(b)) {
    if (b.byteOffset % 2 === 0) return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
    const copy = new Uint8Array(b.byteLength);
    copy.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
    return new Int16Array(copy.buffer);
  }
  return new Int16Array(0);
}

const seenIds = new Set();
function decodeObjects(buf) {
  const a = toI16(buf);
  const n = a.length / 6;
  const seen = seenIds;
  seen.clear();
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    const id = a[o];
    const x = a[o + 1] / 100, z = a[o + 2] / 100;
    const t = TYPES[a[o + 3]] || 'box';
    const r = a[o + 4] / 1000;
    const packed = a[o + 5];
    seen.add(id);
    let c = objs.get(id);
    if (!c) { c = { i: id, rx: x, rz: z, ry2: 0, dirty: true }; objs.set(id, c); slotDirty = true; }
    if (c.t !== t) { c.dirty = true; slotDirty = true; }
    if (c.r !== r) c.dirty = true;
    c.x = x; c.z = z; c.t = t; c.r = r;
    c.m = packed & 1;
    c.h = (packed >> 1) / 100;
  }
  for (const k of objs.keys()) if (!seen.has(k)) { objs.delete(k); slotDirty = true; }
}

function onWorld(p) {
  W = p;
  syncChars(p.sk);
  for (const f of (p.fx || [])) handleFx(f);
  if (ME) paintHud();
}

function onMe(m) {
  const first = !ready;
  ME = m;
  if (m.ob) decodeObjects(m.ob);
  local.spd = m.spd;

  // จำตำแหน่งที่กำลังแสดงอยู่ไว้ก่อน แล้วค่อยเทียบกับผลหลังแก้
  const showX = local.x + err.x, showZ = local.z + err.z, showY = local.y + err.y;

  local.x = m.x; local.z = m.z; local.y = m.y || 0;
  local.vy = m.vy || 0; local.ground = m.g !== 0;

  // ทิ้งอินพุตที่เซิร์ฟเวอร์รับไปแล้ว ที่เหลือจำลองซ้ำทับตำแหน่งที่เพิ่งได้มา
  while (pending.length && pending[0].q <= (m.ack || 0)) pending.shift();
  for (const c of pending) simulate(c);

  prevPos.x = local.x; prevPos.z = local.z; prevPos.y = local.y;

  if (first) {
    ready = true;
    err.x = err.z = err.y = 0;
  } else {
    const dx = showX - local.x, dz = showZ - local.z, dy = showY - local.y;
    const d = Math.hypot(dx, dz);
    // ต่างกันมากเกินไปแปลว่าโดนดึงตำแหน่ง (เกิดใหม่ เริ่มรอบ) ให้กระโดดไปเลย
    // ต่างกันนิดเดียวก็ปล่อยไว้ ไม่ต้องขยับ กันภาพสั่นจากค่าปัดเศษทศนิยม
    if (d > 3 || d < 0.02) { err.x = 0; err.z = 0; err.y = Math.abs(dy) < 0.02 ? 0 : dy; }
    else { err.x = dx; err.z = dz; err.y = dy; }
  }

  if (m.cd > prevCd + 0.2) mySwing = 1;
  prevCd = m.cd;

  syncSelf(m);
  paintHud();
  if (hooks.onGold) hooks.onGold(m.gold);
}

function syncChars(list) {
  const alive = new Set();
  const myPid = ME ? ME.i : -1;
  for (const o of list) {
    if (o.i === myPid) continue;
    alive.add(o.i);
    let c = chars.get(o.i);
    if (!c || c.skin !== o.k) {
      if (c) scene.remove(c.mesh);
      const mesh = makeChar(o.k);
      mesh.add(makeLabel(o.n, '#ffd9d9'));
      scene.add(mesh);
      c = { mesh, skin: o.k, rx: o.x, rz: o.z, ry: o.y, swing: 0 };
      chars.set(o.i, c);
    }
    c.x = o.x; c.z = o.z; c.yaw = o.y; c.m = o.m; c.hy = o.h || 0;
    if (o.w) c.swing = 0.32;
  }
  for (const [k, c] of chars) if (!alive.has(k)) { scene.remove(c.mesh); chars.delete(k); }
}

function syncSelf(m) {
  if (m.role === 'out' || m.role === 'wait') {
    if (myProp) { scene.remove(myProp); myProp = null; myPropType = null; }
    if (myChar) { scene.remove(myChar); myChar = null; myCharSkin = null; }
    return;
  }
  if (m.role === 'seeker') {
    if (myProp) { scene.remove(myProp); myProp = null; myPropType = null; }
    if (!myChar || myCharSkin !== (hooks.skin || 'blue')) {
      if (myChar) scene.remove(myChar);
      myCharSkin = hooks.skin || 'blue';
      myChar = makeChar(myCharSkin);
      scene.add(myChar);
    }
    return;
  }
  if (myChar) { scene.remove(myChar); myChar = null; myCharSkin = null; }
  if (myPropType !== m.prop) {
    if (myProp) scene.remove(myProp);
    myProp = makeProp(m.prop);
    myPropType = m.prop;
    scene.add(myProp);
  }
  myProp.rotation.y = m.pr;
}

/* ======================================================================= */
/* เอฟเฟกต์                                                                 */
/* ======================================================================= */

const chipGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
const chipMats = new Map();

function burst(x, z, color, n, hi) {
  if (!chipMats.has(color)) chipMats.set(color, new THREE.MeshLambertMaterial({ color }));
  const m = chipMats.get(color);
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(chipGeo, m);
    mesh.position.set(x, hi || 0.7, z);
    scene.add(mesh);
    const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3.5;
    fxList.push({
      mesh, life: 0.9, max: 0.9,
      vx: Math.cos(a) * sp, vy: 2 + Math.random() * 3, vz: Math.sin(a) * sp,
      spin: (Math.random() - 0.5) * 12,
    });
  }
}

function shockRing(x, z, color) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.66, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.08, z);
  scene.add(mesh);
  fxList.push({ mesh, life: 1.1, max: 1.1, ring: true });
}

function near(x, z) {
  return Math.hypot(x - local.x, z - local.z) < 34;
}

function handleFx(f) {
  if (f.k === 'catch') {
    if (near(f.x, f.z)) { burst(f.x, f.z, 0xef5d5d, 16, 0.9); beep(150, 0.25, 'sawtooth', 0.07); camShake = 0.3; }
  } else if (f.k === 'miss') {
    if (near(f.x, f.z)) { burst(f.x, f.z, 0xc8d0dc, 6, 0.6); beep(90, 0.1, 'square', 0.04); }
  } else if (f.k === 'poof') {
    if (near(f.x, f.z)) { burst(f.x, f.z, 0x8ee0a8, 12, 0.8); beep(560, 0.08, 'triangle', 0.04); }
  } else if (f.k === 'revive') {
    shockRing(f.x, f.z, 0x3fb36a);
    pushFeed(`<em>${esc(f.n)} จ่ายทองเกิดใหม่</em>`);
    if (near(f.x, f.z)) beep(660, 0.16, 'triangle', 0.05);
  } else if (f.k === 'feed') {
    pushFeed(`<b>${esc(f.a)}</b> จับ <i>${esc(f.b)}</i> ได้`);
  } else if (f.k === 'chat') {
    pushFeed(`<u>${esc(f.n)}</u> ${esc(f.t)}`);
  } else if (f.k === 'join') {
    pushFeed(`<em>${esc(f.n)} เข้าห้อง</em>`);
  } else if (f.k === 'left') {
    pushFeed(`<em>${esc(f.n)} ออกจากห้อง</em>`);
  } else if (f.k === 'stage') {
    showStage(f.n);
  } else if (f.k === 'phase') {
    if (f.v === 'hunt') { hurtFlash = 0.7; beep(300, 0.3, 'sawtooth', 0.05); }
    if (f.v === 'hide') el.result.classList.add('hidden');
  }
}

/* คนซ่อนเห็นว่าเพื่อนร่วมทีมคนไหนปลอมเป็นอะไร ป้ายลอยเหนือร่างนั้น */
const mateTags = new Map();
function syncMates(dt) {
  const list = (ME && ME.mates) || [];
  const alive = new Set();
  for (const m of list) {
    const obj = objs.get(m.i);
    if (!obj) continue;
    alive.add(m.i);
    let tag = mateTags.get(m.i);
    if (!tag || tag.name !== m.n) {
      if (tag) scene.remove(tag.sprite);
      const sprite = makeLabel(m.n, '#9fe6b8');
      sprite.scale.set(2.4, 0.6, 1);
      scene.add(sprite);
      tag = { sprite, name: m.n };
      mateTags.set(m.i, tag);
    }
    const info = PROP_INFO[obj.t] || { h: 1 };
    tag.sprite.position.set(obj.rx, (obj.ry2 || 0) + info.h + 0.55, obj.rz);
  }
  for (const [k, tag] of mateTags) {
    if (!alive.has(k)) { scene.remove(tag.sprite); mateTags.delete(k); }
  }
}

function stepFx(dt) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    const p = fxList[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      if (p.ring) p.mesh.geometry.dispose();
      fxList.splice(i, 1);
      continue;
    }
    const k = p.life / p.max;
    if (p.ring) {
      p.mesh.scale.setScalar(1 + (1 - k) * 8);
      p.mesh.material.opacity = k * 0.9;
    } else {
      p.vy -= 12 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.08) { p.mesh.position.y = 0.08; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * dt * 0.7;
      p.mesh.scale.setScalar(Math.max(0.01, k));
    }
  }
}

/* ======================================================================= */
/* HUD                                                                      */
/* ======================================================================= */

const PHASE_TH = { lobby: 'กำลังจะเริ่ม', hide: 'ช่วงซ่อนตัว', hunt: 'คนหาออกล่าแล้ว', end: 'จบรอบ' };
const fmt = (t) => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const lastText = new Map();
function setText(node, v) {
  const key = node.id || node.className;
  if (lastText.get(key) === v) return;
  lastText.set(key, v);
  node.textContent = v;
}

function paintHud() {
  setText(el.timer, fmt(W.tl));
  setText(el.phaseName, PHASE_TH[W.ph] || '');
  setText(el.hidersLeft, String(W.hl));
  setText(el.seekerCount, String(W.sc !== undefined ? W.sc : Math.max(0, W.tot - W.hl)));
  el.topbar.classList.toggle('urgent', W.ph === 'hunt' && W.tl <= 30);
  setText(el.myScore, String(ME.score));
  setText(el.goldNow, String(ME.gold));

  const seeker = ME.role === 'seeker';
  const out = ME.role === 'out';
  const watching = out || ME.role === 'wait';
  el.spect.classList.toggle('hidden', !out);
  el.specBar.classList.toggle('hidden', !watching);
  if (watching) setText(el.specName, ME.spec || '—');
  el.propChip.classList.toggle('hidden', ME.role !== 'hider');
  setText(el.propName, (PROP_INFO[ME.prop] || {}).label || ME.prop);
  setText(el.roleHint, out
    ? 'นั่งดูรอบต่อไปได้ หรือจ่ายทองเกิดใหม่'
    : seeker
      ? (W.ph === 'hide' ? 'ยังขยับไม่ได้ รอหมดเวลาซ่อน' : 'ต่อยของที่น่าสงสัย ผิดได้จำกัดครั้ง')
      : (W.ph === 'hunt' ? 'หาร้านที่มีของแบบเดียวกันแล้วยืนนิ่ง' : 'รีบไปหาร้านที่ร่างของคุณกลมกลืน'));

  const hiding = ME.role === 'hider';
  el.btnMain.classList.toggle('hidden', !seeker);
  el.rollCost.textContent = ME.rr;
  el.btnRoll.classList.toggle('hidden', !hiding);
  el.btnRoll.disabled = ME.gold < ME.rr || ME.pool < 2;
  el.btnLock.classList.toggle('hidden', !hiding);
  el.btnRun.classList.toggle('hidden', !hiding);
  if (hiding && ME.staMax) {
    el.runBar.firstElementChild.style.width = Math.round((ME.sta / ME.staMax) * 100) + '%';
    el.btnRun.classList.toggle('on', !!ME.run);
    el.btnRun.classList.toggle('tired', ME.sta < 0.4);
  }
  el.btnLock.classList.toggle('on', !!ME.lock);
  el.lockHint.classList.toggle('hidden', !(ME.lock || out));
  if (ME.hold && ME.lock) setText(el.lockHint, ME.y > 0.5 ? 'เกาะอยู่บนผนัง — ปุ่มเดินใช้เลื่อนกล้อง' : 'ล็อกค้างอยู่ — ปุ่มเดินใช้เลื่อนกล้อง');
  else setText(el.lockHint, 'ตอนนี้ปุ่มเดินใช้เลื่อนกล้องไปส่องคนอื่น');

  // หลอดเลเวลอยู่บน หัวใจอยู่ล่าง โชว์ทั้งคนหาและคนซ่อน
  el.vitals.classList.remove('hidden');
  if (ME.lv !== undefined) {
    el.gxpFill.style.width = Math.round(((ME.xpIn || 0) / (ME.xpNeed || 1)) * 100) + '%';
    setText(el.gxpText, 'Lv.' + ME.lv);
  }
  if (seeker) {
    const left = Math.max(0, ME.maxMiss - ME.miss);
    paintHearts(left, ME.maxMiss);
    el.btnMain.disabled = left === 0;
  } else {
    // คนซ่อนมีชีวิตเดียว ถูกจับแล้วหัวใจดับ
    paintHearts(out ? 0 : 1, 1);
    el.btnMain.disabled = false;
  }
  el.waitBox.classList.toggle('hidden', ME.role !== 'wait');

  if (ME.rev > 0) {
    el.revive.classList.remove('hidden');
    setText(el.reviveCost, String(ME.rev));
    setText(el.reviveLeft, String(ME.revLeft));
    el.btnRevive.disabled = ME.gold < ME.rev;
  } else el.revive.classList.add('hidden');

  if (W.ph === 'end' && W.res) showResult(W.res);
  else if (W.ph !== 'end') el.result.classList.add('hidden');
}

let heartState = '';
function paintHearts(left, max) {
  const key = left + '/' + max;
  if (heartState === key) return;
  heartState = key;
  let h = '';
  for (let i = 0; i < max; i++) {
    h += `<svg class="heart${i < left ? '' : ' gone'}" viewBox="0 0 64 64"><use href="#heart"/></svg>`;
  }
  el.hearts.innerHTML = h;
}

function paintRoster() {
  const list = W.pl || [];
  const TH = { hider: 'ทีมซ่อน', seeker: 'ทีมหา', out: 'ถูกจับแล้ว', wait: 'รอรอบหน้า' };
  let h = `<h3>ผู้เล่นในห้อง ${list.length} คน</h3>`;
  for (const p of list) {
    const cls = p.r === 'seeker' ? 'seek' : p.r === 'hider' ? 'hide' : 'gone';
    h += `<div class="row"><span><i class="dot ${cls}"></i>`
      + `<b class="lv">Lv.${p.lv || 1}</b>`
      + `<span class="nm">${esc(p.n)}</span></span>`
      + `<s>${TH[p.r] || p.r}</s></div>`;
  }
  el.roster.innerHTML = h;
}

let stageTimer = null;
function showStage(name) {
  const b = $('stageBanner');
  if (!b) return;
  b.textContent = name;
  b.classList.remove('hidden');
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
  clearTimeout(stageTimer);
  stageTimer = setTimeout(() => b.classList.add('hidden'), 3200);
}

function pushFeed(html) {
  const li = document.createElement('li');
  li.innerHTML = html;
  el.feed.appendChild(li);
  while (el.feed.children.length > 7) el.feed.removeChild(el.feed.firstChild);
  setTimeout(() => li.remove(), 12000);
}

function showResult(r) {
  el.result.classList.remove('hidden');
  if (r.reason === 'seekersOut') {
    el.resTitle.textContent = 'คนหาหมดหัวใจ';
    el.resText.textContent = 'คนซ่อนรอดทั้งหมด: ' + r.survivors.join(', ');
  } else if (r.survivors.length) {
    el.resTitle.textContent = 'คนซ่อนรอด';
    el.resText.textContent = 'รอดมาได้: ' + r.survivors.join(', ');
  } else {
    el.resTitle.textContent = 'คนหากวาดเรียบ';
    el.resText.textContent = 'ไม่มีใครรอดสักคน';
  }
  el.resBoard.innerHTML = '';
  for (const row of (r.rewards || []).slice(0, 6)) {
    const li = document.createElement('li');
    const n = document.createElement('span'), s = document.createElement('span');
    n.textContent = row.n;
    s.textContent = '+' + row.g + ' ทอง';
    s.className = 'gold';
    li.append(n, s);
    el.resBoard.appendChild(li);
  }
}

/* ======================================================================= */
/* การควบคุม                                                                */
/* ======================================================================= */

const act = (k) => { if (socket && joined) socket.emit('act', k); };
const chatOpen = () => document.activeElement === el.chatInput;

function sendChat() {
  const t = el.chatInput.value.trim();
  if (t && socket) socket.emit('chat', t);
  el.chatInput.value = '';
  el.chatInput.blur();
}
el.chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') sendChat();
  if (e.key === 'Escape') { el.chatInput.value = ''; el.chatInput.blur(); }
});

const keys = {};
addEventListener('keydown', (e) => {
  if (!joined || chatOpen()) return;
  if (e.code === 'Enter') {
    el.chatInput.focus();
    e.preventDefault();
    return;
  }
  keys[e.code] = 1;
  if (e.code === 'KeyR') act('reroll');
  else if (e.code === 'Space') { jumpQueued = true; e.preventDefault(); }
  else if (e.code === 'KeyF') act('hit');
  else if (e.code === 'KeyG') act('revive');
  else if (e.code === 'KeyQ') turnHold = -1;
  else if (e.code === 'KeyE') turnHold = 1;
  else if (e.code === 'KeyL') act('lock');
  else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') act('run');
  else if (e.code === 'BracketLeft') act('specPrev');
  else if (e.code === 'BracketRight') act('specNext');
  else if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomBy(-1.2);
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomBy(1.2);
  else if (e.code === 'Tab') { paintRoster(); el.roster.classList.remove('hidden'); e.preventDefault(); }
});
addEventListener('keyup', (e) => {
  keys[e.code] = 0;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') act('runOff');
  if (e.code === 'KeyQ' && turnHold === -1) turnHold = 0;
  if (e.code === 'KeyE' && turnHold === 1) turnHold = 1 - 1;
  if (e.code === 'Tab') el.roster.classList.add('hidden');
});
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });

let dragging = false, dragPrev = { x: 0, y: 0 }, dragMoved = 0;
function bindPointer() {
  if (isTouch) return;
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (!joined) return;
    dragging = true; dragMoved = 0;
    dragPrev = { x: e.clientX, y: e.clientY };
  });
  addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragPrev.x, dy = e.clientY - dragPrev.y;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * 0.006;
    pitch = Math.max(-0.2, Math.min(0.95, pitch - dy * 0.005));
    dragPrev = { x: e.clientX, y: e.clientY };
  });
  addEventListener('mouseup', () => {
    if (dragging && dragMoved < 6 && joined && ME && ME.role === 'seeker') act('hit');
    dragging = false;
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.addEventListener('wheel', (e) => {
    if (!joined) return;
    e.preventDefault();
    zoomBy(Math.sign(e.deltaY) * 1.2);
  }, { passive: false });
}

let stickId = null, stickBase = { x: 0, y: 0 }, stick = { x: 0, y: 0 };
const looks = new Map();          // นิ้วที่อยู่ฝั่งขวา ใช้หมุนกล้อง/ซูม
let pinchBase = 0;

el.stick.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  stickId = t.identifier;
  const r = el.stick.getBoundingClientRect();
  stickBase = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  onStick(e);
}, { passive: false });
el.stick.addEventListener('touchmove', onStick, { passive: false });
function onStick(e) {
  const r = el.stick.getBoundingClientRect();
  const max = r.width * 0.42;
  for (const t of e.changedTouches) {
    if (t.identifier !== stickId) continue;
    let dx = t.clientX - stickBase.x, dy = t.clientY - stickBase.y;
    const len = Math.hypot(dx, dy) || 1;
    const cl = Math.min(len, max);
    dx = (dx / len) * cl; dy = (dy / len) * cl;
    el.knob.style.transform = `translate(${dx}px,${dy}px)`;
    const nx = dx / max, ny = dy / max;
    stick = Math.hypot(nx, ny) < 0.16 ? { x: 0, y: 0 } : { x: nx, y: ny };
  }
  e.preventDefault();
}
function endStick(e) {
  for (const t of e.changedTouches) {
    if (t.identifier !== stickId) continue;
    stickId = null; stick = { x: 0, y: 0 };
    el.knob.style.transform = 'translate(0,0)';
  }
}
el.stick.addEventListener('touchend', endStick);
el.stick.addEventListener('touchcancel', endStick);

if (isTouch) {
  /* ครึ่งขวาของจอคือพื้นที่คุมกล้อง หนึ่งนิ้ว = หมุน สองนิ้ว = ซูม
     แยกจากจอยเดินคนละนิ้ว จึงเดินไปหันกล้องไปพร้อมกันได้ */
  addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) continue;
      if (t.clientX < innerWidth * 0.42) continue;
      if (t.target.closest && t.target.closest('button, input')) continue;
      looks.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (looks.size >= 2) {
      const [a, b] = [...looks.values()];
      pinchBase = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }, { passive: true });

  addEventListener('touchmove', (e) => {
    let moved = false;
    for (const t of e.changedTouches) {
      const prev = looks.get(t.identifier);
      if (!prev) continue;
      if (looks.size === 1) {
        yaw -= (t.clientX - prev.x) * 0.0062;
        pitch = Math.max(-0.2, Math.min(0.95, pitch - (t.clientY - prev.y) * 0.005));
      }
      prev.x = t.clientX; prev.y = t.clientY;
      moved = true;
    }
    if (moved && looks.size >= 2) {
      const [a, b] = [...looks.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchBase) zoomBy((pinchBase - d) * 0.05);   // ซูมได้ละเอียดหลายระดับ
      pinchBase = d;
    }
  }, { passive: true });

  const dropLook = (e) => {
    for (const t of e.changedTouches) looks.delete(t.identifier);
    if (looks.size >= 2) {
      const [a, b] = [...looks.values()];
      pinchBase = Math.hypot(a.x - b.x, a.y - b.y);
    } else pinchBase = 0;
  };
  addEventListener('touchend', dropLook);
  addEventListener('touchcancel', dropLook);
}

const tap = (node, fn) => {
  node.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
  node.addEventListener('click', (e) => { e.preventDefault(); fn(); });
};
tap(el.btnMain, () => act('hit'));
tap(el.btnJump, () => { jumpQueued = true; });
tap(el.btnRoll, () => act('reroll'));
tap(el.btnRevive, () => act('revive'));
/* ออกกลางรอบจะโดนหักทอง เลยถามยืนยันก่อน */
tap(el.btnQuit, () => {
  const mid = ME && (ME.role === 'hider' || ME.role === 'seeker') && W.ph === 'hunt';
  if (!mid) { quit(); return; }
  setText(el.quitCost, String(MAP && MAP.leavePenalty ? MAP.leavePenalty : 40));
  el.quitAsk.classList.remove('hidden');
});
tap(el.quitYes, () => { el.quitAsk.classList.add('hidden'); quit(); });
tap(el.quitNo, () => el.quitAsk.classList.add('hidden'));
let turnHold = 0;      // ใช้กับปุ่ม Q/E บนคีย์บอร์ด
/* ปุ่มวิ่ง กดค้างไว้ถึงจะวิ่ง ปล่อยแล้วหยุด */
{
  const on = (e) => { if (e.cancelable) e.preventDefault(); act('run'); };
  const off = () => act('runOff');
  el.btnRun.addEventListener('touchstart', on, { passive: false });
  el.btnRun.addEventListener('mousedown', on);
  for (const ev of ['touchend', 'touchcancel', 'mouseup', 'mouseleave']) el.btnRun.addEventListener(ev, off);
}
tap(el.specPrev, () => act('specPrev'));
tap(el.specNext, () => act('specNext'));
tap(el.btnRoster, () => {
  const show = el.roster.classList.contains('hidden');
  if (show) paintRoster();
  el.roster.classList.toggle('hidden', !show);
});
tap(el.btnLock, () => act('lock'));
el.chatSend.addEventListener('click', () => sendChat());

/* ======================================================================= */
/* การเดินฝั่งไคลเอนต์                                                       */
/* ======================================================================= */

function readMove() {
  if (isTouch) {
    // จอยคุมการเดินอย่างเดียว มุมกล้องใช้ลากที่ครึ่งขวาของจอ
    move.f = -stick.y;
    move.s = stick.x;
  } else if (chatOpen()) {
    move.f = 0; move.s = 0;
  } else {
    move.f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    move.s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  }
}

function moveAxis(dx, dz) {
  const R = MAP.r;
  local.x = Math.max(-MAP.w / 2 + R, Math.min(MAP.w / 2 - R, local.x + dx));
  local.z = Math.max(-MAP.d / 2 + R, Math.min(MAP.d / 2 - R, local.z + dz));
  for (const w of MAP.walls) {
    if (w.h <= 1.5 && local.y >= w.h - 0.5) continue;      // รั้วเตี้ยกระโดดข้ามได้
    if (local.x + R > w.x && local.x - R < w.x + w.w && local.z + R > w.z && local.z - R < w.z + w.d) {
      const px1 = (local.x + R) - w.x, px2 = (w.x + w.w) - (local.x - R);
      const pz1 = (local.z + R) - w.z, pz2 = (w.z + w.d) - (local.z - R);
      const m = Math.min(px1, px2, pz1, pz2);
      if (m === px1) local.x = w.x - R;
      else if (m === px2) local.x = w.x + w.w + R;
      else if (m === pz1) local.z = w.z - R;
      else local.z = w.z + w.d + R;
    }
  }
  solveProps(dx, dz, R);
}

/* คำนวณหนึ่งก้าวด้วยสูตรเดียวกับเซิร์ฟเวอร์เป๊ะ ๆ ทั้งตอนทำนายและตอนย้อนจำลอง */
function simulate(c) {
  if (ME && ME.hold) {
    // เกาะผนัง/ค้างกลางอากาศ: อยู่นิ่งตามที่เซิร์ฟเวอร์บอก ไม่มีแรงโน้มถ่วง
    local.vy = 0; local.ground = true;
    return;
  }
  if (c.j && local.ground && (local.spd > 0 || (ME && ME.lock))) { local.vy = JUMPV; local.ground = false; }
  const gh = floorAt(local.x, local.z, local.y);
  if (local.ground && local.y > gh + 0.02) local.ground = false;
  if (!local.ground) {
    local.vy -= GRAV * FIXED;
    local.y += local.vy * FIXED;
    if (local.y <= gh && local.vy <= 0) { local.y = gh; local.vy = 0; local.ground = true; }
  }
  const f = Math.max(-1, Math.min(1, c.f));
  const s = Math.max(-1, Math.min(1, c.s));
  const dx = Math.sin(c.yaw) * f - Math.cos(c.yaw) * s;
  const dz = Math.cos(c.yaw) * f + Math.sin(c.yaw) * s;
  const len = Math.hypot(dx, dz);
  if (len > 0.01 && local.spd > 0) {
    const k = (Math.min(1, len) / len) * local.spd * FIXED;
    moveAxis(dx * k, 0);
    moveAxis(0, dz * k);
  }
}

/* เดินทีละก้าวคงที่ ไม่ผูกกับเฟรมเรต ภาพจึงไม่กระตุกเวลาเฟรมแกว่ง */
function stepLocal(dt) {
  if (turnHold) yaw -= turnHold * 1.9 * dt;      // หมุนกล้องด้วยปุ่ม เดินไปด้วยได้พร้อมกัน
  // ล็อกท่าอยู่หรือถูกจับแล้ว ปุ่มเดินจะกลายเป็นเลื่อนกล้องไปส่องรอบ ๆ แทน
  const wantFree = !!(ME && (ME.lock || ME.role === 'out'));
  if (wantFree !== freeMode) {
    freeMode = wantFree;
    if (!freeMode) { freeCam.x = 0; freeCam.z = 0; }
  }
  if (freeMode) {
    readMove();
    const f = Math.max(-1, Math.min(1, move.f));
    const sd = Math.max(-1, Math.min(1, move.s));
    const sp = 9 * dt;
    freeCam.x += (Math.sin(yaw) * f - Math.cos(yaw) * sd) * sp;
    freeCam.z += (Math.cos(yaw) * f + Math.sin(yaw) * sd) * sp;
    const lim = 34;
    freeCam.x = Math.max(-lim, Math.min(lim, freeCam.x));
    freeCam.z = Math.max(-lim, Math.min(lim, freeCam.z));
    // ยังต้องส่งอินพุตเปล่าไปให้เซิร์ฟเวอร์รู้ว่ายังอยู่
    stepAcc += dt;
    while (stepAcc >= FIXED) {
      stepAcc -= FIXED;
      prevPos.x = local.x; prevPos.z = local.z; prevPos.y = local.y;
      const c = { q: ++inSeq, f: 0, s: 0, yaw, j: false };
      simulate(c);
      pending.push(c);
      if (pending.length > 90) pending.shift();
      if (socket) socket.emit('in', { f: 0, s: 0, yaw, q: c.q, j: 0 });
    }
    return;
  }

  stepAcc += dt;
  let n = 0;
  while (stepAcc >= FIXED && n < 5) {
    stepAcc -= FIXED;
    n++;
    prevPos.x = local.x; prevPos.z = local.z; prevPos.y = local.y;
    readMove();
    const c = { q: ++inSeq, f: move.f, s: move.s, yaw, j: jumpQueued };
    jumpQueued = false;
    simulate(c);
    pending.push(c);
    if (pending.length > 90) pending.shift();
    if (socket) socket.emit('in', { f: c.f, s: c.s, yaw: c.yaw, q: c.q, j: c.j ? 1 : 0 });
  }
  // กลืนส่วนต่างให้หมดภายในราวหนึ่งในสิบวินาที มองไม่เห็นการกระตุก
  const k = Math.min(1, dt * 12);
  err.x -= err.x * k;
  err.z -= err.z * k;
  err.y -= err.y * k;
}

/* ======================================================================= */
/* กล้อง                                                                    */
/* ======================================================================= */

const freeCam = { x: 0, z: 0 };
let freeMode = false;
const viewPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camWant = new THREE.Vector3();
const camBack = new THREE.Vector3();

function insideWall(x, y, z, pad) {
  for (const w of MAP.walls) {
    if (y > w.h + 0.2) continue;
    if (x + pad > w.x && x - pad < w.x + w.w && z + pad > w.z && z - pad < w.z + w.d) return true;
  }
  return false;
}

function updateCamera(dt) {
  const h = myProp ? myProp.userData.h : 1.7;
  camTarget.set(viewPos.x + freeCam.x, viewPos.y + h * 0.5 + 0.55, viewPos.z + freeCam.z);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  camBack.set(Math.sin(yaw) * cp, sp, Math.cos(yaw) * cp);
  const back = camBack;
  let dist = camDist;
  for (let i = 10; i >= 1; i--) {
    const t = (i / 10) * dist;
    const px = camTarget.x - back.x * t;
    const py = camTarget.y - back.y * t + 1.1;
    const pz = camTarget.z - back.z * t;
    if (!insideWall(px, py, pz, 0.4) && py > 0.6) { dist = t; break; }
    if (i === 1) dist = 1.4;
  }
  camWant.set(
    camTarget.x - back.x * dist,
    Math.max(0.8, camTarget.y - back.y * dist + 1.1),
    camTarget.z - back.z * dist
  );
  camera.position.lerp(camWant, Math.min(1, dt * 12));

  if (camShake > 0) {
    camShake = Math.max(0, camShake - dt * 1.6);
    camera.position.x += (Math.random() - 0.5) * camShake * 0.5;
    camera.position.y += (Math.random() - 0.5) * camShake * 0.5;
  }
  camera.lookAt(camTarget);
}

/* ======================================================================= */
/* ลูปหลัก                                                                  */
/* ======================================================================= */

let lastT = performance.now();
let fpsAcc = 0, fpsN = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!renderer || !sceneReady) return;

  const bobL = Math.sin(now * 0.009);
  if (!joined || !ME || !ready) {
    // หน้าล็อบบี้: กล้องลอยวนดูห้างช้า ๆ
    lobbyOrbit += dt * 0.055;
    const rad = Math.min(MAP.w, MAP.d) * 0.78;
    camera.position.set(Math.cos(lobbyOrbit) * rad, 30 + Math.sin(lobbyOrbit * 0.7) * 5, Math.sin(lobbyOrbit) * rad);
    camera.lookAt(0, 0, 0);
    drawProps(dt, bobL);
    for (const c of clouds) {
      c.position.x += dt * 0.35;
      if (c.position.x > 160) c.position.x = -160;
    }
    renderer.render(scene, camera);
    return;
  }

  stepLocal(dt);

  const bob = Math.sin(now * 0.009);
  const moving = Math.abs(move.f) + Math.abs(move.s) > 0.05;

  drawProps(dt, bob);

  for (const c of chars.values()) {
    c.rx += (c.x - c.rx) * Math.min(1, dt * 16);
    c.rz += (c.z - c.rz) * Math.min(1, dt * 16);
    let dy = c.yaw - c.ry;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    c.ry += dy * Math.min(1, dt * 12);
    c.rh = (c.rh || 0) + ((c.hy || 0) - (c.rh || 0)) * Math.min(1, dt * 18);
    c.mesh.position.set(c.rx, c.rh, c.rz);
    c.mesh.rotation.y = c.ry;
    animChar(c.mesh, c.m, now, c.swing);
    c.swing = Math.max(0, (c.swing || 0) - dt);
  }

  const a = Math.min(1, stepAcc / FIXED);
  const showX = prevPos.x + (local.x - prevPos.x) * a + err.x;
  const showZ = prevPos.z + (local.z - prevPos.z) * a + err.z;
  const myY = Math.max(0, prevPos.y + (local.y - prevPos.y) * a + err.y);
  viewPos.set(showX, myY, showZ);
  if (myProp) {
    myProp.position.set(showX, myY + (moving ? Math.abs(bob) * 0.06 : 0), showZ);
    myProp.rotation.z = moving ? bob * 0.05 : 0;
  }
  if (myChar) {
    myChar.position.set(showX, myY, showZ);
    myChar.rotation.y = yaw;
    mySwing = Math.max(0, mySwing - dt * 3.2);
    animChar(myChar, moving, now, mySwing * 0.32);
  }

  syncMates(dt);
  updateCamera(dt);
  stepFx(dt);

  for (const c of clouds) {
    c.position.x += dt * 0.35;
    if (c.position.x > 160) c.position.x = -160;
  }

  if (hurtFlash > 0) {
    hurtFlash = Math.max(0, hurtFlash - dt * 1.6);
    el.flash.style.opacity = (hurtFlash * 0.3).toFixed(3);
  } else if (el.flash.style.opacity !== '0') {
    el.flash.style.opacity = '0';
  }

  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) {
    const fps = Math.round(fpsN / fpsAcc);
    setText(el.fps, fps + ' fps');
    tuneQuality(fps);
    fpsAcc = 0; fpsN = 0;
  }

  renderer.render(scene, camera);
}

/* ถ้าเครื่องตามไม่ทัน ค่อย ๆ ลดความละเอียดลง แล้วไต่กลับขึ้นเมื่อลื่นแล้ว */
let quality = 1, lowStreak = 0, highStreak = 0;
function tuneQuality(fps) {
  const cap = isTouch ? 1.5 : 2;
  if (fps < 45) { lowStreak++; highStreak = 0; } else if (fps > 57) { highStreak++; lowStreak = 0; }
  let q = quality;
  if (lowStreak >= 2 && quality > 0.6) { q = Math.max(0.6, quality - 0.2); lowStreak = 0; }
  else if (highStreak >= 8 && quality < 1) { q = Math.min(1, quality + 0.2); highStreak = 0; }
  if (q !== quality) {
    quality = q;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap) * quality);
    if (joined && MAP) scene.fog.far = ((MAP.viewR || 34) - 2) * (0.78 + quality * 0.22);
  }
}

function animChar(mesh, moving, now, swing) {
  const walk = moving ? Math.sin(now * 0.011) * 0.6 : 0;
  mesh.userData.legs[0].rotation.x = walk;
  mesh.userData.legs[1].rotation.x = -walk;
  mesh.userData.armL.rotation.x = -walk * 0.7;
  mesh.userData.arm.rotation.x = swing > 0 ? -1.7 * (swing / 0.32) : walk * 0.7 - 0.1;
}
