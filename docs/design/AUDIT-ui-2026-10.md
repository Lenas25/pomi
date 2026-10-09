# Auditoría UI: pantallas que no caben y color sin energía (2026-10)

> Origen: prueba del APK en un Android real. Feedback de la dueña: "la mayoría de las páginas hacen scroll, y eso es mala UI/UX: las páginas deberían ser dinámicas (caber en la pantalla); los colores no motivan, deberían ser vibrantes y llamativos".
> Método: lectura de código (sin dispositivo). Alturas estimadas a partir de los tokens (`design/tokens.json`) y los componentes de `src/ui/`. Referencias: `design/BRAND.md`, `design/HANDOFF.md`, skills impeccable (audit.native, layout, colorize, animate) y emil-design-eng.
> Alcance: solo diagnóstico y plan. No se cambió código.

---

## 0. Resumen ejecutivo

**Top 5 problemas**

1. **Las pantallas diarias apilan todo en un solo scroll.** Hoy (~1.400–1.700 dp), Hábitos (~1.300–1.600 dp), Gym tab (~1.100 dp) y sobre todo la sesión de gym (~1.800–2.500 dp) ocupan 2–4 pantallas en un viewport útil de ~660 dp. No hay jerarquía de "lo de ahora" frente a "lo de después".
2. **La acción principal está arriba o al final del scroll, no en la zona del pulgar.** `Screen` no tiene barra inferior fija; "Terminar sesión", "Guardar" y "Empezar" quedan al final de listas largas. Esto contradice HANDOFF §1 ("acciones principales en la mitad inferior"). La única excepción correcta es `onboarding/QuestionScreen` (botones fijos abajo): ese es el patrón a generalizar.
3. **El color de la marca casi no aparece en la UI.** Fondo crema + tarjetas blancas + texto navy + botón primario navy + tab bar navy/navy-700. El azul, el coral y el amarillo se usan como bordes de 1–4 dp, captions y un borde izquierdo en `Card celebrate`. El arte de marca (azul saturado, coral, destellos amarillos) no llega a la interfaz: la app se ve "papel y tinta".
4. **No hay roles de color por categoría ni superficies "hero".** Agua, pasos, sueño y gym se ven iguales (tarjeta blanca con título navy). No existe un token de superficie de marca (`hero`) ni variantes de botón de energía; todo cae en `primary = navy`.
5. **Los momentos de logro son silenciosos.** Ya hay hápticos y reduce-motion (bien), pero completar el día, una serie o la sesión no tiene un momento visual: la mascota tiene 10 poses que casi no se usan como reacción, y los números importantes usan el mismo peso que el texto.

**Dirección recomendada:** "Pomi Splash" (cabecera azul de marca, CTAs coral, celebraciones sol, categorías con tinte). Alternativas: "Sunrise Pop" y "Deep Pool" (sección 6).

> **Decisión final de la dueña (2026-10):** "Pomi Splash", oscuro primero, **sin cabecera azul**: cada sección pinta su cabecera con su propio color y texto navy (Hoy sol `#FFC94D`, Gym coral `#FF7A5C`, Hábitos verde `#4CD39C`, Progreso lavanda `#9EA0FF`; Agua `#5CCBF2`, Sueño `#9EA0FF`, Movimiento `#4CD39C`). Ver sección 8.

**Puntuación audit.native (0–4):** Accesibilidad 3 · Rendimiento 3 · Apariencia y theming 2 (tokens sólidos, pero roles pobres y casi sin color) · Conformidad de plataforma 3 · Adaptabilidad 3 (ya hay `wide`/dos columnas) → **14/20, Bueno**, con la debilidad concentrada en jerarquía y color.

---

## 0.1 Hallazgos en dispositivo real (modo oscuro, capturas de la dueña)

La dueña usa **modo oscuro**: todo el sistema se diseña **oscuro primero** y luego se deriva el claro.

### Bugs (todos P0, verificados en el código)

| # | Bug | Causa en el código | Arreglo |
|---|---|---|---|
| B1 | En Hoy, la hora "07:40" se parte en "07:4" / "0" | `src/ui/TimelineItem.tsx` (~l.142): la columna de hora tiene `width: theme.space[10]` (40 dp) fijo con `caption` 13 sp. Con Nunito Sans 600 y escala de fuente > 1 no entra | Columna con `minWidth` desde un token nuevo `timeline.timeColumn` (56 dp) multiplicado por `fontScale`, `numberOfLines={1}`, dígitos tabulares (`fontVariant: ['tabular-nums']` o la familia `numeric`). Alternativa: medir "00:00" con `onTextLayout` una vez y usar ese ancho |
| B2 | Onboarding P6 (despertar/dormir): cuatro steppers sueltos y se ven como etiqueta textos de accesibilidad ("Me despierto a las, hora", "…, minutos") | `src/ui/Stepper.tsx` `TimeStepper` (~l.141) crea dos `Stepper` y les pasa `label={`${label}, ${t('onboarding.hourLabel')}`}`; `Stepper` pinta su `label` como texto visible (l.65) | Nuevo `TimePicker` compacto de **una fila por hora**: etiqueta visible solo "Me despierto a las"; control `[−] 07 : 30 [+]` (o dos columnas tipo rueda con chevrons arriba/abajo), número en `metric`. Separar en `Stepper` las props `label` (visible, opcional) y `accessibilityLabel` (siempre). Toque largo para repetir. Las dos filas (despertar/dormir) caben en ~200 dp |
| B3 | El texto "Valor sugerido. «Siguiente» lo confirma…" queda cortado detrás de los botones fijos | `src/onboarding/questions.tsx` (l.76) lo pinta como último hijo del `ScrollView` de `QuestionScreen`; con `KeyboardAvoidingView behavior="height"` en Android edge-to-edge la altura del scroll queda reducida y no hay indicio de que haya más contenido | Mover el aviso al **footer**, encima de los botones, como `caption` de una línea ("Sugerido: «Siguiente» lo confirma"); dar `paddingBottom` al contenido igual a la altura del footer; revisar `behavior` en Android (`undefined` + `softwareKeyboardLayoutMode: "resize"`, o `padding`) |
| B4 | En check-in/onboarding paso 1 (sin flecha atrás) la barra de progreso queda desalineada | `QuestionScreen.tsx` (~l.111): el espaciador cuando no hay "atrás" es `<View style={{ width: theme.touch.gym }} />` **sin altura**, así que la fila cambia de alto y la barra se mueve | Componente `StepHeader` con **slot fijo de 48×48** siempre presente (botón o espaciador del mismo tamaño), barra centrada verticalmente, y el mismo componente en check-in y onboarding |
| B5 | El placeholder de los campos de texto sale en otra fuente (parecida a manuscrita) | `TextField.tsx` y `SetRow.tsx` aplican `theme.text(...)` al `TextInput`, pero en Android el placeholder no siempre hereda la tipografía personalizada (problema conocido de RN Android; se agrava si se combina `fontFamily` con `fontWeight` o si el fabricante sustituye la fuente del sistema) | Fijar `fontFamily` explícito en el estilo del `TextInput` (no dentro de un arreglo condicional), no mezclar `fontWeight` con fuentes personalizadas, y probar en el dispositivo. Si persiste: placeholder propio con `<Text>` superpuesto cuando el valor está vacío. Agregar test de que todo `TextInput` recibe `fontFamily` |

### Diseño y UX observados
- **Pila de tarjetas idénticas.** Todas las pantallas son tarjetas navy con el mismo borde y peso: no hay jerarquía ni identidad por sección. **Arreglo:** cada sección tiene color + ícono propios y se ve en la cabecera, las baldosas y la tab bar:

  | Sección / categoría | Ícono (Phosphor, `fill` activo) | Oscuro (fill / tinte de superficie / texto) | Claro (fill / tinte / texto) |
  |---|---|---|---|
  | Hoy | `House` / `Sun` | `#FFC94D` / `#3A2E10` / `#FFC94D` | `#F6B634` / `#FFF0C7` / `#8A5A00` |
  | Gym | `Barbell` | `#FF7A5C` / `#3A1F1A` / `#FF7A5C` | `#F15A3B` / `#FFE1D9` / `#A82E19` |
  | Agua | `Drop` | `#5CCBF2` / `#1B3350` / `#5CCBF2` | `#29B5E8` / `#D2EFFB` / `#0A6E9E` |
  | Sueño | `MoonStars` | `#9EA0FF` / `#242552` / `#9EA0FF` | `#6C6FF0` / `#E4E4FD` / `#4A4CC9` |
  | Movimiento / pasos | `Footprints` | `#4CD39C` / `#123A2C` / `#4CD39C` | `#22C08A` / `#D5F5E8` / `#0F7A55` |
  | Progreso | `ChartLineUp` | `#5CCBF2` | `#0E8FC4` |

  En oscuro, cada tarjeta de categoría usa el **tinte de superficie** como fondo (en vez de `#17233D` para todo) y un borde superior o ícono en el color fill; el texto de la categoría usa el fill (todos ≥ 6:1 sobre `#17233D`, ver 3.3). Sobre un fill, el texto es navy `#1A2846`.
- **Texto repetido.** En Hábitos, la línea de consistencia repite el nombre del hábito y "Hoy cuenta cuando lo completas" en cada tarjeta; el aviso médico/respaldo de P1 del onboarding es un muro de texto. **Arreglo:** el nombre va una sola vez (en la baldosa); la explicación "Hoy cuenta cuando lo completas" va una vez como ayuda de la pantalla (ícono "i" → sheet); el aviso de P1 se reduce a 1 frase + "Leer más" (sheet) con casilla/botón de aceptación.
- **Tab bar demasiado simple** (íconos finos grises, estado activo débil, sin color de sección). **Propuesta:**
  - Altura 72 dp + inset; superficie `#17233D` (oscuro) / `#FFFFFF` (claro) con borde superior sutil.
  - Ícono activo **relleno (`weight="fill"`) en el color de su sección**, sobre una **pastilla** 56×32 con el tinte de la sección; etiqueta activa en `caption` 700 con el color de texto de la sección. Inactivos: ícono `regular` en `#B8C2D9` (oscuro, 8,75:1 sobre surface) / `#33436A` (claro).
  - **Acción central elevada "Registrar"** (círculo 56 dp coral `#FF7A5C` con `Plus` navy en oscuro; `#D63F25` con `Plus` blanco en claro) que abre una sheet de registro rápido: + agua, marcar hábito, empezar entrenamiento, check-in. Así quedan 4 tabs + 1 acción: Hoy · Gym · [+] · Hábitos · Progreso. **Ajustes sale de la tab bar** y pasa a un ícono de engranaje en la cabecera de Hoy/Progreso (se usa poco).
  - Transición de la pastilla: 200 ms `easing.out`; con reduce-motion, cambio directo.
- **Navegación clara ("dónde encuentro cada cosa"):** cada pantalla empieza con una cabecera que repite ícono + color de su sección; las subpantallas (revisión, fotos, comparación, editores) heredan el color de la sección de origen en su cabecera y su botón atrás.
- **Responsivo:** validar en 360×640 (chico), 360×780 y 412×915 (grande), con escala de fuente 1,0 y 1,3. Reglas: anchos que contienen texto con `minWidth` y nunca `width` fijo; grillas 2×2 que pasan a 1 columna si `fontScale ≥ 1,3` y ancho < 380 dp; footer fijo siempre visible y el resto con scroll de respaldo (nunca recortar); números con dígitos tabulares.

---

## 1. Supuestos de medida (360 × 780 dp)

| Elemento | dp |
|---|---|
| Barra de estado | ~28 |
| Tab bar (`layout.tabBarHeight`) + barra de gestos | 64 + ~24 |
| **Viewport útil en tabs** | **~660** |
| **Viewport útil en pantallas completas** (sin tab bar) | **~720** |
| Ancho útil (360 − 2×20 de margen) | 320 |
| `Card` padding | 16 por lado |
| `TimelineItem` | 48 mín., ~64–72 con subtítulo |
| `Button` md / lg | 48 / 56 |
| `title-lg` / `title-md` / `body` línea | 34 / 28 / 24 |

Clasificación:
- **Diaria** (se abre varias veces al día o con una mano ocupada): debe caber en una pantalla, acción principal en el tercio inferior. Scroll solo como desborde excepcional (listas muy largas del usuario).
- **Referencia** (se consulta, no se ejecuta): el scroll es aceptable, pero necesita resumen arriba, secciones con nombre y divulgación progresiva.

---

## 2. Auditoría por pantalla

### 2.1 Pantallas diarias (P0)

#### Hoy — `app/(tabs)/hoy.tsx` → `src/today/TodayScreen.tsx`
- **Altura estimada:** saludo + identidad (34 + 28–56) ≈ 90 · SuggestionCard ≈ 200 · InsightCard ≈ 160 · InsightSlot (companion) ≈ 120 · tarjeta de revisión (domingos) ≈ 150 · ActivityCard ≈ 140 · título timeline 24 + 6–9 entradas × ~76 ≈ 460–690 · burbuja final ≈ 150. Gaps de 16. **Total ≈ 1.400–1.700 dp ≈ 2,2–2,6 pantallas.**
- **Qué fuerza el scroll:** hasta cuatro tarjetas "de Pomi" (sugerencia, hallazgo, compañero, revisión) compiten **antes** de la línea del día. Lo que el usuario vino a hacer (marcar lo de ahora) queda debajo del pliegue. La identidad en `title-md` muted ocupa dos líneas y compite con el saludo.
- **Reestructura:**
  1. **Cabecera hero azul** (`hero`, ~150 dp): saludo en `title-lg` navy, frase de identidad en `body-strong` (una línea), y a la derecha un **anillo del día** (hechas/total) con la mascota pequeña.
  2. **Tarjeta "Ahora"** (~150 dp): la siguiente entrada pendiente, grande, con botón "Hecho" de 56 dp en energía coral y "Más tarde" como ghost. Es la única acción principal de la pantalla.
  3. **"Lo que sigue" compacto**: máximo 3 filas de 56 dp con check; si hay más, fila "Ver el día completo (n)" que abre una **bottom sheet** con la línea completa (la lista actual se reutiliza dentro).
  4. **Un solo slot "Pomi dice"**: sugerencia, hallazgo, compañero y revisión se fusionan en una tarjeta con **carrusel horizontal paginado** (puntos indicadores) o en prioridad: revisión > sugerencia > hallazgo > compañero. Altura fija ~120 dp.
  5. ActivityCard: pasa a un chip en la cabecera ("¿Te moviste hoy?") que abre una sheet, o vive solo en Hábitos.
  - Resultado: 150 + 150 + 3×64 + 120 + gaps ≈ **640 dp, cabe**.
- **Pasa a secundario:** timeline completa (sheet), ActivityCard (Hábitos), burbuja de "todo hecho" (reemplazada por el estado celebrado de la tarjeta "Ahora").

#### Gym (tab) — `app/(tabs)/gym.tsx`
- **Altura:** título 34 · tarjeta "Hoy toca" ≈ 180 · título rutinas 28 + 3–4 tarjetas × 80 ≈ 350 · WeekVolumeCard (gráfico 180) ≈ 280 · 2 botones 112 · gaps de 32. **≈ 1.100 dp ≈ 1,7 pantallas.**
- **Qué fuerza el scroll:** `gap: space[8]` (32) entre bloques, el gráfico de volumen y dos botones apilados al final.
- **Reestructura:** tarjeta hero coral "Hoy toca: {rutina}" que ocupa ~45% de la pantalla con CTA "Empezar" (56 dp) **en la mitad inferior**; rutinas en **carrusel horizontal** de tarjetas 140×96; volumen semanal → Progreso (deja un mini resumen "12 series esta semana" en la tarjeta hero); "Editar programa" y "Crear rutina" a un menú de overflow en la cabecera. **≈ 600 dp, cabe.**

#### Sesión de gym — `app/gym/session.tsx`, `src/gym/ExerciseCard.tsx`, `src/gym/SetRow.tsx`
- **Altura:** cabecera + ProgressBar ≈ 80 · calentamiento ≈ 150–250 · cada ExerciseCard ≈ título 28 + chips de objetivo 40 + mensajes 40 + N series × (56 + 8 + fila RIR ~56 cuando se abre) ≈ 330–450 · × 5–7 ejercicios · botón final 56. **≈ 1.800–2.500 dp ≈ 3–4 pantallas.**
- **Qué fuerza el scroll:** todos los ejercicios con todas sus series se renderizan a la vez. Con una mano y sudando, encontrar "dónde voy" requiere desplazarse cada serie. "Terminar" está al final.
- **Reestructura (modo foco):**
  1. Cabecera compacta: nombre de rutina + **chips de ejercicios** horizontales (1 · 2 · 3 …, el actual relleno coral, los terminados con check verde).
  2. Cuerpo: **un ejercicio por página** (pager horizontal con swipe o botones "Anterior/Siguiente"). Dentro, las series del ejercicio (4 × 64 ≈ 260 dp) y el objetivo.
  3. **Barra inferior fija** (`Screen footer`): botón gigante "Serie hecha" (56–64 dp, energía coral) que marca la siguiente serie pendiente; a la izquierda, botón de temporizador. Cuando el ejercicio termina, el botón pasa a "Siguiente ejercicio".
  4. "Terminar sesión" en el menú de la cabecera y como CTA del último ejercicio.
  5. Calentamiento como primera página (o sección colapsable).
  - Resultado: 80 + ~420 + 88 ≈ **590 dp, cabe** (scroll solo si un ejercicio tiene más de 6 series).

#### Hábitos — `app/(tabs)/habitos.tsx` → `src/habits/HabitsScreen.tsx`
- **Altura:** título 34 · ActivityCard 140 · WaterCard ≈ 200 · StepsCard ≈ 220 (con conectar/entrada manual) · CheckCard × n ≈ 120 c/u · FoodCard ≈ 140 · CheckinsCard ≈ 200 · SleepLine ≈ 120 · gaps de 20. **≈ 1.300–1.600 dp ≈ 2–2,5 pantallas.**
- **Qué fuerza el scroll:** cada hábito es una tarjeta de ancho completo con título, contador y ayuda; la tarjeta de check-ins y la de comida son contenido de otra naturaleza.
- **Reestructura:** **grilla 2×2 de baldosas con tinte por categoría** (agua azul, pasos verde, sueño índigo, checks/gym coral), cada una ~150×150 con anillo de progreso, número en `metric` y un botón "+" de 48 dp (agua) o check (hábitos sí/no). Tocar la baldosa abre una **bottom sheet** con el detalle actual (entrada manual de pasos, conectar Health Connect, consistencia). Debajo, una fila de check-ins ("Mañana ✓ · Noche pendiente") de 64 dp. Comida → dentro del check-in de la noche o como sheet desde un chip. Más de 4 hábitos: la grilla pasa a 2 columnas con scroll interno solo de la grilla. **≈ 34 + 2×160 + 64 + gaps ≈ 480–560 dp, cabe.**

#### Check-in — `app/checkin/[tipo].tsx` → `src/checkin/CheckinScreen.tsx`, `src/ui/CheckinSheet.tsx`
- **Altura:** cabecera con mascota 72 · 3–5 preguntas × ~100 · TextField de comida ~90 · Guardar 56. **≈ 700–900 dp, roza o desborda en 720.**
- **Reestructura:** wizard de una pregunta por paso con barra de progreso y **"Siguiente/Guardar" fijo abajo** (mismo patrón que onboarding), o mantener una sola página compactando las escalas a filas de caras de 56 dp y moviendo "Guardar" al footer fijo. El wizard es más rápido con una mano y da un momento de cierre (mascota `descansa`/`hola` al final).

#### Onboarding — `app/onboarding/*`, `src/onboarding/QuestionScreen.tsx`, `StartingPointScreen.tsx`
- QuestionScreen: **correcto** (scroll solo del contenido, botones fijos). Es el patrón de referencia.
- StartingPointScreen (resumen): burbuja ≈ 180 + 4 GoalCard × ~130 + botón ≈ **950 dp**. Pasar a grilla 2×2 de baldosas con tinte por categoría (mismo componente que Hábitos) + CTA fijo abajo → **≈ 620 dp**.

### 2.2 Pantallas de referencia (scroll aceptable, falta jerarquía)

| Pantalla | Archivo | Altura est. | Problema | Reestructura |
|---|---|---|---|---|
| Progreso (tab) | `src/progress/ProgressScreen.tsx` | ≈ 3.000+ dp (consistencia, fuerza con chips + LineChart, volumen, medidas, mensual, fotos, compañero, hallazgos) | Todo en un scroll con `gap 32`; gráficos de 180 dp en serie | **Pestañas segmentadas** arriba: Constancia · Fuerza · Cuerpo · Hallazgos. Cada pestaña empieza con una **tarjeta resumen** (número grande + frase) y 1–2 gráficos. Fotos y mensual como tarjetas-enlace en "Cuerpo". |
| Ajustes (tab) | `app/(tabs)/ajustes.tsx` | ≈ 900–1.000 dp (8 tarjetas) | Tarjetas grandes para lo que son filas de navegación | **Lista agrupada** de filas de 56 dp con ícono tintado (Cuenta y datos / Avisos / Apariencia / Pomi). ≈ 600 dp. |
| Revisión semanal | `src/review/ReviewScreen.tsx` | ≈ 800–1.000 | Carta larga | Mantener scroll (es lectura), pero **cabecera hero sol** con la mascota `celebra` y 3 números clave; CTA de cierre fijo. |
| Revisión mensual | `src/monthly/MonthlyReviewScreen.tsx` | ≈ 1.000+ (6 botones, 2 burbujas, campo) | Flujo de varios pasos en una página | **Wizard por pasos** (fotos → medidas → reflexión) con footer fijo. |
| Comparación | `src/monthly/ComparisonScreen.tsx` | ≈ 900 | 5 tarjetas apiladas | Comparación de fotos a pantalla completa con slider antes/después; métricas en carrusel horizontal debajo. |
| Compartir | `src/reports/ShareScreen.tsx` | ≈ 700 | Ok | Preview de la tarjeta + botón compartir fijo. |
| Fotos | `src/photos/PhotosScreen.tsx` | FlatList | Ok (virtualizado) | Botón "Nueva foto" como FAB/footer en energía. |
| Crear rutina (generador) | `src/generator/*` | Wizard PAR-Q → inputs → propuesta, en `Screen scroll` | Inputs y propuesta largos | Mantener wizard; **footer fijo** con "Siguiente/Aceptar"; propuesta con días en carrusel/segmentos. |
| Editar programa / rutina / paso | `src/editor/*Screen.tsx` | StepEditor: 12 TextField ≈ 1.100 dp | Formulario largo | Agrupar en secciones colapsables (Básico / Series / Avanzado) y **Guardar fijo**. |
| Añadir ejercicio | `src/editor/ExercisePickerScreen.tsx` | Lista | Ok | Buscador fijo arriba, chips de filtro en una fila horizontal. |
| Importar programa | `src/templates/ProgramImportScreen.tsx` | ≈ 800 | Ok | Footer fijo. |
| Mis avisos | `src/notifications/MyNotificationsScreen.tsx` (501 líneas) | ≈ 1.200+ | Muchos controles abiertos a la vez | Lista de avisos como filas con switch; tocar abre **bottom sheet** con hora y días. |
| Respaldo | `src/backup/BackupScreen.tsx` (490 líneas) | ≈ 1.200+ (4 tarjetas, 7 botones, 3 switches) | Todo expandido | Tarjeta de estado arriba ("Último respaldo: hoy") + acciones principales; opciones avanzadas colapsadas. |
| Conectar tu IA | `src/ai/ConnectAiScreen.tsx` | ≈ 1.000 | Formulario + explicación | Wizard de 2 pasos (proveedor → clave) con footer fijo. |
| Pregúntale a Pomi | `src/ai/AskAiScreen.tsx` | Chat | Verificar que el campo de texto esté fijo abajo con `KeyboardAvoidingView` | Patrón de chat estándar. |
| Ciclos de sueño | `src/companion/SleepCalcScreen.tsx` | ≈ 600 | Ok | Tinte índigo. |
| Acerca, Batería, Permisos | `src/about/`, `app/bateria.tsx`, `app/permisos.tsx` | < 720 | Ok | Solo color. |

---

## 3. Color y energía

### 3.1 Por qué se ve plano
- **Dominancia crema + blanco + navy.** En una pantalla típica, más del 90% del área es `#F8F1E5`/`#FFFFFF` y todo el texto, el botón primario y el tab activo son `#1A2846`. Sin regiones de color, el ojo no encuentra el foco.
- **Los acentos son trazos, no superficies.** `brand` solo aparece como borde del item "now" y en el relleno de la gota; `energyText` en captions de 13 sp; `celebrate` como borde izquierdo de 4 dp. Los colores de marca existen como tokens, pero no "poseen" ninguna región.
- **El primario es navy.** El CTA más importante del día tiene el mismo color que el texto. Funciona en contraste, pero no invita.
- **Sin color por categoría.** Agua, pasos, sueño y gym no tienen identidad visual; el usuario lee títulos en vez de reconocer colores.
- **Tab bar monocromo** (activo navy, inactivo navy-700): la navegación no tiene un indicador de color.

### 3.2 Sistema vibrante propuesto (dirección "Pomi Splash")
Principios: el color **posee regiones** (cabecera hero, baldosas, CTA), no bordes; el texto sigue siendo navy en claro y crema en oscuro (regla de BRAND §4.2); blanco solo sobre tonos profundos verificados.

**Nuevas tonalidades de paleta** (agregar a `color.palette`):

| Token | Hex | Uso |
|---|---|---|
| `sky-50` | `#F2FAFE` | Nuevo fondo claro (aire azulado, más fresco que crema) |
| `blue-100` | `#D2EFFB` | Tinte de agua, indicador del tab activo |
| `blue-600` | `#0E8FC4` | Arcos de anillos y gráficos sobre blanco (≥ 3:1) |
| `blue-700` | `#0A6E9E` | Texto/ícono azul sobre claro; superficie con texto blanco |
| `coral-100` | `#FFE1D9` | Tinte gym/energía |
| `coral-600` | `#D63F25` | **CTA de energía con texto blanco** |
| `coral-800` | `#A82E19` | Texto coral sobre tinte coral |
| `sun-100` | `#FFF0C7` | Tinte de celebración |
| `sun-300` | `#FFC94D` | Sol brillante (oscuro y destellos) |
| `sun-700` | `#8A5A00` | Texto sobre tinte sol |
| `green-100` | `#D5F5E8` | Tinte pasos |
| `green-500` | `#22C08A` | Relleno pasos (con texto navy) |
| `green-600` | `#1A9E6E` | Arco de pasos sobre blanco |
| `green-700` | `#0F7A55` | Texto verde sobre claro |
| `indigo-100` | `#E4E4FD` | Tinte sueño |
| `indigo-500` | `#6C6FF0` | Relleno/arco sueño |
| `indigo-700` | `#4A4CC9` | Texto índigo sobre claro |
| `night-hero` | `#0F3B5C` | Cabecera hero en modo oscuro |

**Roles semánticos nuevos o cambiados:**

| Rol | Claro | Oscuro | Nota |
|---|---|---|---|
| `bg` | `#F2FAFE` (antes crema) | `#0E1729` | Crema queda como `surfaceWarm` para la carta de revisión y el onboarding |
| `surface` | `#FFFFFF` | `#17233D` | Sin cambio |
| `hero` | `#29B5E8` | `#0F3B5C` | Cabeceras de Hoy, Gym, Hábitos |
| `onHero` | `#1A2846` | `#F8F1E5` | Navy sobre azul; crema sobre noche |
| `onHeroMuted` | `#1A2846` al 80% (o navy-700 sólo en ≥ 18 sp) | `#B8C2D9` | |
| `energy` (relleno CTA) | `#D63F25` | `#FF7A5C` | |
| `onEnergy` | `#FFFFFF` | `#1A2846` | |
| `energyText` | `#C93A22` | `#FF7A5C` | Sin cambio |
| `primary` | `#1A2846` | `#29B5E8` | Queda para acciones neutras fuertes (guardar ajustes) |
| `celebrate` | `#F6B634` | `#FFC94D` | Siempre con texto navy |
| `celebrateSoft` | `#FFF0C7` | `#3A2E10` | |
| `tabActiveBg` | `#D2EFFB` | `#1B3350` | Pastilla detrás del ícono activo |
| `cat.water` fill/soft/text | `#29B5E8` / `#D2EFFB` / `#0A6E9E` | `#5CCBF2` / `#1B3350` / `#5CCBF2` | |
| `cat.gym` | `#F15A3B` / `#FFE1D9` / `#A82E19` | `#FF7A5C` / `#3A1F1A` / `#FF7A5C` | |
| `cat.steps` | `#22C08A` / `#D5F5E8` / `#0F7A55` | `#4CD39C` / `#123A2C` / `#4CD39C` | |
| `cat.sleep` | `#6C6FF0` / `#E4E4FD` / `#4A4CC9` | `#9EA0FF` / `#242552` / `#9EA0FF` | |
| `chart.series` | `#0E8FC4`, `#D63F25`, `#1A9E6E`, `#6C6FF0` | `#5CCBF2`, `#FF7A5C`, `#4CD39C`, `#9EA0FF` | Series diferenciadas también por forma/etiqueta |

### 3.3 Contrastes calculados (WCAG 2.x, fórmula de luminancia relativa)

**Texto (AA: 4,5 normal; 3,0 grande ≥ 18,66 px negrita o ≥ 24 px):**

| Texto | Fondo | Ratio | Resultado |
|---|---|---|---|
| navy-900 `#1A2846` | sky-50 `#F2FAFE` | 13,85 | ✅ |
| navy-700 `#33436A` | sky-50 `#F2FAFE` | 9,24 | ✅ |
| navy-900 | white | 14,63 | ✅ |
| navy-900 | blue-500 `#29B5E8` (hero) | 6,18 | ✅ |
| navy-900 | blue-100 `#D2EFFB` | 12,17 | ✅ |
| white | blue-500 | 2,37 | ❌ (confirmado: prohibido) |
| white | blue-600 `#0E8FC4` | 3,66 | ⚠️ solo texto grande |
| white | blue-700 `#0A6E9E` | 5,62 | ✅ |
| cream | blue-700 | 5,01 | ✅ |
| blue-700 | white | 5,62 | ✅ texto azul |
| blue-700 | sky-50 | 5,32 | ✅ |
| white | coral-500 `#F15A3B` | 3,35 | ⚠️ solo grande |
| navy-900 | coral-500 | 4,36 | ❌ texto normal (no usar) |
| white | coral-600 `#D63F25` | 4,57 | ✅ CTA |
| white | coral-700 `#C93A22` | 5,11 | ✅ |
| coral-700 | white | 5,11 | ✅ |
| coral-700 | coral-100 `#FFE1D9` | 4,14 | ❌ → usar coral-800 |
| coral-800 `#A82E19` | coral-100 | 5,55 | ✅ |
| navy-900 | coral-100 | 11,86 | ✅ |
| navy-900 | sun-400 `#F6B634` | 8,12 | ✅ |
| navy-900 | sun-100 `#FFF0C7` | 12,91 | ✅ |
| sun-700 `#8A5A00` | sun-100 | 5,23 | ✅ |
| sun-700 | white | 5,93 | ✅ |
| navy-900 | green-500 `#22C08A` | 6,25 | ✅ |
| white | green-700 `#0F7A55` | 5,34 | ✅ |
| green-700 | green-100 `#D5F5E8` | 4,59 | ✅ |
| green-700 | white | 5,34 | ✅ |
| white | indigo-700 `#4A4CC9` | 6,63 | ✅ |
| indigo-700 | indigo-100 `#E4E4FD` | 5,31 | ✅ |
| navy-900 | indigo-100 | 11,71 | ✅ |
| **Oscuro** cream `#F8F1E5` | bg `#0E1729` | 15,94 | ✅ |
| cream | surface `#17233D` | 13,91 | ✅ |
| cream | surfaceRaised `#1F2D4D` | 12,14 | ✅ |
| muted `#B8C2D9` | surface | 8,75 | ✅ |
| cream | night-hero `#0F3B5C` | 10,39 | ✅ |
| navy-900 | `#FF7A5C` (CTA oscuro) | 5,70 | ✅ |
| navy-900 | `#FFC94D` | 9,55 | ✅ |
| navy-900 | `#4CD39C` | 7,73 | ✅ |
| navy-900 | `#9EA0FF` | 6,22 | ✅ |
| `#5CCBF2` / `#FF7A5C` / `#FFC94D` / `#4CD39C` / `#9EA0FF` | surface `#17233D` | 8,39 / 6,09 / 10,20 / 8,26 / 6,64 | ✅ como texto de categoría en oscuro |
| `#29B5E8` | night-hero | 4,93 | ✅ |
| `#FF7A5C` | night-hero | 4,55 | ✅ |

**Elementos gráficos (AA 1.4.11: 3,0 para anillos, arcos, íconos con significado):**

| Gráfico | Fondo | Ratio | Resultado |
|---|---|---|---|
| blue-500 | white | 2,37 | ❌ → arco en blue-600 |
| blue-600 | white | 3,66 | ✅ |
| blue-600 | sky-50 | 3,46 | ✅ |
| blue-500 | cream | 2,11 | ❌ (estado actual de la gota de agua sobre crema) |
| coral-500 | white | 3,35 | ✅ |
| coral-600 | sky-50 | 3,93 | ✅ |
| green-500 | white | 2,34 | ❌ → green-600 |
| green-600 | white | 3,41 | ✅ |
| indigo-500 | white | 4,06 | ✅ |
| sun-400 | cream | 1,60 | ❌ solo decorativo o con contorno navy |
| blue-500 / coral-500 | surface oscuro | 6,60 / 4,66 | ✅ |

Regla: el sol nunca es el único portador de significado; en anillos de celebración va con número navy dentro o contorno navy (como la mascota).

### 3.4 Dónde va el color (dosis)
- **Hero azul** arriba de Hoy, Gym y Hábitos (~20–25% del área). Sin wordmark sobre el azul (BRAND §3.3).
- **Un solo CTA coral por pantalla** (la acción del pulgar). Secundarios: blanco con borde, o navy.
- **Baldosas con tinte de categoría** (100 de fondo, 500/600 en el anillo, 700 en el número/etiqueta).
- **Sol** solo en celebraciones: tarjeta "día completo", resumen de sesión, revisión semanal.
- **Tab bar:** pastilla `blue-100` detrás del ícono activo, ícono navy relleno.

---

## 4. Movimiento y deleite (sin gamificación)

Ya existe: `usePressScale`, `FadeIn`, hápticos en HabitCounter / timers / Hoy / gym, reduce-motion en 8 componentes, tokens `motion` (100/240/360 ms, `easing.out`, spring 14/180, `reducedFade` 120). Faltan los momentos.

| Momento | Propuesta | Duración / easing | Reduce-motion |
|---|---|---|---|
| Marcar entrada de Hoy | El check se dibuja (stroke), el anillo del día avanza con spring; háptico `impactLight` | 240 ms, `easing.out` / spring 14/180 | Cambio instantáneo + fade 120 ms |
| Día completo | La mascota cambia a `celebra` con escala 0,9→1 (spring) y 5–6 destellos sol que salen y se desvanecen; tarjeta "Ahora" se vuelve `celebrateSoft`; háptico `notificationSuccess` | 600 ms total (evento raro, se permite) | Sin destellos; crossfade de pose |
| Serie hecha (gym) | El botón "Serie hecha" se rellena de izquierda a derecha y la fila se tinta coral-100; háptico `impactMedium` | 160 ms | Solo color |
| Ejercicio terminado | Chip del ejercicio pasa a verde con check; auto-avance a la siguiente página tras 400 ms (cancelable) | pager 240 ms | Sin auto-slide, cambio directo |
| Fin de sesión | Números del resumen con conteo ascendente (Nunito tabular), mascota `celebra` | 800 ms | Números finales directos |
| Agua | La gota ya se llena; agregar onda pequeña al tocar "+" y avance del anillo de la baldosa | 240 ms | Solo relleno |
| Pomi reacciona al contexto | Pose según la hora/estado: `hola` (mañana), `enfocado` (sesión), `agua` (baldosa de agua), `descansa` (noche), `tranqui` (si faltaste: "Pasa. Mañana seguimos") | crossfade 240 ms | crossfade 120 ms |

Reglas: nada que ocurra decenas de veces al día dura más de 240 ms; nunca ease-in; animar solo `transform`/`opacity`; ninguna reacción negativa (sin caras tristes, sin "perdiste la racha").

---

## 5. Tipografía y jerarquía (ganancias rápidas)
1. **Números como protagonistas:** usar `metric` (Nunito 900, 40/44, tabular) para progreso del día, vasos de agua, pasos, series hechas y volumen; hoy aparecen en `body`/`caption`.
2. **Identidad bajo el saludo:** bajar de `title-md` muted a `body-strong` en una línea; hoy compite con el saludo y empuja contenido.
3. **Eyebrows de sección:** `caption` en color de categoría (texto 700) en lugar de `title-sm` navy para etiquetas como "HOY TOCA", "AGUA".
4. **Fredoka para títulos de baldosas y cabeceras hero** (`title-sm` 18/24) y para el estado celebrado ("¡Día completo!").
5. **Espaciado:** bajar `gap` de pantalla de `space[8]` (32) a `space[4–5]` en Gym y Progreso; con divulgación progresiva no hace falta tanto aire.
6. **Botón CTA del pulgar** en `lg` (56) con `body-strong` 16; si se quiere usar coral-500 puro, subir la etiqueta a 19 sp negrita (texto grande, 3,35 ✅).

---

## 6. Direcciones visuales (elegir UNA)

| Dirección | Idea en una línea | Paleta |
|---|---|---|
| **A. Pomi Splash (recomendada)** | Cielo y agua: fondo aireado, cabeceras azul Pomi, CTA coral, destellos sol solo al celebrar; la más fiel al arte de la mascota. | bg `#F2FAFE` · hero `#29B5E8` (texto `#1A2846`) · CTA `#D63F25` (texto blanco) · celebrar `#F6B634` · texto `#1A2846` · categorías `#29B5E8` / `#F15A3B` / `#22C08A` / `#6C6FF0` |
| B. Sunrise Pop | Conserva el crema de marca y lo calienta: cabeceras amarillo sol, coral fuerte, azul como acento; más cálida y "mañanera". | bg `#F8F1E5` · hero `#FFC94D` (texto `#1A2846`, 9,55) · CTA `#D63F25` · acento `#29B5E8` · texto `#1A2846` · superficie `#FFFFFF` |
| C. Deep Pool | Cabeceras azul noche profundo con texto crema y acentos eléctricos; más deportiva y nocturna, consistente entre claro y oscuro. | bg `#F2FAFE` · hero `#0F3B5C` (texto `#F8F1E5`, 10,39) · acento `#29B5E8` (4,93 sobre hero) · CTA `#FF7A5C` (texto `#1A2846`, 5,70) · sol `#FFC94D` |

Por qué A: es la que trae a la UI lo que la marca ya es (mascota azul saturada), mantiene navy como texto (BRAND §4.2) y da contraste de temperatura (azul frío arriba, coral cálido en el pulgar). Cambia el fondo crema por `sky-50`; si la dueña quiere conservar el crema como seña de marca, B lo hace.

---

## 7. Plan priorizado

### P0-a: bugs del dispositivo (primero, son baratos)
| # | Cambio | Archivos | Esfuerzo |
|---|---|---|---|
| B1 | Columna de hora con `minWidth` × fontScale, una línea, tabular | `src/ui/TimelineItem.tsx`, `design/tokens.json` | S |
| B2 | `TimePicker` compacto de una fila; separar etiqueta visible y de accesibilidad en `Stepper` | `src/ui/Stepper.tsx`, `src/onboarding/questions.tsx`, `src/ui/stepper.test.tsx` | S–M |
| B3 | Aviso "Valor sugerido" al footer; padding inferior; `behavior` del teclado en Android | `src/onboarding/QuestionScreen.tsx`, `src/onboarding/questions.tsx` | S |
| B4 | `StepHeader` con slot fijo de 48×48 para atrás, compartido por onboarding y check-in | `src/onboarding/QuestionScreen.tsx`, `src/checkin/CheckinScreen.tsx`, nuevo `src/ui/StepHeader.tsx` | S |
| B5 | `fontFamily` explícito en todos los `TextInput` y su placeholder; test | `src/ui/TextField.tsx`, `src/gym/SetRow.tsx` | S |

### P0-b: caber en pantalla + tokens vibrantes (oscuro primero) + identidad por sección
| # | Cambio | Archivos | Esfuerzo |
|---|---|---|---|
| 0 | Tab bar nueva: ícono relleno en color de sección + pastilla, acción central "Registrar", Ajustes fuera de la barra | `app/(tabs)/_layout.tsx`, nuevo `src/ui/QuickAddSheet.tsx`, `app/(tabs)/hoy.tsx` (engranaje) | M |
| 0b | Identidad por sección (color + ícono) en cabeceras y tarjetas; quitar texto repetido en Hábitos y acortar aviso de P1 | `src/habits/HabitsScreen.tsx`, `src/ui/Consistency.tsx`, `src/onboarding/questions.tsx`, `src/i18n/es.ts`, `src/i18n/en.ts` | S–M |
| 1 | Paleta y roles nuevos (sección 3.2 y 0.1), **definidos primero para oscuro**, tipos y tests; actualizar BRAND §4 | `design/tokens.json`, `src/ui/theme.tsx`, `src/ui/theme.test.ts`, `design/BRAND.md`, `design/HANDOFF.md` | M |
| 2 | `Button variant="energy"`, `Card variant="hero" | "tint"` con prop `category` | `src/ui/Button.tsx`, `src/ui/Card.tsx`, `src/ui/components.test.tsx` | S |
| 3 | `Screen` con `header` (hero a sangre) y `footer` fijo (barra de acción del pulgar, respeta insets y teclado) | `src/ui/Screen.tsx` | S |
| 4 | Hoy: hero + anillo del día, tarjeta "Ahora", "Lo que sigue" (3) + sheet del día completo, slot único "Pomi dice" | `src/today/TodayScreen.tsx`, nuevos `src/today/NowCard.tsx`, `DaySheet.tsx`, `src/ui/TimelineItem.tsx` | M |
| 5 | Sesión de gym en modo foco: chips de ejercicios, un ejercicio por página, footer "Serie hecha" | `app/gym/session.tsx`, `src/gym/ExerciseCard.tsx`, `src/gym/SetRow.tsx`, `src/gym/sessionViewModel.ts` | L |
| 6 | Hábitos: grilla 2×2 de baldosas con tinte + sheet de detalle | `src/habits/HabitsScreen.tsx`, `src/ui/HabitCounter.tsx`, nuevo `src/ui/HabitTile.tsx` | M |
| 7 | Gym tab: hero "Hoy toca" con CTA abajo, carrusel de rutinas, volumen a Progreso, acciones a overflow | `app/(tabs)/gym.tsx` | S |
| 8 | Validación responsiva: 360×640, 360×780, 412×915, escala 1,0 y 1,3, oscuro y claro | pantallas P0 | S |

### P1
| # | Cambio | Archivos | Esfuerzo |
|---|---|---|---|
| 1 | Check-in como wizard o compacto con footer fijo | `src/checkin/CheckinScreen.tsx`, `src/ui/CheckinSheet.tsx` | M |
| 2 | Progreso con pestañas segmentadas + tarjeta resumen por pestaña; paleta de gráficos | `src/progress/ProgressScreen.tsx`, `src/ui/BarChart.tsx`, `src/ui/LineChart.tsx` | M |
| 3 | Ajustes como lista agrupada de filas de 56 dp con íconos tintados | `app/(tabs)/ajustes.tsx`, `src/ui/OptionRow.tsx` | S |
| 4 | Momentos de deleite: día completo, serie hecha, fin de sesión, reacciones de pose | `src/ui/Mascot.tsx`, `src/ui/MascotBubble.tsx`, nuevo `src/ui/Sparkles.tsx`, `src/ui/ProgressBar.tsx` (anillo) | M |
| 5 | Resumen de onboarding en grilla de baldosas + CTA fijo | `src/onboarding/StartingPointScreen.tsx` | S |
| 6 | Tipografía: `metric` en números, identidad en `body-strong`, eyebrows de categoría | pantallas P0 | S |

### P2
| # | Cambio | Archivos | Esfuerzo |
|---|---|---|---|
| 1 | Revisión mensual y crear rutina como wizards con footer fijo | `src/monthly/MonthlyReviewScreen.tsx`, `src/generator/*` | M |
| 2 | Editores con secciones colapsables y Guardar fijo | `src/editor/*Screen.tsx` | M |
| 3 | Mis avisos y Respaldo: filas + bottom sheets, opciones avanzadas colapsadas | `src/notifications/MyNotificationsScreen.tsx`, `src/backup/BackupScreen.tsx` | M |
| 4 | Conectar IA como wizard de 2 pasos; revisar teclado en Pregúntale a Pomi | `src/ai/ConnectAiScreen.tsx`, `src/ai/AskAiScreen.tsx` | S |
| 5 | Comparación con slider antes/después; Revisión semanal con cabecera sol | `src/monthly/ComparisonScreen.tsx`, `src/review/ReviewScreen.tsx` | M |
| 6 | Verificación en dispositivo: 360×640 (pantallas chicas) y fuente del sistema al 130%; las pantallas diarias deben degradar a scroll sin perder el footer fijo | todas | S |

**Riesgos:** (1) "caber en pantalla" no puede romper la escala de fuente del sistema: el layout debe permitir scroll como respaldo, nunca recortar; (2) el cambio de fondo crema → sky-50 modifica una regla de marca y requiere la aprobación de la dueña; (3) el modo foco del gym cambia el modelo mental de la sesión: probar con una sesión real antes de cerrar.

---

## 8. Implementado (2026-10)

| Commit | Alcance |
|---|---|
| `285ef5c` `fix: UI bugs found on device` | B1–B5 (sección 0.1) + texto repetido: columna de hora con `timeline.timeColumn` × escala de fuente, una línea y dígitos tabulares; `TimeStepper` en una fila `[− HH +] : [− MM +]` con solo la etiqueta humana visible; aviso "Sugerido" en el footer; `StepHeader` con hueco fijo de 48 × 48 (onboarding y check-in); `ThemedTextInput` (fuente explícita y plana en valor y placeholder, con test que impide `TextInput` crudos); Hábitos sin repetir el nombre en la constancia y "cuenta cuando lo completas" una vez; aviso de P1 en una línea + hoja "Más info". |
| `feat: Pomi Splash tokens, section identity and new tab bar` | Paleta y roles nuevos (oscuro primero), `section.*` con `fill/onFill/soft/text`, `Button energy`, `Card hero/tint`, `SectionHeader` (Ajustes pasa al engranaje), `Screen` con `header` y `footer` fijo, tab bar nueva (Hoy · Gym · Registrar · Hábitos · Progreso) con hoja de registro rápido, `BRAND.md` 4.5 y `HANDOFF.md` §2–3 actualizados. |

**Diferencias con la propuesta de las secciones 3.2–3.4:**
- Sin `hero` azul: el bloque de cabecera es el color de la sección (decisión de la dueña). En claro se usan **los mismos rellenos**: con texto navy todos pasan AA (5,70–9,55:1), así que no hizo falta un tono más oscuro; el tono profundo (`*-700`, `coral-800`) se usa solo cuando el color de sección es texto o ícono sobre claro.
- CTA de energía `#FF7A5C` con texto navy **en ambos modos** (no `#D63F25` con blanco en claro). `color.energy` (acento gráfico, ≥ 3:1) queda `#F15A3B` en claro porque `#FF7A5C` sobre blanco da 2,56:1.
- Subtítulos de cabecera en navy (no `navy-700`: 3,81:1 sobre coral, 4,15:1 sobre lavanda).
- La pastilla del tab activo cambia sin animación (cambio directo; también con reduce-motion).
- "Nota de comida" y "Marcar hábito" del registro rápido llevan a Hábitos (donde viven esos controles); "+1 vaso" escribe directo; "Check-in" abre el de la mañana antes de las 15:00 y el de la noche después; "Iniciar sesión" abre la rutina de hoy (o la que está en curso), o Gym si no hay.
- **Aclaración de la dueña:** el objetivo no es meter todo en una pantalla. Las pestañas principales serán **hubs bento** (baldosas de tamaños variados con un resumen: número grande, anillo, mini gráfico o estado) y cada baldosa abre una **página de detalle** con todos los datos (ahí el scroll está bien). Este commit agrega las primitivas `BentoGrid` y `BentoTile`; la conversión de Hoy/Gym/Hábitos/Progreso y sus rutas de detalle va en el siguiente lote.
- Pendiente (P0-b 4–7 y P1): reestructurar Hoy, sesión de gym en modo foco, grilla de Hábitos, Gym tab; usar el `footer` fijo en esas pantallas.

**Validación de layout (razonada, sin dispositivo), 360 × 780 y 412 × 915, escala 1,0 y 1,3:** tab bar 72 dp × escala (94 dp a 1,3) + zona segura, 5 huecos de 72 dp a 360 de ancho, etiquetas de una línea que se achican hasta 0,8 antes de recortarse ("Progreso" a 1,3 ≈ 76 dp); cabecera de sección: título `title-lg` hasta 2 líneas (≈ 224 dp útiles a 360 junto al ícono y el engranaje de 48 dp); `TimeStepper` ≈ 306 dp a 1,3 (cabe en 320) y pasa a dos líneas con `flexWrap` si no; columna de hora ≥ 56 dp × escala.

