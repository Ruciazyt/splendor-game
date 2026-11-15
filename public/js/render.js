import { COLORS, ALL_COLORS, COLOR_META, COLOR_IMG, CARD_BACK, gem, tokenImg, tokenList, gemList, av } from './icons.js';

export const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- 加入 ---------------- */
export function renderJoin(v = {}) {
  const roomVal = v.roomCode != null ? v.roomCode : (v.room || '');
  return `
  <div class="join panel">
    <img class="join__logo" src="${av('assets/tokens/gold.png')}" alt="" />
    <h1>璀璨宝石</h1>
    <p class="sub">SPLENDOR · 好友联机 / 同屏热座</p>
    <form id="join-form" autocomplete="off">
      <div class="join__row">
        <input id="join-name" maxlength="12" placeholder="你的昵称" value="${esc(v.name || '')}" required />
        <button class="btn btn--primary" type="submit">加入牌桌</button>
      </div>
      <div class="join__row join__row--sub">
        <input id="join-room" maxlength="12" placeholder="房间码（留空 = 主桌）" value="${esc(roomVal)}" autocomplete="off" />
        <button class="btn" type="button" data-act="create-room">新建房间</button>
      </div>
    </form>
    <p class="hint" style="margin-top:18px">
      点「新建房间」开一张自己的牌桌，把地址或房间码发给朋友即可同桌。<br/>
      也可以选择「热座模式」，在同一台设备上轮流操作。
    </p>
  </div>`;
}

/* ---------------- 大厅 ---------------- */
export function renderLobby(v) {
  const { lobby, me } = v;
  const players = lobby.players || [];
  const seated = players.filter((p) => p.seat != null);
  const online = seated.filter((p) => p.connected);
  const isHost = me && me.isHost;
  // 房主标记的「本机热座席位」：和在线玩家同桌，混合模式
  const hotSeats = lobby.hotseatSeats || [];
  const roomCode = lobby.room || '';
  const roomLabel = roomCode && !lobby.isDefault ? roomCode : '主桌';
  const hotCount = hotSeats.length;
  const totalPlayers = online.length + hotCount;
  const seats = [];
  for (let i = 0; i < 6; i++) {
    const p = seated.find((x) => x.seat === i);
    if (p) {
      const isMe = p.id === me.id;
      seats.push(`
        <div class="seat">
          <div class="seat__avatar">${esc((p.name || '?').slice(0, 1))}</div>
          <div style="flex:1;min-width:0">
            <div class="seat__name">
              ${isMe
                ? '<span class="seat__edit"><input id="seat-name" maxlength="12" value="' + esc(v.nameDraft || p.name || '') + '" aria-label="你的昵称" /><button class="btn btn--ghost btn--sm" data-act="rename">保存</button></span>'
                : esc(p.name)}
              ${p.isHost ? '<span class="tag">房主</span>' : ''}${p.connected ? '' : '<span class="tag tag--me">离线</span>'}
            </div>
            <div class="seat__meta">席位 ${i + 1}${isMe ? ' · 你' : ''}</div>
          </div>
          <button class="btn btn--ghost btn--sm" data-act="leave-seat" data-seat="${p.seat}">${isMe ? '离座' : '移出'}</button>
        </div>`);
    } else if (hotSeats.indexOf(i) >= 0) {
      seats.push(`
        <div class="seat seat--hot">
          <div class="seat__avatar seat__avatar--hot">${i + 1}</div>
          <div style="flex:1;min-width:0">
            <div class="seat__name">热座席位 <span class="tag tag--hot">本机</span></div>
            <div class="seat__meta">由这台设备控制，多位玩家轮流操作</div>
          </div>
          ${isHost ? `<button class="btn btn--ghost btn--sm" data-act="mark-hotseat" data-seat="${i}" data-on="0">取消</button>` : ''}
        </div>`);
    } else {
      seats.push(`
        <div class="seat seat--empty">
          <div class="seat__avatar" style="opacity:.5">${i + 1}</div>
          <div style="flex:1"><div class="seat__name">空席位</div><div class="seat__meta">点击坐下</div></div>
          ${isHost ? `<button class="btn btn--ghost btn--sm" data-act="mark-hotseat" data-seat="${i}" data-on="1">标为热座</button>` : ''}
          <button class="btn btn--ghost btn--sm" data-act="sit" data-seat="${i}">坐下</button>
        </div>`);
    }
  }
  return `
  <div class="lobby">
    <div class="topbar">
      <div class="topbar__title">璀璨宝石</div>
      <div class="pill ${v.connected ? 'pill--live' : 'pill--off'}">${v.connected ? '已连接' : '连接中…'}</div>
      <div class="topbar__spacer"></div>
      <button class="btn btn--ghost btn--sm" data-act="rules">规则速览</button>
    </div>
    <div class="lobby__grid">
      <section class="panel">
        <h3 class="panel__title">牌桌 <small>${esc(roomLabel)} · ${online.length} 人在线 / ${seated.length} 人已就座</small></h3>
        <div class="seats">${seats.join('')}</div>
        <div class="lobby__row">
          ${isHost
            ? `<button class="btn btn--primary" data-act="start-online" ${totalPlayers < 2 ? 'disabled' : ''}>开始游戏（${totalPlayers} 人）</button>
               <button class="btn" data-act="hotseat-setup">全热座模式（同一设备）</button>
               <span class="hint">可以混用：空席位标成「热座」由这台设备轮流操作，联机好友在自己设备上行动。</span>`
            : `<button class="btn btn--primary" data-act="start-online" ${totalPlayers < 2 ? 'disabled' : ''}>开始游戏（${totalPlayers} 人）</button>
               <button class="btn" data-act="hotseat-setup">全热座模式（同一设备）</button>
               <span class="hint">任何人都可以开局，谁开谁当本局房主——不会因为某人掉线而卡住。</span>
               <button class="btn btn--ghost btn--sm" data-act="take-host">我来当房主</button>`}
        </div>
      </section>
      <section class="panel">
        <h3 class="panel__title">邀请好友</h3>
        <div class="share">
          <input readonly value="${esc(v.shareUrl)}" id="share-url" />
          <button class="btn btn--sm" data-act="copy">复制</button>
        </div>
        <p class="hint" style="margin-top:10px">把上面的地址发给朋友，他们在同一网络下打开就能加入这张牌桌；也可以只发房间码，让朋友在加入页填入。</p>
        ${roomCode && !lobby.isDefault
          ? '<div style="margin-top:12px"><div class="kv"><span>房间码</span><b>' + esc(roomCode) + '</b></div></div>'
          : ''}
        <div class="lobby__row">
          <button class="btn btn--ghost btn--sm" data-act="create-room">新建房间</button>
          <button class="btn btn--ghost btn--sm" data-act="leave">离开牌桌</button>
        </div>
      </section>
    </div>
  </div>`;
}

/* ---------------- 卡牌 ---------------- */
export function cardFace(card, opts = {}) {
  const src = card.image ? av('assets/cards/' + card.image) : '';
  const acts = opts.actions
    ? `<div class="card__acts">
        ${opts.source === 'market' ? `<button class="btn btn--ghost btn--sm" data-act="reserve" data-level="${card.level}" data-index="${opts.index}">留</button>` : ''}
      </div>`
    : '';
  return `
  <div class="card-slot ${opts.canBuy ? 'card-slot--buyable' : ''}" data-level="${card.level}" data-index="${opts.index}" data-source="${opts.source || 'market'}">
    <div class="card ${opts.actions ? 'card--act' : ''}" data-card="${esc(card.cardKey || card.uid || '')}"
         ${opts.canBuy ? 'data-dblbuy="1" title="双击这张卡购买"' : ''}>
      <img class="card__art" src="${src}" alt="等级${card.level}发展卡" loading="lazy" />
      ${opts.tag ? `<span class="card__tag">${esc(opts.tag)}</span>` : ''}
    </div>
    ${acts}
  </div>`;
}

/* ---------------- 贵族 ---------------- */
export function nobleTileClass(n, v) {
  const takenBy = n.takenBy;
  const mine = takenBy != null && takenBy === v.meSeat;
  const owner = takenBy != null ? (v.game.players.find((p) => p.index === takenBy) || {}).name : '';
  // 当前行动者是否已满足该贵族的红利需求
  const bonuses = (v.activePlayer && v.activePlayer.bonuses) || {};
  const ready = takenBy == null && COLORS.every((c) => (bonuses[c] || 0) >= (n.require[c] || 0));
  return `noble ${takenBy != null ? 'noble--taken' : ''} ${mine ? 'noble--mine' : ''} ${ready ? 'noble--ready' : ''}`;
}

export function nobleTileInner(n, v) {
  const takenBy = n.takenBy;
  const mine = takenBy != null && takenBy === v.meSeat;
  const owner = takenBy != null ? ((v.game.players.find((p) => p.index === takenBy) || {}).name || '') : '';
  const bonuses = (v.activePlayer && v.activePlayer.bonuses) || {};
  const ready = takenBy == null && COLORS.every((c) => (bonuses[c] || 0) >= (n.require[c] || 0));
  return `
    ${owner ? `<div class="noble__owner">${esc(owner)}</div>` : ''}
    ${ready ? '<div class="noble__flag">可拜访</div>' : ''}
    <div class="noble__art" style="background-image:url('${av('assets/nobles/' + esc(n.image || ''))}')"></div>
    <div class="noble__name">${esc(n.nameZh || n.name)}<small>${esc(n.name || '')}</small></div>`;
}

function nobleTile(n, v) {
  return `<div class="${nobleTileClass(n, v)}">${nobleTileInner(n, v)}</div>`;
}

/* ---------------- 玩家 ---------------- */
export function playerRowClass(p, v) {
  const isTurn = v.game.turn === p.index;
  const me = p.index === v.meSeat;
  return `player ${isTurn ? 'player--turn' : ''} ${me && !v.hotseat ? 'player--me' : ''} ${(v.flashPoints || {})[p.index] ? 'player--score-up' : ''}`;
}

export function playerRowInner(p, v) {
  const isTurn = v.game.turn === p.index;
  const me = p.index === v.meSeat;
  // 指示物总数（含黄金），紧跟在「持有」后面
  const tokenTotal = Object.values(p.tokens || {}).reduce((a, b) => a + (b || 0), 0);
  // 侧栏只留关键信息（声望 / 持有 / 红利 / 保留 / 贵族）；
  // 买了哪些卡、留了哪些卡在「详情」弹窗里看。
  return `
    <div class="player__score">
      <div class="player__points">${p.points}</div>
      <div class="player__label">声望</div>
    </div>
    <div style="min-width:0">
      <div class="player__name">${esc(p.name)}
        ${me && !v.hotseat ? '<span class="tag tag--me">你</span>' : ''}
        ${p.hotseat && !v.hotseat ? '<span class="tag tag--hot">本机热座</span>' : ''}
        ${isTurn ? '<span class="tag tag--turn">行动中</span>' : ''}
      </div>
      <div class="player__meta">
        <span class="pl">持有 ${tokenList(p.tokens, { size: 20 })}</span>
        <span class="pl pl--total" title="指示物总数（含黄金）">共 ${tokenTotal}</span>
        <span class="pl">红利 ${gemList(p.bonuses, { size: 17 })}</span>
        <span>保留 ${p.reservedCount}</span>
        <span>贵族 ${p.nobles.length}</span>
      </div>
    </div>
    <button class="btn btn--ghost btn--sm player__detail-btn" data-act="player-detail" data-seat="${p.index}">详情</button>`;
}

function playerRow(p, v) {
  return `<div class="${playerRowClass(p, v)}">${playerRowInner(p, v)}</div>`;
}

/* ---------------- 主界面（分区渲染：只更新变化的部分，图片不重载） ---------------- */

export function topbarHtml(v) {
  const g = v.game;
  const cur = g.players[g.turn] || {};
  return `
    <div class="topbar__title">璀璨宝石</div>
    <div class="topbar__turn">当前行动<b>${esc(cur.name || '')}</b></div>
    ${v.canAct ? '<div class="pill pill--gold">轮到你行动</div>' : `<div class="pill">等待 ${esc(v.currentName || '')} 行动</div>`}
    <div class="pill">第 ${(g.turnsTaken || 0) + 1} 轮</div>
    <div class="pill">胜利 ${v.winScore} 点</div>
    ${g.finalRound ? '<div class="pill pill--gold">最终轮</div>' : ''}
    ${v.hotseat ? '<div class="pill">热座模式</div>' : ''}
    <div class="topbar__spacer"></div>
    ${v.canSkip ? '<button class="btn btn--ghost btn--sm" data-act="skip">跳过本回合</button>' : ''}
    <button class="btn btn--ghost btn--sm" data-act="rules">规则</button>
    ${v.canReset ? '<button class="btn btn--ghost btn--sm" data-act="reset">重开</button>' : ''}
    <button class="btn btn--ghost btn--sm" data-act="sound" title="音效与背景音乐开关">${v.soundOn ? '音效 开' : '音效 关'}</button>
    <button class="btn btn--ghost btn--sm" data-act="leave">离开</button>`;
}

export function bannerHtml(v) {
  if (!v.currentOffline) return '';
  return `<div class="banner banner--warn">
    <span>⚠ <b>${esc(v.currentName || '该玩家')}</b> 已掉线，回合卡在这里，等他回来或由房主跳过。</span>
    ${v.canSkip ? '<button class="btn btn--sm" data-act="skip">跳过该回合</button>' : ''}
    ${v.hotseat && !v.canAct ? '<button class="btn btn--sm" data-act="takeover">接管本设备</button>' : ''}
  </div>`;
}

/* 指示物台：6 个格子（图片只创建一次，之后只更新计数与状态） */
export function tokenCellsHtml(v) {
  const g = v.game;
  return ALL_COLORS.map((c) => {
    const count = (g.tokens || {})[c] || 0;
    const isGold = c === 'gold';
    const can = !isGold && count > 0 && v.canAct;
    return `
    <div class="token-cell" data-color="${c}">
      <button class="token ${can ? '' : 'token--empty'} ${isGold ? 'token--gold' : ''}"
              data-act="${can ? 'pick-token' : ''}" data-color="${c}" aria-label="${COLOR_META[c].name}"
              ${isGold ? 'title="黄金是万能指示物，只能通过「保留一张发展卡」获得"' : ''}>
        <span class="token__art" style="background-image:url('${COLOR_IMG[c]}')"></span>
        <span class="token__count">${count}</span>
        <span class="token__name">${COLOR_META[c].name}</span>
      </button>
      ${isGold ? '<span class="token__note">保留卡牌获得</span>' : ''}
    </div>`;
  }).join('');
}

export function takeBarHtml(v) {
  const selText = v.selText || '';
  const pendingTwo = v.ui.takeTwo;
  const pickedCount = v.pickedCount || 0;
  const needMore = v.needMore;
  return `
      <div class="take-bar__sel">
        ${pendingTwo
          ? `已选：<b>${COLOR_META[pendingTwo.color].name} × 2</b>（同色需场上 ≥4 个）`
          : selText
            ? `已选：<b>${esc(selText)}</b>　${needMore ? `还需再选 ${v.minTake - pickedCount} 种颜色` : '可以拿取了'}`
            : v.canAct ? `点选颜色拿取（需 ${v.minTake} 种不同颜色）` : `等待 ${esc(v.currentName || '')} 行动…`}
      </div>
      ${v.canAct
        ? `<button class="btn btn--primary" data-act="confirm-take" ${(!selText && !pendingTwo) || needMore ? 'disabled' : ''}>
            确认拿取${pendingTwo ? '（2）' : selText ? '（' + pickedCount + '/' + v.minTake + '）' : ''}
          </button>`
        : '<button class="btn" disabled>不是你的回合</button>'}
      ${selText || pendingTwo ? '<button class="btn btn--ghost btn--sm" data-act="clear-take">取消</button>' : ''}
`;
}

export function logHtml(v) {
  const log = (v.game.log || []).slice().reverse();
  return log.length ? log.map((l) => `<div>${esc(l.text)}</div>`).join('') : '<div>暂无记录</div>';
}

export function noblesHtml(v) {
  return (v.game.nobles || []).map((n) => nobleTile(n, v)).join('');
}

export function playersHtml(v) {
  return (v.game.players || []).map((p) => playerRow(p, v)).join('');
}

export function reservedHtml(v) {
  const active = v.activePlayer;
  const reserved = (active.reserved || []).map((c, i) =>
    cardFace(c, { index: i, source: 'reserved', actions: v.canAct, canBuy: v.canAct })).join('');
  return `
    <h3 class="panel__title">${v.hotseat ? '当前玩家' : '我的保留卡'} <span class="hint">${(active.reserved || []).length}/3</span></h3>
    ${reserved ? `<div class="cards-row">${reserved}</div>`
      : (v.viewSeatMine || !(active.reservedCount > 0) ? '<p class="hint">暂无保留卡</p>' : '<p class="hint">该玩家的保留卡不可见</p>')}`;
}

/* 发展卡市场：按等级分行，行内结构变了才重建 */
export function tierInnerHtml(v, lvl) {
  const g = v.game;
  const row = g.market[lvl - 1] || [];
  const deckCount = (g.deckCounts || [])[lvl - 1] || 0;
  const cards = row.map((c, i) => cardFace(c, { index: i, actions: v.canAct, canBuy: canBuyCard(v, c), source: 'market' })).join('');
  return `
    <div class="tier__head">等级 ${lvl}<span class="tier__count">牌库 ${deckCount} 张</span></div>
    <div class="tier__cards">
      ${cards}
      <div class="deck" data-act="${v.canAct && deckCount > 0 ? 'reserve-deck' : ''}" data-level="${lvl}"
           style="background-image:url('${CARD_BACK[lvl]}')" title="从牌库顶保留一张（暗牌）">
        <div class="deck__badge">${deckCount}</div>
      </div>
    </div>`;
}

export function tiersHtml(v) {
  return [1, 2, 3].map((lvl) => `<div class="tier" data-level="${lvl}">${tierInnerHtml(v, lvl)}</div>`).join('');
}

/* 这张卡当前买得起吗 */
export function canBuyCard(v, c) {
  if (!v.canAct) return false;
  const me = v.activePlayer;
  const myTokens = me.tokens || {};
  const myBonuses = me.bonuses || {};
  let shortage = 0;
  for (const col of COLORS) {
    const due = Math.max(0, (c.cost[col] || 0) - (myBonuses[col] || 0));
    shortage += Math.max(0, due - (myTokens[col] || 0));
  }
  return shortage <= (myTokens.gold || 0);
}

export function renderGame(v) {
  const g = v.game;
  return `
  <div class="topbar">${topbarHtml(v)}</div>
  ${bannerHtml(v)}
  <div class="layout">
    <div class="col col--left">
      <section class="panel">
        <h3 class="panel__title">指示物 <span class="hint">点选后按确认拿取</span></h3>
        <div class="tray">${tokenCellsHtml(v)}</div>
        <div class="take-bar">${takeBarHtml(v)}</div>
      </section>
      <section class="panel">
        <h3 class="panel__title">贵族圆板 <span class="hint">满足红利即自动拜访 · 每片 3 点</span></h3>
        <div class="nobles">${noblesHtml(v)}</div>
      </section>
    </div>
    <div class="col col--center">
      <section class="panel panel--dark">
        <h3 class="panel__title">发展卡市场 <span class="hint">双击卡牌购买 · 「留」保留（会再确认一次，并拿走 1 黄金）</span></h3>
        ${tiersHtml(v)}
      </section>
    </div>
    <div class="col col--right">
      <section class="panel">
        <h3 class="panel__title">玩家 <span class="hint">${v.hotseat ? esc(v.currentName || '') : '你 = ' + esc(v.meName || '')}</span></h3>
        <div class="players">${playersHtml(v)}</div>
      </section>
      <section class="panel panel--reserved">${reservedHtml(v)}</section>
      <section class="ledger">
        <div class="ledger__head">战报</div>
        <div class="ledger__body">${logHtml(v)}</div>
      </section>
    </div>
  </div>`;
}

/* ---------------- 规则 ---------------- */
export function rulesHtml() {
  return `
  <div class="rules">
    <h4>目标</h4>
    <p>攒声望点数（卡牌数字 + 每位贵族 3 点）。有人达到 <b>15 点</b>时结束当前回合，让每人回合数相同后结束；平局则购买发展卡最少者获胜。</p>
    <h4>设置</h4>
    <ul>
      <li>指示物：绿/白/蓝/黑/红各 7 个 + 黄金 5 个。2 人局每色移除 3 个，3 人局每色移除 2 个。</li>
      <li>发展卡 90 张分 3 个等级（40/30/20 张），每级翻开 4 张，牌库空则不补。</li>
      <li>贵族圆板翻开「人数 + 1」张。</li>
    </ul>
    <h4>每回合四选一</h4>
    <ul>
      <li>拿 3 种不同颜色的指示物（凑不满 3 种时可拿 2 种甚至 1 种）。</li>
      <li>拿 2 个同色指示物（该颜色场上需剩 4 个以上）。</li>
      <li>保留 1 张发展卡（场上翻开或牌库顶，牌库顶为暗牌）并拿 1 个黄金；保留上限 3 张，不能弃牌。</li>
      <li>购买 1 张发展卡：场上翻开或自己保留的。黄金可代替任意颜色，花掉的指示物回到场中。</li>
    </ul>
    <h4>红利与贵族</h4>
    <ul>
      <li>每张发展卡右上角的宝石是<b>永久</b>红利，购买时抵扣同色费用（不消耗）。</li>
      <li>回合结束时检查贵族：满足需求自动拜访、不可拒绝；多张同时满足时可自选一张。</li>
      <li>保留卡是获得黄金的唯一方式。</li>
    </ul>
    <h4>限制</h4>
    <ul>
      <li>回合结束时手上指示物不得超过 10 个（含黄金），超出必须放回。</li>
      <li>玩家的宝石与红利对所有玩家可见。</li>
    </ul>
  </div>`;
}
