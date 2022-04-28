const Apify = require('apify');
const { RESULTS_PER_PAGE, MAX_PAGES, LABELS } = require('./consts');
const { decrementRemainingPages, getRemainingPages } = require('./global-store');

const { addUrlParameters } = require('./util');

const { downloadListOfUrls, log } = Apify.utils;

module.exports.prepareRequestSources = async ({ startUrls }, globalContext) => {
    const { input } = globalContext;

    const requestSources = [];
    let startUrl;

    if (startUrls) {
        const requests = await buildRequestsFromStartUrls(startUrls, input);
        requestSources.push(...requests);

        startUrl = addUrlParameters(
            'https://www.booking.com/searchresults.html?dest_type=city&ss=paris&order=bayesian_review_score',
            input,
        );
    } else {
        startUrl = buildStartUrlFromInput(globalContext);

        const requests = buildRequestsFromInput(startUrl, globalContext);
        requestSources.push(...requests);
    }

    return { requestSources, startUrl };
};

const buildStartUrlFromInput = (globalContext) => {
    const { input, sortBy } = globalContext;
    const { destType, search } = input;

    const dType = destType || 'city';
    const query = encodeURIComponent(search);

    const startUrl = addUrlParameters(
        `https://www.booking.com/searchresults.html?dest_type=${dType}&ss=${query}&order=${sortBy}`,
        input,
    );

    log.info(`startUrl: ${startUrl}`);

    return startUrl;
};

/**
 * Converts any inconsistencies to the correct format.
 * @param {{ url: string }[]} startUrls
 * @param {Record<string, any>} input
 * @returns
 */
const buildRequestsFromStartUrls = async (startUrls, input) => {
    const requests = [];

    for (let request of startUrls) {
        if (request.requestsFromUrl) {
            const sourceUrlList = await downloadListOfUrls({ url: request.requestsFromUrl });
            for (const url of sourceUrlList) {
                request = { url };

                const label = request.url.indexOf('/hotel/') > -1 ? LABELS.DETAIL : LABELS.START;

                request.userData = { label };
                request.url = addUrlParameters(request.url, input);

                requests.push(request);
            }
        } else {
            if (typeof request === 'string') {
                request = { url: request };
            }

            // TODO: Figure out how to fix this
            const isDetailPage = !request.userData || request.userData.label === LABELS.DETAIL;
            const label = isDetailPage && request.url.indexOf('/hotel/') > -1
                ? LABELS.DETAIL
                : LABELS.START;

            request.userData = { label };
            request.url = addUrlParameters(request.url, input);

            requests.push(request);
        }
    }

    return requests;
};

/**
 * Creates start requests from the provided input for all pagination pages.
 * @param {string} startUrl
 * @param {{ input: Record<string, any> }} globalContext
 * @returns
 */
const buildRequestsFromInput = (startUrl, globalContext) => {
    const { input } = globalContext;
    const { useFilters, minMaxPrice, propertyType } = input;

    const requests = [];

    if (getRemainingPages() > 0) {
        const request = {
            url: startUrl,
            userData: { label: LABELS.START },
        };

        requests.push(request);
        decrementRemainingPages();

        if (!useFilters && minMaxPrice === 'none' && propertyType === 'none') {
            for (let i = 1; i < MAX_PAGES; i++) {
                if (getRemainingPages() < 1) {
                    break;
                }

                requests.push({
                    url: `${startUrl}&offset=${RESULTS_PER_PAGE * i}`,
                    userData: { label: LABELS.PAGE },
                });

                decrementRemainingPages();
            }
        }
    }

    return requests;
};
