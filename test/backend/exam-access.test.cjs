const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('../helpers/exam-source.cjs');
const forbidden = (error) => error.statusCode === 403;

for (const identity of ['teacher-a', 'admin', 'student-a']) {
  test(`result details allow the exam teacher/admin or submitting student: ${identity}`, async () => {
    const f = fixture();
    const response = await f.dispatch(
      'getResultDetail',
      [{ makq: 7 }],
      identity,
    );
    assert.equal(response.success, true);
    assert.equal(response.data[0].macauhoi, 10);
  });
}
for (const identity of ['teacher-b', 'student-b']) {
  test(`result details reject cross-account access: ${identity}`, async () => {
    const f = fixture();
    await assert.rejects(
      f.dispatch('getResultDetail', [{ makq: 7 }], identity),
      forbidden,
    );
  });
}
for (const options of [
  { exam: { hienthibailam: 0 } },
  { result: { trangthai: 'Chưa nộp' } },
]) {
  test(`student cannot review a hidden or unsubmitted result: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    await assert.rejects(
      f.dispatch('getResultDetail', [{ makq: 7 }], 'student-a'),
      forbidden,
    );
  });
}
test('student result view redacts correct answers and essay marks when visibility flags are off', async () => {
  const f = fixture({ exam: { xemdapan: 0, xemdiemthi: 0 } });
  const { data } = await f.dispatch(
    'getResultDetail',
    [{ makq: 7 }],
    'student-a',
  );
  assert.equal(
    data[0].cautraloi.some((answer) => Number(answer.ladapan) === 1),
    false,
  );
  assert.equal(data[0].diem_cham_tuluan, null);
});
test('result detail distinguishes missing result from a successful empty payload', async () => {
  const f = fixture({ missingResult: true });
  await assert.rejects(
    f.dispatch('getResultDetail', [{ makq: 999 }], 'teacher-a'),
    (error) => error.statusCode === 404,
  );
});

for (const [method, args, delegated] of [
  ['getDetail', [{ made: 42 }], 'getById'],
  ['getQuestionOfTestManual', [{ made: 42 }], 'getQuestionOfTestManual'],
  ['addDetail', [{ made: 42, cauhoi: [] }], 'addDetail'],
  ['delete', [{ made: 42 }], 'delete'],
  ['updateTest', [{ made: 42, tende: 'Changed' }], 'updateTest'],
  ['getStatictical', [{ made: 42, manhom: 0 }], 'getStatictical'],
  ['getExamineeByGroup', [{ made: 42, manhom: 11 }], 'getExamineeByGroup'],
  ['getListEssaySubmissions', [{ made: 42 }], 'getEssaySubmissions'],
  ['getEssayDetail', [{ makq: 7 }], 'getEssayDetail'],
  [
    'saveEssayScore',
    [{ rawBody: Buffer.alloc(0) }, { makq: 7, diem: '2', cau: { 10: '2' } }],
    'saveEssayScore',
  ],
]) {
  test(`teacher B cannot invoke teacher A's ${method}`, async () => {
    const f = fixture();
    let invoked = false;
    f.service[delegated] = async () => {
      invoked = true;
      return { sensitive: true };
    };
    if (method === 'saveEssayScore') {
      const req = args[0];
      req.user = f.users['teacher-b'];
      await assert.rejects(
        async () => f.controller.saveEssayScore(req, args[1]),
        forbidden,
      );
    } else {
      await assert.rejects(f.dispatch(method, args, 'teacher-b'), forbidden);
    }
    assert.equal(invoked, false);
  });
}

for (const method of ['paginate', 'getTotalPages']) {
  test(`teacher B cannot read teacher A's grade table through ${method}`, async () => {
    const f = fixture();
    f.service.listExamResults = async () => [{ sensitive: true }];
    f.service.countExamResultPages = async () => ({ totalPages: 1 });
    await assert.rejects(
      f.dispatch(
        method,
        [{ args: JSON.stringify({ model: 'KetQuaModel', made: 42 }) }],
        'teacher-b',
      ),
      forbidden,
    );
  });
}

for (const identity of [
  'student-a',
  'student-b',
  'teacher-a',
  'teacher-b',
  'admin',
]) {
  test(`guest and invalid authentication are separate from role ownership: ${identity}`, async () => {
    const f = fixture();
    await assert.rejects(
      f.dispatch('getResultDetail', [{ makq: 7 }], 'guest'),
      (error) => error.statusCode === 401,
    );
  });
}
