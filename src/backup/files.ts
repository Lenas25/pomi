// The only place that touches the file system, the share sheet and the file picker (Expo SDK 57:
// expo-file-system `File`/`Paths`, expo-sharing, expo-document-picker). Everything else is pure.
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

/** Writes `contents` to the cache directory and opens the share sheet. */
export async function shareJsonFile(
  fileName: string,
  contents: string,
  dialogTitle: string,
): Promise<'shared' | 'unavailable'> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(contents);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle });
  return 'shared';
}

/**
 * Lets the person pick a file and returns its text, or `null` when they cancel. Any type is
 * offered because Android often labels `.json` files as `application/octet-stream`; the content is
 * validated afterwards. `copyToCacheDirectory` (the default) is required so the file can be read.
 */
export async function pickTextFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: false,
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return new File(asset.uri).text();
}
