/**
 * Extracts data from a hotel list page.
 * NOTE: This function is to be used in page.evaluate.
 * @param {Object} input - The Actor input data object.
 */
module.exports.listPageFunction = (input) => {
    return new Promise((resolve) => {
        const { minScore, checkIn, checkOut } = input;
        const $ = window.jQuery;

        /**
         * Waits for a condition to be non-false.
         * @param {Function} condition - The condition Function.
         * @param {Function} callback - Callback to be executed when the waiting is done.
         * @param {number} [i]
         */
        const waitFor = (condition, callback, i) => {
            const val = condition();
            if (val) {
                callback(val);
            } else if (i > 10) {
                callback(null);
            } else {
                setTimeout(() => {
                    waitFor(condition, callback, i ? i + 1 : 1);
                }, 500);
            }
        };

        // Extract listing data.
        const result = [];
        // eslint-disable-next-line max-len
        const items = $(
            '.sr_property_block.sr_item:not(.soldout_property), [data-capla-component*="PropertiesListDesktop"] [data-testid="property-card"]',
        );
        let started = 0;
        let finished = 0;

        // Iterate all items

        // eslint-disable-next-line space-before-function-paren
        items.each(function(_i, sr) {
            const jThis = $(this);
            const reviewsFirstOpt = jThis
                .find('.score_from_number_of_reviews')
                .text()
                .replace(/(\s|\.|,)+/g, '')
                .match(/\d+/);
            const reviewsSecondOpt = jThis
                .find('.review-score-widget__subtext')
                .text()
                .replace(/(\s|\.|,)+/g, '')
                .match(/\d+/);
            const reviewsThirdOpt = jThis
                .find('.bui-review-score__text')
                .text()
                .replace(/(\s|\.|,)+/g, '')
                .match(/\d+/);
            const reviewsFourthOpt = jThis
                .find('[data-testid="review-score"] > div:nth-child(2) > div:nth-child(2)')
                .text();
            const reviewsCountMatches = reviewsFirstOpt || reviewsSecondOpt || reviewsThirdOpt || reviewsFourthOpt;

            ++started;
            sr.scrollIntoView();
            const getPrices = () => {
                return $(sr).find(
                    // eslint-disable-next-line max-len
                    '.bui-price-display__value, :not(strong).site_price, .totalPrice, strong.price, [data-testid="price-and-discounted-price"] > span',
                );
            };

            // When the price is ready, extract data.
            waitFor(
                () => {
                    return getPrices().length > 0;
                },
                () => {
                    const { origin } = window.location;
                    const roomLinkFirstOpt = jThis.find('.room_link span').eq(0).contents();
                    const strongRoomLinks = jThis.find('.room_link strong');
                    const roomLinkSecondOpt = strongRoomLinks.length
                        ? jThis.find('.room_link strong')
                        : jThis.find('[data-testid="recommended-units"] [role=link]');

                    // if more prices are extracted, first one is the original, second one is current discount
                    const prices = getPrices();
                    const defaultPriceText = prices.eq(0).text().replace(/,|\s/g, '');
                    const pricesText = prices.length > 1 ? prices.eq(1).text() : defaultPriceText;
                    const priceValue = pricesText.match(/[\d.]+/);
                    const priceCurrency = pricesText.match(/[^\d.]+/);

                    const taxAndFeeText = jThis.find('.prd-taxes-and-fees-under-price').eq(0).text().trim();
                    const taxAndFee = taxAndFeeText.match(/\d+/);

                    const dataScore = $(sr).attr('data-score');
                    const jThisReviewScore = jThis.find('[data-testid="review-score"] > div:first-child').text();
                    const reviewScore = dataScore || jThisReviewScore;

                    const starAttr = jThis.find('.bui-rating').attr('aria-label');
                    const stars = starAttr
                        ? starAttr.match(/\d/)
                        : [jThis.find('[data-testid="rating-stars"] span').length];
                    const starsCount = stars ? parseInt(stars[0], 10) : null;

                    const image = jThis.find('[data-testid="image"]').attr('src');
                    const hotelLink = jThis.find('.hotel_name_link').attr('href');

                    const nightsPersons = jThis.find('[data-testid="price-for-x-nights"]').text().trim();
                    const nightsPersonsSplits = nightsPersons.split(',');

                    let url = hotelLink
                        ? hotelLink.replace(/\n/g, '')
                        : jThis.find('a').attr('href').replace(/\n/g, '');
                    url = url.includes(origin) ? url : `${origin}${url}`;

                    const textRoomType = roomLinkSecondOpt.length
                        ? roomLinkSecondOpt.text().trim()
                        : roomLinkFirstOpt.eq(0).text().trim();

                    const optionalProperties = {
                        price: priceValue
                            ? parseFloat(priceValue[0]) + (taxAndFee ? parseFloat(taxAndFee[0]) : 0)
                            : null,
                        currency: priceCurrency ? priceCurrency[0].trim() : null,
                        roomType: textRoomType || null,
                        persons: nightsPersonsSplits.length > 1 ? parseInt(nightsPersonsSplits[1], 10) : null,
                    };

                    /* exclude optional properties from output if checkIn and checkOut are not set properly
            (they will always hold null values and thus will be useless in the output) */
                    const extraProperties = checkIn && checkOut ? optionalProperties : {};

                    const item = {
                        url: url.split('?')[0],
                        name: $(sr).find('.sr-hotel__name, [data-testid="title"]').text().trim(),
                        address: jThis.find('[data-testid="address"]').text(),
                        rating: reviewScore ? parseFloat(reviewScore.replace(',', '.')) : null,
                        reviews: reviewsCountMatches ? parseInt(reviewsCountMatches[0], 10) : null,
                        stars: starsCount !== 0 ? starsCount : null,
                        ...extraProperties,
                        image,
                    };

                    // if no rating is scraped, consider item's rating valid (set it to max rating + 1)
                    const MAX_RATING = 10;
                    const rating = item.rating || MAX_RATING + 1;

                    if (!minScore || (minScore && rating >= minScore)) {
                        result.push(item);
                    }

                    if (++finished >= started) {
                        resolve(result);
                    }
                },
            );
        });
    });
};
