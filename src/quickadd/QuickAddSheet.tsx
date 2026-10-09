import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  Barbell,
  CheckCircle,
  Drop,
  ForkKnife,
  SunHorizon,
  type Icon,
} from 'phosphor-react-native';

import { getRepositories } from '../db';
import { dayKeyFor } from '../domain/time';
import { useGymTab } from '../gym/useGym';
import { useT } from '../i18n';
import { requestNotificationSync } from '../notifications/sync';
import { BottomSheet } from '../ui/BottomSheet';
import { useTheme, type SectionKey } from '../ui/theme';
import { addGlassOfWater, checkinKindAt } from './quickAdd';

type ActionRowProps = {
  icon: Icon;
  section: SectionKey;
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

/** A 56 dp row: tinted icon chip in the category color + label. */
function ActionRow({ icon: RowIcon, section, label, onPress, disabled = false }: ActionRowProps) {
  const theme = useTheme();
  const colors = theme.section[section];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        minHeight: theme.control.lg,
        paddingHorizontal: theme.space[2],
        borderRadius: theme.radius.md,
        backgroundColor: pressed ? colors.soft : theme.color.transparent,
        opacity: disabled ? theme.opacity.disabled : 1,
      })}
    >
      <View
        style={{
          width: theme.touch.gym,
          height: theme.touch.gym,
          borderRadius: theme.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.soft,
        }}
      >
        <RowIcon weight="fill" color={colors.text} />
      </View>
      <Text style={[theme.text('body-strong'), { color: theme.color.text, flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

/** Mounted only while the sheet is open (the Modal does not render hidden children). */
function QuickAddActions({ onDone }: { onDone: () => void }) {
  const t = useT();
  const theme = useTheme();
  const gym = useGymTab();
  const [waterStatus, setWaterStatus] = useState<string | null>(null);
  const [savingWater, setSavingWater] = useState(false);

  const go = (navigate: () => void) => {
    onDone();
    navigate();
  };

  const addWater = async () => {
    setSavingWater(true);
    try {
      const result = await addGlassOfWater(getRepositories(), dayKeyFor(new Date()));
      if (result.status === 'added') {
        void requestNotificationSync('dataChanged');
        setWaterStatus(
          result.target === null
            ? t('quickAdd.waterAddedNoTarget', { value: result.value })
            : t('quickAdd.waterAdded', { value: result.value, target: result.target }),
        );
      } else {
        setWaterStatus(t('quickAdd.noWater'));
      }
    } catch (error) {
      if (__DEV__) console.error('Could not add a glass', error);
      setWaterStatus(t('quickAdd.failed'));
    } finally {
      setSavingWater(false);
    }
  };

  const startGym = () => {
    const routineId =
      gym.status === 'ready' ? (gym.resumableRoutineId ?? gym.todayRoutineId) : null;
    go(() =>
      routineId
        ? router.push({ pathname: '/gym/session', params: { routineId } })
        : router.push('/gym'),
    );
  };

  return (
    <View style={{ gap: theme.space[1] }}>
      <ActionRow
        icon={Drop}
        section="agua"
        label={t('quickAdd.water')}
        disabled={savingWater}
        onPress={() => void addWater()}
      />
      {waterStatus ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            theme.text('caption'),
            { color: theme.section.agua.text, paddingHorizontal: theme.space[2] },
          ]}
        >
          {waterStatus}
        </Text>
      ) : null}
      <ActionRow
        icon={CheckCircle}
        section="habitos"
        label={t('quickAdd.habit')}
        onPress={() => go(() => router.push('/habitos'))}
      />
      <ActionRow
        icon={SunHorizon}
        section="hoy"
        label={t('quickAdd.checkin')}
        onPress={() =>
          go(() =>
            router.push({
              pathname: '/checkin/[tipo]',
              params: { tipo: checkinKindAt(new Date().getHours()) },
            }),
          )
        }
      />
      <ActionRow
        icon={ForkKnife}
        section="habitos"
        label={t('quickAdd.food')}
        onPress={() => go(() => router.push('/habitos'))}
      />
      <ActionRow
        icon={Barbell}
        section="gym"
        label={t('quickAdd.gym')}
        disabled={gym.status === 'loading'}
        onPress={startGym}
      />
    </View>
  );
}

type QuickAddSheetProps = { visible: boolean; onClose: () => void };

/** "Registrar": +1 glass, mark a habit, check-in, food note, start the gym session. */
export function QuickAddSheet({ visible, onClose }: QuickAddSheetProps) {
  const t = useT();
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('quickAdd.title')}
      closeLabel={t('quickAdd.close')}
    >
      <QuickAddActions onDone={onClose} />
    </BottomSheet>
  );
}
