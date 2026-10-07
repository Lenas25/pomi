import type { ImageSourcePropType } from 'react-native';

// Typed registry for bundled images. File names follow design/ASSETS.md so final art
// (same names, same sizes) replaces the placeholders without code changes.
// Metro resolves @2x/@3x variants automatically from the base name.

export const MASCOT_POSES = [
  'hola',
  'enfocado',
  'agua',
  'celebra',
  'descansa',
  'curioso',
  'tranqui',
  'mide',
  'camina',
  'vacio',
] as const;

export type MascotPose = (typeof MASCOT_POSES)[number];

export const mascotImages: Record<MascotPose, ImageSourcePropType> = {
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
};
