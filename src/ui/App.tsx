import { useCallback, useState } from 'react';
import { type LoadResult, TestFileLoader } from '../contract/loader';
import type { ValidationIssue } from '../contract/validate';
import { Session } from '../engine/session';
import type { IncludedExample } from '../examples';
import { Home } from './Home';
import { useObservable } from './hooks';
import { ProblemView } from './ProblemView';

const loader = new TestFileLoader();

export interface LoadFailure {
  sourceName: string;
  errors: ValidationIssue[];
}

export function App() {
  const [session, setSession] = useState<Session>();
  const [failure, setFailure] = useState<LoadFailure>();
  const [busy, setBusy] = useState(false);
  useObservable(session);

  const accept = useCallback((result: LoadResult) => {
    if (result.ok) {
      // A new Session cleanly replaces the previous test and every attempt in it.
      setSession(new Session(result.test, result.warnings, result.sourceName));
      setFailure(undefined);
    } else {
      setFailure({ sourceName: result.sourceName, errors: result.errors });
    }
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        accept(await loader.readFile(file));
      } finally {
        setBusy(false);
      }
    },
    [accept],
  );

  const loadExample = useCallback((example: IncludedExample) => accept(loader.fromData(example.data, example.fileName)), [accept]);

  const attempt = session?.activeAttempt;
  if (session && attempt) {
    return <ProblemView key={attempt.uid} session={session} attempt={attempt} />;
  }
  return <Home session={session} failure={failure} busy={busy} onFile={loadFile} onExample={loadExample} />;
}
