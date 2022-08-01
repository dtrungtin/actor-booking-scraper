## What does Booking Scraper do?
Our free Booking Scraper allows you to scrape data from Booking.com, one of the best-known platforms for hotels, apartments, resorts, villas, and other types of accommodation worldwide.

Our Booking Scraper is capable of extracting data such as:

🏖 Hotel names and locations

🗓 Availability

⏱ Check-in and check-out times

🛏 Room types

💵 Prices

🖋 Reviews

📃 Conditions

💰 Promotions

The Booking.com API interface is quite user-friendly, but getting that data in machine-processable format is no easy task. Booking.com places a lot of restrictions on how data can be collected from its listings, one of them being that it will only display a **maximum of 1,000 results**  for any given search. Apify's Booking Scraper doesn't impose any limitations on your results, so you can scrape data from Booking.com at scale.

## How much will it cost to scrape Booking?
Apify gives you $5 free usage credits every month on the Apify Free plan. You can get 2,000 results per month from Booking.com for that, so those 2,000 results will be completely free!

But if you need to regularly scrape data from Booking.com, you should grab an [Apify subscription](https://apify.com/pricing). We recommend our $49/month Personal plan - you can get up to 20,000 every month with the $49 monthly plan! 

Or get 200,000 results for $499 with the Team plan - wow!


## How can I scrape Booking?
If you want a step-by-step tutorial on how to scrape Booking, read our blog post on [how to scrape Booking.com](https://blog.apify.com/crawling-booking-com-47511a59eef/) or just sit back and enjoy this quick tutorial video:

[![Watch the video](https://img.youtube.com/vi/FZgi9YxNBa0/0.jpg)](https://youtu.be/FZgi9YxNBa0)


## Tips for scraping Booking
1️⃣ The actor will not work without a proxy. If you try running the actor without a proxy, it will fail with a message stating exactly that. There could be a slight difference in price depending on the type of proxy you use.

2️⃣ Booking.com will only display a maximum of 1,000 results; if you need to circumvent this limitation, you can utilize the `useFilters` INPUT attribute. However, using any limiting filters in start URLs will not be possible because the scraper will override those.

3️⃣ If you need to get detailed data about specific rooms, the scraper needs to be started with `checkIn` and `checkOut` INPUT attributes (Booking.com only shows complete room info for specific dates).

4️⃣ Booking.com may return some suggested hotels outside of the expected city/region as a recommendation. The scraper will return all of them in the data results, so you may get more results than your search.

## Is it legal to scrape Booking?
Note that personal data is protected by GDPR in the European Union and by other regulations around the world. You should not scrape personal data unless you have a legitimate reason to do so. If you're unsure whether your reason is legitimate, consult your lawyers. We also recommend that you read our blog post: [is web scraping legal?](https://blog.apify.com/is-web-scraping-legal/)
