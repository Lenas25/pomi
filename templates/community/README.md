# Community templates

Gym programs and habit modules shared by the community. Every file here is a Pomi template (JSON) and is validated in CI by `npm run validate:templates`.

## Adding yours

1. Read [CONTRIBUTING.md](../../CONTRIBUTING.md#sharing-a-gym-program-or-template).
2. Save your file as `templates/community/<your-handle>-<short-name>.json`.
3. Run `npm run validate:templates -- templates/community/<your-file>.json` until it passes.
4. Open a pull request that follows the evidence rules in CONTRIBUTING.

Files here are **not** bundled or seeded by the app: people import them from Ajustes > Importar programa de gym (or the matching importer). The templates in the parent folder (`gym.json`, `habitos.json`, `metricas.json`, `settings.json`) are the bundled defaults and are changed only by the maintainers.

## Naming

- Lowercase, hyphens, `.json`.
- The `id` inside the file must be unique and stable (it is the key of the exercise history).
- Text inside templates is written for the people who will train with it; the app translates its own labels, not yours.

## Disclaimer

Templates are general training information, not medical advice. Authors and maintainers are not responsible for how a program is used.
