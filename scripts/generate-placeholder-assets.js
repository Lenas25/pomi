/**
 * Generates placeholder brand assets (lavender-grey circle with a sand belly, a brick sweatband and
 * the "o" face) using only Node built-ins. File names follow design/ASSETS.md so final art can
 * replace them without code changes. Poses and icons with final art (built from assets/source/ by
 * scripts/generate-brand-assets.py) are skipped.
 * Run: npm run assets:generate
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const tokens = require('../design/tokens.json');

const ROOT = path.join(__dirname, '..', 'assets');
const { palette } = tokens.color;

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Sweatband: a horizontal stripe near the top of the head (unit coordinates, radius 1). */
const bandHit = (y) => y >= -0.62 && y <= -0.42;
/** Belly: an ellipse in the lower half. */
const bellyHit = (x, y) => (x / 0.55) ** 2 + ((y - 0.72) / 0.34) ** 2 <= 1;

/** Coverage (0..1) of the face (eyes + smile) at unit coordinates where the head has radius 1. */
function faceHit(x, y) {
  const eye = (cx) => Math.hypot(x - cx, y + 0.12) <= 0.11;
  const smileDist = Math.abs(Math.hypot(x, y - 0.05) - 0.42);
  const smile = smileDist <= 0.04 && y > 0.2;
  return eye(-0.33) || eye(0.33) || smile;
}

/**
 * Renders an RGBA image.
 * @param {number} size
 * @param {{radius: number, circle: string, face: string | null, background?: string, belly?: string, band?: string}} opts
 * face === null cuts the face out of the circle (silhouette icons).
 */
function render(size, { radius, circle, face, background, belly, band }) {
  const px = Buffer.alloc(size * size * 4);
  const bodyRgb = hexToRgb(circle);
  const bellyRgb = belly ? hexToRgb(belly) : bodyRgb;
  const bandRgb = band ? hexToRgb(band) : bodyRgb;
  const circleRgb = [0, 0, 0];
  const faceRgb = face ? hexToRgb(face) : circleRgb;
  const bgRgb = background ? hexToRgb(background) : [0, 0, 0];
  const bgA = background ? 1 : 0;
  const R = radius * size;
  const c = size / 2;
  const samples = [0.25, 0.75];
  for (let py = 0; py < size; py++) {
    for (let pxx = 0; pxx < size; pxx++) {
      let inCircle = 0;
      let inFace = 0;
      circleRgb.fill(0);
      for (const sy of samples) {
        for (const sx of samples) {
          const dx = pxx + sx - c;
          const dy = py + sy - c;
          if (Math.hypot(dx, dy) <= R) {
            inCircle++;
            const ux = dx / R;
            const uy = dy / R;
            if (faceHit(ux, uy)) inFace++;
            const part = bandHit(uy) ? bandRgb : bellyHit(ux, uy) ? bellyRgb : bodyRgb;
            for (let k = 0; k < 3; k++) circleRgb[k] += part[k];
          }
        }
      }
      if (inCircle > 0) for (let k = 0; k < 3; k++) circleRgb[k] /= inCircle;
      const cov = inCircle / 4;
      const faceCov = inFace / 4;
      // Circle alpha, minus the face when it is a cut-out.
      const circleA = face ? cov : cov - faceCov;
      const faceA = face ? faceCov : 0;
      const outA = circleA + faceA + bgA * (1 - circleA - faceA);
      const i = (py * size + pxx) * 4;
      if (outA > 0) {
        const bgW = bgA * (1 - circleA - faceA);
        const circleW = face ? circleA - faceA : circleA;
        for (let k = 0; k < 3; k++) {
          const v = (circleRgb[k] * circleW + faceRgb[k] * faceA + bgRgb[k] * bgW) / outA;
          px[i + k] = Math.round(v);
        }
      }
      px[i + 3] = Math.round(Math.min(1, outA) * 255);
    }
  }
  return px;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(relPath, content) {
  const file = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function png(relPath, size, opts) {
  write(relPath, encodePng(size, render(size, opts)));
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

const lavender = palette['lavender-500'];
const graphite = palette['graphite-900'];
const sand = palette['sand-500'];
const brick = palette['brick-500'];
const mascot = { circle: lavender, belly: sand, band: brick, face: graphite };

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
