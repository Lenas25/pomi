// The only place that touches the file system, the share sheet and the file picker (Expo SDK 57:
// expo-file-system `File`/`Directory`/`Paths`, expo-sharing, expo-document-picker). Everything else
// is pure.
import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

import { assertFileSize, isBackupExportName } from './limits';

/**
 * Android's chooser reports "done" as soon as a target is picked, while that app (a cloud upload,
 * for example) may still be reading the file through its content URI. So a successful share is only
 * deleted after this delay; the next export also sweeps whatever is left.
 */
const SHARED_FILE_GRACE_MS = 60_000;

function safely(action: () => void): void {
  try {
    action();
  } catch {
    // Best effort: a file that cannot be removed is swept by the next export.
  }
}

/** Removes `pomi-backup-*.json` / `pomi-photos-*.json` files left in the cache by earlier exports. */
function removeStaleBackups(): void {
  safely(() => {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof File && isBackupExportName(entry.name)) safely(() => entry.delete());
    }
  });
}

/** Writes `contents` to the cache directory and opens the share sheet. The file does not outlive it. */
export async function shareJsonFile(
  fileName: string,
  contents: string,
  dialogTitle: string,
  options: { sweep: boolean } = { sweep: true },
): Promise<'shared' | 'unavailable'> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  // Parts of one multi-file export pass `sweep: false` after the first, so they keep each other.
  if (options.sweep) removeStaleBackups();
  const file = new File(Paths.cache, fileName);
  let keepForGrace = false;
  try {
    file.create();
    await file.write(contents);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle });
    keepForGrace = true;
    return 'shared';
  } finally {
    if (keepForGrace) setTimeout(() => safely(() => file.delete()), SHARED_FILE_GRACE_MS);
    else safely(() => file.delete());
  }
}

/**
 * Lets the person pick a file and returns its text, or `null` when they cancel. Any type is
 * offered because Android often labels `.json` files as `application/octet-stream`; the content is
 * validated afterwards. `copyToCacheDirectory` (the default) is required so the file can be read.
 * Throws `FileTooLargeError` (before reading anything) above `maxBytes`. The cached copy is
 * deleted once read.
 */
export async function pickTextFile(maxBytes: number): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: false,
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  try {
    assertFileSize(asset.size, maxBytes);
    assertFileSize(file.size, maxBytes);
    return await file.text();
  } finally {
    safely(() => file.delete());
  }
}
