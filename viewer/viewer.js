// Cursor Canvas — viewer (kres 2026), pixel-art layer + shared state.
// Renders the crisp 2D scene (background, the hand-drawn flame, animals, frames, mother
// cursor) on #stage, owns all cursor/particle/lightning state, and publishes it
// on window.KRES for the WebGL glow layer (fx.js) to read. If three.js fails to
// load, this still runs on its own.
//
// URL options: ?relay=IP:PORT   ?labels   ?nofire   ?size=120

// ---- Config -------------------------------------------------------------
const params = new URLSearchParams(location.search);
const RELAY =
  params.get("relay") ||
  (location.protocol.startsWith("http") && location.hostname
    ? `${location.hostname}:8765`
    : "localhost:8765");
const SHOW_LABELS = params.has("labels");
const SHOW_FIRE = !params.has("nofire");
const SHOW_AMBIENT = params.has("ambient");   // spontaneous magic bursts on animals — OFF by default (?ambient restores)
const SHOW_LIGHTNING = params.has("lightning");   // OFF by default — no bolts/arcs/energy-web between cursors (?lightning restores)

const STAGE_W = 1080, STAGE_H = 1920;

// The 6 named animals. A cursor is assigned one by id-hash (so >6 visitors just
// reuse them). `frame` is the scenery that opens when this animal is clicked.
const ZIVALICE = [
  { key: "bambi",         frame: "bambi",         src: "assets/zivalice/bambi.svg",         w: 114, h: 112 },
  { key: "spiral-cat",    frame: "spiral-cat",    src: "assets/zivalice/spiral-cat.svg",    w: 110, h: 92 },
  { key: "nia",           frame: "nia",           src: "assets/zivalice/nia.svg",           w: 101, h: 82 },
  { key: "deer",          frame: "deer",          src: "assets/zivalice/deer.svg",          w: 106, h: 93 },
  { key: "spiral-kitten", frame: "spiral-kitten", src: "assets/zivalice/spiral-kitten.svg", w: 78,  h: 83 },
  { key: "pony-lullaby",  frame: "pony",          src: "assets/zivalice/pony-lullaby.svg",  w: 119, h: 105 },
];
const CURSOR_H = Number(params.get("size") || 120);   // match the arc switcher (frames.js arc box is 120 tall)

const SMOOTHING = 0.22;
const FADE_AFTER_MS = 4000;
const FADE_DUR_MS = 800;
const GLOW_COLOR = [255, 210, 140];
const ENERGY_PER_CLICK = 0.7, ENERGY_MAX = 2.2, ENERGY_DECAY = 0.5;

// Fire — the hand-drawn flame (assets/ogenj.svg): 5 gradient tongues redrawn on
// the canvas every frame, each swaying like living fire and dodging cursors.
const FIRE_CX = 0.5, FIRE_BASE = 0.64, FIRE_W_FRAC = 0.26, FIRE_TALL = 1.15;   // FIRE_BASE = how far down the base sits; FIRE_TALL>1 = taller flames
const FLAME_DODGE = 1.0, FLAME_R_FACTOR = 1.7, FLAME_EASE = 7;   // dodge gain / reach / ease
const DODGE_GAIN = 60;           // viewBox px a fully-pushed tongue tip flees (lower = calmer, less reactive)
const MOTHER_PUSH = 2.4;         // the operator's own cursor shoves the flames hardest
const PIXEL_FIRE = !params.has("smoothfire");   // procedural pixel-flame (default); ?smoothfire = vector SVG

// Lightning / web (screen px, scaled per frame by stageScale).
const ARC_RANGE = 260, ARC_RATE = 0.12;      // arcs between near animals (rare → special)
const CLICK_BOLT_RANGE = 620;                // click zaps reach this far
const CLICK_BOLT_CHANCE = 0.05;              // only ~5% of clicks throw a chain

// ---- Canvas + stage fit -------------------------------------------------
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");
if (!params.has("hud")) hud.style.display = "none";   // clean show display; add ?hud to reveal relay/cursor status

let W = 0, H = 0;
let stageX = 0, stageY = 0, stageW = 0, stageH = 0, stageScale = 1;
function computeStage() {
  stageScale = Math.min(W / STAGE_W, H / STAGE_H);
  stageW = STAGE_W * stageScale; stageH = STAGE_H * stageScale;
  stageX = (W - stageW) / 2; stageY = (H - stageH) / 2;
}
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  computeStage();
}
window.addEventListener("resize", resize);
resize();

// ---- Assets -------------------------------------------------------------
// Bump ASSET_VER whenever you replace a PNG so browsers can't serve a stale copy
// (or pass ?v=anything in the URL). The ?v= query busts the image cache.
const ASSET_VER = params.get("v") || "2026-06-22";
function loadImage(src) {
  const url = src + (src.indexOf("?") < 0 ? "?v=" + ASSET_VER : "");
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
}
let bgImg = null, spredajImg = null, textboxImg = null, paperImg = null;
loadImage("assets/landing.png").then((i) => (bgImg = i));        // the landing scene background
loadImage("assets/textbox.png").then((i) => (textboxImg = i));   // text card — behind the frame plants
loadImage("assets/spredaj.png").then((i) => (spredajImg = i));   // ornamental frame (plants), in FRONT of the animals + textbox
loadImage("assets/plus-darker.png").then((i) => (paperImg = i)); // paper texture, multiply over everything
const zivalice = ZIVALICE.map((z) => ({ img: null, aspect: z.w / z.h, key: z.key, frame: z.frame, src: z.src }));
ZIVALICE.forEach((z, i) => loadImage(z.src).then((img) => (zivalice[i].img = img)));

function hashId(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }
function spriteFor(id) { return zivalice[hashId(id) % zivalice.length]; }
function colorFor(id) { return `hsl(${hashId(id) % 360}, 85%, 62%)`; }
function hsl(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q-p)*6*t; if (t < 1/2) return q; if (t < 2/3) return p + (q-p)*(2/3-t)*6; return p; };
  const q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  return [Math.round(f(p,q,h+1/3)*255), Math.round(f(p,q,h)*255), Math.round(f(p,q,h-1/3)*255)];
}

// ---- Cursor state -------------------------------------------------------
const cursors = new Map();   // id -> { id, x, y, tx, ty, lastSeen, alpha, clicks, energy, lastClick }
function upsert(id, x, y) {
  const now = performance.now();
  let c = cursors.get(id);
  if (!c) cursors.set(id, { id, x, y, tx: x, ty: y, lastSeen: now, alpha: 0, clicks: 0, energy: 0, lastClick: 0 });
  else { c.tx = x; c.ty = y; c.lastSeen = now; }
}
const sx = (c) => stageX + c.x * stageW;
const sy = (c) => stageY + c.y * stageH;

// ---- Particles (sim here; rendered by fx.js as glowing points) ----------
const particles = [];
const MAX_PARTICLES = 1800;
function addParticle(x, y, vx, vy, life, size, rgb, grav) {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push({ x, y, vx, vy, life, max: life, size, r: rgb[0], g: rgb[1], b: rgb[2], grav: grav || 0 });
}
// 20 themed effects (cute / fun / magical / mystical / pagan / natural / ritual).
// Each: (x, y, pw) where pw is "power" (grows with click count). They push
// particles (and some lightning) that the WebGL layer renders glowing + bloomed.
// addBolt rgb is 0..1; addParticle rgb is 0..255 (hsl() returns 0..255).
const TAU = Math.PI * 2;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const S = () => stageScale;
const EFFECT_NAMES = [
  "embers", "petals", "fireflies", "sparks", "bloom", "rune circle", "vortex",
  "star shower", "smoke", "lightning crown", "will-o-wisp", "sun rays", "moon halo",
  "leaf swirl", "sparkle pop", "ash drift", "aurora", "dandelion", "ember ring", "constellation",
];
const EFFECTS = [
  // 0 embers rise (fire / natural)
  (x, y, pw) => { const n = Math.round(26*pw); for (let i=0;i<n;i++){ const a=-Math.PI/2+(Math.random()-0.5)*1.2, sp=(40+Math.random()*70)*S()*pw; addParticle(x+(Math.random()-0.5)*30*S(), y, Math.cos(a)*sp*0.4, Math.sin(a)*sp, 0.9+Math.random()*0.8, (3+Math.random()*3)*S(), hsl(18+Math.random()*22,0.95,0.58), 40*S()); } },
  // 1 petals fall (cute / natural)
  (x, y, pw) => { const n = Math.round(20*pw); for (let i=0;i<n;i++){ addParticle(x+(Math.random()-0.5)*70*S(), y-40*S(), (Math.random()-0.5)*30*S(), (20+Math.random()*40)*S(), 1.4+Math.random(), (4+Math.random()*3)*S(), hsl(330+Math.random()*30,0.7,0.78), 25*S()); } },
  // 2 firefly swarm (magical)
  (x, y, pw) => { const n = Math.round(16*pw); for (let i=0;i<n;i++){ const a=Math.random()*TAU, r=Math.random()*40*S(); addParticle(x+Math.cos(a)*r, y+Math.sin(a)*r, (Math.random()-0.5)*18*S(), (Math.random()-0.5)*18*S(), 1.6+Math.random()*1.4, (3+Math.random()*2)*S(), hsl(55+Math.random()*25,0.9,0.65), 0); } },
  // 3 sparks (fun / fire)
  (x, y, pw) => { const n = Math.round(30*pw); for (let i=0;i<n;i++){ const a=Math.random()*TAU, sp=(80+Math.random()*160)*S()*pw; addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.5+Math.random()*0.5,(3+Math.random()*2)*S(),hsl(35+Math.random()*20,1,0.65),120*S()); } },
  // 4 bloom flower (cute / natural)
  (x, y, pw) => { const petals=6, n=Math.round(8*pw), hue=Math.random()*360; for (let p=0;p<petals;p++){ const base=p/petals*TAU; for (let i=1;i<=n;i++){ const sp=(30+i/n*90)*S()*pw, a=base+(Math.random()-0.5)*0.3; addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.8+Math.random()*0.5,(4+Math.random()*2)*S(),hsl(hue+p*8,0.8,0.7),20*S()); } } },
  // 5 rune circle (pagan / ritual)
  (x, y, pw) => { const n=Math.round(28*pw), R=(60+30*pw)*S(); for (let i=0;i<n;i++){ const a=i/n*TAU; addParticle(x+Math.cos(a)*R,y+Math.sin(a)*R,Math.cos(a)*4*S(),Math.sin(a)*4*S(),1.0+Math.random()*0.6,(3+Math.random()*2)*S(),hsl(40+Math.random()*15,0.95,0.62),0); } for (let i=0;i<6;i++){ const a=i/6*TAU, a2=(i+2)/6*TAU; addBolt(x+Math.cos(a)*R,y+Math.sin(a)*R,x+Math.cos(a2)*R,y+Math.sin(a2)*R,0.25,[1.0,0.8,0.4],0.9); } },
  // 6 spiral vortex (mystical)
  (x, y, pw) => { const n=Math.round(36*pw); for (let i=0;i<n;i++){ const t=i/n,a=t*TAU*3,sp=t*140*S()*pw; addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.9,(3+Math.random()*2)*S(),hsl(265+t*60,0.8,0.62),0); } },
  // 7 star shower (magical)
  (x, y, pw) => { const n=Math.round(22*pw); for (let i=0;i<n;i++){ addParticle(x+(Math.random()-0.5)*120*S(), y-(120+Math.random()*120)*S(), (Math.random()-0.5)*20*S(), (90+Math.random()*120)*S(), 1.0+Math.random(), (3+Math.random()*3)*S(), hsl(50+Math.random()*180,0.5,0.85), 60*S()); } },
  // 8 smoke puff (natural)
  (x, y, pw) => { const n=Math.round(18*pw); for (let i=0;i<n;i++){ const a=-Math.PI/2+(Math.random()-0.5)*1.6, sp=(20+Math.random()*40)*S(), g=120+Math.floor(Math.random()*60); addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,1.6+Math.random(),(8+Math.random()*8)*S(),[g,g,g+10],-10*S()); } },
  // 9 lightning crown (pagan / ritual)
  (x, y, pw) => { const n=Math.round(6+4*pw); for (let i=0;i<n;i++){ const a=i/n*TAU, R=(70+50*pw)*S(); addBolt(x,y,x+Math.cos(a)*R,y+Math.sin(a)*R,0.3,[0.7,0.85,1.0],1.3); } for (let i=0;i<10*pw;i++){ const a=Math.random()*TAU; addParticle(x,y,Math.cos(a)*60*S(),Math.sin(a)*60*S(),0.4,3*S(),[200,225,255],0); } },
  // 10 will-o-wisp (mystical)
  (x, y, pw) => { const n=Math.round(4+3*pw); for (let i=0;i<n;i++){ const a=Math.random()*TAU; addParticle(x,y,Math.cos(a)*20*S(),Math.sin(a)*20*S()-15*S(),2.2+Math.random()*1.5,(6+Math.random()*4)*S(),hsl(160+Math.random()*40,0.8,0.6),5*S()); } },
  // 11 sun rays (magical)
  (x, y, pw) => { const arms=12, per=Math.round(3*pw); for (let r=0;r<arms;r++){ const a=r/arms*TAU; for (let i=1;i<=per;i++){ const sp=(40+i*60)*S()*pw; addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.7,(3+Math.random()*2)*S(),hsl(45,1,0.65),0); } } },
  // 12 moon halo (mystical)
  (x, y, pw) => { const n=Math.round(40*pw); for (let i=0;i<n;i++){ const a=i/n*TAU, sp=70*S()*pw; addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.8,(3+Math.random())*S(),hsl(215,0.3,0.85),0); } },
  // 13 leaf swirl (natural)
  (x, y, pw) => { const n=Math.round(20*pw); for (let i=0;i<n;i++){ const t=i/n,a=t*TAU*2,sp=(30+t*80)*S()*pw; addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp+20*S(),1.3+Math.random(),(4+Math.random()*3)*S(),hsl(90+Math.random()*40,0.7,0.5),30*S()); } },
  // 14 sparkle pop (cute)
  (x, y, pw) => { const n=Math.round(18*pw); for (let i=0;i<n;i++){ const a=Math.random()*TAU, sp=(30+Math.random()*70)*S(); addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.4+Math.random()*0.5,(2+Math.random()*3)*S(),hsl(Math.random()*360,0.6,0.9),0); } },
  // 15 ash drift (natural / ritual)
  (x, y, pw) => { const n=Math.round(22*pw); for (let i=0;i<n;i++){ const g=60+Math.floor(Math.random()*50); addParticle(x+(Math.random()-0.5)*60*S(),y,(Math.random()-0.5)*20*S(),(15+Math.random()*30)*S(),1.6+Math.random(),(2+Math.random()*2)*S(),[g,g,g],20*S()); } },
  // 16 aurora ribbon (magical)
  (x, y, pw) => { const n=Math.round(30*pw); for (let i=0;i<n;i++){ const t=i/n; addParticle(x+(t-0.5)*200*S(), y+Math.sin(t*TAU)*30*S(), (Math.random()-0.5)*10*S(), -(20+Math.random()*30)*S(), 1.4+Math.random(), (4+Math.random()*3)*S(), hsl(120+t*160,0.8,0.6), 0); } },
  // 17 dandelion (cute / natural)
  (x, y, pw) => { const n=Math.round(24*pw); for (let i=0;i<n;i++){ const a=Math.random()*TAU, sp=(20+Math.random()*40)*S(); addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,2.0+Math.random()*1.5,(2+Math.random()*2)*S(),[245,245,235],3*S()); } },
  // 18 ember ring / blood moon (pagan / mystical)
  (x, y, pw) => { const n=Math.round(30*pw); for (let i=0;i<n;i++){ const a=i/n*TAU, sp=120*S()*pw; addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.7,(4+Math.random()*2)*S(),hsl(Math.random()*15,0.9,0.5),0); } for (let i=0;i<12*pw;i++){ const a=-Math.PI/2+(Math.random()-0.5)*1.0, sp=(40+Math.random()*60)*S(); addParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp,1.0,3*S(),hsl(15,0.9,0.55),50*S()); } },
  // 19 constellation (mystical / magical)
  (x, y, pw) => { const n=Math.round(6+3*pw), pts=[]; for (let i=0;i<n;i++){ const a=Math.random()*TAU, r=(20+Math.random()*70)*S(), xp=x+Math.cos(a)*r, yp=y+Math.sin(a)*r; pts.push([xp,yp]); addParticle(xp,yp,0,0,1.4+Math.random(),(3+Math.random()*2)*S(),[230,235,255],0); } for (let i=0;i<pts.length-1;i++) addBolt(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],0.8,[0.6,0.7,1.0],0.5); },
];
function fireEffect(idx, x, y, pw) { EFFECTS[((idx % EFFECTS.length) + EFFECTS.length) % EFFECTS.length](x, y, pw); }
function spawnEffect(c) {
  const lvl = c.clicks;
  const pw = 0.8 + Math.min(lvl, 8) * 0.18;     // escalates with clicks
  fireEffect(hashId(c.id) + lvl, sx(c), sy(c), pw);   // each cursor cycles all 20
  if (lvl > 0 && lvl % 7 === 0) fireEffect(Math.floor(Math.random() * EFFECTS.length), sx(c), sy(c), pw * 1.4);
}
// occasional spontaneous magic
let ambientAt = 0;
function maybeAmbient(now) {
  if (!SHOW_AMBIENT) return;
  if (ambientAt === 0) { ambientAt = now + 3000; return; }
  if (now < ambientAt) return;
  ambientAt = now + 2500 + Math.random() * 4000;
  const alive = []; for (const [, c] of cursors) if (c.alpha > 0.5) alive.push(c);
  let x, y;
  if (alive.length && Math.random() < 0.8) { const c = pick(alive); x = sx(c); y = sy(c); }
  else if (SHOW_FIRE) { x = fireX + fireDispW / 2; y = fireY + fireDispH * 0.4; }
  else { x = stageX + stageW * 0.5; y = stageY + stageH * 0.5; }
  fireEffect(Math.floor(Math.random() * EFFECTS.length), x, y, 0.7 + Math.random() * 0.6);
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= (1 - 1.2 * dt);
  }
}

// ---- Lightning state (paths built by fx.js; we manage life + spawning) ---
const bolts = [];   // { x1,y1,x2,y2, life, max, rgb:[0..1], bright }
function addBolt(x1, y1, x2, y2, life, rgb, bright) {
  if (!SHOW_LIGHTNING) return;            // lightning disabled → swallow all bolts (arcs, ambient, click)
  if (bolts.length >= 80) return;
  bolts.push({ x1, y1, x2, y2, life, max: life, rgb, bright });
}
function spawnClickBolts(c) {
  const cx = sx(c), cy = sy(c);
  const others = [];
  for (const [, o] of cursors) if (o !== c && o.alpha > 0.3) {
    const d = Math.hypot(sx(o) - cx, sy(o) - cy);
    if (d < CLICK_BOLT_RANGE * stageScale) others.push({ o, d });
  }
  others.sort((a, b) => a.d - b.d);
  for (const { o } of others.slice(0, 3)) addBolt(cx, cy, sx(o), sy(o), 0.32, [0.8, 0.9, 1.0], 1.5);
  if (SHOW_FIRE) addBolt(cx, cy, fireX + fireDispW / 2, fireY + fireDispH * 0.4, 0.28, [1.0, 0.72, 0.4], 1.3);
}
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].life -= dt; if (bolts[i].life <= 0) bolts.splice(i, 1); }
  // intermittent arcs between nearby animals
  const arr = []; for (const [, c] of cursors) if (c.alpha > 0.3) arr.push(c);
  const R = ARC_RANGE * stageScale;
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = arr[i], b = arr[j];
    const d = Math.hypot(sx(a) - sx(b), sy(a) - sy(b));
    if (d < R) {
      const prox = 1 - d / R;
      if (Math.random() < ARC_RATE * dt * prox) addBolt(sx(a), sy(a), sx(b), sy(b), 0.15 + 0.1 * Math.random(), [0.55, 0.8, 1.0], 0.7 + 0.5 * prox);
    }
  }
}

// ---- Central fire (hand-drawn flame, animated) --------------------------
// The 5 tongues of assets/ogenj.svg (viewBox 219×352), redrawn on the canvas
// each frame: a per-tongue horizontal shear (sway about the base) + a vertical
// height pulse + a flicker, plus a lean that flees nearby cursors. The original
// linear gradients and the `lighten` blend are reproduced so it matches the art.
const FIRE_VB_W = 219, FIRE_VB_H = 352, FIRE_BASE_Y = 345;   // viewBox; sway pivots at the base row
const FLAMES_SVG = [
  { tipX: 145, tipY: 4,   phase: 0.0, amp: 16, freq: 0.0011,
    d: "M161.027 241.772C154.099 311.346 117.55 337.795 100.141 342.323C94.4698 328.085 108.994 287.025 120.789 227.283C137.211 144.104 85.9876 50.3146 145.216 3.71582C98.5141 88.578 167.954 172.198 161.027 241.772Z",
    grad: { x1:161.349, y1:135.339, x2:109.09, y2:344.558, stops:[[0.0096,"255,255,255",0.7],[0.4712,"248,184,126",0.78],[1,"255,0,4",1]] } },
  { tipX: 62,  tipY: 97,  phase: 1.7, amp: 15, freq: 0.0013,
    d: "M51.8884 273.231C58.8357 323.701 90.33 339.926 105.209 341.73C109.818 330.783 96.8397 301.908 85.9004 259.081C70.6695 199.452 112.826 126.128 61.7322 97.0912C102.749 155.312 44.9411 222.76 51.8884 273.231Z",
    grad: { x1:50.0016, y1:195.126, x2:97.6293, y2:344.152, stops:[[0,"255,255,255",0.7],[0.3798,"245,251,171",0.7],[1,"255,0,4",1]] } },
  { tipX: 149, tipY: 87,  phase: 3.1, amp: 14, freq: 0.0012,
    d: "M85.6337 252.12C76.887 302.31 101.947 327.353 115.571 333.601C123.293 324.576 119.721 293.121 122.339 248.997C125.983 187.561 188.46 130.551 148.631 87.3379C169.977 155.281 94.3805 201.931 85.6337 252.12Z",
    grad: { x1:107.613, y1:177.148, x2:107.613, y2:333.601, stops:[[0.3798,"245,251,171",0.7],[1,"255,0,4",1]] } },
  { tipX: 131, tipY: 60,  phase: 4.6, amp: 15, freq: 0.00145,
    d: "M71.3856 226.088C63.6928 276.45 89.2724 300.962 103.024 306.923C110.556 297.739 106.325 266.366 108.017 222.196C110.373 160.697 171.641 102.39 130.915 60.0215C153.681 127.503 79.0784 175.726 71.3856 226.088Z",
    grad: { x1:91.789, y1:150.672, x2:95.0684, y2:307.09, stops:[[0,"245,251,171",0.7],[0.2212,"246,224,153",0.732],[1,"255,0,4",1]] } },
  { tipX: 119, tipY: 142, phase: 5.9, amp: 12, freq: 0.0013,
    d: "M133.435 281.398C129.83 321.678 105.47 335.731 93.7409 337.723C89.6734 329.216 98.8748 305.832 105.933 271.461C115.761 223.607 79.5692 167.058 118.986 142.107C88.66 189.817 137.04 241.117 133.435 281.398Z",
    grad: { x1:131.985, y1:219.397, x2:99.842, y2:339.357, stops:[[0.3798,"245,251,171",0.7],[1,"255,0,4",1]] } },
];
for (const f of FLAMES_SVG) { f.path = new Path2D(f.d); f.lean = 0; f.vs = 1; f.flick = 1; }
function flameGrad(tctx, gd) {
  const grad = tctx.createLinearGradient(gd.x1, gd.y1, gd.x2, gd.y2);
  for (const [off, rgb, a] of gd.stops) grad.addColorStop(off, `rgba(${rgb},${a})`);
  return grad;
}
// ---- Layout / geometry --------------------------------------------------
let fireX = 0, fireY = 0, fireDispW = 0, fireDispH = 0, fireScale = 1, fireScaleY = 1;
let flameRegX = 0, flameRegY = 0, flameRegW = 0, flameRegH = 0;
const FLAME_MARGIN_FRAC = 0.7;    // side room (× flame width) so a dodging tongue never clips
function computeFireRect() {
  fireDispW = stageW * FIRE_W_FRAC;
  fireDispH = fireDispW * (FIRE_VB_H / FIRE_VB_W) * FIRE_TALL;   // taller flames, base stays put
  fireX = stageX + stageW * FIRE_CX - fireDispW / 2;
  fireY = stageY + stageH * FIRE_BASE - fireDispH;
  fireScale = fireDispW / FIRE_VB_W;            // x (and the pixel buffer width)
  fireScaleY = fireDispH / FIRE_VB_H;           // y (stretched by FIRE_TALL)
  flameRegW = fireDispW * (1 + 2 * FLAME_MARGIN_FRAC);
  flameRegX = fireX - fireDispW * FLAME_MARGIN_FRAC;
  flameRegY = fireY; flameRegH = fireDispH;
}
// Everything that shoves the flames: every networked animal, plus the mother
// cursor (the operator's own mouse) with the strongest weight of all.
function buildInfluencers() {
  const arr = [];
  for (const [, c] of cursors) if (c.alpha > 0.05) arr.push({ x: sx(c), y: sy(c), w: (1 + c.energy) * c.alpha });
  if (mother.active) arr.push({ x: mother.x, y: mother.y, w: MOTHER_PUSH });
  return arr;
}

// ======================= PIXEL FLAME (real artwork tongues, pixelated) ====
// The 5 ogenj.svg tongues themselves — each its own S-shaped lick with its own
// gradient — baked into a low-res buffer and animated by redrawing every buffer
// row with a horizontal offset that travels up the flame (flutter along the
// length) plus a base-anchored cursor-dodge. Drawn back→front so they read as
// separate overlapping layers (not one blob), then blitted big with smoothing
// OFF → animated, layered pixel-art fire. ?smoothfire = the smooth SVG version.
const PIX_ADDITIVE = params.has("addfire");   // ?addfire = additive-glow pixel fire; default = layered pixel fire
// Both modes are PIXELATED (smoothing off, integer-snapped). They differ only in blend:
// default = source-over (flat, layered tongues); ?addfire = lighten (glowing-ember look).
const FROWS = PIX_ADDITIVE ? 240 : 220;                     // buffer rows (higher = finer pixels, closer to the artwork res)
const FCOLS = Math.round(FROWS * (1 + 2 * FLAME_MARGIN_FRAC) * FIRE_VB_W / (FIRE_VB_H * FIRE_TALL));   // /FIRE_TALL → pixels stay square when stretched taller
const srcCanvas = document.createElement("canvas"); srcCanvas.width = FCOLS; srcCanvas.height = FROWS;
const srcCtx = srcCanvas.getContext("2d");
// central band that holds the flame body (the rest of the buffer width is dodge room)
const F_MARGIN_COLS = FCOLS * (FLAME_MARGIN_FRAC / (1 + 2 * FLAME_MARGIN_FRAC));
const CORE_W = FCOLS - 2 * F_MARGIN_COLS;
const FLAME_FADE_PX = 20;                                    // base fades in 0→100% over this many screen px
const SHORT_FRAC = 0.85;            // <1 = shorter tongues (less "tentacle"); scaled about the base
// Motion config — the smooth travelling "tentacle" licks (the look Beti approved).
// amp/k/spd = sway size / bends-along-length / speed; grow = how amplitude rises base→tip;
// h2,h3 = turbulence harmonics; vs* = vertical lick (breathe).
const FX = {
  amp: CORE_W * 0.050, k: 5.0, spd: 2.6, grow: (hf) => 0.25 + 0.75 * hf,
  h2: 0.4, h3: 0.2,
  vsA: 0.09, vsB: 0.05, vsKa: 2.6, vsKb: 4.5,
};
// viewBox(219×352) → buffer(FCOLS×FROWS) affine, with the vertical "shorten" baked in about the base row
const PB_AX = CORE_W / FIRE_VB_W, PB_EX = F_MARGIN_COLS;
const PB_DY = SHORT_FRAC * FROWS / FIRE_VB_H, PB_FY = FIRE_BASE_Y * (1 - SHORT_FRAC) * FROWS / FIRE_VB_H;
const PB_BASE_ROW = FROWS * FIRE_BASE_Y / FIRE_VB_H;   // buffer row of the flame base (sway/ripple pivot)
const LK_SCALE = FROWS / 92;   // keep escaping-lick size/speed constant across buffer resolutions
// paint order from the artwork (document order = back→front) so overlaps layer like the SVG does
[[0, 4], [1, 2], [2, 1], [3, 0], [4, 3]].forEach(([i, z]) => { FLAMES_SVG[i].z = z; });
const PIX_DRAW_ORDER = FLAMES_SVG.map((f) => f).sort((a, b) => a.z - b.z);
for (const f of FLAMES_SVG) {           // bake each real tongue once, at buffer resolution
  const buf = document.createElement("canvas"); buf.width = FCOLS; buf.height = FROWS;
  const bctx = buf.getContext("2d");
  bctx.setTransform(PB_AX, 0, 0, PB_DY, PB_EX, PB_FY);   // gradient coords are viewBox → mapped correctly
  bctx.fillStyle = flameGrad(bctx, f.grad);
  bctx.fill(f.path);
  f.buf = buf;
}
let flameClock = 0;
// Escaping flame-licks: slim tongues that peel off a tip, climb a graceful S-curve,
// stretch, hook over and fade. Each carries its own smooth path (no per-frame jitter)
// so the motion reads as deliberate, not random. Pose is recomputed from `age` only.
const licks = [];
const MAX_LICKS = 120, LICK_RATE = 1.8;   // escapes per second per tongue (sparse = each one reads)
function spawnLick(x, y, vx0) {
  if (licks.length >= MAX_LICKS) return;
  const dir = vx0 >= 0 ? 1 : -1;                          // hook the way the tip is flowing
  licks.push({
    ox: x, oy: y, x, y, ang: 0, a: 0,                     // birth point + current pose (set in updateLicks)
    age: 0, maxLife: 0.9 + Math.random() * 0.6,
    rise: (26 + Math.random() * 16) * LK_SCALE,           // total height climbed over its life
    drift: vx0 * 0.6,                                     // gentle lateral carry inherited from the tip
    swayAmp: (3.2 + Math.random() * 2.2) * LK_SCALE,      // width of its S
    swayCycles: 0.7 + Math.random() * 0.35,               // ~one graceful S across the climb
    phase: Math.random() * TAU,
    curl: dir * (0.45 + Math.random() * 0.4),             // how hard the tip hooks over with age
    len: (7 + Math.random() * 4) * LK_SCALE,              // flame length
    wid: (1.7 + Math.random() * 0.8) * LK_SCALE,          // flame width
  });
}
function updateLicks(dt) {
  for (let i = licks.length - 1; i >= 0; i--) {
    const k = licks[i];
    k.age += dt;
    if (k.age >= k.maxLife) { licks.splice(i, 1); continue; }
    const a = k.age / k.maxLife;                          // 0 → 1
    const w = a * k.swayCycles * TAU + k.phase;
    const sway = Math.sin(w) * k.swayAmp * a;             // grows from 0 → starts attached, then snakes
    k.x = k.ox + k.drift * a + sway;
    k.y = k.oy - k.rise * (1 - Math.pow(1 - a, 1.7));     // climbs fast then eases
    k.ang = Math.cos(w) * k.swayCycles * 0.18 + k.curl * a * a;   // lean into the sway + hook over with age
    k.a = a;
  }
}
// The exact horizontal offset of a tongue at height-fraction hf (0 base → 1 tip):
// the travelling ripple + the eased cursor-dodge lean. Shared by the renderer and
// the lick spawner so licks peel off EXACTLY where the rippled tip actually is.
function flameRowOffset(f, hf, t) {
  const wave = FX.amp * FX.grow(hf) *
    (Math.sin(hf * FX.k - t * FX.spd + f.phase) +
     FX.h2 * Math.sin(hf * FX.k * 1.8 - t * FX.spd * 1.7 + f.phase * 1.3) +
     FX.h3 * Math.sin(hf * FX.k * 3.4 - t * FX.spd * 2.7 + f.phase * 2.1));   // turbulence harmonics
  return wave + (f.lean * PB_AX) * Math.pow(hf, 1.4);
}
// Vertical "lick": each tongue stretches and shrinks about its base, like fire breathing.
function tongueVS(f, t) {
  return 1 + FX.vsA * Math.sin(t * FX.vsKa + f.phase * 1.3) + FX.vsB * Math.sin(t * FX.vsKb + f.phase * 2.1);
}
function flameTipVX(f, t) {              // sideways speed of the tip (cols/s) — licks inherit it
  return FX.amp * (
    -FX.spd * Math.cos(FX.k - t * FX.spd + f.phase) -
    FX.h2 * FX.spd * 1.7 * Math.cos(FX.k * 1.8 - t * FX.spd * 1.7 + f.phase * 1.3) -
    FX.h3 * FX.spd * 2.7 * Math.cos(FX.k * 3.4 - t * FX.spd * 2.7 + f.phase * 2.1));
}
// Motion + cursor-dodge live in updateVectorFlame (shared with ?smoothfire); here we
// only spawn/age the licks — at the tongue's real, rippled tip so they stay attached.
function updatePixelLicks(now, dt) {
  const t = now / 1000;
  for (const f of FLAMES_SVG) {
    if (Math.random() < LICK_RATE * dt) {
      const tipBX = PB_AX * f.tipX + PB_EX + flameRowOffset(f, 1, t);
      const tipSrc = PB_DY * f.tipY + PB_FY;
      const tipBY = PB_BASE_ROW - tongueVS(f, t) * (PB_BASE_ROW - tipSrc);   // follow the breathing tip
      spawnLick(tipBX, tipBY + 2 * LK_SCALE, flameTipVX(f, t));   // start just inside the tip, flowing its way
    }
  }
  updateLicks(dt);
}
function drawPixelFlame(now) {
  const t = now / 1000;
  srcCtx.setTransform(1, 0, 0, 1, 0, 0);
  srcCtx.clearRect(0, 0, FCOLS, FROWS);
  // Each real tongue, back→front, redrawn one buffer-row at a time with a
  // horizontal offset that travels up the flame → it ripples along its whole
  // length, the tip dodges cursors, and overlaps stack as distinct layers.
  srcCtx.globalCompositeOperation = PIX_ADDITIVE ? "lighten" : "source-over";
  for (const f of PIX_DRAW_ORDER) {
    srcCtx.globalAlpha = f.flick;
    const vs = tongueVS(f, t);                              // vertical lick — tongue breathes up/down
    for (let y = 0; y < FROWS; y++) {
      let hf = (PB_BASE_ROW - y) / PB_BASE_ROW;             // 0 at base → 1 at tip
      if (hf < 0) hf = 0; else if (hf > 1) hf = 1;
      const srcY = Math.round(PB_BASE_ROW - (PB_BASE_ROW - y) / vs);   // stretch the tongue vertically
      if (srcY < 0 || srcY >= FROWS) continue;
      const off = Math.round(flameRowOffset(f, hf, t));     // crisp, snapped pixels
      srcCtx.drawImage(f.buf, 0, srcY, FCOLS, 1, off, y, FCOLS, 1);
    }
  }
  srcCtx.globalAlpha = 1;
  srcCtx.globalCompositeOperation = "lighten";
  for (const k of licks) {                   // escaped licks — slim curling flame tongues
    const a = k.a;
    const fade = (a < 0.12 ? a / 0.12 : 1) * Math.pow(1 - a, 0.9);   // soft fade-in, ease-out
    if (fade <= 0.01) continue;
    const len = k.len * (0.55 + 0.9 * a);    // stretches taller as it rises
    const wid = k.wid * (1 - 0.55 * a);      // and thins toward a wisp
    const curlX = k.curl * len * 0.5 * a;    // tip hooks sideways with age
    srcCtx.save();
    srcCtx.globalAlpha = fade * 0.95;
    srcCtx.translate(k.x, k.y);
    srcCtx.rotate(k.ang);
    const g = srcCtx.createLinearGradient(0, 0, 0, -len);           // warm tail → pale-hot curling tip
    g.addColorStop(0.00, "rgba(240, 70, 20, 0)");
    g.addColorStop(0.25, "rgba(248, 120, 40, 0.85)");
    g.addColorStop(0.65, "rgba(252, 196, 110, 0.95)");
    g.addColorStop(1.00, "rgba(255, 248, 210, 1)");
    srcCtx.fillStyle = g;
    srcCtx.beginPath();
    srcCtx.moveTo(0, 0);                                            // base
    srcCtx.quadraticCurveTo(wid, -len * 0.35, curlX + wid * 0.25, -len * 0.78);   // right flank
    srcCtx.quadraticCurveTo(curlX, -len * 0.94, curlX, -len);                     // curling point
    srcCtx.quadraticCurveTo(curlX - wid * 0.25, -len * 0.78, -wid, -len * 0.35);  // left flank
    srcCtx.quadraticCurveTo(-wid * 0.4, -len * 0.12, 0, 0);                        // back to base
    srcCtx.closePath();
    srcCtx.fill();
    srcCtx.restore();
  }
  srcCtx.globalAlpha = 1;
  srcCtx.globalCompositeOperation = "source-over";
  // gradual fade-in at the very base (source), 0→100% over ~FLAME_FADE_PX so it melts into the oval
  const fadeRows = FLAME_FADE_PX * FROWS / flameRegH;
  const baseFade = srcCtx.createLinearGradient(0, PB_BASE_ROW - fadeRows, 0, PB_BASE_ROW);
  baseFade.addColorStop(0, "rgba(0,0,0,1)");   // keep fully above the zone
  baseFade.addColorStop(1, "rgba(0,0,0,0)");   // → transparent at the base
  srcCtx.globalCompositeOperation = "destination-in";
  srcCtx.fillStyle = baseFade;
  srcCtx.fillRect(0, 0, FCOLS, FROWS);
  srcCtx.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.imageSmoothingEnabled = false;          // crisp pixels in both modes
  ctx.globalCompositeOperation = "lighten";
  ctx.drawImage(srcCanvas, 0, 0, FCOLS, FROWS, flameRegX, flameRegY, flameRegW, flameRegH);
  ctx.restore();
}

// ---- Vector flame (the original SVG version, ?smoothfire) ---------------
function paintFlames(g, applyBase) {
  g.save();
  g.globalCompositeOperation = "lighten";
  for (const f of FLAMES_SVG) {
    const grad = f.gScr || (f.gScr = flameGrad(g, f.grad));
    const shear = f.lean / (FIRE_BASE_Y - f.tipY);
    g.save();
    applyBase(g);
    g.transform(1, 0, -shear, 1, shear * FIRE_BASE_Y, 0);
    g.transform(1, 0, 0, f.vs, 0, FIRE_BASE_Y * (1 - f.vs));
    g.globalAlpha = f.flick;
    g.fillStyle = grad;
    g.fill(f.path);
    g.restore();
  }
  g.restore();
}
function updateVectorFlame(now, dt) {
  const infl = buildInfluencers();
  const R = fireDispW * FLAME_R_FACTOR, ease = Math.min(1, dt * FLAME_EASE);
  for (const f of FLAMES_SVG) {
    const idle = Math.sin(now*f.freq + f.phase) * f.amp + Math.sin(now*f.freq*1.9 + f.phase*1.3) * f.amp * 0.4;
    const tipSX = fireX + f.tipX * fireScale, tipSY = fireY + f.tipY * fireScaleY;
    let push = 0;
    for (const inf of infl) { const dx = tipSX - inf.x, dy = tipSY - inf.y, d = Math.hypot(dx, dy); if (d < R && d > 0.001) push += (dx / d) * (1 - d / R) * inf.w; }
    let target = idle + push * FLAME_DODGE * DODGE_GAIN; const cap = FIRE_VB_W * 0.6;
    f.lean += (Math.max(-cap, Math.min(cap, target)) - f.lean) * ease;
    f.vs = 1 + Math.sin(now*f.freq*1.4 + f.phase*2.1) * 0.05;
    f.flick = 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(now*f.freq*3.3 + f.phase*3.7));
  }
}

// ---- Fire dispatch ------------------------------------------------------
function updateFire(now, dt) {
  flameClock = now;
  updateVectorFlame(now, dt);                // motion + cursor-dodge (both fire modes)
  if (PIXEL_FIRE) updatePixelLicks(now, dt);
}
function drawFire() {
  if (PIXEL_FIRE) drawPixelFlame(flameClock);
  else paintFlames(ctx, (g) => { g.translate(fireX, fireY); g.scale(fireScale, fireScaleY); });
}

// ---- Mother cursor + input ----------------------------------------------
const mother = { x: W / 2, y: H / 2, active: false };
window.addEventListener("mousemove", (e) => { mother.x = e.clientX; mother.y = e.clientY; mother.active = true; });
// Click on the main screen opens a frame: a roaming animal -> its scenery (it
// slides to centre); the central fire -> fire-roses; the ornament panel ->
// ornament. During a frame the canvas is covered and only the DOM arc switches,
// so we bail out. Hotspots are in 1080x1920 stage space.
const ORN_HOT = { x0: 470, x1: 607, y0: 384, y1: 864 };   // back-wall ornament panel
const FIRE_HOT = { x: 540, y: 1050, r: 230 };             // central bonfire / glow (covers the rendered flame body)
let sceneIdle = false;                                     // set each frame: no live cursors → standby arc shown
window.addEventListener("click", (e) => {
  if (!window.Frames || Frames.isActive()) return;
  const lx = (e.clientX - stageX) / stageScale, ly = (e.clientY - stageY) / stageScale;
  if (!sceneIdle) {   // when idle the roaming animals are gone (only the DOM arc) — don't match faded ghosts
    let best = null, bestD = CURSOR_H * stageScale * 0.7;
    for (const [, c] of cursors) { if (c.alpha < 0.5) continue; const d = Math.hypot(sx(c) - e.clientX, sy(c) - e.clientY); if (d <= bestD) { bestD = d; best = c; } }
    if (best) { const sp = spriteFor(best.id);                 // slide starts at the animal's centre, not the raw click point
      Frames.open(sp.frame, (sx(best) - stageX) / stageScale, (sy(best) - stageY) / stageScale, sp.src); return; }
  }
  if (lx > ORN_HOT.x0 && lx < ORN_HOT.x1 && ly > ORN_HOT.y0 && ly < ORN_HOT.y1) { Frames.open("ornament", lx, ly, null); return; }
  if (Math.hypot(lx - FIRE_HOT.x, ly - FIRE_HOT.y) < FIRE_HOT.r) { Frames.open("fire-roses", lx, ly, null); return; }
});
function drawMotherCursor(now) {
  if (!mother.active) return;
  const r = 10 + Math.sin(now / 400) * 1.5;
  ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(mother.x, mother.y, r, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(mother.x, mother.y, 2, 0, Math.PI*2); ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fill();
  ctx.restore();
}

// ---- WebSocket (auto-reconnect) -----------------------------------------
let ws = null, connected = false;
let lastConnectedAt = performance.now();   // page load is the baseline
function connect() {
  ws = new WebSocket(`ws://${RELAY}`);
  ws.onopen = () => { connected = true; lastConnectedAt = performance.now(); ws.send(JSON.stringify({ type: "hello", role: "viewer" })); };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === "leave") { const c = cursors.get(m.id); if (c) c.lastSeen = 0; return; }
    if (typeof m.x === "number" && typeof m.y === "number") upsert(m.id, m.x, m.y);
  };
  ws.onclose = () => { connected = false; setTimeout(connect, 1500); };
  ws.onerror = () => { try { ws.close(); } catch {} };
}
connect();

// Watchdog: the socket above auto-reconnects every 1.5s, so a relay restart heals
// itself with no reload. This only fires if the connection stays dead for a long
// stretch (a wedged tab / stuck socket) — reload once to recover. ?nowatchdog disables it.
const WATCHDOG_MS = 120000;
if (!params.has("nowatchdog")) setInterval(() => {
  if (!connected && performance.now() - lastConnectedAt > WATCHDOG_MS) location.reload();
}, 10000);

// ---- Render -------------------------------------------------------------
function drawBackground() {
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "#07070b"; ctx.fillRect(0, 0, W, H);
  if (bgImg) ctx.drawImage(bgImg, stageX, stageY, stageW, stageH);
}
function drawCursor(c, now) {
  const px = sx(c), py = sy(c), sprite = spriteFor(c.id);
  const h = CURSOR_H * stageScale, w = h * sprite.aspect;
  ctx.save(); ctx.globalAlpha = c.alpha;          // clean animals — no glow halo / special fx
  if (sprite.img) ctx.drawImage(sprite.img, px - w/2, py - h/2, w, h);
  else { ctx.beginPath(); ctx.arc(px, py, h/2, 0, Math.PI*2); ctx.fillStyle = colorFor(c.id); ctx.fill(); }
  ctx.restore();
  if (SHOW_LABELS) { ctx.globalAlpha = c.alpha; ctx.fillStyle = "#fff"; ctx.font = "12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.fillText(`${c.id}·${c.clicks}`, px, py + h/2 + 14); ctx.globalAlpha = 1; }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  const k = 1 - Math.pow(1 - SMOOTHING, dt * 60);

  for (const [id, c] of cursors) {
    c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k;
    c.energy = Math.max(0, c.energy - dt * ENERGY_DECAY);
    const age = now - c.lastSeen;
    if (age > FADE_AFTER_MS) { c.alpha = Math.max(0, 1 - (age - FADE_AFTER_MS) / FADE_DUR_MS); if (c.alpha <= 0) { cursors.delete(id); continue; } }
    else c.alpha = Math.min(1, c.alpha + dt * 4);
  }
  updateParticles(dt);
  updateBolts(dt);
  maybeAmbient(now);

  computeStage();
  const frameActive = !!(window.Frames && Frames.isActive());
  let idle = false;
  if (!frameActive) {
    // The landing scene. When no one is moving a cursor (idle) the roaming
    // animals give way to the standby arc (drawn in the DOM by frames.js).
    drawBackground();
    if (textboxImg) ctx.drawImage(textboxImg, stageX, stageY, stageW, stageH);   // text card, sent to back (just over the bg)
    let live = 0; for (const [, c] of cursors) if (c.alpha > 0.5) live++;
    idle = live === 0;
    if (SHOW_FIRE) { computeFireRect(); updateFire(now, dt); drawFire(); }
    if (!idle) for (const [, c] of cursors) drawCursor(c, now);
    // Overall-frame stack (textbox was already drawn at the back, just over the bg): plants → paper.
    if (spredajImg) ctx.drawImage(spredajImg, stageX, stageY, stageW, stageH);   // ornamental frame (plants) in front
    if (paperImg) { ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.6; ctx.drawImage(paperImg, stageX, stageY, stageW, stageH); ctx.restore(); }   // paper texture over everything
    drawMotherCursor(now);
  }
  // (when a frame is active the DOM overlay covers the canvas, so we skip drawing it)
  sceneIdle = idle;
  if (window.Frames) Frames.tick({ x: stageX, y: stageY, w: stageW, h: stageH, scale: stageScale }, idle);

  // publish state for the WebGL glow layer
  window.KRES = {
    stage: { x: stageX, y: stageY, w: stageW, h: stageH, scale: stageScale },
    fire: { x: fireX, y: fireY, w: fireDispW, h: fireDispH, on: SHOW_FIRE },
    cursors, particles, bolts, ARC_RANGE: (SHOW_LIGHTNING ? ARC_RANGE : 0) * stageScale,
  };

  hud.textContent = `relay ${RELAY}  ${connected ? "● live" : "○ reconnecting"}  cursors ${cursors.size}  fx ${particles.length}  ⚡${bolts.length}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
