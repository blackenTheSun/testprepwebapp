# Guided Test Prep Web App Engineer Handoff

## Product decision

Build a private, profile-driven web application that helps a learner practice the decision path of technical test problems. The initial user is Amy, beginning with UND ENGR 206 Circuits I. The engine must remain generic enough to load future math, physics, and engineering test profiles without a rewrite.

This is not a conventional answer checker or generic chat tutor. It is a guided problem-construction environment:

1. The learner sees a realistic problem, formula sheet, and rendered diagram.
2. She identifies the method and the next useful operation.
3. She adds a structured step, chooses a formula or domain operation, and binds inputs from givens, prior results, or labeled diagram features.
4. The app performs the arithmetic or supported symbolic operation, then records whether the strategic step is valid and useful.
5. When she asks for help, the coach explains why that step comes next in the dependency chain rather than simply giving an answer.

The app should reward recognition first: method, unknowns, equation, inputs, intermediate result, and final target. Arithmetic is intentionally automated when it is not the learning objective.

The first production profile covers ENGR 206 material Amy has used: resistor reduction, voltage and current division, KCL and node voltage, KVL and mesh current, supermesh constraints, source power, total dissipated power, Thevenin equivalents, and maximum-power-transfer interpretation.

## Hard constraints

- All math content is stored as text and LaTex. Runtime rendering must not depend on equation screenshots.
- Diagrams are generated from structured text data. Circuit diagrams render as SVG from a circuit graph. Other diagrams use a typed 2D graph or declarative 3D scene specification.
- A source PDF or image may be retained for authoring traceability, but it is not the runtime problem definition.
- Test content is data, not executable code. A profile may never contain arbitrary JavaScript, Python, or arbitrary expression evaluation.
- The server recomputes every learner step. Client-side math exists only for presentation and is never trusted for grading.
- A profile must be versioned, linted, and validated before it can start a live session.
- The solution explanation is structured alongside the solution path. AI may phrase it naturally, but may not invent a path absent from the profile.
- The launch product is a small private app for Brent as content operator and Amy as learner. It is not a public course platform, LMS, homework marketplace, or proctoring product.

## Learner experience

### Modes

| Mode | Formula sheet | Intermediate result | Hints and coach | Score feedback |
| --- | --- | --- | --- | --- |
| Learn | Visible | Visible after each valid step | Available, Socratic by default | Immediate |
| Practice | Visible | Visible after each submitted step | Limited or learner requested | End of problem plus selected feedback |
| Exam simulation | Profile controlled | Visible only if allowed | Disabled | After submission |

Exam simulation may still automate arithmetic when the practice goal is procedure recognition rather than hand calculation. The profile, not a global switch, controls that behavior.

### Core problem screen

The screen has five stable regions:

1. Problem panel: title, prompt, givens, target, units, and generated visual.
2. Formula sheet: searchable categories of allowed formulas and domain operations, rendered in LaTex with human-readable input labels.
3. Work graph: ordered learner steps, their inputs, computed outputs, and status. It is a readable dependency chain, not a blank free-form scratchpad.
4. Add Step drawer: a guided action builder.
5. Coach panel: contextual questions and explanations.

The normal action flow is:

1. Select Add Step.
2. Select an action type: Choose method, Apply formula, Inspect diagram, Differentiate, Build equation, Solve system, Convert units, or State final answer.
3. Select the formula or operation from the permitted list.
4. Bind each input to a given, a prior output, a selected diagram element, or a permitted symbolic expression.
5. Give the output a meaningful label when appropriate.
6. Submit. The server validates the step, calculates the result, and explains its status.

The UI must expose the inputs before calculation. The learner cannot press an opaque solve button and skip the selection of formula and operands.

### Circuit-specific interactions

For circuit problems, the visual is a labeled circuit graph. The learner can click a node, component, branch, loop, or mesh. The interaction supplies structured identifiers to the operation rather than image pixels.

- For KCL, select a node and a sign convention. The engine gathers connected branches from topology. The learner still chooses the correct branch-current representations or formula substitutions.
- For KVL or mesh, select an approved loop or mesh. The engine identifies included branches and helps build the equation, including shared-resistor and current-source constraints.
- For power, select the component and voltage/current references. The engine applies the chosen passive-sign-convention formula and flags a sign mismatch clearly.
- For series and parallel reduction, select the components being reduced. The engine validates that the chosen topology really is reducible in the intended way.

The profile must allow more than one valid sign convention and more than one equation ordering. It must not mark a mathematically equivalent KCL or KVL equation wrong merely because terms are ordered differently.

### Derivatives and symbolic operations

Derivative support is a first-class operation, not a handwritten side note. A learner selects the stored expression, selects the differentiation variable, and applies a visible operation such as d/dx. The engine returns a canonical symbolic expression and, when applicable, a numerical evaluation at the stated point.

For version one:

- Profiles include pre-authored derivative targets and explanations.
- The engine supports a conservative, tested set of algebraic derivative rules and validates equality by normalized symbolic form.
- The learner may select a profile-approved expression or prior symbolic output; unrestricted CAS input is not required.
- Each derivative solution node includes a rationale for why differentiation is necessary now. Example: The target is the instantaneous slope here, so differentiate the position expression before evaluating the stated time.

This keeps the app reliable while remaining extensible to calculus, dynamics, and fields profiles.

## Coaching and solution explanation

The coach is part of the same structured solver state. Every solution node includes:

- why now: causal explanation tied to the target and prerequisite outputs;
- what to notice: the visual or wording cue the learner should recognize;
- why this operation: why the selected formula or derivative matches the problem;
- inputs meaning: what each input represents and where it comes from;
- common mistakes: bounded, profile-specific mistakes;
- next dependency: what the output unlocks, without exposing a full answer in hint mode.

The coach supports three explicit modes:

| Coach mode | Behavior |
| --- | --- |
| Nudge | Ask a short recognition question; do not name the answer or formula unless the learner asks again. |
| Explain my step | Explain whether the latest step is useful, incomplete, valid but out of order, or invalid, and why. |
| Walk me through it | Reveal the approved solution graph one node at a time, with calculation substitutions and rationale. |

The coach receives the active problem instance, profile version, allowed operations, learner work graph, and current solution frontier. It must cite the actual selected formula or diagram feature in its explanation. It must not pretend an unverified alternate path is correct.

After a completed problem, the app shows a review containing:

- The learner work graph beside an approved path.
- Actual substitutions, calculated values, units, and final result.
- A concise explanation for every strategic branch.
- A classification of mistakes: method recognition, formula choice, input binding, dependency order, sign or unit issue, or final-answer formatting.

This preserves the prior exam-prep standard: the answer key has enough actual work to locate an error, rather than only a final number.

## Architecture

The engineer may propose an equivalent stack, but the implementation must be browser-first, TypeScript end to end, and have a PostgreSQL-backed persistence layer.

| Layer | Recommended implementation | Required property |
| --- | --- | --- |
| Web app | Next.js or React with TypeScript | Responsive desktop-first UI and keyboard support |
| API | TypeScript service or route handlers | Server-authoritative session and calculation validation |
| Data | PostgreSQL with migrations | Profile versions, sessions, attempts, users, audit history |
| Auth | Managed email magic-link or password auth | Brent admin and Amy learner roles |
| Math rendering | KaTeX or MathJax | LaTex rendered safely without raw HTML injection |
| Safe calculations | Typed expression AST plus a tested math library | No eval; server recomputes |
| 2D diagrams | SVG renderer | Circuit graph and labeled graph or geometry adapters |
| 3D diagrams | Declarative Three.js scene adapter | Structured scene data, camera presets, labels, alt text |
| AI coach | Provider adapter behind a server API | Context-limited, profile-grounded, logged prompts and responses |
| Hosting | Managed web host plus managed PostgreSQL | Production, staging, backups, and environment separation |

The implementation has five separable subsystems:

1. Profile registry: imports, validates, versions, and activates content packages.
2. Problem generator: chooses a template and seed, resolves parameters, renders visuals, and creates an immutable problem instance.
3. Guided solver: accepts structured learner steps, evaluates safely, matches them to the solution DAG, and returns status plus feedback.
4. Presentation adapters: render math, circuits, graphs, and 3D scenes from typed data.
5. Coach and authoring services: generate drafts and contextual explanations behind human review.

## Profile file API

### Design

The public content file API is a JSON package called a TestProfile. The initial format identifier is guided-test-profile/v1. A profile contains formulas, operation adapters, visual requirements, problem templates, solution graphs, explanations, and assessment policy. It can be a single JSON file in version one; later it may be bundled with source references and reusable assets in a ZIP package.

Every polymorphic object has a stable type discriminator and adapter version. Unknown types cause a validation error rather than silent degradation.

The schema file delivered with this handoff is the implementation contract: test-profile.v1.schema.json. The sample ENGR 206 profile demonstrates the intended content: engr206-circuits.profile.example.json.

### Key content entities

| Entity | Purpose |
| --- | --- |
| TestProfile | Versioned test-prep package for one subject and assessment strategy |
| FormulaDefinition | Formula card, typed inputs and outputs, safe evaluator, units, and teaching copy |
| OperationDefinition | Generic action such as choose method, formula, derivative, KCL, KVL, solve system, or final answer |
| ProblemTemplate | Parameterized prompt, givens, visual spec, target, permitted operations, and seed constraints |
| ProblemInstance | Immutable realized problem created from a template and seed |
| SolutionGraph | Directed acyclic graph of required or accepted strategic steps, including alternatives |
| SolutionNode | Expected action pattern, computed-result constraint, explanation, mistakes, and dependencies |
| VisualSpec | Polymorphic circuit, graph, 3D scene, or LaTex-only visual |
| LearnerStep | Learner operation selection, input bindings, server result, and solver status |

### Formula definition requirements

Each formula records its rendered statement, named input slots, output slots, dimensions or unit expectations, safe evaluator, and pedagogical context. A formula card includes its LaTex, a short recognition cue, the intended calculation, and common mistakes.

All formula expressions are parsed to an approved abstract syntax tree during profile import. The engine does not execute profile-provided code.

### Visual contract

The runtime accepts a VisualSpec union:

- latex/v1: equations, labeled expressions, and annotations only;
- circuit/v1: nodes, terminals, components, labels, values, polarity, current arrows, meshes, and highlighted subsets;
- graph2d/v1: axes, curves, points, vectors, regions, labels, and coordinate transforms;
- scene3d/v1: declarative objects, coordinate frames, vectors, camera, orthographic or perspective view, labels, and interaction targets.

3D is data-driven. An author describes a small scene; the renderer draws it. Version one does not include a WYSIWYG 3D modeler, arbitrary CAD import, computer-vision diagram inference, animated simulation, or handwritten-sketch grading.

Each visual includes accessible alt text and stable selection targets. Each target has an ID that can be used in a learner step and solution node.

### Solution graph rules

A solution graph is an explainable DAG, not an opaque final answer. Each node declares:

- required predecessor node IDs, if any;
- an expected action pattern with operation type, formula or operation ID, and accepted input-source bindings;
- a result constraint: exact value, tolerance, normalized symbolic equivalence, equation equivalence, or accepted set;
- alternate accepted nodes or paths where realistic;
- structured teaching explanation and common mistakes.

The solver must classify a submitted step as:

- accepted progress;
- accepted alternative;
- valid but unneeded;
- valid but out of order;
- invalid operation;
- invalid binding;
- invalid units or dimension;
- incorrect result;
- ambiguous and requires review.

The app must never say only wrong when it can distinguish a strategic error from a correct but unnecessary intermediate calculation.

## Runtime HTTP API

The engineer should expose a documented REST or RPC API. Endpoint names may vary, but these behaviors are required.

| Capability | Required request | Required response |
| --- | --- | --- |
| Validate profile | Profile JSON or package ID | Errors and warnings with JSON paths, required adapters, and lint report |
| Import profile draft | Validated profile plus metadata | Immutable profile version in draft status |
| Publish profile | Admin selection of a reviewed version | Active profile version |
| Start a session | Profile ID, mode, optional template and seed | Session ID, immutable instance, formula sheet, policy |
| Read session | Session ID | Instance, learner steps, current frontier, mode and status |
| Submit learner step | Structured operation and input bindings | Server result, status, computed output, feedback |
| Request coach response | Session ID, message, coach mode | Profile-grounded response plus referenced nodes |
| Complete or review | Session ID | Score breakdown, approved path, explanation package |
| Generate content draft | Source references and author prompt | Unpublished, linted profile draft only |

Server-side validation must make calculation and grading deterministic enough that the same profile version, seed, and learner step produce the same result.

## Authoring workflow

The content operator workflow is intentionally staged:

1. Brent provides homework, formula-sheet, practice-exam, or source notes as reference material.
2. An AI-assisted authoring command or external ChatGPT prompt creates a candidate TestProfile JSON package.
3. The profile validator checks schema, types, units, cycles, missing formulas, unresolved labels, unsafe expressions, explanation coverage, and generated seed coverage.
4. The author reviews a rendered sample problem and its full solution graph.
5. Only then can the profile be published for Amy.

The main launch path must accept an externally produced profile file. That lets Brent use ChatGPT to generate new problems immediately without waiting for an in-app content-editor project. An optional in-app AI draft generator can follow after the core learner flow works.

Required review safeguards:

- AI-generated content is always draft and is never auto-published.
- A reviewer can override text, formula cards, solution nodes, diagram labels, parameter ranges, and explanations.
- The authoring UI shows a seed preview set, not one generated problem.
- A test harness runs the declared solution graph over at least 50 legal seeds for every parameterized template.
- Profiles retain source IDs plus an author and reviewer audit history.

## Data, privacy, and quality requirements

- Use role-based access: Brent as content admin and Amy as learner. More learner roles are out of scope for launch.
- Keep source study materials private. Do not expose them through public URLs.
- Do not send source files or full private profile data to an AI provider unless the admin expressly invokes content generation or coaching. The coach receives the minimum active-problem context needed.
- Store prompt and response traces for coach-quality review, and let an admin delete them.
- Encrypt secrets, use environment-specific configuration, run database migrations, and maintain automated backups.
- Include basic accessibility: keyboard navigation, focus order, contrast, semantic labels for cards and buttons, accessible math fallback, and alt text for generated visuals.
- Include unit and dimension checking wherever formula quantities have known dimensions.
- Include test coverage for the math evaluator, profile parser, solution matching, circuit-topology selection, API authorization, and core learner flow.

## Scope for first build

### Included

1. Private authentication and Brent or Amy roles.
2. Profile import, validation, versioning, and draft or publish status.
3. Test-session launch from a profile, deterministic problem seed, practice modes, attempt history, and review screen.
4. LaTex prompt and formula rendering.
5. Guided Add Step workflow and server-authoritative computation.
6. Formula application, method selection, input binding, unit conversion, final answer, and derivative operations.
7. Circuit visual adapter with topology-aware selections and KCL, KVL, series, parallel, and power operations.
8. Basic declarative 3D scene adapter: camera, primitives, vectors, labels, selectable objects, and alt text.
9. Solution DAG, alternative-path handling, error categorization, and post-problem explanation.
10. Contextual coach with Nudge, Explain my step, and Walk me through it modes.
11. A reviewed ENGR 206 starter profile with at least ten parameterized problem families and a small derivative proof profile.
12. Automated tests, deployment, environment documentation, administrator guide, and a two-week bug-fix period.

### Excluded from version one

- LMS or Canvas integration, class rosters, grading export, or instructor accounts.
- Public sharing, payment, subscriptions, course marketplace, or multi-tenant school operation.
- A visual WYSIWYG profile editor.
- OCR-to-correct-problem automation or generalized interpretation of arbitrary scanned diagrams.
- Handwritten-solution recognition, free-form algebra proof grading, or unrestricted computer algebra.
- Animation or simulation engines, arbitrary 3D modeling, CAD import, or physics simulation.
- Native iOS or Android apps. The web app should be responsive.
- Any guarantee that AI-generated content is correct without profile validation and human review.

## Acceptance criteria

The build is accepted only when the following can be demonstrated in staging using the supplied ENGR 206 profile and fixtures.

1. The validator rejects an invalid formula reference, missing visual target, unsafe expression, cyclic solution graph, unsupported adapter, and incomplete explanation package with actionable errors.
2. A valid profile imports as a draft, previews successfully, and becomes active only after an admin publish action.
3. Starting the same profile, template, and seed twice produces the same givens, diagram, formula sheet, and accepted answer.
4. Amy can complete a node-voltage problem by selecting a node, adding a KCL operation, binding formula inputs, receiving the calculated intermediate, and finishing the target result.
5. Amy can complete a mesh or supermesh problem with a valid alternate sign convention and receive accepted-alternative feedback rather than a false failure.
6. Amy can select a stored expression, apply d/dx, receive the canonical derivative and numerical evaluation, and read the node-level rationale.
7. A 3D scene profile renders a labeled coordinate frame plus vectors, supports the declared selectable targets, and has usable alt text. This is a basic renderer demonstration, not a CAD tool.
8. A coach reply in Nudge mode references the active problem and does not reveal the solution node. A Walk me through it reply reveals one approved solution node at a time with the author-provided why-now explanation.
9. The review screen shows actual substitutions, outputs, units, final answer, and mistake categories for the full attempt.
10. The test suite and 50-seed profile harness pass in a clean environment. A deployment guide lets Brent run staging and production without the original engineer.

## Recommended work plan and commercial structure

Treat this document as the technical Statement of Work exhibit. A lawyer should add or review the master services agreement, independent-contractor classification, IP assignment, confidentiality, tax, liability, payment, and jurisdiction terms before either party signs.

| Milestone | Deliverable and acceptance gate | Target duration | Payment share |
| --- | --- | --- | --- |
| 0. Blueprint and vertical slice | Approved schema, validator, one rendered circuit problem, one guided formula step, written architecture | 1 to 2 weeks | 15% |
| 1. Guided solver core | Auth, profiles, deterministic sessions, formula and derivative operations, solver graph, learner work graph, five ENGR 206 families | 3 to 4 weeks | 35% |
| 2. Visuals and coaching | Circuit topology actions, basic 3D scene adapter, coach modes, review screen, ten ENGR 206 families, author-review workflow | 3 to 4 weeks | 30% |
| 3. Quality and handoff | Automated tests, seed harness, staging and production deployment, docs, source handoff, two-week bug-fix window | 2 weeks | 20% |

Expected senior-engineering effort is roughly 250 to 340 hours. A reasonable fixed-price range is about $30,000 to $50,000 at typical senior freelance rates, plus separately metered hosting and AI usage. If a lower-cost proof of concept is preferred, cap the first contract at Milestone 0 plus a 2D-circuit-only core; defer the 3D adapter, in-app AI draft generator, and richer author-review UI.

Recommended payment language:

- Pay each milestone only after its acceptance gate is demonstrated in the shared staging environment.
- Require a written change order before work outside scope begins.
- Client owns custom source code, profile schema, profiles, deployment configuration, and documentation upon full payment. Contractor must disclose third-party dependencies and licenses.
- Contractor supplies source in a client-owned private Git repository from day one, with readable commits, setup instructions, database migrations, and no undisclosed proprietary dependency needed to operate the app.
- Contractor provides a short handoff session and fixes reproducible in-scope defects reported within 14 calendar days after final acceptance.
- New features, content-authoring labor, new subject adapters, and ongoing support are outside the fixed scope unless separately approved.

## Candidate screen

Ask each candidate to respond concretely to these questions:

1. How would you represent a parameterized circuit problem as typed data and avoid arbitrary code execution?
2. How would you recognize mathematically equivalent KCL equations with different sign conventions?
3. How would you support an alternate valid solution path without trying to prove arbitrary algebra?
4. Show a small TypeScript interface for an extensible operation adapter and visual adapter.
5. How would you test 50 randomized seeds before publishing a profile?
6. How would you keep AI coaching grounded in the active solution graph and prevent premature answer leakage?
7. What parts of this scope would you stage or defer to protect a fixed bid?

Choose an engineer who speaks clearly about typed data, deterministic validation, test coverage, and content tooling. A beautiful UI without a safe and explainable solution model is the wrong foundation for this product.
