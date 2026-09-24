import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestFileJson } from '../../src/contract/types';
import { TestFile } from '../../src/engine/testFile';

const root = resolve(__dirname, '../..');

export function loadFixture(name: 'engr206' | 'mechanics'): TestFileJson {
  const file = name === 'engr206' ? 'engr206-local.test.example.json' : 'mechanics-of-materials.local.test.example.json';
  return JSON.parse(readFileSync(resolve(root, 'docs/handoff', file), 'utf8')) as TestFileJson;
}

export function fixtureTest(name: 'engr206' | 'mechanics'): TestFile {
  return new TestFile(loadFixture(name));
}

/** Deep copy so tests can mutate a fixture freely. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Manually advanced clock for timer tests. */
export class FakeClock {
  now = 1_000_000;
  read = () => this.now;
  advance(ms: number) {
    this.now += ms;
  }
}

export function readRepoFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}
