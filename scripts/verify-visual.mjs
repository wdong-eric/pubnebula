import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 }
];

async function measureCanvas(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('No canvas element found');
    }

    const dataUrl = canvas.toDataURL('image/png');
    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    const scratch = document.createElement('canvas');
    scratch.width = image.width;
    scratch.height = image.height;
    const context = scratch.getContext('2d');
    if (!context) {
      throw new Error('Could not create 2D context for pixel verification');
    }
    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, scratch.width, scratch.height).data;
    let brightPixels = 0;
    let nonBlackPixels = 0;

    for (let index = 0; index < pixels.length; index += 4 * 37) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      if (alpha > 0 && red + green + blue > 24) {
        nonBlackPixels += 1;
      }
      if (alpha > 0 && red + green + blue > 130) {
        brightPixels += 1;
      }
    }

    return {
      width: canvas.width,
      height: canvas.height,
      brightPixels,
      nonBlackPixels
    };
  });
}

async function verifyViewport(browser, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  await page.waitForSelector('.author-label');

  const stats = await measureCanvas(page);
  if (stats.nonBlackPixels < 200 || stats.brightPixels < 40) {
    throw new Error(
      `${viewport.name}: canvas appears blank (${JSON.stringify(stats)})`
    );
  }

  const labels = await page.locator('.author-label:not([hidden])').count();
  const summary = await page.locator('#detailsPanel').textContent();
  const initialCount = await page.locator('#visibleCount').textContent();
  if (labels < 7) {
    throw new Error(`${viewport.name}: expected 7 author labels, saw ${labels}`);
  }
  if (!summary?.includes('Galaxy Summary')) {
    throw new Error(`${viewport.name}: details panel did not render summary`);
  }
  if (!initialCount?.includes('planets visible')) {
    throw new Error(`${viewport.name}: visible count did not render`);
  }

  await page.locator('#searchInput').fill('Auchettl');
  const searchCount = await page.locator('#visibleCount').textContent();
  if (searchCount === initialCount) {
    throw new Error(`${viewport.name}: search did not change visible count`);
  }

  await page.locator('#authorSelect').selectOption('katie-auchettl');
  await page.locator('#searchInput').fill('');
  await page.locator('#resetButton').click();
  await page.screenshot({
    path: `artifacts/pubnebula-${viewport.name}.png`,
    fullPage: true
  });
  await page.close();

  return {
    viewport: viewport.name,
    labels,
    initialCount,
    searchCount,
    canvas: stats
  };
}

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true
});

try {
  const results = [];
  for (const viewport of viewports) {
    results.push(await verifyViewport(browser, viewport));
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
