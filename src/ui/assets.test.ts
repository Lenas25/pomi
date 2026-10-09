import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { mascotImages } from './assets';

describe('mascot registry', () => {
  it('has a source PNG for every pose and no unregistered poses on disk', () => {
    const dir = join(__dirname, '../../assets/mascot');
    const onDisk = readdirSync(dir)
      .filter((file) => /^pomi-[a-z]+\.png$/.test(file))
      .map((file) => file.replace(/^pomi-|\.png$/g, ''))
      .sort();
    expect(Object.keys(mascotImages).sort()).toEqual(onDisk);
  });

  it('ships @2x and @3x files for every pose', () => {
    const dir = join(__dirname, '../../assets/mascot');
    for (const pose of Object.keys(mascotImages)) {
      for (const suffix of ['', '@2x', '@3x']) {
        expect(existsSync(join(dir, `pomi-${pose}${suffix}.png`))).toBe(true);
      }
    }
  });
});
