const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'account-flow.js'), 'utf8');

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function page({ available = true, submission = response(201, { created: true }), failCheck = false } = {}) {
  const listeners = {};
  const calls = [];
  const button = { disabled: false };
  const fieldset = { disabled: true };
  const form = {
    hidden: true,
    querySelector(selector) { return selector === 'fieldset' ? fieldset : button; },
    addEventListener(name, callback) { listeners[name] = callback; },
    reset() {},
  };
  const section = { hidden: true };
  const notice = { textContent: '', style: {} };
  const register = null;
  const document = {
    documentElement: { lang: 'en' },
    querySelector(selector) {
      if (selector === '#dev-enrollment-section') return section;
      if (selector === '#dev-enrollment-form') return form;
      if (selector === '#dev-enrollment-notice') return notice;
      if (selector === '#register-form' || selector === '#forgot-form' || selector === '#verify-form' || selector === '#reset-form') return register;
      if (selector === '#notice') return notice;
      return null;
    },
    addEventListener() {},
  };
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'POST') return submission;
    if (failCheck) throw new Error('offline');
    return response(200, { available });
  };
  class FormDataMock {
    constructor() {}
    entries() { return [['email', 'synthetic@example.test'], ['credential', 'synthetic-CREDENTIAL_12345678901234567890'], ['name', 'Synthetic'], ['workspace_name', 'Synthetic workspace'], ['password', 'synthetic-password']]; }
  }
  const location = { replace(pathname) { this.replaced = pathname; } };
  vm.runInNewContext(source, {
    document, fetch, location, FormData: FormDataMock,
    window: { GM_API_URL: 'https://api.dev.marketing.goodmorning.mx' },
    history: { replaceState() {} }, URLSearchParams,
  }, { filename: 'account-flow.js' });
  return { listeners, calls, form, fieldset, section, notice, location };
}

test('DEV form stays hidden and disabled unless same-origin availability confirms it', async () => {
  for (const options of [{ available: false }, { failCheck: true }]) {
    const subject = page(options);
    await new Promise(setImmediate);
    assert.equal(subject.section.hidden, true);
    assert.equal(subject.form.hidden, true);
    assert.equal(subject.fieldset.disabled, true);
    assert.equal(subject.calls[0].url, '/auth/dev-enrollment');
    assert.equal(subject.calls[0].options.cache, 'no-store');
  }
});

test('confirmed DEV form posts secrets only in a same-origin JSON body', async () => {
  const subject = page();
  await new Promise(setImmediate);
  assert.equal(subject.section.hidden, false);
  assert.equal(subject.form.hidden, false);
  assert.equal(subject.fieldset.disabled, false);
  await subject.listeners.submit({ preventDefault() {} });
  const submission = subject.calls.find((call) => call.options.method === 'POST');
  assert.equal(submission.url, '/auth/dev-enrollment');
  assert.equal(submission.options.credentials, 'same-origin');
  assert.equal(submission.options.cache, 'no-store');
  assert.equal(submission.options.headers['Content-Type'], 'application/json');
  assert.equal(subject.location.replaced, '/login/?registered=1');
});

test('409 stops enrollment with safe contact guidance', async () => {
  const subject = page({ submission: response(409, { code: 'unavailable' }) });
  await new Promise(setImmediate);
  await subject.listeners.submit({ preventDefault() {} });
  assert.equal(subject.fieldset.disabled, true);
  assert.match(subject.notice.textContent, /invitation is used or the account already exists/i);
  assert.match(subject.notice.textContent, /Contact GoodMarketing/i);
  assert.equal(subject.location.replaced, undefined);
});

test('static form cannot submit credentials through a GET URL without JavaScript', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'register', 'index.html'), 'utf8');
  const form = html.match(/<form id="dev-enrollment-form"[^>]*>(.*?)<\/form>/);
  assert.ok(form);
  assert.match(form[0], /action="\/auth\/dev-enrollment" method="post" hidden/);
  assert.match(form[1], /<fieldset disabled>/);
  assert.match(form[1], /name="credential" type="password" autocomplete="off"/);
  assert.match(form[1], /name="password" type="password" autocomplete="new-password"/);
});
