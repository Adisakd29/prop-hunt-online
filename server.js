'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const store = require('./store');
const { MAP_W, MAP_D, buildWalls, buildProps, buildNav, clearLine, PROP_SIZE, MAPS } = require('./maplayout');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { pingInterval: 10000, pingTimeout: 25000 });

app.use(express.json({ limit: '64kb' }));
/* ไฟล์โค้ดให้เบราว์เซอร์ตรวจเวอร์ชันใหม่ทุกครั้ง (กันเห็นหน้าเก่าค้างจากแคช)
   ส่วนรูปกับโมเดลเก็บแคชได้ยาว */
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders(res, filePath) {
    // ไอคอนใน ui/ ก็ให้ตรวจเวอร์ชันทุกครั้ง ไม่งั้นเปลี่ยนรูปแล้วมือถือยังโชว์รูปเก่าไปอีกทั้งวัน
    if (/\.(html|js|css|webmanifest)$/.test(filePath) || /[\\/]ui[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));
app.get('/healthz', (_req, res) => res.type('text').send('ok'));

/* ----------------------------------------------------------------------- */
/* ค่าคงที่                                                                  */
/* ----------------------------------------------------------------------- */

const CFG = {
  MAP_W, MAP_D,
  TICK_HZ: 30,
  NET_HZ: 10,
  VIEW_R: 34,      // ส่งเฉพาะของที่อยู่ในระยะมองเห็น
  R: 0.42,
  SPD_HIDER: 4.4,
  SPD_RUN: 1.55,        // ตัวคูณความเร็วตอนวิ่ง
  RUN_MAX: 3.0,         // วิ่งต่อเนื่องได้กี่วินาที
  RUN_REGEN: 2.2,       // ฟื้นเต็มใช้เวลากี่เท่าของที่ใช้ไป
  SPD_SEEKER: 4.9,
  SLOW_MULT: 0.4,
  HIDE_TIME: 25,
  HUNT_TIME: 180,
  END_TIME: 11,
  LOBBY_WAIT: 8,
  MAX_PLAYERS: 25,        // คนจริงเข้าได้ถึง 25 คน (20 ซ่อน : 5 หา)
  MAX_HIDERS: 20,
  MAX_SEEKERS: 5,
  BOT_FILL: 12,           // แต่บอทเติมแค่ 12 จะได้ไม่แน่นตอนคนน้อย
  SPEC_SPEED: 18,         // ผู้ชมบินเร็วกว่าคนเดิน จะได้กวาดดูทั้งแมปไว ๆ
  SPEC_HEIGHT: 4.5,       // ลอยสูงพอมองข้ามกำแพงห้องได้
  SPEC_OUT: 15,           // กล้องผู้ชมเลื่อนเลยขอบแมปออกไปได้กี่เมตร (ต้องตรงกับ CAM_OUT ฝั่งไคลเอนต์)
  CATCH_RANGE: 2.6,
  CATCH_ARC: Math.PI * 0.5,
  HIT_CD: 0.9,
  MISS_CD: 2.0,
  MISS_SLOW: 0.9,
  REROLL_COST: 0,         // ไม่ใช้ทองกับ gameplay แล้ว
  REROLL_CD: 60,          // เปลี่ยนร่างครั้งแรกฟรีทันที ครั้งต่อไปรอ 60 วินาที
  JUMP_V: 6.0,
  GRAVITY: 16,
  MAX_MISS: 5,
  TURN_STEP: Math.PI / 10,
  REVIVE_COST: 80,
  REVIVE_MIN_TIME: 30,     // เหลือเวลาในรอบน้อยกว่านี้ ไม่ให้เกิดใหม่แล้ว
  REVIVE_WINDOW: 15,       // นับถอยหลังส่วนตัวหลังโดนจับ กดไม่ทันก็เป็นผู้ชมไปจนจบรอบ
  LEAVE_PENALTY: 40,      // ออกจากห้องกลางรอบเสียทอง
  PTS_CATCH: 150,
  PTS_SURVIVE: 2,
  PTS_WIN_HIDER: 300,
  PTS_WIN_SEEKER: 200,
  GOLD_PER_POINT: 1 / 8,
  GOLD_WIN_BONUS: 25,
};

const PHASE = { LOBBY: 'lobby', HIDE: 'hide', HUNT: 'hunt', END: 'end' };

/* ลำดับต้องตรงกับ PROP_TYPES ฝั่งไคลเอนต์เป๊ะ เพราะส่งเป็นดัชนีตัวเลขในแพ็กเก็ต
   รวมของที่เป็นฉากอย่างเดียวด้วย (บันไดเลื่อน ลิฟต์ เสา) ซึ่งปลอมตัวเป็นไม่ได้
   มีเทสต์คอยตรวจว่าตรงกับ public/propdata.js เสมอ */
const PROP_TYPES = [
  'soda', 'milk', 'coffee', 'water', 'snack', 'chips',
  'noodle', 'chocopie', 'perfume', 'lipstick', 'powder', 'roll',
  'sunscreen', 'sanitizer', 'medkit', 'cleaner', 'tissue', 'watch',
  'sunglasses', 'cap', 'handbag', 'backpack', 'sneaker', 'luggage',
  'teddy', 'keychain', 'phone', 'tablet', 'earbuds', 'powerbank',
  'cable', 'usb', 'calculator', 'fan', 'book', 'notebook',
  'pen', 'pencil', 'marker', 'thermos', 'umbrella', 'basket',
  'cart', 'extinguisher', 'wetsign', 'barrier', 'wallclock', 'cone',
  'plant', 'lamp', 'box', 'printer', 'escalator', 'elevator',
  'pillar', 'showcase', 'rack', 'mannequin', 'fridge', 'shopbag',
  'pillow', 'vase', 'plate', 'radio', 'rock', 'bush',
  'log', 'hay', 'penguin', 'tortoise', 'giraffe', 'elephant',
  'lion', 'monkey', 'bear', 'flamingo', 'crocodile', 'zebra',
  'hippo', 'parrot', 'rabbit', 'goat', 'deer', 'snake',
  'frog', 'owl', 'kangaroo', 'camel', 'panda', 'tiger',
  'peacock', 'sink', 'soapbox', 'broom', 'toolbox', 'statue',
  'skeleton', 'pedestal', 'lowfence', 'warnsign', 'tray', 'cup',
  'icebox', 'schoolchair', 'bookshelf', 'schoolbin', 'teacherdesk', 'potplant',
  'watercooler', 'moppail', 'lunchtray', 'standfan', 'binset', 'shoerack',
  'noticeboard', 'schoolbag', 'waterjar', 'benchlong', 'projector', 'microscope',
  'conesport', 'clocksign', 'chalkbox', 'schooldesk', 'blackboard', 'lockerbay',
  'globe', 'bookstack', 'basketball', 'hoop', 'flagpole', 'labtable',
  'piano', 'waterfountain', 'podium', 'diningchair', 'homeshelf', 'homebin',
  'kitchensink', 'gardentree', 'hedge', 'gardenlamp', 'toolcart', 'laundrybasket',
  'coffeetable', 'bed', 'wardrobe', 'toilet', 'bathtub', 'stove',
  'microwave', 'washer', 'bike', 'mailbox', 'doghouse', 'grill',
  'dresser', 'zoosign', 'feeder', 'bucket', 'lamppost', 'trashbin',
  'popcorn', 'balloon', 'mapsign', 'fountain', 'tree', 'bamboo',
  'mushroom', 'flowerbed', 'tire', 'barrel', 'hydrant', 'ticketbooth',
  'plushlion', 'plushpanda', 'zoocap', 'icecream', 'slushie', 'bench',
  'zoocart', 'wheelbarrow', 'pond', 'shelf', 'desk', 'chair',
  'sofa', 'tv', 'board',
];
const TYPE_IDX = new Map(PROP_TYPES.map((t, i) => [t, i]));
const SCENERY = new Set(['escalator', 'elevator', 'pillar', 'lamppost', 'tree']);
/* ของที่แขวนบนผนังได้ กับความสูงที่แขวน (เมตร) */
/* ของที่ต้องแขวนผนัง + ความสูงที่ควรแขวน (เมตร)
   ป้ายที่มีเสาตั้งพื้นอยู่แล้ว (mapsign/zoosign/noticeboard) ไม่อยู่ในนี้ */
const WALL_MOUNT = { wallclock: 1.9, extinguisher: 1.0, fan: 1.6, mirror: 1.4, clocksign: 2.2 };
const WALL_REACH = 1.3;
const TYPE_MAP_JSON = {};      // ผังแบบ JSON เลิกใช้แล้ว เก็บไว้เป็นตารางว่างเพื่อความเข้ากันได้
const FLOOR_OK = require('./propclass').FLOOR_PROPS;
/* เฟอร์นิเจอร์ที่ใช้ตั้งโชว์สินค้า ของชิ้นเล็กต้องวางชิดของพวกนี้ ไม่โปรยกลางพื้น */
const STAND_TYPES = new Set(['shelf', 'desk', 'showcase', 'rack', 'fridge']);
/* สัตว์ทุกชนิด ใช้ตัดสินว่าของชิ้นนั้นควรอยู่ในคอกหรือนอกคอก */
const ZOO_AREA = require('./mapzoo');
const ANIMAL_TYPES = new Set(['giraffe', 'elephant', 'hippo', 'lion', 'tiger', 'bear', 'panda', 'zebra',
  'deer', 'camel', 'kangaroo', 'goat', 'rabbit', 'monkey', 'parrot', 'penguin', 'flamingo', 'peacock',
  'crocodile', 'frog', 'snake', 'owl', 'tortoise']);

const CELL_EARLY = 4;
function MAP_ORDER_EARLY(L) { return Object.keys(L); }

/* หาผนังที่ใกล้ที่สุดในระยะ reach คืนตำแหน่งชิดหน้าผนังกับมุมหันออกจากผนัง */
function nearestWallFace(x, z, walls, reach) {
  let best = null;
  for (const w of walls) {
    if (w.h < 2) continue;                       // รั้วเตี้ยแขวนของไม่ได้
    const nx = Math.max(w.x, Math.min(x, w.x + w.w));
    const nz = Math.max(w.z, Math.min(z, w.z + w.d));
    const d = Math.hypot(x - nx, z - nz);
    if (d > reach || (best && d >= best.d)) continue;
    const vert = w.d > w.w;                      // ผนังแนวตั้ง (ยาวตาม z)
    let fx = x, fz = z, ry = 0;
    if (vert) {
      const left = x < w.x + w.w / 2;
      fx = left ? w.x - 0.36 : w.x + w.w + 0.36; fz = Math.max(w.z + 0.6, Math.min(z, w.z + w.d - 0.6));
      ry = left ? -Math.PI / 2 : Math.PI / 2;
    } else {
      const north = z < w.z + w.d / 2;
      fz = north ? w.z - 0.36 : w.z + w.d + 0.36; fx = Math.max(w.x + 0.6, Math.min(x, w.x + w.w - 0.6));
      ry = north ? Math.PI : 0;
    }
    best = { d, x: fx, z: fz, ry };
  }
  return best;
}
/* สร้างผังทุกด่านไว้ล่วงหน้า ห้องแต่ละห้องสลับด่านได้ทุกรอบ */
const LAYOUTS = {};
for (const key of Object.keys(MAPS)) {
  const m = MAPS[key];
  const built = m.build();
  LAYOUTS[key] = {
    key, name: m.name, theme: m.theme, w: m.w, d: m.d,
    walls: built.walls, props: built.props, nav: built.nav,
    zones: built.zones || [],
    hidingSpots: built.hidingSpots || [],
    spawns: built.spawns || { hider: [], seeker: [] },
    palettes: built.palettes || null,
    grid: buildGrid(built.props),
  };
}
/* ของชนิดติดผนังที่วางใกล้ผนัง ให้ขยับชิดผนังและยกขึ้นไปแขวน
   แล้วเติมของแขวนตามผนังสูงทุก ๆ 9 เมตร (นาฬิกา ป้าย ถังดับเพลิง) ให้มีที่ให้แอบบนผนัง */
for (const key of MAP_ORDER_EARLY(LAYOUTS)) {
  const m = LAYOUTS[key];

  /* ของประเภทติดผนังที่ผังเผลอวางไว้กับพื้น ให้ยกขึ้นแขวนผนังที่ใกล้ที่สุด
     (เช่นนาฬิกาแขวนไปวางกองกับพื้น ดูไม่สมจริง) ถ้าไม่มีผนังใกล้ก็เอาออกไปเลย */
  {
    const drop = [];
    for (const p of m.props) {
      const mh = WALL_MOUNT[p.t];
      if (!mh || p.y > 0.05) continue;
      const face = nearestWallFace(p.x, p.z, m.walls, 3.5);
      if (!face) { drop.push(p); continue; }
      p.x = +face.x.toFixed(2); p.z = +face.z.toFixed(2); p.ry = face.ry; p.y = mh;
    }
    for (const p of drop) m.props.splice(m.props.indexOf(p), 1);
  }

  // ของที่ผังวางมือไว้อยู่บนพื้นตามเดิม เติมเฉพาะของที่แขวนผนังดูเป็นธรรมชาติ
  const kinds = ['wallclock', 'extinguisher'];
  let k = 0;
  for (const w of m.walls) {
    if (w.h < 2) continue;
    const len = Math.max(w.w, w.d);
    if (len < 8) continue;
    const along = w.w >= w.d;
    for (let t = 4.5; t < len - 3; t += 9) {
      // วางฝั่งที่หันเข้าในแผนที่ (ผนังนอกวางด้านใน ผนังในวางสลับสองฝั่ง)
      const cxw = along ? w.x + t : w.x + w.w / 2;
      const czw = along ? w.z + w.d / 2 : w.z + t;
      const outer = Math.abs(cxw) > m.w / 2 - 2 || Math.abs(czw) > m.d / 2 - 2;
      const side = outer ? (along ? (czw < 0 ? 1 : -1) : (cxw < 0 ? 1 : -1)) : (k % 2 ? 1 : -1);
      const px = along ? cxw : cxw + side * (w.w / 2 + 0.36);
      const pz = along ? czw + side * (w.d / 2 + 0.36) : czw;
      if (Math.abs(px) > m.w / 2 - 0.5 || Math.abs(pz) > m.d / 2 - 0.5) continue;
      // ไม่แขวนซ้อนกับของแขวนชิ้นอื่น (มุมห้องที่ผนังสองด้านชนกัน) และไม่ทับของบนพื้นตรงนั้น
      if (m.props.some((q) => Math.hypot(q.x - px, q.z - pz) < (q.y > 0 ? 1.6 : 1.0))) continue;
      // ห้องเล็ก (ห้องน้ำ ฯลฯ) แขวนแค่นาฬิกา ไม่ใส่ถังดับเพลิงให้ผิดบริบท
      const zn = (m.zones || []).find((q) => px > q.box[0] - 1 && px < q.box[1] + 1 && pz > q.box[2] - 1 && pz < q.box[3] + 1);
      const tiny = zn && (zn.box[1] - zn.box[0]) * (zn.box[3] - zn.box[2]) < 200;
      const t2 = tiny ? 'wallclock' : kinds[k % kinds.length];
      const ry = along ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      m.props.push({ t: t2, x: +px.toFixed(2), z: +pz.toFixed(2), ry, y: WALL_MOUNT[t2] });
      k++;
    }
  }
  m.grid = buildGrid(m.props);
  // ด่านที่วางผังมือครบแล้ว (โรงเรียน/บ้าน) ไม่ต้องเติมของจากแคตตาล็อกทับอีก
  // (สวนสัตว์ยังใช้ตัวเติมอยู่ เพราะผังเขียนมือล้วนและสัตว์ต้องมีหลายตัวต่อคอก)
  if (key === 'zoo') {
    balanceProps(m, key);                   // สวนสัตว์ต้องมีสัตว์หลายตัวต่อคอก
    // ของที่เพิ่งเติมเข้าไปยังไม่อยู่ในกราฟเดินของบอท ต้องสร้างใหม่
    // ไม่งั้นบอทจะเดินลากเส้นทะลุของที่เพิ่งวาง แล้วไปติดค้างอยู่ตรงนั้น
    m.nav = rebuildNav(m, key);
  }
  m.grid = buildGrid(m.props);
}
/* บอกร้านค้าว่าแต่ละด่านมีของชนิดไหนวางอยู่จริง จะได้ไม่ขายของที่ไม่มีต้นแบบ */
for (const key of Object.keys(LAYOUTS)) {
  // ขายเฉพาะชนิดที่ด่านนั้นมีวางอยู่จริงอย่างน้อย 3 ชิ้น
  // (ชนิดที่มี 1-2 ชิ้นยังอยู่ในฉากได้ แต่ไม่ให้ผู้เล่นปลอมตัวเป็น เพราะโดนจับง่ายเกินไป)
  const cnt = {};
  for (const p of LAYOUTS[key].props) if (!(p.y > 0)) cnt[p.t] = (cnt[p.t] || 0) + 1;
  store.setMapPool(key, Object.keys(cnt).filter((t) => cnt[t] >= 3));
}
/* ตรวจคุณภาพผังตอนสตาร์ต ถ้ามีปัญหาจะขึ้นเตือนใน log ไม่ต้องรอเจอในเกม */
{
  const mj2 = require('./propclass');
  for (const key of Object.keys(LAYOUTS)) {
    const issues = mj2.validateFloor(LAYOUTS[key]);
    for (const msg of issues) console.warn(`[ผัง ${LAYOUTS[key].name}] ${msg}`);
  }
}
const MAP_ORDER = Object.keys(LAYOUTS);

/* สร้างกราฟเดินของบอทใหม่จากของชุดล่าสุดในด่าน
   ถ้าโซนไหนของแน่นจนไม่เหลือจุดเดินเลย (บอทเข้าไม่ได้) ให้เอาของในโซนนั้นออกสองสามชิ้นแล้วลองใหม่ */
function rebuildNav(m, key) {
  const seeds = key === 'zoo' ? require('./mapzoo').seeds()
    : key === 'school' ? require('./mapschool').seeds()
      : key === 'house' ? require('./maphouse').seeds() : null;
  const nav = buildNav({ walls: m.walls, props: m.props, w: m.w, d: m.d, seeds });

  /* โซนไหนของแน่นจนไม่เหลือจุดเดินเลย ให้หาที่ว่างจริง (ใช้เกณฑ์ชนแบบเดียวกับตอนเดิน)
     แล้วเย็บจุดนั้นเข้ากราฟ ดีกว่าลบของทิ้งซึ่งทำให้ด่านโล่งลงเรื่อย ๆ */
  // ตรวจชนเองตรงนี้ ใช้ blocked() ไม่ได้เพราะฟังก์ชันนั้นถูกประกาศทีหลังในไฟล์
  const solidAt = (x, z, pad) => {
    for (const w of m.walls) {
      if (w.h <= 1.5) continue;
      if (x + CFG.R + pad > w.x && x - CFG.R - pad < w.x + w.w
        && z + CFG.R + pad > w.z && z - CFG.R - pad < w.z + w.d) return true;
    }
    for (const q of m.props) {
      if (q.y > 0.05) continue;
      const sz = PROP_SIZE[q.t];
      if (!sz || sz[0] < 0.5) continue;
      const rr = sz[1] * 0.72 + CFG.R + pad;
      if (Math.abs(q.x - x) < rr && Math.abs(q.z - z) < rr
        && (q.x - x) ** 2 + (q.z - z) ** 2 < rr * rr) return true;
    }
    return false;
  };

  for (const z of m.zones || []) {
    const [x0, x1, z0, z1] = z.box;
    if (nav.nodes.some((n) => n.x > x0 && n.x < x1 && n.z > z0 && n.z < z1)) continue;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let spot = null;
    for (let r = 0; r < 14 && !spot; r += 0.5) {
      for (let a = 0; a < 16 && !spot; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const px = cx + Math.cos(ang) * r, pz = cz + Math.sin(ang) * r;
        if (px < x0 + 1 || px > x1 - 1 || pz < z0 + 1 || pz > z1 - 1) continue;
        if (!solidAt(px, pz, 0.15)) spot = { x: +px.toFixed(2), z: +pz.toFixed(2) };
      }
    }
    if (!spot) continue;
    const idx = nav.nodes.length;
    nav.nodes.push(spot);
    nav.edges.push([]);
    // เชื่อมกับจุดใกล้ ๆ ที่เดินถึงกันได้จริง
    let linked = 0;
    const near = nav.nodes
      .map((n, i) => ({ i, d: Math.hypot(n.x - spot.x, n.z - spot.z) }))
      .filter((e) => e.i !== idx && e.d < 12)
      .sort((a, b) => a.d - b.d);
    for (const e of near) {
      if (linked >= 4) break;
      const n = nav.nodes[e.i];
      let ok2 = true;
      const steps = Math.ceil(e.d / 0.4);
      for (let k = 0; k <= steps && ok2; k++) {
        const t = k / steps;
        if (solidAt(spot.x + (n.x - spot.x) * t, spot.z + (n.z - spot.z) * t, 0.1)) ok2 = false;
      }
      if (!ok2) continue;
      nav.edges[idx].push({ n: e.i, d: e.d });
      nav.edges[e.i].push({ n: idx, d: e.d });
      linked++;
    }
  }
  return nav;
}

/* ทำให้ทุกชนิดที่ปลอมตัวได้มีอย่างน้อย MIN_COPIES ชิ้นในด่าน
   ถ้ามีชิ้นเดียว คนหาจะรู้ทันทีว่า "ตัวที่สอง" คือคน วางชิ้นเพิ่มใกล้ ๆ ชิ้นเดิมในที่โล่ง
   และของของด่านนี้ในร้านค้าที่ยังไม่มีในผังเลย ให้วางเป็นกลุ่มเล็ก ๆ ในที่โล่ง */
function balanceProps(m, key) {
  const MIN_COPIES = 3;
  const catalog = store.CATALOG.filter((c) => c.map === key).map((c) => c.id);
  // จุดประตูทุกบาน ห้ามวางของเพิ่มใกล้ ๆ
  const doors = (m.zones || []).filter((z) => z.door).map((z) => {
    if (z.doorAt) return { x: z.doorAt.x, z: z.doorAt.z };
    const [x0, x1, z0, z1] = z.box;
    return z.door === 'n' ? { x: (x0 + x1) / 2, z: z0 } : z.door === 's' ? { x: (x0 + x1) / 2, z: z1 }
      : z.door === 'w' ? { x: x0, z: (z0 + z1) / 2 } : { x: x1, z: (z0 + z1) / 2 };
  });
  const count = {};
  for (const p of m.props) count[p.t] = (count[p.t] || 0) + 1;
  const sizeOf = (t) => PROP_SIZE[t];
  const stands = m.props.filter((p) => STAND_TYPES.has(p.t) && !(p.y > 0));
  const nearStand = (x, z) => stands.some((q) => Math.hypot(q.x - x, q.z - z) < 1.5);
  const free = (x, z, t) => {
    const sz = sizeOf(t);
    if (!sz) return false;
    // ของชิ้นเล็กในห้างต้องอยู่ชิดชั้น/โต๊ะ/ตู้โชว์ เหมือนสินค้าที่ตั้งโชว์
    if (key !== 'zoo' && !FLOOR_OK.has(t) && !ANIMAL_TYPES.has(t)) {
      if (!nearStand(x, z)) return false;
      // และจำกัดจำนวนต่อร้าน ไม่ให้ร้านเดียวรับของโชว์ไปหมด
      const zn0 = (m.zones || []).find((q) => x > q.box[0] && x < q.box[1] && z > q.box[2] && z < q.box[3]);
      if (zn0) {
        const area0 = (zn0.box[1] - zn0.box[0]) * (zn0.box[3] - zn0.box[2]);
        const dispIn = m.props.filter((q) => !(q.y > 0) && !FLOOR_OK.has(q.t)
          && q.x > zn0.box[0] && q.x < zn0.box[1] && q.z > zn0.box[2] && q.z < zn0.box[3]).length;
        if (dispIn > area0 / 22) return false;
      }
    }
    if (Math.abs(x) > m.w / 2 - 1.5 || Math.abs(z) > m.d / 2 - 1.5) return false;
    const rr = sz[1] * 0.72 + CFG.R + 0.3;
    if (hitsWall(x, z, rr, m)) return false;
    if (doors.some((d) => Math.hypot(d.x - x, d.z - z) < 3.6)) return false;
    // ของชิ้นเล็กที่ตั้งโชว์วางเรียงชิดกันได้เหมือนสินค้าบนชั้น ของวางพื้นต้องเว้นทางเดิน
    const display = key !== 'zoo' && !FLOOR_OK.has(t) && !ANIMAL_TYPES.has(t);
    for (const q of m.props) {
      if (q.y > 0) continue;
      const qs = sizeOf(q.t);
      const gap = display ? (sz[1] + qs[1]) * 0.62 + 0.12 : (sz[1] + qs[1]) * 0.75 + 0.7;
      if (Math.hypot(q.x - x, q.z - z) < gap) return false;
    }
    return true;
  };
  // โซนที่ของต้นแบบอยู่ ของที่เติมต้องอยู่ในโซนเดียวกัน (สัตว์ต้องไม่หลุดออกนอกคอก)
  const zoneOf = (x, z) => (m.zones || []).find((zn) => x > zn.box[0] && x < zn.box[1] && z > zn.box[2] && z < zn.box[3]);
  void zoneOf;
  const placeNear = (t, ox, oz) => {
    const home = zoneOf(ox, oz);
    // คอกสัตว์ห้ามแน่นเกิน ไม่งั้นกระโดดเข้าไปแล้วออกไม่ได้
    if (home && (home.kind === 'pen' || home.kind === 'water')) {
      const area = (home.box[1] - home.box[0]) * (home.box[3] - home.box[2]);
      const inZone = m.props.filter((q) => q.x > home.box[0] && q.x < home.box[1] && q.z > home.box[2] && q.z < home.box[3]).length;
      if (inZone > area / 26) return false;
    }
    for (let i = 0; i < 60; i++) {
      const small2 = key !== 'zoo' && !FLOOR_OK.has(t) && !ANIMAL_TYPES.has(t);
      const a = Math.random() * Math.PI * 2;
      const r = small2 ? 0.6 + Math.random() * 1.4 : 1.5 + Math.random() * 2.4;   // ของโชว์เรียงชิดกัน
      const x = +(ox + Math.cos(a) * r).toFixed(2), z = +(oz + Math.sin(a) * r).toFixed(2);
      if (home && zoneOf(x, z) !== home) continue;      // ต้องอยู่ในคอก/ห้องเดียวกับต้นแบบ
      if (!home && zoneOf(x, z)) continue;              // ของกลางแจ้งก็ไม่ไปโผล่ในคอก
      if (free(x, z, t)) { m.props.push({ t, x, z, ry: (i % 4) * Math.PI / 2, y: 0 }); return true; }
    }
    return false;
  };
  /* เติมเฉพาะชนิดที่ผังตั้งใจให้เป็นของทั่วไป (วางไว้ตั้งแต่ 2 ชิ้นขึ้นไป)
     ชนิดที่วางไว้ชิ้นเดียวถือเป็นของโชว์ชิ้นเอก ปล่อยไว้อย่างนั้น และจะไม่ถูกขายให้ปลอมตัว */
  // ของโชว์ชิ้นเอก วางกี่ชิ้นก็ตามผัง ไม่เติมซ้ำ (และจะไม่ถูกขายให้ปลอมตัวถ้ามีน้อยกว่า 3)
  const LANDMARK = new Set(['statue', 'skeleton', 'pedestal', 'fountain', 'ticketbooth', 'mapsign', 'zoosign']);
  // ของชิ้นเล็กกับของติดผนังไม่เติมลงพื้นเด็ดขาด (ต้องอยู่บนชั้น/ผนังเท่านั้น)
  const MJ = require('./propclass');
  const types = new Set([...Object.keys(count), ...catalog]
    .filter((t) => !LANDMARK.has(t) && !MJ.DISPLAY_PROPS.has(t) && !MJ.WALL_PROPS.has(t)));
  for (const t of types) {
    if (SCENERY.has(t) || !sizeOf(t)) continue;
    // ของที่แขวนผนังอัตโนมัติ (นาฬิกา ถังดับเพลิง) ไม่ต้องเติมบนพื้น
    if (t === 'wallclock' || t === 'extinguisher') continue;
    let have = m.props.filter((p) => p.t === t && !(p.y > 0)).length;
    let anchor = m.props.find((p) => p.t === t && !(p.y > 0));
    if (!anchor) {
      // ยังไม่มีเลย: หาที่โล่งเป็นจุดตั้งต้น แต่ต้องถูกบริบท
      // สัตว์ต้องอยู่ในคอก ของของคนต้องอยู่นอกคอก (ไม่งั้นป๊อปคอร์นไปโผล่ในคอกสิงโต)
      const isAnimal = ANIMAL_TYPES.has(t);
      const want = key === 'zoo' ? ZOO_AREA.AREA_OF[t] : null;
      for (let i = 0; i < 400 && !anchor; i++) {
        const x = +(-m.w / 2 + 4 + Math.random() * (m.w - 8)).toFixed(2);
        const z = +(-m.d / 2 + 4 + Math.random() * (m.d - 8)).toFixed(2);
        const zn = zoneOf(x, z);
        const inPen = zn && (zn.kind === 'pen' || zn.kind === 'water');
        if (isAnimal !== !!inPen) continue;
        if (want && !want.includes(ZOO_AREA.areaAt(x, z))) continue;   // ต้องอยู่โซนบรรยากาศที่เข้ากัน
        // ในห้าง ของที่เติมใหม่ต้องอยู่ในร้าน ไม่ใช่โปรยกลางลาน
        if (key !== 'zoo' && !(zn && zn.kind === 'building')) continue;
        if (free(x, z, t)) { anchor = { t, x, z, ry: 0, y: 0 }; m.props.push(anchor); have++; }
      }
      if (!anchor) continue;
    }
    let guard = 0;
    while (have < MIN_COPIES && guard++ < 24) {
      if (placeNear(t, anchor.x, anchor.z)) { have++; continue; }
      // จุดเดิมเต็มแล้ว หาที่ใหม่ที่บริบทเข้ากันแล้ววางต่อ
      const isA = ANIMAL_TYPES.has(t);
      const want2 = key === 'zoo' ? ZOO_AREA.AREA_OF[t] : null;
      let moved = false;
      for (let i = 0; i < 160 && !moved; i++) {
        const x = +(-m.w / 2 + 4 + Math.random() * (m.w - 8)).toFixed(2);
        const z = +(-m.d / 2 + 4 + Math.random() * (m.d - 8)).toFixed(2);
        const zn = zoneOf(x, z);
        const inPen = zn && (zn.kind === 'pen' || zn.kind === 'water');
        if (isA !== !!inPen) continue;
        if (want2 && !want2.includes(ZOO_AREA.areaAt(x, z))) continue;
        if (key !== 'zoo' && !(zn && zn.kind === 'building')) continue;
        if (!free(x, z, t)) continue;
        m.props.push({ t, x, z, ry: 0, y: 0 });
        anchor = { t, x, z };
        have++; moved = true;
      }
      if (!moved) break;
    }
  }
}

// ค่าเริ่มต้นสำหรับโค้ดเก่าที่อ้างด่านแรก
/* ด่านตั้งต้นที่ใช้เป็นค่าอ้างอิงเวลาไม่ได้ระบุด่าน (ตัวแรกในทะเบียน) */
const DEFAULT_MAP = LAYOUTS[Object.keys(LAYOUTS)[0]];
const WALLS = DEFAULT_MAP.walls;
const LAYOUT = DEFAULT_MAP.props;
const NAV = DEFAULT_MAP.nav;

/* ชื่อบอทเป็นชื่อเล่นแบบคนจริง ไม่ซ้ำกันในห้องเดียว */
const BOT_NICK = ['ต้น', 'แบม', 'มิ้นท์', 'เจมส์', 'นัท', 'ปอ', 'เฟิร์น', 'โอ๊ต', 'บิว', 'แพร', 'ไอซ์', 'กาย',
  'นิว', 'พลอย', 'ฟ้า', 'เบียร์', 'ก้อง', 'ตาล', 'เมย์', 'ปาล์ม', 'โบว์', 'แซม', 'อาร์ม', 'มิว', 'ตั้ม', 'ขวัญ',
  'จูน', 'เอิร์ธ', 'ปั้น', 'แนน', 'บอส', 'เบส', 'กิ๊ฟ', 'พีช', 'ปิง', 'มาร์ค', 'เจน', 'ต้า', 'นุ่น', 'เอม',
  'กัน', 'ปุ๊ก', 'ยิม', 'โมจิ', 'พั้นช์', 'เกรซ', 'บุ๊ค', 'ไนซ์', 'เอ๋', 'ดรีม', 'ภูมิ', 'ฟิล์ม', 'เนย', 'ออม'];
const BOT_STYLE = ['', '', '', 'z', 'x', '_', 'yy', '007', 'ka', 'jr', 'kung', 'zaa', '.', 'PS'];
function randomBotName(taken) {
  for (let i = 0; i < 60; i++) {
    const base = pick(BOT_NICK);
    const st = pick(BOT_STYLE);
    const n = st === 'ka' ? base + 'ค่ะ' : st === 'kung' ? base + 'กุ๊ง' : st === 'zaa' ? base + 'ซ่า' : base + st;
    if (!taken.has(n)) return n;
  }
  return pick(BOT_NICK) + ((Math.random() * 90 + 10) | 0);
}

/* ----------------------------------------------------------------------- */
/* ยูทิลิตี้                                                                 */
/* ----------------------------------------------------------------------- */

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r2 = (v) => Math.round(v * 100) / 100;

function shuffled(n, offset) {
  const a = Array.from({ length: n }, (_, i) => i + 1 + (offset || 0));
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* ของในด่านไม่ขยับ จึงแบ่งช่องเก็บไว้ครั้งเดียว เวลาเดินก็ดูแค่ช่องรอบตัว */
const CELL = CELL_EARLY;
function gkey(cx, cz) { return cx * 1000 + cz; }
function buildGrid(props) {
  const grid = new Map();
  for (const p of props) {
    const sz = PROP_SIZE[p.t];
    if (!sz) continue;
    if (p.y && p.y > 0.6) continue;              // ของที่แขวนบนผนัง เดินลอดได้
    const solid = { x: p.x, z: p.z, r: sz[1] * 0.72, h: sz[0] };
    const k = gkey(Math.floor(p.x / CELL_EARLY), Math.floor(p.z / CELL_EARLY));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(solid);
  }
  return grid;
}

/* ของเตี้ยกว่านี้กระโดดข้ามได้ */
const STEP_OVER = 0.35;

function nearSolids(x, z, out, map) {
  out.length = 0;
  const grid = (map || DEFAULT_MAP).grid;
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const arr = grid.get(gkey(cx + i, cz + j));
      if (arr) for (const s of arr) out.push(s);
    }
  }
  return out;
}

function hitsWall(x, z, r, map) {
  for (const w of (map || DEFAULT_MAP).walls) {
    if (x + r > w.x && x - r < w.x + w.w && z + r > w.z && z - r < w.z + w.d) return true;
  }
  return false;
}

const _fs = [];
function blocked(x, z, pad, map) {
  if (hitsWall(x, z, CFG.R + pad, map)) return true;
  for (const s of nearSolids(x, z, _fs, map)) {
    const rr = CFG.R + s.r + pad;
    if (Math.abs(x - s.x) < rr && Math.abs(z - s.z) < rr) {
      if ((x - s.x) ** 2 + (z - s.z) ** 2 < rr * rr) return true;
    }
  }
  return false;
}

function freeSpot(map) {
  const m = map || DEFAULT_MAP;
  for (let i = 0; i < 800; i++) {
    const x = rnd(-m.w / 2 + 3, m.w / 2 - 3);
    const z = rnd(-m.d / 2 + 3, m.d / 2 - 3);
    if (!blocked(x, z, 0.4, m)) return { x, z };
  }
  return { x: 0, z: 0 };
}

/* ----------------------------------------------------------------------- */
/* หาเส้นทางบนกราฟจุดเดิน                                                    */
/* ----------------------------------------------------------------------- */

function nearestNode(x, z, map) {
  const m = map || DEFAULT_MAP;
  const nodes = m.nav.nodes;
  let best = -1, bd = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const d = Math.hypot(n.x - x, n.z - z);
    if (d >= bd) continue;
    if (!clearLine(x, z, n.x, n.z, m.walls, 0.55)) continue;
    bd = d; best = i;
  }
  if (best >= 0) return best;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function findPath(fromX, fromZ, toX, toZ, map) {
  const m = map || DEFAULT_MAP;
  const NAV = m.nav;
  if (clearLine(fromX, fromZ, toX, toZ, m.walls, 0.5) && !propsBetween(fromX, fromZ, toX, toZ, m)) {
    return [{ x: toX, z: toZ }];
  }
  const s = nearestNode(fromX, fromZ, m);
  const g = nearestNode(toX, toZ, m);
  if (s < 0 || g < 0) return [{ x: toX, z: toZ }];

  const dist = new Float64Array(NAV.nodes.length).fill(Infinity);
  const prev = new Int32Array(NAV.nodes.length).fill(-1);
  const done = new Uint8Array(NAV.nodes.length);
  dist[s] = 0;
  for (;;) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === g) break;
    done[u] = 1;
    for (const e of NAV.edges[u]) {
      const nd = dist[u] + e.d;
      if (nd < dist[e.n]) { dist[e.n] = nd; prev[e.n] = u; }
    }
  }
  const out = [];
  for (let cur = g; cur >= 0; cur = prev[cur]) {
    out.unshift({ x: NAV.nodes[cur].x, z: NAV.nodes[cur].z });
    if (cur === s) break;
  }
  // ช่วงสุดท้ายจากจุดเดินไปเป้าหมาย ถ้ามีของขวางก็หยุดที่จุดเดินใกล้สุดแทน
  const last = out[out.length - 1];
  if (!last || !propsBetween(last.x, last.z, toX, toZ, m)) out.push({ x: toX, z: toZ });
  return out;
}

/* ----------------------------------------------------------------------- */
/* ห้องเกม                                                                   */
/* ----------------------------------------------------------------------- */

let botSeq = 0;

/* ระหว่างสองจุดมีของที่กระโดดข้ามไม่ได้ขวางอยู่ไหม ใช้ให้บอทตัดสินใจว่าจะวิ่งตรงหรืออ้อม */
const _pb = [];
function propsBetween(x1, z1, x2, z2, map) {
  const d = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.max(1, Math.ceil(d / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    for (const s of nearSolids(x, z, _pb, map)) {
      if (s.h < 0.5) continue;
      const rr = s.r + CFG.R + 0.05;
      if (Math.abs(x - s.x) < rr && Math.abs(z - s.z) < rr
        && (x - s.x) ** 2 + (z - s.z) ** 2 < rr * rr) return true;
    }
  }
  return false;
}

/* ความสูงของพื้นใต้ตัว: ยืนบนของที่กระโดดขึ้นไปได้ (ของที่ยอดอยู่ไม่สูงกว่าตัวตอนนี้มากนัก) */
const _fl = [];
function floorAt(x, z, y, map) {
  let gh = 0;
  for (const s of nearSolids(x, z, _fl, map)) {
    if (s.h > y + 0.35) continue;                 // สูงกว่าที่ยืนอยู่ ปีนขึ้นไม่ได้
    if (s.h <= gh) continue;
    const rr = s.r + CFG.R;
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz < rr * rr) gh = s.h;
  }
  return gh;
}

/* ดันตัวผู้เล่นออกจากของที่ชน ยกเว้นตอนลอยสูงพอจะข้ามได้ */
const _near = [];
function solveProps(p, dx, dz, R, map) {
  const list = nearSolids(p.x, p.z, _near, map);
  for (const s of list) {
    if (p.y >= s.h - STEP_OVER) continue;          // กระโดดข้ามพ้นแล้ว
    const rr = R + s.r;
    const ddx = p.x - s.x, ddz = p.z - s.z;
    if (Math.abs(ddx) > rr || Math.abs(ddz) > rr) continue;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 >= rr * rr) continue;
    if (dx !== 0) p.x = s.x + (ddx >= 0 ? rr : -rr);
    else if (dz !== 0) p.z = s.z + (ddz >= 0 ? rr : -rr);
  }
}

class Room {
  constructor(id) {
    this.id = id;
    // ของใช้รหัสช่วง 1000+ ผู้เล่นใช้ช่วง 1-999 ไม่มีทางชนกันแม้เปลี่ยนด่านแล้วแจกใหม่
    this.idPool = shuffled(9000, 1000);
    this.pidPool = shuffled(999);
    this.roundNo = 0;
    this.lastPlayedKey = null;
    this.setMap(pick(MAP_ORDER));
    this.players = new Map();
    this.phase = PHASE.LOBBY;
    this.timer = 0;
    this.fx = [];
    this.result = null;
    this.netAcc = 0;
  }

  /* เปลี่ยนด่านของห้อง ของทุกชิ้นได้ id ใหม่ */
  setMap(key) {
    const m = LAYOUTS[key] || DEFAULT_MAP;
    this.map = m;
    this.mapKey = m.key;
    this.walls = m.walls;
    this.props = m.props.map((p) => ({ id: this.idPool.pop(), x: p.x, z: p.z, t: p.t, ry: p.ry, y: p.y || 0 }));
    this.propsByType = new Map();
    for (const p of this.props) {
      if (!this.propsByType.has(p.t)) this.propsByType.set(p.t, []);
      this.propsByType.get(p.t).push(p);
    }
    if (this.idPool.length < 1500) this.idPool = shuffled(9000, 1000);
    this.seekerStart = null;
  }

  /* จุดเกิดตามผัง: กระจายรอบจุดที่กำหนดไว้ ถ้าไม่มีก็สุ่มที่โล่ง */
  spawnFor(role) {
    const list = (this.map.spawns && this.map.spawns[role]) || [];
    if (role === 'seeker') {
      // คนหาทุกคนเริ่มที่จุดเดียวกัน (เยื้องกันนิดเดียวไม่ให้ซ้อนทับ)
      if (!this.seekerStart) {
        const base = list[0] || freeSpot(this.map);
        this.seekerStart = base;
        if (blocked(base.x, base.z, 0.6, this.map)) {
          // จุดที่กำหนดมีของวางทับ ขยับหาที่โล่งใกล้ ๆ
          for (let i = 0; i < 60 && blocked(this.seekerStart.x, this.seekerStart.z, 0.6, this.map); i++) {
            const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 4;
            this.seekerStart = { x: base.x + Math.cos(a) * r, z: base.z + Math.sin(a) * r };
          }
        }
      }
      const a = Math.random() * Math.PI * 2;
      return { x: this.seekerStart.x + Math.cos(a) * 0.4, z: this.seekerStart.z + Math.sin(a) * 0.4 };
    }
    if (!list.length) return freeSpot(this.map);
    const base = pick(list);
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 3.2;
      const x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r;
      if (!blocked(x, z, 0.35, this.map)) return { x, z };
    }
    return freeSpot(this.map);
  }

  /* โซนที่ตำแหน่งนี้อยู่ (ใช้เลือกร่างตาม palette ของโซน) */
  zoneAt(x, z) {
    for (const zn of this.map.zones || []) {
      const [x0, x1, z0, z1] = zn.box;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return zn;
    }
    return null;
  }

  /* สุ่มร่างจากของที่ผู้เล่นมี "และ" มีวางอยู่ในด่านนี้จริง
     ไม่งั้นได้ร่างที่ไม่มีที่ให้กลืนเลย ถ้าไม่มีเลยก็ให้ของธรรมดาที่มีในด่าน */
  pickPropFor(user, exclude, at) {
    const here = this.propsByType;
    // ถ้าผังมี palette ของโซน ให้เลือกจาก palette ของโซนที่ยืนอยู่ก่อน (ตาม pickDisguise ในผัง)
    if (at && this.map.palettes) {
      const zn = this.zoneAt(at.x, at.z);
      const pal = zn && zn.palette && this.map.palettes[zn.palette];
      if (pal) {
        const mapped = new Set(pal.map((n) => (TYPE_MAP_JSON[n] || {}).t || n));
        const pool0 = (user.unlocked || []).filter((t) => mapped.has(t) && here.has(t) && t !== exclude);
        if (pool0.length) return pick(pool0);
      }
    }
    let pool = (user.unlocked || []).filter((t) => here.has(t) && t !== exclude);
    if (!pool.length) pool = [...here.keys()].filter((t) => t !== exclude && !SCENERY.has(t));
    if (!pool.length) pool = [...here.keys()];
    return pick(pool);
  }

  mapPayload() {
    const m = this.map;
    return {
      key: m.key, name: m.name, theme: m.theme, w: m.w, d: m.d, r: CFG.R,
      walls: m.walls,
      zones: m.zones || [],
      // ของประจำฉากส่งครั้งเดียวพร้อม id เลย ไม่ต้องสตรีมซ้ำทุกติ๊ก
      // (ทำให้ผู้ชมเห็นทั้งแมป ไม่มีของโผล่ตอนเดินเข้าใกล้ และไม่ต้องใช้หมอกบัง)
      props: this.props.map((p) => ({ id: p.id, t: p.t, x: p.x, z: p.z, r: p.ry, y: p.y || 0 })),
    };
  }

  get size() { return this.players.size; }
  list() { return [...this.players.values()]; }
  humans() { return this.list().filter((p) => !p.bot); }
  bots() { return this.list().filter((p) => p.bot); }
  /* คนที่หลุดการเชื่อมต่ออยู่ (รอกลับมา) ไม่นับเป็นผู้เล่นในรอบ
     ไม่งั้นรอบจะจบไม่ลงเพราะยังมี "คนซ่อน" ค้างอยู่ และคนอื่นเห็นชื่อเขาเดินอยู่ในห้อง */
  isGone(p) { return !p.bot && !p.socket && p.gone > 0; }
  hidersAlive() { return this.list().filter((p) => p.role === 'hider' && !this.isGone(p)).length; }
  seekerCount() { return this.list().filter((p) => p.role === 'seeker' && !this.isGone(p)).length; }

  hasRoomFor() {
    return this.humans().length < CFG.MAX_PLAYERS;
  }

  newPlayer(id, user, isBot) {
    const s = freeSpot(this.map);
    return {
      id,
      pid: this.pidPool.length ? this.pidPool.pop() : ((Math.random() * 999) | 0) + 1,
      bot: !!isBot,
      user,
      name: user.name,
      skin: user.skin || 'blue',
      x: s.x, z: s.z, yaw: 0,
      y: 0, vy: 0, ground: true, wantJump: false,
      misses: 0, revived: false, deadAt: 0, locked: false,
      run: false, stamina: CFG.RUN_MAX,
      role: 'hider',
      prop: this.pickPropFor(user),
      propRy: rnd(0, Math.PI * 2),
      score: 0, roundScore: 0, catches: 0,
      cd: 0, slow: 0, swing: 0,
      moving: false,
      in: { f: 0, s: 0, yaw: 0, seq: 0 },
      ack: 0,
      wantHit: false, wantReroll: false, wantRevive: false, turn: 0, wantLock: 0,
      spec: 0, specStep: 0,
      path: null, dest: null, think: 0, settled: false, strafe: 0, strafeDir: 1, stuckHard: 0,
      lastX: s.x, lastZ: s.z, stuck: 0,
    };
  }

  add(socket, user) {
    store.ensure(user);
    const p = this.newPlayer(socket.id, user, false);
    p.socket = socket;
    // เข้ามาช่วงซ่อนยังทันเล่น (เพื่อนกดพร้อมกันจะได้เล่นด้วยกันทุกคน)
    // เฉพาะช่วงล่าเท่านั้นที่ต้องรอรอบถัดไป
    if (this.phase === PHASE.HIDE) {
      p.role = 'hider';
      const s = this.spawnFor('hider');
      p.x = s.x; p.z = s.z; p.y = 0; p.vy = 0; p.ground = true;
      p.prop = this.pickPropFor(p.user, null, s);
      this.tell(p, 'เข้าทันช่วงซ่อนพอดี รีบไปหาที่ซ่อนเลย');
      // เตะบอทออกหนึ่งตัวถ้าห้องเต็มเพราะบอท คนจริงต้องได้เล่นก่อน
      if (this.players.size > CFG.BOT_FILL) {
        const b = this.bots().find((o) => o.role === 'hider');
        if (b) this.remove(b.id);
      }
    } else if (this.phase === PHASE.HUNT) p.role = 'wait';
    this.players.set(p.id, p);
    return p;
  }

  addBot() {
    ++botSeq;
    const name = randomBotName(new Set(this.list().map((o) => o.name)));
    const user = {
      name, bot: true, gold: 0,
      unlocked: PROP_TYPES.slice(),
      skins: ['blue'], skin: pick(store.SKIN_CATALOG).id,
      games: 0, wins: 0, catches: 0, best: 0, friends: [], requests: [],
    };
    const p = this.newPlayer('bot:' + botSeq + ':' + this.id, user, true);
    p.botLv = 1 + ((Math.random() * 30) | 0);      // บอทมีเลเวลของตัวเองให้ดูกลมกลืน
    this.players.set(p.id, p);
    return p;
  }

  remove(id) {
    const p = this.players.get(id);
    if (p) this.pidPool.unshift(p.pid);          // คืนรหัสไว้ใช้ซ้ำ
    this.players.delete(id);
  }

  clearBots() {
    for (const p of this.list()) if (p.bot) { this.pidPool.unshift(p.pid); this.players.delete(p.id); }
  }

  fillBots() {
    const want = Math.min(CFG.BOT_FILL, CFG.MAX_PLAYERS);
    while (this.players.size < want) this.addBot();
  }

  /* ---- เฟส ---- */

  startRound() {
    // เริ่มรอบใหม่แล้วใครยังไม่กลับมา ถือว่าออกไปแล้ว เอาออกจากห้องเลย
    for (const p of this.list()) if (this.isGone(p)) this.remove(p.id);
    if (this.humans().length < 1) { this.clearBots(); this.toLobby(); return; }
    this.clearBots();

    // สุ่มด่านทุกรอบ ไม่ซ้ำกับรอบก่อน (รอบแรกก็สุ่ม ไม่ใช่ห้างเสมอ)
    this.roundNo += 1;
    const others = MAP_ORDER.filter((k) => k !== this.lastPlayedKey);
    const nextKey = pick(others.length ? others : MAP_ORDER);
    this.lastPlayedKey = nextKey;
    if (nextKey !== this.mapKey) {
      this.setMap(nextKey);
      io.to(this.id).emit('map', this.mapPayload());
    }
    this.fx.push({ k: 'stage', n: this.map.name });

    this.fillBots();

    const ps = this.list();
    const nSeek = clamp(Math.round(ps.length / 5), 1, CFG.MAX_SEEKERS);

    /* สุ่มบทบาทให้เป็นธรรม เดิมใช้ sort(() => Math.random() - 0.5) ซึ่งลำเอียงหนัก
       คนที่เข้าห้องก่อนได้เป็นคนหาถึง 38% ส่วนคนเข้าทีหลังเหลือ 17%
       ตอนนี้สลับแบบ Fisher-Yates และให้คนที่เพิ่งเป็นคนหารอบก่อนไปต่อท้ายแถว
       เล่นกับเพื่อนจึงได้สลับบทบาทกันจริง ไม่ใช่คนเดิมเป็นคนหาทุกรอบ */
    const order = ps.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.sort((a, b) => (a.seekStreak || 0) - (b.seekStreak || 0));

    order.forEach((p, i) => {
      const isSeek = i < nSeek;
      p.seekStreak = isSeek ? (p.seekStreak || 0) + 1 : 0;
      p.role = isSeek ? 'seeker' : 'hider';
      p.propRy = rnd(0, Math.PI * 2);
      p.cd = 0; p.slow = 0; p.swing = 0;
      p.y = 0; p.vy = 0; p.ground = true;
      p.misses = 0; p.revived = false; p.deadAt = 0; p.locked = false; p.hold = false;
      p.run = false; p.stamina = CFG.RUN_MAX; p.rerollAt = 0;
      p.roundScore = 0; p.catches = 0;
      p.path = null; p.dest = null; p.settled = false; p.think = rnd(0, 1);
      const s = this.spawnFor(p.role);
      p.prop = this.pickPropFor(p.user, null, s);
      p.x = s.x; p.z = s.z;
    });
    this.phase = PHASE.HIDE;
    this.timer = CFG.HIDE_TIME;
    this.result = null;
    this.fx.push({ k: 'phase', v: 'hide' });
  }

  toHunt() {
    this.phase = PHASE.HUNT;
    this.timer = CFG.HUNT_TIME;
    this.fx.push({ k: 'phase', v: 'hunt' });
  }

  endRound(reason) {
    this.phase = PHASE.END;
    this.timer = CFG.END_TIME;
    const alive = this.list().filter((p) => p.role === 'hider');
    if (alive.length) alive.forEach((p) => { p.score += CFG.PTS_WIN_HIDER; p.roundScore += CFG.PTS_WIN_HIDER; });
    else this.list().forEach((p) => { p.score += CFG.PTS_WIN_SEEKER; p.roundScore += CFG.PTS_WIN_SEEKER; });

    const rewards = [];
    for (const p of this.players.values()) {
      const won = alive.length ? p.role === 'hider' : true;
      let gold = Math.round(p.roundScore * CFG.GOLD_PER_POINT);
      if (won) gold += CFG.GOLD_WIN_BONUS;
      if (!p.bot) {
        store.addGold(p.user, gold);
        store.recordRound(p.user, { won, catches: p.catches, score: p.roundScore });
      }
      rewards.push({ n: p.name, g: gold, b: p.bot ? 1 : 0 });
    }

    store.flushNow();
    this.result = {
      reason,
      survivors: alive.map((p) => p.name).slice(0, 10),
      board: this.board(),
      rewards: rewards.sort((a, b) => b.g - a.g).slice(0, 8),
    };
    this.fx.push({ k: 'phase', v: 'end' });
  }

  toLobby() {
    this.phase = PHASE.LOBBY;
    this.timer = CFG.LOBBY_WAIT;
    this.list().forEach((p) => { p.role = 'hider'; p.cd = 0; p.slow = 0; });
  }

  board() {
    return this.list()
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((p) => ({ n: p.name, s: Math.round(p.score), r: p.role }));
  }

  /* ---- ลูป ---- */

  /* คนที่ถูกจับหรือรอรอบหน้า ให้กล้องไปเกาะผู้เล่นที่ยังอยู่ในสนาม
     เลื่อนดูทีละคนได้ และย้ายพิกัดตามไปด้วย แพ็กเก็ตจะได้ส่งของรอบตัวคนนั้นมา */
  spectateTargets() {
    return this.list().filter((o) => (o.role === 'hider' || o.role === 'seeker') && !this.isGone(o));
  }

  /* ผู้ชมบินดูได้เองทั้งแมป กดปุ่มถัดไป/ก่อนหน้าเพื่อวาร์ปไปหาคนที่ยังเล่นอยู่
     (เดิมกล้องล็อกติดตัวผู้เล่น เลยเลื่อนไปดูมุมอื่นไม่ได้เลย) */
  /* ผู้ชม: เดินสำรวจแมปด้วยฟิสิกส์ปกติ (ชนกำแพง/ของ กระโดดได้) เหมือนยังเป็นผู้เล่น
     กดปุ่มถัดไป/ก่อนหน้าเพื่อวาร์ปไปยืนข้างคนที่ยังเล่นอยู่ */
  /* ผู้ชม: กล้องบินอิสระ เลื่อนดูได้ทั้งแมป ทะลุกำแพงได้ ไม่ตกพื้น
     กดปุ่มถัดไป/ก่อนหน้าเพื่อวาร์ปไปหาคนที่ยังเล่นอยู่ แล้วบินต่อจากตรงนั้นได้ */
  updateSpectators(dt) {
    const targets = this.spectateTargets();
    for (const p of this.players.values()) {
      if (p.bot || (p.role !== 'out' && p.role !== 'wait')) { p.specStep = 0; continue; }

      if (p.specStep && targets.length) {
        p.spec = ((p.spec + p.specStep) % targets.length + targets.length) % targets.length;
        const t = targets[p.spec];
        p.x = t.x; p.z = t.z;
        p.specName = t.name;
        p.specStep = 0;
      }
      p.specStep = 0;

      const inp = p.in || { f: 0, s: 0, yaw: 0 };
      if (inp.f || inp.s) {
        const sp = CFG.SPEC_SPEED * (dt || 1 / 30);
        const dx = Math.sin(inp.yaw) * inp.f - Math.cos(inp.yaw) * inp.s;
        const dz = Math.cos(inp.yaw) * inp.f + Math.sin(inp.yaw) * inp.s;
        const len = Math.hypot(dx, dz) || 1;
        const ox = this.map.w / 2 + CFG.SPEC_OUT, oz = this.map.d / 2 + CFG.SPEC_OUT;
        p.x = clamp(p.x + (dx / len) * sp, -ox, ox);
        p.z = clamp(p.z + (dz / len) * sp, -oz, oz);
      }
      p.y = CFG.SPEC_HEIGHT; p.vy = 0; p.ground = true;
      if (!p.specName && targets.length) p.specName = targets[p.spec % targets.length].name;
    }
  }



  update(dt) {
    if (this.phase === PHASE.LOBBY) {
      if (this.humans().length >= 1) {
        this.timer -= dt;
        if (this.timer <= 0) this.startRound();
      } else this.timer = CFG.LOBBY_WAIT;
    } else {
      this.timer -= dt;
      if (this.phase === PHASE.HIDE && this.timer <= 0) this.toHunt();
      else if (this.phase === PHASE.HUNT) {
        if (this.timer <= 0) this.endRound('time');
        else if (this.hidersAlive() === 0) this.endRound('caught');
        else if (this.seekerCount() === 0) this.endRound('seekersOut');
      } else if (this.phase === PHASE.END && this.timer <= 0) {
        if (this.humans().length >= 1) this.startRound();
        else { this.clearBots(); this.toLobby(); }
      }
    }
    for (const p of this.players.values()) {
      if (p.bot) { this.thinkBot(p, dt); this.updatePlayer(p, dt); continue; }
      if (p.inQ && p.inQ.length) {
        // จำลองทีละอินพุต ตำแหน่งบนเซิร์ฟเวอร์จึงตรงกับเลข ack ที่ส่งกลับเสมอ
        let n = 0;
        while (p.inQ.length && n < 8) {
          const it = p.inQ.shift();
          p.in.f = it.f; p.in.s = it.s; p.in.yaw = it.yaw; p.in.seq = it.q;
          if (it.j) p.wantJump = true;
          this.updatePlayer(p, 1 / CFG.TICK_HZ);
          n++;
        }
      } else {
        // ติ๊กนี้ไม่มีอินพุตมา: ไม่เดิน (อินพุตที่ตามมาทีหลังจะถูกจำลองให้ครบเอง)
        p.in.f = 0; p.in.s = 0;
        this.updatePlayer(p, dt);
      }
    }
    this.updateSpectators(dt);
  }

  /* คนซ่อนวิ่งได้ มีหลอดพลัง วิ่งได้ 3 วินาทีแล้วต้องพัก */
  runFactor(p, dt) {
    if (p.role !== 'hider') { p.run = false; p.stamina = CFG.RUN_MAX; return 1; }
    const moving = p.in && (p.in.f !== 0 || p.in.s !== 0);
    if (p.run && moving && p.stamina > 0) {
      p.stamina = Math.max(0, p.stamina - dt);
      if (p.stamina === 0) p.run = false;
      return CFG.SPD_RUN;
    }
    p.stamina = Math.min(CFG.RUN_MAX, p.stamina + dt / CFG.RUN_REGEN);
    return 1;
  }

  speedOf(p) {
    if (this.phase === PHASE.END) return 0;
    if (p.role === 'out' || p.role === 'wait') return 0;   // ผู้ชมใช้กล้องบิน จัดการแยกใน updateSpectators
    if (p.locked) return 0;                         // ล็อกท่าไว้ ไม่ให้ขยับเผลอ ๆ
    if (this.phase === PHASE.HIDE && p.role === 'seeker') return 0;
    let s = p.role === 'seeker' ? CFG.SPD_SEEKER : CFG.SPD_HIDER;
    if (p.slow > 0) s *= CFG.SLOW_MULT;
    return s;
  }

  updatePlayer(p, dt) {
    p.cd = Math.max(0, p.cd - dt);
    p.slow = Math.max(0, p.slow - dt);
    p.swing = Math.max(0, p.swing - dt);
    p.yaw = p.in.yaw;

    // กระโดด — ล็อกท่าอยู่ก็ยังกระโดดได้ ล็อกแค่การเดินเท่านั้น
    if (p.wantJump) {
      p.wantJump = false;
      // ผู้ชม (out/wait) กระโดดได้เหมือนผู้เล่น จะได้เดินสำรวจแมปได้ครบ
      const canMoveAtAll = this.phase !== PHASE.END
        && !(this.phase === PHASE.HIDE && p.role === 'seeker');
      if (p.ground && canMoveAtAll) { p.vy = CFG.JUMP_V; p.ground = false; }
    }
    // พื้นใต้ตัวอาจเป็นยอดของกล่อง/โต๊ะที่กระโดดขึ้นไปยืนได้
    const gh = floorAt(p.x, p.z, p.y, this.map);
    if (p.hold) { p.vy = 0; p.ground = true; }               // เกาะ/ค้างอยู่ ไม่ตก
    else if (p.ground && p.y > gh + 0.02) p.ground = false;   // เดินตกจากขอบ
    if (!p.ground) {
      p.vy -= CFG.GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y <= gh && p.vy <= 0) { p.y = gh; p.vy = 0; p.ground = true; }
    }

    const f = clamp(p.in.f, -1, 1);
    const s = clamp(p.in.s, -1, 1);
    const dx = Math.sin(p.yaw) * f - Math.cos(p.yaw) * s;
    const dz = Math.cos(p.yaw) * f + Math.sin(p.yaw) * s;
    const len = Math.hypot(dx, dz);
    const spd = this.speedOf(p) * this.runFactor(p, dt);
    if (len > 0.01 && spd > 0) {
      const k = (Math.min(1, len) / len) * spd * dt;
      this.moveAxis(p, dx * k, 0);
      this.moveAxis(p, 0, dz * k);
      p.moving = true;
    } else p.moving = false;

    if (p.role === 'hider' && this.phase === PHASE.HUNT) {
      p.score += CFG.PTS_SURVIVE * dt;
      p.roundScore += CFG.PTS_SURVIVE * dt;
    }

    p.ack = p.in.seq;

    // ร่างที่ปลอมตัวหันไปตามมุมกล้อง หันตัวไปทางไหนของก็หันตาม
    if (p.role === 'hider' && !p.locked) {
      let a = p.yaw % (Math.PI * 2);
      if (a < 0) a += Math.PI * 2;
      p.propRy = a;
    }
    p.turn = 0;
    if (p.wantLock) {
      p.wantLock = 0;
      if (p.role === 'hider') {
        p.locked = !p.locked;
        p.hold = false;
        if (p.locked) {
          // ร่างที่แขวนผนังได้ + อยู่ใกล้ผนัง → เกาะขึ้นไปแขวนบนผนัง
          const mh = WALL_MOUNT[p.prop];
          const face = mh ? nearestWallFace(p.x, p.z, this.walls, WALL_REACH) : null;
          if (face) {
            p.x = face.x; p.z = face.z; p.y = mh; p.vy = 0; p.propRy = face.ry;
            p.hold = true; p.ground = true;
            this.tell(p, 'เกาะผนังแล้ว');
          } else if (!p.ground) {
            // ล็อกกลางอากาศ ค้างอยู่ตรงนั้นเลย
            p.hold = true; p.vy = 0; p.ground = true;
            this.tell(p, 'ล็อกค้างกลางอากาศแล้ว');
          } else this.tell(p, 'ล็อกท่าแล้ว');
        } else {
          p.ground = false;                       // ปลดล็อกแล้วตกลงมาตามปกติ
          this.tell(p, 'ปลดล็อกแล้ว');
        }
      }
    }

    if (p.wantReroll) { p.wantReroll = false; this.doReroll(p); }
    if (p.wantRevive) { p.wantRevive = false; this.doRevive(p); }
    if (p.wantHit) { p.wantHit = false; this.doHit(p); }
  }

  moveAxis(p, dx, dz) {
    const R = CFG.R;
    p.x = clamp(p.x + dx, -this.map.w / 2 + R, this.map.w / 2 - R);
    p.z = clamp(p.z + dz, -this.map.d / 2 + R, this.map.d / 2 - R);
    for (const w of this.walls) {
      if (w.h <= 1.5 && p.y >= w.h - 0.5) continue;      // รั้วเตี้ยกระโดดข้ามได้
      if (p.x + R > w.x && p.x - R < w.x + w.w && p.z + R > w.z && p.z - R < w.z + w.d) {
        // ดันออกทางด้านที่จมน้อยที่สุด (ถ้าดันตามแกนที่เดินอย่างเดียว เวลายืนชิดกำแพงยาว ๆ จะโดนเหวี่ยงไปสุดกำแพง)
        const px1 = (p.x + R) - w.x, px2 = (w.x + w.w) - (p.x - R);
        const pz1 = (p.z + R) - w.z, pz2 = (w.z + w.d) - (p.z - R);
        const m = Math.min(px1, px2, pz1, pz2);
        if (m === px1) p.x = w.x - R;
        else if (m === px2) p.x = w.x + w.w + R;
        else if (m === pz1) p.z = w.z - R;
        else p.z = w.z + w.d + R;
      }
    }
    solveProps(p, dx, dz, R, this.map);
  }

  /* ---- ปัญญาประดิษฐ์ของบอท ---- */

  thinkBot(p, dt) {
    if (this.phase === PHASE.END || this.phase === PHASE.LOBBY) { p.in.f = 0; return; }
    if (this.phase === PHASE.HIDE && p.role === 'seeker') { p.in.f = 0; return; }

    // ตรวจว่าติดมุมหรือเปล่า
    const moved = Math.hypot(p.x - p.lastX, p.z - p.lastZ);
    p.lastX = p.x; p.lastZ = p.z;
    if (p.in.f > 0 && moved < 0.02) p.stuck += dt; else { p.stuck = 0; p.stuckHard = 0; }
    if (p.strafe > 0) p.strafe -= dt;
    if (p.stuck > 0.25) {
      // ติดของอยู่ ลองกระโดด (เผื่อเป็นของเตี้ย) และเดินเฉียงออกข้างสักครู่
      if (p.ground) p.wantJump = true;
      p.strafe = 0.45;
      p.strafeDir = Math.random() < 0.5 ? -1 : 1;
      p.stuck = 0;
      p.stuckHard = (p.stuckHard || 0) + 1;
      p.path = null;
      // ย่ำอยู่กับที่หลายรอบติด แปลว่าเป้าหมายเข้าไม่ถึง เปลี่ยนเป้าใหม่เลย
      if (p.stuckHard >= 2) {
        if (p.chase) {
          // เป้านี้เข้าไม่ถึง พักไว้ก่อนสัก 6 วินาที ไปตรวจที่อื่นแทน
          p.ignore = p.ignore || {};
          p.ignore[p.chase.id] = Date.now() + 6000;
        }
        p.dest = null; p.chase = null; p.stuckHard = 0;
      }
    }

    p.think -= dt;
    if (p.role === 'hider') this.botHider(p);
    else this.botSeeker(p, dt);
    this.followPath(p);
  }

  botHider(p) {
    if (p.think > 0 && p.dest) return;
    p.think = rnd(0.6, 1.4);

    if (!p.dest && this.map.hidingSpots && this.map.hidingSpots.length && Math.random() < 0.6) {
      // ผังแนะนำจุดซ่อนไว้ ใช้เฉพาะจุดที่มีของชนิดเดียวกับร่างเราอยู่ใกล้ ๆ (ไม่งั้นไปยืนแล้วก็โดดเด่นอยู่ดี)
      const same = this.propsByType.get(p.prop) || [];
      const spots = this.map.hidingSpots.filter((h) => same.some((q) => Math.hypot(q.x - h.x, q.z - h.z) < 6));
      const weighted = spots.flatMap((h) => (h.popular ? [h, h] : [h]));
      const hsp = weighted.length ? pick(weighted) : null;
      if (hsp && !blocked(hsp.x, hsp.z, 0.1, this.map)) {
        p.dest = { x: hsp.x, z: hsp.z };
        p.path = findPath(p.x, p.z, hsp.x, hsp.z, this.map);
      }
    }
    if (!p.dest) {
      const all = this.propsByType.get(p.prop) || [];
      // เลือกจากของชนิดเดียวกันที่ใกล้ที่สุดหกชิ้น จะได้ไปถึงทันก่อนหมดเวลาซ่อน
      // และไม่ต้องเดินฝ่าของเต็มร้านไปไกล ๆ จนติดระหว่างทาง
      const spots = all
        .map((q) => ({ q, d: Math.hypot(q.x - p.x, q.z - p.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map((e) => e.q);
      let target = null;
      for (let i = 0; i < 20 && !target; i++) {
        const pr = spots.length ? pick(spots) : null;
        const base = pr || { x: rnd(-25, 25), z: rnd(-18, 18) };
        const a = rnd(0, Math.PI * 2);
        const x = base.x + Math.cos(a) * rnd(1.0, 1.9);
        const z = base.z + Math.sin(a) * rnd(1.0, 1.9);
        if (!blocked(x, z, 0.12, this.map)) target = { x, z };
      }
      p.dest = target || freeSpot(this.map);
      p.path = findPath(p.x, p.z, p.dest.x, p.dest.z, this.map);
      p.settled = false;
    }

    // ถ้าคนหาเข้ามาใกล้มากตอนอยู่นิ่ง มีโอกาสตกใจแล้ววิ่งหนี
    if (p.settled && this.phase === PHASE.HUNT) {
      for (const o of this.players.values()) {
        if (o.role !== 'seeker') continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) < 3 && Math.random() < 0.25) {
          p.dest = null; p.settled = false;
          break;
        }
      }
    }
  }

  botSeeker(p, dt) {
    if (this.phase !== PHASE.HUNT) return;

    // มองหาเป้าหมายเป็นระยะ ไม่ได้รู้ทุกอย่างทันที
    if (p.think <= 0) {
      p.think = rnd(0.4, 0.8);
      let best = null, bd = 11;
      for (const o of this.players.values()) {
        if (o.role !== 'hider') continue;
        if (p.ignore && p.ignore[o.id] > Date.now()) continue;
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d > bd) continue;
        if (!clearLine(p.x, p.z, o.x, o.z, this.walls, 0.3)) continue;
        const notice = o.moving ? 0.85 : (d < 3.5 ? 0.4 : d < 6 ? 0.2 : 0.07);
        if (Math.random() > notice) continue;
        bd = d; best = o;
      }
      if (best) { p.chase = best; p.chaseFor = rnd(3, 5); }
      else if (!p.dest) {
        // เดินตรวจเข้าไปในร้านทีละคูหา ไม่ใช่วนอยู่แต่ทางเดินกลาง
        const nodes = this.map.nav.nodes;
        const deep = nodes.filter((n) => Math.abs(n.z) >= 10);
        const pool = deep.length ? deep : nodes;
        let n = pick(pool);
        for (let i = 0; i < 8; i++) {
          const c = pick(pool);
          if (Math.hypot(c.x - p.x, c.z - p.z) > Math.hypot(n.x - p.x, n.z - p.z)) n = c;
          if (Math.hypot(n.x - p.x, n.z - p.z) > 16) break;
        }
        p.dest = { x: n.x, z: n.z };
        p.path = findPath(p.x, p.z, p.dest.x, p.dest.z, this.map);
      }
    }

    if (p.chase) {
      p.chaseFor -= dt;
      const o = p.chase;
      const alive = o.role === 'hider' && this.players.has(o.id);
      const d = alive ? Math.hypot(o.x - p.x, o.z - p.z) : 99;
      if (!alive || d > 12 || p.chaseFor <= 0) {
        p.chase = null; p.dest = null; p.path = null;
      } else {
        // หาเส้นทางใหม่เป็นระยะ ถ้าตรงถึงกันได้ก็วิ่งตรง ไม่งั้นอ้อมตามจุดเดิน
        p.rePath = (p.rePath || 0) - dt;
        const straight = clearLine(p.x, p.z, o.x, o.z, this.walls, 0.3)
          && !propsBetween(p.x, p.z, o.x, o.z, this.map);
        if (straight) {
          p.dest = { x: o.x, z: o.z };
          p.path = [{ x: o.x, z: o.z }];
        } else if (p.rePath <= 0 || !p.path || !p.path.length) {
          p.dest = { x: o.x, z: o.z };
          p.path = findPath(p.x, p.z, o.x, o.z, this.map);
          p.rePath = 0.5;
        }
        if (d < CFG.CATCH_RANGE * 0.8 && p.cd <= 0 && Math.random() < 0.7) {
          // เล็งไม่เป๊ะเสมอไป บางทีก็ตีพลาดเหมือนคนเล่นทั่วไป
          p.in.yaw = Math.atan2(o.x - p.x, o.z - p.z) + rnd(-0.16, 0.16);
          p.wantHit = true;
        }
      }
    } else if (p.cd <= 0 && Math.random() < 0.0015) {
      // เผลอตีของจริงบ้าง ให้ดูเหมือนคนเล่น
      p.wantHit = true;
    }
  }

  followPath(p) {
    if (!p.path || !p.path.length) {
      p.in.f = 0;
      if (p.dest) { p.settled = true; p.dest = p.role === 'hider' ? p.dest : null; }
      return;
    }
    const wp = p.path[0];
    const dx = wp.x - p.x, dz = wp.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < (p.path.length > 1 ? 1.1 : 0.6)) {
      p.path.shift();
      if (!p.path.length) { p.in.f = 0; p.settled = true; }
      return;
    }
    p.in.yaw = Math.atan2(dx, dz);
    p.in.f = 1;
    p.in.s = p.strafe > 0 ? p.strafeDir : 0;
  }

  /* ---- การกระทำ ---- */

  doReroll(p) {
    if (p.role !== 'hider') return this.tell(p, 'คนหาเปลี่ยนร่างไม่ได้');
    if (this.phase !== PHASE.HIDE && this.phase !== PHASE.HUNT) return;
    const pool = p.user.unlocked.filter((t) => t !== p.prop && this.propsByType.has(t));
    if (!pool.length) return this.tell(p, 'ไม่มีร่างอื่นที่มีในด่านนี้ ไปสุ่มเพิ่มที่ร้านค้าก่อน');
    // ครั้งแรกของรอบฟรี หลังจากนั้นต้องรอ cooldown ไม่มีการจ่ายทอง (ทองไม่ควรซื้อความได้เปรียบ)
    const now = Date.now();
    if (p.rerollAt && now - p.rerollAt < CFG.REROLL_CD * 1000) {
      const left = Math.ceil((CFG.REROLL_CD * 1000 - (now - p.rerollAt)) / 1000);
      return this.tell(p, `เปลี่ยนร่างได้อีกใน ${left} วินาที`);
    }
    p.rerollAt = now;
    p.prop = pick(pool);
    p.propRy = rnd(0, Math.PI * 2);
    p.dest = null; p.path = null;
    this.fx.push({ k: 'poof', x: r2(p.x), z: r2(p.z) });
    this.tell(p, 'เปลี่ยนร่างแล้ว');
  }

  tell(p, msg) {
    if (p.socket) p.socket.emit('toast', msg);
  }

  /* โดนจับเร็วเกินไป (ในครึ่งแรกของช่วงล่า) ให้เกิดใหม่เป็นคนซ่อนได้ฟรีหนึ่งครั้งต่อรอบ
     จะได้ไม่ต้องนั่งดูยาว ๆ เพราะพลาดตอนต้นเกม */
  /* หน้าต่างเกิดใหม่นับจากตอนที่ "ตัวเอง" โดนจับ (ไม่ใช่นับจากเวลาในรอบ)
     ทุกคนจึงได้เวลาตัดสินใจเท่ากันเสมอ กดไม่ทันก็ดูจนจบรอบ */
  reviveLeft(p) {
    if (!p.deadAt) return 0;
    return Math.max(0, CFG.REVIVE_WINDOW - (Date.now() - p.deadAt) / 1000);
  }
  canRevive(p) {
    return p.role === 'out' && this.phase === PHASE.HUNT && !p.revived && !p.bot
      && this.reviveLeft(p) > 0
      && this.timer >= CFG.REVIVE_MIN_TIME
      && (p.user.gold || 0) >= CFG.REVIVE_COST;
  }

  /* เกิดใหม่เป็นคนซ่อนที่เดิม ไม่ใช่ไปเข้าทีมหา */
  doRevive(p) {
    if (p.role !== 'out' || this.phase !== PHASE.HUNT) return this.tell(p, 'ตอนนี้เกิดใหม่ไม่ได้');
    if (p.revived) return this.tell(p, 'รอบนี้เกิดใหม่ไปแล้ว');
    if (this.reviveLeft(p) <= 0) return this.tell(p, 'หมดเวลาตัดสินใจแล้ว ดูรอบนี้จนจบนะ');
    if (this.timer < CFG.REVIVE_MIN_TIME) {
      return this.tell(p, 'เหลือเวลาในรอบน้อยเกินไป เกิดใหม่ไม่ได้');
    }
    if ((p.user.gold || 0) < CFG.REVIVE_COST) {
      return this.tell(p, `ทองไม่พอ ต้องใช้ ${CFG.REVIVE_COST} ทอง`);
    }
    if (!p.bot) { store.addGold(p.user, -CFG.REVIVE_COST); store.flushNow(); }
    p.revived = true;
    p.deadAt = 0;
    p.role = 'hider';
    p.locked = false; p.hold = false;
    p.misses = 0; p.cd = 0; p.slow = 0;
    p.rerollAt = 0;
    const s = this.spawnFor('hider');
    p.x = s.x; p.z = s.z; p.y = 0; p.vy = 0; p.ground = true;
    p.prop = this.pickPropFor(p.user, null, s);
    p.propRy = rnd(0, Math.PI * 2);
    this.fx.push({ k: 'revive', x: r2(p.x), z: r2(p.z), n: p.name });
    this.tell(p, `เกิดใหม่แล้ว (จ่าย ${CFG.REVIVE_COST} ทอง) รีบไปหาที่ซ่อน`);
  }

  doHit(p) {
    if (p.role !== 'seeker' || this.phase !== PHASE.HUNT || p.cd > 0) return;
    p.swing = 0.3;
    let target = null, bd = CFG.CATCH_RANGE;
    for (const o of this.players.values()) {
      if (o.role !== 'hider' || this.isGone(o)) continue;     // คนที่หลุดอยู่จับไม่ได้
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d > bd) continue;
      const ang = Math.atan2(o.x - p.x, o.z - p.z);
      if (Math.abs(angDiff(ang, p.yaw)) > CFG.CATCH_ARC / 2) continue;
      bd = d; target = o;
    }
    if (target) {
      p.cd = CFG.HIT_CD;
      p.score += CFG.PTS_CATCH;
      p.roundScore += CFG.PTS_CATCH;
      p.catches += 1;
      target.role = 'out';
      target.locked = false; target.hold = false;
      target.cd = 0;
      target.deadAt = Date.now();
      target.dest = null; target.path = null; target.chase = null;
      this.fx.push({ k: 'catch', x: r2(target.x), z: r2(target.z) });
      this.fx.push({ k: 'feed', a: p.name, b: target.name });
    } else {
      p.cd = CFG.MISS_CD;
      p.slow = CFG.MISS_SLOW;
      p.misses += 1;
      if (p.misses >= CFG.MAX_MISS) {
        // หัวใจหมด ออกจากรอบไปนั่งดูเลย
        p.role = 'out';
        p.deadAt = 0;
        p.locked = false;
        this.tell(p, 'หัวใจหมดแล้ว รอรอบถัดไปนะ');
        this.fx.push({ k: 'feed', a: p.name, b: '', out: 1 });
      } else this.tell(p, `ต่อยผิด เหลือหัวใจอีก ${CFG.MAX_MISS - p.misses} ดวง`);
      this.fx.push({
        k: 'miss',
        x: r2(p.x + Math.sin(p.yaw) * 1.4),
        z: r2(p.z + Math.cos(p.yaw) * 1.4),
      });
    }
  }

  /* ---- ส่งสถานะ ---- */

  /* วัตถุทั้งหมดถูกอัดเป็น Int16Array ก้อนเดียว แล้วส่งครั้งเดียวให้ทั้งห้อง
     ประหยัดทั้งแบนด์วิดท์และเวลา serialize ซึ่งเป็นสาเหตุหลักของอาการกระตุก
     ต่อวัตถุหนึ่งชิ้นใช้ 6 ช่อง: id, x*100, z*100, ดัชนีชนิด, มุม*1000, กำลังขยับ */
  /* เรียงแถวข้อมูลวัตถุทั้งห้องไว้ครั้งเดียวต่อติ๊ก แล้วค่อยตัดตามระยะมองของแต่ละคน */
  /* สตรีมเฉพาะคนซ่อนที่ปลอมตัว (ของประจำฉากส่งไปแล้วตอนโหลดแมป)
     ยังคัดตามระยะมองอยู่ เพื่อกันโกงไม่ให้รู้ตำแหน่งคนซ่อนอีกฝั่งแมป */
  buildRows(hiders) {
    const rows = new Array(hiders.length);
    let k = 0;
    for (const o of hiders) {
      rows[k++] = [o.pid, Math.round(o.x * 100), Math.round(o.z * 100),
        TYPE_IDX.get(o.prop) || 0, Math.round(o.propRy * 1000) % 6283,
        (o.moving ? 1 : 0) | (Math.min(300, Math.round(o.y * 100)) << 1)];
    }
    rows.sort((a, b) => a[0] - b[0]);
    return rows;
  }

  /* ตัดเฉพาะของที่อยู่ในระยะมองของผู้เล่นคนนั้น ประหยัดแบนด์วิดท์ไปมาก
     และยังเป็นการกันโกงด้วย เพราะคนซ่อนที่อยู่คนละมุมห้างจะไม่ถูกส่งไปเลย */
  /* ส่งครบทุกคนไม่คัดระยะ ใช้กับคนซ่อน (เห็นเพื่อนร่วมทีมทั้งแมป) และผู้ชม
     การกันโกงยังอยู่: คนหาเท่านั้นที่ถูกคัดตามระยะมอง */
  packAll(rows) {
    const buf = new Int16Array(rows.length * 6);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], o = i * 6;
      buf[o] = r[0]; buf[o + 1] = r[1]; buf[o + 2] = r[2];
      buf[o + 3] = r[3]; buf[o + 4] = r[4]; buf[o + 5] = r[5];
    }
    return buf;
  }

  packFor(rows, px, pz) {
    const lim = CFG.VIEW_R * 100;
    const cx = Math.round(px * 100), cz = Math.round(pz * 100);
    const keep = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (Math.abs(r[1] - cx) > lim || Math.abs(r[2] - cz) > lim) continue;
      keep.push(r);
    }
    const buf = new Int16Array(keep.length * 6);
    for (let i = 0; i < keep.length; i++) {
      const r = keep[i];
      const o = i * 6;
      buf[o] = r[0]; buf[o + 1] = r[1]; buf[o + 2] = r[2];
      buf[o + 3] = r[3]; buf[o + 4] = r[4]; buf[o + 5] = r[5];
    }
    return buf;
  }

  /* แพ็กทั้งห้องแบบไม่ตัดระยะ ใช้ในเทสต์ */
  packObjects(hiders) {
    const rows = this.buildRows(hiders);
    const buf = new Int16Array(rows.length * 6);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const o = i * 6;
      buf[o] = r[0]; buf[o + 1] = r[1]; buf[o + 2] = r[2];
      buf[o + 3] = r[3]; buf[o + 4] = r[4]; buf[o + 5] = r[5];
    }
    return buf;
  }

  broadcast() {
    const hiders = [], seekers = [];
    for (const o of this.players.values()) {
      if (o.role === 'hider') hiders.push(o);
      else if (o.role === 'seeker') seekers.push(o);
    }

    const rows = this.buildRows(hiders);
    const sk = seekers.map((o) => ({
      i: o.pid, x: r2(o.x), z: r2(o.z), y: r2(o.yaw),
      n: o.name, k: o.skin, w: o.swing > 0 ? 1 : 0, m: o.moving ? 1 : 0, h: r2(o.y),
    }));

    const bd = this.board();
    const roster = this.list()
      .sort((a, b) => b.score - a.score)
      .map((o) => ({
        n: o.name,
        r: this.isGone(o) ? 'dc' : o.role,
        b: o.bot ? 1 : 0,
        lv: o.bot ? (o.botLv || 1) : store.levelOf(o.user.xp || 0),
      }));

    /* สถานะเพื่อนของแต่ละคน ใช้โชว์ปุ่มแอดเพื่อนในรายชื่อระหว่างเล่น
       f = เป็นเพื่อนแล้ว, s = ส่งคำขอไปแล้ว, r = เขาส่งคำขอมาหาเรา */
    const friendState = (me) => {
      if (me.bot) return {};
      const out = {};
      for (const o of this.list()) {
        if (o.bot || o === me) continue;
        const k = store.key(o.name);
        out[o.name] = (me.user.friends || []).some((n) => store.key(n) === k) ? 'f'
          : (o.user.requests || []).some((n) => store.key(n) === store.key(me.name)) ? 's'
          : (me.user.requests || []).some((n) => store.key(n) === k) ? 'r' : '';
      }
      return out;
    };

    const fx = this.fx;
    this.fx = [];

    // ส่งครั้งเดียวให้ทั้งห้อง socket.io จะ serialize แค่รอบเดียว
    io.to(this.id).emit('w', {
      ph: this.phase,
      tl: Math.max(0, Math.ceil(this.timer)),
      hl: hiders.length,
      sc: seekers.length,
      tot: this.players.size,
      sk, fx, pl: roster,
      bd,
      res: this.phase === PHASE.END ? this.result : null,
    });

    for (const p of this.players.values()) {
      if (!p.socket) continue;
      p.socket.emit('m', {
        ob: (p.role === 'seeker' ? this.packFor(rows, p.x, p.z) : this.packAll(rows)).buffer,
        i: p.pid, x: r2(p.x), z: r2(p.z), name: p.name,
        role: p.role, prop: p.prop, pr: r2(p.propRy),
        score: Math.round(p.score),
        gold: p.user.gold,
        rr: CFG.REROLL_COST,
        pool: p.user.unlocked.length,
        cd: r2(p.cd), y: r2(p.y), vy: r2(p.vy), ack: p.ack, g: p.ground ? 1 : 0,
        lock: p.locked ? 1 : 0,
        run: p.run ? 1 : 0, sta: r2(p.stamina), staMax: CFG.RUN_MAX,
        hold: p.hold ? 1 : 0,
        // คนซ่อนเห็นชื่อเพื่อนร่วมทีม · ผู้ชมกับคนที่รอรอบหน้าเห็นชื่อทุกคน (ดูเพื่อนเล่นได้รู้เรื่อง)
        mates: p.role === 'hider'
          ? hiders.filter((o) => o !== p).map((o) => ({ i: o.pid, n: o.name }))
          : (p.role === 'out' || p.role === 'wait')
            ? this.list().filter((o) => o !== p && !this.isGone(o)
                && (o.role === 'hider' || o.role === 'seeker'))
              .map((o) => ({ i: o.pid, n: o.name, s: o.role === 'seeker' ? 1 : 0 }))
            : null,
        spec: (p.role === 'out' || p.role === 'wait') ? (p.specName || '') : '',
        lv: p.bot ? (p.botLv || 1) : store.progressOf(p.user.xp || 0).level,
        xpIn: p.bot ? 0 : store.progressOf(p.user.xp || 0).inLevel,
        xpNeed: p.bot ? 1 : (store.progressOf(p.user.xp || 0).need || 1),
        miss: p.misses, maxMiss: CFG.MAX_MISS,
        rev: this.canRevive(p) ? CFG.REVIVE_COST : 0,   // ราคาเกิดใหม่ 0 = เกิดใหม่ไม่ได้
        fr: friendState(p),
        revLeft: this.canRevive(p) ? Math.ceil(this.reviveLeft(p)) : 0,
        revWin: CFG.REVIVE_WINDOW,
        rrCd: p.rerollAt ? Math.max(0, Math.ceil(CFG.REROLL_CD - (Date.now() - p.rerollAt) / 1000)) : 0,
        // ความเร็วจริงที่เซิร์ฟเวอร์ใช้ (รวมตัวคูณวิ่ง) ไคลเอนต์จะได้ทำนายตรงกัน
        spd: r2(this.speedOf(p) * (p.role === 'hider' && p.run && p.stamina > 0 ? CFG.SPD_RUN : 1)),
      });
    }
  }
}

/* ----------------------------------------------------------------------- */
/* ห้องและสถานะออนไลน์                                                       */
/* ----------------------------------------------------------------------- */

const rooms = new Map();
const online = new Map();
const pending = new Map();          // ที่นั่งของคนที่เน็ตหลุด (key → {room, player})
let roomSeq = 0;

function newRoom() {
  while (rooms.has(ROOM_PREFIX + (roomSeq + 1))) roomSeq++;
  const r = new Room(ROOM_PREFIX + (++roomSeq));
  rooms.set(r.id, r);
  return r;
}

const ROOM_PREFIX = 'ห้อง ';
const MAX_ROOM_NO = 200;

/* รับได้ทั้งชื่อเต็ม "ห้อง 7" และเลขล้วน "7" ถ้ายังไม่มีห้องนั้นก็เปิดให้ใหม่ */
function roomIdFrom(want) {
  const m = String(want || '').match(/(\d{1,3})/);
  if (!m) return null;
  const no = parseInt(m[1], 10);
  if (!(no >= 1 && no <= MAX_ROOM_NO)) return null;
  return ROOM_PREFIX + no;
}

function findRoom(prefer) {
  const id = roomIdFrom(prefer);
  if (id) {
    if (rooms.has(id)) {
      const r = rooms.get(id);
      if (r.hasRoomFor()) return r;
    } else if (rooms.size < 60) {
      const r = new Room(id);
      rooms.set(id, r);
      return r;
    }
  }
  if (prefer && rooms.has(prefer) && rooms.get(prefer).hasRoomFor()) return rooms.get(prefer);
  let best = null;
  for (const r of rooms.values()) {
    if (!r.hasRoomFor()) continue;
    if (!best || r.humans().length > best.humans().length) best = r;
  }
  return best || newRoom();
}

function roomList() {
  const out = [];
  for (const r of rooms.values()) {
    out.push({
      id: r.id,
      players: r.humans().length,
      bots: r.bots().length,
      hiders: r.hidersAlive(),
      seekers: r.seekerCount(),
      phase: r.phase,
      tl: Math.max(0, Math.ceil(r.timer)),
      max: CFG.MAX_PLAYERS,
      // รายชื่อคนในห้อง ใช้โชว์ที่หน้าล็อบบี้
      roster: r.list()
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)
        .map((o) => ({
          n: o.name,
          r: o.role,
          b: o.bot ? 1 : 0,
          lv: o.bot ? (o.botLv || 1) : store.levelOf(o.user.xp || 0),
        })),
    });
  }
  return out.sort((a, b) => b.players - a.players);
}

/* ----------------------------------------------------------------------- */
/* REST API                                                                 */
/* ----------------------------------------------------------------------- */

function authed(req, res, next) {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const user = store.userByToken(token);
  if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
  req.user = user;
  req.token = token;
  next();
}

function reply(res, r) {
  if (r && r.error) return res.status(400).json(r);
  res.json(r);
}

app.post('/api/register', (req, res) => {
  const r = store.register(req.body && req.body.name, req.body && req.body.pw);
  store.flushNow();
  reply(res, r);
});
app.post('/api/login', (req, res) => {
  const r = store.login(req.body && req.body.name, req.body && req.body.pw);
  store.flushNow();
  reply(res, r);
});
app.post('/api/guest', (req, res) => reply(res, store.guest(req.body && req.body.name)));
app.post('/api/logout', authed, (req, res) => { store.logout(req.token); res.json({ ok: true }); });
app.get('/api/me', authed, (req, res) => res.json({ profile: store.publicProfile(req.user) }));

app.get('/api/shop', authed, (req, res) => res.json({
  gold: req.user.gold,
  items: store.shopFor(req.user),
  skins: store.skinsFor(req.user),
  cost: store.GACHA,
}));
app.post('/api/gacha', authed, (req, res) => {
  const kind = (req.body && req.body.kind) === 'skin' ? 'skin' : 'prop';
  const r = store.draw(req.user, kind);
  store.flushNow();
  reply(res, r);
});
app.get('/api/avatars', authed, (_req, res) => res.json({ list: store.AVATARS }));
app.post('/api/avatar', authed, (req, res) => {
  const r = store.setAvatar(req.user, req.body && req.body.emoji);
  store.flushNow();
  reply(res, r);
});
app.post('/api/avatar/image', authed, (req, res) => {
  const r = store.setAvatarImage(req.user, req.body && req.body.img);
  store.flushNow();
  reply(res, r);
});
app.post('/api/skin/select', authed, (req, res) => reply(res, store.setSkin(req.user, req.body && req.body.id)));

/* ผังด่านสำหรับวาดฉากหลังในหน้าล็อบบี้ก่อนเข้าเกม */
app.get('/api/map', (req, res) => {
  const m = LAYOUTS[String(req.query.name || '')] || DEFAULT_MAP;
  res.json({
    key: m.key, name: m.name, theme: m.theme, w: m.w, d: m.d, r: CFG.R,
    walls: m.walls,
    zones: m.zones || [],
    types: PROP_TYPES,
    props: m.props.map((p) => ({ t: p.t, x: p.x, z: p.z, r: p.ry, y: p.y || 0 })),
    maps: MAP_ORDER.map((k) => ({ key: k, name: LAYOUTS[k].name })),
  });
});

app.get('/api/rooms', authed, (_req, res) => res.json({
  rooms: roomList(), max: CFG.MAX_PLAYERS, maxRoomNo: MAX_ROOM_NO,
}));

app.get('/api/friends', authed, (req, res) => res.json(store.friendState(req.user, online)));
app.post('/api/friends/add', authed, (req, res) => reply(res, store.sendRequest(req.user, req.body && req.body.name)));
app.post('/api/friends/accept', authed, (req, res) => reply(res, store.accept(req.user, req.body && req.body.name)));
app.post('/api/friends/decline', authed, (req, res) => reply(res, store.decline(req.user, req.body && req.body.name)));
app.post('/api/friends/remove', authed, (req, res) => reply(res, store.removeFriend(req.user, req.body && req.body.name)));

/* ----------------------------------------------------------------------- */
/* Socket                                                                   */
/* ----------------------------------------------------------------------- */

io.on('connection', (socket) => {
  let room = null, player = null, ukey = null;

  socket.on('join', (d) => {
    // กลับเข้ามาหลังเน็ตหลุด: คืนบทบาท ร่าง ตำแหน่งเดิม
    {
      const tok = d && d.token;
      const u0 = tok ? store.userByToken(tok) : null;
      const held = u0 ? pending.get(store.key(u0.name)) : null;
      if (held && held.room && rooms.get(held.room.id) === held.room && held.room.players.get(held.player.id)) {
        pending.delete(store.key(u0.name));
        room = held.room; player = held.player;
        player.socket = socket; player.gone = 0;
        ukey = store.key(u0.name); online.set(ukey, { room: room.id, sid: socket.id });
        socket.join(room.id);
        socket.emit('init', initPayload(room, player));
        socket.emit('toast', 'กลับเข้าห้องเดิมแล้ว เล่นต่อได้เลย');
        room.fx.push({ k: 'back', n: player.name });
        return;
      }
    }
    if (room) return;
    const user = store.userByToken(d && d.token);
    if (!user) { socket.emit('kick', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); return; }
    ukey = store.key(user.name);
    /* บัญชีเดียวกันต่อเข้ามาซ้ำ (มักเป็นตอนเน็ตสะดุดแล้วต่อใหม่ก่อนที่การเชื่อมต่อเก่าจะหมดเวลา)
       ให้การเชื่อมต่อใหม่ชนะ แล้วปิดอันเก่าแทน ไม่งั้นคนที่ต่อกลับมาจะโดนเตะออกไปล็อบบี้ */
    const prev = online.get(ukey);
    if (prev && prev.sid && prev.sid !== socket.id) {
      const old = io.sockets.sockets.get(prev.sid);
      if (old) {
        old.emit('kick', 'บัญชีนี้เข้าสู่ระบบจากอุปกรณ์อื่นแล้ว');
        old.disconnect(true);
      }
      online.delete(ukey);
    }

    room = findRoom(d && d.room);
    player = room.add(socket, user);
    socket.join(room.id);
    online.set(ukey, { room: room.id, sid: socket.id });

    socket.emit('init', initPayload(room, player));
    room.fx.push({ k: 'join', n: player.name });
  });

  /* เก็บอินพุตเป็นคิว แล้วเซิร์ฟเวอร์จำลองให้ทีละอินพุต (อินพุตละหนึ่งก้าว)
     เดิมเขียนทับค่าล่าสุดแล้วใช้ติ๊กละครั้ง พอเน็ตแกว่งจนอินพุตสองอันมาถึงในติ๊กเดียว
     เซิร์ฟเวอร์จะเดินน้อยกว่าที่ไคลเอนต์ทำนาย ตัวละครเลยถูกดึงถอยหลังเป็นจังหวะ = เดินกระตุก */
  socket.on('in', (d) => {
    if (!player || !d) return;
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
    const item = { f: clamp(num(d.f), -1, 1), s: clamp(num(d.s), -1, 1), yaw: num(d.yaw),
      q: num(d.q), j: !!d.j };
    if (!player.inQ) player.inQ = [];
    player.inQ.push(item);
    if (player.inQ.length > 30) player.inQ.shift();   // กันคิวยาวเกินตอนเน็ตค้างนาน
  });

  /* ขอเป็นเพื่อนจากรายชื่อในเกม ไม่ต้องออกไปหน้าล็อบบี้ */
  socket.on('friendAdd', (name) => {
    if (!player || player.bot || typeof name !== 'string') return;
    const target = room && room.list().find((o) => !o.bot && o.name === name);
    if (!target) return socket.emit('toast', 'ไม่พบผู้เล่นคนนี้ในห้อง');
    const r = store.sendRequest(player.user, name);
    store.flushNow();
    socket.emit('toast', r.error || `ส่งคำขอเป็นเพื่อนถึง ${name} แล้ว`);
    if (!r.error && target.socket) target.socket.emit('toast', `${player.name} ขอเป็นเพื่อน`);
  });

  socket.on('act', (k) => {
    if (!player) return;
    if (k === 'hit') player.wantHit = true;
    else if (k === 'reroll') player.wantReroll = true;
    else if (k === 'jump') player.wantJump = true;
    else if (k === 'revive') player.wantRevive = true;
    else if (k === 'turnL') player.turn = -1;
    else if (k === 'turnR') player.turn = 1;
    else if (k === 'lock') player.wantLock = 1;
    else if (k === 'run') player.run = true;
    else if (k === 'runOff') player.run = false;
    else if (k === 'specNext') player.specStep = 1;
    else if (k === 'specPrev') player.specStep = -1;
  });

  socket.on('chat', (txt) => {
    if (!room || !player) return;
    const t = String(txt || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80);
    if (!t) return;
    const now = Date.now();
    if (now - (player.lastChat || 0) < 700) return;
    player.lastChat = now;
    room.fx.push({ k: 'chat', n: player.name, t });
  });

  socket.on('leave', () => cleanup(true));
  socket.on('disconnect', () => cleanup(false));

  function cleanup(explicit) {
    if (ukey) {
      const cur = online.get(ukey);
      if (!cur || !cur.sid || cur.sid === socket.id) online.delete(ukey);
      ukey = null;
    }
    if (!room || !player) return;
    // โดนหักทองเฉพาะกดออกเองกลางช่วงล่า
    const mid = room.phase === PHASE.HUNT
      && (player.role === 'hider' || player.role === 'seeker');
    // เน็ตหลุดตอนไหนก็เก็บที่นั่งไว้ให้ ไม่ใช่เฉพาะช่วงล่า
    // (หลุดตอนช่วงซ่อนแล้วกลับมาได้บทบาทใหม่ ทำให้เล่นกับเพื่อนแล้วงงว่าทำไมร่างเปลี่ยน)
    const inGame = player.role === 'hider' || player.role === 'seeker'
      || player.role === 'out' || player.role === 'wait';
    if (inGame && !player.bot && !explicit) {
      // เก็บที่ไว้ให้ 60 วินาที กลับเข้าห้องเดิมทันไม่โดนหักทอง
      player.socket = null;
      player.gone = Date.now();
      player.in = { f: 0, s: 0, yaw: player.in ? player.in.yaw : 0, seq: 0 };
      pending.set(store.key(player.user.name), { room, player });
      room.fx.push({ k: 'dc', n: player.name });
      try { socket.leave(room.id); } catch (e) {}
      room = null; player = null;
      return;
    }
    // กดออกเองกลางช่วงล่า โดนหักทอง (ช่วงซ่อนตอนต้นรอบยังออกได้ฟรี)
    if (mid && !player.bot && explicit) {
      store.addGold(player.user, -CFG.LEAVE_PENALTY);
      store.flushNow();
    }
    room.fx.push({ k: 'left', n: player.name });
    room.remove(player.id);
    try { socket.leave(room.id); } catch (e) {}
    if (room.humans().length === 0) rooms.delete(room.id);
    else if (room.phase === PHASE.HUNT && room.hidersAlive() === 0) room.endRound('caught');
    room = null; player = null;
  }
});

/* ----------------------------------------------------------------------- */

const STEP = 1 / CFG.TICK_HZ;
const NET_STEP = 1 / CFG.NET_HZ;
let last = Date.now();
let acc = 0;

/* เดินเกมทีละก้าวขนาดเท่ากันเสมอ ไคลเอนต์จึงจำลองตามได้ตรงเป๊ะ
   ถ้าเครื่องหน่วงไปหลายก้าว ก็เดินให้ครบทีเดียว แทนที่จะใช้ dt ก้อนใหญ่ก้อนเดียว */
/* ข้อมูลตั้งต้นที่ส่งให้ไคลเอนต์ตอนเข้าห้อง — ใช้ตัวเดียวกันทั้งเข้าครั้งแรกและตอนต่อกลับ
   (เคยมีบั๊ก: ตอนต่อกลับส่งข้อมูลไม่ครบ ขาดตารางชนิดของ/อัตราติ๊ก/แรงโน้มถ่วง
    จอเลยค้างเป็นภาพมุมสูงแบบล็อบบี้ และตัวละครเดินกระตุก) */
function initPayload(room, player) {
  return {
    w: room.map.w, d: room.map.d, r: CFG.R,
    walls: room.walls,
    map: room.mapPayload(),
    room: room.id,
    me: { id: player.id, pid: player.pid, name: player.name },
    types: PROP_TYPES,
    rerollCost: CFG.REROLL_COST,
    reviveCost: CFG.REVIVE_COST,
    leavePenalty: CFG.LEAVE_PENALTY,
    tickHz: CFG.TICK_HZ,
    viewR: CFG.VIEW_R,
    jumpV: CFG.JUMP_V,
    gravity: CFG.GRAVITY,
    maxMiss: CFG.MAX_MISS,
    maxPlayers: CFG.MAX_PLAYERS,
    specSpeed: CFG.SPEC_SPEED,
    specHeight: CFG.SPEC_HEIGHT,
    // ตำแหน่งปัจจุบันของตัวเอง ใช้ตั้งตัวทำนายฝั่งไคลเอนต์ให้ตรงตั้งแต่เฟรมแรก
    pos: { x: player.x, z: player.z, y: player.y || 0 },
  };
}

/* ที่นั่งของคนที่เน็ตหลุด รอกลับเข้ามาได้ 60 วินาที */
const RECONNECT_MS = 60000;

/* หาที่โล่งใกล้จุดที่กำหนด (ใช้ตอนผู้ชมวาร์ปไปหาเพื่อน จะได้ไม่ไปยืนซ้อนในของ) */
function freeSpotNear(map, x, z) {
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 1.2 + (i % 3) * 0.6;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (!blocked(px, pz, 0.2, map)) return { x: px, z: pz };
  }
  return { x, z };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, h] of pending) {
    if (now - h.player.gone < RECONNECT_MS) continue;
    pending.delete(k);
    const rm = h.room;
    if (!rm || rooms.get(rm.id) !== rm) continue;
    rm.fx.push({ k: 'left', n: h.player.name });
    rm.remove(h.player.id);
    if (rm.humans().length === 0) rooms.delete(rm.id);
    else if (rm.phase === PHASE.HUNT && rm.hidersAlive() === 0) rm.endRound('caught');
  }
}, 5000);

const loop = setInterval(() => {
  const now = Date.now();
  acc += (now - last) / 1000;
  last = now;
  if (acc > 0.5) acc = 0.5;

  let steps = 0;
  while (acc >= STEP && steps < 8) {
    acc -= STEP;
    steps++;
    for (const room of rooms.values()) room.update(STEP);
  }
  if (!steps) return;

  for (const room of rooms.values()) {
    room.netAcc += STEP * steps;
    if (room.netAcc >= NET_STEP) { room.netAcc = 0; room.broadcast(); }
  }
}, STEP * 1000);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  store.initDb().finally(() => {
    httpServer.listen(PORT, () => {
      console.log('prop hunt mall — listening on ' + PORT);
      console.log(store.storageReport());
    });
  });
} else {
  loop.unref();
}

module.exports = {
  Room, CFG, PHASE, WALLS, LAYOUT, NAV, PROP_TYPES, LAYOUTS, MAP_ORDER,
  app, httpServer, rooms, online, store, findPath, newRoom, roomList,
};
