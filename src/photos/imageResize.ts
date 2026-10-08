// The ONLY code that touches expo-image-manipulator (SDK 57 contextual API; `manipulateAsync` is
// deprecated). A small adapter so the rest of the photo code is tested with a fake.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type ResizeToJpeg = (sourceUri: string, width: number) => Promise<string>;

/** Resizes the image at `sourceUri` to `width` px (aspect kept) and returns the cache JPEG URI. */
export const resizeToJpeg: ResizeToJpeg = async (sourceUri, width) => {
  const context = ImageManipulator.manipulate(sourceUri);
  try {
    const image = await context.resize({ width }).renderAsync();
    const result = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    return result.uri;
  } finally {
    context.release();
  }
};
