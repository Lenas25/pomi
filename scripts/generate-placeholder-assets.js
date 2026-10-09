/**
 * Generates placeholder brand assets (lavender-grey circle with a sand belly, a brick sweatband and
 * the "o" face) using only Node built-ins. File names follow design/ASSETS.md so final art can
 * replace them without code changes. Poses and icons with final art (built from assets/source/ by
 * scripts/generate-brand-assets.py) are skipped.
 * Run: npm run assets:generate
 */
const fs = require('node:fs');
const path = require('node:path');

const tokens = require('../design/tokens.json');

const ROOT = path.join(__dirname, '..', 'assets');
const { palette } = tokens.color;

function write(relPath, content) {
  const file = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Placeholder vector: lavender-grey circle, sand belly, brick sweatband and the "o" face. */
function svg(opts = {}) {
  const fill = opts.fill ?? palette['lavender-500'];
  const ink = opts.ink ?? palette['graphite-900'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 2 2" width="200" height="200">
  <clipPath id="body"><circle r="1"/></clipPath>
  <circle r="1" fill="${fill}"/>
  <ellipse cx="0" cy="0.72" rx="0.55" ry="0.34" fill="${palette['sand-500']}" clip-path="url(#body)"/>
  <rect x="-1" y="-0.62" width="2" height="0.2" fill="${palette['brick-500']}" clip-path="url(#body)"/>
  <circle cx="-0.33" cy="-0.12" r="0.11" fill="${ink}"/>
  <circle cx="0.33" cy="-0.12" r="0.11" fill="${ink}"/>
  <path d="M -0.42 0.05 A 0.42 0.42 0 0 0 0.42 0.05" fill="none" stroke="${ink}" stroke-width="0.08" stroke-linecap="round" transform="translate(0 0)"/>
</svg>
`;
}

const sand = palette['sand-500'];

// Mascot poses have final art (scripts/generate-brand-assets.py from assets/source/mascot/).

// App and system icons: all have final art (scripts/generate-brand-assets.py); the adaptive icon
// background is the solid `android.adaptiveIcon.backgroundColor` in app.json.

// Vector placeholders (exact names from ASSETS.md; not bundled until final art lands).
write('brand/pomi-symbol.svg', svg());
write('brand/pomi-wordmark.svg', svg());
write('brand/pomi-wordmark-inverse.svg', svg({ ink: sand }));
write('brand/pomi-lockup-horizontal.svg', svg());
for (const name of ['mancuerna', 'botella', 'corazon', 'cronometro']) {
  write(`illustrations/${name}.svg`, svg());
}

console.log('Placeholder assets written to assets/');
