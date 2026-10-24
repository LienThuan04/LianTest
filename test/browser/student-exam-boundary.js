// Test-only browser boundary. The production de_thi.js is loaded unchanged after this file.
(() => {
  const params = new URLSearchParams(location.search);
  const name = params.get('case');
  const made = Number(params.get('made'));
  const stage = params.get('stage');
  const imageRecovery = ['image-owner','image-legacy','image-orphan'].includes(name);
  const nativeIdb = window.idb;
  const now = Date.now();
  let clock = now;
  const NativeDate = Date;
  window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  };
  const intervals = new Map();
  window.setInterval = (run) => { const id = intervals.size + 1; intervals.set(id, run); return id; };
  window.clearInterval = (id) => intervals.delete(id);
  const images = [];
  const db = {
    getAll: async () => images,
    getAllFromIndex: async () => images,
    add: async (_store, row) => { images.push({ ...row, id: images.length + 1 }); },
    delete: async () => {},
    transaction: () => {
      if (name === 'cleanup-failure') throw new Error('Fixture local cleanup failed');
      return { store: { delete: () => {} }, done: Promise.resolve() };
    },
  };
  window.idb = name === 'missing-idb' ? undefined : { openDB: async () => db };
  const question = { macauhoi: 1, noidung: 'Câu kiểm thử', loai: 'mcq', cautraloi: [
    { macautl: 11, noidungtl: 'Đáp án A' }, { macautl: 12, noidungtl: 'Đáp án B' },
  ], ...(name === 'server-choice' ? { dapanchon: 12 } : {}) };
  if(['essay-format','image-race'].includes(name)) {question.loai='essay';question.cautraloi=[];}
  const answerKey = `cautraloi_${made}_user_fixture-student`;
  if(!(imageRecovery&&stage==='2')) {
    localStorage.removeItem(answerKey);
    localStorage.removeItem(`dethi_${made}_user_fixture-student`);
  }
  if(imageRecovery) window.idb={openDB:async(...args)=>{
    const real=await nativeIdb.openDB(...args);
    window.fixture.imageDb=real;
    if(stage!=='2')for(const row of await real.getAll('images'))if(row.answerKey===answerKey)await real.delete('images',row.id);
    if(name==='image-orphan'&&stage!=='2')await real.add('images',{answerKey,questionIndex:0,base64:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTm0AAAAASUVORK5CYII='});
    return real;
  }};
  if (name === 'corrupt-draft') localStorage.setItem(answerKey, '{invalid json');
  if (!['fresh', 'server-choice', 'corrupt-draft','partial-retry','tab-blank','tab-hidden','tab-retry','manual-blank','tab-disabled','image-orphan'].includes(name)&&!(imageRecovery&&stage==='2')) {
    localStorage.setItem(answerKey, JSON.stringify([{ macauhoi: 1, cautraloi: 11, noidungtl: null }]));
  }
  const state = window.fixture = { requests: [], dialogs: [], errors: [], tick(ms) {
    clock += ms; for (const run of [...intervals.values()]) run();
  } };
  if(name==='image-race') {
    const NativeReader=FileReader;
    window.FileReader=class {
      readAsDataURL(file) {
        const reader=new NativeReader();
        reader.onload=event=>setTimeout(()=>this.onload?.(event),200);
        reader.onerror=event=>this.onerror?.(event);
        reader.readAsDataURL(file);
      }
    };
  }
  window.addEventListener('error', (event) => state.errors.push(event.message));
  window.addEventListener('unhandledrejection', (event) => state.errors.push(String(event.reason)));
  window.Swal = { fire(...args) { state.dialogs.push(args); return args[0] === 'Thành công!' || (['tab-blank','tab-hidden'].includes(name) && args[0]?.icon === 'error') ? new Promise(() => {}) : Promise.resolve({ isConfirmed: true }); } };
  const ajax = {
    '/test/getQuestion': { dethi: { tende: 'Đề browser fixture', tenmonhoc: 'Môn test' }, cauhoi: [question] },
    '/test/getTimeTest': new NativeDate(now + (name === 'expired-load' ? -5_000 : 10_000)).toISOString(),
    '/test/getTimeEndTest': name === 'no-close' ? false : new NativeDate(now + 60_000).toISOString(),
    '/test/chuyentab': ['tab-auto','tab-blank','tab-hidden','tab-retry'].includes(name) ? 1 : 0,
  };
  if(imageRecovery) {
    const essay={...question,macauhoi:101,loai:'essay',cautraloi:[]};
    const mcq={...question,macauhoi:2};
    ajax['/test/getQuestion'].cauhoi=stage==='2'?[mcq,essay]:[essay,mcq];
    if(name==='image-orphan')ajax['/test/getQuestion'].cauhoi=[{...essay,macauhoi:102},essay];
  }
  if(name==='reading-image') {
    question.loai='reading';question.context='Đoạn văn test';question.cautraloi[0].hinhanhtl='/fixture/image/reading.png';
  }
  let clockCalls=0;
  $.ajax = (options) => {
    if(options.url==='/test/chuyentab') state.tabRequests=(state.tabRequests||0)+1;
    const value = ajax[options.url];
    const deferred = $.Deferred();
    if(name==='clock-retry'&&options.url==='/test/getTimeTest'&&++clockCalls===1) {
      options.error?.({status:503});deferred.reject();return deferred.promise();
    }
    if (name === 'question-error' && options.url === '/test/getQuestion') {
      options.error?.({status:503}); deferred.reject(); return deferred.promise();
    }
    options.success?.(value); deferred.resolve(value); return deferred.promise();
  };
  window.fetch = async (_url, options) => {
    state.requests.push(Object.fromEntries(options.body.entries()));
    if (name === 'offline') throw new Error('Fixture network unavailable');
    if (name === 'double-submit') await new Promise((resolve) => { state.release = resolve; });
    return { ok: true, json: async () => ({ success: name === 'cleanup-failure', message: 'Fixture rejected submission' }) };
  };
})();
