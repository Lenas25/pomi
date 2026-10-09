import { describe, expect, it } from '@jest/globals';

import appJson from '../../app.json';
import tokens from '../../design/tokens.json';
import easJson from '../../eas.json';

type PluginConfig = Record<string, unknown>;

function pluginConfig(name: string): PluginConfig {
  for (const plugin of appJson.expo.plugins) {
    if (Array.isArray(plugin) && plugin[0] === name) return plugin[1] as PluginConfig;
  }
  throw new Error(`Plugin ${name} is not configured in app.json`);
}

describe('app.json colors match design tokens', () => {
  it('uses the token backgrounds for the splash screen (light and dark)', () => {
    const splash = pluginConfig('expo-splash-screen');
    expect(splash.backgroundColor).toBe(tokens.color.light.bg);
    expect((splash.dark as PluginConfig).backgroundColor).toBe(tokens.color.dark.bg);
  });

  it('uses the brick accent for the notification color', () => {
    expect(pluginConfig('expo-notifications').color).toBe(tokens.color.palette['brick-500']);
  });

  it('uses the sand token as the solid adaptive icon background (no background image)', () => {
    const adaptive: Record<string, unknown> = appJson.expo.android.adaptiveIcon;
    expect(adaptive.backgroundColor).toBe(tokens.color.palette['sand-500']);
    expect(adaptive.backgroundImage).toBeUndefined();
  });
});

describe('release configuration', () => {
  it('declares the Health Connect permissions the sedentary nudge needs (steps, background read)', () => {
    const permissions: string[] = appJson.expo.android.permissions;
    expect(permissions).toContain('android.permission.health.READ_STEPS');
    expect(permissions).toContain('android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND');
  });

  it('turns Android auto backup off: the JSON backup is the only copy of the data', () => {
    expect((appJson.expo.android as { allowBackup?: boolean }).allowBackup).toBe(false);
  });

  it('has a versionCode and a semver version', () => {
    expect(appJson.expo.android.versionCode).toBeGreaterThanOrEqual(1);
    expect(appJson.expo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('defines the development, preview (APK) and production (AAB) EAS profiles', () => {
    expect(easJson.build.development).toMatchObject({
      developmentClient: true,
      distribution: 'internal',
    });
    expect(easJson.build.preview).toMatchObject({
      distribution: 'internal',
      android: { buildType: 'apk' },
    });
    expect(easJson.build.production.android.buildType).toBe('app-bundle');
  });
});
