// عارض السيارة ثلاثي الأبعاد: تحميل نموذج GLB، تقسيمه إلى أجزاء قابلة للتلوين، وتطبيق الألوان والتشطيبات.
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { DRACOLoader } from './vendor/DRACOLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

export const PARTS = {
  body: { label: 'لون الهيكل', finishes: ['gloss', 'metallic', 'pearl', 'satin', 'matte'] },
  interior: { label: 'الفرش (المقاعد)', finishes: ['leather', 'nappa', 'suede'] },
  steering: { label: 'الستيرنج', finishes: ['leather', 'suede'] },
  rims: { label: 'الجنوط', finishes: ['gloss', 'metallic', 'matte'] },
  carpet: { label: 'الأرضية', finishes: ['suede'] },
};

export const FINISH_LABELS = {
  gloss: 'لامع', metallic: 'ميتاليك', pearl: 'لؤلؤي', satin: 'ساتان', matte: 'مطفي',
  leather: 'جلد', nappa: 'جلد نابا', suede: 'شمواه',
};

export const DEFAULT_CONFIG = {
  body: { color: '#c8102e', finish: 'gloss' },
  interior: { color: '#1c1c1e', finish: 'leather' },
  steering: { color: '#1c1c1e', finish: 'leather' },
  rims: { color: '#b9bcc0', finish: 'metallic' },
  carpet: { color: '#1a1a1a', finish: 'suede' },
};

// يحدد الجزء من اسم القطعة واسم مادتها (يعمل مع أغلب نماذج السيارات المسماة بالإنجليزية).
export function guessPart(name) {
  const n = name.toLowerCase();
  if (/steering/.test(n)) return /leather|grip|wheel_?cover|rim_?leather/.test(n) ? 'steering' : null;
  if (/carpet|floor_?mat/.test(n)) return 'carpet';
  if (/leather|seat|upholst|fabric|alcantara/.test(n)) return 'interior';
  if (/(^|[^a-z])rim|alloy/.test(n)) return 'rims';
  if (/(^|[^a-z])body|paint|carpaint|body_?colou?r|exterior/.test(n)) return 'body';
  return null;
}

function finishParams(part, finish) {
  if (part === 'body' || part === 'rims') {
    switch (finish) {
      case 'metallic': return { metalness: 0.85, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 };
      case 'pearl': return { metalness: 0.45, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.7, iridescenceIOR: 1.6 };
      case 'satin': return { metalness: 0.4, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 };
      case 'matte': return { metalness: 0.15, roughness: 0.78, clearcoat: 0, clearcoatRoughness: 1 };
      default: return { metalness: 0.15, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.02 };
    }
  }
  switch (finish) {
    case 'nappa': return { metalness: 0, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0 };
    case 'suede': return { metalness: 0, roughness: 0.95, clearcoat: 0, clearcoatRoughness: 1, sheen: 1, sheenRoughness: 0.8 };
    default: return { metalness: 0, roughness: 0.58, clearcoat: 0.1, clearcoatRoughness: 0.6, sheen: 0 };
  }
}

export class CarViewer {
  constructor(container, { interactive = true } = {}) {
    this.container = container;
    this.meshes = []; // { mesh, defaultPart }
    this.partMap = {}; // تعديلات المالك اليدوية: اسم القطعة -> الجزء
    this.config = structuredClone(DEFAULT_CONFIG);
    this.onPick = null;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
    this.camera.position.set(4.3, 1.6, -4.6);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxDistance = 12;
    this.controls.minDistance = 0.05;
    this.controls.target.set(0, 0.5, 0);
    this.controls.autoRotate = !interactive;
    this.controls.autoRotateSpeed = 0.8;

    const grid = new THREE.GridHelper(20, 40, 0x888888, 0x888888);
    grid.material.opacity = 0.12; grid.material.transparent = true; grid.material.depthWrite = false;
    this.scene.add(grid);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    this.raycaster = new THREE.Raycaster();
    let down = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !this.onPick) return;
      const r = renderer.domElement.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(p, this.camera);
      const hit = this.raycaster.intersectObjects(this.meshes.map((m) => m.mesh), false)[0];
      if (hit) {
        const entry = this.meshes.find((m) => m.mesh === hit.object);
        this.onPick({ meshName: entry.key, part: this.partOf(entry) });
      }
    });

    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      renderer.render(this.scene, this.camera);
    };
    loop();
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // rules: { body: ['WhiteCar'], hide: ['Material.001'] } أسماء مواد/قطع محددة لكل سيارة
  // front: اتجاه مقدمة السيارة على المحور الطويل (1 أو -1)
  async load(src, { partMap = {}, rules = {}, front = -1 } = {}) {
    this.partMap = { ...partMap };
    this.rules = rules;
    this.frontSign = front;
    const draco = new DRACOLoader();
    draco.setDecoderPath(new URL('../assets/draco/', import.meta.url).href);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    // بعض الاستضافات لا تخدم امتداد .glb، فننشر نفس الملف بامتداد .wasm كبديل
    // ونحمّل الصور الداخلية عبر <img> بدل createImageBitmap/fetch لتعمل مع سياسات CSP الصارمة
    const cib = window.createImageBitmap;
    window.createImageBitmap = undefined;
    let gltf;
    try {
      try { gltf = await loader.loadAsync(src.url); } catch (e) {
        if (!/\.glb$/.test(src.url)) throw e;
        gltf = await loader.loadAsync(src.url.replace(/\.glb$/, '.wasm'));
      }
    } finally { window.createImageBitmap = cib; }
    draco.dispose();
    if (this.disposed) return;
    const root = gltf.scene;
    const hide = new Set(rules.hide || []); // أسماء مواد أو قطع لا تخص السيارة (أرضية، أقماع…)
    const extras = [];
    root.traverse((o) => { if (o.isMesh && (hide.has(o.name) || hide.has(o.material?.name))) extras.push(o); });
    extras.forEach((o) => o.removeFromParent());

    // توحيد الحجم: طول السيارة ~4.5م وتوسيطها على الأرض
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const k = 4.5 / Math.max(size.x, size.z);
    root.scale.multiplyScalar(k);
    box.setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.x -= c.x; root.position.z -= c.z; root.position.y -= box.min.y;
    this.bounds = new THREE.Box3().setFromObject(root);
    this.longAxis = size.x > size.z ? 'x' : 'z';

    root.traverse((o) => {
      if (!o.isMesh) return;
      const mname = (o.material && o.material.name) || '';
      if (/glass/i.test(o.name + mname)) {
        o.material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0, transparent: true, opacity: 0.18, depthWrite: false });
      }
      const key = `${o.name}|${mname}`;
      const ruled = Object.keys(this.rules).filter((p) => p in PARTS).find((p) => this.rules[p].some((n) => (n.endsWith('*') ? o.name.startsWith(n.slice(0, -1)) : n === mname || n === o.name)));
      this.meshes.push({ mesh: o, key, defaultPart: ruled || guessPart(o.name) || guessPart(mname) });
    });

    if (src.ao) {
      const tex = await new THREE.TextureLoader().loadAsync(src.ao).catch(() => null);
      if (tex) {
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4),
          new THREE.MeshBasicMaterial({ map: tex, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, premultipliedAlpha: true }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.renderOrder = 2;
        root.add(shadow);
      }
    } else {
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; shadow.scale.set(this.longAxis === 'x' ? 1 : 0.5, this.longAxis === 'x' ? 0.5 : 1, 1);
      this.scene.add(shadow);
    }

    this.scene.add(root);
    this.root = root;
    this.rebuildMaterials();
    this.view('front');
  }

  partOf(entry) {
    return entry.key in this.partMap ? this.partMap[entry.key] : entry.defaultPart;
  }

  setPartMap(key, part) {
    this.partMap[key] = part;
    this.rebuildMaterials();
  }

  rebuildMaterials() {
    for (const entry of this.meshes) {
      entry.original ||= entry.mesh.material;
      const part = this.partOf(entry);
      if (!part) { entry.mesh.material = entry.original; entry.partMat = null; continue; }
      if (!entry.partMat || entry.partMat.userData.part !== part) {
        // مادة جديدة لكل قطعة مع الاحتفاظ بتفاصيل السطح (normal/ao) من المادة الأصلية
        const o = entry.original;
        const m = new THREE.MeshPhysicalMaterial({ normalMap: o.normalMap || null, aoMap: o.aoMap || null, side: o.side });
        if (part === 'rims' && o.map) m.map = o.map;
        m.userData.part = part;
        entry.partMat = m;
      }
      entry.mesh.material = entry.partMat;
    }
    this.apply(this.config);
  }

  presentParts() {
    const set = new Set(this.meshes.map((e) => this.partOf(e)).filter(Boolean));
    return Object.keys(PARTS).filter((p) => set.has(p));
  }

  apply(config) {
    this.config = structuredClone({ ...DEFAULT_CONFIG, ...config });
    for (const entry of this.meshes) {
      const mat = entry.partMat;
      if (!mat) continue;
      const part = mat.userData.part;
      const cfg = this.config[part];
      if (!cfg) continue;
      const p = { iridescence: 0, sheen: 0, clearcoat: 0, clearcoatRoughness: 0, ...finishParams(part, cfg.finish) };
      mat.color.set(cfg.color);
      mat.metalness = p.metalness; mat.roughness = p.roughness;
      mat.clearcoat = p.clearcoat; mat.clearcoatRoughness = p.clearcoatRoughness;
      mat.iridescence = p.iridescence; mat.iridescenceIOR = p.iridescenceIOR || 1.3;
      mat.sheen = p.sheen; mat.sheenRoughness = p.sheenRoughness || 1;
      mat.sheenColor.set(cfg.color).lerp(new THREE.Color(0xffffff), 0.3);
      mat.needsUpdate = true;
    }
  }

  highlight(part) {
    const mats = this.meshes.filter((e) => e.partMat && e.partMat.userData.part === part).map((e) => e.partMat);
    mats.forEach((m) => { m.emissive.set(0x3355ff); m.emissiveIntensity = 0.5; });
    clearTimeout(this.hlT);
    this.hlT = setTimeout(() => mats.forEach((m) => m.emissive.set(0x000000)), 450);
  }

  view(name) {
    if (!this.bounds) return;
    const b = this.bounds, c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    const L = this.longAxis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const W = this.longAxis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const len = Math.max(s.x, s.z);
    let pos, target;
    if (name === 'interior') {
      // من خلف مقعد السائق وأعلى قليلًا، النظر نحو الستيرنج والطبلون
      const steering = this.meshes.find((e) => /steering/i.test(e.key));
      target = c.clone().setY(s.y * 0.5);
      if (steering) target = new THREE.Box3().setFromObject(steering.mesh).getCenter(new THREE.Vector3());
      pos = target.clone().addScaledVector(L, -this.frontSign * len * 0.3).setY(s.y * 1.25);
      target.addScaledVector(L, this.frontSign * len * 0.05);
      this.controls.minDistance = 0.01;
    } else {
      const side = name === 'rear' ? -1 : 1;
      const front = this.frontSign;
      pos = c.clone().addScaledVector(L, front * side * len * 0.95).addScaledVector(W, len * 0.85).setY(s.y * 1.4);
      if (name === 'side') pos = c.clone().addScaledVector(W, len * 1.25).setY(s.y * 0.9);
      if (name === 'top') pos = c.clone().setY(len * 1.6).addScaledVector(W, 0.01);
      target = c.clone().setY(s.y * 0.4);
      this.controls.minDistance = 1.5;
    }
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.controls.update();
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(c.width / 2, c.height * 0.2, 0, c.width / 2, c.height * 0.2, c.width * 0.8);
    grad.addColorStop(0, '#2a3039'); grad.addColorStop(1, '#14171c');
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0);
    return c.toDataURL('image/jpeg', 0.9);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
