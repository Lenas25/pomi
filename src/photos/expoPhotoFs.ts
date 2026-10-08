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
  writeBase64(name, base64) {
    const file = fileOf(name);
    if (!file.exists) file.create();
    file.write(base64, { encoding: 'base64' });
  },
};
