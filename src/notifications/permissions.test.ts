import { describe, expect, it, jest } from '@jest/globals';

import { batteryBrandFor, openWithFallback } from './permissions';

jest.mock('expo-notifications', () => ({}));
jest.mock('expo-intent-launcher', () => ({ ActivityAction: {}, startActivityAsync: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: null } }));
jest.mock('./channels', () => ({ ensureChannels: jest.fn() }));

describe('openWithFallback', () => {
  it('uses the primary screen when it exists', async () => {
    const fallback = jest.fn(async () => undefined);
    expect(await openWithFallback(async () => undefined, fallback)).toBe(true);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to the app settings when the primary screen is missing on this device', async () => {
    const fallback = jest.fn(async () => undefined);
    expect(
      await openWithFallback(async () => Promise.reject(new Error('no activity')), fallback),
    ).toBe(true);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('reports failure when nothing opens', async () => {
    const fail = async () => Promise.reject(new Error('nope'));
    expect(await openWithFallback(fail, fail)).toBe(false);
  });
});

describe('batteryBrandFor', () => {
  it.each<[string | undefined, string]>([
    ['samsung', 'samsung'],
    ['Xiaomi', 'xiaomi'],
    ['POCO', 'xiaomi'],
    ['HUAWEI', 'huawei'],
    ['OnePlus', 'oppo'],
    ['realme', 'oppo'],
    ['Google', 'google'],
    ['Motorola', 'other'],
    [undefined, 'other'],
  ])('%s -> %s', (manufacturer, brand) => {
    expect(batteryBrandFor(manufacturer)).toBe(brand);
  });
});
