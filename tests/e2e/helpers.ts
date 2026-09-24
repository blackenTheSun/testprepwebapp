import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, type Page } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

export const APP_URL = pathToFileURL(resolve(root, 'dist/index.html')).href;
export const ENGR206 = resolve(root, 'docs/handoff/engr206-local.test.example.json');
export const MECHANICS = resolve(root, 'docs/handoff/mechanics-of-materials.local.test.example.json');
export const invalidFixture = (name: string) => resolve(root, 'tests/fixtures/invalid', name);

/**
 * Opens the delivered file and records any request that is not file:, data: or blob:.
 * The build's CSP blocks such requests anyway; this proves none are even attempted.
 */
export async function openApp(page: Page): Promise<string[]> {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!/^(file|data|blob):/.test(request.url())) external.push(request.url());
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(APP_URL);
  await expect(page.getByRole('heading', { name: 'Guided Test Prep' })).toBeVisible();
  expect(errors).toEqual([]);
  return external;
}

export async function loadFile(page: Page, path: string): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(path);
}

export async function openProblem(page: Page, title: RegExp | string): Promise<void> {
  await page.getByRole('button', { name: title }).click();
  await expect(page.getByRole('button', { name: '← Problems' })).toBeVisible();
}

export async function start(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

export interface StepSpec {
  group: 'Formula sheet' | 'Basic math' | 'Unit conversion' | 'Derivative' | 'Final answer';
  /** Option label in the operation dropdown (omit when the group has a single operation). */
  operation?: string;
  /** Input label (slot name) → option label substring. */
  inputs?: Record<string, string | RegExp>;
  name?: string;
  symbol?: string;
}

/** Drives the Add Step builder entirely through dropdowns, like Amy would. */
export async function addStep(page: Page, spec: StepSpec): Promise<void> {
  const panel = page.getByRole('region', { name: 'Add Step' });
  await panel.getByRole('button', { name: spec.group, exact: true }).click();
  if (spec.operation) {
    const operationSelect = panel.locator('label.field').filter({ hasText: /^(Formula|Operation|Action)/ }).locator('select');
    await operationSelect.selectOption({ label: spec.operation });
  }
  for (const [slot, option] of Object.entries(spec.inputs ?? {})) {
    const select = panel.getByRole('combobox', { name: slot, exact: true });
    const label = await select.locator('option').evaluateAll(
      (options, pattern) => {
        const re = new RegExp(pattern);
        return options.map((o) => o.textContent ?? '').find((t) => re.test(t));
      },
      option instanceof RegExp ? option.source : escapeRegExp(option),
    );
    if (!label) throw new Error(`No option matching ${String(option)} for ${slot}`);
    await select.selectOption({ label });
  }
  if (spec.name !== undefined) await panel.getByLabel('Output name').fill(spec.name);
  if (spec.symbol !== undefined) await panel.getByLabel('Symbol').fill(spec.symbol);
  await panel.getByRole('button', { name: /^(Calculate|Apply derivative|State final answer)$/ }).click();
  await expect(panel.getByText(/^Added step \d+\.$/)).toBeVisible();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
