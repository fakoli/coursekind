import { randomUUID } from 'node:crypto';
import { test, expect, api, login, type Lesson } from './fixtures';
import type { Workspace, WorkspaceJob, WorkspaceRevision } from '../src/types/workspace';

test('WORKSPACE-04 — quiz-only revision, study, reload and restore preserve attempts and other content', async ({
  page,
  request,
  world,
}) => {
  const workspace = await api<Workspace>(request, world.author, '/workspaces', 'POST', {
    request_id: randomUUID(),
    brief: { goal: 'Refine addition' },
    source_course_id: world.course.id,
  });
  const modulePath = `/courses/${world.course.id}/modules/${world.lessons[0].id}`;
  const before = await api<Lesson & { quiz: unknown; sandbox: unknown }>(
    request,
    world.author,
    modulePath,
  );
  await login(page, world.author);
  await page.goto(`/workspaces/${workspace.id}`);
  await page.getByText('Revise saved material · drafts and retry').click();
  const panel = page.getByRole('region', { name: 'Revise learning material' });
  await panel.getByLabel('Revision scope').selectOption('quiz');
  await panel.getByLabel('Revision target').selectOption(world.lessons[0].id);
  await panel.getByLabel('Revision count').fill('1');
  await panel.getByLabel('Revision instructions').fill('Ask one clear addition question');
  await panel.getByRole('button', { name: 'Generate scoped revision' }).click();
  await panel.getByRole('button', { name: 'Review draft 1' }).click();
  await expect(panel.getByLabel('quiz comparison')).toBeVisible();
  await expect(panel.getByLabel('content_markdown comparison')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Apply draft · free' }).click();
  await panel.getByRole('link', { name: 'Study this module' }).click();
  await page.getByRole('button', { name: /^Quiz/ }).click();
  await page.getByRole('button', { name: 'Correct 1', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Quiz' }).click();
  await expect(page.getByText(/Saved quiz attempts: 1/)).toBeVisible();
  const progressPath = `/progress/modules/${world.course.id}/${world.lessons[0].id}`;
  const studied = await api<{ quiz_attempts: number }>(request, world.author, progressPath);
  expect(studied.quiz_attempts).toBe(1);
  await page.goto(`/workspaces/${workspace.id}`);
  await page.reload();
  await page.getByText('History · compare and restore').click();
  const history = page.getByRole('region', { name: 'Workspace history' });
  await history.getByRole('button', { name: 'Restore prior content · free' }).click();
  await expect(history.getByText('Restored as a new history entry.')).toBeVisible();
  const restored = await api<Lesson & { quiz: unknown; sandbox: unknown }>(
    request,
    world.author,
    modulePath,
  );
  expect(restored.quiz).toEqual(before.quiz);
  expect(restored.content_markdown).toEqual(before.content_markdown);
  expect(restored.flashcards).toEqual(before.flashcards);
  expect(restored.sandbox).toEqual(before.sandbox);
  expect(
    (await api<{ quiz_attempts: number }>(request, world.author, progressPath)).quiz_attempts,
  ).toBe(1);
  const revisions = await api<WorkspaceRevision[]>(
    request,
    world.author,
    `/workspaces/${workspace.id}/history`,
  );
  expect(revisions).toHaveLength(2);
  expect(revisions[0].parent_revision_id).toBe(revisions[1].id);
});

test('WORKSPACE-04 — a baseline edit in a second tab rejects stale apply and keeps the proposal', async ({
  page,
  request,
  world,
  context,
}) => {
  const workspace = await api<Workspace>(request, world.author, '/workspaces', 'POST', {
    request_id: randomUUID(),
    brief: { goal: 'Revise safely' },
    source_course_id: world.course.id,
  });
  await login(page, world.author);
  await page.goto(`/workspaces/${workspace.id}`);
  await page.getByText('Revise saved material · drafts and retry').click();
  const panel = page.getByRole('region', { name: 'Revise learning material' });
  await panel.getByLabel('Revision scope').selectOption('quiz');
  await panel.getByLabel('Revision count').fill('1');
  await panel.getByLabel('Revision instructions').fill('Ask a clearer question');
  await panel.getByRole('button', { name: 'Generate scoped revision' }).click();
  await panel.getByRole('button', { name: 'Review draft 1' }).click();
  const jobs = await api<WorkspaceJob[]>(request, world.author, `/workspaces/${workspace.id}/jobs`);
  const target = jobs[0].steps[0].target!;
  const other = await context.newPage();
  await other.goto(`/courses/${target.course_id}/modules/${target.resource_id}/edit`);
  await other.getByLabel('Module content Markdown').fill('# Manual edit from another tab');
  await other.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(other.getByText('Module updated successfully')).toBeVisible();
  await panel.getByRole('button', { name: 'Apply draft · free' }).click();
  await expect(panel.getByRole('alert')).toContainText('Your draft is kept');
  await expect(panel.getByLabel('quiz comparison')).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Regenerate against current version' }),
  ).toBeEnabled();
  expect(
    (
      await api<Lesson>(
        request,
        world.author,
        `/courses/${target.course_id}/modules/${target.resource_id}`,
      )
    ).content_markdown,
  ).toBe('# Manual edit from another tab');
  expect(
    await api<WorkspaceRevision[]>(request, world.author, `/workspaces/${workspace.id}/history`),
  ).toHaveLength(0);
  await other.close();
});
