# Primer mensaje para Claude Code

Copia esto en Claude Code, dentro de una carpeta vacía donde ya copiaste `PLAN.md` y las carpetas `templates/` y `design/`:

---

Vamos a construir una app móvil open source de gym y hábitos saludables, llamada "Pomi". Todo funciona en el celular, sin servidor.

1. Lee completo `PLAN.md`, todas las plantillas de `templates/` y los documentos de `design/` (BRAND.md, HANDOFF.md, ASSETS.md, tokens.json y theme.ts).
2. Antes de escribir código, respóndeme con:
   - Un resumen de 5 líneas de lo que entendiste.
   - Las dudas o contradicciones que encuentres en el plan o las plantillas.
   - El orden de hitos que propones para la v1, con lo que vas a entregar en cada uno.
3. Espera mi aprobación antes de empezar el primer hito.

Reglas: TypeScript strict, la UI usa solo tokens de `design/theme.ts` (nada de colores o tamaños sueltos), mientras no existan los dibujos finales usa placeholders con los nombres de `design/ASSETS.md`, nada de contenido escrito en el código (todo sale de plantillas e i18n), tests para toda la lógica de dominio (fórmulas, meta de hoy, scheduler), un commit por hito y un `CLAUDE.md` con las decisiones técnicas. Si una API de Expo no funciona como esperas, revisa la documentación oficial antes de cambiar de enfoque.
