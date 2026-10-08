import { describe, expect, it } from '@jest/globals';

import appJson from '../../app.json';
import tokens from '../../design/tokens.json';

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

  it('uses the brand blue for the notification accent', () => {
    expect(pluginConfig('expo-notifications').color).toBe(tokens.color.palette['blue-500']);
  });

  it('does not hardcode an adaptive icon background color that drifts from the tokens', () => {
    const adaptive: Record<string, unknown> = appJson.expo.android.adaptiveIcon;
    const background = adaptive.backgroundColor;
    if (background !== undefined) expect(background).toBe(tokens.color.light.bg);
  });
});
