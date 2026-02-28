/* ============================================================
   script.js — Progressive Competitive Class | Avijit Samanta
   ============================================================
   PROJECT  : PCC Website — West Bengal Premier Coaching
   AUTHOR   : Avijit Samanta
   VERSION  : v6

   HOW THIS FILE IS LINKED
   ───────────────────────
   This file is loaded at the bottom of <body> in index.html via:
       <script src="script.js"></script>
   Placing it at the bottom ensures all DOM elements are available
   before any selectors run.

   EXTERNAL DEPENDENCIES (loaded before this file in index.html)
   ──────────────────────────────────────────────────────────────
   • GSAP 3.12.5      — https://cdnjs.cloudflare.com  → Hero entrance animation
   • ScrollTrigger    — GSAP plugin                   → Scroll-based triggers
   • Three.js r128    — https://cdnjs.cloudflare.com  → WebGL hero particle field

   SCRIPT SECTIONS (scroll to each)
   ─────────────────────────────────
   §1  WebGL Detection & Feature Gating
   §2  Three.js WebGL Hero System (particles + torus knots)
   §3  Torus SVG Distortion (hero title refraction effect)
   §4  Peek-a-boo Overlay (cursor-following hole in carousel frosting)
   §5  CSS Fallback Particle System (when WebGL unavailable)
   §6  Hero 3D CSS Carousel (slides + dots + swipe)
   §7  About 3D Depth Slider (drag-to-advance card stack)
   §8  Custom Cursor (dot + ring with hover scaling)
   §9  PDF Glow Follow (section-scoped mouse glow)
   §10 Navbar Scroll Behaviour
   §11 Mobile Menu (open / close)
   §12 Intersection Observer Reveals (scroll reveal animations)
   §13 Animated Counters (stats band numbers)
   §14 Hero Floating Counters (hfc-1, hfc-2 float cards)
   §15 GSAP Hero Entrance Animation
   §16 Ripple Effect (button click feedback)
   §17 Smooth Scroll (anchor links)
   §18 Testimonial Slider + Touch Swipe
   §19 Star Picker (review form rating)
   §20 Submit Review (review form validation + success)
   §21 Contact Form Submit (hSubmit)
   §22 Boot Sequence — WebGL + Torus + Peekaboo init
   §23 Section Particle System (Canvas 2D, reusable per section)
   ============================================================ */


/* ============================================================
   §1  WEBGL DETECTION & FEATURE GATING
   ─────────────────────────────────────
   HAS_WEBGL       — true if browser supports WebGL rendering context.
   PREFERS_REDUCED — true if user has "prefer reduced motion" OS setting.
   Both are used as guards throughout to skip heavy animations gracefully.
   ============================================================ */
const HAS_WEBGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch(e) { return false; }
})();

const PREFERS_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


/* ============================================================
   §2  THREE.JS WEBGL HERO SYSTEM
   ─────────────────────────────────
   Renders an organic particle field + 3 wireframe TorusKnot meshes
   inside the #hero section canvas (#hero-threejs-canvas).

   Features:
   • 220 custom GLSL shader particles with sinusoidal drift
   • Mouse parallax (±8° X/Y camera tilt)
   • IntersectionObserver: disposes renderer when hero leaves viewport
   • Scoped entirely to #hero — zero overhead on other sections

   CSS connection:
   • #hero-threejs-canvas          (see style.css §22)
   • body.webgl-active             hides fallback canvas
   • body.webgl-fallback           falls back to CSS particle canvas
   ============================================================ */
let heroThreeScene = null;

function initHeroWebGL() {
  if (!window.THREE || !HAS_WEBGL || PREFERS_REDUCED) {
    /* WebGL unavailable — use CSS 2D canvas fallback (§5) */
    document.body.classList.add('webgl-fallback');
    initFallbackParticles();
    return;
  }
  document.body.classList.add('webgl-active');

  const heroSection = document.getElementById('hero');
  const canvas = document.getElementById('hero-threejs-canvas');
  if (!canvas || !heroSection) return;

  /* ── Renderer ── */
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);

  /* ── Scene & Camera ── */
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.z = 28;

  /* ── Organic particle shader ── */
  const PARTICLE_COUNT = 220;
  const pPositions = new Float32Array(PARTICLE_COUNT * 3);
  const pSpeeds    = new Float32Array(PARTICLE_COUNT);
  const pSizes     = new Float32Array(PARTICLE_COUNT);
  const pPhases    = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    pPositions[i*3]   = (Math.random() - .5) * 60;
    pPositions[i*3+1] = (Math.random() - .5) * 40;
    pPositions[i*3+2] = (Math.random() - .5) * 30;
    pSpeeds[i]  = .3 + Math.random() * .7;
    pSizes[i]   = 1.5 + Math.random() * 2.5;
    pPhases[i]  = Math.random() * Math.PI * 2;
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position',  new THREE.BufferAttribute(pPositions.slice(), 3));
  pGeo.setAttribute('aSpeed',    new THREE.BufferAttribute(pSpeeds, 1));
  pGeo.setAttribute('aSize',     new THREE.BufferAttribute(pSizes, 1));
  pGeo.setAttribute('aPhase',    new THREE.BufferAttribute(pPhases, 1));

  /* Custom ShaderMaterial — GLSL vertex + fragment shaders */
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime:   { value: 0 },
      uMouse:  { value: new THREE.Vector2(.5, .5) },
      uColor1: { value: new THREE.Color(0x0d9488) }, /* --teal */
      uColor2: { value: new THREE.Color(0x5eead4) }, /* --teal-light */
    },
    vertexShader: `
      attribute float aSpeed;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform vec2  uMouse;
      varying float vOpacity;
      varying vec3  vColor;
      uniform vec3  uColor1;
      uniform vec3  uColor2;

      void main(){
        vec3 pos = position;

        /* Organic sinusoidal drift per-particle */
        float t = uTime * aSpeed;
        pos.x += sin(t * 0.7 + aPhase) * 1.8;
        pos.y += cos(t * 0.5 + aPhase * 1.3) * 1.4;
        pos.z += sin(t * 0.4 + aPhase * 0.8) * 1.2;

        /* Subtle mouse parallax — shifts entire field */
        pos.x += (uMouse.x - .5) * 4.0;
        pos.y += (uMouse.y - .5) * -3.0;

        vOpacity = 0.12 + 0.38 * abs(sin(t * 0.3 + aPhase));
        vColor = mix(uColor1, uColor2, abs(sin(aPhase)));

        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = aSize * (280.0 / -mvPos.z);
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      varying vec3  vColor;

      void main(){
        /* Soft circular point — discard corners of gl_PointCoord square */
        vec2 xy = gl_PointCoord * 2.0 - 1.0;
        float r  = dot(xy, xy);
        if(r > 1.0) discard;
        float alpha = (1.0 - r) * vOpacity;
        gl_FragColor = vec4(vColor, alpha);
      }
    `
  });

  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  /* ── Floating TorusKnot wireframe geometries (very subtle depth) ── */
  const torusGeos = [
    new THREE.TorusKnotGeometry(5, 1.4, 80, 14, 2, 3),
    new THREE.TorusKnotGeometry(3.5, .9, 60, 10, 3, 5),
    new THREE.TorusKnotGeometry(2.5, .6, 50, 8, 2, 5),
  ];
  const torusColors = [0x0d9488, 0x5eead4, 0xf97316];
  const torusMeshes = torusGeos.map((geo, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: torusColors[i], wireframe: true,
      transparent: true,
      opacity: i === 0 ? .055 : i === 1 ? .035 : .025,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set([-10, 12, -5][i], [4, -6, 8][i], [-8, -4, -12][i]);
    mesh.scale.setScalar([1, .7, .5][i]);
    scene.add(mesh);
    return mesh;
  });

  /* ── Mouse tracking (smoothed in tick()) ── */
  let mouseX = .5, mouseY = .5, targetX = .5, targetY = .5;
  heroSection.addEventListener('mousemove', e => {
    const r = heroSection.getBoundingClientRect();
    targetX = (e.clientX - r.left) / r.width;
    targetY = (e.clientY - r.top)  / r.height;
  }, { passive: true });

  /* ── Resize handler — keeps canvas in sync with hero size ── */
  function resize() {
    const W = heroSection.offsetWidth;
    const H = heroSection.offsetHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });
  canvas.classList.add('loaded'); /* triggers opacity transition in CSS */

  /* ── Render loop ── */
  let animId = null, running = true, t = 0;

  function tick() {
    if (!running) return;
    animId = requestAnimationFrame(tick);
    t += .008;

    /* Lerp mouse for smooth camera drift */
    mouseX += (targetX - mouseX) * .04;
    mouseY += (targetY - mouseY) * .04;

    /* Update shader uniforms */
    pMat.uniforms.uTime.value  = t;
    pMat.uniforms.uMouse.value.set(mouseX, mouseY);

    /* Rotate torus knots at different speeds */
    torusMeshes.forEach((m, i) => {
      m.rotation.x += (.0008 + i * .0004);
      m.rotation.y += (.0012 + i * .0003);
      m.rotation.z += (.0005 + i * .0002);
    });

    /* Gentle camera parallax based on mouse position */
    camera.position.x += ((mouseX - .5) * 3 - camera.position.x) * .03;
    camera.position.y += ((mouseY - .5) * -2 - camera.position.y) * .03;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  /* ── Clean disposal (called when hero leaves viewport) ── */
  function dispose() {
    running = false;
    cancelAnimationFrame(animId);
    pGeo.dispose(); pMat.dispose();
    torusGeos.forEach(g => g.dispose());
    torusMeshes.forEach(m => m.material.dispose());
    renderer.dispose();
    canvas.classList.remove('loaded');
  }

  function restart() { running = true; tick(); }

  heroThreeScene = { dispose, restart, running: true };

  /* ── IntersectionObserver: pause/resume when hero scrolls in/out ── */
  const heroIO = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (!running) { running = true; tick(); }
      } else {
        running = false;
        cancelAnimationFrame(animId);
      }
    });
  }, { threshold: 0 });
  heroIO.observe(heroSection);

  tick();
}


/* ============================================================
   §3  TORUS SVG DISTORTION — HERO TITLE
   ─────────────────────────────────────────
   Uses the inline SVG filter (#torus-hero-filter in index.html)
   to apply a subtle displacement/refraction effect on the hero title.
   The feDisplacementMap scale and feTurbulence baseFrequency are
   updated every frame based on mouse distance from the torus "ring".

   CSS connection:
   • .torus-filter-active .hero-title { filter: url(#torus-hero-filter) }
     (see style.css §22)
   ============================================================ */
function initTorusDistortion() {
  if (PREFERS_REDUCED) return;

  const heroSection = document.getElementById('hero');
  const turbulence  = document.getElementById('heroTurbulence');
  const displace    = document.getElementById('heroDisplace');
  if (!turbulence || !displace) return;

  heroSection.classList.add('torus-filter-active');

  let mx = .5, my = .5, tx = .5, ty = .5;

  heroSection.addEventListener('mousemove', e => {
    const r = heroSection.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width;
    ty = (e.clientY - r.top)  / r.height;
  }, { passive: true });

  heroSection.addEventListener('mouseleave', () => { tx = .5; ty = .5; });

  /* Torus ring influence function:
     Returns 0 at the center and edges, peaks at radial distance ~0.35 */
  function torusInfluence(x, y) {
    const cx = x - .5, cy = y - .5;
    const dist = Math.sqrt(cx*cx + cy*cy);
    /* Ring-shaped activation: peaks at r=0.32 */
    return Math.exp(-((dist - .32) * (dist - .32)) / .025);
  }

  function torusLoop() {
    /* Lerp toward target for smooth response */
    mx += (tx - mx) * .06;
    my += (ty - my) * .06;

    const influence = torusInfluence(mx, my);
    const angle   = Math.atan2(my - .5, mx - .5);
    const bfx = (.008 + influence * .006 + Math.cos(angle) * .003).toFixed(5);
    const bfy = (.012 + influence * .006 + Math.sin(angle) * .003).toFixed(5);
    const sc  = (2 + influence * 5).toFixed(1);

    turbulence.setAttribute('baseFrequency', `${bfx} ${bfy}`);
    displace.setAttribute('scale', sc);

    requestAnimationFrame(torusLoop);
  }
  torusLoop();
}


/* ============================================================
   §4  PEEK-A-BOO OVERLAY
   ──────────────────────
   A radial "hole" in the frosted gradient that follows the cursor
   over the hero carousel, revealing the 3D depth underneath.
   
   The #hero-peek-overlay element is placed inside .hero-carousel-stage.
   CSS shows the overlay only on .hero-right:hover (see style.css §22).
   This function updates the radial gradient position each frame.
   ============================================================ */
function initPeekaboo() {
  const overlay  = document.getElementById('hero-peek-overlay');
  const carousel = document.getElementById('heroCarousel');
  if (!overlay || !carousel) return;

  let oax = 50, oay = 50, tax = 50, tay = 50;

  carousel.addEventListener('mousemove', e => {
    const r = carousel.getBoundingClientRect();
    tax = ((e.clientX - r.left) / r.width  * 100).toFixed(1);
    tay = ((e.clientY - r.top)  / r.height * 100).toFixed(1);
  }, { passive: true });

  carousel.addEventListener('mouseleave', () => { tax = 50; tay = 50; });

  function peekLoop() {
    /* Lerp for smooth following */
    oax += (parseFloat(tax) - oax) * .12;
    oay += (parseFloat(tay) - oay) * .12;

    overlay.style.background = `radial-gradient(
      circle 130px at ${oax.toFixed(1)}% ${oay.toFixed(1)}%,
      transparent 0%, transparent 40%,
      rgba(248,250,252,0.45) 68%, rgba(248,250,252,0.78) 100%
    )`;

    requestAnimationFrame(peekLoop);
  }
  peekLoop();
}


/* ============================================================
   §5  CSS FALLBACK PARTICLE SYSTEM
   ──────────────────────────────────
   Used when WebGL is unavailable (body.webgl-fallback).
   Draws 80 floating dots on #hero-canvas using Canvas 2D API.
   Particles fall downward with slight mouse-driven horizontal drift.
   ============================================================ */
function initFallbackParticles() {
  const canvas = document.getElementById('hero-canvas');
  const hero   = document.getElementById('hero');
  if (!canvas || !hero) return;

  const ctx = canvas.getContext('2d');
  let W, H, mx = .5, my = .5, particles = [];

  function resize() {
    W = canvas.width  = hero.offsetWidth;
    H = canvas.height = hero.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  hero.addEventListener('mousemove', e => {
    const r = hero.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width;
    my = (e.clientY - r.top)  / r.height;
  }, { passive: true });

  class Particle {
    constructor() { this.reset(); this.y = Math.random() * H; }
    reset() {
      this.x  = Math.random() * W; this.y = -10;
      this.r  = Math.random() * 1.8 + .4;
      this.sp = Math.random() * .35 + .15;
      this.op = Math.random() * .35 + .08;
      this.dx = (Math.random() - .5) * .25;
    }
    update() {
      this.x += this.dx + (mx - .5) * .5;
      this.y += this.sp;
      if (this.y > H + 10) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(13,148,136,${this.op})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < 80; i++) particles.push(new Particle());

  (function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  })();
}


/* ============================================================
   §6  HERO 3D CSS CAROUSEL
   ─────────────────────────
   Five slides inside #heroCarousel with CSS 3D transforms:
   • active — translateZ(0)    fully visible
   • prev   — translateZ(150px) flies forward then fades
   • default — translateZ(-500px) behind scene

   Auto-advances every 3800ms.
   Pauses on mouseenter, resumes on mouseleave.
   Supports touch swipe (>40px threshold).
   Dot navigation injected dynamically into #hcDots.

   CSS connection: .hc-slide, .hc-dot, .hc-s1–s5  (see style.css §17)
   ============================================================ */
(function(){
  const stage  = document.getElementById('heroCarousel');
  if (!stage) return;

  const slides = stage.querySelectorAll('.hc-slide');
  const dotsC  = document.getElementById('hcDots');
  const total  = slides.length;
  let current  = 0, timer;

  /* Inject dot indicators */
  const dots = [];
  for (let i = 0; i < total; i++) {
    const d = document.createElement('div');
    d.className = 'hc-dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => goto(i));
    dotsC.appendChild(d);
    dots.push(d);
  }

  function goto(idx) {
    slides[current].classList.remove('active');
    slides[current].classList.add('prev');
    /* Remove 'prev' after transition completes (950ms) */
    setTimeout(() => slides[current].classList.remove('prev'), 950);
    current = (idx + total) % total;
    slides[current].classList.add('active');
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  function startTimer() { timer = setInterval(() => goto(current + 1), 3800); }
  function stopTimer()  { clearInterval(timer); }

  stage.addEventListener('mouseenter', stopTimer);
  stage.addEventListener('mouseleave', startTimer);

  /* Touch swipe support */
  let csX = 0;
  stage.addEventListener('touchstart', e => { csX = e.touches[0].clientX; stopTimer(); }, { passive: true });
  stage.addEventListener('touchend', e => {
    const diff = csX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) goto(diff > 0 ? current + 1 : current - 1);
    startTimer();
  }, { passive: true });

  startTimer();
})();


/* ============================================================
   §7  ABOUT 3D DEPTH SLIDER
   ──────────────────────────
   A drag-to-advance layered card stack inside #adsStage.
   Four slides cycle through four depth positions (data-pos 0–3).
   Position 0 is front-center; higher positions recede with blur.

   CSS connection: .ads-slide[data-pos="*"]  (see style.css §18)
   ============================================================ */
(function(){
  const stage = document.getElementById('adsStage');
  if (!stage) return;

  const slides = stage.querySelectorAll('.ads-slide');
  let order = [0,1,2,3,4,5,6,7,8], autoTimer;
  let startX = 0, isDragging = false;

  /* Apply current order to slide data-pos attributes */
  function applyOrder() {
    order.forEach((slideIdx, pos) => {
      slides[slideIdx].setAttribute('data-pos', pos);
    });
  }

  /* Rotate order array — first item goes to back */
  function advance() { order = [...order.slice(1), order[0]]; applyOrder(); }

  function startAuto() { autoTimer = setInterval(advance, 6000); }
  function stopAuto()  { clearInterval(autoTimer); }
  function resetAuto() { stopAuto(); startAuto(); }

  /* Drag handling — mouse */
  stage.addEventListener('mousedown', e => { isDragging = true; startX = e.clientX; stopAuto(); });

  /* Drag handling — touch */
  stage.addEventListener('touchstart', e => {
    isDragging = true; startX = e.touches[0].clientX; stopAuto();
  }, { passive: true });

  function endDrag(ex) {
    if (!isDragging) return;
    isDragging = false;
    if (Math.abs(startX - ex) > 40) advance();
    resetAuto();
  }

  stage.addEventListener('mouseup',  e => endDrag(e.clientX));
  stage.addEventListener('touchend', e => endDrag(e.changedTouches[0].clientX), { passive: true });
  window.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; resetAuto(); } });

  /* Pause auto on mouse hover, restart after 3s idle */
  let idleTimer;
  stage.addEventListener('mousemove', () => {
    clearTimeout(idleTimer); stopAuto();
    idleTimer = setTimeout(startAuto, 3000);
  });

  document.getElementById('aboutSlider')?.addEventListener('mouseleave', resetAuto);
  startAuto();
})();


/* ============================================================
   §8  CUSTOM CURSOR
   ──────────────────
   Two elements: #cur (small teal dot) + #cur-r (lagging ring).
   #cur follows cursor instantly; #cur-r lags for a trailing effect.
   On interactive elements the ring expands (46px → 32px on leave).

   CSS connection: #cur, #cur-r  (see style.css §4)
   Hidden on touch devices via media query (hover: none).
   ============================================================ */
const $cur = document.getElementById('cur');
const $cr  = document.getElementById('cur-r');
let cmx = 0, cmy = 0, crx = 0, cry = 0;

/* Dot follows cursor exactly */
document.addEventListener('mousemove', e => {
  cmx = e.clientX; cmy = e.clientY;
  $cur.style.transform = `translate(${cmx - 4}px,${cmy - 4}px)`;
});

/* Ring uses RAF loop with lerp for smooth trailing */
(function curLoop() {
  crx += (cmx - crx - 16) * .25;
  cry += (cmy - cry - 16) * .25;
  $cr.style.transform = `translate(${crx}px,${cry}px)`;
  requestAnimationFrame(curLoop);
})();

/* Ring expands on hoverable elements */
document.querySelectorAll('a,button,.course-card,.pdf-card,.feat-card,.bridge-card').forEach(el => {
  el.addEventListener('mouseenter', () => { $cr.style.width = $cr.style.height = '46px'; $cr.style.opacity = '1'; });
  el.addEventListener('mouseleave', () => { $cr.style.width = $cr.style.height = '32px'; $cr.style.opacity = '.6'; });
});


/* ============================================================
   §9  PDF GLOW FOLLOW
   ────────────────────
   The #pdfs-glow div follows the mouse inside the #pdfs section.
   Opacity transitions to 1 on hover via CSS (see style.css §12).
   ============================================================ */
(function(){
  const section = document.getElementById('pdfs');
  const glow    = document.getElementById('pdfs-glow');
  if (!section || !glow) return;

  section.addEventListener('mousemove', e => {
    const r = section.getBoundingClientRect();
    glow.style.left = (e.clientX - r.left) + 'px';
    glow.style.top  = (e.clientY - r.top)  + 'px';
  }, { passive: true });
})();


/* ============================================================
   §10  NAVBAR SCROLL BEHAVIOUR
   ──────────────────────────────
   Adds .scrolled class when window.scrollY > 60px.
   CSS: nav.scrolled reduces padding + adds shadow (see style.css §5).
   ============================================================ */
addEventListener('scroll', () =>
  document.getElementById('navbar').classList.toggle('scrolled', scrollY > 60));


/* ============================================================
   §11  MOBILE MENU
   ─────────────────
   oM() — opens  the #mobMenu overlay (adds .open class)
   cM() — closes the #mobMenu overlay (removes .open class)
   Called from hamburger onclick in index.html.
   CSS: .mob-menu, .mob-menu.open  (see style.css §16)
   ============================================================ */
   function oM() {
    const isOpen = document.getElementById('mobMenu').classList.toggle('open');
    document.getElementById('hamBtn').classList.toggle('active', isOpen);
  }
  function cM() {
    document.getElementById('mobMenu').classList.remove('open');
    document.getElementById('hamBtn').classList.remove('active');
  }


/* ============================================================
   §12  INTERSECTION OBSERVER REVEALS
   ────────────────────────────────────
   Observes all .reveal / .rev-l / .rev-r / .rev-up elements.
   Adds .in class when element enters viewport (10% threshold).
   CSS defines opacity/transform transitions on these classes (§6).
   Each element is unobserved after first reveal for performance.
   ============================================================ */
const ro = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); }
}), { threshold: .1 });

document.querySelectorAll('.reveal,.rev-l,.rev-r,.rev-up').forEach(el => ro.observe(el));


/* ============================================================
   §13  ANIMATED COUNTERS (STATS BAND)
   ──────────────────────────────────
   Each element with [data-target] inside .stats-band counts up
   from 0 to its target value when the stats band enters viewport.
   Uses setInterval with step = target/60 for ~60 "frames" total.

   HTML attributes: data-target="1000" data-suf="+"
   ============================================================ */
function animC(el) {
  const t = +el.dataset.target;
  const s = el.dataset.suf || '';
  let c = 0;
  const step = t / 60;
  const ti = setInterval(() => {
    c = Math.min(c + step, t);
    el.textContent = Math.floor(c) + s;
    if (c >= t) clearInterval(ti);
  }, 22);
}

const co = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) {
    e.target.querySelectorAll('[data-target]').forEach(animC);
    co.unobserve(e.target);
  }
}), { threshold: .4 });

const sb = document.querySelector('.stats-band');
if (sb) co.observe(sb);


/* ============================================================
   §14  HERO FLOATING COUNTERS (hfc-1, hfc-2)
   ─────────────────────────────────────────────
   Animates the two floating stat cards in the hero right panel.
   #hfcVal1 counts to 42 (monthly selections) on page load.
   #hfcVal2 counts to 95 (%) success rate.
   500ms delay so they start after the GSAP entrance animation.
   ============================================================ */
function animVal(el, target, suf = '') {
  let c = 0;
  const step = target / 50;
  const ti = setInterval(() => {
    c = Math.min(c + step, target);
    el.textContent = Math.floor(c) + suf;
    if (c >= target) clearInterval(ti);
  }, 30);
}

setTimeout(() => {
  const v1 = document.getElementById('hfcVal1');
  if (v1) animVal(v1, 42, '');
  animVal(document.getElementById('hfcVal2'), 95, '%');
}, 500);


/* ============================================================
   §15  GSAP HERO ENTRANCE ANIMATION
   ────────────────────────────────────
   Staggers hero elements from invisible to visible on page load.
   Requires GSAP 3+ and ScrollTrigger (loaded in index.html <head>).
   Timeline runs once after 150ms delay.
   ============================================================ */
if (window.gsap) {
  gsap.registerPlugin(ScrollTrigger);

  /* Mark body so CSS knows GSAP is active — prevents flash of invisible elements */
  document.body.classList.add('gsap-ready');

  gsap.timeline({ delay: .15 })
    .from('#hEye',      { y: 20, opacity: 0, duration: .55, ease: 'power2.out' })
    .from('#hTitle',    { y: 40, opacity: 0, duration: .8,  ease: 'power3.out' }, '-=.1')
    .from('#hBn',       { y: 20, opacity: 0, duration: .55, ease: 'power2.out' }, '-=.3')
    .from('#hEn',       { y: 15, opacity: 0, duration: .45, ease: 'power2.out' }, '-=.2')
    .from('#hEnMain',   { y: 12, opacity: 0, duration: .4,  ease: 'power2.out' }, '-=.15')
    .from('#hCtas',     { y: 15, opacity: 0, duration: .45, ease: 'power2.out' }, '-=.2')
    .from('#hStats',    { y: 15, opacity: 0, duration: .45, ease: 'power2.out' }, '-=.1')
    .from('.hero-right',{ x: 50, opacity: 0, duration: .8,  ease: 'power2.out' }, '-=.9');
}


/* ============================================================
   §16  RIPPLE EFFECT
   ───────────────────
   Click on .btn-primary or .btn-orange creates a <span class="rip">
   element that expands and fades — CSS handles the animation.
   CSS connection: .btn-primary .rip, .btn-orange .rip  (style.css §7)
   ============================================================ */
document.querySelectorAll('.btn-primary,.btn-orange').forEach(b =>
  b.addEventListener('click', function(e) {
    const r   = document.createElement('span');
    r.className = 'rip';
    const rc  = this.getBoundingClientRect();
    const s   = Math.max(rc.width, rc.height);
    r.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX-rc.left-s/2}px;top:${e.clientY-rc.top-s/2}px;`;
    this.appendChild(r);
    setTimeout(() => r.remove(), 700);
  })
);


/* ============================================================
   §17  SMOOTH SCROLL
   ───────────────────
   Intercepts all anchor links that start with '#' and uses
   scrollIntoView for smooth behaviour instead of browser default.
   Also used by mobile menu links (via onclick="cM()" in HTML).
   ============================================================ */
document.querySelectorAll('a[href^="#"]').forEach(a =>
  a.addEventListener('click', e => {
    e.preventDefault();
    document.querySelector(a.getAttribute('href'))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  })
);


/* ============================================================
   §18  TESTIMONIAL SLIDER + TOUCH SWIPE
   ───────────────────────────────────────
   Slides the #ttrack div using translateX.
   Visible cards per viewport:
   • <600px  → 1 card
   • <900px  → 2 cards
   • ≥900px  → 3 cards

   Previous/Next buttons: #prevB, #nextB
   Auto-advances every 5 seconds.
   Supports touch swipe (>40px threshold).
   ============================================================ */
const tt      = document.getElementById('ttrack');
const tc      = [...tt.querySelectorAll('.t-card')];
let tidx = 0, tStartX = 0;

/* Cards Per Viewport */
function cpv() {
  return innerWidth < 600 ? 1 : innerWidth < 900 ? 2 : 3;
}

/* Update slider position */
function uS() {
  const c   = cpv();
  const max = Math.max(0, tc.length - c);
  tidx = Math.min(tidx, max);
  const w = (tc[0]?.getBoundingClientRect().width || 300) + 24; /* card width + gap */
  tt.style.transform = `translateX(-${tidx * w}px)`;
}

document.getElementById('nextB').onclick = () => {
  tidx = tidx < Math.max(0, tc.length - cpv()) ? tidx + 1 : 0; uS();
};
document.getElementById('prevB').onclick = () => {
  const m = Math.max(0, tc.length - cpv());
  tidx = tidx > 0 ? tidx - 1 : m; uS();
};

/* Responsive reflow on resize */
addEventListener('resize', uS);

/* Auto-advance every 5 seconds */
setInterval(() => {
  tidx = tidx < Math.max(0, tc.length - cpv()) ? tidx + 1 : 0; uS();
}, 5000);

/* Touch swipe */
tt.addEventListener('touchstart', e => { tStartX = e.touches[0].clientX; }, { passive: true });
tt.addEventListener('touchend', e => {
  const diff = tStartX - e.changedTouches[0].clientX;
  if (Math.abs(diff) > 40) {
    if (diff > 0) { tidx = tidx < Math.max(0, tc.length - cpv()) ? tidx + 1 : 0; }
    else          { const m = Math.max(0, tc.length - cpv()); tidx = tidx > 0 ? tidx - 1 : m; }
    uS();
  }
}, { passive: true });


/* ============================================================
   §19  STAR PICKER
   ─────────────────
   Interactive star rating inside #starPick in the review form.
   Hovering highlights stars 1 through n; clicking locks the value.
   Mouseleave restores to locked value (selStar).
   ============================================================ */
let selStar = 0;

document.querySelectorAll('#starPick .sp').forEach(s => {
  s.addEventListener('mouseover', () => {
    const v = +s.dataset.v;
    document.querySelectorAll('#starPick .sp').forEach((el, i) =>
      el.classList.toggle('on', i < v)
    );
  });
  s.addEventListener('click', () => { selStar = +s.dataset.v; });
});

document.getElementById('starPick').addEventListener('mouseleave', () => {
  document.querySelectorAll('#starPick .sp').forEach((el, i) =>
    el.classList.toggle('on', i < selStar)
  );
});


/* ============================================================
   §20  SUBMIT REVIEW
   ───────────────────
   Called via onclick="submitReview()" on the review submit button.
   Validates that name, message and star rating are all provided.
   On success: shows #rvOk success message for 5 seconds, clears form.
   ============================================================ */
function submitReview() {
  var name = document.getElementById('rv_name').value.trim();
  var exam = document.getElementById('rv_exam').value.trim();
  var msg  = document.getElementById('rv_msg').value.trim();

  if (!name || !msg || !selStar) {
    alert('Please fill name, feedback and select a rating.');
    return;
  }

  /* ── Show success message ── */
  document.getElementById('rvOk').style.display = 'block';

  /* ── Build star HTML ── */
  var starsHtml = '';
  for (var s = 1; s <= 5; s++) {
    starsHtml += s <= selStar
      ? '<i class="fa fa-star" style="color:var(--orange);font-size:.75rem;"></i>'
      : '<i class="fa fa-star" style="color:var(--orange);opacity:.22;font-size:.75rem;"></i>';
  }

  /* ── Inject into testimonial slider ── */
  var initials = name.split(' ').map(function(w){ return w[0]||''; }).join('').toUpperCase().slice(0,2) || 'U';
  var bgs = [
    'linear-gradient(135deg,var(--teal),#0a6e68)',
    'linear-gradient(135deg,var(--orange),#d9620e)',
    'linear-gradient(135deg,#7c3aed,var(--orange))',
    'linear-gradient(135deg,var(--teal),#7c3aed)'
  ];
  var bg = bgs[Math.floor(Math.random() * bgs.length)];

  var newCard = document.createElement('div');
  newCard.className = 't-card';
  newCard.innerHTML =
    '<div class="qm">"</div>' +
    '<p class="t-txt">' + msg.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</p>' +
    '<div class="t-author">' +
      '<div class="t-av" style="background:' + bg + '">' + initials + '</div>' +
      '<div>' +
        '<div class="t-name">' + name.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</div>' +
        '<div class="t-meta">' + (exam ? exam.replace(/&/g,'&amp;').replace(/</g,'&lt;') : 'PCC Student') + '</div>' +
        '<div class="t-rating">' + starsHtml + '</div>' +
      '</div>' +
    '</div>';

  var ttrack = document.getElementById('ttrack');
  if (ttrack) ttrack.appendChild(newCard);

  /* ── Inject into live reviews panel ── */
  var liveWrap = document.getElementById('liveRvWrap');
  var liveList = document.getElementById('liveRvList');
  if (liveWrap && liveList) {
    liveWrap.style.display = 'block';
    var now = new Date();
    var timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');

    var lc = document.createElement('div');
    lc.className = 'live-rv-card';
    lc.innerHTML =
      '<div class="lrc-top">' +
        '<span class="lrc-name">' + name.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>' +
        '<span class="lrc-stars">' + starsHtml + '</span>' +
      '</div>' +
      (exam ? '<div class="lrc-exam">' + exam.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</div>' : '') +
      '<p class="lrc-msg">"' + msg.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '"</p>' +
      '<div class="lrc-time">Just now · ' + timeStr + '</div>';

    liveList.insertBefore(lc, liveList.firstChild);
    liveList.scrollTop = 0;
  }

  /* ── Reset form ── */
  ['rv_name','rv_exam','rv_msg'].forEach(function(id){
    document.getElementById(id).value = '';
  });
  selStar = 0;
  document.querySelectorAll('#starPick .sp').forEach(function(el){ el.classList.remove('on'); });

  setTimeout(function(){ document.getElementById('rvOk').style.display = 'none'; }, 5000);
}


/* ============================================================
   §21  CONTACT FORM SUBMIT (hSubmit)
   ────────────────────────────────────
   Called via onsubmit="hSubmit(event)" on the contact <form>.
   Prevents default form submission, shows #cOk for 5 seconds,
   then resets the form. In production, replace with a real
   form backend (Formspree, EmailJS, etc.).
   ============================================================ */
function hSubmit(e) {
  e.preventDefault();
  document.getElementById('cOk').style.display = 'block';
  e.target.reset();
  setTimeout(() => document.getElementById('cOk').style.display = 'none', 5000);
}


/* ============================================================
   §22  BOOT SEQUENCE — WebGL + Torus + Peekaboo
   ───────────────────────────────────────────────
   All heavy visual systems are initialised after window.load
   with a 120ms delay to allow the DOM paint to settle first.
   This prevents blocking the initial page render.
   ============================================================ */
window.addEventListener('load', () => {
  setTimeout(() => {
    initHeroWebGL();       /* §2 — Three.js particle field */
    initTorusDistortion(); /* §3 — SVG title distortion */
    initPeekaboo();        /* §4 — Carousel peek overlay */
  }, 120);
});


/* ============================================================
   §23  SECTION PARTICLE SYSTEM
   ──────────────────────────────
   Reusable Canvas 2D organic floating particle system.
   Called once per section with a canvas ID and options object.
   Uses IntersectionObserver to pause animation off-screen
   for performance.

   Parameters (opts):
   • count    — number of particles
   • color1   — primary colour "R,G,B" string
   • color2   — secondary colour "R,G,B" string
   • minOp    — minimum opacity
   • maxOp    — maximum opacity
   • minR     — minimum radius (px)
   • maxR     — maximum radius (px)
   • speed    — base movement speed

   CSS connection: .sec-particles canvas  (see style.css §17)
   ============================================================ */
function initSectionParticles(canvasId, opts) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || PREFERS_REDUCED) return;

  const section = canvas.parentElement;
  const ctx     = canvas.getContext('2d');

  const {
    count  = 90,
    color1 = '13,148,136',  /* --teal */
    color2 = '94,234,212',  /* --teal-light */
    minOp  = 0.06,
    maxOp  = 0.28,
    minR   = 1.2,
    maxR   = 3.8,
    speed  = 0.30,
  } = opts || {};

  let W, H, running = false, rafId, mx = 0.5, my = 0.5;
  const particles = [];

  function resize() {
    W = canvas.width  = section.offsetWidth;
    H = canvas.height = section.offsetHeight;
  }

  class SP {
    constructor(initY) {
      this.r   = minR + Math.random() * (maxR - minR);
      this.x   = Math.random() * (W || 800);
      this.y   = initY !== undefined ? initY : Math.random() * (H || 600);
      this.vy  = speed * (0.4 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1);
      this.vx  = (Math.random() - 0.5) * speed * 0.5;
      this.op  = minOp + Math.random() * (maxOp - minOp);
      this.ph  = Math.random() * Math.PI * 2;
      /* Alternate between color1 / color2 (65/35 split) */
      this.col = Math.random() < 0.65 ? color1 : color2;
    }
    update(t) {
      /* Sinusoidal organic drift */
      this.x += this.vx + Math.sin(t * 0.4 + this.ph) * 0.35;
      this.y += this.vy + Math.cos(t * 0.3 + this.ph * 1.2) * 0.25;
      /* Subtle mouse influence */
      this.x += (mx - 0.5) * 0.4;
      this.y += (my - 0.5) * 0.3;
      /* Wrap around edges */
      if (this.x < -10)    this.x = W + 10;
      if (this.x > W + 10) this.x = -10;
      if (this.y < -10)    this.y = H + 10;
      if (this.y > H + 10) this.y = -10;
    }
    draw() {
      /* Pulse opacity with time */
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0008 + this.ph);
      const op    = this.op * (0.7 + 0.3 * pulse);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.col},${op.toFixed(3)})`;
      ctx.fill();
    }
  }

  function build() {
    particles.length = 0;
    for (let i = 0; i < count; i++) particles.push(new SP());
  }

  /* Mouse tracking scoped to parent section */
  section.addEventListener('mousemove', e => {
    const r = section.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width;
    my = (e.clientY - r.top)  / r.height;
  }, { passive: true });

  section.addEventListener('mouseleave', () => { mx = 0.5; my = 0.5; }, { passive: true });

  let t = 0;
  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    t += 0.012;
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(t); p.draw(); });
  }

  /* IntersectionObserver: only animate while section is in viewport */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        if (!running) { running = true; loop(); }
      } else {
        running = false;
        cancelAnimationFrame(rafId);
      }
    });
  }, { threshold: 0 });

  resize();
  build();
  io.observe(section);
  window.addEventListener('resize', () => { resize(); build(); }, { passive: true });
}

/* ── Boot all section particle canvases after page load ── */
window.addEventListener('load', () => {
  setTimeout(() => {
    /* About — light teal particles on white/slate background */
    initSectionParticles('about-particles', {
      count: 70, color1: '13,148,136', color2: '94,234,212',
      minOp: 0.04, maxOp: 0.14, minR: 1.0, maxR: 3.0, speed: 0.25,
    });
    /* Courses — slightly denser in the dark top zone */
    initSectionParticles('courses-particles', {
      count: 90, color1: '13,148,136', color2: '94,234,212',
      minOp: 0.06, maxOp: 0.22, minR: 1.2, maxR: 3.8, speed: 0.28,
    });
    /* Why — dark section top zone */
    initSectionParticles('why-particles', {
      count: 90, color1: '13,148,136', color2: '94,234,212',
      minOp: 0.06, maxOp: 0.20, minR: 1.2, maxR: 3.8, speed: 0.26,
    });
    /* PDFs — teal + orange mix for contrast */
    initSectionParticles('pdfs-particles', {
      count: 95, color1: '13,148,136', color2: '249,115,22',
      minOp: 0.07, maxOp: 0.22, minR: 1.2, maxR: 4.0, speed: 0.28,
    });
    /* Ratings — very subtle on white background */
    initSectionParticles('ratings-particles', {
      count: 65, color1: '13,148,136', color2: '249,115,22',
      minOp: 0.03, maxOp: 0.11, minR: 1.0, maxR: 2.8, speed: 0.22,
    });
    /* Contact — subtle on dark background */
    initSectionParticles('contact-particles', {
      count: 75, color1: '13,148,136', color2: '94,234,212',
      minOp: 0.06, maxOp: 0.18, minR: 1.0, maxR: 3.5, speed: 0.24,
    });
  }, 200);
});


/* ============================================================
   §24  NEW FEATURES — Offer Wall · Course Sliders · Features
        Mobile Slider
   All enclosed in a single IIFE to prevent any name collisions
   with the existing script.js functions above.
   ============================================================ */
(function() {

  /* ─────────────────────────────────────────────────────────
     OFFER WALL TICKER — duplicate items for seamless CSS loop
     ───────────────────────────────────────────────────────── */
  function duplicateTicker(el) {
    if (!el) return;
    var original = Array.prototype.slice.call(el.children);
    original.forEach(function(item) { el.appendChild(item.cloneNode(true)); });
  }
  duplicateTicker(document.getElementById('owList'));
  duplicateTicker(document.getElementById('mowTrack'));

  /* ─────────────────────────────────────────────────────────
     COURSE SLIDER FACTORY
     Creates one independent slider from a config object.
     cfg: { trackId, prevId, nextId, dotsId, interval, fadeMode }
     ───────────────────────────────────────────────────────── */
  function makeCourseSlider(cfg) {
    var track    = document.getElementById(cfg.trackId);
    var prevBtn  = document.getElementById(cfg.prevId);
    var nextBtn  = document.getElementById(cfg.nextId);
    var dotsWrap = document.getElementById(cfg.dotsId);
    if (!track) return;

    var viewport  = track.parentElement;
    var slides    = Array.prototype.slice.call(track.querySelectorAll('.course-card'));
    var N         = slides.length;
    var idx       = 0;
    var autoTimer = null;
    var INTERVAL  = cfg.interval || 4000;
    var FADE      = cfg.fadeMode || false;

    /* Cards visible per viewport width */
    function cpv() {
      return window.innerWidth <= 900 ? 1 : window.innerWidth <= 1024 ? 2 : 3;
    }
    function maxIdx() { return Math.max(0, N - cpv()); }

    /* ── Dots ── */
    var dots = [];
    function buildDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      dots = [];
      var pages = Math.ceil(N / cpv());
      for (var i = 0; i < pages; i++) {
        (function(pageIdx) {
          var d = document.createElement('button');
          d.className = 'cs-dot' + (pageIdx === 0 ? ' active' : '');
          d.addEventListener('click', function() {
            stopAuto(); goTo(pageIdx * cpv()); startAuto();
          });
          dotsWrap.appendChild(d);
          dots.push(d);
        })(i);
      }
    }
    function syncDots() {
      var page = Math.floor(idx / cpv());
      dots.forEach(function(d, i) { d.classList.toggle('active', i === page); });
    }

    /* ── Navigation ── */
    function goTo(newIdx) {
      idx = Math.max(0, Math.min(newIdx, maxIdx()));
      var slideW = slides[0] ? slides[0].getBoundingClientRect().width : 300;
      var gap    = 24; /* 1.5rem */
      var offset = idx * (slideW + gap);

      if (FADE) {
        viewport.style.transition = 'opacity .28s ease';
        viewport.style.opacity    = '0';
        var capturedOffset = offset;
        setTimeout(function() {
          track.style.transform  = 'translateX(-' + capturedOffset + 'px)';
          viewport.style.opacity = '1';
        }, 280);
      } else {
        track.style.transform = 'translateX(-' + offset + 'px)';
      }
      syncDots();
    }

    function goNext() { goTo(idx >= maxIdx() ? 0 : idx + 1); }
    function goPrev() { goTo(idx <= 0 ? maxIdx() : idx - 1); }

    function startAuto() { autoTimer = setInterval(goNext, INTERVAL); }
    function stopAuto()  { clearInterval(autoTimer); }

    if (prevBtn) prevBtn.addEventListener('click', function() { stopAuto(); goPrev(); startAuto(); });
    if (nextBtn) nextBtn.addEventListener('click', function() { stopAuto(); goNext(); startAuto(); });

    /* Touch swipe */
    var tStart = 0;
    track.addEventListener('touchstart', function(e) {
      tStart = e.touches[0].clientX; stopAuto();
    }, { passive: true });
    track.addEventListener('touchend', function(e) {
      var diff = tStart - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) { diff > 0 ? goNext() : goPrev(); }
      startAuto();
    }, { passive: true });

    /* Pause on hover */
    viewport.addEventListener('mouseenter', stopAuto);
    viewport.addEventListener('mouseleave', startAuto);

    /* Rebuild on resize */
    window.addEventListener('resize', function() {
      buildDots(); goTo(0);
    }, { passive: true });

    buildDots();
    goTo(0);
    startAuto();
  }

  /* Boot both course sliders */
  makeCourseSlider({ trackId:'csTrk1', prevId:'csPrev1', nextId:'csNext1', dotsId:'csDots1', interval:4000 });
  makeCourseSlider({ trackId:'csTrk2', prevId:'csPrev2', nextId:'csNext2', dotsId:'csDots2', interval:3500, fadeMode:true });

  /* ─────────────────────────────────────────────────────────
     FEATURES MOBILE SLIDER
     Desktop: grid stays unchanged.
     Mobile (≤900px): feat-grid becomes overflow-hidden flex,
     each card = 100% width, JS drives translateX.
     ───────────────────────────────────────────────────────── */
  (function() {
    var grid   = document.getElementById('featGrid');
    var prevEl = document.getElementById('featPrev');
    var nextEl = document.getElementById('featNext');
    var dotsEl = document.getElementById('featDots');
    var navEl  = document.getElementById('featSliderNav');
    if (!grid) return;

    var cards     = Array.prototype.slice.call(grid.querySelectorAll('.feat-card'));
    var N         = cards.length;
    var idx       = 0;
    var autoTimer = null;
    var active    = false; /* true = currently in slider mode */

    /* Build dots once */
    var fdots = [];
    if (dotsEl) {
      for (var i = 0; i < N; i++) {
        (function(fi) {
          var d = document.createElement('button');
          d.className = 'cs-dot' + (fi === 0 ? ' active' : '');
          d.addEventListener('click', function() { stopFA(); goFA(fi); startFA(); });
          dotsEl.appendChild(d);
          fdots.push(d);
        })(i);
      }
    }

    function syncFD() { fdots.forEach(function(d,i){ d.classList.toggle('active', i===idx); }); }

    function goFA(n) {
      if (!active) return;
      idx = ((n % N) + N) % N;
      var vpW = getVpWidth();
      grid.style.transform = 'translateX(-' + (idx * vpW) + 'px)';
      syncFD();
    }
    function nextFA() { goFA(idx + 1); }
    function prevFA() { goFA(idx - 1); }
    function startFA() { if (active) autoTimer = setInterval(nextFA, 3800); }
    function stopFA()  { clearInterval(autoTimer); }

    if (prevEl) prevEl.addEventListener('click', function(){ stopFA(); prevFA(); startFA(); });
    if (nextEl) nextEl.addEventListener('click', function(){ stopFA(); nextFA(); startFA(); });

    var ts = 0;
    grid.addEventListener('touchstart', function(e){ ts = e.touches[0].clientX; stopFA(); }, { passive:true });
    grid.addEventListener('touchend',   function(e){
      var diff = ts - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) { diff > 0 ? nextFA() : prevFA(); }
      startFA();
    }, { passive:true });

    function getVpWidth() {
      var vp   = document.getElementById('featViewport');
      var wrap = document.querySelector('.feat-wrap');
      /* Try viewport element first, then wrap, then window */
      var w = (vp && vp.offsetWidth > 0) ? vp.offsetWidth
            : (wrap && wrap.offsetWidth > 0) ? wrap.offsetWidth
            : window.innerWidth;
      return w;
    }

    function activateSlider() {
      var vpW = getVpWidth();
      var vp  = document.getElementById('featViewport');
      /* Viewport clips overflow */
      if (vp) { vp.style.overflow = 'hidden'; vp.style.display = 'block'; vp.style.width = '100%'; }
      /* Grid: explicit total width, no wrapping */
      grid.style.display    = 'flex';
      grid.style.flexWrap   = 'nowrap';
      grid.style.overflow   = 'visible';
      grid.style.width      = (vpW * N) + 'px';
      grid.style.transition = 'transform .5s cubic-bezier(.25,.46,.45,.94)';
      grid.style.transform  = 'translateX(0)';
      /* Each card: exact pixel width, no gaps */
      cards.forEach(function(c) {
        c.style.flex      = '0 0 ' + vpW + 'px';
        c.style.width     = vpW + 'px';
        c.style.minWidth  = '0';
        c.style.maxWidth  = vpW + 'px';
        c.style.boxSizing = 'border-box';
      });
      idx = 0; syncFD();
      if (navEl) navEl.style.display = 'flex';
    }

    function deactivateSlider() {
      var vp = document.getElementById('featViewport');
      if (vp) { vp.style.overflow = vp.style.display = vp.style.width = ''; }
      grid.style.display = grid.style.flexWrap = grid.style.width =
      grid.style.overflow = grid.style.transition = grid.style.transform = '';
      cards.forEach(function(c) {
        c.style.flex = c.style.width = c.style.minWidth =
        c.style.maxWidth = c.style.boxSizing = '';
      });
      if (navEl) navEl.style.display = 'none';
    }

    function checkFA() {
      var should = window.innerWidth <= 900;
      if (should && !active) {
        active = true;
        activateSlider();
        startFA();
      } else if (should && active) {
        /* Recalculate on resize while already in slider mode */
        stopFA();
        activateSlider();
        startFA();
      } else if (!should && active) {
        active = false;
        stopFA();
        deactivateSlider();
      }
    }

    window.addEventListener('resize', checkFA, { passive:true });
    /* Defer initial run to after first paint so offsetWidth is available */
    requestAnimationFrame(function() { checkFA(); });
  })();

})(); /* end §24 */
