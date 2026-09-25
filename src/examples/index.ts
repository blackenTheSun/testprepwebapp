// The supplied reference fixtures are the single source of truth; they are bundled so
// "Use Included Examples" works without picking a file.
import engr206 from '../../docs/handoff/engr206-local.test.example.json';
import mechanics from '../../docs/handoff/mechanics-of-materials.local.test.example.json';
import visualChecks from '../../docs/handoff/v0.3/placeholder-visual-checks.test.example.json';

export interface IncludedExample {
  key: string;
  label: string;
  fileName: string;
  /** Raw file contents (v1 or v2); validated and normalized by the loader like any other file. */
  data: unknown;
}

export const INCLUDED_EXAMPLES: readonly IncludedExample[] = [
  { key: 'engr206', label: 'ENGR 206', fileName: 'engr206-local.test.example.json', data: engr206 },
  {
    key: 'mechanics',
    label: 'Mechanics of Materials',
    fileName: 'mechanics-of-materials.local.test.example.json',
    data: mechanics,
  },
  {
    key: 'visual-checks',
    label: 'Visual checks (placeholder)',
    fileName: 'placeholder-visual-checks.test.example.json',
    data: visualChecks,
  },
];
