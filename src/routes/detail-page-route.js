const Apify = require('apify');
const { GlobalStore } = require('apify-global-store');
const { REVIEWS_RESULTS_PER_REQUEST, LABELS, PLACE_COUNTRY_URL_CODE_REGEX } = require('../consts');
const { extractDetail, extractPreviewReviews } = require('../extraction/detail-page-extraction');
const { getMaxReviewsPages, addDetail, setReviewUrlsToProcess } = require('../global-store');

const {
    validateProxy,
    saveDetailIfComplete,
    isObject,
    setHtmlDebugValue,
    getAttribute,
    getPagename,
    getLocalizedUrl,
} = require('../util');

const { log } = Apify.utils;

module.exports.handleDetailPage = async (context, globalContext) => {
    const {
        page,
        session,
        request: { url, userData },
    } = context;
    const { input, extendOutputFunction } = globalContext;

    const { startUrls, minScore, language, scrapeReviewerName = false } = input;

    await setHtmlDebugValue(page, 'DETAIL_PAGE');
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

        const { reviews: reviewsCount } = detail;
        await enqueueAllReviewsPages(context, detailPagename, reviewsCount, language);

        await saveDetailIfComplete(detailPagename);
    } else {
        // Store userReviews extracted directly from detail page only if no reviews are scraped from extra requests.
        const html = await page.content();
        const store = GlobalStore.summon();

        const previewReviews = extractPreviewReviews(html, scrapeReviewerName);
        const userReviews = previewReviews.slice(0, store.state.maxReviews);

        await Apify.pushData({ ...detail, userReviews, ...userResult });
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

const enqueueAllReviewsPages = async (context, detailPagename, reviewsCount, language) => {
    const { page, crawler: { requestQueue } } = context;

    const detailPageUrl = await page.url();
    const reviewsUrl = buildReviewsStartUrl(detailPageUrl, language);

    const reviewPagesUrls = getReviewPagesUrls(reviewsUrl, reviewsCount);
    log.info(`Found ${reviewsCount} reviews.
    Enqueuing ${reviewPagesUrls.length} reviews pages (${REVIEWS_RESULTS_PER_REQUEST} reviews per page)...`, { detailPageUrl });

    setReviewUrlsToProcess(detailPagename, reviewPagesUrls);

    for (let index = 0; index < reviewPagesUrls.length; index++) {
        const url = reviewPagesUrls[index];
        const request = {
            url,
            userData: {
                label: LABELS.REVIEW,
                detailPagename,
            },
        };

        await requestQueue.addRequest(
            request,

            /**
            * Reviews have to be prioritized as we're waiting for all
            * reviews to be processed before we push the detail into the dataset.
            */
            { forefront: true },
        );
    }
};

const buildReviewsStartUrl = (detailPageUrl, language) => {
    const url = new URL(detailPageUrl);
    const { searchParams } = url;

    const reviewsBaseUrl = 'https://www.booking.com/reviewlist.html';
    const reviewsUrl = new URL(getLocalizedUrl(reviewsBaseUrl, language));

    // regex.exec(string) needs to be used instead of string.match(regex) to make capturing group work properly
    const placeCountryMatches = PLACE_COUNTRY_URL_CODE_REGEX.exec(detailPageUrl);
    const placeCountryMatch = placeCountryMatches ? placeCountryMatches[1] : '';

    const reviewUrlParams = {
        aid: searchParams.get('aid'),
        label: searchParams.get('label'),
        sid: searchParams.get('sid'),
        srpvid: searchParams.get('srpvid'),
        pagename: getPagename(detailPageUrl),
        cc1: placeCountryMatch,
        rows: REVIEWS_RESULTS_PER_REQUEST,
        offset: 0,
    };

    Object.keys(reviewUrlParams).forEach((key) => {
        reviewsUrl.searchParams.set(key, reviewUrlParams[key]);
    });

    return reviewsUrl;
};

const getReviewPagesUrls = (reviewsUrl, reviewsCount) => {
    const urlsToEnqueue = [];

    const maxReviewsPages = getMaxReviewsPages();
    const reviewsToEnqueue = Math.min(reviewsCount, maxReviewsPages * REVIEWS_RESULTS_PER_REQUEST);

    for (let enqueuedReviews = 0; enqueuedReviews < reviewsToEnqueue; enqueuedReviews += REVIEWS_RESULTS_PER_REQUEST) {
        reviewsUrl.searchParams.set('offset', enqueuedReviews);
        urlsToEnqueue.push(reviewsUrl.toString());
    }

    return urlsToEnqueue;
};
