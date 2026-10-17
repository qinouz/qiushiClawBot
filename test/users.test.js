import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { listKnownUsers } from '../src/clawbot/users.js';

test('query journals, backups and directories do not become user profiles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawbot-users-'));
  const keys = ['CLAWBOT_STATE_DIR', 'CLAWBOT_USERS', 'CLAWBOT_DEFAULT_USER'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    process.env.CLAWBOT_STATE_DIR = dir;
    process.env.CLAWBOT_USERS = 'me,wife';
    process.env.CLAWBOT_DEFAULT_USER = 'me';
    fs.writeFileSync(path.join(dir, 'me.json'), JSON.stringify({ token: 'test-token' }));
    fs.writeFileSync(path.join(dir, 'gold.json'), '{}');
    fs.writeFileSync(path.join(dir, 'Test-User.JSON'), '{}');
    fs.writeFileSync(path.join(dir, 'me.json.creator-queries.json'), '{}');
    fs.writeFileSync(path.join(dir, 'me.backup.json'), '{}');
    fs.mkdirSync(path.join(dir, 'directory.json'));
    assert.deepEqual(listKnownUsers().map(x => x.user).sort(), ['gold', 'me', 'test-user', 'wife']);
    assert.equal(listKnownUsers().find(x => x.user === 'me').bound, true);
    assert.equal(fs.readFileSync(path.join(dir, 'me.json.creator-queries.json'), 'utf8'), '{}');
    process.env.CLAWBOT_USERS = 'invalid.user';
    assert.throws(() => listKnownUsers(), /User name/);
  } finally {
    for (const k of keys) saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k];
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
