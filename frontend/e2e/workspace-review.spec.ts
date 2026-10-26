import { randomUUID } from 'node:crypto';
import { test, expect, api, apiURL, control, login } from './fixtures';
import type {
  ChangeSet,
  MaterialReview,
  ReviewSources,
  Workspace,
  WorkspaceRevision,
} from '../src/types/workspace';

test('WORKSPACE-05 — explicit TypeSafe disclosure, cache and identical-content restore staleness', async ({
  page,
  request,
  world,
}) => {
  const path = `/courses/${world.course.id}/modules/${world.lessons[0].id}`;
  await api(request, world.author, path, 'PUT', {
    objectives: ['Add numbers'],
  });
  const workspace = await api<Workspace>(request, world.author, '/workspaces', 'POST', {
    request_id: randomUUID(),
    brief: { goal: 'Review addition' },
    source_course_id: world.course.id,
  });
  await login(page, world.author);
  await page.goto(`/workspaces/${workspace.id}`);
  await page.getByText('Review with Jev · optional advisory').click();
  const panel = page.getByRole('region', {
    name: 'Material advisory review',
    exact: true,
  });
  await panel.getByRole('button', { name: 'Select material for TypeSafe review' }).click();
  await panel.getByLabel('Review module').selectOption(world.lessons[0].id);
  await expect(panel.getByLabel('Selected lesson excerpt')).toHaveValue(
    world.lessons[0].content_markdown,
  );
  await expect(panel.getByText('Two plus three?')).toBeVisible();
  await expect(panel.getByText('Five · Marked answer')).toBeVisible();
  const calls = async () =>
    (
      (await (await request.get(`${apiURL}/__test/state`)).json()) as {
        calls: { host: string }[];
      }
    ).calls.filter((c) => c.host === 'api.typesafe.ai');
  expect(await calls()).toHaveLength(0);
  const posted = page.waitForResponse(
    (r) => r.url().endsWith('/reviews') && r.request().method() === 'POST',
  );
  await panel
    .getByRole('button', {
      name: 'Send selected material to TypeSafe for review',
    })
    .click();
  const result = (await (await posted).json()) as MaterialReview;
  await expect(panel.getByText('Advisory', { exact: true })).toBeVisible();
  await expect(panel.getByText('Answer supported: 90%')).toBeVisible();
  expect(await calls()).toHaveLength(1);
  const cachedResponse = page.waitForResponse(
    (r) => r.url().endsWith('/reviews') && r.request().method() === 'POST',
  );
  await panel
    .getByRole('button', {
      name: 'Send selected material to TypeSafe for review',
    })
    .click();
  expect((await cachedResponse).ok()).toBeTruthy();
  await expect(panel.getByRole('status', { name: 'Material review result' })).toBeFocused();
  expect(await calls()).toHaveLength(1);
  const source = (
    await api<ReviewSources>(request, world.author, `/workspaces/${workspace.id}/review-sources`)
  ).sources.find((s) => s.snapshot.target.resource_id === world.lessons[0].id)!;
  const change = await api<ChangeSet>(
    request,
    world.author,
    `/workspaces/${workspace.id}/changes`,
    'POST',
    {
      request_id: randomUUID(),
      patches: [
        {
          target: source.snapshot.target,
          expected_fingerprint: source.snapshot.fingerprint,
          fields: { content_markdown: 'Changed temporarily.' },
        },
      ],
    },
  );
  await api(
    request,
    world.author,
    `/workspaces/${workspace.id}/changes/${change.id}/apply`,
    'POST',
    { request_id: randomUUID() },
  );
  const revision = (
    await api<WorkspaceRevision[]>(request, world.author, `/workspaces/${workspace.id}/history`)
  )[0];
  await api(
    request,
    world.author,
    `/workspaces/${workspace.id}/history/${revision.id}/restore`,
    'POST',
    {
      request_id: randomUUID(),
      expected_current_fingerprint: revision.current_fingerprint,
    },
  );
  const stale = await api<MaterialReview>(
    request,
    world.author,
    `/workspaces/${workspace.id}/reviews/${result.id}`,
  );
  expect(stale.state).toBe('stale');
  await expect(panel.getByText('Review stale. The material or selection has changed.')).toBeVisible(
    { timeout: 15000 },
  );
  await panel.getByRole('button', { name: 'Review current material' }).click();
  expect(await calls()).toHaveLength(1);
  await expect(panel.getByLabel('Selected lesson excerpt')).toHaveValue(
    world.lessons[0].content_markdown,
  );
});

test('WORKSPACE-05 — unavailable and malformed advisory retain material, explicit retry works', async ({
  page,
  request,
  world,
}) => {
  const path = `/courses/${world.course.id}/modules/${world.lessons[0].id}`;
  await api(request, world.author, path, 'PUT', {
    objectives: ['Add numbers'],
  });
  const before = await api(request, world.author, path);
  const workspace = await api<Workspace>(request, world.author, '/workspaces', 'POST', {
    request_id: randomUUID(),
    brief: { goal: 'Optional review' },
    source_course_id: world.course.id,
  });
  await control(request, { review_fault: 'unavailable' });
  await login(page, world.author);
  await page.goto(`/workspaces/${workspace.id}`);
  await page.getByText('Review with Jev · optional advisory').click();
  const panel = page.getByRole('region', {
    name: 'Material advisory review',
    exact: true,
  });
  await panel.getByRole('button', { name: 'Select material for TypeSafe review' }).click();
  await panel.getByLabel('Review module').selectOption(world.lessons[0].id);
  await panel
    .getByRole('button', {
      name: 'Send selected material to TypeSafe for review',
    })
    .click();
  await expect(panel.getByText('Review unavailable. Your material is kept.')).toBeVisible();
  await control(request, { review_fault: 'malformed' });
  await panel.getByRole('button', { name: 'Retry TypeSafe review' }).click();
  await expect(panel.getByText('Advisory', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Retry TypeSafe review' })).toBeEnabled();
  await control(request, { review_fault: null });
  await panel.getByRole('button', { name: 'Retry TypeSafe review' }).click();
  await expect(panel.getByText('Objective aligned: 80%')).toBeVisible();
  expect(await api(request, world.author, path)).toEqual(before);
});
