const Apify = require('apify');

const { MAX_PAGES, RESULTS_PER_PAGE, LABELS } = require('./consts');
const { getRemainingPages, addEnqueuedUrl, decrementRemainingPages, getEnqueuedUrls } = require('./global-store');
const { getAttribute } = require('./util');

const { log } = Apify.utils;

module.exports.shouldUseFilters = (totalResults, useFilters) => {
    const maxResults = MAX_PAGES * RESULTS_PER_PAGE;
    const remainingPages = getRemainingPages();

    const requiresPagesOverLimit = remainingPages > MAX_PAGES;

    return useFilters && totalResults > maxResults && requiresPagesOverLimit;
};

module.exports.enqueueFilteredPages = async ({ page, request, requestQueue }) => {
    log.info('enqueuing filtered pages...');

    const attribute = 'value';
    const unchecked = `[type="checkbox"][${attribute}]:not([checked]):not(.bui-checkbox__input)`;

    const extractionInfo = { page, unchecked, attribute };
    const urlInfo = { baseUrl: request.url, label: LABELS.START };

    await enqueueFilterLinks(extractionInfo, urlInfo, requestQueue);
};

const enqueueFilterLinks = async (extractionInfo, urlInfo, requestQueue) => {
    const { page, unchecked, attribute } = extractionInfo;
    const { label, baseUrl } = urlInfo;

    const url = new URL(baseUrl);

    const uncheckedElements = await page.$$(unchecked);
    const uncheckedFilters = await getFilterNameValues(uncheckedElements, attribute);

    const validFilters = getValidFilters(uncheckedFilters);
    const filtersToEnqueue = getFiltersToEnqueue(validFilters, url);
    const newFiltersCount = filtersToEnqueue.length;

    if (newFiltersCount) {
        log.info(`enqueuing pages with ${filtersToEnqueue.length} new filters set...`);
    }

    await enqueueFilters(filtersToEnqueue, requestQueue, label, baseUrl);
};

const getFilterNameValues = async (elements, attribute) => {
    const nameValues = {};

    for (const element of elements) {
        const filterValue = await getAttribute(element, attribute);

        const [name, value] = filterValue.split('=');
        nameValues[name] = nameValues[name] || [];
        nameValues[name].push(value);
    }

    return nameValues;
};

const getValidFilters = (uncheckedFilters) => {
    const validFilters = { ...uncheckedFilters };

    /* Exclude review_score from filter enqueuing. It has a strict value for each run that can not be changed. */
    delete validFilters.review_score;

    // Invalid filter that is scraped among other checkboxes.
    delete validFilters['1'];

    return validFilters;
};

const getFiltersToEnqueue = (filters, url) => {
    const filtersToEnqueue = [];

    Object.keys(filters).forEach((name) => {
        const values = filters[name].filter((value) => {
            // remove value which is included with the same parameter in current url
            return value && !url.search.includes(`${name}=${value}`);
        });

        const isFilterEnqueued = isFilterAlreadyEnqueued(name, url);

        if (!isFilterEnqueued) {
            filtersToEnqueue.push({ name, values });
        }
    });

    return filtersToEnqueue;
};

const isFilterAlreadyEnqueued = (name, url) => {
    const updatedUrl = new URL(url);
    updatedUrl.searchParams.set(name, 'example');

    const enqueuedUrls = getEnqueuedUrls();

    for (const enqueuedUrl of enqueuedUrls) {
        if (haveSameQueryParamNames(updatedUrl, enqueuedUrl)) {
            return true;
        }
    }

    return false;
};

const haveSameQueryParamNames = (firstUrl, secondUrl) => {
    if (firstUrl.pathname !== secondUrl.pathname) {
        return false;
    }

    /* Cross validation with matching firstUrl -> secondUrl parameters
       as well as secondUrl -> firstUrl parameters. The length of searchParams
       iterable can not be checked directly without looping through it.
    */

    for (const key of firstUrl.searchParams.keys()) {
        if (!secondUrl.searchParams.has(key)) {
            return false;
        }
    }

    for (const key of secondUrl.searchParams.keys()) {
        if (!firstUrl.searchParams.has(key)) {
            return false;
        }
    }

    return true;
};

const enqueueFilters = async (filters, requestQueue, label, baseUrl) => {
    for (const filter of filters) {
        const { name, values } = filter;

        // Enqueue filter with all possible values.
        for (const value of values) {
            const url = new URL(baseUrl);
            url.searchParams.set(name, value);

            // Check that url with the exact same filters and values doesn't exist already.
            const enqueuedUrls = getEnqueuedUrls();
            const remainingPages = getRemainingPages();

            if (!enqueuedUrls.includes(url) && remainingPages > 0) {
                addEnqueuedUrl(url);
                decrementRemainingPages();

                await requestQueue.addRequest({
                    url: url.toString(),
                    userData: { label },
                });
            }
        }
    }
};
