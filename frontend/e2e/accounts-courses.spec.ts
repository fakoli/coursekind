import { test, expect, login, signOut, api, password, type Course, type Lesson } from './fixtures';

test('AUTH-01 — register, inspect identity, sign out and sign in', async ({ page, world }) => {
  const email = `new-${world.author.email}`;
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('New Learner');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/settings');
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await signOut(page);
  await login(page, { ...world.author, name: 'New Learner', email });
  await page.goto('/courses');
  await expect(page.getByText(world.course.title)).toHaveCount(0);
});

test('AUTH-02 — reject bad login, reload session, sign out and isolate the next user', async ({ page, world }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(world.author.email);
  await page.getByLabel('Password', { exact: true }).fill('Wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/invalid.*(credentials|email|password)|incorrect/i)).toBeVisible();
  await login(page, world.author);
  await page.goto(`/courses/${world.course.id}`);
  await page.reload();
  await expect(page.getByRole('heading', { name: world.course.title })).toBeVisible();
  await signOut(page);
  await page.goto(`/courses/${world.course.id}`);
  await expect(page).toHaveURL('/login');
  await login(page, world.learner);
  await page.goto('/courses');
  await expect(page.getByText(world.course.title)).toHaveCount(0);
});

test('AUTH-03 — deny private deep links and author actions across accounts', async ({ page, world, request }) => {
  await login(page, world.outsider);
  for (const url of [`/courses/${world.course.id}`, `/courses/${world.course.id}/modules/${world.lessons[0].id}`, `/paths/${world.path.id}`]) {
    await page.goto(url);
    await expect(page.getByText(/not found/i).first()).toBeVisible();
    await expect(page.getByText('Read this recognizable lesson.')).toHaveCount(0);
  }
  await page.goto(`/courses/${world.otherCourse.id}/edit`);
  await expect(page.getByText('Only the course author can edit this course.')).toBeVisible();
  await page.goto(`/courses/${world.otherCourse.id}/modules/${world.otherLesson.id}/edit`);
  await expect(page.getByText('Only the course author can edit modules.')).toBeVisible();
  const denied = await request.delete(`http://127.0.0.1:8018/api/v1/courses/${world.course.id}`, { headers: { Authorization: `Bearer ${world.outsider.token}` } });
  expect([403, 404]).toContain(denied.status());
  await page.goto('/admin');
  await expect(page.getByText(/access denied|not authorized|admin access/i)).toBeVisible();
});

test('COURSE-01 — create metadata and two manual outlines then reopen each', async ({ page, world, request }) => {
  await login(page, world.author);
  await page.goto('/courses/new');
  await page.getByLabel(/Course Title/).fill('Manual acceptance course');
  await page.getByLabel(/Description/).fill('A persisted manual description');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Add First Module' }).click();
  await page.getByPlaceholder('Module title').fill('Manual One');
  await page.getByPlaceholder('Brief description (optional)').fill('First outline');
  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.getByPlaceholder('Module title').nth(1).fill('Manual Two');
  await page.getByPlaceholder('Brief description (optional)').nth(1).fill('Second outline');
  await page.getByRole('button', { name: 'Create Course', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Manual acceptance course' })).toBeVisible();
  await page.reload();
  const id = page.url().split('/').pop()!;
  const saved = await api<{course: Course; modules: Lesson[]}>(request, world.author, `/courses/${id}`);
  expect(saved.modules.map(m => m.title)).toEqual(['Manual One', 'Manual Two']);
  for (const m of saved.modules) {
    await page.goto(`/courses/${id}/modules/${m.id}`);
    await expect(page.getByRole('heading', { name: m.title, exact: true })).toBeVisible();
  }
});

test('COURSE-02 — rename, reorder, remove and add outlines without losing activities', async ({ page, world, request }) => {
  await login(page, world.author);
  await page.goto(`/courses/${world.course.id}/edit`);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // AI-enabled courses include an instructions step.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByPlaceholder('Module title').first().fill('Renamed Variables');
  await page.getByRole('button', { name: 'Move module 2 up' }).click();
  await page.getByRole('button', { name: 'Remove module 1' }).click();
  await page.getByRole('button', { name: 'Add Module', exact: true }).click();
  await page.getByPlaceholder('Module title').last().fill('Added outline');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: world.course.title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Move Renamed Variables up' })).toBeDisabled();
  const saved = await api<Lesson>(request, world.author, `/courses/${world.course.id}/modules/${world.lessons[0].id}`);
  expect(saved.title).toBe('Renamed Variables');
  expect(saved.flashcards).toHaveLength(2);
  expect(saved.content_markdown).toBe(world.lessons[0].content_markdown);
  const outlines = await api<{modules: Lesson[]}>(request, world.author, `/courses/${world.course.id}`);
  expect(outlines.modules.map(module => module.title)).toEqual(['Renamed Variables', 'Added outline']);
});

test('COURSE-03 — edit metadata, cancel deletion, then delete and reopen old URL', async ({ page, world }) => {
  await login(page, world.learner);
  await page.goto(`/courses/${world.otherCourse.id}/edit`);
  await page.getByLabel(/Course Title/).fill('Renamed software design');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Renamed software design' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Renamed software design' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Delete/ }).click();
  await expect(page).toHaveURL('/courses');
  await page.goto(`/courses/${world.otherCourse.id}`);
  await expect(page.getByText('Course not found')).toBeVisible();
});

test('COURSE-04 — discover by search, difficulty and sort, recover empty results', async ({ page, world }) => {
  await login(page, world.author);
  await page.goto('/courses?tab=discover');
  await page.getByRole('textbox', { name: 'Search courses' }).fill(world.otherCourse.title);
  await page.getByLabel('Difficulty', { exact: true }).selectOption('intermediate');
  for (const sort of ['newest', 'alphabetical', 'popular']) {
    await page.getByLabel('Sort courses').selectOption(sort);
    await expect(page.getByRole('heading', { name: world.otherCourse.title })).toBeVisible();
  }
  await page.getByRole('heading', { name: world.otherCourse.title }).click();
  await expect(page.getByRole('heading', { name: world.otherCourse.title })).toBeVisible();
  await expect(page.getByText('Learner', { exact: true }).first()).toBeVisible();
  await page.goBack();
  await page.getByRole('textbox', { name: 'Search courses' }).fill('no-such-course-unique');
  await expect(page.getByText(/no courses found/i)).toBeVisible();
  await page.getByRole('textbox', { name: 'Search courses' }).fill(world.otherCourse.title);
  await expect(page.getByRole('heading', { name: world.otherCourse.title })).toBeVisible();
  await expect(page.getByText(world.course.title)).toHaveCount(0);
});

test('COURSE-05 — generate selected AI outlines, append and persist editable lessons', async ({ page, world, request }) => {
  await login(page, world.author);
  await page.goto(`/courses/${world.course.id}/edit`);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Generate Suggestions' }).click();
  const dialog = page.getByRole('dialog', { name: 'AI Module Suggestions' });
  await dialog.getByRole('button', { name: 'Add to Existing' }).click();
  await dialog.getByRole('button', { name: 'Select None' }).click();
  await dialog.getByRole('checkbox').filter({ hasNotText: 'Generate content' }).first().check();
  await dialog.getByLabel('Generate content for modules').uncheck();
  await dialog.getByRole('button', { name: /^Create 1 Module/ }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: world.course.title })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Generated module 1', { exact: true })).toBeVisible();
  const data = await api<{modules: Lesson[]}>(request, world.author, `/courses/${world.course.id}`);
  expect(data.modules).toHaveLength(3);
  await page.goto(`/courses/${world.course.id}/modules/${data.modules[2].id}/edit`);
  await expect(page.getByRole('textbox', { name: /Module Title/ })).toHaveValue('Generated module 1');
});
