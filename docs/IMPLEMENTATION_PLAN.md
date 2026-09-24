# Implementation Plan — Guided Test Prep (Local Offline) v0.2

Source of truth: [handoff/Guided_Test_Prep_Local_Offline_SOW_v0.2.md](handoff/Guided_Test_Prep_Local_Offline_SOW_v0.2.md),
[handoff/README.md](handoff/README.md), the contract [handoff/test-file.local.v1.schema.json](handoff/test-file.local.v1.schema.json),
and the two fixtures [handoff/engr206-local.test.example.json](handoff/engr206-local.test.example.json) and
[handoff/mechanics-of-materials.local.test.example.json](handoff/mechanics-of-materials.local.test.example.json).

(The superseded hosted-platform v0.1 docs are kept in [archive/handoff-v0.1/](archive/handoff-v0.1/) for reference only.)

## What we're building

One self-contained `dist/index.html`. Amy double-clicks it, loads a test JSON file (file picker or drag-and-drop via `FileReader`), picks a problem, runs a timer, builds steps from dropdowns, and reveals the authored solution path. No server, accounts, database, network, AI, or problem generation. The runtime has no subject-specific code; the test file is the only thing that changes.

---

## 1. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Language / build | TypeScript + Vite | Fast, simple, well known |
| Single-file output | `vite-plugin-singlefile` | Inlines all JS/CSS into `index.html`. Chrome blocks external `type="module"` scripts under `file://`, so inlining everything is what makes double-click work |
| UI | React | Small app; familiar; fine bundle size once inlined |
| LaTeX | KaTeX from npm, CSS + fonts inlined as base64 | No CDN. `trust: false`, `throwOnError: false` so a bad LaTeX string shows red text instead of crashing |
| Schema validation | Ajv **standalone** (validator code generated at build time from the schema) | Readable JSON-path errors, no runtime schema compilation |
| 2D diagrams | Hand-written SVG renderer | Primitive list maps 1:1 to SVG elements |
| 3D scenes | Hand-written SVG projection (azimuth/elevation camera → 2D) | Static scenes with 8 primitive kinds and no interaction don't need three.js; keeps the file small and crisp. three.js stays a fallback if that ever changes |
| Tests | Vitest (engine/validation/renderers) + Playwright (opens `dist/index.html` via `file://` with network blocked) | Acceptance criteria are tested by opening the real delivered file offline |

Expected `index.html` size: roughly 0.8–1.2 MB (mostly KaTeX fonts).

## 2. Repository layout

```
src/
  contract/
    types.ts              TS types mirroring test-file.local.v1.schema.json
    validate.ts           Ajv standalone + semantic checks → readable issues
    schema.json           copy of the contract (build input)
  engine/
    expression.ts         evaluate the formula expression tree (fixed op set, arity checks)
    variables.ts          variable store: stable var_0001 ids, editable name/symbol
    steps.ts              run formula / basicMath / conversion / derivative / finalAnswer
    attempt.ts            attempt state (timer, variables, steps), reset
    reviewMatch.ts        match learner outputs to authored path values
  render/
    Latex.tsx             KaTeX wrapper with plain-text fallback
    Diagram2D.tsx         diagram2d/v1
    Scene3D.tsx           scene3d/v1 (SVG projection)
    VisualView.tsx        picks the renderer from `type`; latex/v1 too
  ui/
    Home.tsx              Load Test, Use Included Examples, Open Problem
    ProblemView.tsx       prompt, givens, target, visual, formula sheet, timer, work list
    Timer.tsx
    AddStep.tsx           action group → operation → input dropdowns → name/symbol → Calculate
    WorkList.tsx          steps and rename controls
    Review.tsx            learner work + authored path (step-by-step or all at once)
    FileError.tsx         invalid-file feedback with JSON paths
  examples/               the two supplied fixtures, bundled for "Use Included Examples"
tests/
  fixtures/invalid/       broken test files, one per validation rule
  e2e/                    Playwright specs mapped to the 10 acceptance criteria
docs/
  AMY_QUICKSTART.md       two-minute instructions
  TEST_FILE_GUIDE.md      field guide + ChatGPT prompt for Brent
  ARCHITECTURE.md
```

`npm run build` → `dist/index.html` (the only thing Amy receives). `npm test` runs everything.

## 3. Core design

### 3.1 Loading and validation

1. `FileReader.readAsText` → `JSON.parse` (parse errors report line/column).
2. Schema check (Ajv standalone) → errors as JSON paths, e.g. `/problems/1/solutionPath/2/formulaId: must be string`.
3. Semantic checks, which the schema can't express:
   - `allowedFormulaIds`, `allowedConversionIds`, `formulaId`, `conversionId`, `derivativeId` refer to things that exist, and path steps only use formulas/conversions the problem allows
   - every `slot` in a formula's expression tree names one of that formula's inputs; operator arity is correct (`negate/abs/sqrt` = 1 arg, `subtract/divide/power` = 2, `add/multiply` ≥ 2)
   - solution-step `bindings` refer to a given or to an earlier step's output (or a derivative `numericEvaluation`) in path order
   - formula bindings cover every input slot; basic-math bindings use `left`/`right` (`sqrt` uses `value`)
   - duplicate ids within a problem
   - (primitive fields are enforced by the tightened schema, see §6)
4. **Authored-value check (warning, not a blocker):** the runtime recomputes each authored solution step and warns when its `output.value` differs from the calculated value. This catches ChatGPT arithmetic mistakes before Amy trusts the answer key. All six fixture problems pass.

Errors block opening the file. Warnings show on the problem list with a "details" disclosure.

### 3.2 Variables

- Every given, step output, conversion result and derivative result becomes a `Variable { id: "var_0001", origin, authoredId?, name, symbol, unit, quantityType, value?: number, latex?: string }`.
- `id` never changes. Renaming edits only `name`/`symbol`, so earlier steps (which store ids) stay intact.
- Auto names follow the SOW table: formula output name + counter (`Voltage 1`, `V_1`); basic math `Result n`; conversion `outputName n`; derivative uses the action's output name/symbol.
- Dropdown entries read `Voltage across R1 (V_R1) = 12 V`, grouped as Givens / Constants (`quantityType: "constant"`) / My results. Symbolic-only variables (e.g. `v(t) = 6t + 2`) show in lists but are disabled for numeric inputs.

### 3.3 Step types

| Group | Inputs | Result |
| --- | --- | --- |
| Formula sheet | formula from `allowedFormulaIds`; one dropdown per input slot | evaluate expression tree → output unit taken from the formula's `output` slot |
| Basic math | add / subtract / multiply / divide / power / sqrt; left/right dropdowns | number; unit = same unit for add/subtract, otherwise a composed label (`N/mm^2`) |
| Unit conversion | conversion from `allowedConversionIds`; one variable | value × factor, unit = `toUnit` |
| Derivative | action from `derivativeActions` | symbolic variable from `resultLatex`, plus a numeric variable from `numericEvaluation` when present |
| Final answer | one variable | recorded as her stated answer, shown next to the target |

Units are displayed, not analyzed (per SOW). One cheap extra: a non-blocking hint when a bound variable's unit differs from the slot's declared unit, or a conversion's `fromUnit` (e.g. "R2 is in kohm; this slot expects ohm"). Feedback is a hint only; no grading.

Evaluation errors (divide by zero, sqrt of a negative, non-finite) show inline on the step and create no variable.

### 3.4 Timer

States: `ready → running ⇄ paused → finished`. Elapsed time = accumulated + (now − lastStart), displayed as mm:ss. **Finish and reveal path** stops it permanently for the attempt. It is held in memory only.

### 3.5 Review

- Left: her work list with values, units and elapsed time.
- Right: the authored `solutionPath`, revealed **one step at a time** or **all at once**. Each step shows its kind, formula/operation/conversion/derivative, bound inputs (resolved to given/output names and values), result with unit, `expectedLatex`, and every teaching field (`whyNow`, `whatToNotice`, `whyThisOperation`, `inputMeaning`, `resultUse`, `commonMistakes`).
- A ✓ beside each authored step whose output value matches one of her variables (relative tolerance 1e-6). This is informational, not a grade.

### 3.6 Reset / reload

**Reset problem** clears that problem's attempt (timer, steps, derived variables, renames) and keeps the loaded test. Loading a new file replaces the whole test state.

### 3.7 Visual renderers

The contract leaves primitive fields open, so the renderer defines them. They match the fixtures and are documented in `TEST_FILE_GUIDE.md`:

**diagram2d/v1** (SVG user units in `viewBox`): `line{x1,y1,x2,y2}`, `polyline{points:[[x,y]…]}`, `arrow{x1,y1,x2,y2}`, `circle{x,y,radius}`, `rect{x,y,width,height}`, `point{x,y}`, `text{x,y,text}`, `resistor{x1,y1,x2,y2}` (zig-zag), `voltageSource{x,y,radius}` (circle with +/−), `ground{x,y}`. All take optional `label` and `color`.

**scene3d/v1**: `axes{length,labels}`, `point{at}`, `line{from,to}`, `arrow{from,to}`, `plane{origin,u,v}`, `box{center,size}`, `cylinder{from,to,radius}`, `label{at,text}`. All take optional `label`, `color`, `highlight`. Camera: `azimuthDeg`, `elevationDeg`, `scale`, `projection`. Rendering uses orthographic/perspective projection to SVG, painter's-algorithm depth sort for faces, and auto-fit to the view.

Unknown primitive kinds or missing fields are reported by validation. The renderer skips them rather than crashing. Each visual has `role="img"` and `aria-label` = `altText`, with the alt text also shown in a disclosure.

---

## 4. Milestones

Status and evidence for each milestone: [milestones/](milestones/). Decisions made during implementation: [DECISIONS.md](DECISIONS.md).

### M0 — File contract and shell
- [x] Extend CI (`.github/workflows/ci.yml`): typecheck, unit tests, build, Playwright E2E on `file://dist/index.html`, upload `index.html` as a build artifact
- [x] Vite + React + TS scaffold, single-file build, `dist/index.html` opens from `file://` (verified in Chromium and Edge locally; Firefox/WebKit in CI)
- [x] Contract types + tightened schema (per-kind primitives) + Ajv standalone + semantic checks + invalid fixtures
- [x] Home screen: Load Test (picker + drag-drop), Use Included Examples, problem list, invalid-file error view
- [x] Render one prompt with KaTeX (fonts inlined, offline)
- [x] `ARCHITECTURE.md`

### M1 — Guided local runtime
- [x] Expression evaluator + tests (every op, arity, errors)
- [x] Variable store with stable ids, auto-naming, rename
- [x] Add Step: formula / basic math / conversion / final answer, all dropdown-driven
- [x] Timer (start/pause/finish)
- [x] Work list, reset problem, load-new-test replacement
- [x] Review: step-by-step and show-all, full teaching fields, ✓ matching, Download Attempt JSON
- [x] Authored-value recomputation warnings

### M2 — Rendering and handoff
- [x] Diagram2D renderer (all 10 kinds) and Scene3D renderer (all 8 kinds)
- [x] Derivative action (symbolic + numeric variables)
- [x] Playwright E2E for AC1–AC10 against `file://dist/index.html` with network disabled
- [~] Cross-browser pass: Chromium + Microsoft Edge verified locally; Firefox + WebKit run in CI (Linux). Real Windows Firefox and macOS Safari still need a manual check (see milestones/M2.md)
- [x] `AMY_QUICKSTART.md`, final pass on `TEST_FILE_GUIDE.md`, README

## 5. Acceptance-criteria traceability

| AC | Covered by |
| --- | --- |
| 1 Double-click opens, no server | Single-file build; E2E opens `file://` |
| 2 Load either fixture; clear invalid-file error | Loader + validation; invalid fixtures |
| 3 Start/pause/finish timer | Timer state machine + E2E |
| 4 Offline rendering incl. bolt-group 2D and axial-bar 3D | KaTeX inlined; renderers; E2E with network blocked |
| 5 Formula step via dropdowns incl. prior outputs | AddStep + E2E |
| 6 Auto-name, rename, renamed var in later dropdown | Variable store + E2E |
| 7 Basic math + one conversion, no typing | AddStep + E2E |
| 8 Pre-authored derivative + explanation | Derivative step + E2E (ENGR 206 problem 3) |
| 9 Finish stops timer, full path with all fields | Review + E2E |
| 10 Reset keeps test; new load replaces | Attempt state + E2E |

---

## 6. Contract decisions (resolved)

1. **Named constants → givens.** Constants such as `2`, `pi`, or `g = 9.81 m/s^2` are declared as entries in the problem's `givens`, with a clear `name` (e.g. `"Constant pi"`) and `quantityType: "constant"`. No schema change. Documented in [TEST_FILE_GUIDE.md](TEST_FILE_GUIDE.md).
2. **Basic-math bindings.** `left`/`right` for two-input operations, `value` for `sqrt`. Documented and validated.
3. **Primitive fields.** The §3.7 field lists are the documented convention, and `src/contract/schema.json` tightens `diagramPrimitive` and `scene3dObject` into per-kind definitions so malformed ChatGPT output is rejected with a precise path. Both supplied fixtures must still validate. The published contract (`handoff/test-file.local.v1.schema.json`) is updated to match.
4. **Derivative numeric result.** A derivative action creates two variables: the symbolic function and, if present, the `numericEvaluation` value.

## 7. Other decisions

- **Repo visibility:** left as is.
- **Delivery:** `index.html` is attached to a GitHub Release per version; `dist/` is not committed.
- **Download Attempt JSON:** included. It exports the problem id, elapsed time, steps, variables and renames.
- **Learner-vs-path ✓ matching** in review: included (§3.5).
