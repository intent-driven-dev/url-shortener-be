import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { configuration } from '../src/config.js';
import { initializeStorage, LinkStorage } from '../src/storage.js';
import { createApp } from '../src/app.js';

const publicOrigin = 'http://127.0.0.1:49001';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'shortener-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'active');
  await initializeStorage(directory);
  return { root, directory };
}
async function startApp(t, storage) {
  const server = createApp({ storage, publicLinkOrigin: publicOrigin }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}
function post(origin, body) {
  return fetch(`${origin}/api/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
  assert.ok(body.error.message.length);
  assert.equal(response.headers.get('location'), null);
}

test('configuration validates allocated addresses and normalizes public origin', () => {
  assert.deepEqual(configuration({ PORT: '3100', PUBLIC_LINK_ORIGIN: `${publicOrigin}/`, STORAGE_DIR: '/tmp/example' }),
    { port: 3100, publicLinkOrigin: publicOrigin, storageDir: '/tmp/example' });
  for (const port of [undefined, '0', '65536', '1.5', 'abc']) {
    assert.throws(() => configuration({ PORT: port, PUBLIC_LINK_ORIGIN: publicOrigin }));
  }
  for (const origin of [undefined, '/relative', 'ftp://example.com', 'http://u:p@example.com', 'http://example.com/path', 'http://example.com/?q=1', 'http://example.com/#x']) {
    assert.throws(() => configuration({ PORT: '3100', PUBLIC_LINK_ORIGIN: origin }));
  }
});

test('HTTP contract: creation, exact redirects, invalid inputs and unknown codes', async t => {
  const { directory } = await fixture(t);
  const origin = await startApp(t, new LinkStorage(directory));
  assert.equal((await fetch(`${origin}/health`)).status, 200);
  const destinations = [
    'https://www.manning.com/books/spec-driven-development',
    'http://www.manning.com/books/spec-driven-development',
    'https://www.manning.com/books/spec-driven-development?source=short-link#about',
    'https://EXAMPLE.com:443/a%2fb?x=%2F&x=two#Case'
  ];
  for (const destinationUrl of destinations) {
    const response = await post(origin, { destinationUrl });
    assert.equal(response.status, 201);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ['shortUrl']);
    assert.match(body.shortUrl, new RegExp(`^${publicOrigin}/s/[A-Za-z0-9_-]+$`));
    const code = body.shortUrl.split('/').at(-1);
    const disk = JSON.parse(await readFile(join(directory, 'links.json'), 'utf8'));
    assert.equal(disk.links[code], destinationUrl);
    const redirect = await fetch(`${origin}/s/${code}`, { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), destinationUrl);
  }
  const before = await readFile(join(directory, 'links.json'), 'utf8');
  for (const body of ['{', '{}', ...[null, 12, true, [], {}, '', 'garbage', '/books/spec-driven-development', 'ftp://example.com', 'mailto:a@example.com', 'javascript:alert(1)', 'https://'].map(destinationUrl => ({ destinationUrl }))]) {
    await expectError(await post(origin, body), 400, 'INVALID_INPUT');
  }
  assert.equal(await readFile(join(directory, 'links.json'), 'utf8'), before);
  await expectError(await fetch(`${origin}/s/unknown`), 404, 'NOT_FOUND');
  await expectError(await fetch(`${origin}/s/__proto__`), 404, 'NOT_FOUND');
});

test('real directory outage returns 503 for health, creation and known/unknown resolution, then recovers', async t => {
  const { root, directory } = await fixture(t);
  const origin = await startApp(t, new LinkStorage(directory));
  const destinationUrl = 'https://www.manning.com/books/spec-driven-development?source=short-link#about';
  const { shortUrl } = await (await post(origin, { destinationUrl })).json();
  const path = new URL(shortUrl).pathname;
  const offline = join(root, 'offline');
  await rename(directory, offline);
  try {
    await expectError(await fetch(`${origin}/health`), 503, 'STORAGE_UNAVAILABLE');
    await expectError(await post(origin, { destinationUrl }), 503, 'STORAGE_UNAVAILABLE');
    for (const route of [path, '/s/unknown']) {
      await expectError(await fetch(`${origin}${route}`, { redirect: 'manual' }), 503, 'STORAGE_UNAVAILABLE');
    }
  } finally { await rename(offline, directory); }
  assert.equal((await fetch(`${origin}/health`)).status, 200);
  assert.equal((await fetch(`${origin}${path}`, { redirect: 'manual' })).headers.get('location'), destinationUrl);
  assert.equal((await post(origin, { destinationUrl })).status, 201);
});

test('corrupt and missing snapshots remain unavailable until restored; initialization never overwrites', async t => {
  const { directory } = await fixture(t);
  const origin = await startApp(t, new LinkStorage(directory));
  const file = join(directory, 'links.json');
  const original = await readFile(file, 'utf8');
  await assert.rejects(initializeStorage(directory), { code: 'EEXIST' });
  assert.equal(await readFile(file, 'utf8'), original);
  for (const contents of ['{', '{"version":2,"links":{}}', '{"version":1,"links":[]}', '{"version":1,"links":{"abc":12}}']) {
    await writeFile(file, contents);
    await expectError(await fetch(`${origin}/health`), 503, 'STORAGE_UNAVAILABLE');
    await expectError(await post(origin, { destinationUrl: 'https://example.com' }), 503, 'STORAGE_UNAVAILABLE');
    await expectError(await fetch(`${origin}/s/unknown`), 503, 'STORAGE_UNAVAILABLE');
    assert.equal(await readFile(file, 'utf8'), contents);
  }
  await rm(file);
  await expectError(await fetch(`${origin}/health`), 503, 'STORAGE_UNAVAILABLE');
  await assert.rejects(readFile(file), { code: 'ENOENT' });
  await writeFile(file, original);
  assert.equal((await fetch(`${origin}/health`)).status, 200);
});

test('collision retries and concurrent creates preserve every association', async t => {
  const { directory } = await fixture(t);
  const codes = ['same', 'same', 'next'];
  const storage = new LinkStorage(directory, () => codes.shift());
  assert.equal(await storage.create('https://example.com/one'), 'same');
  assert.equal(await storage.create('https://example.com/two'), 'next');
  assert.equal(await storage.lookup('same'), 'https://example.com/one');
  assert.equal(await storage.lookup('next'), 'https://example.com/two');
  const origin = await startApp(t, new LinkStorage(directory));
  const results = await Promise.all(Array.from({ length: 20 }, async (_, i) => {
    const destinationUrl = `https://example.com/${i}`;
    const response = await post(origin, { destinationUrl });
    assert.equal(response.status, 201);
    return { destinationUrl, ...(await response.json()) };
  }));
  assert.equal(new Set(results.map(result => result.shortUrl)).size, 20);
  for (const { destinationUrl, shortUrl } of results) {
    assert.equal((await fetch(`${origin}${new URL(shortUrl).pathname}`, { redirect: 'manual' })).headers.get('location'), destinationUrl);
  }
});

test('genuine write failure returns 503 while reads succeed, then the queue recovers', async t => {
  const { directory } = await fixture(t);
  const origin = await startApp(t, new LinkStorage(directory));
  const { chmod } = await import('node:fs/promises');
  const file = join(directory, 'links.json');
  const before = await readFile(file, 'utf8');
  await chmod(directory, 0o500);
  try {
    assert.equal((await fetch(`${origin}/health`)).status, 200);
    await expectError(await post(origin, { destinationUrl: 'https://example.com' }), 503, 'STORAGE_UNAVAILABLE');
    assert.equal(await readFile(file, 'utf8'), before);
  } finally { await chmod(directory, 0o700); }
  assert.equal((await post(origin, { destinationUrl: 'https://example.com' })).status, 201);
});

async function freePort() {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function startProcess(t, directory, port) {
  const child = spawn(process.execPath, ['src/server.js'], { env: { ...process.env, PORT: String(port), PUBLIC_LINK_ORIGIN: publicOrigin, STORAGE_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  const stopped = once(child, 'exit');
  let alive = true;
  child.on('exit', () => { alive = false; });
  async function stop() { if (alive) { child.kill('SIGTERM'); await stopped; } }
  t.after(stop);
  await Promise.race([
    new Promise(resolve => child.stdout.once('data', resolve)),
    stopped.then(() => { throw new Error(`Backend exited: ${stderr}`); }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000); timer.unref(); })
  ]);
  return { origin: `http://127.0.0.1:${port}`, stop };
}

test('acknowledged destination survives an actual process restart and is absent from isolated storage', async t => {
  const { root, directory } = await fixture(t);
  const port = await freePort();
  const first = await startProcess(t, directory, port);
  const destinationUrl = 'https://www.manning.com/books/spec-driven-development?source=short-link#about';
  const response = await post(first.origin, { destinationUrl });
  assert.equal(response.status, 201);
  const { shortUrl } = await response.json();
  const path = new URL(shortUrl).pathname;
  await first.stop();
  const restarted = await startProcess(t, directory, port);
  assert.equal((await fetch(`${restarted.origin}/health`)).status, 200);
  const redirect = await fetch(`${restarted.origin}${path}`, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), destinationUrl);
  await restarted.stop();
  const isolatedDirectory = join(root, 'isolated');
  await initializeStorage(isolatedDirectory);
  const isolated = await startProcess(t, isolatedDirectory, port);
  await expectError(await fetch(`${isolated.origin}${path}`), 404, 'NOT_FOUND');
});
