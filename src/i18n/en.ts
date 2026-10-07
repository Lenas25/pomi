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
};
