# Pomi: handoff de diseño para desarrollo

> Especificación visual y de interacción para construir la UI de Pomi en React Native (Expo).
> Usa siempre los **tokens** de `design/tokens.json` y `design/theme.ts`, nunca valores sueltos.
> Marca, voz y mascota: ver `design/BRAND.md`.

## 1. Overview

Pomi es una app móvil de gym y hábitos. El usuario la abre varias veces al día por pocos segundos (marcar agua, un check-in) y una vez por entrenamiento por 45–70 minutos (sesión de gym, a menudo con una mano ocupada y sudando). Por eso:

- **Interacciones de una mano:** las acciones principales están en la mitad inferior de la pantalla.
- **Toques grandes:** mínimo 48 × 48 dp en la sesión de gym (dedos sudados), 44 × 44 dp en el resto.
- **Lectura rápida:** números grandes (`metric`, `timer`), una idea por tarjeta.

## 2. Layout

| Elemento | Especificación |
|---|---|
| Plataforma | Móvil vertical. Ancho de referencia: 360–430 dp |
| Margen lateral | `space-5` (20 dp) |
| Separación entre tarjetas | `space-3` (12 dp) |
| Separación entre secciones | `space-8` (32 dp) |
| Padding interno de tarjeta | `space-4` (16 dp) |
| Ancho máximo de contenido | 560 dp, centrado (tablets) |
| Zonas seguras | Respetar `SafeAreaView` arriba y abajo |
| Barra de pestañas | Abajo, 5 pestañas: Hoy, Gym, Hábitos, Progreso, Ajustes. Alto 64 dp + zona segura |

### Responsive

| Ancho | Cambios |
|---|---|
| Menos de 360 dp | `timer` baja a 44 px; la mascota en tarjetas baja a 72 dp; las filas de serie ocultan la columna "anterior" |
| 360–600 dp | Diseño base |
| Más de 600 dp (tablet) | Contenido centrado en 560 dp; en Progreso, gráficos en 2 columnas |

## 3. Tokens

Fuente de verdad: `design/tokens.json`. Resumen:

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `color.bg` | `#F8F1E5` | `#0E1729` | Fondo de pantalla |
| `color.surface` | `#FFFFFF` | `#17233D` | Tarjetas |
| `color.surfaceRaised` | `#FFFFFF` | `#1F2D4D` | Hojas, modales, toast |
| `color.text` | `#1A2846` | `#F8F1E5` | Texto principal |
| `color.textMuted` | `#33436A` | `#B8C2D9` | Texto secundario |
| `color.border` | `#E8DCC8` | `#2A3A5E` | Bordes y divisores |
| `color.primary` | `#1A2846` | `#29B5E8` | Botón primario |
| `color.onPrimary` | `#FFFFFF` | `#1A2846` | Texto del botón primario |
| `color.brand` | `#29B5E8` | `#29B5E8` | Mascota, acentos, anillos de progreso |
| `color.brandSoft` | `#E6F6FD` | `#1B3350` | Fondos destacados |
| `color.energy` | `#F15A3B` | `#FF7A5C` | Gym, progreso, cronómetro |
| `color.celebrate` | `#F6B634` | `#F6B634` | Celebraciones, hallazgos |
| `color.success` | `#1F9D6B` | `#4CD39C` | Confirmaciones |
| `color.error` | `#C2362B` | `#FF7A6B` | Errores (siempre con ícono y texto) |
| `space-1…12` | 4, 8, 12, 16, 20, 24, 32, 40, 48 dp | | Espaciado (escala de 4) |
| `radius-sm/md/lg/xl/pill` | 10, 16, 24, 32, 999 | | Esquinas |
| `shadow-soft` | y 4, blur 16, navy al 8% | sin sombra, borde `color.border` | Tarjetas |
| `shadow-raised` | y 8, blur 24, navy al 12% | sin sombra, `surfaceRaised` | Toast, hojas |

Tipografía: ver `BRAND.md` sección 5 (`display`, `title-lg`, `title-md`, `title-sm`, `body`, `body-strong`, `caption`, `timer`, `metric`).

## 4. Componentes

| Componente | Variantes | Props | Notas |
|---|---|---|---|
| `Button` | `primary`, `secondary`, `ghost`, `danger` | `label`, `onPress`, `icon?`, `loading?`, `disabled?`, `size: md \| lg` | Píldora (`radius-pill`). `md` 48 dp de alto, `lg` 56 dp. Texto `body-strong`. Sin emojis |
| `Card` | `default`, `highlight` (fondo `brandSoft`), `celebrate` (borde izquierdo 4 dp `celebrate`) | `children`, `onPress?` | `radius-md`, `shadow-soft`, padding `space-4` |
| `MascotBubble` | 10 poses (ver BRAND 6.2) | `pose`, `message`, `size: sm (72) \| md (120) \| lg (180)` | Mascota + burbuja de diálogo (máx. 40 caracteres). Burbuja blanca, contorno 2 dp `color.text`, `radius-lg` |
| `Toast` | `routineComplete`, `info`, `error` | `title`, `subtitle?`, `pose?` | Basado en la tarjeta "Rutina completada" del arte: estrella `celebrate` + texto `title-sm` + mascota `sm` |
| `TimerRing` | `rest`, `wait`, `cardio` | `endsAt`, `totalSec`, `segments?`, `onFinish` | Anillo de 160 dp, trazo de 12 dp; pista `border`, progreso `energy` (descanso) o `brand` (espera). Número `timer` al centro |
| `TimerSheet` | — | `timer`, `nextLabel` | Hoja inferior fija mientras corre un cronómetro: anillo + "Siguiente: …" + botones Pausar, +30 s y Saltar |
| `SetRow` | `pending`, `done`, `current` | `index`, `kg`, `reps`, `rir?`, `previous?`, `onToggle` | Fila de 56 dp: número, "anterior" (gris), input kg, input reps, botón ✓ de 48 dp. Teclado numérico |
| `ExerciseCard` | `default`, `complete` | `exercise`, `todayTarget`, `lastTime`, `sets` | Título `title-sm`; chips de series × reps, descanso y peso sugerido; **"Meta de hoy"** destacada en `energy` |
| `HabitCounter` | `water`, `steps`, `generic` | `value`, `target`, `onIncrement`, `onDecrement` | Agua: 8–10 gotas táctiles de 40 dp. Pasos: número `metric` + barra |
| `CheckinSheet` | `morning`, `night`, `monthly` | `questions`, `onSubmit` | Hoja inferior. Escalas 1–5 como 5 círculos de 48 dp con carita. Horas prellenadas. Debe completarse en menos de 10 s |
| `SuggestionCard` | — | `text`, `reason`, `onAccept`, `onDecline` | Mascota `curioso` `sm`; botones "Aceptar" (primary) y "Ahora no" (ghost) |
| `InsightCard` | — | `text`, `evidence` ("basado en 24 días") | Variante `celebrate`; mascota `curioso` |
| `TimelineItem` | `upcoming`, `now`, `done`, `skipped` | `time`, `title`, `subtitle`, `onPress`, `onCheck` | Pantalla Hoy. `now`: borde `brand` y hora en `energy`. `done`: texto tachado al 50% |
| `Consistency` | — | `done`, `total`, `label` | "8 de los últimos 10 días": 10 puntos pequeños, rellenos los cumplidos. **No es una racha:** no se "rompe" |
| `EmptyState` | — | `pose`, `title`, `body`, `action?` | Mascota `vacio` `md`, centrada |

## 5. Pantallas clave

### Hoy
1. Saludo con la hora: "Buenos días" / "Buenas tardes" + frase de identidad (`title-md`).
2. Si hay: `SuggestionCard` o `InsightCard` (máx. una).
3. Línea de tiempo (`TimelineItem`) del día.
4. Al completar todo: `MascotBubble` `descansa` + "Listo por hoy. Cierra la app y descansa".

### Sesión de gym
1. Encabezado: "Día 1: Glúteos e isquios" + progreso de series.
2. Calentamiento plegable (checks).
3. `ExerciseCard` por ejercicio, con `SetRow`.
4. Al marcar ✓ en una serie: aparece `TimerSheet` con el descanso.
5. Cardio: `TimerRing` `cardio` con tramos.
6. Al terminar: `Toast` `routineComplete` + resumen (series, volumen, metas cumplidas).

### Check-in
Hoja (`CheckinSheet`) que se abre desde la notificación o desde Hoy. Mascota `hola` (mañana) o `descansa` (noche) arriba, pequeña.

## 6. Estados e interacciones

| Elemento | Estado | Comportamiento |
|---|---|---|
| `Button` | Presionado | Escala 0.97 + oscurecer 8%, 100 ms |
| `Button` | Cargando | Spinner en lugar del texto; ancho fijo; deshabilitado |
| `Button` | Deshabilitado | Opacidad 40%; sin feedback háptico |
| `SetRow` | ✓ tocado | Haptic `impactMedium`; fila pasa a `done`; arranca descanso; guarda kg y reps |
| `SetRow` | ✓ tocado de nuevo | Desmarca; cancela el descanso si era de esa serie |
| `SetRow` | Input vacío al marcar | Usa el valor "anterior" como valor por defecto |
| `TimerRing` | Últimos 3 s | Pitido corto + haptic `light` por segundo; número en `energy` |
| `TimerRing` | Termina | Alarma + haptic `success`; anillo completo en `success`; texto "¡Listo!" |
| `TimerRing` | App en segundo plano | Sigue por timestamp; suena la notificación local programada |
| `HabitCounter` agua | Toque en gota | Se llena con animación; haptic `light`; tocar la última llena la desmarca |
| `SuggestionCard` | "Ahora no" | Se cierra con fade; no reaparece en 4 semanas |
| `TimelineItem` | Deslizar a la derecha | Marca como hecho (alternativa al botón) |
| `TimelineItem` | Mantener presionado | Opciones: posponer 10 min, omitir hoy |
| Cualquier tarjeta presionable | Presionado | Escala 0.98, 100 ms |

## 7. Movimiento

| Elemento | Disparador | Animación | Duración | Curva |
|---|---|---|---|---|
| `Toast` | Rutina completada | Entra desde arriba + leve rebote; sale a los 3 s | 280 ms entrada / 200 ms salida | Spring (damping 14) / ease-in |
| Mascota | Celebración | Salto: escala 1 → 1.08 → 1 y sube 8 dp | 360 ms | Spring |
| Mascota | Aparición | Fade + sube 12 dp | 240 ms | ease-out |
| `TimerSheet` | Inicio de descanso | Sube desde abajo | 240 ms | ease-out |
| Gota de agua | Llenado | Relleno de abajo hacia arriba | 300 ms | ease-in-out |
| Cambio de pestaña | Navegación | Fade cruzado | 160 ms | ease |

**Reducir movimiento:** si está activo en el sistema, todas las animaciones pasan a fade de 120 ms y la mascota no salta. Los hápticos se mantienen.

## 8. Contenido y casos límite

- **Estados vacíos:** cada pantalla tiene su `EmptyState` (ejemplo en Progreso: "Aquí aparecerá tu progreso. Completa tu primer entrenamiento").
- **Textos largos:** nombres de ejercicio hasta 2 líneas y luego `…`. Burbujas de mascota con máximo 40 caracteres (validar en i18n). Notificaciones: título hasta 30 caracteres, cuerpo hasta 80.
- **Números:** kg con un decimal como máximo ("42.5"), pasos con separador de miles según el idioma ("7,500" / "7.500").
- **Sin datos de pasos:** si Health Connect no tiene permiso, el contador se vuelve manual con un aviso discreto: "Conecta Health Connect para contar tus pasos solo".
- **Carga:** todo es local, así que las cargas son casi instantáneas. Usar skeletons solo si una consulta tarda más de 300 ms (gráficos de Progreso).
- **Errores:** importación de plantilla inválida → tarjeta `error` con el detalle en lenguaje simple y la línea del problema.
- **Hallazgos y sugerencias:** nunca más de una tarjeta de cada tipo en Hoy.
- **Primer día:** Hoy muestra la mascota `hola` y la agenda armada con el onboarding, sin gráficos vacíos.

## 9. Accesibilidad

- **Orden de foco:** de arriba a abajo; en la sesión de gym, ejercicio → series (kg, reps, ✓) → siguiente ejercicio.
- **Etiquetas:**
  - Botón ✓: "Serie 2 de hip thrust, marcar como hecha".
  - Gota: "Vaso 3 de 8".
  - `TimerRing`: "Descanso, quedan 1 minuto 20 segundos".
- **Anuncios del lector de pantalla:** al terminar un descanso ("Descanso terminado. Siguiente: serie 3"), al completar una rutina, y al aceptar una sugerencia.
- **La mascota es decorativa:** `accessible={false}`. El mensaje de la burbuja sí se lee.
- **Color:** nunca transmitir información solo con color (los errores llevan ícono, el estado `done` lleva ✓).
- **Texto escalable** hasta 1.3× sin cortar contenido.
- **Contraste:** seguir la tabla de `BRAND.md` 4.2.
