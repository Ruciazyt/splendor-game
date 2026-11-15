'use strict';
/**
 * 静态资源缓存测试：图片素材长期缓存 + 协商缓存（ETag/304），
 * 保证牌桌重绘时不会反复请求卡片图片。
 * 用法： node tools/cache-test.js [port]
 */
const http = require('http');
const { startTestServer, stopTestServer } = require('./test-server.js');
let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.log('  \u2717 ' + msg); failed++; } else console.log('  \u2713 ' + msg);
}
function get(port, path, headers) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path, headers: headers || {} }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

(async () => {
  const PORT = Number(process.argv[2] || 3196);
  const srv = await startTestServer(PORT);
  process.on('exit', () => stopTestServer(srv));

  console.log('图片素材（卡片 / 指示物 / 贵族）：');
  const img = await get(PORT, '/assets/cards/dev_I_01.png');
  assert(img.status === 200, '图片可访问');
  assert(/public/.test(img.headers['cache-control'] || '') && /max-age=(\d+)/.test(img.headers['cache-control'] || ''),
    '图片带长期缓存（public, max-age=…），重绘不再发请求');
  assert(!!img.headers.etag, '图片带 ETag');
  const img304 = await get(PORT, '/assets/cards/dev_I_01.png', { 'If-None-Match': img.headers.etag });
  assert(img304.status === 304, '命中 ETag 时返回 304，不重复传输');

  console.log('代码（html / css / js）：');
  const html = await get(PORT, '/');
  assert(html.status === 200, '首页可访问');
  assert(/no-cache/.test(html.headers['cache-control'] || ''), '首页需每次校验（改了立刻生效）');
  assert(/\?v=\d+/.test(html.body), '首页给 css/js 带上自动版本号');
  const js = await get(PORT, '/js/main.js');
  assert(/no-cache/.test(js.headers['cache-control'] || ''), '脚本需每次校验');
  assert(!!js.headers.etag, '脚本带 ETag');
  const js304 = await get(PORT, '/js/main.js', { 'If-None-Match': js.headers.etag });
  assert(js304.status === 304 && js304.body === '', '脚本命中 ETag 时 304 且无响应体');

  console.log(failed ? '\n有 ' + failed + ' 项断言失败' : '\n全部通过 \u2713');
  process.exit(failed ? 1 : 0);
})();