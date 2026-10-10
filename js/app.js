import { store, uid, putFile, fileURL, deleteFile, downscale, dataURLtoBlob, DEMO } from './store.js';

// ---------- أدوات ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => store.get();
const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('en-US')} ${S().settings.currency}`;
const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);
const svcById = (id) => S().services.find((s) => s.id === id);
const carById = (id) => S().cars.find((c) => c.id === id);
const carName = (c) => (c ? `${c.brand} ${c.model}` : 'سيارة غير محددة');
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtAgo = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `قبل ${Math.max(1, m)} دقيقة`;
  if (m < 1440) return `قبل ${Math.round(m / 60)} ساعة`;
  return `قبل ${Math.round(m / 1440)} يوم`;
};
const today = () => new Date().toISOString().slice(0, 10);
const session = () => S().session;
const isOwner = () => session()?.role === 'owner';
const isCustomer = () => session()?.role === 'customer';

const FINISH_LABELS = { gloss: 'لامع', metallic: 'ميتاليك', pearl: 'لؤلؤي', satin: 'ساتان', matte: 'مطفي', leather: 'جلد', nappa: 'جلد نابا', suede: 'شمواه' };
const PART_LABELS = { body: 'الهيكل', interior: 'الفرش', steering: 'الستيرنج', rims: 'الجنوط', carpet: 'الأرضية' };
const SERVICE_PARTS = { paint: ['body'], interior: ['interior', 'carpet'], steering: ['steering'], rims: ['rims'] };

const STATUS = {
  booked: { owner: 'محجوز', customer: 'تم تأكيد الحجز', tone: 'info' },
  awaiting_design: { owner: 'بانتظار التصميم', customer: 'الفريق يجهّز تصميمك', tone: 'warn' },
  proposal_sent: { owner: 'بانتظار موافقة العميل', customer: 'تصميم جديد بانتظار موافقتك', tone: 'info' },
  changes_requested: { owner: 'العميل طلب تعديل', customer: 'تم إرسال طلب التعديل', tone: 'warn' },
  approved: { owner: 'معتمد', customer: 'معتمد', tone: 'ok' },
  in_progress: { owner: 'قيد التنفيذ', customer: 'قيد التنفيذ', tone: 'info' },
  done: { owner: 'مكتمل', customer: 'مكتمل', tone: 'ok' },
  cancelled: { owner: 'ملغي', customer: 'ملغي', tone: 'bad' },
};
const pill = (status, who = 'owner') => `<span class="pill ${STATUS[status]?.tone || 'mute'}">${esc(STATUS[status]?.[who] || status)}</span>`;

// ألوان جاهزة للفرش والستيرنج والجنوط
const TRIM_SWATCHES = [
  { ar: 'أسود', hex: '#1c1c1e' }, { ar: 'بيج', hex: '#c9a77c' }, { ar: 'كونياك', hex: '#8a4b23' }, { ar: 'بني شوكولا', hex: '#4a2c1d' },
  { ar: 'أحمر رياضي', hex: '#b3121f' }, { ar: 'أبيض عاجي', hex: '#ece6da' }, { ar: 'رمادي', hex: '#6d6f73' }, { ar: 'كحلي', hex: '#1f2a44' },
  { ar: 'أخضر زيتي', hex: '#3d4a2b' }, { ar: 'برتقالي', hex: '#d2601a' },
];
const RIM_SWATCHES = [
  { ar: 'فضي', hex: '#b9bcc0' }, { ar: 'أسود لامع', hex: '#141414' }, { ar: 'جرافيت', hex: '#3b3e42' }, { ar: 'برونزي', hex: '#8c6a3c' },
  { ar: 'ذهبي', hex: '#c9a54a' }, { ar: 'أبيض', hex: '#f0f0ee' }, { ar: 'أحمر', hex: '#b3121f' },
];
const EXTRA_PAINTS = [
  { ar: 'أخضر بريطاني', name: 'British Racing Green', hex: '#1f3d2b', finish: 'metallic' },
  { ar: 'نحاسي', name: 'Copper', hex: '#a2552c', finish: 'metallic' },
  { ar: 'بنفسجي', name: 'Viola', hex: '#4b2a6b', finish: 'pearl' },
  { ar: 'أخضر نعناعي', name: 'Mint', hex: '#8fd1b5', finish: 'gloss' },
  { ar: 'رملي', name: 'Desert Sand', hex: '#c8b28a', finish: 'satin' },
  { ar: 'أسود مطفي', name: 'Matte Black', hex: '#1a1b1d', finish: 'matte' },
];

function defaultConfig(car) {
  const c = car?.colors?.[0];
  return c ? { body: { color: c.hex, finish: c.finish, name: c.name } } : {};
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}

function modal(html, bind) {
  const d = $('#modal');
  $('#modal-body').innerHTML = html;
  if (!d.open) d.showModal();
  bind?.($('#modal-body'), () => d.close());
  $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));
}

// ---------- العارض ثلاثي الأبعاد ----------
let viewers = [];
async function resolveSrc(car) {
  const m = car.modelSrc || {};
  if (m.type === 'file') return { url: await fileURL(m.fileId) };
  return { url: m.url, ao: m.ao };
}

async function mountStage(el, car, { config, interactive = true, cycle = false, credit = true } = {}) {
  el.innerHTML = '<div class="loading">جارٍ تحميل النموذج ثلاثي الأبعاد…</div>';
  const { CarViewer } = await import('./viewer.js');
  if (!el.isConnected) return { root: null, dispose() {} };
  const v = new CarViewer(el, { interactive });
  viewers.push(v);
  try {
    const src = await resolveSrc(car);
    if (!src.url) throw new Error('no model');
    await v.load(src, { partMap: car.partMap || {}, rules: car.rules || {}, front: car.front ?? -1 });
  } catch (e) {
    console.error(e);
    el.querySelector('.loading').textContent = 'تعذر تحميل النموذج. تأكد من ملف GLB.';
    return v;
  }
  el.querySelector('.loading')?.remove();
  v.apply({ ...defaultConfig(car), ...(config || {}) });
  if (interactive) {
    const parts = v.presentParts();
    const btns = [['front', 'أمامي'], ['rear', 'خلفي'], ['side', 'جانبي'], ['top', 'علوي']];
    if (parts.includes('interior') || parts.includes('steering')) btns.push(['interior', 'من الداخل']);
    el.insertAdjacentHTML('beforeend', `<div class="views">${btns.map(([k, l]) => `<button type="button" data-view="${k}">${l}</button>`).join('')}</div>`);
    $$('[data-view]', el).forEach((b) => b.addEventListener('click', () => v.view(b.dataset.view)));
  }
  if (credit && car.credit) el.insertAdjacentHTML('beforeend', `<div class="credit">${esc(car.credit)}</div>`);
  if (cycle && car.colors?.length) {
    let i = 0;
    v.cycleT = setInterval(() => {
      i = (i + 1) % car.colors.length;
      const c = car.colors[i];
      v.apply({ body: { color: c.hex, finish: c.finish } });
      const lbl = el.querySelector('.hint');
      if (lbl) lbl.textContent = `${c.name} · ${FINISH_LABELS[c.finish]}`;
    }, 2600);
    const origDispose = v.dispose.bind(v);
    v.dispose = () => { clearInterval(v.cycleT); origDispose(); };
  }
  return v;
}

function disposeViewers() { viewers.forEach((v) => v.dispose()); viewers = []; }

// ---------- الشريط العلوي ----------
function renderChrome(route) {
  $('#shop-name').textContent = S().settings.shopName;
  document.title = S().settings.shopName;
  const s = session();
  let links;
  if (isOwner()) {
    const attn = S().orders.filter((o) => ['awaiting_design', 'changes_requested'].includes(o.status)).length;
    links = [[`studio-${S().cars[0]?.id}`, 'استوديو ثلاثي الأبعاد'], ['owner', 'الطلبات', attn], ['owner-schedule', 'المواعيد'], ['owner-cars', 'السيارات'], ['owner-services', 'الخدمات'], ['owner-settings', 'الإعدادات'], ['ideas', 'المقترحات']];
  } else if (isCustomer()) {
    const attn = myOrders().filter((o) => o.status === 'proposal_sent' || remainingDue(o) > 0).length;
    links = [['home', 'الرئيسية'], ['cars', 'المعرض'], ['book', 'احجز خدمة'], ['orders', 'طلباتي', attn]];
  } else {
    links = [['home', 'الرئيسية'], ['cars', 'المعرض'], ['book', 'احجز خدمة'], ['ideas', 'المقترحات']];
  }
  const base = route.split('-')[0];
  $('#nav').innerHTML = links.map(([h, l, n]) => {
    const on = route === h || (h !== 'owner' && base === h) || (h === 'owner' && route.startsWith('owner-order')) || (h === 'orders' && route.startsWith('order-')) || (h === 'cars' && route.startsWith('car-')) || (h === 'owner-cars' && route.startsWith('owner-car')) || (h.startsWith('studio') && route.startsWith('studio'));
    return `<a href="#${h}" class="${on ? 'on' : ''}">${l}${n ? `<span class="badge">${n}</span>` : ''}</a>`;
  }).join('');
  $('#who').innerHTML = s
    ? `<span class="muted small">${isOwner() ? `المالك · ${esc(DEMO.ownerName)}` : esc(s.name)}</span>
       <button class="btn sm ghost" id="switch" title="للعرض: التبديل السريع بين الحسابين">${isOwner() ? 'عرض كعميل' : 'عرض كمالك'}</button>
       <button class="btn sm ghost" id="logout">خروج</button>`
    : '<a class="btn sm primary" href="#login">تسجيل الدخول</a>';
  $('#logout')?.addEventListener('click', () => { store.update((st) => { st.session = null; }); location.hash = '#home'; });
  $('#switch')?.addEventListener('click', () => {
    if (isOwner()) { loginCustomer(DEMO.customer); location.hash = '#orders'; } else { loginOwner(); location.hash = `#studio-${S().cars[0].id}`; }
  });
}

function loginCustomer(c) { store.update((st) => { st.session = { role: 'customer', name: c.name, phone: c.phone }; }); }
function loginOwner() { store.update((st) => { st.session = { role: 'owner' }; }); }

// ---------- حسابات الطلب ----------
function myOrders() { const s = session(); return s ? S().orders.filter((o) => o.customer.phone === s.phone) : []; }
function totals(o) {
  const svcs = o.serviceIds.map(svcById).filter(Boolean);
  const fixed = sum(svcs.filter((s) => s.kind === 'wash').map((s) => s.price));
  const approved = o.proposals.find((p) => p.status === 'approved');
  const custom = approved ? approved.price : 0;
  const paid = sum(o.payments.map((p) => p.amount));
  const hasCustom = svcs.some((s) => s.kind === 'custom');
  return { fixed, custom, paid, hasCustom, due: fixed + custom, remaining: Math.max(0, fixed + custom - paid) };
}
const remainingDue = (o) => (['approved', 'in_progress', 'done'].includes(o.status) ? totals(o).remaining : 0);
const latestProposal = (o) => o.proposals[o.proposals.length - 1];
const svcNames = (o) => o.serviceIds.map((id) => svcById(id)?.name || id).join('، ');

// ---------- الدفع (تجريبي) ----------
function luhn(num) {
  const d = num.replace(/\D/g, '');
  if (d.length < 13) return false;
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    let x = +d[d.length - 1 - i];
    if (i % 2) { x *= 2; if (x > 9) x -= 9; }
    s += x;
  }
  return s % 10 === 0;
}

function payModal(amount, label, { allowCash = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal(`
      <div class="stack">
        <span class="eyebrow">الدفع الآمن</span>
        <h2>${esc(label)}</h2>
        <p class="num" style="font:800 1.8rem var(--font-display)">${money(amount)}</p>
      </div>
      <div class="tabs" id="pm-tabs">
        <button type="button" class="on" data-m="card">بطاقة مدى / فيزا</button>
        <button type="button" data-m="apple">Apple Pay</button>
        ${allowCash ? '<button type="button" data-m="cash">الدفع في المعرض</button>' : ''}
      </div>
      <form id="pay-form" class="stack" novalidate>
        <div id="pm-card" class="stack">
          <div class="field"><label for="cc-name">الاسم على البطاقة</label><input id="cc-name" value="${esc(session()?.name || '')}" autocomplete="cc-name"></div>
          <div class="field"><label for="cc-num">رقم البطاقة</label><input id="cc-num" inputmode="numeric" dir="ltr" value="4242 4242 4242 4242" autocomplete="cc-number"></div>
          <div class="grid2">
            <div class="field"><label for="cc-exp">تاريخ الانتهاء</label><input id="cc-exp" dir="ltr" placeholder="MM/YY" value="12/29"></div>
            <div class="field"><label for="cc-cvv">CVV</label><input id="cc-cvv" dir="ltr" inputmode="numeric" value="123"></div>
          </div>
        </div>
        <p class="note">وضع العرض: لا يتم خصم أي مبلغ. البطاقة التجريبية معبأة مسبقًا. في النسخة الفعلية يُربط الدفع ببوابة مثل ميسّر أو تاب (مدى، فيزا، Apple Pay).</p>
        <p class="small" id="pay-err" style="color:var(--bad)" hidden></p>
        <div class="row"><button class="btn primary" id="pay-btn">ادفع ${money(amount)}</button><button type="button" class="btn ghost" data-close>إلغاء</button></div>
      </form>`, (root, close) => {
      let method = 'card';
      $$('#pm-tabs button', root).forEach((b) => b.addEventListener('click', () => {
        method = b.dataset.m;
        $$('#pm-tabs button', root).forEach((x) => x.classList.toggle('on', x === b));
        $('#pm-card', root).hidden = method !== 'card';
        $('#pay-btn', root).textContent = method === 'cash' ? 'تأكيد الحجز والدفع لاحقًا' : `ادفع ${money(amount)}`;
      }));
      $('#pay-form', root).addEventListener('submit', (e) => {
        e.preventDefault();
        const err = $('#pay-err', root);
        let last4;
        if (method === 'card') {
          const num = $('#cc-num', root).value;
          const exp = $('#cc-exp', root).value.match(/^(\d{2})\/(\d{2})$/);
          if (!luhn(num)) { err.textContent = 'رقم البطاقة غير صحيح. راجع الأرقام وحاول مرة أخرى.'; err.hidden = false; return; }
          if (!exp || +exp[1] < 1 || +exp[1] > 12 || new Date(2000 + +exp[2], +exp[1]) < new Date()) { err.textContent = 'تاريخ الانتهاء غير صالح. اكتبه بصيغة MM/YY.'; err.hidden = false; return; }
          if (!/^\d{3,4}$/.test($('#cc-cvv', root).value)) { err.textContent = 'رمز CVV يتكون من 3 أو 4 أرقام.'; err.hidden = false; return; }
          last4 = num.replace(/\D/g, '').slice(-4);
        }
        const btn = $('#pay-btn', root);
        btn.disabled = true; btn.textContent = 'جارٍ المعالجة…';
        setTimeout(() => {
          done = true;
          close();
          resolve(method === 'cash' ? { method, amount: 0, pending: amount } : { method, amount, last4 });
        }, 900);
      });
      $('#modal').addEventListener('close', () => { if (!done) resolve(null); }, { once: true });
    });
  });
}

// ---------- الصفحات: العامة والعميل ----------
const views = {};

views.home = () => {
  const st = S();
  const hero = st.cars[0];
  return {
    html: `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">غسيل · تلوين · فرش · ستيرنج</span>
        <h1>شاهد لون سيارتك الجديد قبل أن نلمسها</h1>
        <p>احجز موعدك وادفع أونلاين. لخدمات التلوين والفرش يرسل لك فريقنا تصميمًا ثلاثي الأبعاد لسيارتك بالألوان المقترحة، توافق عليه، ثم نبدأ التنفيذ.</p>
        <div class="row"><a class="btn primary" href="#book">احجز خدمة</a><a class="btn" href="#cars">تصفح المعرض</a></div>
        ${session() ? '' : `
        <div class="panel" style="gap:10px">
          <span class="eyebrow">حسابات العرض التجريبي</span>
          <div class="row">
            <button class="btn" id="demo-c">دخول كعميل: ${esc(DEMO.customer.name)}</button>
            <button class="btn" id="demo-o">دخول كمالك المعرض</button>
          </div>
        </div>`}
      </div>
      <div class="stage" id="hero-stage"><div class="hint">${esc(hero.colors[0].name)} · ${FINISH_LABELS[hero.colors[0].finish]}</div></div>
    </section>
    <section class="stack">
      <h2>كيف تعمل الخدمة</h2>
      <ol class="steps">
        <li><b>اختر الخدمة والموعد</b><span class="muted small">غسيل، تغيير لون، فرش، ستيرنج أو جنوط، مع الأوقات المتاحة فقط.</span></li>
        <li><b>ادفع العربون</b><span class="muted small">مدى، فيزا أو Apple Pay. الغسيل يُدفع كاملًا.</span></li>
        <li><b>استلم التصميم ثلاثي الأبعاد</b><span class="muted small">نجهّز سيارتك باللون والتشطيب المقترح وترسلها لك للمعاينة.</span></li>
        <li><b>وافق ونبدأ التنفيذ</b><span class="muted small">توافق أو تطلب تعديلًا، ثم تدفع المتبقي ونبدأ العمل.</span></li>
      </ol>
    </section>
    <section class="stack">
      <div class="page-head"><h2>الخدمات</h2><span class="muted small">أسعار التلوين تبدأ من المبلغ المذكور ويحدَّد السعر النهائي في عرض التصميم.</span></div>
      <div class="services">${st.services.filter((s) => s.active).map((s) => `
        <article class="svc">
          <span class="pill ${s.kind === 'custom' ? 'warn' : 'info'} tag">${s.kind === 'custom' ? 'مع معاينة 3D' : 'حجز مباشر'}</span>
          <h3>${esc(s.name)}</h3>
          <p class="muted small">${esc(s.desc)}</p>
          <div class="row"><span class="price num">${s.kind === 'custom' ? 'يبدأ من ' : ''}${money(s.price)}</span><span class="spacer"></span><a class="btn sm" href="#book" data-svc="${s.id}">احجز</a></div>
        </article>`).join('')}</div>
    </section>
    <section class="stack">
      <div class="page-head"><h2>من المعرض</h2><a class="btn sm ghost" href="#cars">كل السيارات</a></div>
      ${carCards(st.cars.slice(0, 4), 'car')}
    </section>`,
    mount(root) {
      mountStage($('#hero-stage', root), hero, { interactive: false, cycle: true, credit: false });
      $('#demo-c', root)?.addEventListener('click', () => { loginCustomer(DEMO.customer); location.hash = '#orders'; });
      $('#demo-o', root)?.addEventListener('click', () => { loginOwner(); location.hash = `#studio-${S().cars[0].id}`; });
      $$('[data-svc]', root).forEach((a) => a.addEventListener('click', () => { pendingBook = { services: [a.dataset.svc] }; }));
    },
  };
};

function carCards(cars, link) {
  return `<div class="cars">${cars.map((c) => `
    <a class="car-card" href="#${link}-${c.id}">
      <div class="thumb" data-thumb="${c.id}">${c.thumb ? `<img src="${esc(c.thumb)}" alt="${esc(carName(c))}" loading="lazy">` : 'نموذج 3D'}</div>
      <div class="meta">
        <div class="row"><h3>${esc(carName(c))}</h3><span class="spacer"></span><span class="muted small num">${esc(c.year)}</span></div>
        <div class="row"><div class="dots">${c.colors.map((k) => `<i style="background:${esc(k.hex)}" title="${esc(k.name)}"></i>`).join('')}</div><span class="spacer"></span><span class="muted small">${c.colors.length} ألوان · ${c.photos.length} صور</span></div>
      </div>
    </a>`).join('')}</div>`;
}

async function hydrateThumbs(root) {
  for (const el of $$('[data-thumb]', root)) {
    const car = carById(el.dataset.thumb);
    if (car && !car.thumb && car.photos[0]) {
      const u = await fileURL(car.photos[0].blobId);
      if (u) el.innerHTML = `<img src="${u}" alt="">`;
    }
  }
}

views.cars = () => ({
  html: `<div class="page-head"><div class="stack"><span class="eyebrow">المعرض</span><h1>سيارات المعرض</h1></div><p class="muted small" style="max-width:46ch">نماذج ثلاثية الأبعاد لسيارات حقيقية بألوانها الرسمية. لمعاينة لون مختلف على سيارتك، اطلب الخدمة ويرسل لك الفريق تصميمًا خاصًا.</p></div>
    ${carCards(S().cars, 'car')}`,
  mount: hydrateThumbs,
});

views.car = (id) => {
  const car = carById(id);
  if (!car) return notFound();
  return {
    html: `
    <div class="page-head"><div class="stack"><span class="eyebrow">${esc(car.body || '')} · ${esc(car.year)}</span><h1>${esc(carName(car))}</h1></div>
      <a class="btn primary" href="#book" id="book-car">اطلب تغيير لون أو خدمة لهذه السيارة</a></div>
    <div class="studio">
      <div class="stage" id="car-stage"><div class="hint">اسحب للتدوير · مرّر للتقريب</div></div>
      <aside class="panel">
        <h3>الألوان الرسمية</h3>
        <div class="chips">${car.colors.map((c, i) => `<button class="paint ${i === 0 ? 'on' : ''}" data-i="${i}" title="${esc(c.name)}"><i style="background:${esc(c.hex)}"></i><span>${esc(c.ar || c.name)}</span></button>`).join('')}</div>
        <p class="muted small" id="color-label">${esc(car.colors[0]?.name || '')} · ${FINISH_LABELS[car.colors[0]?.finish] || ''}</p>
        <h3>صور حقيقية</h3>
        <div class="photos" id="car-photos"></div>
      </aside>
    </div>`,
    async mount(root) {
      const v = await mountStage($('#car-stage', root), car);
      const showPhotos = async (colorName) => {
        const list = car.photos.filter((p) => !colorName || p.color === colorName);
        $('#car-photos', root).innerHTML = list.length ? '' : `<div class="empty" style="grid-column:1/-1">لا توجد صور حقيقية بهذا اللون بعد.</div>`;
        for (const p of list) {
          const u = await fileURL(p.blobId);
          if (u) $('#car-photos', root).insertAdjacentHTML('beforeend', `<figure class="photo" style="margin:0"><img src="${u}" alt=""><figcaption>${esc(p.color)}</figcaption></figure>`);
        }
      };
      showPhotos(car.colors[0]?.name);
      $$('.paint', root).forEach((b) => b.addEventListener('click', () => {
        const c = car.colors[+b.dataset.i];
        $$('.paint', root).forEach((x) => x.classList.toggle('on', x === b));
        $('#color-label', root).textContent = `${c.name} · ${FINISH_LABELS[c.finish]}`;
        v.apply({ body: { color: c.hex, finish: c.finish } });
        showPhotos(c.name);
      }));
      $('#book-car', root).addEventListener('click', () => { pendingBook = { carId: car.id, services: ['paint'] }; });
    },
  };
};

let pendingBook = null;

views.book = () => {
  if (!isCustomer()) return needLogin('customer', 'سجّل دخولك كعميل لحجز موعد.');
  const st = S();
  const pre = pendingBook || {};
  pendingBook = null;
  const minDate = today();
  return {
    html: `
    <div class="page-head"><div class="stack"><span class="eyebrow">حجز جديد</span><h1>احجز خدمة لسيارتك</h1></div></div>
    <form id="book-form" class="order-layout" novalidate>
      <div class="stack">
        <section class="panel">
          <h2>الخدمة</h2>
          <div class="pick">${st.services.filter((s) => s.active).map((s) => `
            <label><input type="checkbox" name="svc" value="${s.id}" ${pre.services?.includes(s.id) ? 'checked' : ''}>
              <span class="stack" style="gap:2px"><b>${esc(s.name)}</b><span class="muted small">${s.kind === 'custom' ? 'يبدأ من ' : ''}${money(s.price)}${s.kind === 'custom' ? ' · مع معاينة 3D' : ''}</span></span></label>`).join('')}</div>
        </section>
        <section class="panel">
          <h2>السيارة</h2>
          <div class="grid2">
            <div class="field"><label for="b-car">الموديل</label><select id="b-car">${st.cars.map((c) => `<option value="${c.id}" ${pre.carId === c.id ? 'selected' : ''}>${esc(carName(c))} ${esc(c.year)}</option>`).join('')}<option value="">موديل آخر (سيضيفه المعرض)</option></select></div>
            <div class="field" id="b-other-wrap" hidden><label for="b-other">اكتب الموديل والسنة</label><input id="b-other" placeholder="مثال: Mercedes G63 2023"></div>
            <div class="field"><label for="b-plate">رقم اللوحة</label><input id="b-plate" placeholder="أ ب ج 1234"></div>
            <div class="field"><label for="b-color">اللون الحالي</label><input id="b-color" placeholder="أبيض لؤلؤي"></div>
          </div>
          <div class="field" id="b-wish-wrap"><label for="b-notes">ماذا تريد؟ (اختياري)</label><textarea id="b-notes" placeholder="صف اللون أو الخامة التي تفكر فيها، وسيصمم لك الفريق اقتراحًا ثلاثي الأبعاد."></textarea></div>
        </section>
        <section class="panel">
          <h2>الموعد</h2>
          <div class="field" style="max-width:240px"><label for="b-date">التاريخ</label><input type="date" id="b-date" min="${minDate}" value="${minDate}"></div>
          <div class="slots" id="b-slots"></div>
        </section>
      </div>
      <aside class="panel" style="position:sticky;top:80px">
        <h2>الملخص</h2>
        <div class="summary" id="b-summary"></div>
        <p class="small" id="b-err" style="color:var(--bad)" hidden></p>
        <button class="btn primary" id="b-pay">متابعة للدفع</button>
      </aside>
    </form>`,
    mount(root) {
      let slot = null;
      const sel = () => $$('input[name=svc]:checked', root).map((i) => svcById(i.value));
      const renderSlots = () => {
        const date = $('#b-date', root).value;
        const now = new Date();
        const html = [];
        for (let h = st.settings.openHour; h < st.settings.closeHour; h++) {
          const t = `${String(h).padStart(2, '0')}:00`;
          const taken = S().orders.filter((o) => o.date === date && o.time === t && o.status !== 'cancelled').length;
          const past = date === today() && h <= now.getHours();
          const full = taken >= st.settings.slotCapacity;
          html.push(`<button type="button" data-t="${t}" ${past || full ? 'disabled' : ''} class="${slot === t ? 'on' : ''}" title="${full ? 'محجوز بالكامل' : ''}">${t}</button>`);
        }
        $('#b-slots', root).innerHTML = html.join('');
        if (!html.some((x) => !x.includes('disabled'))) $('#b-slots', root).innerHTML = '<div class="empty" style="grid-column:1/-1">لا توجد أوقات متاحة في هذا اليوم. اختر يومًا آخر.</div>';
        $$('#b-slots button', root).forEach((b) => b.addEventListener('click', () => { slot = b.dataset.t; renderSlots(); renderSummary(); }));
      };
      const calc = () => {
        const s = sel();
        const wash = sum(s.filter((x) => x.kind === 'wash').map((x) => x.price));
        const custom = s.filter((x) => x.kind === 'custom');
        const deposit = custom.length ? st.settings.deposit : 0;
        return { s, wash, custom, deposit, now: wash + deposit };
      };
      const renderSummary = () => {
        const c = calc();
        $('#b-summary', root).innerHTML = `
          ${c.s.map((x) => `<div><span>${esc(x.name)}</span><span class="num muted">${x.kind === 'custom' ? 'حسب التصميم' : money(x.price)}</span></div>`).join('') || '<p class="muted small">اختر خدمة واحدة على الأقل.</p>'}
          ${c.deposit ? `<div><span>عربون حجز التصميم</span><span class="num">${money(c.deposit)}</span></div>` : ''}
          <div class="total"><span>المطلوب الآن</span><span class="num">${money(c.now)}</span></div>
          ${c.custom.length ? '<p class="note">يُخصم العربون من السعر النهائي، والسعر النهائي يصلك مع التصميم ثلاثي الأبعاد قبل أي تنفيذ.</p>' : ''}
          ${slot ? `<p class="small muted">${fmtDate($('#b-date', root).value)} · الساعة <span class="num">${slot}</span></p>` : ''}`;
      };
      $('#b-date', root).addEventListener('change', () => { slot = null; renderSlots(); renderSummary(); });
      $$('input[name=svc]', root).forEach((i) => i.addEventListener('change', renderSummary));
      $('#b-car', root).addEventListener('change', (e) => { $('#b-other-wrap', root).hidden = !!e.target.value; });
      renderSlots(); renderSummary();
      $('#book-form', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        const c = calc();
        const err = $('#b-err', root);
        if (!c.s.length) { err.textContent = 'اختر خدمة واحدة على الأقل.'; err.hidden = false; return; }
        if (!slot) { err.textContent = 'اختر وقتًا متاحًا من المواعيد.'; err.hidden = false; return; }
        err.hidden = true;
        const pay = await payModal(c.now, c.custom.length ? 'عربون الحجز' : 'دفع الخدمة');
        if (!pay) return;
        const s = session();
        const id = 'o' + uid();
        store.update((stt) => {
          const no = store.nextOrderNo();
          stt.orders.unshift({
            id, no, createdAt: new Date().toISOString(),
            customer: { name: s.name, phone: s.phone },
            serviceIds: c.s.map((x) => x.id),
            carId: $('#b-car', root).value || null,
            carText: { plate: $('#b-plate', root).value.trim(), color: $('#b-color', root).value.trim(), other: $('#b-other', root).value.trim() },
            date: $('#b-date', root).value, time: slot, notes: $('#b-notes', root).value.trim(),
            status: c.custom.length ? 'awaiting_design' : 'booked',
            payments: pay.amount ? [{ amount: pay.amount, method: pay.method, last4: pay.last4, at: new Date().toISOString(), label: c.custom.length ? 'عربون الحجز' : 'دفع الخدمة' }] : [],
            proposals: [],
            log: [{ at: new Date().toISOString(), text: pay.amount ? 'تم الحجز والدفع' : 'تم الحجز (الدفع في المعرض)' }],
          });
        });
        toast('تم الحجز. ستجد طلبك في "طلباتي".');
        location.hash = `#order-${id}`;
      });
    },
  };
};

views.orders = () => {
  if (!isCustomer()) return needLogin('customer', 'سجّل دخولك لعرض طلباتك.');
  const list = myOrders();
  return {
    html: `<div class="page-head"><div class="stack"><span class="eyebrow">حسابي</span><h1>طلباتي</h1></div><a class="btn primary" href="#book">حجز جديد</a></div>
    ${list.length ? `<div class="stack">${list.map((o) => {
      const car = carById(o.carId);
      const due = remainingDue(o);
      return `<a class="panel" href="#order-${o.id}" style="text-decoration:none;grid-template-columns:auto 1fr auto;align-items:center">
        <span class="num muted">#${o.no}</span>
        <span class="stack" style="gap:2px"><b>${esc(svcNames(o))}</b><span class="muted small">${esc(car ? carName(car) : o.carText?.other || '')} · ${fmtDate(o.date)} · <span class="num">${o.time}</span></span></span>
        <span class="stack" style="gap:6px;justify-items:end">${pill(o.status, 'customer')}${due ? `<span class="small" style="color:var(--accent)">متبقٍ ${money(due)}</span>` : ''}</span>
      </a>`;
    }).join('')}</div>` : '<div class="empty">لا توجد طلبات بعد. ابدأ بحجز خدمة.</div>'}`,
  };
};

function specList(config, parts) {
  return `<div class="spec">${parts.filter((p) => config[p]).map((p) => `
    <div><span class="sw" style="background:${esc(config[p].color)}"></span><b>${PART_LABELS[p]}</b><span>${config[p].name ? esc(config[p].name) : `<span dir="ltr">${esc(config[p].color)}</span>`} · ${FINISH_LABELS[config[p].finish] || ''}</span></div>`).join('')}</div>`;
}

function orderAside(o, who) {
  const car = carById(o.carId);
  const t = totals(o);
  return `
    <aside class="stack">
      <section class="panel">
        <h3>تفاصيل الطلب</h3>
        <dl class="kv">
          ${who === 'owner' ? `<dt>العميل</dt><dd>${esc(o.customer.name)} · <span class="num" dir="ltr">${esc(o.customer.phone)}</span></dd>` : ''}
          <dt>الخدمات</dt><dd>${esc(svcNames(o))}</dd>
          <dt>السيارة</dt><dd>${esc(car ? `${carName(car)} ${car.year}` : o.carText?.other || '—')}</dd>
          ${o.carText?.plate ? `<dt>اللوحة</dt><dd>${esc(o.carText.plate)}</dd>` : ''}
          ${o.carText?.color ? `<dt>اللون الحالي</dt><dd>${esc(o.carText.color)}</dd>` : ''}
          <dt>الموعد</dt><dd>${fmtDate(o.date)} · <span class="num">${o.time}</span></dd>
          ${o.notes ? `<dt>الطلب</dt><dd>${esc(o.notes)}</dd>` : ''}
        </dl>
      </section>
      <section class="panel">
        <h3>المدفوعات</h3>
        <div class="summary">
          ${o.payments.map((p) => `<div><span>${esc(p.label)} <span class="muted small">${p.method === 'cash' ? 'نقدًا' : p.method === 'apple' ? 'Apple Pay' : `بطاقة •${esc(p.last4 || '')}`}</span></span><span class="num">${money(p.amount)}</span></div>`).join('') || '<p class="muted small">لا توجد مدفوعات.</p>'}
          ${t.due ? `<div class="total"><span>الإجمالي</span><span class="num">${money(t.due)}</span></div><div><span>المتبقي</span><span class="num">${money(t.remaining)}</span></div>` : ''}
        </div>
      </section>
      <section class="panel">
        <h3>سجل الطلب</h3>
        <ol class="timeline">${o.log.map((l) => `<li><span>${esc(l.text)} <span class="muted small">· ${fmtAgo(l.at)}</span></span></li>`).join('')}</ol>
      </section>
    </aside>`;
}

async function shotsHTML(p) {
  if (!p?.shots?.length) return '';
  const urls = await Promise.all(p.shots.map(fileURL));
  return `<div class="photos">${urls.filter(Boolean).map((u) => `<figure class="photo" style="margin:0"><img src="${u}" alt="لقطة من التصميم"></figure>`).join('')}</div>`;
}

views.order = (id) => {
  if (!isCustomer()) return needLogin('customer', 'سجّل دخولك لعرض الطلب.');
  const o = S().orders.find((x) => x.id === id && x.customer.phone === session().phone);
  if (!o) return notFound();
  const car = carById(o.carId);
  const p = latestProposal(o);
  const due = remainingDue(o);
  const parts = [...new Set(o.serviceIds.flatMap((s) => SERVICE_PARTS[s] || []))];
  return {
    html: `
    <div class="page-head"><div class="stack"><span class="eyebrow num">طلب #${o.no}</span><h1>${esc(svcNames(o))}</h1></div>${pill(o.status, 'customer')}</div>
    <div class="order-layout">
      <div class="stack">
        ${p ? `
        <section class="panel">
          <div class="row"><h2>التصميم المقترح لسيارتك</h2><span class="spacer"></span><span class="muted small">${fmtAgo(p.at)}</span></div>
          <div class="stage" id="o-stage" style="height:min(60vh,520px)"><div class="hint">اسحب للتدوير · جرّب "من الداخل"</div></div>
          ${specList(p.config, Object.keys(PART_LABELS))}
          ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
          <div id="o-shots"></div>
          <div class="summary"><div class="total"><span>سعر التنفيذ</span><span class="num">${money(p.price)}</span></div><div><span class="muted">يُخصم منه العربون المدفوع</span><span></span></div></div>
          ${p.status === 'sent' ? `
          <div class="row"><button class="btn primary" id="approve">أوافق على التصميم</button><button class="btn" id="changes">أطلب تعديلًا</button></div>` : ''}
          ${p.status === 'changes' ? `<p class="note">أرسلت طلب تعديل: "${esc(p.reply)}". سيصلك تصميم محدّث.</p>` : ''}
          ${due ? `<div class="row"><button class="btn primary" id="pay-rest">ادفع المتبقي ${money(due)}</button><span class="muted small">بعد الدفع يُثبَّت موعد التنفيذ.</span></div>` : ''}
        </section>` : totals(o).hasCustom ? `
        <section class="panel">
          <h2>التصميم قيد التجهيز</h2>
          <p class="muted">يجهّز فريق المعرض تصميمًا ثلاثي الأبعاد لـ ${esc(parts.map((x) => PART_LABELS[x]).join(' و'))}. سيظهر هنا للمعاينة والموافقة.</p>
          ${car ? `<div class="stage" id="o-stage" style="height:340px"></div>` : ''}
        </section>` : `
        <section class="panel">
          <h2>موعدك ${fmtDate(o.date)} الساعة <span class="num">${o.time}</span></h2>
          <p class="muted">نراك في المعرض. أحضر السيارة قبل الموعد بعشر دقائق.</p>
          ${car ? `<div class="stage" id="o-stage" style="height:340px"></div>` : ''}
        </section>`}
      </div>
      ${orderAside(o, 'customer')}
    </div>`,
    async mount(root) {
      if (car && $('#o-stage', root)) mountStage($('#o-stage', root), car, { config: p?.config, interactive: !!p });
      if (p) $('#o-shots', root).innerHTML = await shotsHTML(p);
      $('#approve', root)?.addEventListener('click', () => {
        modal(`<h2>اعتماد التصميم</h2><p>بموافقتك يصبح سعر التنفيذ ${money(p.price)}، ويتبقى ${money(Math.max(0, p.price + totals(o).fixed - totals(o).paid))} بعد خصم المدفوع.</p>
          <div class="row"><button class="btn primary" id="ok">أوافق وأتابع للدفع</button><button class="btn ghost" data-close>رجوع</button></div>`, (r, close) => {
          $('#ok', r).addEventListener('click', async () => {
            close();
            store.update((st) => {
              const oo = st.orders.find((x) => x.id === o.id);
              oo.proposals[oo.proposals.length - 1].status = 'approved';
              oo.status = 'approved';
              oo.log.push({ at: new Date().toISOString(), text: 'وافق العميل على التصميم' });
            });
            const fresh = S().orders.find((x) => x.id === o.id);
            const rest = totals(fresh).remaining;
            if (rest > 0) {
              const pay = await payModal(rest, 'المبلغ المتبقي', { allowCash: true });
              if (pay?.amount) {
                store.update((st) => {
                  const oo = st.orders.find((x) => x.id === o.id);
                  oo.payments.push({ amount: pay.amount, method: pay.method, last4: pay.last4, at: new Date().toISOString(), label: 'المبلغ المتبقي' });
                  oo.log.push({ at: new Date().toISOString(), text: 'تم دفع المبلغ المتبقي' });
                });
              }
            }
            toast('تم اعتماد التصميم. شكرًا لك!');
            render();
          });
        });
      });
      $('#changes', root)?.addEventListener('click', () => {
        modal(`<h2>طلب تعديل</h2><div class="field"><label for="ch-text">ما الذي تريد تغييره؟</label><textarea id="ch-text" placeholder="مثال: أريد الأزرق أفتح قليلًا، والستيرنج أسود."></textarea></div>
          <div class="row"><button class="btn primary" id="send">إرسال للمعرض</button><button class="btn ghost" data-close>رجوع</button></div>`, (r, close) => {
          $('#send', r).addEventListener('click', () => {
            const text = $('#ch-text', r).value.trim();
            if (!text) { $('#ch-text', r).focus(); return; }
            store.update((st) => {
              const oo = st.orders.find((x) => x.id === o.id);
              const pp = oo.proposals[oo.proposals.length - 1];
              pp.status = 'changes'; pp.reply = text;
              oo.status = 'changes_requested';
              oo.log.push({ at: new Date().toISOString(), text: `طلب العميل تعديلًا: ${text}` });
            });
            close(); toast('أُرسل طلب التعديل للمعرض.'); render();
          });
        });
      });
      $('#pay-rest', root)?.addEventListener('click', async () => {
        const pay = await payModal(due, 'المبلغ المتبقي');
        if (!pay?.amount) return;
        store.update((st) => {
          const oo = st.orders.find((x) => x.id === o.id);
          oo.payments.push({ amount: pay.amount, method: pay.method, last4: pay.last4, at: new Date().toISOString(), label: 'المبلغ المتبقي' });
          oo.log.push({ at: new Date().toISOString(), text: 'تم دفع المبلغ المتبقي' });
        });
        toast('تم الدفع.'); render();
      });
    },
  };
};

// ---------- الدخول ----------
function needLogin(role, msg) {
  loginNext = location.hash;
  return views.login(role, msg);
}
let loginNext = null;

views.login = (role, msg) => ({
  html: `
  <div class="login stack">
    <div class="stack" style="gap:6px"><span class="eyebrow">تسجيل الدخول</span><h1>أهلًا بك في ${esc(S().settings.shopName)}</h1>${msg ? `<p class="muted">${esc(msg)}</p>` : ''}</div>
    <div class="tabs" id="l-tabs"><button type="button" data-r="customer" class="${role !== 'owner' ? 'on' : ''}">عميل</button><button type="button" data-r="owner" class="${role === 'owner' ? 'on' : ''}">مالك المعرض</button></div>
    <form class="panel" id="l-customer" ${role === 'owner' ? 'hidden' : ''} novalidate>
      <div class="field"><label for="l-name">الاسم</label><input id="l-name" autocomplete="name"></div>
      <div class="field"><label for="l-phone">رقم الجوال</label><input id="l-phone" dir="ltr" inputmode="tel" placeholder="05xxxxxxxx" autocomplete="tel"></div>
      <p class="small" id="l-err" style="color:var(--bad)" hidden></p>
      <div class="row"><button class="btn primary">دخول</button><button type="button" class="btn" id="l-demo-c">حساب العميل التجريبي</button></div>
      <p class="note">في النسخة الفعلية يكون الدخول برمز تحقق يصل للجوال (OTP).</p>
    </form>
    <form class="panel" id="l-owner" ${role === 'owner' ? '' : 'hidden'} novalidate>
      <div class="field"><label for="l-pin">رمز المالك</label><input id="l-pin" type="password" inputmode="numeric" dir="ltr"></div>
      <p class="small" id="l-perr" style="color:var(--bad)" hidden></p>
      <div class="row"><button class="btn primary">دخول</button><button type="button" class="btn" id="l-demo-o">حساب المالك التجريبي</button></div>
      <p class="note">الرمز التجريبي: ${esc(S().settings.ownerPin)}</p>
    </form>
  </div>`,
  mount(root) {
    const go = (def) => { const n = loginNext; loginNext = null; location.hash = n && n !== '#login' ? n : def; render(); };
    $$('#l-tabs button', root).forEach((b) => b.addEventListener('click', () => {
      $$('#l-tabs button', root).forEach((x) => x.classList.toggle('on', x === b));
      $('#l-customer', root).hidden = b.dataset.r !== 'customer';
      $('#l-owner', root).hidden = b.dataset.r !== 'owner';
    }));
    $('#l-customer', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#l-name', root).value.trim();
      const phone = $('#l-phone', root).value.replace(/\s/g, '');
      if (!name || !/^05\d{8}$/.test(phone)) { const er = $('#l-err', root); er.textContent = 'اكتب اسمك ورقم جوال يبدأ بـ 05 ومكوّن من 10 أرقام.'; er.hidden = false; return; }
      loginCustomer({ name, phone }); go('#orders');
    });
    $('#l-demo-c', root).addEventListener('click', () => { loginCustomer(DEMO.customer); go('#orders'); });
    $('#l-owner', root).addEventListener('submit', (e) => {
      e.preventDefault();
      if ($('#l-pin', root).value !== S().settings.ownerPin) { const er = $('#l-perr', root); er.textContent = 'الرمز غير صحيح.'; er.hidden = false; return; }
      loginOwner(); go('#owner');
    });
    $('#l-demo-o', root).addEventListener('click', () => { loginOwner(); go(`#studio-${S().cars[0].id}`); });
  },
});

// ---------- صفحات المالك ----------
function ownerOnly() { return isOwner() ? null : needLogin('owner', 'هذه الصفحة لمالك المعرض.'); }

views.owner = () => {
  const g = ownerOnly(); if (g) return g;
  const orders = S().orders;
  const count = (st) => orders.filter((o) => st.includes(o.status)).length;
  const collected = sum(orders.flatMap((o) => o.payments.map((p) => p.amount)));
  const todayCount = orders.filter((o) => o.date === today() && o.status !== 'cancelled').length;
  const filters = [['all', 'الكل'], ['design', 'تحتاج تصميم'], ['waiting', 'بانتظار العميل'], ['active', 'معتمد / قيد التنفيذ'], ['wash', 'غسيل'], ['closed', 'مكتمل / ملغي']];
  const match = {
    all: () => true,
    design: (o) => ['awaiting_design', 'changes_requested'].includes(o.status),
    waiting: (o) => o.status === 'proposal_sent',
    active: (o) => ['approved', 'in_progress'].includes(o.status),
    wash: (o) => o.status === 'booked',
    closed: (o) => ['done', 'cancelled'].includes(o.status),
  };
  return {
    html: `
    <div class="page-head"><div class="stack"><span class="eyebrow">لوحة المالك</span><h1>الطلبات</h1></div><a class="btn" href="#owner-cars">إدارة السيارات</a></div>
    <div class="kpis">
      <div class="kpi attn"><span class="muted small">تحتاج تصميم</span><b>${count(['awaiting_design', 'changes_requested'])}</b></div>
      <div class="kpi"><span class="muted small">بانتظار موافقة العميل</span><b>${count(['proposal_sent'])}</b></div>
      <div class="kpi"><span class="muted small">مواعيد اليوم</span><b>${todayCount}</b></div>
      <div class="kpi"><span class="muted small">المحصّل</span><b>${money(collected)}</b></div>
    </div>
    <section class="panel">
      <div class="tabs" id="f-tabs">${filters.map(([k, l], i) => `<button type="button" data-f="${k}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="table-wrap"><table>
        <thead><tr><th>رقم</th><th>العميل</th><th>السيارة</th><th>الخدمات</th><th>الموعد</th><th>الحالة</th><th>المدفوع</th></tr></thead>
        <tbody id="o-body"></tbody>
      </table></div>
    </section>`,
    mount(root) {
      const draw = (f) => {
        const rows = orders.filter(match[f]);
        $('#o-body', root).innerHTML = rows.map((o) => `
          <tr class="click" data-id="${o.id}">
            <td class="num">#${o.no}</td><td>${esc(o.customer.name)}${o.demo ? ' <span class="muted small">(تجريبي)</span>' : ''}</td>
            <td>${esc(carById(o.carId) ? carName(carById(o.carId)) : o.carText?.other || '—')}</td>
            <td>${esc(svcNames(o))}</td><td class="num">${o.date.slice(5)} · ${o.time}</td><td>${pill(o.status)}</td><td class="num">${money(totals(o).paid)}</td>
          </tr>`).join('') || '<tr><td colspan="7" class="muted">لا توجد طلبات في هذا التصنيف.</td></tr>';
        $$('tr.click', root).forEach((tr) => tr.addEventListener('click', () => { location.hash = `#owner-order-${tr.dataset.id}`; }));
      };
      $$('#f-tabs button', root).forEach((b) => b.addEventListener('click', () => {
        $$('#f-tabs button', root).forEach((x) => x.classList.toggle('on', x === b)); draw(b.dataset.f);
      }));
      draw('all');
    },
  };
};

// الاستوديو: لوحة التحكم بالألوان (مشتركة بين صفحة الطلب والاستوديو الحر)
function studioPanel(car) {
  return `
    <div class="stack">
      <div class="tabs" id="s-parts"></div>
      <div class="stack" id="s-swatches"></div>
      <div class="row"><label class="small muted" for="s-custom">لون مخصص</label><input type="color" id="s-custom" value="#1c2a55"><span class="small muted num" id="s-hex"></span></div>
      <div class="stack" style="gap:6px"><span class="small muted">التشطيب</span><div class="finishes" id="s-finish"></div></div>
      <div class="note" id="s-pick">اضغط على أي جزء في السيارة لتحديده.</div>
      <div class="stack" style="gap:6px"><span class="small muted">صور حقيقية بهذا اللون</span><div class="photos" id="s-photos"></div></div>
    </div>`;
}

async function bindStudio(root, car, viewer, initial, onChange) {
  const { PARTS } = await import('./viewer.js');
  const cfg = { ...defaultConfig(car), ...structuredClone(initial || {}) };
  const present = viewer.presentParts();
  let part = present[0] || 'body';
  for (const p of present) cfg[p] ||= { ...viewer.config[p] };
  viewer.apply(cfg);

  const swatchesFor = (p) => {
    if (p === 'body') {
      return `<span class="small muted">الألوان الرسمية لـ ${esc(carName(car))}</span>
        <div class="chips">${car.colors.map((c) => chip(c.hex, c.ar || c.name, c.name, c.finish)).join('')}</div>
        <span class="small muted">ألوان إضافية</span>
        <div class="chips">${EXTRA_PAINTS.map((c) => chip(c.hex, c.ar, c.name, c.finish)).join('')}</div>`;
    }
    const list = p === 'rims' ? RIM_SWATCHES : TRIM_SWATCHES;
    return `<div class="chips">${list.map((c) => chip(c.hex, c.ar, c.ar)).join('')}</div>`;
  };
  const chip = (hex, label, name, finish = '') => `<button type="button" class="paint" data-hex="${hex}" data-name="${esc(name)}" data-finish="${finish}" title="${esc(name)}"><i style="background:${hex}"></i><span>${esc(label)}</span></button>`;

  const showPhotos = async () => {
    const el = $('#s-photos', root);
    const name = cfg.body?.name;
    const list = car.photos.filter((ph) => ph.color === name);
    el.innerHTML = list.length ? '' : `<div class="empty" style="grid-column:1/-1">لا توجد صور بلون "${esc(name || 'مخصص')}". أضفها من صفحة السيارة.</div>`;
    for (const ph of list) {
      const u = await fileURL(ph.blobId);
      if (u) el.insertAdjacentHTML('beforeend', `<figure class="photo" style="margin:0"><img src="${u}" alt=""></figure>`);
    }
  };

  const draw = () => {
    $('#s-parts', root).innerHTML = present.map((p) => `<button type="button" data-p="${p}" class="${p === part ? 'on' : ''}">${PART_LABELS[p]}</button>`).join('');
    $('#s-swatches', root).innerHTML = swatchesFor(part);
    $('#s-finish', root).innerHTML = PARTS[part].finishes.map((f) => `<button type="button" data-f="${f}" class="${cfg[part]?.finish === f ? 'on' : ''}">${FINISH_LABELS[f]}</button>`).join('');
    $('#s-custom', root).value = cfg[part]?.color || '#000000';
    $('#s-hex', root).innerHTML = `${esc(cfg[part]?.name || '')} <span dir="ltr">${esc(cfg[part]?.color || '')}</span>`;
    $$('#s-swatches .paint', root).forEach((b) => b.classList.toggle('on', b.dataset.hex.toLowerCase() === cfg[part]?.color?.toLowerCase()));
    $$('#s-parts button', root).forEach((b) => b.addEventListener('click', () => { part = b.dataset.p; viewer.highlight(part); if (['interior', 'steering', 'carpet'].includes(part)) viewer.view('interior'); draw(); }));
    $$('#s-swatches .paint', root).forEach((b) => b.addEventListener('click', () => {
      cfg[part] = { color: b.dataset.hex, finish: b.dataset.finish || cfg[part]?.finish || PARTS[part].finishes[0], name: b.dataset.name };
      viewer.apply(cfg); draw(); onChange?.(cfg);
      if (part === 'body') showPhotos();
    }));
    $$('#s-finish button', root).forEach((b) => b.addEventListener('click', () => {
      cfg[part] = { ...cfg[part], finish: b.dataset.f };
      viewer.apply(cfg); draw(); onChange?.(cfg);
    }));
  };
  $('#s-custom', root).addEventListener('input', (e) => {
    cfg[part] = { ...cfg[part], color: e.target.value, name: 'لون مخصص' };
    viewer.apply(cfg); $('#s-hex', root).innerHTML = `لون مخصص <span dir="ltr">${esc(e.target.value)}</span>`; onChange?.(cfg);
  });

  viewer.onPick = ({ meshName, part: p }) => {
    const box = $('#s-pick', root);
    if (p && present.includes(p)) { part = p; viewer.highlight(p); draw(); }
    box.innerHTML = `<div class="stack" style="gap:6px"><span>القطعة: <b dir="ltr">${esc(meshName.split('|')[0] || meshName)}</b></span>
      <div class="row"><label class="small" for="s-map">تتبع</label><select id="s-map" style="width:auto"><option value="">لا شيء (لا تتلوّن)</option>${Object.keys(PART_LABELS).map((k) => `<option value="${k}" ${k === p ? 'selected' : ''}>${PART_LABELS[k]}</option>`).join('')}</select></div>
      <span class="small muted">لربط قطع نموذج جديد بالأجزاء القابلة للتلوين.</span></div>`;
    $('#s-map', box).addEventListener('change', (e) => {
      const val = e.target.value || null;
      viewer.setPartMap(meshName, val);
      store.update((st) => { const c = st.cars.find((x) => x.id === car.id); c.partMap = { ...(c.partMap || {}), [meshName]: val }; });
      const np = viewer.presentParts();
      present.splice(0, present.length, ...np);
      for (const q of present) cfg[q] ||= { ...viewer.config[q] };
      if (val) part = val;
      viewer.apply(cfg); draw();
    });
  };

  draw(); showPhotos();
  return { config: () => structuredClone(cfg), parts: () => present };
}

async function takeShots(viewer) {
  const ids = [];
  const views_ = ['front', 'side'];
  if (viewer.presentParts().some((p) => ['interior', 'steering'].includes(p))) views_.push('interior');
  const cam = viewer.camera.position.clone(), tgt = viewer.controls.target.clone();
  for (const name of views_) {
    viewer.view(name);
    ids.push(await putFile(dataURLtoBlob(viewer.snapshot())));
  }
  viewer.camera.position.copy(cam); viewer.controls.target.copy(tgt); viewer.controls.update();
  return ids;
}

views['owner-order'] = (id) => {
  const g = ownerOnly(); if (g) return g;
  const o = S().orders.find((x) => x.id === id);
  if (!o) return notFound();
  const car = carById(o.carId);
  const t = totals(o);
  const p = latestProposal(o);
  const suggested = p?.price || sum(o.serviceIds.map(svcById).filter((s) => s?.kind === 'custom').map((s) => s.price));
  const canDesign = t.hasCustom && !['done', 'cancelled', 'in_progress'].includes(o.status);
  const actions = [];
  if (['booked', 'approved'].includes(o.status)) actions.push(['in_progress', 'بدء التنفيذ']);
  if (o.status === 'in_progress') actions.push(['done', 'تم الإنجاز']);
  if (!['done', 'cancelled'].includes(o.status)) actions.push(['cancelled', 'إلغاء الطلب']);
  return {
    html: `
    <div class="page-head">
      <div class="stack"><span class="eyebrow num"><a href="#owner">الطلبات</a> / طلب #${o.no}</span><h1>${esc(o.customer.name)} · ${esc(svcNames(o))}</h1></div>
      <div class="row">${pill(o.status)}${actions.map(([s, l]) => `<button class="btn sm ${s === 'cancelled' ? 'danger ghost' : ''}" data-st="${s}">${l}</button>`).join('')}</div>
    </div>
    ${o.status === 'changes_requested' && p?.reply ? `<div class="panel" style="border-color:var(--warn)"><b>طلب العميل تعديلًا</b><p>${esc(p.reply)}</p></div>` : ''}
    <div class="order-layout">
      <div class="stack">
        ${car && t.hasCustom ? `
        <section class="panel">
          <div class="row"><h2>استوديو التصميم</h2><span class="spacer"></span><span class="muted small">${esc(carName(car))} ${esc(car.year)}</span></div>
          <div class="studio" style="grid-template-columns:minmax(0,1fr) 280px">
            <div class="stage" id="st-stage" style="height:min(62vh,560px)"><div class="hint">اسحب للتدوير · اضغط على جزء لتحديده</div></div>
            ${canDesign ? studioPanel(car) : `<div class="stack"><h3>التصميم المعتمد</h3>${p ? specList(p.config, Object.keys(PART_LABELS)) : ''}</div>`}
          </div>
          ${canDesign ? `
          <div class="grid2">
            <div class="field"><label for="pr-price">سعر التنفيذ (${esc(S().settings.currency)})</label><input id="pr-price" type="number" min="0" step="50" value="${suggested}"></div>
            <div class="field"><label for="pr-note">ملاحظة للعميل</label><input id="pr-note" placeholder="مثال: رش كامل بلون أزرق بوتسي، مدة التنفيذ 5 أيام." value="${esc(o.status === 'changes_requested' ? '' : p?.note || '')}"></div>
          </div>
          <div class="row"><button class="btn primary" id="send-prop">${p ? 'إرسال التصميم المحدّث للعميل' : 'إرسال التصميم للعميل'}</button><span class="muted small">تُرسل لقطات من 3 زوايا مع النموذج ثلاثي الأبعاد.</span></div>` : ''}
        </section>` : !car ? `<section class="panel"><h2>السيارة غير موجودة في المعرض</h2><p class="muted">الموديل المطلوب: ${esc(o.carText?.other || '—')}. أضف السيارة من صفحة السيارات ثم اربطها بالطلب.</p>
          <div class="row"><select id="link-car" style="max-width:280px">${S().cars.map((c) => `<option value="${c.id}">${esc(carName(c))}</option>`).join('')}</select><button class="btn" id="link-btn">ربط بالطلب</button></div></section>` : `
        <section class="panel"><h2>خدمة غسيل</h2><p class="muted">لا تحتاج تصميمًا. الموعد ${fmtDate(o.date)} الساعة <span class="num">${o.time}</span>.</p><div class="stage" id="st-stage" style="height:320px"></div></section>`}
        ${o.proposals.length ? `
        <section class="panel">
          <h3>العروض المرسلة</h3>
          ${o.proposals.slice().reverse().map((pp) => `
            <div class="stack" style="gap:8px;border-top:1px solid var(--line);padding-top:12px">
              <div class="row"><b class="num">${money(pp.price)}</b><span class="pill ${pp.status === 'approved' ? 'ok' : pp.status === 'changes' ? 'warn' : 'info'}">${pp.status === 'approved' ? 'وافق العميل' : pp.status === 'changes' ? 'طلب تعديل' : 'بانتظار الرد'}</span><span class="spacer"></span><span class="muted small">${fmtAgo(pp.at)}</span></div>
              ${specList(pp.config, Object.keys(PART_LABELS))}
              ${pp.reply ? `<p class="small">رد العميل: ${esc(pp.reply)}</p>` : ''}
              <div data-shots="${pp.id}"></div>
            </div>`).join('')}
        </section>` : ''}
      </div>
      ${orderAside(o, 'owner')}
    </div>`,
    async mount(root) {
      $$('[data-st]', root).forEach((b) => b.addEventListener('click', () => {
        const s = b.dataset.st;
        const apply = () => {
          store.update((st) => { const oo = st.orders.find((x) => x.id === o.id); oo.status = s; oo.log.push({ at: new Date().toISOString(), text: { in_progress: 'بدأ التنفيذ', done: 'اكتملت الخدمة', cancelled: 'أُلغي الطلب' }[s] }); });
          toast('تم تحديث الحالة.'); render();
        };
        if (s === 'cancelled') {
          modal('<h2>إلغاء الطلب؟</h2><p class="muted">سيظهر الطلب للعميل كملغي. استرجاع المبلغ يتم من بوابة الدفع.</p><div class="row"><button class="btn danger" id="yes">إلغاء الطلب</button><button class="btn ghost" data-close>رجوع</button></div>', (r, close) => $('#yes', r).addEventListener('click', () => { close(); apply(); }));
        } else apply();
      }));
      $('#link-btn', root)?.addEventListener('click', () => {
        store.update((st) => { st.orders.find((x) => x.id === o.id).carId = $('#link-car', root).value; });
        render();
      });
      for (const pp of o.proposals) { const el = $(`[data-shots="${pp.id}"]`, root); if (el) el.innerHTML = await shotsHTML(pp); }
      if (!$('#st-stage', root)) return;
      const initial = o.status === 'changes_requested' || !p ? { ...(p?.config || {}) } : p.config;
      const v = await mountStage($('#st-stage', root), car, { config: initial });
      if (!canDesign || !v.root) return;
      const studio = await bindStudio(root, car, v, initial);
      $('#send-prop', root).addEventListener('click', async () => {
        const price = Number($('#pr-price', root).value);
        if (!(price > 0)) { $('#pr-price', root).focus(); toast('اكتب سعر التنفيذ.'); return; }
        const btn = $('#send-prop', root); btn.disabled = true; btn.textContent = 'جارٍ تجهيز اللقطات…';
        const shots = await takeShots(v);
        const cfg = studio.config();
        const keep = {};
        for (const k of studio.parts()) if (cfg[k]) keep[k] = cfg[k];
        store.update((st) => {
          const oo = st.orders.find((x) => x.id === o.id);
          oo.proposals.push({ id: uid(), at: new Date().toISOString(), price, note: $('#pr-note', root).value.trim(), status: 'sent', config: keep, shots });
          oo.status = 'proposal_sent';
          oo.log.push({ at: new Date().toISOString(), text: 'أرسل المعرض عرض التصميم' });
        });
        toast(`أُرسل التصميم إلى ${o.customer.name}.`);
        render();
      });
    },
  };
};

views.studio = (carId) => {
  const g = ownerOnly(); if (g) return g;
  const car = carById(carId);
  if (!car) return notFound();
  return {
    html: `
    <div class="page-head"><div class="stack"><span class="eyebrow">استوديو الألوان ثلاثي الأبعاد · لف السيارة واختر الجزء واللون</span><h1>${esc(carName(car))}</h1></div>
      <div class="row">
        <select id="car-switch" style="width:auto" aria-label="اختر السيارة">${S().cars.map((c) => `<option value="${c.id}" ${c.id === car.id ? 'selected' : ''}>${esc(carName(c))}</option>`).join('')}</select>
        <button class="btn" id="save-shot">حفظ لقطة</button><a class="btn ghost" href="#owner-car-${car.id}">بيانات السيارة</a></div></div>
    <div class="studio">
      <div class="stage" id="st-stage"><div class="hint">اسحب للتدوير · اضغط على جزء لتحديده</div></div>
      <aside class="panel">${studioPanel(car)}</aside>
    </div>`,
    async mount(root) {
      $('#car-switch', root).addEventListener('change', (e) => { location.hash = `#studio-${e.target.value}`; });
      const v = await mountStage($('#st-stage', root), car);
      if (!v.root) return;
      const studio = await bindStudio(root, car, v, {});
      $('#save-shot', root).addEventListener('click', async () => {
        const id = await putFile(dataURLtoBlob(v.snapshot()));
        const cfg = studio.config();
        store.update((st) => { st.cars.find((c) => c.id === car.id).photos.push({ id: uid(), color: cfg.body?.name || 'لون مخصص', blobId: id, kind: '3d' }); });
        toast('حُفظت اللقطة في صور السيارة.');
      });
    },
  };
};

views['owner-cars'] = () => {
  const g = ownerOnly(); if (g) return g;
  return {
    html: `<div class="page-head"><div class="stack"><span class="eyebrow">لوحة المالك</span><h1>السيارات</h1></div><a class="btn primary" href="#owner-car-new">إضافة سيارة</a></div>
      ${carCards(S().cars, 'studio')}`,
    mount: hydrateThumbs,
  };
};

views['owner-car'] = (id) => {
  const g = ownerOnly(); if (g) return g;
  const isNew = id === 'new';
  const car = isNew ? { id: 'car-' + uid(), brand: '', model: '', year: new Date().getFullYear(), body: '', modelSrc: null, front: -1, rules: {}, partMap: {}, colors: [{ name: '', ar: '', hex: '#ffffff', finish: 'gloss' }], photos: [] } : carById(id);
  if (!car) return notFound();
  const finishOpts = (sel) => ['gloss', 'metallic', 'pearl', 'satin', 'matte'].map((f) => `<option value="${f}" ${f === sel ? 'selected' : ''}>${FINISH_LABELS[f]}</option>`).join('');
  const colorRow = (c, i) => `<tr data-i="${i}"><td><input type="color" value="${esc(c.hex)}" data-k="hex"></td><td><input value="${esc(c.name)}" data-k="name" placeholder="Rosso Corsa" dir="ltr"></td><td><input value="${esc(c.ar || '')}" data-k="ar" placeholder="أحمر كورسا"></td><td><select data-k="finish">${finishOpts(c.finish)}</select></td><td><button type="button" class="btn sm ghost danger" data-del="${i}">حذف</button></td></tr>`;
  return {
    html: `
    <div class="page-head"><div class="stack"><span class="eyebrow"><a href="#owner-cars">السيارات</a> / ${isNew ? 'سيارة جديدة' : 'تعديل'}</span><h1>${isNew ? 'إضافة سيارة' : esc(carName(car))}</h1></div>
      ${isNew ? '' : `<a class="btn primary" href="#studio-${car.id}">فتح في الاستوديو</a>`}</div>
    ${isNew ? '' : '<div class="stage" id="ce-stage" style="height:min(56vh,480px)"><div class="hint">اضغط على أي لون في الجدول لمعاينته على السيارة</div></div>'}
    <form id="car-form" class="stack" novalidate>
      <section class="panel">
        <h2>البيانات</h2>
        <div class="grid2">
          <div class="field"><label for="c-brand">الشركة</label><input id="c-brand" value="${esc(car.brand)}" dir="ltr" placeholder="Mercedes-Benz"></div>
          <div class="field"><label for="c-model">الموديل</label><input id="c-model" value="${esc(car.model)}" dir="ltr" placeholder="G 63"></div>
          <div class="field"><label for="c-year">السنة</label><input id="c-year" type="number" value="${esc(car.year)}"></div>
          <div class="field"><label for="c-body">الفئة</label><input id="c-body" value="${esc(car.body || '')}" placeholder="SUV"></div>
        </div>
      </section>
      <section class="panel">
        <h2>النموذج ثلاثي الأبعاد</h2>
        <p class="muted small">ملف GLB لسيارة حقيقية (من Sketchfab أو مصمم 3D). يتعرف النظام تلقائيًا على الهيكل والفرش والستيرنج والجنوط من أسماء القطع، ويمكنك ربط أي قطعة يدويًا من الاستوديو بالضغط عليها.</p>
        <div class="grid2">
          <div class="field"><label for="c-glb">رفع ملف GLB</label><input id="c-glb" type="file" accept=".glb,model/gltf-binary"></div>
          <div class="field"><label for="c-front">اتجاه مقدمة السيارة في الملف</label><select id="c-front"><option value="-1" ${car.front === -1 ? 'selected' : ''}>الاتجاه الأول</option><option value="1" ${car.front === 1 ? 'selected' : ''}>الاتجاه المعاكس</option></select></div>
        </div>
        <p class="small muted" id="c-glb-state">${car.modelSrc ? (car.modelSrc.type === 'file' ? 'ملف مرفوع' : 'نموذج مرفق مع النظام') : 'لم يُرفع نموذج بعد.'}</p>
        ${car.credit ? `<p class="small muted" dir="ltr">${esc(car.credit)}</p>` : ''}
      </section>
      <section class="panel">
        <div class="row"><h2>الألوان الرسمية</h2><span class="spacer"></span><button type="button" class="btn sm" id="add-color">إضافة لون</button></div>
        <div class="table-wrap"><table><thead><tr><th>اللون</th><th>الاسم الرسمي</th><th>الاسم بالعربي</th><th>التشطيب</th><th></th></tr></thead><tbody id="c-colors">${car.colors.map(colorRow).join('')}</tbody></table></div>
      </section>
      <section class="panel">
        <h2>الصور الحقيقية</h2>
        <p class="muted small">ارفع صورًا طبيعية للسيارة واربط كل صورة باللون الظاهر فيها. تظهر للعميل في المعرض وللمالك في الاستوديو عند اختيار اللون.</p>
        <div class="row"><select id="p-color" style="max-width:240px">${car.colors.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select><input id="p-files" type="file" accept="image/*" multiple style="max-width:320px"></div>
        <div class="photos" id="c-photos"></div>
      </section>
      <div class="row"><button class="btn primary">حفظ</button>${isNew ? '' : '<button type="button" class="btn danger ghost" id="c-del">حذف السيارة</button>'}</div>
    </form>`,
    async mount(root) {
      const draft = structuredClone(car);
      if (!isNew) {
        const v = await mountStage($('#ce-stage', root), car);
        const preview = (tr) => {
          const val = (k) => $(`[data-k="${k}"]`, tr)?.value;
          if (v.root && tr) v.apply({ body: { color: val('hex'), finish: val('finish') } });
        };
        $('#c-colors', root).addEventListener('input', (e) => preview(e.target.closest('tr')));
        $('#c-colors', root).addEventListener('change', (e) => preview(e.target.closest('tr')));
        $('#c-colors', root).addEventListener('click', (e) => preview(e.target.closest('tr')));
      }
      const readColors = () => $$('#c-colors tr', root).map((tr) => Object.fromEntries($$('[data-k]', tr).map((i) => [i.dataset.k, i.value])));
      const bindDel = () => $$('[data-del]', root).forEach((b) => b.onclick = () => { b.closest('tr').remove(); });
      bindDel();
      $('#add-color', root).addEventListener('click', () => { $('#c-colors', root).insertAdjacentHTML('beforeend', colorRow({ name: '', ar: '', hex: '#888888', finish: 'gloss' }, Date.now())); bindDel(); });
      const drawPhotos = async () => {
        const el = $('#c-photos', root);
        el.innerHTML = draft.photos.length ? '' : '<div class="empty" style="grid-column:1/-1">لا توجد صور بعد.</div>';
        for (const p of draft.photos) {
          const u = await fileURL(p.blobId);
          el.insertAdjacentHTML('beforeend', `<figure class="photo" style="margin:0">${u ? `<img src="${u}" alt="">` : ''}<figcaption>${esc(p.color)}${p.kind === '3d' ? ' · لقطة 3D' : ''}</figcaption><button type="button" class="btn sm x" data-ph="${p.id}">حذف</button></figure>`);
        }
        $$('[data-ph]', el).forEach((b) => b.addEventListener('click', () => {
          const ph = draft.photos.find((x) => x.id === b.dataset.ph);
          draft.photos = draft.photos.filter((x) => x !== ph); deleteFile(ph.blobId); drawPhotos();
        }));
      };
      drawPhotos();
      $('#p-files', root).addEventListener('change', async (e) => {
        for (const f of e.target.files) {
          const blobId = await putFile(await downscale(f));
          draft.photos.push({ id: uid(), color: $('#p-color', root).value, blobId });
        }
        e.target.value = ''; drawPhotos(); toast('أضيفت الصور. اضغط "حفظ" لتثبيتها.');
      });
      $('#c-glb', root).addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        $('#c-glb-state', root).textContent = 'جارٍ حفظ الملف…';
        const fileId = await putFile(f);
        draft.modelSrc = { type: 'file', fileId };
        draft.rules = {}; draft.partMap = {}; draft.credit = '';
        $('#c-glb-state', root).textContent = `تم رفع ${f.name} (${(f.size / 1048576).toFixed(1)} MB). احفظ ثم افتح الاستوديو.`;
      });
      $('#c-del', root)?.addEventListener('click', () => {
        modal('<h2>حذف السيارة؟</h2><p class="muted">ستُحذف السيارة وصورها من المعرض. الطلبات السابقة تبقى.</p><div class="row"><button class="btn danger" id="yes">حذف</button><button class="btn ghost" data-close>رجوع</button></div>', (r, close) => $('#yes', r).addEventListener('click', () => {
          close(); store.update((st) => { st.cars = st.cars.filter((c) => c.id !== car.id); }); location.hash = '#owner-cars';
        }));
      });
      $('#car-form', root).addEventListener('submit', (e) => {
        e.preventDefault();
        const brand = $('#c-brand', root).value.trim(), model = $('#c-model', root).value.trim();
        if (!brand || !model) { toast('اكتب الشركة والموديل.'); return; }
        if (!draft.modelSrc) { toast('ارفع ملف GLB للنموذج ثلاثي الأبعاد.'); return; }
        const colors = readColors().filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim(), ar: c.ar.trim() }));
        if (!colors.length) { toast('أضف لونًا رسميًا واحدًا على الأقل.'); return; }
        const next = { ...draft, brand, model, year: Number($('#c-year', root).value), body: $('#c-body', root).value.trim(), front: Number($('#c-front', root).value), colors };
        store.update((st) => {
          const i = st.cars.findIndex((c) => c.id === next.id);
          if (i >= 0) st.cars[i] = next; else st.cars.push(next);
        });
        toast('تم الحفظ.');
        location.hash = isNew ? `#studio-${next.id}` : '#owner-cars';
      });
    },
  };
};

views['owner-services'] = () => {
  const g = ownerOnly(); if (g) return g;
  const row = (s) => `<tr data-id="${s.id}"><td><input data-k="name" value="${esc(s.name)}"></td><td><input data-k="desc" value="${esc(s.desc)}"></td>
    <td><input data-k="price" type="number" value="${s.price}" style="max-width:110px"></td>
    <td><select data-k="kind"><option value="wash" ${s.kind === 'wash' ? 'selected' : ''}>حجز مباشر</option><option value="custom" ${s.kind === 'custom' ? 'selected' : ''}>مع تصميم 3D</option></select></td>
    <td><input type="checkbox" data-k="active" ${s.active ? 'checked' : ''} aria-label="مفعّلة"></td></tr>`;
  return {
    html: `<div class="page-head"><div class="stack"><span class="eyebrow">لوحة المالك</span><h1>الخدمات والأسعار</h1></div><button class="btn" id="add-svc">إضافة خدمة</button></div>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>الخدمة</th><th>الوصف</th><th>السعر</th><th>النوع</th><th>مفعّلة</th></tr></thead><tbody id="svc-body">${S().services.map(row).join('')}</tbody></table></div>
    <p class="muted small">"مع تصميم 3D" تعني أن العميل يدفع عربونًا، ثم يحدد المالك السعر النهائي في عرض التصميم.</p>
    <div class="row"><button class="btn primary" id="save-svc">حفظ</button></div></section>`,
    mount(root) {
      $('#add-svc', root).addEventListener('click', () => { $('#svc-body', root).insertAdjacentHTML('beforeend', row({ id: 's' + uid(), name: '', desc: '', price: 0, kind: 'wash', active: true })); });
      $('#save-svc', root).addEventListener('click', () => {
        const list = $$('#svc-body tr', root).map((tr) => {
          const g_ = (k) => $(`[data-k="${k}"]`, tr);
          return { id: tr.dataset.id, name: g_('name').value.trim(), desc: g_('desc').value.trim(), price: Number(g_('price').value) || 0, kind: g_('kind').value, active: g_('active').checked };
        }).filter((s) => s.name);
        store.update((st) => { st.services = list; });
        toast('تم حفظ الخدمات.');
      });
    },
  };
};

views['owner-schedule'] = () => {
  const g = ownerOnly(); if (g) return g;
  return {
    html: `<div class="page-head"><div class="stack"><span class="eyebrow">لوحة المالك</span><h1>المواعيد</h1></div><input type="date" id="sc-date" value="${today()}" style="max-width:200px"></div>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>الوقت</th><th>الحجوزات</th><th>السعة</th></tr></thead><tbody id="sc-body"></tbody></table></div></section>`,
    mount(root) {
      const draw = () => {
        const d = $('#sc-date', root).value, st = S().settings;
        const rows = [];
        for (let h = st.openHour; h < st.closeHour; h++) {
          const t = `${String(h).padStart(2, '0')}:00`;
          const os = S().orders.filter((o) => o.date === d && o.time === t && o.status !== 'cancelled');
          rows.push(`<tr><td class="num">${t}</td><td>${os.map((o) => `<a href="#owner-order-${o.id}">#${o.no} ${esc(o.customer.name)} · ${esc(svcNames(o))}</a>`).join('<br>') || '<span class="muted">—</span>'}</td><td class="num">${os.length}/${st.slotCapacity}</td></tr>`);
        }
        $('#sc-body', root).innerHTML = rows.join('');
      };
      $('#sc-date', root).addEventListener('change', draw); draw();
    },
  };
};

views['owner-settings'] = () => {
  const g = ownerOnly(); if (g) return g;
  const s = S().settings;
  const f = (k, label, type = 'text') => `<div class="field"><label for="set-${k}">${label}</label><input id="set-${k}" type="${type}" value="${esc(s[k])}"></div>`;
  return {
    html: `<div class="page-head"><div class="stack"><span class="eyebrow">لوحة المالك</span><h1>الإعدادات</h1></div></div>
    <form class="panel" id="set-form" novalidate>
      <div class="grid2">${f('shopName', 'اسم المعرض')}${f('phone', 'رقم التواصل')}${f('currency', 'العملة')}${f('deposit', 'عربون خدمات التصميم', 'number')}${f('openHour', 'بداية الدوام (ساعة)', 'number')}${f('closeHour', 'نهاية الدوام (ساعة)', 'number')}${f('slotCapacity', 'عدد السيارات في الموعد الواحد', 'number')}${f('ownerPin', 'رمز دخول المالك')}</div>
      <div class="row"><button class="btn primary">حفظ</button><span class="spacer"></span><button type="button" class="btn danger ghost" id="reset">إعادة بيانات العرض التجريبي</button></div>
    </form>`,
    mount(root) {
      $('#set-form', root).addEventListener('submit', (e) => {
        e.preventDefault();
        store.update((st) => {
          for (const k of Object.keys(st.settings)) {
            const el = $(`#set-${k}`, root);
            if (el) st.settings[k] = el.type === 'number' ? Number(el.value) : el.value;
          }
        });
        toast('تم الحفظ.'); render();
      });
      $('#reset', root).addEventListener('click', () => {
        modal('<h2>إعادة بيانات العرض؟</h2><p class="muted">تُحذف كل الطلبات والتعديلات وتعود البيانات التجريبية كما كانت.</p><div class="row"><button class="btn danger" id="yes">إعادة</button><button class="btn ghost" data-close>رجوع</button></div>', (r, close) => $('#yes', r).addEventListener('click', () => {
          close(); store.reset(); loginOwner(); location.hash = '#owner'; toast('عادت بيانات العرض.');
        }));
      });
    },
  };
};

views.ideas = () => ({
  html: `
  <div class="page-head"><div class="stack"><span class="eyebrow">للنقاش قبل البناء</span><h1>ما في النموذج، وما نقترحه بعده</h1></div></div>
  <div class="grid2" style="align-items:start">
    <section class="panel">
      <h2>موجود في هذا النموذج</h2>
      <ul class="stack small" style="margin:0;padding-inline-start:18px">
        <li>حجز الخدمات بالمواعيد المتاحة فقط وسعة لكل موعد.</li>
        <li>الدفع: كامل للغسيل، وعربون لخدمات التلوين ثم المتبقي بعد الموافقة.</li>
        <li>استوديو 3D للمالك: لون الهيكل والتشطيب (لامع، ميتاليك، لؤلؤي، ساتان، مطفي)، الفرش، الستيرنج، الجنوط والأرضية.</li>
        <li>إرسال التصميم للعميل مع لقطات من 3 زوايا ونموذج يقدر يلفّه بنفسه، ثم موافقة أو طلب تعديل.</li>
        <li>العميل يطلب ويعاين ويوافق فقط، والتعديل على الألوان للمالك وحده.</li>
        <li>سيارات حقيقية بألوانها الرسمية، وإضافة سيارة جديدة بملف GLB وصورها الحقيقية لكل لون.</li>
        <li>لوحة طلبات، مواعيد اليوم، إدارة الخدمات والأسعار.</li>
      </ul>
    </section>
    <section class="panel">
      <h2>مقترحات للمرحلة القادمة</h2>
      <ul class="stack small" style="margin:0;padding-inline-start:18px">
        <li><b>أكثر من خيار في العرض الواحد:</b> يرسل المالك 2–3 تصاميم ويختار العميل واحدًا.</li>
        <li><b>إشعارات واتساب:</b> عند وصول التصميم، والتذكير بالموعد، وعند جاهزية السيارة.</li>
        <li><b>دفع فعلي:</b> مدى، فيزا، Apple Pay عبر ميسّر أو تاب، وتقسيط تابي وتمارا للخدمات الكبيرة.</li>
        <li><b>فاتورة إلكترونية</b> متوافقة مع متطلبات هيئة الزكاة والضريبة.</li>
        <li><b>صور قبل وبعد</b> يرفعها الفني لكل طلب، وتتحول لمعرض أعمال.</li>
        <li><b>باقات غسيل واشتراك شهري</b> ونقاط ولاء.</li>
        <li><b>غسيل متنقل</b> في موقع العميل بالخريطة.</li>
        <li><b>كتالوج أفلام التغليف</b> (3M، Avery) بأكوادها وتسعير حسب حجم السيارة.</li>
        <li><b>توزيع المهام على الفنيين</b> ولوحة ورشة بحالات التنفيذ.</li>
        <li><b>معاينة بالواقع المعزز</b> على جوال العميل لرؤية السيارة بالحجم الحقيقي.</li>
        <li><b>تقارير:</b> الإيرادات، الألوان الأكثر طلبًا، نسب الموافقة.</li>
      </ul>
    </section>
    <section class="panel">
      <h2>يحتاجه البناء الفعلي</h2>
      <ul class="stack small" style="margin:0;padding-inline-start:18px">
        <li>خادم وقاعدة بيانات وحسابات بتحقق الجوال (النموذج الحالي يحفظ على الجهاز فقط).</li>
        <li>حساب بوابة دفع وسجل تجاري.</li>
        <li>نماذج 3D مرخّصة تجاريًا لكل موديل يقدمه المعرض (شراء أو تصميم خاص).</li>
        <li>صور حقيقية لكل سيارة وكل لون يصوّرها المعرض.</li>
        <li>نطاق (دومين) واستضافة.</li>
      </ul>
    </section>
  </div>`,
});

function notFound() { return { html: '<div class="empty">الصفحة غير موجودة. <a href="#home">العودة للرئيسية</a></div>' }; }

// ---------- الموجّه ----------
function parse() {
  const h = location.hash.slice(1) || 'home';
  for (const key of ['owner-order', 'owner-car', 'studio', 'order', 'car']) {
    if (h.startsWith(key + '-') && !(key === 'owner-car' && h === 'owner-cars')) return { key, arg: h.slice(key.length + 1), route: h };
  }
  return { key: h, arg: null, route: h };
}

let renderToken = 0;
function render() {
  const { key, arg, route } = parse();
  disposeViewers();
  renderChrome(route);
  const view = (views[key] || notFound)(arg);
  // حاوية جديدة لكل صفحة حتى لا تلمس عمليات صفحة سابقة (غير متزامنة) الصفحة الحالية
  const root = document.createElement('div');
  root.className = 'page';
  root.innerHTML = view.html;
  $('#app').replaceChildren(root);
  const token = ++renderToken;
  window.scrollTo(0, 0);
  if (view.mount) Promise.resolve(view.mount(root)).catch((e) => { if (token === renderToken) console.error(e); });
}

window.addEventListener('hashchange', render);
// تحديث الشارات عند تغيّر البيانات (من تبويب آخر مثلاً) دون إعادة رسم الصفحة الحالية
store.subscribe(() => renderChrome(parse().route));
render();
