const { GlobalStore } = require('apify-global-store');
const { REDUCER_ACTION_TYPES } = require('./consts');

module.exports.initializeGlobalStore = async (maxPages, maxReviewsPages) => {
    const store = await GlobalStore.init({
        initialState: {
            remainingPages: maxPages,
            remainingReviewsPages: maxReviewsPages,
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
                return {
                    ...state,
                    details: {
                        ...state.details,
                        [action.detailUrl]: action.detail,
                    },
                };
            case ADD_REVIEWS:
                return {
                    ...state,
                    details: {
                        ...state.details,
                        [state.details[action.detailUrl]]: {
                            ...state.details[action.detailUrl],
                            reviews: [
                                ...state.details[action.detailUrl].reviews,
                                ...action.reviews,
                            ],
                        },
                    },
                };
            case SET_REVIEW_URLS_TO_PROCESS:
                return {
                    ...state,
                    reviewPagesToProcess: {
                        ...state.reviewPagesToProcess,
                        [action.detailUrl]: action.reviewUrls,
                    },
                };
            case REMOVE_PROCESSED_REVIEW_URL:
            {
                const updatedReviewUrls = state.reviewPagesToProcess[action.detailUrl]
                    .filter((reviewUrl) => reviewUrl !== action.reviewUrl);

                return {
                    ...state,
                    reviewPagesToProcess: {
                        ...state.reviewPagesToProcess,
                        [action.detailUrl]: updatedReviewUrls,
                    },
                };
            }
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
