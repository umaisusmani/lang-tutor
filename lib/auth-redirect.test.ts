import assert from 'node:assert/strict';
import test from 'node:test';
import { authRedirectPath } from './auth-redirect';

test('recovery callback keeps its local destination and query', () => {
  assert.equal(authRedirectPath('/login/reset?mode=update'), '/login/reset?mode=update');
});

test('external and malformed callback destinations fall back to chat', () => {
  for (const path of [null, 'https://elsewhere.example', '//elsewhere.example', '/\\elsewhere.example', '/\nelsewhere']) {
    assert.equal(authRedirectPath(path), '/');
  }
});
