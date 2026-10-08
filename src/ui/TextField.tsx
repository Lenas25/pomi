import { useEffect, type Ref } from 'react';
import { AccessibilityInfo, Text, TextInput, View, type TextInputProps } from 'react-native';

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
  | 'returnKeyType'
  | 'blurOnSubmit'
  | 'multiline'
  | 'secureTextEntry'
  | 'autoCapitalize'
  | 'autoCorrect'
> & {
  label: string;
  /** Error text; also flips the border to the error color and is announced. */
  error?: string | undefined;
  /** To move focus to the next field from `onSubmitEditing`. */
  inputRef?: Ref<TextInput>;
};

/** Labelled single-line input with a 48 dp minimum height. */
export function TextField({
  label,
  error,
  inputRef,
  returnKeyType = 'done',
  ...input
}: TextFieldProps) {
  const theme = useTheme();
  // Live regions are not reliable for text that appears next to a focused input, so also announce.
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);
  return (
    <View style={{ gap: theme.space[1] }}>
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{label}</Text>
      <TextInput
        {...input}
        ref={inputRef}
        accessibilityLabel={label}
        placeholderTextColor={theme.color.textMuted}
        returnKeyType={returnKeyType}
        style={[
          theme.text('body'),
          {
            minHeight: Math.max(theme.control.md, theme.touch.gym) * (input.multiline ? 2 : 1),
            ...(input.multiline
              ? { textAlignVertical: 'top' as const, paddingVertical: theme.space[3] }
              : null),
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
