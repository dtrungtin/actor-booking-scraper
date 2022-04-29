const Apify = require('apify');

const { extractReviews } = require('../extraction/review-page-extraction');
const { addReviews, removeProcessedReviewUrl } = require('../global-store');
const { saveDetailIfComplete, validateProxy, setHtmlDebugValue } = require('../util');

const { log } = Apify.utils;

module.exports.handleReviewPage = async (context, globalContext) => {
    const {
        page,
        session,
        request: {
            url: reviewUrl,
            userData: { detailPagename },
        },
    } = context;
    const { input } = globalContext;

    const { startUrls, scrapeReviewerName = false } = input;

    await setHtmlDebugValue(page, 'REVIEW_PAGE');
    await waitForPageToLoad(page);

    await Apify.utils.puppeteer.injectJQuery(page);

    // Check if the page was opened through working proxy.
    validateProxy(page, session, startUrls, 'label');

    let reviews = await extractReviews(page);
    if (!scrapeReviewerName) {
        reviews = reviews.map((review) => {
            const reviewWithoutGuestName = { ...review };
            delete reviewWithoutGuestName.guestName;
            return reviewWithoutGuestName;
        });
    }

    addReviews(detailPagename, reviews);
    removeProcessedReviewUrl(detailPagename, reviewUrl);

    await saveDetailIfComplete(detailPagename);
};

const waitForPageToLoad = async (page) => {
    try {
        await page.waitForSelector('.c-review-block');
    } catch (e) {
        log.info('review info not found');
    }
};
