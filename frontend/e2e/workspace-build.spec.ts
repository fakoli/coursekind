import { randomUUID } from 'node:crypto';
import { test, expect, api, login, type Lesson, type Path } from './fixtures';
import type { Workspace, WorkspaceJob } from '../src/types/workspace';

test('WORKSPACE-01 — goal, reviewable plan, first draft, explicit apply and study survive reload', async ({
  page,
  request,
  world,
}) => {
  await login(page, world.author);
  await page.goto('/workspaces');
  await page.getByLabel('Learning goal').fill('Understand addition through examples');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/workspaces\/[^/]+$/);
  const workspaceURL = page.url();
  const id = workspaceURL.split('/').pop()!;
  await page.getByRole('button', { name: 'Generate plan', exact: true }).click();
  await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue(
    'Addition learning plan',
  );
  expect(
    (await api<Workspace>(request, world.author, `/workspaces/${id}`)).course_ids,
  ).toHaveLength(0);
  await page.getByLabel('Assumptions (one per line)').fill('I can count to ten');
  await page.getByRole('button', { name: 'Save plan edits · free' }).click();
  await expect(page.getByRole('button', { name: 'Apply plan · free' })).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel('Assumptions (one per line)')).toHaveValue('I can count to ten');
  await page.getByRole('button', { name: 'Apply plan · free' }).click();
  await expect(page.getByText('Applied plan · reopen to review or refine')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Planned lesson 1 · incomplete' })).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Planned lesson 2 · incomplete' }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Build selected modules' }).click();
  await expect(page.getByRole('button', { name: 'Review draft 1' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Review draft 1' }).click();
  await expect(page.getByRole('heading', { name: 'Generated lesson', exact: true })).toBeVisible();
  const jobs = await api<WorkspaceJob[]>(request, world.author, `/workspaces/${id}/jobs`);
  const target = jobs.find((j) => j.kind === 'build')!.steps[0].target!;
  const moduleURL = `/courses/${target.course_id}/modules/${target.resource_id}`;
  expect((await api<Lesson>(request, world.author, moduleURL)).content_markdown).toBe('');
  await page.getByRole('button', { name: 'Dismiss review' }).click();
  expect((await api<Lesson>(request, world.author, moduleURL)).content_markdown).toBe('');
  await page.getByRole('button', { name: 'Review draft 1' }).click();
  await page.getByRole('button', { name: 'Apply draft · free' }).click();
  await page.getByRole('link', { name: 'Study this module' }).click();
  await expect(page).toHaveURL(moduleURL);
  await expect(page.getByRole('heading', { name: 'Generated lesson', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark content read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Content read — study again' })).toBeVisible();
  expect(
    (await api<{ token_balance: number }>(request, world.author, '/auth/me')).token_balance,
  ).toBe(65);
});

test('WORKSPACE-02 — mixed new and explicitly reused courses preserve original authorship', async ({
  page,
  request,
  world,
}) => {
  const workspace = await api<Workspace>(request, world.author, '/workspaces', 'POST', {
    request_id: randomUUID(),
    brief: { goal: 'Learn addition and design', scope: 'path' },
  });
  await login(page, world.author);
  await page.goto(`/workspaces/${workspace.id}`);
  await page
    .getByRole('checkbox', { name: `${world.otherCourse.title} · Learner`, exact: true })
    .check();
  await page.getByRole('button', { name: 'Generate plan', exact: true }).click();
  await expect(page.getByText(/Reuse selected course:/)).toContainText(world.otherCourse.title);
  await page.getByRole('button', { name: 'Apply plan · free' }).click();
  await expect(page.getByText('Applied plan · reopen to review or refine')).toBeVisible();
  const saved = await api<Workspace>(request, world.author, `/workspaces/${workspace.id}`);
  expect(saved.course_ids).toContain(world.otherCourse.id);
  const path = await api<{ path: Path }>(request, world.author, `/paths/${saved.path_id}`);
  expect(path.path.course_ids).toEqual(saved.course_ids);
  const source = await api<{ course: { author_id: string } }>(
    request,
    world.author,
    `/courses/${world.otherCourse.id}`,
  );
  expect(source.course.author_id).toBe(world.learner.id);
  await page.reload();
  await expect(
    page.getByRole('link', { name: world.otherCourse.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Design · has a lesson', exact: true }),
  ).toHaveCount(0);
});
