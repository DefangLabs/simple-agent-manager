'use strict';
// Synthetic multipart receiver for the retained Playwright APIRequestContext upload shape.
// Run from the repository root; no auth, fixture IDs, payloads, or external network calls.
const assert = require('node:assert/strict');
const http = require('node:http');
const { Readable } = require('node:stream');
const path = require('node:path');
const { request } = require(require.resolve('@playwright/test', { paths: [path.resolve('apps/web')] }));
const payload = Buffer.alloc(4_096_000, 0x61);
const summary = { client: {}, proxy: {}, node: {} };
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
(async () => {
  const node = http.createServer(async (req, res) => {
    summary.node.method = req.method;
    summary.node.type = req.headers['content-type'];
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    summary.node.bytes = bytes.length;
    const parsed = await new Response(bytes, { headers: { 'content-type': summary.node.type } }).formData();
    summary.node.fields = [...parsed.keys()].sort();
    summary.node.destination = parsed.get('destination');
    const file = parsed.get('files');
    summary.node.fileName = file.name;
    summary.node.fileType = file.type;
    summary.node.fileBytes = file.size;
    summary.node.fileMatches = Buffer.compare(Buffer.from(await file.arrayBuffer()), payload) === 0;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  const nodePort = await listen(node);
  const proxy = http.createServer(async (req, res) => {
    try {
      summary.proxy.type = req.headers['content-type'];
      summary.proxy.contentLength = Number(req.headers['content-length']);
      const source = Readable.toWeb(req);
      summary.proxy.initialLocked = source.locked;
      let seen = 0;
      const body = source.pipeThrough(new TransformStream({ transform(chunk, controller) { seen += chunk.byteLength; controller.enqueue(chunk); } }));
      summary.proxy.afterPipeLocked = source.locked;
      const upstream = await fetch(`http://127.0.0.1:${nodePort}/workspaces/local/files/upload`, {
        method: 'POST', headers: { 'content-type': summary.proxy.type }, body, duplex: 'half',
      });
      summary.proxy.streamBytes = seen;
      summary.proxy.upstreamStatus = upstream.status;
      res.writeHead(upstream.status, { 'content-type': 'application/json' });
      res.end(await upstream.text());
    } catch (error) {
      summary.proxy.errorName = error.name;
      summary.proxy.errorCategory = String(error.message).includes('Network connection lost') ? 'network_connection_lost' : 'other';
      res.writeHead(500); res.end();
    }
  });
  const proxyPort = await listen(proxy);
  const context = await request.newContext({ baseURL: `http://127.0.0.1:${proxyPort}` });
  try {
    summary.client.statuses = [];
    for (let index = 0; index < 2; index++) {
      const response = await context.fetch('/api/projects/local/sessions/local/files/upload', { method: 'POST', multipart: {
        destination: '../.private',
        files: { name: 'bundle.part-15', mimeType: 'application/octet-stream', buffer: Buffer.from(payload) },
      }, timeout: 120000 });
      summary.client.statuses.push(response.status());
      await response.json();
    }
  } finally { await context.dispose(); await close(proxy); await close(node); }
  assert.deepEqual(summary.client.statuses, [200, 200]);
  assert.match(summary.proxy.type, /^multipart\/form-data; boundary=/);
  assert.equal(summary.proxy.contentLength, 4_096_312);
  assert.equal(summary.proxy.initialLocked, false);
  assert.equal(summary.proxy.afterPipeLocked, true);
  assert.equal(summary.proxy.streamBytes, 4_096_312);
  assert.equal(summary.proxy.upstreamStatus, 200);
  assert.equal(summary.node.bytes, 4_096_312);
  assert.equal(summary.node.type, summary.proxy.type);
  assert.deepEqual(summary.node.fields, ['destination', 'files']);
  assert.equal(summary.node.destination, '../.private');
  assert.equal(summary.node.fileName, 'bundle.part-15');
  assert.equal(summary.node.fileType, 'application/octet-stream');
  assert.equal(summary.node.fileBytes, 4_096_000);
  assert.equal(summary.node.fileMatches, true);
  console.log('PASS: two retained-context multipart requests crossed the local streamed proxy with complete bytes and fields');
})().catch(error => { console.error(error.name, error.message); process.exitCode = 1; });
