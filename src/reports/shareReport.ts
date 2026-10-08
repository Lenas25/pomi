// The ONLY report code that touches the platform: React Native `Share` (text), expo-print
// (`printToFileAsync`, verified against docs.expo.dev/versions/latest/sdk/print), expo-sharing and
// expo-file-system. Everything else in `src/reports` is pure.
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

import { deleteAfterGrace, removeStaleCacheFiles, safely } from '../backup/files';
import { expoPhotoFs } from '../photos/expoPhotoFs';

/** `pomi-report-<date>.pdf` files this app created earlier. */
export function isReportExportName(name: string): boolean {
  return /^pomi-report-.*\.pdf$/.test(name);
}

export type ShareOutcome = 'shared' | 'dismissed' | 'unavailable';

/** Shares plain text through the system share sheet. Nothing is written to disk. */
export async function shareText(message: string, title: string): Promise<ShareOutcome> {
  const result = await Share.share({ message, title });
  return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

/** Photo file names -> `data:image/jpeg;base64,...` for the files that still exist. */
export async function readPhotoSources(names: readonly string[]): Promise<Record<string, string>> {
  const sources: Record<string, string> = {};
  for (const name of names) {
    try {
      if (expoPhotoFs.exists(name)) {
        sources[name] = `data:image/jpeg;base64,${await expoPhotoFs.readBase64(name)}`;
      }
    } catch {
      // A photo that cannot be read is left out; the caption still lists it.
    }
  }
  return sources;
}

/**
 * Prints the HTML to a PDF in the cache, shares it and removes it afterwards (a minute after a
 * successful share, right away on failure; stale ones from earlier runs go first).
 */
export async function sharePdf(
  html: string,
  fileName: string,
  dialogTitle: string,
): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  removeStaleCacheFiles(isReportExportName);
  const printed = await Print.printToFileAsync({ html });
  const file = new File(printed.uri);
  let keepForGrace = false;
  try {
    // A readable name for the receiving app (the printed file has a random one).
    await file.move(new File(Paths.cache, fileName), { overwrite: true });
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle,
    });
    keepForGrace = true;
    return 'shared';
  } finally {
    if (keepForGrace) deleteAfterGrace(file);
    else safely(() => file.delete());
  }
}
