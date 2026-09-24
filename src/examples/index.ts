import type { TestFileJson } from '../contract/types';
// The supplied reference fixtures are the single source of truth; they are bundled so
// "Use Included Examples" works without picking a file.
import engr206 from '../../docs/handoff/engr206-local.test.example.json';
import mechanics from '../../docs/handoff/mechanics-of-materials.local.test.example.json';

export interface IncludedExample {
  key: string;
  label: string;
  fileName: string;
  data: TestFileJson;
}

export const INCLUDED_EXAMPLES: readonly IncludedExample[] = [
  { key: 'engr206', label: 'ENGR 206', fileName: 'engr206-local.test.example.json', data: engr206 as unknown as TestFileJson },
  {
    key: 'mechanics',
    label: 'Mechanics of Materials',
    fileName: 'mechanics-of-materials.local.test.example.json',
    data: mechanics as unknown as TestFileJson,
  },
];
