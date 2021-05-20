const Apify = require('apify');

const { addUrlParameters } = require('./util');

const { downloadListOfUrls, log } = Apify.utils;

module.exports.prepareRequestSources = async ({ startUrls, input, maxPages, sortBy }) => {
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
        // Create startURL based on provided INPUT.
        const dType = input.destType || 'city';
        const query = encodeURIComponent(input.search);
        startUrl = `https://www.booking.com/searchresults.html?dest_type=${dType}&ss=${query}&order=${sortBy}`;
        startUrl = addUrlParameters(startUrl, input);

        // Enqueue all pagination pages.
        startUrl += '&rows=25';
        log.info(`startUrl: ${startUrl}`);
        requestSources.push({ url: startUrl, userData: { label: 'start' } });
        if (!input.useFilters && input.minMaxPrice === 'none' && input.propertyType === 'none' && maxPages) {
            for (let i = 1; i < maxPages; i++) {
                requestSources.push({
                    url: `${startUrl}&offset=${25 * i}`,
                    userData: { label: 'page' },
                });
            }
        }
    }
    return { requestSources, startUrl };
}
