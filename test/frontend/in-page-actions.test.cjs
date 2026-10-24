'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ejs = require('ejs');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function skipLinkPage(url, targetExists = true, pagination = []) {
  const attributes = new Map([['href', '#main-container']]);
  const target = { hasAttribute: () => false };
  const link = {
    getAttribute: (name) => attributes.get(name),
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const events = new Map();
  const document = {
    body: {},
    addEventListener: (name, callback) => events.set(name, callback),
    querySelectorAll: (selector) =>
      selector.includes('skip-link')
        ? [link]
        : selector === '.pagination-container .page-link'
          ? pagination
          : [],
    getElementById: (id) =>
      id === 'main-container' && targetExists ? target : null,
  };
  const ajaxEvents = {};
  for (const name of ['ajaxSend', 'ajaxError', 'ajaxSuccess', 'ajaxComplete']) {
    ajaxEvents[name] = () => ajaxEvents;
  }
  vm.runInNewContext(read('public/js/app-ui.js'), {
    document,
    window: { location: { href: url } },
    URL,
    $: () => ajaxEvents,
    MutationObserver: class {
      observe() {}
    },
  });
  events.get('DOMContentLoaded')();
  return { href: attributes.get('href'), target };
}

for (const pathname of [
  '/client/group?view=hidden',
  '/client/test?search=exam',
  '/test/detail/42',
  '//other.example/path?group=41',
]) {
  test(`skip link keeps the current page and query with a root base: ${pathname}`, () => {
    const page = skipLinkPage(`http://localhost:8080${pathname}`);
    assert.equal(
      new URL(page.href, 'http://localhost:8080/').href,
      `http://localhost:8080${pathname}#main-container`,
    );
    assert.equal(page.target.tabIndex, -1);
  });
}
test('skip link with a missing destination does not rewrite to a different page', () => {
  assert.equal(
    skipLinkPage('http://localhost:8080/client/group', false).href,
    '#main-container',
  );
});

for (const disabled of [true, false]) {
  test(`shared pagination enhancer preserves native ${disabled ? 'disabled' : 'enabled'} button accessibility`, () => {
    const attrs = new Map();
    const button = {
      disabled,
      classList: { contains: () => false },
      parentElement: {
        classList: { contains: (name) => name === 'active' && disabled },
      },
      setAttribute: (name, value) => attrs.set(name, value),
      removeAttribute: (name) => attrs.delete(name),
    };
    skipLinkPage('http://localhost:8080/namhoc', true, [button]);
    assert.equal(attrs.get('aria-disabled'), String(disabled));
    assert.equal(button.tabIndex, disabled ? -1 : 0);
    assert.equal(attrs.get('aria-current'), disabled ? 'page' : undefined);
  });
}

function schedulePage() {
  const ready = [];
  const handlers = new Map();
  const labels = new Map();
  const requests = [];
  const document = { querySelector: () => ({ dataset: { id: 'student' } }) };
  function $(selector) {
    if (selector && typeof selector === 'object' && selector !== document)
      return selector;
    return {
      ready: (callback) => ready.push(callback),
      click: (callback) => handlers.set(selector, callback),
      text: (text) => labels.set(selector, text),
      hide() {},
    };
  }
  class Pagination {
    option = { custom: {} };
    valuePage = { curPage: 7 };
    getPagination(option, page) {
      requests.push({
        option: { ...option },
        page,
        currentPage: this.valuePage.curPage,
      });
    }
  }
  const context = vm.createContext({ $, document, Pagination, console });
  vm.runInContext(read('public/js/pages/test_schedule.js'), context);
  ready.forEach((callback) => callback());
  return {
    click(value) {
      handlers.get('.filtered-by-state').call(
        {
          data: () => value,
          text: () => `  State ${value}  `,
        },
        { preventDefault() {} },
      );
    },
    get request() {
      return requests.at(-1);
    },
    labels,
  };
}
for (const state of [0, 1, 2, 3]) {
  test(`schedule state ${state} requests its filter from page 1 and preserves dropdown icons`, () => {
    const page = schedulePage();
    page.click(state);
    assert.equal(page.request.option.filter, String(state));
    assert.equal(page.request.page, 1);
    assert.equal(page.request.currentPage, 1);
    assert.equal(
      page.labels.get('.btn-filtered-by-state .filter-text'),
      `State ${state}`,
    );
    assert.equal(page.labels.has('.btn-filtered-by-state'), false);
  });
}
test('schedule All removes the previous filter when jQuery data returns the number 4', () => {
  const page = schedulePage();
  page.click(2);
  page.click(4);
  assert.equal(Object.hasOwn(page.request.option, 'filter'), false);
});

function render(file) {
  return ejs.render(read(file), {
    include: () => '',
    user: { id: 'fixture', hoten: 'Fixture' },
  });
}
function attributes(opening) {
  return Object.fromEntries(
    [...opening.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
}
test('signup terms opens its dialog using a non-submit control outside the checkbox label', () => {
  const html = render('views/pages/auth/signup.ejs');
  const control = html.match(
    /<(a|button)\b[^>]*onclick="([^"]*termsModal[^\"]*)"[^>]*>/,
  );
  assert.ok(control);
  assert.equal(control[1], 'button');
  assert.equal(attributes(control[0]).type, 'button');
  const dialog = { style: {} };
  vm.runInNewContext(`(function () { ${control[2]} })()`, {
    document: { getElementById: (id) => (id === 'termsModal' ? dialog : null) },
  });
  assert.equal(dialog.style.display, 'flex');
  const insideLabel = [
    ...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g),
  ].some(
    (label) =>
      label.index <= control.index &&
      control.index < label.index + label[0].length,
  );
  assert.equal(insideLabel, false);
});
test('dashboard onboarding dismiss uses Bootstrap modal dismissal without navigation or form submission', () => {
  const html = render('views/pages/dashboard.ejs');
  const control = html.match(/<(a|button)\b[^>]*data-bs-dismiss="modal"[^>]*>/);
  assert.ok(control);
  assert.equal(control[1], 'button');
  assert.equal(attributes(control[0]).type, 'button');
  assert.equal(Object.hasOwn(attributes(control[0]), 'href'), false);
});
for (const file of [
  'views/pages/subject.ejs',
  'views/pages/view_subject.ejs',
]) {
  test(`${file} chapter action targets the existing collapse with a non-submit control`, () => {
    const html = render(file);
    const control = html.match(/<(a|button)\b[^>]*id="btn-add-chapter"[^>]*>/);
    assert.ok(control);
    const attrs = attributes(control[0]);
    assert.equal(control[1], 'button');
    assert.equal(attrs.type, 'button');
    assert.equal(attrs['data-bs-toggle'], 'collapse');
    assert.equal(attrs['data-bs-target'], '#collapseChapter');
    assert.equal(attrs['data-role'], 'chuong');
    assert.equal(attrs['data-action'], 'create');
    assert.match(html, /id="collapseChapter"/);
  });
}
