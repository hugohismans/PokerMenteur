'use strict';
/* Interactions entre joueurs : toucher un joueur pour lui lancer une tomate, des fleurs… */

const FX = {
  tomate:  { emoji: '🍅', label: 'Tomate',  hit: 'splat',  color: '#d62d2d' },
  oeuf:    { emoji: '🥚', label: 'Œuf',     hit: 'splat',  color: '#f2c94c' },
  fleurs:  { emoji: '💐', label: 'Fleurs',  hit: 'sparkle', color: '#ff8fc8' },
  bisou:   { emoji: '💋', label: 'Bisou',   hit: 'hearts', color: '#ff4f7b' },
  biere:   { emoji: '🍺', label: 'Santé !', hit: 'cheers', color: '#e3b341' },
  soulier: { emoji: '👟', label: 'Soulier', hit: 'bonk',   color: '#8a5a2b' },
};

// Sons synthétisés (même moteur que le reste du jeu)
const FxSound = {
  whoosh() {
    if (Sound.muted || !Sound.ctx) return;
    const c = Sound.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.5), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    s.buffer = buf;
    f.type = 'bandpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.45);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t); s.stop(t + 0.5);
  },
  hit(kind) {
    switch (FX[kind].hit) {
      case 'splat': Sound.tone(90, 0.25, 0, 'sawtooth', 0.2); for (let i = 0; i < 4; i++) Sound.click(0.5, i * 0.03); break;
      case 'bonk': Sound.tone(220, 0.12, 0, 'square', 0.15); Sound.tone(150, 0.2, 0.08, 'square', 0.12); break;
      case 'cheers': Sound.clink(); setTimeout(() => Sound.clink(), 120); break;
      case 'hearts': Sound.tone(880, 0.12); Sound.tone(1175, 0.18, 0.1); break;
      default: [1568, 2093, 2637].forEach((f, i) => Sound.tone(f, 0.2, i * 0.06, 'sine', 0.07));
    }
  },
};

// Petit menu « Lancer sur … »
const fxMenu = document.createElement('div');
fxMenu.id = 'fxMenu';
document.body.appendChild(fxMenu);
let fxPick = null, fxLast = 0;

function openFxMenu(name, onPick) {
  fxPick = onPick;
  fxMenu.innerHTML = `<div class="fx-card">
    <div class="fx-head">Lancer sur <b>${esc(name)}</b></div>
    <div class="fx-grid">${Object.entries(FX).map(([k, f]) =>
      `<button data-act="fxThrow" data-arg="${k}"><span>${f.emoji}</span><small>${f.label}</small></button>`).join('')}</div>
    <button class="btn ghost sm" data-act="fxClose">Annuler</button>
  </div>`;
  fxMenu.classList.add('open');
}
function closeFxMenu() { fxMenu.classList.remove('open'); fxPick = null; }
fxMenu.addEventListener('click', e => { if (e.target === fxMenu) closeFxMenu(); });

Object.assign(actions, {
  fxThrow(kind) {
    const now = Date.now();
    if (now - fxLast < 1500) return; // pas de mitraillage
    fxLast = now;
    const pick = fxPick;
    closeFxMenu();
    Sound.init();
    pick && pick(kind);
  },
  fxClose() { closeFxMenu(); },
});

// Animation : le projectile part de fromEl (ou du bas de l'écran) et s'écrase sur toEl
function playFx(kind, fromEl, toEl) {
  const f = FX[kind];
  if (!f || !toEl) return;
  const rb = toEl.getBoundingClientRect();
  const ra = fromEl ? fromEl.getBoundingClientRect() : { left: innerWidth / 2 - 20, top: innerHeight - 60, width: 40, height: 40 };
  const x0 = ra.left + ra.width / 2, y0 = ra.top + ra.height / 2;
  const x1 = rb.left + rb.width / 2, y1 = rb.top + rb.height / 2;
  const p = document.createElement('div');
  p.className = 'fx-proj';
  p.textContent = f.emoji;
  document.body.appendChild(p);
  const lift = Math.min(160, 60 + Math.hypot(x1 - x0, y1 - y0) * 0.35);
  const dur = 700;
  FxSound.whoosh();
  const anim = p.animate([
    { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) rotate(0deg) scale(.8)` },
    { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) translate(-50%, -50%) rotate(300deg) scale(1.3)`, offset: 0.5 },
    { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) rotate(600deg) scale(1)` },
  ], { duration: dur, easing: 'cubic-bezier(.3,.1,.5,1)' });
  anim.onfinish = () => { p.remove(); impact(kind, toEl, x1, y1); };
}

function impact(kind, toEl, x, y) {
  const f = FX[kind];
  FxSound.hit(kind);
  vibrate(40);
  toEl.classList.remove('fx-hit'); void toEl.offsetWidth; toEl.classList.add('fx-hit');
  setTimeout(() => toEl.classList.remove('fx-hit'), 600);
  const box = document.createElement('div');
  box.className = `fx-burst ${f.hit}`;
  box.style.left = `${x}px`; box.style.top = `${y}px`;
  box.style.setProperty('--c', f.color);
  if (f.hit === 'splat') {
    box.innerHTML = `<i class="blob"></i>${Array.from({ length: 8 }, (_, k) => `<i class="drop" style="--a:${k * 45 + Math.random() * 20}deg;--d:${30 + Math.random() * 25}px"></i>`).join('')}`;
  } else {
    const sym = { hearts: '❤️', sparkle: '✨', cheers: '🍻', bonk: '💫' }[f.hit] || '✨';
    box.innerHTML = Array.from({ length: 6 }, (_, k) => `<span style="--a:${k * 60 + Math.random() * 30}deg;--d:${34 + Math.random() * 20}px">${sym}</span>`).join('');
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1600);
}

// Mode local (table du mode complet) : le projectile part du bas de l'écran
actions.seatTap = i => {
  if (!G || !G.players || !G.players[+i]) return;
  openFxMenu(G.players[+i].name, kind => playFx(kind, null, document.getElementById(`seat-${i}`)));
};

// Petit menu générique en bas de l'écran (même présentation que les projectiles)
function openSheet(html) {
  fxPick = null;
  fxMenu.innerHTML = `<div class="fx-card sheet">${html}</div>`;
  fxMenu.classList.add('open');
}
const closeSheet = closeFxMenu;
actions.sheetClose = closeFxMenu;
