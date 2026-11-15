import { renderJoin, renderLobby, renderGame, rulesHtml, esc, topbarHtml, bannerHtml, tokenCellsHtml, takeBarHtml, logHtml, noblesHtml, playersHtml, reservedHtml, tiersHtml, tierInnerHtml, nobleTileClass, nobleTileInner, playerRowClass, playerRowInner, canBuyCard } from './render.js';
import * as audio from './audio.js';
import { ALL_COLORS, COLORS, COLOR_META, COLOR_IMG, CARD_BACK, gem, av } from './icons.js';

/* ---------------- 状态 ---------------- */
const S = { screen: 'join', me: null, lobby: null, game: null, connected: false, room: '' };
const ui = {
  takeSel: {},        // 选中的颜色（每种 1 个）
  takeTwo: null,      // 选中的「拿 2 个同色」
  returnSel: {},
  modal: null,        // rules | hotseat | noble | return | result | reserve | player-detail
  detailSeat: null,    // 正在查看详情的玩家
  reserveTarget: null,// 待确认保留的卡
  curtain: false,
  lastTurnSeat: -1,
  hotseatCount: 3,
  hotseatNames: ['', '', '', ''],
  joinName: '',      // 加入页里输入的昵称
  lobbyName: '',     // 大厅里正在改的昵称
  roomCode: '',     // 加入页里输入的房间码
  artMap: {},
  flashTokens: {},   // 本帧变化的指示物（用于动效提示）
  flashPoints: {},   // 本帧变化的声望
  lastTokens: null,
  lastPoints: null
};

// 挂载前缀（服务端注入）：根目录部署时为空，挂在 /splendor/ 下时为 '/splendor'
const BASE = (typeof window !== 'undefined' && window.__BASE__) || '';

const app = document.getElementById('app');
let ws = null;
let retry = 0;

// 进页面先看地址栏里的房间码
S.room = roomFromUrl();
ui.roomCode = S.room;

function toast(msg, ms = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

// 连接还没就绪时，hello 先排队，等 onopen 再发（避免点「加入/新建房间」时消息丢失）
let pendingHello = null;
function send(msg) {
  if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return; }
  if (msg && msg.t === 'hello') { pendingHello = msg; return; }
  toast('与服务器连接中断，正在重连…');
}

/* ---------------- 房间 ---------------- */
function normalizeRoom(code) {
  return String(code == null ? '' : code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}
function roomFromUrl() {
  try { return normalizeRoom(new URLSearchParams(location.search).get('room') || ''); } catch (e) { return ''; }
}
// 地址栏同步房间码：刷新 / 分享都还停在这个房间
function syncRoomUrl(room) {
  const code = normalizeRoom(room);
  if (code === S.room && code === roomFromUrl()) return;
  S.room = code;
  try {
    const url = new URL(location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    history.replaceState(null, '', url.toString());
  } catch (e) { /* ignore */ }
}
// 分享地址带上房间码
function shareUrl() {
  const code = normalizeRoom(S.room);
  return location.origin + BASE + '/' + (code && code !== 'MAIN' ? '?room=' + encodeURIComponent(code) : '');
}

/* ---------------- 连接 ---------------- */
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const room = normalizeRoom(S.room);
  ws = new WebSocket(proto + '://' + location.host + BASE + '/ws' + (room ? '?room=' + encodeURIComponent(room) : ''));
  ws.onopen = () => {
    S.connected = true;
    retry = 0;
    const saved = readSaved();
    if (pendingHello) {
      const h = pendingHello;
      pendingHello = null;
      send(h);
    } else if (saved && saved.token) {
      send({ t: 'hello', name: saved.name, token: saved.token, room });
    }
    render();
  };
  ws.onclose = () => {
    S.connected = false;
    render();
    retry += 1;
    setTimeout(connect, Math.min(5000, 700 * retry));
  };
  ws.onerror = () => {};
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    onMessage(msg);
  };
}

function readSaved() {
  try { return JSON.parse(localStorage.getItem('splendor.me') || 'null'); } catch (e) { return null; }
}
function saveMe(me) {
  try { localStorage.setItem('splendor.me', JSON.stringify({ name: me.name, token: me.token })); } catch (e) { /* ignore */ }
}

function onMessage(msg) {
  switch (msg.t) {
    case 'hello_ok':
      S.me = msg.you;
      saveMe(msg.you);
      if (msg.room) syncRoomUrl(msg.room);
      S.lobby = msg.lobby;
      S.screen = 'lobby';
      break;
    case 'lobby':
      S.lobby = msg.lobby;
      if (msg.lobby && msg.lobby.room) S.room = msg.lobby.room;
      if (!S.game) S.screen = 'lobby';
      break;
    case 'state': {
      const prev = S.game;
      S.game = msg.state;
      S.screen = 'game';
      // 服务端每帧都带权威身份，这里同步回本地，避免 seat 过期
      if (S.me && msg.state.you) {
        if (msg.state.you.seat != null) S.me.seat = msg.state.you.seat;
        if (typeof msg.state.you.isHost === 'boolean') S.me.isHost = msg.state.you.isHost;
      }
      ui.takeSel = {};
      ui.takeTwo = null;
      ui.returnSel = {};
      // 变化检测：指示物进出与声望上涨时给对应的元素加动效
      const curTokens = msg.state.tokens || {};
      const prevTokens = ui.lastTokens;
      ui.flashTokens = {};
      if (prevTokens) {
        for (const c of ALL_COLORS) {
          const before = prevTokens[c] || 0;
          const after = curTokens[c] || 0;
          if (before !== after) ui.flashTokens[c] = after < before ? 'out' : 'in';
        }
      }
      ui.lastTokens = { ...curTokens };
      const curPoints = {};
      (msg.state.players || []).forEach((p) => { curPoints[p.index] = p.points; });
      const prevPoints = ui.lastPoints;
      ui.flashPoints = {};
      if (prevPoints) {
        for (const k in curPoints) {
          if (curPoints[k] !== prevPoints[k]) ui.flashPoints[k] = true;
        }
      }
      ui.lastPoints = curPoints;
      const youState = msg.state.you || {};
      const myHotseatSeats = Array.isArray(youState.hotseatSeats) ? youState.hotseatSeats : [];
      if (ui.lastTurnSeat !== msg.state.turn) {
        // 只有轮到「本机接管的热座席位」时才弹出交接提示；
        // 轮到联机玩家时，本机只显示「等待对方行动」
        ui.curtain = myHotseatSeats.indexOf(msg.state.turn) >= 0;
        ui.lastTurnSeat = msg.state.turn;
      }
      if (prev && prev.phase !== 'ended' && msg.state.phase === 'ended') ui.modal = 'result';
      break;
    }
    case 'game_end':
      S.game = null;
      S.screen = 'lobby';
      ui.lastTurnSeat = -1;
      ui.curtain = false;
      ui.modal = null;
      break;
    case 'error':
      toast(msg.message || '操作失败');
      break;
    default:
      break;
  }
  render();
}

/* ---------------- 视图 ---------------- */
function buildView() {
  const g = S.game;
  const you = g.you || {};
  // 座位号一律以服务端下发的 you.seat / you.hotseatSeats 为准
  // mySeat：我的联网席位（热座设备为 -1）
  // hotseatSeats：本机接管的热座席位（纯热座=全部，混合=被标记的那几个）
  const mySeat = (you.seat != null && you.seat >= 0) ? you.seat : -1;
  const hotseatSeats = Array.isArray(you.hotseatSeats) ? you.hotseatSeats : [];
  const showCurrent = hotseatSeats.length > 0;
  const mySeats = [...(mySeat >= 0 ? [mySeat] : []), ...hotseatSeats];
  const current = g.players[g.turn];
  const controls = mySeats.indexOf(g.turn) >= 0;
  const canAct = g.phase === 'action' && controls;
  // 左栏展示哪位玩家：联机玩家看自己，热座设备看当前行动者
  const viewSeat = mySeat >= 0 ? mySeat : g.turn;
  const activePlayer = g.players[viewSeat] || current;
  const currentOffline = !!g.currentOffline;
  const canSkip = g.phase === 'action' && (controls || (!!(S.me && S.me.isHost) && currentOffline));
  const minTake = Math.min(3, COLORS.filter((c) => ((g.tokens || {})[c] || 0) > 0).length);
  const selColors = COLORS.concat(['gold']).filter((c) => ui.takeSel[c]);
  const selText = selColors.map((c) => COLOR_META[c].name).join('、');
  const pickedCount = ui.takeTwo ? 0 : selColors.length;
  const needMore = !ui.takeTwo && pickedCount < minTake;
  return {
    game: g,
    ui,
    selText,
    pickedCount,
    needMore,
    soundOn: audio.isEnabled(),
    meSeat: mySeat,
    meName: S.me ? S.me.name : '',
    hotseat: showCurrent,     // 本机以「当前玩家」视角展示资产
    mixed: g.mode === 'mixed',
    mySeats,
    viewSeat,
    viewSeatMine: mySeats.indexOf(viewSeat) >= 0,
    canAct,
    canSkip,
    canTakeover: !!you.canTakeoverHotseat,
    currentOffline,
    currentName: (current && current.name) || '',
    minTake,
    activePlayer,
    winScore: 15,
    isHost: !!(S.me && S.me.isHost),
    canReset: !!(S.me && (S.me.isHost || (S.game.you && S.game.you.isGameHost))),
    flashTokens: ui.flashTokens,
    flashPoints: ui.flashPoints,
    artMap: ui.artMap
  };
}

function modalHtml() {
  if (ui.modal === 'rules') {
    return `<div class="overlay" data-act="close-bg">
      <div class="dialog">
        <h2>规则速览</h2>
        <p>基础版《璀璨宝石》：3 个等级发展卡、10 张贵族圆板、15 点声望获胜。</p>
        <div style="text-align:left;margin-top:14px">${rulesHtml()}</div>
        <div class="dialog__row"><button class="btn btn--primary" data-act="close-modal">知道了</button></div>
      </div>
    </div>`;
  }

  if (ui.modal === 'hotseat') {
    const inputs = ui.hotseatNames
      .map((n, i) => `<input data-hotseat-name="${i}" maxlength="12" placeholder="玩家 ${i + 1}" value="${esc(n)}" />`)
      .join('');
    return `<div class="overlay" data-act="close-bg">
      <div class="dialog">
        <h2>热座模式</h2>
        <p>同一台设备轮流操作。轮到某人时会显示交接提示。</p>
        <div style="text-align:left;margin:14px 0">
          <div class="asset__label" style="margin-bottom:6px">玩家人数</div>
          <select id="hotseat-count">
            ${[2, 3, 4].map((c) => `<option value="${c}" ${ui.hotseatCount === c ? 'selected' : ''}>${c} 人</option>`).join('')}
          </select>
        </div>
        <div style="text-align:left">
          <div class="asset__label" style="margin-bottom:6px">玩家昵称（可留空自动命名）</div>
          <div style="display:flex;flex-direction:column;gap:7px">${inputs}</div>
        </div>
        <div class="dialog__row">
          <button class="btn btn--primary" data-act="start-hotseat">开始热座游戏</button>
          <button class="btn btn--ghost" data-act="close-modal">取消</button>
        </div>
      </div>
    </div>`;
  }

  if (ui.modal === 'reserve' && ui.reserveTarget && S.game) {
    const t = ui.reserveTarget;
    const isDeck = t.source === 'deck';
    const row = isDeck ? null : (S.game.market[t.level - 1] || [])[t.index];
    const img = isDeck
      ? CARD_BACK[t.level] || CARD_BACK[1]
      : (row && row.image ? av('assets/cards/' + row.image) : '');
    const deckCount = (S.game.deckCounts || [])[t.level - 1] || 0;
    return `<div class="overlay" data-act="close-bg">
      <div class="dialog">
        <h2>${isDeck ? '从牌库顶保留一张？' : '保留这张发展卡？'}</h2>
        ${isDeck
          ? `<p>这是<b>盲保留</b>：你看不到保留的是哪张卡，只能在之后的回合购买它时才知道。<br/>保留后立即拿走 <b>1 个黄金指示物</b>（等级 ${t.level} 牌库还剩 ${deckCount} 张）。</p>`
          : `<p>保留后放入手牌（最多 3 张，不能弃牌），并立即拿走 <b>1 个黄金指示物</b>。<br/>之后只能在你的回合购买它。</p>`}
        ${img ? `<div class="dialog__art" style="background-image:url('${img}')"></div>` : ''}
        <div class="dialog__row">
          <button class="btn btn--primary" data-act="confirm-reserve">确认保留</button>
          <button class="btn btn--ghost" data-act="close-modal">再想想</button>
        </div>
      </div>
    </div>`;
  }

  if (ui.modal === 'noble' && S.game && S.game.pending) {
    const opts = (S.game.pending.options || [])
      .map((id) => S.game.nobles.find((n) => n.id === id))
      .filter(Boolean)
      .map((n) => `<div class="choice" data-act="choose-noble" data-noble="${esc(n.id)}">
          <div class="choice__art" style="background-image:url('${av('assets/nobles/' + esc(n.image || ''))}')"></div>
          <div class="choice__name">${esc(n.nameZh || n.name)}</div>
        </div>`).join('');
    return `<div class="overlay">
      <div class="dialog">
        <h2>贵族拜访</h2>
        <p>你同时满足了多张贵族圆板的需求，选择一位接受拜访（每人每回合只能获得一位）。</p>
        <div class="picklist">${opts}</div>
      </div>
    </div>`;
  }

  if (ui.modal === 'return' && S.game && S.game.pending) {
    const v = buildView();
    const tokens = v.activePlayer.tokens || {};
    const excess = S.game.pending.excess;
    const limit = S.game.pending.limit || 10;
    const picked = Object.values(ui.returnSel).reduce((a, b) => a + b, 0);
    const btns = ALL_COLORS.filter((c) => (tokens[c] || 0) > 0)
      .map((c) => `<button class="pick ${ui.returnSel[c] ? 'pick--on' : ''}" data-act="pick-return" data-color="${c}">
          <span class="token__art" style="width:26px;height:26px;background-image:url('${COLOR_IMG[c]}')"></span>
          ${COLOR_META[c].name} ×${tokens[c]}${ui.returnSel[c] ? ' → 放回 ' + ui.returnSel[c] : ''}
        </button>`).join('');
    return `<div class="overlay">
      <div class="dialog">
        <h2>放回多余指示物</h2>
        <p>回合结束时手上最多持有 ${limit} 个指示物（含黄金），请放回 <b>${excess}</b> 个。</p>
        <div class="picklist">${btns}</div>
        <div class="dialog__row">
          <button class="btn btn--primary" data-act="confirm-return" ${picked === excess ? '' : 'disabled'}>确认放回 ${picked}/${excess}</button>
        </div>
      </div>
    </div>`;
  }

  if (ui.modal === 'player-detail' && S.game) {
    const p = S.game.players.find((x) => x.index === ui.detailSeat);
    if (!p) return '';
    const tok = ALL_COLORS
      .filter((c) => (p.tokens[c] || 0) > 0)
      .map((c) => `<span class="stack"><img class="token-img" src="${COLOR_IMG[c]}" width="52" height="52" alt="${COLOR_META[c].name}" />
        ${p.tokens[c] > 1 ? '<b>×' + p.tokens[c] + '</b>' : ''}</span>`)
      .join('');
    const bon = COLORS
      .filter((c) => (p.bonuses[c] || 0) > 0)
      .map((c) => `<span class="stack">${gem(c, 36)}${p.bonuses[c] > 1 ? '<b>×' + p.bonuses[c] + '</b>' : ''}</span>`)
      .join('');
    const bought = p.bought
      .map((c) => `<figure class="detail-card"><img src="${av('assets/cards/' + esc(c.image || ''))}" alt="发展卡" loading="lazy" /><figcaption>${c.points} 点 · ${COLOR_META[c.bonus.color].name}红利</figcaption></figure>`)
      .join('');
    const reserved = p.reserved
      .map((c) => `<figure class="detail-card"><img src="${av('assets/cards/' + esc(c.image || ''))}" alt="保留的卡" loading="lazy" /><figcaption>保留中</figcaption></figure>`)
      .join('');
    const nobles = p.nobles
      .map((n) => `<figure class="detail-card detail-card--noble"><img src="${av('assets/nobles/' + esc(n.image || ''))}" alt="${esc(n.nameZh || n.name)}" loading="lazy" /><figcaption>${esc(n.nameZh || n.name)}</figcaption></figure>`)
      .join('');
    return `<div class="overlay" data-act="close-bg">
      <div class="dialog dialog--wide">
        <h2>${esc(p.name)} 的详情</h2>
        <p>声望 <b>${p.points}</b> · 已购发展卡 ${p.bought.length} 张 · 保留 ${p.reservedCount} 张 · 贵族 ${p.nobles.length} 位</p>
        <div class="detail-block">
          <div class="detail-block__title">持有指示物</div>
          <div class="detail-stack">${tok || '<span class="hold-empty">无</span>'}</div>
        </div>
        <div class="detail-block">
          <div class="detail-block__title">红利（永久折扣）</div>
          <div class="detail-stack">${bon || '<span class="hold-empty">无</span>'}</div>
        </div>
        ${bought ? `<div class="detail-block"><div class="detail-block__title">已购发展卡</div><div class="detail-cards">${bought}</div></div>` : ''}
        ${reserved ? `<div class="detail-block"><div class="detail-block__title">保留的卡</div><div class="detail-cards">${reserved}</div></div>` : ''}
        ${nobles ? `<div class="detail-block"><div class="detail-block__title">已获得的贵族</div><div class="detail-cards">${nobles}</div></div>` : ''}
        <div class="dialog__row"><button class="btn btn--primary" data-act="close-modal">关闭</button></div>
      </div>
    </div>`;
  }

  if (ui.modal === 'result' && S.game && S.game.results) {
    const rows = S.game.results
      .map((r, i) => `<div class="result ${i === 0 ? 'result--win' : ''}">
          <span class="result__rank">${i === 0 ? '★' : i + 1}</span>
          <span style="flex:1">${esc(r.name)}<small style="display:block;color:var(--ink-3);font-size:11px">发展卡 ${r.cards} 张 · 贵族 ${r.nobles} 位</small></span>
          <span class="result__score">${r.points}</span>
        </div>`).join('');
    return `<div class="overlay">
      <div class="dialog">
        <h2>游戏结束</h2>
        <p>${esc(S.game.results[0].name)} 以 ${S.game.results[0].points} 点声望获胜！</p>
        <div style="margin-top:14px">${rows}</div>
        <div class="dialog__row">
          <button class="btn btn--primary" data-act="close-modal">继续查看牌桌</button>
          ${S.me && S.me.isHost ? '<button class="btn" data-act="reset">再来一局</button>' : ''}
        </div>
      </div>
    </div>`;
  }
  return '';
}

function curtainHtml() {
  const g = S.game;
  if (!g) return '';
  const p = g.players[g.turn] || {};
  return `<div class="overlay">
    <div class="dialog">
      <h2>请把设备交给 ${esc(p.name || '')}</h2>
      <p>点击下方按钮后开始显示 ${esc(p.name || '')} 的回合信息。</p>
      <div class="dialog__row">
        <button class="btn btn--primary" data-act="curtain-go">我是 ${esc(p.name || '')}，开始</button>
      </div>
    </div>
  </div>`;
}

/* ---------------- 增量渲染：只更新变化的部分，图片不重载 ---------------- */
let boardMounted = false;
let lastOverlay = { key: '', html: '' };

function setHtml(el, html) {
  if (!el) return;
  if (el.__html !== html) { el.innerHTML = html; el.__html = html; }
}

function tierSig(v, lvl) {
  const row = (v.game.market[lvl - 1] || []).map((c) => c.cardKey || c.uid || c.image).join(',');
  const deck = (v.game.deckCounts || [])[lvl - 1] || 0;
  return row + '#' + deck;
}

function playerSig(v, p) {
  return [p.index, p.points, JSON.stringify(p.tokens), JSON.stringify(p.bonuses), p.reservedCount,
    p.bought.length, p.nobles.length, v.game.turn === p.index, (v.flashPoints || {})[p.index] ? 1 : 0].join('|');
}

function nobleReady(v, n) {
  const bonuses = (v.activePlayer && v.activePlayer.bonuses) || {};
  if (n.takenBy != null) return false;
  return COLORS.every((c) => (bonuses[c] || 0) >= (n.require[c] || 0));
}

/* 指示物：逐格更新计数与状态，贴图一律不碰 */
function patchTray(v) {
  const g = v.game;
  for (const c of ALL_COLORS) {
    const cell = app.querySelector('.token-cell[data-color="' + c + '"]');
    if (!cell) continue;
    const btn = cell.querySelector('.token');
    if (!btn) continue;
    const count = (g.tokens || {})[c] || 0;
    const isGold = c === 'gold';
    const can = !isGold && count > 0 && v.canAct;
    const on = !!v.ui.takeSel[c];
    const two = !!(v.ui.takeTwo && v.ui.takeTwo.color === c);
    const cnt = btn.querySelector('.token__count');
    if (cnt && cnt.textContent !== String(count)) cnt.textContent = String(count);
    btn.classList.toggle('token--on', on);
    btn.classList.toggle('token--empty', !can);
    btn.classList.toggle('token--gold', isGold);
    const act = can ? 'pick-token' : '';
    if (btn.getAttribute('data-act') !== act) btn.setAttribute('data-act', act);
    let chip = cell.querySelector('.token__x2');
    const wantChip = !isGold && count >= 4 && v.canAct;
    if (wantChip && !chip) {
      cell.insertAdjacentHTML('beforeend', '<button class="token__x2" data-act="pick-two" data-color="' + c + '">×2</button>');
      chip = cell.querySelector('.token__x2');
    } else if (!wantChip && chip) { chip.remove(); chip = null; }
    if (chip) chip.classList.toggle('token__x2--on', two);
  }
}

/* 市场：卡片结构变了才重建行，否则只更新可购买高亮 */
function patchTiers(v) {
  const rows = app.querySelectorAll('.tier');
  rows.forEach((el) => {
    const lvl = Number(el.dataset.level) || 1;
    const sig = tierSig(v, lvl);
    if (el.__sig !== sig) { el.innerHTML = tierInnerHtml(v, lvl); el.__sig = sig; }
    const slots = el.querySelectorAll('.card-slot');
    slots.forEach((slot) => {
      const idx = Number(slot.dataset.index);
      const c = (v.game.market[lvl - 1] || [])[idx];
      if (!c) return;
      const buyable = canBuyCard(v, c);
      slot.classList.toggle('card-slot--buyable', buyable);
      const card = slot.querySelector('.card');
      if (card) {
        if (buyable) { card.setAttribute('data-dblbuy', '1'); card.title = '双击这张卡购买'; }
        else { card.removeAttribute('data-dblbuy'); card.title = ''; }
      }
      const acts = slot.querySelector('.card__acts');
      const wantLeave = v.canAct && slot.dataset.source === 'market';
      if (wantLeave && !acts) {
        slot.insertAdjacentHTML('beforeend', '<div class="card__acts"><button class="btn btn--ghost btn--sm" data-act="reserve" data-level="' + lvl + '" data-index="' + idx + '">留</button></div>');
      } else if (!wantLeave && acts) { acts.remove(); }
    });
    const deck = el.querySelector('.deck');
    if (deck) {
      const dact = v.canAct && ((v.game.deckCounts || [])[lvl - 1] || 0) > 0 ? 'reserve-deck' : '';
      if (deck.getAttribute('data-act') !== dact) deck.setAttribute('data-act', dact);
    }
  });
}

function patchNobles(v) {
  const box = app.querySelector('.nobles');
  if (!box) return;
  const items = v.game.nobles || [];
  const kids = Array.prototype.slice.call(box.children);
  while (kids.length > items.length) { box.removeChild(box.lastChild); kids.pop(); }
  while (kids.length < items.length) { const d = document.createElement('div'); box.appendChild(d); kids.push(d); }
  items.forEach((n, i) => {
    const el = kids[i];
    const sig = n.id + '|' + (n.takenBy == null ? '' : n.takenBy) + '|' + (nobleReady(v, n) ? 1 : 0);
    if (el.__sig !== sig) {
      el.className = nobleTileClass(n, v);
      el.innerHTML = nobleTileInner(n, v);
      el.__sig = sig;
    }
  });
}

function patchPlayers(v) {
  const box = app.querySelector('.players');
  if (!box) return;
  const items = v.game.players || [];
  const kids = Array.prototype.slice.call(box.children);
  while (kids.length > items.length) { box.removeChild(box.lastChild); kids.pop(); }
  while (kids.length < items.length) { const d = document.createElement('div'); box.appendChild(d); kids.push(d); }
  items.forEach((p, i) => {
    const el = kids[i];
    const sig = playerSig(v, p);
    if (el.__sig !== sig) {
      el.className = playerRowClass(p, v);
      el.innerHTML = playerRowInner(p, v);
      el.__sig = sig;
    }
  });
}

function patchBoard(v) {
  setHtml(app.querySelector('.topbar'), topbarHtml(v));
  const banner = app.querySelector('.banner');
  const bh = bannerHtml(v);
  if (bh) {
    if (!banner) app.insertAdjacentHTML('afterbegin', bh);
    else if (banner.__html !== bh) banner.outerHTML = bh;
  } else if (banner) banner.remove();
  patchTray(v);
  setHtml(app.querySelector('.take-bar'), takeBarHtml(v));
  setHtml(app.querySelector('.ledger__body'), logHtml(v));
  patchNobles(v);
  patchTiers(v);
  patchPlayers(v);
  setHtml(app.querySelector('.col--right .panel:last-child'), reservedHtml(v));
}

/* 弹窗 / 交接帘：内容没变就不重建（弹窗里的卡图不会重载） */
function renderOverlay(g) {
  const extra = modalHtml();
  const curtain = ui.curtain && g ? curtainHtml() : '';
  const key = (ui.modal || '') + (curtain ? '#curtain' : '');
  const html = extra || curtain;
  if (key === lastOverlay.key && html === lastOverlay.html) return;
  const old = app.querySelector('.overlay');
  if (old) old.remove();
  if (html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const node = wrap.firstElementChild;
    if (node) { node.setAttribute('data-ovkey', key); app.appendChild(node); }
  }
  lastOverlay = { key, html };
}

function render() {
  const g = S.game;
  if (!S.me) { app.innerHTML = renderJoin({ name: ui.joinName, roomCode: ui.roomCode }); boardMounted = false; lastOverlay = { key: '', html: '' }; return; }
  if (!g) {
    const lobby = S.lobby || { players: [] };
    const mine = (lobby.players || []).find((p) => S.me && p.id === S.me.id);
    const me = S.me ? { ...S.me, isHost: !!(mine && mine.isHost) } : null;
    app.innerHTML = renderLobby({ lobby, me, connected: S.connected, shareUrl: shareUrl(), nameDraft: ui.lobbyName });
    boardMounted = false;
    renderOverlay(g);
    return;
  }
  if (g.pending && g.pending.type === 'noble' && ui.modal !== 'noble') ui.modal = 'noble';
  if (g.pending && g.pending.type === 'returnTokens' && ui.modal !== 'return') ui.modal = 'return';

  const v = buildView();
  if (!boardMounted) {
    app.innerHTML = renderGame(v);
    boardMounted = true;
    app.querySelectorAll('.tier').forEach((el) => { el.__sig = tierSig(v, Number(el.dataset.level) || 1); });
  } else {
    patchBoard(v);
  }

  renderOverlay(g);
}
/* ---------------- 交互 ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act !== 'leave' && act !== 'reset') audio.click('tap');

  switch (act) {
    case 'sit':
      send({ t: 'sit', seat: Number(el.dataset.seat) });
      break;
    case 'rename': {
      const input = document.getElementById('seat-name');
      const name = ((input && input.value) || ui.lobbyName || '').trim();
      if (!name) { toast('昵称不能为空'); return; }
      ui.lobbyName = '';
      send({ t: 'rename', name });
      break;
    }
    case 'create-room': {
      // 新建一张独立牌桌：服务端生成房间码，我搬过去
      const name = (S.me && S.me.name) || ui.joinName || '房主';
      const saved = readSaved();
      send({
        t: 'hello',
        name,
        token: S.me ? S.me.token : (saved ? saved.token : undefined),
        create: true
      });
      break;
    }
    case 'leave-seat':
      send({ t: 'stand', seat: el.dataset.seat != null ? Number(el.dataset.seat) : undefined });
      break;
    case 'leave':
      send({ t: 'leave' });
      S.me = null;
      S.lobby = null;
      S.game = null;
      S.screen = 'join';
      ui.modal = null;
      ui.curtain = false;
      try { localStorage.removeItem('splendor.me'); } catch (err) { /* ignore */ }
      render();
      break;
    case 'sound': {
      const on = audio.toggle();
      ui.soundOn = on;
      if (on) audio.click('gold');
      render();
      break;
    }
    case 'take-host':
      send({ t: 'take_host' });
      break;
    case 'mark-hotseat':
      // 房主把空席位标记为本机热座席位（联机 + 热座混用）
      send({ t: 'mark_hotseat', seat: Number(el.dataset.seat), on: el.dataset.on === '1' });
      break;
    case 'start-online':
      send({ t: 'start', mode: 'online' });
      break;
    case 'hotseat-setup':
      ui.modal = 'hotseat';
      render();
      break;
    case 'start-hotseat': {
      const names = ui.hotseatNames.slice(0, ui.hotseatCount).map((n) => n.trim());
      send({ t: 'start', mode: 'hotseat', names });
      ui.modal = null;
      ui.curtain = false;
      ui.lastTurnSeat = -1;
      render();
      break;
    }
    case 'pick-token': {
      const c = el.dataset.color;
      if (c === 'gold') {
        toast('黃金是萬用指示物，只能透過「保留一張發展卡」取得，不能直接拿取');
        return;
      }
      if (ui.takeTwo) ui.takeTwo = null;
      if (ui.takeSel[c]) delete ui.takeSel[c];
      else {
        if (Object.keys(ui.takeSel).length >= 3) { toast('一次最多拿 3 种不同颜色'); return; }
        ui.takeSel[c] = 1;
      }
      render();
      break;
    }
    case 'pick-two': {
      const c = el.dataset.color;
      if (c === 'gold') {
        toast('黃金是萬用指示物，不能拿 2 個；只能透過「保留一張發展卡」取得');
        return;
      }
      if (ui.takeTwo && ui.takeTwo.color === c) ui.takeTwo = null;
      else { ui.takeTwo = { color: c }; ui.takeSel = {}; }
      render();
      break;
    }
    case 'clear-take':
      ui.takeSel = {};
      ui.takeTwo = null;
      render();
      break;
    case 'confirm-take': {
      const g = S.game;
      if (ui.takeTwo) {
        const color = ui.takeTwo.color;
        const avail = (g && g.tokens && g.tokens[color]) || 0;
        if (avail < 4) { toast(COLOR_META[color].name + '指示物不足 4 个，不能拿 2 个'); return; }
        ui.takeTwo = null;
        send({ t: 'act', action: { type: 'take2', color } });
        render();
        return;
      }
      const tokens = { ...ui.takeSel };
      const avail = COLORS.filter((c) => ((g && g.tokens[c]) || 0) > 0).length;
      const minimum = Math.min(3, avail);
      const picked = Object.keys(tokens).length;
      if (picked < minimum) {
        toast('还能拿到更多颜色，至少要拿 ' + minimum + ' 种不同颜色');
        return;
      }
      ui.takeSel = {};
      send({ t: 'act', action: { type: 'take', tokens } });
      render();
      break;
    }
    case 'buy':
      send({
        t: 'act',
        action: {
          type: 'buy',
          source: el.dataset.source || 'market',
          level: Number(el.dataset.level),
          index: Number(el.dataset.index)
        }
      });
      break;
    case 'reserve':
      ui.reserveTarget = { source: 'market', level: Number(el.dataset.level), index: Number(el.dataset.index) };
      ui.modal = 'reserve';
      render();
      break;
    case 'reserve-deck':
      ui.reserveTarget = { source: 'deck', level: Number(el.dataset.level) };
      ui.modal = 'reserve';
      render();
      break;
    case 'confirm-reserve': {
      const t = ui.reserveTarget;
      ui.reserveTarget = null;
      ui.modal = null;
      if (t) {
        if (t.source === 'deck') {
          send({ t: 'act', action: { type: 'reserve', source: 'deck', level: t.level } });
        } else {
          send({ t: 'act', action: { type: 'reserve', source: 'market', level: t.level, index: t.index } });
        }
      }
      render();
      break;
    }
    case 'choose-noble':
      send({ t: 'act', action: { type: 'chooseNoble', nobleId: el.dataset.noble } });
      ui.modal = null;
      render();
      break;
    case 'pick-return': {
      const c = el.dataset.color;
      const v = buildView();
      const excess = S.game.pending.excess;
      const used = Object.values(ui.returnSel).reduce((a, b) => a + b, 0);
      if (ui.returnSel[c]) delete ui.returnSel[c];
      else {
        if (used >= excess) { toast('已选够 ' + excess + ' 个'); return; }
        ui.returnSel[c] = 1;
      }
      render();
      break;
    }
    case 'confirm-return':
      send({ t: 'act', action: { type: 'returnTokens', tokens: { ...ui.returnSel } } });
      ui.returnSel = {};
      ui.modal = null;
      render();
      break;
    case 'skip':
      send({ t: 'skip' });
      break;
    case 'takeover':
      send({ t: 'takeover' });
      break;
    case 'reset':
      send({ t: 'reset' });
      ui.modal = null;
      break;
    case 'player-detail':
      ui.detailSeat = Number(el.dataset.seat);
      ui.modal = 'player-detail';
      render();
      break;
    case 'rules':
      ui.modal = 'rules';
      render();
      break;
    case 'close-modal':
      ui.modal = null;
      ui.reserveTarget = null;
      render();
      break;
    case 'close-bg':
      if (e.target !== el) return;
      ui.modal = null;
      ui.reserveTarget = null;
      render();
      break;
    case 'curtain-go':
      ui.curtain = false;
      render();
      break;
    case 'copy': {
      const input = document.getElementById('share-url');
      if (input) {
        input.select();
        try { document.execCommand('copy'); } catch (err) { /* ignore */ }
        if (navigator.clipboard) navigator.clipboard.writeText(shareUrl()).catch(() => {});
        toast('已复制地址，发送给好友即可');
      }
      break;
    }
    default:
      break;
  }
});

/* 双击卡牌购买 */
document.addEventListener('dblclick', (e) => {
  const card = e.target.closest('[data-dblbuy]');
  if (!card) return;
  const slot = card.closest('.card-slot');
  if (!slot) return;
  e.preventDefault();
  audio.click('buy');
  send({
    t: 'act',
    action: {
      type: 'buy',
      source: slot.dataset.source || 'market',
      level: Number(slot.dataset.level),
      index: Number(slot.dataset.index)
    }
  });
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'join-form') return;
  e.preventDefault();
  const input = document.getElementById('join-name');
  const name = (input && input.value || '').trim();
  if (!name) { toast('请先输入昵称'); return; }
  ui.joinName = name;
  const roomInput = document.getElementById('join-room');
  const room = normalizeRoom((roomInput && roomInput.value) || '');
  ui.roomCode = room;
  syncRoomUrl(room);
  const saved = readSaved();
  send({ t: 'hello', name, token: saved ? saved.token : undefined, room });
});

document.addEventListener('keydown', (e) => {
  if (e.target && e.target.id === 'seat-name' && e.key === 'Enter') {
    e.preventDefault();
    const btn = document.querySelector('[data-act="rename"]');
    if (btn) btn.click();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'join-name') { ui.joinName = e.target.value; return; }
  if (e.target.id === 'seat-name') { ui.lobbyName = e.target.value; return; }
  if (e.target.id === 'join-room') { ui.roomCode = e.target.value; return; }
  if (e.target.id === 'hotseat-count') {
    ui.hotseatCount = Number(e.target.value) || 3;
    render();
    return;
  }
  if (e.target.dataset && e.target.dataset.hotseatName !== undefined) {
    ui.hotseatNames[Number(e.target.dataset.hotseatName)] = e.target.value;
  }
});

/* ---------------- 全局错误提示 ---------------- */
window.addEventListener('error', (ev) => {
  const where = ev.filename ? ' (' + String(ev.filename).split('/').pop() + ':' + ev.lineno + ')' : '';
  toast('页面错误：' + (ev.message || '未知错误') + where);
});
window.addEventListener('unhandledrejection', (ev) => {
  const reason = ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason || '未知');
  toast('异步错误：' + reason);
});

/* ---------------- 启动 ---------------- */
function loadArt() {
  fetch(av('assets/cards/manifest.json'))
    .then((r) => (r.ok ? r.json() : {}))
    .then((j) => { if (j && typeof j === 'object') { ui.artMap = j; if (S.game) render(); } })
    .catch(() => {});
}

loadArt();
connect();
render();
