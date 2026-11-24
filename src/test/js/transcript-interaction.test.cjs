const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../../main/resources/static/js');

function node() {
    return { handlers: {}, dataset: {}, attributes: {}, textContent: '', hidden: false,
        addEventListener(name, fn) { this.handlers[name] = fn; },
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return this.attributes[name]; },
        removeAttribute(name) { delete this.attributes[name]; },
        focus() {}, contains(target) { return target === this; }, closest() { return this; } };
}

test('click edits only one block, outside click finishes, and dragging does not enter editing', () => {
    const final = node(), first = node(), second = node(), document = node();
    final.querySelectorAll = () => [first, second];
    final.contains = target => [first, second].includes(target);
    const selection = { isCollapsed: true };
    let saved = 0;
    const context = vm.createContext({ document, window: { getSelection: () => selection },
        finalElement: final, segmentTranslationElements: new WeakMap(),
        t: key => key, hideExplanation() {}, explanationRequest: 0,
        refreshSavedMarks() {}, persistExplanations() { saved++; } });
    vm.runInContext(fs.readFileSync(path.join(root, 'transcript.js'), 'utf8'), context);
    vm.runInContext('translateSegment = () => {}', context);
    final.handlers.click({ target: first });
    assert.equal(first.contentEditable, 'plaintext-only');
    assert.equal(second.contentEditable, undefined);
    first.textContent = 'Edited text';
    final.handlers.input({ target: first });
    assert.equal(first.dataset.userEdited, 'true');
    document.handlers.pointerdown({ target: second });
    assert.equal(first.contentEditable, 'false');
    assert.equal(first.textContent, 'Edited text');
    assert.ok(saved > 0);
    selection.isCollapsed = false;
    final.handlers.click({ target: second });
    assert.equal(vm.runInContext('transcriptEditing', context), false);
});

test('two offscreen lines show the latest button without scrolling; only clicking scrolls', () => {
    const nodes = new Map();
    const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
    const latest = node(); latest.textContent = 'New script';
    let bottom = 663, scrolls = 0, frame;
    latest.getBoundingClientRect = () => ({ bottom });
    latest.scrollIntoView = () => scrolls++;
    const final = get('final'); final.querySelectorAll = () => [latest];
    const summary = get('summary'); summary.hidden = true;
    const context = vm.createContext({
        document: { getElementById: get, addEventListener() {}, body: { classList: { toggle() {} } } },
        window: { innerHeight: 600, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
        finalElement: final, interimElement: get('interim'), summaryPanel: summary,
        transcriptPanel: get('transcript'), transcriptEditing: false,
        summaryTab: get('summary-tab'), clearBtn: get('clear'), copyContentButton: get('copy'),
        contentToCopy: () => 'New script', selectContentTab() {},
        getComputedStyle: () => ({ lineHeight: '32px' }),
        requestAnimationFrame: fn => { frame = fn; return 1; },
        MutationObserver: class { observe() {} }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'interface.js'), 'utf8'), context);
    frame();
    assert.equal(get('latest-script').hidden, true);
    bottom = 664; frame();
    assert.equal(get('latest-script').hidden, false);
    assert.equal(scrolls, 0);
    get('latest-script').handlers.click();
    assert.equal(scrolls, 1);
    context.transcriptPanel.hidden = true; frame();
    assert.equal(get('latest-script').hidden, true);
});
