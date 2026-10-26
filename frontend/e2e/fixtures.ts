import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const apiURL = 'http://127.0.0.1:8018';
export const password = 'Synthetic-acceptance-123!';
export type Persona = { id: string; name: string; email: string; token: string };
export type Course = { id: string; title: string };
export type Lesson = { id: string; title: string; content_markdown: string; flashcards: {id: string; front: string; back: string}[] };
export type Path = { id: string; title: string; course_ids: string[] };
export async function api<T>(request: APIRequestContext, user: Persona | null, path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await request.fetch(`${apiURL}/api/v1${path}`, { method, data,
    headers: user ? { Authorization: `Bearer ${user.token}` } : {} });
  expect(response.ok(), `${method} ${path}: ${response.status()}`).toBeTruthy();
  return response.json();
}
export async function login(page: Page, user: Persona) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: new RegExp(`Welcome back, ${user.name}`) })).toBeVisible();
}
export async function signOut(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('/login');
}
export async function readLesson(page: Page, course: Course, lesson: Lesson) {
  await page.goto(`/courses/${course.id}/modules/${lesson.id}`);
  await expect(page.getByRole('heading', { name: lesson.title, exact: true })).toBeVisible();
  const saved = page.waitForResponse(response => response.url().includes('/progress/modules/')
    && response.request().method() === 'POST' && response.request().postData()?.includes('read_content') === true);
  await page.getByRole('button', { name: /Mark content read|Content read — study again/ }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Content read — study again' })).toBeVisible();
}
export async function saveModule(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Module updated successfully')).toBeVisible();
}
export async function share(page: Page, email: string) {
  await page.getByLabel('Recipient email').fill(email);
  await page.getByRole('button', { name: 'Grant access', exact: true }).click();
  await expect(page.getByRole('button', { name: `Revoke access for ${email}` })).toBeVisible();
}
export async function visibility(page: Page, value: string) {
  await page.getByLabel('Visibility', { exact: true }).selectOption(value);
  const saved = page.waitForResponse(r => /\/api\/v1\/(courses|paths)\/[^/]+$/.test(r.url()) && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save visibility' }).click();
  expect((await saved).ok()).toBeTruthy();
}
export async function stat(page: Page, label: string, value: number) {
  // Structural parent scopes the number to its human-visible metric label.
  await expect(page.getByText(label, { exact: true }).locator('..').locator(':scope > div').first()).toHaveText(label === 'Quiz Average' ? `${value}%` : String(value));
}
export async function control(request: APIRequestContext, data: Record<string, unknown>) {
  const response = await request.post(`${apiURL}/__test/control`, { data });
  expect(response.ok()).toBeTruthy();
}

type World = {
  author: Persona; learner: Persona; outsider: Persona;
  course: Course; otherCourse: Course; lessons: Lesson[]; otherLesson: Lesson;
  path: Path; learnerPath: Path;
};
export const test = base.extend<{ world: World }>({
  world: async ({ request }, provide) => {
    await control(request, { reset: true });
    const suffix = randomUUID();
    const person = async (name: string): Promise<Persona> => {
      const email = `${name.toLowerCase()}-${suffix}@example.com`;
      const user = await api<Persona>(request, null, '/auth/register', 'POST', { name, email, password });
      const auth = await api<{access_token: string}>(request, null, '/auth/login', 'POST', { email, password });
      return { ...user, name, email, token: auth.access_token };
    };
    const author = await person('Author');
    const learner = await person('Learner');
    const outsider = await person('Outsider');
    const course = await api<Course>(request, author, '/courses', 'POST', {
      title: `Python Basics ${suffix}`, description: 'Synthetic acceptance course', ai_enabled: true,
      instructions: { purpose: 'Teach addition', target_audience: 'Beginners', learning_objectives: ['Add numbers'] },
    });
    const otherCourse = await api<Course>(request, learner, '/courses', 'POST', {
      title: `Software Design ${suffix}`, visibility: 'public', difficulty: 'intermediate', description: 'A second author',
    });
    const lesson = async (owner: Persona, c: Course, title: string, order: number): Promise<Lesson> => api(request, owner, `/courses/${c.id}/modules`, 'POST', {
      title, order_index: order, description: `Outline for ${title}`,
      content_markdown: '# Addition\n\nRead this recognizable lesson.\n\n| Input | Output |\n| --- | --- |\n| 2 + 3 | 5 |\n\n```javascript\nconsole.log(2 + 3);\n```',
      flashcards: [{ front: 'First question', back: 'First answer' }, { front: 'Last question', back: 'Last answer' }],
      quiz: { questions: [
        { question: 'Two plus three?', options: ['Five', 'Six'], correct_index: 0, explanation: 'Adding two and three gives five.' },
        { question: 'Four plus four?', options: ['Eight', 'Nine'], correct_index: 0, explanation: 'Double four is eight.' },
      ] },
      sandbox: { language: 'javascript', starter_code: 'console.log(2 + 3);', solution_code: 'console.log(5);', instructions: 'Print the sum of two and three.' },
    });
    const lessons = [await lesson(author, course, 'Variables', 0), await lesson(author, course, 'Functions', 1)];
    const otherLesson = await lesson(learner, otherCourse, 'Design', 0);
    const path = await api<Path>(request, author, '/paths', 'POST', { title: `Engineering goal ${suffix}`, course_ids: [course.id, otherCourse.id] });
    const learnerPath = await api<Path>(request, learner, '/paths', 'POST', { title: `Learner goal ${suffix}` });
    await provide({ author, learner, outsider, course, otherCourse, lessons, otherLesson, path, learnerPath });
    // Entire database is server-owned TemporaryDirectory; no user-storage cleanup.
  },
});
export { expect };
