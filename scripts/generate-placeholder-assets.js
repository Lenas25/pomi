/**
 * Generates placeholder brand assets (blue-500 circle with the "o" face) using only Node built-ins.
 * File names follow design/ASSETS.md so final art can replace them without code changes.
 * Run: npm run assets:generate
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const tokens = require('../design/tokens.json');

const ROOT = path.join(__dirname, '..', 'assets');
const { palette } = tokens.color;

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const MASCOT_POSES = [
  'hola',
  'enfocado',
  'agua',
  'celebra',
  'descansa',
  'curioso',
  'tranqui',
  'mide',
  'camina',
  'vacio',
];

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
 * @param {{radius: number, circle: string, face: string | null, background?: string}} opts
 * face === null cuts the face out of the circle (silhouette icons).
 */
function render(size, { radius, circle, face, background }) {
  const px = Buffer.alloc(size * size * 4);
  const circleRgb = hexToRgb(circle);
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
      for (const sy of samples) {
        for (const sx of samples) {
          const dx = pxx + sx - c;
          const dy = py + sy - c;
          if (Math.hypot(dx, dy) <= R) {
            inCircle++;
            if (faceHit(dx / R, dy / R)) inFace++;
          }
        }
      }
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

/** Placeholder vector: blue-500 circle with the "o" face. */
function svg(opts = {}) {
  const fill = opts.fill ?? palette['blue-500'];
  const ink = opts.ink ?? palette['navy-900'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 2 2" width="200" height="200">
  <circle r="1" fill="${fill}"/>
  <circle cx="-0.33" cy="-0.12" r="0.11" fill="${ink}"/>
  <circle cx="0.33" cy="-0.12" r="0.11" fill="${ink}"/>
  <path d="M -0.42 0.05 A 0.42 0.42 0 0 0 0.42 0.05" fill="none" stroke="${ink}" stroke-width="0.08" stroke-linecap="round" transform="translate(0 0)"/>
</svg>
`;
}

const blue = palette['blue-500'];
const navy = palette['navy-900'];
const cream = palette['cream-50'];

// Mascot: 180 px @1x, plus @2x and @3x (BRAND 6.2 / ASSETS.md).
for (const pose of MASCOT_POSES) {
  for (const [suffix, scale] of [
    ['', 1],
    ['@2x', 2],
    ['@3x', 3],
  ]) {
    png(`mascot/pomi-${pose}${suffix}.png`, 180 * scale, {
      radius: 0.48,
      circle: blue,
      face: navy,
    });
  }
  write(`mascot/pomi-${pose}.svg`, svg());
}

// App and system icons.
png('icons/app-icon.png', 1024, { radius: 0.38, circle: blue, face: navy, background: cream });
png('icons/adaptive-foreground.png', 1024, { radius: 0.28, circle: blue, face: navy });
png('icons/adaptive-background.png', 1024, {
  radius: 0,
  circle: cream,
  face: navy,
  background: cream,
});
png('icons/adaptive-monochrome.png', 1024, { radius: 0.28, circle: '#000000', face: null });
png('icons/notification-icon.png', 96, { radius: 0.46, circle: '#FFFFFF', face: null });
png('icons/splash-icon.png', 1024, { radius: 0.4, circle: blue, face: navy });

// Vector placeholders (exact names from ASSETS.md; not bundled until final art lands).
write('brand/pomi-symbol.svg', svg());
write('brand/pomi-wordmark.svg', svg());
write('brand/pomi-wordmark-inverse.svg', svg({ ink: cream }));
write('brand/pomi-lockup-horizontal.svg', svg());
for (const name of ['mancuerna', 'botella', 'corazon', 'cronometro']) {
  write(`illustrations/${name}.svg`, svg());
}

console.log('Placeholder assets written to assets/');
