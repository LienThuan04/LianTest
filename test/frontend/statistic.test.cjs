'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ejs = require('ejs');
// Reuse Compodoc's installed HTML parser without a package-manager-specific path.
const { load } = require(
  require.resolve('cheerio', {
    paths: [path.dirname(require.resolve('@compodoc/compodoc/package.json'))],
  }),
);

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fixture = {
  ShowAggregate: true,
  Semesters: [
    { mahocky: 21, tenhocky: 'Học kỳ I', namhoc: 8 },
    { mahocky: 22, tenhocky: 'Học kỳ II', namhoc: 8 },
    { mahocky: 11, tenhocky: 'Học kỳ I cũ', namhoc: 7 },
  ],
  AcademicYears: [
    { namhoc: 8, tennamhoc: '2025–2026' },
    { namhoc: 7, tennamhoc: '2024–2025' },
  ],
  Subjects: [
    { mamonhoc: 101, tenmonhoc: 'Toán' },
    { mamonhoc: 102, tenmonhoc: 'Tin' },
  ],
  Groups: [
    { manhom: 501, tennhom: 'Nhóm A' },
    { manhom: 502, tennhom: 'Nhóm B' },
  ],
  SelectedYear: 8,
  SelectedSemester: 21,
};

function render(overrides = {}) {
  return ejs.render(read('views/pages/statistic.ejs'), {
    ...fixture,
    ...overrides,
    include: (file) =>
      file.endsWith('statistic_cards')
        ? read('views/partials/statistic_cards.ejs')
        : '',
  });
}

// Actual rendered selectors and DOM mutations run through Cheerio. Only browser
// events, AJAX transport and canvas are boundaries; responses can arrive in any
// order, including after an abort, to exercise the real stale-response guards.
function page(overrides = {}, { chart = true } = {}) {
  const dom = load(render(overrides));
  const document = dom.root()[0];
  const ready = [];
  const handlers = [];
  const requests = [];
  const dialogs = [];
  const charts = [];
  dom.fn.ready = function (callback) {
    ready.push(callback);
    return this;
  };
  dom.fn.on = function (event, target, callback) {
    this.each((_i, element) =>
      handlers.push({
        element,
        event: event.split('.')[0],
        target: typeof target === 'string' ? target : null,
        callback: callback ?? target,
      }),
    );
    return this;
  };
  dom.fn.click = function (callback) {
    return this.on('click', callback);
  };
  function $(selector) {
    return selector === document ? dom.root() : dom(selector);
  }
  $.ajax = (options) => {
    const request = { ...options, data: { ...options.data }, aborted: false };
    requests.push(request);
    return {
      abort() {
        request.aborted = true;
      },
    };
  };
  document.getElementById = (id) => {
    const element = dom(`#${id}`)[0] ?? null;
    if (element?.name === 'canvas') element.getContext = () => ({});
    return element;
  };
  document.documentElement = dom('html')[0];
  for (const canvas of dom('canvas').toArray()) canvas.getContext = () => ({});
  const window = {};
  const context = {
    $,
    document,
    window,
    console,
    Swal: { fire: (value) => dialogs.push(value) },
    getComputedStyle: () => ({ getPropertyValue: () => '#6456d7' }),
  };
  if (chart)
    context.Chart = function (_canvas, options) {
      charts.push(options);
      this.destroy = () => {};
    };
  vm.runInNewContext(read('public/js/pages/statistic.js'), context);
  ready.forEach((callback) => callback());

  return {
    $,
    requests,
    dialogs,
    charts,
    click(selector) {
      const element = dom(selector)[0];
      assert.ok(element, `Missing control: ${selector}`);
      assert.notEqual(
        dom(element).prop('disabled'),
        true,
        `Disabled control: ${selector}`,
      );
      let prevented = false;
      for (const handler of [...handlers]) {
        if (handler.event !== 'click') continue;
        if (handler.target) {
          if (!dom(element).is(handler.target)) continue;
          if (!dom(element).parents().toArray().includes(handler.element))
            continue;
        } else if (handler.element !== element) continue;
        handler.callback.call(element, {
          preventDefault() {
            prevented = true;
          },
        });
      }
      assert.equal(prevented, true, `Missing click behavior: ${selector}`);
      if (element.name === 'button')
        assert.equal(dom(element).attr('type'), 'button');
    },
    pending(endpoint) {
      return requests.filter((request) => request.url.endsWith(endpoint));
    },
    respond(request, response) {
      assert.ok(request, 'Missing AJAX request');
      request.success(response);
    },
    fail(request) {
      assert.ok(request, 'Missing AJAX request');
      request.error({}, 'error', 'Offline');
    },
    status() {
      return dom('#statistic-status').text().trim();
    },
  };
}

const aggregate = (count) => ({
  da_nop_bai: count,
  chua_nop_bai: 2,
  khong_thi: 1,
  diem_trung_binh: 8,
  diem_cao_nhat: 10,
  thong_ke_diem: [0, 0, 0, 0, 0, 0, 0, 0, 0, count],
});
const filters = (subject = 201, group = 601) => ({
  subjects: [{ mamonhoc: subject, tenmonhoc: `Môn ${subject}` }],
  groups: [{ manhom: group, tennhom: `Nhóm ${group}` }],
});
function payload(request) {
  return JSON.parse(JSON.stringify(request.data));
}

test('SSR selects one matching year/semester and preloads subject/group All controls', () => {
  const $ = load(render());
  assert.equal($('.filter-year.active').attr('data-id'), '8');
  assert.equal($('.filter-semester.active').attr('data-id'), '21');
  assert.equal($('.filter-semester.active').attr('data-year'), '8');
  assert.equal($('#dropdown-filter-year span').text(), '2025–2026');
  assert.equal($('#dropdown-filter-semester span').text(), 'Học kỳ I');
  for (const kind of ['subject', 'group']) {
    assert.match($(`#dropdown-filter-${kind} span`).text(), /Tất cả/);
    assert.equal($(`#dropdown-filter-${kind}`).prop('disabled'), false);
    assert.equal($(`.filter-${kind}.active`).attr('data-id'), '');
    assert.equal($(`.filter-${kind}`).length, 3);
  }
  assert.equal($('.filter-semester[data-year="7"]').prop('hidden'), true);
  assert.equal($('a[href="#"], a[href^="javascript:"]').length, 0);
  for (const button of $('.dropdown-item').toArray()) {
    assert.equal(button.name, 'button');
    assert.equal($(button).attr('type'), 'button');
  }
});

test('aggregate page requests initial active pair exactly once with null All filters', () => {
  const ui = page();
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].url, '/statistic/getAggregatedStatistical');
  assert.deepEqual(payload(ui.requests[0]), {
    mahocky: 21,
    namhoc: 8,
    mamonhoc: null,
    manhom: null,
  });
  ui.respond(ui.requests[0], aggregate(4));
  assert.equal(ui.$('#da_nop').text(), '4');
  assert.equal(ui.charts.length, 1);
  assert.equal(ui.charts[0].data.labels[9], '9-10');
  assert.equal(ui.charts[0].data.datasets[0].data[9], 4);
});

test('genuinely empty data explains disabled filters and sends no request', () => {
  const ui = page({
    Semesters: [],
    AcademicYears: [],
    Subjects: [],
    Groups: [],
    SelectedYear: null,
    SelectedSemester: null,
  });
  assert.equal(ui.requests.length, 0);
  for (const kind of ['semester', 'year', 'subject', 'group']) {
    assert.equal(ui.$(`#dropdown-filter-${kind}`).prop('disabled'), true);
    assert.match(ui.$(`#dropdown-filter-${kind} span`).text(), /chưa|không/i);
  }
  assert.match(ui.status(), /chưa|không/i);
  assert.notEqual(ui.$('#statistic-status').prop('hidden'), true);
});

test('changing year chooses its semester and clears dependent IDs before loading once', () => {
  const ui = page();
  ui.click('.filter-subject[data-id="101"]');
  ui.respond(ui.pending('/getGroupsBySubject').at(-1), [
    { manhom: 510, tennhom: 'Nhóm Toán' },
  ]);
  ui.click('.filter-group[data-id="510"]');
  ui.click('.filter-year[data-id="7"]');
  assert.equal(ui.$('.filter-semester.active').data('id'), 11);
  assert.equal(ui.$('#dropdown-filter-semester span').text(), 'Học kỳ I cũ');
  assert.equal(
    ui.$('.filter-semester[data-year="8"]').first().prop('hidden'),
    true,
  );
  assert.equal(
    ui.$(
      '.filter-subject.active[data-id!=""], .filter-group.active[data-id!=""]',
    ).length,
    0,
  );
  assert.equal(ui.$('#dropdown-filter-subject').prop('disabled'), true);
  const request = ui.pending('/getFilters').at(-1);
  assert.deepEqual(payload(request), { mahocky: 11, namhoc: 7 });
  const before = ui.pending('/getAggregatedStatistical').length;
  ui.respond(request, filters());
  assert.equal(ui.pending('/getAggregatedStatistical').length, before + 1);
  assert.deepEqual(payload(ui.pending('/getAggregatedStatistical').at(-1)), {
    mahocky: 11,
    namhoc: 7,
    mamonhoc: null,
    manhom: null,
  });
});

test('semester reload binds group click once across repeated dependent reloads', () => {
  const ui = page();
  for (const term of [22, 21, 22]) {
    ui.click(`.filter-semester[data-id="${term}"]`);
    ui.respond(ui.pending('/getFilters').at(-1), filters());
  }
  const before = ui.requests.length;
  ui.click('.filter-group[data-id="601"]');
  assert.equal(ui.requests.length, before + 1);
  assert.deepEqual(payload(ui.requests.at(-1)), {
    mahocky: 22,
    namhoc: 8,
    mamonhoc: null,
    manhom: 601,
  });
  assert.equal(ui.$('#dropdown-filter-group span').text(), 'Nhóm 601');
  assert.equal(ui.$('#dropdown-filter-group i').length, 2);
});

test('subject selection clears old group immediately and sends one aggregate plus group fetch', () => {
  const ui = page();
  ui.click('.filter-group[data-id="501"]');
  const before = ui.requests.length;
  ui.click('.filter-subject[data-id="101"]');
  assert.equal(ui.requests.length, before + 2);
  assert.equal(ui.$('.filter-group.active[data-id!=""]').length, 0);
  assert.equal(ui.$('#dropdown-filter-group').prop('disabled'), true);
  assert.deepEqual(payload(ui.pending('/getGroupsBySubject').at(-1)), {
    mahocky: 21,
    namhoc: 8,
    mamonhoc: 101,
  });
  assert.deepEqual(payload(ui.pending('/getAggregatedStatistical').at(-1)), {
    mahocky: 21,
    namhoc: 8,
    mamonhoc: 101,
    manhom: null,
  });
  ui.respond(ui.pending('/getGroupsBySubject').at(-1), [
    { manhom: 510, tennhom: 'Nhóm Toán' },
  ]);
  assert.equal(ui.requests.length, before + 2);
  assert.equal(ui.$('.filter-group.active').data('id'), '');
  assert.equal(ui.$('.filter-group[data-id="510"]').text().trim(), 'Nhóm Toán');
  assert.equal(ui.$('#dropdown-filter-subject i').length, 2);
});

test('All subject restores all groups while preserving null filter payloads', () => {
  const ui = page();
  ui.click('.filter-subject[data-id="101"]');
  ui.respond(ui.pending('/getGroupsBySubject').at(-1), [
    { manhom: 510, tennhom: 'Nhóm Toán' },
  ]);
  ui.click('.filter-group[data-id="510"]');
  const before = ui.pending('/getAggregatedStatistical').length;
  ui.click('.filter-subject[data-id=""]');
  assert.equal(ui.pending('/getAggregatedStatistical').length, before + 1);
  assert.deepEqual(payload(ui.pending('/getAggregatedStatistical').at(-1)), {
    mahocky: 21,
    namhoc: 8,
    mamonhoc: null,
    manhom: null,
  });
  ui.respond(ui.pending('/getFilters').at(-1), {
    subjects: fixture.Subjects,
    groups: fixture.Groups,
  });
  assert.equal(ui.$('.filter-subject.active').data('id'), '');
  assert.equal(ui.$('.filter-group[data-id="501"]').length, 1);
  assert.equal(ui.pending('/getAggregatedStatistical').length, before + 1);
  ui.click('.filter-group[data-id="501"]');
  ui.click('.filter-group[data-id=""]');
  assert.equal(payload(ui.requests.at(-1)).manhom, null);
});

test('stale semester/filter callbacks cannot replace the selected year or trigger aggregates', () => {
  const ui = page();
  ui.click('.filter-semester[data-id="22"]');
  const old = ui.pending('/getFilters').at(-1);
  ui.click('.filter-year[data-id="7"]');
  const current = ui.pending('/getFilters').at(-1);
  ui.respond(current, filters(201, 601));
  const count = ui.requests.length;
  ui.respond(old, filters(301, 701));
  ui.fail(old);
  assert.equal(ui.requests.length, count);
  assert.equal(ui.$('.filter-subject[data-id="201"]').length, 1);
  assert.equal(ui.$('.filter-subject[data-id="301"]').length, 0);
  assert.equal(ui.$('#dropdown-filter-subject').prop('disabled'), false);
  assert.equal(ui.dialogs.length, 0);
});

test('stale group callbacks cannot override a newer subject or year, including failures', () => {
  const ui = page();
  ui.click('.filter-subject[data-id="101"]');
  const old = ui.pending('/getGroupsBySubject').at(-1);
  ui.click('.filter-subject[data-id="102"]');
  ui.respond(ui.pending('/getGroupsBySubject').at(-1), [
    { manhom: 520, tennhom: 'Nhóm Tin' },
  ]);
  ui.respond(old, [{ manhom: 510, tennhom: 'Nhóm Toán' }]);
  ui.fail(old);
  assert.equal(ui.$('.filter-group[data-id="520"]').length, 1);
  assert.equal(ui.$('.filter-group[data-id="510"]').length, 0);
  ui.click('.filter-year[data-id="7"]');
  ui.respond(ui.pending('/getFilters').at(-1), filters());
  ui.respond(old, [{ manhom: 510, tennhom: 'Nhóm Toán' }]);
  assert.equal(ui.$('.filter-group[data-id="601"]').length, 1);
  assert.equal(ui.dialogs.length, 0);
});

test('stale aggregate success/error cannot overwrite newer counts or clear statistics', () => {
  const ui = page();
  const old = ui.pending('/getAggregatedStatistical').at(-1);
  ui.click('.filter-group[data-id="501"]');
  ui.respond(ui.pending('/getAggregatedStatistical').at(-1), aggregate(6));
  ui.respond(old, aggregate(99));
  ui.fail(old);
  assert.equal(ui.$('#da_nop').text(), '6');
  assert.equal(ui.charts.length, 1);
  assert.equal(ui.dialogs.length, 0);
});

test('changing period invalidates pending aggregate before the new filters finish', () => {
  const ui = page();
  const old = ui.pending('/getAggregatedStatistical').at(-1);
  ui.click('.filter-year[data-id="7"]');
  ui.respond(old, aggregate(99));
  assert.equal(ui.$('#da_nop').text(), '0');
  assert.notEqual(ui.$('#statistic-status').prop('hidden'), true);
  assert.equal(ui.pending('/getAggregatedStatistical').length, 1);
});

for (const mode of ['empty', 'server error', 'network error']) {
  test(`dependent ${mode} keeps menus informative and safely disabled`, () => {
    const ui = page();
    ui.click('.filter-semester[data-id="22"]');
    const request = ui.pending('/getFilters').at(-1);
    if (mode === 'empty') ui.respond(request, { subjects: [], groups: [] });
    else if (mode === 'server error')
      ui.respond(request, { error: 'Không thể tải bộ lọc' });
    else ui.fail(request);
    for (const kind of ['subject', 'group']) {
      assert.equal(ui.$(`#dropdown-filter-${kind}`).prop('disabled'), true);
      assert.match(ui.$(`#${kind}-menu`).text(), /chưa|không|lỗi/i);
    }
    assert.match(ui.status(), /chưa|không|lỗi/i);
    assert.notEqual(ui.$('#statistic-status').prop('hidden'), true);
  });
}

test('group failure clears stale groups and can recover on another subject', () => {
  const ui = page();
  ui.click('.filter-subject[data-id="101"]');
  ui.fail(ui.pending('/getGroupsBySubject').at(-1));
  assert.equal(ui.$('#dropdown-filter-group').prop('disabled'), true);
  assert.match(ui.$('#group-menu').text(), /không|lỗi/i);
  ui.click('.filter-subject[data-id="102"]');
  ui.respond(ui.pending('/getGroupsBySubject').at(-1), [
    { manhom: 520, tennhom: 'Nhóm Tin' },
  ]);
  assert.equal(ui.$('#dropdown-filter-group').prop('disabled'), false);
  assert.equal(ui.$('.filter-group[data-id="520"]').length, 1);
});

for (const groupsFirst of [true, false]) {
  test(`group warning survives ${groupsFirst ? 'group then aggregate' : 'aggregate then group'} completion and clears on retry`, () => {
    for (const mode of ['failure', 'empty']) {
      const ui = page();
      ui.click('.filter-subject[data-id="101"]');
      const groups = ui.pending('/getGroupsBySubject').at(-1);
      const statistics = ui.pending('/getAggregatedStatistical').at(-1);
      const finishGroups = () =>
        mode === 'failure' ? ui.fail(groups) : ui.respond(groups, []);
      if (groupsFirst) finishGroups();
      ui.respond(statistics, aggregate(6));
      if (!groupsFirst) finishGroups();
      assert.match(
        ui.status(),
        mode === 'failure' ? /nhóm.*thử lại/i : /không có nhóm/i,
      );
      assert.notEqual(ui.$('#statistic-status').prop('hidden'), true);
      assert.equal(ui.$('#dropdown-filter-group').prop('disabled'), true);
      assert.equal(ui.$('#da_nop').text(), '6');

      ui.click('.filter-subject[data-id="101"]');
      assert.doesNotMatch(
        ui.status(),
        /không thể tải danh sách nhóm|không có nhóm/i,
      );
      ui.respond(ui.pending('/getGroupsBySubject').at(-1), [
        { manhom: 510, tennhom: 'Nhóm Toán' },
      ]);
      ui.respond(ui.pending('/getAggregatedStatistical').at(-1), aggregate(4));
      assert.equal(ui.status(), '');
      assert.equal(ui.$('#statistic-status').prop('hidden'), true);

      ui.click('.filter-subject[data-id="102"]');
      ui.fail(ui.pending('/getAggregatedStatistical').at(-1));
      ui.fail(ui.pending('/getGroupsBySubject').at(-1));
      assert.match(ui.status(), /không thể tải thống kê/i);
      assert.match(ui.status(), /nhóm.*thử lại/i);
      ui.click('.filter-year[data-id="7"]');
      assert.doesNotMatch(
        ui.status(),
        /không thể tải thống kê|không thể tải danh sách nhóm/i,
      );
    }
  });
}

test('selecting the current semester retries a failed dependent filter load once', () => {
  const ui = page();
  ui.click('.filter-semester[data-id="22"]');
  ui.fail(ui.pending('/getFilters').at(-1));
  const before = ui.requests.length;
  ui.click('.filter-semester[data-id="22"]');
  assert.equal(ui.requests.length, before + 1);
  ui.respond(ui.requests.at(-1), filters());
  assert.equal(ui.$('#dropdown-filter-subject').prop('disabled'), false);
});

test('selecting the current subject retries its failed group request once', () => {
  const ui = page();
  ui.click('.filter-subject[data-id="101"]');
  ui.fail(ui.pending('/getGroupsBySubject').at(-1));
  const before = ui.pending('/getGroupsBySubject').length;
  ui.click('.filter-subject[data-id="101"]');
  assert.equal(ui.pending('/getGroupsBySubject').length, before + 1);
  ui.respond(ui.pending('/getGroupsBySubject').at(-1), [
    { manhom: 510, tennhom: 'Nhóm Toán' },
  ]);
  assert.equal(ui.$('#dropdown-filter-group').prop('disabled'), false);
});

test('selecting the current group retries failed statistics once', () => {
  const ui = page();
  ui.fail(ui.pending('/getAggregatedStatistical').at(-1));
  const before = ui.requests.length;
  ui.click('.filter-group[data-id=""]');
  assert.equal(ui.requests.length, before + 1);
  ui.respond(ui.requests.at(-1), aggregate(3));
  assert.equal(ui.$('#da_nop').text(), '3');
});

test('missing Chart.js leaves aggregate statistics and subsequent filters functional', () => {
  const ui = page({}, { chart: false });
  assert.doesNotThrow(() => ui.respond(ui.requests[0], aggregate(3)));
  ui.click('.filter-group[data-id="501"]');
  assert.doesNotThrow(() => ui.respond(ui.requests.at(-1), aggregate(5)));
  assert.equal(ui.$('#da_nop').text(), '5');
  assert.equal(ui.requests.length, 2);
});

test('detail statistics retain made/group API and ignore late group responses', () => {
  const ui = page({
    ShowAggregate: false,
    Test: { made: 42, tenmonhoc: 'Toán', tende: 'Đề 1' },
    Nhom: [{ manhom: 501, tennhom: 'Nhóm A' }],
  });
  const old = ui.requests[0];
  assert.equal(old.url, '/statistic/getStatictical');
  assert.deepEqual(payload(old), { made: 42, manhom: 0 });
  ui.click('.filtered-by-static[data-id="501"]');
  assert.deepEqual(payload(ui.requests.at(-1)), { made: 42, manhom: 501 });
  ui.respond(ui.requests.at(-1), aggregate(8));
  ui.respond(old, aggregate(99));
  assert.equal(ui.$('#da_nop').text(), '8');
  assert.equal(ui.$('#dropdown-filter-static').text().trim(), 'Nhóm A');
  assert.equal(ui.pending('/getAggregatedStatistical').length, 0);
});

test('dynamic subject/group labels are treated as text rather than HTML', () => {
  const ui = page();
  ui.click('.filter-semester[data-id="22"]');
  ui.respond(ui.pending('/getFilters').at(-1), {
    subjects: [{ mamonhoc: 201, tenmonhoc: '<img src=x onerror=alert(1)>' }],
    groups: [{ manhom: 601, tennhom: '<script>alert(1)</script>' }],
  });
  assert.equal(ui.$('#subject-menu img, #group-menu script').length, 0);
  assert.equal(
    ui.$('.filter-subject[data-id="201"]').text(),
    '<img src=x onerror=alert(1)>',
  );
  assert.equal(
    ui.$('.filter-group[data-id="601"]').text(),
    '<script>alert(1)</script>',
  );
});
