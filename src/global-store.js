const { GlobalStore } = require('apify-global-store');
const { REDUCER_ACTION_TYPES } = require('./consts');

module.exports.initializeGlobalStore = async (maxPages, maxReviewsPages) => {
    const store = await GlobalStore.init('state', {
        details: {},
        remainingPages: maxPages,
        remainingReviewsPages: maxReviewsPages,
        useFiltersData: {
            crawledNames: [],
            enqueuedUrls: [],
        },
    });

    const reducer = getGlobalStoreReducer();
    store.addReducer(reducer);

    return store;
};

const getGlobalStoreReducer = () => {
    const {
        DECREMENT_REMAINING_PAGES,
        DECREMENT_REMAINING_REVIEWS_PAGES,
        ADD_CRAWLED_NAME,
        ADD_ENQUEUED_URL,
    } = REDUCER_ACTION_TYPES;

    const reducer = (state, action) => {
        switch (action.type) {
            default:
                return state;
            case DECREMENT_REMAINING_PAGES:
                return {
                    ...state,
                    remainingPages: state.remainingPages - 1,
                };
            case DECREMENT_REMAINING_REVIEWS_PAGES:
                return {
                    ...state,
                    remainingReviewsPages: state.remainingReviewsPages - 1,
                };
            case ADD_CRAWLED_NAME:
                return {
                    ...state,
                    useFiltersData: {
                        ...state.useFiltersData,
                        crawledNames: [
                            ...state.useFiltersData.crawledNames,
                            action.crawledName,
                        ],
                    },
                };
            case ADD_ENQUEUED_URL:
                return {
                    ...state,
                    useFiltersData: {
                        ...state.useFiltersData,
                        enqueuedUrls: [
                            ...state.useFiltersData.enqueuedUrls,
                            action.enqueuedUrl,
                        ],
                    },
                };
        }
    };

    return reducer;
};
