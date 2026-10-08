import { readdirSync } from 'node:fs';
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
});
