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

Otherwise the output will be much more comprehensive, especially the `rooms` array, which will, however,
contain data only if the `checkIn` and `checkOut` INPUT attributes are set.

```json
{
  "url": "https://www.booking.com/hotel/cz/elia-ky-kra-snohorska-c-apartments-prague.en-gb.html",
  "name": "Centrum Apartments Old Town",
  "type": "Apartment",
  "description": "Situated in the centre of Prague in a historical building near the Pařížská street, 500 metres from the Old Town Square, the Pragueaparts Old town E offers...",
  "stars": 4,
  "rating": 10,
  "reviews": 7,
  "breakfast": null,
  "checkInFrom": "15:00",
  "checkInTo": "00:00",
  "location": {
    "lat": "50.0903216",
    "lng": "14.4199419"
  },
  "address": {
    "full": "Elišky Krásnohorské 2, Prague, 11000, Czech Republic",
    "postalCode": "11000",
    "street": "Elišky Krásnohorské 2",
    "country": "Czech Republic",
    "region": ""
  },
  "image": "https://cf.bstatic.com/xdata/images/hotel/max1024x768/303439628.jpg?k=7f001a9cbf85160050efc5437e3ba5adac7b23db47a5a2dbb8c10640b4e7b042&o=&hp=1",
  "images": [
    "https://cf.bstatic.com/xdata/images/hotel/max1024x768/303439628.jpg?k=7f001a9cbf85160050efc5437e3ba5adac7b23db47a5a2dbb8c10640b4e7b042&o=&hp=1",
    "https://cf.bstatic.com/xdata/images/hotel/max1024x768/202101343.jpg?k=afd7a3e75f1f758b4137f9605645e7e23d42eadc9e18137d3c435d628b11c46d&o=&hp=1",
    "https://cf.bstatic.com/xdata/images/hotel/max1024x768/183313960.jpg?k=fb7411388bf11432cf7613ab3318d5b5f1d767741f18095d034d4f430252a841&o=&hp=1"
  ],
  "rooms": [
    {
      "available": true,
      "roomType": "Deluxe Three-Bedroom Apartment with Terrace",
      "bedType": " Bedroom 1: 1 extra-large double bed Bedroom 2: 2 single beds Bedroom 3: 3 single beds and 1 sofa bed ",
      "persons": 1,
      "price": 85.54,
      "currency": "€",
      "features": [
        "80 m²",
        "City view",
        "Terrace",
        "Flat-screen TV",
        "Air conditioning",
        "Private bathroom"
      ],
      "conditions": [
        "Non-refundable"
      ]
    }
  ]
}
```


## Notes
* The actor will not work without a proxy. If you try running the actor without a proxy, it will fail with a message stating exactly that. There could be a slight difference in price depending on the type of proxy you use.

* Booking.com will only display a maximum of 1,000 results; if you need to circumvent this limitation, you can utilize the `useFilters` INPUT attribute. However, using any limiting filters in start URLs will not be possible because the scraper will override those.

* If you need to get data about specific rooms, the crawler needs to be started with `checkIn` and `checkOut` INPUT attributes (Booking.com only shows room info for specific dates).

* Booking.com may return some suggested hotels outside of the expected city/region as a recommendation. The actor will return all of them in the crawling results, so you may get more results than your search.
