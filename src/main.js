const Apify = require('apify');

const { USER_AGENT } = require('./consts');
const { validateInput, cleanInput, evalExtendOutputFn } = require('./input');
const { extractDetail, listPageFunction } = require('./extraction.js');
const {
    getAttribute, enqueueLinks, addUrlParameters, getWorkingBrowser, fixUrl,
    isFiltered, isMinMaxPriceSet, setMinMaxPrice, isPropertyTypeSet, setPropertyType, enqueueAllPages,
    retireBrowser, isObject,
} = require('./util.js');
const { prepareRequestSources } = require('./start-urls');

const { log } = Apify.utils;

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');
    validateInput(input);
    cleanInput(input);
    const extendOutputFunction = evalExtendOutputFn(input);

    const {
        startUrls,
        minScore,
        sortBy = 'bayesian_review_score',
        maxPages,
        proxyConfig,
    } = input;

    const state = await Apify.getValue('STATE') || { crawled: {} };

    let migrating = false;
    Apify.events.on('migrating', () => { migrating = true; });

    const requestQueue = await Apify.openRequestQueue();

    const { startUrl, requestSources } = await prepareRequestSources({ startUrls, input, maxPages, sortBy });

    const requestList = await Apify.openRequestList('LIST', requestSources);

    const proxyConfiguration = await Apify.createProxyConfiguration(proxyConfig);

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        handlePageTimeoutSecs: 120,
        proxyConfiguration,
        launchPuppeteerOptions: {
            ignoreHTTPSErrors: true,
            useChrome: Apify.isAtHome(),
            args: [
                '--ignore-certificate-errors',
            ],
            stealth: true,
            stealthOptions: {
                addPlugins: false,
                emulateWindowFrame: false,
                emulateWebGL: false,
                emulateConsoleDebug: false,
                addLanguage: false,
                hideWebDriver: true,
                hackPermissions: false,
                mockChrome: false,
                mockChromeInIframe: false,
                mockDeviceMemory: false,
            },
            userAgent: USER_AGENT,
        },
        launchPuppeteerFunction: async (options) => {
            if (!input.testProxy) {
                return Apify.launchPuppeteer({
                    ...options,
                });
            }

            return getWorkingBrowser(startUrl, input, options);
        },

        handlePageFunction: async ({ page, request, puppeteerPool }) => {
            log.info(`open url(${request.userData.label}): ${page.url()}`);

            // Check if startUrl was open correctly
            if (startUrls) {
                const pageUrl = page.url();
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
                const pageUrl = page.url();
                if (!startUrls && pageUrl.indexOf('label') < 0) {
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
                let userResult = {};

                if (extendOutputFunction) {
                    userResult = await page.evaluate(async (functionStr) => {
                        // eslint-disable-next-line no-eval
                        const f = eval(functionStr);
                        return f(window.jQuery);
                    }, input.extendOutputFunction);

                    if (!isObject(userResult)) {
                        log.info('extendOutputFunction has to return an object!!!');
                        process.exit(1);
                    }
                }

                await Apify.pushData({ ...detail, ...userResult });
            } else {
                // Handle hotel list page.
                const filtered = await isFiltered(page);
                const settingFilters = input.useFilters && !filtered;
                const settingMinMaxPrice = input.minMaxPrice !== 'none' && !await isMinMaxPriceSet(page, input);
                const settingPropertyType = input.propertyType !== 'none' && !await isPropertyTypeSet(page, input);
                const enqueuingReady = !(settingFilters || settingMinMaxPrice || settingPropertyType);

                // Check if the page was open through working proxy.
                const pageUrl = page.url();
                if (!startUrls && pageUrl.indexOf(sortBy) < 0) {
                    await retireBrowser(puppeteerPool, page, requestQueue, request);
                    return;
                }

                // If it's aprropriate, enqueue all pagination pages
                if (enqueuingReady && (!maxPages || input.minMaxPrice !== 'none' || input.propertyType !== 'none')) {
                    await enqueueAllPages(page, requestQueue, input);
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
                    const keyMod = async (link) => (await getAttribute(link, 'textContent')).trim().replace(/\n/g, '');
                    const prItem = await page.$('.bui-pagination__info');
                    const pageRange = (await getAttribute(prItem, 'textContent')).match(/\d+/g);
                    const firstItem = parseInt(pageRange && pageRange[0] ? pageRange[0] : '1', 10);
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

            const cookies = await page.cookies('https://www.booking.com');
            await page.deleteCookie(...cookies);
            await page.setViewport({
                width: 1024 + Math.floor(Math.random() * 100),
                height: 768 + Math.floor(Math.random() * 100),
            });

            return page.goto(request.url, { timeout: 200000 });
        },
    });

    await crawler.run();
});
