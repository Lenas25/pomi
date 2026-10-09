# Pomi — image prompts for the remaining assets

Generate each asset with ChatGPT (image generation) and save it with the **exact file name** listed, so it replaces the placeholder without code changes (see `design/ASSETS.md`).

## How to keep every image consistent

1. **Attach `assets/source/pomi-camina-master.png`** (the approved mascot) to every request and start with: _"Use the attached character as the exact reference. Keep the same shape, proportions, colors, outline thickness and face style."_
2. Paste the **style block** below, then the asset-specific prompt.
3. Ask for **"PNG with transparent background"** for mascot poses, illustrations and the adaptive icon foreground.
4. Ask for **one image per request** and **square 1024×1024** unless noted.

### Style block (paste in every prompt)

> Minimalist vector illustration, modern flat design with subtle soft shading and clean bold dark outlines (#2D2D2A). Mascot "Pomi": a plump, rounded, blob-like creature in muted lavender-grey (#848FA5) with a warm sand belly (#E5DCC5), a blushed brick red (#C14953) sweatband tied at the side, soft pink cheeks, simple dark eyes, friendly expression, brick red sneakers with cream soles. Cute, calm, encouraging, never angry or sad. Palette only: #2D2D2A, #4C4C47, #848FA5, #C14953, #E5DCC5. No text, no watermark, centered, generous padding.

## Mascot poses (`assets/mascot/`)

Transparent background, 1024×1024, the mascot centered and filling about 80% of the height.

| File | Prompt (after the style block) |
|---|---|
| `pomi-hola.png` | Pomi waving hello with one hand, big open happy smile, standing, welcoming pose. |
| `pomi-enfocado.png` | Pomi lifting a small dark dumbbell with one hand, focused determined eyes with a small confident smile (NOT angry, no gritted teeth), slight sparkle lines. |
| `pomi-agua.png` | Pomi sitting relaxed and drinking from a brick red water bottle, eyes closed happily. |
| `pomi-celebra.png` | Pomi jumping with both arms up, joyful open smile, two small four-point stars around it. |
| `pomi-descansa.png` | Pomi sitting or lying comfortably with eyes closed, peaceful soft smile, a tiny crescent moon nearby, bedtime mood. |
| `pomi-curioso.png` | Pomi with one hand on its chin, one eyebrow raised, curious thoughtful smile, a small sparkle above its head. |
| `pomi-tranqui.png` | Pomi with a gentle soft smile and one hand on its chest, calm and reassuring, "it's okay" mood. |
| `pomi-mide.png` | Pomi holding a measuring tape loosely around its belly OR holding a small camera, proud happy smile. |
| `pomi-camina.png` | Pomi walking cheerfully mid-step, small earbuds, arms swinging. (Already done: `assets/source/pomi-camina-master.png`.) |
| `pomi-vacio.png` | Pomi holding a blank sheet of paper in both hands, friendly hopeful smile, for empty states. |

Export each one also at the sizes in `design/ASSETS.md` (`@1x` 180 px, `@2x` 360 px, `@3x` 540 px) — any image editor or `sips -Z 540 file.png` on macOS.

## App icon and system icons (`assets/icons/`)

| File | Prompt / instructions |
|---|---|
| `app-icon.png` | Already approved: `assets/source/pomi-app-icon-master.png` (1024×1024, sand background). |
| `adaptive-foreground.png` | Same mascot head-and-body as the app icon on a **transparent background**, mascot fully inside the **central 66% circle** (Android safe zone), nothing touching the edges, 1024×1024. Tip: use `assets/source/pomi-camina-master.png` scaled to ~60% and centered. |
| `adaptive-background.png` | Solid flat sand color #E5DCC5, 1024×1024, nothing else. |
| `adaptive-monochrome.png` | Simple **solid single-color silhouette** of Pomi's head with the sweatband (no inner details except eye/smile cut-outs), black on transparent, centered in the 66% safe zone, 1024×1024. |
| `notification-icon.png` | Very simple **pure white silhouette** of Pomi's head with the sweatband knot on a **transparent background**, no grey, no shading, thick shapes readable at 24 dp, 96×96 (generate at 1024 and downscale). |
| `splash-icon.png` | Pomi waving (same as `pomi-hola`) on a transparent background, 1024×1024, mascot about 60% of the canvas. |

## Onboarding illustrations (`assets/illustrations/`)

Transparent background, 1024×1024, same outline and palette as the mascot, no character.

| File | Prompt (after the style block, replace the mascot sentence with "single object icon") |
|---|---|
| `mancuerna.png` | A chunky friendly dumbbell, charcoal plates with a brick red handle accent. |
| `botella.png` | A rounded water bottle in brick red with a sand label and a small water drop. |
| `corazon.png` | A soft rounded heart in brick red with a thin heartbeat line across it. |
| `cronometro.png` | A round stopwatch with a sand face, charcoal outline and a brick red button. |

## Brand (`assets/brand/`)

| File | Prompt / instructions |
|---|---|
| `pomi-wordmark.png` | The word "Pomi" in a very bold rounded geometric sans-serif, graphite #2D2D2A, where the letter "o" is a brick red circle with a simple smiling face (two dots and a smile). Transparent background, wide 2048×768. |
| `pomi-wordmark-inverse.png` | Same wordmark in sand #E5DCC5 with the brick "o", transparent background, for dark backgrounds. |
| `pomi-symbol.png` | Simplified Pomi head with the sweatband only (no body, no shoes, thicker outline) for small sizes, transparent background, 1024×1024. |

## Store (optional, later)

| File | Prompt |
|---|---|
| `store/play-feature-graphic.png` | 1024×500 banner, sand background, Pomi waving on the left, the "Pomi" wordmark and the tagline "Tu compañero de rutinas" on the right, lots of empty space, minimalist. |

## After generating

1. Remove any leftover background (ask ChatGPT for transparent PNG, or send the file to the developer to cut it out).
2. Put each file in its folder with the exact name above.
3. Rebuild the APK so the new icon and splash are used.
