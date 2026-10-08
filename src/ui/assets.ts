import type { ImageSourcePropType } from 'react-native';

// Typed registry for bundled images. File names follow design/ASSETS.md so final art
// (same names, same sizes) replaces the placeholders without code changes.
// Metro resolves @2x/@3x variants automatically from the base name.

export const mascotImages = {
  hola: require('../../assets/mascot/pomi-hola.png'),
  enfocado: require('../../assets/mascot/pomi-enfocado.png'),
  agua: require('../../assets/mascot/pomi-agua.png'),
  celebra: require('../../assets/mascot/pomi-celebra.png'),
  descansa: require('../../assets/mascot/pomi-descansa.png'),
  curioso: require('../../assets/mascot/pomi-curioso.png'),
  tranqui: require('../../assets/mascot/pomi-tranqui.png'),
  mide: require('../../assets/mascot/pomi-mide.png'),
  camina: require('../../assets/mascot/pomi-camina.png'),
  vacio: require('../../assets/mascot/pomi-vacio.png'),
} as const satisfies Record<string, ImageSourcePropType>;

/** Derived from the registry, so adding an image is the only step needed to add a pose. */
export type MascotPose = keyof typeof mascotImages;
