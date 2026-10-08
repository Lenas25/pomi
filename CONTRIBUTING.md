# Contributing to Pomi

Thanks for helping. Pomi is a local-first Android app (gym + healthy habits). Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first. The product spec is `PLAN.md` (Spanish); technical conventions and decisions live in `CLAUDE.md`.

## Ground rules

- Code, comments, identifiers and commit messages are in **English**. Everything the user reads goes through `src/i18n` (`es` is the default, `en` must have the same keys).
- No written content in code: exercises, habits and check-in texts come from templates and i18n.
- TypeScript strict, no `any`. UI uses theme tokens only (`design/tokens.json`), never literal colors or sizes.
- [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`...).
- Before opening a PR: `npm run typecheck && npm run lint && npm test && npm run validate:templates` must pass.

## Setup

```bash
npm install            # never --force or --legacy-peer-deps
npm test
npm run android        # needs a development build (no Expo Go), see README
```

## Sharing a gym program or template

A program is a JSON file that the app validates with the same importer you can run locally. People import it from **Ajustes > Importar programa de gym**, so you do not need to touch the app code.

### 1. Start from an example

Copy `templates/gym.json` (a complete program) and edit it. The file looks like this:

```jsonc
{
  "schemaVersion": 2,
  "kind": "module",
  "id": "my-program", // unique, stable, lowercase with hyphens
  "name": "My program",
  "icon": "Barbell", // a Phosphor icon name, never an emoji
  "programs": [
    {
      "id": "full-body-3d",
      "name": "Full body, 3 days",
      "rotation": true,
      "rules": {
        "progression": "double",
        "rirTarget": [1, 2],
        "stallSessions": 3,
        "deloadPct": 10,
      },
      "routines": [
        {
          "id": "day-a",
          "name": "Day A",
          "steps": [
            { "type": "check", "id": "warm-up", "name": "5 min easy cardio" },
            {
              "type": "sets",
              "id": "squat", // the history key: the same id shares history across routines
              "name": "Goblet squat",
              "sets": 3,
              "reps": "8–10", // a range; seconds ("30–45 s") are time, not reps
              "restSec": 120,
              "incrementKg": 2.5, // omit for bodyweight
              "muscles": ["quads", "glutes"],
            },
          ],
        },
      ],
    },
  ],
}
```

Step types are `check`, `wait`, `sets`, `timed` and `counter`. Unknown fields are errors, except keys starting with `_` (use them for comments, e.g. `"_note": "..."`). The full schema is `src/templates/schema.ts` (zod) and the importer rules are summarized in `CLAUDE.md` > "Templates and data".

### 2. Validate it

```bash
npm run validate:templates -- path/to/my-program.json
```

Errors are printed in plain Spanish with the exact path (for example `programs[0].routines[1].steps[3].reps`). With no argument the command validates every JSON under `templates/`, which is what CI runs.

### 3. Evidence rules

Programs that claim a rationale (volume, frequency, rest, progression) must be traceable:

- Cite the section of [`docs/evidence/training.md`](docs/evidence/training.md) that supports each rule (for example `E1` = section 1, weekly volume). Defaults marked `[DESIGN]` there are engineering choices, not findings; say so if you rely on them.
- Add new sources only with a DOI (or PubMed/PMC id) that you opened and whose abstract you read. Mark anything you could not open as unverified.
- **No influencer, social-media or supplement-brand sources.** Peer-reviewed papers, position stands of professional bodies (ACSM, NSCA, WHO) and systematic reviews only.
- Do not include medical claims, diet plans or calorie targets. Pomi is not medical advice.

### 4. Submit

Put the file in `templates/community/` (see its README), open a pull request and fill in who the program is for, the evidence it follows and the equipment it needs. Maintainers review for schema validity, safety and the rules above.

## Reporting bugs

Open an issue with the Android version, device, what you did, what you expected and what happened. Pomi has no analytics or crash reporting, so your description is all we have. Never paste a backup file: it contains your personal data.
