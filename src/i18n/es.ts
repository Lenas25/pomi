export const es = {
  tabs: {
    hoy: 'Hoy',
    gym: 'Gym',
    habitos: 'Hábitos',
    progreso: 'Progreso',
    ajustes: 'Ajustes',
  },
  empty: {
    hoy: {
      title: 'Tu día aparecerá aquí',
      body: 'Cuando termines de conocerte, verás tu gym, agua, pasos y check-ins del día.',
    },
    gym: {
      title: 'Aún no hay programa',
      body: 'Importa una plantilla de gym para ver qué toca hoy.',
    },
    habitos: {
      title: 'Tus hábitos aparecerán aquí',
      body: 'Agua, pasos y pausas activas, con tu constancia de los últimos días.',
    },
    progreso: {
      title: 'Aquí aparecerá tu progreso',
      body: 'Completa tu primer entrenamiento para empezar.',
    },
    ajustes: {
      title: 'Ajustes',
      body: 'Aquí podrás editar tu perfil, metas, avisos y tema.',
    },
    onboarding: {
      title: 'Vamos a conocerte',
      body: 'Unas pocas preguntas cortas para armar tu punto de partida.',
    },
    session: {
      title: 'Sin sesión activa',
      body: 'Cuando empieces un entrenamiento, lo verás aquí.',
    },
    checkin: {
      title: 'Check-in',
      body: 'Tus preguntas cortas aparecerán aquí.',
    },
    compartir: {
      title: 'Compartir progreso',
      body: 'Elige qué compartir, el período y el formato.',
    },
  },
  importErrors: {
    root: 'el archivo',
    invalidJson: 'El archivo no es un JSON válido. Revisa que no falten comas, llaves o comillas.',
    invalidJsonAtLine:
      'El archivo no es un JSON válido. Revisa la línea {{line}}: puede faltar una coma, una llave o unas comillas.',
    notObject: 'El archivo debe contener un objeto JSON, no una lista ni un texto suelto.',
    unknownKind:
      'No se sabe qué tipo de plantilla es. El campo «kind» debe ser «module», «modules» o «settings».',
    unsupportedVersion:
      'Esta plantilla usa la versión {{found}}, pero la app solo entiende la versión {{expected}}.',
    missing: 'Falta el campo «{{path}}».',
    wrongType: 'El campo «{{path}}» debe ser {{expected}}.',
    invalidValue: 'El campo «{{path}}» tiene un valor que la app no reconoce.',
    invalidValueWithOptions:
      'El campo «{{path}}» tiene un valor que la app no reconoce. Valores permitidos: {{allowed}}.',
    tooSmall: 'El campo «{{path}}» es demasiado corto o pequeño (mínimo: {{min}}).',
    tooSmallExclusive: 'El campo «{{path}}» debe ser mayor que {{min}}.',
    tooBig: 'El campo «{{path}}» es demasiado largo o grande (máximo: {{max}}).',
    tooBigExclusive: 'El campo «{{path}}» debe ser menor que {{max}}.',
    invalidFormat: 'El campo «{{path}}» no tiene el formato esperado.',
    invalidTime: 'El campo «{{path}}» debe ser una hora con formato HH:mm, por ejemplo 06:30.',
    invalidIcon:
      'El campo «{{path}}» debe ser el nombre de un icono de Phosphor (por ejemplo Barbell), no un emoji.',
    invalidSchedule:
      'El horario en «{{path}}» necesita una hora fija («time») o una hora de referencia («relativeTo»).',
    invalidScale:
      'La escala en «{{path}}» debe ir de un número menor a uno mayor, por ejemplo [1, 5].',
    duplicateId: 'Hay identificadores repetidos en «{{path}}». Cada uno debe ser único.',
    invalidCondition: 'La condición en «{{path}}» necesita «days» (con al menos un día) o «flag».',
    flagValueWithoutFlag: 'La condición en «{{path}}» usa «flagValue» sin «flag».',
    unknownKey:
      'La app no conoce el campo «{{path}}». Revisa si está mal escrito; los campos que empiezan con «_» se ignoran.',
    unknown: 'Hay un problema en «{{path}}».',
    types: {
      string: 'un texto',
      number: 'un número',
      integer: 'un número entero',
      boolean: 'verdadero o falso',
      array: 'una lista',
      object: 'un bloque con campos',
      value: 'otro tipo de valor',
    },
  },
  agenda: {
    gym: 'Gym',
    checkin: {
      morning: 'Check-in de la mañana',
      night: 'Check-in de la noche',
    },
  },
  gym: {
    target: {
      weightUp:
        'Hoy: {{weightKg}} kg × {{reps}}. La última vez: {{lastWeightKg}} kg × {{lastReps}} en todas.',
      addRep: 'Hoy: {{weightKg}} kg, intenta llegar a {{reps}} repeticiones.',
      noHistory: 'Sin historial todavía. Sugerencia de la plantilla: {{weightHint}}',
      chooseWeight: 'Elige un peso con el que te queden 1 o 2 repeticiones en reserva.',
      stalled:
        'Llevas {{sessions}} sesiones sin mejorar. Revisa tu sueño y descanso, o prueba una semana más ligera.',
      deload: 'Semana ligera: {{weightKg}} kg (−{{pct}}%).',
      weightUpSuggested:
        'Te quedaron muchas repeticiones en reserva. ¿Probamos con {{weightKg}} kg?',
    },
  },
  database: {
    errorTitle: 'No pudimos abrir tus datos',
    errorBody: 'Cierra la app y vuelve a abrirla. Tus datos siguen en tu teléfono.',
  },
} as const;
