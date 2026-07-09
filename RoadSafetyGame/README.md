# Cross Safe — Road Safety Awareness Game

A browser-based 3D game (Three.js) that teaches safe road-crossing behaviour by making
**safety, not speed, the score that matters**.

**Play it:** open `index.html` in any modern browser, or visit the GitHub Pages link once enabled.

## Why this exists

Global road accident deaths rose 13% as vehicle volume doubled, even though the fatality
rate per vehicle declined 8.3%. Low-income countries face a **3.5x higher accident death
rate** than wealthy nations despite having fewer cars. Road traffic injuries remain a
leading cause of death for young people.

This game targets three outcomes:

1. **Reduce exposure to high-risk routes** — hazardous rows (open roads, red signals) are
   visibly riskier, and the game tracks which behaviours lead to incidents.
2. **Raise road safety awareness among youth** — real-time alerts fire the moment a player
   jaywalks or crosses on red, and every game-over screen delivers a targeted safety lesson
   plus a real-world fact.
3. **Shift behaviour from speed to safety** — distance is one score, but the prominent
   **Safety Rating (A–F)** rewards waiting for WALK signals over rushing.

## How to play

| Action | Control |
|---|---|
| Move | Arrow keys / WASD (desktop), swipe or d-pad (mobile) |
| Goal | Travel as far as possible **with an A rating** |
| Safe | Grass rows; zebra crossings when the signal shows **WALK** |
| Risky | Open road rows (jaywalking); zebra crossings on red |

Cars stop for you at zebra crossings during WALK. Everywhere else, they don't.

## Project structure

```
index.html   — page shell, HUD, overlays, mobile controls
app.js       — game logic: world generation, signals, cars, behaviour tracking
style.css    — road-signage design system (safety yellow / asphalt / zebra)
```

No build step. No dependencies beyond the Three.js CDN.

## Behaviour tracking (SQL backend — planned)

All player behaviour flows through a single `logEvent(type, data)` function in `app.js`,
which currently stores events in-memory per session. Event types:

`session_start`, `safe_crossing`, `jaywalk`, `red_light_crossing`, `death`, `session_end`

This is the integration point for the planned backend. The intended schema (to be added):

- `users` — player identity and age group
- `sessions` — one row per playthrough with score and safety rating
- `routes` — origin/destination choices (future rerouting feature)
- `incidents` — jaywalks, red-light crossings, collisions
- `alerts` — personalised safety messages sent to players

Swap the body of `logEvent` for a `fetch('/api/events', ...)` call once the API exists.

## Planned AI integrations

| Tool | Role |
|---|---|
| **Gemini / Google AI Studio** | Generate personalised safety coaching from a player's behaviour log |
| **Ollama** | Local LLM alternative for safety tips without API costs |
| **NotebookLM** | Ground facts/quiz content in WHO road safety reports |
| **Botpress** | Companion "safety buddy" chatbot for road-rule Q&A |
| **n8n** | Pipeline: session end → database → AI feedback → alert delivery |
| **Adobe Express** | Posters, logos, and campaign visuals |

## Running locally

Just open `index.html`, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Deploying (GitHub Pages)

Repo Settings → Pages → Source: `main` branch, root folder. The game is static, so it
works out of the box.

## License

[MIT](LICENSE) — chosen so schools, students, and other developers can freely play,
fork, and adapt this awareness project. Consistent with Three.js's own MIT license.
