import { expect, test } from '@playwright/test';
import { addStep, ENGR206, invalidFixture, loadFile, MECHANICS, openApp, openProblem, start } from './helpers';

// Acceptance criteria from docs/handoff/Guided_Test_Prep_Local_Offline_SOW_v0.2.md, each demonstrated
// against the delivered dist/index.html opened over file:// with the network disabled.

test('AC1: the double-clicked index.html shows the home screen with no server or network', async ({ page }) => {
  const external = await openApp(page);
  await expect(page.getByRole('button', { name: 'Load Test' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ENGR 206' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mechanics of Materials' })).toBeVisible();
  expect(page.url()).toMatch(/^file:/);
  expect(external).toEqual([]);
});

test('AC2: loads either reference file from the file picker, and explains an invalid file', async ({ page }) => {
  await openApp(page);

  await loadFile(page, ENGR206);
  await expect(page.getByRole('heading', { name: 'ENGR 206 Local Guided Practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Voltage divider with a unit conversion/ })).toBeVisible();

  await loadFile(page, MECHANICS);
  await expect(page.getByRole('heading', { name: 'Mechanics of Materials Local Guided Practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: /double-lap bolt group/ })).toBeVisible();

  await loadFile(page, invalidFixture('unknown-formula.json'));
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("This file can't be opened");
  await expect(alert).toContainText('/problems/0/solutionPath/2/formulaId');
  await expect(alert).toContainText('Formula "ohms_law_current" is not in the formula sheet');

  await loadFile(page, invalidFixture('not-json.json'));
  await expect(page.getByRole('alert')).toContainText('Not valid JSON');
});

test('AC3: start, pause and finish the elapsed timer', async ({ page }) => {
  await page.clock.install();
  await openApp(page);
  await page.getByRole('button', { name: 'ENGR 206' }).click();
  await openProblem(page, /Resistor voltage and power/);
  const timer = page.getByTestId('timer');
  await expect(timer).toHaveText('00:00');

  await start(page);
  await page.clock.runFor(65_000);
  await expect(timer).toHaveText('01:05');

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.clock.runFor(30_000);
  await expect(timer).toHaveText('01:05');

  await page.getByRole('button', { name: 'Resume' }).click();
  await page.clock.runFor(10_000);
  await page.getByRole('button', { name: 'Finish and reveal path' }).click();
  await expect(timer).toHaveText('01:15');
  await page.clock.runFor(60_000);
  await expect(timer).toHaveText('01:15');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);
});

test('AC4: prompt, givens, formula sheet, 2D and 3D visuals render offline', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Mechanics of Materials' }).click();

  await openProblem(page, /double-lap bolt group/);
  await expect(page.locator('.prompt')).toContainText('double-lap connection transfers a 120 kN load');
  await expect(page.locator('.given-list .katex').first()).toBeVisible();
  await expect(page.locator('.formula-card .katex').first()).toBeVisible();
  const diagram = page.locator('svg[data-visual="diagram2d/v1"]');
  await expect(diagram).toBeVisible();
  await expect(diagram).toHaveAttribute('aria-label', /double-lap bolted connection/);
  await expect(diagram.locator('rect')).toHaveCount(3);
  await expect(diagram.locator('circle')).toHaveCount(4);
  await expect(diagram).toContainText('V = 120 kN');
  // KaTeX fonts come from inlined data: URIs, so math renders with the network off.
  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.includes('KaTeX') && f.status === 'loaded');
  });
  expect(fontsLoaded).toBe(true);

  await page.getByRole('button', { name: '← Problems' }).click();
  await openProblem(page, /Axial deformation/);
  const scene = page.locator('svg[data-visual="scene3d/v1"]');
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute('aria-label', /prismatic bar aligned with the x axis/);
  await expect(scene.locator('polygon.sc-solid')).toHaveCount(3); // three visible box faces
  await expect(scene.locator('polygon.sc-plane')).toHaveCount(1);
  for (const label of ['x', 'y', 'z', 'steel bar', 'fixed support', 'P = 60 kN']) {
    await expect(scene.locator('text', { hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
  }
  await page.getByText('Describe this picture').click();
  await expect(page.locator('.alt-text p')).toContainText('fixed support is on the left');
});

test('AC5-7, AC9: formula, basic math and conversion from dropdowns; rename and reuse; finish reveals the full path', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'ENGR 206' }).click();
  await openProblem(page, /Voltage divider with a unit conversion/);
  await start(page);

  // AC7: declared unit conversion, no typing.
  await addStep(page, { group: 'Unit conversion', inputs: { 'Value in kΩ': 'Resistor R2' } });
  const work = page.getByRole('region', { name: 'My work' });
  await expect(work.locator('.step-card').nth(0)).toContainText('Resistance 1');
  await expect(work.locator('.step-card').nth(0)).toContainText('2000');

  // AC6: automatic name, then rename; the new name appears in later dropdowns.
  await work.getByRole('button', { name: 'Rename Resistance 1' }).click();
  await work.getByLabel('Name').fill('R2 in ohms');
  await work.getByRole('button', { name: 'Save' }).click();
  await expect(work).toContainText('R2 in ohms');

  // AC7: basic math (add) using a given and the renamed result.
  await addStep(page, { group: 'Basic math', operation: 'Add (a + b)', inputs: { 'First value': 'Resistor R1', 'Second value': 'R2 in ohms' } });
  await expect(work.locator('.step-card').nth(1)).toContainText('Result 1');
  await expect(work.locator('.step-card').nth(1)).toContainText('3000');

  // AC5: formula step whose inputs include givens and previous outputs.
  await addStep(page, {
    group: 'Formula sheet',
    inputs: { 'Source voltage': 'Source voltage', 'Load resistance': 'R2 in ohms', 'Total series resistance': 'Result 1' },
  });
  await expect(work.locator('.step-card').nth(2)).toContainText('Output voltage 1');
  await expect(work.locator('.step-card').nth(2).locator('.katex-mathml')).toContainText('8');

  await addStep(page, { group: 'Final answer', inputs: { Answer: 'Output voltage 1' } });
  await expect(work).toContainText('Final answer');

  // AC9: finish stops the timer and shows the full approved path with every explanation field.
  await page.getByRole('button', { name: 'Finish and reveal path' }).click();
  const review = page.getByRole('region', { name: 'Correct path' });
  await expect(review.locator('.path-step')).toHaveCount(1);
  await review.getByRole('button', { name: /Reveal next step/ }).click();
  await expect(review.locator('.path-step')).toHaveCount(2);
  await review.getByRole('button', { name: 'Show all' }).click();
  await expect(review.locator('.path-step')).toHaveCount(4);
  for (const label of ['Why now', 'What to notice', 'Why this operation', 'What the inputs mean', 'What the result unlocks']) {
    await expect(review.locator('dt', { hasText: label })).toHaveCount(4);
  }
  await expect(review.locator('.badge-ok')).toHaveCount(4);
  await expect(review).toContainText('You reached 4 of 4 path results');
  await expect(page.getByRole('region', { name: 'Add Step' })).toHaveCount(0);
});

test('AC8: pre-authored derivative shows its stored result and explanation', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'ENGR 206' }).click();
  await openProblem(page, /Velocity from a position function/);
  await start(page);
  await addStep(page, { group: 'Derivative' });
  const card = page.getByRole('region', { name: 'My work' }).locator('.step-card').first();
  await expect(card.locator('.katex-mathml').first()).toContainText('6t+2');
  await expect(card).toContainText('Velocity at 4 seconds');
  await expect(card).toContainText('Why now');
  await expect(card).toContainText('instantaneous velocity, which is the slope of the position function');

  // The numeric evaluation is reusable as a final answer.
  await addStep(page, { group: 'Final answer', inputs: { Answer: 'Velocity at 4 seconds' } });
});

test('AC10: reset clears only the active attempt; loading a new test replaces the old one', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'ENGR 206' }).click();
  await openProblem(page, /Resistor voltage and power/);
  await start(page);
  await addStep(page, { group: 'Formula sheet', operation: "Ohm's law voltage form", inputs: { Current: 'Branch current', Resistance: 'Resistor value' } });
  const work = page.getByRole('region', { name: 'My work' });
  await expect(work.locator('.step-card')).toHaveCount(1);

  await page.getByRole('button', { name: 'Reset problem' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(work.locator('.step-card')).toHaveCount(0);
  await expect(page.getByTestId('timer')).toHaveText('00:00');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  // The test itself is still loaded.
  await page.getByRole('button', { name: '← Problems' }).click();
  await expect(page.getByRole('heading', { name: 'ENGR 206 Local Guided Practice' })).toBeVisible();

  await loadFile(page, MECHANICS);
  await expect(page.getByRole('heading', { name: 'Mechanics of Materials Local Guided Practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Resistor voltage and power/ })).toHaveCount(0);
});
