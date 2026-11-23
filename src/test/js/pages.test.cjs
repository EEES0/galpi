const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(preferences = new Map()) {
    const elements = new Map();
    const element = key => {
        if (!elements.has(key)) elements.set(key, {
            value: '', textContent: '', hidden: false, children: [], dataset: {},
            handlers: {},
            addEventListener(name, handler) { this.handlers[name] = handler; }, setAttribute() {},
            querySelectorAll() { return this.children; },
            replaceChildren() { this.children = []; },
            append(child) { this.children.push(child); }
        });
        return elements.get(key);
    };
    const database = new Map();
    const requests = [];
    let nextPageId = 1;
    let state = { segments: [], translations: [], explanations: [] };
    const context = vm.createContext({
        console: { ...console, error() {} }, setTimeout, clearTimeout, TextEncoder, AbortController,
        document: { querySelector: element, getElementById: element,
            addEventListener() {}, createElement: () => element(Symbol()) },
        window: { addEventListener() {}, getSelection: () => ({ removeAllRanges() {} }) },
        explanation: element('explanation'), finalElement: element('final'), interimElement: element('interim'),
        selectedElement: element('selected'), responseElement: element('response'),
        inputLanguageSelect: element('input'), userLanguageSelect: element('user'),
        supportedLanguages: new Set(['ko-KR', 'en-US', 'ja-JP']),
        localStorage: { getItem: key => preferences.get(key), setItem: (key, value) => preferences.set(key, value) },
        storageGeneration: 0, explanationRequest: 0, selectionTimer: null,
        pendingSegmentTranslations: new Map(), pendingExplanations: new Map(),
        requestedExplanations: new Map(), savedExplanations: new Map(), translatedSegments: new Map(),
        t: key => key, setTranscriptEditing() {},
        hideExplanation() {}, applyTranslations() {}, refreshSavedMarks() {}, translateCompletedSegments() {},
        capturePageState: () => structuredClone(state),
        restoreExplanations: saved => {
            state = saved || { segments: [], translations: [], explanations: [] };
            if (saved?.inputLanguage) element('input').value = saved.inputLanguage;
            if (saved?.userLanguage) element('user').value = saved.userLanguage;
        },
        fetch: async (url, options) => {
            const method = options.method || 'GET';
            requests.push({ method, url, keepalive: options.keepalive });
            const id = url.split('/')[3];
            let result, status = 200;
            if (method === 'POST') {
                result = { id: String(nextPageId++), title: '새 페이지', state: null, version: 0 };
                database.set(result.id, structuredClone(result));
            } else if (method === 'PUT') {
                const body = JSON.parse(options.body);
                const old = database.get(id);
                if (body.version !== old.version) status = 409;
                else {
                    result = { id, ...body, version: old.version + 1 };
                    database.set(id, structuredClone(result));
                }
            } else if (method === 'DELETE') {
                if (context.failDelete) status = 500;
                else { database.delete(id); status = 204; }
            } else result = id ? database.get(id) : [...database.values()];
            return { ok: status < 300, status, json: async () => structuredClone(result) };
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../main/resources/static/js/pages.js'), 'utf8'), context);
    return { context, database, requests, element,
        run: code => vm.runInContext(code, context), setState: value => { state = value; }, getState: () => state };
}

test('first visit creates a page; edits save before switching and reload restores server state', async () => {
    const app = setup();
    await app.run('initializePages()');
    assert.equal(app.database.size, 1);
    app.element('.page-title').value = 'Lesson';
    const state = { segments: [{ text: 'Hello', inputLanguage: 'en-US' }],
        translations: [['key', '안녕']], explanations: [['term', { context: 'Hello' }]] };
    app.setState(state);
    app.run('schedulePageSave()');
    await app.run('navigatePage()');
    assert.equal(app.database.size, 2);
    assert.deepEqual(app.database.get('1').state, state);
    assert.equal(app.database.get('1').title, 'Lesson');
    await app.run('navigatePage("1")');
    assert.deepEqual(app.getState(), state);
    assert.equal(app.element('.page-title').value, 'Lesson');
    await app.run('initializePages()');
    assert.equal(app.database.size, 2, 'return visit must not create another page');
});

test('initial load failure or timeout offers retry and a successful retry unlocks the editor', async () => {
    for (const timeout of [false, true]) {
        const app = setup();
        const originalFetch = app.context.fetch;
        if (timeout) {
            app.context.setTimeout = callback => { queueMicrotask(callback); return 0; };
            app.context.fetch = async (url, options) => {
                assert.equal(options.signal.aborted, false);
                return new Promise((resolve, reject) => {
                    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
                });
            };
        } else {
            app.context.fetch = async () => { throw new Error('offline'); };
        }
        await app.run('initializePages()');
        assert.equal(app.element('page-load-status').hidden, false);
        assert.equal(app.element('page-load-retry').hidden, false);
        assert.equal(app.element('page-load-message').dataset.i18n, timeout ? 'pageLoadTimeout' : 'pageLoadError');
        assert.equal(app.element('main').inert, true);
        app.context.fetch = originalFetch;
        app.context.setTimeout = setTimeout;
        await app.run('initializePages()');
        assert.equal(app.element('page-load-status').hidden, true);
        assert.equal(app.element('main').inert, false);
        assert.equal(app.database.size, 1);
    }
});

test('user language follows the preference across old pages, new pages, deletion and reload', async () => {
    const preferences = new Map();
    const app = setup(preferences);
    await app.run('initializePages()');
    app.database.get('1').state = { userLanguage: 'ko-KR', inputLanguage: 'ja-JP', segments: [], translations: [], explanations: [] };
    app.element('user').value = 'en-US';
    app.element('user').handlers.change();
    await app.run('navigatePage()');
    assert.equal(app.element('user').value, 'en-US');
    await app.run('navigatePage("1")');
    assert.equal(app.element('user').value, 'en-US');
    assert.equal(app.element('input').value, 'ja-JP', 'input language still follows the page');
    await app.run('deletePage("1")');
    assert.equal(app.element('user').value, 'en-US');
    const reload = setup(preferences);
    await reload.run('initializePages()');
    assert.equal(reload.element('user').value, 'en-US');
});

test('conflicting changes are preserved in editor and prevent navigation', async () => {
    const app = setup();
    await app.run('initializePages()');
    app.database.get('1').version++;
    app.element('.page-title').value = 'Unsaved title';
    app.run('schedulePageSave()');
    await app.run('navigatePage()');
    assert.equal(app.database.size, 1);
    assert.equal(app.element('.page-title').value, 'Unsaved title');
    assert.equal(app.run('pageSaveConflict'), true);
});

test('large pages save without exceeding the browser keepalive body limit', async () => {
    const app = setup();
    await app.run('initializePages()');
    app.context.document.visibilityState = 'hidden';
    app.setState({ segments: [{ text: '가'.repeat(30000) }], translations: [], explanations: [] });
    app.run('schedulePageSave()');
    await app.run('flushPageSave()');
    assert.equal(app.requests.find(request => request.method === 'PUT').keepalive, false);
});

test('deleting another page keeps the current editor and its unsaved changes', async () => {
    const app = setup();
    await app.run('initializePages()');
    await app.run('navigatePage()');
    app.element('.page-title').value = 'Keep editing';
    app.run('schedulePageSave()');
    await app.run('deletePage("1")');
    assert.equal(app.database.has('1'), false);
    assert.equal(app.run('currentPage.id'), '2');
    assert.equal(app.element('.page-title').value, 'Keep editing');
    await app.run('flushPageSave()');
    assert.equal(app.database.get('2').title, 'Keep editing');
});

test('deleting the current page loads a remaining page; deleting the last creates a blank page', async () => {
    const app = setup();
    await app.run('initializePages()');
    await app.run('navigatePage()');
    app.run('schedulePageSave()');
    await app.run('deletePage("2")');
    assert.equal(app.database.has('2'), false);
    assert.equal(app.run('currentPage.id'), '1');
    await app.run('deletePage("1")');
    assert.equal(app.database.has('1'), false);
    assert.equal(app.database.size, 1);
    assert.equal(app.run('currentPage.id'), '3');
    assert.equal(app.run('pagesReady'), true);
});

test('failed deletion leaves the page and unsaved editor contents intact', async () => {
    const app = setup();
    await app.run('initializePages()');
    app.element('.page-title').value = 'Keep me';
    app.run('schedulePageSave()');
    app.context.failDelete = true;
    await app.run('deletePage("1")');
    assert.equal(app.database.has('1'), true);
    assert.equal(app.element('.page-title').value, 'Keep me');
    assert.equal(app.run('pagesReady'), true);
    await app.run('flushPageSave()');
});

test('stored paragraphs, translation cache, selection offsets and languages restore together', () => {
    const segments = [];
    const savedExplanations = new Map();
    const translatedSegments = new Map();
    const inputLanguageSelect = { value: 'ko-KR' };
    const userLanguageSelect = { value: 'en-US' };
    const context = vm.createContext({ console, inputLanguageSelect, userLanguageSelect,
        savedExplanations, translatedSegments, supportedLanguages: new Set(['ko-KR', 'en-US']),
        appendSegment: (...args) => segments.push(args),
        termKey: (...args) => JSON.stringify(args), schedulePageSave() {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../main/resources/static/js/storage.js'), 'utf8'), context);
    const segmentation = { segments: ['Hello'], languages: ['en-US'], startOffset: 0, endOffset: 5 };
    const explanation = { term: 'Hello', context: 'Hello', segmentation,
        inputLanguage: 'en-US', userLanguage: 'ko-KR', data: { description: '인사', translation: '안녕' } };
    const key = JSON.stringify(['Hello', 'Hello', segmentation, 'en-US', 'ko-KR']);
    context.saved = { inputLanguage: 'en-US', userLanguage: 'ko-KR',
        segments: [{ text: 'Hello', inputLanguage: 'en-US', timestamp: '2026-11-17T00:00:00Z' }],
        translations: [[JSON.stringify(['en-US', 'ko-KR', 'Hello']), '안녕']], explanations: [[key, explanation]] };
    vm.runInContext('restoreExplanations(saved)', context);
    assert.equal(inputLanguageSelect.value, 'en-US');
    assert.equal(userLanguageSelect.value, 'ko-KR');
    assert.deepEqual(segments, [['Hello', 'en-US', '2026-11-17T00:00:00Z']]);
    assert.equal(translatedSegments.size, 1);
    assert.equal(savedExplanations.get(key).segmentation.endOffset, 5);
});
