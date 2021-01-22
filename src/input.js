const Apify = require('apify');

const { checkDate, checkDateGap } = require('./util.js');

const { log } = Apify.utils;

module.exports.validateInput = (input) => {
    if (!input.search && !input.startUrls) {
        throw 'WRONG INPUT: Missing "search" or "startUrls" attribute in INPUT!';
    } else if (input.search && input.startUrls && input.search.trim().length > 0 && input.startUrls.length > 0) {
        log.warning(`Start URLs were provided. Will not use provided search input: ${input.search}.`);
    }
    // On Apify platform, proxy is mandatory
    if (Apify.isAtHome()) {
        const usesApifyProxy = input.proxyConfig && input.proxyConfig.useApifyProxy;
        const usesCustomProxies = input.proxyConfig
            && Array.isArray(input.proxyConfig.proxyUrls) && input.proxyConfig.proxyUrls.length > 0;
        if (!(usesApifyProxy || usesCustomProxies)) {
            throw 'WRONG INPUT: This actor cannot be used without Apify proxy or custom proxies.';
        }
    }
    if (input.useFilters && input.propertyType !== 'none') {
        throw 'WRONG INPUT: Property type and filters cannot be used at the same time.';
    }

    if (input.startUrls && !Array.isArray(input.startUrls)) {
        throw 'WRONG INPUT: startUrls must an array!';
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

module.exports.cleanInput = (input) => {
    // Input Schema doesn't support floats yet
    if (input.minScore) {
        input.minScore = parseFloat(input.minScore);
    }
};

module.exports.evalExtendOutputFn = (input) => {
    let extendOutputFunction;
    if (typeof input.extendOutputFunction === 'string' && input.extendOutputFunction.trim() !== '') {
        try {
            // eslint-disable-next-line no-eval
            extendOutputFunction = eval(input.extendOutputFunction);
        } catch (e) {
            throw `WRONG INPUT: 'extendOutputFunction' is not valid Javascript! Error: ${e}`;
        }
        if (typeof extendOutputFunction !== 'function') {
            throw 'WRONG INPUT: extendOutputFunction is not a function! Please fix it or use just default ouput!';
        }
    }
    return extendOutputFunction;
};
