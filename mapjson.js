'use strict';

/* โหลดผังห้างจากไฟล์ mallMap.json (ผังแบบ data-driven ที่วางของด้วยมือ)
   โค้ดไม่รู้ว่าห้างหน้าตาเป็นยังไง แค่วางตามข้อมูล

   แต่ละ "ชั้น" ในไฟล์กลายเป็นด่านแยกหนึ่งด่าน เพราะเอนจินยังเป็นระนาบเดียว
   ช่องโล่ง/บันไดเลื่อนถูกวางเป็นของประกอบฉากตามตำแหน่งที่ระบุ

   พิกัดในไฟล์: มุมล่างซ้าย x ไปขวา z ไปหลัง → แปลงเป็นพิกัดเอนจินที่กึ่งกลางเป็น (0,0) */

const fs = require('fs');
const path = require('path');

const R0 = 0, R90 = Math.PI / 2, R180 = Math.PI, R270 = -Math.PI / 2;
const T = 0.8;

/* ชื่อชนิดในไฟล์ → ชนิดที่เอนจินมีโมเดล
   บางชนิดใช้ len เพื่อวางต่อกันเป็นแถว (ชั้นวางยาว ตู้แช่ยาว เคาน์เตอร์) */
const TYPE_MAP = {
  shelf_tall: { t: 'shelf', step: 1.4 },
  shelf_short: { t: 'shelf' },
  freezer: { t: 'fridge', step: 1.3 },
  counter: { t: 'desk', step: 2.0 },
  long_table: { t: 'desk', step: 2.0 },
  tv_stand: { t: 'tv', step: 2.0 },
  pipe: { t: 'barrier', step: 2.4 },
  cart: { t: 'cart' }, basket: { t: 'basket' }, fruit_crate: { t: 'box' }, water_pack: { t: 'water' },
  sign_board: { t: 'board' }, signboard: { t: 'board' }, menu_board: { t: 'board' }, sale_sign: { t: 'board' },
  banner_stand: { t: 'board' }, poster_stand: { t: 'board' },
  trash_bin: { t: 'trashbin' }, chair: { t: 'chair' }, stool: { t: 'chair' }, cinema_seat: { t: 'chair' },
  round_table: { t: 'desk' }, info_kiosk: { t: 'desk' }, stall: { t: 'zoocart' },
  coffee_machine: { t: 'coffee' }, cup: { t: 'coffee' }, cake_stand: { t: 'plate' }, food_tray: { t: 'plate' },
  plant_pot: { t: 'plant' }, mannequin: { t: 'mannequin' }, clothes_rack: { t: 'rack' },
  shoe_box: { t: 'sneaker' }, mirror: { t: 'showcase' }, fitting_room: { t: 'showcase' },
  hanger_bag: { t: 'shopbag' }, bench: { t: 'sofa' },
  tv_box: { t: 'box' }, speaker: { t: 'radio' }, pc_tower: { t: 'printer' }, phone_stand: { t: 'phone' },
  vending_machine: { t: 'fridge' }, soda_fridge: { t: 'fridge' }, cable_reel: { t: 'cable' },
  popcorn_machine: { t: 'popcorn' }, velvet_rope: { t: 'barrier' }, ticket_kiosk: { t: 'ticketbooth' },
  cardboard_box: { t: 'box' }, wooden_crate: { t: 'box' }, barrel: { t: 'barrel' }, pallet: { t: 'tire' },
  mop_bucket: { t: 'bucket' }, ladder: { t: 'rack' }, hand_dryer: { t: 'fan' },
  fountain_light: { t: 'fountain' }, ac_unit: { t: 'fridge' }, water_tank: { t: 'barrel' },
};

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

/* สร้างด่านหนึ่งชั้นจากผัง */
function floorMap(json, level, opts) {
  const floor = json.floors.find((f) => f.level === level);
  const K = (opts && opts.scale) || json.meta.scale || 1;     // ขยายผังทั้งชั้นเท่ากันทุกแกน
  const W = json.meta.floorSize.w * K, D = json.meta.floorSize.d * K;
  const H = json.meta.floorHeight || 5;
  const cx = (x) => x * K - W / 2;
  const cz = (z) => z * K - D / 2;

  /* โซนที่อยู่ห่างผนังนอกไม่เกิน 2.5 ม. ให้ยืดไปชนผนังเลย
     ไม่งั้นจะเหลือซอกแคบ ๆ ที่เดินเข้าไปไม่ได้และไม่มีประโยชน์ */
  const SNAP = 2.5;
  for (const zn of floor.zones) {
    const r = zn.rect;
    if (r.x <= SNAP) { r.w += r.x; r.x = 0; }
    if (r.z <= SNAP) { r.d += r.z; r.z = 0; }
    if (json.meta.floorSize.w - (r.x + r.w) <= SNAP) r.w = json.meta.floorSize.w - r.x;
    if (json.meta.floorSize.d - (r.z + r.d) <= SNAP) r.d = json.meta.floorSize.d - r.z;
  }

  // ของที่วางมือทั้งชั้น (พิกัดเอนจิน) ใช้เลือกตำแหน่งประตูไม่ให้บัง
  const handProps = [];
  for (const zn of floor.zones) for (const p of zn.props) handProps.push({ x: cx(p.x), z: cz(p.z) });
  doorCache.clear();

  const buildWalls = () => {
    const out = [];
    const h = (x1, x2, z, hh) => { if (x2 - x1 > 0.05) out.push({ x: x1, z: z - T / 2, w: x2 - x1, d: T, h: hh }); };
    const v = (x, z1, z2, hh) => { if (z2 - z1 > 0.05) out.push({ x: x - T / 2, z: z1, w: T, d: z2 - z1, h: hh }); };
    // ผนังรอบนอก เว้นประตูทางเข้าถ้าโซน entrance อยู่ริมขอบ
    const ent = floor.zones.find((z) => z.id === 'entrance');
    if (ent && ent.rect.z === 0) {
      const a = cx(ent.rect.x + ent.rect.w / 2) - 3, b = cx(ent.rect.x + ent.rect.w / 2) + 3;
      h(-W / 2, a, -D / 2 + T / 2, H); h(b, W / 2, -D / 2 + T / 2, H);
    } else h(-W / 2, W / 2, -D / 2 + T / 2, H);
    h(-W / 2, W / 2, D / 2 - T / 2, H);
    v(-W / 2 + T / 2, -D / 2, D / 2, H);
    v(W / 2 - T / 2, -D / 2, D / 2, H);

    // ทุกโซนที่ไม่ใช่ทางเดิน/ลาน/ทางเข้า เป็นห้องมีผนัง
    // โซนที่ระบุ door ใช้ประตูแคบ 3.6 ม. ตามผัง โซนเปิดได้ประตูกว้าง 6 ม. ด้านที่หันเข้าลานกลาง
    for (const zn of floor.zones) {
      if (zn.isCorridor || OPEN_ZONES.has(zn.id) || OPEN_PAL.has(zn.palette)) continue;
      const x0 = cx(zn.rect.x), x1 = cx(zn.rect.x + zn.rect.w);
      const z0 = cz(zn.rect.z), z1 = cz(zn.rect.z + zn.rect.d);
      const d = doorPoint(zn, cx, cz, handProps);
      const dx = d.x, dz = d.z;
      const g = zn.door ? 1.8 : 3.0, hh = 3.2;
      const onN = Math.abs(dz - z0) < 0.6, onS = Math.abs(dz - z1) < 0.6;
      const onW = Math.abs(dx - x0) < 0.6, onE = Math.abs(dx - x1) < 0.6;
      if (onN) { h(x0, dx - g, z0, hh); h(dx + g, x1, z0, hh); } else h(x0, x1, z0, hh);
      if (onS) { h(x0, dx - g, z1, hh); h(dx + g, x1, z1, hh); } else h(x0, x1, z1, hh);
      if (onW) { v(x0, z0, dz - g, hh); v(x0, dz + g, z1, hh); } else v(x0, z0, z1, hh);
      if (onE) { v(x1, z0, dz - g, hh); v(x1, dz + g, z1, hh); } else v(x1, z0, z1, hh);
    }
    // ช่องโล่ง: ราวกันตกเตี้ย ๆ รอบขอบ
    for (const vd of floor.voids || []) {
      const x0 = cx(vd.x), x1 = cx(vd.x + vd.w), z0 = cz(vd.z), z1 = cz(vd.z + vd.d);
      h(x0, x1, z0, 1.1); h(x0, x1, z1, 1.1); v(x0, z0, z1, 1.1); v(x1, z0, z1, 1.1);
    }
    // โซนที่ผนังชนกัน (เช่น ห้องเก็บของหลังซูเปอร์) ต่างคนต่างสร้างผนังของตัวเอง
    // ช่องประตูของห้องหนึ่งต้องเจาะทะลุผนังของอีกห้องด้วย ไม่งั้นประตูตัน
    const gaps = [];
    for (const zn of floor.zones) {
      if (zn.isCorridor || OPEN_ZONES.has(zn.id) || OPEN_PAL.has(zn.palette)) continue;
      const d = doorPoint(zn, cx, cz, handProps);
      const g = zn.door ? 1.8 : 3.0;
      const along = d.side === 'n' || d.side === 's';
      gaps.push(along ? { x0: d.x - g, x1: d.x + g, z0: d.z - 1.2, z1: d.z + 1.2 }
        : { x0: d.x - 1.2, x1: d.x + 1.2, z0: d.z - g, z1: d.z + g });
    }
    /* ช่องแคบระหว่างผนังห้องที่ชนกัน ไม่มีใครเข้าไปแอบได้จริง ปิดทึบไปเลย
       (หาเป็นคู่ผนังขนานที่ห่างกันน้อยกว่า 2.6 ม. แล้วเติมผนังปิดหัวท้าย) */
    const NARROW = 2.6;
    const slots = [];
    for (let a = 0; a < out.length; a++) {
      for (let b = a + 1; b < out.length; b++) {
        const A = out[a], B = out[b];
        if (A.h < 2 || B.h < 2) continue;
        const vertA = A.d > A.w, vertB = B.d > B.w;
        if (vertA !== vertB) continue;
        if (vertA) {
          const gap = Math.abs(A.x - B.x);
          if (gap < 0.9 || gap > NARROW) continue;
          const z1s = Math.max(A.z, B.z), z2s = Math.min(A.z + A.d, B.z + B.d);
          if (z2s - z1s < 2) continue;
          slots.push({ x: Math.min(A.x, B.x), z: z1s, w: gap, d: z2s - z1s, vert: true });
        } else {
          const gap = Math.abs(A.z - B.z);
          if (gap < 0.9 || gap > NARROW) continue;
          const x1s = Math.max(A.x, B.x), x2s = Math.min(A.x + A.w, B.x + B.w);
          if (x2s - x1s < 2) continue;
          slots.push({ x: x1s, z: Math.min(A.z, B.z), w: x2s - x1s, d: gap, vert: false });
        }
      }
    }
    for (const sl of slots) {
      if (sl.vert) { h(sl.x, sl.x + sl.w, sl.z + T / 2, 3.2); h(sl.x, sl.x + sl.w, sl.z + sl.d - T / 2, 3.2); }
      else { v(sl.x + T / 2, sl.z, sl.z + sl.d, 3.2); v(sl.x + sl.w - T / 2, sl.z, sl.z + sl.d, 3.2); }
    }

    const cut = [];
    for (const w of out) {
      let pieces = [w];
      for (const gp of gaps) {
        const next = [];
        for (const seg of pieces) {
          const ox = seg.x < gp.x1 && seg.x + seg.w > gp.x0, oz = seg.z < gp.z1 && seg.z + seg.d > gp.z0;
          if (!(ox && oz)) { next.push(seg); continue; }
          if (seg.w >= seg.d) {        // ผนังแนวนอน ตัดตามแกน x
            if (gp.x0 > seg.x + 0.05) next.push({ ...seg, w: gp.x0 - seg.x });
            if (gp.x1 < seg.x + seg.w - 0.05) next.push({ ...seg, x: gp.x1, w: seg.x + seg.w - gp.x1 });
          } else {                      // ผนังแนวตั้ง ตัดตามแกน z
            if (gp.z0 > seg.z + 0.05) next.push({ ...seg, d: gp.z0 - seg.z });
            if (gp.z1 < seg.z + seg.d - 0.05) next.push({ ...seg, z: gp.z1, d: seg.z + seg.d - gp.z1 });
          }
        }
        pieces = next;
      }
      cut.push(...pieces);
    }
    return cut;
  };

  const buildProps = () => {
    const P = [];
    const add = (t, x, z, ry) => P.push({ t, x: +x.toFixed(2), z: +z.toFixed(2), ry: ry || 0 });
    for (const zn of floor.zones) {
      for (const p of zn.props) {
        const m = TYPE_MAP[p.type];
        if (!m) continue;
        const ry = ((p.rot || 0) * Math.PI) / 180;
        const len = (p.len || 0) * K;
        if (m.step && len > m.step) {
          // ของยาว: วางต่อกันตามทิศ rot (0 = ไปตามแกน x, 90 = ไปตามแกน z)
          const n = Math.max(1, Math.round(len / m.step));
          const along = Math.abs(Math.cos(ry)) > 0.5;
          for (let i = 0; i < n; i++) {
            const off = i * m.step;
            add(m.t, cx(p.x) + (along ? off : 0), cz(p.z) + (along ? 0 : off), along ? R0 : R90);
          }
        } else add(m.t, cx(p.x), cz(p.z), ry);
      }
    }
    /* ============ วางของเพิ่มแบบ "จัดร้าน" ไม่ใช่โปรยของ ============
       ลำดับ: 1) วางเฟอร์นิเจอร์หลักเป็นแนว (anchor)  2) วางสินค้าชิ้นเล็กชิดหน้า anchor
              3) เติมของรองแค่มุมห้อง  4) เว้นหน้าประตูกับทางเดินกลางเสมอ
       ของที่วางมือใน mallMap.json เป็นหลัก ตรงนี้แค่เสริมให้ร้านดูมีชีวิต */
    const SIZE = require('./maplayout').PROP_SIZE;
    const hit = (x, z, rad) => P.some((q) => Math.hypot(q.x - x, q.z - z) < rad);

    // ประตูทุกบานในชั้น ห้ามวางของบัง
    const allDoors = floor.zones
      .filter((z) => !z.isCorridor && !OPEN_ZONES.has(z.id) && !OPEN_PAL.has(z.palette))
      .map((z) => doorPoint(z, cx, cz, handProps));
    const nearDoor = (x, z, rad) => allDoors.some((d) => Math.hypot(x - d.x, z - d.z) < rad);

    /* แผนจัดร้านของแต่ละประเภท: anchor = เฟอร์นิเจอร์หลัก, goods = สินค้าที่วางหน้า anchor */
    const PLAN = {
      super:    { anchor: 'shelf',     rows: 2, perRow: 5, goods: ['soda', 'milk', 'water', 'snack', 'chips', 'noodle'], perAnchor: 2, extra: ['basket', 'cart'] },
      fashion:  { anchor: 'rack',      rows: 2, perRow: 3, goods: ['shopbag', 'cap', 'sneaker'], perAnchor: 1, extra: ['mannequin', 'sofa'] },
      electro:  { anchor: 'showcase',  rows: 2, perRow: 3, goods: ['phone', 'tablet', 'earbuds', 'radio'], perAnchor: 2, extra: ['tv', 'printer'] },
      cafe:     { anchor: null,        rows: 0, perRow: 0, goods: ['coffee', 'plate', 'vase'], perAnchor: 1, extra: ['plant', 'trashbin'] },
      food:     { anchor: null,        rows: 0, perRow: 0, goods: ['plate', 'noodle', 'tissue'], perAnchor: 1, extra: ['trashbin', 'plant'] },
      storage:  { anchor: 'box',       rows: 0, perRow: 0, goods: [], perAnchor: 0, extra: ['barrel', 'luggage'], piles: true },
      restroom: { anchor: null,        rows: 0, perRow: 0, goods: ['tissue', 'sanitizer'], perAnchor: 1, extra: ['trashbin', 'bucket'], wallRow: 'sink' },
      cinema:   { anchor: 'chair',     rows: 2, perRow: 4, goods: ['popcorn', 'soda'], perAnchor: 1, extra: ['trashbin'] },
      rooftop:  { anchor: 'barrel',    rows: 0, perRow: 0, goods: [], perAnchor: 0, extra: ['box', 'cone'], piles: true },
    };

    for (const zn of floor.zones) {
      if (zn.isCorridor) continue;
      if (NO_AUTOFILL.has(zn.palette)) continue;         // ลานกลาง/ทางเข้า ปล่อยโล่ง
      const plan = PLAN[zn.palette];
      if (!plan) continue;

      const x0 = cx(zn.rect.x), x1 = cx(zn.rect.x + zn.rect.w);
      const z0 = cz(zn.rect.z), z1 = cz(zn.rect.z + zn.rect.d);
      const w = x1 - x0, dep = z1 - z0;
      const open = OPEN_ZONES.has(zn.id) || OPEN_PAL.has(zn.palette);
      const door = open ? null : doorPoint(zn, cx, cz, handProps);
      const horiz = w >= dep;                            // แนวยาวของห้อง

      // ที่ว่างพอวางไหม: ต้องไม่ชนของเดิม ไม่ชนผนัง ไม่บังประตู และไม่อยู่ในแถบทางเดินกลาง
      const aisle = (x, z) => (horiz ? Math.abs(z - (z0 + z1) / 2) < 1.6 : Math.abs(x - (x0 + x1) / 2) < 1.6);
      const canPut = (x, z, t, pad) => {
        const r = (SIZE[t] ? SIZE[t][1] : 0.5) + (pad === undefined ? 1.0 : pad);
        if (x < x0 + 1.6 || x > x1 - 1.6 || z < z0 + 1.6 || z > z1 - 1.6) return false;
        if (nearDoor(x, z, 4.2)) return false;
        if (hit(x, z, r)) return false;
        return true;
      };

      /* 1) เฟอร์นิเจอร์หลักเป็นแนว วางขนานผนังยาว เว้นทางเดินกลาง */
      const anchors = [];
      if (plan.anchor && plan.rows) {
        const gapMain = (horiz ? dep : w) / (plan.rows + 1);
        for (let r = 1; r <= plan.rows; r++) {
          const fixed = (horiz ? z0 : x0) + gapMain * r;
          const span = (horiz ? w : dep) - 7;
          if (span < 3) continue;
          const step = span / Math.max(1, plan.perRow - 1);
          for (let i = 0; i < plan.perRow; i++) {
            const t = (horiz ? x0 : z0) + 3.5 + step * i;
            const x = horiz ? t : fixed, z = horiz ? fixed : t;
            if (aisle(x, z)) continue;
            if (!canPut(x, z, plan.anchor, 1.1)) continue;
            const face = horiz ? (z < (z0 + z1) / 2 ? R180 : R0) : (x < (x0 + x1) / 2 ? R270 : R90);
            add(plan.anchor, +x.toFixed(2), +z.toFixed(2), face);
            anchors.push({ x, z, ry: face });
          }
        }
      }

      /* 1b) กองของชิดผนัง (ห้องเก็บของ/ดาดฟ้า) — รวมเป็นกอง ไม่กระจายกลางห้อง */
      if (plan.piles) {
        const spots = [[x0 + 2.2, z0 + 2.2], [x1 - 2.2, z0 + 2.2], [x0 + 2.2, z1 - 2.2], [x1 - 2.2, z1 - 2.2]];
        for (const [bx, bz] of spots) {
          for (const [ox, oz] of [[0, 0], [1.1, 0], [0, 1.1]]) {
            const x = bx + (bx > (x0 + x1) / 2 ? -ox : ox);
            const z = bz + (bz > (z0 + z1) / 2 ? -oz : oz);
            if (!canPut(x, z, plan.anchor, 0.55)) continue;
            add(plan.anchor, +x.toFixed(2), +z.toFixed(2), 0);
          }
        }
      }

      /* 1c) อ่างล้างมือเรียงชิดผนังด้านเดียว (ห้องน้ำ) */
      if (plan.wallRow) {
        const side = door && door.side === 'n' ? 's' : 'n';
        const fz = side === 'n' ? z0 + 1.2 : z1 - 1.2;
        const face = side === 'n' ? R0 : R180;
        for (let x = x0 + 3; x <= x1 - 3; x += 1.8) {
          if (!canPut(x, fz, plan.wallRow, 0.5)) continue;
          add(plan.wallRow, +x.toFixed(2), +fz.toFixed(2), face);
          anchors.push({ x, z: fz, ry: face });
        }
      }

      /* 2) สินค้าชิ้นเล็กวางชิดหน้า anchor ทุกชนิด (รวมของที่วางมือไว้ใน JSON) */
      const stands = P.filter((q) => ['shelf', 'desk', 'showcase', 'rack', 'fridge', 'counter'].includes(q.t)
        && q.x > x0 && q.x < x1 && q.z > z0 && q.z < z1);
      if (plan.goods.length && stands.length) {
        let g = 0;
        const cap = Math.min(stands.length, Math.ceil((w * dep) / 26));
        for (const st of stands) {
          if (g >= cap) break;
          const ang = st.ry || 0;
          for (let k = 0; k < plan.perAnchor; k++) {
            const t = plan.goods[g % plan.goods.length];
            const side = (k % 2 ? 1 : -1) * (0.35 + 0.35 * Math.floor(k / 2));
            const px = +(st.x + Math.sin(ang) * 0.85 + Math.cos(ang) * side).toFixed(2);
            const pz = +(st.z + Math.cos(ang) * 0.85 - Math.sin(ang) * side).toFixed(2);
            if (!canPut(px, pz, t, 0.18)) continue;
            add(t, px, pz, ang);
            g++;
          }
        }
      }

      /* 3) ของรองเฉพาะมุมห้อง ไม่เกิน 3 ชิ้นต่อห้อง */
      let ex = 0;
      for (const [fx, fz] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
        if (ex >= 3 || !plan.extra.length) break;
        const t = plan.extra[ex % plan.extra.length];
        const x = x0 + w * fx, z = z0 + dep * fz;
        if (!canPut(x, z, t, 1.0)) continue;
        add(t, +x.toFixed(2), +z.toFixed(2), 0);
        ex++;
      }

      /* 4) จุดบริการหน้าประตู: ตะกร้ากับรถเข็นจอดรวมกันเป็นแถวเหมือนห้างจริง */
      if (door && ['super', 'fashion', 'electro'].includes(zn.palette)) {
        const along = door.side === 'n' || door.side === 's';
        const inward = door.side === 'n' ? 1 : door.side === 's' ? -1 : 0;
        const inwardX = door.side === 'w' ? 1 : door.side === 'e' ? -1 : 0;
        for (let i = 0; i < 4; i++) {
          const off = 3.6 + i * 0.85;
          const t = i < 2 ? 'cart' : 'basket';
          const x = along ? door.x + off : door.x + inwardX * 2.6;
          const z = along ? door.z + inward * 2.6 : door.z + off;
          if (!canPut(x, z, t, 0.35)) continue;
          add(t, +x.toFixed(2), +z.toFixed(2), 0);
        }
      }
    }

    return P;
  };

  const zones = floor.zones.filter((z) => !z.isCorridor).map((z) => {
    const open = OPEN_ZONES.has(z.id) || OPEN_PAL.has(z.palette);
    let door = null, doorAt = null;
    if (!open) {
      const dp = doorPoint(z, cx, cz, handProps);
      door = dp.side;
      doorAt = { x: dp.x, z: dp.z, half: z.door ? 1.8 : 3.0 };
    }
    return {
      name: z.name,
      box: [cx(z.rect.x), cx(z.rect.x + z.rect.w), cz(z.rect.z), cz(z.rect.z + z.rect.d)],
      door, doorAt,
      kind: open ? 'shop' : 'building',
      color: z.floorColor,
      palette: z.palette,
    };
  });

  const hidingSpots = [];
  for (const z of floor.zones) for (const hsp of z.hidingSpots || []) {
    hidingSpots.push({ x: cx(hsp.x), z: cz(hsp.z), label: hsp.label, popular: !!hsp.popular, palette: z.palette });
  }
  const spawns = {};
  for (const role of ['hider', 'seeker']) {
    spawns[role] = (json.spawns[role] || []).filter((s) => s.floor === level).map((s) => ({ x: cx(s.x), z: cz(s.z) }));
  }
  // คนซ่อนเกิดได้หลายจุดตามโซนเปิด (ทางเข้า/ลานกลาง) จะได้ไม่กระจุกและไม่ถูกเห็นทันที
  for (const zn of floor.zones) {
    if (!(OPEN_ZONES.has(zn.id) || OPEN_PAL.has(zn.palette)) || zn.isCorridor) continue;
    const x0 = cx(zn.rect.x), x1 = cx(zn.rect.x + zn.rect.w), z0 = cz(zn.rect.z), z1 = cz(zn.rect.z + zn.rect.d);
    for (const [fx, fz] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
      spawns.hider.push({ x: x0 + (x1 - x0) * fx, z: z0 + (z1 - z0) * fz });
    }
  }

  const seeds = () => {
    const s = [];
    for (const z of floor.zones) s.push([cx(z.rect.x + z.rect.w / 2), cz(z.rect.z + z.rect.d / 2)]);
    for (const hsp of hidingSpots) s.push([hsp.x, hsp.z]);
    // จุดหน้าและหลังประตูทุกบาน ให้บอทเข้าออกห้องได้แน่ ๆ
    for (const z of floor.zones) {
      if (z.isCorridor || OPEN_ZONES.has(z.id) || OPEN_PAL.has(z.palette)) continue;
      const d = doorPoint(z, cx, cz, handProps);
      const along = d.side === 'n' || d.side === 's';
      for (const off of [-2, 2]) {
        for (const k of [-6, -3, 0, 3, 6]) s.push(along ? [d.x + k, d.z + off] : [d.x + off, d.z + k]);
      }
    }
    return s;
  };

  return {
    name: json.meta.name.replace(/\s*\d+\s*ชั้น/, '').trim(),
    w: W, d: D, theme: 'mall',
    buildWalls, buildProps, seeds, zones, hidingSpots, spawns,
    palettes: json.propPalettes, typeMap: TYPE_MAP,
  };
}

/* palette เสริมของเอนจิน (เพิ่มเข้ากับ propPalettes ในไฟล์) ให้แต่ละโซนมีของหลากชนิด
   ตามหลัก: ของชิ้นเล็กทั่วไปมีหลายชิ้น ของพิเศษมีน้อย */
const EXTRA_PALETTES = {
  super: ['soda', 'milk', 'water', 'snack', 'chips', 'noodle', 'chocopie', 'basket', 'basket', 'cart', 'cart', 'box', 'tissue', 'sanitizer'],
  cafe: ['coffee', 'plate', 'chocopie', 'tissue', 'thermos', 'vase', 'chair', 'chair', 'desk', 'plant', 'trashbin'],
  fashion: ['handbag', 'backpack', 'sneaker', 'cap', 'sunglasses', 'watch', 'shopbag', 'mannequin', 'rack', 'perfume', 'lipstick'],
  electro: ['phone', 'tablet', 'earbuds', 'cable', 'usb', 'calculator', 'powerbank', 'radio', 'printer', 'tv', 'fan', 'lamp'],
  food: ['plate', 'noodle', 'coffee', 'tissue', 'soda', 'water', 'chair', 'chair', 'desk', 'trashbin', 'plant'],
  storage: ['box', 'box', 'luggage', 'umbrella', 'thermos', 'barrel', 'bucket', 'cart', 'basket', 'cone', 'barrier', 'wetsign'],
  restroom: ['tissue', 'sanitizer', 'cleaner', 'medkit', 'bucket', 'wetsign', 'roll', 'powder'],
  atrium: ['plant', 'sofa', 'board', 'trashbin'],
  cinema: ['popcorn', 'chair', 'barrier', 'board', 'soda', 'ticketbooth'],
  rooftop: ['barrel', 'box', 'barrier', 'cone', 'bucket'],
};

/* ของที่ "วางบนพื้น" ได้จริง — มีเฉพาะกลุ่มนี้ที่ระบบเติมลงพื้นอัตโนมัติ */
const FLOOR_PROPS = new Set(['plant', 'chair', 'desk', 'sofa', 'rack', 'showcase', 'fridge',
  'cart', 'basket', 'box', 'trashbin', 'wetsign', 'barrel', 'bucket', 'cone', 'barrier',
  'mannequin', 'luggage', 'shelf', 'lamp', 'ticketbooth', 'tire',
  'tv', 'printer', 'board', 'teddy', 'extinguisher', 'pillow', 'fountain', 'sofa', 'bench']);

/* โซนเปิด (ลานกลาง/ทางเข้า) ไม่เติมของอัตโนมัติเลย — ใน JSON วางน้ำพุ ม้านั่ง ต้นไม้ ป้ายไว้แล้ว */
const NO_AUTOFILL = new Set(['atrium']);

/* โซนที่เป็นพื้นที่เปิด ไม่มีผนัง */
const OPEN_ZONES = new Set(['entrance', 'atrium_1', 'atrium_2', 'atrium_3']);
const OPEN_PAL = new Set(['atrium']);

/* จุดประตูของโซน: ถ้าผังระบุก็ใช้ ถ้าไม่ระบุให้เปิดด้านที่ใกล้กึ่งกลางแผนที่ที่สุด */
const doorCache = new Map();
function doorPoint(zn, cx, cz, handProps) {
  if (zn.door) return { x: cx(zn.door.x), z: cz(zn.door.z), side: sideOf(zn, cx, cz) };
  if (doorCache.has(zn.id)) return doorCache.get(zn.id);
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

module.exports = { loadJson, floorMap, TYPE_MAP, FLOOR_PROPS };
