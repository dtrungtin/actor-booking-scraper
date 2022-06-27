# What does Booking Scraper do?
Our free Booking Scraper allows you to scrape hotel data from Booking.com, one of the best-known platforms for hotels, apartments, resorts, villas, and other types of accommodation worldwide.

Our Booking.com scraper is capable of extracting data such as:

* Hotel names and locations

* Availability

* Check-in and check-out times

* Room types

* Prices

* Reviews

* Conditions

* Promotions

The Booking.com API interface is quite user-friendly, but getting that data in machine-processable format is no easy task. Booking places a lot of restrictions on how data can be collected from its listings, one of them being that it will only display a **maximum of 1,000 results**  for any given search. Apify's Booking Scraper doesn't impose any limitations on your results, so you can extract data from Booking at scale.

## How much will it cost to use scrape Booking.com?
* 1 compute unit for 1,000 results with no details
* 10 compute units for 1,000 results with detailed information

That means that Booking Scraper will cost you $0.25-2.50 for 1,000 results, depending on how much detailed data you need to collect.

## How can I scrape Booking.com?
If you want a step-by-step tutorial on how to scrape Booking, read our blog post on [how to scrape Booking.com](https://blog.apify.com/crawling-booking-com-47511a59eef/) or just sit back and enjoy this quick tutorial video:

[![Watch the video](https://img.youtube.com/vi/FZgi9YxNBa0/0.jpg)](https://youtu.be/FZgi9YxNBa0)

## Input attributes
The input for the scraper is a JSON object with the following properties:

```javascript
{
    "search": SEARCH_QUERY,
    "destType": DESTINATION_TYPE,
    "simple": EXTRACT_FROM_LIST,
    "useFilters": USE_CRITERIA_FILTERING,
    "minScore": MINIMUM_HOTEL_RATING,
    "maxPages": MAXIMUM_PAGINATION_PAGES,
    "maxReviews": MAXIMUM_REVIEWS,
    "concurrency": MAXIMUM_CONCURRENT_PAGES,
    "checkIn": CHECK_IN_DATE,
    "checkOut": CHECK_OUT_DATE,
    "rooms": NUMBER_OF_ROOMS,
    "adults": NUMBER_OF_ADULTS,
    "children": NUMBER_OF_CHILDREN,
    "currency": PREFERRED_CURRENCY,
    "language": PREFERRED_LANGUAGE,
    "sortBy": BOOKING_SORT_TYPE,
    "propertyType": PROPERTY_TYPE,
    "minMaxPrice": MIN_MAX_PRICE_RANGE,
    "scrapeReviewerName": SCRAPE_REVIEWER_NAME,
    "proxyConfig": APIFY_PROXY_CONFIG,
    "extendOutputFunction": EXTEND_OUTPUT_FUNCTION
}
```

* `search` is the only required attribute. This is the Booking.com search query.
* `destType` specifies type of search, available values are `city` and `region`.
* `simple` defines if the data should be extracted just from the list page, default is `false`.
* `useFilters` sets if the crawler should utilize criteria filters to overcome the limit for 1000 results.
* `minScore` specifies the minimum allowed rating of the hotel to be included in results.
* `maxPages` sets maximum number of pagination pages to be crawled.
* `maxReviews` sets maximum number of reviews to be extracted. It works only with `simple` field set to `false`. You'll get up to 10 reviews from a detail page without any extra overhead. When set on value > 10, preview reviews from the detail page won't be scraped and reviews pagination pages will be crawled instead.
* `checkIn` check-in date in the yyyy-mm-dd format.
* `checkOut` check-out date in the yyyy-mm-dd format.
* `rooms` number of rooms to be set for the search.
* `adults` number of adults to be set for the search.
* `children` number of children to be set for the search.
* `currency` preferred currency code to be set on the site.
* `language` preferred language code to be set on the site.
* `propertyType` type of property to search, it will use filters, so cannot be combined with `useFilters`.
Must be one of the following:
```json
[
    "none",
    "Hotels",
    "Apartments",
    "Hostels",
    "Guest houses",
    "Homestays",
    "Bed and breakfasts",
    "Holiday homes",
    "Boats",
    "Villas",
    "Motels",
    "Holiday parks",
    "Campsites",
    "Luxury tents"
]
```
* `minMaxPrice` min-max price range, it will filter the results, so it cannot be combined with `useFilters`.
You can use one of the following formats (or exclude the attribute from INPUT completely):
`none`, `100-150`, `200+`. Note that the actor sets custom price filter so you can provide arbitrary price range
and you don't need to limit yourself on the given ranges from the booking.com website. You can even specify a more specific
price range than booking.com offers in its price filters (e.g. Booking has price category 500+ but you can set values
such as 520-550, 650-680, 700+, ...). The values apply to the currency provided as another INPUT attribute.
* `scrapeReviewerName` includes names of the reviewers in the result, default is `false`. You should only scrape reviewer name if you have a legit reason to do so.
* `proxyConfig` defines Apify Proxy configuration, it should respect this format:
```json
"proxyConfig": {
    "useApifyProxy": true
}
```
* `sortBy` sets a hotel attribute by which the results will be ordered, must be one of the following.
```javascript
[
    "upsort_bh",                 // Show homes first
    "price",                     // Price (lowest first)
    "closest_ski_lift_distance", // Distance to nearest ski lift
    "class",                     // Stars [5->1]
    "class_asc",                 // Stars [1->5]
    "class_and_price",           // Star rating and price
    "distance_from_search"       // Distance from city centre
    "bayesian_review_score"      // Top reviewed
]
```
* `extendOutputFunction` Function that takes a JQuery handle ($) as argument and returns data that will be merged with the default output, only when `simple` = false.

## Scraping by URLs
Instead of `search` INPUT attribute, it is also possible to start the crawler with an array of `startUrls`.
In this case all the other attributes modifying the URLs will still be applied, it is therefore suggested to use simple urls and set all the other options using INPUT attributes instead of leaving them in the URL to
avoid URL parameter clashing.
If the startURL is a hotel detail page, it will be scraped. In case it is a hotel list page, the result
will depend on the `simple` attribute. If it's `true`, the page will be scraped, otherwise all the links to
detail pages will be added to the queue and scraped afterwards.
The `startUrls` attribute should contain an array of URLs as follows:

```javascript
{
    "startUrls": [
        "https://www.booking.com/hotel/fr/ariane-montparnasse.en-gb.html",
        "https://www.booking.com/hotel/fr/heliosopera.en-gb.html",
        "https://www.booking.com/hotel/fr/ritz-paris-paris.en-gb.html",
        ...
    ],
    "simple": false,
    "minScore": "8.4",
    ...
}
```

## Output examples
If using the `simple` INPUT attribute, the example output for a single hotel might look like this:

```json
{
  "url": "https://www.booking.com/hotel/cz/elia-ky-kra-snohorska-c-apartments-prague.en-gb.html",
  "name": "Centrum Apartments Old Town",
  "address": "Prague 01, Prague",
  "rating": 10,
  "reviews": 7,
  "stars": 4,
  "price": 86,
  "currency": "€",
  "roomType": "Deluxe Three-Bedroom Apartment with Terrace",
  "persons": 4
}
```

If `checkIn` and `checkOut` INPUT attributes are not provided, simple output is further reduced as `price`,
`currency`, `roomType` and `persons` cannot be scraped from the listing page. The output follows this format:

```json
{
  "url": "https://www.booking.com/hotel/cz/elia-ky-kra-snohorska-c-apartments-prague.en-gb.html",
  "name": "Centrum Apartments Old Town",
  "address": "Prague 01, Prague",
  "rating": 10,
  "reviews": 7,
  "stars": 4
}
```

Otherwise the output will be much more comprehensive, especially the `rooms` array. When `checkIn` and `checkOut` INPUT attributes are set, `rooms` array will contain more detailed info such as price or room features. These fields will be omitted without `checkIn` and `checkOut` specified.

Reviews will also be included in a detailed result. You'll get `categoryReviews` with review score for the individual criteria such as location, staff or value for money. Apart from `categoryReviews`, the result will also contain `userReviews` array holding structured reviews directly from the users. When a detail page contains preview reviews (10 at the most), they can be extracted without crawling separate review pages. If you'd like to scrape more than 10 reviews, you'll need to set `maxReviews` accordingly. For `maxReviews = 25`, one extra request for reviews pagination will be enqueued. Each review page offers 25 reviews as the maximum. Depending on the `scrapeReviewerName` input field value, the `guestName` field will be provided or excluded.

```json
{
  "order": 8,
  "url": "https://www.booking.com/hotel/cz/alfons.html?selected_currency=EUR&changed_currency=1&top_currency=1&lang=en-us&group_adults=2&no_rooms=1&review_score=90&ht_id=204&checkin=2022-06-10&checkout=2022-06-12",
  "name": "Alfons Boutique Hotel",
  "type": "Hotel",
  "description": "You're eligible for a Genius discount at Alfons Boutique Hotel! To save at this property, all you have to do is sign in.\nAlfons Boutique Hotel in Prague, a 10-minute walk from Wenceslas Square and Prague National Museum offers free WiFi and barbecue facilities. The hotel features a garden and a terrace.\nThe hotel's cozy rooms are equipped with a flat-screen TV. All rooms come with a coffee machine and a private bathroom with a shower, while certain rooms come with a kitchen. Guest rooms have a wardrobe.\nA continental breakfast is available every morning at the property.\nHiking is among the activities that guests can enjoy near Alfons Boutique Hotel.\nAlfons Boutique Hotel is located across the road from the closest metro stop. Prague Astronomical Clock is 1.1 mi from the accommodations, while Vaclav Havel Airport is a 30-minute drive from the property.",
  "stars": 4,
  "price": 184,
  "rating": 9.1,
  "reviews": 898,
  "breakfast": "Continental, Vegetarian, Gluten-free, American, Buffet",
  "checkInFrom": "14:00",
  "checkInTo": "22:00",
  "location": {
    "lat": "50.0739590",
    "lng": "14.4300880"
  },
  "address": {
    "full": "Legerova 41, Prague, 120 00, Czech Republic",
    "postalCode": "120 00",
    "street": "Legerova 41",
    "country": "Czech Republic",
    "region": ""
  },
  "image": "https://cf.bstatic.com/xdata/images/hotel/max1024x768/321992025.jpg?k=6395153148c192c41b9301ced1766d6f5108871233740f5470e1d804c0eea0bf&o=&hp=1",
  "rooms": [
    {
      "available": true,
      "roomType": "King Room",
      "price": 184,
      "currency": "€ ",
      "features": [
        "194 feet²",
        "Air conditioning",
        "Attached bathroom",
        "Flat-screen TV",
        "Coffee machine",
        "Minibar",
        "Free WiFi",
        "Free toiletries",
        "Safe",
        "Toilet",
        "Bathtub or shower",
        "Hardwood or parquet floors",
        "Towels",
        "Linens",
        "Socket near the bed",
        "Cleaning products",
        "Hypoallergenic",
        "Desk",
        "TV",
        "Telephone",
        "Satellite channels",
        "Tea/Coffee maker",
        "Radio",
        "Heating",
        "Hairdryer",
        "Electric kettle",
        "Cable channels",
        "Wardrobe or closet",
        "Upper floors accessible by elevator",
        "Clothes rack",
        "Fold-up bed",
        "Toilet paper"
      ],
      "conditions": [
        "Excellent breakfast € 10",
        "Free cancellation until 18:00 on June 2, 2022",
        "Pay in advance",
        "No modifications",
        "Confirmed within 2 minutes",
        "Learn more"
      ]
    }
  ],
  "images": [
    "https://cf.bstatic.com/xdata/images/hotel/max1024x768/321992025.jpg?k=6395153148c192c41b9301ced1766d6f5108871233740f5470e1d804c0eea0bf&o=&hp=1",
    "https://cf.bstatic.com/xdata/images/hotel/max1024x768/304687325.jpg?k=bb24287d18bf935bfb3c5f4c62983c280c3c68b6bc4631f82fff93e437952aac&o=&hp=1"
  ],
  "categoryReviews": [
    {
      "title": "Location",
      "score": 9.1
    },
    {
      "title": "Cleanliness",
      "score": 9.4
    },
    {
      "title": "Staff",
      "score": 9.3
    },
    {
      "title": "Comfort",
      "score": 9.4
    },
    {
      "title": "Value for money",
      "score": 9.1
    },
    {
      "title": "Facilities",
      "score": 9.1
    },
    {
      "title": "Free WiFi",
      "score": 9.5
    }
  ],
  "userReviews": [
    {
      "title": "Exceptional",
      "score": 10,
      "positive": "Hotel was very nice, quiet and cozy. Staff was very friendly and was able to recommend some great places to eat.",
      "negative": "There wasn't anything I didn't like.",
      "travellerType": "Couple",
      "room": "King Room",
      "nightsStay": 1,
      "date": "8, 2021",
      "country": "United States of America",
      "countryCode": "us",
      "photos": []
    }
  ]
}
```


## Notes
* The actor will not work without a proxy. If you try running the actor without a proxy, it will fail with a message stating exactly that. There could be a slight difference in price depending on the type of proxy you use.

* Booking.com will only display a maximum of 1,000 results; if you need to circumvent this limitation, you can utilize the `useFilters` INPUT attribute.

* If you need to get detailed data about specific rooms, the crawler needs to be started with `checkIn` and `checkOut` INPUT attributes (Booking.com only shows complete room info for specific dates).

* Booking.com may return some suggested hotels outside of the expected city/region as a recommendation. The actor will return all of them in the crawling results, so you may get more results than your search.
