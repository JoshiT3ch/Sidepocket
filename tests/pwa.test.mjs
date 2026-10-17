import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const workerSource = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
function worker({offline = false} = {}) {
  const events = {}, fetched = [], deleted = [], stored = new Map();
  const cache = {
    async addAll(paths) { for (const path of paths) stored.set(path, new Response(path)); },
    async match(path) { return stored.get(path)?.clone(); }
  };
  vm.runInNewContext(workerSource, {
    self: {location: {origin: 'https://sideout.example'}, clients: {async claim() {}}, addEventListener(name, handler) { events[name] = handler; }},
    caches: {async open() { return cache; }, async keys() { return ['other-app', 'sideout-offline-v0', 'sideout-offline-v1']; }, async delete(key) { deleted.push(key); }},
    fetch: async request => { fetched.push(request.url); if (offline) throw new Error('offline'); return new Response('network'); }, URL, Response
  });
  return {
    stored, fetched, deleted,
    async lifecycle(name) { let done; events[name]({waitUntil(value) { done = value; }}); await done; },
    request(url, options = {}) {
      let response;
      events.fetch({request: {url, method: 'GET', mode: 'cors', ...options}, respondWith(value) { response = value; }});
      return response;
    }
  };
}

test('manifest launches at a stable URL and contains valid PNG app icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dist/manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) assert.ok(manifest.icons.some(icon => icon.sizes === `${size}x${size}`));
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(`../dist${icon.src}`, import.meta.url));
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

test('only public offline assets are cached and older Sideout caches are cleaned selectively', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  assert.deepEqual([...sw.stored.keys()], ['/offline.html', '/offline.css', '/offline.js', '/icons/sideout-192.png']);
  await sw.lifecycle('activate');
  assert.deepEqual(sw.deleted, ['sideout-offline-v0']);
});

test('offline navigation keeps the original invite URL while returning the offline screen', async () => {
  const sw = worker({offline: true});
  await sw.lifecycle('install');
  const url = 'https://sideout.example/?duo=private-invite#play';
  const response = await sw.request(url, {mode: 'navigate'});
  assert.equal(await response.text(), '/offline.html');
  assert.deepEqual(sw.fetched, [url]);
  assert.equal(sw.stored.has(url), false);
});

test('online Google callbacks always use the network and never enter the offline cache', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  const url = 'https://sideout.example/?player=SO-012345ABCDEF#access_token=private';
  assert.equal(await (await sw.request(url, {mode: 'navigate'})).text(), 'network');
  assert.deepEqual(sw.fetched, [url]);
  assert.equal(sw.stored.size, 4);
});

test('Supabase, local APIs, POSTs and private app assets bypass service worker responses', () => {
  const sw = worker({offline: true});
  assert.equal(sw.request('https://test.supabase.co/auth/v1/token'), undefined);
  assert.equal(sw.request('https://sideout.example/api/profile'), undefined);
  assert.equal(sw.request('https://sideout.example/api/matches', {method: 'POST'}), undefined);
  assert.equal(sw.request('https://sideout.example/service.js'), undefined);
});

const pwaSource = await readFile(new URL('../dist/pwa.js', import.meta.url), 'utf8');
function installUI({ios = false, standalone = false} = {}) {
  const events = {}, elements = {};
  const element = id => elements[id] ||= {hidden: false, textContent: '', handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; }, showModal() { this.open = true; }, close() { this.open = false; }};
  vm.runInNewContext(pwaSource, {
    document: {getElementById: element},
    window: {matchMedia: () => ({matches: standalone, addEventListener() {}}), addEventListener(name, handler) { events[name] = handler; }},
    navigator: {userAgent: ios ? 'iPhone' : 'Android', onLine: true}
  });
  return {events, elements, element};
}
test('iPhone offers home-screen instructions without an unavailable native prompt', () => {
  const ui = installUI({ios: true});
  ui.element('install-sideout').handlers.click();
  assert.equal(ui.element('install-dialog').open, true);
  assert.match(ui.element('install-instructions').textContent, /Safari.*Add to Home Screen/);
  assert.equal(ui.element('install-confirm').hidden, true);
});
test('install prompt is consumed once, cancellation retains manual guidance, successful installation hides banner', async () => {
  const ui = installUI();
  let shown = 0;
  ui.events.beforeinstallprompt({preventDefault() {}, async prompt() { shown++; }, userChoice: Promise.resolve({outcome: 'dismissed'})});
  assert.equal(ui.element('install-confirm').hidden, false);
  await ui.element('install-confirm').handlers.click();
  await ui.element('install-confirm').handlers.click();
  assert.equal(shown, 1);
  assert.equal(ui.element('install-confirm').hidden, true);
  assert.match(ui.element('install-status').textContent, /later/);
  ui.events.appinstalled();
  assert.equal(ui.element('install-banner').hidden, true);
});
test('installed standalone windows omit the installation banner', () => {
  assert.equal(installUI({standalone: true}).element('install-banner').hidden, true);
});
