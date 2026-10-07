// Reanimated and Worklets need native modules that do not exist under Jest; use their official mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  // Not provided by the official mock.
  useReducedMotion: () => false,
}));
