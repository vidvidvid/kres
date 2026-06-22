// kres 2026 — frame system (classic script, loaded before viewer.js).
// When an animal / the fire / the ornament panel is clicked on the main screen,
// a full-screen "scenery" frame takes over for 30s: a per-frame background, a
// hue-cycling radial glow, a floating element (or the pony video) shown through
// the shared ornamental window (spredaj.png), then the difference columns, a
// "plus darker" wash and the pulsing textbox.  Clicking another animal swaps it.
// After 30s it resets to the landing.  All geometry is in true 1080x1920 stage
// pixels inside #kf-fit, which viewer.js scales/positions onto the letterboxed stage.
(function () {
  "use strict";

  const STAGE_W = 1080, STAGE_H = 1920;
  const WIN = { cx: 540, cy: 1156 };          // centre of spredaj.png's window opening (0.500, 0.602)
  const FIT = { w: 820, h: 740 };             // element fit box (window opening, slightly inset)
  const RAD = { w: 920, h: 1200 };            // radial-glow box (tall vertical bloom)
  const RESET_MS = 30000;                     // a frame lasts 30s, then back to the landing
  const FV = "?v=2026-06-22";                 // cache-bust for swapped art

  const A = (p) => "assets/" + p + FV;        // asset url + cache-bust
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- the 6 animals (roaming + the standby/switcher arc) ------------------
  // key = frame it opens; src = the small black silhouette; arc = top-arc slot (fraction of stage).
  const ANIMALS = [
    { key: "bambi",         src: "zivalice/bambi.svg",         ax: 0.12, ay: 0.050 },
    { key: "spiral-cat",    src: "zivalice/spiral-cat.svg",    ax: 0.27, ay: 0.068 },
    { key: "nia",           src: "zivalice/nia.svg",           ax: 0.42, ay: 0.082 },
    { key: "deer",          src: "zivalice/deer.svg",          ax: 0.58, ay: 0.082 },
    { key: "spiral-kitten", src: "zivalice/spiral-kitten.svg", ax: 0.73, ay: 0.068 },
    { key: "pony",          src: "zivalice/pony-lullaby.svg",  ax: 0.88, ay: 0.050 },
  ];

  // soft warm glow built from each radial's stop colours (white core -> mids -> clear)
  const glow = (c1, c2, c3, mid) =>
    `radial-gradient(ellipse 44% 54% at 50% 50%,` +
    ` rgba(255,255,255,0.95) 0%, ${c1} 12%, ${c2} 24%, ${c3} 36%,` +
    ` rgba(255,255,255,${mid}) 54%, rgba(249,249,249,0) 82%)`;

  // ---- per-frame config ---------------------------------------------------
  // element: kind img|inline|video; blend screen|multiply; anim float|rose|none;
  // iw/ih = element intrinsic size (for aspect-correct fit); scale tunes its size.
  const FRAMES = {
    "fire-roses": { bg: "frames/fire-roses/ozadje.png", radial: glow("#795882", "#1C3E3E", "#5C8070", 0.7),
      element: { kind: "img", src: "frames/fire-roses/element.svg", blend: "screen", anim: "rose", iw: 338, ih: 540, scale: 0.95 } },
    "ornament": { bg: "frames/ornament/ozadje.png", radial: glow("#795882", "#4D3A13", "#7F7B52", 0.5),
      element: { kind: "inline", src: "frames/ornament/element.svg", blend: "screen", anim: "none", iw: 465, ih: 569, scale: 0.62 } },
    "spiral-cat": { bg: "frames/spiral-cat/ozadje.png", radial: glow("#795882", "#1C3E3E", "#477788", 0.7),
      element: { kind: "img", src: "frames/spiral-cat/element.svg", blend: "multiply", anim: "float", iw: 406, ih: 338, scale: 0.9 } },
    "bambi": { bg: "frames/bambi/ozadje.png", radial: glow("#795882", "#4D3A13", "#7F7B52", 0.4),
      element: { kind: "img", src: "frames/bambi/element.svg", blend: "screen", anim: "float", iw: 352, ih: 352, scale: 0.85 } },
    "pony": { bg: "frames/pony/ozadje.png", radial: glow("#795882", "#4D3A13", "#7F7B52", 0.35),
      element: { kind: "video", src: "frames/pony/video.mp4", blend: "pluslighter", anim: "none", boxW: 840, boxH: 766 } },
    "spiral-kitten": { bg: "frames/spiral-kitten/ozadje.png", radial: glow("#795882", "#3F2B11", "#766D62", 0.4),
      element: { kind: "img", src: "frames/spiral-kitten/element.svg", blend: "screen", anim: "float", iw: 195, ih: 224, scale: 0.7 } },
    "nia": { bg: "frames/nia/ozadje.png", radial: glow("#795882", "#4D3A13", "#7F7B52", 0.4),
      element: { kind: "img", src: "frames/nia/element.svg", blend: "screen", anim: "float", iw: 249, ih: 224, scale: 0.7 } },
    "deer": { bg: "frames/deer/ozadje.png", radial: glow("#795882", "#BFB1E8", "#556272", 0.4),
      element: { kind: "img", src: "frames/deer/element.svg", blend: "screen", anim: "float", iw: 263, ih: 242, scale: 0.7 } },
  };

  function fitBox(iw, ih, scale) {
    const a = iw / ih;
    let w, h;
    if (a >= FIT.w / FIT.h) { w = FIT.w; h = FIT.w / a; } else { h = FIT.h; w = FIT.h * a; }
    return { w: w * scale, h: h * scale };
  }

  // ---- DOM scaffold -------------------------------------------------------
  const root = document.getElementById("kres-frames");
  const fit = document.createElement("div"); fit.id = "kf-fit";
  const frame = document.createElement("div"); frame.id = "kf-frame";
  const arc = document.createElement("div"); arc.id = "kf-arc";
  fit.appendChild(frame); fit.appendChild(arc); root.appendChild(fit);

  // state
  let active = null;          // current frame key, or null on the landing
  let resetTimer = 0;
  let ornamentTimer = 0;
  let ponyRAF = 0, ponyVideo = null;
  const slides = [];          // in-flight slide-to-centre sprites (cleared on swap/close)

  // ---- the top arc (6 animals): standby display + in-frame switcher --------
  ANIMALS.forEach((an) => {
    const d = document.createElement("div");
    d.className = "kf-arc-animal";
    d.style.left = (an.ax * STAGE_W) + "px";
    d.style.top = (an.ay * STAGE_H) + "px";
    d.style.width = "140px"; d.style.height = "120px";
    d.style.setProperty("--bob-dur", rnd(3.2, 5).toFixed(2) + "s");
    const img = document.createElement("img"); img.src = A(an.src); d.appendChild(img);
    d.addEventListener("click", (e) => {
      e.stopPropagation();                                   // don't let viewer.js also handle it
      open(an.key, an.ax * STAGE_W, an.ay * STAGE_H, A(an.src));
    });
    arc.appendChild(d);
  });

  // ---- open / close -------------------------------------------------------
  function open(key, fromX, fromY, animalSrc) {
    const cfg = FRAMES[key];
    if (!cfg) return;
    teardownElement();                       // stop any pony loop / ornament waves from the previous frame
    frame.innerHTML = "";
    active = key;

    // 1) background
    frame.appendChild(layer("kf-bg", cfg.bg));
    // 2) hue-cycling radial glow
    if (cfg.radial) {
      const g = document.createElement("div");
      g.className = "kf-radial";
      g.style.width = RAD.w + "px"; g.style.height = RAD.h + "px";
      g.style.background = cfg.radial;
      frame.appendChild(g);
    }
    // 3) element
    buildElement(cfg.element);
    // 4) ornamental window frame, 5) difference columns, 6) plus-darker wash, 7) textbox
    frame.appendChild(layer("kf-spredaj", "spredaj.png"));
    frame.appendChild(layer("kf-difference", "difference.png"));
    frame.appendChild(layer("kf-plusdarker", "plus-darker.png"));
    frame.appendChild(layer("kf-textbox", "textbox.png"));

    frame.style.display = "block";
    void frame.offsetWidth;                  // reflow so the opacity transition runs
    frame.classList.add("kf-on");
    document.body.style.cursor = "default";  // let a mouse operator see the pointer to aim at the switcher arc

    if (animalSrc) slideIn(animalSrc, fromX, fromY);

    clearTimeout(resetTimer);
    resetTimer = setTimeout(close, RESET_MS);
  }

  function close() {
    clearTimeout(resetTimer); resetTimer = 0;
    active = null;
    frame.classList.remove("kf-on");
    document.body.style.cursor = "";         // back to the clean hidden cursor on the landing
    setTimeout(() => { if (!active) { frame.style.display = "none"; frame.innerHTML = ""; teardownElement(); } }, 520);
  }

  function teardownElement() {
    if (ornamentTimer) { clearInterval(ornamentTimer); ornamentTimer = 0; }
    if (ponyRAF) { cancelAnimationFrame(ponyRAF); ponyRAF = 0; }
    if (ponyVideo) { try { ponyVideo.pause(); } catch (e) {} ponyVideo = null; }
    while (slides.length) { const s = slides.pop(); s.getAnimations().forEach((a) => a.cancel()); s.remove(); }
  }

  function layer(cls, asset) {
    const d = document.createElement("div");
    d.className = "kf-layer " + cls;
    d.style.backgroundImage = "url('" + A(asset) + "')";
    return d;
  }

  // ---- the floating element ----------------------------------------------
  function buildElement(el) {
    const wrap = document.createElement("div");
    // blend lives on the wrapper (a direct child of #kf-frame) so it composites
    // against the bg+radial below it, not the empty backdrop of a nested context.
    wrap.className = "kf-elem-wrap kf-" + el.blend;
    const box = el.kind === "video" ? { w: el.boxW, h: el.boxH } : fitBox(el.iw, el.ih, el.scale);
    wrap.style.width = box.w + "px"; wrap.style.height = box.h + "px";

    if (el.kind === "img") {
      const img = document.createElement("img");
      img.src = A(el.src);
      img.className = "kf-elem kf-img " + (el.anim === "rose" ? "kf-rose" : "kf-float");
      wrap.appendChild(img);

    } else if (el.kind === "inline") {
      ornamentInline(wrap, el);

    } else if (el.kind === "video") {
      ponyVideoElement(wrap, el);
    }
    frame.appendChild(wrap);
  }

  // Ornament: inline the SVG so each "pixel" cell can shimmer/reconfigure here and
  // there. We animate OPACITY (not transform) — the symbol's geometry never moves,
  // so it is ALWAYS the exact same symbol, and we avoid clobbering the matrix()
  // transforms that place the mirrored half of the cells (animating `transform`
  // would collapse that half onto the origin).
  function ornamentInline(wrap, el) {
    fetch(A(el.src)).then((r) => r.text()).then((svgText) => {
      if (active !== "ornament" || !wrap.isConnected) return;   // bail if swapped/closed before the fetch resolved
      wrap.innerHTML = svgText;
      const svg = wrap.querySelector("svg");
      if (!svg) return;
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.style.width = "100%"; svg.style.height = "100%";
      svg.classList.add("kf-elem", "kf-fade-in");   // blend is on the wrapper
      const cells = Array.from(svg.querySelectorAll("rect, path"));   // both rects and path cells
      const wave = () => {
        if (active !== "ornament") { clearInterval(ornamentTimer); ornamentTimer = 0; return; }
        const n = Math.min(cells.length, 64);
        for (let i = 0; i < n; i++) {
          const c = cells[(Math.random() * cells.length) | 0];
          c.animate([{ opacity: 1 }, { opacity: rnd(0.08, 0.35) }, { opacity: 1 }],   // wink out & back — points reconfigure, positions stay
            { duration: rnd(900, 1700), delay: rnd(0, 280), easing: "ease-in-out" });
        }
      };
      if (ornamentTimer) { clearInterval(ornamentTimer); ornamentTimer = 0; }   // belt: never orphan a prior interval
      wave();
      ornamentTimer = setInterval(wave, 1500);
    }).catch(() => {});
  }

  // Pony: blend the video ADDITIVELY (plus-lighter) over the scene by drawing it to
  // a <canvas> — Chromium won't reliably honour mix-blend-mode on a <video> element,
  // but it does on a <canvas>. The source is 1620x1080 landscape; object-fit:cover
  // fills the 840x766 window (the spredaj frame masks the overflow).
  function ponyVideoElement(wrap, el) {
    const v = document.createElement("video");
    v.src = A(el.src); v.muted = true; v.loop = true; v.autoplay = true;
    v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto";
    v.style.cssText = "position:absolute;width:2px;height:2px;opacity:0;pointer-events:none;";
    const cv = document.createElement("canvas");
    cv.className = "kf-elem kf-fade-in";            // blend is on the wrapper
    cv.style.width = "100%"; cv.style.height = "100%";
    cv.style.objectFit = "cover";                  // fill the window opening, crop overflow
    cv.width = 840; cv.height = 766;
    wrap.appendChild(v); wrap.appendChild(cv);
    const cx = cv.getContext("2d");
    ponyVideo = v;
    const draw = () => {
      if (active !== "pony") return;
      if (v.videoWidth) {
        if (cv.width !== v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; }
        cx.drawImage(v, 0, 0, cv.width, cv.height);
      }
      ponyRAF = requestAnimationFrame(draw);
    };
    v.play().catch(() => {});                  // succeeds because the video is muted (muted autoplay is always allowed)
    ponyRAF = requestAnimationFrame(draw);
  }

  // ---- the slide-to-centre sprite ----------------------------------------
  function slideIn(srcUrl, fromX, fromY) {
    const s = document.createElement("div");
    s.className = "kf-slide";
    s.style.width = "150px"; s.style.height = "130px";
    const img = document.createElement("img"); img.src = srcUrl; s.appendChild(img);
    s.style.transform = `translate(${fromX}px,${fromY}px) translate(-50%,-50%) scale(.9)`;
    fit.appendChild(s);
    slides.push(s);
    const anim = s.animate(
      [{ transform: `translate(${fromX}px,${fromY}px) translate(-50%,-50%) scale(.9)`, opacity: 1 },
       { transform: `translate(${WIN.cx}px,${WIN.cy}px) translate(-50%,-50%) scale(2.4)`, opacity: 0 }],
      { duration: 680, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
    anim.onfinish = () => { const i = slides.indexOf(s); if (i >= 0) slides.splice(i, 1); s.remove(); };
  }

  // ---- layout + arc visibility (called every frame by viewer.js) ----------
  function tick(stage, idle) {
    if (stage) fit.style.transform = `translate(${stage.x}px,${stage.y}px) scale(${stage.scale})`;
    const show = !!active || !!idle;           // arc = in-frame switcher OR landing standby
    arc.classList.toggle("kf-on", show);
  }

  window.Frames = {
    open: open,
    close: close,
    isActive: () => active !== null,
    activeKey: () => active,
    tick: tick,
    ANIMAL_KEYS: ANIMALS.map((a) => a.key),
    ANIMALS: ANIMALS,
  };
})();
