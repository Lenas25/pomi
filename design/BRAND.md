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

- **Wordmark:** "Pomi" en sans redondeada muy gruesa, color `navy-900`. La **"o" es una carita** (dos ojos y una sonrisa): es el rasgo distintivo del logo.
- **Símbolo (isotipo):** la cabeza de Pomi con la vincha coral, simplificada (ver 3.3).

### 3.2 Versiones necesarias

| Versión | Uso |
|---|---|
| Horizontal: símbolo + wordmark | Splash, README, web |
| Solo wordmark | Encabezados, materiales donde la mascota ya aparece |
| Solo símbolo | Ícono de la app, avatar de redes, favicon |
| Monocromo navy | Fondos claros sin color |
| Monocromo crema (invertido) | Fondos navy u oscuros |
| Silueta blanca | Ícono de notificación de Android |

### 3.3 Reglas

- **Área de respeto:** alrededor del logo, como mínimo la altura de la "o" carita.
- **Tamaño mínimo del wordmark:** 24 px de alto en pantalla. Por debajo, usar solo el símbolo.
- **El símbolo para tamaños pequeños** (menos de 48 px) es una versión simplificada: sin zapatillas, sin cuerpo, sin mejillas, contorno más grueso. La ilustración completa no se lee en un ícono pequeño.
- **No:** deformar, rotar, cambiar los colores, poner sombras o degradados, ni poner el wordmark sobre el azul de Pomi (contraste insuficiente).

## 4. Color

### 4.1 Paleta base

| Token | Hex | Nombre | Rol |
|---|---|---|---|
| `blue-500` | `#29B5E8` | Azul Pomi | Mascota, ilustraciones, acentos, gráficos |
| `blue-200` | `#9CDDF5` | Azul pancita | Fondos suaves, estados seleccionados |
| `blue-50` | `#E6F6FD` | Azul niebla | Fondos de tarjetas destacadas |
| `navy-900` | `#1A2846` | Navy | Texto principal, wordmark, botón primario, contornos |
| `navy-700` | `#33436A` | Navy medio | Texto secundario sobre claro |
| `coral-500` | `#F15A3B` | Coral vincha | Acento de energía: progreso, gym, destacados |
| `coral-700` | `#C93A22` | Coral profundo | Texto o íconos coral sobre claro (contraste) |
| `sun-400` | `#F6B634` | Amarillo sol | Celebración, logros del día, hallazgos |
| `cream-50` | `#F8F1E5` | Crema | Fondo principal en modo claro |
| `white` | `#FFFFFF` | Blanco | Superficies (tarjetas) en modo claro |
| `blush-300` | `#F59AA0` | Rubor | Solo ilustración (mejillas). No usar en UI |

Valores aproximados tomados del arte. Antes de cerrar la marca, el diseñador debe confirmarlos en el archivo vectorial.

### 4.2 Contraste (WCAG)

| Combinación | Contraste aprox. | Resultado |
|---|---|---|
| `navy-900` sobre `cream-50` | ~13:1 | ✅ Cualquier texto |
| `navy-900` sobre `blue-500` | ~6:1 | ✅ Texto normal |
| `navy-900` sobre `sun-400` | ~8:1 | ✅ Texto normal |
| Blanco sobre `navy-900` | ~14:1 | ✅ Botón primario |
| Blanco sobre `coral-700` | ~5:1 | ✅ Texto normal |
| Blanco sobre `coral-500` | ~3.4:1 | ⚠️ Solo texto grande o negrita de 19 px o más |
| Blanco sobre `blue-500` | ~2.4:1 | ❌ Nunca para texto |
| `blue-500` o `sun-400` como texto sobre crema | menos de 3:1 | ❌ Nunca para texto |

**Regla práctica:** el texto siempre es `navy-900` (claro) o `cream-50` (oscuro). El azul, el coral y el amarillo son **rellenos y acentos**, no colores de texto.

### 4.3 Semánticos

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `success` | `#1F9D6B` | `#4CD39C` | Confirmaciones |
| `warning` | `#F6B634` (con texto navy) | `#F6B634` | Avisos suaves |
| `error` | `#C2362B` | `#FF7A6B` | Errores. **Siempre con ícono y texto**, para no confundirlo con el coral de marca |
| `info` | `#29B5E8` (con texto navy) | `#5CCBF2` | Hallazgos, información |

### 4.4 Modo oscuro

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo | `cream-50` | `#0E1729` |
| Superficie (tarjeta) | `white` | `#17233D` |
| Superficie elevada | `white` + sombra | `#1F2D4D` |
| Texto principal | `navy-900` | `cream-50` |
| Texto secundario | `navy-700` | `#B8C2D9` |
| Bordes | `#E8DCC8` | `#2A3A5E` |
| Botón primario | `navy-900` / texto blanco | `blue-500` / texto `navy-900` |

La mascota no cambia de color en modo oscuro. Sus contornos navy se mantienen, sobre un círculo `blue-50` al 12% si hace falta separarla del fondo.

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
