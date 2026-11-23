const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup() {
    const instances = [], timers = new Map(), statuses = [];
    let timerId = 0;
    const element = () => ({ textContent: '', value: 'ko-KR', handlers: {}, attributes: {},
        addEventListener(name, fn) { this.handlers[name] = fn; },
        setAttribute(name, value) { this.attributes[name] = value; } });
    class Recognition {
        constructor() { instances.push(this); this.starts = 0; this.stops = 0; }
        start() { this.starts++; }
        stop() { this.stops++; }
        abort() {}
    }
    const startBtn = element();
    const context = { SpeechRecognition: Recognition, startBtn, clearBtn: element(),
        inputLanguageSelect: element(), interimElement: element(), finalElement: element(),
        selectedElement: element(), responseElement: element(), window: {},
        document: { body: { classList: { add() {}, remove() {} } } },
        setRecognitionStatus: key => statuses.push(key),
        setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
        clearTimeout(id) { timers.delete(id); }, console: { error() {} },
        appendSegment() { return {}; }, translateSegment() {}, refreshSavedMarks() {}, persistExplanations() {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../main/resources/static/js/speech-recognition.js'), 'utf8'), context);
    return { instances, statuses, startBtn, context, click: () => startBtn.handlers.click(),
        tick(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay && timers.delete(id)) timer.fn(); },
        next() { const first = timers.entries().next().value; assert.ok(first); timers.delete(first[0]); first[1].fn(); } };
}
test('start event completes without throwing and reconnect returns to listening', () => {
    const app = setup(); app.click(); app.instances[0].onstart();
    assert.equal(app.statuses.at(-1), 'listening');
    app.instances[0].onend(); app.next(); app.instances[0].onstart();
    assert.equal(app.statuses.at(-1), 'listening');
});
test('missing end after stop restores start and retires the old session', async () => {
    const app = setup(); app.click(); app.instances[0].onstart();
    const stopped = app.context.window.stopPageRecognition();
    app.tick(1000); assert.equal(app.statuses.at(-1), 'start');
    app.tick(2000); await stopped;
    assert.equal(app.instances[0].onresult, null);
    app.click(); assert.equal(app.instances[1].starts, 1);
});
test('stopping while start is pending does not resume listening', () => {
    const app = setup(); app.click(); app.click(); app.instances[0].onstart();
    assert.equal(app.statuses.at(-1), 'ended');
    app.instances[0].onend(); app.tick(1000);
    assert.equal(app.statuses.at(-1), 'start');
});
test('repeated connection failures stop retrying and allow a manual retry', () => {
    const app = setup(); app.click();
    for (let i = 0; i < 5; i++) {
        app.instances[0].onstart(); app.instances[0].onerror({ error: 'network' });
        app.instances[0].onend(); app.next();
    }
    app.instances[0].onend();
    assert.equal(app.statuses.at(-1), 'recognitionError');
    assert.equal(app.startBtn.attributes['aria-pressed'], 'false');
    app.click(); assert.equal(app.instances[0].starts, 7);
});
test('permission errors stay visible after end instead of retrying', () => {
    const app = setup(); app.click(); app.instances[0].onerror({ error: 'not-allowed' });
    app.instances[0].onend(); app.tick(1000);
    assert.equal(app.statuses.at(-1), 'recognitionError');
    assert.equal(app.instances[0].starts, 1);
});

function speechResult(text, isFinal) {
    const result = [{ transcript: text }]; result.isFinal = isFinal;
    return { results: [result] };
}
test('enabled correction waits for final speech and commits corrected text before translation', () => {
    const app = setup(); const queued = [], committed = [], translated = [];
    app.context.window.isSentenceCorrectionEnabled = () => true;
    app.context.window.queueTranscriptCorrection = (text, commit) => queued.push({ text, commit });
    app.context.appendSegment = (text, language) => { committed.push({ text, language }); return text; };
    app.context.translateSegment = text => translated.push(text);
    app.click(); app.instances[0].onstart();
    app.instances[0].onresult(speechResult('a'.repeat(60), false));
    assert.equal(queued.length, 0);
    app.instances[0].onresult(speechResult('final sentence', true));
    assert.equal(queued.length, 1);
    assert.equal(committed.length, 0);
    queued[0].commit('Corrected sentence.');
    assert.deepEqual(committed, [{ text: 'Corrected sentence.', language: 'ko-KR' }]);
    assert.deepEqual(translated, ['Corrected sentence.']);
    app.instances[0].onresult(speechResult('final sentence', true));
    assert.equal(queued.length, 1);
});

test('page stop waits for pending corrections after recognition ends', async () => {
    const app = setup(); let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    app.context.window.flushTranscriptCorrections = () => pending;
    app.click(); app.instances[0].onstart();
    let stopped = false;
    const stop = app.context.window.stopPageRecognition().then(() => { stopped = true; });
    app.instances[0].onend();
    await Promise.resolve(); assert.equal(stopped, false);
    finish(); await stop; assert.equal(stopped, true);
});

test('recognition and correction scripts together send the correction API request on final speech', async () => {
    const app = setup();
    const nodes = new Map(), requests = [], committed = [];
    app.context.document.getElementById = id => {
        if (!nodes.has(id)) nodes.set(id, { addEventListener() {} });
        return nodes.get(id);
    };
    Object.assign(app.context, {
        localStorage: { getItem: () => null }, storageGeneration: 0, AbortController,
        userLanguageSelect: { addEventListener() {} }, t: key => key,
        fetch: async (url, options) => {
            requests.push({ url, options });
            return { ok: true, json: async () => ({ correctedSentence: 'He goes home.' }) };
        },
        appendSegment: text => { committed.push(text); return {}; }
    });
    app.context.finalElement.querySelectorAll = () => [];
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../main/resources/static/js/correction.js'), 'utf8'), app.context);
    app.click(); app.instances[0].onstart();
    app.instances[0].onresult(speechResult('He go home.', false));
    assert.equal(requests.length, 0);
    assert.equal(nodes.get('correction-pending').textContent, 'awaitingSpeechFinal');
    app.instances[0].onresult(speechResult('He go home.', true));
    await app.context.window.flushTranscriptCorrections();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/sentence/correct');
    assert.deepEqual(JSON.parse(requests[0].options.body), { sentence: 'He go home.', context: '' });
    assert.deepEqual(committed, ['He goes home.']);
});
