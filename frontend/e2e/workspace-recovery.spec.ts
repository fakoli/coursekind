import { randomUUID } from 'node:crypto';
import { test, expect, api, control, login, signOut } from './fixtures';
import type { Workspace, WorkspaceJob } from '../src/types/workspace';

test('WORKSPACE-03 — partial build survives reload and explicit retry preserves the first draft', async ({
  page,
  request,
  world,
}) => {
  const workspace = await api<Workspace>(request, world.author, '/workspaces', 'POST', {
    request_id: randomUUID(),
    brief: { goal: 'Recover a small build' },
    source_course_id: world.course.id,
  });
  await login(page, world.author);
  await page.goto(`/workspaces/${workspace.id}`);
  const panel = page.getByRole('region', { name: 'Build learning material' });
  await panel.getByRole('checkbox', { name: 'Variables · has a lesson' }).check();
  await panel.getByRole('checkbox', { name: 'Functions · has a lesson' }).check();
  await panel.getByLabel('Generate flashcards', { exact: true }).uncheck();
  await panel.getByLabel('Generate quiz', { exact: true }).uncheck();
  await control(request, { fail_after_calls: 1 });
  await panel.getByRole('button', { name: 'Build selected modules' }).click();
  await expect(panel.getByText(/Build: partial/)).toBeVisible();
  await expect(panel.getByText(/Provider temporarily unavailable \(HTTP 503\)/)).toBeVisible();
  const before = await api<WorkspaceJob[]>(
    request,
    world.author,
    `/workspaces/${workspace.id}/jobs`,
  );
  await page.reload();
  await expect(panel.getByRole('button', { name: 'Review draft 1' })).toBeVisible();
  await control(request, { fail_after_calls: null });
  await panel.getByLabel('Retry step 2').focus();
  await page.keyboard.press('Space');
  await expect(panel.getByText(/external charges/)).toBeVisible();
  await panel.getByRole('button', { name: 'Retry selected steps' }).click();
  await expect(panel.getByText(/Build: ready/)).toBeVisible();
  const after = await api<WorkspaceJob[]>(
    request,
    world.author,
    `/workspaces/${workspace.id}/jobs`,
  );
  expect(after[0].steps[0].output_ref).toBe(before[0].steps[0].output_ref);
  expect(after[0].steps.map((s) => s.attempt)).toEqual([1, 2]);
  expect(after[0].steps.map((s) => s.credits)).toEqual([25, 25]);
});

test('WORKSPACE-06 — mobile keyboard sections preserve drafts and account switch removes private material', async ({
  page,
  request,
  world,
}) => {
  const workspace = await api<Workspace>(request, world.author, '/workspaces', 'POST', {
    request_id: randomUUID(),
    brief: { goal: 'Private mobile goal' },
    source_course_id: world.course.id,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, world.author);
  await page.goto(`/workspaces/${workspace.id}`);
  await expect(page.getByRole('link', { name: 'Next: build or recover a lesson' })).toBeVisible();
  await page.getByRole('link', { name: 'Brief', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Learning goal').fill('Unsaved private mobile draft');
  await page.getByText('Saved brief · edit goal and defaults').click();
  await page.getByRole('link', { name: 'Brief', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Learning goal')).toHaveValue('Unsaved private mobile draft');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  // 200% text sizing is paired with root-owned actual browser zoom acceptance.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await page.getByRole('link', { name: 'Build', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Build selected modules' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await signOut(page);
  await login(page, world.outsider);
  await page.goto(`/workspaces/${workspace.id}`);
  await expect(page.getByText('Workspace unavailable')).toBeVisible();
  await expect(page.getByText('Private mobile goal', { exact: true })).toHaveCount(0);
  await expect(page.locator('input[value="Unsaved private mobile draft"]')).toHaveCount(0);
});

test('WORKSPACE-06 — disabled workspace writes preserve baseline navigation and typed goal', async ({
  page,
  world,
}) => {
  await login(page, world.author);
  await page.route('**/api/v1/workspaces', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Workspace changes are currently disabled',
        }),
      });
    else await route.continue();
  });
  await page.goto('/workspaces');
  await page.getByLabel('Learning goal').fill('Keep through rollback');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('alert')).toContainText('disabled');
  await expect(page.getByLabel('Learning goal')).toHaveValue('Keep through rollback');
  await page.goto(`/courses/${world.course.id}/modules/${world.lessons[0].id}`);
  await expect(
    page.getByRole('heading', { name: world.lessons[0].title, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mark content read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Content read — study again' })).toBeVisible();
});
