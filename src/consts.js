module.exports = {
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36',
    MAX_OFFSET: 5000, // to ensure that scraper does not run infinitely
    MAX_RESULTS_LIMIT: 1000,
    DATE_FORMAT: 'YYYY-MM-DD',
    DEFAULT_MIN_SCORE: 84,
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
};
