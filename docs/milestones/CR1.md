# CR1: drag-and-drop matching and label reuse (complete)

Client change request after v0.3 (Brent):
1. Diagram-label matching should be **drag and drop**, with the drop target under and slightly to the right of each prompt, and **puzzle-piece edges with one connection point**.
2. A test should be able to let a label be used **more than once** (e.g. two rectangles).

Both override parts of the v0.3 SOW. They are recorded as D63–D66 in [DECISIONS.md](../DECISIONS.md).

| Item | Evidence |
| --- | --- |
| Puzzle sockets and pieces | [src/ui/quickcheck/MatchingBoard.tsx](../../src/ui/quickcheck/MatchingBoard.tsx): the host tab has one notch and the piece has one knob; the slot sits under its prompt, indented; the bank of label pieces is beside it |
| Drag with mouse, pen and touch | Pointer events with a floating ghost; drop on a socket to place, on another socket to move or swap, on the bank to remove |
| Non-drag alternative | Tap or Enter a piece → tap or Enter a socket; tap a filled socket to pick it up; Delete / Escape; live announcements |
| Placement rules | `MatchingItem.place / remove / bankTerms` ([items.ts](../../src/engine/quickcheck/items.ts)) |
| `allowReuse` | Schema ([v2](../handoff/test-file.local.v2.schema.json)), `MatchingRule`, engine, [guide §9.2](../TEST_FILE_GUIDE.md#92-item-types-items-chosen-by-type) |
| Fixture | Placeholder set **"PLACEHOLDER Labels used more than once"** (two rectangles, a circle, a triangle; `allowReuse`) |

## Tests

- **Unit (83 total):** placement from the bank, displacement back to the bank, move and swap between sockets, never two sockets without reuse, reuse copies and scoring. The schema rejects a repeated answer unless `allowReuse` is set.
- **E2E (16 tests; 32 passing locally in Chromium and Edge):**
  - The matching test now uses a real mouse drag, tap-to-place, a socket-to-socket drag, and keyboard Enter. It checks that a placed piece leaves the bank, then checks the per-pair result and the overlay.
  - A new test covers label reuse.

## Not verified

- Touch dragging on a real iPad. Pointer events cover touch, and the tap alternative is tested, but no physical touch drag has been run.
