import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { addStep, ENGR206, loadFile, openApp, openProblem, start } from './helpers';

// v0.3 delta acceptance checks (docs/handoff/v0.3/…SOW_v0.3.docx §8), against the delivered
// dist/index.html over file:// with no network. The v1 checks in acceptance.spec.ts are unchanged.

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const PLACEHOLDER = resolve(root, 'docs/handoff/v0.3/placeholder-visual-checks.test.example.json');
const RAPID_ONLY = resolve(root, 'tests/fixtures/v2/rapid-only.json');
const invalidV2 = (name: string) => resolve(root, 'tests/fixtures/invalid-v2', name);

const card = (page: Page) => page.locator('section.card');
const submit = (page: Page) => page.getByRole('button', { name: 'Submit' }).click();
const next = (page: Page) => page.getByRole('button', { name: /^(Next card|See summary)$/ }).click();

async function startSet(page: Page, title: string) {
  await page.getByRole('button', { name: `Start ${title}` }).click();
  await expect(card(page)).toBeVisible();
}

const STANDARD_ANSWERS: Record<string, string> = {
  'identify-sphere': 'Sphere',
  'identify-highlight': 'At the centre of the cube',
  'compare-panels': 'Panel B',
  'tf-third-shape': 'False',
  'tf-arrow': 'True',
  'tf-cylinder': 'False',
};

/** Answers `count` standard-set cards correctly, starting from whichever card is showing. */
async function skipStandardCards(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    const id = (await card(page).getAttribute('data-item-id')) ?? '';
    await page.getByRole('radio', { name: STANDARD_ANSWERS[id], exact: true }).check();
    await submit(page);
    await next(page);
  }
}

test('Legacy compatibility: a v1 file opens with no rapid-check area and its worked flow unchanged', async ({ page }) => {
  await openApp(page);
  await loadFile(page, ENGR206);
  await expect(page.getByRole('heading', { name: 'ENGR 206 Local Guided Practice' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Visual Rapid Checks' })).toHaveCount(0);
  await openProblem(page, /Resistor voltage and power/);
  await start(page);
  await addStep(page, { group: 'Formula sheet', operation: "Ohm's law voltage form", inputs: { Current: 'Branch current', Resistance: 'Resistor value' } });
  await page.getByRole('button', { name: 'Finish and reveal path' }).click();
  await expect(page.getByRole('region', { name: 'Correct path' })).toBeVisible();
});

test('Rapid-only support: a v2 file with only quickCheckSets opens and starts a check', async ({ page }) => {
  await openApp(page);
  await loadFile(page, RAPID_ONLY);
  await expect(page.getByRole('heading', { name: 'Visual Rapid Checks' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open Problem' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await startSet(page, 'PLACEHOLDER Shapes and scenes');
  await expect(page.getByText('Card 1 of 8')).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-item-id', 'identify-sphere');
});

test('Offline visual asset: embedded PNG and JPEG and a typed scene render with alt text and no network', async ({ page }) => {
  const external = await openApp(page);
  await loadFile(page, PLACEHOLDER);
  await startSet(page, 'PLACEHOLDER Shapes and scenes');

  // Typed scene (card 1).
  const scene = card(page).locator('svg[data-visual="scene3d/v1"]');
  await expect(scene).toHaveAttribute('aria-label', /single shaded sphere/);
  await expect(scene.locator('.sc-sphere-body')).toHaveCount(1);

  // Pair with a typed scene and an embedded JPEG (card 3).
  await skipStandardCards(page, 2);
  const jpeg = card(page).locator('img.item-image');
  await expect(jpeg).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect(jpeg).toHaveAttribute('alt', /shaded blue ball/);
  expect(await jpeg.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(200);
  await expect(card(page).locator('.pair-caption')).toHaveText(['A', 'B']);

  // Embedded PNG (card 4).
  await skipStandardCards(page, 1);
  const png = card(page).locator('img.item-image');
  await expect(png).toHaveAttribute('src', /^data:image\/png;base64,/);
  expect(await png.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(400);
  await card(page).getByText('Describe this picture').click();
  await expect(card(page).locator('.alt-text p')).toContainText('Five filled shapes in a row');

  expect(external).toEqual([]);
});

test('Visual closed answers: identification and true/false score against authored answers with the correction', async ({ page }) => {
  await openApp(page);
  await loadFile(page, PLACEHOLDER);
  await startSet(page, 'PLACEHOLDER Shapes and scenes');

  await page.getByRole('radio', { name: 'Cube' }).check();
  await submit(page);
  await expect(card(page).locator('.feedback-status')).toHaveText('Not quite');
  await expect(card(page)).toContainText('Answer: Sphere');
  await expect(card(page)).toContainText('Every point on the surface is the same distance from the centre');
  await next(page);

  await page.getByRole('radio', { name: 'At the centre of the cube' }).check();
  await submit(page);
  await expect(card(page).locator('.feedback-status')).toHaveText('Correct');
  await next(page);
  await skipStandardCards(page, 1);

  // True/false: a wrong "True" reveals the authored correction.
  await expect(card(page)).toHaveAttribute('data-item-type', 'trueFalse');
  await page.getByRole('radio', { name: 'True', exact: true }).check();
  await submit(page);
  await expect(card(page).locator('.feedback-status')).toHaveText('Not quite');
  await expect(card(page)).toContainText('The statement is False.');
  await expect(card(page)).toContainText('The third shape is a triangle. The square is the second shape.');
});

test('Diagram label match: 5 markers, one-to-one dropdowns from 8 terms, per-pair score, correct overlay', async ({ page }) => {
  await openApp(page);
  await loadFile(page, PLACEHOLDER);
  await startSet(page, 'PLACEHOLDER Shapes and scenes');
  await skipStandardCards(page, 6);
  await expect(card(page)).toHaveAttribute('data-item-type', 'matching');

  await expect(card(page).locator('.callout')).toHaveCount(5);
  const selects = card(page).locator('select');
  await expect(selects).toHaveCount(5);
  await expect(selects.first().locator('option:not([value=""])')).toHaveCount(8); // bank includes 3 decoys

  const pick = (id: string, term: string) => page.getByLabel(`Label for callout ${id}`).selectOption(term);
  await pick('A', 'circle');
  // A label cannot be selected twice.
  await expect(page.getByLabel('Label for callout B').locator('option', { hasText: /^circle$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();
  await pick('B', 'square');
  await pick('C', 'triangle');
  await pick('D', 'pentagon'); // decoy
  await pick('E', 'star');
  await submit(page);

  await expect(card(page).locator('.feedback-status')).toHaveText('Partly correct: 4 of 5');
  await expect(card(page).locator('.callout.revealed')).toHaveCount(5);
  await expect(card(page).locator('.callout.revealed.wrong')).toHaveCount(1);
  await expect(card(page).locator('.callout[data-callout="D"] .callout-term')).toHaveText('✗ hexagon');
  await expect(card(page).locator('.callout[data-callout="A"] .callout-term')).toHaveText('✓ circle');
});

test('Rapid visual set: 8 cards in authored order, visible per-card timer, expiry recorded and retried', async ({ page }) => {
  await page.clock.install();
  await openApp(page);
  await loadFile(page, PLACEHOLDER);
  await startSet(page, 'PLACEHOLDER Rapid shapes round');

  const countdown = page.getByTestId('card-countdown');
  await expect(countdown).toHaveText('8s');
  await page.clock.runFor(3000);
  await expect(countdown).toHaveText('5s');

  // Card 1 expires: recorded as unanswered; Amy chooses to see the answer now.
  await page.clock.runFor(5200);
  await expect(card(page)).toContainText("Time's up.");
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(card(page)).toContainText('Answer: Box');
  await next(page);

  // Card 2 expires too; this time she moves on and reviews it at the end.
  await expect(card(page)).toHaveAttribute('data-item-id', 'rapid-2');
  await expect(countdown).toHaveText('6s');
  await page.clock.runFor(6200);
  await page.getByRole('button', { name: /Next card \(review at the end\)/ }).click();

  // Cards 3–8 in authored order, answered.
  const order: string[] = [];
  for (let i = 3; i <= 8; i++) {
    order.push((await card(page).getAttribute('data-item-id')) ?? '');
    await card(page).locator('input[type="radio"]').first().check();
    await submit(page);
  }
  expect(order).toEqual(['rapid-3', 'rapid-4', 'rapid-5', 'rapid-6', 'rapid-7', 'rapid-8']);

  const summary = page.getByRole('region', { name: /Summary/ });
  await expect(summary.locator('.summary-group', { hasText: 'Unanswered' }).locator('.summary-item')).toHaveCount(2);
  await expect(summary.locator('.summary-group', { hasText: 'Unanswered' })).toContainText("Time's up");

  // Retry includes both expired cards (plus any misses), in authored order.
  await summary.getByRole('button', { name: /Retry Missed and Review/ }).click();
  await expect(page.getByText(/Retry round 2/)).toBeVisible();
  await expect(card(page)).toHaveAttribute('data-item-id', 'rapid-1');
});

test('Deliberate recall: reveals the authored key and only accepts Got It or Review', async ({ page }) => {
  await openApp(page);
  await loadFile(page, PLACEHOLDER);
  await startSet(page, 'PLACEHOLDER Shapes and scenes');
  await skipStandardCards(page, 6);
  for (const [k, v] of Object.entries({ A: 'circle', B: 'square', C: 'triangle', D: 'hexagon', E: 'star' })) {
    await page.getByLabel(`Label for callout ${k}`).selectOption(v);
  }
  await submit(page);
  await next(page);

  await expect(card(page)).toHaveAttribute('data-item-type', 'recall');
  await expect(card(page).locator('textarea, input[type="text"], canvas, [contenteditable]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
  await expect(card(page).locator('.key-points')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal reference' }).click();
  await expect(card(page).locator('.key-points li')).toHaveCount(3);
  await expect(card(page).locator('svg[data-visual="scene3d/v1"]')).toBeVisible(); // reference visual
  await expect(card(page).getByRole('button')).toHaveText(['Got It', 'Review']);
  await page.getByRole('button', { name: 'Review' }).click();
  const summary = page.getByRole('region', { name: /Summary/ });
  await expect(summary.locator('.summary-group', { hasText: 'Marked Review' }).locator('.summary-item')).toHaveCount(1);
});

test('Safe math and errors: a degree trig formula evaluates as authored; bad files give readable errors', async ({ page }) => {
  await openApp(page);
  await loadFile(page, PLACEHOLDER);
  await openProblem(page, /Height gained along a ramp/);
  await start(page);
  await addStep(page, { group: 'Formula sheet', inputs: { 'Slope length': 'Ramp length', 'Slope angle': 'Ramp angle' } });
  await expect(page.getByRole('region', { name: 'My work' }).locator('.step-card .katex-mathml')).toContainText('2');
  await page.getByRole('button', { name: '← Problems' }).click();

  const cases: [string, RegExp][] = [
    ['bad-visual-asset.json', /Unsupported image data: only PNG and JPEG pictures are allowed/],
    ['invalid-callout.json', /callouts\/4\/xPct.*Must be at most 100|Must be at most 100/],
    ['undersized-label-bank.json', /The label bank has 4 term\(s\) but there are 5 callouts/],
    ['duplicate-answer-target.json', /"circle" is already the correct label for callout "A"/],
    ['unsupported-item-type.json', /Must be one of: "singleChoice", "trueFalse", "matching", "recall"/],
  ];
  for (const [file, message] of cases) {
    await loadFile(page, invalidV2(file));
    const alert = page.getByRole('alert');
    await expect(alert, file).toContainText("This file can't be opened");
    await expect(alert, file).toContainText(message);
  }
});
