const Apify = require('apify');

const { GlobalStore } = require('apify-global-store');

const {
    extractDetail,
    listPageFunction,
    extractUserReviews,
    extractReviews,
} = require('./extraction');

const {
    getAttribute,
    addUrlParameters,
    fixUrl,
    isObject,
    enqueueFilterLinks,
    enqueueAllPaginationPages,
    enqueueAllReviewsPages,
    getPagename,
} = require('./util');

const { MAX_PAGES, RESULTS_PER_PAGE, LABELS, REDUCER_ACTION_TYPES } = require('./consts');

const { log } = Apify.utils;

module.exports = async (context, globalContext) => {
    const { page, request, session, crawler: { requestQueue } } = context;
    const { url, userData } = request;
    const { label } = userData;

    log.info(`Opened url (${label})`, { url });

    if (label === LABELS.DETAIL) {
        await handleDetailPage(context, globalContext);
    } else if (label === LABELS.REVIEW) {
        await handleReviewPage(context, globalContext);
    } else if (label === LABELS.START || label === LABELS.PAGE) {
        await handleListPage({ page, request, session, requestQueue }, globalContext);
    }
};

const handleDetailPage = async (context, globalContext) => {
    const {
        page,
        session,
        crawler: { requestQueue },
        request: { url, userData },
    } = context;
    const { input, extendOutputFunction } = globalContext;

    const { startUrls, minScore, extractReviewerName = false } = input;

    const html = await page.content();
    await Apify.setValue('DETAIL_PAGE', html, { contentType: 'text/html' });

    await waitForDetailPageToLoad(page);

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

    const userReviews = extractUserReviews(html, extractReviewerName);
    const userResult = await getExtendedUserResult(page, extendOutputFunction, input.extendOutputFunction);

    const detailPagename = getPagename(new URL(url));

    // If we're scraping reviews as well, we'll store the result into the dataset once it's merged with the reviews.
    const store = GlobalStore.summon();
    if (store.state.maxReviewsPages > 0) {
        await saveDetailIntoStore(detail, detailPagename);
        await enqueueAllReviewsPages(page, requestQueue, detailPagename);
    } else {
        // Store userReviews extracted directly from detail page only if no reviews are scraped from extra requests.
        await Apify.pushData({ ...detail, userReviews, ...userResult });
    }
};

const handleListPage = async ({ page, request, session, requestQueue }, globalContext) => {
    const { input, sortBy } = globalContext;
    const { startUrls, simple } = input;
    const { userData: { label } } = request;

    await waitForListPageToLoad(page);

    // Check if the page was opened through working proxy.
    validateProxy(page, session, startUrls, sortBy);

    const itemsCount = await getCurrentPageResultsCount(page);
    if (itemsCount === 0) {
        log.info('Found no result. Skipping...');
        return;
    }

    if (simple) {
        // If simple output is enough, extract the data.
        const results = await extractListPageResults(page, request, input);
        await Apify.pushData(results);
    } else {
        // If not, enqueue the detail pages to be extracted.
        await enqueueDetailPages(page, input, requestQueue);
    }

    if (label === LABELS.START) {
        await handleStartPage({ page, request, requestQueue }, globalContext);
    }
};

const handleStartPage = async ({ page, request, requestQueue }, globalContext) => {
    const { input } = globalContext;
    const { useFilters } = input;

    const store = GlobalStore.summon();
    const { state: { remainingPages } } = store;

    const totalResults = await getTotalListingsCount(page);
    const usingFilters = shouldUseFilters(totalResults, useFilters, remainingPages);

    /**
     * If filtering is enabled, enqueue filtered pages. Filter pages enqueuing is placed
     * before pagination pages enqueuing on purpose - setting new filter restriction displays
     * differents results on the first listing page so we will be getting new dataset items faster
     * at the beginning.
     */
    if (usingFilters) {
        await enqueueFilteredPages({ page, request, requestQueue });
    }

    /**
     * Enqueue all pagination pages from start page when shouldUseFilters is false.
     * With useFilters set, we enqueue all combinations of available filters and for each
     * combination, we only scrape first page if there are more than MAX_RESULTS_LIMIT results
     * to avoid pagination pages overload. At some point, we surely get under MAX_RESULTS_LIMIT
     * results and then we enqueue pagination links instead of more filtered pages.
     */
    if (!usingFilters) {
        if (remainingPages > 0) {
            await enqueueAllPaginationPages(page, requestQueue, globalContext);
        }
    }
};

const handleReviewPage = async (context, globalContext) => {
    const {
        page,
        session,
        request: {
            url: reviewUrl,
            userData: { detailPagename },
        },
    } = context;
    const { input } = globalContext;

    const { startUrls, extractReviewerName = false } = input;

    const html = await page.content();
    await Apify.setValue('REVIEW_PAGE', html, { contentType: 'text/html' });

    await waitForReviewPageToLoad(page);
    await Apify.utils.puppeteer.injectJQuery(page);

    // Check if the page was opened through working proxy.
    validateProxy(page, session, startUrls, 'label');

    let reviews = await extractReviews(page);
    if (!extractReviewerName) {
        reviews = reviews.map((review) => {
            const reviewWithoutGuestName = { ...review };
            delete reviewWithoutGuestName.guestName;
            return reviewWithoutGuestName;
        });
    }

    const store = GlobalStore.summon();
    const { ADD_REVIEWS, REMOVE_PROCESSED_REVIEW_URL } = REDUCER_ACTION_TYPES;

    store.setWithReducer({
        type: ADD_REVIEWS,
        detailPagename,
        reviews,
    });

    store.setWithReducer({
        type: REMOVE_PROCESSED_REVIEW_URL,
        detailPagename,
        reviewUrl,
    });

    await store.forceSave();

    if (store.state.reviewPagesToProcess[detailPagename].length === 0) {
        log.info('Extracted all reviews, pushing result to the dataset...', { detailPagename });
        await store.pushPathToDataset(`details.${detailPagename}`);
    }
};

const saveDetailIntoStore = async (detail, detailPagename) => {
    const { ADD_DETAIL } = REDUCER_ACTION_TYPES;

    const store = GlobalStore.summon();

    store.setWithReducer({
        type: ADD_DETAIL,
        detail: {
            ...detail,
            reviews: [],
        },
        detailPagename,
    });

    await store.forceSave();
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

const enqueueFilteredPages = async ({ page, request, requestQueue }) => {
    log.info('enqueuing filtered pages...');

    const attribute = 'value';
    const unchecked = `[type="checkbox"][${attribute}]:not([checked]):not(.bui-checkbox__input)`;

    const extractionInfo = { page, unchecked, attribute };
    const urlInfo = { baseUrl: request.url, label: LABELS.START };

    await enqueueFilterLinks(extractionInfo, urlInfo, requestQueue);
};

const enqueueDetailPages = async (page, input, requestQueue) => {
    log.info('enqueuing detail pages...');

    const urlMod = fixUrl('&', input);
    const keyMod = async (link) => (await getAttribute(link, 'textContent')).trim().replace(/\n/g, '');

    const prItem = await page.$('.bui-pagination__info');
    const pageRange = (await getAttribute(prItem, 'textContent')).match(/\d+/g);
    const firstItem = parseInt(pageRange && pageRange[0] ? pageRange[0] : '1', 10);

    const links = await page.$$(
        // eslint-disable-next-line max-len
        '.sr_property_block.sr_item:not(.soldout_property) .hotel_name_link, [data-capla-component*="PropertiesListDesktop"] [data-testid="property-card"] a[data-testid="title-link"]',
    );

    for (let iLink = 0; iLink < links.length; iLink++) {
        const link = links[iLink];
        const href = await getAttribute(link, 'href');

        if (href) {
            const uniqueKeyCal = keyMod ? await keyMod(link) : href;
            const urlModCal = urlMod ? urlMod(href) : href;

            await requestQueue.addRequest(
                {
                    userData: {
                        label: LABELS.DETAIL,
                        order: iLink + firstItem,
                    },
                    url: urlModCal,
                    uniqueKey: uniqueKeyCal,
                },
                { forefront: true },
            );
        }
    }
};

const waitForListPageToLoad = async (page) => {
    const countSelector = '.sorth1, .sr_header h1, .sr_header h2, [data-capla-component*="HeaderDesktop"] h1';
    await page.waitForSelector(countSelector, { timeout: 60000 });

    const headingText = await getHeadingText(page, countSelector);
    log.info(headingText);
};

const waitForDetailPageToLoad = async (page) => {
    try {
        await page.waitForSelector('.bicon-occupancy');
    } catch (e) {
        log.info('occupancy info not found');
    }
};

const waitForReviewPageToLoad = async (page) => {
    try {
        await page.waitForSelector('.c-review-block');
    } catch (e) {
        log.info('review info not found');
    }
};

const getHeadingText = async (page) => {
    const countSelector = '.sorth1, .sr_header h1, .sr_header h2, [data-capla-component*="HeaderDesktop"] h1';
    const heading = await page.$(countSelector);

    return heading ? (await getAttribute(heading, 'textContent')).trim() : 'No heading found.';
};

const validateProxy = (page, session, startUrls, requiredQueryParam) => {
    const pageUrl = page.url();

    if (!startUrls && pageUrl.indexOf(requiredQueryParam) < 0) {
        session.retire();
        throw new Error(`Page was not opened correctly`);
    }
};

const shouldUseFilters = (totalResults, useFilters, remainingPages) => {
    const maxResults = MAX_PAGES * RESULTS_PER_PAGE;
    const requiresPagesOverLimit = remainingPages > MAX_PAGES;

    return useFilters && totalResults > maxResults && requiresPagesOverLimit;
};

const getCurrentPageResultsCount = async (page) => {
    // eslint-disable-next-line max-len
    const items = await page.$$(
        '.sr_property_block.sr_item:not(.soldout_property), [data-capla-component*="PropertiesListDesktop"] [data-testid="property-card"]',
    );

    return items.length;
};

const getTotalListingsCount = async (page) => {
    const heading = await getHeadingText(page);

    return parseInt(heading.replace(/[^0-9]/g, ''), 10);
};

const extractListPageResults = async (page, request, input) => {
    log.info('extracting data...');
    await Apify.utils.puppeteer.injectJQuery(page);
    const result = await page.evaluate(listPageFunction, input);

    const toBeAdded = [];

    const store = GlobalStore.summon();
    const { state: { useFiltersData } } = store;
    const { ADD_CRAWLED_NAME } = REDUCER_ACTION_TYPES;

    if (result.length > 0) {
        for (const item of result) {
            item.url = addUrlParameters(item.url, input);
            if (!useFiltersData.crawledNames.includes(item.name)) {
                toBeAdded.push(item);

                store.setWithReducer({
                    type: ADD_CRAWLED_NAME,
                    crawledName: item.name,
                });
            }
        }

        log.info(`Found ${toBeAdded.length} new results out of ${result.length} results.`, { url: request.url });
    }

    return toBeAdded;
};
