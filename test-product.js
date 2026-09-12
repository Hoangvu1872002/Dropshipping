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

    const url = 'https://www.amazon.com/dp/B0BDYXFXGT';

    await page.goto(url, {
        waitUntil: 'domcontentloaded'
    });

    await page.waitForTimeout(3000);

    console.log('Product:', await page.title());

    // Tìm các review đang có trên trang
    const reviews = page.locator('[data-hook="review"]');

    console.log('Reviews found:', await reviews.count());

    if (await reviews.count() > 0) {
        const firstReview = reviews.first();

        console.log(
            'Review text:',
            await firstReview.innerText()
        );
    }

    await new Promise(() => { });
})();