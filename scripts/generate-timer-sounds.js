// Generates the timer sounds as 16-bit mono PCM WAV files using only Node built-ins.
//   beep.wav  - short tick for the 3-2-1 countdown and for cardio segment changes.
//   alarm.wav - three rising pulses played when a timer ends in the foreground.
// Run: npm run assets:sounds
const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

/** A sine tone with a short attack and an exponential-ish release so it does not click. */
function tone(freq, durationSec, volume) {
  const total = Math.round(durationSec * SAMPLE_RATE);
  const attack = Math.round(0.005 * SAMPLE_RATE);
  const samples = new Float64Array(total);
  for (let i = 0; i < total; i += 1) {
    const envelope = Math.min(1, i / attack) * Math.pow(1 - i / total, 1.5);
    samples[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * envelope * volume;
  }
  return samples;
}

function silence(durationSec) {
  return new Float64Array(Math.round(durationSec * SAMPLE_RATE));
}

function concat(parts) {
  const out = new Float64Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function toWav(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  });
  return buffer;
}

const sounds = {
  'beep.wav': tone(880, 0.12, 0.8),
  'alarm.wav': concat([
    tone(784, 0.22, 0.9),
    silence(0.08),
    tone(988, 0.22, 0.9),
    silence(0.08),
    tone(1319, 0.5, 0.9),
  ]),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
  fs.writeFileSync(path.join(OUT_DIR, name), toWav(samples));
  console.log(`wrote assets/sounds/${name} (${samples.length} samples)`);
}
