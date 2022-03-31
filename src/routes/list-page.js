const Apify = require('apify');

const { LABELS, MAX_PAGES, RESULTS_PER_PAGE } = require('../consts');
const { listPageFunction } = require('../extraction/list-page-extraction');
const { getRemainingPages, getCrawledNames, addCrawledName } = require('../global-store');
const {
    enqueueAllPaginationPages,
    enqueueFilterLinks,
    fixUrl,
    getAttribute,
    getLocalizedUrl,
    addUrlParameters,
} = require('../util');

const { log } = Apify.utils;

module.exports.handleListPage = async (context, globalContext) => {
    const { page, request, session, crawler: { requestQueue } } = context;
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

    const totalResults = await getTotalListingsCount(page);
    const usingFilters = shouldUseFilters(totalResults, useFilters);

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
        if (getRemainingPages() > 0) {
            await enqueueAllPaginationPages(page, requestQueue, globalContext);
        }
    }
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

    const { language } = input;

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

            const localizedUrlModCal = getLocalizedUrl(urlModCal, language);

            await requestQueue.addRequest(
                {
                    userData: {
                        label: LABELS.DETAIL,
                        order: iLink + firstItem,
                    },
                    url: localizedUrlModCal,
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

const shouldUseFilters = (totalResults, useFilters) => {
    const maxResults = MAX_PAGES * RESULTS_PER_PAGE;
    const remainingPages = getRemainingPages();

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

    if (result.length > 0) {
        for (const item of result) {
            item.url = addUrlParameters(item.url, input);
            const crawledNames = getCrawledNames();

            if (!crawledNames.includes(item.name)) {
                toBeAdded.push(item);
                addCrawledName(item.name);
            }
        }

        log.info(`Found ${toBeAdded.length} new results out of ${result.length} results.`, { url: request.url });
    }

    return toBeAdded;
};
