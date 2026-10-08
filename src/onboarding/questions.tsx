import { useRef, useState, type ComponentType } from 'react';
import { Text, View, type TextInput } from 'react-native';

import {
  DEFAULT_BED,
  DEFAULT_GYM_TIMES,
  DEFAULT_SLEEP_TARGET_H,
  DEFAULT_STEPS_ESTIMATE,
  DEFAULT_WAKE,
  GOALS,
  LEVELS,
  LIMITS,
  WORK_TYPES,
  currentSleepHours,
  parseOptionalNumber,
  slotOf,
  type Goal,
  type GymSlot,
  type Level,
  type WorkType,
} from '../domain/onboarding/draft';
import { useT, type TranslationKey } from '../i18n';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { MascotBubble } from '../ui/MascotBubble';
import { NumberStepper, TimeStepper } from '../ui/Stepper';
import { OptionRow } from '../ui/OptionRow';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';
import { useOnboardingDraft } from './draftStore';
import { QuestionScreen, QuestionTextField } from './QuestionScreen';
import type { QuestionId } from './flow';

const MAX_NAME_LENGTH = 40;

/** Weekdays in display order (Monday first); values follow `getDay` (0 = Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const WEEKDAY_SHORT_KEYS: readonly TranslationKey[] = [
  'weekdays.short.d0',
  'weekdays.short.d1',
  'weekdays.short.d2',
  'weekdays.short.d3',
  'weekdays.short.d4',
  'weekdays.short.d5',
  'weekdays.short.d6',
];

const WEEKDAY_LONG_KEYS: readonly TranslationKey[] = [
  'weekdays.long.d0',
  'weekdays.long.d1',
  'weekdays.long.d2',
  'weekdays.long.d3',
  'weekdays.long.d4',
  'weekdays.long.d5',
  'weekdays.long.d6',
];

export function weekdayShort(day: number): TranslationKey {
  return WEEKDAY_SHORT_KEYS[day] ?? 'weekdays.short.d0';
}

export function weekdayLong(day: number): TranslationKey {
  return WEEKDAY_LONG_KEYS[day] ?? 'weekdays.long.d0';
}

/** Explains that the stepper's visible value is a suggestion and what "Siguiente" / "Saltar" do. */
function SuggestedValueNote() {
  const t = useT();
  const theme = useTheme();
  return (
    <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
      {t('onboarding.suggestedValue')}
    </Text>
  );
}

/** Q1 (also the welcome screen): name, Pomi's greeting and the medical notice. */
export function NameQuestion() {
  const t = useT();
  const theme = useTheme();
  const name = useOnboardingDraft((state) => state.draft.name);
  const update = useOnboardingDraft((state) => state.update);
  const [text, setText] = useState(name ?? '');

  return (
    <QuestionScreen
      id="name"
      header={<MascotBubble pose="hola" message={t('onboarding.welcome.bubble')} />}
      title={t('onboarding.welcome.title')}
      hint={t('onboarding.welcome.hint')}
      onNext={() => {
        update({ name: text.trim() === '' ? undefined : text.trim() });
        return true;
      }}
      onSkip={() => update({ name: undefined })}
    >
      <QuestionTextField
        label={t('onboarding.welcome.label')}
        placeholder={t('onboarding.welcome.placeholder')}
        value={text}
        onChangeText={setText}
        maxLength={MAX_NAME_LENGTH}
      />
      <Card variant="highlight">
        <View style={{ gap: theme.space[1] }}>
          <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
            {t('onboarding.medical.title')}
          </Text>
          <Text style={[theme.text('body'), { color: theme.color.text }]}>
            {t('onboarding.medical.body')}
          </Text>
        </View>
      </Card>
    </QuestionScreen>
  );
}

/** Q2: weight and height. */
export function BodyQuestion() {
  const t = useT();
  const { weightKg, heightCm } = useOnboardingDraft((state) => state.draft);
  const update = useOnboardingDraft((state) => state.update);
  const [weight, setWeight] = useState(weightKg === undefined ? '' : String(weightKg));
  const [height, setHeight] = useState(heightCm === undefined ? '' : String(heightCm));
  const [weightInvalid, setWeightInvalid] = useState(false);
  const [heightInvalid, setHeightInvalid] = useState(false);
  const heightInput = useRef<TextInput>(null);

  return (
    <QuestionScreen
      id="body"
      title={t('onboarding.body.title')}
      hint={t('onboarding.body.hint')}
      onNext={() => {
        const parsedWeight = parseOptionalNumber(weight, LIMITS.weightKg);
        const parsedHeight = parseOptionalNumber(height, LIMITS.heightCm);
        setWeightInvalid(!parsedWeight.ok);
        setHeightInvalid(!parsedHeight.ok);
        if (!parsedWeight.ok || !parsedHeight.ok) return false;
        update({ weightKg: parsedWeight.value, heightCm: parsedHeight.value });
        return true;
      }}
      onSkip={() => update({ weightKg: undefined, heightCm: undefined })}
    >
      <TextField
        label={t('onboarding.body.weightLabel')}
        value={weight}
        onChangeText={setWeight}
        inputMode="decimal"
        maxLength={6}
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => heightInput.current?.focus()}
        error={weightInvalid ? t('onboarding.body.weightError', LIMITS.weightKg) : undefined}
      />
      <QuestionTextField
        label={t('onboarding.body.heightLabel')}
        value={height}
        onChangeText={setHeight}
        inputMode="decimal"
        maxLength={6}
        inputRef={heightInput}
        error={heightInvalid ? t('onboarding.body.heightError', LIMITS.heightCm) : undefined}
      />
    </QuestionScreen>
  );
}

/** Q3: age. */
export function AgeQuestion() {
  const t = useT();
  const ageYears = useOnboardingDraft((state) => state.draft.ageYears);
  const update = useOnboardingDraft((state) => state.update);
  const [age, setAge] = useState(ageYears === undefined ? '' : String(ageYears));
  const [invalid, setInvalid] = useState(false);

  return (
    <QuestionScreen
      id="age"
      title={t('onboarding.age.title')}
      hint={t('onboarding.age.hint')}
      onNext={() => {
        const parsed = parseOptionalNumber(age, LIMITS.ageYears, true);
        setInvalid(!parsed.ok);
        if (!parsed.ok) return false;
        update({ ageYears: parsed.value });
        return true;
      }}
      onSkip={() => update({ ageYears: undefined })}
    >
      <QuestionTextField
        label={t('onboarding.age.label')}
        value={age}
        onChangeText={setAge}
        inputMode="numeric"
        maxLength={3}
        error={invalid ? t('onboarding.age.error', LIMITS.ageYears) : undefined}
      />
    </QuestionScreen>
  );
}

const WORK_LABELS = {
  sentada: 'onboarding.work.sentada',
  'de pie': 'onboarding.work.dePie',
  activa: 'onboarding.work.activa',
} as const satisfies Record<WorkType, TranslationKey>;

/** Q4: type of work. */
export function WorkQuestion() {
  const t = useT();
  const workType = useOnboardingDraft((state) => state.draft.workType);
  const update = useOnboardingDraft((state) => state.update);
  return (
    <QuestionScreen
      id="work"
      title={t('onboarding.work.title')}
      hint={t('onboarding.work.hint')}
      onSkip={() => update({ workType: undefined })}
    >
      <ChoiceList
        options={WORK_TYPES}
        labels={WORK_LABELS}
        value={workType}
        onChange={(value) => update({ workType: value })}
      />
    </QuestionScreen>
  );
}

type ChoiceListProps<T extends string> = {
  options: readonly T[];
  labels: Record<T, TranslationKey>;
  value: T | undefined;
  onChange: (value: T) => void;
};

function ChoiceList<T extends string>({ options, labels, value, onChange }: ChoiceListProps<T>) {
  const t = useT();
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ gap: theme.space[3] }}>
      {options.map((option) => (
        <OptionRow
          key={option}
          label={t(labels[option])}
          selected={value === option}
          onPress={() => onChange(option)}
        />
      ))}
    </View>
  );
}

/** Q5: usual wake and bed times. */
export function SleepClockQuestion() {
  const t = useT();
  const theme = useTheme();
  const { wake, bed } = useOnboardingDraft((state) => state.draft);
  const update = useOnboardingDraft((state) => state.update);
  const [wakeTime, setWakeTime] = useState(wake ?? DEFAULT_WAKE);
  const [bedTime, setBedTime] = useState(bed ?? DEFAULT_BED);

  return (
    <QuestionScreen
      id="sleepClock"
      title={t('onboarding.sleepClock.title')}
      hint={t('onboarding.sleepClock.hint')}
      onNext={() => {
        update({ wake: wakeTime, bed: bedTime });
        return true;
      }}
      onSkip={() => update({ wake: undefined, bed: undefined })}
    >
      <View style={{ gap: theme.space[6] }}>
        <TimeStepper
          label={t('onboarding.sleepClock.wake')}
          value={wakeTime}
          onChange={setWakeTime}
        />
        <TimeStepper label={t('onboarding.sleepClock.bed')} value={bedTime} onChange={setBedTime} />
        <SuggestedValueNote />
      </View>
    </QuestionScreen>
  );
}

/** Q6: sleep target in hours (default 7.5). */
export function SleepHoursQuestion() {
  const t = useT();
  const theme = useTheme();
  const draft = useOnboardingDraft((state) => state.draft);
  const update = useOnboardingDraft((state) => state.update);
  const [hours, setHours] = useState(draft.sleepTargetH);
  const current = currentSleepHours(draft);

  return (
    <QuestionScreen
      id="sleepHours"
      title={t('onboarding.sleepHours.title')}
      hint={t('onboarding.sleepHours.hint')}
      onNext={() => {
        update({ sleepTargetH: hours });
        return true;
      }}
      onSkip={() => update({ sleepTargetH: DEFAULT_SLEEP_TARGET_H })}
    >
      <NumberStepper
        label={t('onboarding.sleepHours.label')}
        value={hours}
        onChange={setHours}
        step={0.25}
        min={LIMITS.sleepTargetH.min}
        max={LIMITS.sleepTargetH.max}
        format={(value) => t('onboarding.hours', { value })}
      />
      <SuggestedValueNote />
      {current === null ? null : (
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('onboarding.sleepHours.current', { hours: current })}
        </Text>
      )}
    </QuestionScreen>
  );
}

/** Day chips (Monday first) used by the gym question and by the summary's inline editor. */
export function GymDayChips() {
  const t = useT();
  const theme = useTheme();
  const { gymDays, gymSlots } = useOnboardingDraft((state) => state.draft);
  const update = useOnboardingDraft((state) => state.update);

  const toggle = (day: number) => {
    if (gymDays.includes(day)) {
      const { [day]: _removed, ...rest } = gymSlots;
      update({ gymDays: gymDays.filter((selected) => selected !== day), gymSlots: rest });
    } else {
      update({
        gymDays: [...gymDays, day],
        gymSlots: { ...gymSlots, [day]: slotOf({ gymSlots }, day) },
      });
    }
  };

  return (
    <View
      accessibilityLabel={t('onboarding.gym.days')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}
    >
      {WEEK_ORDER.map((day) => (
        <Chip
          key={day}
          label={t(weekdayShort(day))}
          accessibilityLabel={t(weekdayLong(day))}
          selected={gymDays.includes(day)}
          onPress={() => toggle(day)}
        />
      ))}
    </View>
  );
}

/** Q7: gym days, and a morning / afternoon slot (with its time) for them. */
export function GymQuestion() {
  const t = useT();
  const theme = useTheme();
  const draft = useOnboardingDraft((state) => state.draft);
  const update = useOnboardingDraft((state) => state.update);

  const days = WEEK_ORDER.filter((day) => draft.gymDays.includes(day));
  const usesMorning = days.some((day) => slotOf(draft, day) === 'gymMorning');
  const usesEvening = days.some((day) => slotOf(draft, day) === 'gymEvening');
  const setSlot = (day: number, slot: GymSlot) =>
    update({ gymSlots: { ...draft.gymSlots, [day]: slot } });

  return (
    <QuestionScreen
      id="gym"
      title={t('onboarding.gym.title')}
      hint={t('onboarding.gym.hint')}
      onSkip={() =>
        update({
          gymDays: [],
          gymSlots: {},
          gymMorning: DEFAULT_GYM_TIMES.gymMorning,
          gymEvening: DEFAULT_GYM_TIMES.gymEvening,
        })
      }
    >
      <GymDayChips />
      {days.map((day) => (
        <View key={day} style={{ gap: theme.space[2] }}>
          <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
            {t(weekdayLong(day))}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
            <Chip
              label={t('onboarding.gym.morning')}
              accessibilityLabel={`${t(weekdayLong(day))}: ${t('onboarding.gym.morning')}`}
              selected={slotOf(draft, day) === 'gymMorning'}
              onPress={() => setSlot(day, 'gymMorning')}
            />
            <Chip
              label={t('onboarding.gym.evening')}
              accessibilityLabel={`${t(weekdayLong(day))}: ${t('onboarding.gym.evening')}`}
              selected={slotOf(draft, day) === 'gymEvening'}
              onPress={() => setSlot(day, 'gymEvening')}
            />
          </View>
        </View>
      ))}
      {usesMorning ? (
        <TimeStepper
          label={t('onboarding.gym.morningTime')}
          value={draft.gymMorning}
          onChange={(value) => update({ gymMorning: value })}
        />
      ) : null}
      {usesEvening ? (
        <TimeStepper
          label={t('onboarding.gym.eveningTime')}
          value={draft.gymEvening}
          onChange={(value) => update({ gymEvening: value })}
        />
      ) : null}
    </QuestionScreen>
  );
}

const LEVEL_LABELS = {
  principiante: 'onboarding.level.principiante',
  intermedio: 'onboarding.level.intermedio',
  avanzado: 'onboarding.level.avanzado',
} as const satisfies Record<Level, TranslationKey>;

/** Q8: training experience. */
export function LevelQuestion() {
  const t = useT();
  const level = useOnboardingDraft((state) => state.draft.level);
  const update = useOnboardingDraft((state) => state.update);
  return (
    <QuestionScreen
      id="level"
      title={t('onboarding.level.title')}
      hint={t('onboarding.level.hint')}
      onSkip={() => update({ level: undefined })}
    >
      <ChoiceList
        options={LEVELS}
        labels={LEVEL_LABELS}
        value={level}
        onChange={(value) => update({ level: value })}
      />
    </QuestionScreen>
  );
}

const GOAL_LABELS = {
  musculo: 'onboarding.goal.musculo',
  fuerza: 'onboarding.goal.fuerza',
  grasa: 'onboarding.goal.grasa',
  salud: 'onboarding.goal.salud',
} as const satisfies Record<Goal, TranslationKey>;

/** Q9: main goal. */
export function GoalQuestion() {
  const t = useT();
  const goal = useOnboardingDraft((state) => state.draft.goal);
  const update = useOnboardingDraft((state) => state.update);
  return (
    <QuestionScreen
      id="goal"
      title={t('onboarding.goal.title')}
      hint={t('onboarding.goal.hint')}
      onSkip={() => update({ goal: undefined })}
    >
      <ChoiceList
        options={GOALS}
        labels={GOAL_LABELS}
        value={goal}
        onChange={(value) => update({ goal: value })}
      />
    </QuestionScreen>
  );
}

/** Q10: manual estimate of daily steps. Reading Health Connect is requested later, not here. */
export function StepsQuestion() {
  const t = useT();
  const stepsEstimate = useOnboardingDraft((state) => state.draft.stepsEstimate);
  const update = useOnboardingDraft((state) => state.update);
  const [steps, setSteps] = useState(stepsEstimate ?? DEFAULT_STEPS_ESTIMATE);

  return (
    <QuestionScreen
      id="steps"
      title={t('onboarding.steps.title')}
      hint={t('onboarding.steps.hint')}
      onNext={() => {
        update({ stepsEstimate: steps });
        return true;
      }}
      onSkip={() => update({ stepsEstimate: undefined })}
    >
      <NumberStepper
        label={t('onboarding.steps.label')}
        value={steps}
        onChange={setSteps}
        step={500}
        min={LIMITS.steps.min}
        max={LIMITS.steps.max}
      />
      <SuggestedValueNote />
    </QuestionScreen>
  );
}

/** Q11: morning and night check-ins (default yes). */
export function CheckinsQuestion() {
  const t = useT();
  const theme = useTheme();
  const { checkinMorning, checkinNight } = useOnboardingDraft((state) => state.draft);
  const update = useOnboardingDraft((state) => state.update);
  const wantsCheckins = checkinMorning || checkinNight;

  return (
    <QuestionScreen
      id="checkins"
      title={t('onboarding.checkins.title')}
      hint={t('onboarding.checkins.hint')}
      onSkip={() => update({ checkinMorning: true, checkinNight: true })}
    >
      <View accessibilityRole="radiogroup" style={{ gap: theme.space[3] }}>
        <OptionRow
          label={t('onboarding.checkins.yes')}
          selected={wantsCheckins}
          onPress={() => update({ checkinMorning: true, checkinNight: true })}
        />
        <OptionRow
          label={t('onboarding.checkins.no')}
          selected={!wantsCheckins}
          onPress={() => update({ checkinMorning: false, checkinNight: false })}
        />
      </View>
    </QuestionScreen>
  );
}

/** Q12: explains the permissions. Nothing is requested here; the requests come with the reminders. */
export function PermissionsQuestion() {
  const t = useT();
  const theme = useTheme();
  const lines: TranslationKey[] = [
    'onboarding.permissions.notifications',
    'onboarding.permissions.alarms',
    'onboarding.permissions.battery',
  ];
  return (
    <QuestionScreen
      id="permissions"
      title={t('onboarding.permissions.title')}
      hint={t('onboarding.permissions.hint')}
    >
      <View style={{ gap: theme.space[3] }}>
        {lines.map((line) => (
          <Card key={line}>
            <Text style={[theme.text('body'), { color: theme.color.text }]}>{t(line)}</Text>
          </Card>
        ))}
      </View>
      <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
        {t('onboarding.permissions.later')}
      </Text>
    </QuestionScreen>
  );
}

export const QUESTION_COMPONENTS: Record<QuestionId, ComponentType> = {
  name: NameQuestion,
  body: BodyQuestion,
  age: AgeQuestion,
  work: WorkQuestion,
  sleepClock: SleepClockQuestion,
  sleepHours: SleepHoursQuestion,
  gym: GymQuestion,
  level: LevelQuestion,
  goal: GoalQuestion,
  steps: StepsQuestion,
  checkins: CheckinsQuestion,
  permissions: PermissionsQuestion,
};
