'use strict';
/**
 * 联机模式测试：多个客户端入座、开局、行动，校验私有信息隔离与权限控制。
 * 用法： node tools/multiplayer-test.js [port]
 */
const { startTestServer, stopTestServer } = require('./test-server.js');
const { connect } = require('./ws-client.js');
let failed = 0;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) { console.log('  ✗ ' + msg); failed++; } else console.log('  ✓ ' + msg);
}

(async () => {
  // 自带独立服务端，避免其它客户端干扰对局
  const srv = await startTestServer(Number(process.argv[2] || 3198));
  process.on('exit', () => stopTestServer(srv));
  const PORT = srv.port;
  const A = await connect('ws://127.0.0.1:' + PORT + '/ws');
  const B = await connect('ws://127.0.0.1:' + PORT + '/ws');
  const me = { A: '甲', B: '乙' };

  A.send({ t: 'hello', name: me.A });
  await wait(300);
  B.send({ t: 'hello', name: me.B });
  await wait(300);
  // 显式占座，保证席位确定
  A.send({ t: 'sit', seat: 0 });
  await wait(200);
  B.send({ t: 'sit', seat: 1 });
  await wait(300);

  console.log('大厅：');
  const seats = (A.lobby || {}).players || [];
  assert(seats.some((p) => p.name === '甲') && seats.some((p) => p.name === '乙'), '双方都进入牌桌');
  assert(seats.filter((p) => p.isHost).length === 1, '有且只有一位房主');
  const hostName = seats.find((p) => p.isHost).name;
  const host = hostName === '甲' ? A : B;

  host.send({ t: 'take_host' });
  await wait(250);
  host.send({ t: 'start', mode: 'online' });
  await wait(500);
  const state = A.state || B.state || null;
  console.log('开局：');
  assert(!!state, '双方进入对局');
  if (!state) { process.exit(1); }
  assert(state.mode === 'online', '模式为联机');
  assert(state.nobles.length === state.players.length + 1, '贵族圆板数量 = 人数 + 1');
  assert(state.market.every((row) => row.length === 4), '每个等级翻开 4 张发展卡');
  assert(state.deckCounts.reduce((a, b) => a + b, 0) + 12 === 90, '牌库剩余 + 场上 = 90 张');

  // 找到当前行动者（每一步都重新根据最新状态判断）
  const clients = [{ c: A, n: '甲' }, { c: B, n: '乙' }];
  const seatOf = (client) => (client.state ? client.state.you.seat : null);
  const currentOf = () => {
    const st = A.state || B.state;
    const who = clients.find((x) => seatOf(x.c) === st.turn);
    return who ? who : clients[0];
  };
  const otherOf = (who) => clients.find((x) => x !== who);

  // 若牌桌还有其他客户端（如浏览器）占着当前回合，由房主跳过，先把回合交给测试客户端
  for (let i = 0; i < 4; i++) {
    const st = A.state || B.state;
    const mine = [A, B].map((c) => seatOf(c));
    if (mine.indexOf(st.turn) !== -1) break;
    host.send({ t: 'skip' });
    await wait(400);
  }

  console.log('私有信息：');
  let current = currentOf();
  let other = otherOf(current);
  const curSeat = seatOf(current.c);
  current.c.send({ t: 'act', action: { type: 'reserve', source: 'market', level: 3, index: 0 } });
  await wait(450);
  const selfView = current.c.state.players.find((p) => p.index === curSeat);
  const otherViewOfCur = other.c.state.players.find((p) => p.index === curSeat);
  assert(selfView.reservedCount === 1, '本人能看到自己保留的 1 张卡');
  assert(otherViewOfCur.reservedCount === 1, '他人能看到保留数量');
  assert(otherViewOfCur.reserved.length === 0, '他人看不到保留卡内容');

  console.log('权限：');
  current = currentOf();
  other = otherOf(current);
  const errBefore = other.c.errors.length;
  other.c.send({ t: 'act', action: { type: 'take', tokens: { white: 1, blue: 1, red: 1 } } });
  await wait(350);
  assert(other.c.errors.length > errBefore, '非当前玩家行动被拒绝：' + (other.c.errors[other.c.errors.length - 1] || ''));

  current = currentOf();
  const turnBefore = current.c.state.turn;
  const seatNow = seatOf(current.c);
  current.c.send({ t: 'act', action: { type: 'take', tokens: { white: 1, blue: 1, red: 1 } } });
  await wait(450);
  assert(current.c.state.turn !== turnBefore, '行动后回合切换');
  const curTokens = current.c.state.players.find((p) => p.index === seatNow).tokens;
  assert(curTokens.white + curTokens.blue + curTokens.red === 3, '拿到的 3 个指示物已入账');

  console.log('房主轮换：');
  // 房主结束本局后，**非房主**也能直接开新局（房间不会因为某人掉线而卡死）
  const hostRec = host;
  const otherRec = hostRec === A ? B : A;
  hostRec.send({ t: 'reset' });
  await wait(500);
  const errsBefore = otherRec.errors.length;
  otherRec.send({ t: 'start', mode: 'online' });
  await wait(600);
  assert(otherRec.errors.length === errsBefore, '非房主也能开局：' + (otherRec.errors[otherRec.errors.length - 1] || ''));
  assert(!!otherRec.state && otherRec.state.mode === 'online', '非房主开局后对局正常进行');
  assert(!!otherRec.state.you && otherRec.state.you.isGameHost === true, '开局者成为本局房主');

  console.log('断线重连：');
  const token = current.c.state.you.token;
  const name = current.n;
  current.c.send({ t: 'leave' });
  await wait(350);
  const C = await connect('ws://127.0.0.1:' + PORT + '/ws');
  C.send({ t: 'hello', name, token });
  await wait(450);
  assert(!!C.state, '重连后直接回到对局');
  const reSeats = (C.lobby || {}).players || [];
  assert(reSeats.filter((p) => p.name === name).length === 1, '重连后牌桌上只有一位同名玩家');
  assert(reSeats.filter((p) => p.name === name)[0].seat === seatNow, '重连后回到原席位');

  A.send({ t: 'leave' });
  B.send({ t: 'leave' });
  await wait(200);
  console.log(failed ? '\n有 ' + failed + ' 项断言失败' : '\n全部通过 ✓');
  process.exit(failed ? 1 : 0);
})();
