const Apify = require('apify');
const moment = require('moment');

const { log } = Apify.utils;

const getAttribute = async (element, attr) => {
    try {
        const prop = await element.getProperty(attr);
        return (await prop.jsonValue()).trim();
    } catch (e) { return null; }
};
module.exports.getAttribute = getAttribute;

/**
 * Adds links from a page to the RequestQueue.
 * @param {Page} page - Puppeteer Page object containing the link elements.
 * @param {RequestQueue} requestQueue - RequestQueue to add the requests to.
 * @param {string} selector - A selector representing the links.
 * @param {Function} condition - Function to check if the link is to be added.
 * @param {string} label - A label for the added requests.
 * @param {Function} urlMod - Function for modifying the URL.
 * @param {Function} keyMod - Function for generating uniqueKey from the link ElementHandle.
 */
module.exports.enqueueLinks = async (page, requestQueue, selector, condition, label, urlMod, keyMod) => {
    const links = await page.$$(selector);
    for (const link of links) {
        const href = await getAttribute(link, 'href');
        if (href && (!condition || await condition(link))) {
            await requestQueue.addRequest({
                userData: { label },
                url: urlMod ? urlMod(href) : href,
                uniqueKey: keyMod ? (await keyMod(link)) : href,
            });
        }
    }
};

/**
 * Adds URL parameters to a Booking.com URL (timespan, language and currency).
 * @param {string} url - Booking.com URL to add the parameters to.
 * @param {Object} input - The Actor input data object.
 */
const addUrlParameters = (url, input) => {
    if (url.indexOf('?') < 0) { url += '?'; }
    if (input.checkIn && input.checkOut) {
        const ci = input.checkIn.split(/-|\//);
        const co = input.checkOut.split(/-|\//);

        const coAdd = `&checkout=${co[0]}-${co[1]}-${co[2]}`;
        const ciAdd = `&checkin=${ci[0]}-${ci[1]}-${ci[2]}`;

        if (!url.includes(ciAdd)) { url += ciAdd; }
        if (!url.includes(coAdd)) { url += coAdd; }
    }
    if (input.currency) {
        const curAdd = `&selected_currency=${input.currency.toUpperCase()}&changed_currency=1&top_currency=1`;
        if (!url.includes(curAdd)) { url += curAdd; }
    }
    if (input.language) {
        const lng = input.language.replace('_', '-');
        const lngAdd = `&lang=${lng}`;
        if (!url.includes(lngAdd)) { url += lngAdd; }
    }
    if (input.adults) {
        const adAdd = `&group_adults=${input.adults}`;
        if (!url.includes(adAdd)) { url += adAdd; }
    }
    if (input.children) {
        const cdAdd = `&group_children=${input.children}`;
        if (!url.includes(cdAdd)) { url += cdAdd; }
    }
    if (input.rooms) {
        const rmAdd = `&no_rooms=${input.rooms}`;
        if (!url.includes(rmAdd)) { url += rmAdd; }
    }
    return url.replace('?&', '?');
};

module.exports.addUrlParameters = addUrlParameters;

/**
 * Finds a browser instance with working proxy for Booking.com.
 * @param {string} startUrl - Booking.com URL to test for loading.
 * @param {Object} input - The Actor input data object.
 * @param {Object} puppeteerOptions - The puppeteer options to launch.
 */
module.exports.getWorkingBrowser = async (startUrl, input, puppeteerOptions) => {
    const sortBy = input.sortBy || 'bayesian_review_score';
    for (let i = 0; i < 1000; i++) {
        log.info('testing proxy...');
        const config = Object.assign({
            apifyProxySession: `BOOKING_${Math.random()}`,
        }, input.proxyConfig ? { ...puppeteerOptions, ...input.proxyConfig } : {});
        const browser = await Apify.launchPuppeteer(config);
        const page = await browser.newPage();

        try {
            await Apify.utils.puppeteer.hideWebDriver(page);
            await page.goto(startUrl, { timeout: 60000 });
            // await page.waitForNavigation({ timeout: 60000 });
        } catch (e) {
            log.info('invalid proxy, retrying...');
            log.info(e);
            // eslint-disable-next-line no-continue
            continue;
        }
        const pageUrl = await page.url();
        if (pageUrl.indexOf(sortBy) > -1 || i === 999) {
            log.info('valid proxy found');
            await page.close();
            return browser;
        }
        log.info('invalid proxy, retrying...');
        await browser.close();
    }
};

/**
 * Creates a function to make sure the URL contains all necessary attributes from INPUT.
 * @param {string} s - The URL attribute separator (& or ;).
 */
const fixUrl = (s, input) => (href) => {
    href = href.replace(/#([a-zA-Z_]+)/g, '');
    if (input.language && href.indexOf('lang') < 0) {
        const lng = input.language.replace('_', '-');
        if (href.indexOf(s)) {
            href.replace(s, `${s}lang=${lng}${s}`);
        } else { href += `${s}lang=${lng}`; }
    }
    if (input.currency && href.indexOf('currency') < 0) {
        href += `${s}selected_currency=${input.currency.toUpperCase()}${s}changed_currency=1${s}top_currency=1`;
    }
    return href.replace(/&{n,}/g, '&').replace('?&', '?');
};
module.exports.fixUrl = fixUrl;

/**
 * Checks if page has some criteria filtering enabled.
 * @param {Page} page - The page to be checked.
 */
module.exports.isFiltered = page => page.$('.filterelement.active');

module.exports.isPropertyTypeSet = async (page, input) => {
    if (input.propertyType !== 'none') {
        const set = await page.evaluate((propertyType) => {
            const filters = Array.from(document.querySelectorAll('.filterelement'));
            for (const filter of filters) {
                const label = filter.querySelector('.filter_label');
                const fText = label.textContent.trim();
                if (fText === propertyType) {
                    const cls = filter.className;
                    if (!cls.includes('active')) {
                        return false;
                    }

                    return true;
                }
            }

            return true;
        }, input.propertyType);

        return set;
    }

    return true;
};

module.exports.setPropertyType = async (page, input, requestQueue) => {
    log.info('enqueuing property type page...');
    const filters = await page.$$('.filterelement');
    const urlMod = fixUrl('&', input);
    for (const filter of filters) {
        const label = await filter.$('.filter_label');
        const fText = await getAttribute(label, 'textContent');
        if (fText === input.propertyType) {
            log.info(`Using filter 1: ${fText}`);
            const href = await getAttribute(filter, 'href');
            await requestQueue.addRequest({
                userData: { label: 'page' },
                url: urlMod(href),
                uniqueKey: `${fText}_0`,
            });

            break;
        }
    }
};

const pLabels = ['0-50', '50-100', '100-150', '150-200', '200+'];
module.exports.isMinMaxPriceSet = async (page, input) => {
    if (input.minMaxPrice !== 'none') {
        const fPrices = await (await page.$$('.filteroptions'))[0].$$('.filterelement');
        const index = pLabels.indexOf(input.minMaxPrice);
        const cls = await getAttribute(fPrices[index], 'className');
        if (!cls.includes('active')) { return false; }
    }
    return true;
};

module.exports.setMinMaxPrice = async (page, input, requestQueue) => {
    log.info('enqueuing min-max price page...');
    const urlMod = fixUrl('&', input);
    const fPrices = await (await page.$$('.filteroptions'))[0].$$('.filterelement');
    const index = pLabels.indexOf(input.minMaxPrice);
    const label = await (fPrices[index]).$('.filter_label');
    const fText = await getAttribute(label, 'textContent');
    log.info(`Using filter: ${fText}`);
    const href = await getAttribute(fPrices[index], 'href');
    await requestQueue.addRequest({
        userData: { label: 'page' },
        url: urlMod(href),
        uniqueKey: `${fText}_${0}`,
    });
};

const DATE_FORMAT = 'YYYY-MM-DD';
module.exports.checkDate = (date) => {
    if (date) {
        const match = moment(date, DATE_FORMAT).format(DATE_FORMAT) === date;
        if (!match) {
            throw new Error(`Date should be in format ${DATE_FORMAT}`);
        }
    }
};

/**
 * Tells the crawler to re-enqueue current page and destroy the browser.
 * Necessary if the page was open through a not working proxy.
 */
module.exports.retireBrowser = async (puppeteerPool, page, requestQueue, request) => {
    await puppeteerPool.retire(page.browser());
    await requestQueue.addRequest({
        url: request.url,
        userData: request.userData,
        uniqueKey: `${Math.random()}`,
    });
};

/**
 * Extracts information from the detail page and enqueue all pagination pages.
 *
 * @param {Page} page - The Puppeteer page object.
 * @param {RequestQueue} requestQueue - RequestQueue to add the requests to.
 * @param {Object} input - The Actor input data object.
 */
module.exports.enqueueAllPages = async (page, requestQueue, input) => {
    const baseUrl = await page.url();
    if (baseUrl.indexOf('offset') < 0) {
        log.info('enqueuing pagination pages...');
        const pageSelector = '.bui-pagination__list a:not([aria-current])';
        const countSelector = '.sorth1, .sr_header h1, .sr_header h2';
        try {
            await page.waitForSelector(pageSelector, { timeout: 60000 });
            const pageElem = await page.$(pageSelector);
            const pageUrl = await getAttribute(pageElem, 'href');
            await page.waitForSelector(countSelector);
            const countElem = await page.$(countSelector);
            const countData = (await getAttribute(countElem, 'textContent')).replace(/\.|,|\s/g, '').match(/\d+/);

            if (countData) {
                const count = Math.ceil(parseInt(countData[0], 10) / 25);
                log.info(`pagination pages: ${count}`);

                for (let i = 0; i < count; i++) {
                    const newUrl = pageUrl.replace(/rows=(\d+)/, 'rows=25').replace(/offset=(\d+)/, `offset=${25 * i}`);
                    await requestQueue.addRequest({
                        url: addUrlParameters(newUrl, input),
                        userData: { label: 'page' },
                    });
                }
            }
        } catch (e) {
            log.info(e);
        }
    }
};

module.exports.isObject = val => typeof val === 'object' && val !== null && !Array.isArray(val);
