import { TestFile } from '../engine/testFile';
import type { TestFileJson } from './types';
import { TestFileValidator, type ValidationIssue } from './validate';

export type LoadResult =
  | { ok: true; test: TestFile; warnings: ValidationIssue[]; sourceName: string }
  | { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[]; sourceName: string };

/**
 * Turns a local file into a validated {@link TestFile}. Reading uses `FileReader` (never
 * `fetch`), which works for pages opened from `file://`.
 */
export class TestFileLoader {
  constructor(private readonly validator = new TestFileValidator()) {}

  readFile(file: File): Promise<LoadResult> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(this.fromText(String(reader.result ?? ''), file.name));
      reader.onerror = () =>
        resolve({
          ok: false,
          sourceName: file.name,
          warnings: [],
          errors: [{ severity: 'error', rule: 'read', path: '/', message: `Could not read the file: ${reader.error?.message ?? 'unknown error'}` }],
        });
      reader.readAsText(file);
    });
  }

  fromText(text: string, sourceName: string): LoadResult {
    let data: unknown;
    try {
      data = JSON.parse(text.replace(/^﻿/, ''));
    } catch (error) {
      return {
        ok: false,
        sourceName,
        warnings: [],
        errors: [{ severity: 'error', rule: 'json', path: '/', message: TestFileLoader.describeParseError(text, error) }],
      };
    }
    return this.fromData(data, sourceName);
  }

  fromData(data: unknown, sourceName: string): LoadResult {
    const report = this.validator.validate(data);
    if (!report.ok) return { ok: false, sourceName, errors: report.errors, warnings: report.warnings };
    return { ok: true, sourceName, test: new TestFile(data as TestFileJson), warnings: report.warnings };
  }

  /** "Not valid JSON: Unexpected token } (line 12, column 5)". */
  static describeParseError(text: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/line \d+ column \d+/i.test(message)) return `Not valid JSON: ${message}`;
    const position = /position (\d+)/.exec(message);
    if (!position) return `Not valid JSON: ${message}`;
    const offset = Number(position[1]);
    const before = text.slice(0, offset);
    const line = before.split('\n').length;
    const column = offset - before.lastIndexOf('\n');
    return `Not valid JSON: ${message.replace(/\s*in JSON at position \d+.*$/, '')} (line ${line}, column ${column})`;
  }
}
