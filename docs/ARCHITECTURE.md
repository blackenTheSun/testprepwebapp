# Architecture

## Shape of the product

```mermaid
flowchart LR
    F[test JSON file] -->|FileReader| L[TestFileLoader]
    L --> V[TestFileValidator]
    V -->|errors| E[Invalid-file screen]
    V -->|ok + warnings| T[TestFile / Problem]
    T --> S[Session]
    S --> A[Attempt per problem]
    A --> UI[React UI]
    T --> R[VisualRegistry]
    R --> UI
```

Everything runs in the page. `npm run build` inlines the app, CSS and KaTeX fonts into one `dist/index.html`. A build-only Content-Security-Policy (`connect-src 'none'`, no `unsafe-eval`) guarantees the delivered page makes no network requests and never evaluates code.

## Source layout

```
src/
  contract/     the file contract
    test-file.local.v1.schema.json   compiled into generated/schemaValidator.js at build time
    types.ts                          TS mirror of the schema
    validate.ts                       SchemaCheck + ValidationRule subclasses → ValidationReport
    loader.ts                         FileReader → JSON.parse → validate → TestFile
  engine/       no React; unit-tested in Node
    expression.ts   ExpressionNode class hierarchy (the only calculation mechanism)
    operations.ts   Operation subclasses + MathOperator strategies + AutoNamer
    variables.ts    Variable (stable id, renamable name/symbol) + VariableStore
    testFile.ts     TestFile, Problem, OperationCatalog (the Add Step menu)
    attempt.ts      Attempt: timer, variables, steps, final answer, reveal state
    timer.ts        StudyTimer state machine
    session.ts      Session: one loaded test, attempts per problem, active problem
    authoredPath.ts AuthoredStep subclasses; AuthoredPath replays the answer key
    review.ts       ReviewMatcher (✓ "you reached this")
    attemptExport.ts AttemptExporter (Download Attempt JSON)
    format.ts       number/unit/LaTeX display helpers
    observable.ts   change notification for React
  render/       visual adapters
    visuals.tsx     VisualAdapter subclasses + VisualRegistry
    diagram2d.tsx   Primitive2D subclass per primitive kind
    scene3d.tsx     Camera, Object3D subclass per object kind, SceneProjector
    Latex.tsx       KaTeX wrapper; SvgLabel.tsx for diagram text
  ui/           React function components that delegate to the classes above
  examples/     bundles the two reference fixtures from docs/handoff
```

## Class hierarchies

Every variable part of the system is a small class hierarchy with a registry keyed by the test file's discriminator, so adding a kind means adding a subclass and one registry entry:

| Base | Subclasses | Registry key |
| --- | --- | --- |
| `ExpressionNode` | `SlotNode`, `NumberNode`, `OperatorNode` → `Add/Subtract/Multiply/Divide/Power/Negate/Abs/SqrtNode` | `op` |
| `Operation` | `FormulaOperation`, `BasicMathOperation`, `ConversionOperation`, `DerivativeOperation`, `FinalAnswerOperation` | action group |
| `MathOperator` | `Add/Subtract` (same-unit), `Multiply`, `Divide`, `Power`, `Sqrt` | `mathOperation` |
| `AuthoredStep` | `AuthoredFormula/BasicMath/Conversion/Derivative/FinalAnswerStep` | solution step `kind` |
| `ValidationRule` | `UniqueIdRule`, `FormulaExpressionRule`, `ReferenceRule`, `BindingRule`, `GivenValueRule`, `AuthoredValueRule` | (ordered list) |
| `VisualAdapter` | `LatexVisualAdapter`, `Diagram2DAdapter`, `Scene3DAdapter` | visual `type` |
| `Primitive2D` | one per `diagram2d/v1` kind (10) | primitive `kind` |
| `Object3D` | `Axes`, `Point`, `Segment` (line/arrow), `Plane`, `SolidObject` → `Box`/`Cylinder`, `Label` | object `kind` |

The same `Operation` classes serve Amy's steps and the authored answer key: `AuthoredStep.createOperation()` returns the operation Amy would use, and `AuthoredPath` runs it. The answer-key check and the review therefore use exactly the code paths the learner uses.

## Data flow of one step

1. `AddStep` (UI) lists `problem.catalog().groups()` → operations → `operation.inputs()`.
2. Each input dropdown lists `attempt.choicesFor(slot.acceptsSymbolic)`, grouped as Givens / Constants / My results.
3. **Calculate** calls `attempt.addStep(operation, bindings, name)`:
   - resolves variable ids and rejects symbolic values for numeric inputs
   - `operation.execute(bound, name)` returns output variable data (or throws `EvaluationError`)
   - stores outputs in `VariableStore` with new `var_####` ids tied to the step
   - records `operation.unitHints(bound)`
   - advances the `AutoNamer` counter
4. `Attempt` notifies, and every subscribed component re-renders (`useObservable`).

## Validation pipeline

`TestFileValidator.validate(data)` runs in three stages:

1. `SchemaCheck`: the build-time-compiled Ajv validator, with errors simplified to one readable message per JSON path.
2. Semantic rules, only if the schema passed.
3. `AuthoredValueRule`, only if there are no errors. It replays every solution step and raises a **warning** when a stored `output.value` disagrees with the recomputed value.

Errors block opening the file. Warnings open it and show a notice.

## Tests

- `tests/unit`: Vitest in Node covering expressions, operations, attempts/timer/session, validator rules, loader, answer-key replay, review matching, export, renderers, and schema-copy identity.
- `tests/e2e`: Playwright against `file://…/dist/index.html` with `offline: true`, one test per SOW acceptance criterion. CI runs them in Chromium, Firefox and WebKit.
