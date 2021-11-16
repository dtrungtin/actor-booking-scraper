const Apify = require('apify');

const { extractDetail, listPageFunction } = require('./extraction');
const {
    getAttribute, enqueueLinks, addUrlParameters, fixUrl, isObject,
    isFiltered, isMinMaxPriceSet, setMinMaxPrice, isPropertyTypeSet, setPropertyType, enqueueAllPages,
} = require('./util');

const { log } = Apify.utils;

module.exports = async ({ page, request, session, requestQueue, startUrls, input,
    extendOutputFunction, sortBy, maxPages, state }) => {
    log.info(`open url(${request.userData.label}): ${page.url()}`);

    if (request.userData.label === 'detail') { // Extract data from the hotel detail page
        // wait for necessary elements
        try { await page.waitForSelector('.bicon-occupancy'); } catch (e) { log.info('occupancy info not found'); }

        const ldElem = await page.$('script[type="application/ld+json"]');
        const ld = JSON.parse(await getAttribute(ldElem, 'textContent'));
        await Apify.utils.puppeteer.injectJQuery(page);

        // Check if the page was open through working proxy.
        const pageUrl = page.url();
        if (!startUrls && pageUrl.indexOf('label') < 0) {
            session.retire();
            throw new Error(`Page was not opened correctly`);
        }

        // Exit if core data is not present ot the rating is too low.
        if (!ld || (input.minScore && ld.aggregateRating && ld.aggregateRating.ratingValue < input.minScore)) {
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
        const countSelector = '.sorth1, .sr_header h1, .sr_header h2, [data-capla-component*="HeaderDesktop"] h1';
        await page.waitForSelector(countSelector, { timeout: 60000 });
        const heading = await page.$(countSelector);
        const headingText = heading ? (await getAttribute(heading, 'textContent')).trim() : 'No heading found.';
        log.info(headingText);

        // Handle hotel list page.
        const filtered = await isFiltered(page);
        const settingFilters = input.useFilters && !filtered;
        const settingMinMaxPrice = input.minMaxPrice !== 'none' && !await isMinMaxPriceSet(page, input);
        const settingPropertyType = input.propertyType !== 'none' && !await isPropertyTypeSet(page, input);
        const enqueuingReady = !(settingFilters || settingMinMaxPrice || settingPropertyType);

        // Check if the page was open through working proxy.
        const pageUrl = page.url();
        if (!startUrls && pageUrl.indexOf(sortBy) < 0) {
            session.retire();
            throw new Error(`Page was not opened correctly`);
        }

        // If it's aprropriate, enqueue all pagination pages
        if (enqueuingReady && (!maxPages || maxPages > 1 || input.useFilters || input.minMaxPrice !== 'none' || input.propertyType !== 'none')) {
            if (input.useFilters) {
                await enqueueAllPages(page, requestQueue, input, 0);
            } else if (!maxPages || maxPages > 1) {
                await enqueueAllPages(page, requestQueue, input, maxPages);
            }
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
        if (settingFilters) {
            log.info('enqueuing filtered pages...');

            await enqueueLinks(page, requestQueue, '.filterelement', null, 'page', fixUrl('&', input), async (link) => {
                const lText = await getAttribute(link, 'textContent');
                return `${lText}_0`;
            });
        }

        // eslint-disable-next-line max-len
        const items = await page.$$('.sr_property_block.sr_item:not(.soldout_property), [data-capla-component*="PropertiesListDesktop"] [data-testid="property-card"]');
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
        }
    }
};
