# Engineering Tools

Client-side Angular 22 toolkit for LV electrical design:

- **LV Cable Sizing** — IEC 60364 ampacity, derating, voltage drop, earth-fault loop
- **Power Network** — supply hierarchy, scenarios, utilisation, single-line diagram
- **Lightning Risk** — IEC 62305-2:2010 component risk (R1 / R2 / R3)
- Earthing cable and building PUE stay as coming-soon placeholders

Everything runs in the browser. Projects autosave to IndexedDB. Nothing is uploaded.

## Develop

```bash
npm start
```

Open http://localhost:4200/

## Test

```bash
npm test
```

Engine golden tests live next to each calculator under `src/app/features/*/engine/*.spec.ts`.

## Build

```bash
npm run build
```

Production build includes a service worker (`ngsw-config.json`) so the app can run offline. Output lands in `dist/engineering-tools/browser`.

## Deploy (Vercel)

Configured via [`vercel.json`](vercel.json): production build, SPA fallback to `index.html`, and cache headers for the service worker.

1. Push the repo to GitHub (or GitLab / Bitbucket).
2. Import the project in [Vercel](https://vercel.com/new) — `vercel.json` sets build and output; leave Framework Preset as Other / None.
3. Deploy. Deep links like `/lv-cable-sizing` work via the rewrite.

Or from the CLI:

```bash
npx vercel
```

No environment variables are required; the app is fully client-side.

## UI

Custom design system in `src/app/ui` (no component library): button, tabs, stepper, dialog (native `<dialog>`), toast, confirm, checkbox, progress, inline SVG icons and flags. Palette is derived from the logo (navy `#0b1c33`, blue `#0f5fc9`); tokens live in `src/styles.css`.

- Sidebar rail on the left (hover to expand, pin to keep open); becomes a bottom tab bar under 820px.
- Keyboard: `1`–`6` jump to tools, `?` shows shortcuts, `Ctrl+S` save, `Ctrl+Z` / `Ctrl+Shift+Z` undo / redo.
- Theme: day / night toggle in the rail. First start follows the OS preference until you choose.
- Motion is limited to `transform` / `opacity` and respects `prefers-reduced-motion`.

## Languages

English, Dutch, German, French, Spanish, Italian. Switch from the flag button in the rail.

## Importing old projects

JSON from the original HTML tools still imports:

- LV cable sizing state
- Capacity Planner / Block Diagram / Network Diagram (merged into Power Network)
- Lightning risk assessment
