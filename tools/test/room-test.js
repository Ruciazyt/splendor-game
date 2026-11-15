'use strict';
/**
 * 多房间测试：新建房间 / 按房间码加入 / 房间之间互相隔离 / 主桌默认存在。
 * 用法： node tools/test/room-test.js [port]
 */
const { startTestServer, stopTestServer } = require('./test-server.js');
const { connect } = require('./ws-client.js');
let failed = 0;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) { console.log('  x ' + msg); failed++; } else console.log('  OK ' + msg);
}
function names(cl) {
  return ((cl.lobby || {}).players || []).map((p) => p.name);
}

(async () => {
  const srv = await startTestServer(Number(process.argv[2] || 3197));
  process.on('exit', () => stopTestServer(srv));
  const PORT = srv.port;

  // A 新建房间
  const A = await connect('ws://127.0.0.1:' + PORT + '/ws');
  A.onMessage((m) => { if (m.t === 'hello_ok') A.hello = m; });
  A.send({ t: 'hello', name: '房主', create: true });
  await wait(400);
  const roomA = A.hello && A.hello.room;
  console.log('房间：');
  assert(!!roomA && roomA !== 'main', '新建房间返回房间码 ' + roomA);
  assert(A.lobby && A.lobby.room === roomA, '大厅带同一个房间号');
  assert(!A.lobby.isDefault, '自建房间不是主桌');

  // B 用房间码加入
  const B = await connect('ws://127.0.0.1:' + PORT + '/ws');
  B.onMessage((m) => { if (m.t === 'hello_ok') B.hello = m; });
  B.send({ t: 'hello', name: '好友', room: roomA });
  await wait(400);
  assert(B.hello && B.hello.room === roomA, '好友按房间码进入同一房间');
  assert(names(A).indexOf('好友') !== -1, 'A 的大厅能看到好友');

  // C 新建另一个房间
  const C = await connect('ws://127.0.0.1:' + PORT + '/ws');
  C.onMessage((m) => { if (m.t === 'hello_ok') C.hello = m; });
  C.send({ t: 'hello', name: '外人', create: true });
  await wait(400);
  const roomC = C.hello && C.hello.room;
  assert(roomC !== roomA, '第二个房间的码与第一个不同');
  assert(names(C).indexOf('好友') === -1, 'C 看不到别的房间的人');
  assert(names(A).indexOf('外人') === -1, 'A 也看不到 C');

  // 房间内开局互不影响
  console.log('对局隔离：');
  A.send({ t: 'sit', seat: 0 });
  await wait(200);
  B.send({ t: 'sit', seat: 1 });
  await wait(300);
  A.send({ t: 'start', mode: 'online' });
  await wait(600);
  assert(!!A.state && A.state.mode === 'online', '房间 A 正常开局');
  assert(!!B.state, '房间 B 的成员也收到对局状态');
  assert(!C.state, '房间 C 不受影响');

  // 主桌：不带房间码进默认房间
  const D = await connect('ws://127.0.0.1:' + PORT + '/ws');
  D.onMessage((m) => { if (m.t === 'hello_ok') D.hello = m; });
  D.send({ t: 'hello', name: '主桌客' });
  await wait(400);
  assert(D.hello && D.hello.room === 'MAIN', '不带房间码进入主桌');
  assert(D.lobby && D.lobby.isDefault === true, '主桌标记正确');
  assert(names(D).length === 1, '主桌只有自己，与其他房间隔离');

  // 房间里改名
  console.log('改名：');
  A.send({ t: 'rename', name: '房主二号' });
  await wait(350);
  assert(names(A).indexOf('房主二号') !== -1, '改名后大厅显示新昵称');
  assert(names(B).indexOf('房主二号') !== -1, '房间里其他人也看到新昵称');
  A.send({ t: 'rename', name: '   ' });
  await wait(300);
  assert(A.errors.some((m) => /昵称/.test(m)), '空昵称被拒绝');
  assert(names(A).indexOf('房主二号') !== -1, '被拒绝后昵称保持不变');

  console.log('');
  console.log(failed ? '有 ' + failed + ' 项失败' : '全部通过 ✓');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
