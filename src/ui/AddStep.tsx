import { useMemo, useState } from 'react';
import type { Attempt } from '../engine/attempt';
import { formatUnit } from '../engine/format';
import { ACTION_GROUP_LABELS, type ActionGroup, DerivativeOperation, type InputSlot, type Operation } from '../engine/operations';
import type { Variable, VariableOrigin } from '../engine/variables';
import { Tex, TexLines } from '../render/Latex';
import { useObservable } from './hooks';

const ORIGIN_GROUPS: { origin: VariableOrigin; label: string }[] = [
  { origin: 'given', label: 'Givens' },
  { origin: 'constant', label: 'Constants' },
  { origin: 'step', label: 'My results' },
];

/**
 * Guided step builder: action group → operation → input dropdowns → output name → Calculate.
 * Every value is chosen from a dropdown; the only text fields are the output name and symbol.
 */
export function AddStep({ attempt }: { attempt: Attempt }) {
  useObservable(attempt);
  const catalog = attempt.problem.catalog();
  const groups = catalog.groups();
  const [group, setGroup] = useState<ActionGroup>();
  const [opKey, setOpKey] = useState('');
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');

  const operation = opKey ? catalog.get(opKey) : undefined;
  const operations = group ? catalog.inGroup(group) : [];

  const chooseOperation = (op: Operation | undefined) => {
    setOpKey(op?.key ?? '');
    setBindings({});
    setError('');
    const suggestion = op ? attempt.suggestName(op) : { name: '', symbol: '' };
    setName(suggestion.name);
    setSymbol(suggestion.symbol);
  };

  const chooseGroup = (g: ActionGroup) => {
    setGroup(g);
    setAdded('');
    const ops = catalog.inGroup(g);
    chooseOperation(ops.length === 1 ? ops[0] : undefined);
  };

  const bound = useMemo(() => {
    const result: Record<string, Variable | undefined> = {};
    for (const [key, id] of Object.entries(bindings)) result[key] = attempt.store.get(id);
    return result;
  }, [bindings, attempt, attempt.version]);

  const hints = operation ? operation.unitHints(bound) : [];
  const inputs = operation?.inputs() ?? [];
  const ready = operation !== undefined && inputs.every((slot) => bindings[slot.key]);

  const calculate = () => {
    if (!operation) return;
    const result = attempt.addStep(operation, bindings, { name, symbol });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
    setAdded(`Added step ${result.step.number}.`);
    // Keep the same operation selected for repeated use, with fresh inputs and the next auto name.
    chooseOperation(operation);
  };

  const state = attempt.timer.state;
  const locked = !attempt.canWork;

  return (
    <section className="panel add-step" aria-labelledby="add-step-title">
      <h2 id="add-step-title">Add Step</h2>
      {state === 'ready' && <p className="notice">Press <strong>Start</strong> to begin the timer and add steps.</p>}
      {state === 'paused' && <p className="notice">Paused. Press <strong>Resume</strong> to keep working.</p>}

      <fieldset disabled={locked} className="add-step-fields">
        <legend className="sr-only">Action group</legend>
        <div className="group-buttons" role="group" aria-label="Action group">
          {groups.map((g) => (
            <button key={g} type="button" className={g === group ? 'group-button selected' : 'group-button'} aria-pressed={g === group} onClick={() => chooseGroup(g)}>
              {ACTION_GROUP_LABELS[g]}
            </button>
          ))}
        </div>

        {group && (
          <label className="field">
            <span>{group === 'formula' ? 'Formula' : group === 'finalAnswer' ? 'Action' : 'Operation'}</span>
            <select value={opKey} onChange={(e) => chooseOperation(catalog.get(e.target.value))}>
              <option value="">Choose…</option>
              {operations.map((op) => (
                <option key={op.key} value={op.key}>
                  {op.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {operation && (
          <div className="step-builder">
            <OperationPreview operation={operation} />

            {inputs.map((slot) => (
              <InputSelect
                key={`${operation.key}:${slot.key}`}
                slot={slot}
                attempt={attempt}
                value={bindings[slot.key] ?? ''}
                onChange={(id) => {
                  setBindings((b) => ({ ...b, [slot.key]: id }));
                  setError('');
                }}
              />
            ))}

            {operation.hasOutput && (
              <div className="output-name">
                <label className="field">
                  <span>Output name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="field narrow">
                  <span>Symbol</span>
                  <input value={symbol} onChange={(e) => setSymbol(e.target.value)} />
                </label>
                <span className="symbol-preview" aria-hidden="true">
                  <Tex latex={symbol || ' '} />
                </span>
              </div>
            )}

            {hints.length > 0 && (
              <ul className="hints" aria-live="polite">
                {hints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}

            <button type="button" className="primary" disabled={!ready} onClick={calculate}>
              {operation.group === 'finalAnswer' ? 'State final answer' : operation.group === 'derivative' ? 'Apply derivative' : 'Calculate'}
            </button>
          </div>
        )}
      </fieldset>

      <div aria-live="polite" className="status-line">
        {error && <p className="error-text">{error}</p>}
        {added && !error && <p className="ok-text">{added}</p>}
      </div>
    </section>
  );
}

function OperationPreview({ operation }: { operation: Operation }) {
  if (operation instanceof DerivativeOperation) {
    const { action } = operation;
    return (
      <div className="preview">
        <div className="preview-row">
          <span className="muted">Expression</span>
          <Tex latex={action.expressionLatex} />
        </div>
        <div className="preview-row">
          <span className="muted">Differentiate with respect to</span>
          <Tex latex={action.variable} />
        </div>
      </div>
    );
  }
  const latex = operation.previewLatex();
  return latex ? (
    <div className="preview">
      <TexLines latex={latex} />
    </div>
  ) : null;
}

function InputSelect({
  slot,
  attempt,
  value,
  onChange,
}: {
  slot: InputSlot;
  attempt: Attempt;
  value: string;
  onChange: (id: string) => void;
}) {
  const choices = attempt.choicesFor(slot.acceptsSymbolic);
  const id = `input-${slot.key}`;
  return (
    <label className="field input-field" htmlFor={id}>
      <span className="slot-label">
        {slot.name}
        {slot.symbol && <Tex latex={slot.symbol} />}
        {slot.unit && <span className="muted small"> in {formatUnit(slot.unit)}</span>}
      </span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label={slot.name}>
        <option value="">Choose a value…</option>
        {ORIGIN_GROUPS.map(({ origin, label }) => {
          const options = choices.filter((v) => v.origin === origin);
          if (options.length === 0) return null;
          return (
            <optgroup key={origin} label={label}>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.describe()}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}
