const vm = require('vm');
const Puppeteer = require('puppeteer'); // eslint-disable-line
const { EXPORTED_VARS_REGEX } = require('./consts.js'); // eslint-disable-line
const { getAttribute, addUrlParameters } = require('./util.js'); // eslint-disable-line

/**
 * Extracts information about all rooms listed by the hotel using jQuery in browser context.
 * Requires checkIn and checkOut properties to be set to make selectors work properly.
 */
const extractDetailedRoomsInfo = () => {
    let roomType;
    let bedText;
    let features;
    const rooms = [];
    const $ = window.jQuery;

    // Function for extracting occupancy info.
    const occExtractor = (row) => {
        if (!row || row.length < 1) {
            return null;
        }

        const occ1 = row.find('.hprt-occupancy-occupancy-info .invisible_spoken');
        const occ2 = row.find('.hprt-occupancy-occupancy-info').attr('data-title');
        const occ3 = row.find('.hprt-occupancy-occupancy-info').text();

        return occ1.length > 0 ? occ1.text() : occ2 || occ3;
    };

    // Iterate all table rows.
    const rows = $('.hprt-table > tbody > tr:not(.hprt-cheapest-block-row)');

    for (let i = 0; i < rows.length; i++) {
        const row = rows.eq(i);
        const roomRow = row.find('.hprt-table-cell-roomtype');
        if (roomRow.length > 0) {
            roomType = row.find('.hprt-roomtype-icon-link');
            const bedType = row.find('.hprt-roomtype-bed');
            bedText = bedType.length > 0 ? bedType.text() : null;

            // Iterate and parse all room facilities.
            features = [];
            const facilities = roomRow.find('.hprt-facilities-facility');
            if (facilities.length > 0) {
                for (let fi = 0; fi < facilities.length; fi++) {
                    const f = facilities.eq(fi);
                    const fText = f.text().replace('•', '').trim();
                    if (fText.indexOf('ft²') > -1) {
                        const num = parseInt(fText.split(' ')[0], 10);
                        const nText = `${parseInt(num * 0.092903, 10)} m²`;
                        features.push(nText);
                    } else {
                        features.push(fText);
                    }
                }
            }
        }

        // Extract data for each room.
        let occupancy;
        try {
            occupancy = occExtractor(row);
        } catch (e) {
            occupancy = null;
        }
        const persons = occupancy ? occupancy.match(/\d+/) : null;
        const priceE = row.find('.bui-price-display__value .prco-valign-middle-helper').eq(0);
        const priceT = priceE.length > 0 ? priceE.text().replaceAll(',', '.').replace(/[^\d.]+/g, '') : null;
        const priceC = priceE.length > 0 ? priceE.text().replace(/[\d.\n\t, ]+/g, '') : null;
        const cond = row.find('.hprt-conditions li');
        const taxAndFeeText = row.find('.prd-taxes-and-fees-under-price').eq(0).text().trim();
        const taxAndFee = taxAndFeeText.match(/\d+/);

        const room = { available: true };
        if (roomType) {
            room.roomType = roomType.text().trim();
        }
        if (bedText) {
            room.bedType = bedText.replace(/\n+/g, ' ').trim();
        }
        if (persons) {
            room.persons = parseInt(persons[0], 10);
        }
        if (priceT && priceC) {
            room.price = parseFloat(priceT);
            if (taxAndFee) {
                room.price += taxAndFee ? parseFloat(taxAndFee[0]) : 0;
            }
            // eslint-disable-next-line prefer-destructuring
            room.currency = priceC;
            room.features = features;
        } else {
            room.available = false;
        }
        if (cond.length > 0) {
            room.conditions = [];
            for (let ci = 0; ci < cond.length; ci++) {
                const cText = cond.eq(ci).text().trim();
                room.conditions.push(cText.replace(/(\n|\s)+/g, ' '));
            }
        }
        rooms.push(room);
    }
    return rooms;
};

/**
 * Extracts information about all rooms listed by the hotel using jQuery in browser context.
 * Requires empty checkIn and checkOut properties to make selectors work properly.
 */
const extractSimpleRoomsInfo = () => {
    const $ = window.jQuery;
    const { location: { href } } = window;

    const roomInfoElements = $('.room-info');
    const rooms = $.map(roomInfoElements, (el) => {
        const roomType = $(el).find('[data-room-name-en]').text().trim();
        // eslint-disable-next-line newline-per-chained-call
        const bedType = $(el).find('.rt-bed-type').text().trim().replace(/[\n]+/g, ' ');

        const id = ($(el).attr('id') || '').replace(/^RD/g, '');
        const url = `${href}#room_${id}`;

        return { url, roomType, bedType };
    });

    const occupancyElements = $('.roomstable tbody td.occ_no_dates');
    const persons = $.map(occupancyElements, (el) => {
        const roomPersons = $(el).find('.occupancy_adults > .bicon').length;
        const multiplier = $(el).find('.occupancy_multiplier_number').text().trim();
        const multiplierValue = parseInt(multiplier, 10);

        return multiplierValue ? multiplierValue * roomPersons : roomPersons;
    });

    for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        room.persons = persons[i];
    }

    return rooms;
};

/**
 * Extracts information from the detail page.
 * @param {Puppeteer.Page} page - The Puppeteer page object.
 * @param {Object} ld - JSON-LD Object extracted from the page.
 * @param {Object} input - The Actor input data object.
 */
module.exports.extractDetail = async (page, ld, input, userData) => {
    const {
        address: { streetAddress, postalCode, addressLocality, addressCountry, addressRegion },
        hasMap,
        aggregateRating,
    } = ld;
    const address = {
        full: streetAddress,
        postalCode,
        street: addressLocality,
        country: addressCountry,
        region: addressRegion,
    };
    const html = await page.content();
    const name = await page.$('#hp_hotel_name');
    const nameText = name ? (await getAttribute(name, 'textContent')).split('\n') : null;
    const description = await page.$('#property_description_content');
    const descriptionText = description ? await getAttribute(description, 'textContent') : null;
    const hType = await page.$('.hp__hotel-type-badge');
    const pType = await page.$('.bh-property-type');
    const bFast = await page.$('.ph-item-copy-breakfast-option');
    const starTitle = await page.evaluate(() => {
        const el = document.querySelector('.bui-rating');
        return el ? el.getAttribute('aria-label') : null;
    });
    const parts = starTitle ? starTitle.match(/\d/) : null;
    const stars = parts ? parseInt(parts[0], 10) : null;
    const loc = hasMap ? hasMap.match(/%7c(-*\d+\.\d+),(-*\d+\.\d+)/) : null;
    const cInOut = await page.$(
        '.av-summary-section:nth-child(1) .bui-date-range__item:nth-child(1) .bui-date__subtitle',
    );
    const cMatch = cInOut ? (await getAttribute(cInOut, 'textContent')).match(/\d+:(\d+)/g) : null;
    const img1El = await page.$('.slick-track img');
    const img1 = img1El ? await getAttribute(img1El, 'src') : null;
    const img2El = await page.$('#photo_wrapper img');
    const img2 = img2El ? await getAttribute(img2El, 'src') : null;
    const img3 = html.match(/large_url: '(.+)'/);
    const rooms = await extractRoomsInfo(page, input);
    const price = rooms.length > 0 ? rooms[0].price : null;
    const images = await page.evaluate(() => {
        return window.booking.env.hotelPhotos.map((photo) => photo.large_url);
    });

    const homeType = hType ? await getAttribute(hType, 'textContent') : null;
    const propertyType = pType ? await getAttribute(pType, 'textContent') : null;

    const categoryReviews = await extractCategoryReviews(page);

    return {
        order: userData.order,
        url: addUrlParameters(page.url().split('?')[0], input),
        name: nameText ? nameText[nameText.length - 1].trim() : null,
        type: homeType || propertyType,
        description: descriptionText || null,
        stars,
        price,
        rating: aggregateRating ? aggregateRating.ratingValue : null,
        reviewsCount: aggregateRating ? aggregateRating.reviewCount : null,
        breakfast: bFast ? await getAttribute(bFast, 'textContent') : null,
        checkInFrom: cMatch && cMatch.length > 1 ? cMatch[0] : null,
        checkInTo: cMatch && cMatch.length > 1 ? cMatch[1] : null,
        location: loc && loc.length > 2 ? { lat: loc[1], lng: loc[2] } : null,
        address,
        image: img1 || img2 || (img3 ? img3[1] : null),
        rooms,
        images,
        categoryReviews,
    };
};

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

                    const image = jThis.find('.sr_item_photo_link.sr_hotel_preview_track').attr('style');
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

const extractRoomsInfo = async (page, { checkIn, checkOut }) => {
    if (checkIn && checkOut) {
        return page.evaluate(extractDetailedRoomsInfo);
    }

    return page.evaluate(extractSimpleRoomsInfo);
};

const extractCategoryReviews = async (page) => {
    const categoryReviews = await page.evaluate(() => {
        const CATEGORY_REVIEWS_SELECTOR = '.reviews-snippet-sidebar .review_list_score_container .v2_review-scores__wrapper li .c-score-bar';
        const reviewElements = document.querySelectorAll(CATEGORY_REVIEWS_SELECTOR);

        const reviews = [];

        reviewElements.forEach((el) => {
            const titleEl = el.querySelector('.c-score-bar__title');
            const scoreEl = el.querySelector('.c-score-bar__score');

            const title = titleEl ? titleEl.textContent.trim() : null;
            const scoreText = scoreEl ? scoreEl.textContent.trim() : null;
            const score = scoreText ? parseFloat(scoreText.replaceAll(',', '.')) : null;

            if (title && score) {
                reviews.push({ title, score });
            }
        });

        return reviews;
    });

    return categoryReviews;
};

/**
 * Up to 10 reviews can be scraped from the detail page directly.
 * They're stored in a JavaScript variable `exportedVars`
 * in one of the <script nonce=".*">.
 * @param {string} html
 * @param {boolean} extractReviewerName
 */
module.exports.extractUserReviews = (html, extractReviewerName) => {
    // regex.exec(string) needs to be used instead of string.match(regex) to make capturing group work properly
    const matches = EXPORTED_VARS_REGEX.exec(html);
    const exportedVarsMatch = matches ? matches[1] : '';

    const context = { exportedVars: {} };
    vm.createContext(context);

    const jsonParseCode = exportedVarsMatch
        .replace(/((\\r)?\\n)|(\\r)/gi, ' ') // replace newline characters with whitespaces
        .replace(/( )+/g, ' '); // replace multiple whitespaces with 1;

    vm.runInContext(jsonParseCode, context);

    const { exportedVars } = context;

    const { fe_featured_reviews: featuredReviews } = exportedVars;
    const parsedReviews = featuredReviews ? parseReviews(featuredReviews) : [];

    if (!extractReviewerName) {
        parsedReviews.forEach((review) => delete review.guestName);
    }

    return parsedReviews;
};

module.exports.extractReviews = async (page) => {
    const extractedReviews = await page.evaluate(() => {
        const $ = window.jQuery;
        const extractReviewTexts = (el) => {
            const reviewTextElements = $(el).find('.c-review__inner--ltr');

            const reviewTexts = { positive: null, negative: null };

            $.map(reviewTextElements, (element) => {
                const positive = $(element).find('.-iconset-review_great').length > 0;
                const negative = $(element).find('.-iconset-review_poor').length > 0;

                const reviewText = $(element).find('.c-review__body').text().trim() || null;
                if (reviewText) {
                    const reviewKey = positive || !negative ? 'positive' : 'negative';
                    reviewTexts[reviewKey] = reviewText;
                }
            });

            return reviewTexts;
        };

        const reviewBlocks = $('.c-review-block');
        const reviews = $.map(reviewBlocks, (el) => {
            const dateMatches = $(el).find('.c-review-block__date').text().trim()
                .match(/([\d]{1,2}(.)+[\d]{4})/gi);

            const reviewTexts = extractReviewTexts(el);

            const review = {
                title: $(el).find('.c-review-block__title').first().text()
                    .trim() || null,
                score: parseFloat($(el).find('.bui-review-score__badge').text().trim()) || null,
                ...reviewTexts,
                guestName: $(el).find('.bui-avatar-block__title').text().trim(),
                travellerType: $(el).find('.review-panel-wide__traveller_type .bui-list__body').text().trim(),
                room: $(el).find('.c-review-block__room-info-row .bui-list__body').text().trim() || null,
                nightsStay: parseInt($(el).find('.c-review-block__stay-date .bui-list__body').text().trim(), 10),
                date: dateMatches.length > 0 ? dateMatches[0] : null,
                country: $(el).find('.bui-avatar-block__subtitle').text().trim(),
            };

            return review;
        });

        return reviews;
    });

    return extractedReviews;
};

const parseReviews = (reviews) => {
    const parsedReviews = reviews.map((review) => {
        const {
            b_title: title,
            b_average_score_out_of_10: score,
            b_hotel_positive: positive,
            b_hotel_negative: negative,
            b_guest_name: guestName,
            b_completed_date: date,
            b_language: language,
            b_country_name: country,
            b_guest_countrycode: countryCode,
            b_user_uploaded_photos: uploadedPhotos,
        } = review;

        const photos = uploadedPhotos ? uploadedPhotos.map((photo) => photo.max1280x900) : [];

        return { title, score, positive, negative, guestName, date, language, country, countryCode, photos };
    }).map((review) => {
        const normalizedReview = { ...review };

        Object.keys(normalizedReview).forEach((key) => {
            // store null instead of an empty string
            normalizedReview[key] = normalizedReview[key] || null;
        });

        return normalizedReview;
    });

    return parsedReviews;
};
