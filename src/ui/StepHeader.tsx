import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ArrowLeft } from 'phosphor-react-native';

import { useTheme } from './theme';

type StepHeaderProps = {
  /** Spoken name of the back button. */
  backLabel: string;
  /** Omitted on the first step: the slot stays, empty, so nothing beside it moves. */
  onBack?: () => void;
  /** Progress bar or title, vertically centred in the remaining width. */
  children: ReactNode;
};

/**
 * Header row of a step flow (onboarding, check-in). The back button lives in a FIXED 48×48 slot
 * that is always present, so the row height and the content position never change between steps.
 */
export function StepHeader({ backLabel, onBack, children }: StepHeaderProps) {
  const theme = useTheme();
  const slot = {
    width: theme.touch.gym,
    height: theme.touch.gym,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;
  return (
    <View
      testID="step-header"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        minHeight: theme.touch.gym,
      }}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          style={slot}
        >
          <ArrowLeft color={theme.color.text} />
        </Pressable>
      ) : (
        <View testID="step-header-back-slot" accessible={false} style={slot} />
      )}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        {children}
      </View>
    </View>
  );
}
