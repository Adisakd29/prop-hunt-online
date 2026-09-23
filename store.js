'use strict';

/* เก็บข้อมูลผู้เล่นเป็นไฟล์ JSON ไฟล์เดียว ไม่ต้องพึ่งฐานข้อมูลภายนอก
   ตั้ง DATA_DIR ให้ชี้ไปที่ Volume ของ Railway ถ้าต้องการให้ข้อมูลอยู่ถาวร */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ถ้ามี DATABASE_URL จะเก็บลง Postgres (ไม่ต้องพึ่ง volume เลย)
   ถ้าไม่มีก็ถอยไปใช้ไฟล์ JSON เหมือนเดิม เหมาะกับรันในเครื่อง */
let pg = null;
try { pg = process.env.DATABASE_URL ? require('pg') : null; } catch (e) { pg = null; }
let pool = null;
let pgReady = false;
const dirtyUsers = new Set();
let dirtyTokens = false;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'users.json');
const TMP = FILE + '.tmp';

const TOKEN_TTL = 1000 * 60 * 60 * 24 * 30;   // 30 วัน

/* ------------------------------------------------------------------ */
/* แคตตาล็อกของที่ปลอมตัวได้                                            */
/* ------------------------------------------------------------------ */

/* ของทุกชิ้นได้มาจากการสุ่มเท่านั้น ไม่มีซื้อตรง
   w คือน้ำหนักการสุ่ม ยิ่งมากยิ่งออกบ่อย */
const CATALOG = [
  { id: 'diningchair', name: 'เก้าอี้กินข้าว', w: 30, tier: 'ธรรมดา', map: 'house' },
  { id: 'homeshelf', name: 'ชั้นวางในบ้าน', w: 18, tier: 'ไม่ธรรมดา', map: 'house' },
  { id: 'homebin', name: 'ถังขยะในบ้าน', w: 30, tier: 'ธรรมดา', map: 'house' },
  { id: 'kitchensink', name: 'อ่างล้างจาน', w: 18, tier: 'ไม่ธรรมดา', map: 'house' },
  { id: 'gardentree', name: 'ต้นไม้ในสวน', w: 9, tier: 'หายาก', map: 'house' },
  { id: 'hedge', name: 'พุ่มไม้ตัดแต่ง', w: 30, tier: 'ธรรมดา', map: 'house' },
  { id: 'gardenlamp', name: 'โคมไฟสวน', w: 18, tier: 'ไม่ธรรมดา', map: 'house' },
  { id: 'toolcart', name: 'รถเข็นเครื่องมือ', w: 18, tier: 'ไม่ธรรมดา', map: 'house' },
  { id: 'laundrybasket', name: 'ตะกร้าผ้า', w: 30, tier: 'ธรรมดา', map: 'house' },
  { id: 'coffeetable', name: 'โต๊ะกลาง', w: 18, tier: 'ไม่ธรรมดา', map: 'house' },
  { id: 'schoolchair', name: 'เก้าอี้นักเรียน', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'bookshelf', name: 'ชั้นหนังสือ', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'schoolbin', name: 'ถังขยะโรงเรียน', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'teacherdesk', name: 'โต๊ะครู', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'potplant', name: 'กระถางต้นไม้', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'watercooler', name: 'ตู้กดน้ำเย็น', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'moppail', name: 'ถังม็อบ', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'lunchtray', name: 'ถาดอาหารกลางวัน', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'standfan', name: 'พัดลมตั้งพื้น', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'binset', name: 'ถังขยะแยกประเภท', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'shoerack', name: 'ชั้นวางรองเท้า', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'noticeboard', name: 'บอร์ดประกาศ', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'schoolbag', name: 'กระเป๋านักเรียน', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'waterjar', name: 'โอ่งน้ำ', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'benchlong', name: 'ม้านั่งยาว', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'projector', name: 'โปรเจกเตอร์', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'microscope', name: 'กล้องจุลทรรศน์', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'conesport', name: 'กรวยพลาสติก', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'clocksign', name: 'นาฬิกาโรงเรียน', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'chalkbox', name: 'กล่องชอล์ก', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'schooldesk', name: 'โต๊ะนักเรียน', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'blackboard', name: 'กระดานดำ', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'lockerbay', name: 'ตู้ล็อกเกอร์', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'globe', name: 'ลูกโลก', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'bookstack', name: 'กองหนังสือ', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'basketball', name: 'ลูกบาส', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'hoop', name: 'ห่วงบาส', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'flagpole', name: 'เสาธง', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'labtable', name: 'โต๊ะแล็บ', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'piano', name: 'เปียโน', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'waterfountain', name: 'ที่กดน้ำ', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'podium', name: 'แท่นพูด', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'soda', name: 'กระป๋องน้ำอัดลม', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'milk', name: 'กล่องนม', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'coffee', name: 'แก้วกาแฟ', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'water', name: 'ขวดน้ำดื่ม', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'snack', name: 'ซองขนม', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'chips', name: 'กระป๋องมันฝรั่ง', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'noodle', name: 'มาม่าถ้วย', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'chocopie', name: 'ขนมปังขนม', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'perfume', name: 'น้ำหอม', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'lipstick', name: 'ลิปสติก', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'powder', name: 'แป้งพัฟ', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'roll', name: 'โรลออน', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'sunscreen', name: 'ครีมกันแดด', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'sanitizer', name: 'เจลล้างมือ', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'medkit', name: 'กล่องยา', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'cleaner', name: 'น้ำยาทำความสะอาด', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'tissue', name: 'กล่องทิชชู่', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'watch', name: 'นาฬิกา', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'sunglasses', name: 'แว่นกันแดด', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'cap', name: 'หมวกแก๊ป', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'handbag', name: 'กระเป๋าถือ', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'backpack', name: 'กระเป๋าเป้', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'sneaker', name: 'รองเท้าผ้าใบ', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'luggage', name: 'กระเป๋าเดินทาง', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'teddy', name: 'ตุ๊กตาหมี', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'keychain', name: 'พวงกุญแจ', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'phone', name: 'โทรศัพท์มือถือ', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'tablet', name: 'แท็บเล็ต', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'earbuds', name: 'หูฟังไร้สาย', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'powerbank', name: 'แบตสำรอง', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'cable', name: 'สายชาร์จ', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'usb', name: 'แฟลชไดรฟ์', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'calculator', name: 'เครื่องคิดเลข', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'fan', name: 'พัดลมพกพา', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'book', name: 'หนังสือ', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'notebook', name: 'สมุดโน้ต', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'pen', name: 'ปากกา', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'pencil', name: 'ดินสอ', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'marker', name: 'ปากกาเน้นข้อความ', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'thermos', name: 'กระบอกน้ำเก็บความร้อน', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'umbrella', name: 'ร่มพับ', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'basket', name: 'ตะกร้าช้อปปิ้ง', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'cart', name: 'รถเข็น', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'extinguisher', name: 'ถังดับเพลิง', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'wetsign', name: 'ป้ายเตือนพื้นลื่น', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'barrier', name: 'แผงกั้น', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'wallclock', name: 'นาฬิกาแขวน', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'cone', name: 'กรวยจราจร', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'plant', name: 'ต้นไม้กระถาง', w: 30, tier: 'ธรรมดา', map: 'school' },
  { id: 'lamp', name: 'โคมไฟ', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'box', name: 'กล่องสินค้า', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'printer', name: 'เครื่องพิมพ์', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'showcase', name: 'ตู้โชว์', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'rack', name: 'ราวแขวนเสื้อ', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'mannequin', name: 'หุ่นโชว์เสื้อ', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'fridge', name: 'ตู้แช่', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'shopbag', name: 'ถุงช้อปปิ้ง', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'pillow', name: 'หมอน', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'vase', name: 'แจกัน', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'plate', name: 'จานชาม', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'radio', name: 'วิทยุ', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'rock', name: 'ก้อนหิน', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'bush', name: 'พุ่มไม้', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'log', name: 'ท่อนไม้', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'hay', name: 'กองฟาง', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'penguin', name: 'เพนกวิน', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'tortoise', name: 'เต่า', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'giraffe', name: 'ยีราฟ', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'elephant', name: 'ช้าง', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'lion', name: 'สิงโต', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'monkey', name: 'ลิง', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'bear', name: 'หมี', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'flamingo', name: 'นกฟลามิงโก', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'crocodile', name: 'จระเข้', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'zebra', name: 'ม้าลาย', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'hippo', name: 'ฮิปโป', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'parrot', name: 'นกแก้ว', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'rabbit', name: 'กระต่าย', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'goat', name: 'แพะ', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'deer', name: 'กวาง', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'snake', name: 'งู', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'frog', name: 'กบ', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'owl', name: 'นกฮูก', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'kangaroo', name: 'จิงโจ้', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'camel', name: 'อูฐ', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'panda', name: 'แพนด้า', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'tiger', name: 'เสือ', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'peacock', name: 'นกยูง', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'sink', name: 'อ่างล้างมือ', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'soapbox', name: 'ที่กดสบู่', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'broom', name: 'ไม้กวาด', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'toolbox', name: 'กล่องเครื่องมือ', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'statue', name: 'รูปปั้น', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'skeleton', name: 'โครงกระดูก', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'pedestal', name: 'แท่นจัดแสดง', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'lowfence', name: 'รั้วเตี้ย', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'warnsign', name: 'ป้ายเตือน', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'tray', name: 'ถาดอาหาร', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'cup', name: 'แก้วน้ำ', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'icebox', name: 'ถังน้ำแข็ง', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'bed', name: 'เตียง', w: 4, tier: 'พิเศษ', map: 'house' },
  { id: 'wardrobe', name: 'ตู้เสื้อผ้า', w: 4, tier: 'พิเศษ', map: 'house' },
  { id: 'toilet', name: 'ชักโครก', w: 18, tier: 'ไม่ธรรมดา', map: 'house' },
  { id: 'bathtub', name: 'อ่างอาบน้ำ', w: 4, tier: 'พิเศษ', map: 'house' },
  { id: 'stove', name: 'เตาแก๊ส', w: 9, tier: 'หายาก', map: 'house' },
  { id: 'microwave', name: 'ไมโครเวฟ', w: 18, tier: 'ไม่ธรรมดา', map: 'house' },
  { id: 'washer', name: 'เครื่องซักผ้า', w: 9, tier: 'หายาก', map: 'house' },
  { id: 'bike', name: 'จักรยาน', w: 9, tier: 'หายาก', map: 'house' },
  { id: 'mailbox', name: 'ตู้จดหมาย', w: 18, tier: 'ไม่ธรรมดา', map: 'house' },
  { id: 'doghouse', name: 'บ้านหมา', w: 9, tier: 'หายาก', map: 'house' },
  { id: 'grill', name: 'เตาย่าง', w: 18, tier: 'ไม่ธรรมดา', map: 'house' },
  { id: 'dresser', name: 'โต๊ะเครื่องแป้ง', w: 9, tier: 'หายาก', map: 'house' },
  { id: 'zoosign', name: 'ป้ายบอกทาง', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'feeder', name: 'รางอาหารสัตว์', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'bucket', name: 'ถังน้ำ', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'trashbin', name: 'ถังขยะสวน', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'popcorn', name: 'ป๊อปคอร์น', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'balloon', name: 'ลูกโป่ง', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'mapsign', name: 'ป้ายแผนที่', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'fountain', name: 'น้ำพุเล็ก', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'bamboo', name: 'กอไผ่', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'mushroom', name: 'เห็ดยักษ์', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'flowerbed', name: 'แปลงดอกไม้', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'tire', name: 'ยางรถ', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'barrel', name: 'ถังไม้', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'hydrant', name: 'หัวจ่ายน้ำดับเพลิง', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'ticketbooth', name: 'ตู้ขายตั๋ว', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'plushlion', name: 'ตุ๊กตาสิงโต', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'plushpanda', name: 'ตุ๊กตาแพนด้า', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'zoocap', name: 'หมวกสวนสัตว์', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'icecream', name: 'ไอศกรีม', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'slushie', name: 'น้ำแข็งไส', w: 18, tier: 'ไม่ธรรมดา', map: 'zoo' },
  { id: 'bench', name: 'ม้านั่งไม้', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'zoocart', name: 'รถเข็นขายของ', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'wheelbarrow', name: 'รถเข็นดิน', w: 9, tier: 'หายาก', map: 'zoo' },
  { id: 'pond', name: 'บ่อน้ำเล็ก', w: 4, tier: 'พิเศษ', map: 'zoo' },
  { id: 'shelf', name: 'ชั้นวางสินค้า', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'desk', name: 'เคาน์เตอร์', w: 9, tier: 'หายาก', map: 'school' },
  { id: 'chair', name: 'เก้าอี้', w: 18, tier: 'ไม่ธรรมดา', map: 'school' },
  { id: 'sofa', name: 'โซฟา', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'tv', name: 'ทีวี', w: 4, tier: 'พิเศษ', map: 'school' },
  { id: 'board', name: 'ป้ายโฆษณา', w: 4, tier: 'พิเศษ', map: 'school' },
];

/* สกินตัวละคร ใช้ตอนเป็นคนหา */
const SKIN_CATALOG = [
  { id: 'blue', name: 'ตำรวจน้ำเงิน', w: 30, tier: 'ธรรมดา' },
  { id: 'green', name: 'หน่วยพราง', w: 30, tier: 'ธรรมดา' },
  { id: 'red', name: 'หัวหน้าทีม', w: 18, tier: 'ไม่ธรรมดา' },
  { id: 'purple', name: 'สายลับม่วง', w: 12, tier: 'หายาก' },
  { id: 'gold', name: 'นายพลทอง', w: 7, tier: 'พิเศษ' },
  { id: 'dark', name: 'หน่วยกลางคืน', w: 7, tier: 'พิเศษ' },
  { id: 'guard', name: 'รปภ.ห้าง', w: 30, tier: 'ธรรมดา' },
  { id: 'janitor', name: 'แม่บ้าน', w: 30, tier: 'ธรรมดา' },
  { id: 'chef', name: 'พ่อครัว', w: 18, tier: 'ไม่ธรรมดา' },
  { id: 'worker', name: 'ช่างซ่อมบำรุง', w: 12, tier: 'หายาก' },
  { id: 'hoodie', name: 'วัยรุ่นฮู้ด', w: 7, tier: 'พิเศษ' },
  { id: 'shopper', name: 'ขาช้อป', w: 7, tier: 'พิเศษ' },
  // ชุดนักล่าปีศาจยุคไทโช (ออกแบบเอง ไม่อิงตัวละครจากเรื่องไหน)
  { id: 'slayerWave', name: 'นักล่าลายคลื่น', w: 18, tier: 'ไม่ธรรมดา' },
  { id: 'slayerLeaf', name: 'นักล่าลายใบป่าน', w: 18, tier: 'ไม่ธรรมดา' },
  { id: 'slayerFlame', name: 'นักล่าลายเปลวไฟ', w: 12, tier: 'หายาก' },
  { id: 'slayerSakura', name: 'นักล่าลายซากุระ', w: 12, tier: 'หายาก' },
  { id: 'slayerNight', name: 'นักล่าลายราตรี', w: 7, tier: 'พิเศษ' },
  { id: 'slayerMoon', name: 'นักล่าลายจันทรา', w: 7, tier: 'พิเศษ' },
];

/* ราคาสุ่มและเงินคืนเมื่อได้ของซ้ำ */
const GACHA = { prop: 100, skin: 150, dupBack: 0.35, pity: 5 };   // ซ้ำติดกัน 4 ครั้ง ครั้งที่ 5 การันตีของใหม่

const CATALOG_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));
const SKIN_BY_ID = new Map(SKIN_CATALOG.map((c) => [c.id, c]));
// ของเริ่มต้นต้องเป็นของที่วางอยู่บนพื้นจริงในด่าน (กระป๋องน้ำอยู่บนชั้น ปลอมตัวแล้วโดดเด่น)
const STARTER = ['box', 'basket', 'chair'];
const START_GOLD = 300;

const MAX_LEVEL = 100;

/* อิโมจิประจำตัว เลือกเองได้ในหน้าตัวเลือก */
const AVATARS = ['🙂', '😎', '🤠', '🥷', '👮', '🕵️', '🐱', '🐶', '🐼', '🦊',
  '🐸', '🐵', '👻', '🤖', '👽', '🦖', '🍔', '🍩', '📦', '🛒'];

/* เลเวลต้น ๆ ขึ้นไว แล้วค่อย ๆ ใช้ exp มากขึ้นตามเลเวล ตันที่ 100 */
function xpNeeded(level) {
  return Math.round(180 + (level - 1) * 95 + Math.pow(level - 1, 1.7) * 6);
}

/* คืนเลเวล, exp ที่สะสมในเลเวลนั้น และ exp ที่ต้องใช้ขึ้นเลเวลถัดไป */
function progressOf(xp) {
  let left = Math.max(0, xp || 0);
  let level = 1;
  while (level < MAX_LEVEL) {
    const need = xpNeeded(level);
    if (left < need) return { level, inLevel: left, need };
    left -= need;
    level++;
  }
  return { level: MAX_LEVEL, inLevel: 0, need: 0 };
}

const levelOf = (xp) => progressOf(xp).level;

/* ------------------------------------------------------------------ */
/* โหลด/บันทึก                                                          */
/* ------------------------------------------------------------------ */

let db = { users: {}, tokens: {} };
let dirty = false;

function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      db.users = raw.users || {};
      db.tokens = raw.tokens || {};
    }
  } catch (e) {
    console.error('โหลดข้อมูลผู้เล่นไม่สำเร็จ เริ่มจากฐานว่าง:', e.message);
    db = { users: {}, tokens: {} };
  }
  const now = Date.now();
  for (const [t, v] of Object.entries(db.tokens)) {
    if (!v || v.exp < now || !db.users[v.u]) delete db.tokens[t];
  }
}

async function flushPg() {
  if (!pgReady || (!dirtyUsers.size && !dirtyTokens)) return;
  const users = [...dirtyUsers];
  dirtyUsers.clear();
  const tokensChanged = dirtyTokens;
  dirtyTokens = false;
  try {
    for (const k of users) {
      const u = db.users[k];
      if (!u) { await pool.query('DELETE FROM ph_users WHERE k=$1', [k]); continue; }
      const { socket, ...plain } = u;
      await pool.query(
        'INSERT INTO ph_users(k, data) VALUES($1,$2) ON CONFLICT (k) DO UPDATE SET data=$2',
        [k, JSON.stringify(plain)]
      );
    }
    if (tokensChanged) {
      await pool.query('DELETE FROM ph_tokens');
      const entries = Object.entries(db.tokens);
      for (const [t, v] of entries) {
        await pool.query('INSERT INTO ph_tokens(t, u, exp) VALUES($1,$2,$3) ON CONFLICT (t) DO NOTHING',
          [t, v.u, v.exp]);
      }
    }
  } catch (e) {
    console.error('เขียนลง Postgres ไม่สำเร็จ:', e.message);
    users.forEach((k) => dirtyUsers.add(k));
    if (tokensChanged) dirtyTokens = true;
  }
}

function flush() {
  if (pgReady) { flushPg(); return; }
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TMP, JSON.stringify(db));
    fs.renameSync(TMP, FILE);         // เขียนทับแบบ atomic กันไฟล์พังตอนดับกลางคัน
  } catch (e) {
    console.error('บันทึกข้อมูลผู้เล่นไม่สำเร็จ:', e.message);
  }
}

function save(key) {
  dirty = true;
  if (key) dirtyUsers.add(key);
  else for (const k of Object.keys(db.users)) dirtyUsers.add(k);
  dirtyTokens = true;
}

/* เชื่อม Postgres แล้วดึงบัญชีทั้งหมดขึ้นมาไว้ในหน่วยความจำ
   ตัวเกมยังเรียกใช้แบบซิงก์เหมือนเดิม การเขียนกลับทำเบื้องหลัง */
async function initDb() {
  if (!pg) return false;
  try {
    const ssl = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
      ? false : { rejectUnauthorized: false };
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 4 });
    await pool.query('CREATE TABLE IF NOT EXISTS ph_users (k TEXT PRIMARY KEY, data JSONB NOT NULL)');
    await pool.query('CREATE TABLE IF NOT EXISTS ph_tokens (t TEXT PRIMARY KEY, u TEXT NOT NULL, exp BIGINT NOT NULL)');

    const us = await pool.query('SELECT k, data FROM ph_users');
    const fileUsers = Object.keys(db.users).length;
    for (const row of us.rows) db.users[row.k] = row.data;

    const ts = await pool.query('SELECT t, u, exp FROM ph_tokens');
    for (const row of ts.rows) db.tokens[row.t] = { u: row.u, exp: Number(row.exp) };

    pgReady = true;

    // ถ้าเคยมีไฟล์เก่าอยู่ ย้ายบัญชีเข้าฐานข้อมูลให้ครั้งเดียว
    if (fileUsers && us.rows.length === 0) {
      for (const k of Object.keys(db.users)) dirtyUsers.add(k);
      dirtyTokens = true;
      await flushPg();
      console.log(`ย้ายบัญชีเดิมจากไฟล์เข้า Postgres แล้ว ${fileUsers} บัญชี`);
    }
    return true;
  } catch (e) {
    console.error('ต่อ Postgres ไม่สำเร็จ จะใช้ไฟล์แทน:', e.message);
    pgReady = false;
    return false;
  }
}

/* เขียนลงดิสก์เดี๋ยวนี้ ใช้ตอนสมัคร เข้าสู่ระบบ สุ่มของ และจบรอบ
   กันข้อมูลหายถ้าเครื่องถูกรีสตาร์ตก่อนถึงรอบเซฟอัตโนมัติ */
function flushNow() { flush(); }

/* รายงานตอนสตาร์ต ให้เห็นชัดว่าข้อมูลผู้เล่นถูกเก็บที่ไหนและจะอยู่ถาวรไหม */
function storageReport() {
  const n = Object.keys(db.users).length;
  if (pgReady) {
    return `ข้อมูลผู้เล่น: Postgres (มีบัญชีอยู่ ${n} บัญชี) — เก็บถาวรแล้ว ไม่ต้องใช้ volume`;
  }
  const persistent = !!process.env.DATA_DIR;
  const lines = [
    `ข้อมูลผู้เล่น: ${FILE} (มีบัญชีอยู่ ${n} บัญชี)`,
  ];
  if (process.env.DATABASE_URL) {
    lines.push('มี DATABASE_URL แต่ต่อฐานข้อมูลไม่ได้ จึงถอยมาใช้ไฟล์');
  }
  if (!persistent) {
    lines.push('คำเตือน: ข้อมูลจะหายเมื่อ deploy ใหม่');
    lines.push('  วิธีที่ง่ายที่สุด: เพิ่ม Postgres ในโปรเจกต์ แล้วผูกตัวแปร DATABASE_URL เข้ากับ service นี้');
    lines.push('  หรือถ้าจะใช้ไฟล์: ต้องเพิ่ม Volume ที่ service นี้ (ไม่ใช่ที่ Postgres) mount /data แล้วตั้ง DATA_DIR=/data');
  } else {
    lines.push('เก็บถาวรผ่าน DATA_DIR เรียบร้อย');
  }
  return lines.join('\n');
}

load();
setInterval(flush, 4000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { flush(); process.exit(0); });
}
process.on('exit', flush);

/* ------------------------------------------------------------------ */
/* รหัสผ่าน                                                            */
/* ------------------------------------------------------------------ */

function hashPw(pw, salt) {
  return crypto.scryptSync(pw, salt, 64).toString('hex');
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

const NAME_RE = /^[A-Za-z0-9_\u0E00-\u0E7F]{3,14}$/;

function validName(n) { return NAME_RE.test(String(n || '')); }
function key(n) { return String(n).toLowerCase(); }

/* ------------------------------------------------------------------ */
/* บัญชี                                                               */
/* ------------------------------------------------------------------ */

/* บัญชีเก่าที่สร้างก่อนมีระบบสกิน ต้องเติมฟิลด์ให้ครบก่อนใช้ */
function ensure(u) {
  if (!u) return u;
  if (!Array.isArray(u.skins) || !u.skins.length) u.skins = ['blue'];
  if (!u.skin || !u.skins.includes(u.skin)) u.skin = u.skins[0];
  if (!Array.isArray(u.unlocked) || !u.unlocked.length) u.unlocked = STARTER.slice();
  if (typeof u.xp !== 'number') u.xp = (u.games || 0) * 60;
  if (!AVATARS.includes(u.avatar)) u.avatar = AVATARS[0];
  if (typeof u.avatarImg !== 'string') u.avatarImg = '';
  return u;
}

function publicProfile(u) {
  ensure(u);
  const prog = progressOf(u.xp);
  return {
    name: u.name,
    guest: !!u.guest,
    gold: u.gold,
    unlocked: u.unlocked.slice(),
    skins: u.skins.slice(),
    skin: u.skin,
    avatar: u.avatar,
    avatarImg: u.avatarImg || '',
    xp: u.xp,
    level: prog.level,
    xpInLevel: prog.inLevel,
    xpPerLevel: prog.need,
    maxLevel: MAX_LEVEL,
    stats: { games: u.games, wins: u.wins, catches: u.catches, best: u.best },
  };
}

function register(name, pw) {
  if (!validName(name)) return { error: 'ชื่อต้องยาว 3-14 ตัว ใช้ตัวอักษร ตัวเลข หรือ _ เท่านั้น' };
  if (String(pw || '').length < 4) return { error: 'รหัสผ่านต้องยาวอย่างน้อย 4 ตัว' };
  const k = key(name);
  if (db.users[k]) return { error: 'ชื่อนี้มีคนใช้แล้ว' };

  const salt = crypto.randomBytes(16).toString('hex');
  db.users[k] = {
    name: String(name),
    salt,
    hash: hashPw(pw, salt),
    gold: START_GOLD,
    unlocked: STARTER.slice(),
    skins: ['blue'], skin: 'blue',
    games: 0, wins: 0, catches: 0, best: 0, xp: 0,
    friends: [], requests: [],
    created: Date.now(),
  };
  save(k);
  return login(name, pw);
}

function login(name, pw) {
  const u = db.users[key(name)];
  if (!u || u.guest) return { error: 'ชื่อหรือรหัสผ่านไม่ถูกต้อง' };
  const h = hashPw(pw, u.salt);
  const ok = h.length === u.hash.length
    && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(u.hash));
  if (!ok) return { error: 'ชื่อหรือรหัสผ่านไม่ถูกต้อง' };
  const token = makeToken();
  db.tokens[token] = { u: key(name), exp: Date.now() + TOKEN_TTL };
  save(key(name));
  return { token, profile: publicProfile(u) };
}

/* ผู้เล่นชั่วคราว เล่นได้ครบทุกอย่างแต่ข้อมูลไม่ถูกเก็บถาวร */
function guest(nick) {
  const base = validName(nick) ? String(nick) : 'ผู้มาเยือน';
  let n = base, i = 1;
  while (db.users[key(n)]) n = base + (++i);
  const k = key(n);
  db.users[k] = {
    name: n, guest: true, salt: '', hash: '',
    gold: START_GOLD, unlocked: STARTER.slice(),
    skins: ['blue'], skin: 'blue',
    games: 0, wins: 0, catches: 0, best: 0, xp: 0,
    friends: [], requests: [], created: Date.now(),
  };
  const token = makeToken();
  db.tokens[token] = { u: k, exp: Date.now() + 1000 * 60 * 60 * 12 };
  return { token, profile: publicProfile(db.users[k]) };
}

function userByToken(token) {
  const t = db.tokens[String(token || '')];
  if (!t || t.exp < Date.now()) return null;
  return ensure(db.users[t.u] || null);
}

function logout(token) {
  delete db.tokens[String(token || '')];
  save();
}

/* ------------------------------------------------------------------ */
/* ร้านค้าและทอง                                                        */
/* ------------------------------------------------------------------ */

function shopFor(u) {
  ensure(u);
  // โอกาสคิดแยกตามด่าน เพราะปุ่มสุ่มแยกกัน (สุ่มของห้าง / สุ่มของสวนสัตว์)
  const totals = {};
  for (const c of poolFor(null)) totals[c.map] = (totals[c.map] || 0) + c.w;
  return poolFor(null).map((c) => ({
    id: c.id, name: c.name, tier: c.tier, map: c.map,
    chance: Math.round((c.w / totals[c.map]) * 1000) / 10,
    owned: u.unlocked.includes(c.id),
  }));
}

function skinsFor(u) {
  ensure(u);
  const total = SKIN_CATALOG.reduce((a, c) => a + c.w, 0);
  return SKIN_CATALOG.map((c) => ({
    id: c.id, name: c.name, tier: c.tier,
    chance: Math.round((c.w / total) * 1000) / 10,
    owned: u.skins.includes(c.id),
    selected: u.skin === c.id,
  }));
}

function weightedPick(list) {
  const total = list.reduce((a, c) => a + c.w, 0);
  let r = Math.random() * total;
  for (const c of list) {
    r -= c.w;
    if (r <= 0) return c;
  }
  return list[list.length - 1];
}

/* สุ่มของ ได้ของซ้ำได้ ถ้าซ้ำจะคืนทองส่วนหนึ่ง */
/* ของที่มีอยู่จริงในแต่ละด่าน เซิร์ฟเวอร์ตั้งค่าให้ตอนสตาร์ต
   ร้านค้าจะสุ่มให้เฉพาะของที่ด่านนั้นมีวางอยู่จริง ไม่ขายของที่ไม่มีต้นแบบ */
const MAP_POOLS = {};
function setMapPool(map, ids) { MAP_POOLS[map] = new Set(ids); }

/* ด่านไหนมีของชนิดนี้วางอยู่จริงบ้าง (ใช้ตัดสินว่าขายในด่านไหนได้)
   ยึดจากของที่มีในแผนที่จริง ไม่ยึดจากช่อง map ในแคตตาล็อก */
function mapsWith(id) {
  return Object.keys(MAP_POOLS).filter((k) => MAP_POOLS[k].has(id));
}
function poolFor(map) {
  if (!Object.keys(MAP_POOLS).length) return CATALOG.filter((c) => !map || c.map === map);
  return CATALOG.filter((c) => {
    const inMaps = mapsWith(c.id);
    if (!inMaps.length) return false;
    return map ? inMaps.includes(map) : true;
  }).map((c) => (mapsWith(c.id).includes(c.map) ? c : { ...c, map: mapsWith(c.id)[0] }));
}

function draw(u, kind, map) {
  ensure(u);
  const isSkin = kind === 'skin';
  const cost = isSkin ? GACHA.skin : GACHA.prop;
  if (u.gold < cost) return { error: `ทองไม่พอ ต้องใช้ ${cost} ขาดอีก ${cost - u.gold}` };

  // สุ่มของเฉพาะด่านที่เลือก (ห้าง / สวนสัตว์) ไม่ปนกัน
  const pool = isSkin ? SKIN_CATALOG : poolFor(map);
  if (!pool.length) return { error: 'ไม่มีของของด่านนี้' };
  u.gold -= cost;
  const owned = isSkin ? u.skins : u.unlocked;
  // Pity: ถ้าสุ่มซ้ำมาแล้ว (pity-1) ครั้งติด ครั้งนี้บังคับให้ได้ของใหม่ (ถ้ายังมีของใหม่ให้ได้)
  u.pity = u.pity || { prop: 0, skin: 0 };
  const pk = isSkin ? 'skin' : 'prop';
  const fresh = pool.filter((c) => !owned.includes(c.id));
  let item;
  if (u.pity[pk] >= GACHA.pity - 1 && fresh.length) item = weightedPick(fresh);
  else item = weightedPick(pool);
  const dup = owned.includes(item.id);
  u.pity[pk] = dup ? u.pity[pk] + 1 : 0;
  let back = 0;

  if (dup) {
    back = Math.round(cost * GACHA.dupBack);
    u.gold += back;
  } else {
    owned.push(item.id);
    if (isSkin) u.skin = item.id;
  }
  save();

  return {
    kind, dup, back,
    pity: u.pity[pk], pityAt: GACHA.pity,
    id: item.id, name: item.name, tier: item.tier, map: item.map || null,
    gold: u.gold,
    unlocked: u.unlocked.slice(),
    skins: u.skins.slice(),
    skin: u.skin,
  };
}

function setAvatar(u, emoji) {
  ensure(u);
  if (!AVATARS.includes(emoji)) return { error: 'ไม่มีอิโมจินี้ให้เลือก' };
  u.avatar = emoji;
  save(key(u.name));
  return { avatar: u.avatar };
}

/* รูปประจำตัวที่อัปโหลดเอง เก็บเป็น data URL ขนาดเล็ก
   ไคลเอนต์ย่อให้เหลือ 96x96 ก่อนส่งมาแล้ว ที่นี่แค่กันของใหญ่เกิน */
const AVATAR_MAX = 24000;

function setAvatarImage(u, dataUrl) {
  ensure(u);
  const v = String(dataUrl || '');
  if (!v) { u.avatarImg = ''; save(key(u.name)); return { avatarImg: '' }; }
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(v)) return { error: 'ไฟล์รูปไม่ถูกต้อง' };
  if (v.length > AVATAR_MAX) return { error: 'รูปใหญ่เกินไป ลองรูปที่เล็กกว่านี้' };
  u.avatarImg = v;
  save(key(u.name));
  return { avatarImg: u.avatarImg };
}

const today = () => new Date().toISOString().slice(0, 10);

function setSkin(u, id) {
  ensure(u);
  if (!u.skins.includes(String(id))) return { error: 'ยังไม่ได้ปลดล็อกสกินนี้' };
  u.skin = String(id);
  save();
  return { skin: u.skin };
}

function addGold(u, amount) {
  u.gold = Math.max(0, Math.round(u.gold + amount));
  save(key(u.name));
  return u.gold;
}

function recordRound(u, { won, catches, score }) {
  ensure(u);
  u.xp += Math.round((score || 0) / 4) + (won ? 60 : 20);
  u.games += 1;
  if (won) u.wins += 1;
  u.catches += catches || 0;
  u.best = Math.max(u.best || 0, Math.round(score || 0));
  save(key(u.name));
}

/* ------------------------------------------------------------------ */
/* เพื่อน                                                              */
/* ------------------------------------------------------------------ */

function friendState(u, onlineMap) {
  const seen = (n) => onlineMap.get(key(n)) || null;
  return {
    friends: u.friends.map((n) => {
      const f = db.users[key(n)];
      const on = seen(n);
      return { name: f ? f.name : n, online: !!on, room: on ? on.room : null };
    }),
    requests: u.requests.map((n) => (db.users[key(n)] ? db.users[key(n)].name : n)),
  };
}

function sendRequest(u, targetName) {
  const t = db.users[key(targetName)];
  if (!t) return { error: 'ไม่พบผู้เล่นชื่อนี้' };
  if (t === u) return { error: 'เพิ่มตัวเองเป็นเพื่อนไม่ได้' };
  if (t.guest) return { error: 'ผู้เล่นชั่วคราวเพิ่มเป็นเพื่อนไม่ได้' };
  if (u.friends.some((n) => key(n) === key(t.name))) return { error: 'เป็นเพื่อนกันอยู่แล้ว' };
  if (t.requests.some((n) => key(n) === key(u.name))) return { error: 'ส่งคำขอไปแล้ว รอเขากดรับ' };
  if (u.requests.some((n) => key(n) === key(t.name))) return accept(u, t.name);
  if (t.requests.length > 50) return { error: 'กล่องคำขอของเขาเต็ม' };
  t.requests.push(u.name);
  save();
  return { ok: true, msg: 'ส่งคำขอเป็นเพื่อนแล้ว' };
}

function accept(u, fromName) {
  const idx = u.requests.findIndex((n) => key(n) === key(fromName));
  if (idx < 0) return { error: 'ไม่พบคำขอนี้' };
  const f = db.users[key(fromName)];
  u.requests.splice(idx, 1);
  if (!f) { save(); return { error: 'ผู้เล่นคนนี้ไม่อยู่แล้ว' }; }
  if (!u.friends.some((n) => key(n) === key(f.name))) u.friends.push(f.name);
  if (!f.friends.some((n) => key(n) === key(u.name))) f.friends.push(u.name);
  save();
  return { ok: true, msg: `เป็นเพื่อนกับ ${f.name} แล้ว` };
}

function decline(u, fromName) {
  u.requests = u.requests.filter((n) => key(n) !== key(fromName));
  save();
  return { ok: true };
}

function removeFriend(u, name) {
  u.friends = u.friends.filter((n) => key(n) !== key(name));
  const f = db.users[key(name)];
  if (f) f.friends = f.friends.filter((n) => key(n) !== key(u.name));
  save();
  return { ok: true };
}

module.exports = {
  CATALOG, CATALOG_BY_ID, STARTER, setMapPool, poolFor, START_GOLD, GACHA, levelOf, progressOf, xpNeeded, MAX_LEVEL,
  SKIN_CATALOG, SKIN_BY_ID, skinsFor, setSkin, ensure, draw, AVATARS, setAvatar, setAvatarImage,
  register, login, guest, logout, userByToken, publicProfile,
  flushNow, storageReport, initDb,
  shopFor, addGold, recordRound,
  friendState, sendRequest, accept, decline, removeFriend,
  key, validName,
  _db: db, _flush: flush,
};
