'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function page(visible) {
  const document = {};
  const handlers = new Map();
  const notifications = [];
  const requests = [];
  const dialogs = [];
  let resolveConfirmation;
  let groupIds = [41, 42];
  let html = '';
  let request;
  let location = 'http://localhost:8080/client/group';
  const template = fs.readFileSync(
    path.resolve(__dirname, '../../views/pages/client_group.ejs'),
    'utf8',
  );
  const base = new URL(template.match(/<base href="([^"]+)"/)[1], location);
  function $(selector) {
    if (typeof selector === 'object' && selector !== document) return selector;
    return {
      ready(callback) {
        callback();
      },
      on(event, target, callback) {
        if (selector === document) handlers.set(target, callback);
      },
      click() {},
      html(value) {
        if (selector === '#list-groups') html = value;
      },
    };
  }
  $.ajax = (options) => {
    requests.push(options);
    if (options.url.endsWith('/loadDataGroups')) {
      options.success(
        groupIds.map((id) => ({
          manhom: id,
          hienthi: visible,
          tennhom: `Group ${id}`,
        })),
      );
    } else {
      request = options;
    }
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.resolve(__dirname, '../../public/js/pages/client_group.js'),
      'utf8',
    ),
    {
      $,
      document,
      Swal: {
        mixin: () => ({
          fire(...args) {
            dialogs.push(args);
            if (typeof args[0] === 'object') {
              return new Promise((resolve) => {
                resolveConfirmation = resolve;
              });
            }
            return Promise.resolve();
          },
        }),
      },
      Dashmix: {
        helpersOnLoad() {},
        helpers(_name, value) {
          notifications.push(value);
        },
      },
    },
  );
  return {
    click(selector) {
      const control = [...html.matchAll(/<(a|button)\b([^>]*)>/g)].find(
        (match) => match[2].includes(selector.slice(1)),
      );
      assert.ok(control, `Missing ${selector}`);
      let prevented = false;
      handlers.get(selector).call(
        {
          data() {
            return 41;
          },
        },
        {
          preventDefault() {
            prevented = true;
          },
        },
      );
      // Model native anchor navigation against the page's actual <base>.
      if (control[1] === 'a' && !prevented) {
        const href = control[2].match(/href="([^"]*)"/);
        if (href) location = new URL(href[1], base).href;
      }
    },
    get request() {
      return request;
    },
    get location() {
      return location;
    },
    get html() {
      return html;
    },
    async confirm(isConfirmed) {
      resolveConfirmation({ isConfirmed });
      await Promise.resolve();
    },
    setGroups(ids) {
      groupIds = ids;
    },
    requests,
    dialogs,
    notifications,
  };
}

test('leaving a group stays on the page while confirmation is pending or cancelled', async () => {
  const ui = page(1);
  ui.click('.btn-delete-group');
  assert.equal(ui.location, 'http://localhost:8080/client/group');
  assert.equal(ui.dialogs.length, 1);
  assert.equal(ui.request, undefined);
  await ui.confirm(false);
  assert.equal(ui.location, 'http://localhost:8080/client/group');
  assert.equal(ui.request, undefined);
  assert.equal(ui.requests.length, 1);
  assert.match(ui.html, /Group 41/);
});

for (const success of [true, false]) {
  test(`confirmed leave stays on the group page after ${success ? 'success' : 'failure'}`, async () => {
    const ui = page(1);
    ui.click('.btn-delete-group');
    assert.equal(ui.location, 'http://localhost:8080/client/group');
    assert.equal(ui.request, undefined);
    await ui.confirm(true);
    assert.equal(ui.location, 'http://localhost:8080/client/group');
    assert.equal(ui.request.type, 'post');
    assert.equal(
      new URL(ui.request.url, 'http://localhost:8080/').pathname,
      '/client/delete',
    );
    assert.equal(ui.request.data.manhom, 41);
    assert.equal(
      ui.requests.filter((request) => request.url.endsWith('/delete')).length,
      1,
    );
    assert.match(ui.html, /Group 41/);
    if (success) ui.setGroups([42]);
    ui.request.success(success);
    assert.equal(ui.location, 'http://localhost:8080/client/group');
    assert.equal(ui.html.includes('Group 41'), !success);
    assert.match(ui.html, /Group 42/);
    assert.equal(
      ui.requests.filter((request) => request.url.endsWith('/loadDataGroups'))
        .length,
      success ? 2 : 1,
    );
    assert.equal(ui.dialogs.length, success ? 2 : 1);
  });
}

for (const [name, selector, visible, value] of [
  ['hide', '.btn-hide-group', 1, 0],
  ['unhide', '.btn-unhide-group', 0, 1],
]) {
  for (const success of [true, false]) {
    test(`${name} stays on the group page while pending and after ${success ? 'success' : 'failure'}`, () => {
      const ui = page(visible);
      ui.click(selector);
      assert.equal(ui.location, 'http://localhost:8080/client/group');
      assert.equal(
        new URL(ui.request.url, 'http://localhost:8080/').pathname,
        '/client/hide',
      );
      assert.equal(ui.request.type, 'post');
      assert.equal(ui.request.data.manhom, 41);
      assert.equal(ui.request.data.giatri, value);
      assert.match(ui.html, /Group 41/);
      ui.request.success(success);
      assert.equal(ui.location, 'http://localhost:8080/client/group');
      assert.equal(ui.html.includes('Group 41'), !success);
      assert.match(ui.html, /Group 42/);
      assert.equal(ui.notifications.length, success ? 1 : 0);
    });
  }
}
