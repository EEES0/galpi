const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../../main/resources/static');

test('all eight languages translate every label used by the settings menu', () => {
    const context = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8')
        + '\nglobalThis.dictionary = translations;', context);
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const settings = html.slice(html.indexOf('<details class="settings-menu">'), html.indexOf('</details>'));
    const keys = [...settings.matchAll(/data-i18n(?:-aria|-title)?="([^"]+)"/g)].map(match => match[1]);
    keys.push('correctingSentence', 'awaitingSpeechFinal');
    assert.equal(Object.keys(context.dictionary).length, 8);
    for (const [language, labels] of Object.entries(context.dictionary)) {
        for (const key of keys) {
            assert.equal(typeof labels[key], 'string', language + ': ' + key);
            assert.ok(labels[key].trim() && labels[key] !== key && !labels[key].includes('??'), language + ': ' + key);
        }
    }
    assert.equal((settings.match(/role="switch"/g) || []).length, 2);
    assert.ok(!settings.includes('theme-select'));
});

test('light mode switch follows the system and persists explicit light/dark choices', () => {
    const handlers = {}, systemHandlers = {}, saved = [];
    const toggle = { addEventListener(name, fn) { handlers[name] = fn; } };
    const document = { documentElement: { dataset: {} }, getElementById: () => toggle,
        addEventListener(name, fn) { handlers[name] = fn; } };
    const context = { document, localStorage: { getItem: () => null, setItem: (key, value) => saved.push([key, value]) },
        window: { matchMedia: () => ({ matches: true, addEventListener(name, fn) { systemHandlers[name] = fn; } }) } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js/theme.js'), 'utf8'), context);
    handlers.DOMContentLoaded();
    assert.equal(document.documentElement.dataset.theme, 'dark');
    assert.equal(toggle.checked, false);
    systemHandlers.change({ matches: false });
    assert.equal(toggle.checked, true);
    toggle.checked = false; handlers.change();
    assert.equal(document.documentElement.dataset.theme, 'dark');
    systemHandlers.change({ matches: false });
    assert.equal(document.documentElement.dataset.theme, 'dark');
    toggle.checked = true; handlers.change();
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.deepEqual(saved, [['galpi-theme', 'dark'], ['galpi-theme', 'light']]);
});
