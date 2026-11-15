'use strict';
/**
 * 《璀璨宝石》基础版规则测试
 * 全部用例依据官方中文规则书（玩樂小子/Asmodee 版），把四条动作与各项限制固化为断言，
 * 防止后续改动破坏规则。
 * 用法： node tools/test/rules-test.js
 */
const { Game } = require('../../server/game.js');

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  \u2713 ' + name); }
  else { failed++; console.log('  \u2717 ' + name + (detail ? '  -> ' + detail : '')); }
}
function group(title) { console.log('\n' + title); }

function newGame(playerCount = 3) {
  const seats = [];
  for (let i = 0; i < playerCount; i++) seats.push({ index: i, name: 'P' + (i + 1) });
  return new Game({ mode: 'hotseat', seats, playerCount });
}
// 以指定玩家身份行动（测试里直接控制回合，保证用例确定性）
function actAs(g, idx, action) { g.turn = idx; return g.applyAction(idx, action); }
const first = (g, n = 1) => g.players.slice(0, n);

/* ================= 设置 ================= */
group('设置');
{
  const g4 = newGame(4);
  ok('4 人局：每色 7 个宝石', g4.tokens.white === 7 && g4.tokens.black === 7, 'white=' + g4.tokens.white);
  ok('4 人局：黄金 5 个', g4.tokens.gold === 5, 'gold=' + g4.tokens.gold);
  ok('4 人局：翻开 5 片贵族（人数+1）', g4.nobles.length === 5, 'nobles=' + g4.nobles.length);

  const g3 = newGame(3);
  ok('3 人局：每色移除 2 个（剩 5）', g3.tokens.white === 5, 'white=' + g3.tokens.white);
  ok('3 人局：黄金不变（5 个）', g3.tokens.gold === 5);
  ok('3 人局：翻开 4 片贵族', g3.nobles.length === 4);

  const g2 = newGame(2);
  ok('2 人局：每色移除 3 个（剩 4）', g2.tokens.white === 4, 'white=' + g2.tokens.white);
  ok('2 人局：黄金不变', g2.tokens.gold === 5);
  ok('2 人局：翻开 3 片贵族', g2.nobles.length === 3);

  const g = newGame(3);
  ok('发展卡共 90 张', g.decks.reduce((a, d) => a + d.length, 0) + g.market.reduce((a, r) => a + r.length, 0) === 90);
  ok('三个等级：40 / 30 / 20 张', g.decks.map((d) => d.length).join('/') === '36/26/16', g.decks.map((d) => d.length).join('/'));
  ok('每级场上翻开 4 张', g.market.every((r) => r.length === 4));
}

/* ================= 动作一：拿 3 种不同颜色 ================= */
group('动作一：拿走 3 个不同颜色的指示物');
{
  const g = newGame(3);
  let r = actAs(g, 0, { type: 'take', tokens: { white: 1, blue: 1, red: 1 } });
  ok('可拿 3 种不同颜色', r.ok, r.error);
  ok('3 个指示物进入玩家手中', g.players[0].tokens.white === 1 && g.players[0].tokens.blue === 1 && g.players[0].tokens.red === 1);
  ok('场上对应减少', g.tokens.white === 4 && g.tokens.blue === 4 && g.tokens.red === 4);

  r = actAs(g, 0, { type: 'take', tokens: { white: 1, blue: 1 } });
  ok('颜色够时必须拿满 3 种', !r.ok && /3 种/.test(r.error || ''), r.error);

  r = actAs(g, 0, { type: 'take', tokens: { white: 2 } });
  ok('同一次不能拿 2 个同色', !r.ok, r.error);

  r = actAs(g, 0, { type: 'take', tokens: { white: 1, blue: 1, red: 1, green: 1 } });
  ok('一次最多 3 种颜色', !r.ok, r.error);

  r = actAs(g, 0, { type: 'take', tokens: { gold: 1 } });
  ok('黄金不在「拿 3 种不同颜色」的动作内', !r.ok && /黃金|保留/.test(r.error || ''), r.error);
}

/* ================= 动作二：拿 2 个同色 ================= */
group('动作二：拿走 2 个相同颜色的指示物');
{
  const g = newGame(3);
  let r = actAs(g, 0, { type: 'take2', color: 'red' });
  ok('场上 ≥4 个时可拿 2 个同色', r.ok, r.error);
  ok('玩家拿到 2 颗红宝石', g.players[0].tokens.red === 2);
  ok('场上减少 2 个', g.tokens.red === 3);

  g.tokens.green = 3;
  r = actAs(g, 0, { type: 'take2', color: 'green' });
  ok('场上不足 4 个时不可拿 2 个', !r.ok && /4 个/.test(r.error || ''), r.error);

  r = actAs(g, 0, { type: 'take2', color: 'gold' });
  ok('黄金不可拿 2 个', !r.ok, r.error);
}

/* ================= 动作三：保留发展卡 ================= */
group('动作三：保留一张发展卡（并拿走 1 个黄金）');
{
  const g = newGame(3);
  let r = actAs(g, 0, { type: 'reserve', source: 'market', level: 1, index: 0 });
  ok('可保留场上翻开的一张卡', r.ok, r.error);
  ok('保留后进入手牌', g.players[0].reserved.length === 1);
  ok('保留时拿走 1 个黄金', g.players[0].tokens.gold === 1 && g.tokens.gold === 4);

  r = actAs(g, 0, { type: 'reserve', source: 'deck', level: 3 });
  ok('可从牌库顶盲抽一张保留', r.ok, r.error);
  ok('盲抽的卡进手牌', g.players[0].reserved.length === 2);

  g.players[0].reserved.push({ level: 2, points: 1, bonus: { color: 'blue', count: 1 }, cost: {} });
  r = actAs(g, 0, { type: 'reserve', source: 'deck', level: 2 });
  ok('保留上限 3 张', !r.ok && /3 张/.test(r.error || ''), r.error);

  const g5 = newGame(3);
  g5.tokens.gold = 0;
  r = actAs(g5, 0, { type: 'reserve', source: 'deck', level: 1 });
  ok('场上没有黄金时仍可保留卡', r.ok, r.error);
  ok('没有黄金时不会凭空获得黄金', g5.players[0].tokens.gold === 0);
}

/* ================= 动作四：购买发展卡 ================= */
group('动作四：购买一张发展卡');
{
  const g = newGame(3);
  const card = g.market[0][0];
  const cost = card.cost;
  const need = ['white', 'blue', 'red', 'green', 'black'].reduce((a, c) => a + (cost[c] || 0), 0);
  // 备齐指示物
  for (const c of ['white', 'blue', 'red', 'green', 'black']) {
    g.players[0].tokens[c] = Math.max(g.players[0].tokens[c], cost[c] || 0);
  }
  let r = actAs(g, 0, { type: 'buy', source: 'market', level: 1, index: 0 });
  ok('付得起即可购买', r.ok, r.error);
  ok('购买后卡进入已购区', g.players[0].bought.length === 1);
  ok('获得声望点数', g.players[0].points === card.points, 'points=' + g.players[0].points);
  ok('获得红利点数', g.players[0].bonuses[card.bonus.color] === card.bonus.count);
  ok('场上该位置的卡被补上', g.market[0].length === 4);

  const g2 = newGame(3);
  r = actAs(g2, 0, { type: 'buy', source: 'market', level: 1, index: 0 });
  ok('指示物不足无法购买', !r.ok, r.error);
  ok('购买失败后卡仍在场上', g2.market[0].length === 4 && g2.market[0][0] !== null);

  // 红利抵扣 + 黄金万能
  const g3 = newGame(3);
  const c3 = g3.market[0][0];
  const bonusColor = c3.bonus.color;
  g3.players[0].bonuses[bonusColor] = c3.cost[bonusColor] || 0; // 用红利抵掉该色
  const rest = ['white', 'blue', 'red', 'green', 'black'].reduce((a, c) => a + Math.max(0, (c3.cost[c] || 0) - (c3.bonus.color === c ? 0 : 0)), 0);
  for (const c of ['white', 'blue', 'red', 'green', 'black']) {
    const due = Math.max(0, (c3.cost[c] || 0) - (c3.bonus.color === c ? c3.bonus.count : 0));
    g3.players[0].tokens[c] = due;
  }
  r = actAs(g3, 0, { type: 'buy', source: 'market', level: 1, index: 0 });
  ok('红利可抵扣同色费用', r.ok, r.error);

  const g4 = newGame(3);
  const c4 = g4.market[0][0];
  g4.players[0].tokens.gold = 5;
  r = actAs(g4, 0, { type: 'buy', source: 'market', level: 1, index: 0 });
  ok('黄金可代替任意颜色支付', r.ok, r.error);
  const totalCost = ['white', 'blue', 'red', 'green', 'black'].reduce((a, c) => a + (c4.cost[c] || 0), 0);
  ok('支付的黄金回到场中', g4.tokens.gold === 5 + totalCost,
    'gold=' + g4.tokens.gold + '（场上原有 5 + 支付 ' + totalCost + ' 全额转回）');
}

/* ================= 红利与贵族 ================= */
group('红利与贵族拜访');
{
  const g = newGame(3);
  const card = g.market[0][0];
  g.players[0].bonuses[card.bonus.color] = 3;
  // 造出一片需求可满足的贵族
  const n = g.nobles[0];
  n.require = { white: 0, blue: 0, red: 0, green: 0, black: 0 };
  n.require[card.bonus.color] = 1;
  const r = actAs(g, 0, { type: 'take', tokens: { white: 1, blue: 1, red: 1 } });
  ok('回合结束时自动获得贵族拜访', g.players[0].nobles.length === 1, 'nobles=' + g.players[0].nobles.length);
  ok('贵族值 3 点声望', g.players[0].points === 3, 'points=' + g.players[0].points);
}

/* ================= 持有上限 ================= */
group('手上指示物上限 10 个');
{
  const g = newGame(3);
  for (let i = 0; i < 4; i++) {
    g.tokens.white = 5; g.tokens.blue = 5; g.tokens.red = 5;
    actAs(g, 0, { type: 'take', tokens: { white: 1, blue: 1, red: 1 } });
    if (g.phase === 'returnTokens') break;
  }
  ok('超过 10 个时进入放回流程', g.phase === 'returnTokens', 'phase=' + g.phase);
  if (g.phase === 'returnTokens') {
    const excess = g.pending.excess;
    ok('超出数量正确', excess === g.players[0].tokens.white + g.players[0].tokens.blue + g.players[0].tokens.red - 10);
    const r = actAs(g, 0, { type: 'returnTokens', tokens: { white: excess } });
    ok('放回多余指示物后可继续', r.ok, r.error);
    ok('放回后手上回到 10 个', g.players[0].tokens.white + g.players[0].tokens.blue + g.players[0].tokens.red === 10);
  }
}

/* ================= 终局 ================= */
group('终局判定（15 点）');
{
  const g = newGame(3);
  g.players[0].points = 16;
  const r = actAs(g, 0, { type: 'take', tokens: { white: 1, blue: 1, red: 1 } });
  ok('达到 15 点后进入最终轮', !!g.finalRound, JSON.stringify(g.finalRound));
  ok('最终轮记录触发者回合数', g.finalRound && g.finalRound.targetTurns >= 1);
}

console.log('\n' + (failed ? '失败 ' + failed + ' 项' : '全部通过') + '（共 ' + (passed + failed) + ' 项）✓');
process.exit(failed ? 1 : 0);
