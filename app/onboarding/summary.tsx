import { StartingPointScreen } from '../../src/onboarding/StartingPointScreen';
import { useFinishOnboarding } from '../../src/onboarding/useFinishOnboarding';

export default function OnboardingSummary() {
  const { finish, saving, failed } = useFinishOnboarding();
  return <StartingPointScreen onFinish={() => void finish()} saving={saving} failed={failed} />;
}
