# Guided Test Prep (local, offline)

A single `index.html` that Amy double-clicks to practise technical test problems. She loads a test file, picks a problem, starts a timer, builds each step from dropdowns (formula, basic math, unit conversion, pre-authored derivative, final answer), and then reveals the authored solution path with its explanations.

No server, account, database, network, or AI service. Test content lives entirely in JSON files that Brent writes outside the app (for example with ChatGPT).

| For | Read |
| --- | --- |
| Amy | [docs/AMY_QUICKSTART.md](docs/AMY_QUICKSTART.md): two-minute instructions |
| Brent, writing test files | [docs/TEST_FILE_GUIDE.md](docs/TEST_FILE_GUIDE.md): every field, visual primitives, and a ChatGPT prompt |
| Developers | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md) |
| Scope and acceptance | [docs/handoff/Guided_Test_Prep_Local_Offline_SOW_v0.2.md](docs/handoff/Guided_Test_Prep_Local_Offline_SOW_v0.2.md), [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md), [docs/milestones/](docs/milestones/) |

## Getting the app

Download `index.html` from the latest [GitHub Release](../../releases) (or the `guided-test-prep-index-html` artifact of any CI run), put it anywhere, and double-click it. It works in current Chrome, Edge, Firefox and Safari with no internet connection.

## Building from source

Requires Node.js 20 or newer.

```bash
npm ci
```

```bash
npm run build
```

This produces the one deliverable, `dist/index.html` (about 1.1 MB: app, styles, and KaTeX fonts all inlined).

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (engine, validator, renderers, both reference fixtures) |
| `npm run build` | Build `dist/index.html` |
| `npm run test:e2e` | Acceptance tests: opens `dist/index.html` over `file://`, offline, in Chromium |
| `npm run test:e2e:all` | Same, in Chromium, Firefox and WebKit (what CI runs) |
| `npm run check` | Typecheck + unit tests + build + E2E |

First E2E run: `npx playwright install chromium` (add `firefox webkit` for `test:e2e:all`).

## Releasing

Push a version tag. The Release workflow builds, tests, and attaches `index.html` to a GitHub Release:

```bash
git tag v0.2.0
```

```bash
git push origin v0.2.0
```

## Test-file contract

The app accepts files that conform to [`guided-test-file.local/v1`](docs/handoff/test-file.local.v1.schema.json). The copy compiled into the app is [src/contract/test-file.local.v1.schema.json](src/contract/test-file.local.v1.schema.json), and a unit test keeps the two identical. Two reference tests are bundled under **Use Included Examples**:

- [ENGR 206](docs/handoff/engr206-local.test.example.json): voltage divider with a conversion, resistor power, and a derivative
- [Mechanics of Materials](docs/handoff/mechanics-of-materials.local.test.example.json): double-lap bolt shear, axial bar elongation and strain, and bilinear shear unloading
