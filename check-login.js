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

    await page.waitForTimeout(3000);

    const accountText = await page.locator('#nav-link-accountList').innerText();

    console.log('Account:', accountText);

    await new Promise(() => { });
})();