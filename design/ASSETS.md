# Pomi: lista de assets

Mientras no existan los vectores finales, Claude Code debe usar **placeholders** (círculo `blue-500` con la carita "o" del wordmark) con los mismos nombres de archivo, para reemplazarlos sin tocar código.

## Ubicación

```
assets/
  brand/        logo y símbolo
  mascot/       poses de Pomi
  icons/        ícono de app, notificación, splash
  illustrations/ íconos ilustrados de onboarding
```

## Logo

| Archivo | Formato | Notas |
|---|---|---|
| `brand/pomi-wordmark.svg` | SVG | Navy, "o" carita |
| `brand/pomi-wordmark-inverse.svg` | SVG | Crema, para fondos oscuros |
| `brand/pomi-lockup-horizontal.svg` | SVG | Símbolo + wordmark |
| `brand/pomi-symbol.svg` | SVG | Cabeza simplificada con vincha |

## Mascota (BRAND.md 6.2)

`mascot/pomi-{hola,enfocado,agua,celebra,descansa,curioso,tranqui,mide,camina,vacio}.svg`
y PNG en `@1x` (180 px), `@2x` y `@3x`. Opcional: `mascot/pomi-celebra.json` (Lottie) para la animación de rutina completada.

## Íconos de app y sistema

| Archivo | Medida | Notas |
|---|---|---|
| `icons/app-icon.png` | 1024 × 1024 | Maestro. Símbolo de Pomi sobre fondo `blue-500` o `cream-50` (probar ambos en la pantalla del celular) |
| `icons/adaptive-foreground.png` | 1024 × 1024 (108 dp) | Android adaptativo. El símbolo dentro del círculo central de 66 dp (zona segura); el resto puede recortarse |
| `icons/adaptive-background.png` | 1024 × 1024 | Color plano |
| `icons/adaptive-monochrome.png` | 1024 × 1024 | Silueta para íconos temáticos de Android 13+ |
| `icons/notification-icon.png` | 96 × 96 (24 dp a 4×) | **Solo blanco sobre transparente**, silueta del símbolo. Android ignora los colores en la barra de estado |
| `icons/splash-icon.png` | 1024 × 1024 | Símbolo centrado; fondo del splash `cream-50` (claro) o `#0E1729` (oscuro) |

## Tiendas

| Archivo | Medida | Notas |
|---|---|---|
| `store/play-feature-graphic.png` | 1024 × 500 | Mascota + wordmark + tagline |
| `store/screenshots/` | 1080 × 1920 aprox. | Hoy, sesión de gym con meta de hoy, check-in, Progreso, hallazgo |

## Ilustraciones de onboarding

`illustrations/{mancuerna,botella,corazon,cronometro}.svg`: los 4 íconos ilustrados del arte, redibujados en vector con el mismo contorno navy que la mascota.

## Fuentes

`@expo-google-fonts/fredoka` (600, 700), `@expo-google-fonts/nunito-sans` (400, 600, 700) y `@expo-google-fonts/nunito` (900, solo cronómetro y métricas). Cargar antes de ocultar el splash.
