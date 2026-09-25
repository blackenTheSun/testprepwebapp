# Decisions log

Decisions made while implementing the v0.2 local-offline SOW and the v0.3 visual rapid-check delta, with the reason for each. Decisions agreed with Brent are marked **(agreed)**.

## Contract and content

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Constants go in `givens`** with `quantityType: "constant"`, and the UI lists them under a "Constants" heading. No schema change. **(agreed)** | Works with the existing contract; no separate list for ChatGPT to learn. |
| D2 | Basic-math bindings are `left`/`right` (`sqrt`: `value`), conversions bind `value`, and final answers bind `answer`. These are documented and validated. **(agreed)** | They were only implied by the examples. |
| D3 | **Tightened schema** **(agreed)**: per-kind required fields for every 2D/3D primitive (`additionalProperties: false`); `visual` discriminated by `type`; expression-tree arity (`add`/`multiply` ≥ 2 args, `subtract`/`divide`/`power` exactly 2, unary ops exactly 1); per-kind required fields on solution steps. The published copy in `docs/handoff` is kept byte-identical to the compiled copy (unit test). | Malformed ChatGPT output fails with a precise path instead of rendering wrongly. Both fixtures still validate. |
| D4 | Primitives also accept optional `id`, `label`, `color`, and (3D) `highlight`. `label` objects take `at` + `text`. | Covers the SOW's "simple highlight colors" and the fixtures' fields. |
| D5 | The answer key is **recomputed on load**. A stored `output.value` that differs from the recomputed value by more than 1e-6 (relative) produces a warning, not an error. Each step is recomputed from the *authored* values of its inputs, so a slip is flagged where it happens, and again on the step that used the wrong value. | Catches arithmetic slips in generated files without blocking practice. |
| D6 | A given without a numeric `value` is a warning. | It can be shown but not used in a calculation. |
| D7 | Ids must be 2–128 characters (schema pattern `^[A-Za-z][A-Za-z0-9._-]{1,127}$`). | That is what the supplied contract says; noted in the guide because one-letter ids fail. |
| D8 | The reference fixtures are bundled directly from `docs/handoff/`, the single source of truth. | "Use Included Examples" can never drift from the contract fixtures. |

## Build and runtime

| # | Decision | Why |
| --- | --- | --- |
| D9 | Vite + React + TypeScript, inlined into one file by `vite-plugin-singlefile`. | Chrome refuses external module scripts under `file://`; inlining everything is what makes double-click work. |
| D10 | KaTeX from npm with **woff2 fonts only**, inlined as data URIs (a small Vite transform strips the woff/ttf fallbacks). | Offline math rendering; about 1.1 MB total instead of about 3 MB. Every target browser supports woff2. |
| D11 | A build-only **Content-Security-Policy**: `default-src 'none'`, `connect-src 'none'`, no `unsafe-eval`. | Proves offline behaviour and "no code from the test file". It is not applied to the dev server, which needs a websocket. |
| D12 | Ajv validator **compiled at build time** (standalone ESM). The generator hoists Ajv's leftover `require()` helper into an `import`. | No runtime schema compilation or eval, which is compatible with the CSP. |
| D13 | Code is organised as **class hierarchies with registries** (see ARCHITECTURE.md); React components stay thin. **(agreed: "polymorphic and class based")** | New step kinds, operators, primitives, or rules are one subclass each. |
| D14 | The same `Operation` classes run the learner's steps and the authored answer key. | One calculation path; the review cannot disagree with the app. |

## Learner behaviour

| # | Decision | Why |
| --- | --- | --- |
| D15 | Steps can be added only while the timer is **running**. Paused or finished locks Add Step (rename still works). | Keeps timing meaningful; the SOW says the timer starts on Start. |
| D16 | Leaving a problem **pauses** its running timer. Each problem keeps its own attempt while the test is loaded. | Switching problems shouldn't silently run the clock or lose work. |
| D17 | "Finish and reveal path" is available once started (running or paused) and is permanent. The review then replaces Add Step. | SOW: finishing stops the timer permanently. |
| D18 | Symbolic results (derivative functions) are **not offered** to numeric inputs. They are offered to Final answer. | Picking one could only produce an error. (The plan said "shown but disabled"; hiding them is simpler for Amy and native dropdowns.) |
| D19 | A calculation error (divide by zero, √ of a negative, non-finite result) is shown in the Add Step panel, and **no step is recorded**. | SOW: errors create no variable. |
| D20 | Added **Undo last step** (not in the SOW). | Cheap; avoids a full reset after one mis-click. Auto-name counters don't rewind, so the next result may be "Voltage 2". |
| D21 | Auto-naming uses a counter per label: formula → output name + n (`Output voltage 1`, `V_{out,1}`); basic math → `Result n` / `r_{n}`; conversion → `outputName n` / `outputSymbol_{n}`; derivative → the action's output name/symbol, numbered only from the second use. | Follows the SOW table; derivative symbols like `v(t)` read badly with a subscript. |
| D22 | Units are displayed, not analysed. **Non-blocking hints** appear when a bound unit differs from a slot's declared unit, a conversion's `fromUnit`, or between add/subtract operands. Multiply/divide results get composed unit labels (`N·mm`, `mm/mm`). | SOW: no dimensional analysis in v1, but mismatches are the most common mistake. |
| D23 | Numbers display to 6 significant digits, with scientific notation below 1e-3 or at 1e7 and above. | Readable values that still distinguish results. |
| D24 | Givens show the author's LaTeX (e.g. `R_2 = 2\,k\Omega`) until renamed, then `symbol = value unit`. | Keeps the author's formatting where it's accurate. |
| D25 | The formula sheet shows this problem's allowed formulas first. The rest of the test's sheet sits in a collapsed "Other formulas in this test" section (searchable). | The Add Step menu only offers allowed formulas; a long sheet buried the relevant ones. |
| D26 | **Review ✓ matching is by value** (relative tolerance 1e-6) against any of her results. Derivative steps match if she applied that action, and the final answer matches by value. It is informational, never a grade. | She may reach a value by a different route; the SOW excludes grading. |
| D27 | The review starts with step 1 revealed; "Show all" and "One step at a time" can be toggled. | SOW: one at a time or all at once. |
| D28 | **Download Attempt** exports `guided-test-attempt.local/v1` JSON: test/problem ids, timer, variables (with renames), steps, final answer, and review matches. | Optional in the SOW; now included **(agreed)**. |
| D29 | Attempt state lives in memory only (no localStorage). | SOW: long-term history is out of scope; `file://` storage is unreliable across browsers. |

## Visuals

| # | Decision | Why |
| --- | --- | --- |
| D30 | 3D is a hand-written **SVG projection**, not three.js. | Static scenes with 8 primitive kinds; smaller file, crisp text, no WebGL requirement. |
| D31 | 3D world convention: **z is up**. Azimuth is measured in the x–y plane from +x toward +y, and elevation is upward from that plane. The camera looks at the origin. | Engineering convention. Consistent with the fixtures (the axial-bar support plane spans y–z). |
| D32 | Every scene is **auto-fitted** to the view. `camera.scale` multiplies that fit (1 = fit). Perspective puts the eye at 3× the scene radius. | Authors don't need to pick pixel scales. |
| D33 | Solids use back-face culling plus painter's-algorithm depth sorting. Faces are shaded by orientation, and labels are drawn last. | Correct for the convex solids in scope. |
| D34 | Diagram labels get light formatting: Greek letter words → symbols (`tau_y` → τ_y), `ohm`/`kohm` → Ω/kΩ, and `_x` / `_{xy}` → subscripts. | The fixtures write labels this way. Documented in the guide. |
| D35 | **Label placement rules** (authors give no label positions): arrow labels go past the arrowhead when there is room in the `viewBox`, otherwise just below the tip (vertical arrows: above the tip); line/resistor labels go beside the midpoint; polyline labels go beside the middle of the longest segment, on its upper side; point labels go to the lower right of the dot; a voltage-source label moves to the right of the symbol if the left would clip. | Chosen by rendering all six fixture problems. The earlier midpoint placement put axis titles on the plot and collided with point labels. |

## Tooling

| # | Decision | Why |
| --- | --- | --- |
| D36 | E2E tests open the **built file over `file://` with the browser offline**, one test per acceptance criterion. | Tests the real deliverable the way Amy uses it. |
| D37 | CI runs Chromium, Firefox and WebKit on Linux. Locally, Chromium plus installed **Microsoft Edge** (`--project=msedge`). WebKit runs without Playwright's `offline` flag (which breaks `file://` navigation in WebKit); every browser aborts http(s) via `page.route`, asserts none was attempted, and the CSP forbids it. | Correction (CR1): the local WebKit launch failure (`spawn UNKNOWN`) came from the coding tool's command sandbox, not a Windows policy. With the sandbox off, WebKit runs locally; the local Playwright Firefox build still does not launch on this machine. |
| D38 | `index.html` ships through **GitHub Releases** (tag `v*`) and as a CI artifact; `dist/` is not committed. **(agreed)** | Keeps the repo source-only. |

## v0.3 visual rapid checks: R0 (contract and validation)

| # | Decision | Why |
| --- | --- | --- |
| D39 | Each contract version is a class (`ContractV1`, `ContractV2`) that owns its compiled schema, normalization and rules. A `ContractRegistry` picks one by `apiVersion`; an unknown version gets an error naming the supported ones. **v1 is frozen:** its schema and rules are unchanged. | SOW: v1 files must behave exactly as before. Freezing it makes that structural; the unchanged v1 unit and E2E suites are the regression check. |
| D40 | The v2 schema is **composed from v1** by `scripts/compose-v2-schema.mjs` (v1 + additions). The compiled copy (`src/contract/`) and the published copy (`docs/handoff/`) are written together, and a unit test fails if either is stale. | Shared definitions (problems, visuals) can't drift between versions, and authors still get one self-contained schema file. |
| D41 | In v2, `formulaSheet`, `conversions` and `problems` are optional; `ActivityPresenceRule` requires at least one problem or quick-check set. Files are normalized (missing lists → empty) before the shared rules run. | SOW: a rapid-only file opens without a placeholder problem. A rule gives a clearer message than a schema `anyOf`. |
| D42 | Embedded pictures are `mediaType` + **raw base64 `data`** (no `data:` prefix), with `width`/`height`. The schema has no URL or path field anywhere, so links and paths are impossible. `VisualAssetRule` decodes the data and checks the **magic number** (PNG `89 50 4E 47`, JPEG `FF D8 FF`) against the declared type. SVG is not accepted. A shape mismatch between the declared size and the real picture is a warning. | "No remote URL, local path, raw HTML, scriptable SVG": enforced by construction, not by scanning strings. Declared size lets callouts be placed before the image loads. |
| D43 | Size guardrails: **1.5 MB per picture** (error), a warning above **400 KB**, and **20 MB per file** (checked before parsing). The limits are constants in `rulesV2.ts`. | Keeps loading instant and files emailable; easy to change. |
| D44 | Recall items gained an optional **`referenceVisual`**, shown only on reveal; `visual` is shown with the prompt. | A sketch prompt needs a reference drawing that isn't visible while Amy draws. |
| D45 | Callout ids are 1–3 characters ("A", "12"), and matching `prompts` reuse the callout ids, following the SOW's example shape. Matching `options` are plain strings (the term is its own id); single-choice options are `{id, text}`. | Matches the SOW's representative JSON. |
| D46 | Trig (`sin/cos/tan/asin/acos/atan`) exists in **v2 formula expression trees only**, each with a required `angleUnit` (input unit for sin/cos/tan, output unit for the inverses). `tan` where \|cos\| < 1e-12 and `asin`/`acos` outside [−1, 1] raise readable errors. Not added to the learner's Basic math menu. **(agreed)** | SOW §6. Learners reach trig through formula cards. |
| D47 | `sphere`, `wireframe` boxes and 2D `highlight` are allowed by the **v2 schema only**; the renderer supports them regardless. | Keeps v1 frozen. |
| D48 | `npm run embed-image -- file.png "alt"` prints a ready-to-paste `image` block (type, size, base64). It runs directly with Node's TypeScript type stripping, so it requires Node ≥ 22.6. | ChatGPT can't produce real image bytes. This is the practical path for Brent's pictures. |
| D49 | The proof fixture is a **placeholder with generic content** (shapes, a ramp angle), generated by `scripts/make-placeholder-images.mjs` and `scripts/make-placeholder-fixture.mjs`. Its trig item is a worked problem using `sin` in degrees. **(agreed)** | Proves every SOW §7 feature without authoring course content; Brent swaps in approved content. |
| D50 | The built `index.html` grew from ~1.14 MB to ~1.42 MB because the v2 validator is compiled alongside v1. | Accepted: still one small offline file, and it avoids runtime schema compilation (D12). |

## v0.3 visual rapid checks: R1 (runner)

| # | Decision | Why |
| --- | --- | --- |
| D51 | **Card expiry:** when a card's time runs out it is recorded as unanswered and locked. Amy chooses **Show answer** (the correct answer, explanation and label overlay now) or **Next card** (review it in the summary). An answer submitted after the deadline is treated as expired. **(Brent)** | Brent asked for both options. Checking the deadline on submit keeps late answers from counting. |
| D52 | Picture rendering (images, side-by-side pairs, callout markers, reveal overlay) **moved from R2 into R1**. | Diagram-label matching isn't usable without markers, so the runner couldn't be verified without them. R2 keeps the delta E2E suite, QA and docs. |
| D53 | Callouts sit in an **aspect-locked frame** that matches the visual exactly (2D `viewBox`, the fixed 520×340 3D frame, or an image's `width`×`height`), so `xPct`/`yPct` land on the same spot at any screen size. Frames are capped at 380 px tall. | The percentages have to mean the same thing on a laptop and an iPad. |
| D54 | Every closed answer uses an explicit **Submit** (radio buttons or dropdowns, then Submit; Enter also submits), including true/false. | Prevents accidental taps in timed rounds, and keeps one consistent keyboard flow. |
| D55 | **Immediate feedback** shows the status, the correct answer, the author's explanation and (for matching) the ✓/✗ label overlay, then **Next card**. For recall, revealing the reference *is* the feedback: marking Got It / Review moves on. | SOW §4. |
| D56 | **Summary** lists visual misses (incorrect or partly correct matching), unanswered cards (including expired ones) and recall items marked Review separately; correct and Got It items are collapsed. **Retry Missed and Review** builds a new round of exactly those items in authored order. "Start the whole set again" is also offered. The home screen shows each set's last result for this session. | SOW §4; nothing is saved (D29). |
| D57 | Worked problems and quick checks are separate screens. Starting a check pauses any running problem timer, and opening a problem closes the check. | Keeps each timer honest. |
| D58 | The placeholder fixture is bundled as a third included example, **"Visual checks (placeholder)"**. | Amy and Brent can try the feature with no file. |
| D59 | `displaySeconds` in a `standard` set is ignored at runtime and flagged as a warning at load. | SOW: per-card timing belongs to `rapidVisual` sets. |

## v0.3 visual rapid checks: R2 (acceptance and QA)

| # | Decision | Why |
| --- | --- | --- |
| D60 | The rapid-only fixture and the five invalid v2 fixtures are **generated from the placeholder** by `scripts/make-placeholder-fixture.mjs`, each changing one thing. | They stay valid-except-one-thing as the placeholder evolves, so each E2E error case tests exactly one rule. |
| D61 | Delta acceptance lives in its own spec (`rapidChecks.spec.ts`), one test per SOW v0.3 §8 row. The v0.2 spec is untouched and serves as the legacy regression. | Maps one-to-one to the SOW for review, and proves v1 behaviour didn't change. |
| D62 | Package version **0.3.0**; Node ≥ 22.6 for development (the `embed-image` script). The delivered `index.html` is unaffected. | Tag `v0.3.0` to publish a release with `index.html` attached (D38). |

## Change request CR1 (after v0.3): drag-and-drop matching and label reuse

| # | Decision | Why |
| --- | --- | --- |
| D63 | **Diagram-label matching is drag and drop** with puzzle pieces. Each prompt has a socket beneath it, indented slightly right: a host tab carrying the callout letter with **one notch**, plus a dashed outline of the piece. Each label piece has **one knob** on its left edge that seats in the notch. The bank of pieces sits beside the sockets. **(Brent; supersedes the SOW v0.3 §4 "dropdown per callout; no dragging" and D54's dropdowns for matching)** | Brent's request: dragging makes the matching physical, and the single knob/notch shows how pieces connect. |
| D64 | Dragging uses **pointer events** (mouse, pen and touch; `touch-action: none` on pieces) with a floating ghost, not HTML5 drag-and-drop. The same moves work without dragging: tap or Enter a piece, then tap or Enter a socket; tap a filled socket to pick its piece up; Delete returns it to the bank; Escape drops what is held. Screen-reader messages announce each pick-up and placement. | HTML5 drag-and-drop doesn't work on iPad touch. Tap and keyboard keep the item accessible. |
| D65 | Placement rules live on `MatchingItem.place()` / `remove()` / `bankTerms()`, which are unit-tested. Without reuse: a placed piece leaves the bank; dropping onto a filled socket swaps with a piece from another socket, or sends the old piece back to the bank if the new one came from the bank. | The engine owns the rules; the UI only reports gestures. |
| D66 | **`allowReuse: true`** on a matching item lets one label be the correct answer for several callouts. Every piece stays in the bank (copies), and nothing hints how many times a label is needed. The label bank must still hold at least as many terms as there are callouts. Without the flag, a repeated correct label is still an error, and the message now points to `allowReuse`. **(Brent; relaxes SOW v0.3 §3 "unique correct targets" per item)** | Brent's request (e.g. two rectangles). A per-item switch avoids giving away counts. |
