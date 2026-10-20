// Run only with a dedicated test database/account. This script never seeds or migrates.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { resolve } = require('node:path');
const { env: runtimeEnv = {} } = require('../vercel.json');

async function main() {
  for (const key of ['RUNTIME_SMOKE_DATABASE_URL', 'RUNTIME_SMOKE_USER', 'RUNTIME_SMOKE_PASSWORD']) {
    assert.ok(process.env[key], `${key} is required; use a dedicated test database/account`);
  }
  const reservation = createServer();
  await new Promise((done) => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['dist/src/main.js'], {
    cwd: resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_OPTIONS: `--no-experimental-require-module ${runtimeEnv.NODE_OPTIONS || ''}`,
      DATABASE_URL: process.env.RUNTIME_SMOKE_DATABASE_URL,
      PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production', MODE: 'production',
      SEED_DB: 'false', CLEAR_DB: 'false', SEED_DEMO_DATA: 'false', EXPORT_SWAGGER_API_JSON: 'false',
      GLOBAL_PREFIX: 'api', VERSION: '1', APP_NAME: 'LianTest', NAME_ROLE_ADMIN: 'Admin',
      JWT_ACCESS_TOKEN_SECRET: randomBytes(32).toString('hex'), JWT_ACCESS_EXPIRE: '1h',
      ACCESS_TOKEN_COOKIE: 'runtime_smoke_token', LIST_ORIGIN_CORS: base,
      SUPABASE_URL: 'https://runtime-smoke.supabase.co', SUPABASE_KEY: 'runtime-smoke-only',
      SUPABASE_NAME_BUCKET: 'runtime-smoke', EMAIL_HOST: '127.0.0.1', EMAIL_PORT: '9',
      EMAIL_AUTH_USER: 'runtime-smoke', EMAIL_AUTH_PASS: 'runtime-smoke',
      EMAIL_FROM: 'smoke@example.invalid', SUPPORT_EMAIL: 'support@example.invalid',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  const call = (url, options = {}) => fetch(`${base}${url}`, {
    redirect: 'manual', signal: AbortSignal.timeout(5_000), ...options,
  });
  const json = (data) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error(`Compiled application exited: ${child.exitCode}`);
      try { ready = (await call('/')).status === 200; } catch { /* Wait for the listening socket. */ }
      if (ready) break;
      await delay(250);
    }
    assert.ok(ready, 'Compiled application did not serve HTTP within 20 seconds');
    for (const path of ['/', '/auth/signin', '/auth/signup', '/auth/recover']) {
      const response = await call(path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /html/);
      assert.match(await response.text(), /<html/i);
    }
    assert.equal((await call('/public/css/dashmix.min.css')).status, 200);
    console.log('PASS: compiled Nest bootstrap, public EJS pages and static CSS');

    assert.equal((await call('/dashboard', { headers: { accept: 'application/json' } })).status, 401);
    const redirect = await call('/dashboard', { headers: { accept: 'text/html' } });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/auth/signin');
    assert.equal((await call('/auth/login', json({ id: process.env.RUNTIME_SMOKE_USER, password: 'wrong-password' }))).status, 401);
    const login = await call('/auth/login', json({ id: process.env.RUNTIME_SMOKE_USER, password: process.env.RUNTIME_SMOKE_PASSWORD }));
    assert.ok(login.ok, `Valid login returned ${login.status}`);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('runtime_smoke_token='), 'Login did not issue a session cookie');
    assert.equal((await call('/dashboard', { headers: { cookie } })).status, 200);
    assert.equal((await call('/question', { headers: { cookie } })).status, 200);
    assert.equal((await call('/dashboard', { headers: { accept: 'application/json', cookie: 'runtime_smoke_token=invalid' } })).status, 401);
    console.log('PASS: invalid/valid login, JWT cookie, protected pages and invalid-token rejection');
    assert.doesNotMatch(logs, /ERR_REQUIRE_ESM|ERR_REQUIRE_ASYNC_MODULE/);
  } catch (error) {
    const sanitized = logs.slice(-5_000).replace(/postgres(?:ql)?:\/\/[^\s]+/g, '<REDACTED_DATABASE_URL>');
    throw new Error(`${error.message}\n${sanitized}`, { cause: error });
  } finally {
    if (child.exitCode === null) {
      const stopped = new Promise((done) => child.once('exit', done));
      child.kill();
      await stopped;
    }
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
