import { Platform, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useT, type TranslationKey } from '../src/i18n';
import {
  batteryBrandFor,
  openBatterySettings,
  type BatteryBrand,
} from '../src/notifications/permissions';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { Screen } from '../src/ui/Screen';
import { useTheme } from '../src/ui/theme';

const BRANDS: readonly BatteryBrand[] = ['samsung', 'xiaomi', 'huawei', 'oppo', 'google', 'other'];

/** Battery optimization help: the steps differ by manufacturer, so all are listed, the user's first. */
export default function Bateria() {
  const t = useT();
  const theme = useTheme();
  const constants = Platform.constants as { Manufacturer?: string };
  const manufacturer = constants.Manufacturer;
  const mine = batteryBrandFor(manufacturer);
  const ordered = [mine, ...BRANDS.filter((brand) => brand !== mine)];

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingTop: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('battery.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('battery.intro')}
        </Text>
        {mine !== 'other' && manufacturer ? (
          <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
            {t('battery.yours', { brand: manufacturer })}
          </Text>
        ) : null}
        <Button label={t('battery.open')} onPress={() => void openBatterySettings()} />
        {ordered.map((brand) => (
          <Card key={brand} variant={brand === mine ? 'highlight' : 'default'}>
            <Text style={[theme.text('body'), { color: theme.color.text }]}>
              {t(`battery.${brand}` satisfies TranslationKey)}
            </Text>
          </Card>
        ))}
        <Button label={t('battery.back')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
