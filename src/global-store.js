const { GlobalStore } = require('apify-global-store');
const { REDUCER_ACTION_TYPES } = require('./consts');

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

    const reducer = getGlobalStoreReducer();
    store.addReducer(reducer);

    return store;
};

const getGlobalStoreReducer = () => {
    const {
        DECREMENT_REMAINING_PAGES,
        ADD_DETAIL,
        ADD_REVIEWS,
        ADD_CRAWLED_NAME,
        ADD_ENQUEUED_URL,
        SET_REVIEW_URLS_TO_PROCESS,
        REMOVE_PROCESSED_REVIEW_URL,
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
            case ADD_DETAIL:
            {
                const { detailPagename, detail } = action;
                return {
                    ...state,
                    details: {
                        ...state.details,

                        /**
                         * We have to use detailPagename as key instead of raw url
                         * to ensure that store.pushPathToDataset is working correctly
                         * (urls include '.html' substring which is interpreted as
                         * another nested field)
                         */
                        [detailPagename]: detail,
                    },
                };
            }
            case ADD_REVIEWS:
            {
                const { detailPagename, reviews } = action;
                return {
                    ...state,
                    details: {
                        ...state.details,
                        [detailPagename]: {
                            ...state.details[detailPagename],
                            reviews: [
                                ...state.details[detailPagename].reviews,
                                ...reviews,
                            ],
                        },
                    },
                };
            }
            case SET_REVIEW_URLS_TO_PROCESS:
            {
                const { detailPagename, reviewUrls } = action;
                return {
                    ...state,
                    reviewPagesToProcess: {
                        ...state.reviewPagesToProcess,
                        [detailPagename]: reviewUrls,
                    },
                };
            }
            case REMOVE_PROCESSED_REVIEW_URL:
            {
                const { detailPagename, reviewUrl } = action;

                const updatedReviewUrls = state.reviewPagesToProcess[detailPagename]
                    .filter((url) => url !== reviewUrl);

                return {
                    ...state,
                    reviewPagesToProcess: {
                        ...state.reviewPagesToProcess,
                        [detailPagename]: updatedReviewUrls,
                    },
                };
            }
            case ADD_CRAWLED_NAME:
            {
                const { crawledName } = action;
                return {
                    ...state,
                    useFiltersData: {
                        ...state.useFiltersData,
                        crawledNames: [
                            ...state.useFiltersData.crawledNames,
                            crawledName,
                        ],
                    },
                };
            }
            case ADD_ENQUEUED_URL:
            {
                const { enqueuedUrl } = action;
                return {
                    ...state,
                    useFiltersData: {
                        ...state.useFiltersData,
                        enqueuedUrls: [
                            ...state.useFiltersData.enqueuedUrls,
                            enqueuedUrl,
                        ],
                    },
                };
            }
        }
    };

    return reducer;
};
