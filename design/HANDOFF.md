# Pomi: handoff de diseño para desarrollo

> Especificación visual y de interacción para construir la UI de Pomi en React Native (Expo).
> Usa siempre los **tokens** de `design/tokens.json` (consumidos solo a través de `src/ui/theme.tsx`), nunca valores sueltos.
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
| Barra de pestañas | Abajo: Hoy, Gym, botón central elevado «Registrar» (56 dp, ladrillo, abre la hoja de registro rápido), Hábitos, Progreso. Ajustes sale de la barra: engranaje en la cabecera de cada sección. Alto `layout.tabBarHeight` 72 dp × escala de fuente + zona segura. Activo: ícono relleno en el color de la sección sobre pastilla 56 × 32 con su tinte; inactivo: `textMuted` |

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
| `color.bg` | `#E5DCC5` | `#2D2D2A` | Fondo de pantalla (arena / grafito) |
| `color.surface` | `#F2ECDD` | `#3A3A36` | Tarjetas |
| `color.surfaceRaised` | `#FAF7EF` | `#4C4C47` | Hojas, modales, toast |
| `color.text` | `#2D2D2A` | `#E5DCC5` | Texto principal (10,11:1) |
| `color.textMuted` | `#4C4C47` | `#CBC3AE` | Texto secundario (≥ 4,9:1 en toda superficie) |
| `color.border` | `#CFC4A8` | `#5A5A53` | Bordes y divisores |
| `color.primary` | `#C14953` | `#E07A82` | Botón primario (acento ladrillo) |
| `color.onPrimary` | `#FFFFFF` | `#2D2D2A` | Texto del botón primario (4,83 / 4,79:1) |
| `color.secondary` | `#9AA3B6` | `#9AA3B6` | Botón secundario (gris lavanda) |
| `color.onSecondary` | `#2D2D2A` | `#2D2D2A` | Texto sobre `secondary` (5,45:1; nunca blanco) |
| `color.brand` | `#4F5A72` | `#AEB6C8` | Acento de UI tranquilo: selección, anillos, gráficos |
| `color.brandSoft` | `#E1E4EC` | `#3F434D` | Fondos destacados y seleccionados |
| `color.energy` | `#C14953` | `#E07A82` | Acento gráfico de energía (anillo de descanso, barra actual; ≥ 3:1) |
| `color.energyText` | `#9E3540` | `#F4AEB2` | Ladrillo como texto (≥ 4,5:1) |
| `color.energyFill` | `#C14953` | `#E07A82` | Relleno del CTA de energía (`Button variant="energy"`, botón «Registrar») |
| `color.onEnergy` | `#FFFFFF` | `#2D2D2A` | Texto/ícono sobre `energyFill` |
| `color.celebrate` | `#C14953` | `#EC959B` | Celebraciones (glifo o borde, ≥ 3:1) |
| `color.celebrateSoft` | `#F3DADA` | `#4A2E2F` | Superficie de celebración |
| `color.tabBar` | `#F2ECDD` | `#3A3A36` | Fondo de la tab bar |
| `color.success` | `#4F5A72` | `#BCC3D3` | Confirmaciones |
| `color.warning` | `#6B5D3E` | `#D9CBA6` | Avisos |
| `color.error` | `#9E3540` | `#F6B4B8` | Errores (siempre con ícono y texto) |
| `color.info` | `#4F5A72` | `#BCC3D3` | Información |
| `space-1…12` | 4, 8, 12, 16, 20, 24, 32, 40, 48 dp | | Espaciado (escala de 4) |
| `radius-sm/md/lg/xl/pill` | 10, 16, 24, 32, 999 | | Esquinas |
| `shadow-soft` | y 4, blur 16, grafito al 8% | sin sombra, borde `color.border` | Tarjetas |
| `shadow-raised` | y 8, blur 24, grafito al 12% | sin sombra, `surfaceRaised` | Toast, hojas |

**Color por sección (`section.<clave>`, ver `BRAND.md` 4.5):** claves `hoy`, `gym`, `habitos`, `progreso`, `agua`, `sueno`, `movimiento`; cada una con `fill` (tinte sutil de cabecera/bloque), `onFill` (grafito en claro, arena en oscuro), `soft` (tinte de superficie y pastilla del tab activo en claro) y `text` (acento de sección como texto/ícono sobre fondo o superficie).

| Clave | `fill` claro / oscuro | `soft` claro / oscuro | `text` claro / oscuro |
|---|---|---|---|
| `hoy` | `#D9CBA6` / `#55503F` | `#EDE5D0` / `#403C33` | `#6B5D3E` / `#D9CBA6` |
| `gym`, `movimiento` | `#EBC3C3` / `#5C3437` | `#F3DADA` / `#4A2E2F` | `#9E3540` / `#EC959B` |
| `habitos`, `progreso`, `agua`, `sueno` | `#CDD2DE` / `#474D5C` | `#E1E4EC` / `#3B3F4A` | `#4F5A72` / `#AEB6C8` |

Componentes: `SectionHeader` (tinte `fill` bajo la barra de estado, ícono de sección en `text`, título + subtítulo `onFill`, engranaje de Ajustes), `Card variant="hero" | "tint"` con `section`, `Button variant="energy"`, `Screen` con `header` (a sangre) y `footer` (barra de acción fija, respeta la zona segura), `TabBar`, `BottomSheet`, `StepHeader` (atrás en un hueco fijo de 48 × 48), `BentoGrid` + `BentoTile` (hubs bento: 2 columnas, spans 1x1 / 2x1 / 1x2 / 2x2, alto de fila `bento.rowHeight` 112 dp × escala de fuente, `bento.gap` 12 dp, 1 columna si escala ≥ 1,3 y ancho < 380 dp; cada baldosa resume un área —número, anillo, mini gráfico, estado— y abre su página de detalle). Otros tokens nuevos: `timeline.timeColumn` (56 dp × escala de fuente, mínimo), `font.scale.metric-sm` (Nunito 900 28/34 tabular), `layout.tabPillWidth/Height` (56/32), `layout.tabActionSize` (56).

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

### Hoy (hub bento)
1. `SectionHeader` sol: saludo con la hora + frase de identidad + anillo de progreso del día ("x de y hechos").
2. `BentoGrid`: "Ahora" 2x1 (lo que toca o lo próximo, con su acción ✓ / abrir), Agua 1x1 (x/8 + "+1" rápido), Pasos 1x1 (barra), Gym hoy 1x1 ("Hoy toca" / meta de hoy), Check-ins 1x1 (mañana/noche), "¿Te moviste hoy?" (solo sin responder; abre una hoja).
3. Si hay: `SuggestionCard`, `InsightCard` o tarjeta de "Tu ritmo" (máx. una), a todo el ancho bajo la grilla (lleva sus propias acciones).
4. "Ahora" abre `/hoy/agenda`: la línea de tiempo completa (`TimelineItem`, deslizar y mantener pulsado).
5. Al completar todo: `MascotBubble` `descansa` + "Listo por hoy. Cierra la app y descansa".
6. Registrar: "Marcar un hábito" y "Nota de comida" actúan en la misma hoja (lista de hábitos / nota), sin navegar.

### Hábitos (hub bento)
1. `SectionHeader` verde + `BentoGrid` con baldosas teñidas por categoría: Agua 2x1 (gotas + "+1"), Pasos 1x1 (barra), Sueño 1x1 (duración y calidad de anoche), un 1x1 por hábito de check (Pausa activa, Caminar después de comer), Comida 1x1 (nota sí/no), Movimiento 1x1 ("¿Te moviste hoy?" en hoja).
2. Detalle (scroll permitido): `/habitos/agua` (gotas, 10 días, curva por hora, metas), `/habitos/pasos` (conteo, Health Connect / entrada manual, línea base, meta), `/habitos/sueno` (promedio, noches, deuda, jetlag social, check-ins, ciclos), `/habitos/[id]` (marcar, cómo hacerlo, 10 días), `/habitos/comida` (nota y notas recientes).

### Gym (hub bento)
1. `SectionHeader` tinte ladrillo (nombre del programa) + `BentoGrid`: "Hoy toca" 2x2 (rutina, meta de hoy del primer ejercicio, botón `energy` Empezar/Continuar), Semana 1x1 (sesiones hechas/planeadas), Volumen 1x1 (mini barras por músculo), Programa 2x1 (nombre + nº de rutinas), Crear rutina 1x1 (generador), Historial 1x1 (fecha de la última sesión).
2. Detalle: `/gym/programa` (rutinas, empezar cualquiera; pie fijo con Editar programa e Importar), `/gym/volumen` (series por músculo esta semana + semanas), `/gym/historial` (sesiones recientes con series y volumen).

### Progreso (hub bento)
1. `SectionHeader` lavanda + `BentoGrid`: Constancia 2x1 (hero, sesiones de la semana + mini barras semanales), Fuerza 1x1 (e1RM del primer ejercicio y su cambio), Medidas 1x1 (último peso), Fotos 1x1 (miniatura, abre `/fotos`), Tu ritmo 1x1 (deuda de sueño o días conociéndote), Hallazgos 2x1 (el último), Compartir 1x1, Pregúntale a Pomi 1x1 (solo con IA conectada), Revisión mensual 1x1 (abre `/comparacion`; acción rápida para empezar la revisión).
2. Detalle: `/progreso/constancia` (sesiones y días con hábitos por semana + volumen por músculo), `/progreso/fuerza` (selector de ejercicio + gráfico), `/progreso/medidas` (gráficos + formulario; pie fijo para la revisión mensual), `/progreso/ritmo` ("Tu ritmo"), `/progreso/hallazgos` (lista).

### Sesión de gym
1. Encabezado: "Día 1: Glúteos e isquios" + progreso de series + fila de navegación (anterior / puntos de progreso / siguiente, 48 dp; los puntos anuncian "Paso x de y: nombre").
2. Paginador horizontal (`FlatList` `pagingEnabled`, deslizar o botones; sin animación con reduce-motion), una página por paso: calentamiento plegable (checks) primero.
3. Una página por ejercicio: `ExerciseCard` con la meta de hoy destacada (bloque teñido ladrillo) y sus `SetRow`; luego cardio y extras; al final la página Terminar.
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
