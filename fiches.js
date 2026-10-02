'use strict';
/* Fiches (cailloux, allumettes…) et table de jeu vue du dessus. */

const TOKEN_TYPES = {
  cailloux: 'Cailloux',
  allumettes: 'Allumettes',
  jetons: 'Jetons',
  haricots: 'Haricots',
  pieces: 'Pièces',
};

// Petit pseudo-hasard stable, pour que chaque fiche garde sa forme d'un écran à l'autre
const wobble = (k, n) => ((Math.sin(k * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;

function tokenSVG(type, k = 0) {
  const r = wobble(k, 1), rot = Math.round(wobble(k, 2) * 360);
  let body;
  switch (type) {
    case 'allumettes':
      body = `<g transform="rotate(${rot} 12 12)">
        <rect x="3" y="10.6" width="17" height="2.8" rx="1.2" fill="#e6c48a" stroke="#9b7a44" stroke-width=".6"/>
        <ellipse cx="20.2" cy="12" rx="2.6" ry="2.3" fill="#c0262d"/></g>`;
      break;
    case 'jetons': {
      const col = ['#c0262d', '#1f4fbf', '#1d7a3a', '#222'][Math.floor(r * 4)];
      body = `<circle cx="12" cy="12" r="9.5" fill="${col}"/>
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-dasharray="3.2 4.2" transform="rotate(${rot} 12 12)"/>
        <circle cx="12" cy="12" r="5.6" fill="none" stroke="#fff" stroke-width=".9" opacity=".85"/>`;
      break;
    }
    case 'haricots':
      body = `<g transform="rotate(${rot} 12 12)">
        <path d="M5 13 Q4 6 11 6.5 Q14 6.8 15 9 Q16 10.5 18 10 Q21 10 20.5 14 Q19.5 18.5 12 18 Q5.5 17.6 5 13 Z" fill="#7b3f1e" stroke="#4a230e" stroke-width=".7"/>
        <path d="M8 9.5 Q10 8.2 12 8.8" fill="none" stroke="#c98a5e" stroke-width="1" stroke-linecap="round"/></g>`;
      break;
    case 'pieces':
      body = `<circle cx="12" cy="12" r="9" fill="#e3b341" stroke="#8a6510" stroke-width="1.2"/>
        <circle cx="12" cy="12" r="6.2" fill="none" stroke="#b8860b" stroke-width="1"/>
        <path d="M9.5 8.5 Q8 10 9 11.5" fill="none" stroke="#fff3c4" stroke-width="1.2" stroke-linecap="round"/>`;
      break;
    default: { // cailloux
      const g = 120 + Math.round(r * 60), sx = 8 + wobble(k, 3) * 2.5, sy = 6 + wobble(k, 4) * 2.5;
      body = `<g transform="rotate(${rot} 12 12)">
        <ellipse cx="12" cy="12.5" rx="${sx}" ry="${sy}" fill="rgb(${g},${g - 6},${g - 14})" stroke="rgba(0,0,0,.35)" stroke-width=".8"/>
        <ellipse cx="${12 - sx / 3}" cy="${12.5 - sy / 3}" rx="${sx / 3}" ry="${sy / 4}" fill="#fff" opacity=".35"/></g>`;
    }
  }
  return `<svg class="tok-svg" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

// Tas de fiches éparpillées (spirale)
function pileHTML(type, n, max = 20, seed = 0) {
  const shown = Math.min(n, max);
  let html = '';
  for (let k = 0; k < shown; k++) {
    const a = k * 2.399963, d = Math.sqrt(k) * 9;
    html += `<span class="pile-tok" style="left:calc(50% + ${(Math.cos(a) * d).toFixed(1)}px);top:calc(50% + ${(Math.sin(a) * d * 0.7).toFixed(1)}px)">${tokenSVG(type, k + seed)}</span>`;
  }
  return `<span class="pile">${html}</span>`;
}

/* Table vue du dessus. Le joueur 1 est en bas, puis les suivants dans le sens des
   aiguilles d'une montre (vers la gauche du joueur 1). */
function seatPos(i, n) {
  const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { x: 50 + 41 * Math.cos(a), y: 50 + 38 * Math.sin(a) };
}

function pokerTableHTML(G) {
  const n = G.players.length;
  const arrow = d => (d === 1 ? ' ↻' : d === -1 ? ' ↺' : '');
  const phase = G.phase === 'charge' ? `Charge${arrow(G.roundDir)}` : `Décharge${arrow(G.dir)}`;
  const potName = G.phase === 'charge' ? 'Pot' : 'Milieu';
  const seats = G.players.map((p, i) => {
    const { x, y } = seatPos(i, n);
    const cls = ['seat', i === G.current ? 'cur' : '', p.out ? 'out' : '', i === G.prev ? 'prev' : '', p.offline ? 'offline' : ''].join(' ');
    return `<div class="${cls}" id="seat-${i}" style="left:${x}%;top:${y}%" data-act="seatTap" data-arg="${i}">
      <span class="sname">${i === G.current ? '🎩 ' : ''}${p.offline ? '📵 ' : ''}${esc(p.name)}</span>
      <span class="stoks">${p.out ? 'sauvé ✓' : `${tokenSVG(G.tokenType, i * 7)}<b>${p.tokens}</b>`}</span>
    </div>`;
  }).join('');
  return `<div class="ptable">
    <div class="oval">
      <div class="pot" id="pot">
        ${G.pot ? pileHTML(G.tokenType, G.pot, 20, 3) : ''}
        <span class="pot-lbl">${G.pot ? `${potName} : ${G.pot}` : `${potName} vide`}</span>
      </div>
    </div>
    <span class="phase ${G.phase}">${phase}</span>
    ${seats}
  </div>`;
}

// Animation d'une fiche qui vole du pot (ou d'un joueur) vers un joueur
function flyToken(type, fromId, toId) {
  const a = document.getElementById(fromId), b = document.getElementById(toId);
  if (!a || !b) return;
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const t = document.createElement('div');
  t.className = 'fly-tok';
  t.innerHTML = tokenSVG(type, 99);
  t.style.left = `${ra.left + ra.width / 2 - 14}px`;
  t.style.top = `${ra.top + ra.height / 2 - 14}px`;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    t.style.transform = `translate(${rb.left - ra.left + (rb.width - ra.width) / 2}px, ${rb.top - ra.top + (rb.height - ra.height) / 2}px) rotate(540deg)`;
  }));
  setTimeout(() => { b.classList.add('bump'); Sound.clink && Sound.clink(); }, 750);
  setTimeout(() => { t.remove(); b.classList.remove('bump'); }, 1200);
}

// Version compacte : une ligne avec les joueurs et leurs fiches
function playersStripHTML(G) {
  return `<div class="pstrip">${G.players.map((p, i) => `
    <span class="pchip ${i === G.current ? 'cur' : ''} ${p.out ? 'out' : ''}" id="seat-${i}" data-act="seatTap" data-arg="${i}">
      ${i === G.current ? '🎩 ' : ''}${esc(p.name)} ${p.out ? '✓' : `${tokenSVG(G.tokenType, i * 7)}<b>${p.tokens}</b>`}
    </span>`).join('')}
    <span class="pchip potchip" id="pot">${G.phase === 'charge' ? 'Pot' : 'Milieu'} <b>${G.pot}</b></span>
  </div>`;
}
