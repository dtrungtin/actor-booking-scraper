module.exports = {
    USER_AGENT:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36',
    MAX_PAGES: 40,
    MAX_PAGINATION_PAGES: 1000000,
    RESULTS_PER_PAGE: 25,
    REVIEWS_RESULTS_PER_REQUEST: 25,
    DATE_FORMAT: 'YYYY-MM-DD',
    PROPERTY_TYPE_IDS: {
        Hotels: 204,
        Apartments: 201,
        Hostels: 203,
        Homestays: 222,
        Boats: 215,
        Villas: 213,
        Motels: 205,
        Campsites: 214, // same as Campgrounds
        'Guest houses': 216,
        'Bed and breakfasts': 208,
        'Holiday homes': 220, // same as Vacation homes
        'Holiday parks': 212,
        'Luxury tents': 224,
    },

    EXPORTED_VARS_REGEX: /(?:var )(exportedVars = JSON.parse\('.*'( )?\|\|( )?'{}'\);)/is,
    PLACE_URL_NAME_REGEX: /http(?:s)?:\/\/www\.booking.com\/.+\/([-a-z0-9]+)(?:\.[a-z]+)?\.html/i,
    PLACE_COUNTRY_URL_CODE_REGEX: /http(?:s)?:\/\/www\.booking.com\/.+\/(.+)\//,

    LABELS: {
        START: 'START',
        PAGE: 'PAGE',
        DETAIL: 'DETAIL',
        REVIEW: 'REVIEW',
    },

    REDUCER_ACTION_TYPES: {
        DECREMENT_REMAINING_PAGES: 'DECREMENT_REMAINING_PAGES',
        DECREMENT_REMAINING_REVIEWS_PAGES: 'DECREMENT_REMAINING_REVIEWS_PAGES',
        ADD_CRAWLED_NAME: 'ADD_CRAWLED_NAME',
        ADD_ENQUEUED_URL: 'ADD_ENQUEUED_URL',
    },
};
