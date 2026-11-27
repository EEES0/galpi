const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../src/main/resources/static/js/speech-recognition.js'), 'utf8');

function setup() {
    const elements = {};
    function element(name) {
        return elements[name] = {
            textContent: '', value: 'ko-KR', dataset: {}, handlers: {},
            setAttribute() {}, addEventListener(type, callback) { this.handlers[type] = callback; }
        };
    }
    const saved = [];
    const timers = new Map();
    let timerId = 0;
    let engine;
    class Recognition {
        constructor() { engine = this; }
        start() {}
        stop() {}
        abort() {}
    }
    const context = {
        SpeechRecognition: Recognition, console,
        setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        document: { body: { classList: { add() {}, remove() {} } } },
        window: { isSentenceCorrectionEnabled: () => false },
        setRecognitionStatus() {}, refreshSavedMarks() {}, persistExplanations() {}, translateSegment() {},
        appendSegment(text, language) {
            saved.push({ text, language });
            return { dataset: {}, contentEditable: 'false' };
        }
    };
    for (const name of ['startBtn', 'inputLanguageSelect', 'interimElement', 'clearBtn', 'finalElement', 'selectedElement', 'responseElement']) {
        context[name] = element(name);
    }
    vm.runInNewContext(source, context);
    elements.startBtn.handlers.click();
    engine.onstart();
    return {
        elements, saved, engine, timers,
        emit(...entries) {
            engine.onresult({ results: entries.map(([text, final]) => Object.assign([{ transcript: text }], { isFinal: final })) });
        }
    };
}

test('long interim text stays provisional; rewritten final is saved in full once', () => {
    const app = setup();
    const draft = '잘못 인식한 문장 '.repeat(15);
    app.emit([draft, false]);
    assert.equal(app.elements.interimElement.textContent, draft);
    assert.equal(app.saved.length, 0);
    app.emit(['처음부터 다시 인식한 최종 문장입니다.', true]);
    app.emit(['처음부터 다시 인식한 최종 문장입니다.', true]);
    app.engine.onend();
    assert.deepEqual(app.saved.map(x => x.text), ['처음부터 다시 인식한 최종 문장입니다.']);
});

test('shrinking or removed interim hypotheses are not appended to the transcript', () => {
    const app = setup();
    app.emit(['오인식 '.repeat(30), false]);
    app.emit(['짧게 수정', false]);
    assert.equal(app.elements.interimElement.textContent, '짧게 수정');
    app.emit();
    app.engine.onend();
    assert.equal(app.saved.length, 0);
});

test('clear discards the whole in-flight result, including revised final and stop flush', () => {
    const app = setup();
    app.emit(['지울 내용', false]);
    app.elements.clearBtn.handlers.click();
    app.emit(['지울 내용이 더 길게 수정되었습니다.', true], ['새로운 발언', false]);
    app.engine.onend();
    assert.deepEqual(app.saved.map(x => x.text), ['새로운 발언']);
});

test('end retains latest unfinished speech once without duplicating finalized results', () => {
    const app = setup();
    app.emit(['확정 문장', true], ['미확정 문장', false]);
    app.emit(['확정 문장', true], ['최신 미확정 문장', false]);
    app.engine.onend();
    app.engine.onend();
    assert.deepEqual(app.saved.map(x => x.text), ['확정 문장', '최신 미확정 문장']);
});

test('identical separate utterances are retained rather than heuristically deduplicated', () => {
    const app = setup();
    app.emit(['네', true], ['네', true]);
    assert.deepEqual(app.saved.map(x => x.text), ['네', '네']);
});

test('language change keeps pending speech in its original recognition language', () => {
    const app = setup();
    app.emit(['한국어 발언', false]);
    app.elements.inputLanguageSelect.value = 'en-US';
    app.elements.inputLanguageSelect.handlers.change();
    app.engine.onend();
    assert.equal(app.saved[0].language, 'ko-KR');
});

test('existing waiting and correction labels exist for all supported interface languages', () => {
    const i18n = readFileSync(path.join(__dirname, '../src/main/resources/static/js/i18n.js'), 'utf8');
    const context = vm.createContext({});
    vm.runInContext(i18n, context);
    const labels = vm.runInContext('Object.values(translations).flatMap(labels => [labels.awaitingSpeechFinal, labels.correctingSentence])', context);
    assert.equal(labels.length, 16);
    assert.ok(labels.every(label => typeof label === 'string' && label.length > 0 && !label.includes('\uFFFD')));
});
