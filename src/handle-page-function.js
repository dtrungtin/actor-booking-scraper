const Apify = require('apify');

const { extractDetail, listPageFunction } = require('./extraction');
const {
    getAttribute, addUrlParameters, fixUrl, isObject,
    enqueueFilterLinks, enqueueAllPages,
} = require('./util');

const { log } = Apify.utils;

module.exports = async ({ page, request, session, extendOutputFunction, requestQueue, input,
    sortBy, state }) => {
    const { url, userData } = request;
    const { label } = userData;

    log.info(`open url(${label}): ${url}`);

    if (label === 'detail') {
        await handleDetailPage(page, input, userData, session, extendOutputFunction);
    } else {
        await handleListPage(page, input, request, session, requestQueue, sortBy, state);
    }
};

const handleDetailPage = async (page, input, userData, session, extendOutputFunction) => {
    const { startUrls, minScore } = input;

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

    const userResult = await getExtendedUserResult(page, extendOutputFunction, input.extendOutputFunction);

    await Apify.pushData({ ...detail, ...userResult });
};

const handleListPage = async (page, input, request, session, requestQueue, sortBy, state) => {
    const { startUrls, useFilters, simple } = input;
    const { userData: { label } } = request;

    await waitForListPageToLoad(page);

    // Check if the page was opened through working proxy.
    validateProxy(page, session, startUrls, sortBy);

    const items = await getResultsCount(page);
    if (items.length === 0) {
        log.info('Found no result. Skipping...');
        return;
    }

    if (simple) {
        // If simple output is enough, extract the data.
        const results = await extractListPageResults(page, input, state);
        await Apify.pushData(results);
    } else {
        // If not, enqueue the detail pages to be extracted.
        await enqueueDetailPages(page, input, requestQueue);
    }

    // If filtering is enabled, enqueue filtered pages.
    if (useFilters) {
        await enqueueFilteredPages(page, request, requestQueue, state);
    }

    /* Enqueue all pagination pages from start page when useFilters is false.
       With useFilters set, we enqueue all combinations of available filters and for each
       combination, we scrape first page only to avoid pagination pages overload.
       We should still get most of the results - the more specific filter combination,
       the fewer results it yields.
    */
    if (!useFilters && label !== 'page') {
        await enqueuePaginationPages(page, input, requestQueue);
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

const enqueuePaginationPages = async (page, input, requestQueue) => {
    const { maxPages } = input;

    if (!maxPages || maxPages > 1) {
        await enqueueAllPages(page, requestQueue, input, maxPages);
    }
};

const enqueueFilteredPages = async (page, request, requestQueue, state) => {
    log.info('enqueuing filtered pages...');

    const attribute = 'value';
    const unchecked = `[type="checkbox"][${attribute}]:not([checked]):not(.bui-checkbox__input)`;

    const extractionInfo = { page, unchecked, attribute };
    const urlInfo = { baseUrl: request.url, label: 'start' };

    await enqueueFilterLinks(extractionInfo, urlInfo, requestQueue, state);
};

const enqueueDetailPages = async (page, input, requestQueue) => {
    log.info('enqueuing detail pages...');

    const urlMod = fixUrl('&', input);
    const keyMod = async (link) => (await getAttribute(link, 'textContent')).trim().replace(/\n/g, '');

    const prItem = await page.$('.bui-pagination__info');
    const pageRange = (await getAttribute(prItem, 'textContent')).match(/\d+/g);
    const firstItem = parseInt(pageRange && pageRange[0] ? pageRange[0] : '1', 10);

    // eslint-disable-next-line max-len
    const links = await page.$$('.sr_property_block.sr_item:not(.soldout_property) .hotel_name_link, [data-capla-component*="PropertiesListDesktop"] [data-testid="property-card"] a[data-testid="title-link"]');

    for (let iLink = 0; iLink < links.length; iLink++) {
        const link = links[iLink];
        const href = await getAttribute(link, 'href');

        if (href) {
            const uniqueKeyCal = keyMod ? (await keyMod(link)) : href;
            const urlModCal = urlMod ? urlMod(href) : href;

            await requestQueue.addRequest({
                userData: {
                    label: 'detail',
                    order: iLink + firstItem,
                },
                url: urlModCal,
                uniqueKey: uniqueKeyCal,
            }, { forefront: true });
        }
    }
};

const waitForListPageToLoad = async (page) => {
    const countSelector = '.sorth1, .sr_header h1, .sr_header h2, [data-capla-component*="HeaderDesktop"] h1';
    await page.waitForSelector(countSelector, { timeout: 60000 });
    const heading = await page.$(countSelector);

    const headingText = heading ? (await getAttribute(heading, 'textContent')).trim() : 'No heading found.';
    log.info(headingText);
};

const waitForDetailPageToLoad = async (page) => {
    try {
        await page.waitForSelector('.bicon-occupancy');
    } catch (e) {
        log.info('occupancy info not found');
    }
};

const validateProxy = (page, session, startUrls, requiredQueryParam) => {
    const pageUrl = page.url();

    if (!startUrls && pageUrl.indexOf(requiredQueryParam) < 0) {
        session.retire();
        throw new Error(`Page was not opened correctly`);
    }
};

const getResultsCount = async (page) => {
    // eslint-disable-next-line max-len
    const items = await page.$$('.sr_property_block.sr_item:not(.soldout_property), [data-capla-component*="PropertiesListDesktop"] [data-testid="property-card"]');

    return items.length;
};

const extractListPageResults = async (page, input, state) => {
    log.info('extracting data...');
    await Apify.utils.puppeteer.injectJQuery(page);
    const result = await page.evaluate(listPageFunction, input);

    const toBeAdded = [];

    if (result.length > 0) {
        for (const item of result) {
            item.url = addUrlParameters(item.url, input);
            if (!state.crawled[item.name]) {
                toBeAdded.push(item);
                state.crawled[item.name] = true;
            }
        }

        log.info(`Found ${toBeAdded.length} new results out of ${result.length} results.`);
    }

    return toBeAdded;
};
