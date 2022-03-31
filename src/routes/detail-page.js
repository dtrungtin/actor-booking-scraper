const Apify = require('apify');
const { extractDetail, extractPreviewReviews } = require('../extraction/detail-page-extraction');
const { getMaxReviewsPages, addDetail } = require('../global-store');

const {
    validateProxy,
    saveDetailIfComplete,
    enqueueAllReviewsPages,
    isObject,
    getAttribute,
    getPagename,
} = require('../util');

const { log } = Apify.utils;

module.exports.handleDetailPage = async (context, globalContext) => {
    const {
        page,
        session,
        request: { url, userData },
    } = context;
    const { input, extendOutputFunction } = globalContext;

    const { startUrls, minScore, language, extractReviewerName = false } = input;

    const html = await page.content();
    await Apify.setValue('DETAIL_PAGE', html, { contentType: 'text/html' });

    await waitForPageToLoad(page);

    const ldElem = await page.$('script[type="application/ld+json"]');
    const ld = JSON.parse(await getAttribute(ldElem, 'textContent'));
    await Apify.utils.puppeteer.injectJQuery(page);

    // Check if the page was opened through working proxy.
    validateProxy(page, session, startUrls, 'label');

    // Exit if core data is not present or the rating is too low.
    if (!ld || (minScore && ld.aggregateRating && ld.aggregateRating.ratingValue < minScore)) {
        return;
    }

    // Extract the data.
    log.info('extracting detail...');
    const detail = await extractDetail(page, ld, input, userData);
    log.info('detail extracted');

    const userResult = await getExtendedUserResult(page, extendOutputFunction, input.extendOutputFunction);

    // If we're scraping reviews as well, we'll store the result into the dataset once it's merged with the reviews.
    if (getMaxReviewsPages() > 0) {
        const detailPagename = getPagename(url);
        addDetail(detailPagename, detail);

        const { reviewsCount } = detail;
        await enqueueAllReviewsPages(context, detailPagename, reviewsCount, language);

        await saveDetailIfComplete(detailPagename);
    } else {
        // Store userReviews extracted directly from detail page only if no reviews are scraped from extra requests.
        const reviews = extractPreviewReviews(html, extractReviewerName);
        await Apify.pushData({ ...detail, reviews, ...userResult });
    }
};

const waitForPageToLoad = async (page) => {
    try {
        await page.waitForSelector('.bicon-occupancy');
    } catch (e) {
        log.info('occupancy info not found');
    }
};

const getExtendedUserResult = async (page, extendOutputFunction, stringifiedExtendOutputFunction) => {
    let userResult = {};

    if (extendOutputFunction) {
        userResult = await page.evaluate(async (functionStr) => {
            // eslint-disable-next-line no-eval
            const f = eval(functionStr);
            return f(window.jQuery);
        }, stringifiedExtendOutputFunction);

        if (!isObject(userResult)) {
            log.error('extendOutputFunction has to return an object!!!');
            process.exit(1);
        }
    }

    return userResult;
};
