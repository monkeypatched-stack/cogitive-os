const { chromium } = require('playwright');
const SCREENSHOT_DIR = '/private/tmp/claude-501/-Users-prashunjaveri-Code-monkeypatched/05aa4e0e-4cc8-42d7-b216-d0850da89762/scratchpad';

(async () => {
  const errors = [];
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const select = page.locator('#lwe-chat-actor-select');
  await select.waitFor({ timeout: 15000 });
  await select.selectOption({ label: 'Alice Nguyen' });
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/alice-01-selected.png` });

  const input = page.locator('.lwe-chat-input input[type="text"]');
  await input.fill('buy 2L milk');
  await page.locator('.lwe-chat-input button').click();

  await page.waitForSelector('.lwe-chat-message-pending', { state: 'attached', timeout: 5000 }).catch(() => {});
  await page.waitForSelector('.lwe-chat-message-pending', { state: 'detached', timeout: 150000 }).catch(() => {});
  await page.waitForTimeout(1000);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/alice-02-response.png`, fullPage: false });

  const messages = await page.locator('.lwe-chat-message').allTextContents();

  console.log('RESULT_JSON:' + JSON.stringify({
    errors: errors.filter(e => !e.includes('two children') && !e.includes('404')),
    messages,
  }, null, 2));
  await browser.close();
})();
