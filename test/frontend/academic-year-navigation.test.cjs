'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function page(total = 75) {
  const document = {};
  const nodes = new Map();
  const handlers = [];
  const requests = [];
  const timers = new Map();
  let timerId = 0;
  let location = 'http://localhost:8080/namhoc';
  let submissions = 0;

  function $(selector) {
    if (selector && typeof selector === 'object' && selector !== document)
      return selector;
    if (nodes.has(selector)) return nodes.get(selector);
    const node = {
      value: '',
      markup: '',
      ready(callback) {
        callback();
        return this;
      },
      on(event, target, callback) {
        handlers.push({
          root: selector,
          event,
          target: typeof target === 'string' ? target : undefined,
          callback: callback ?? target,
        });
        return this;
      },
      click(callback) {
        return this.on('click', callback);
      },
      submit(callback) {
        return this.on('submit', callback);
      },
      html(value) {
        if (arguments.length) this.markup = value;
        return this;
      },
      val(value) {
        if (!arguments.length) return this.value;
        this.value = value;
        return this;
      },
      tooltip() {
        return this;
      },
    };
    nodes.set(selector, node);
    return node;
  }

  $.post = (url, data, callback, dataType) => {
    requests.push({ url, data: { ...data }, dataType });
    callback({
      data: total
        ? [{ manamhoc: 5, tennamhoc: '2025-2026', tonghocky: 3 }]
        : [],
      total,
    });
    return { fail() {} };
  };

  vm.runInNewContext(
    fs.readFileSync(
      path.resolve(__dirname, '../../public/js/pages/namhoc.js'),
      'utf8',
    ),
    {
      $,
      document,
      Dashmix: { helpersOnLoad() {} },
      setTimeout(callback) {
        timers.set(++timerId, callback);
        return timerId;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
      console,
    },
  );

  function controls() {
    return [...$('.main-page-pagination').markup.matchAll(
      /<(a|button)\b([^>]*)>([^<]*)<\/\1>/g,
    )].map((match) => ({
      tag: match[1],
      text: match[3].trim(),
      attributes: Object.fromEntries(
        [...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(
          (attribute) => [attribute[1], attribute[2] ?? ''],
        ),
      ),
    }));
  }

  function dispatch(control, force = false) {
    if (!force && Object.hasOwn(control.attributes, 'disabled')) return;
    let prevented = false;
    const node = {
      data(name) {
        return control.attributes[`data-${name}`];
      },
    };
    for (const handler of handlers) {
      if (handler.root !== '.main-page-pagination' || handler.event !== 'click')
        continue;
      const [tag, className] = handler.target.split('.');
      if (
        tag === control.tag &&
        control.attributes.class.split(/\s+/).includes(className)
      )
        handler.callback.call(node, {
          preventDefault() {
            prevented = true;
          },
        });
    }
    // Model native defaults, including a containing form, so a missing button
    // type or a disconnected delegated handler cannot silently pass.
    if (!prevented) {
      if (control.tag === 'a')
        location = new URL(control.attributes.href, 'http://localhost:8080/').href;
      if (control.tag === 'button' && control.attributes.type !== 'button')
        submissions++;
    }
  }

  return {
    requests,
    controls,
    click(text) {
      const control = controls().find((item) => item.text === String(text));
      assert.ok(control, `Missing pagination control ${text}`);
      dispatch(control);
    },
    forcePage(value) {
      const control = controls()[0];
      dispatch(
        {
          ...control,
          attributes: { ...control.attributes, 'data-page': String(value) },
        },
        true,
      );
    },
    search(value) {
      const input = $("input[name='search-input']").val(value);
      handlers.find(
        (handler) =>
          handler.root === "input[name='search-input']" &&
          handler.event === 'keyup',
      ).callback.call(input);
      for (const [id, callback] of timers) {
        timers.delete(id);
        callback();
      }
    },
    get rows() {
      return $('#listNamHoc').markup;
    },
    get location() {
      return location;
    },
    get submissions() {
      return submissions;
    },
  };
}

function assertRequest(ui, pageNumber, query = '') {
  assert.deepEqual(ui.requests.at(-1), {
    url: '/namhoc/getNamHoc',
    data: { page: pageNumber, limit: 10, q: query },
    dataType: 'json',
  });
  assert.equal(ui.location, 'http://localhost:8080/namhoc');
  assert.equal(ui.submissions, 0);
}

test('academic-year paging renders labelled non-submitting buttons with native disabled/current states', () => {
  const ui = page();
  assertRequest(ui, 1);
  const controls = ui.controls();
  assert.deepEqual(controls.map((control) => control.text), ['Prev', '1', '2', '3', '4', 'Next']);
  for (const control of controls) {
    assert.equal(control.tag, 'button');
    assert.equal(control.attributes.type, 'button');
    assert.ok(control.attributes['aria-label']);
    assert.equal(Object.hasOwn(control.attributes, 'href'), false);
  }
  assert.equal(Object.hasOwn(controls[0].attributes, 'disabled'), true);
  assert.equal(controls[1].attributes['aria-current'], 'page');
  assert.equal(Object.hasOwn(controls[1].attributes, 'disabled'), true);
  assert.equal(Object.hasOwn(controls.at(-1).attributes, 'disabled'), false);
});

test('number, Next and Prev each request the selected page once without navigation or submission', () => {
  const ui = page();
  ui.click(3);
  assertRequest(ui, 3);
  assert.match(ui.rows, /<td>21<\/td>/);
  ui.click('Next');
  assertRequest(ui, 4);
  ui.click('Prev');
  assertRequest(ui, 3);
  assert.equal(ui.requests.length, 4);
});

test('current, disabled and out-of-bounds page targets make no extra request', () => {
  const ui = page();
  ui.click('Prev');
  ui.click(1);
  for (const value of [0, -1, 9, 'invalid']) ui.forcePage(value);
  assert.equal(ui.requests.length, 1);
  assertRequest(ui, 1);
  ui.click(3);
  ui.click(3);
  assert.equal(ui.requests.length, 2);
  assertRequest(ui, 3);
});

test('last page disables Next, marks the selected page and still allows Prev', () => {
  const ui = page(25);
  ui.click(3);
  assertRequest(ui, 3);
  const controls = ui.controls();
  assert.equal(Object.hasOwn(controls.at(-1).attributes, 'disabled'), true);
  assert.equal(controls.find((control) => control.text === '3').attributes['aria-current'], 'page');
  ui.click('Next');
  ui.click(3);
  assert.equal(ui.requests.length, 2);
  ui.click('Prev');
  assertRequest(ui, 2);
  assert.equal(ui.requests.length, 3);
});

test('search resets to page one and paging preserves the trimmed search payload', () => {
  const ui = page();
  ui.click(3);
  ui.search('  2025  ');
  assertRequest(ui, 1, '2025');
  ui.click('Next');
  assertRequest(ui, 2, '2025');
  ui.click('Prev');
  assertRequest(ui, 1, '2025');
  assert.equal(ui.requests.length, 5);
});

for (const total of [0, 10]) {
  test(`${total === 0 ? 'empty' : 'single'} page disables both directions and performs no redundant fetch`, () => {
    const ui = page(total);
    const controls = ui.controls();
    assert.deepEqual(controls.map((control) => control.text), ['Prev', '1', 'Next']);
    assert.equal(Object.hasOwn(controls[0].attributes, 'disabled'), true);
    assert.equal(Object.hasOwn(controls.at(-1).attributes, 'disabled'), true);
    ui.click('Prev');
    ui.click(1);
    ui.click('Next');
    assert.equal(ui.requests.length, 1);
    assertRequest(ui, 1);
  });
}
