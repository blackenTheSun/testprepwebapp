# Test File Guide (`guided-test-file.local/v1`)

This guide explains how to write a test file the app can open. The formal contract is [handoff/test-file.local.v1.schema.json](handoff/test-file.local.v1.schema.json). Two complete examples are [handoff/engr206-local.test.example.json](handoff/engr206-local.test.example.json) and [handoff/mechanics-of-materials.local.test.example.json](handoff/mechanics-of-materials.local.test.example.json).

A test file is one JSON object with complete, fixed problems. It contains no random ranges, templates, code, image URLs, or free-form expressions.

---

## 1. Top level

| Field | Required | Notes |
| --- | --- | --- |
| `apiVersion` | yes | Always `"guided-test-file.local/v1"` |
| `id` | yes | Starts with a letter; letters, digits, `.` `_` `-` |
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

Coordinates are in `viewBox` units; y increases downward. Every primitive may also have `label` (plain text) and `color` (CSS color, e.g. `"#c0392b"`).

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

Points and vectors are `[x, y, z]`. The scene is static: Amy cannot rotate it. Every object may also have `label`, `color`, and `highlight: true`.

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
