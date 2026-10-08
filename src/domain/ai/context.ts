// What "Conectar mi IA" may send (PLAN §14d). PURE. The deterministic engines already computed
// every number in `AiSnapshot`; this module only CHOOSES which parts go out for one question.
// Photos are never part of the snapshot. Free-text notes are in it but only leave when the person
// switched them on for that message.

export const AI_TOPICS = ['sleep', 'water', 'movement', 'gym', 'mood', 'food'] as const;
export type AiTopic = (typeof AI_TOPICS)[number];

export type AiNote = { date: string; text: string };

export type AiSnapshot = {
  /** Logical day (`dayKeyFor`) the snapshot was made on. */
  today: string;
  /** Days covered by the aggregates (ending today). */
  periodDays: number;
  sleep: {
    nights: number;
    averageMin: number;
    targetMin: number | null;
    wakeRangeMin: number | null;
    /** Sleep debt of the last 7 nights (minutes), `null` without enough nights. */
    debtMin: number | null;
    /** Social jetlag (minutes), `null` without enough nights. */
    socialJetlagMin: number | null;
  } | null;
  water: {
    daysLogged: number;
    daysMet: number;
    averageGlasses: number;
    glassMl: number | null;
    /** Afternoon hours with almost no water (`[fromHour, toHour)`), from the water curve. */
    afternoonGap: { fromHour: number; toHour: number } | null;
  } | null;
  movement: {
    stepsDaysLogged: number;
    stepsAverage: number;
    stepsGoal: number | null;
    stepsDaysMet: number | null;
    /** Weekdays (0 = Sunday) with the most movement. */
    activeWeekdays: number[];
  } | null;
  gym: {
    sessionsDone: number;
    sessionsPlanned: number;
    exercises: {
      name: string;
      sessions: number;
      sets: number;
      e1rmFirstKg: number | null;
      e1rmLastKg: number | null;
      topWeightKg: number | null;
      bestReps: number | null;
    }[];
    /** Completed sets per muscle this ISO week, with the general reference range (info only). */
    setsThisWeek: {
      muscle: string;
      sets: number;
      referenceMin: number | null;
      referenceMax: number | null;
    }[];
  } | null;
  checkins: {
    days: number;
    /** Averages of the 1-5 answers; `null` when never answered. */
    energyAverage: number | null;
    moodAverage: number | null;
    sleepQualityAverage: number | null;
  } | null;
  /** Readable insights (already worded with prudent language), newest first. */
  insights: string[];
  /** Pending suggestions (title lines). */
  suggestions: string[];
  foodNotes: AiNote[];
  /** The optional free-text answer of the night check-in. */
  dayNotes: AiNote[];
};

export type AiSendOptions = {
  includeFoodNotes: boolean;
  includeDayNotes: boolean;
};

/** The exact object that leaves the phone (inside the user message) and that the preview shows. */
export type AiContext = {
  today: string;
  periodDays: number;
  sleep?: NonNullable<AiSnapshot['sleep']>;
  water?: NonNullable<AiSnapshot['water']>;
  movement?: NonNullable<AiSnapshot['movement']>;
  gym?: NonNullable<AiSnapshot['gym']>;
  checkins?: NonNullable<AiSnapshot['checkins']>;
  insights?: string[];
  suggestions?: string[];
  foodNotes?: AiNote[];
  dayNotes?: AiNote[];
};

/** At most this many notes of each kind (newest first) when the person includes them. */
export const MAX_NOTES_SENT = 14;

const KEYWORDS: Readonly<Record<AiTopic, readonly string[]>> = {
  sleep: [
    'sueno',
    'dormi',
    'dormir',
    'duermo',
    'despert',
    'cansad',
    'siesta',
    'jetlag',
    'noche',
    'sleep',
    'slept',
    'tired',
    'nap',
    'bed',
    'wake',
    'night',
    'rest',
  ],
  water: ['agua', 'hidrat', 'vaso', 'beber', 'bebo', 'water', 'hydrat', 'glass', 'drink'],
  movement: [
    'paso',
    'camin',
    'caminata',
    'mover',
    'movi',
    'sedentari',
    'activ',
    'step',
    'walk',
    'move',
    'moving',
    'active',
  ],
  gym: [
    'gym',
    'gimnasio',
    'entren',
    'rutina',
    'peso',
    'kg',
    'serie',
    'repetici',
    'fuerza',
    'ejercicio',
    'musculo',
    'volumen',
    'train',
    'workout',
    'routine',
    'weight',
    'set',
    'reps',
    'strength',
    'exercise',
    'muscle',
    'volume',
    'lift',
  ],
  mood: [
    'animo',
    'energia',
    'humor',
    'estres',
    'motivac',
    'sentir',
    'siento',
    'mood',
    'energy',
    'stress',
    'motivat',
    'feel',
  ],
  food: [
    'comida',
    'comer',
    'comi',
    'aliment',
    'dieta',
    'nutric',
    'desayun',
    'almuerz',
    'cena',
    'food',
    'eat',
    'meal',
    'diet',
    'nutrition',
    'breakfast',
    'lunch',
    'dinner',
  ],
};

/** Lowercase without accents, so "sueño" matches "sueno". */
export function normalizeQuestion(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Simple intent routing: the topics with a word of the question starting with one of their
 * keywords ("entrenar" matches `entren`). A question that matches nothing (a general "¿cómo voy?")
 * gets every topic.
 */
export function routeIntent(question: string): AiTopic[] {
  const words = normalizeQuestion(question)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
  const found = AI_TOPICS.filter((topic) =>
    KEYWORDS[topic].some((keyword) => words.some((word) => word.startsWith(keyword))),
  );
  return found.length > 0 ? found : [...AI_TOPICS];
}

const newestNotes = (notes: readonly AiNote[]) =>
  [...notes]
    .filter((note) => note.text.trim() !== '')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, MAX_NOTES_SENT)
    .map((note) => ({ date: note.date, text: note.text.trim() }));

/** The part of the snapshot one question needs. Notes only leave when switched on. */
export function selectContext(
  snapshot: AiSnapshot,
  topics: readonly AiTopic[],
  options: AiSendOptions,
): AiContext {
  const wanted = new Set(topics);
  const context: AiContext = { today: snapshot.today, periodDays: snapshot.periodDays };
  if (wanted.has('sleep') && snapshot.sleep) context.sleep = snapshot.sleep;
  if (wanted.has('water') && snapshot.water) context.water = snapshot.water;
  if (wanted.has('movement') && snapshot.movement) context.movement = snapshot.movement;
  if (wanted.has('gym') && snapshot.gym) context.gym = snapshot.gym;
  if ((wanted.has('mood') || wanted.has('sleep')) && snapshot.checkins) {
    context.checkins = snapshot.checkins;
  }
  if (snapshot.insights.length > 0) context.insights = [...snapshot.insights];
  if (snapshot.suggestions.length > 0) context.suggestions = [...snapshot.suggestions];
  if (options.includeFoodNotes) {
    const notes = newestNotes(snapshot.foodNotes);
    if (notes.length > 0) context.foodNotes = notes;
  }
  if (options.includeDayNotes) {
    const notes = newestNotes(snapshot.dayNotes);
    if (notes.length > 0) context.dayNotes = notes;
  }
  return context;
}
