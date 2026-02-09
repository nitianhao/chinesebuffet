import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

type HrefPickOptions = {
  pattern: string;
  exclude?: string[];
};

async function pickHref(page: Page, options: HrefPickOptions) {
  const href = await page.evaluate(({ pattern, exclude }) => {
    const regex = new RegExp(pattern);
    const links = Array.from(document.querySelectorAll('a'));
    const match = links.find((link) => {
      const hrefValue = link.getAttribute('href') || '';
      if (!regex.test(hrefValue)) return false;
      if (exclude && exclude.some((fragment) => hrefValue.includes(fragment))) return false;
      return true;
    });
    return match?.getAttribute('href') || null;
  }, options);

  if (!href) {
    throw new Error(`No matching link found for pattern: ${options.pattern}`);
  }

  return href;
}

async function assertNoHorizontalScroll(page: Page) {
  const hasOverflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  expect(hasOverflow).toBeFalsy();
}

async function assertH1Exists(page: Page) {
  const h1 = page.locator('h1').first();
  await expect(h1).toBeVisible({ timeout: 10000 });
}

test('mobile smoke flow', async ({ page }) => {
  const consoleErrors: string[] = [];
  const ignoredConsoleErrors = [
    /Warning: Encountered two children with the same key/i,
  ];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (ignoredConsoleErrors.some((pattern) => pattern.test(text))) return;
      consoleErrors.push(text);
    }
  });

  await page.goto('/');
  await assertH1Exists(page);
  await assertNoHorizontalScroll(page);

  await page.goto('/chinese-buffets/states');
  await assertH1Exists(page);
  await assertNoHorizontalScroll(page);

  const stateHref = await pickHref(page, {
    pattern: '^/chinese-buffets/states/[a-z]{2}$',
  });
  await page.goto(stateHref);
  await assertH1Exists(page);
  await assertNoHorizontalScroll(page);

  const cityHref = await pickHref(page, {
    pattern: '^/chinese-buffets/[^/]+$',
    exclude: ['states', 'cities', 'neighborhoods'],
  });
  await page.goto(cityHref);
  await assertH1Exists(page);
  await assertNoHorizontalScroll(page);

  await expect(page.getByRole('button', { name: /filter/i })).toBeVisible();

  const neighborhoodHref = await pickHref(page, {
    pattern: '^/chinese-buffets/[^/]+/neighborhoods/[^/]+$',
  });
  await page.goto(neighborhoodHref);
  await assertH1Exists(page);
  await assertNoHorizontalScroll(page);

  const detailHref = await pickHref(page, {
    pattern: '^/chinese-buffets/[^/]+/[^/]+$',
    exclude: ['neighborhoods', 'states', 'cities'],
  });
  await page.goto(detailHref);
  await assertH1Exists(page);
  await assertNoHorizontalScroll(page);

  const hasCta = await page.evaluate(() => {
    const ctaLabels = ['Call', 'Directions', 'Website'];
    return ctaLabels.some((label) =>
      Array.from(document.querySelectorAll('a, button')).some((el) =>
        (el.textContent || '').trim().includes(label)
      )
    );
  });
  expect(hasCta).toBeTruthy();

  expect(consoleErrors).toEqual([]);
});
