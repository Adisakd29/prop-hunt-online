'use strict';

/* ด่านที่ 1 — ห้างสรรพสินค้าขนาดกลาง 112 x 80 เมตร
   วางเป็นผังกากบาท: ทางเดินหลักแนวนอนตัดกับทางเดินหลักแนวตั้งที่ลานกิจกรรมกลางห้าง
   ร้านค้า 12 คูหาล้อมรอบ แต่ละคูหามีประตูหน้าออกทางเดินหลัก และประตูหลังออกทางเดินหลังร้าน
   ทำให้เดินวนกลับมาที่เดิมได้หลายเส้นทาง ไม่ใช่แผนที่เส้นตรง

   แกน: x = กว้าง (-56..56), z = ลึก (-40..40) หน้าโมเดลหันไป +Z */

const MAP_W = 112;
const MAP_D = 76;
const T = 0.9;

const R0 = 0;
const R90 = Math.PI / 2;
const R180 = Math.PI;
const R270 = -Math.PI / 2;

/* ผังตามภาพอ้างอิง: ทางเข้าอยู่ด้านล่างกลาง (z บวก) ลานกลางมีบันไดเลื่อน
   ร้านเรียงรอบผนัง ทางเดินหลักวนรอบลานกลางและมีทางเดินย่อยเชื่อมทุกร้าน

   x: -56..56, z: -38..38 (z บวก = ด้านหน้าห้าง/ทางเข้า)

   ร้านทุกร้านนิยามเป็นกล่อง [x0, x1, z0, z1] กับด้านที่มีประตู */
const SHOPS = [
  { key: 'elec',  name: 'ร้านเครื่องใช้ไฟฟ้า', box: [-54, -30, -36, -20], door: 's',
    items: ['tv', 'radio', 'fan', 'printer', 'calculator', 'powerbank'], display: 'fridge' },
  { key: 'cloth', name: 'ร้านเสื้อผ้า',        box: [-28, -8, -36, -20], door: 's',
    items: ['rack', 'mannequin', 'cap', 'shopbag', 'pillow'], display: 'rack' },
  { key: 'shoe',  name: 'ร้านรองเท้า',         box: [-6, 14, -36, -20], door: 's',
    items: ['sneaker', 'backpack', 'handbag', 'shopbag', 'watch'] },
  { key: 'food',  name: 'ฟู้ดคอร์ท',           box: [16, 54, -36, -14], door: 's', dining: true,
    items: ['plate', 'noodle', 'coffee', 'tissue', 'chocopie'] },
  { key: 'toilet',name: 'ห้องน้ำ',             box: [40, 54, -12, -2], door: 'w',
    items: ['tissue', 'sanitizer', 'cleaner', 'medkit'], small: true },
  { key: 'conv',  name: 'ร้านสะดวกซื้อ',       box: [34, 54, 0, 16], door: 'w',
    items: ['soda', 'milk', 'water', 'snack', 'chips', 'basket'], display: 'fridge' },
  { key: 'pharm', name: 'ร้านยา',              box: [34, 54, 18, 36], door: 'w',
    items: ['medkit', 'sanitizer', 'sunscreen', 'roll', 'thermos'] },
  { key: 'cosm',  name: 'ร้านเครื่องสำอาง',    box: [-14, 12, 20, 36], door: 'n',
    items: ['perfume', 'lipstick', 'powder', 'roll', 'sunscreen'] },
  { key: 'cafe',  name: 'คาเฟ่',               box: [-38, -16, 20, 36], door: 'n', dining: true,
    items: ['coffee', 'plate', 'chocopie', 'tissue'] },
  { key: 'store', name: 'ห้องเก็บของ',         box: [-54, -40, 20, 36], door: 'n',
    items: ['box', 'box', 'luggage', 'umbrella'], small: true },
  { key: 'book',  name: 'ร้านหนังสือ',         box: [-54, -34, -2, 18], door: 'e',
    items: ['book', 'notebook', 'pen', 'pencil', 'marker'] },
  { key: 'fash',  name: 'ร้านแฟชั่น',          box: [-30, -12, -12, 6], door: 'e',
    items: ['sunglasses', 'handbag', 'watch', 'cap', 'sneaker'], display: 'showcase' },
  { key: 'it',    name: 'โซนมือถือ',           box: [14, 30, 2, 16], door: 'w',
    items: ['phone', 'tablet', 'earbuds', 'cable', 'usb'] },
];

/* ประตูของแต่ละร้าน: กลางด้านนั้น กว้าง 4.4 ม. */
function doorOf(shop) {
  const [x0, x1, z0, z1] = shop.box;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const half = 2.2;
  switch (shop.door) {
    case 'n': return { side: 'n', x: cx, z: z0, a: cx - half, b: cx + half };
    case 's': return { side: 's', x: cx, z: z1, a: cx - half, b: cx + half };
    case 'w': return { side: 'w', x: x0, z: cz, a: cz - half, b: cz + half };
    default:  return { side: 'e', x: x1, z: cz, a: cz - half, b: cz + half };
  }
}

const DOORS = SHOPS.map(doorOf);
const BACK_DOORS = [];
const UNITS = SHOPS.map((s) => [s.box[0], s.box[1]]);

function buildWalls() {
  const out = [];
  const h = (x1, x2, z, hh) => { if (x2 - x1 > 0.05) out.push({ x: x1, z: z - T / 2, w: x2 - x1, d: T, h: hh }); };
  const v = (x, z1, z2, hh) => { if (z2 - z1 > 0.05) out.push({ x: x - T / 2, z: z1, w: T, d: z2 - z1, h: hh }); };

  // ผนังรอบห้าง เว้นประตูทางเข้าด้านล่างกลาง
  h(-MAP_W / 2, MAP_W / 2, -MAP_D / 2 + T / 2, 5);
  h(-MAP_W / 2, -3, MAP_D / 2 - T / 2, 5);
  h(3, MAP_W / 2, MAP_D / 2 - T / 2, 5);
  v(-MAP_W / 2 + T / 2, -MAP_D / 2, MAP_D / 2, 5);
  v(MAP_W / 2 - T / 2, -MAP_D / 2, MAP_D / 2, 5);

  for (const s of SHOPS) {
    const [x0, x1, z0, z1] = s.box;
    const d = doorOf(s);
    const H = 3.4;
    // แต่ละด้าน ถ้าเป็นด้านประตูให้เว้นช่อง
    if (d.side === 'n') { h(x0, d.a, z0, H); h(d.b, x1, z0, H); } else h(x0, x1, z0, H);
    if (d.side === 's') { h(x0, d.a, z1, H); h(d.b, x1, z1, H); } else h(x0, x1, z1, H);
    if (d.side === 'w') { v(x0, z0, d.a, H); v(x0, d.b, z1, H); } else v(x0, z0, z1, H);
    if (d.side === 'e') { v(x1, z0, d.a, H); v(x1, d.b, z1, H); } else v(x1, z0, z1, H);
  }
  return out;
}

const WIDE = ['rack', 'showcase', 'sofa', 'desk', 'fridge', 'tv', 'board', 'mannequin', 'luggage'];

function buildProps() {
  const P = [];
  const add = (t, x, z, ry) => P.push({ t, x, z, ry: ry || 0 });

  /* จัดของในร้านตามด้านประตู: ชั้นวางชิดผนังสามด้านที่ไม่ใช่ประตู
     สินค้าเรียงหน้าชั้น เกาะกลางหนึ่งแถวถ้าร้านกว้างพอ เว้นทางเดิน ≥ 3 ม. */
  const shop = (s) => {
    const [x0, x1, z0, z1] = s.box;
    const d = doorOf(s);
    const w = x1 - x0, dep = z1 - z0;
    const sp = WIDE.some((t) => s.items.includes(t)) ? 2.4 : 1.9;
    let k = 0;
    const nextItem = () => s.items[k++ % s.items.length];

    // ผนังที่ไม่มีประตู: ชั้นวางเรียงชิด + สินค้าหน้าชั้น
    const wallRun = (side) => {
      const along = side === 'n' || side === 's';
      const len = along ? w : dep;
      // เว้นมุมไว้ 3 ม. ไม่ให้ชั้นสองด้านชนกันที่มุมห้อง
      const start = along ? x0 + 3.0 : z0 + 3.0;
      const end = (along ? x1 : z1) - 3.0;
      const fixed = side === 'n' ? z0 + 1.3 : side === 's' ? z1 - 1.3 : side === 'w' ? x0 + 1.3 : x1 - 1.3;
      const face = side === 'n' ? R0 : side === 's' ? R180 : side === 'w' ? R90 : R270;
      const inner = side === 'n' ? z0 + 2.6 : side === 's' ? z1 - 2.6 : side === 'w' ? x0 + 2.6 : x1 - 2.6;
      for (let t = start; t <= end + 0.01; t += 1.4) {
        if (along) add('shelf', +t.toFixed(2), fixed, face); else add('shelf', fixed, +t.toFixed(2), face);
      }
      if (len < 10) return;
      for (let t = start + 0.4; t <= end - 0.4; t += sp) {
        if (along) add(nextItem(), +t.toFixed(2), inner, face); else add(nextItem(), inner, +t.toFixed(2), face);
      }
    };
    for (const side of ['n', 's', 'w', 'e']) if (side !== d.side && !(s.small && side !== 'n' && side !== 's' && w < 16)) wallRun(side);

    // เกาะกลาง (เฉพาะร้านใหญ่ที่ไม่ใช่โซนนั่งกิน)
    if (!s.dining && !s.small && w >= 20 && dep >= 14) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const horiz = w >= dep;
      const face = d.side === 'n' ? R0 : d.side === 's' ? R180 : d.side === 'w' ? R90 : R270;
      const n = Math.max(3, Math.floor((horiz ? w : dep) / 2 / 1.4) - 1);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 1.4;
        if (horiz) add('shelf', +(cx + off).toFixed(2), cz, face); else add('shelf', cx, +(cz + off).toFixed(2), face);
      }
      for (let i = 0; i < n + 1; i++) {
        const off = (i - n / 2) * sp;
        if (horiz) { add(nextItem(), +(cx + off).toFixed(2), cz + 1.3, face); add(nextItem(), +(cx + off).toFixed(2), cz - 1.3, face); }
        else { add(nextItem(), cx + 1.3, +(cz + off).toFixed(2), face); add(nextItem(), cx - 1.3, +(cz + off).toFixed(2), face); }
      }
    }

    // โซนนั่งกิน: โต๊ะเก้าอี้เป็นแถว
    if (s.dining) {
      const cols = Math.max(1, Math.floor((w - 8) / 5));
      const rows = Math.max(1, Math.floor((dep - 8) / 5));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = x0 + 4 + c * 5 + (w - 8 - (cols - 1) * 5) / 2;
          const z = z0 + 4 + r * 5 + (dep - 8 - (rows - 1) * 5) / 2;
          add('desk', +x.toFixed(2), +z.toFixed(2), R0);
          add('chair', +x.toFixed(2), +(z + 1.5).toFixed(2), R180);
          add('chair', +x.toFixed(2), +(z - 1.5).toFixed(2), R0);
        }
      }
    }

    // ตู้โชว์กลางร้านเล็ก + เคาน์เตอร์ข้างประตู
    if (s.display && !s.dining) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const px = d.side === 'w' ? x0 + 5 : d.side === 'e' ? x1 - 5 : cx;
      const pz = d.side === 'n' ? z0 + 5 : d.side === 's' ? z1 - 5 : cz;
      add(s.display, +px.toFixed(2), +pz.toFixed(2), 0);
    }
    if (!s.small) {
      const ox = d.side === 'w' ? x0 + 2.6 : d.side === 'e' ? x1 - 2.6 : d.x + 4.8;
      const oz = d.side === 'n' ? z0 + 2.6 : d.side === 's' ? z1 - 2.6 : d.z + 4.8;
      add('desk', +ox.toFixed(2), +oz.toFixed(2), d.side === 'n' || d.side === 's' ? R0 : R90);
    }
  };
  for (const s of SHOPS) shop(s);

  /* ---- ลานกลาง: บันไดเลื่อนสี่ตัว สวนหย่อม ม้านั่ง ---- */
  add('escalator', -8, -8, R0);
  add('escalator', 8, -8, R0);
  add('escalator', -8, 12, R0);
  add('escalator', 8, 12, R0);
  add('elevator', 24, -8, R0);
  for (const [x, z] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) add('plant', x, z);
  add('vase', 0, 0);
  add('sofa', -16, 0, R90);
  add('sofa', 16, 0, R270);
  add('sofa', 0, -14, R0);
  add('sofa', 0, 16, R180);
  for (const [x, z] of [[-14, -16], [14, -16], [-16, 18], [16, 18], [-20, -8], [20, 20], [-20, 12], [10, -2]]) add('plant', x, z);
  for (const [x, z, r] of [[-8, 4, R90], [8, -14, R270], [-8, -14, R90], [8, 4, R270]]) add('board', x, z, r);
  for (const [x, z] of [[-24, -16], [30, -12], [-24, 18], [30, 24], [-8, 24], [8, 24]]) add('pillar', x, z);
  for (const x of [-32, 32]) { add('cart', x, -8); add('basket', x, 10); }
  add('extinguisher', -32, -16); add('extinguisher', 32, 18);
  add('wallclock', 0, -18); add('wetsign', 18, 20);
  // หน้าทางเข้า
  add('board', -7, 31, R0); add('board', 7, 31, R0);
  add('plant', -10, 28); add('plant', 10, 28);
  add('luggage', 16, 30); add('shopbag', 18, 31);

  return P;
}

/* ------------------------------------------------------------------ */
/* จุดเดินสำหรับบอท                                                     */
/* ------------------------------------------------------------------ */

/* ความสูงกับรัศมีของแต่ละชนิด ต้องตรงกับ public/propdata.js
   ใช้ทั้งคำนวณการชนและวางจุดเดินให้เลี่ยงของ (มีเทสต์ตรวจให้) */
const PROP_SIZE = {
  soda: [0.60, 0.24],
  milk: [0.72, 0.24],
  coffee: [0.58, 0.22],
  water: [0.70, 0.20],
  snack: [0.64, 0.30],
  chips: [0.70, 0.22],
  noodle: [0.44, 0.34],
  chocopie: [0.42, 0.30],
  perfume: [0.60, 0.22],
  lipstick: [0.64, 0.14],
  powder: [0.22, 0.28],
  roll: [0.58, 0.18],
  sunscreen: [0.56, 0.18],
  sanitizer: [0.66, 0.20],
  medkit: [0.52, 0.36],
  cleaner: [0.68, 0.22],
  tissue: [0.49, 0.36],
  watch: [0.52, 0.20],
  sunglasses: [0.22, 0.30],
  cap: [0.34, 0.28],
  handbag: [0.63, 0.34],
  backpack: [0.69, 0.30],
  sneaker: [0.46, 0.34],
  luggage: [1.03, 0.34],
  teddy: [0.72, 0.32],
  keychain: [0.46, 0.18],
  phone: [0.62, 0.20],
  tablet: [0.72, 0.30],
  earbuds: [0.32, 0.20],
  powerbank: [0.50, 0.22],
  cable: [0.13, 0.26],
  usb: [0.53, 0.14],
  calculator: [0.58, 0.24],
  fan: [0.63, 0.22],
  book: [0.58, 0.26],
  notebook: [0.56, 0.28],
  pen: [0.60, 0.14],
  pencil: [0.67, 0.14],
  marker: [0.60, 0.14],
  thermos: [0.80, 0.20],
  umbrella: [0.82, 0.18],
  basket: [0.52, 0.36],
  cart: [0.82, 0.46],
  extinguisher: [0.83, 0.22],
  wetsign: [0.72, 0.30],
  barrier: [0.70, 0.50],
  wallclock: [0.62, 0.32],
  cone: [0.71, 0.34],
  plant: [1.37, 0.55],
  lamp: [1.62, 0.40],
  box: [0.83, 0.52],
  printer: [0.56, 0.50],
  escalator: [1.87, 1.60],
  elevator: [3.20, 1.70],
  pillar: [3.85, 0.75],
  showcase: [1.64, 0.85],
  rack: [1.72, 0.90],
  mannequin: [2.00, 0.42],
  fridge: [2.11, 0.70],
  shopbag: [0.72, 0.28],
  pillow: [0.33, 0.34],
  vase: [0.88, 0.26],
  plate: [0.21, 0.30],
  radio: [0.68, 0.36],
  rock: [0.77, 0.48],
  bush: [1.10, 0.45],
  log: [0.53, 0.72],
  hay: [0.55, 0.48],
  penguin: [0.97, 0.24],
  tortoise: [0.66, 0.42],
  giraffe: [3.50, 0.60],
  elephant: [1.75, 1.00],
  lion: [1.25, 0.65],
  monkey: [1.02, 0.32],
  bear: [1.50, 0.65],
  flamingo: [2.06, 0.32],
  crocodile: [0.42, 0.85],
  zebra: [1.90, 0.62],
  hippo: [1.18, 0.85],
  parrot: [1.08, 0.24],
  rabbit: [0.81, 0.26],
  goat: [1.18, 0.48],
  deer: [2.11, 0.55],
  snake: [0.33, 0.55],
  frog: [0.43, 0.32],
  owl: [1.09, 0.26],
  kangaroo: [1.60, 0.42],
  camel: [2.02, 0.66],
  panda: [1.32, 0.52],
  tiger: [1.10, 0.66],
  peacock: [1.15, 0.52],
  sink: [0.96, 0.36],
  soapbox: [0.33, 0.12],
  broom: [1.30, 0.24],
  toolbox: [0.49, 0.34],
  statue: [1.72, 0.48],
  skeleton: [2.40, 0.78],
  pedestal: [1.41, 0.46],
  lowfence: [0.70, 0.82],
  warnsign: [1.46, 0.28],
  tray: [0.15, 0.36],
  cup: [0.57, 0.13],
  icebox: [0.65, 0.48],
  zoosign: [1.80, 0.46],
  feeder: [0.95, 0.38],
  bucket: [0.72, 0.24],
  lamppost: [3.18, 0.24],
  trashbin: [0.80, 0.28],
  popcorn: [0.62, 0.20],
  balloon: [1.72, 0.30],
  mapsign: [1.80, 0.52],
  fountain: [1.40, 0.82],
  tree: [3.15, 0.82],
  bamboo: [2.50, 0.32],
  mushroom: [0.63, 0.30],
  flowerbed: [0.52, 0.52],
  tire: [0.26, 0.46],
  barrel: [0.90, 0.34],
  hydrant: [0.79, 0.28],
  ticketbooth: [2.06, 0.75],
  plushlion: [0.67, 0.20],
  plushpanda: [0.69, 0.18],
  zoocap: [0.26, 0.24],
  icecream: [0.90, 0.16],
  slushie: [0.90, 0.15],
  bench: [0.95, 0.85],
  zoocart: [1.38, 0.55],
  wheelbarrow: [0.53, 0.55],
  pond: [0.23, 1.00],
  shelf: [1.76, 0.65],
  desk: [0.78, 0.95],
  chair: [1.07, 0.50],
  sofa: [0.95, 1.15],
  tv: [1.32, 0.80],
  board: [1.67, 0.90],
};

function clearLine(x1, z1, x2, z2, walls, r) {
  const d = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.max(2, Math.ceil(d / 0.4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;
    for (const w of walls) {
      if (x + r > w.x && x - r < w.x + w.w && z + r > w.z && z - r < w.z + w.d) return false;
    }
  }
  return true;
}

/* จุดเดินต้องไม่จมอยู่ในกองสินค้า และเส้นเชื่อมต้องเดินผ่านได้จริง
   ไม่งั้นบอทจะเดินตรงเข้าไปชนชั้นวางแล้วติดอยู่ตรงนั้น */
function propBlockers(props) {
  const out = [];
  for (const p of props) {
    const sz = PROP_SIZE[p.t];
    if (!sz || sz[0] < 0.5) continue;          // ของเตี้ยกระโดดข้ามได้ ไม่นับเป็นสิ่งกีดขวาง
    out.push({ x: p.x, z: p.z, r: sz[1] * 0.72 });
  }
  return out;
}

/* แบ่งช่องเก็บสิ่งกีดขวางไว้ก่อน จะได้ตรวจเฉพาะของที่อยู่ใกล้เส้นทาง */
function blockerGrid(blockers) {
  const C = 4, g = new Map();
  for (const b of blockers) {
    const k = Math.floor(b.x / C) * 1000 + Math.floor(b.z / C);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(b);
  }
  return { C, g };
}

function clearOfProps(x1, z1, x2, z2, grid, pad) {
  const { C, g } = grid;
  const d = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.max(1, Math.ceil(d / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let a = -1; a <= 1; a++) {
      for (let b2 = -1; b2 <= 1; b2++) {
        const arr = g.get((cx + a) * 1000 + (cz + b2));
        if (!arr) continue;
        for (const b of arr) {
          const rr = b.r + pad;
          if (Math.abs(x - b.x) > rr || Math.abs(z - b.z) > rr) continue;
          if ((x - b.x) ** 2 + (z - b.z) ** 2 < rr * rr) return false;
        }
      }
    }
  }
  return true;
}

function buildNav(layout) {
  const L = layout || { walls: buildWalls(), props: buildProps(), w: MAP_W, d: MAP_D, seeds: null };
  const walls = L.walls;
  const grid = blockerGrid(propBlockers(L.props));
  const pts = [];
  const add = (x, z) => pts.push({ x, z });

  if (L.seeds) for (const [x, z] of L.seeds) add(x, z);
  else for (const d of DOORS) {
    // จุดหน้าและหลังประตูทุกร้าน ให้บอทเข้าออกได้แน่ ๆ
    if (d.side === 'n' || d.side === 's') { add(d.x, d.z - 1.8); add(d.x, d.z + 1.8); }
    else { add(d.x - 1.8, d.z); add(d.x + 1.8, d.z); }
  }

  // โปรยจุดให้ทั่วแผนที่ทุก 2.5 เมตร แล้วค่อยกรองเอาเฉพาะจุดที่ยืนได้จริง
  // วิธีนี้ได้จุดหนาแน่นพอให้บอทเดินลัดเลาะระหว่างชั้นวางได้
  for (let x = -L.w / 2 + 1.5; x <= L.w / 2 - 1.5; x += 2) {
    for (let z = -L.d / 2 + 1.5; z <= L.d / 2 - 1.5; z += 2) {
      add(+x.toFixed(1), +z.toFixed(1));
    }
  }

  const raw = pts.filter((p) => clearLine(p.x, p.z, p.x, p.z, walls, 0.55)
    && clearOfProps(p.x, p.z, p.x, p.z, grid, 0.46));
  const link = (list) => {
    const e = list.map(() => []);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z);
        if (d > 3.6) continue;
        if (!clearLine(list[i].x, list[i].z, list[j].x, list[j].z, walls, 0.5)) continue;
        if (!clearOfProps(list[i].x, list[i].z, list[j].x, list[j].z, grid, 0.46)) continue;
        e[i].push({ n: j, d });
        e[j].push({ n: i, d });
      }
    }
    return e;
  };
  // เก็บเฉพาะกลุ่มจุดที่ใหญ่ที่สุดที่เชื่อมถึงกันหมด บอทจะได้ไม่ไปติดเกาะเล็ก ๆ
  const e0 = link(raw);
  const comp = new Int32Array(raw.length).fill(-1);
  let best = -1, bestSize = 0, cid = 0;
  for (let i = 0; i < raw.length; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i];
    comp[i] = cid;
    let size = 0;
    while (stack.length) {
      const n = stack.pop();
      size++;
      for (const e of e0[n]) if (comp[e.n] < 0) { comp[e.n] = cid; stack.push(e.n); }
    }
    if (size > bestSize) { bestSize = size; best = cid; }
    cid++;
  }
  if (L.keepAll) return { nodes: raw, edges: e0, comp: Array.from(comp), best };
  const nodes = raw.filter((_, i) => comp[i] === best);
  return { nodes, edges: link(nodes) };
}

/* ------------------------------------------------------------------ */
/* ทะเบียนด่าน                                                          */
/* ------------------------------------------------------------------ */

const zoo = require('./mapzoo');
const mj = require('./mapjson');

/* ห้างโหลดจากไฟล์ mallMap.json — ใช้เฉพาะชั้น 1 (เอนจินเป็นระนาบเดียว) */
const MALL_JSON = mj.loadJson('mallMap.json');

const MAPS = {};
{
  const fm = mj.floorMap(MALL_JSON, 1, { scale: 1.6 });   // 64x40 → 102x64 ให้พอกับ 30 คน
  MAPS.mall = {
    name: fm.name, w: fm.w, d: fm.d, theme: 'mall',
    build() {
      const walls = fm.buildWalls();
      const props = fm.buildProps();
      return {
        walls, props, zones: fm.zones, hidingSpots: fm.hidingSpots, spawns: fm.spawns, palettes: fm.palettes,
        nav: buildNav({ walls, props, w: fm.w, d: fm.d, seeds: fm.seeds() }),
      };
    },
  };
}
MAPS.zoo = {
  name: 'สวนสัตว์',
  w: zoo.MAP_W, d: zoo.MAP_D,
  theme: 'zoo',
  build() {
    const walls = zoo.buildWalls();
    const props = zoo.buildProps();
    const zones = zoo.PENS.map((p) => ({ name: p.name, box: p.box, door: p.gate, kind: p.water ? 'water' : 'pen' }))
      .concat(zoo.BUILDINGS.map((b) => ({ name: b.name, box: b.box, door: b.door, kind: 'building' })));
    // คนซ่อนเกิดหน้าทางเข้า คนหาเริ่มพร้อมกันหน้าพิพิธภัณฑ์
    // คนซ่อนเกิดได้หลายจุด (ลานทางเข้า ทางเดินซ้าย/ขวา หน้าคาเฟ่) คนหาเริ่มพร้อมกันหน้าพิพิธภัณฑ์
    const spawns = { hider: [{ x: 0, z: 33 }, { x: -20, z: 26 }, { x: 20, z: 26 }, { x: -4, z: 8 }, { x: -29, z: 0 }], seeker: [{ x: 44, z: 30 }] };
    return { walls, props, zones, spawns, nav: buildNav({ walls, props, w: zoo.MAP_W, d: zoo.MAP_D, seeds: zoo.seeds() }) };
  },
};

module.exports = {
  MAP_W, MAP_D, buildWalls, buildProps, buildNav, clearLine, UNITS, DOORS, BACK_DOORS, PROP_SIZE, MAPS, SHOPS,
};
