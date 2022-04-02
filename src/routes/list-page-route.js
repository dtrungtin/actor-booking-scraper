const Apify = require('apify');

const { LABELS, RESULTS_PER_PAGE } = require('../consts');
const { listPageFunction } = require('../extraction/list-page-extraction');
const { shouldUseFilters, enqueueFilteredPages } = require('../filters');

const {
    getRemainingPages,
    getCrawledNames,
    addCrawledName,
    decrementRemainingPages,
} = require('../global-store');

const {
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

/**
 * Extracts information from the detail page and enqueue all pagination pages.
 *
 * @param {Page} page - The Puppeteer page object.
 * @param {RequestQueue} requestQueue - RequestQueue to add the requests to.
 * @param {{ input: Object }} globalContext - Actor's global context.
 */
const enqueueAllPaginationPages = async (page, requestQueue, globalContext) => {
    const { input } = globalContext;

    const baseUrl = page.url();
    if (baseUrl.indexOf('offset') < 0) {
        log.info('enqueuing pagination pages...');
        const countSelector = '.sorth1, .sr_header h1, .sr_header h2, [data-capla-component*="HeaderDesktop"] h1';
        try {
            const pageUrl = await page.url();
            await page.waitForSelector(countSelector);
            const countElem = await page.$(countSelector);
            const countData = (await getAttribute(countElem, 'textContent')).replace(/\.|,|\s/g, '').match(/\d+/);

            if (countData) {
                const count = Math.ceil(parseInt(countData[0], 10) / RESULTS_PER_PAGE);
                log.info(`pagination pages: ${count}`);

                for (let i = 1; i < count; i++) {
                    const newOffset = RESULTS_PER_PAGE * i;
                    const newUrl = pageUrl.includes('offset=')
                        ? pageUrl.replace(/offset=(\d+)/, `offset=${newOffset}`)
                        : `${pageUrl}&offset=${newOffset}`;

                    if (getRemainingPages() < 1) {
                        break;
                    }

                    decrementRemainingPages();

                    await requestQueue.addRequest({
                        url: addUrlParameters(newUrl, input),
                        userData: { label: 'page' },
                    });
                }
            }
        } catch (e) {
            log.warning(e);
        }
    }
};
