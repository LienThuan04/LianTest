const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

test('one valid signup submission sends one registration request', async () => {
  const source = readFileSync(join(__dirname, '../../views/pages/auth/signup.ejs'), 'utf8');
  const listeners = [];
  const requests = [];
  const form = {
    action: '/auth/addUser',
    email: { value: 'student@dht.edu.vn' },
    ngaysinh: { value: '2000-01-01' },
    password: { value: 'test-password' },
    confirm_password: { value: 'test-password' },
    addEventListener: (type, listener) => { if (type === 'submit') listeners.push(listener); },
  };
  const elements = { signupForm: form, errorMessage: {}, errorModal: { style: {} } };
  const context = vm.createContext({
    document: { getElementById: (id) => elements[id] },
    FormData: class FormData { constructor(value) { this.form = value; } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { json: async () => ({ status: 'error', message: 'Mã sinh viên đã tồn tại' }) };
    },
  });
  for (const script of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    vm.runInContext(script[1], context);
  }
  for (const listener of listeners) await listener({ target: form, preventDefault() {} });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/auth/addUser');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(elements.errorMessage.textContent, 'Mã sinh viên đã tồn tại');
});
