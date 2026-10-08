// Validates template JSON files with the app's own importer (via Jest, so TypeScript and zod run
// exactly as in the app). Usage:
//   npm run validate:templates                      every JSON under templates/
//   npm run validate:templates -- path/to/file.json a single file or a folder
// Exit code 0 = all valid (CI-friendly).
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const target = process.argv[2];
const env = { ...process.env, ...(target ? { TEMPLATES_PATH: path.resolve(target) } : {}) };
const result = spawnSync(
  process.execPath,
  [
    require.resolve('jest/bin/jest'),
    '--runTestsByPath',
    'src/templates/validateFiles.test.ts',
    '--silent=false',
  ],
  { stdio: 'inherit', env, cwd: path.resolve(__dirname, '..') },
);
process.exit(result.status ?? 1);
