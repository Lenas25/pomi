import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TextField, ThemedTextInput } from './TextField';
import { fonts, ThemeProvider } from './theme';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('text inputs use the token font', () => {
  it('TextField sets an explicit font family (value and placeholder) without fontWeight', async () => {
    await render(
      <ThemeProvider mode="light">
        <TextField label="Name" placeholder="Your name" value="" onChangeText={() => undefined} />
      </ThemeProvider>,
    );
    const style = StyleSheet.flatten(screen.getByLabelText('Name').props.style);
    expect(style.fontFamily).toBe(fonts.body['400']);
    expect(style.fontWeight).toBeUndefined();
  });

  it('a caller style cannot override the font family', async () => {
    await render(
      <ThemeProvider mode="light">
        <ThemedTextInput
          accessibilityLabel="Reps"
          variant="body-strong"
          style={{ fontFamily: 'serif' }}
        />
      </ThemeProvider>,
    );
    const style = StyleSheet.flatten(screen.getByLabelText('Reps').props.style);
    expect(style.fontFamily).toBe(fonts.body['700']);
  });

  it('no screen renders a raw react-native TextInput (they all go through ThemedTextInput)', () => {
    const root = join(__dirname, '..', '..');
    const offenders = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'app'))]
      .filter((file) => !file.endsWith(join('src', 'ui', 'TextField.tsx')))
      .filter((file) => /<TextInput(\s|\/>)/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
