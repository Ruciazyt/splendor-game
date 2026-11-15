'use strict';
/**
 * 不活跃对局回收测试：对局长时间无操作会被结束并回收；有任何操作则不会。
 * 用 IDLE_GAME_MS / IDLE_WARN_MS 把 5 分钟缩短成秒级来验证。
 * 用法： node tools/test/idle-test.js [port]
 */
const { startTestServer, stopTestServer } = require('./test-server.js');
const { connect } = require('./ws-client.js');
let failed = 0;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) { console.log('  x ' + msg); failed++; } else console.log('  OK ' + msg);
}
// 轮询等待某个条件成立
async function waitFor(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await wait(150);
  }
  return false;
}

(async () => {
  const srv = await startTestServer(Number(process.argv[2] || 3196), {
    IDLE_GAME_MS: '4000',
    IDLE_WARN_MS: '2000'
  });
  process.on('exit', () => stopTestServer(srv));
  const PORT = srv.port;

  const A = await connect('ws://127.0.0.1:' + PORT + '/ws');
  const B = await connect('ws://127.0.0.1:' + PORT + '/ws');
  A.onMessage((m) => { if (m.t === 'hello_ok') A.hello = m; if (m.t === 'game_end') A.gameEnded = true; });
  B.onMessage((m) => { if (m.t === 'hello_ok') B.hello = m; if (m.t === 'game_end') B.gameEnded = true; });

  A.send({ t: 'hello', name: '甲', create: true });
  await wait(300);
  const room = A.hello && A.hello.room;
  B.send({ t: 'hello', name: '乙', room });
  await wait(300);
  A.send({ t: 'sit', seat: 0 });
  await wait(150);
  B.send({ t: 'sit', seat: 1 });
  await wait(300);
  A.send({ t: 'start', mode: 'online' });
  await wait(500);
  assert(!!A.state && A.state.mode === 'online', '对局已开始');

  // 场景一：一直没人操作 → 提醒 + 回收
  console.log('停滞回收：');
  assert(await waitFor(() => A.errors.some((m) => /停滞/.test(m)), 15000), '超时前给了一次停滞提醒');
  assert(await waitFor(() => !!A.gameEnded, 15000), '超时后收到 game_end（对局被结束）');
  assert(!!B.gameEnded, '房间里另一端也收到 game_end');
  await wait(400);
  assert(!(A.lobby && A.lobby.gameStarted), '房间里的对局状态已清除');

  // 场景二：一直在操作 → 不会被回收
  console.log('活跃对局：');
  const C = await connect('ws://127.0.0.1:' + PORT + '/ws');
  const D = await connect('ws://127.0.0.1:' + PORT + '/ws');
  C.onMessage((m) => { if (m.t === 'hello_ok') C.hello = m; if (m.t === 'game_end') C.gameEnded = true; });
  D.onMessage((m) => { if (m.t === 'hello_ok') D.hello = m; if (m.t === 'game_end') D.gameEnded = true; });
  C.send({ t: 'hello', name: '丙', create: true });
  await wait(300);
  const room2 = C.hello && C.hello.room;
  D.send({ t: 'hello', name: '丁', room: room2 });
  await wait(300);
  C.send({ t: 'sit', seat: 0 });
  await wait(150);
  D.send({ t: 'sit', seat: 1 });
  await wait(300);
  C.send({ t: 'start', mode: 'online' });
  await wait(400);
  assert(!!C.state && C.state.mode === 'online', '第二个对局已开始');
  // 每 700ms 动一下，模拟有人在玩
  for (let i = 0; i < 8; i++) {
    await wait(700);
    C.send({ t: 'sit', seat: 0 });
  }
  assert(!C.gameEnded, '一直有操作 → 对局不会被回收');
  assert(!!C.state, '对局状态还在');

  console.log('');
  console.log(failed ? '有 ' + failed + ' 项失败' : '全部通过 ✓');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
