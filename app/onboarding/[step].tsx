import { Redirect, useLocalSearchParams } from 'expo-router';

import { isQuestionId } from '../../src/onboarding/flow';
import { QUESTION_COMPONENTS } from '../../src/onboarding/questions';

export default function OnboardingStep() {
  const { step } = useLocalSearchParams<{ step: string }>();
  if (!isQuestionId(step)) return <Redirect href="/onboarding" />;
  const Question = QUESTION_COMPONENTS[step];
  return <Question />;
}
