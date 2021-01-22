const Apify = require('apify');

const { extractDetail, listPageFunction } = require('./extraction.js');
const {
    getAttribute, enqueueLinks, addUrlParameters, fixUrl, isObject,
    isFiltered, isMinMaxPriceSet, setMinMaxPrice, isPropertyTypeSet, setPropertyType, enqueueAllPages,
} = require('./util.js');

const { log } = Apify.utils;

module.exports = async ({ page, request, puppeteerPool, requestQueue, startUrls, input,
    extendOutputFunction, sortBy, maxPages, state }) => {
    log.info(`open url(${request.userData.label}): ${page.url()}`);

    // TODO: This looks super weird, fix or remove
    // Check if startUrl was open correctly
    if (startUrls) {
        const pageUrl = page.url();
        if (pageUrl.length < request.url.length) {
            await puppeteerPool.retire(page.browser());
            throw new Error(`Start URL was not opened correctly`);
        }
    }

    // TODO: Fix or remove
    // Check if page was loaded with correct currency.
    /*
    const curInput = await page.$('input[name="selected_currency"]');
    const currency = await getAttribute(curInput, 'value');

    if (!currency || currency !== input.currency) {
        log.warning(`Currency wanted: ${input.currency}, currency found: ${currency}`);
        throw new Error(`Wrong currency: ${currency}, re-enqueuing...`);
    }
    */

    if (request.userData.label === 'detail') { // Extract data from the hotel detail page
        // wait for necessary elements
        try { await page.waitForSelector('.hprt-occupancy-occupancy-info'); } catch (e) { log.info('occupancy info not found'); }

        const ldElem = await page.$('script[type="application/ld+json"]');
        const ld = JSON.parse(await getAttribute(ldElem, 'textContent'));
        await Apify.utils.puppeteer.injectJQuery(page);

        // Check if the page was open through working proxy.
        const pageUrl = page.url();
        if (!startUrls && pageUrl.indexOf('label') < 0) {
            await puppeteerPool.retire(page.browser());
            throw new Error(`Page was not opened correctly`);
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
            await puppeteerPool.retire(page.browser());
            throw new Error(`Page was not opened correctly`);
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
}

