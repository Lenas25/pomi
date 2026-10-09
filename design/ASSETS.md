# Pomi: lista de assets

Arte maestro aprobado por la dueña (2026-10) en `assets/source/`: `pomi-app-icon-master.png` (ícono, 1254 × 1254, fondo arena) y `pomi-camina-master.png` (mascota, fondo transparente). `scripts/generate-brand-assets.py` (`uv run --with pillow python3 scripts/generate-brand-assets.py`) genera desde ellos los íconos y la pose `camina`. Las poses y piezas que aún no tienen arte final usan **placeholders** (círculo gris lavanda con pancita arena, vincha ladrillo y la carita "o"; `npm run assets:generate`) con los mismos nombres de archivo, para reemplazarlos sin tocar código. Prompts para generar el resto: `docs/design/PROMPTS-assets.md`.

## Ubicación

```
assets/
  source/       maestros de la dueña (no se empaquetan)
  brand/        logo y símbolo
  mascot/       poses de Pomi
  icons/        ícono de app, notificación, splash
  illustrations/ íconos ilustrados de onboarding
```

## Logo

| Archivo | Formato | Estado | Notas |
|---|---|---|---|
| `brand/pomi-wordmark.svg` | SVG | Placeholder | Grafito, "o" carita |
| `brand/pomi-wordmark-inverse.svg` | SVG | Placeholder | Arena, para fondos oscuros |
| `brand/pomi-lockup-horizontal.svg` | SVG | Placeholder | Símbolo + wordmark |
| `brand/pomi-symbol.svg` | SVG | Placeholder | Cabeza simplificada con vincha |

## Mascota (BRAND.md 6.2)

`mascot/pomi-{hola,enfocado,agua,celebra,descansa,curioso,tranqui,mide,camina,vacio}.png` en `@1x` (180 px de alto), `@2x` (360 px) y `@3x` (540 px), lienzo cuadrado transparente. Opcional: `mascot/pomi-celebra.json` (Lottie) para la animación de rutina completada.

| Pose | Estado |
|---|---|
| `camina` | **Final** (desde `pomi-camina-master.png`; sin SVG) |
| Las otras 9 | Placeholder PNG + SVG |

## Íconos de app y sistema

| Archivo | Medida | Estado | Notas |
|---|---|---|---|
| `icons/app-icon.png` | 1024 × 1024 | **Final** | Recorte cuadrado a sangre del maestro (fondo arena; el launcher aplica su máscara) |
| `icons/adaptive-foreground.png` | 1024 × 1024 (108 dp) | **Final** | Mascota transparente, todo dentro del círculo central del 66 % (zona segura) |
| Fondo adaptativo | — | **Final** | Color plano `#E5DCC5` en `app.json` (`android.adaptiveIcon.backgroundColor`), sin imagen |
| `icons/adaptive-monochrome.png` | 1024 × 1024 | **Final** | Silueta negra de la mascota (alfa del maestro) en la zona segura, para íconos temáticos de Android 13+ |
| `icons/notification-icon.png` | 96 × 96 (24 dp a 4×) | **Final** | **Solo blanco sobre transparente**: silueta de la cabeza con la vincha, ojos y sonrisa recortados |
| `icons/splash-icon.png` | 1024 × 1024 | **Final** | Mascota al ~60 % del lienzo, transparente; fondo del splash `#E5DCC5` (claro) o `#2D2D2A` (oscuro) |

## Tiendas

| Archivo | Medida | Notas |
|---|---|---|
| `store/play-feature-graphic.png` | 1024 × 500 | Mascota + wordmark + tagline |
| `store/screenshots/` | 1080 × 1920 aprox. | Hoy, sesión de gym con meta de hoy, check-in, Progreso, hallazgo |

## Ilustraciones de onboarding

`illustrations/{mancuerna,botella,corazon,cronometro}.svg` (placeholders): los 4 íconos ilustrados, con el mismo contorno grafito que la mascota.

## Fuentes

`@expo-google-fonts/fredoka` (600, 700), `@expo-google-fonts/nunito-sans` (400, 600, 700) y `@expo-google-fonts/nunito` (900, solo cronómetro y métricas). Cargar antes de ocultar el splash.
