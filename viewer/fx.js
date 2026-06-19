// Cursor Canvas — fx.js: the WebGL glow layer (three.js + bloom).
// Reads window.KRES (published by viewer.js) every frame and renders the
// "super modern" half: an energy web + lightning between animals, and the click
// bursts as glowing additive points — all bloomed. Rendered bright-on-black;
// the #fx canvas uses CSS `mix-blend-mode: screen`, so black is invisible and
// the glow adds over the crisp pixel scene below.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const canvas = document.getElementById("fx");
let W = window.innerWidth, H = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);              // glow layer; crisp DPI not needed
renderer.setClearColor(0x000000, 1);    // opaque black (CSS screen-blend hides it)
renderer.setSize(W, H);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, W, 0, H, -1, 1);  // screen px, y down

// --- line system: energy web + lightning bolts ---------------------------
const MAX_LINE_V = 8000;
const linePos = new Float32Array(MAX_LINE_V * 3);
const lineCol = new Float32Array(MAX_LINE_V * 3);
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
lineGeo.setAttribute("color", new THREE.BufferAttribute(lineCol, 3).setUsage(THREE.DynamicDrawUsage));
const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
const lineSeg = new THREE.LineSegments(lineGeo, lineMat);
lineSeg.frustumCulled = false;
scene.add(lineSeg);
let lineCount = 0;
function pushSeg(x1, y1, x2, y2, r, g, b) {
  if (lineCount + 2 > MAX_LINE_V) return;
  let o = lineCount * 3;
  linePos[o] = x1; linePos[o+1] = y1; linePos[o+2] = 0; lineCol[o] = r; lineCol[o+1] = g; lineCol[o+2] = b;
  o += 3;
  linePos[o] = x2; linePos[o+1] = y2; linePos[o+2] = 0; lineCol[o] = r; lineCol[o+1] = g; lineCol[o+2] = b;
  lineCount += 2;
}

// --- point system: glowing particles -------------------------------------
const MAX_PTS = 1800;
const ptPos = new Float32Array(MAX_PTS * 3);
const ptCol = new Float32Array(MAX_PTS * 3);
const ptSize = new Float32Array(MAX_PTS);
const ptGeo = new THREE.BufferGeometry();
ptGeo.setAttribute("position", new THREE.BufferAttribute(ptPos, 3).setUsage(THREE.DynamicDrawUsage));
ptGeo.setAttribute("aColor", new THREE.BufferAttribute(ptCol, 3).setUsage(THREE.DynamicDrawUsage));
ptGeo.setAttribute("aSize", new THREE.BufferAttribute(ptSize, 1).setUsage(THREE.DynamicDrawUsage));
const ptMat = new THREE.ShaderMaterial({
  uniforms: { uPR: { value: 1 } },
  vertexShader: `
    attribute float aSize; attribute vec3 aColor; varying vec3 vColor; uniform float uPR;
    void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uPR; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `
    precision mediump float; varying vec3 vColor;
    void main(){ vec2 d = gl_PointCoord - vec2(0.5); float a = smoothstep(0.5, 0.0, length(d)); if (a <= 0.0) discard; gl_FragColor = vec4(vColor, a); }`,
  transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
});
const points = new THREE.Points(ptGeo, ptMat);
points.frustumCulled = false;
scene.add(points);
let ptCount = 0;
function pushPoint(x, y, size, r, g, b) {
  if (ptCount >= MAX_PTS) return;
  const o = ptCount * 3;
  ptPos[o] = x; ptPos[o+1] = y; ptPos[o+2] = 0;
  ptCol[o] = r; ptCol[o+1] = g; ptCol[o+2] = b;
  ptSize[ptCount] = size;
  ptCount++;
}

// --- bloom ---------------------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.2, 0.6, 0.0);  // strength, radius, threshold
composer.addPass(bloom);
composer.addPass(new OutputPass());

function onResize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H);
  composer.setSize(W, H);
  bloom.resolution.set(W, H);
  camera.right = W; camera.bottom = H; camera.updateProjectionMatrix();
}
window.addEventListener("resize", onResize);

// --- lightning path (midpoint displacement, regenerated each frame) ------
function drawBolt(b) {
  const dx = b.x2 - b.x1, dy = b.y2 - b.y1, baseLen = Math.hypot(dx, dy) || 1;
  let pts = [{ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }];
  let off = baseLen * 0.16;
  for (let g = 0; g < 5; g++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      const lx = c.x - a.x, ly = c.y - a.y, l = Math.hypot(lx, ly) || 1;
      const o = (Math.random() * 2 - 1) * off;
      np.push({ x: mx + (-ly / l) * o, y: my + (lx / l) * o }, c);
    }
    pts = np; off *= 0.5;
  }
  const fade = Math.max(0, b.life / b.max), k = fade * b.bright;
  const r = Math.min(1, b.rgb[0] * k), g = Math.min(1, b.rgb[1] * k), bl = Math.min(1, b.rgb[2] * k);
  for (let i = 0; i < pts.length - 1; i++) pushSeg(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, r, g, bl);
}

// --- frame ---------------------------------------------------------------
function frame() {
  requestAnimationFrame(frame);
  lineCount = 0; ptCount = 0;
  const K = window.KRES;
  if (K) {
    // energy web between nearby animals (cool cyan, brighter when charged)
    const arr = [];
    for (const [, c] of K.cursors) if (c.alpha > 0.3) arr.push(c);
    const R = K.ARC_RANGE;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      const ax = K.stage.x + a.x * K.stage.w, ay = K.stage.y + a.y * K.stage.h;
      const bx = K.stage.x + b.x * K.stage.w, by = K.stage.y + b.y * K.stage.h;
      const d = Math.hypot(ax - bx, ay - by);
      if (d < R) {
        const prox = 1 - d / R, e = a.energy + b.energy;
        const br = Math.min(1, prox * (0.12 + 0.55 * e));
        if (br > 0.01) pushSeg(ax, ay, bx, by, br * 0.4, br * 0.75, br);
      }
    }
    // lightning bolts (click zaps + intermittent arcs)
    for (const b of K.bolts) drawBolt(b);
    // glowing particles
    for (const p of K.particles) {
      const a = Math.max(0, Math.min(1, p.life / p.max)) * 1.3;
      pushPoint(p.x, p.y, p.size, Math.min(1, p.r / 255 * a), Math.min(1, p.g / 255 * a), Math.min(1, p.b / 255 * a));
    }
  }
  lineGeo.setDrawRange(0, lineCount);
  lineGeo.attributes.position.needsUpdate = true;
  lineGeo.attributes.color.needsUpdate = true;
  ptGeo.setDrawRange(0, ptCount);
  ptGeo.attributes.position.needsUpdate = true;
  ptGeo.attributes.aColor.needsUpdate = true;
  ptGeo.attributes.aSize.needsUpdate = true;
  composer.render();
}
frame();
