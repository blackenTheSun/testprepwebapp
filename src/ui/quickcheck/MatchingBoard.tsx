import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import type { ItemResult, MatchingItem } from '../../engine/quickcheck/items';

// Puzzle geometry (px). A label piece has one knob on its left edge; each slot's host tab has one
// matching notch on its right edge, so there is exactly one way a piece connects.
const PIECE_W = 184;
const PIECE_H = 44;
const KNOB_R = 10;
const KNOB_X = 12;
const HOST_W = 46;
/** Label piece: rounded body with a single knob protruding from the middle of its left edge. */
const PIECE_PATH = `M ${KNOB_X} 0 H ${PIECE_W - 6} Q ${PIECE_W} 0 ${PIECE_W} 6 V ${PIECE_H - 6} Q ${PIECE_W} ${PIECE_H} ${PIECE_W - 6} ${PIECE_H} H ${KNOB_X} V ${PIECE_H / 2 + KNOB_R} A ${KNOB_R} ${KNOB_R} 0 1 1 ${KNOB_X} ${PIECE_H / 2 - KNOB_R} Z`;
/** Slot host tab: holds the callout letter, with a single notch cut into its right edge. */
const HOST_PATH = `M 6 0 H ${HOST_W} V ${PIECE_H / 2 - KNOB_R} A ${KNOB_R} ${KNOB_R} 0 1 0 ${HOST_W} ${PIECE_H / 2 + KNOB_R} V ${PIECE_H} H 6 Q 0 ${PIECE_H} 0 ${PIECE_H - 6} V 6 Q 0 0 6 0 Z`;
/** A piece sits so its knob lands in the host's notch. */
const PIECE_OFFSET = HOST_W - KNOB_X;
const DRAG_THRESHOLD = 5;

type Source = { term: string; from?: string };

interface DragState extends Source {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  moving: boolean;
}

function PieceShape({ term, state = '' }: { term: string; state?: string }) {
  return (
    <span className={`piece${state ? ` ${state}` : ''}`} style={{ width: PIECE_W, height: PIECE_H }}>
      <svg className="piece-shape" width={PIECE_W} height={PIECE_H} viewBox={`0 0 ${PIECE_W} ${PIECE_H}`} aria-hidden="true">
        <path d={PIECE_PATH} />
      </svg>
      <span className="piece-text" style={{ left: KNOB_X + 4, right: 8 }}>
        {term}
      </span>
    </span>
  );
}

interface BoardProps {
  item: MatchingItem;
  selections: Readonly<Record<string, string>>;
  onChange: (next: Record<string, string>) => void;
  locked: boolean;
  /** After submission: per-callout correctness, for ✓/✗ on the slots. */
  result?: ItemResult;
}

/**
 * Drag-and-drop diagram-label matching. Pieces drag with mouse, pen or touch (pointer events),
 * and the same moves work without dragging: tap or press Enter on a piece to pick it up, then on
 * a slot to place it; a filled slot's piece can be picked up again, Delete returns it to the bank,
 * and Escape drops what is held.
 */
export function MatchingBoard({ item, selections, onChange, locked, result }: BoardProps) {
  const [held, setHeld] = useState<Source>();
  const [drag, setDrag] = useState<DragState>();
  const [message, setMessage] = useState('');
  const suppressClick = useRef(false);
  const dragRef = useRef<DragState | undefined>(undefined);
  dragRef.current = drag;

  const promptText = (id: string) => item.prompts.find((p) => p.id === id)?.text ?? id;

  const placeOn = (source: Source, to: string) => {
    onChange(item.place(selections, source.term, to, source.from));
    setHeld(undefined);
    setMessage(`Placed ${source.term} on ${to}.`);
  };

  const returnToBank = (source: Source) => {
    if (source.from !== undefined) onChange(item.remove(selections, source.from));
    setHeld(undefined);
    setMessage(`${source.term} returned to the label pieces.`);
  };

  // Pointer dragging: listeners live on the window so the drag survives leaving the piece.
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const moving = d.moving || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD;
      setDrag({ ...d, x: e.clientX, y: e.clientY, moving });
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      setDrag(undefined);
      if (!d.moving) return; // a tap: handled by onClick
      // Swallow the click that may follow this pointerup, then re-arm on the next tick.
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]');
      const drop = target?.dataset.drop;
      if (drop?.startsWith('slot:')) placeOn(d, drop.slice(5));
      else if (drop === 'bank') returnToBank(d);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // Re-subscribe only when a drag starts or ends; the handlers read the latest state from dragRef.
  }, [drag !== undefined]);

  /** `pieceLeft` is the piece's offset inside the pressed element (slots start with the host tab). */
  const startDrag = (e: ReactPointerEvent<HTMLElement>, source: Source, pieceLeft = 0) => {
    if (locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag({
      ...source,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      grabX: e.clientX - rect.left - pieceLeft,
      grabY: e.clientY - rect.top,
      moving: false,
    });
  };

  /** Click / Enter on a piece: pick it up (or put it down if it is already held). */
  const clickPiece = (source: Source) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (locked) return;
    if (held && held.term === source.term && held.from === source.from) {
      setHeld(undefined);
      setMessage('');
      return;
    }
    setHeld(source);
    setMessage(`Picked up ${source.term}. Choose a slot for it.`);
  };

  /** Click / Enter on a slot: place what is held, or pick up the piece already there. */
  const clickSlot = (id: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (locked) return;
    if (held) placeOn(held, id);
    else if (selections[id]) clickPiece({ term: selections[id], from: id });
  };

  const bank = item.bankTerms(selections);
  const dragging = drag?.moving ? drag : undefined;

  return (
    <div
      className={`matching-board${locked ? ' locked' : ''}${dragging ? ' dragging' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && held) {
          setHeld(undefined);
          setMessage('');
        }
      }}
    >
      <ol className="slot-list" aria-label="Callout slots">
        {item.prompts.map((prompt) => {
          const term = selections[prompt.id];
          const ok = result?.pairs?.[prompt.id];
          const state = ok === undefined ? '' : ok ? 'ok' : 'wrong';
          const isHeldHere = held?.from === prompt.id;
          return (
            <li key={prompt.id} className="slot-row">
              <span className="slot-prompt">{prompt.text}</span>
              <button
                type="button"
                className={`slot${term ? ' filled' : ''}${state ? ` ${state}` : ''}${held && !locked ? ' targetable' : ''}`}
                data-drop={`slot:${prompt.id}`}
                data-slot={prompt.id}
                style={{ width: PIECE_OFFSET + PIECE_W, height: PIECE_H }}
                aria-label={`Slot ${prompt.id}, ${promptText(prompt.id)}: ${term ? `holds ${term}` : 'empty'}${ok === undefined ? '' : ok ? ', correct' : ', incorrect'}`}
                aria-disabled={locked}
                onClick={() => clickSlot(prompt.id)}
                onKeyDown={(e) => {
                  if ((e.key === 'Delete' || e.key === 'Backspace') && term && !locked) {
                    e.preventDefault();
                    returnToBank({ term, from: prompt.id });
                  }
                }}
                onPointerDown={term ? (e) => startDrag(e, { term, from: prompt.id }, PIECE_OFFSET) : undefined}
              >
                <svg className="slot-host" width={HOST_W} height={PIECE_H} viewBox={`0 0 ${HOST_W} ${PIECE_H}`} aria-hidden="true">
                  <path d={HOST_PATH} />
                  <text x={(HOST_W - KNOB_R) / 2} y={PIECE_H / 2 + 5} textAnchor="middle">
                    {prompt.id}
                  </text>
                </svg>
                <span className="slot-bed" style={{ left: PIECE_OFFSET }}>
                  {term ? (
                    <PieceShape term={term} state={[isHeldHere ? 'held' : '', dragging && dragging.from === prompt.id ? 'lifted' : ''].filter(Boolean).join(' ')} />
                  ) : (
                    <svg className="slot-outline" width={PIECE_W} height={PIECE_H} viewBox={`0 0 ${PIECE_W} ${PIECE_H}`} aria-hidden="true">
                      <path d={PIECE_PATH} />
                    </svg>
                  )}
                </span>
                {state && <span className={`slot-mark ${state}`}>{state === 'ok' ? '✓' : '✗'}</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="piece-bank" data-drop="bank" aria-label="Label pieces">
        <p className="bank-title">
          Label pieces{item.allowReuse ? <span className="muted small"> (each can be used more than once)</span> : null}
        </p>
        <div className="bank-pieces">
          {bank.map((term) => {
            const isHeld = held !== undefined && held.from === undefined && held.term === term;
            return (
              <button
                key={term}
                type="button"
                className="piece-button"
                data-piece={term}
                aria-label={`Label piece: ${term}`}
                aria-pressed={isHeld}
                disabled={locked}
                onClick={() => clickPiece({ term })}
                onPointerDown={(e) => startDrag(e, { term })}
              >
                <PieceShape term={term} state={[isHeld ? 'held' : '', dragging && dragging.from === undefined && dragging.term === term && !item.allowReuse ? 'lifted' : ''].filter(Boolean).join(' ')} />
              </button>
            );
          })}
          {bank.length === 0 && <p className="muted small">All pieces placed. Drag one back here to swap it out.</p>}
        </div>
      </div>

      {dragging && (
        <div className="drag-ghost" style={{ left: dragging.x - dragging.grabX, top: dragging.y - dragging.grabY }} aria-hidden="true">
          <PieceShape term={dragging.term} state="ghost" />
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
