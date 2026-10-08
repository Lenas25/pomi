import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from './theme';

type TextFieldProps = Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'placeholder'
  | 'inputMode'
  | 'maxLength'
  | 'autoFocus'
  | 'onSubmitEditing'
> & {
  label: string;
  /** Error text; also flips the border to the error color and is announced. */
  error?: string | undefined;
};

/** Labelled single-line input with a 48 dp minimum height. */
export function TextField({ label, error, ...input }: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[1] }}>
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={theme.color.textMuted}
        returnKeyType="done"
        style={[
          theme.text('body'),
          {
            minHeight: Math.max(theme.control.md, theme.touch.gym),
            borderRadius: theme.radius.md,
            borderWidth: theme.stroke.bold,
            borderColor: error ? theme.color.error : theme.color.border,
            backgroundColor: theme.color.surface,
            color: theme.color.text,
            paddingHorizontal: theme.space[4],
          },
        ]}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.text('caption'), { color: theme.color.error }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
