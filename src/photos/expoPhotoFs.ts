// The ONLY photo code that touches expo-file-system (SDK 57 `File` / `Directory` / `Paths`).
import { Directory, File, Paths } from 'expo-file-system';

import type { PhotoFs } from './photoStore';

const FOLDER = 'photos';

function folder(): Directory {
  const directory = new Directory(Paths.document, FOLDER);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function fileOf(name: string): File {
  return new File(folder(), name);
}

export const expoPhotoFs: PhotoFs = {
  async store(sourceUri, name) {
    // Private copy first, then the cache file goes away; a failed copy leaves the capture alone.
    const source = new File(sourceUri);
    await source.copy(fileOf(name), { overwrite: true });
    try {
      source.delete();
    } catch {
      // The cache is cleaned by the system anyway.
    }
  },
  remove(name) {
    const file = fileOf(name);
    if (file.exists) file.delete();
  },
  exists: (name) => fileOf(name).exists,
  uriOf: (name) => fileOf(name).uri,
  list: () =>
    folder()
      .list()
      .flatMap((entry) => (entry instanceof File ? [entry.name] : [])),
  size: (name) => {
    const file = fileOf(name);
    return file.exists ? file.size : 0;
  },
  readBase64: (name) => fileOf(name).base64(),
  async writeBase64(name, base64) {
    // Temp file first, then move over the final name: a crash mid-write leaves only a `.tmp`
    // (swept as an orphan), never a truncated photo under a real name.
    const temp = fileOf(`${name}.tmp`);
    try {
      if (!temp.exists) temp.create();
      temp.write(base64, { encoding: 'base64' });
      await temp.move(fileOf(name), { overwrite: true });
    } catch (error) {
      try {
        if (temp.exists) temp.delete();
      } catch {
        // Swept as an orphan later.
      }
      throw error;
    }
  },
  discard(uri) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // The cache is cleaned by the system anyway.
    }
  },
};
