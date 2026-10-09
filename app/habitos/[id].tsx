import { useLocalSearchParams } from 'expo-router';

import { CheckDetailScreen } from '../../src/habits/HabitDetailScreens';

export default function HabitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CheckDetailScreen habitId={typeof id === 'string' ? id : ''} />;
}
