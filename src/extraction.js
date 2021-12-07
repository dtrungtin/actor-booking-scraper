const Puppeteer = require('puppeteer'); // eslint-disable-line
const { getAttribute, addUrlParameters } = require('./util.js'); // eslint-disable-line

/**
 * Extracts information about all rooms listed by the hotel using jQuery in browser context.
 */
const extractRoomsJQuery = () => {
    let roomType;
    let bedText;
    let features;
    const rooms = [];
    const $ = window.jQuery;

    // Function for extracting occupancy info.
    const occExtractor = (row) => {
        if (!row || row.length < 1) { return null; }
        /* eslint-disable */
        const occ1 = row.find('.hprt-occupancy-occupancy-info .invisible_spoken');
        const occ2 = row.find('.hprt-occupancy-occupancy-info').attr('data-title');
        const occ3 = row.find('.hprt-occupancy-occupancy-info').text();
        /* eslint-enable */
        return occ1.length > 0 ? occ1.text() : (occ2 || occ3);
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
                    } else { features.push(fText); }
                }
            }
        }

        // Extract data for each room.
        let occupancy;
        try { occupancy = occExtractor(row); } catch (e) { occupancy = null; }
        const persons = occupancy ? occupancy.match(/\d+/) : null;
        const priceE = row.find('.bui-price-display__value .prco-valign-middle-helper').eq(0);
        const priceT = priceE.length > 0 ? priceE.text().replaceAll(',', '.').replace(/[^\d.]+/g, '') : null;
        const priceC = priceE.length > 0 ? priceE.text().replace(/[\d.\n\t, ]+/g, '') : null;
        const cond = row.find('.hprt-conditions li');
        const taxAndFeeText = row.find('.prd-taxes-and-fees-under-price').eq(0).text().trim();
        const taxAndFee = taxAndFeeText.match(/\d+/);

        const room = { available: true };
        if (roomType) { room.roomType = roomType.text().trim(); }
        if (bedText) { room.bedType = bedText.replace(/\n+/g, ' '); }
        if (persons) { room.persons = parseInt(persons[0], 10); }
        if (priceT && priceC) {
            room.price = parseFloat(priceT);
            if (taxAndFee) {
                room.price += (taxAndFee ? parseFloat(taxAndFee[0]) : 0);
            }
            // eslint-disable-next-line prefer-destructuring
            room.currency = priceC;
            room.features = features;
        } else { room.available = false; }
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
 * Extracts information from the detail page.
 * @param {Puppeteer.Page} page - The Puppeteer page object.
 * @param {Object} ld - JSON-LD Object extracted from the page.
 * @param {Object} input - The Actor input data object.
 */
module.exports.extractDetail = async (page, ld, input, userData) => {
    const { address: { streetAddress, postalCode, addressLocality, addressCountry, addressRegion }, hasMap, aggregateRating } = ld;
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
    const bFast = await page.$('.ph-item-copy-breakfast-option');
    const starTitle = await page.evaluate(() => {
        const el = document.querySelector('.bui-rating');
        return el ? el.getAttribute('aria-label') : null;
    });
    const parts = starTitle ? starTitle.match(/\d/) : null;
    const stars = parts ? parseInt(parts[0], 10) : null;
    const loc = hasMap ? hasMap.match(/%7c(-*\d+\.\d+),(-*\d+\.\d+)/) : null;
    const cInOut = await page.$('.av-summary-section:nth-child(1) .bui-date-range__item:nth-child(1) .bui-date__subtitle');
    const cMatch = cInOut ? (await getAttribute(cInOut, 'textContent')).match(/\d+:(\d+)/g) : null;
    const img1El = await page.$('.slick-track img');
    const img1 = img1El ? await getAttribute(img1El, 'src') : null;
    const img2El = await page.$('#photo_wrapper img');
    const img2 = img2El ? await getAttribute(img2El, 'src') : null;
    const img3 = html.match(/large_url: '(.+)'/);
    const rooms = await page.evaluate(extractRoomsJQuery);
    const price = rooms.length > 0 ? rooms[0].price : null;
    const images = await page.evaluate(() => { return window.booking.env.hotelPhotos.map((photo) => photo.large_url); });

    return {
        order: userData.order,
        url: addUrlParameters(page.url().split('?')[0], input),
        name: nameText ? nameText[nameText.length - 1].trim() : null,
        type: hType ? await getAttribute(hType, 'textContent') : null,
        description: descriptionText || null,
        stars,
        price,
        rating: aggregateRating ? aggregateRating.ratingValue : null,
        reviews: aggregateRating ? aggregateRating.reviewCount : null,
        breakfast: bFast ? await getAttribute(bFast, 'textContent') : null,
        checkInFrom: (cMatch && cMatch.length > 1) ? cMatch[0] : null,
        checkInTo: (cMatch && cMatch.length > 1) ? cMatch[1] : null,
        location: (loc && loc.length > 2) ? { lat: loc[1], lng: loc[2] } : null,
        address,
        image: img1 || img2 || (img3 ? img3[1] : null),
        rooms,
        images,
    };
};

/**
 * Extracts data from a hotel list page.
 * NOTE: This function is to be used in page.evaluate.
 * @param {Object} input - The Actor input data object.
 */
module.exports.listPageFunction = (input) => new Promise((resolve) => {
    const { minScore } = input;
    const $ = window.jQuery;

    /**
     * Waits for a condition to be non-false.
     * @param {Function} condition - The condition Function.
     * @param {Function} callback - Callback to be executed when the waiting is done.
     * @param {number} [i]
     */
    const waitFor = function (condition, callback, i) {
        const val = condition();
        if (val) {
            callback(val);
        } else if (i > 10) {
            callback(null);
        } else {
            setTimeout(() => { waitFor(condition, callback, i ? i + 1 : 1); }, 500);
        }
    };

    // Extract listing data.
    const result = [];
    // eslint-disable-next-line max-len
    const items = $('.sr_property_block.sr_item:not(.soldout_property), [data-capla-component*="PropertiesListDesktop"] [data-testid="property-card"]');
    let started = 0;
    let finished = 0;

    // Iterate all items
    items.each(function (index, sr) {
        const jThis = $(this);
        const n1 = jThis.find('.score_from_number_of_reviews').text().replace(/(\s|\.|,)+/g, '').match(/\d+/);
        const n2 = jThis.find('.review-score-widget__subtext').text().replace(/(\s|\.|,)+/g, '').match(/\d+/);
        const n3 = jThis.find('.bui-review-score__text').text().replace(/(\s|\.|,)+/g, '').match(/\d+/);
        const n4 = jThis.find('[data-testid=review-score] > div:nth-child(2) > div:nth-child(2)').text();
        const nReviews = n1 || n2 || n3 || n4;

        ++started;
        sr.scrollIntoView();
        const getPrices = function () {
            // eslint-disable-next-line max-len
            return $(sr).find('.bui-price-display__value, :not(strong).site_price, .totalPrice, strong.price, [data-testid=price-and-discounted-price] > span');
        };

        // When the price is ready, extract data.
        waitFor(() => { return getPrices().length > 0; }, () => {
            /* eslint-disable */
            const origin = window.location.origin;
            /* eslint-enable */
            const rl1 = jThis.find('.room_link span').eq(0).contents();
            // eslint-disable-next-line max-len
            const rl2 = jThis.find('.room_link strong').length > 0 ? jThis.find('.room_link strong') : jThis.find('[data-testid=recommended-units] [role=link]');

            // if more prices are extracted, first one is the original, second one is current discount
            const prices = getPrices();
            const prtxt = prices.length > 1 ? prices.eq(1).text() : prices.eq(0).text()
                .replace(/,|\s/g, '');
            const pr = prtxt.match(/[\d.]+/);
            const pc = prtxt.match(/[^\d.]+/);

            const taxAndFeeText = jThis.find('.prd-taxes-and-fees-under-price').eq(0).text().trim();
            const taxAndFee = taxAndFeeText.match(/\d+/);
            const rat = $(sr).attr('data-score') || jThis.find('[data-testid=review-score] > div:first-child').text();
            const starAttr = jThis.find('.bui-rating').attr('aria-label');
            const stars = starAttr ? starAttr.match(/\d/) : [jThis.find('[data-testid=rating-stars] span').length];
            const starsCount = stars ? parseInt(stars[0], 10) : null;
            const image = jThis.find('.sr_item_photo_link.sr_hotel_preview_track').attr('style');
            const hotelLink = jThis.find('.hotel_name_link').attr('href');
            let url = hotelLink ? hotelLink.replace(/\n/g, '') : jThis.find('a').attr('href').replace(/\n/g, '');
            url = url.includes(origin) ? url : `${origin}${url}`;
            const item = {
                url: url.split('?')[0],
                name: $(sr).find('.sr-hotel__name, [data-testid=title]').text().trim(),
                rating: rat ? parseFloat(rat.replace(',', '.')) : null,
                reviews: nReviews ? parseInt(nReviews[0], 10) : null,
                stars: starsCount !== 0 ? starsCount : null,
                price: pr ? (parseFloat(pr[0]) + (taxAndFee ? parseFloat(taxAndFee[0]) : 0)) : null,
                currency: pc ? pc[0].trim() : null,
                roomType: rl2.length > 0 ? rl2.text().trim() : rl1.eq(0).text().trim(),
                address: jThis.find('[data-testid=address]').text(),
                image,
            };

            const DEFAULT_MIN_RATING = 8.4;

            // if no rating is scraped, consider item's rating valid (set it to max rating + 1)
            const MAX_RATING = 10;
            const rating = item.rating || MAX_RATING + 1;

            if ((minScore && rating >= minScore) || (!minScore && rating >= DEFAULT_MIN_RATING)) {
                result.push(item);
            }

            if (++finished >= started) {
                resolve(result);
            }
        });
    });
});
