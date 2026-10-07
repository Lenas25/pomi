const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = [
  { ignores: ['node_modules/', '.expo/', 'android/', 'ios/', 'dist/', 'coverage/'] },
  ...expoConfig,
  prettierConfig,
  {
    files: ['scripts/**/*.js', '*.config.js', 'jest.setup.js'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        jest: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
