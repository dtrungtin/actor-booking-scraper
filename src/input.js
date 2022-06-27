const Apify = require('apify');
const { PROPERTY_TYPE_IDS } = require('./consts');

const { checkDate, checkDateGap } = require('./util');

const { log } = Apify.utils;

/**
 * Validate Actor input.
 * @param {Object} input - The Actor input data object.
 */
module.exports.validateInput = (input) => {
    const { search, startUrls, proxyConfig, propertyType, minScore } = input;

    if (!search && !startUrls) {
        throw new Error('WRONG INPUT: Missing "search" or "startUrls" attribute in INPUT!');
    } else if (search && startUrls && search.trim().length > 0 && startUrls.length > 0) {
        log.warning(`Start URLs were provided. Will not use provided search input: ${search}.`);
    }
    // On Apify platform, proxy is mandatory
    if (Apify.isAtHome()) {
        const { useApifyProxy, proxyUrls } = proxyConfig;
        const usesApifyProxy = proxyConfig && useApifyProxy;
        const usesCustomProxies = proxyConfig && Array.isArray(proxyUrls) && proxyUrls.length > 0;
        if (!(usesApifyProxy || usesCustomProxies)) {
            throw new Error('WRONG INPUT: This actor cannot be used without Apify proxy or custom proxies.');
        }
    }

    if (startUrls && !Array.isArray(startUrls)) {
        throw new Error('WRONG INPUT: startUrls must be an array!');
    }

    if (propertyType && propertyType !== 'none' && !PROPERTY_TYPE_IDS[propertyType]) {
        throw new Error(`WRONG INPUT: invalid property type '${propertyType}'. Property type must be one of the following:
        ${JSON.stringify(Object.keys(PROPERTY_TYPE_IDS), null, 2)}`);
    }

    if (minScore) {
        const parsedMinScore = parseFloat(minScore);
        if (Number.isNaN(parsedMinScore) || parsedMinScore < 0 || parsedMinScore > 10) {
            throw new Error('WRONG INPUT: minScore must be a number between 0 and 10!');
        }
    }

    const daysInterval = checkDateGap(checkDate(input.checkIn), checkDate(input.checkOut));

    if (daysInterval >= 30) {
        log.warning(`=============
        The selected check-in and check-out dates have ${daysInterval} days between them.
        Some listings won't return available room information!

        Decrease the days interval to fix this
      =============`);
    } else if (daysInterval > 0) {
        log.info(`Using check-in / check-out with an interval of ${daysInterval} days`);
    } else if (daysInterval === -1 && !input.simple) {
        log.warning(`=============
        You aren't providing both check-in and checkout dates, some information will be missing from the output
      =============`);
    }
};

module.exports.parseInput = (input) => {
    const { currency = 'USD', language = 'en-us' } = input;
    let { minScore } = input;

    // Input Schema doesn't support floats yet
    if ('minScore' in input) {
        minScore = parseFloat(minScore);
    }

    return {
        ...input,
        currency,
        language,
        minScore,
    };
};

module.exports.evalExtendOutputFn = (input) => {
    let extendOutputFunction;
    if (typeof input.extendOutputFunction === 'string' && input.extendOutputFunction.trim() !== '') {
        try {
            // eslint-disable-next-line no-eval
            extendOutputFunction = eval(input.extendOutputFunction);
        } catch (e) {
            throw new Error(`WRONG INPUT: 'extendOutputFunction' is not valid Javascript! Error: ${e}`);
        }
        if (typeof extendOutputFunction !== 'function') {
            throw new Error(
                'WRONG INPUT: extendOutputFunction is not a function! Please fix it or use just default ouput!',
            );
        }
    }
    return extendOutputFunction;
};
