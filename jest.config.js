module.exports = {
  preset: 'jest-expo',
  globalSetup: '<rootDir>/jest.global-setup.js',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testTimeout: 15000,
  // ponytail: capped workers; full parallelism starves RN render tests into timeouts on a loaded machine
  maxWorkers: '50%',
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
