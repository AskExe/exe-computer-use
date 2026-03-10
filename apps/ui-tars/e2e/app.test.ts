/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  ElectronApplication,
  Page,
  _electron as electron,
  expect,
  test,
} from '@playwright/test';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const latestBuild = findLatestBuild();
  const { executable: executablePath, main } = parseElectronApp(latestBuild);
  console.log('executablePath:', executablePath, '\nmain:', main);
  process.env.CI = 'e2e';
  electronApp = await electron.launch({
    args: [main],
    executablePath,
    env: {
      ...process.env,
      CI: 'e2e',
    },
  });

  page = await electronApp.firstWindow();
  electronApp.on('window', async (page) => {
    const filename = page.url()?.split('/').pop();
    console.log(`Window opened: ${filename}`);

    page.on('pageerror', (error) => {
      console.error(error);
    });
    page.on('console', (msg) => {
      console.log(msg.text());
    });
  });

  // Wait for the lazy-loaded home page content to fully render
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('button', { state: 'visible', timeout: 15_000 });
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('app can launch', async () => {
  test.setTimeout(60_000);
  const buttonElement = await page.$('button');
  expect(await buttonElement?.isVisible()).toBe(true);
});

test('home page shows Computer Operator and Browser Operator cards', async () => {
  test.setTimeout(30_000);
  // CardTitle renders as a div — use getByText with exact match
  // Wait for the lazy-loaded card content
  await expect(page.getByText('Computer Operator', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Browser Operator', { exact: true })).toBeVisible({ timeout: 5_000 });
});

test('Use Local Computer button is present and clickable', async () => {
  test.setTimeout(30_000);
  const btn = page.getByRole('button', { name: 'Use Local Computer' });
  await expect(btn).toBeVisible({ timeout: 10_000 });

  await btn.click();

  // Either the VLM settings dialog appears (first run) OR we navigate to /local (if VLM configured)
  // Either outcome means the button works correctly
  const dialogVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false);
  const onLocalPage = page.url().includes('local');

  expect(dialogVisible || onLocalPage).toBe(true);

  // Navigate back to home for subsequent tests
  if (onLocalPage) {
    await page.getByText('Home').click();
    await page.waitForSelector('button[class*="w-full"]', { state: 'visible', timeout: 5_000 }).catch(() => {});
  } else {
    await page.keyboard.press('Escape');
  }
});

test('settings panel opens and shows VLM Settings tab', async () => {
  test.setTimeout(30_000);
  // Find the settings button in sidebar footer (by its icon/label)
  const settingsButton = page.locator('[data-sidebar="menu-button"]').filter({ hasText: /setting/i }).first();
  await settingsButton.click();

  await expect(page.getByRole('tab', { name: 'VLM Settings' })).toBeVisible({ timeout: 5000 });
});

test('settings panel has required VLM configuration fields', async () => {
  test.setTimeout(30_000);
  const vlmTab = page.getByRole('tab', { name: 'VLM Settings' });
  if (await vlmTab.isVisible()) {
    await vlmTab.click();
  }

  await expect(page.getByText('VLM Base URL')).toBeVisible();
  await expect(page.getByText('VLM Model Name')).toBeVisible();
});
