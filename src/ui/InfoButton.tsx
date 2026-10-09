import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Info } from 'phosphor-react-native';

import { useT } from '../i18n';
import { BottomSheet } from './BottomSheet';
import { useTheme } from './theme';

type InfoButtonProps = {
  /** Sheet title, also spoken in the button label ("More info: <title>"). */
  title: string;
  /** The detail kept out of the screen: one paragraph per entry. */
  body: string | readonly string[];
};

/** A 48 dp (i) button that opens the long explanation of a setting in a bottom sheet. */
export function InfoButton({ title, body }: InfoButtonProps) {
  const t = useT();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const paragraphs = typeof body === 'string' ? [body] : body;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('info.open', { topic: title })}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          width: theme.touch.gym,
          height: theme.touch.gym,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? theme.opacity.pressed : 1,
        })}
      >
        <Info color={theme.color.textMuted} />
      </Pressable>
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title}
        closeLabel={t('info.close')}
      >
        <View style={{ gap: theme.space[3] }}>
          {paragraphs.map((text) => (
            <Text key={text} style={[theme.text('body'), { color: theme.color.text }]}>
              {text}
            </Text>
          ))}
        </View>
      </BottomSheet>
    </>
  );
}
