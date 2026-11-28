const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'account-flow.js'), 'utf8');

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, clone() { return this; } };
}

function page({ mode, post, language = 'en', pageKind = 'register' }) {
  const listeners = {};
  const button = { disabled: false };
  const email = { value: 'synthetic@example.test', setCustomValidity() {}, reportValidity() {} };
  const form = {
    hidden: false,
    elements: { email },
    resetCalled: false,
    querySelector: () => button,
    addEventListener(name, callback) { listeners[name] = callback; },
    reset() { this.resetCalled = true; },
  };
  const notice = { hidden: false, textContent: '', style: {} };
  const manual = { hidden: true, textContent: '' };
  const intro = { hidden: false };
  const document = {
    documentElement: { lang: language },
    querySelector(selector) {
      if (selector === '#register-form') return pageKind === 'register' ? form : null;
      if (selector === '#forgot-form') return pageKind === 'forgot' ? form : null;
      if (selector === '#register-form, #forgot-form') return form;
      if (selector === '#verify-form' || selector === '#reset-form') return null;
      if (selector === '#notice') return notice;
      if (selector === '#manual-access-notice') return manual;
      if (selector === '#account-access-intro') return intro;
      return null;
    },
    addEventListener(name, callback) { listeners[`document:${name}`] = callback; },
  };
  const requests = [];
  const fetch = async (url) => {
    requests.push(url);
    return url.endsWith('/auth/account-access') ? mode : post;
  };
  const context = {
    document,
    fetch,
    location: { host: 'dev.marketing.goodmorning.mx', search: '', pathname: pageKind === 'register' ? '/register/' : '/forgot-password/', hash: '' },
    window: { GM_API_URL: 'https://api.dev.marketing.goodmorning.mx' },
    history: { replaceState() {} },
    URLSearchParams,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  };
  vm.runInNewContext(source, context, { filename: 'account-flow.js' });
  return { listeners, form, notice, manual, intro, requests, document };
}

test('manual mode hides email-link form and localizes its status message', async () => {
  const subject = page({ mode: response(200, { manual_access: true }), post: response(403, { code: 'manual_dev_access' }) });
  await new Promise(setImmediate);
  assert.equal(subject.form.hidden, true);
  assert.equal(subject.intro.hidden, true);
  assert.match(subject.manual.textContent, /managed manually/i);
  subject.document.documentElement.lang = 'es';
  subject.listeners['document:goodmarketing:language-change']();
  assert.equal(subject.manual.hidden, false);
  assert.match(subject.manual.textContent, /se gestionan manualmente/);
});

test('manual mode hides browser password-reset initiation and localizes its message', async () => {
  const subject = page({ mode: response(200, { manual_access: true }), post: response(403, { code: 'manual_dev_access' }), pageKind: 'forgot' });
  await new Promise(setImmediate);
  assert.equal(subject.form.hidden, true);
  assert.equal(subject.intro.hidden, true);
  assert.match(subject.manual.textContent, /managed manually/i);
  subject.document.documentElement.lang = 'es';
  subject.listeners['document:goodmarketing:language-change']();
  assert.match(subject.manual.textContent, /se gestionan manualmente/);
});

test('flag-off registration flow retains its existing email response', async () => {
  const subject = page({ mode: response(200, { manual_access: false }), post: response(202, { message: 'accepted' }) });
  await new Promise(setImmediate);
  assert.equal(subject.form.hidden, false);
  assert.equal(subject.intro.hidden, false);
  await subject.listeners.submit({ preventDefault() {} });
  assert.match(subject.notice.textContent, /check your inbox/i);
  assert.equal(subject.form.resetCalled, true);
});

test('flag-off browser reset retains its existing email response', async () => {
  const subject = page({ mode: response(200, { manual_access: false }), post: response(202, { message: 'accepted' }), pageKind: 'forgot' });
  await new Promise(setImmediate);
  assert.equal(subject.form.hidden, false);
  await subject.listeners.submit({ preventDefault() {} });
  assert.match(subject.notice.textContent, /check your inbox/i);
  assert.equal(subject.form.resetCalled, true);
});

test('a mode-change 403 response switches either page without reporting email success', async () => {
  for (const pageKind of ['register', 'forgot']) {
  let resolveMode;
  const pendingMode = new Promise((resolve) => { resolveMode = resolve; });
  const subject = page({ mode: pendingMode, post: response(403, { code: 'manual_dev_access' }), pageKind });
  await subject.listeners.submit({ preventDefault() {} });
  resolveMode(response(200, { manual_access: false }));
  await new Promise(setImmediate);
  assert.equal(subject.form.hidden, true);
  assert.equal(subject.manual.hidden, false);
  assert.match(subject.manual.textContent, /managed manually/i);
  assert.equal(subject.form.resetCalled, false);
  }
});

test('account request pages include dedicated localized-mode status and intro targets', () => {
  for (const pageName of ['register', 'forgot-password']) {
    const html = fs.readFileSync(path.join(__dirname, '..', pageName, 'index.html'), 'utf8');
    assert.match(html, /id="manual-access-notice"/);
    assert.match(html, /id="account-access-intro"/);
  }
  assert.match(source, /El acceso y los cambios de contraseña de Marketing DEV se gestionan manualmente/);
});
