'use strict';
/**
 * 混合模式测试：1 位联机好友 + 2 位本机热座玩家同桌。
 * 验证席位归属、回合权限、保留卡私密性。
 * 用法： node tools/test/mixed-test.js [port]
 */
const { startTestServer, stopTestServer } = require('./test-server.js');
const { connect } = require('./ws-client.js');
let failed = 0;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) { console.log('  \u2717 ' + msg); failed++; } else console.log('  \u2713 ' + msg);
}

(async () => {
  const srv = await startTestServer(Number(process.argv[2] || 3199));
  process.on('exit', () => stopTestServer(srv));
  const PORT = srv.port;
  const A = await connect('ws://127.0.0.1:' + PORT + '/ws'); // 房主 / 热座设备
  const B = await connect('ws://127.0.0.1:' + PORT + '/ws'); // 联机好友

  A.send({ t: 'hello', name: '本机' });
  await wait(300);
  B.send({ t: 'hello', name: '好友' });
  await wait(300);

  // 房主先腾出自己的位置，再让好友占 0 号席位（联机席位）
  A.send({ t: 'stand' });
  await wait(250);
  B.send({ t: 'sit', seat: 0 });
  await wait(250);

  console.log('大厅：');
  assert(!!A.lobby && A.lobby.players.some((p) => p.name === '好友'), '好友已进入牌桌');
  assert(A.lobby.players.filter((p) => p.isHost).length === 1, '有且只有一位房主');

  // 房主把 1、2 号席位标记为本机热座席位
  A.send({ t: 'mark_hotseat', seat: 1, on: true });
  await wait(180);
  A.send({ t: 'mark_hotseat', seat: 2, on: true });
  await wait(250);
  assert(!!A.lobby.hotseatSeats && A.lobby.hotseatSeats.length === 2, '大厅出现 2 个热座席位');

  // 非房主不能标记热座
  B.send({ t: 'mark_hotseat', seat: 3, on: true });
  await wait(250);
  assert(B.errors.length > 0, '非房主不能设置热座席位：' + (B.errors[B.errors.length - 1] || ''));

  // 取消标记后再标回来，确认开关可用
  A.send({ t: 'mark_hotseat', seat: 1, on: false });
  await wait(250);
  assert(A.lobby.hotseatSeats.length === 1, '可以取消热座席位标记');
  A.send({ t: 'mark_hotseat', seat: 1, on: true });
  await wait(250);
  assert(A.lobby.hotseatSeats.length === 2, '可以重新标记热座席位');

  A.send({ t: 'start', mode: 'online' });
  await wait(700);

  const st = A.state;
  const stB = B.state;
  console.log('开局：');
  assert(!!st && st.mode === 'mixed', '模式为 mixed（联机 + 热座混用）');
  assert(st.players.length === 3, '共 3 位玩家');
  assert(st.nobles.length === 4, '贵族圆板数量 = 人数 + 1');
  assert(st.you.seat === -1, '热座设备没有联网席位');
  assert(JSON.stringify(st.you.hotseatSeats) === JSON.stringify([1, 2]), '热座设备接管 1、2 号席位');
  assert(stB.you.seat === 0, '联机好友的席位是 0 号');
  assert((stB.you.hotseatSeats || []).length === 0, '联机好友不接管任何热座席位');

  console.log('回合与权限：');
  assert(st.turn === 0 && stB.turn === 0, '第 1 回合轮到联机好友');
  const errA0 = A.errors.length;
  A.send({ t: 'act', action: { type: 'take', tokens: { white: 1, blue: 1, red: 1 } } });
  await wait(320);
  assert(A.errors.length > errA0, '热座设备不能替联机玩家行动：' + (A.errors[A.errors.length - 1] || ''));

  B.send({ t: 'act', action: { type: 'take', tokens: { white: 1, blue: 1, red: 1 } } });
  await wait(480);
  assert(A.state.turn === 1, '回合切到 1 号热座席位');

  const errA1 = A.errors.length;
  A.send({ t: 'act', action: { type: 'take', tokens: { white: 1, blue: 1, red: 1 } } });
  await wait(480);
  assert(A.errors.length === errA1, '热座设备可以为本机席位行动');
  assert(A.state.turn === 2, '回合切到 2 号热座席位');

  console.log('私有信息：');
  A.send({ t: 'act', action: { type: 'reserve', source: 'market', level: 3, index: 0 } });
  await wait(480);
  const inA = A.state.players.find((p) => p.index === 2);
  const inB = B.state.players.find((p) => p.index === 2);
  assert(inA.reserved.length === 1, '热座设备能看到本机席位的保留卡');
  assert(inB.reserved.length === 0, '联机好友看不到热座席位的保留卡');
  assert(inB.reservedCount === 1, '联机好友能看到保留数量');

  console.log('单人开局保护：');
  A.send({ t: 'leave' });
  await wait(200);
  B.send({ t: 'leave' });
  await wait(200);
  console.log(failed ? '\n有 ' + failed + ' 项断言失败' : '\n全部通过 \u2713');
  process.exit(failed ? 1 : 0);
})();
