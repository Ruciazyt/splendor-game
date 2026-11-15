'use strict';
/**
 * 冒烟测试：用内置 WebSocket 客户端连上服务端，自动打完整整一局游戏。
 * 用法： node tools/test/smoke-test.js [port]
 */
const http = require('http');
const crypto = require('crypto');

const { startTestServer, stopTestServer } = require('./test-server.js');

function connect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13'
      }
    });
    req.on('upgrade', (res, socket) => {
      socket.setNoDelay(true);
      const state = { buffer: Buffer.alloc(0), handlers: [] };
      state.send = (obj) => {
        const payload = Buffer.from(JSON.stringify(obj), 'utf8');
        const mask = crypto.randomBytes(4);
        let header;
        if (payload.length < 126) { header = Buffer.alloc(2); header[1] = 0x80 | payload.length; }
        else if (payload.length < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
        else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
        header[0] = 0x81;
        const masked = Buffer.allocUnsafe(payload.length);
        for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];
        socket.write(Buffer.concat([header, mask, masked]));
      };
      state.onMessage = (fn) => state.handlers.push(fn);
      socket.on('data', (chunk) => {
        state.buffer = Buffer.concat([state.buffer, chunk]);
        for (;;) {
          const buf = state.buffer;
          if (buf.length < 2) return;
          const opcode = buf[0] & 0x0f;
          let len = buf[1] & 0x7f;
          let off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const payload = buf.slice(off, off + len);
          state.buffer = buf.slice(off + len);
          if (opcode === 1) {
            const msg = JSON.parse(payload.toString('utf8'));
            state.handlers.forEach((h) => h(msg));
          }
        }
      });
      socket.on('error', reject);
      resolve(state);
    });
    req.on('error', reject);
    req.end();
  });
}

const COLORS = ['white', 'blue', 'red', 'green', 'black'];

function pickAction(game, myIndex, blocked) {
  const turn = game.turn;
  const me = game.players[turn];
  const pending = game.pending;
  if (pending && pending.type === 'noble') return { type: 'chooseNoble', nobleId: pending.options[0] };
  if (pending && pending.type === 'returnTokens') {
    const excess = pending.excess;
    const tokens = { ...me.tokens };
    let left = excess;
    const out = {};
    for (const c of [...COLORS, 'gold']) {
      const take = Math.min(left, tokens[c] || 0);
      if (take > 0) { out[c] = take; left -= take; }
    }
    return { type: 'returnTokens', tokens: out };
  }
  // 优先买牌，其次保留，最后拿取
  const market = game.market.flat();
  for (const rowIdx of [2, 1, 0]) {
    const row = game.market[rowIdx];
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      let shortage = 0;
      for (const col of COLORS) {
        const due = Math.max(0, (c.cost[col] || 0) - (me.bonuses[col] || 0));
        shortage += Math.max(0, due - (me.tokens[col] || 0));
      }
      if (shortage <= (me.tokens.gold || 0) && !(blocked && blocked.has(rowIdx + 1 + ':' + i))) {
        return { type: 'buy', source: 'market', level: rowIdx + 1, index: i };
      }
    }
  }
  // 保留：挑一个仍然有卡的等级（固定指向等级3 会在该行买空后反复失败 → 死循环）
  if (me.reserved.length < 3) {
    for (const lvl of [3, 2, 1]) {
      const row = game.market[lvl - 1] || [];
      if (row.length) return { type: 'reserve', source: 'market', level: lvl, index: 0 };
    }
  }
  // 拿取：尽量拿 3 种不同颜色
  // 拿取动作只涉及 5 种寶石指示物，黄金只能靠「保留卡牌」取得
  const avail = COLORS.filter((c) => (game.tokens[c] || 0) > 0);
  const take = {};
  for (const c of avail.slice(0, 3)) take[c] = 1;
  if (Object.keys(take).length) return { type: 'take', tokens: take };
  // 托盘已被拿空：改为买自己的保留卡，再不行就从牌库保留一张（换 1 个黄金）
  for (let i = 0; i < (me.reserved || []).length; i++) {
    const c = me.reserved[i];
    let shortage = 0;
    for (const col of COLORS) {
      const due = Math.max(0, (c.cost[col] || 0) - (me.bonuses[col] || 0));
      shortage += Math.max(0, due - (me.tokens[col] || 0));
    }
    if (shortage <= (me.tokens.gold || 0)) return { type: 'buy', source: 'reserved', index: i };
  }
  if ((me.reserved || []).length < 3) {
    for (const lvl of [3, 2, 1]) {
      if ((game.deckCounts[lvl - 1] || 0) > 0) return { type: 'reserve', source: 'deck', level: lvl };
    }
  }
  // 托盘宝石被拿空、保留卡也买不起 → 本回合无合法动作（罕见边界）
  return null;
}

(async () => {
  // 自带独立服务端，避免其它客户端干扰对局
  const srv = await startTestServer(Number(process.argv[2] || 3199));
  process.on('exit', () => stopTestServer(srv));
  const PORT = srv.port;
  const ws = await connect('ws://127.0.0.1:' + PORT + '/ws');
  let game = null;
  let steps = 0;
  const errors = [];
  const blocked = new Set();
  let skips = 0;
  let lastAction = null;
  ws.onMessage((msg) => {
    if (msg.t === 'hello_ok') {
      ws.send({ t: 'take_host' });
      ws.send({ t: 'start', mode: 'hotseat', names: ['甲', '乙', '丙'] });
    } else if (msg.t === 'state') {
      game = msg.state;
      if (game.phase === 'ended') {
        console.log('\n=== 游戏结束 ===');
        game.results.forEach((r, i) => console.log(`  ${i === 0 ? '★' : ' '} ${r.name}  声望 ${r.points}  卡 ${r.cards}  贵族 ${r.nobles}`));
        console.log('  总步数:', steps, skips ? '（跳过 ' + skips + ' 回合）' : '');
        ws.send({ t: 'leave' });
        if (errors.length) {
          const uniq = [...new Set(errors)];
          console.log('  被拒绝的动作:', errors.length, '次 ->', uniq.join(' / '));
        }
        process.exit(0);
      }
      if (game.pending && game.pending.type === 'returnTokens') {
        const excess = game.pending.excess;
        const me = game.players[game.turn];
        const out = {};
        let left = excess;
        for (const c of [...COLORS, 'gold']) {
          const take = Math.min(left, me.tokens[c] || 0);
          if (take > 0) { out[c] = take; left -= take; }
        }
        ws.send({ t: 'act', action: { type: 'returnTokens', tokens: out } });
        steps++;
        return;
      }
      if (game.pending && game.pending.type === 'noble') {
        ws.send({ t: 'act', action: { type: 'chooseNoble', nobleId: game.pending.options[0] } });
        steps++;
        return;
      }
      const action = pickAction(game, game.turn, blocked);
      lastAction = action;
      steps++;
      if (!action) {
        // 无合法动作时跳过本回合（房主权限），避免死循环
        skips++;
        ws.send({ t: 'skip' });
        return;
      }
      ws.send({ t: 'act', action });
    } else if (msg.t === 'error') {
      errors.push(msg.message);
      if (lastAction && lastAction.type === 'buy') blocked.add(lastAction.level + ':' + lastAction.index);
      const uniq = [...new Set(errors)];
      if (errors.length <= 8) {
        console.log('  [err#' + errors.length + '] ' + msg.message);
        console.log('         action=' + JSON.stringify(lastAction) + ' phase=' + (game && game.phase) +
          ' pending=' + JSON.stringify(game && game.pending) + ' turn=' + (game && game.turn));
      }
      if (errors.length > 40) { console.log('错误过多，停止: ' + uniq.join(' | ')); process.exit(1); }
      // 服务端会紧接着回传最新状态，届时再决定下一步
    }
  });
  ws.send({ t: 'hello', name: '测试员' });
  setTimeout(() => {
    console.log('超时：可能卡在某个状态。当前状态 =', game ? game.phase : 'none', 'steps=', steps);
    process.exit(1);
  }, 60000);
})();
