import { Redirect } from 'expo-router';

// Onboarding gating arrives with the database (M1); for now go straight to the tabs.
export default function Index() {
  return <Redirect href="/(tabs)/hoy" />;
}
