import { test, expect, login, api, apiURL, control, readLesson, saveModule, stat, type Persona, type Course, type Lesson } from './fixtures';
import type { Page } from '@playwright/test';

async function cards(page: Page, course: Course, lesson: Lesson) {
  await page.goto(`/courses/${course.id}/modules/${lesson.id}/edit`);
  await page.getByRole('button', { name: /^Flashcards/ }).click();
  await page.getByRole('button', { name: 'Generate with AI', exact: true }).click();
  await page.getByRole('dialog', { name: 'Replace Flashcards?' }).getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.getByPlaceholder('What is the question?').first()).toHaveValue('Generated card 1');
  await saveModule(page);
  await page.reload();
  await page.getByRole('button', { name: /^Flashcards/ }).click();
  await expect(page.getByPlaceholder('What is the question?').first()).toHaveValue('Generated card 1');
}
async function chooseProvider(page: Page, provider: string, model: string, key?: string) {
  await page.goto('/settings');
  await page.getByLabel('Provider', { exact: true }).selectOption(provider);
  if (key) {
    await page.getByLabel('API key', { exact: true }).fill(key);
    await page.getByRole('button', { name: 'Validate credential' }).click();
  }
  await expect(page.getByLabel('Model', { exact: true }).locator(`option[value="${model}"]`)).toHaveCount(1);
  await page.getByLabel('Model', { exact: true }).selectOption(model);
  await page.getByRole('button', { name: 'Save AI preferences' }).click();
  await expect(page.getByText(new RegExp(`Selected: ${provider} / ${model}\\.`))).toBeVisible();
}

test('STATS-01 — real reading sessions group by inactivity and leave rolling week', async ({ page, request, world }) => {
  await login(page, world.learner);
  await page.goto('/');
  await stat(page, 'Study Sessions · Last 7 Days', 0);
  await readLesson(page, world.otherCourse, world.otherLesson);
  await control(request, { now: '2026-10-26T12:30:00+00:00' });
  await readLesson(page, world.otherCourse, world.otherLesson);
  await page.goto('/');
  await stat(page, 'Study Sessions · Last 7 Days', 1);
  await control(request, { now: '2026-10-26T13:00:01+00:00' });
  await readLesson(page, world.otherCourse, world.otherLesson);
  await page.goto('/');
  await stat(page, 'Study Sessions · Last 7 Days', 2);
  await page.reload();
  await stat(page, 'Study Sessions · Last 7 Days', 2);
  await control(request, { now: '2026-11-03T13:00:02+00:00' });
  await page.reload();
  await stat(page, 'Study Sessions · Last 7 Days', 0);
});

test('STATS-02 — same-day repeats, consecutive dates, gap and historical longest streak', async ({ page, request, world }) => {
  await login(page, world.learner);
  for (const day of ['20', '21', '22']) {
    await control(request, { now: `2026-10-${day}T12:00:00+00:00` });
    await readLesson(page, world.otherCourse, world.otherLesson);
  }
  await readLesson(page, world.otherCourse, world.otherLesson);
  await page.goto('/');
  await stat(page, 'Current Streak', 3); await stat(page, 'Longest Streak', 3);
  await control(request, { now: '2026-10-24T12:00:00+00:00' });
  await page.reload();
  await stat(page, 'Current Streak', 0); await stat(page, 'Longest Streak', 3);
  await readLesson(page, world.otherCourse, world.otherLesson);
  await page.goto('/');
  await stat(page, 'Current Streak', 1); await stat(page, 'Longest Streak', 3);
});

test('STATS-03 — started course and selected paths differ from ownership and completion', async ({ page, world, request }) => {
  await api(request, world.author, `/paths/${world.path.id}`, 'PUT', { visibility: 'public' });
  await login(page, world.learner);
  await readLesson(page, world.otherCourse, world.otherLesson);
  await page.goto(`/paths/${world.path.id}`);
  await page.getByRole('button', { name: 'Follow path' }).click();
  await expect(page.getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible();
  await page.goto('/');
  await stat(page, 'Courses In Progress', 1); await stat(page, 'Selected Paths', 1);
  await page.goto(`/courses/${world.otherCourse.id}/modules/${world.otherLesson.id}`);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page).toHaveURL(`/courses/${world.otherCourse.id}`);
  await page.goto('/');
  await stat(page, 'Courses In Progress', 0); await stat(page, 'Selected Paths', 1);
  await page.goto(`/paths/${world.path.id}`);
  await page.getByRole('button', { name: 'Unfollow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Follow path' })).toBeVisible();
  await page.goto('/');
  await page.reload();
  await stat(page, 'Selected Paths', 0);
});

test('STATS-04 — activity and scores survive navigation, login and account isolation', async ({ page, world }) => {
  await login(page, world.learner);
  await readLesson(page, world.otherCourse, world.otherLesson);
  await page.getByRole('button', { name: /^Quiz/ }).click();
  await page.getByRole('button', { name: 'Five', exact: true }).click();
  await page.getByRole('button', { name: 'Eight', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Quiz' }).click();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();
  await stat(page, 'Quiz Average', 100);
  await page.reload();
  await stat(page, 'Study Sessions · Last 7 Days', 1);
  await login(page, world.outsider);
  await stat(page, 'Study Sessions · Last 7 Days', 0);
  await login(page, world.learner);
  await stat(page, 'Quiz Average', 100);
  await page.goto(`/courses/${world.otherCourse.id}/modules/${world.otherLesson.id}`);
  await page.getByRole('button', { name: /^Quiz/ }).click();
  await expect(page.getByText(/Saved quiz attempts: 1/)).toBeVisible();
});

test('AI-01 — default Anvil needs no personal key and generated content persists', async ({ page, world, request }) => {
  await login(page, world.author);
  await page.goto('/settings');
  await expect(page.getByText(/Selected: anvil \/ llm.primary/)).toBeVisible();
  await expect(page.getByLabel('API key', { exact: true })).toHaveCount(0);
  const before = await api<Persona & {token_balance: number}>(request, world.author, '/auth/me');
  await cards(page, world.course, world.lessons[0]);
  const after = await api<Persona & {token_balance: number}>(request, world.author, '/auth/me');
  expect(after.token_balance).toBe(before.token_balance - 8);
  const captured = await (await request.get(`${apiURL}/__test/state`)).json();
  expect(captured.calls.at(-1)).toMatchObject({ host: 'anvil.invalid', model: 'llm.primary' });
});

test('AI-02 — save secondary Anvil model and use it after reload without changing other users', async ({ page, world, request }) => {
  await login(page, world.author);
  await chooseProvider(page, 'anvil', 'llm.secondary');
  await page.reload();
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('llm.secondary');
  await cards(page, world.course, world.lessons[0]);
  const captured = await (await request.get(`${apiURL}/__test/state`)).json();
  expect(captured.calls.at(-1)).toMatchObject({ model: 'llm.secondary' });
  await login(page, world.learner);
  await page.goto('/settings');
  await expect(page.getByText(/Selected: anvil \/ llm.primary/)).toBeVisible();
});

test('AI-03 — validate each external provider, persist choice and generate with zero app debit', async ({ page, world, request }) => {
  await login(page, world.author);
  const before = await api<{token_balance: number}>(request, world.author, '/auth/me');
  for (const [provider, model, host] of [
    ['openai', 'gpt-test', 'api.openai.com'], ['gemini', 'gemini-test', 'generativelanguage.googleapis.com'], ['anthropic', 'claude-test', 'api.anthropic.com'],
  ]) {
    await chooseProvider(page, provider, model, 'synthetic-provider-credential-1234');
    await page.reload();
    await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
    await expect(page.getByText(/Saved credential:.*1234/)).toBeVisible();
    await cards(page, world.course, world.lessons[0]);
    const captured = await (await request.get(`${apiURL}/__test/state`)).json();
    expect(captured.calls.at(-1)).toMatchObject({ host });
  }
  const after = await api<{token_balance: number}>(request, world.author, '/auth/me');
  expect(after.token_balance).toBe(before.token_balance);
});

test('AI-04 — replace and remove credential, explicitly return to Anvil and generate', async ({ page, world }) => {
  await login(page, world.author);
  await chooseProvider(page, 'openai', 'gpt-test', 'synthetic-old-key-1111');
  await chooseProvider(page, 'openai', 'gpt-test', 'synthetic-new-key-2222');
  await expect(page.getByText(/Saved credential:.*2222/)).toBeVisible();
  await page.getByRole('button', { name: 'Remove saved credential' }).click();
  await expect(page.getByText('No saved credential for this provider.')).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Credential not configured/)).toBeVisible();
  await chooseProvider(page, 'anvil', 'llm.primary');
  await cards(page, world.course, world.lessons[0]);
});

test('AI-05 — unavailable and malformed generation retain draft, retry once with one debit', async ({ page, world, request }) => {
  await login(page, world.author);
  const before = await api<{token_balance: number}>(request, world.author, '/auth/me');
  await page.goto(`/courses/${world.course.id}/modules/${world.lessons[0].id}/edit`);
  await page.getByLabel('Module Title').fill('Unsaved draft survives');
  await page.getByRole('button', { name: /^Flashcards/ }).click();
  for (const fault of ['unavailable', 'malformed']) {
    await control(request, { fault });
    await page.getByRole('button', { name: 'Generate with AI', exact: true }).click();
    await expect(page.getByText(/failed|invalid|unavailable/i).last()).toBeVisible();
    await expect(page.getByLabel('Module Title')).toHaveValue('Unsaved draft survives');
    await expect(page.getByPlaceholder('What is the question?')).toHaveCount(2);
    expect((await api<{token_balance: number}>(request, world.author, '/auth/me')).token_balance).toBe(before.token_balance);
  }
  await control(request, { fault: null });
  await page.getByRole('button', { name: 'Generate with AI', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace', exact: true }).click();
  await saveModule(page);
  await page.reload();
  await expect(page.getByLabel('Module Title')).toHaveValue('Unsaved draft survives');
  expect((await api<{token_balance: number}>(request, world.author, '/auth/me')).token_balance).toBe(before.token_balance - 8);
});

test('SUPPORT-01 — persist notification preferences, validate phone and report unavailable transport', async ({ page, world, request }) => {
  await login(page, world.author);
  await page.goto('/settings');
  const email = page.getByRole('switch', { name: 'Email notifications' });
  const original = await email.getAttribute('aria-checked');
  await email.click();
  await expect(email).toHaveAttribute('aria-checked', original === 'true' ? 'false' : 'true');
  await page.getByLabel('Phone Number').fill('123');
  await page.getByRole('button', { name: 'Save Number' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /international|E.164/ })).toBeVisible();
  await page.getByLabel('Phone Number').fill('+12025550123');
  await page.getByRole('button', { name: 'Save Number' }).click();
  await expect(page.getByRole('switch', { name: 'SMS notifications' })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByLabel('Phone Number')).toHaveValue('+12025550123');
  await expect(page.getByRole('button', { name: 'Test Email' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Test SMS' })).toBeDisabled();
  await expect(page.getByText('Email delivery is unavailable: the server email provider is not configured.')).toBeVisible();
  await login(page, world.learner);
  await page.goto('/settings');
  await expect(page.getByLabel('Phone Number')).toHaveValue('');
  const captured = await (await request.get(`${apiURL}/__test/state`)).json();
  expect(captured.deliveries).toEqual([]);
});

test('SUPPORT-02 — mobile navigation, keyboard tabs/dialogs and missing-route recovery', async ({ page, world }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page, world.author);
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Courses', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible();
  for (const url of [`/courses/${world.course.id}`, `/paths/${world.path.id}`, `/courses/${world.course.id}/modules/${world.lessons[0].id}/edit`, `/courses/${world.course.id}/modules/${world.lessons[0].id}`]) {
    await page.goto(url);
    await expect(page.getByRole('heading').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.goto(`/courses/${world.course.id}/modules/${world.lessons[0].id}/edit`);
  const sandbox = page.getByRole('button', { name: 'Sandbox', exact: true });
  await sandbox.focus();
  await page.keyboard.press('Space');
  await expect(sandbox).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Code Sandbox Configuration')).toBeVisible();
  await page.goto(`/paths/${world.path.id}`);
  await page.getByRole('button', { name: 'Delete', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Delete Learning Path' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/courses/does-not-exist');
  await expect(page.getByText('Course not found')).toBeVisible();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
  expect(errors).toEqual([]);
});
