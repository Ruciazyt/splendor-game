'use strict';
/**
 * 子路径挂载测试：BASE_PATH=/splendor 时应用应跑在 /splendor/ 下。
 * 用法： node tools/basepath-test.js [port]
 */
const http = require('http');
const { startTestServer, stopTestServer } = require('./test-server.js');
const { connect } = require('./ws-client.js');
let failed = 0;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) { console.log('  \u2717 ' + msg); failed++; } else console.log('  \u2713 ' + msg);
}
function get(port, path) {
  return new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

(async () => {
  const PORT = Number(process.argv[2] || 3197);
  const srv = await startTestServer(PORT, { BASE_PATH: '/splendor' });
  process.on('exit', () => stopTestServer(srv));

  console.log('静态资源：');
  const root = await get(PORT, '/splendor/');
  assert(root.status === 200, '/splendor/ 返回 200');
  assert(root.body.indexOf('璀璨宝石') >= 0, '首页内容正确');
  assert(/window\.__BASE__\s*=\s*"\/splendor"/.test(root.body), '页面注入了挂载前缀 /splendor');
  assert(/href="css\/style\.css/.test(root.body), '样式表使用相对路径（子路径下不会 404）');
  const noSlash = await get(PORT, '/splendor');
  assert(noSlash.status === 301, '/splendor 重定向到 /splendor/（保证相对路径正确）');
  const css = await get(PORT, '/splendor/css/style.css');
  assert(css.status === 200 && /--paper/.test(css.body), '子路径下的样式表可访问');
  const asset = await get(PORT, '/splendor/assets/tokens/white.png');
  assert(asset.status === 200, '子路径下的原版素材可访问');
  const bare = await get(PORT, '/');
  assert(bare.status === 404, '根路径不再暴露应用（只挂子路径）');

  console.log('WebSocket：');
  let ok = false;
  try {
    const ws = await connect('ws://127.0.0.1:' + PORT + '/splendor/ws');
    const seen = [];
    ws.onMessage((m) => seen.push(m.t));
    ws.send({ t: 'hello', name: '子路径测试' });
    await wait(1200);
    ok = seen.indexOf('hello_ok') >= 0;
    ws.send({ t: 'leave' });
  } catch (e) { ok = false; }
  assert(ok, 'WebSocket 握手在 /splendor/ws 上成功');

  console.log(failed ? '\n有 ' + failed + ' 项断言失败' : '\n全部通过 \u2713');
  process.exit(failed ? 1 : 0);
})();