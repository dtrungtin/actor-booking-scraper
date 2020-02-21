const Apify = require('apify');
const _ = require('underscore');

const { extractDetail, listPageFunction } = require('./extraction.js');
const { checkDate, retireBrowser, isObject } = require('./util.js');
const {
    getAttribute, enqueueLinks, addUrlParameters, getWorkingBrowser, fixUrl,
    isFiltered, isMinMaxPriceSet, setMinMaxPrice, isPropertyTypeSet, setPropertyType, enqueueAllPages,
} = require('./util.js');

const { log } = Apify.utils;

const puppeteerOptions = {
    headless: true,
    ignoreHTTPSErrors: true,
    useChrome: true,
    stealth: true,
};

/** Main function */
Apify.main(async () => {
    // Actor INPUT variable
    const input = await Apify.getValue('INPUT');

    // Actor STATE variable
    const state = await Apify.getValue('STATE') || { crawled: {} };

    // Migrating flag
    let migrating = false;
    Apify.events.on('migrating', () => { migrating = true; });

    if (!input.search && !input.startUrls) {
        throw new Error('Missing "search" or "startUrls" attribute in INPUT!');
    } else if (input.search && input.startUrls && input.search.trim().length > 0 && input.startUrls.length > 0) {
        throw new Error('It is not possible to use both "search" and "startUrls" attributes in INPUT!');
    }
    if (!(input.proxyConfig && input.proxyConfig.useApifyProxy)) {
        throw new Error('This actor cannot be used without Apify proxy.');
    }
    if (input.useFilters && input.propertyType !== 'none') {
        throw new Error('Property type and filters cannot be used at the same time.');
    }

    checkDate(input.checkIn);
    checkDate(input.checkOut);

    let extendOutputFunction;
    if (typeof input.extendOutputFunction === 'string' && input.extendOutputFunction.trim() !== '') {
        try {
            // eslint-disable-next-line no-eval
            extendOutputFunction = eval(input.extendOutputFunction);
        } catch (e) {
            throw new Error(`'extendOutputFunction' is not valid Javascript! Error: ${e}`);
        }
        if (typeof extendOutputFunction !== 'function') {
            throw new Error('extendOutputFunction is not a function! Please fix it or use just default ouput!');
        }
    }

    if (input.minScore) { input.minScore = parseFloat(input.minScore); }
    const sortBy = input.sortBy || 'bayesian_review_score';
    const requestQueue = await Apify.openRequestQueue();

    let startUrl;
    let requestList;

    if (input.startUrls) {
        if (!Array.isArray(input.startUrls)) {
            throw new Error('INPUT.startUrls must an array!');
        }

        // convert any inconsistencies to correct format
        for (let i = 0; i < input.startUrls.length; i++) {
            let request = input.startUrls[i];
            if (typeof request === 'string') { request = { url: request }; }
            if ((!request.userData || !request.userData.label !== 'detail') && request.url.indexOf('/hotel/') > -1) {
                request.userData = { label: 'detail' };
            }
            request.url = addUrlParameters(request.url, input);
            input.startUrls[i] = request;
        }

        // create RequestList and reference startUrl
        requestList = new Apify.RequestList({ sources: input.startUrls });
        startUrl = addUrlParameters('https://www.booking.com/searchresults.html?dest_type=city&ss=paris&order=bayesian_review_score', input);
        await requestList.initialize();
    } else {
        // Create startURL based on provided INPUT.
        const dType = input.destType || 'city';
        const query = encodeURIComponent(input.search);
        startUrl = `https://www.booking.com/searchresults.html?dest_type=${dType}&ss=${query}&order=${sortBy}`;
        startUrl = addUrlParameters(startUrl, input);

        // Enqueue all pagination pages.
        startUrl += '&rows=25';
        log.info(`startUrl: ${startUrl}`);
        await requestQueue.addRequest({ url: startUrl, userData: { label: 'start' } });
        if (!input.useFilters && input.propertyType === 'none' && input.maxPages) {
            for (let i = 1; i < input.maxPages; i++) {
                await requestQueue.addRequest({
                    url: `${startUrl}&offset=${25 * i}`,
                    userData: { label: 'page' },
                });
            }
        }
    }

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        handlePageTimeoutSecs: 120,

        launchPuppeteerFunction: () => {
            if (!input.testProxy) {
                return Apify.launchPuppeteer({
                    ...puppeteerOptions,
                    ...input.proxyConfig,
                });
            }

            return getWorkingBrowser(startUrl, input, puppeteerOptions);
        },

        handlePageFunction: async ({ page, request, puppeteerPool }) => {
            log.info(`open url(${request.userData.label}): ${await page.url()}`);

            // Check if startUrl was open correctly
            if (input.startUrls) {
                const pageUrl = await page.url();
                if (pageUrl.length < request.url.length) {
                    await retireBrowser(puppeteerPool, page, requestQueue, request);
                    return;
                }
            }

            // Check if page was loaded with correct currency.
            const curInput = await page.$('input[name="selected_currency"]');
            const currency = await getAttribute(curInput, 'value');

            if (!currency || currency !== input.currency) {
                await retireBrowser(puppeteerPool, page, requestQueue, request);
                throw new Error(`Wrong currency: ${currency}, re-enqueuing...`);
            }

            if (request.userData.label === 'detail') { // Extract data from the hotel detail page
                // wait for necessary elements
                try { await page.waitForSelector('.hprt-occupancy-occupancy-info'); } catch (e) { log.info('occupancy info not found'); }

                const ldElem = await page.$('script[type="application/ld+json"]');
                const ld = JSON.parse(await getAttribute(ldElem, 'textContent'));
                await Apify.utils.puppeteer.injectJQuery(page);

                // Check if the page was open through working proxy.
                const pageUrl = await page.url();
                if (!input.startUrls && pageUrl.indexOf('label') < 0) {
                    await retireBrowser(puppeteerPool, page, requestQueue, request);
                    return;
                }

                // Exit if core data is not present ot the rating is too low.
                if (!ld || (ld.aggregateRating && ld.aggregateRating.ratingValue <= (input.minScore || 0))) {
                    return;
                }

                // Extract the data.
                log.info('extracting detail...');
                const detail = await extractDetail(page, ld, input, request.userData);
                log.info('detail extracted');

                if (extendOutputFunction) {
                    const userResult = await page.evaluate((functionStr) => {
                        // eslint-disable-next-line no-eval
                        const f = eval(functionStr);
                        return f();
                    }, input.extendOutputFunction);

                    if (!isObject(userResult)) {
                        log.info('extendOutputFunction has to return an object!!!');
                        process.exit(1);
                    }

                    _.extend(detail, userResult);
                }

                await Apify.pushData(detail);
            } else {
                // Handle hotel list page.
                const filtered = await isFiltered(page);
                const settingFilters = input.useFilters && !filtered;
                const settingMinMaxPrice = input.minMaxPrice !== 'none' && !await isMinMaxPriceSet(page, input);
                const settingPropertyType = input.propertyType !== 'none' && !await isPropertyTypeSet(page, input);
                const enqueuingReady = !(settingFilters || settingMinMaxPrice || settingPropertyType);

                // Check if the page was open through working proxy.
                const pageUrl = await page.url();
                if (!input.startUrls && pageUrl.indexOf(sortBy) < 0) {
                    await retireBrowser(puppeteerPool, page, requestQueue, request);
                    return;
                }

                // If it's aprropriate, enqueue all pagination pages
                if (enqueuingReady && (!input.maxPages || input.minMaxPrice !== 'none' || input.propertyType !== 'none')) {
                    enqueueAllPages(page, requestQueue, input);
                }

                // If property type is enabled, enqueue necessary page.
                if (settingPropertyType) {
                    await setPropertyType(page, input, requestQueue);
                }

                // If min-max price is enabled, enqueue necessary page.
                if (settingMinMaxPrice && !settingPropertyType) {
                    await setMinMaxPrice(page, input, requestQueue);
                }

                // If filtering is enabled, enqueue necessary pages.
                if (input.useFilters && !filtered) {
                    log.info('enqueuing filtered pages...');

                    await enqueueLinks(page, requestQueue, '.filterelement', null, 'page', fixUrl('&', input), async (link) => {
                        const lText = await getAttribute(link, 'textContent');
                        return `${lText}_0`;
                    });
                }

                const items = await page.$$('.sr_property_block.sr_item:not(.soldout_property)');
                if (items.length === 0) {
                    log.info('Found no result. Skipping..');
                    return;
                }

                if (enqueuingReady && input.simple) { // If simple output is enough, extract the data.
                    log.info('extracting data...');
                    await Apify.utils.puppeteer.injectJQuery(page);
                    const result = await page.evaluate(listPageFunction, input);
                    log.info(`Found ${result.length} results`);

                    if (result.length > 0) {
                        const toBeAdded = [];
                        for (const item of result) {
                            item.url = addUrlParameters(item.url, input);
                            if (!state.crawled[item.name]) {
                                toBeAdded.push(item);
                                state.crawled[item.name] = true;
                            }
                        }
                        if (migrating) { await Apify.setValue('STATE', state); }
                        if (toBeAdded.length > 0) {
                            await Apify.pushData(toBeAdded);
                        }
                    }
                } else if (enqueuingReady) { // If not, enqueue the detail pages to be extracted.
                    log.info('enqueuing detail pages...');
                    const urlMod = fixUrl('&', input);
                    const keyMod = async link => (await getAttribute(link, 'textContent')).trim().replace(/\n/g, '');
                    const prItem = await page.$('.bui-pagination__info');
                    const pageRange = (await getAttribute(prItem, 'textContent')).match(/\d+/g);
                    const firstItem = parseInt(pageRange[0], 10);
                    const links = await page.$$('.sr_property_block.sr_item:not(.soldout_property) .hotel_name_link');

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
                }
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            log.info(`Request ${request.url} failed too many times`);
            await Apify.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },

        gotoFunction: async ({ page, request }) => {
            await Apify.utils.puppeteer.blockRequests(page);

            const userAgent = Apify.utils.getRandomUserAgent();
            await page.setUserAgent(userAgent);
            const cookies = await page.cookies('https://www.booking.com');
            await page.deleteCookie(...cookies);
            await page.viewport({
                width: 1024 + Math.floor(Math.random() * 100),
                height: 768 + Math.floor(Math.random() * 100),
            });

            return page.goto(request.url, { timeout: 200000 });
        },
    });

    await crawler.run();
});
