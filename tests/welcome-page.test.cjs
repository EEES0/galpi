const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const script = name => readFileSync(path.join(__dirname, '../src/main/resources/static/js', name), 'utf8');

function setup(existing = []) {
    const records = new Map(existing.map(page => [page.id, page]));
    const requests = [];
    const node = () => ({ value: 'ko-KR', dataset: {}, addEventListener() {}, setAttribute() {}, querySelectorAll: () => [] });
    const nodes = new Map();
    const getNode = key => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); };
    const context = vm.createContext({
        document: { querySelector: getNode, getElementById: getNode, addEventListener() {} },
        userLanguageSelect: node(), supportedLanguages: new Set(['ko-KR', 'en-US']),
        localStorage: { getItem() { return null; } }, window: { addEventListener() {} },
        AbortController, setTimeout: () => 1, clearTimeout() {}, console,
        storageGeneration: 0, explanationRequest: 0,
        pendingSegmentTranslations: new Map(), pendingExplanations: new Map(), requestedExplanations: new Map(),
        fetch: async (url, options) => {
            const method = options.method || 'GET';
            const id = url.slice('/api/pages/'.length);
            requests.push({ url, method, body: options.body });
            let result;
            if (method === 'POST') {
                result = { id: 'new-' + records.size, title: '새 페이지', state: null, version: 0 };
                records.set(result.id, result);
            } else if (method === 'PUT') {
                const body = JSON.parse(options.body);
                result = { id, ...body, version: body.version + 1 };
                records.set(id, result);
            } else if (method === 'DELETE') {
                records.delete(id);
            } else result = url === '/api/pages' ? [...records.values()].map(({ id, title }) => ({ id, title })) : records.get(id);
            return { ok: true, status: method === 'DELETE' ? 204 : 200, json: async () => result };
        },
        t: key => key
    });
    vm.runInContext(script('welcome-page.js') + '\n' + script('pages.js'), context);
    vm.runInContext(`
        lockPageEditor = () => {};
        setPageSavedState = () => {};
        renderPageList = () => {};
        resetPageEditor = () => {};
        reportPageError = error => { throw error; };
        displayPage = page => { currentPage = page; pagesReady = true; };
    `, context);
    return { context, records, requests, run: code => vm.runInContext(code, context) };
}

test('empty visitor receives persisted welcome content in the existing state format', async () => {
    const app = setup();
    await app.run('initializePages()');
    const page = [...app.records.values()][0];
    assert.equal(page.title, '갈피에 오신 것을 환영합니다!');
    assert.deepEqual(Object.keys(page.state).sort(), ['explanations', 'inputLanguage', 'segments', 'translations', 'userLanguage']);
    assert.equal(page.state.segments.filter(segment => /^\d\./.test(segment.text)).length, 9);
    assert.ok(page.state.segments.every(segment => Object.keys(segment).sort().join() === 'inputLanguage,text,timestamp'));
    assert.ok(!page.state.segments.some(segment => segment.text.includes('다른 인증 방식과의 차이는')));
    assert.match(page.state.segments.at(-1).text, /보관·삭제 방식/);
    await app.run('initializePages()');
    assert.equal(app.requests.filter(request => request.method === 'POST').length, 1);
});

test('existing pages are loaded without adding or overwriting a welcome page', async () => {
    const app = setup([{ id: 'existing', title: '내 기록', state: {}, version: 3 }]);
    await app.run('initializePages()');
    assert.equal(app.records.size, 1);
    assert.ok(app.requests.every(request => request.method === 'GET'));
});

test('welcome can be deleted normally and is replaced with an empty page', async () => {
    const app = setup();
    await app.run('initializePages()');
    await app.run('deletePage(currentPage.id)');
    assert.equal(app.requests.filter(request => request.method === 'DELETE').length, 1);
    assert.equal(app.records.size, 1);
    assert.equal([...app.records.values()][0].state, null);
    assert.equal(app.requests.filter(request => request.method === 'PUT').length, 1);
});
