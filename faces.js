'use strict';
/* Dessin des faces de dés : style « lettres » ou « figures » (comme sur les cartes).
   Couleurs : 9 noir, 10 rouge, Valet bleu, Dame verte, Roi rouge, As noir (via la classe .fN). */

const DICE_STYLES = { letters: 'Lettres', images: 'Figures' };
let diceStyle = 'images';
try { diceStyle = localStorage.getItem('pm-dice') || 'images'; } catch (e) {}
if (!DICE_STYLES[diceStyle]) diceStyle = 'images';

function setDiceStyle(s) {
  if (!DICE_STYLES[s]) return;
  diceStyle = s;
  try { localStorage.setItem('pm-dice', s); } catch (e) {}
}

const SKIN = '#f3cfa6', GOLD = '#d9a520', GOLD_D = '#8a6510', INK = '#2a1a10';

// Buste commun : épaules dans la couleur du dé (currentColor), col blanc, visage
const bust = (collar = true) => `
  <path d="M10 100 Q12 72 50 68 Q88 72 90 100 Z" fill="currentColor"/>
  <path d="M10 100 Q12 72 50 68 Q88 72 90 100" fill="none" stroke="${INK}" stroke-width="2"/>
  ${collar ? `<path d="M30 71 Q50 86 70 71 L67 80 Q50 92 33 80 Z" fill="#fff" stroke="${INK}" stroke-width="1.5"/>` : ''}
  <rect x="44" y="58" width="12" height="12" fill="${SKIN}"/>`;
const face = (cy = 46) => `
  <ellipse cx="50" cy="${cy}" rx="14.5" ry="16.5" fill="${SKIN}" stroke="${INK}" stroke-width="1.5"/>
  <circle cx="44.5" cy="${cy - 2}" r="1.8" fill="${INK}"/><circle cx="55.5" cy="${cy - 2}" r="1.8" fill="${INK}"/>`;

const FIGURES = {
  // Valet : toque à plume, cheveux courts
  2: `${bust()}
    <path d="M35 40 Q34 30 50 29 Q66 30 65 40 Q60 34 50 34 Q40 34 35 40 Z" fill="#7a4a1d"/>
    ${face()}
    <path d="M48 52 Q50 54 52 52" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <path d="M28 36 Q30 18 52 17 Q74 18 74 33 Q52 27 28 36 Z" fill="currentColor" stroke="${INK}" stroke-width="1.5"/>
    <path d="M30 34 Q52 26 73 31" fill="none" stroke="${GOLD}" stroke-width="3"/>
    <path d="M64 22 Q82 6 90 12 Q78 14 70 26 Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.2"/>`,
  // Dame : longs cheveux, diadème, lèvres
  3: `<path d="M31 48 Q28 74 38 80 L62 80 Q72 74 69 48 Q67 26 50 26 Q33 26 31 48 Z" fill="#7a4a1d" stroke="${INK}" stroke-width="1.5"/>
    ${bust()}
    ${face()}
    <path d="M46.5 53 Q50 56 53.5 53 Q50 54.5 46.5 53 Z" fill="#c0262d" stroke="#c0262d" stroke-width="1"/>
    <path d="M36 32 L40 22 L45 29 L50 16 L55 29 L60 22 L64 32 Q50 27 36 32 Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.3"/>
    <circle cx="50" cy="25" r="2.4" fill="currentColor"/>`,
  // Roi : couronne, barbe, col d'hermine
  4: `${bust(false)}
    <path d="M28 72 Q50 86 72 72 L70 82 Q50 94 30 82 Z" fill="#fff" stroke="${INK}" stroke-width="1.5"/>
    <g fill="${INK}"><circle cx="38" cy="80" r="1.3"/><circle cx="50" cy="85" r="1.3"/><circle cx="62" cy="80" r="1.3"/></g>
    ${face()}
    <path d="M35.5 48 Q35 70 50 73 Q65 70 64.5 48 Q60 57 50 56 Q40 57 35.5 48 Z" fill="#8a5a2b" stroke="${INK}" stroke-width="1.3"/>
    <path d="M43 54 Q50 51 57 54" fill="none" stroke="${INK}" stroke-width="1.6"/>
    <path d="M33 34 L32 14 L41 23 L50 9 L59 23 L68 14 L67 34 Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.5"/>
    <g fill="currentColor"><circle cx="41" cy="29" r="2.3"/><circle cx="50" cy="28" r="2.6"/><circle cx="59" cy="29" r="2.3"/></g>`,
  // As : grand A orné
  5: `<circle cx="50" cy="52" r="38" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <circle cx="50" cy="52" r="32" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3"/>
    <text x="50" y="69" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="50" fill="currentColor">A</text>`,
};

// Contenu HTML d'une face (à mettre dans un élément .die.fN)
function faceInner(v) {
  if (diceStyle === 'images' && FIGURES[v]) {
    return `<svg class="fig" viewBox="0 0 100 100" aria-hidden="true">${FIGURES[v]}</svg>` +
      (v !== 5 ? `<span class="corner">${FACES[v]}</span>` : '') +
      `<span class="sr">${FACE_NAMES[v]}</span>`;
  }
  return `<span class="fv">${FACES[v]}</span>`;
}

// Aperçu d'une face dans un style donné (pour le menu)
function faceInnerAs(style, v) {
  const keep = diceStyle;
  diceStyle = style;
  const html = faceInner(v);
  diceStyle = keep;
  return html;
}
