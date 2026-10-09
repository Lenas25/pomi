import { afterEach, describe, expect, it } from '@jest/globals';

import { settings } from './schema';
import { removeLegacySettings } from './legacySettings';
import { createTestDb } from './testing/createTestDb';

let close: (() => void) | undefined;

afterEach(() => {
  close?.();
  close = undefined;
});

describe('removeLegacySettings', () => {
  it('deletes the removed AI rows, keeps the rest and is idempotent', async () => {
    const test = await createTestDb();
    close = test.close;
    test.exec(`
      insert into settings (key, value) values
        ('aiConnection', '{"enabled":true}'), ('aiChat', '[]'), ('themeMode', '"dark"');
    `);

    await removeLegacySettings(test.db);
    await removeLegacySettings(test.db);

    const keys = (await test.db.select({ key: settings.key }).from(settings)).map((r) => r.key);
    expect(keys).toEqual(['themeMode']);
  });
});
