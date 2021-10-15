const Apify = require('apify');
const { USER_AGENT } = require('./consts');
const { validateInput, cleanInput, evalExtendOutputFn } = require('./input');
const { prepareRequestSources } = require('./start-urls');
const ErrorSnapshotter = require('./error-snapshotter');
const handlePageFunctionExtended = require('./handle-page-function');

const { log } = Apify.utils;

Apify.main(async () => {
    const input = await Apify.getValue('INPUT');
    validateInput(input);
    cleanInput(input);
    const extendOutputFunction = evalExtendOutputFn(input);

    const {
        startUrls,
        sortBy = 'bayesian_review_score',
        maxPages,
        proxyConfig = { useApifyProxy: true },
        enableAssets = false,
    } = input;

    const errorSnapshotter = new ErrorSnapshotter();
    await errorSnapshotter.initialize(Apify.events);

    const state = await Apify.getValue('STATE') || { crawled: {} };

    Apify.events.on('persistState', async () => {
        await Apify.setValue('STATE', state);
    });

    const requestQueue = await Apify.openRequestQueue();
    const { requestSources } = await prepareRequestSources({ startUrls, input, maxPages, sortBy });
    const requestList = await Apify.openRequestList('LIST', requestSources);
    const proxyConfiguration = (await Apify.createProxyConfiguration(proxyConfig)) || undefined;
    const globalContext = {
        requestQueue, startUrls, input, extendOutputFunction, sortBy, maxPages, state,
    };

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        handlePageTimeoutSecs: enableAssets ? 60 : 30,
        proxyConfiguration,
        launchContext: {
            useChrome: Apify.isAtHome(),
            launchOptions: {
                args: [
                    '--ignore-certificate-errors',
                ],
                ignoreHTTPSErrors: true,
            },
            userAgent: USER_AGENT,
        },
        useSessionPool: true,
        handlePageFunction: async (context) => {
            await errorSnapshotter.tryWithSnapshot(
                context.page,
                async () => handlePageFunctionExtended({ ...context, ...globalContext }),
            );
        },
        handleFailedRequestFunction: async ({ request }) => {
            log.info(`Request ${request.url} failed too many times`);
            await Apify.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
        preNavigationHooks: [async ({ page }) => {
            if (!enableAssets) {
                await Apify.utils.puppeteer.blockRequests(page);
            }

            const cookies = await page.cookies('https://www.booking.com');
            await page.deleteCookie(...cookies);
            await page.setViewport({
                width: 1024 + Math.floor(Math.random() * 100),
                height: 768 + Math.floor(Math.random() * 100),
            });
        }],
    });

    log.info('Starting the crawl.');
    await crawler.run();
    log.info('Crawl finished.');
});
