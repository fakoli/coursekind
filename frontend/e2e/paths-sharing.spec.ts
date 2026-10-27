import { openSharing, test, expect, login, api, share, visibility, readLesson, type Path } from './fixtures';

async function addCourse(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: 'Add Course', exact: true }).click();
  await page.getByRole('dialog', { name: 'Add Course to Path' }).getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

test('PATH-01 — create a goal, edit its details and reload the empty path', async ({ page, world }) => {
  await login(page, world.author);
  await page.goto('/paths');
  await page.getByRole('button', { name: 'Create new learning path' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Title(?:\s*\*)?$/).fill('Become a senior software engineer');
  await dialog.getByLabel('Description (optional)').fill('A deliberate learning goal');
  await dialog.getByLabel('Est. Hours (optional)').fill('40');
  await dialog.getByRole('button', { name: 'Create Path', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Become a senior software engineer' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Title(?:\s*\*)?$/).fill('Senior engineer goal');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Senior engineer goal' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('0 courses · 0 unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add First Course' })).toBeVisible();
  const ownPathUrl = page.url();
  await page.getByRole('button', {name:'Follow path',exact:true}).click();
  await expect(page.getByRole('button', {name:'Unfollow',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', {name:'Unfollow',exact:true})).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Selected Paths',{exact:true}).locator('..').locator(':scope > div').first()).toHaveText('1');
  await page.goto(ownPathUrl);
  await page.getByRole('button', {name:'Unfollow',exact:true}).click();
  await expect(page.getByRole('button', {name:'Edit',exact:true})).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Selected Paths',{exact:true}).locator('..').locator(':scope > div').first()).toHaveText('0');

});

test('PATH-02 — add owned and discovered courses as references, reject duplicate membership', async ({ page, world, request }) => {
  const empty = await api<Path>(request, world.author, '/paths', 'POST', { title: 'New composite goal' });
  await login(page, world.author);
  await page.goto(`/paths/${empty.id}`);
  await addCourse(page, world.course.title);
  await page.goto('/courses?tab=discover');
  await page.getByLabel('Search courses').fill(world.otherCourse.title);
  // Search is debounced; bind the action to the intended course throughout.
  const discovered = page.locator('div.group').filter({ has: page.getByRole('heading', { name: world.otherCourse.title, exact: true }) });
  await discovered.getByRole('button', { name: 'Add to Path', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /New composite goal/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto(`/paths/${empty.id}`);
  await expect(page.getByRole('heading', { name: world.otherCourse.title })).toBeVisible();
  await page.getByRole('button', { name: 'Add Course', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: new RegExp(world.course.title) })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close modal' }).click();
  await page.reload();
  const saved = await api<{path: Path}>(request, world.author, `/paths/${empty.id}`);
  expect(saved.path.course_ids).toEqual([world.course.id, world.otherCourse.id]);
  await page.getByRole('heading', { name: world.course.title }).click();
  await expect(page).toHaveURL(`/courses/${world.course.id}`);
});

test('PATH-03 — reorder references, cancel/remove course and cancel/delete path', async ({ page, world, request }) => {
  await login(page, world.author);
  await page.goto(`/paths/${world.path.id}`);
  await page.getByRole('button', { name: `Move ${world.otherCourse.title} up` }).click();
  await expect(page.getByRole('button', { name: `Move ${world.otherCourse.title} up` })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: `Move ${world.otherCourse.title} up` })).toBeDisabled();
  await page.getByRole('button', { name: `Remove ${world.course.title} from path` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: world.course.title })).toBeVisible();
  await page.getByRole('button', { name: `Remove ${world.course.title} from path` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: world.course.title })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete Path' }).click();
  await expect(page).toHaveURL('/paths');
  await api(request, world.author, `/courses/${world.course.id}`);
  await api(request, world.learner, `/courses/${world.otherCourse.id}`);
});

test('PATH-04 — discover, follow, reload selected list then unfollow without deleting', async ({ page, world, request }) => {
  await api(request, world.author, `/paths/${world.path.id}`, 'PUT', { visibility: 'public' });
  await login(page, world.learner);
  await page.goto('/paths?tab=discover');
  await page.getByRole('link', { name: new RegExp(world.path.title) }).click();
  await page.getByRole('button', { name: 'Follow path' }).click();
  await expect(page.getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible();
  await page.goto('/paths?tab=following');
  await page.reload();
  await page.getByRole('link', { name: new RegExp(world.path.title) }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Unfollow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Follow path' })).toBeVisible();
  await page.goto('/paths?tab=following');
  await expect(page.getByText('You are not following any paths yet.')).toBeVisible();
  await api(request, world.author, `/paths/${world.path.id}`);
});

test('PATH-05 — study a selected multi-course path and retain weighted personal progress', async ({ page, world, request }) => {
  await api(request, world.author, `/courses/${world.course.id}/sharing`, 'POST', { email: world.learner.email });
  await api(request, world.author, `/paths/${world.path.id}`, 'PUT', { visibility: 'public' });
  await login(page, world.learner);
  await page.goto(`/paths/${world.path.id}`);
  await page.getByRole('button', { name: 'Follow path' }).click();
  await readLesson(page, world.course, world.lessons[0]);
  await page.getByRole('button', { name: 'Functions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Functions', exact: true })).toBeVisible();
  await page.goto(`/paths/${world.path.id}`);
  await expect(page.getByText('Your progress: 25% · 0 of 2 courses completed')).toBeVisible();
  await page.goto(`/courses/${world.course.id}/modules/${world.lessons[1].id}`);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page).toHaveURL(`/courses/${world.course.id}`);
  await page.goto('/');
  await page.getByRole('link', { name: /Design/ }).first().click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page).toHaveURL(`/courses/${world.otherCourse.id}`);
  await page.goto(`/paths/${world.path.id}`);
  await page.reload();
  await expect(page.getByText('Your progress: 100% · 2 of 2 courses completed')).toBeVisible();
});

test('SHARE-01 — publish, discover and study, unlist then restore private access', async ({ page, world }) => {
  await login(page, world.author);
  await page.goto(`/courses/${world.course.id}`);
  await visibility(page, 'public');
  await login(page, world.outsider);
  await page.goto('/courses?tab=discover');
  await page.getByLabel('Search courses').fill(world.course.title);
  await page.getByRole('link', { name: world.course.title, exact: true }).click();
  await readLesson(page, world.course, world.lessons[0]);
  await login(page, world.author);
  await page.goto(`/courses/${world.course.id}`);
  await visibility(page, 'unlisted');
  await login(page, world.outsider);
  await page.goto('/courses?tab=discover');
  await page.getByLabel('Search courses').fill(world.course.title);
  await expect(page.getByText('No courses found')).toBeVisible();
  await readLesson(page, world.course, world.lessons[0]);
  await login(page, world.author);
  await page.goto(`/courses/${world.course.id}`);
  await visibility(page, 'private');
  await login(page, world.outsider);
  await page.goto(`/courses/${world.course.id}/modules/${world.lessons[0].id}`);
  await expect(page.getByText('Module not found')).toBeVisible();
});

test('SHARE-02 — grant a named learner, deny outsider, revoke and deny bookmarked access', async ({ page, world }) => {
  await login(page, world.author);
  await page.goto(`/courses/${world.course.id}`);
  await share(page, world.learner.email);
  await page.reload();
  await openSharing(page);
  await expect(page.getByRole('button', { name: `Revoke access for ${world.learner.email}` })).toBeVisible();
  await login(page, world.learner);
  await readLesson(page, world.course, world.lessons[0]);
  await login(page, world.outsider);
  await page.goto(`/courses/${world.course.id}`);
  await expect(page.getByText('Course not found')).toBeVisible();
  await login(page, world.author);
  await page.goto(`/courses/${world.course.id}`);
  await openSharing(page);
  await page.getByRole('button', { name: `Revoke access for ${world.learner.email}` }).click();
  await expect(page.getByRole('button', { name: `Revoke access for ${world.learner.email}` })).toHaveCount(0);
  await login(page, world.learner);
  await page.goto(`/courses/${world.course.id}`);
  await expect(page.getByText('Course not found')).toBeVisible();
});

test('SHARE-03 — share a path without implicitly granting its private course', async ({ page, world }) => {
  await login(page, world.author);
  await page.goto(`/paths/${world.path.id}`);
  await share(page, world.learner.email);
  await login(page, world.learner);
  await page.goto('/paths?tab=discover');
  await page.getByRole('link', { name: new RegExp(world.path.title) }).click();
  await expect(page.getByRole('heading', { name: 'Unavailable course' })).toBeVisible();
  await expect(page.getByText('2 courses · 1 unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Follow path' }).click();
  await expect(page.getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible();
  await login(page, world.outsider);
  await page.goto(`/paths/${world.path.id}`);
  await expect(page.getByText('Learning path not found')).toBeVisible();
  await login(page, world.author);
  await page.goto(`/paths/${world.path.id}`);
  await openSharing(page);
  await page.getByRole('button', { name: `Revoke access for ${world.learner.email}` }).click();
  await expect(page.getByRole('button', { name: `Revoke access for ${world.learner.email}` })).toHaveCount(0);
  await login(page, world.learner);
  await page.goto('/paths?tab=following');
  await expect(page.getByText('You are not following any paths yet.')).toBeVisible();
});

test('SHARE-04 — source changes reach reused paths and deletion leaves unavailable reference', async ({ page, world, request }) => {
  await api(request, world.author, `/courses/${world.course.id}/sharing`, 'POST', { email: world.learner.email });
  await api(request, world.learner, `/paths/${world.learnerPath.id}/courses`, 'POST', { course_id: world.course.id });
  await login(page, world.author);
  await page.goto(`/courses/${world.course.id}/modules/${world.lessons[0].id}/edit`);
  await page.getByLabel('Module content Markdown').fill('# Updated shared lesson');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Module updated successfully')).toBeVisible();
  await login(page, world.learner);
  await page.goto(`/paths/${world.learnerPath.id}`);
  await page.getByRole('heading', { name: world.course.title }).click();
  await page.getByRole('link', { name: /Variables/ }).click();
  await expect(page.getByRole('heading', { name: 'Updated shared lesson' })).toBeVisible();
  await login(page, world.author);
  await page.goto(`/courses/${world.course.id}`);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete Course', exact: true }).click();
  await expect(page).toHaveURL('/courses');
  await login(page, world.learner);
  await page.goto(`/paths/${world.learnerPath.id}`);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unavailable course' })).toBeVisible();
  await expect(page.getByText('1 course · 1 unavailable')).toBeVisible();
});

test('SHARE-05 — reuse counters reflect distinct active references and deletion decrements', async ({ page, world, request }) => {
  await api(request, world.author, `/courses/${world.course.id}`, 'PUT', { visibility: 'public' });
  await login(page, world.learner);
  await page.goto(`/paths/${world.learnerPath.id}`);
  await addCourse(page, world.course.title);
  // Duplicate API request supplements the UI assertion that already-added options disappear.
  await api(request, world.learner, `/paths/${world.learnerPath.id}/courses`, 'POST', { course_id: world.course.id });
  await login(page, world.author);
  await page.goto('/courses');
  await expect(page.getByRole('article', { name: world.course.title, exact: true }).getByText('2 paths', { exact: true })).toBeVisible();
  await page.goto(`/courses/${world.course.id}`);
  await expect(page.getByText('Used in 2 paths: 1 by the author, 1 by other owners.')).toBeVisible();
  await login(page, world.learner);
  await page.goto(`/paths/${world.learnerPath.id}`);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete Path' }).click();
  await expect(page).toHaveURL('/paths');
  await login(page, world.author);
  await page.goto('/courses');
  await page.reload();
  await expect(page.getByRole('article', { name: world.course.title, exact: true }).getByText('1 path', { exact: true })).toBeVisible();
  await page.goto(`/courses/${world.course.id}`);
  await expect(page.getByText('Used in 1 paths: 1 by the author, 0 by other owners.')).toBeVisible();
});
