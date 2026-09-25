# Test File Guide (`guided-test-file.local/v1` and `/v2`)

This guide explains how to write a test file the app can open. Sections 1–8 cover worked problems, which work the same in both versions. [Section 9](#9-v2-visual-rapid-checks) covers the v2 additions: visual rapid-check sets, embedded pictures, callouts, trig, and spheres.

| Version | Contract | Examples |
| --- | --- | --- |
| `guided-test-file.local/v1` (worked problems only) | [handoff/test-file.local.v1.schema.json](handoff/test-file.local.v1.schema.json) | [ENGR 206](handoff/engr206-local.test.example.json), [Mechanics of Materials](handoff/mechanics-of-materials.local.test.example.json) |
| `guided-test-file.local/v2` (worked problems and/or rapid checks) | [handoff/test-file.local.v2.schema.json](handoff/test-file.local.v2.schema.json) | [Placeholder visual checks](handoff/v0.3/placeholder-visual-checks.test.example.json) |

Use v2 for new files. Everything in sections 1–8 is also valid in v2, except that `apiVersion` is `"guided-test-file.local/v2"`.

A test file is one JSON object with complete, fixed problems. It contains no random ranges, templates, code, image URLs, or free-form expressions.

---

## 1. Top level

| Field | Required | Notes |
| --- | --- | --- |
| `apiVersion` | yes | Always `"guided-test-file.local/v1"` |
| `id` | yes | Starts with a letter; letters, digits, `.` `_` `-`; 2–128 characters. The same rule applies to every `id` in the file, so one-letter ids like `"p"` are rejected. |
| `version` | no | `"1.0.0"` style |
| `title` | yes | Shown on the home screen |
| `description` | no | |
| `formulaSheet` | yes | Array of formulas (may be empty) |
| `conversions` | yes | Array of unit conversions (may be empty) |
| `problems` | yes | At least one problem |

## 2. Formulas (`formulaSheet[]`)

```json
{
  "id": "ohms_law_voltage",
  "title": "Ohm's law voltage form",
  "category": "Resistive circuits",
  "latex": "V = I R",
  "inputs":  [ { "id": "current", "name": "Current", "symbol": "I", "unit": "A" },
               { "id": "resistance", "name": "Resistance", "symbol": "R", "unit": "ohm" } ],
  "output":    { "id": "voltage", "name": "Voltage", "symbol": "V", "unit": "V" },
  "calculation": { "kind": "expression/v1", "ast": { "op": "multiply", "args": [
      { "op": "slot", "slot": "current" }, { "op": "slot", "slot": "resistance" } ] } },
  "teaching": { "whatToNotice": "...", "whyThisOperation": "...", "commonMistakes": ["..."] }
}
```

- `inputs` / `output` are slots: `id`, `name`, `symbol` are required; `unit` and `quantityType` are optional but strongly recommended.
- The output unit shown to Amy comes from `output.unit`. The app does not convert units automatically, so the formula must expect inputs in the units its slots declare.

### Expression tree (`calculation.ast`)

Each node has an `op`:

| `op` | Fields | Number of `args` |
| --- | --- | --- |
| `slot` | `slot`: one of this formula's input ids | none |
| `number` | `value`: a number | none |
| `add`, `multiply` | `args` | 2 or more |
| `subtract`, `divide`, `power` | `args` | exactly 2 (first − second, first ÷ second, first ^ second) |
| `negate`, `abs`, `sqrt` | `args` | exactly 1 |

Use `{ "op": "number", "value": 3.141592653589793 }` for π inside a formula.

## 3. Conversions (`conversions[]`)

```json
{ "id": "kn_to_n", "title": "Convert kilonewtons to newtons", "fromUnit": "kN", "toUnit": "N",
  "factor": 1000, "outputName": "Force", "outputSymbol": "P",
  "latex": "1\\,\\mathrm{kN} = 1000\\,\\mathrm{N}" }
```

The result is `value × factor`, in `toUnit`. Spell `fromUnit` exactly like the `unit` on the givens it converts (for example `kohm`, not `kΩ`), so the app can suggest the right inputs.

## 4. Problems (`problems[]`)

| Field | Required | Notes |
| --- | --- | --- |
| `id`, `title` | yes | |
| `prompt` | yes | `{ "text": "...", "latex": "..." or ["...", "..."] }` |
| `givens` | yes | Every starting value Amy can pick from, **including constants** (see §4.1) |
| `target` | yes | Slot describing the requested quantity |
| `visual` | no | One `latex/v1`, `diagram2d/v1`, or `scene3d/v1` (see §5) |
| `allowedFormulaIds` | yes | Formula ids offered in this problem's dropdown (may be empty) |
| `allowedConversionIds` | no | Conversion ids offered in this problem |
| `derivativeActions` | no | Pre-authored derivatives (see §6) |
| `solutionPath` | yes | The ordered correct path (see §7) |

Each given is `{ id, name, symbol, unit, quantityType, value, latex }`. `value` must be a number.

### 4.1 Constants go in `givens`

There is no separate constants list. Any constant Amy may need as an input, such as `2`, `π`, `g`, or a count like "2 shear planes", is an ordinary given with a clear name:

```json
{ "id": "const_pi", "name": "Constant pi", "symbol": "\\pi", "quantityType": "constant",
  "value": 3.141592653589793, "latex": "\\pi \\approx 3.1416" },
{ "id": "const_two", "name": "Constant 2", "symbol": "2", "quantityType": "constant",
  "value": 2, "latex": "2" },
{ "id": "gravity", "name": "Gravitational acceleration", "symbol": "g", "unit": "m/s^2",
  "quantityType": "constant", "value": 9.81, "latex": "g = 9.81\\,\\mathrm{m/s^2}" }
```

Rules:
- Use `quantityType: "constant"` for pure constants. The app lists them under their own "Constants" heading in dropdowns.
- Give each constant a readable `name` (`"Constant pi"`, `"Constant 2"`). That name is what Amy sees in dropdowns.
- Only include constants the solution path (or a reasonable alternative) actually uses. A constant that lives *inside* a formula (like the `4` in πd²/4) belongs in the formula's expression tree, not in `givens`.
- Solution-path bindings refer to constants by their given `id`, the same as any other given.

## 5. Visuals

Every visual needs `type` and `altText` (a plain sentence describing the picture for accessibility). Unknown kinds or missing fields are rejected with the exact JSON path.

### `latex/v1`

`{ "type": "latex/v1", "altText": "...", "latex": "..." or ["...", ...] }`

### `diagram2d/v1`

`{ "type": "diagram2d/v1", "altText": "...", "viewBox": [minX, minY, width, height], "primitives": [...] }`

Coordinates are in `viewBox` units; y increases downward. Every primitive may also have `id`, `label` (plain text) and `color` (CSS color, e.g. `"#c0392b"`). Unknown fields are rejected.

Labels are plain text with light formatting: Greek letter names become symbols (`tau_y` → τ_y, `gamma` → γ), `ohm`/`kohm` become Ω/kΩ, and `_x` or `_{xy}` is drawn as a subscript. Keep labels short. A voltage source's label goes to its left, or to its right if the left side would run off the diagram.

| `kind` | Required fields |
| --- | --- |
| `line` | `x1, y1, x2, y2` |
| `polyline` | `points`: `[[x, y], [x, y], ...]` (2 or more) |
| `arrow` | `x1, y1, x2, y2` (arrowhead at `x2, y2`) |
| `circle` | `x, y, radius` |
| `rect` | `x, y, width, height` (top-left corner) |
| `point` | `x, y` |
| `text` | `x, y, text` |
| `resistor` | `x1, y1, x2, y2` (zig-zag between the ends) |
| `voltageSource` | `x, y, radius` (circle with + on top) |
| `ground` | `x, y` (symbol drawn below the point) |

### `scene3d/v1`

```json
{ "type": "scene3d/v1", "altText": "...",
  "camera": { "azimuthDeg": -42, "elevationDeg": 23, "scale": 1, "projection": "orthographic" },
  "objects": [ ... ] }
```

Points and vectors are `[x, y, z]`. The scene is static: Amy cannot rotate it. Every object may also have `id`, `label`, `color`, and `highlight: true`.

Camera conventions:
- **z is up.** `azimuthDeg` rotates the camera around the z axis, measured from +x toward +y; `elevationDeg` raises it above the x–y plane. The camera always looks at the origin. `azimuthDeg: -45, elevationDeg: 25` is a good default three-quarter view.
- The scene is automatically fitted to the picture. `scale` zooms relative to that fit (`1` = fit, `0.8` = smaller).
- `projection` is `"orthographic"` (default, recommended) or `"perspective"`.
- Solids hide their back faces and nearer objects draw over farther ones. Labels are always drawn on top.

| `kind` | Required fields |
| --- | --- |
| `axes` | `length`; optional `labels: ["x","y","z"]` |
| `point` | `at` |
| `line` | `from`, `to` |
| `arrow` | `from`, `to` (arrowhead at `to`) |
| `plane` | `origin`, `u`, `v` (parallelogram spanned by edge vectors u and v) |
| `box` | `center`, `size: [sx, sy, sz]` |
| `cylinder` | `from`, `to`, `radius` |
| `label` | `at`, `text` |

## 6. Derivative actions (`derivativeActions[]`)

Derivatives are pre-authored. The app shows the stored result; it does not do algebra.

```json
{ "id": "differentiate-position-x", "title": "Differentiate position with respect to time",
  "expressionLatex": "x(t) = 3t^2 + 2t", "variable": "t",
  "resultLatex": "v(t) = \\frac{dx}{dt} = 6t + 2",
  "output": { "id": "velocity_function", "name": "Velocity function", "symbol": "v(t)", "unit": "m/s" },
  "numericEvaluation": { "id": "velocity_at_four_seconds", "name": "Velocity at 4 seconds",
                         "symbol": "v(4)", "unit": "m/s", "value": 26 },
  "teaching": { "whyNow": "...", "whatToNotice": "...", "whyThisOperation": "...",
                "inputMeaning": "...", "resultUse": "..." } }
```

Applying it creates **two** variables: the symbolic `output` (display only; cannot feed a numeric input) and, if present, the numeric `numericEvaluation`. Later steps bind to either by id.

## 7. Solution path (`solutionPath[]`)

Steps run in order. Each has `id`, `kind`, `title`, `teaching`, plus the fields for its kind. `bindings` map an input name to the **id of a given or of an earlier step's output** (or a derivative's `output` / `numericEvaluation` id).

| `kind` | Also requires | `bindings` keys | `output` |
| --- | --- | --- | --- |
| `formula` | `formulaId` | one per formula input slot id | yes, with `value` |
| `basicMath` | `mathOperation` (`add`, `subtract`, `multiply`, `divide`, `power`, `sqrt`) | `left`, `right` (`sqrt`: `value`) | yes, with `value` |
| `conversion` | `conversionId` | `value` | yes, with `value` |
| `derivative` | `derivativeId` | none | none (comes from the action) |
| `finalAnswer` | none | `answer` | none; add `expectedLatex`, e.g. `"V_a = 8\\,\\mathrm{V}"` |

`subtract`, `divide` and `power` are `left − right`, `left ÷ right`, and `left ^ right`.

### Teaching fields (every step)

| Field | Required | Purpose |
| --- | --- | --- |
| `whyNow` | yes | Why this is the next dependency |
| `whatToNotice` | yes | The cue in the wording or diagram |
| `whyThisOperation` | yes | Why this formula / operation / conversion / derivative fits |
| `inputMeaning` | yes | What each input is and where it came from |
| `resultUse` | yes | What the output unlocks next |
| `commonMistakes` | no | Short list of likely errors |

### Checked on load

- Errors (the file won't open): schema violations, unknown formula/conversion/derivative ids, a formula or conversion used in the path but missing from the problem's allowed lists, bindings to ids that don't exist yet at that point in the path, missing formula input bindings, wrong expression-tree arity, duplicate ids, malformed visuals.
- Warnings (the file opens and a notice is shown): an authored `output.value` that doesn't match what the app calculates from the bindings (relative difference over 1e-6). **Check these: it usually means an arithmetic slip in the generated answer key.**

---

## 8. ChatGPT prompt

Paste this, then attach or paste the homework / formula sheet / practice exam:

> Produce one valid JSON object conforming to `guided-test-file.local/v1` (schema and field guide attached). Create complete fixed problems only; do not use random ranges, templates, code, external image URLs, or executable expressions. Include every formula (as an expression tree using only slot, number, add, subtract, multiply, divide, power, negate, abs, sqrt), every given, the target, a declarative `diagram2d/v1` or `scene3d/v1` visual using only the documented primitive kinds and fields, the allowed formula and conversion ids, and a full ordered `solutionPath`. Put any constant the learner must select (such as 2, pi, or g) in `givens` with `quantityType: "constant"` and a readable name like "Constant pi". Basic-math steps bind `left` and `right` (`sqrt` binds `value`); conversion steps bind `value`; final answers bind `answer`. Every numeric step output must include the correctly calculated `value`. Every solution step must explain `whyNow`, `whatToNotice`, `whyThisOperation`, `inputMeaning`, and `resultUse` in clear teaching language. Output only the JSON.

Save the reply as a `.json` file and open it in the app. If it reports errors, paste them back to ChatGPT and ask it to fix exactly those paths.

---

## 9. v2: visual rapid checks

A v2 file has `"apiVersion": "guided-test-file.local/v2"` and may contain `problems`, `quickCheckSets`, or both; at least one must be non-empty. `formulaSheet` and `conversions` are optional in v2, so a rapid-check-only file can leave them out. The complete working example is [handoff/v0.3/placeholder-visual-checks.test.example.json](handoff/v0.3/placeholder-visual-checks.test.example.json).

### 9.1 Quick-check sets (`quickCheckSets[]`)

| Field | Required | Notes |
| --- | --- | --- |
| `id`, `title` | yes | |
| `instructions` | yes | Shown before the first card (may be `""`) |
| `feedbackMode` | yes | `"immediate"` (answer and explanation after each card) or `"end"` (everything in the summary) |
| `presentationMode` | yes | `"standard"` or `"rapidVisual"` (picture cards; every item needs a `visual`; per-card timers allowed) |
| `items` | yes | Shown in exactly this order; the app never shuffles cards or options |

### 9.2 Item types (`items[]`, chosen by `type`)

Every item has an `id` (unique within its set). In `rapidVisual` sets, any item may add `displaySeconds` (up to 600): a visible countdown, after which the card counts as unanswered and Amy can show the answer or move on.

**Visual identification: `singleChoice`**

```json
{ "id": "identify-structure", "type": "singleChoice", "prompt": "Which structure is shown?",
  "visual": { ... }, "options": [ { "id": "bcc", "text": "BCC" }, { "id": "fcc", "text": "FCC" }, { "id": "hcp", "text": "HCP" } ],
  "correctOptionId": "bcc", "explanation": "Atoms at the eight corners plus one at the body centre." }
```

At least 2 options with unique ids (2+ characters each), exactly one `correctOptionId`, and an `explanation`. For a comparison, use a `pair` visual (§9.3) and options like "Panel A" / "Panel B". To connect a picture to a rule, follow the identification card with another `singleChoice` about the related fact or formula; its `visual` is optional in a standard set.

**Visual true/false: `trueFalse`**

```json
{ "id": "tf-body-centre", "type": "trueFalse", "visual": { ... },
  "statement": "The highlighted atom is at a face centre.", "answer": false,
  "explanation": "It is at the body centre: inside the cell, equally far from all eight corners." }
```

`explanation` is required. Write it as the correction Amy should read when the claim is false.

**Diagram-label matching: `matching`**

```json
{ "id": "label-bragg", "type": "matching", "prompt": "Name each marked part.",
  "visual": { "kind": "image", ..., "callouts": [ { "id": "A", "xPct": 42, "yPct": 25 }, { "id": "B", "xPct": 70, "yPct": 60 } ] },
  "prompts": [ { "id": "A", "text": "Name callout A" }, { "id": "B", "text": "Name callout B" } ],
  "options": [ "incident beam", "diffracted beam", "plane spacing d", "Bragg angle θ", "unit-cell edge" ],
  "answers": { "A": "incident beam", "B": "Bragg angle θ" },
  "explanation": "Optional note shown with the answers." }
```

Rules (the app rejects the file otherwise):
- The `visual` is one `typedScene` or `image` (not a `pair`), with at least 2 `callouts`.
- There is exactly one prompt per callout, using the same ids.
- `options` is the label bank: unique terms, at least as many as there are callouts. Extra terms are decoys.
- `answers` gives every callout a term from the bank. A term may be correct for two or more callouts (for example two rectangles) only if the item sets `"allowReuse": true`.

Amy sees a puzzle-piece socket under each prompt and a bank of label pieces. She drags a piece into each socket (mouse, pen or touch), or taps or presses Enter on a piece and then on a socket. Each piece has one knob that fits the socket's notch.

- Without `allowReuse`: a placed piece leaves the bank, so each label is used at most once.
- With `"allowReuse": true`: every piece stays in the bank and can fill several sockets. The bank doesn't show how many times a label is needed.

```json
{ "id": "label-shapes", "type": "matching", "allowReuse": true,
  "visual": { ..., "callouts": [ {"id":"A",...}, {"id":"B",...}, {"id":"C",...} ] },
  "prompts": [ {"id":"A","text":"Shape A"}, {"id":"B","text":"Shape B"}, {"id":"C","text":"Shape C"} ],
  "options": [ "rectangle", "circle", "square" ],
  "answers": { "A": "rectangle", "B": "circle", "C": "rectangle" } }
```

**Deliberate recall: `recall`** (paper first, never graded)

```json
{ "id": "sketch-bcc", "type": "recall", "responseMode": "sketch",
  "prompt": "On paper, sketch a BCC unit cell.",
  "referenceVisual": { ... }, "keyPoints": [ "8 corner atoms", "1 body-centre atom" ] }
```

`responseMode` is `"written"` or `"sketch"`, and the item needs a `modelAnswer`, `keyPoints`, or both. The optional `visual` is shown with the prompt; `referenceVisual` is shown only when Amy reveals the reference. She then marks **Got It** or **Review**. Keep these few; use them only where producing the answer from memory is the point.

### 9.3 Visuals for quick-check items (`visual`, chosen by `kind`)

| `kind` | Fields | Use |
| --- | --- | --- |
| `typedScene` | `scene`: any `latex/v1`, `diagram2d/v1` or `scene3d/v1` visual from §5 (with its own `altText`); optional `caption`, `callouts` | Diagrams described as data |
| `image` | `mediaType` (`"image/png"` or `"image/jpeg"`), `data` (raw base64), `altText`, `width`, `height` (pixels); optional `caption`, `callouts` | Real pictures |
| `pair` | `panels`: exactly two `typedScene`/`image` visuals, each with an optional `caption` ("A", "B"); optional `altText` | Side-by-side comparison |

**Callouts** are `{ "id": "A", "xPct": 42, "yPct": 25 }`: a visible marker at 42% across and 25% down the picture (0–100 each). Marker ids are 1–3 characters and must be unique within the visual.

**Embedded pictures:**
- Only PNG and JPEG, stored inside the file as base64 `data`. There are no links, file paths, `data:` prefixes, or SVG images; the app rejects them.
- ChatGPT can't make real picture data. Create the picture elsewhere, then run this command and paste its output as the `visual` (fill in `altText`):

  ```bash
  npm run embed-image -- path/to/picture.png "Alt text describing the picture"
  ```

- Size limits: 1.5 MB per picture (warning above 400 KB), 20 MB per file. Crop and compress; a few hundred pixels across is usually enough.
- `width`/`height` must have the same shape as the real picture, because callouts are placed against them (the embed command fills them in).

**New scene features (v2):**
- `sphere` in `scene3d/v1`: `{ "kind": "sphere", "center": [x, y, z], "radius": r }`, for atoms and particles.
- `"wireframe": true` on a `box` draws only its 12 edges, so atoms inside a unit cell stay visible.
- `"highlight": true` on any 2D primitive or 3D object draws it in the highlight colour. Use it for "what is the highlighted feature?" cards.

### 9.4 Trig in formulas (v2)

Expression trees may use `sin`, `cos`, `tan`, `asin`, `acos`, `atan`. Each takes exactly one argument and **must** declare `angleUnit`:

```json
{ "op": "sin", "angleUnit": "deg", "args": [ { "op": "slot", "slot": "angle" } ] }
```

For `sin`/`cos`/`tan`, `angleUnit` is the unit of the input angle. For `asin`/`acos`/`atan`, it is the unit of the returned angle. `asin`/`acos` of a value outside −1…1, or `tan` at 90°, is reported as a calculation error.

### 9.5 Author checklist (v2)

- [ ] `apiVersion` is `guided-test-file.local/v2`, and there is at least one problem or quick-check set.
- [ ] A visual item is used where recognition is the skill; recall items are kept to a few.
- [ ] Matching items have clear callouts, more terms than markers and plausible decoys. Each correct term is used once, unless the item sets `allowReuse` because a label genuinely fits several markers.
- [ ] Every picture is PNG/JPEG via `npm run embed-image`, with alt text that describes it for someone who can't see it.
- [ ] Every trig op declares `angleUnit`.
- [ ] Every item Amy can miss has an `explanation` (or `keyPoints` for recall) that teaches the correction.
- [ ] `displaySeconds` is only in `rapidVisual` sets, and only where speed matters.
- [ ] Load the file in the app; fix any listed paths; read any answer-key warnings.

### 9.6 ChatGPT prompt (v2 rapid checks)

> Produce one valid JSON object conforming to `guided-test-file.local/v2` (schema and field guide attached). Create `quickCheckSets` only (no `problems` unless I ask), using item types `singleChoice`, `trueFalse`, `matching` and `recall` exactly as documented. Describe every picture as a `typedScene` using only the documented `diagram2d/v1` or `scene3d/v1` primitives (including `sphere`, `wireframe` boxes and `highlight`). Where I have given you a real image block, reuse it exactly. Never invent image data, URLs or file paths. Every option id and item id is at least 2 characters. Matching items: one prompt per callout, a term bank at least as large as the number of callouts with plausible decoys, and each correct term used once. If a term genuinely fits several callouts, set `"allowReuse": true` on that item. Every closed-answer item has an `explanation` that teaches the correction; every recall item has `keyPoints`. Declare `angleUnit` on any trig. Output only the JSON.
