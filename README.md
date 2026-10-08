# Pomi

> **Medical disclaimer.** Pomi does not give medical advice. Its goals (water, steps, sleep, training) are general starting points, not a prescription. If you have a medical condition (for example kidney or heart), an injury or any doubt, talk to a professional before following them.

**Pomi** is an open-source, local-first Android app for **gym and healthy habits**. It tells you what to do today (the target of each exercise, how much water, how many steps, when to sleep), learns from 10-second check-ins and shows your real change over time. No accounts, no server, no analytics.

> **Resumen en español.** Pomi es una app Android de código abierto para **gym y hábitos saludables**. Te dice qué hacer hoy (la meta de cada ejercicio, cuánta agua, cuántos pasos, a qué hora dormir), aprende de check-ins de 10 segundos y te muestra tu cambio real. Todo funciona en tu teléfono: sin cuentas, sin servidor y sin analítica. Sin puntos, sin rachas que se rompen y con lenguaje de identidad ("Llevas 4 semanas entrenando de forma constante"). **Aviso:** Pomi no da consejo médico; las metas son guías generales. La app está en español (por defecto) e inglés. Para compartir un programa de gym mira [CONTRIBUTING.md](CONTRIBUTING.md).

## Principles

- **No punishment.** No streaks that break: consistency is "8 of the last 10 days".
- **Hooked by knowing you, not by points.** No XP, badges or rankings. The mascot never gets sad when you miss a day.
- **Suggest, never impose.** Nothing in your plan changes without your confirmation.
- **Local-first.** Your data lives in SQLite on your phone. Steps come from Health Connect (also local). Back up to a JSON file whenever you like.
- **Configuration, not code.** Gym programs, habits and check-ins come from JSON templates you can import and share.
- **Reminders work with the phone locked** and timers ring with the screen off.

## Screenshots

_Screenshots coming soon (placeholder)._

## Tech

Expo SDK 57, React Native 0.86, TypeScript (strict), expo-router, expo-sqlite + Drizzle, zustand, zod. Spec: [`PLAN.md`](PLAN.md). Conventions: [`CLAUDE.md`](CLAUDE.md). Design: [`design/`](design/).

## Build, run and test

Requirements: Node >= 22.5 (the repository tests use `node:sqlite`) and, to run on a device, the Android toolchain (Android Studio / SDK).

```bash
npm install            # plain install; never --force or --legacy-peer-deps
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
npm test               # Jest (jest-expo)
npm run validate:templates   # validates every JSON under templates/
npm run android        # expo run:android (development build on a device/emulator)
npm start              # Metro for the development build
```

### Development build required

Pomi uses native modules (Health Connect, notifications with actions, background tasks, SQLite), so **Expo Go does not work**. Create a development build once (`npm run android` does it locally with the Android toolchain, or use EAS, see below) and then run `npm start`.

### Release builds (EAS)

`eas.json` defines three profiles. Builds need an Expo account (`npx eas-cli login`):

```bash
npx eas-cli build --platform android --profile development   # dev client (APK)
npx eas-cli build --platform android --profile preview       # internal-distribution APK
npx eas-cli build --platform android --profile production    # Play Store bundle (AAB)
```

Bump `expo.version` and `expo.android.versionCode` in `app.json` before each release (see the release checklist in `CLAUDE.md`).

## Privacy

Pomi has **no analytics, no accounts and no backend**. Nothing leaves your phone unless you share a backup file yourself. Health Connect is read-only and only for steps. See Ajustes > Acerca de in the app.

## Contributing

Gym programs and templates are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) and [`templates/community/`](templates/community/README.md). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE).
