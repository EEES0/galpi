const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup(preference = null) {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) elements.set(id, { handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; } });
        return elements.get(id);
    }
    const requests = [], segments = [], saved = [];
    const context = { document: { getElementById: element }, window: {}, storageGeneration: 0,
        localStorage: { getItem: () => preference, setItem: (key, value) => saved.push([key, value]) },
        clearBtn: element('clear'), userLanguageSelect: element('language'),
        finalElement: { querySelectorAll: () => segments.map(textContent => ({ textContent })) },
        t: key => key, AbortController, setTimeout, clearTimeout, console: { error() {} },
        fetch(url, options) { return new Promise((resolve, reject) => {
            requests.push({ url, options, resolve, reject });
            options.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }); } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../main/resources/static/js/correction.js'), 'utf8'), context);
    return { context, elements, requests, segments, saved, api: context.window,
        settle(text) { requests.at(-1).resolve({ ok: true, json: async () => ({ correctedSentence: text }) }); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('corrections commit in order using preceding corrected context', async () => {
    const app = setup();
    app.api.queueTranscriptCorrection('first', text => app.segments.push(text));
    app.api.queueTranscriptCorrection('second', text => app.segments.push(text));
    await tick();
    assert.equal(app.requests.length, 1);
    assert.deepEqual(app.segments, []);
    app.settle('First.'); await tick();
    assert.equal(JSON.parse(app.requests[1].options.body).context, 'First.');
    app.settle('Second.'); await app.api.flushTranscriptCorrections();
    assert.deepEqual(app.segments, ['First.', 'Second.']);
    assert.equal(app.api.hasPendingTranscriptCorrections(), false);
});

test('provider failure and empty responses preserve original speech', async () => {
    const app = setup();
    app.api.queueTranscriptCorrection('original', text => app.segments.push(text));
    await tick(); app.requests[0].reject(new Error('offline'));
    await app.api.flushTranscriptCorrections();
    app.api.queueTranscriptCorrection('unchanged', text => app.segments.push(text));
    await tick(); app.settle('  '); await app.api.flushTranscriptCorrections();
    assert.deepEqual(app.segments, ['original', 'unchanged']);
});

test('disabled setting persists and commits without network requests', () => {
    const app = setup('false');
    app.api.queueTranscriptCorrection('original', text => app.segments.push(text));
    assert.deepEqual(app.segments, ['original']);
    assert.equal(app.requests.length, 0);
    const toggle = app.elements.get('sentence-correction');
    toggle.checked = true; toggle.handlers.change();
    assert.equal(app.api.isSentenceCorrectionEnabled(), true);
    assert.deepEqual(app.saved, [['galpi_sentence_correction', 'true']]);
});

test('reset discards pending and queued speech; late responses cannot restore it', async () => {
    const app = setup();
    app.api.queueTranscriptCorrection('old', text => app.segments.push(text));
    app.api.queueTranscriptCorrection('old queued', text => app.segments.push(text));
    await tick(); app.context.clearBtn.handlers.click();
    app.api.queueTranscriptCorrection('new', text => app.segments.push(text));
    await tick(); app.settle('New.'); await app.api.flushTranscriptCorrections();
    assert.deepEqual(app.segments, ['New.']);
    assert.equal(app.requests.length, 2);
});

test('page generation change discards a late correction', async () => {
    const app = setup();
    app.api.queueTranscriptCorrection('old', text => app.segments.push(text));
    await tick(); app.context.storageGeneration++;
    app.settle('Old.'); await app.api.flushTranscriptCorrections();
    assert.deepEqual(app.segments, []);
});
