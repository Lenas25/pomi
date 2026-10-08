import { Stack } from 'expo-router';

import { useTheme } from '../../src/ui/theme';

export default function OnboardingLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.bg } }}
    />
  );
}
