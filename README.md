# PubNebula

PubNebula is a small static web app that turns UoM astrophysics publications into an explorable astronomy metaphor:

- The University of Melbourne is the central black hole.
- Each current UoM astrophysics faculty member or student roster member is a star.
- Each publication is a planet around the linked faculty star.
- Inner stellar rings mean earlier approximate join/proxy order; outer rings mean newer or roster-only entries.

This is an MVP/prototype. The radial ranks are deliberately labelled as approximate visual metadata, not as exact appointment history.

## What Is In The App

The app is built with Vite, TypeScript, and plain Three.js. It loads `public/data/nebula.json` at runtime and renders:

- A central black hole and accretion disk for UoM.
- Seven faculty star systems and current student roster stars seeded from the UoM Astrophysics directory.
- Publication planets sized by citation count, radially placed within each local star system by publication year, and colored by dominant OpenAlex topic.
- Controls for search, author focus, topic filter, year filter, label visibility, and camera reset.
- A details panel for the galaxy summary, author metadata, or selected publications.

## Data Flow

`data/people.yaml` is the canonical curated input. It stores one explicit OpenAlex author ID when available, plus ORCID, role label, approximate radial rank, confidence, and evidence notes. Roster-only students may have `openAlexAuthorId: null`; they render as stars without publication planets until an ID is curated.

`scripts/fetch-openalex.mjs` reads `data/people.yaml`, fetches full-career works from OpenAlex by explicit author ID, skips roster-only entries without an ID, caches raw responses under `data/cache/openalex/`, and writes the normalized app dataset to `public/data/nebula.json`.

`public/data/nebula.json` is committed so the app works immediately without requiring a live OpenAlex request.

## Common Commands

```bash
npm install
npm run dev
npm run fetch:data -- --allow-unauthenticated
npm run validate:data
npm run test
npm run build
npm run verify:visual
```

Use `OPENALEX_API_KEY` for normal data refreshes. The `--allow-unauthenticated` flag is only intended for small local demos.

## What To Commit

Commit source, curated data, tests, scripts, and the generated normalized dataset:

- `.gitignore`
- `README.md`
- `data/people.yaml`
- `index.html`
- `package.json`
- `package-lock.json`
- `public/data/nebula.json`
- `scripts/`
- `src/`
- `tests/`
- `tsconfig.json`

Do not commit rebuildable or raw/generated local artifacts:

- `node_modules/`
- `dist/`
- `data/cache/`
- `artifacts/`

## Current Caveats

- Publication scope is full-career output for entries with curated OpenAlex IDs. A planet around a UoM roster star does not imply the work was produced at UoM.
- Radial order is approximate. For students, the current placeholder is directory order until a first UoM-affiliated publication proxy is curated.
- OpenAlex metadata can contain odd publication years or sparse affiliation/source fields. The app surfaces the generated data rather than silently cleaning it into a false certainty.
- Academic-stage star morphology is intentionally postponed; `stage` exists in the curated people data but is not used for styling yet.
