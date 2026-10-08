import type { Messages } from './types';

export const en: Messages = {
  tabs: {
    hoy: 'Today',
    gym: 'Gym',
    habitos: 'Habits',
    progreso: 'Progress',
    ajustes: 'Settings',
  },
  empty: {
    hoy: {
      title: 'Your day will show up here',
      body: 'Once we get to know you, you will see your gym, water, steps and check-ins for the day.',
    },
    gym: {
      title: 'No program yet',
      body: 'Import a gym template to see what is on for today.',
    },
    habitos: {
      title: 'Your habits will show up here',
      body: 'Water, steps and active breaks, with your consistency over the last few days.',
    },
    progreso: {
      title: 'Your progress will show up here',
      body: 'Complete your first workout to get started.',
    },
    ajustes: {
      title: 'Settings',
      body: 'Here you will edit your profile, goals, reminders and theme.',
    },
    onboarding: {
      title: "Let's get to know you",
      body: 'A few short questions to build your starting point.',
    },
    session: {
      title: 'No active session',
      body: 'When you start a workout, you will see it here.',
    },
    checkin: {
      title: 'Check-in',
      body: 'Your short questions will show up here.',
    },
    compartir: {
      title: 'Share progress',
      body: 'Choose what to share, the period and the format.',
    },
  },
  importErrors: {
    root: 'the file',
    invalidJson: 'The file is not valid JSON. Check for missing commas, braces or quotes.',
    invalidJsonAtLine:
      'The file is not valid JSON. Check line {{line}}: a comma, brace or quote may be missing.',
    notObject: 'The file must contain a JSON object, not a list or loose text.',
    unknownKind:
      'The template type is unknown. The "kind" field must be "module", "modules" or "settings".',
    unsupportedVersion:
      'This template uses version {{found}}, but the app only understands version {{expected}}.',
    missing: 'The field "{{path}}" is missing.',
    wrongType: 'The field "{{path}}" must be {{expected}}.',
    invalidValue: 'The field "{{path}}" has a value the app does not recognize.',
    invalidValueWithOptions:
      'The field "{{path}}" has a value the app does not recognize. Allowed values: {{allowed}}.',
    tooSmall: 'The field "{{path}}" is too short or too small (minimum: {{min}}).',
    tooBig: 'The field "{{path}}" is too long or too large (maximum: {{max}}).',
    invalidFormat: 'The field "{{path}}" does not have the expected format.',
    invalidTime: 'The field "{{path}}" must be a time formatted as HH:mm, for example 06:30.',
    invalidIcon:
      'The field "{{path}}" must be a Phosphor icon name (for example Barbell), not an emoji.',
    invalidSchedule:
      'The schedule at "{{path}}" needs a fixed time ("time") or a reference time ("relativeTo").',
    invalidScale:
      'The scale at "{{path}}" must go from a lower to a higher number, for example [1, 5].',
    duplicateId: 'There are repeated identifiers in "{{path}}". Each one must be unique.',
    unknownKey:
      'The app does not know the field "{{path}}". Check for a typo; fields starting with "_" are ignored.',
    unknown: 'There is a problem at "{{path}}".',
    types: {
      string: 'text',
      number: 'a number',
      integer: 'a whole number',
      boolean: 'true or false',
      array: 'a list',
      object: 'a block of fields',
      value: 'a different kind of value',
    },
  },
  agenda: {
    gym: 'Gym',
    checkin: {
      morning: 'Morning check-in',
      night: 'Evening check-in',
    },
  },
  gym: {
    target: {
      weightUp:
        'Today: {{weightKg}} kg × {{reps}}. Last time: {{lastWeightKg}} kg × {{lastReps}} on every set.',
      addRep: 'Today: {{weightKg}} kg, aim for {{reps}} reps.',
      noHistory: 'No history yet. Template suggestion: {{weightHint}}',
      chooseWeight: 'Pick a weight that leaves you 1 or 2 reps in reserve.',
      stalled:
        "You've gone {{sessions}} sessions without improving. Check your sleep and rest, or try a lighter week.",
      deload: 'Lighter week: {{weightKg}} kg (−{{pct}}%).',
      weightUpSuggested: 'You had plenty of reps in reserve. Shall we try {{weightKg}} kg?',
    },
  },
  database: {
    errorTitle: 'We could not open your data',
    errorBody: 'Close the app and open it again. Your data is still on your phone.',
  },
};
