const Apify = require('apify');

const { USER_AGENT } = require('./consts');
const { validateInput, cleanInput, evalExtendOutputFn } = require('./input');
const { getWorkingBrowser } = require('./util.js');
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
        minScore,
        sortBy = 'bayesian_review_score',
        maxPages,
        proxyConfig = { useApifyProxy: true },
        enableAssets = false,
        testProxy,
    } = input;

    const errorSnapshotter = new ErrorSnapshotter();
    await errorSnapshotter.initialize(Apify.events);

    const state = await Apify.getValue('STATE') || { crawled: {} };

    Apify.events.on('persistState', async () => {
        await Apify.setValue('STATE', state);
    });

    const requestQueue = await Apify.openRequestQueue();

    const { startUrl, requestSources } = await prepareRequestSources({ startUrls, input, maxPages, sortBy });

    const requestList = await Apify.openRequestList('LIST', requestSources);

    const proxyConfiguration = (await Apify.createProxyConfiguration(proxyConfig)) || undefined;

    const globalContext = {
        requestQueue, startUrls, input, extendOutputFunction, sortBy, maxPages, state,
    };

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        handlePageTimeoutSecs: 120,
        proxyConfiguration,
        useSessionPool: true,
        launchPuppeteerOptions: {
            // @ts-ignore
            ignoreHTTPSErrors: true,
            useChrome: Apify.isAtHome(),
            args: [
                '--ignore-certificate-errors',
            ],
            stealth: true,
            stealthOptions: {
                addPlugins: false,
                emulateWindowFrame: false,
                emulateWebGL: false,
                emulateConsoleDebug: false,
                addLanguage: false,
                hideWebDriver: true,
                hackPermissions: false,
                mockChrome: false,
                mockChromeInIframe: false,
                mockDeviceMemory: false,
            },
            userAgent: USER_AGENT,
        },
        launchPuppeteerFunction: async (options) => {
            if (!testProxy) {
                return Apify.launchPuppeteer({
                    ...options,
                });
            }
            return getWorkingBrowser(startUrl, input, options);
        },

        handlePageFunction: async (pageContext) => {
            await errorSnapshotter.tryWithSnapshot(
                pageContext.page,
                async () => handlePageFunctionExtended({ ...pageContext, ...globalContext }),
            );
        },

        handleFailedRequestFunction: async ({ request }) => {
            log.info(`Request ${request.url} failed too many times`);
            await Apify.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },

        gotoFunction: async ({ page, request }) => {
            if (!enableAssets) {
                await Apify.utils.puppeteer.blockRequests(page);
            }

            const cookies = await page.cookies('https://www.booking.com');
            await page.deleteCookie(...cookies);
            await page.setViewport({
                width: 1024 + Math.floor(Math.random() * 100),
                height: 768 + Math.floor(Math.random() * 100),
            });

            return page.goto(request.url, { timeout: 200000 });
        },
    });

    await crawler.run();
});
