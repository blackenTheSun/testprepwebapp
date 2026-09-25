# Implementation Plan: v0.3 Visual Rapid Knowledge Checks (delta)

Source of truth: [handoff/v0.3/Guided_Test_Prep_Rapid_Knowledge_Checks_Update_SOW_v0.3.docx](handoff/v0.3/Guided_Test_Prep_Rapid_Knowledge_Checks_Update_SOW_v0.3.docx) (plain-text copy: [extracted.md](handoff/v0.3/Guided_Test_Prep_Rapid_Knowledge_Checks_Update_SOW_v0.3.extracted.md)). This delta is **additive** to v0.2: everything in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [DECISIONS.md](DECISIONS.md) stays in force unless changed here.

## What changes, in one paragraph

Test files gain a v2 contract, `guided-test-file.local/v2`, that can carry **quick-check sets** in addition to (or instead of) worked problems. The four item types are visual identification (single choice, including side-by-side comparisons), visual true/false, diagram-label matching (callout markers plus a larger term bank), and deliberate recall (paper-first, self-marked Got It / Review). A set is `standard` or `rapidVisual`, the second with an optional per-card countdown. Feedback is immediate or held until the end. A summary separates misses, unanswered cards, and Review items, and "Retry Missed and Review" rebuilds a set from those items. Visuals can be the existing typed scenes (now with a `sphere` primitive, highlights and callouts), embedded PNG/JPEG data, or a pair of panels. Formulas gain `sin/cos/tan/asin/acos/atan` with a required degree/radian unit. v1 files keep working exactly as before.

---

## 1. Contract: `guided-test-file.local/v2`

### 1.1 Versioning (class based)

- `TestFileContract` (abstract) → `ContractV1`, `ContractV2`, with a `ContractRegistry` keyed by `apiVersion`. Each contract owns its compiled schema validator and its list of `ValidationRule`s.
- The loader reads `apiVersion` first and dispatches. An unknown version gives a readable error naming the supported versions.
- **v1 is frozen.** Its schema and rules don't change, so the AC "a v1 file behaves exactly as before" is guaranteed structurally, and the whole existing unit + E2E suite stays as the regression check.
- Both versions produce the same internal `TestFile` model. v1 has `quickCheckSets = []`, and v2 may have `problems = []`.

### 1.2 Schema shape (additions over v1)

- Top level: `problems` and `quickCheckSets` are both optional, but at least one of them must be non-empty. `formulaSheet`/`conversions` become optional in v2, because rapid-only files don't need them.
- `quickCheckSet`: `id`, `title`, `instructions`, `feedbackMode` (`immediate` | `end`), `presentationMode` (`standard` | `rapidVisual`), and ordered `items`.
- `item` is discriminated by `type`:

| `type` | Required | Scoring |
| --- | --- | --- |
| `singleChoice` (visual identification / comparison) | `prompt`, `options: [{id, text}]` (≥ 2, unique ids), `correctOptionId`, `explanation`; `visual` required in rapidVisual sets | auto |
| `trueFalse` | `visual`, `statement`, `answer: boolean`, `explanation` (the correction or teaching note) | auto |
| `matching` (diagram labels) | `visual` with `callouts` (≥ 2), `prompts: [{id, text}]` (one per callout), `options: [string]` (term bank, count ≥ callouts, unique), `answers: {calloutId: term}` (complete, values in bank, no term used twice), `explanation` optional | auto, per pair |
| `recall` | `responseMode` (`written` \| `sketch`), `prompt`, `modelAnswer` and/or `keyPoints`, optional reference `visual` | self-marked: Got It / Review |

  The matching shape follows the SOW's representative example (`prompts`, `options` as strings, and `answers` mapping callout id → term).
- `displaySeconds` (optional, positive, max 600) per item, used only in `rapidVisual` sets.
- **Item visual** (`visual`), discriminated by `kind`:
  - `typedScene`: `scene` is any existing `latex/v1`, `diagram2d/v1` or `scene3d/v1` visual (so it keeps its own `altText`), plus optional `callouts`.
  - `image`: `mediaType` (`image/png` \| `image/jpeg`), `data` (raw base64, no URL of any kind), `altText`, `width`, `height` (px, used for layout and callout mapping), optional `callouts`.
  - `pair`: `panels` of exactly 2 `typedScene`/`image` visuals, each with an optional `caption` (e.g. "A", "B"); no nesting.
  - `callout`: `{ id, xPct, yPct }` with both 0–100, positioned relative to the rendered visual. A marker shows the id ("A", "1").
- **Typed-scene additions (v2 only):** `sphere {center, radius}` in `scene3d`; optional `highlight` on 2D primitives (3D already has it); optional `wireframe: true` on `box` (for unit cells, so the corner spheres stay visible).
- **Trig in expression trees (v2 only):** `sin`, `cos`, `tan` (1 arg) and `asin`, `acos`, `atan` (1 arg), each **requiring** `angleUnit: "deg" | "rad"`. For `sin/cos/tan` the unit applies to the input; for the inverses it applies to the output.

### 1.3 Validation (new `ValidationRule` subclasses, v2 only)

Structural issues (unsupported item `type`, missing fields, missing `angleUnit`) come from the schema. Semantic rules add the rest:

| Rule | Rejects (SOW §3 list) |
| --- | --- |
| `VisualAssetRule` | media type other than PNG/JPEG; bytes that don't match the declared type (magic-number check: PNG `89 50 4E 47`, JPEG `FF D8 FF`); invalid base64; missing or empty alt text; an image over the size limit |
| `CalloutRule` | duplicate callout id; `xPct`/`yPct` outside 0–100 |
| `SingleChoiceRule` | < 2 options; duplicate option id; `correctOptionId` not among the options |
| `MatchingRule` | < 2 callouts; prompts that don't match callouts one-to-one; duplicate terms; bank smaller than callout count; answer map missing an entry; answer not in the bank; the same term as the correct answer for two callouts |
| `RapidVisualRule` | a `rapidVisual` item without a visual; `displaySeconds` outside a standard set (warning) |
| `QuickCheckIdRule` | duplicate set ids, and duplicate item ids within a set |

**Asset-size guardrails (proposed):** at most 1.5 MB per image after decoding (error); a warning above 400 KB; at most 20 MB for the whole file (error). The limits are constants, so they're easy to change.

**Safety model:** no field in the schema accepts a URL or path. Images are only `mediaType` + base64 `data`, which the app turns into a `data:` URL itself. SVG images are not accepted. The existing build CSP (`img-src data: blob:`, `connect-src 'none'`) still blocks any network request.

## 2. Engine: quick checks (new `src/engine/quickcheck/`)

| Class | Role |
| --- | --- |
| `QuickCheckItem` (abstract) → `SingleChoiceItem`, `TrueFalseItem`, `MatchingItem`, `RecallItem` | Wrap JSON; `score(response): ItemResult`; `isAutoScored`; `correctOverlay()` for callout reveal |
| `ItemResult` | `correct` / `incorrect` / `partial` (matching, with per-pair detail) / `unanswered` / `gotIt` / `review` |
| `QuickCheckRun` (Observable) | Walks one set's items in **authored order** (never shuffled). Records responses, applies the feedback mode, and drives the card timer. |
| `CardTimer` | Per-card countdown from `displaySeconds`, with the clock injected for tests. On expiry it records `unanswered` and advances. |
| `RunSummary` | Groups results into visual misses (incorrect/partial), unanswered cards, and recall items marked Review, plus a score for auto-scored items. |
| `RetryBuilder` | Builds a new `QuickCheckRun` from the missed, unanswered and Review items in authored order. Session only, never persisted. |

Behaviour details:
- **Matching one-to-one:** a term chosen for one callout is disabled in the other dropdowns, until it is cleared or changed.
- **Immediate feedback:** after Submit the app shows correct/incorrect, the explanation, and for matching the correct labeled overlay with each pair ✓/✗. Then **Next**.
- **End feedback:** Submit just advances, and all feedback appears in the summary. The summary shows the correct mapping for every matching item.
- **rapidVisual:** a visible countdown per card when `displaySeconds` is set. Answering stops that card's countdown. Expiry records `unanswered` and moves straight to the next card, and the card appears in the summary and in Retry.
- **Recall:** shows the prompt → **Reveal reference** → model answer / key points / reference visual → **Got It** or **Review**. There is no text box and no drawing canvas.
- **Trig:** `TrigNode` subclasses of `OperatorNode` (`Sin/Cos/Tan/Asin/Acos/Atan`) handle the degree/radian conversion. `asin`/`acos` outside [-1, 1] and `tan` where cos ≈ 0 raise a readable `EvaluationError`. They are available to any v2 formula, so the load-time answer-key check covers them automatically.

## 3. Visuals (additions to `src/render/`)

| Class | Role |
| --- | --- |
| `ItemVisualAdapter` (abstract) + registry by `kind` | `TypedSceneVisual` (delegates to the existing `VisualRegistry`), `ImageVisual` (`<img src="data:…">`, `alt` = altText), `PairVisual` (two panels side by side, stacked on narrow screens) |
| `CalloutOverlay` | Absolutely positioned markers over a wrapper whose aspect ratio matches the visual (viewBox for 2D, the fixed 520×340 frame for 3D, `width/height` for images), so `xPct/yPct` land in the same place at any size. In reveal mode each marker shows its correct term and ✓/✗. |
| `SphereObject` (`Object3D` subclass) | Projected circle with radial-gradient shading, depth sorted with the other objects |
| `BoxObject` wireframe option | 12 edges as depth-sorted segments instead of filled faces |

## 4. UI

- **Home:** after loading, a **Visual Rapid Checks** area (one card per set: title, item count, mode, feedback style, last result this session) above the existing **Worked problems** list. Either section is hidden when empty, so a rapid-only file opens straight to its checks.
- **Quick-check screen:** progress ("Card 3 of 8"), the countdown if any, the visual with alt-text disclosure, the item controls, and Submit / Next. Then the **summary** with the three groups, and **Retry Missed and Review**.
- The worked-problem screens are untouched.

## 5. Proof fixture and test fixtures

- **Engine test fixtures** (small, synthetic, not course content): one per item type and one per validation failure, including a tiny generated PNG and JPEG for the asset checks.
- **SOW proof fixture** (§7), owned by the client: ≥ 2 visual identification cards, ≥ 3 true/false, 1 matching with 5 callouts and ≥ 8 terms, one 8-card rapidVisual set, 1 explicit-angle trig item, and 1 recall prompt. **See open question 1.** Once approved, it's bundled as a third "Use Included Examples" entry and drives the delta E2E tests.
- **`npm run embed-image -- picture.png`** (new helper script): prints the `{ "kind": "image", "mediaType", "data", "width", "height", "altText": "" }` JSON block for a local PNG/JPEG. ChatGPT can't produce real image bytes, so this is how Brent gets pictures into a file.

## 6. Milestones (delta)

| Milestone | Scope | Gate | SOW estimate |
| --- | --- | --- | --- |
| **R0: v2 contract and validation** | Contract registry, v2 schema (published copy + compiled), trig nodes, sphere/wireframe/highlight, all v2 rules, asset guardrails, `embed-image` script, guide updates, engine fixtures | v1 suite still green; every SOW §3 rejection has a failing-fixture test; trig evaluates in deg and rad | 10–16 h |
| **R1: quick-check runner** | Item classes and scoring, `QuickCheckRun`, `CardTimer`, feedback modes, summary, retry; home section; quick-check screen; recall flow | Unit tests for scoring, one-to-one matching, expiry → unanswered, and retry composition | 22–34 h |
| **R2: visuals, proof fixture, QA** | Image, pair and callout overlay rendering; reveal overlay; proof fixture wired in; E2E for the 8 delta ACs offline in 3 engines; docs, milestone reports, decisions | All delta ACs green in CI; v1 E2E unchanged and green | 16–24 h |

Each milestone ends with a report in `docs/milestones/` (R0.md, R1.md, R2.md), new entries in DECISIONS.md, and commits pushed to `main`.

## 7. Delta acceptance traceability

| SOW §8 check | Covered by |
| --- | --- |
| Legacy compatibility | Frozen `ContractV1`; the existing 41 unit + 7 E2E tests, unchanged |
| Rapid-only support | v2 "at least one activity" rule; E2E opens a checks-only file and starts a set |
| Offline visual asset | `ImageVisual` + `TypedSceneVisual`; E2E asserts the image renders from `data:` with alt text and zero non-file requests; the schema has no URL/path fields |
| Visual closed answers | `SingleChoiceItem`/`TrueFalseItem` scoring tests; E2E checks the true/false correction text |
| Diagram label match | `MatchingItem` + one-to-one dropdowns + overlay; E2E on the 5-callout/8-term item (duplicate prevention, per-pair score, reveal) |
| Rapid visual set | `CardTimer` with Playwright's clock: authored order, visible countdown, expiry → unanswered, present in summary and retry |
| Deliberate recall | `RecallItem` offers only Got It / Review; E2E asserts there's no text or drawing input |
| Safe math and errors | Trig unit tests plus the fixture's trig item; E2E loads invalid fixtures (bad asset, bad callout, small bank, duplicate target, unknown type) and checks the error text |

## 7a. Decisions I'll make unless you say otherwise

1. **Trig for learners:** trig is available in authored **formula cards** (so the dropdown formula flow computes it). I won't add sin/cos to the learner's Basic math menu, because that would need a degree/radian choice in her UI and the SOW only asks for *authored* calculations.
2. **Visual comparison** is a `singleChoice` item with a `pair` visual, not a separate item type. The SOW says no new scoring engine is needed.
3. **Expiry in immediate-feedback mode** advances straight to the next card; the expired card's answer and explanation appear in the summary.
4. **No persistence:** the summary and retry live only in the open page, as in v0.2.

## 8. Open questions

1. **Proof fixture content.** The SOW says you supply or approve its wording, images, labels and explanations, and you asked me not to generate problems. Options:
   - (a) You provide the v2 fixture (with PNG/JPEG images).
   - (b) I build a *placeholder* fixture that exercises every feature with obviously generic content (e.g. "Shape A / Shape B" typed scenes and one small generated PNG) for automated testing, and you replace it with real content.

   **I recommend (b)** for R0–R2, so the ACs are proven now, with your real fixture swapped in when ready.
2. **Where the "explicit-angle trig item" lives.** Quick-check items have no calculations in the SOW's item list, so I plan to show it as a worked problem inside the v2 fixture (for example a Bragg's-law formula using `sin` in degrees). Is that what you intended, or do you want a quick-check item whose correct option is verified by an authored trig calculation?
