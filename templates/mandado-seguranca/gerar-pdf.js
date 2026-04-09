const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const htmlPath = path.resolve(__dirname, 'mandado-seguranca.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(500);

  await page.pdf({
    path: path.resolve(__dirname, 'mandado-seguranca.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });

  await browser.close();
  console.log('PDF gerado: mandado-seguranca.pdf');
})();
