// Captures README screenshots from the production build.
// Usage: npm run screenshots   (builds, serves `vite preview`, captures to docs/screenshots)
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PORT = 4175;
const URL = `http://localhost:${PORT}/kammforce/`;
const OUT = 'docs/screenshots';

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'inherit' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

try {
  await mkdir(OUT, { recursive: true });
  await waitForServer();
  const browser = await chromium.launch();

  const shots = [
    { name: 'desktop', viewport: { width: 1280, height: 800 }, scale: 2 },
    { name: 'mobile', viewport: { width: 390, height: 844 }, scale: 3 },
  ];
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.scale });
    const page = await ctx.newPage();
    await page.goto(URL);
    // Wait until the DB is open on OPFS and YAML hydration finished.
    await page.waitForFunction(
      () => document.querySelector('#stat-hydration')?.textContent?.includes('Up to date'),
      null, { timeout: 30000 },
    );
    await page.waitForTimeout(700); // let entry animations settle
    await page.screenshot({ path: `${OUT}/${s.name}.png`, fullPage: true });
    console.log(`saved ${OUT}/${s.name}.png`);
    await ctx.close();
  }
  await browser.close();
} finally {
  stop();
}
