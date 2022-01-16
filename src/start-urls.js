const Apify = require('apify');
const { RESULTS_PER_PAGE, MAX_PAGES } = require('./consts');

const { addUrlParameters } = require('./util');

const { downloadListOfUrls, log } = Apify.utils;

module.exports.prepareRequestSources = async ({ startUrls, input, sortBy }, globalContext) => {
    let startUrl;
    const requestSources = [];
    if (startUrls) {
        // convert any inconsistencies to correct format
        for (let request of startUrls) {
            if (request.requestsFromUrl) {
                const sourceUrlList = await downloadListOfUrls({ url: request.requestsFromUrl });
                for (const url of sourceUrlList) {
                    request = { url };
                    if (request.url.indexOf('/hotel/') > -1) {
                        request.userData = { label: 'detail' };
                    }

                    request.url = addUrlParameters(request.url, input);
                    requestSources.push(request);
                }
            } else {
                if (typeof request === 'string') { request = { url: request }; }

                // TODO: Figure out how to fix this
                if ((!request.userData || !(request.userData.label !== 'detail')) && request.url.indexOf('/hotel/') > -1) {
                    request.userData = { label: 'detail' };
                }

                request.url = addUrlParameters(request.url, input);
                requestSources.push(request);
            }
        }
        startUrl = addUrlParameters('https://www.booking.com/searchresults.html?dest_type=city&ss=paris&order=bayesian_review_score', input);
    } else {
        const { useFilters, minMaxPrice, propertyType } = input;

        // Create startURL based on provided INPUT.
        const dType = input.destType || 'city';
        const query = encodeURIComponent(input.search);
        startUrl = `https://www.booking.com/searchresults.html?dest_type=${dType}&ss=${query}&order=${sortBy}`;
        startUrl = addUrlParameters(startUrl, input);

        // Enqueue all pagination pages.
        log.info(`startUrl: ${startUrl}`);
        if (globalContext.remainingPages > 0) {
            requestSources.push({ url: startUrl, userData: { label: 'start' } });
            globalContext.remainingPages--;
            if (!useFilters && minMaxPrice === 'none' && propertyType === 'none') {
                for (let i = 1; i < MAX_PAGES; i++) {
                    if (globalContext.remainingPages < 1) {
                        break;
                    }

                    requestSources.push({
                        url: `${startUrl}&offset=${RESULTS_PER_PAGE * i}`,
                        userData: { label: 'page' },
                    });
                    globalContext.remainingPages--;
                }
            }
        }
    }
    return { requestSources, startUrl };
};
