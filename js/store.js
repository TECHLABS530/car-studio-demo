// طبقة البيانات: كل شيء محفوظ في متصفح الجهاز (localStorage للبيانات، IndexedDB للصور والنماذج).
// عند الانتقال للإنتاج تُستبدل هذه الوحدة بواجهة خادم (Supabase مثلًا) بنفس الدوال.

const KEY = 'car-studio:v1';
const listeners = new Set();

export const SERVICES_SEED = [
  { id: 'wash', name: 'غسيل وتنظيف شامل', desc: 'غسيل خارجي يدوي، تنظيف داخلي بالبخار، تلميع الإطارات والزجاج.', price: 150, minutes: 60, kind: 'wash', active: true },
  { id: 'paint', name: 'تغيير لون السيارة', desc: 'رش كامل أو تغليف (راب) بلون تختاره، مع معاينة ثلاثية الأبعاد قبل التنفيذ.', price: 6500, minutes: 60, kind: 'custom', active: true },
  { id: 'interior', name: 'تغيير لون الفرش', desc: 'تنجيد المقاعد بجلد أو شمواه بلون جديد، مع معاينة الداخلية ثلاثية الأبعاد.', price: 3800, minutes: 60, kind: 'custom', active: true },
  { id: 'steering', name: 'تغيير الستيرنج', desc: 'تلبيس أو تغيير الستيرنج بجلد وخياطة بلون تختاره.', price: 900, minutes: 60, kind: 'custom', active: true },
  { id: 'rims', name: 'صبغ الجنوط', desc: 'صبغ الجنوط بلون مطفي أو لامع.', price: 1200, minutes: 60, kind: 'custom', active: true },
];

const CARS_SEED = [
  {
    id: 'ferrari-458', brand: 'Ferrari', model: '458 Spider', year: 2015, body: 'كوبيه مكشوفة',
    modelSrc: { type: 'bundled', url: 'assets/models/ferrari.glb', ao: 'assets/models/ferrari_ao.png' },
    front: -1, rules: {}, partMap: {},
    colors: [
      { name: 'Rosso Corsa', ar: 'أحمر كورسا', hex: '#c8102e', finish: 'gloss' },
      { name: 'Giallo Modena', ar: 'أصفر مودينا', hex: '#f5c400', finish: 'gloss' },
      { name: 'Nero Daytona', ar: 'أسود دايتونا', hex: '#0d0e10', finish: 'metallic' },
      { name: 'Bianco Avus', ar: 'أبيض أفوس', hex: '#efefe9', finish: 'pearl' },
      { name: 'Blu Pozzi', ar: 'أزرق بوتسي', hex: '#1c2a55', finish: 'metallic' },
      { name: 'Grigio Silverstone', ar: 'رمادي سيلفرستون', hex: '#6b6e72', finish: 'metallic' },
    ],
    photos: [], thumb: 'assets/shots/ferrari-458.jpg',
    credit: '3D: "Ferrari 458 Italia" by vicent091036 — CC BY 4.0',
  },
  {
    id: 'lamborghini-urus', brand: 'Lamborghini', model: 'Urus', year: 2022, body: 'SUV',
    modelSrc: { type: 'bundled', url: 'assets/models/lamborghini-urus.glb' },
    front: 1, rules: { body: ['WhiteCar'], rims: ['RimsChrome', 'Whl_HD_*'] }, partMap: {},
    colors: [
      { name: 'Giallo Auge', ar: 'أصفر أوجي', hex: '#f2c200', finish: 'gloss' },
      { name: 'Arancio Borealis', ar: 'برتقالي بورياليس', hex: '#e3591d', finish: 'pearl' },
      { name: 'Verde Mantis', ar: 'أخضر مانتس', hex: '#6cbf2a', finish: 'pearl' },
      { name: 'Bianco Monocerus', ar: 'أبيض مونوسيروس', hex: '#f1f1ee', finish: 'gloss' },
      { name: 'Nero Noctis', ar: 'أسود نوكتيس', hex: '#0b0b0c', finish: 'gloss' },
      { name: 'Grigio Nimbus', ar: 'رمادي نيمبوس مطفي', hex: '#7d8083', finish: 'matte' },
    ],
    photos: [], thumb: 'assets/shots/lamborghini-urus.jpg',
    credit: '3D: "Lamborghini Urus" by Steven Grey — CC BY-NC 4.0',
  },
  {
    id: 'porsche-911', brand: 'Porsche', model: '911 Carrera 4S', year: 2016, body: 'كوبيه',
    modelSrc: { type: 'bundled', url: 'assets/models/porsche-911.glb' },
    front: 1, rules: {}, partMap: {},
    colors: [
      { name: 'Guards Red', ar: 'أحمر غاردز', hex: '#c4161c', finish: 'gloss' },
      { name: 'Racing Yellow', ar: 'أصفر ريسنغ', hex: '#f5d10f', finish: 'gloss' },
      { name: 'Miami Blue', ar: 'أزرق ميامي', hex: '#2fa6d6', finish: 'gloss' },
      { name: 'GT Silver', ar: 'فضي GT', hex: '#b9bcbf', finish: 'metallic' },
      { name: 'Agate Grey', ar: 'رمادي أجيت', hex: '#5b5e61', finish: 'metallic' },
      { name: 'Carrara White', ar: 'أبيض كرارا', hex: '#f2f2ef', finish: 'pearl' },
      { name: 'Jet Black', ar: 'أسود جيت', hex: '#121314', finish: 'metallic' },
    ],
    photos: [], thumb: 'assets/shots/porsche-911.jpg',
    credit: '3D: "Porsche 911 Carrera 4S" by Karol Miklas — CC BY-SA 4.0',
  },
  {
    id: 'porsche-930', brand: 'Porsche', model: '911 Turbo (930)', year: 1985, body: 'كلاسيكية',
    modelSrc: { type: 'bundled', url: 'assets/models/porsche-930.glb' },
    front: 1, rules: { hide: ['DefaultMaterial', 'Material.001'] }, partMap: {},
    colors: [
      { name: 'Guards Red', ar: 'أحمر غاردز', hex: '#c4161c', finish: 'gloss' },
      { name: 'Grand Prix White', ar: 'أبيض غراند بري', hex: '#f4f2ea', finish: 'gloss' },
      { name: 'Minerva Blue', ar: 'أزرق منيرفا', hex: '#2a3b6b', finish: 'metallic' },
      { name: 'Platinum Silver', ar: 'فضي بلاتيني', hex: '#b8b9b7', finish: 'metallic' },
      { name: 'Black', ar: 'أسود', hex: '#101011', finish: 'gloss' },
    ],
    photos: [], thumb: 'assets/shots/porsche-930.jpg',
    credit: '3D: "Porsche 911 930 Turbo" by Karol Miklas — CC BY 4.0',
  },
];

export const DEMO = {
  customer: { name: 'محمد العتيبي', phone: '0551234567' },
  ownerName: 'أبو فيصل',
};

function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
function ago(hours) { return new Date(Date.now() - hours * 3600e3).toISOString(); }

function demoOrders() {
  const me = DEMO.customer;
  return [
    {
      id: 'o1001', no: 1001, createdAt: ago(30), demo: true,
      customer: me, serviceIds: ['paint', 'steering'], carId: 'ferrari-458',
      carText: { plate: 'أ ب ج 4581', color: 'أحمر كورسا' },
      date: day(3), time: '11:00', notes: 'أبغى لون أزرق غامق ميتاليك، والستيرنج أحمر رياضي.',
      status: 'proposal_sent',
      payments: [{ amount: 300, method: 'card', last4: '4242', at: ago(30), label: 'عربون الحجز' }],
      proposals: [{
        id: 'p1', at: ago(4), price: 7400, status: 'sent', note: 'اقترحنا أزرق بوتسي ميتاليك مع ستيرنج جلد أحمر بخياطة سوداء. مدة التنفيذ 5 أيام عمل.',
        config: { body: { color: '#1c2a55', finish: 'metallic', name: 'Blu Pozzi' }, steering: { color: '#b3121f', finish: 'leather', name: 'أحمر رياضي' } },
      }],
      log: [{ at: ago(30), text: 'تم الحجز ودفع العربون' }, { at: ago(4), text: 'أرسل المعرض عرض التصميم' }],
    },
    {
      id: 'o1002', no: 1002, createdAt: ago(20), demo: true,
      customer: me, serviceIds: ['wash'], carId: 'porsche-911',
      carText: { plate: 'د هـ و 911', color: 'فضي' },
      date: day(1), time: '10:00', notes: '', status: 'booked',
      payments: [{ amount: 150, method: 'card', last4: '4242', at: ago(20), label: 'دفع الخدمة' }],
      proposals: [], log: [{ at: ago(20), text: 'تم الحجز والدفع' }],
    },
    {
      id: 'o1003', no: 1003, createdAt: ago(6), demo: true,
      customer: me, serviceIds: ['paint', 'rims'], carId: 'lamborghini-urus',
      carText: { plate: 'ر س ع 2022', color: 'أبيض' },
      date: day(5), time: '13:00', notes: 'أفكر في أخضر مطفي أو برتقالي، مع جنوط سوداء.', status: 'awaiting_design',
      payments: [{ amount: 300, method: 'card', last4: '1881', at: ago(6), label: 'عربون الحجز' }],
      proposals: [], log: [{ at: ago(6), text: 'تم الحجز ودفع العربون' }],
    },
    {
      id: 'o1004', no: 1004, createdAt: ago(80), demo: true,
      customer: { name: 'خالد الشمري', phone: '0533332211' }, serviceIds: ['interior', 'steering'], carId: 'ferrari-458',
      carText: { plate: 'ك ل م 458', color: 'أصفر' },
      date: day(0), time: '16:00', notes: 'فرش بيج.', status: 'in_progress',
      payments: [{ amount: 300, method: 'card', last4: '0005', at: ago(80), label: 'عربون الحجز' }, { amount: 4200, method: 'card', last4: '0005', at: ago(40), label: 'المبلغ المتبقي' }],
      proposals: [{ id: 'p2', at: ago(60), price: 4500, status: 'approved', note: 'فرش جلد نابا بيج مع ستيرنج بنفس اللون.',
        config: { body: { color: '#f5c400', finish: 'gloss', name: 'Giallo Modena' }, interior: { color: '#c9a77c', finish: 'nappa', name: 'بيج' }, steering: { color: '#c9a77c', finish: 'leather', name: 'بيج' } } }],
      log: [{ at: ago(80), text: 'تم الحجز ودفع العربون' }, { at: ago(60), text: 'أرسل المعرض عرض التصميم' }, { at: ago(41), text: 'وافق العميل على التصميم' }, { at: ago(40), text: 'تم دفع المبلغ المتبقي' }, { at: ago(20), text: 'بدأ التنفيذ' }],
    },
    {
      id: 'o1005', no: 1005, createdAt: ago(240), demo: true,
      customer: { name: 'فهد القحطاني', phone: '0541112233' }, serviceIds: ['wash'], carId: 'porsche-930',
      carText: { plate: 'ن هـ ي 930', color: 'أحمر' },
      date: day(-2), time: '18:00', notes: '', status: 'done',
      payments: [{ amount: 150, method: 'cash', at: ago(200), label: 'دفع في المعرض' }],
      proposals: [], log: [{ at: ago(240), text: 'تم الحجز' }, { at: ago(200), text: 'اكتملت الخدمة' }],
    },
  ];
}

function seed() {
  return {
    settings: { shopName: 'ستوديو الألوان', currency: 'ر.س', ownerPin: '1234', deposit: 300, openHour: 9, closeHour: 21, slotCapacity: 2, phone: '0500000000', vat: 15 },
    services: SERVICES_SEED,
    cars: CARS_SEED,
    orders: demoOrders(),
    session: null,
    seq: 1005,
    version: 3,
  };
}

let state;
try { state = JSON.parse(localStorage.getItem(KEY)); } catch { state = null; }
if (!state || state.version !== 3) state = seed();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('تعذر الحفظ', e); }
  listeners.forEach((fn) => fn());
}

export const store = {
  get: () => state,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  update(mutator) { mutator(state); persist(); },
  reset() { state = seed(); persist(); },
  nextOrderNo() { state.seq += 1; return state.seq; },
};

// إذا تغيّرت البيانات في تبويب آخر (مثلاً المالك في تبويب والعميل في آخر) نحدّث الواجهة.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  try { state = JSON.parse(e.newValue) || seed(); } catch { return; }
  listeners.forEach((fn) => fn());
});

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- ملفات كبيرة (صور حقيقية، نماذج GLB، لقطات العروض) ----------
let dbp;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open('car-studio-files', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

export async function putFile(blob) {
  const id = uid();
  const d = await db();
  await new Promise((res, rej) => {
    const tx = d.transaction('files', 'readwrite');
    tx.objectStore('files').put(blob, id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return id;
}

const urlCache = new Map();
export async function fileURL(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  try {
    const d = await db();
    const blob = await new Promise((res, rej) => {
      const r = d.transaction('files').objectStore('files').get(id);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(id, url);
    return url;
  } catch { return null; }
}

export async function deleteFile(id) {
  try {
    const d = await db();
    d.transaction('files', 'readwrite').objectStore('files').delete(id);
  } catch { /* لا شيء */ }
}

// تصغير الصور قبل الحفظ (حتى 1600px) للحفاظ على المساحة.
export function downscale(file, max = 1600) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.88);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export function dataURLtoBlob(dataURL) {
  const [head, b64] = dataURL.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
