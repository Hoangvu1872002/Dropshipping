const { chromium } = require('playwright');

(async () => {
    const context = await chromium.launchPersistentContext(
        './amazon-profile',
        {
            headless: false,
            viewport: null
        }
    );

    const page = await context.newPage();

    await page.goto('https://www.amazon.com/', {
        waitUntil: 'domcontentloaded'
    });

    console.log('Amazon đã mở.');
    console.log('Hãy đăng nhập Amazon thủ công trong cửa sổ trình duyệt.');

    await new Promise(() => { });
})();