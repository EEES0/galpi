const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(handler) {
    function node(className = '', text = '') {
        const result = { className, dataset: {}, hidden: false, children: [], attrs: {}, nodeType: 1,
            addEventListener() {}, focus() {},
            setAttribute(key, value) { this.attrs[key] = value; },
            appendChild(child) { child.parentElement = this; this.children.push(child); },
            replaceChildren() { this.children = []; this.value = ''; },
            contains(child) { return child === this || this.children.some(n => n.contains(child)); },
            querySelectorAll(selector) {
                return this.children.flatMap(child => [
                    ...(child.classList.contains(selector.slice(1)) ? [child] : []), ...child.querySelectorAll(selector)
                ]);
            },
            closest(selector) {
                if (selector.split(',').some(s => this.classList.contains(s.trim().slice(1)))) return this;
                return this.parentElement?.closest(selector) || null;
            }
        };
        result.classList = { contains: name => result.className.split(' ').includes(name) };
        Object.defineProperty(result, 'textContent', {
            get() { return this.children.length ? this.children.map(child => child.textContent).join('') : this.value; },
            set(value) { this.children = []; this.value = value; }
        });
        result.textContent = text;
        return result;
    }
    const elements = new Map(['transcript-tab', 'summary-tab', 'transcript', 'page-summary', 'copy-content', 'copy-feedback'].map(id => [id, node()]));
    elements.get('page-summary').hidden = true;
    const finalElement = node();
    const original = node('segment', 'Gravity attracts objects.');
    original.dataset.inputLanguage = 'en-US';
    finalElement.appendChild(original);
    elements.get('transcript').appendChild(finalElement);
    const calls = [];
    const timers = new Map();
    const frames = [];
    let nextTimer = 0;
    let observeChanges;
    let saves = 0;
    const context = vm.createContext({
        console: { ...console, error() {} }, AbortController, Node: { TEXT_NODE: 3 },
        setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); },
        requestAnimationFrame(callback) { frames.push(callback); },
        MutationObserver: class { constructor(callback) { observeChanges = callback; } observe() {} },
        currentPage: { id: 'one' }, pagesReady: true, pageNavigationBusy: false,
        finalElement, summaryElement: elements.get('page-summary'),
        userLanguageSelect: { value: 'ko-KR', addEventListener() {} }, clearBtn: { addEventListener() {} },
        selectedRange: null, activeExplanationKey: null, hideExplanation() {}, refreshSavedMarks() {},
        t: key => key, window: { getSelection: () => ({ removeAllRanges() {} }) },
        document: { getElementById: id => elements.get(id), createElement: () => node(),
            createRange: () => ({ selectNodeContents(element) { this.element = element; },
                setEnd(element, offset) { this.offset = offset; },
                toString() { return this.element.textContent.slice(0, this.offset); } }) },
        flushPageSave: async () => { saves++; },
        pageRequest: async (url, options = {}) => {
            calls.push({ url, options, saves });
            return handler ? handler(url, options) : {
                pageId: context.currentPage.id, targetLanguage: context.userLanguageSelect.value,
                summary: 'Gravity pulls objects.\n\nMass matters.'
            };
        }
    });
    for (const name of ['selection-context.js', 'content-tabs.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../../main/resources/static/js', name), 'utf8'), context);
    }
    return { context, elements, finalElement, original, calls, node,
        runFrames: () => frames.splice(0).forEach(callback => callback()),
        mutate: () => observeChanges(),
        runTimers: async () => {
            const callbacks = [...timers.values()];
            timers.clear();
            await Promise.all(callbacks.map(callback => callback()));
        },
        run: code => vm.runInContext(code, context),
        load: async () => {
            elements.get('page-summary').hidden = false;
            await vm.runInContext('loadPageSummary()', context);
        } };
}

test('save precedes DB lookup and a successful lookup is reused from memory', async () => {
    const app = setup();
    await app.load();
    assert.equal(app.calls.length, 1);
    assert.equal(app.calls[0].saves, 1);
    assert.match(app.calls[0].url, /summary\?targetLanguage=ko-KR$/);
    assert.equal(app.elements.get('page-summary').children.length, 2);
    await app.load();
    assert.equal(app.calls.length, 1);
    app.run('selectContentTab(transcriptTab)');
    assert.equal(app.elements.get('transcript').hidden, false);
    assert.equal(app.elements.get('page-summary').hidden, true);
    assert.equal(app.original.textContent, 'Gravity attracts objects.');
});

test('returning to the transcript refreshes saved highlights in the next frame without refetching', async () => {
    const app = setup();
    await app.load();
    let refreshes = 0;
    app.context.refreshSavedMarks = () => {
        assert.equal(app.elements.get('transcript').hidden, false);
        refreshes++;
    };
    app.run('selectContentTab(transcriptTab)');
    assert.equal(refreshes, 0, 'wait until the transcript is revealed for rendering');
    app.runFrames();
    assert.equal(refreshes, 1);
    assert.equal(app.calls.length, 1, 'reuse the current page state');

    app.run('selectContentTab(transcriptTab); selectContentTab(summaryTab)');
    app.runFrames();
    assert.equal(refreshes, 1, 'ignore a frame after switching back to the summary');
});

test('a queued highlight refresh does not run against another page', async () => {
    const app = setup();
    await app.load();
    let refreshes = 0;
    app.context.refreshSavedMarks = () => { refreshes++; };
    app.run('selectContentTab(transcriptTab); currentPage = { id: "two" }');
    app.runFrames();
    assert.equal(refreshes, 0);
});

test('missing DB summary triggers generation; changed transcript bypasses memory cache', async () => {
    const app = setup((url, options) => {
        if (!options.method) throw Object.assign(new Error('not found'), { status: 404 });
        return { pageId: 'one', targetLanguage: 'ko-KR', summary: 'Generated summary' };
    });
    await app.load();
    assert.deepEqual(app.calls.map(call => call.options.method || 'GET'), ['GET', 'POST']);
    assert.deepEqual(JSON.parse(app.calls[1].options.body), { targetLanguage: 'ko-KR', regenerate: false });
    app.original.textContent = 'Energy is conserved.';
    await app.load();
    assert.equal(app.calls.length, 4);
});

test('403 never triggers generation and late results cannot overwrite another page', async () => {
    const denied = setup(() => { throw Object.assign(new Error('denied'), { status: 403 }); });
    await denied.load();
    assert.equal(denied.calls.length, 1);
    assert.equal(denied.elements.get('page-summary').textContent, 'summaryError');
    let resolve;
    const app = setup(() => new Promise(done => { resolve = done; }));
    const pending = app.load();
    await new Promise(done => setImmediate(done));
    app.run('currentPage = { id: "two" }; window.resetPageSummary()');
    resolve({ pageId: 'one', targetLanguage: 'ko-KR', summary: 'Old summary' });
    await pending;
    assert.equal(app.elements.get('page-summary').textContent, '');
    assert.equal(app.elements.get('page-summary').hidden, true);
});

test('summary drag uses its own context, language and cache key, including multi-paragraph selections', async () => {
    const app = setup();
    await app.load();
    const [first, last] = app.elements.get('page-summary').children;
    app.context.range = { startContainer: first, endContainer: last, startOffset: 0, endOffset: 4 };
    assert.equal(app.run('getSegmentation(range).summary'), true);
    assert.equal(app.run('getSegmentation(range).languages[0]'), 'ko-KR');
    assert.equal(app.run('segmentationText(getSegmentation(range))'), 'Gravity pulls objects. Mass');
    assert.equal(app.run('findContext(range)'), 'Gravity pulls objects. Mass matters.');
    assert.match(app.run('termKey("Gravity", "context", getSegmentation(range))'), /"summary":true/);
    app.context.range.endContainer = app.original;
    assert.equal(app.run('getSegmentation(range)'), null, 'cross-panel selections must be rejected');
});

test('script changes automatically refresh an existing summary, even while viewing the script', async () => {
    const app = setup();
    await app.load();
    app.run('selectContentTab(transcriptTab)');
    app.original.textContent = 'New transcript';
    app.mutate();
    app.original.textContent = 'Latest transcript';
    app.mutate();
    await app.runTimers();
    assert.equal(app.calls.length, 2, 'multiple changes are debounced into one refresh');
    assert.equal(app.elements.get('transcript').hidden, false);
    await app.load();
    assert.equal(app.calls.length, 2, 'the refreshed summary is already cached');
    app.mutate();
    await app.runTimers();
    assert.equal(app.calls.length, 2, 'translation-only DOM changes do not regenerate a summary');
});

test('auto refresh waits for an old request, then generates for the latest transcript', async () => {
    let resolve;
    const app = setup(() => new Promise(done => { resolve = done; }));
    const oldRequest = app.load();
    await new Promise(done => setImmediate(done));
    app.run('selectContentTab(transcriptTab)');
    app.original.textContent = 'Changed while generating';
    app.mutate();
    await app.runTimers();
    assert.equal(app.calls.length, 1, 'generation requests must not overlap');
    resolve({ pageId: 'one', targetLanguage: 'ko-KR', summary: 'Outdated' });
    await oldRequest;
    const refreshed = app.runTimers();
    await new Promise(done => setImmediate(done));
    assert.equal(app.calls.length, 2);
    resolve({ pageId: 'one', targetLanguage: 'ko-KR', summary: 'Latest summary' });
    await refreshed;
    await app.load();
    assert.equal(app.elements.get('page-summary').textContent, 'Latest summary');
});

test('viewing a summary freezes its content until returning to the script or reopening the summary', async () => {
    const app = setup();
    await app.load();
    const originalSummary = app.elements.get('page-summary').textContent;
    const originalNode = app.elements.get('page-summary').children[0];
    app.original.textContent = 'Changed while reading';
    app.mutate();
    await app.runTimers();
    app.run('selectContentTab(summaryTab)');
    assert.equal(app.calls.length, 1);
    assert.equal(app.elements.get('page-summary').textContent, originalSummary);
    assert.equal(app.elements.get('page-summary').children[0], originalNode, 'keep selection DOM intact');
    app.run('selectContentTab(transcriptTab)');
    await app.runTimers();
    assert.equal(app.calls.length, 2);
    await app.load();
    assert.equal(app.calls.length, 2, 'reopening uses the refreshed cache');
});

test('no automatic generation before first summary use or after leaving the page', async () => {
    const app = setup();
    app.original.textContent = 'Not yet summarized';
    app.mutate();
    await app.runTimers();
    assert.equal(app.calls.length, 0);
    await app.load();
    app.original.textContent = 'Pending refresh';
    app.mutate();
    app.run('window.resetPageSummary()');
    await app.runTimers();
    assert.equal(app.calls.length, 1);
});
