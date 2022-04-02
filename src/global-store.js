const { GlobalStore } = require('apify-global-store');

module.exports.initializeGlobalStore = async (maxPages, maxReviewsPages) => {
    const store = await GlobalStore.init({
        initialState: {
            remainingPages: maxPages,
            maxReviewsPages,
            details: {},
            reviewPagesToProcess: {},
            useFiltersData: {
                crawledNames: [],
                enqueuedUrls: [],
            },
        },
    });

    return store;
};

module.exports.decrementRemainingPages = () => {
    const store = GlobalStore.summon();
    const remainingPages = store.state.remainingPages - 1;

    store.setPath('remainingPages', remainingPages);
};

module.exports.addDetail = (detailPagename, detail) => {
    const store = GlobalStore.summon();
    const { details } = store.state;

    /**
     * We cannot use raw url directly as the key. We use detailPagename
     * to ensure that store.pushPathToDataset is working correctly
     * (urls include '.html' substring which is interpreted as
     * another nested field named 'html')
     */
    const updatedDetails = {
        ...details,
        [detailPagename]: detail,
    };

    store.setPath('details', updatedDetails);
};

module.exports.addReviews = (detailPagename, reviews) => {
    const store = GlobalStore.summon();
    const { details } = store.state;

    const detail = details[detailPagename];
    const detailReviews = detail.reviews || [];

    const updatedReviews = [
        ...detailReviews,
        ...reviews,
    ];

    store.setPath(`details.${detailPagename}.reviews`, updatedReviews);
};

module.exports.setReviewUrlsToProcess = (detailPagename, reviewUrls) => {
    const store = GlobalStore.summon();

    store.setPath(`reviewPagesToProcess.${detailPagename}`, reviewUrls);
};

module.exports.removeProcessedReviewUrl = (detailPagename, reviewUrl) => {
    const store = GlobalStore.summon();
    const { state: { reviewPagesToProcess } } = store;

    const updatedReviewUrls = reviewPagesToProcess[detailPagename]
        .filter((url) => url !== reviewUrl);

    store.setPath(`reviewPagesToProcess.${detailPagename}`, updatedReviewUrls);
};

module.exports.addCrawledName = (crawledName) => {
    const store = GlobalStore.summon();
    const { state: { useFiltersData: { crawledNames } } } = store;

    const updatedCrawledNames = [
        ...crawledNames,
        crawledName,
    ];

    store.setPath('useFiltersData.crawledNames', updatedCrawledNames);
};

module.exports.addEnqueuedUrl = (enqueuedUrl) => {
    const store = GlobalStore.summon();
    const { state: { useFiltersData: { enqueuedUrls } } } = store;

    const updatedEnqueuedUrls = [
        ...enqueuedUrls,
        enqueuedUrl,
    ];

    store.setPath('useFiltersData.enqueuedUrls', updatedEnqueuedUrls);
};

/**
 *
 * @returns {number}
 */
module.exports.getRemainingPages = () => {
    const store = GlobalStore.summon();

    return store.state.remainingPages;
};

/**
 *
 * @returns {number}
 */
module.exports.getMaxReviewsPages = () => {
    const store = GlobalStore.summon();

    return store.state.maxReviewsPages;
};

/**
 *
 * @returns {string[]}
 */
module.exports.getEnqueuedUrls = () => {
    const store = GlobalStore.summon();

    return store.state.useFiltersData.enqueuedUrls;
};

/**
 *
 * @returns {string[]}
 */
module.exports.getCrawledNames = () => {
    const store = GlobalStore.summon();

    return store.state.useFiltersData.crawledNames;
};
