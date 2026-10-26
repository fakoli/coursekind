import { test, expect, login } from './fixtures';
import type { Locator, Page } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

// Use physical touch coordinates: clicking only the title link misses dead card areas.
async function tapSurface(page: Page, target: Locator, padding = false) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await page.touchscreen.tap(box!.x + (padding ? 8 : box!.width / 2),
    box!.y + (padding ? box!.height - 8 : box!.height / 2));
}

test('COURSE-06 — touch opens the whole course card and preserves separate actions', async ({ page, world }) => {
  await login(page, world.author);
  for (const surface of ['title', 'image', 'description', 'padding']) {
    await page.goto('/courses');
    const card = page.getByRole('article', { name: world.course.title, exact: true });
    await expect(card).toBeVisible();
    const target = surface === 'title' ? card.getByRole('heading')
      : surface === 'image' ? card.locator('img')
      : surface === 'description' ? card.getByText('Synthetic acceptance course', { exact: true })
      : card;
    await tapSurface(page, target, surface === 'padding');
    await expect(page).toHaveURL(`/courses/${world.course.id}`);
    await expect(page.getByRole('heading', { name: world.course.title, exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/courses');
  }

  await page.goto('/courses?tab=discover');
  const publicCard = page.getByRole('article', { name: world.otherCourse.title, exact: true });
  await tapSurface(page, publicCard.getByRole('button', { name: 'Add to Path' }));
  await expect(page.getByRole('dialog', { name: 'Add to Learning Path' })).toBeVisible();
  await expect(page).toHaveURL('/courses?tab=discover');
  await page.getByRole('button', { name: 'Close modal' }).click();
  await tapSurface(page, publicCard.getByText('A second author', { exact: true }));
  await expect(page).toHaveURL(`/courses/${world.otherCourse.id}`);
  await expect(page.getByRole('heading', { name: world.otherCourse.title, exact: true })).toBeVisible();
});
