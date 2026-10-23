'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function page(response, httpFailure = false) {
  const nodes = new Map();
  const handlers = new Map();
  const notifications = [],
    dialogs = [],
    modals = [],
    refreshes = [];
  const document = {};
  function $(key) {
    if (key && typeof key === 'object' && key !== document) return key;
    const name = key === document ? 'document' : key;
    if (nodes.has(name)) return nodes.get(name);
    const node = {
      value: name === '#user_password' ? '' : 'sv-a',
      on(event, selector, handler) {
        handlers.set(
          `${name}:${event}:${typeof selector === 'string' ? selector : ''}`,
          handler ?? selector,
        );
        return this;
      },
      click(handler) {
        return this.on('click', handler);
      },
      ready(handler) {
        handler();
        return this;
      },
      val(value) {
        if (arguments.length) {
          this.value = value;
          return this;
        }
        return this.value;
      },
      data() {
        return 'sv-a';
      },
      prop(_key, value) {
        return arguments.length > 1 ? this : true;
      },
      valid() {
        return true;
      },
      validate() {
        return { settings: { rules: { user_password: {} } } };
      },
      modal(action) {
        modals.push(action);
        return this;
      },
    };
    for (const method of [
      'select2',
      'show',
      'hide',
      'addClass',
      'removeClass',
      'trigger',
      'html',
      'closest',
      'tab',
      'tooltip',
    ])
      node[method] = () => node;
    nodes.set(name, node);
    return node;
  }
  $.get = (_url, callback) => callback([]);
  $.ajax = (options) => {
    if (options.url === '/user/checkUser')
      return options.success([{ id: 'sv-a' }]);
    if (httpFailure)
      return options.error?.({ responseJSON: { message: 'Access denied' } });
    options.success(response);
  };
  class Pagination {
    option = {};
    valuePage = { curPage: 1 };
    getPagination() {
      refreshes.push(true);
    }
  }
  const Swal = {
    mixin: () => ({
      fire: (...args) => {
        if (typeof args[0] === 'object')
          return Promise.resolve({ value: true });
        dialogs.push(args);
        return Promise.resolve();
      },
    }),
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.resolve(__dirname, '../../public/js/pages/user.js'),
      'utf8',
    ),
    {
      $,
      jQuery: $,
      document,
      window: {},
      Pagination,
      Swal,
      Dashmix: {
        onLoad() {},
        helpersOnLoad() {},
        layout() {},
        helpers(name, value) {
          if (name === 'jq-notify') notifications.push(value);
        },
      },
      setTimeout,
      FormData: class {},
      console,
    },
  );
  const run = async (method) => {
    const key =
      method === 'update'
        ? '#btn-update-user:click:'
        : 'document:click:.btn-delete';
    handlers.get(key).call($('#btn-update-user'), { preventDefault() {} });
    await Promise.resolve();
  };
  return { notifications, dialogs, modals, refreshes, run };
}

for (const method of ['update', 'delete']) {
  test(`${method} business error stays visible without reporting success or refreshing table`, async () => {
    const ui = page({ status: 'error', message: 'Email already exists' });
    await ui.run(method);
    assert.equal(ui.refreshes.length, 1);
    assert.equal(ui.modals.includes('hide'), false);
    if (method === 'update') {
      assert.equal(ui.notifications.at(-1).type, 'danger');
      assert.equal(ui.notifications.at(-1).message, 'Email already exists');
    } else {
      assert.equal(ui.dialogs.at(-1)[2], 'error');
      assert.equal(ui.dialogs.at(-1)[1], 'Email already exists');
    }
  });
  test(`${method} success still notifies and refreshes table`, async () => {
    const ui = page({ status: 'success', message: 'Done' });
    await ui.run(method);
    assert.equal(ui.refreshes.length, 2);
    if (method === 'update')
      assert.equal(ui.notifications.at(-1).type, 'success');
    else assert.equal(ui.dialogs.at(-1)[2], 'success');
  });
  test(`${method} HTTP authorization failure displays server error`, async () => {
    const ui = page(null, true);
    await ui.run(method);
    assert.equal(ui.refreshes.length, 1);
    if (method === 'update')
      assert.equal(ui.notifications.at(-1)?.message, 'Access denied');
    else assert.equal(ui.dialogs.at(-1)?.[1], 'Access denied');
  });
}
