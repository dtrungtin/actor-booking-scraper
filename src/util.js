const Apify = require('apify');
const moment = require('moment');
const Puppeteer = require('puppeteer'); // eslint-disable-line

const { PRICE_LABELS, MAX_OFFSET } = require('./consts');

const { log } = Apify.utils;

/**
 * @param {Puppeteer.ElementHandle} element
 * @param {string} attr
 * @param {any} [fallback]
 * @returns {Promise<string>}
 */
const getAttribute = async (element, attr, fallback = '') => {
    try {
        const prop = await element.getProperty(attr);
        return (await prop.jsonValue()).trim();
    } catch (e) {
        return fallback;
    }
};
module.exports.getAttribute = getAttribute;

/**
 * Adds links from a page to the RequestQueue.
 * @param {Puppeteer.Page} page - Puppeteer Page object containing the link elements.
 * @param {Apify.RequestQueue} requestQueue - RequestQueue to add the requests to.
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
 * Adds URL parameters to a Booking.com Hotel Detail URL (timespan, language and currency).
 * @param {string} url - Booking.com URL to add the parameters to.
 * @param {Object} input - The Actor input data object.
 */
const addUrlParametersForHotelDetailUrl = (url, input) => {
    const { currency, language, checkIn, checkOut, adults, children, rooms } = input;
    if (checkIn && checkOut) {
        const ci = checkIn.split(/-|\//);
        const co = checkOut.split(/-|\//);

        const coAdd = `;checkout=${co[0]}-${co[1]}-${co[2]}`;
        const ciAdd = `;checkin=${ci[0]}-${ci[1]}-${ci[2]}`;

        if (url.includes(';checkin=')) {
            url = url.replace(/;checkin=[\d-]*/, ciAdd);
        } else {
            url = url.replace(';', `${ciAdd};`);
        }

        if (url.includes(';checkout=')) {
            url = url.replace(/;checkout=[\d-]*/, coAdd);
        } else {
            url = url.replace(';', `${coAdd};`);
        }
    }

    if (currency) {
        const curAdd = `;selected_currency=${currency.toUpperCase()};changed_currency=1;top_currency=1`;
        if (url.includes(';selected_currency=')) {
            url = url.replace(/;selected_currency=\w*/, `;selected_currency=${currency.toUpperCase()}`);
        } else {
            url = url.replace(';', `${curAdd};`);
        }
    }

    if (language) {
        const lng = language.replace('_', '-');
        const lngAdd = `;lang=${lng}`;

        if (url.includes(';lang=')) {
            url = url.replace(/;lang=[\w-]*/, lngAdd);
        } else {
            url = url.replace(';', `${lngAdd};`);
        }
    }

    if (adults) {
        const adAdd = `;group_adults=${adults}`;

        if (url.includes(';group_adults=')) {
            url = url.replace(/;group_adults=\d*/, adAdd);
        } else {
            url = url.replace(';', `${adAdd};`);
        }
    }

    if (children) {
        const cdAdd = `;group_children=${children}`;
        if (url.includes(';group_children=')) {
            url = url.replace(/;group_children=\d*/, cdAdd);
        } else {
            url = url.replace(';', `${cdAdd};`);
        }
    }

    if (rooms) {
        const rmAdd = `;no_rooms=${rooms}`;
        if (url.includes(';no_rooms=')) {
            url = url.replace(/;no_rooms=\d*/, rmAdd);
        } else {
            url = url.replace(';', `${rmAdd};`);
        }
    }

    console.log(url);

    return url;
};

/**
 * Adds URL parameters to a Booking.com URL (timespan, language and currency).
 * @param {string} url - Booking.com URL to add the parameters to.
 * @param {Object} input - The Actor input data object.
 */
const addUrlParameters = (url, input) => {
    if (url.includes('/hotel/') && url.includes(';')) {
        return addUrlParametersForHotelDetailUrl(url, input);
    }

    if (url.indexOf('?') < 0) { url += '?'; }
    if (input.checkIn && input.checkOut) {
        const ci = input.checkIn.split(/-|\//);
        const co = input.checkOut.split(/-|\//);

        const coAdd = `&checkout=${co[0]}-${co[1]}-${co[2]}`;
        const ciAdd = `&checkin=${ci[0]}-${ci[1]}-${ci[2]}`;

        if (!url.includes(ciAdd)) { url += ciAdd; }
        if (!url.includes(coAdd)) { url += coAdd; }
    }

    const extendedUrl = { url };

    const { currency, language, adults, children, rooms, minScore, minMaxPrice } = input;

    const queryParameters = [
        { isSet: currency, name: 'selected_currency', value: currency.toUpperCase() },
        { isSet: currency, name: 'changed_currency', value: 1 },
        { isSet: currency, name: 'top_currency', value: 1 },
        { isSet: language, name: 'lang', value: language.replace('_', '-') },
        { isSet: adults, name: 'group_adults', value: adults },
        { isSet: children, name: 'group_children', value: children },
        { isSet: rooms, name: 'no_rooms', value: rooms },
        { isSet: minScore, name: 'review_score', value: parseFloat(minScore) * 10 },
    ];

    const minMaxPriceIndex = PRICE_LABELS.indexOf(minMaxPrice);
    if (minMaxPriceIndex !== -1) {
        queryParameters.push({ isSet: minMaxPrice, name: 'nflt=pri', value: minMaxPriceIndex + 1 });
    }

    queryParameters.forEach((parameter) => {
        const { isSet, name, value } = parameter;
        addQueryParameter(isSet, name, value, extendedUrl);
    });

    return extendedUrl.url.replace('?&', '?');
};

module.exports.addUrlParameters = addUrlParameters;

function addQueryParameter(parameterSet, parameterName, parameterValue, extendedUrl) {
    if (parameterSet) {
        const parameter = `&${parameterName}=${parameterValue}`;
        if (!extendedUrl.url.includes(parameter)) {
            extendedUrl.url += parameter;
        }
    }
}

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
module.exports.isFiltered = (page) => page.$('.filterelement.active');

module.exports.isPropertyTypeSet = async (page, input) => {
    if (input.propertyType !== 'none') {
        const set = await page.evaluate((propertyType) => {
            const filters = Array.from(document.querySelectorAll('.filterelement'));
            for (const filter of filters) {
                const label = filter.querySelector('.filter_label');
                if (label) {
                    const fText = label.textContent.trim();
                    if (fText === propertyType) {
                        const cls = filter.className;
                        if (!cls.includes('active')) {
                            return false;
                        }

                        return true;
                    }
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

module.exports.isMinMaxPriceSet = async (page, input) => {
    log.info(`Page is: ${page}`);
    if (input.minMaxPrice !== 'none') {
        const filterOptions = await page.$$('.filteroptions');
        if (filterOptions && filterOptions.length !== 0) {
            const fPrices = await filterOptions[0].$$('.filterelement');
            const index = PRICE_LABELS.indexOf(input.minMaxPrice);
            const cls = await getAttribute(fPrices[index], 'className');
            return cls.includes('active');
        }
    }
    return true;
};

module.exports.setMinMaxPrice = async (page, input, requestQueue) => {
    log.info('enqueuing min-max price page...');
    const urlMod = fixUrl('&', input);
    const fPrices = await (await page.$$('.filteroptions'))[0].$$('.filterelement');
    const index = PRICE_LABELS.indexOf(input.minMaxPrice);
    const label = await (fPrices[index]).$('.filter_label');
    const fText = await getAttribute(label, 'textContent');
    const fLabel = fText.replace(/[^\d-+]/g, '');
    if (!PRICE_LABELS.includes(fLabel)) {
        log.error(`Cannot find price range filter: ${input.minMaxPrice}`);
        process.exit(1);
    }

    log.info(`Using filter: ${fText}`);
    const href = await getAttribute(fPrices[index], 'href');
    await requestQueue.addRequest({
        userData: { label: 'page' },
        url: urlMod(href),
        uniqueKey: `${fText}_${0}`,
    });
};

const DATE_FORMAT = 'YYYY-MM-DD';

/**
 * @param {string} date
 */
module.exports.checkDate = (date) => {
    if (date) {
        const dateMatch = moment(date, DATE_FORMAT);

        if (dateMatch.format(DATE_FORMAT) !== date) {
            throw new Error(`WRONG INPUT: Date should be in format ${DATE_FORMAT}`);
        }

        if (dateMatch.isBefore(moment())) {
            throw new Error(`WRONG INPUT: You can't use a date in the past: ${dateMatch.format(DATE_FORMAT)}`);
        }

        return dateMatch;
    }

    return null;
};

/**
 * Returns true if the gap between two dates is considered ok
 * for using as checkIn / checkOut dates. For larger gaps Booking
 * won't return any room results
 *
 * @param {null | moment.Moment} checkIn
 * @param {null | moment.Moment} checkOut
 */
exports.checkDateGap = (checkIn, checkOut) => {
    if (checkIn && checkOut) {
        if (!checkOut.isSameOrAfter(checkIn)) {
            // eslint-disable-next-line max-len
            throw new Error(`WRONG INPUT: checkOut ${checkOut.format(DATE_FORMAT)} date should be greater than checkIn ${checkIn.format(DATE_FORMAT)} date`);
        }

        return checkOut.diff(checkIn, 'days', true);
    }

    return -1;
};

/**
 * Extracts information from the detail page and enqueue all pagination pages.
 *
 * @param {Page} page - The Puppeteer page object.
 * @param {RequestQueue} requestQueue - RequestQueue to add the requests to.
 * @param {Object} input - The Actor input data object.
 * @param {Number} maxPages - Maximum pagination pages.
 */
module.exports.enqueueAllPages = async (page, requestQueue, input, maxPages) => {
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
                let count = Math.ceil(parseInt(countData[0], 10) / 25);
                log.info(`pagination pages: ${count}`);
                if (maxPages && maxPages > 0 && maxPages < count) {
                    count = maxPages;
                    log.info(`max pagination pages: ${count}`);
                }

                for (let i = 1; i < count; i++) {
                    const newOffset = 25 * i;
                    if (newOffset <= MAX_OFFSET) {
                        // enqueueing urls with greater offset results in scraping last page all over again infinitely
                        // maximum offset is overestimated to ensure maximum number of items to be scraped
                        const newUrl = pageUrl.includes('offset=')
                            ? pageUrl.replace(/offset=(\d+)/, `offset=${newOffset}`)
                            : `${pageUrl}&offset=${newOffset}`;
                        await requestQueue.addRequest({
                            url: addUrlParameters(newUrl, input),
                            userData: { label: 'page' },
                        });
                    }
                }
            }
        } catch (e) {
            log.info(e);
        }
    }
};

module.exports.isObject = (val) => typeof val === 'object' && val !== null && !Array.isArray(val);
