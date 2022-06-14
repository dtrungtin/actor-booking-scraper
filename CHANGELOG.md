## 2022-06-14

- Fixed `image` extraction from listing page (for `simple: true` scrape parameter)

## 2022-04-03

- Added user reviews extraction from both detail page and reviews pagination pages
- Added category reviews extraction from detail page
- Removed default settings `minScore = 8.4`
- Fixed language settings for detail page (`language` input field was not respected)
- Fixed `stars` extraction from detail page
- Fixed `checkInFrom` and `checkInTo` extraction from detail page
- Handled global state with external package `apify-global-store`
- Split code into more source files, created `extraction` and `routes` folders

## 2022-01-10

- Fixed rejection of current date in `checkIn` and `checkOut` fields

## 2021-12-28

- Set custom `minMaxPrice` filter to provide more specific filtering than booking.com API
- Added rooms scraping support without `checkIn` and `checkOut` set (simple output with basic info only)
- Implemented `useFilters` to overcome 1000 results limit by setting filters one by one and combining them
- Refactored `handlePageFunction`

## 2021-11-22

- Fixed broken url search
- Fixed outdated selectors to scrape more detailed info
- Fixed `minMaxPrice` search filter
- Maximized results count when `maxPages` is set (included `minScore` and `priceRange` into search url)
- Prevented infinite run when no `maxPages` restriction is set

## 2021-08-24

- Extracted all images

## 2021-01-22

Features:
- Added screenshots for errors
- Added SessionPool

Fixes:
- Removed broken currency check (the main bug that prevented the scraper to work)
- Fixed scraper getting into infinite error loop
- Major code refactor (will help with future fixes and UX)
