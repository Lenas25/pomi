# Pomi: plan del proyecto (v2, enfoque gym + hábitos)

> App móvil open source de **gym y hábitos saludables** que te conoce, te dice qué hacer hoy para progresar y te muestra lo que va descubriendo de ti.
> Todo funciona **en el celular**, sin cuentas ni servidor.
> Este documento es la especificación para construirla con Claude Code. Léelo completo antes de escribir código.

## 1. Visión

Las apps de gym (Hevy, Strong) registran pesos pero no acompañan tus hábitos. Las apps de hábitos marcan checks pero no entienden el entrenamiento. Y casi todas enganchan con puntos y rachas que castigan cuando fallas.

Pomi hace tres cosas:

1. **Te dice qué hacer hoy:** la meta de cada ejercicio, cuánta agua, cuántos pasos y a qué hora dormir, calculado con tus datos.
2. **Se ajusta contigo:** con check-ins de 10 segundos aprende tus patrones y te sugiere pequeños cambios. Tú decides si los aceptas.
3. **Te muestra tu cambio real:** fuerza, medidas, fotos y hallazgos sobre ti. Sin puntos ni rankings.

**Fuera del alcance:** skincare, planes de comida y conteo de calorías. La comida solo existe como **notas simples** opcionales.

## 2. Principios de producto

- **Sin castigo.** No hay rachas que se rompen. La constancia se muestra como "8 de los últimos 10 días" o "3 de 4 entrenamientos esta semana".
- **El gancho es conocerte, no ganar puntos.** Sin XP, medallas ni rankings.
- **La mascota (Pomi) acompaña, no premia ni castiga.** Nunca aparece triste o enojada porque faltaste (ver `design/BRAND.md`).
- **Lenguaje de identidad.** "Llevas 3 semanas entrenando de forma constante" en vez de "Cumpliste 5/7".
- **Sugerir, nunca imponer.** Ningún ajuste automático cambia tu plan sin tu confirmación. Máximo **2 sugerencias por semana**, cada una con su "por qué".
- **Honestidad con los datos.** Los hallazgos se muestran solo con datos suficientes y con lenguaje prudente ("notamos que…"), sin afirmar causas.
- **Respetar tu tiempo.** Interacciones cortas. Cuando terminaste lo del día, la app lo dice: "Listo por hoy. Cierra la app y descansa".
- **No es consejo médico.** Las metas son puntos de partida generales. En el onboarding y en Ajustes: "Si tienes una condición médica (por ejemplo renal o cardíaca), consulta antes las metas de agua y ejercicio".

## 3. Principios técnicos (no negociables)

- **Local-first:** sin backend, login ni analítica. SQLite en el dispositivo. Los pasos se leen de Health Connect (Android) o HealthKit (iOS), que también son locales.
- **Configuración, no código:** el programa de gym, los hábitos y los check-ins vienen de plantillas JSON (`/templates`).
- **Los avisos funcionan con el celular bloqueado y la app cerrada.**
- **Los cronómetros suenan con la pantalla apagada** (ver 7.2).
- **Lógica pura y testeable:** fórmulas, motor de sugerencias, motor de hallazgos, meta de hoy y scheduler sin depender de React ni de Expo.
- **Español e inglés** (español por defecto). Accesible: toques de 44 px o más, lectores de pantalla, "reducir movimiento".

## 4. Stack

Usa la **última versión estable de Expo SDK** y verifica cada API en la documentación oficial. No inventes APIs.

| Necesidad | Librería |
|---|---|
| Base | Expo + React Native + TypeScript (strict), con **development build** (no Expo Go, por Health Connect) |
| Navegación | expo-router |
| Base de datos | expo-sqlite + Drizzle ORM (con migraciones) |
| Estado de UI | Zustand |
| Validación de plantillas | zod |
| Fechas | date-fns |
| Avisos | expo-notifications |
| Pasos | react-native-health-connect (Android); HealthKit en iOS más adelante |
| Cronómetros | expo-keep-awake, expo-audio, expo-haptics |
| Fuentes | @expo-google-fonts/fredoka (títulos), @expo-google-fonts/nunito-sans (texto) y @expo-google-fonts/nunito (900, cronómetro y métricas) |
| Íconos de UI | phosphor-react-native |
| Animaciones | react-native-reanimated (y lottie-react-native si hay animaciones de la mascota) |
| Fotos | expo-camera o expo-image-picker, guardadas en el almacenamiento privado de la app |
| Compartir y PDF | expo-sharing, expo-print, expo-file-system, expo-document-picker |
| Gráficos | victory-native o react-native-svg (elige uno y justifícalo en `CLAUDE.md`) |
| Tests | Jest + React Native Testing Library |
| Builds | EAS Build (APK) |

Pregunta antes de agregar dependencias fuera de esta lista.

## 5. Estructura de carpetas

```
app/
  onboarding/            # "Conocerte"
  (tabs)/hoy.tsx
  (tabs)/gym.tsx
  (tabs)/habitos.tsx
  (tabs)/progreso.tsx
  (tabs)/ajustes.tsx
  gym/session.tsx
  checkin/[tipo].tsx      # mañana, noche, revisión mensual
  compartir.tsx
src/
  domain/
    formulas/            # agua, pasos, sueño (puras)
    gym/                 # meta de hoy, progresión, rotación, volumen
    suggestions/         # motor de sugerencias (puro)
    insights/            # motor de hallazgos (puro)
    agenda/              # buildAgenda(date)
  templates/             # esquema zod + importador
  db/                    # Drizzle: esquema, migraciones, repositorios
  notifications/         # scheduler
  timers/
  health/                # adaptador de pasos (Health Connect / manual)
  reports/
  ui/  i18n/
templates/
```

## 6. Modelo de datos

### 6.1 Piezas

| Pieza | Descripción |
|---|---|
| **Profile** | Datos del onboarding: peso, altura, edad (opcional), tipo de trabajo, nivel, objetivo, horarios. |
| **Program** | Rutinas de gym en **rotación** (Día 1 → Día 2 → … → Día 1), independiente del día de la semana. |
| **Routine / Step** | Pasos tipo `check`, `wait`, `sets`, `timed`, `counter` (calentamiento, ejercicios, cardio). |
| **Habit** | `check` o `counter` diario, con meta (fija o calculada por fórmula) y avisos. |
| **Reminder** | Aviso simple, único o repetido. |
| **Metric** | Peso y medidas. |
| **Checkin** | Preguntas cortas de mañana, noche y revisión mensual. |
| **Suggestion** | Ajuste propuesto por el motor: tipo, motivo, cambio, estado (pendiente, aceptada, rechazada). |
| **Insight** | Hallazgo calculado: texto, datos que lo respaldan, fecha, visto o no. |
| **Anchor** | Horas de referencia: `wake`, `bed`, `gymMorning`, `gymEvening`. Los horarios pueden ser relativos ("bed − 40 min"). |

### 6.2 Pasos y condiciones

```ts
type Step =
  | { type: 'check';   id; name; how?; when?: When }
  | { type: 'wait';    id; name; how?; waitSec: number; waitReason?: string; when?: When }
  | { type: 'sets';    id; name; how?; sets: number; reps: string; restSec: number;
      weightHint?: string; approach?: string; bodyweight?: boolean; holdSec?: number;
      incrementKg?: number; when?: When }
  | { type: 'timed';   id; name; totalSec: number; segments: { atSec: number; label: string }[]; when?: When }
  | { type: 'counter'; id; name; target: number; unit?: string; when?: When };

type When = Condition | Condition[];   // lista = se cumple si cualquiera aplica
type Condition = { days?: number[]; flag?: string; flagValue?: boolean };

type Schedule = {
  days: number[];                                   // 0 = domingo
  time?: string;
  relativeTo?: 'wake' | 'bed' | 'gymMorning' | 'gymEvening';
  offsetMin?: number;
  repeatEveryMin?: number;
  until?: string;
};
```

`reps` es texto como `"8–10"` o `"10–12 por pierna"`. El parser extrae el rango numérico; si no puede, la meta de hoy no sugiere cambios de repeticiones para ese ejercicio.

### 6.3 Tablas

- `profile`, `settings` (clave/valor: anchors, módulos activos, tema, idioma)
- `workout_sessions` (id, programId, routineId, date, startedAt, finishedAt)
- `set_logs` (sessionId, stepId, setIndex, weightKg, reps, rir 0–3, durationSec, doneAt)
- `habit_logs` (habitId, date, value)
- `steps_daily` (date, steps, source: health_connect | manual)
- `activity_logs` (id, date, kind: gym | walk | none, source: notification | manual, loggedAt): respuestas a "¿Te moviste hoy?" (sección 14b)
- `checkins` (date, kind: morning | night | monthly, answers JSON)
- `metric_entries` (metricId, date, value)
- `photos` (date, pose, uri local)
- `food_notes` (date, text)
- `suggestions` (id, kind, payload JSON, reason, createdAt, status, decidedAt)
- `insights` (id, kind, text, evidence JSON, createdAt, seenAt)
- `reminders`

## 7. Avisos y cronómetros

### 7.1 Scheduler

- Función pura `buildUpcoming(state, from, days)` que devuelve los avisos de los próximos N días con id estable.
- **Ventana móvil de 3 días:** se reprograma al abrir la app, al cambiar la configuración, al aceptar una sugerencia y en una background task cuando sea posible.
- **Límite de iOS: 64 avisos programados.** Prioriza por fecha y recorta.
- **Android:** canales separados (Gym, Hábitos, Check-ins, Cronómetros); permiso de **alarmas exactas** en Android 12 o superior, con explicación; pantalla de ayuda para quitar la **optimización de batería** según el fabricante.
- **Acciones en la notificación:** "Hecho", "Posponer 10 min" y, en el agua, "+1 vaso".
- **Horas de silencio** entre `bed` y `wake`.
- Los avisos de check-in se envían una sola vez, y nunca se insiste si se ignoran.

### 7.2 Cronómetros

- Se guarda **la hora de fin**, no un contador. Al volver a la app se recalcula.
- Al iniciar un cronómetro se programa **una notificación local a la hora de fin**, para que suene con la pantalla apagada. Se cancela al pausar o saltar.
- Pitidos cortos en 3, 2 y 1, alarma al terminar y vibración. Controles: pausar, +30 s y saltar.
- Tipo `timed` (cardio): pitido y nueva indicación al cambiar de tramo.

## 8. Onboarding: "Conocerte"

Una conversación corta, una pregunta por pantalla, con opción de saltar cualquier respuesta. Al final, la app muestra **"Tu punto de partida"**: metas de agua, pasos, sueño y días de gym, explicando de dónde sale cada número. Cada meta se puede editar.

Preguntas:

1. ¿Cómo te llamas? (opcional)
2. Peso y altura.
3. Edad (opcional).
4. ¿Cómo es tu trabajo? Sentada la mayor parte del día, de pie, o físicamente activo.
5. ¿A qué hora te despiertas y te duermes normalmente?
6. ¿Cuántas horas quieres dormir? (por defecto 7.5)
7. ¿Qué días y a qué hora puedes ir al gym?
8. ¿Cuánto tiempo llevas entrenando? (principiante, intermedio, avanzado)
9. ¿Qué es lo más importante para ti ahora? (ganar músculo en una zona, fuerza, bajar grasa, salud general)
10. ¿Cuántos pasos crees que das al día? O permiso para leerlos de Health Connect.
11. ¿Quieres check-ins de mañana y noche? (por defecto sí)
12. Permisos: notificaciones, alarmas exactas y batería, con su explicación.

## 9. Fórmulas (puntos de partida, editables)

### 9.1 Agua

- Base: **33 ml por kg de peso al día** (rango usual 30–35).
- Día de entrenamiento: **+500 ml** por cada hora de ejercicio.
- Se redondea a vasos de 250 ml.
- Ejemplo: 60 kg → 1,980 ml → **8 vasos** en días sin gym y **10 vasos** en días de gym.
- Texto en la app: "Es una guía general. Ajústala según tu sed y el color de tu orina. Si tienes una condición médica que limita los líquidos, consulta tu meta".

### 9.2 Pasos

- **Semana 1:** medir la línea base, que es el promedio de 7 días (de Health Connect, o la respuesta del onboarding si no hay datos).
- **Meta inicial:** línea base + 1,000, redondeada a 500.
- **Cada semana:** si se cumplió la meta 5 o más días de 7, sube 500. Si se cumplió menos de 3 días durante 2 semanas seguidas, baja 500, sin bajar nunca de la línea base.
- **Tope por defecto:** 10,000. El usuario puede cambiarlo.
- Para personas con trabajo sentado se activa el hábito "Pausa activa".

### 9.3 Sueño

- **Meta de horas:** la del onboarding (rango recomendado para adultos: 7–9 h).
- **Hora de dormir sugerida:** despertar − meta de horas.
- Se calculan, con los check-ins de mañana de los últimos 7 días:
  - **Duración promedio.**
  - **Regularidad:** la variación de la hora de despertar.

### 9.4 Gym: "meta de hoy"

Para cada ejercicio con `sets`, con la última sesión de ese ejercicio:

1. **Todas las series en el tope del rango** y RIR ≥ 1 (o sin RIR registrado) → **subir `incrementKg`** y volver al mínimo del rango. Ejemplo: "Hip thrust: 45 kg × 8. La última vez: 40 kg × 10 en todas".
2. **Alguna serie por debajo del tope** → **mismo peso, +1 repetición** en las primeras series que no llegaron al tope.
3. **Sin mejora en `stallSessions` sesiones seguidas** (por defecto 3), sin subir ni peso ni repeticiones → sugerencia: revisar sueño y descanso, o **semana de descarga** (−`deloadPct`% de peso, por defecto 10%).
4. **RIR registrado como 3 o más** en todas las series durante 2 sesiones → sugerir subir peso aunque no se haya llegado al tope.
5. **Sin historial:** mostrar `weightHint` y el texto "Elige un peso con el que te queden 1 o 2 repeticiones en reserva".

Además:

- **Volumen semanal por músculo:** series completadas por grupo muscular (requiere `muscles` en cada ejercicio de la plantilla). Referencia general para hipertrofia: 10–20 series por semana. Se muestra como información, no como meta obligatoria.
- **Rotación:** el día de hoy es el que ya tenga series registradas hoy; si no hay, el siguiente al último completado.

## 10. Check-ins

- **Mañana** (aviso 10 minutos después de `wake`): hora en que te dormiste, hora en que despertaste (prellenadas con el plan, se ajustan con un toque) y calidad del sueño del 1 al 5. Debe tomar menos de 10 segundos.
- **Noche** (aviso 30 minutos antes de `bed`): energía 1–5, ánimo 1–5 y una nota opcional, más la nota de comida si el módulo está activo. Al terminar: "Listo por hoy. Cierra la app y descansa".
- **Revisión mensual** (día configurable, por defecto el día 1): peso y medidas, fotos con la foto anterior en transparencia para alinear la pose, y la pantalla **"Tú hace 30 días vs. hoy"**: fuerza, medidas, fotos lado a lado, constancia y hallazgos del mes.
- **Revisión semanal** (domingo): resumen de la semana y las sugerencias pendientes.

## 11. Motor de sugerencias (local, por reglas)

Función pura `buildSuggestions(data, today)`. Se ejecuta una vez al día. Devuelve como máximo 2 sugerencias nuevas por semana, priorizadas. Cada sugerencia tiene **tipo, cambio propuesto, motivo en lenguaje simple y datos que la respaldan**. Nada cambia hasta que la persona toca "Aceptar".

| Regla | Condición | Sugerencia |
|---|---|---|
| Dormir antes | Promedio de sueño de 7 días < meta − 30 min | "Esta semana dormiste en promedio 6 h 40 min. ¿Movemos tu hora de dormir 15 minutos antes?" (cambios de 15 min, nunca más) |
| Regularidad | La hora de despertar varía más de 60 min en la semana | "Despertar a la misma hora ayuda a que te dé sueño temprano. ¿Fijamos las 5:10 todos los días?" |
| Pasos | Reglas de 9.2 | "Cumpliste tus pasos 6 de 7 días. ¿Subimos la meta a 7,500?" |
| Agua | Llega a menos del 60% de la meta a las 18:00 en 5 de 7 días | "Sueles quedarte corta en la tarde. ¿Adelantamos los avisos?" |
| Día del gym | Se falta al mismo día de la semana 3 veces en 4 semanas | "Los jueves sueles faltar. ¿Pasamos ese entrenamiento a otro día?" |
| Descarga | Regla 9.4.3 | "Llevas 3 sesiones sin mejorar en hip thrust. ¿Hacemos una semana más ligera?" |

Si una sugerencia se rechaza, no se repite durante 4 semanas.

## 12. Motor de hallazgos ("lo que descubrimos de ti")

Función pura `buildInsights(data, today)`, ejecutada una vez por semana. Muestra como máximo **1 hallazgo por semana**.

- **Mínimo de datos:** 21 días con check-ins y al menos 7 días en cada grupo que se compara.
- **Método:** comparar promedios entre dos grupos de días (por ejemplo, con gym y sin gym) y mostrar solo diferencias **relevantes** (definir umbrales por variable, por ejemplo ≥ 20 min de sueño o ≥ 0.5 puntos en una escala de 1 a 5).
- **Lenguaje prudente:** "Notamos que los días que entrenas duermes en promedio 35 minutos más". Nunca "entrenar te hace dormir más".
- **Ejemplos de comparaciones:**
  - Sueño en días con gym vs. sin gym.
  - Energía después de noches de 7 horas o más vs. menos.
  - Pasos en días de trabajo vs. fines de semana.
  - Rendimiento en el gym (volumen o meta cumplida) según la calidad del sueño de la noche anterior.
  - Día de la semana con más constancia.
- Cada hallazgo muestra los datos detrás ("basado en 24 días").

## 13. Pantallas

| Pantalla | Contenido |
|---|---|
| **Hoy** | Línea de tiempo del día: gym (con la meta destacada), agua, pasos, check-ins y hora de dormir. Arriba, una frase de identidad ("Llevas 4 semanas entrenando de forma constante") y, si hay, la sugerencia o el hallazgo nuevo. |
| **Gym** | Día que toca en la rotación, calentamiento, ejercicios con "meta de hoy", "la última vez", filas por serie (kg, reps, RIR), ✓ que inicia el descanso y cardio con tramos. |
| **Hábitos** | Agua (contador), pasos (automático o manual), pausas activas, caminar después de comer y notas de comida. Constancia como "X de los últimos 10 días". |
| **Progreso** | Constancia por semana, fuerza por ejercicio (gráfico), medidas, fotos, "Tú hace 30 días vs. hoy" y lista de hallazgos. |
| **Compartir** | Ver sección 14. |
| **Ajustes** | Perfil, metas (editables), horarios, programa de gym (importar plantilla), avisos, tema (claro, oscuro o del sistema), idioma, permisos, respaldo e importación. |

**Diseño:** la identidad visual, la mascota y la voz están en `design/BRAND.md`; la especificación de componentes, estados y movimiento en `design/HANDOFF.md`; los tokens en `design/tokens.json` (implementados en `src/ui/theme.tsx`); los assets en `design/ASSETS.md`. Tema claro (fondo crema) y oscuro (navy), siguiendo el sistema.

## 14. Compartir progreso

- Eliges **qué** (gym, hábitos, sueño, medidas, fotos, hallazgos), **período**, **para quién** y **formato**, más una nota inicial opcional.
- Plantillas: **Entrenador** (constancia, series por ejercicio, progresión, medidas), **Nutricionista** (peso, medidas, agua, notas de comida), **IA** (lo elegido más la instrucción "Analiza mi progreso y dime qué ajustar") y **Personalizado**.
- Formatos: texto, PDF, CSV y JSON, compartidos con el menú nativo.
- Solo se incluye lo seleccionado. Las fotos nunca van por defecto.
- **Importar un programa de gym** que te envíe tu entrenador (JSON validado, con vista previa y opción de reemplazar o agregar).

## 14b. Acompañamiento

Pomi acompaña: pregunta con cariño, calcula con datos reales y nunca juzga. Todo lo de esta sección es opcional, se puede apagar y usa lenguaje prudente ("parece", "tiende a", "podría"); ninguna cifra la inventa un texto: la calcula un motor determinista y puro.

### v1: preguntas y ayudas simples

**"¿Te moviste hoy?" (microencuesta de la noche)**

- Notificación local por la tarde-noche (por defecto 20:00, configurable) con tres acciones: **Fui al gym**, **Caminé** y **Hoy no**.
- Cada acción guarda una fila en `activity_logs` (`kind`: `gym`, `walk` o `none`; `source`: `notification`) **aunque la app esté cerrada**: la acción no abre la app y se procesa en segundo plano. Verificar en la documentación de `expo-notifications` el mecanismo vigente para respuestas en segundo plano antes de implementarlo.
- Si ya hay una sesión de gym terminada hoy o una respuesta de hoy, el aviso no se envía (o se cancela).
- **Hoy no** responde con calidez: "Pasa. Mañana seguimos" (pose `tranqui`). Nunca cuenta como falta ni rompe la constancia.
- Alimenta la constancia, el motor de hallazgos y "Tu ritmo" (v2).

**Calculadora de ciclos de sueño**

- Ciclos de 90 minutos. Horas de dormir sugeridas: `despertar − n × 90 min − 15 min` (15 min para conciliar el sueño), con `n` = 4, 5 y 6.
- Se muestran junto a la meta de sueño ("despertando a las 5:10 — tu meta: 7 h 30 min; opciones por ciclos: 22:55, 21:25 o 19:55"). Es una guía: la meta de horas sigue mandando.
- Cruza la medianoche correctamente (la hora de dormir puede ser del día anterior).

### v2: aprender de tu ritmo

**Deuda de sueño (ventana móvil de 7 días)**

- Por día: `faltante = meta − dormido`. El **sobrante de un día cuenta como máximo 60 min** (dormir mucho un día no borra una semana corta).
- `deuda = max(0, Σ faltantes del día)` sobre los últimos 7 días, con un mínimo de **4 días con dato**; si no, no se muestra.
- Se muestra como "Esta semana te faltaron unas 3 h de sueño", nunca como alarma.

**Jetlag social**

- `|punto medio del sueño en días libres − punto medio en días de semana|`, con punto medio = hora de dormir + duración / 2 (cruzando la medianoche).
- Ventana de 14 días; mínimo 3 días de semana y 2 días libres con dato. Días libres = sábado y domingo (editable).
- Desde 60 min se menciona con suavidad ("Tu sueño del fin de semana se corre casi 1 h 20 min").

**Curva de agua por hora**

- Promedio de ml registrados por franja horaria en los últimos 14 días (mínimo 7 días con registro).
- Detecta **huecos de la tarde**: 3 horas seguidas despierta, entre 12:00 y 19:00, sin registros en al menos 5 de 7 días.
- Resultado: una **sugerencia** (nunca un cambio automático) para mover o añadir avisos en ese hueco. Comparte la regla "Agua" de la sección 11.

**"Tu ritmo" (perfil de estilo de vida)**

- Se construye con los check-ins; **mínimo 21 días con datos** y al menos 7 días en cada grupo que se compara (igual que la sección 12).
- Contenido: tendencia de cronotipo (punto medio del sueño en días libres: "tiendes a ser más de mañana / intermedia / más de noche"; es una tendencia, no un diagnóstico), días en que más te mueves (gym, caminatas, pasos) y relación entre energía y sueño (solo si la diferencia es ≥ 0.5 puntos en la escala de 1 a 5).
- Lenguaje prudente y sin etiquetas fijas. Se actualiza una vez por semana.

**Carta de Pomi (resumen semanal, domingo)**

- Una carta corta (máximo 5 líneas) que acompaña la revisión semanal: constancia, un logro, un dato de sueño o agua y una invitación amable para la semana.
- Plantillas de texto con huecos que rellenan los motores; si la semana tuvo pocos datos, una carta breve y cálida sin cifras. Nunca reprocha.

**Aviso de sedentarismo (pausa activa sugerida)**

- Lee los pasos por hora de Health Connect en una **tarea en segundo plano** (granularidad aproximada de unos 15 min, no exacta).
- Si en los últimos **N minutos** (por defecto 90) hay **menos pasos que el umbral**, dentro de la ventana de horas despierta y en días de trabajo, sugiere una **pausa activa** ("Llevas un rato sentada. ¿Estiramos 2 minutos?").
- Totalmente configurable: activar o apagar, ventana horaria (por defecto de `wake + 1 h` a `bed − 2 h`), umbral de pasos, minutos N, días, y el interruptor **"No llevo el celular al caminar"**, que desactiva el aviso porque los pasos del celular no representan el movimiento real.
- Máximo 1 aviso cada 2 horas y 3 por día; respeta las horas de silencio.
- **Nota honesta en la app:** Android puede retrasar o saltarse tareas en segundo plano (ahorro de batería, optimización por fabricante, modo Doze), así que el aviso es una ayuda aproximada, no un recordatorio exacto.

### v3: compañera con IA en el dispositivo (opcional)

"Pomi conversa" (detalles pendientes de investigación):

- Modelo de lenguaje **descargable de forma opcional**, que corre **sin conexión** en el dispositivo.
- **Los motores deterministas calculan todas las cifras**; el modelo solo las redacta y responde mediante *tool calls* sobre los datos locales (sueño, agua, pasos, gym). Nunca inventa ni calcula números.
- *System prompt* con alcance estricto: solo los temas de vida saludable de la persona (sueño, agua, movimiento, gym, hábitos); sin consejo médico; lenguaje prudente; fuera de ese alcance responde con amabilidad que no puede ayudar.
- **Respaldo:** si el dispositivo no tiene suficiente RAM, o la persona lo desactiva, se usan los textos de plantilla de siempre. La app nunca depende del modelo.
- Los datos no salen del dispositivo.

## 15. Roadmap con criterios de aceptación

### v1: base útil (Android)

- [ ] Proyecto Expo (development build), TypeScript strict, expo-router, Drizzle con migraciones, ESLint y Prettier.
- [ ] Esquema zod e importación de `/templates`.
- [ ] Onboarding "Conocerte" con "Tu punto de partida" (fórmulas 9.1–9.3).
- [ ] Gym: rotación, sesión con kg, reps y RIR, descanso automático, cardio con tramos y **meta de hoy** (9.4).
- [ ] Hábitos: agua con avisos, pasos (Health Connect o manual) y pausas activas.
- [ ] Check-ins de mañana y noche.
- [ ] Pantalla Hoy.
- [ ] Scheduler con ventana de 3 días, canales, alarmas exactas y acciones en la notificación.
- [ ] Cronómetros que suenan con la pantalla apagada.
- [ ] Microencuesta "¿Te moviste hoy?" con acciones en la notificación que guardan en `activity_logs` aun con la app cerrada.
- [ ] Calculadora de ciclos de sueño junto a la meta de sueño.
- [ ] Respaldo completo en JSON.
- [ ] APK con EAS Build.

**Hecho cuando:** con el celular bloqueado llegan los avisos de agua, gym, check-ins, dormir y "¿Te moviste hoy?" (y tocar una acción lo registra sin abrir la app); un descanso de 2 minutos suena con la pantalla apagada; y al abrir el Día 1 aparece la meta de hoy calculada con la sesión anterior.

### v2: aprender de ti

- [ ] Motor de sugerencias (sección 11) con aceptar o rechazar.
- [ ] Revisión semanal.
- [ ] Progreso: constancia, gráficos de fuerza y medidas.
- [ ] Revisión mensual con fotos y "Tú hace 30 días vs. hoy".
- [ ] Compartir: texto y PDF (Entrenador, Nutricionista, IA).
- [ ] Acompañamiento (sección 14b): deuda de sueño, jetlag social, curva de agua por hora, "Tu ritmo", Carta de Pomi del domingo y aviso de sedentarismo configurable.

### v3: descubrirte

- [ ] Motor de hallazgos (sección 12).
- [ ] Volumen semanal por músculo.
- [ ] Editor de programas de gym dentro de la app.
- [ ] Inglés completo; CSV y JSON en reportes; importar programas de un entrenador.
- [ ] Opcional: "Pomi conversa", compañera con IA en el dispositivo (sección 14b), tras investigar modelos y requisitos de RAM.

### v4: comunidad

- [ ] Plantillas de programas por link o QR y carpeta comunitaria en el repositorio.
- [ ] Timelapse de fotos.
- [ ] Arte generativo que crece con tus datos (explorar).
- [ ] Accountability con 1 o 2 personas (requiere decidir cómo sin romper el principio local-first).
- [ ] iOS (HealthKit) y publicación en tiendas.

## 16. Calidad

- Tests unitarios obligatorios para: fórmulas de agua, pasos y sueño; meta de hoy (los 5 casos de 9.4); rotación; parser de `reps`; `buildAgenda`; `buildUpcoming` (límite de 64, horas de silencio); motor de sugerencias (cada regla, el máximo semanal y el bloqueo de 4 semanas tras un rechazo); motor de hallazgos (mínimo de datos, umbrales y redacción); generadores de reportes; deuda de sueño, jetlag social, ciclos de sueño, curva de agua por hora, detector de sedentarismo (umbral, ventana, días y desactivación) y registro de actividad desde la acción de la notificación (`activity_logs`).
- Datos de prueba: un generador de 60 días de datos sintéticos para probar sugerencias, hallazgos y gráficos.
- Checklist manual en Android antes de cada versión: avisos con la app cerrada, acciones de "¿Te moviste hoy?" con la app cerrada, cronómetro con la pantalla apagada, reinicio del celular, cambio de zona horaria, permiso de Health Connect denegado y modo claro/oscuro.
- Sin `any`. Errores de importación con mensajes claros en español.

## 17. Open source

- Licencia: **MIT** (pendiente de confirmar; alternativa AGPL-3.0).
- `README.md`, `CONTRIBUTING.md` (cómo crear y enviar programas de gym), `CODE_OF_CONDUCT.md` y `/templates/community/`.
- Aviso visible: la app no da consejo médico; las metas son guías generales.

## 18. Instrucciones para Claude Code

1. Lee este documento, las plantillas de `/templates` y los documentos de `/design` antes de empezar.
2. Trabaja **por hitos** de la v1, en orden. En cada hito: tests en verde, un commit claro y un resumen corto.
3. No escribas contenido (ejercicios, hábitos, textos de check-in) en el código: todo sale de plantillas e i18n.
4. Las fórmulas y reglas de las secciones 9, 11 y 12 son la especificación. Si ves un caso no cubierto, pregunta.
5. Si una API de Expo no funciona como esperas, revisa la documentación oficial antes de cambiar de enfoque.
6. Mantén `CLAUDE.md` con decisiones técnicas y comandos útiles.
