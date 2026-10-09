# Pomi: guía de marca

> **Pomi, tu compañero de rutinas.** App de gym y hábitos que no te castiga, te dice qué hacer hoy y te muestra lo que va descubriendo de ti.
> Este documento define cómo se ve, cómo habla y cómo se comporta Pomi. Es la referencia para diseño y desarrollo.

## 1. Esencia de marca

| | |
|---|---|
| **Promesa** | Te acompaño a ser constante, sin culpa. |
| **Personalidad** | Cálido, animado, paciente, honesto. Nunca sarcástico, nunca exigente. |
| **Rol de Pomi** | Un compañero, no un entrenador que grita ni un juego. Celebra contigo, te recuerda lo importante y te deja descansar. |
| **Lo que Pomi nunca hace** | Culpar, avergonzar, amenazar con perder rachas, comparar con otras personas, poner caras tristes o enojadas porque faltaste. |

### Por qué importa la última fila

Una mascota puede convertirse en presión (la mascota "decepcionada" que te persigue con notificaciones). Eso contradice la filosofía de la app: **sin castigo**. Pomi solo reacciona a lo que sí hiciste, y cuando faltas, responde con comprensión: "Pasa. Mañana seguimos".

## 2. Nombre

- **Escritura:** "Pomi", con P mayúscula. Nunca "POMI" en textos corridos ni "pomi" salvo en identificadores técnicos.
- **Tagline:** "Tu compañero de rutinas". En inglés: "Your routine buddy".
- **Nombre en tiendas:** "Pomi: gym y hábitos" / "Pomi: Gym & Habits", para aclarar la categoría.
- **Identificador de la app:** por definir antes de publicar (ejemplo: `pe.nakea.pomi`).

## 3. Logotipo

### 3.1 Partes

- **Wordmark:** "Pomi" en sans redondeada muy gruesa, color `graphite-900`. La **"o" es una carita** (dos ojos y una sonrisa): es el rasgo distintivo del logo.
- **Símbolo (isotipo):** la cabeza de Pomi con la vincha ladrillo, simplificada (ver 3.3).

### 3.2 Versiones necesarias

| Versión | Uso |
|---|---|
| Horizontal: símbolo + wordmark | Splash, README, web |
| Solo wordmark | Encabezados, materiales donde la mascota ya aparece |
| Solo símbolo | Ícono de la app, avatar de redes, favicon |
| Monocromo grafito | Fondos claros sin color |
| Monocromo arena (invertido) | Fondos grafito u oscuros |
| Silueta blanca | Ícono de notificación de Android |

### 3.3 Reglas

- **Área de respeto:** alrededor del logo, como mínimo la altura de la "o" carita.
- **Tamaño mínimo del wordmark:** 24 px de alto en pantalla. Por debajo, usar solo el símbolo.
- **El símbolo para tamaños pequeños** (menos de 48 px) es una versión simplificada: sin zapatillas, sin cuerpo, sin mejillas, contorno más grueso. La ilustración completa no se lee en un ícono pequeño.
- **No:** deformar, rotar, cambiar los colores, poner sombras o degradados, ni poner el wordmark sobre el azul de Pomi (contraste insuficiente).

## 4. Color

> **Paleta minimalista (decisión de la dueña, 2026-10).** Reemplaza a la paleta vibrante «Pomi Splash». Sale del nuevo arte de marca: mascota gris lavanda con pancita arena y vincha ladrillo. Un solo acento fuerte (ladrillo); el resto es calma.

### 4.1 Paleta base

| Token | Hex | Nombre | Rol |
|---|---|---|---|
| `graphite-900` | `#2D2D2A` | Grafito | Texto principal en claro, fondo en oscuro, texto sobre lavanda |
| `charcoal-700` | `#4C4C47` | Carbón | Texto secundario en claro, superficie elevada en oscuro |
| `charcoal-800` | `#3A3A36` | Carbón profundo | Superficie (tarjeta) y tab bar en oscuro |
| `lavender-500` | `#848FA5` | Gris lavanda | Mascota, ilustración. **Nunca con texto blanco** (3,25:1) |
| `lavender-300` | `#9AA3B6` | Lavanda clara | Botón secundario (texto grafito, 5,45:1) |
| `lavender-700` | `#4F5A72` | Lavanda profunda | Acento de UI en claro: gráficos, selección, éxito, info |
| `brick-500` | `#C14953` | Ladrillo | **Acento único**: botón primario y de energía (texto blanco, 4,83:1) |
| `brick-700` | `#9E3540` | Ladrillo profundo | Texto ladrillo y error en claro |
| `brick-300` | `#E07A82` | Ladrillo claro | Botón primario/energía en oscuro (texto grafito, 4,79:1) |
| `sand-500` | `#E5DCC5` | Arena | Fondo en claro, texto principal en oscuro, fondo del ícono |
| `sand-100` | `#F2ECDD` | Arena clara | Superficie (tarjeta) y tab bar en claro |
| `sand-50` | `#FAF7EF` | Arena niebla | Superficie elevada en claro |
| `sand-*`, `lavender-*`, `brick-*` (100–900) | ver `tokens.json` | Tintes | Cabeceras y superficies tintadas por sección |

### 4.2 Contraste (WCAG 2.x, calculado y verificado en `src/ui/theme.test.ts`)

| Combinación | Contraste | Resultado |
|---|---|---|
| Grafito sobre arena (`bg` claro) | 10,11:1 | ✅ Cualquier texto |
| Carbón sobre arena clara (`textMuted` / `surface`) | 7,33:1 | ✅ Texto normal |
| Blanco sobre ladrillo `#C14953` | 4,83:1 | ✅ Botón primario y de energía (claro) |
| Grafito sobre ladrillo claro `#E07A82` | 4,79:1 | ✅ Botón primario y de energía (oscuro) |
| Grafito sobre lavanda clara `#9AA3B6` | 5,45:1 | ✅ Botón secundario |
| Arena sobre grafito (`text` / `bg` oscuro) | 10,11:1 | ✅ Cualquier texto |
| `#CBC3AE` sobre carbón `#4C4C47` (`textMuted` en la superficie más clara del oscuro) | 4,92:1 | ✅ Texto normal |
| Ladrillo `#C14953` sobre arena | 3,54:1 | ⚠️ Solo UI y gráficos (≥ 3:1), nunca texto |
| Blanco sobre gris lavanda `#848FA5` | 3,25:1 | ❌ Nunca |

**Regla práctica:** el texto es grafito (claro) o arena (oscuro). El ladrillo es el único relleno fuerte; el lavanda es el acento tranquilo de UI. Como texto, cada color usa su tono profundo en claro y su tono claro en oscuro (todos ≥ 4,5:1).

### 4.5 Color por sección: tintes sutiles + ícono

Las cabeceras ya no son bloques de color fuerte: son un **tinte sutil** de la paleta bajo la barra de estado, con el ícono de sección en su acento y el título en grafito (claro) o arena (oscuro). La identidad la dan el **ícono** y el tinte, no la saturación.

| Sección / categoría | Familia | `fill` claro / oscuro | `soft` claro / oscuro | `text` claro / oscuro | Ícono |
|---|---|---|---|---|---|
| Hoy | Arena | `#D9CBA6` / `#55503F` | `#EDE5D0` / `#403C33` | `#6B5D3E` / `#D9CBA6` | `House` |
| Gym, Movimiento | Ladrillo | `#EBC3C3` / `#5C3437` | `#F3DADA` / `#4A2E2F` | `#9E3540` / `#EC959B` | `Barbell` / `Footprints` |
| Hábitos, Progreso, Agua, Sueño | Lavanda | `#CDD2DE` / `#474D5C` | `#E1E4EC` / `#3B3F4A` | `#4F5A72` / `#AEB6C8` | `CheckCircle` / `ChartLineUp` / `Drop` / `MoonStars` |

- `onFill` (título y subtítulo de cabecera): grafito en claro, arena en oscuro; ≥ 5,9:1 sobre todo `fill` y `soft`.
- El ícono de sección (`text`) sobre su `fill` queda ≥ 3:1; como texto sobre `bg`, `surface` y `soft`, ≥ 4,5:1.
- **Gráficos:** lavanda (`brand`) para series y barras, ladrillo (`energy`) para la barra actual o el anillo de descanso, carbón/borde para ejes y rejilla.

### 4.3 Semánticos

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `success` | `#4F5A72` | `#AEB6C8` | Confirmaciones, casillas hechas |
| `warning` | `#6B5D3E` | `#D9CBA6` | Avisos suaves |
| `error` | `#9E3540` | `#F2A1A6` | Errores. **Siempre con ícono y texto**, para distinguirlo del acento ladrillo |
| `info` | `#4F5A72` | `#AEB6C8` | Hallazgos, información |
| `celebrate` | `#C14953` | `#EC959B` | Celebraciones (glifo o borde, ≥ 3:1) |

### 4.4 Modo oscuro

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo | `#E5DCC5` | `#2D2D2A` |
| Superficie (tarjeta) | `#F2ECDD` | `#3A3A36` |
| Superficie elevada | `#FAF7EF` + sombra | `#4C4C47` |
| Texto principal | `#2D2D2A` | `#E5DCC5` |
| Texto secundario | `#4C4C47` | `#CBC3AE` |
| Bordes | `#CFC4A8` | `#5A5A53` |
| Botón primario / energía | `#C14953` / texto blanco | `#E07A82` / texto grafito |
| Botón secundario | `#9AA3B6` / texto grafito | `#9AA3B6` / texto grafito |
| Tab bar | `#F2ECDD` | `#3A3A36` |

La mascota no cambia de color en modo oscuro.

## 5. Tipografía

El wordmark usa una sans geométrica redondeada y muy gruesa. La UI debe acompañar esa redondez sin perder legibilidad.

| Uso | Fuente | Por qué |
|---|---|---|
| Títulos (`display`, `title-*`) | **Fredoka** (600–700) | Redondeada y amistosa como el wordmark y la mascota. Gratis (OFL), en `@expo-google-fonts/fredoka` |
| Texto, botones, formularios | **Nunito Sans** (400–700) | Más sobria para leer. Gratis (OFL), en `@expo-google-fonts/nunito-sans` |
| Cronómetro y métricas (`timer`, `metric`) | **Nunito** (900), números tabulares | Fredoka tiene dígitos proporcionales; Nunito mantiene el ancho fijo para que los números no "bailen". Gratis (OFL), en `@expo-google-fonts/nunito` |

Si el wordmark se dibuja con otra fuente, el diseñador debe indicarla. El wordmark final es un **vector dibujado**, no texto en vivo.

### Escala

| Token | Tamaño / interlineado | Peso | Fuente | Uso |
|---|---|---|---|---|
| `display` | 34 / 40 | 700 | Fredoka | Pantallas de celebración, "Tu punto de partida" |
| `title-lg` | 28 / 34 | 700 | Fredoka | Título de pantalla |
| `title-md` | 22 / 28 | 600 | Fredoka | Títulos de sección |
| `title-sm` | 18 / 24 | 600 | Fredoka | Títulos de tarjeta, nombre de ejercicio |
| `body` | 16 / 24 | 400 | Nunito Sans | Texto general |
| `body-strong` | 16 / 24 | 700 | Nunito Sans | Énfasis, botones |
| `caption` | 13 / 18 | 600 | Nunito Sans | Etiquetas, metadatos |
| `timer` | 56 / 60 | 900 | Nunito, números tabulares | Cronómetro |
| `metric` | 40 / 44 | 900 | Nunito, números tabulares | Kg, vasos, pasos grandes |

Respetar el tamaño de texto del sistema (Dynamic Type / escala de fuente de Android) hasta 1.3×, sin romper el diseño.

## 6. Mascota: Pomi

### 6.1 Anatomía

- Cuerpo redondo tipo gota, **azul `blue-500`**, con pancita `blue-200`.
- Mechón en la cabeza, como una gota o un brote.
- **Vincha coral**: su rasgo de identidad, siempre presente.
- Mejillas `blush-300`, ojos grandes con brillo, contorno `navy-900` de grosor uniforme.
- Zapatillas coral con suela blanca.

**Definir antes de producir:** qué es Pomi. La forma y el color sugieren una **gota de agua con energía**, que conecta con la hidratación y con el "brotar". Fijarlo ayuda a que todas las poses sean consistentes y da material para la historia de la marca.

### 6.2 Expresiones y cuándo aparece cada una

| Archivo | Expresión / pose | Momento en la app | Frase ejemplo |
|---|---|---|---|
| `pomi-hola` | Saluda, sonriente | Onboarding, primera apertura del día | "¡Hola! ¿Empezamos?" |
| `pomi-enfocado` | Levanta mancuerna, concentrado (no enojado) | Inicio de sesión de gym, "meta de hoy" | "Hoy toca: 45 kg × 8" |
| `pomi-agua` | Toma agua, relajado | Aviso y contador de agua | "¡Hidrátate!" |
| `pomi-celebra` | Salta con los brazos arriba | Rutina completada, meta cumplida | "¡Rutina completada!" |
| `pomi-descansa` | Sentado o recostado, ojos cerrados | Fin del check-in de noche, hora de dormir | "Listo por hoy. A descansar" |
| `pomi-curioso` | Mano en la barbilla, una ceja arriba | Hallazgos y sugerencias | "Descubrí algo de ti" |
| `pomi-tranqui` | Sonrisa suave, mano en el pecho | Cuando faltaste o retomas después de días | "Pasa. Mañana seguimos" |
| `pomi-mide` | Con cinta métrica o cámara | Revisión mensual | "¿Vemos cuánto cambiaste?" |
| `pomi-camina` | Caminando, con audífonos | Pasos y caminatas | "Una vueltita después de comer" |
| `pomi-vacio` | Sosteniendo una hoja en blanco | Estados vacíos | "Aquí aparecerá tu progreso" |

**Reglas:**

- **Nunca triste, enojado, llorando ni decepcionado.** La expresión "¡Tú puedes!" del arte actual frunce el ceño y aprieta los dientes: se lee como enojo. Redibujarla como **concentrado y con una pequeña sonrisa**.
- **Una sola mascota por pantalla,** y no en todas: aparece en momentos clave (celebración, onboarding, estados vacíos, check-ins). En la sesión de gym aparece pequeña o no aparece, para no estorbar.
- **La mascota acompaña, no premia.** No hay "Pomi feliz si cumples / Pomi triste si no". No hay ropa ni accesorios que se desbloquean con puntos.

### 6.3 Producción

- El arte actual parece generado con IA. Antes de lanzar, **redibujar la mascota en vectores** (SVG), con un diseñador o con una ilustración propia, por tres razones:
  1. **Consistencia:** en el arte actual el mechón, la pancita y las proporciones cambian entre poses.
  2. **Propiedad:** en varios países, una imagen generada solo con IA tiene una protección de derechos de autor limitada o nula. Una versión redibujada por una persona es más fácil de proteger como marca.
  3. **Animación:** con vectores por capas se puede animar (Lottie o Rive).
- **Formatos:** SVG de cada pose; PNG @1x, @2x y @3x para la app; y opcionalmente Lottie para las animaciones de celebración.
- **Contorno:** grosor uniforme, equivalente a 3 px cuando la mascota mide 120 px de alto.

## 7. Iconografía

- El arte trae 4 íconos ilustrados (mancuerna, botella, corazón con pulso, cronómetro). Sirven para **ilustraciones y onboarding**, no para la UI diaria.
- **Para la UI:** usar una sola librería de íconos de línea con terminaciones redondeadas. Recomendado: **Phosphor Icons** (peso "bold" o "duotone"), por su estilo redondeado y su paquete para React Native.
- Tamaños: 20 px en listas, 24 px en barra de pestañas y botones, 32 px en tarjetas destacadas.
- El elemento de arriba a la izquierda del arte (mano en "V" con un óvalo) no forma parte del sistema: **eliminarlo**.

## 8. Forma y estilo de UI

- **Redondez:** todo es redondeado, como la mascota. Radios: 10 px (pequeños), 16 px (tarjetas), 24 px (hojas y modales), píldora en botones.
- **Profundidad:** sombras suaves y bajas, como en la tarjeta "Rutina completada" del arte. Nada de sombras duras ni efectos de vidrio.
- **Fondo crema** en modo claro, no blanco puro: da calidez y diferencia a Pomi de las apps de gym frías.
- **Densidad:** aire generoso. Una idea principal por tarjeta.

## 9. Voz y tono

| Sí | No |
|---|---|
| "Llevas 3 semanas entrenando de forma constante" | "¡Racha de 21 días! No la pierdas 🔥" |
| "Hoy toca: 45 kg × 8" | "¡DESTRUYE TU LÍMITE!" |
| "Pasa. Mañana seguimos" | "Ayer no entrenaste 😢" |
| "Notamos que los días que entrenas duermes 35 min más" | "Entrenar te hace dormir mejor" |
| "Listo por hoy. Cierra la app y descansa" | "¡Vuelve pronto o perderás tu progreso!" |

**Reglas:**

- Tutea siempre. Frases cortas. Un solo signo de exclamación como máximo, y solo en celebraciones.
- Emojis con moderación: máximo uno por notificación, nunca en botones.
- **Límites de texto:** burbuja de la mascota hasta 40 caracteres; título de notificación hasta 30; cuerpo de notificación hasta 80; título de toast hasta 24. El español ocupa un 20–30% más que el inglés: diseñar con el texto en español.

## 10. Checklist antes de lanzar la marca

- [ ] Confirmar disponibilidad del nombre "Pomi" en Play Store, App Store, GitHub, dominio y redes. Existe una app de pomodoro llamada Pomi (categoría productividad) y la marca de tomates italiana Pomì (alimentos): revisar en INDECOPI la clase 9 (software).
- [ ] Mascota redibujada en vectores, con las 10 poses de 6.2.
- [ ] "¡Tú puedes!" rehecho con expresión concentrada, no enojada.
- [ ] Símbolo simplificado para ícono de app y versión silueta para notificaciones.
- [ ] Wordmark vectorizado, con todas las versiones de 3.2.
- [ ] Colores finales confirmados en el vector.
