const { chromium } = require('playwright');
const fs = require('fs');

// ============================================================
// CONFIG
// ============================================================

const ASIN = 'B0BDYXFXGT';

const PRODUCT_URL =
    `https://www.amazon.com/dp/${ASIN}`;

const MAX_REVIEWS = 100;

// Delay CHỈ giữa các round
const MIN_ROUND_DELAY = 3000;
const MAX_ROUND_DELAY = 5000;

// Chrome profile đã login Amazon
const AMAZON_PROFILE = './amazon-profile';

// CSV output
const OUTPUT_FILE = 'rascal-rover-reviews.csv';

// Có lấy ảnh review hay không (false = để trống các cột ảnh)
const INCLUDE_IMAGES = false;

// ShopBase product
const PRODUCT_ID = '1000000672338595';

const PRODUCT_HANDLE =
    'rascal-rover-hard-bottom-dog-car-seat-protector';


// ============================================================
// UTILS
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}

function csvEscape(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return '""';
    }

    return `"${String(value)
        .replace(/\r?\n/g, ' ')
        .replace(/"/g, '""')
        .trim()}"`;
}


// ============================================================
// TEXT CLEAN
// ============================================================

function cleanText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
}


// ============================================================
// TITLE
// SHOPBASE MAX = 70 CHARACTERS
// ============================================================

function cleanTitle(text) {

    let title = cleanText(text);

    // Amazon đôi khi đưa rating vào title
    title = title.replace(
        /^[1-5](?:\.0)?\s+out of 5 stars\s*/i,
        ''
    );

    title = cleanText(title);

    // ShopBase max 70
    return title.slice(0, 70);
}


// ============================================================
// REVIEW
// ============================================================

function cleanReview(text) {

    return cleanText(text);
}


// ============================================================
// DATE
// ============================================================

function parseDate(text) {

    text = cleanText(text);

    const match = text.match(
        /on ([A-Za-z]+ \d{1,2}, \d{4})/i
    );

    if (!match) {
        return '';
    }

    const date = new Date(match[1]);

    if (Number.isNaN(date.getTime())) {
        return match[1];
    }

    return (
        `${date.getMonth() + 1}/` +
        `${date.getDate()}/` +
        `${date.getFullYear()}`
    );
}


// ============================================================
// IMAGE URL
// ============================================================

function cleanImageUrl(url) {

    if (!url) {
        return '';
    }

    url = String(url)
        .replace(/&amp;/g, '&')
        .trim();

    if (!url.startsWith('http')) {
        return '';
    }

    return url;
}


// ============================================================
// EMAIL
// ShopBase yêu cầu email
// ============================================================

function makeEmail(name, index) {

    let slug = String(name || 'customer')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30);

    if (!slug) {
        slug = 'customer';
    }

    return `review-${slug}-${index}@example.com`;
}


// ============================================================
// PARSE REVIEW FAST
//
// Dùng evaluate() để đọc DOM một lần.
// Không gọi hàng loạt locator() như code cũ.
// Vì vậy nhanh hơn đáng kể.
// ============================================================

async function parseReviewFast(
    reviewElement,
    index
) {

    try {

        const raw = await reviewElement.evaluate(
            (el, includeImages) => {

                // --------------------------------------------
                // REVIEWER
                // --------------------------------------------

                const reviewer =
                    el.querySelector(
                        '.a-profile-name'
                    )?.textContent || '';


                // --------------------------------------------
                // RATING
                // --------------------------------------------

                let ratingText = '';

                const ratingElement =
                    el.querySelector(
                        '[data-hook="review-star-rating"]'
                    ) ||
                    el.querySelector(
                        '[data-hook="cmps-review-star-rating"]'
                    ) ||
                    el.querySelector(
                        '.review-rating'
                    );

                if (ratingElement) {
                    ratingText =
                        ratingElement.textContent || '';
                }


                // --------------------------------------------
                // TITLE
                // --------------------------------------------

                let title = '';

                const titleElement =
                    el.querySelector(
                        '[data-hook="review-title"]'
                    );

                if (titleElement) {
                    title =
                        titleElement.textContent || '';
                }


                // --------------------------------------------
                // DATE
                // --------------------------------------------

                let dateText = '';

                const dateElement =
                    el.querySelector(
                        '[data-hook="review-date"]'
                    );

                if (dateElement) {
                    dateText =
                        dateElement.textContent || '';
                }


                // --------------------------------------------
                // VARIATION
                // --------------------------------------------

                let variation = '';

                const variationElement =
                    el.querySelector(
                        '[data-hook="review-format-strip"]'
                    );

                if (variationElement) {
                    variation =
                        variationElement.textContent || '';
                }


                // --------------------------------------------
                // REVIEW BODY
                // --------------------------------------------

                let body = '';

                const bodyElement =
                    el.querySelector(
                        '[data-hook="review-body"]'
                    );

                if (bodyElement) {
                    body =
                        bodyElement.textContent || '';
                }


                // --------------------------------------------
                // VERIFIED
                // --------------------------------------------

                const fullText =
                    el.textContent || '';

                const verified =
                    /Verified Purchase/i.test(
                        fullText
                    );


                // --------------------------------------------
                // HELPFUL
                // --------------------------------------------

                let helpful = '';

                const helpfulElement =
                    el.querySelector(
                        '[data-hook="helpful-vote-statement"]'
                    );

                if (helpfulElement) {
                    helpful =
                        helpfulElement.textContent || '';
                }


                // --------------------------------------------
                // IMAGES
                // --------------------------------------------

                const images = [];

                if (includeImages) {
                    // Ưu tiên review image tile
                    const imageTiles =
                        el.querySelectorAll(
                            '[data-hook="review-image-tile"]'
                        );

                    imageTiles.forEach(tile => {
                        const imgs =
                            tile.querySelectorAll('img');

                        imgs.forEach(img => {
                            const candidates = [
                                img.getAttribute(
                                    'data-a-hires'
                                ),
                                img.getAttribute(
                                    'data-old-hires'
                                ),
                                img.getAttribute(
                                    'data-src'
                                ),
                                img.getAttribute(
                                    'src'
                                )
                            ];

                            for (
                                const url of candidates
                            ) {
                                if (
                                    url &&
                                    url.startsWith('http') &&
                                    !images.includes(url)
                                ) {
                                    images.push(url);
                                    break;
                                }
                            }
                        });
                    });

                    // --------------------------------------------
                    // FALLBACK: tất cả ảnh trong review
                    // --------------------------------------------

                    if (
                        images.length === 0
                    ) {
                        const imgs =
                            el.querySelectorAll('img');

                        imgs.forEach(img => {
                            const candidates = [
                                img.getAttribute(
                                    'data-a-hires'
                                ),
                                img.getAttribute(
                                    'data-old-hires'
                                ),
                                img.getAttribute(
                                    'data-src'
                                ),
                                img.getAttribute(
                                    'src'
                                )
                            ];

                            for (
                                const url of candidates
                            ) {
                                if (
                                    url &&
                                    url.startsWith('http') &&
                                    !images.includes(url)
                                ) {
                                    // Tránh avatar
                                    if (
                                        !url.includes(
                                            'avatar'
                                        )
                                    ) {
                                        images.push(url);
                                    }
                                    break;
                                }
                            }
                        });
                    }
                }

                return {
                    reviewer,
                    ratingText,
                    title,
                    dateText,
                    variation,
                    body,
                    verified,
                    helpful,
                    images
                };
            },
            INCLUDE_IMAGES
        );


        // ====================================================
        // RATING
        // ====================================================

        const ratingMatch =
            raw.ratingText.match(
                /([1-5](?:\.\d)?)/
            );

        const rating =
            ratingMatch
                ? Math.round(
                    parseFloat(
                        ratingMatch[1]
                    )
                )
                : 0;


        // Chỉ lấy 5 sao
        if (
            rating !== 5
        ) {

            return {
                skip: true,
                reason: 'Not 5 stars'
            };
        }


        // ====================================================
        // REVIEW
        // ====================================================

        const review =
            cleanReview(
                raw.body
            );


        // Không có content
        if (
            !review
        ) {

            return {
                skip: true,
                reason: 'Empty review'
            };
        }


        // ShopBase max review 1000
        if (
            review.length >= 1000
        ) {

            return {
                skip: true,
                reason:
                    `Review has ${review.length} characters`
            };
        }


        // ====================================================
        // TITLE
        // ====================================================

        const title =
            cleanTitle(
                raw.title
            );


        // ====================================================
        // DATE
        // ====================================================

        const date =
            parseDate(
                raw.dateText
            );


        // ====================================================
        // IMAGES
        // ====================================================

        const images =
            [
                ...new Set(
                    raw.images
                        .map(cleanImageUrl)
                        .filter(Boolean)
                )
            ]
                .slice(0, 5);


        return {

            skip: false,

            reviewer:
                cleanText(
                    raw.reviewer
                ),

            rating: 5,

            title,

            date,

            variation:
                cleanText(
                    raw.variation
                ),

            verified_purchase:
                raw.verified
                    ? 'Verified Purchase'
                    : '',

            review,

            helpful:
                cleanText(
                    raw.helpful
                ),

            images
        };

    } catch (error) {

        console.log(
            `Parse review ${index + 1} error:`,
            error.message
        );

        return {
            skip: true,
            reason: 'Parse error'
        };
    }
}


// ============================================================
// UNIQUE REVIEW KEY
// ============================================================

function reviewKey(review) {

    return [

        review.reviewer,

        review.title,

        review.date,

        review.review

    ]
        .join('|')
        .toLowerCase()
        .trim();
}


// ============================================================
// SELECT 5 STAR
// ============================================================

async function selectFiveStars(page) {

    console.log(
        '\nSelecting 5-star filter...'
    );


    // --------------------------------------------------------
    // Amazon thường có link filterByStar=five_star
    // --------------------------------------------------------

    try {

        const filter =
            page.locator(
                'a[href*="filterByStar=five_star"]'
            ).first();


        if (
            await filter.count() > 0 &&
            await filter.isVisible()
        ) {

            await filter.scrollIntoViewIfNeeded();

            console.log(
                'Found 5-star filter.'
            );

            await filter.click();

            await sleep(1800);

            console.log(
                '5-star filter selected.'
            );

            return true;
        }

    } catch (error) {

        console.log(
            '5-star direct click failed.'
        );
    }


    // --------------------------------------------------------
    // FALLBACK
    // --------------------------------------------------------

    const selectors = [

        'a:has-text("5 star")',

        'a:has-text("5 stars")',

        'button:has-text("5 star")',

        'button:has-text("5 stars")'
    ];


    for (
        const selector of selectors
    ) {

        try {

            const element =
                page.locator(
                    selector
                ).first();


            if (
                await element.count() === 0
            ) {
                continue;
            }


            if (
                !(await element.isVisible())
            ) {
                continue;
            }


            await element.scrollIntoViewIfNeeded();

            await element.click();

            await sleep(1800);

            console.log(
                '5-star filter selected.'
            );

            return true;

        } catch {
            // thử selector tiếp
        }
    }


    console.log(
        'WARNING: Could not select 5-star filter.'
    );

    return false;
}


// ============================================================
// FIND SHOW MORE BUTTON
// ============================================================

async function findShowMoreButton(page) {

    const selectors = [

        'button:has-text("Show 10 more reviews")',

        'button:has-text("Show more reviews")',

        'a:has-text("Show 10 more reviews")',

        'a:has-text("Show more reviews")'
    ];


    for (
        const selector of selectors
    ) {

        try {

            const elements =
                page.locator(
                    selector
                );


            const count =
                await elements.count();


            for (
                let i = count - 1;
                i >= 0;
                i--
            ) {

                const element =
                    elements.nth(i);


                if (
                    await element.isVisible()
                ) {

                    return element;
                }
            }

        } catch {
            // continue
        }
    }


    // --------------------------------------------------------
    // Fallback: scan buttons/links
    // --------------------------------------------------------

    try {

        const elements =
            page.locator(
                'button, a'
            );


        const count =
            await elements.count();


        for (
            let i = count - 1;
            i >= 0;
            i--
        ) {

            const element =
                elements.nth(i);


            if (
                !(await element.isVisible())
            ) {
                continue;
            }


            const text =
                cleanText(
                    await element.innerText()
                ).toLowerCase();


            if (
                text.includes(
                    'show 10 more reviews'
                ) ||
                text.includes(
                    'show more reviews'
                )
            ) {

                return element;
            }
        }

    } catch {
        // ignore
    }


    return null;
}


// ============================================================
// CLICK SHOW MORE
// ============================================================

async function clickShowMore(
    page,
    oldCount
) {

    const button =
        await findShowMoreButton(
            page
        );


    if (!button) {

        console.log(
            '\nNo "Show 10 more reviews" button found.'
        );

        return false;
    }


    try {

        await button.scrollIntoViewIfNeeded();


        console.log(
            'Clicking "Show 10 more reviews"...'
        );


        await button.click();


        // ----------------------------------------------------
        // Chờ DOM tăng số review
        // ----------------------------------------------------

        try {

            await page.waitForFunction(

                (oldCount) => {

                    const count =
                        document.querySelectorAll(
                            '[data-hook="review"]'
                        ).length;

                    return count > oldCount;

                },

                oldCount,

                {
                    timeout: 15000
                }
            );

        } catch {

            // fallback
            await sleep(2000);
        }


        const newCount =
            await page
                .locator(
                    '[data-hook="review"]'
                )
                .count();


        console.log(
            `Reviews loaded: ${oldCount} -> ${newCount}`
        );


        if (
            newCount <= oldCount
        ) {

            console.log(
                'No new reviews were loaded.'
            );

            return false;
        }


        return true;

    } catch (error) {

        console.log(
            'Show more error:',
            error.message
        );

        return false;
    }
}


// ============================================================
// COLLECT ONLY NEW REVIEWS
//
// oldCount = số review đã có ở round trước.
// Chỉ xử lý từ oldCount -> newCount.
// ============================================================

async function collectNewReviews(
    page,
    oldCount,
    allReviews,
    seen
) {

    const reviews =
        page.locator(
            '[data-hook="review"]'
        );


    const count =
        await reviews.count();


    console.log(
        `DOM reviews: ${count}`
    );


    // --------------------------------------------------------
    // Chỉ lấy review mới
    // --------------------------------------------------------

    const startIndex =
        Math.min(
            oldCount,
            count
        );


    const newCount =
        count - startIndex;


    console.log(
        `New reviews this round: ${newCount}`
    );


    // ========================================================
    // CÀO LIÊN TỤC
    // KHÔNG DELAY GIỮA REVIEW
    // ========================================================

    for (
        let i = startIndex;
        i < count;
        i++
    ) {

        if (
            allReviews.length >=
            MAX_REVIEWS
        ) {
            break;
        }


        const data =
            await parseReviewFast(
                reviews.nth(i),
                i
            );


        if (
            data.skip
        ) {

            console.log(
                `Skip ${i + 1}: ${data.reason}`
            );

            continue;
        }


        const key =
            reviewKey(
                data
            );


        if (
            seen.has(key)
        ) {

            console.log(
                `Duplicate: ${data.reviewer}`
            );

            continue;
        }


        seen.add(key);


        allReviews.push(
            data
        );


        console.log(

            `${allReviews.length}. ` +

            `${data.reviewer || 'Unknown'} | ` +

            `5.0 | ` +

            `${data.title || '(no title)'} | ` +

            `${data.review.length} chars | ` +

            `Images: ${data.images.length}`
        );
    }
}


// ============================================================
// FIRST ROUND
//
// Round 1 cần cào 10 review đầu tiên.
// ============================================================

async function collectFirstRound(
    page,
    allReviews,
    seen
) {

    const reviews =
        page.locator(
            '[data-hook="review"]'
        );


    const count =
        await reviews.count();


    console.log(
        `\nReviews found on first load: ${count}`
    );


    for (
        let i = 0;
        i < count;
        i++
    ) {

        if (
            allReviews.length >=
            MAX_REVIEWS
        ) {
            break;
        }


        const data =
            await parseReviewFast(
                reviews.nth(i),
                i
            );


        if (
            data.skip
        ) {

            console.log(
                `Skip ${i + 1}: ${data.reason}`
            );

            continue;
        }


        const key =
            reviewKey(
                data
            );


        if (
            seen.has(key)
        ) {
            continue;
        }


        seen.add(key);

        allReviews.push(
            data
        );


        console.log(

            `${allReviews.length}. ` +

            `${data.reviewer || 'Unknown'} | ` +

            `5.0 | ` +

            `${data.title || '(no title)'} | ` +

            `${data.review.length} chars | ` +

            `Images: ${data.images.length}`
        );
    }


    return count;
}


// ============================================================
// SAVE SHOPBASE CSV
// ============================================================

function saveCsv(reviews) {

    const header = [

        'product_id',

        'product_handle',

        'name_of_customer',

        'email',

        'rating',

        'title',

        'review',

        'date_of_review',

        'link_of_img_1',

        'link_of_img_2',

        'link_of_img_3',

        'link_of_img_4',

        'link_of_img_5',

        'reply'
    ];


    const rows = [];

    rows.push(
        header.join(',')
    );


    reviews.forEach(
        (item, index) => {

            const images =
                item.images || [];


            const row = [

                PRODUCT_ID,

                PRODUCT_HANDLE,

                item.reviewer || '',

                makeEmail(
                    item.reviewer,
                    index + 1
                ),

                5,

                cleanTitle(
                    item.title
                ),

                cleanReview(
                    item.review
                ),

                item.date || '',

                images[0] || '',

                images[1] || '',

                images[2] || '',

                images[3] || '',

                images[4] || '',

                ''
            ];


            rows.push(

                row
                    .map(csvEscape)
                    .join(',')
            );
        }
    );


    fs.writeFileSync(

        OUTPUT_FILE,

        '\uFEFF' +
        rows.join('\n'),

        'utf8'
    );


    console.log(
        `Saved ${reviews.length} reviews -> ${OUTPUT_FILE}`
    );
}


// ============================================================
// CHECK CAPTCHA / BLOCK
// ============================================================

async function checkBlocked(page) {

    try {

        const url =
            page.url().toLowerCase();


        if (
            url.includes('captcha') ||
            url.includes('validatecaptcha')
        ) {

            return true;
        }


        const body =
            (
                await page
                    .locator('body')
                    .innerText()
            )
                .toLowerCase();


        return (

            body.includes(
                'robot check'
            ) ||

            body.includes(
                'automated access'
            ) ||

            body.includes(
                'enter the characters you see below'
            )
        );

    } catch {

        return false;
    }
}


// ============================================================
// MAIN
// ============================================================

(async () => {

    let context = null;


    try {

        console.log(
            '\n# Amazon Review Scraper'
        );

        console.log(
            `Target: ${MAX_REVIEWS} valid reviews`
        );

        console.log(
            'Filter: 5 stars'
        );

        console.log(
            'Review: < 1000 characters'
        );

        console.log(
            'Delay: ONLY between rounds'
        );

        console.log(
            `Images: ${INCLUDE_IMAGES ? 'Enabled' : 'Disabled (No images)'}`
        );


        // ====================================================
        // CHROME LOGIN PROFILE
        // ====================================================

        context =
            await chromium.launchPersistentContext(

                AMAZON_PROFILE,

                {
                    headless: false,

                    viewport: {
                        width: 1400,
                        height: 900
                    }
                }
            );


        let page =
            context
                .pages()[0];


        if (!page) {

            page =
                await context.newPage();
        }


        // Timeout thấp để tránh chờ lâu
        page.setDefaultTimeout(
            5000
        );

        page.setDefaultNavigationTimeout(
            60000
        );


        // ====================================================
        // OPEN PRODUCT
        // ====================================================

        console.log(
            '\nOpening product...'
        );


        await page.goto(

            PRODUCT_URL,

            {
                waitUntil:
                    'domcontentloaded',

                timeout:
                    60000
            }
        );


        // Chờ trang ổn định một chút
        await sleep(2000);


        // ====================================================
        // CHECK BLOCK
        // ====================================================

        if (
            await checkBlocked(page)
        ) {

            throw new Error(
                'Amazon CAPTCHA / Robot Check detected.'
            );
        }


        // ====================================================
        // SCROLL TO REVIEWS
        // ====================================================

        console.log(
            'Finding reviews...'
        );


        const reviewSection =
            page.locator(
                '#customerReviews'
            ).first();


        if (
            await reviewSection.count() > 0
        ) {

            await reviewSection
                .scrollIntoViewIfNeeded();

        } else {

            await page.evaluate(() => {

                window.scrollTo(
                    0,
                    document.body.scrollHeight
                );

            });
        }


        await sleep(1000);


        // ====================================================
        // SELECT 5 STAR
        // ====================================================

        await selectFiveStars(
            page
        );


        // ====================================================
        // WAIT REVIEW
        // ====================================================

        await page
            .locator(
                '[data-hook="review"]'
            )
            .first()
            .waitFor({
                state: 'visible',
                timeout: 15000
            });


        // ====================================================
        // STORAGE
        // ====================================================

        const allReviews = [];

        const seen =
            new Set();


        // ====================================================
        // ROUND 1
        // ====================================================

        console.log(
            '\n=========================================='
        );

        console.log(
            'ROUND 1'
        );

        console.log(
            '=========================================='
        );


        let loadedReviewCount =
            await collectFirstRound(
                page,
                allReviews,
                seen
            );


        saveCsv(
            allReviews
        );


        console.log(
            `Progress: ${allReviews.length}/${MAX_REVIEWS}`
        );


        // ====================================================
        // ROUND 2+
        // ====================================================

        let round = 1;


        while (
            allReviews.length <
            MAX_REVIEWS
        ) {

            // ------------------------------------------------
            // CLICK SHOW MORE
            // ------------------------------------------------

            const clicked =
                await clickShowMore(
                    page,
                    loadedReviewCount
                );


            if (!clicked) {

                console.log(
                    '\nAmazon did not provide more reviews.'
                );

                break;
            }


            // ------------------------------------------------
            // DELAY ONLY HERE
            // ------------------------------------------------

            const delay =
                randomDelay(
                    MIN_ROUND_DELAY,
                    MAX_ROUND_DELAY
                );


            console.log(
                `Waiting ${Math.round(delay / 1000)}s before next round...`
            );


            await sleep(
                delay
            );


            // ------------------------------------------------
            // BLOCK CHECK
            // ------------------------------------------------

            if (
                await checkBlocked(page)
            ) {

                console.log(
                    '\nAmazon verification detected.'
                );

                console.log(
                    'Stopping scraper.'
                );

                break;
            }


            // ------------------------------------------------
            // NEXT ROUND
            // ------------------------------------------------

            round++;


            console.log(
                '\n=========================================='
            );

            console.log(
                `ROUND ${round}`
            );

            console.log(
                '=========================================='
            );


            // ------------------------------------------------
            // CÀO CHỈ REVIEW MỚI
            // ------------------------------------------------

            const oldCount =
                loadedReviewCount;


            loadedReviewCount =
                await page
                    .locator(
                        '[data-hook="review"]'
                    )
                    .count();


            console.log(
                `Previously loaded: ${oldCount}`
            );

            console.log(
                `Currently loaded: ${loadedReviewCount}`
            );


            await collectNewReviews(
                page,
                oldCount,
                allReviews,
                seen
            );


            // ------------------------------------------------
            // SAVE SAU MỖI ROUND
            // ------------------------------------------------

            saveCsv(
                allReviews
            );


            console.log(
                `Progress: ${allReviews.length}/${MAX_REVIEWS}`
            );
        }


        // ====================================================
        // FINAL
        // ====================================================

        saveCsv(
            allReviews
        );


        console.log(
            '\n=========================================='
        );

        console.log(
            'SCRAPER FINISHED'
        );

        console.log(
            '=========================================='
        );

        console.log(
            `Valid reviews: ${allReviews.length}`
        );

        console.log(
            `CSV: ${OUTPUT_FILE}`
        );

        console.log(
            '=========================================='
        );


    } catch (error) {

        console.error(
            '\nSCRAPER ERROR:'
        );

        console.error(
            error.message
        );


    } finally {

        if (context) {

            try {

                await context.close();

            } catch {
                // ignore
            }
        }
    }

})();