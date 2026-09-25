<!-- Plain-text extraction of Guided_Test_Prep_Rapid_Knowledge_Checks_Update_SOW_v0.3.docx for diffing and search. The .docx is authoritative; tables are flattened to one cell per line. -->

Visual Rapid Knowledge Checks Delta Statement of Work

Changes to Guided Test Prep Local Offline Version 0 2

This delta adds visual rapid checks for Amy's next exam without changing the existing v0.2 worked-problem experience. Visual recognition is the primary new path: identify diagrams, label callouts, and connect a picture to the associated fact or formula. Written and sketch self-checks remain only for a small number of deliberate recall prompts.

1 Purpose and Precedence

The local app must quickly show whether Amy recognizes the visual vocabulary behind a calculation before she commits time to a worked problem. This document is an additive delta to v0.2. It governs only the visual rapid-check capability; every v0.2 requirement, acceptance criterion, workflow, and exclusion not explicitly changed here remains in force.

Within this delta, visual identification, visual true-or-false, and diagram-label matching are the principal quick-check activities. The earlier generic written/sketch self-check treatment is narrowed to paper-first recall practice.

2 Delta at a Glance

Area

Added or Changed Requirement

Visual test data

Add optional quickCheckSets in a v2 local test-file contract, including safe authored visuals. Existing v1 files and worked problems remain valid without modification.

Visual recognition

Add visual single-choice, visual true-or-false, visual comparison, and diagram-label matching. A picture may ask what it is, what a highlighted feature means, or what rule applies.

Diagram labels

Use a visible callout marker for each prompt and a term bank larger than the marker count. The bank may include authored decoys; each selected label is one-to-one.

Rapid visual sets

Add a rapidVisual presentation mode for authored picture cards in fixed order. Authors may set a per-card time limit to test immediate recognition.

Deliberate recall

Keep written or sketch self-checks for a small number of draw-from-memory or explain-in-words prompts. They use an authored key and Got It or Review, never automatic grading.

Safe math and visuals

Extend safe authored calculations with trig and inverse trig plus explicit degree or radian handling. Support typed scenes and embedded local raster pictures with no remote assets.

3 Visual Test File Contract Delta

The app must accept guided-test-file.local v2. A v2 test may contain worked problems, rapid checks, or both; at least one activity must be present. The existing problem schema and worked-problem behavior are unchanged. A v1 file remains read-only compatible.

Each quickCheckSet must include an id, title, instructions, feedbackMode, ordered items, and presentationMode. presentationMode is standard or rapidVisual. rapidVisual sets contain visual items in authored order and may specify displaySeconds per item. When a per-card timer expires, the app records an unanswered result and advances to the next card.

A visual is either a safe typed scene or an embedded local raster image. Typed scenes use the existing controlled primitives, including the generic sphere. Embedded pictures are inline PNG or JPEG data with authored alt text. No remote URL, local path reference, raw HTML, scriptable SVG, external asset, or executable content is allowed.

Visual Pattern

Required Authored Data

Response and Result

Visual identification

A visual plus at least two option ids and exactly one correct answer. A visual may be a crop, a pair of panels, or a highlighted feature.

Amy selects what the diagram, structure, or highlighted feature is. The app auto-scores and reveals the authored explanation.

Visual true or false

A visual, statement, correct boolean value, and required correction or teaching explanation.

Amy selects True or False. The app auto-scores and reveals the correction, including why a labeled claim is wrong.

Diagram label match

A visual with stable callout ids and percentage positions; at least two callouts; a term bank at least as large as the callout count; complete answer map; unique correct targets.

One select control per visible callout. A label cannot be selected twice. The answer bank may exceed the callout count so it can include decoys.

Deliberate recall

A responseMode of written or sketch plus an authored model answer or key points.

Amy answers on paper or iPad, reveals the reference, then marks Got It or Review. It is not a primary rapid format and is never machine-graded.

Representative diagram-label matching shape for data authors:

{ "type": "matching", "visual": { "kind": "typedScene",  "callouts": [{"id":"A","xPct":42,"yPct":25}] },  "prompts": [{"id":"A","text":"Name callout A"}],  "options": ["body-center atom", "face-center atom", "unit-cell edge"],  "answers": {"A":"body-center atom"} }

Validation must reject a visual item with an unsupported asset type, missing alt text, duplicate callout id, coordinate outside the authored canvas, duplicate option id, missing answer-map entry, reused correct label, or a label bank smaller than its callout count.

4 Visual Rapid Check Experience

The local home screen adds a Visual Rapid Checks area with one card per authored quickCheckSet. A rapid-only v2 test opens normally; it does not need a placeholder worked problem.

A standard visual check presents one authored image or typed scene at a time. It can ask Amy to identify the visual, identify a highlighted element, distinguish two panels, or select the related fact or formula.

Diagram-label matching shows the authored visual and visible marker letters or numbers. Amy chooses a term from a dropdown for each callout. Selections are one-to-one; she does not drag labels across the image.

A rapidVisual set presents an authored sequence of picture cards in fixed order. If displaySeconds is authored, a visible countdown limits the card; expiry records it as unanswered and moves to the next card. The app does not randomize cards or answer options.

Immediate feedback shows correctness, the authored explanation, and a correct labeled overlay after each closed-answer item. End-of-set feedback holds that information until the summary. Both modes show the correct label mapping for diagram matches.

Written or sketch recall is paper-first. The app exposes a prompt, model answer or key points, and Mark Got It or Mark Review. It never reads handwriting, judges a drawing, or requires a drawing canvas.

The summary separates visual misses, unanswered cards, and recall items marked Review. Retry Missed and Review rebuilds a same-session set from those authored items without randomization or persistence.

5 Visual Authoring Path

Visual rapid checks should be chosen when recognition is the learning objective. A BCC or FCC image, an X-ray diffraction geometry, a Miller-plane drawing, or a bond diagram can be assessed as a fast visual identification or a diagram-label match. A short written or sketch prompt should be reserved for the smaller set of cases where Amy needs to produce the diagram or explanation from memory.

Question Goal

Recommended Visual Format

Example

Name the thing

Visual identification

Show a unit-cell image; choose BCC, FCC, HCP, or a decoy structure.

Name its parts

Diagram label match

Show Bragg geometry with labeled arrows; match theta, plane spacing, incident beam, and diffraction beam from a larger term bank.

Test a claim about it

Visual true or false

Show a highlighted atom and ask whether it is at a body center or face center; reveal the correction.

Connect image to rule

Visual identification followed by one closed fact

Identify BCC, then choose the correct relation between a and r.

Produce from memory

Deliberate recall

Draw a Miller plane or sketch a ZnS or CsCl unit cell, then compare with the authored reference.

The implementation does not need a separate scoring engine for these patterns. Visual identification and visual true-or-false use their existing closed-answer scoring. Diagram-label matching uses the existing matching scorer plus visual callout metadata and a reveal overlay.

6 Calculation and Visual Safety Delta

Rapid-check and worked-problem authored calculations may use the named operations sin, cos, tan, asin, acos, and atan. Every trigonometric expression must declare degree or radian handling so direction-angle and X-ray-diffraction questions are unambiguous. No arbitrary JavaScript, external calculator, symbolic algebra system, or arbitrary expression evaluator is permitted.

The typed-visual model supports authored callout overlays, highlight states, and a side-by-side visual pair without a course-specific 3D renderer, mesh engine, or animation system. The generic sphere primitive remains available for unit-cell and particle diagrams. Embedded raster pictures must render from the locally loaded test file alone.

7 Delivered Work Delta

Deliverable

Delta Content

Visual schema and guidance

v2 types or schema, parser validation, asset-size guardrails, visual/callout field guide, and an author checklist for inline PNG or JPEG images and typed scenes.

Visual runner

Visual ID, visual true-or-false, picture comparison, diagram-label dropdown matching, reveal overlays, immediate/end feedback, and rapidVisual per-card timing.

Safe visual support

Typed scenes, callout and highlight overlays, side-by-side panels, embedded local raster rendering, named trig and inverse-trig with explicit angle units, and the generic sphere primitive.

Proof fixture

One small client-provided or approved v2 fixture: at least two visual identification cards, three visual true-or-false cards, one diagram-label match with five callouts and at least eight terms, one eight-card rapidVisual set, one explicit-angle trig item, and one deliberate recall prompt.

Verification

Repeatable checks for v1 compatibility, visual asset validation, scoring, unique label selection, feedback timing, rapid-card expiry, retry composition, and offline execution. Update the local file guide and test checklist.

Content responsibility remains unchanged: the client supplies or approves the final prompt wording, images, labels, answer banks, explanations, model answers, and visuals. The proof fixture demonstrates the feature set; it is not a large question-bank or image-production engagement.

8 Delta Acceptance Criteria

Check

Pass Condition

Legacy compatibility

A v1 file opens and its worked-problem timer, dropdown-step flow, and authored solution reveal behave exactly as before.

Rapid-only support

A valid v2 file containing only quickCheckSets opens locally and starts a visual rapid check without a fabricated worked problem.

Offline visual asset

A typed scene and an embedded local PNG or JPEG render from the selected test file with authored alt text and no network request, local path, remote URL, or executable content.

Visual closed answers

Visual identification and visual true-or-false score against authored answers. Visual true-or-false feedback includes the authored correction or teaching explanation.

Diagram label match

A fixture with five callouts and at least eight terms renders visible markers and one select per marker, permits decoys, prevents duplicate selections, scores each pair, and reveals the correct overlay.

Rapid visual set

An eight-card rapidVisual set presents cards in authored order, visibly applies an authored per-card timer, records expiry as unanswered, and includes those items in the summary and retry.

Deliberate recall

A written or sketch item reveals its authored key and only accepts Got It or Review. No text, handwriting, or drawing is automatically judged.

Safe math and errors

At least one degree or radian trig item evaluates as authored. The app gives a readable local validation error for a bad visual asset, invalid callout, undersized label bank, duplicate answer target, or unsupported item type.

9 Delta Estimate and Client Inputs

Workstream

Estimated Additional Senior Front End Hours

v2 visual contract asset validation and file guidance

10 to 16 hours

Visual runner diagram matching feedback and rapid timing

22 to 34 hours

Typed and embedded visual rendering tests and local QA

16 to 24 hours

Total delta

48 to 74 hours

Estimate assumptions: implementation begins from the working v0.2 source; the client supplies or approves the small proof-fixture images and wording; and visuals are delivered as typed scenes or compact inline PNG/JPEG data. Broad image creation, course-content authoring, hosted delivery, or automatic free-response grading is outside this estimate.

10 Client Update Checklist

Use a visual item when the intended skill is rapid recognition: identifying a structure, a highlighted feature, a diagram relationship, or the formula associated with the picture.

For diagram-label matching, create clear callouts and provide more labels than markers. Include plausible decoys, but make every intended correct label unique and unambiguous.

Supply images as compact inline PNG or JPEG data with useful alt text, or describe them with typed-scene data. Do not use web links, relative local image paths, or raw SVG files.

Use rapidVisual sets for a short recognition round and choose an authored per-card time only where speed matters. Use end-of-set feedback for a test-like pass and immediate feedback for learning.

Reserve written/sketch prompts for a few high-value generation tasks. Provide an image or model answer plus concise key points so Amy can judge her own work quickly.

Declare degree or radian handling wherever a trig value appears and provide the explanation or correction Amy should see after a missed visual item.

Approval of this delta authorizes only the visual rapid-check additions described here. All other behavior remains governed by Guided Test Prep Local Offline v0.2.

