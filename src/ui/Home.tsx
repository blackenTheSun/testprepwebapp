import { type DragEvent, useRef, useState } from 'react';
import type { ValidationIssue } from '../contract/validate';
import { formatElapsed } from '../engine/format';
import type { Session } from '../engine/session';
import { INCLUDED_EXAMPLES, type IncludedExample } from '../examples';
import type { LoadFailure } from './App';
import { useObservable } from './hooks';

interface HomeProps {
  session?: Session;
  failure?: LoadFailure;
  busy: boolean;
  onFile: (file: File) => void;
  onExample: (example: IncludedExample) => void;
}

export function Home({ session, failure, busy, onFile, onExample }: HomeProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <main
      className={`home${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <header className="home-header">
        <h1>Guided Test Prep</h1>
        <p className="lede">Load a test, pick a problem, work it step by step, then reveal the path.</p>
      </header>

      <section className="home-actions" aria-label="Choose a test">
        <div className="action-card">
          <h2>Load Test</h2>
          <p>Choose a test file (.json), or drop it anywhere on this page.</p>
          <button type="button" className="primary" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? 'Loading…' : 'Load Test'}
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = '';
            }}
          />
        </div>
        <div className="action-card">
          <h2>Use Included Examples</h2>
          <p>Open a sample test without choosing a file.</p>
          <div className="button-row">
            {INCLUDED_EXAMPLES.map((example) => (
              <button type="button" key={example.key} onClick={() => onExample(example)}>
                {example.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {failure && <LoadErrors failure={failure} />}
      {session && <ProblemList session={session} />}
    </main>
  );
}

function LoadErrors({ failure }: { failure: LoadFailure }) {
  return (
    <section className="panel error-panel" role="alert" aria-labelledby="load-error-title">
      <h2 id="load-error-title">This file can't be opened</h2>
      <p>
        <strong>{failure.sourceName || 'The file'}</strong> is not a valid test file. Fix these and load it again:
      </p>
      <IssueList issues={failure.errors} />
    </section>
  );
}

export function IssueList({ issues, limit = 50 }: { issues: readonly ValidationIssue[]; limit?: number }) {
  return (
    <ul className="issue-list">
      {issues.slice(0, limit).map((issue, i) => (
        <li key={i} className={`issue ${issue.severity}`}>
          <code className="issue-path">{issue.path}</code>
          <span>{issue.message}</span>
        </li>
      ))}
      {issues.length > limit && <li className="issue">…and {issues.length - limit} more.</li>}
    </ul>
  );
}

function ProblemList({ session }: { session: Session }) {
  useObservable(session);
  const { test } = session;
  return (
    <section className="panel" aria-labelledby="test-title">
      <div className="test-heading">
        <div>
          <h2 id="test-title">{test.title}</h2>
          {test.json.description && <p className="muted">{test.json.description}</p>}
        </div>
        <span className="muted small">{session.sourceName}</span>
      </div>

      {session.warnings.length > 0 && (
        <details className="warning-panel">
          <summary>
            {session.warnings.length} answer-key warning{session.warnings.length === 1 ? '' : 's'}. The file opened, but check these.
          </summary>
          <IssueList issues={session.warnings} />
        </details>
      )}

      <h3>Open Problem</h3>
      <ol className="problem-list">
        {test.problems.map((problem) => {
          const status = session.hasAttempt(problem.id) ? session.attemptFor(problem) : undefined;
          const state = status?.timer.state ?? 'ready';
          const label = state === 'finished' ? 'Finished' : state === 'ready' ? 'Not started' : 'In progress';
          const warnings = session.warningsFor(problem).length;
          return (
            <li key={problem.id}>
              <button type="button" className="problem-button" onClick={() => session.openProblem(problem.id)}>
                <span className="problem-title">{problem.title}</span>
                <span className="problem-meta">
                  <span className={`status status-${state}`}>{label}</span>
                  {status && state !== 'ready' && <span className="muted small">{formatElapsed(status.timer.elapsedMs())}</span>}
                  {warnings > 0 && <span className="status status-warning">{warnings} warning{warnings === 1 ? '' : 's'}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
