const Apify = require('apify');
const { USER_AGENT, MAX_PAGINATION_PAGES } = require('./consts');
const { validateInput, cleanInput, evalExtendOutputFn } = require('./input');
const { prepareRequestSources } = require('./start-urls');
const ErrorSnapshotter = require('./error-snapshotter');
const handlePageFunctionExtended = require('./handle-page-function');
const { initializeGlobalStore } = require('./global-store');

const { log } = Apify.utils;

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');
    validateInput(input);
    cleanInput(input);
    const extendOutputFunction = evalExtendOutputFn(input);

    const {
        startUrls,
        sortBy = 'bayesian_review_score',
        maxPages = MAX_PAGINATION_PAGES,
        maxReviewsPages = MAX_PAGINATION_PAGES,
        proxyConfig = { useApifyProxy: true },
        enableAssets = false,
    } = input;

    const errorSnapshotter = new ErrorSnapshotter();
    await errorSnapshotter.initialize(Apify.events);

    const store = await initializeGlobalStore(maxPages, maxReviewsPages);

    const globalContext = {
        input,
        extendOutputFunction,
        sortBy,
        store,
    };

    const requestQueue = await Apify.openRequestQueue();

    const { requestSources } = await prepareRequestSources({ startUrls, input }, globalContext);
    const requestList = await Apify.openRequestList('LIST', requestSources);
    const proxyConfiguration = (await Apify.createProxyConfiguration(proxyConfig)) || undefined;

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        handlePageTimeoutSecs: enableAssets ? 60 : 30,
        proxyConfiguration,
        launchContext: {
            useChrome: Apify.isAtHome(),
            launchOptions: {
                args: ['--ignore-certificate-errors'],
                ignoreHTTPSErrors: true,
            },
            userAgent: USER_AGENT,
        },
        useSessionPool: true,
        handlePageFunction: async (context) => {
            const loadedUrl = context.page.url();
            if (loadedUrl.length <= 62) {
                context.session.retire();
                context.crawler.browserPool.retireBrowserByPage(context.page);
                throw new Error(`The loaded url (${loadedUrl}) seems wrong! Retry...`);
            }

            await errorSnapshotter.tryWithSnapshot(context.page, async () => {
                await handlePageFunctionExtended(context, globalContext);
            });
        },
        handleFailedRequestFunction: async ({ request }) => {
            log.info(`Request ${request.url} failed too many times`);
            await Apify.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
        preNavigationHooks: [
            async ({ page }) => {
                if (!enableAssets) {
                    await Apify.utils.puppeteer.blockRequests(page);
                }

                const cookies = await page.cookies('https://www.booking.com');
                await page.deleteCookie(...cookies);
                await page.setViewport({
                    width: 1024 + Math.floor(Math.random() * 100),
                    height: 768 + Math.floor(Math.random() * 100),
                });
            },
        ],
    });

    log.info('Starting the crawl.');
    await crawler.run();
    log.info('Crawl finished.');
});
