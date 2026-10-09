import { useEffect, useState } from 'react';
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
import { bumpDataVersion } from '../db/dataVersion';
import { useT } from '../i18n';
import { requestNotificationSync } from '../notifications/sync';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { TextField } from '../ui/TextField';
import { useTheme, type SectionKey } from '../ui/theme';
import {
  addGlassOfWater,
  checkinKindAt,
  loadQuickHabits,
  loadQuickMenu,
  type QuickHabits,
  type QuickMenu,
} from './quickAdd';

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

function Status({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[
        theme.text('caption'),
        { color: theme.color.textMuted, paddingHorizontal: theme.space[2] },
      ]}
    >
      {children}
    </Text>
  );
}

/** Loads today's checks and food note once the panel opens; `null` while loading. */
function useQuickHabits(): [QuickHabits | null | 'failed', () => Promise<void>] {
  const [data, setData] = useState<QuickHabits | null | 'failed'>(null);
  const fetchData = (): Promise<QuickHabits | 'failed'> =>
    loadQuickHabits(getRepositories(), dayKeyFor(new Date())).catch((error: unknown) => {
      if (__DEV__) console.error('Could not load the habits', error);
      return 'failed' as const;
    });
  useEffect(() => {
    let cancelled = false;
    void fetchData().then((loaded) => {
      if (!cancelled) setData(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return [data, async () => setData(await fetchData())];
}

/** The menu's light data (check-ins of today, the gym routine to start); `null` while loading. */
function useQuickMenu(): QuickMenu | null | 'failed' {
  const [data, setData] = useState<QuickMenu | null | 'failed'>(null);
  useEffect(() => {
    let cancelled = false;
    loadQuickMenu(getRepositories(), dayKeyFor(new Date()))
      .catch((error: unknown) => {
        if (__DEV__) console.error('Could not load the quick add menu', error);
        return 'failed' as const;
      })
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

/** "Marcar un hábito" in place: today's check habits as toggles (the Habits tab write). */
function HabitsPanel() {
  const t = useT();
  const theme = useTheme();
  const [data, reload] = useQuickHabits();
  if (data === null) return <Status>{t('quickAdd.loading')}</Status>;
  if (data === 'failed') return <Status>{t('quickAdd.failed')}</Status>;
  if (data.checks.length === 0) return <Status>{t('quickAdd.noHabits')}</Status>;
  const toggle = async (habitId: string, done: boolean) => {
    try {
      await getRepositories().habitLogs.set(habitId, dayKeyFor(new Date()), done ? 1 : 0);
      bumpDataVersion();
      void requestNotificationSync('dataChanged');
    } catch (error) {
      if (__DEV__) console.error('Could not save the habit', error);
    }
    await reload();
  };
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.text('body-strong'), { color: theme.color.text }]}
      >
        {t('quickAdd.habitsTitle')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {data.checks.map((check) => (
          <Chip
            key={check.habitId}
            label={check.name}
            accessibilityLabel={t('habits.checkLabel', {
              name: check.name,
              state: t(check.done ? 'habits.stateDone' : 'habits.statePending'),
            })}
            selected={check.done}
            onPress={() => void toggle(check.habitId, !check.done)}
          />
        ))}
      </View>
    </View>
  );
}

/** "Nota de comida" in place: today's note editor. */
function FoodPanel() {
  const t = useT();
  const theme = useTheme();
  const [data] = useQuickHabits();
  const [text, setText] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | null>(null);
  if (data === null) return <Status>{t('quickAdd.loading')}</Status>;
  if (data === 'failed') return <Status>{t('quickAdd.failed')}</Status>;
  if (!data.food) return <Status>{t('quickAdd.noFood')}</Status>;
  const value = text ?? data.food.note;
  const save = async () => {
    try {
      await getRepositories().foodNotes.save(dayKeyFor(new Date()), value);
      bumpDataVersion();
      setText(undefined);
      setStatus(t('quickAdd.foodSaved'));
    } catch (error) {
      if (__DEV__) console.error('Could not save the note', error);
      setStatus(t('quickAdd.failed'));
    }
  };
  return (
    <View style={{ gap: theme.space[2] }}>
      <TextField
        label={data.food.prompt}
        value={value}
        onChangeText={(next) => {
          setText(next);
          setStatus(null);
        }}
      />
      <Button
        label={t('quickAdd.foodSave')}
        onPress={() => void save()}
        disabled={text === undefined}
      />
      {status ? <Status>{status}</Status> : null}
    </View>
  );
}

/** Mounted only while the sheet is open (the Modal does not render hidden children). */
function QuickAddActions({ onDone }: { onDone: () => void }) {
  const [panel, setPanel] = useState<'menu' | 'habits' | 'food'>('menu');
  const t = useT();
  const theme = useTheme();
  if (panel === 'menu') return <QuickAddMenu onDone={onDone} onPanel={setPanel} />;
  return (
    <View style={{ gap: theme.space[3] }}>
      {panel === 'habits' ? <HabitsPanel /> : <FoodPanel />}
      <Button label={t('quickAdd.back')} variant="ghost" onPress={() => setPanel('menu')} />
    </View>
  );
}

function QuickAddMenu({
  onDone,
  onPanel,
}: {
  onDone: () => void;
  onPanel: (panel: 'habits' | 'food') => void;
}) {
  const t = useT();
  const theme = useTheme();
  const menu = useQuickMenu();
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
        bumpDataVersion();
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
    const routineId = menu !== null && menu !== 'failed' ? menu.gymRoutineId : null;
    go(() =>
      routineId
        ? router.push({ pathname: '/gym/session', params: { routineId } })
        : router.push('/gym'),
    );
  };

  // Failed load: open the morning/night one by the clock (the check-in screen loads on its own).
  const checkin =
    menu === null
      ? null
      : checkinKindAt(
          new Date().getHours(),
          menu === 'failed' ? { morning: false, night: false } : menu.checkins,
        );

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
        onPress={() => onPanel('habits')}
      />
      <ActionRow
        icon={SunHorizon}
        section="hoy"
        label={t(checkin === 'done' ? 'quickAdd.checkinDone' : 'quickAdd.checkin')}
        disabled={checkin === null || checkin === 'done'}
        onPress={() => {
          if (checkin === null || checkin === 'done') return;
          go(() => router.push({ pathname: '/checkin/[tipo]', params: { tipo: checkin } }));
        }}
      />
      <ActionRow
        icon={ForkKnife}
        section="habitos"
        label={t('quickAdd.food')}
        onPress={() => onPanel('food')}
      />
      <ActionRow
        icon={Barbell}
        section="gym"
        label={t('quickAdd.gym')}
        disabled={menu === null}
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
