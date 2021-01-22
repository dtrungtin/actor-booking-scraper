const Apify = require('apify');
const Puppeteer = require('puppeteer'); // eslint-disable-line

/**
 * Utility class that allows you to wrap your functions
 * with a try/catch that saves a screenshot on the first occurence
 * of that error
 */
class ErrorSnapshotter {
    /**
     *
     * @param {object} [options]
     * @param {number} [options.maxErrorCharacters] Override default max error chars for all errors
     */
    constructor(options) {
        const {
            maxErrorCharacters = 80,
        } = (options || {});
        this.maxErrorCharacters = maxErrorCharacters;
        /** @type {{[key: string]: number}}  */
        this.errorState = {};
        this.BASE_MESSAGE = 'Operation failed';
        this.SNAPSHOT_PREFIX = 'ERROR-SNAPSHOT-';
    }

    /**
     * Loads from state and initializes events
     * @param {any} events
     */
    async initialize(events) {
        this.errorState = /** @type {{[key: string]: number}} */ (await Apify.getValue('ERROR-SNAPSHOTTER-STATE')) || {};
        events.on('persistState', this.persistState.bind(this));
    }

    async persistState() {
        await Apify.setValue('ERROR-SNAPSHOTTER-STATE', this.errorState);
    }

    /**
     * Provide a page or HTML used to snapshot and a closure to be called
     * Optionally, you can name the action for nicer logging, otherwise name of the error is used
     * These functions can be nested, in that case only one snapshot is produced (for the bottom error)
     * @param {Puppeteer.Page | string} pageOrHtml Puppeteer page or HTML
     * @param {() => Puppeteer.} fn Function to execute
     * @param {{
     *      name?: string,
     *      returnError?: boolean,
     *      maxErrorCharacters?: number,
     *  }} [options] name - Name the action. returnError - Return error instead of throwing. maxErrorCharacters - Max error chars saved
     * @returns {Promise<any>} Returns the return value of the provided function (awaits it) or an error (if configured)
     */
    async tryWithSnapshot(pageOrHtml, fn, options) {
        if (typeof pageOrHtml !== 'string' && typeof pageOrHtml !== 'object') {
            throw new Error('Try with snapshot: Wrong input! pageOrHtml must be Puppeteer page or HTML');
        }
        const { name, returnError = false, maxErrorCharacters } = (options || {});
        try {
            return await fn();
        } catch (e) {
            let err = e;
            // We don't want the Error: text, also we have to count with Error instances and string errors
            const errMessage = err.message || err;
            // If error starts with BASE_MESSAGE, it means it was another nested tryWithScreenshot
            // In that case we just re-throw and skip all state updates and screenshots
            if (errMessage.startsWith(this.BASE_MESSAGE)) {
                throw err;
            }
            // Normalize error name
            const errorKey = (name ? `${name}-${errMessage}` : errMessage)
                .slice(0, maxErrorCharacters || this.maxErrorCharacters)
                .replace(/[^a-zA-Z0-9-_]/g, '-');

            if (!this.errorState[errorKey]) {
                this.errorState[errorKey] = 0;
            }
            this.errorState[errorKey]++;

            // We check the errorState because we save the screenshots only the first time for each error
            if (this.errorState[errorKey] === 1) {
                await this.saveSnapshot(pageOrHtml, errorKey);
            }
            const newMessage = `${this.BASE_MESSAGE}${name ? `: ${name}` : ''}. Error detail: ${errMessage}`;
            if (typeof err === 'string') {
                err = newMessage;
            } else {
                err.message = newMessage;
            }

            if (returnError) {
                return err;
            }
            throw err;
        }
    }

    /**
     * Works for both HTML and Puppeteer Page
     * @param {Puppeteer.Page | string} pageOrHtml
     * @param {string} errorKey
     */
    async saveSnapshot(pageOrHtml, errorKey) {
        if (typeof pageOrHtml === 'string') {
            // @ts-ignore wrong type for setValue in the SDK
            await Apify.setValue(`${this.SNAPSHOT_PREFIX}${errorKey}`, pageOrHtml, { contentType: 'text/html' });
        } else {
            await Apify.utils.puppeteer.saveSnapshot(pageOrHtml, { key: `${this.SNAPSHOT_PREFIX}${errorKey}` });
        }
    }
}

module.exports = ErrorSnapshotter;
