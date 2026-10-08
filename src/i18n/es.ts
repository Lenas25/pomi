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
  weekdays: {
    short: { d0: 'Dom', d1: 'Lun', d2: 'Mar', d3: 'Mié', d4: 'Jue', d5: 'Vie', d6: 'Sáb' },
    long: {
      d0: 'domingo',
      d1: 'lunes',
      d2: 'martes',
      d3: 'miércoles',
      d4: 'jueves',
      d5: 'viernes',
      d6: 'sábado',
    },
  },
  onboarding: {
    progress: 'Pregunta {{current}} de {{total}}',
    back: 'Atrás',
    next: 'Siguiente',
    skip: 'Saltar',
    skipHint: 'Puedes saltar cualquier pregunta y completarla después en Ajustes.',
    increase: 'Subir {{label}}',
    decrease: 'Bajar {{label}}',
    hours: '{{value}} h',
    hourLabel: 'hora',
    minuteLabel: 'minutos',
    welcome: {
      bubble: '¡Hola! Soy Pomi',
      title: '¿Cómo te llamas?',
      hint: 'Es opcional. Solo la usaré para saludarte.',
      label: 'Tu nombre',
      placeholder: 'Tu nombre',
    },
    medical: {
      title: 'Antes de empezar',
      body: 'Las metas son puntos de partida generales, no consejo médico. Si tienes una condición médica (por ejemplo renal o cardíaca), consulta antes las metas de agua y ejercicio.',
    },
    body: {
      title: '¿Cuánto pesas y cuánto mides?',
      hint: 'Con tu peso calculamos tu meta de agua.',
      weightLabel: 'Peso (kg)',
      heightLabel: 'Altura (cm)',
      weightError: 'Escribe un peso entre {{min}} y {{max}} kg.',
      heightError: 'Escribe una altura entre {{min}} y {{max}} cm.',
    },
    age: {
      title: '¿Cuántos años tienes?',
      hint: 'Es opcional.',
      label: 'Edad (años)',
      error: 'Escribe una edad entre {{min}} y {{max}} años.',
    },
    work: {
      title: '¿Cómo es tu trabajo?',
      hint: 'Si pasas muchas horas sentada, activaremos las pausas activas.',
      sentada: 'Sentada la mayor parte del día',
      dePie: 'De pie',
      activa: 'Físicamente activo',
    },
    sleepClock: {
      title: '¿A qué hora te despiertas y te duermes?',
      hint: 'Tus horas de siempre, aunque no sean perfectas.',
      wake: 'Me despierto a las',
      bed: 'Me duermo a las',
    },
    sleepHours: {
      title: '¿Cuántas horas quieres dormir?',
      hint: 'El rango recomendado para adultos es de 7 a 9 horas.',
      label: 'Horas de sueño',
      current: 'Ahora duermes unas {{hours}} h.',
    },
    gym: {
      title: '¿Qué días y a qué hora puedes ir al gym?',
      hint: 'Marca los días y elige si vas por la mañana o por la tarde.',
      days: 'Días de gym',
      slot: 'Horario del {{day}}',
      morning: 'Mañana',
      evening: 'Tarde',
      morningTime: 'Hora de la mañana',
      eveningTime: 'Hora de la tarde',
    },
    level: {
      title: '¿Cuánto tiempo llevas entrenando?',
      hint: 'Elige lo que más se parezca a ti.',
      principiante: 'Estoy empezando (menos de 6 meses)',
      intermedio: 'Intermedio (6 meses a 2 años)',
      avanzado: 'Avanzado (más de 2 años)',
    },
    goal: {
      title: '¿Qué es lo más importante para ti ahora?',
      hint: 'Puedes cambiarlo cuando quieras.',
      musculo: 'Ganar músculo en una zona',
      fuerza: 'Ganar fuerza',
      grasa: 'Bajar grasa',
      salud: 'Salud general',
    },
    steps: {
      title: '¿Cuántos pasos crees que das al día?',
      hint: 'Un cálculo a ojo está bien. Más adelante podrás conectar Health Connect para medirlos.',
      label: 'Pasos al día',
    },
    checkins: {
      title: '¿Quieres check-ins de mañana y noche?',
      hint: 'Son preguntas de 10 segundos que ayudan a conocerte mejor.',
      yes: 'Sí, quiero los dos',
      no: 'No, por ahora no',
    },
    permissions: {
      title: 'Permisos para los avisos',
      hint: 'Todavía no te pedimos nada. Estos son los permisos que usaremos más adelante y para qué sirven.',
      notifications: 'Notificaciones: para recordarte el agua, el gym y los check-ins.',
      alarms:
        'Alarmas exactas: para que el descanso entre series suene a tiempo, incluso con la pantalla apagada.',
      battery: 'Batería: para que Android no retrase tus avisos cuando la app está cerrada.',
      later: 'Te los pediremos con calma, uno por uno, cuando los necesites.',
    },
    summary: {
      title: 'Tu punto de partida',
      hint: 'Son guías generales calculadas con lo que nos contaste. Puedes editar cada meta.',
      why: 'De dónde sale',
      edited: 'Editada por ti',
      done: 'Empezar',
      saving: 'Guardando',
      error: 'No pudimos guardar tus respuestas. Inténtalo de nuevo.',
      waterTitle: 'Agua',
      waterRest: 'Día sin gym',
      waterGym: 'Día de gym',
      glasses: '{{count}} vasos',
      waterExplain:
        '33 ml por kg × {{kg}} kg = {{rawMl}} ml, redondeado hacia arriba a vasos de {{glassMl}} ml. En días de gym sumamos 500 ml por hora de ejercicio (calculamos 1 hora). Es una guía general: ajústala según tu sed y el color de tu orina.',
      waterNoWeight: 'Cuéntanos tu peso en Ajustes y calcularemos tu meta de agua.',
      stepsTitle: 'Pasos',
      stepsValue: '{{steps}} pasos',
      stepsExplain:
        'Partimos de unos {{baseline}} pasos al día y sumamos 1,000, redondeado a 500. Después de una semana la ajustamos con tus pasos reales.',
      stepsNoBaseline:
        'Esta primera semana medimos cuántos pasos das de verdad y con eso te proponemos una meta.',
      sleepTitle: 'Sueño',
      sleepTarget: 'Meta de sueño',
      sleepBedtime: 'Hora de dormir sugerida: {{bedtime}}',
      sleepCycles: 'Por ciclos de 90 minutos: {{options}}',
      sleepExplain:
        'Te despiertas a las {{wake}} y quieres dormir {{hours}} h, así que conviene acostarte a las {{bedtime}} (despertar menos horas de sueño).',
      sleepNoWake:
        'Quieres dormir {{hours}} h. Dinos a qué hora te despiertas para sugerirte cuándo acostarte.',
      gymTitle: 'Días de gym',
      gymExplain:
        'Elegiste {{count}} días de gym por semana. Los avisos y la rotación de rutinas usan estos días.',
      gymNone: 'Aún no elegiste días de gym. Puedes marcarlos aquí o más adelante.',
    },
  },
  database: {
    errorTitle: 'No pudimos abrir tus datos',
    errorBody: 'Cierra la app y vuelve a abrirla. Tus datos siguen en tu teléfono.',
  },
} as const;
