// The ONLY report code that touches the platform: React Native `Share` (text), expo-print
// (`printToFileAsync`, verified against docs.expo.dev/versions/latest/sdk/print), expo-sharing and
// expo-file-system. Everything else in `src/reports` is pure.
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

import { deleteAfterGrace, removeStaleCacheFiles, safely } from '../backup/files';
import { expoPhotoFs } from '../photos/expoPhotoFs';
import { resizeToJpeg, type ResizeToJpeg } from '../photos/imageResize';

import { isReportExportName } from './exportName';
import { fitPhotoBudget, type PhotoSelection } from './photoBudget';

export { isReportExportName };

export type ShareOutcome = 'shared' | 'dismissed' | 'unavailable';

/** Shares plain text through the system share sheet. Nothing is written to disk. */
export async function shareText(message: string, title: string): Promise<ShareOutcome> {
  const result = await Share.share({ message, title });
  return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

/** Width (px) photos are downscaled to before they are embedded in the PDF. */
export const REPORT_PHOTO_WIDTH = 1000;

/** What `collectPhotoSources` needs from the platform, so it is tested with fakes. */
export type PhotoSourceIo = {
  exists: (name: string) => boolean;
  uriOf: (name: string) => string;
  /** Downscaled JPEG copy (compress 0.7) in the cache; returns its URI. */
  resize: ResizeToJpeg;
  readBase64: (uri: string) => Promise<string>;
  /** Deletes a cache file; never throws. */
  discard: (uri: string) => void;
};

const defaultIo: PhotoSourceIo = {
  exists: (name) => expoPhotoFs.exists(name),
  uriOf: (name) => expoPhotoFs.uriOf(name),
  resize: resizeToJpeg,
  readBase64: (uri) => new File(uri).base64(),
  discard: (uri) => safely(() => new File(uri).delete()),
};

/**
 * Photo file names -> `data:image/jpeg;base64,...` of a ~1000 px JPEG copy, for the files that still
 * exist, within the byte cap. The temporary copy is deleted once embedded. `dropped` counts the
 * photos left out (missing, unreadable or over the cap): the PDF says so.
 */
export async function collectPhotoSources(
  names: readonly string[],
  io: PhotoSourceIo,
): Promise<PhotoSelection> {
  const candidates: { name: string; uri: string | null }[] = [];
  for (const name of names) {
    let uri: string | null = null;
    let resized: string | null = null;
    try {
      if (io.exists(name)) {
        resized = await io.resize(io.uriOf(name), REPORT_PHOTO_WIDTH);
        uri = `data:image/jpeg;base64,${await io.readBase64(resized)}`;
      }
    } catch {
      // A photo that cannot be read is left out; the caption still lists it.
    } finally {
      if (resized !== null) io.discard(resized);
    }
    candidates.push({ name, uri });
  }
  return fitPhotoBudget(candidates);
}

export const readPhotoSources = (names: readonly string[]): Promise<PhotoSelection> =>
  collectPhotoSources(names, defaultIo);

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
