'use strict';
/**
 * 《璀璨宝石》基础版规则引擎（服务端权威）。
 * 规则依据官方中文规则图（玩樂小子/Asmodee 版）：
 *  - 3 个等级的发展卡（等级1/2/3），每级场上翻开 4 张
 *  - 指示物：每色 7 个（绿/白/蓝/黑/红）+ 黄金 5 个；2 人移除每色 3 个，3 人移除每色 2 个
 *  - 回合四选一：取 3 种不同颜色 / 取 2 个同色（场上该色 >= 4）/ 保留 1 张卡并取 1 黄金 / 购买 1 张卡
 *  - 手上指示物上限 10（含黄金），超出必须放回
 *  - 保留卡上限 3 张，不能弃牌
 *  - 红利点数为永久折扣（不消耗），黄金可代替任意颜色
 *  - 回合结束时检查贵族拜访（不可拒绝，多张可选一张），贵族值 3 点
 *  - 声望点数达到 15 结束该回合，每人回合数相同后结束；平局看购买卡数
 */
const crypto = require('crypto');
const cardsModule = require('../shared/data/cards.js');
const noblesModule = require('../shared/data/nobles.js');

const GEM_COLORS = ['white', 'blue', 'red', 'green', 'black'];
const ALL_COLORS = [...GEM_COLORS, 'gold'];
const COLOR_LABEL = {
  white: '钻石',
  blue: '蓝宝石',
  red: '红宝石',
  green: '翡翠',
  black: '缟玛瑙',
  gold: '黄金'
};
const LEVELS = [1, 2, 3];
const TOKEN_LIMIT = Number(process.env.SPLENDOR_TOKEN_LIMIT || 10); // 10 = 官方规则；可用环境变量做联调测试
const WIN_SCORE = 15;
const NOBLE_POINTS = 3;
const MARKET_ROWS = 4;
const RESERVE_LIMIT = 3;

const CARDS = Array.isArray(cardsModule) ? cardsModule : cardsModule.cards || [];
const NOBLES = Array.isArray(noblesModule) ? noblesModule : noblesModule.nobles || [];

function emptyCounts() {
  const o = {};
  for (const c of GEM_COLORS) o[c] = 0;
  o.gold = 0;
  return o;
}

function emptyBonuses() {
  const o = {};
  for (const c of GEM_COLORS) o[c] = 0;
  return o;
}

function shuffled(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class Game {
  constructor(options) {
    // mode: online（全联机） | hotseat（全热座） | mixed（联机 + 热座混用）
    this.mode = options.mode === 'hotseat' ? 'hotseat' : (options.mode === 'mixed' ? 'mixed' : 'online');
    this.seats = options.seats; // [{ index, name, token }]；token 为 null 表示该席位由热座设备控制
    this.hotseatToken = options.hotseatToken || null; // 控制热座席位的设备 token
    // 游戏内席位统一重编号为 0..n-1（与 seats 数组顺序一致），
    // 这样 turn（数组下标）与 players[i].index 永远相等，联机/热座混用时不会错位
    this.players = this.seats.map((seat, i) => ({
      index: i,
      lobbySeat: seat.index,
      name: seat.name,
      token: seat.token || null,
      points: 0,
      tokens: emptyCounts(),
      bonuses: emptyBonuses(),
      reserved: [],
      bought: [],
      nobles: [],
      turnsTaken: 0
    }));
    this.turn = 0;
    this.phase = 'action'; // action | returnTokens | noble | ended
    this.pending = null;
    this.finalRound = null;
    this.results = null;
    this.log = [];
    this._setup(options.playerCount);
    this._pushLog('游戏开始，祝大家好运！');
  }

  _setup(playerCount) {
    // 指示物：每色 7 个，黄金 5 个
    const perColor = playerCount <= 2 ? 4 : playerCount === 3 ? 5 : 7;
    this.tokens = emptyCounts();
    for (const c of GEM_COLORS) this.tokens[c] = perColor;
    this.tokens.gold = 5;

    // 发展卡：按等级分堆洗牌
    this.decks = LEVELS.map(() => []);
    let uid = 0;
    for (const card of CARDS) {
      const level = Math.min(3, Math.max(1, Number(card.level) || 1));
      this.decks[level - 1].push({
        uid: 'c' + uid++,
        cardKey: card.cardKey || card.id,
        level,
        points: Number(card.points) || 0,
        bonus: card.bonus ? { color: card.bonus.color, count: Number(card.bonus.count) || 1 } : { color: 'white', count: 0 },
        cost: card.cost || {},
        image: card.image || null
      });
    }
    this.decks = this.decks.map((deck) => shuffled(deck));

    // 贵族圆板：洗牌后翻开 玩家人数 + 1 片
    const nobleDeck = shuffled(
      NOBLES.map((n, i) => ({
        id: 'n' + i,
        name: n.name || ('贵族' + (i + 1)),
        nameZh: n.nameZh || n.name || ('贵族' + (i + 1)),
        image: n.image || null,
        require: n.require || {},
        points: Number(n.points) || NOBLE_POINTS,
        takenBy: null
      }))
    );
    const used = nobleDeck.slice(0, Math.min(nobleDeck.length, playerCount + 1));
    this.nobles = used;
    this.nobleDeck = nobleDeck.slice(used.length);

    // 市场：每级翻开 4 张
    this.market = LEVELS.map((level) => {
      const row = [];
      for (let i = 0; i < MARKET_ROWS; i++) {
        const deck = this.decks[level - 1];
        if (deck.length) row.push(deck.pop());
      }
      return row;
    });
  }

  _pushLog(text) {
    this.log.push({ text, ts: Date.now() });
    if (this.log.length > 80) this.log.shift();
  }

  get currentPlayer() {
    return this.players[this.turn];
  }

  playerBySeat(seat) {
    return this.players.find((p) => p.index === seat) || null;
  }

  // ---- 席位归属：热座 / 联机可以混在同一张牌桌上 ---------------------------

  // 该席位是否由热座设备控制（没有专属联机客户端）
  isHotseatSeat(seat) {
    const p = this.players[seat];
    return !!(p && !p.token);
  }

  // 该席位的控制者 token：联机席位=玩家 token；热座席位=热座设备 token
  seatOwnerToken(seat) {
    const p = this.players[seat];
    if (!p) return null;
    return p.token || this.hotseatToken || null;
  }

  // 某 token 可以控制的席位列表
  seatsOwnedBy(token) {
    if (!token) return [];
    return this.players.filter((p) => this.seatOwnerToken(p.index) === token).map((p) => p.index);
  }

  // ---- 动作校验与执行 ------------------------------------------------

  applyAction(seat, action) {
    if (this.phase === 'ended') return { ok: false, error: '游戏已结束' };
    if (seat !== this.turn) return { ok: false, error: '还没轮到你行动' };
    const p = this.currentPlayer;
    const type = action && action.type;

    if (this.phase === 'returnTokens') {
      if (type !== 'returnTokens') return { ok: false, error: '请先把多余的指示物放回场中' };
      return this._returnTokens(p, action.tokens || {});
    }
    if (this.phase === 'noble') {
      if (type !== 'chooseNoble') return { ok: false, error: '请选择要拜访的贵族' };
      return this._chooseNoble(p, action.nobleId);
    }

    switch (type) {
      case 'take':
        return this._take(p, action.tokens || {});
      case 'take2':
        return this._takeTwo(p, action.color);
      case 'reserve':
        return this._reserve(p, action);
      case 'buy':
        return this._buy(p, action);
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  _take(p, tokens) {
    if (Number(tokens.gold || 0) > 0) {
      return { ok: false, error: '黃金是萬用指示物，只能透過「保留一張發展卡」取得，不能直接拿取' };
    }
    const picked = [];
    // 規則書的四個動作中沒有「單獨拿黃金」，
    // 黃金只會隨著「保留一張發展卡」一起被取走，因此拿取動作只涉及 5 種寶石指示物
    for (const c of GEM_COLORS) {
      const n = Number(tokens[c] || 0);
      if (n > 0) {
        if (n !== 1) return { ok: false, error: '每种颜色每次只能拿 1 个指示物' };
        picked.push(c);
      }
    }
    if (!picked.length) return { ok: false, error: '至少要拿 1 个指示物' };
    if (picked.length > 3) return { ok: false, error: '一次最多拿 3 种不同颜色的指示物' };
    const available = GEM_COLORS.filter((c) => this.tokens[c] > 0).length;
    const minimum = Math.min(3, available);
    if (picked.length < minimum) {
      return { ok: false, error: '还可以拿到更多颜色，请至少拿 ' + minimum + ' 种不同颜色' };
    }
    for (const c of picked) {
      if (this.tokens[c] <= 0) return { ok: false, error: COLOR_LABEL[c] + '指示物已用尽' };
    }
    for (const c of picked) {
      this.tokens[c] -= 1;
      p.tokens[c] += 1;
    }
    this._pushLog(p.name + ' 拿取了 ' + picked.map((c) => COLOR_LABEL[c]).join('、'));
    this._afterAction();
    return { ok: true };
  }

  _takeTwo(p, color) {
    // 規則書：拿 2 個相同顏色的指示物，僅適用於 5 種「寶石指示物」
    // （黃金是「黃金指示物／萬用」，只能作為「3 種不同顏色」中的一種拿取）
    if (!GEM_COLORS.includes(color)) {
      return { ok: false, error: '黃金是萬用指示物，只能透過「保留一張發展卡」取得，不能直接拿取' };
    }
    if (this.tokens[color] < 4) {
      return { ok: false, error: COLOR_LABEL[color] + '指示物不足 4 个，不能拿走 2 个同色' };
    }
    this.tokens[color] -= 2;
    p.tokens[color] += 2;
    this._pushLog(p.name + ' 拿取了 2 个' + COLOR_LABEL[color] + '指示物');
    this._afterAction();
    return { ok: true };
  }

  _reserve(p, action) {
    if (p.reserved.length >= RESERVE_LIMIT) return { ok: false, error: '最多只能保留 3 张发展卡' };
    let card = null;
    let level = Number(action.level) || 1;
    if (action.source === 'market') {
      const row = this.market[level - 1];
      const idx = Number(action.index);
      if (!row || idx < 0 || idx >= row.length || !row[idx]) return { ok: false, error: '无效的卡牌' };
      card = row.splice(idx, 1)[0];
      this._refill(level);
    } else if (action.source === 'deck') {
      const deck = this.decks[level - 1];
      if (!deck || !deck.length) return { ok: false, error: '该等级牌库已空' };
      card = deck.pop();
    } else {
      return { ok: false, error: '无效操作' };
    }
    p.reserved.push(card);
    let goldNote = '';
    if (this.tokens.gold > 0) {
      this.tokens.gold -= 1;
      p.tokens.gold += 1;
      goldNote = '，并拿走 1 个黄金指示物';
    }
    this._pushLog(p.name + ' 保留了一张等级 ' + level + ' 发展卡' + goldNote);
    this._afterAction();
    return { ok: true };
  }

  _buy(p, action) {
    let card = null;
    let level = Number(action.level) || 1;
    if (action.source === 'reserved') {
      const idx = Number(action.index);
      if (idx < 0 || idx >= p.reserved.length) return { ok: false, error: '无效的卡牌' };
      card = p.reserved.splice(idx, 1)[0];
    } else if (action.source === 'market') {
      const row = this.market[level - 1];
      const idx = Number(action.index);
      if (!row || idx < 0 || idx >= row.length || !row[idx]) return { ok: false, error: '无效的卡牌' };
      card = row.splice(idx, 1)[0];
    } else {
      return { ok: false, error: '无效操作' };
    }

    const paid = this._pay(p, card.cost);
    if (!paid) {
      // 支付失败：原样放回（此时尚未补牌）
      if (action.source === 'reserved') p.reserved.push(card);
      else this.market[level - 1].splice(Number(action.index), 0, card);
      return { ok: false, error: '指示物不足，无法购买这张发展卡' };
    }
    // 购买成功后才从牌库补一张同等级的发展卡
    if (action.source === 'market') this._refill(level);

    p.bought.push(card);
    p.points += card.points;
    p.bonuses[card.bonus.color] = (p.bonuses[card.bonus.color] || 0) + card.bonus.count;
    this._pushLog(
      p.name + ' 购买了一张等级 ' + card.level + ' 发展卡，获得 ' + card.points + ' 点声望、' +
        card.bonus.count + ' 点' + COLOR_LABEL[card.bonus.color] + '红利'
    );
    this._afterAction();
    return { ok: true };
  }

  _pay(p, cost) {
    const due = {};
    let totalDue = 0;
    for (const c of GEM_COLORS) {
      const need = Math.max(0, Number(cost[c] || 0) - (p.bonuses[c] || 0));
      due[c] = need;
      totalDue += need;
    }
    let colored = 0;
    for (const c of GEM_COLORS) colored += Math.min(p.tokens[c] || 0, due[c]);
    const rest = totalDue - colored;
    if (rest > (p.tokens.gold || 0)) return false;
    for (const c of GEM_COLORS) {
      const use = Math.min(p.tokens[c] || 0, due[c]);
      if (use > 0) {
        p.tokens[c] -= use;
        this.tokens[c] += use;
      }
    }
    if (rest > 0) {
      p.tokens.gold -= rest;
      this.tokens.gold += rest;
    }
    return true;
  }

  _refill(level) {
    const row = this.market[level - 1];
    const deck = this.decks[level - 1];
    while (row && deck && row.length < MARKET_ROWS && deck.length) row.push(deck.pop());
  }

  _returnTokens(p, tokens) {
    const excess = this.pending.excess;
    let count = 0;
    for (const c of GEM_COLORS.concat(['gold'])) {
      const n = Number(tokens[c] || 0);
      if (!Number.isInteger(n) || n < 0) return { ok: false, error: '无效的选择' };
      if (n > (p.tokens[c] || 0)) return { ok: false, error: COLOR_LABEL[c] + '指示物不足' };
      count += n;
    }
    if (count !== excess) return { ok: false, error: '请正好放回 ' + excess + ' 个指示物' };
    for (const c of GEM_COLORS.concat(['gold'])) {
      const n = Number(tokens[c] || 0);
      if (n > 0) {
        p.tokens[c] -= n;
        this.tokens[c] += n;
      }
    }
    this._pushLog(p.name + ' 将多余的指示物放回场中');
    this.pending = null;
    this.phase = 'action';
    this._checkNobles();
    return { ok: true };
  }

  _afterAction() {
    const p = this.currentPlayer;
    const total = GEM_COLORS.concat(['gold']).reduce((sum, c) => sum + (p.tokens[c] || 0), 0);
    if (total > TOKEN_LIMIT) {
      this.phase = 'returnTokens';
      this.pending = { type: 'returnTokens', excess: total - TOKEN_LIMIT, total, limit: TOKEN_LIMIT };
      return;
    }
    this._checkNobles();
  }

  _eligibleNobles(p) {
    return this.nobles.filter((n) => {
      if (n.takenBy !== null && n.takenBy !== undefined) return false;
      for (const c of GEM_COLORS) {
        const need = Number(n.require[c] || 0);
        if (need > 0 && (p.bonuses[c] || 0) < need) return false;
      }
      return true;
    });
  }

  _checkNobles() {
    const p = this.currentPlayer;
    const eligible = this._eligibleNobles(p);
    if (eligible.length === 1) {
      this._grant(p, eligible[0]);
      this._endTurn();
      return;
    }
    if (eligible.length > 1) {
      this.phase = 'noble';
      this.pending = { type: 'noble', options: eligible.map((n) => n.id) };
      return;
    }
    this._endTurn();
  }

  _chooseNoble(p, nobleId) {
    if (!this.pending || this.pending.type !== 'noble') return { ok: false, error: '当前没有需要选择的贵族' };
    if (!this.pending.options.includes(nobleId)) return { ok: false, error: '无效的贵族' };
    const noble = this.nobles.find((n) => n.id === nobleId);
    this._grant(p, noble);
    this.pending = null;
    this.phase = 'action';
    this._endTurn();
    return { ok: true };
  }

  _grant(p, noble) {
    noble.takenBy = p.index;
    p.nobles.push(noble.id);
    p.points += noble.points || NOBLE_POINTS;
    this._pushLog(p.name + ' 获得了「' + noble.name + '」的拜访（+' + (noble.points || NOBLE_POINTS) + ' 点声望）');
  }

  skipCurrent(reason) {
    if (this.phase === 'ended') return { ok: false, error: '游戏已结束' };
    const p = this.currentPlayer;
    p.turnsTaken += 1;
    this._pushLog(p.name + ' 的回合被跳过' + (reason ? '（' + reason + '）' : ''));
    this.turn = (this.turn + 1) % this.players.length;
    this.phase = 'action';
    this.pending = null;
    if (this.finalRound) {
      const minTurns = Math.min(...this.players.map((x) => x.turnsTaken));
      if (minTurns >= this.finalRound.targetTurns) this._finish();
    }
    return { ok: true };
  }

  _endTurn() {
    const p = this.currentPlayer;
    p.turnsTaken += 1;
    if (!this.finalRound && p.points >= WIN_SCORE) {
      this.finalRound = { targetTurns: p.turnsTaken, by: p.index };
      this._pushLog(p.name + ' 达到 ' + p.points + ' 点声望，本回合结束后进入最终轮');
    }
    this.turn = (this.turn + 1) % this.players.length;
    this.phase = 'action';
    this.pending = null;
    if (this.finalRound) {
      const minTurns = Math.min(...this.players.map((x) => x.turnsTaken));
      if (minTurns >= this.finalRound.targetTurns) this._finish();
    }
  }

  _finish() {
    this.phase = 'ended';
    const ranked = this.players
      .map((p) => ({
        index: p.index,
        name: p.name,
        points: p.points,
        cards: p.bought.length,
        nobles: p.nobles.length
      }))
      .sort((a, b) => b.points - a.points || a.cards - b.cards);
    this.results = ranked;
    this._pushLog('游戏结束，' + ranked[0].name + ' 以 ' + ranked[0].points + ' 点声望获胜');
  }

  // ---- 对外视图 ------------------------------------------------------

  _cardView(card) {
    return {
      uid: card.uid,
      cardKey: card.cardKey,
      level: card.level,
      points: card.points,
      bonus: card.bonus,
      cost: card.cost,
      image: card.image
    };
  }

  // viewerSeats: 该观看者可以完全查看的席位（自己的联网席位 + 本机控制的热座席位）
  publicState(viewerSeats) {
    const owned = new Set(Array.isArray(viewerSeats) ? viewerSeats : (viewerSeats == null ? [] : [viewerSeats]));
    const revealAll = this.mode === 'hotseat';
    return {
      phase: this.phase,
      mode: this.mode,
      turn: this.turn,
      finalRound: this.finalRound,
      results: this.results,
      tokens: this.tokens,
      market: this.market.map((row) => row.map((c) => this._cardView(c))),
      deckCounts: this.decks.map((d) => d.length),
      nobles: this.nobles.map((n) => ({
        id: n.id,
        name: n.name,
        nameZh: n.nameZh,
        image: n.image,
        require: n.require,
        points: n.points,
        takenBy: n.takenBy === null || n.takenBy === undefined ? null : n.takenBy
      })),
      players: this.players.map((p) => {
        const revealReserved = revealAll || owned.has(p.index);
        return {
          index: p.index,
          name: p.name,
          hotseat: !p.token, // true = 该席位由热座设备控制
          points: p.points,
          tokens: p.tokens,
          bonuses: p.bonuses,
          bought: p.bought.map((c) => this._cardView(c)),
          reservedCount: p.reserved.length,
          reserved: revealReserved ? p.reserved.map((c) => this._cardView(c)) : [],
          nobles: p.nobles.map((id) => {
            const n = this.nobles.find((x) => x.id === id);
            return {
              id,
              name: n ? n.name : '',
              nameZh: n ? n.nameZh : '',
              image: n ? n.image : null,
              require: n ? n.require : {},
              points: n ? n.points : NOBLE_POINTS
            };
          }),
          turnsTaken: p.turnsTaken
        };
      }),
      pending:
        this.phase === 'returnTokens'
          ? { type: 'returnTokens', excess: this.pending.excess, limit: this.pending.limit }
          : this.phase === 'noble'
          ? { type: 'noble', options: this.pending.options }
          : null,
      log: this.log.slice(-30)
    };
  }
}

module.exports = { Game, GEM_COLORS, COLOR_LABEL, TOKEN_LIMIT, WIN_SCORE, NOBLE_POINTS };
