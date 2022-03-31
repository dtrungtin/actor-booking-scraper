const Apify = require('apify');

const { LABELS } = require('./consts');

const { handleDetailPage } = require('./routes/detail-page');
const { handleReviewPage } = require('./routes/review-page');
const { handleListPage } = require('./routes/list-page');

const { log } = Apify.utils;

module.exports = async (context, globalContext) => {
    const {
        request: {
            url,
            userData: {
                label,
            },
        },
    } = context;

    log.info(`Opened url (${label})`, { url });

    if (label === LABELS.DETAIL) {
        await handleDetailPage(context, globalContext);
    } else if (label === LABELS.REVIEW) {
        await handleReviewPage(context, globalContext);
    } else if (label === LABELS.START || label === LABELS.PAGE) {
        await handleListPage(context, globalContext);
    }
};
