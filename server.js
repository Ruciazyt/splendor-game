'use strict';
/**
 * 璀璨宝石 在线桌游 —— 服务端（零依赖）
 *  - 静态资源托管 + 原生 WebSocket（RFC6455 自实现）
 *  - 多房间大厅：主桌（main）+ 任意自建房间（房间码），各房间互不干扰
 *  - 联机模式：每个玩家一个座位；热座模式：一台设备控制全部座位
 *  - 断线重连：客户端保存 token，重连后自动回到原座位
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { attachWebSocket } = require('./server/websocket.js');
const { Game } = require('./server/game.js');

const PORT = Number(process.env.PORT || 3000);
// 挂载前缀：BASE_PATH=/splendor 时应用挂在 https://域名/splendor/ 下（隧道子路径用）
const rawBase = String(process.env.BASE_PATH || '').trim().replace(/^\/+|\/+$/g, '');
const BASE_PATH = rawBase ? '/' + rawBase : '';
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

// 图片 / 字体等可长期缓存的素材
const ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2', '.woff3', '.ttf', '.mp3', '.mp4']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/* ---------------- 房间 ----------------
   一个房间 = 一张独立的牌桌：自己的座位表、自己的对局、自己的战报。
   主桌房间码固定为 main（直接打开网址就能进）；
   「新建房间」由服务端生成房间码，房间之间完全隔离。 */
const DEFAULT_ROOM = 'MAIN';   // 与 normalizeRoomId 的大写规则保持一致
// 对局停滞回收：超过 5 分钟没有任何操作就结束该局并回收房间（结束前 1 分钟提醒）
const IDLE_GAME_MS = Number(process.env.IDLE_GAME_MS || 5 * 60 * 1000);
const IDLE_WARN_MS = Number(process.env.IDLE_WARN_MS || 60 * 1000);
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉 0/O/1/I/L 等易混字符
const rooms = new Map();      // roomId -> room
const connRooms = new Map();  // connId -> roomId

function normalizeRoomId(id) {
  const s = String(id == null ? '' : id).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return s || DEFAULT_ROOM;
}

function randomRoomId() {
  let id = '';
  do {
    id = '';
    for (let i = 0; i < 5; i++) id += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  } while (rooms.has(id));
  return id;
}

function getRoom(id) {
  const key = normalizeRoomId(id);
  let room = rooms.get(key);
  if (!room) {
    room = {
      id: key,
      records: new Map(),
      game: null,
      hotseatSeats: new Set(),
      createdAt: Date.now(),
      lastActive: Date.now(),
      activityAt: Date.now(),   // 最近一次对局相关操作（任何客户端消息都会刷新）
      idleWarned: false        // 是否已经发过停滞提醒
    };
    rooms.set(key, room);
  }
  room.lastActive = Date.now();
  return room;
}

function roomOf(connId) {
  return getRoom(connRooms.get(connId) || DEFAULT_ROOM);
}

/* ---------------- 牌桌状态 ---------------- */
let seq = 0;

function nextSeat(room) {
  for (let i = 0; i < 6; i++) {
    let used = false;
    for (const r of room.records.values()) if (r.joined && r.seat === i) { used = true; break; }
    if (!used) return i;
  }
  return null;
}

function isHostRecord(room) {
  for (const r of room.records.values()) if (r.isHost) return r;
  return null;
}

// 保证在线玩家中始终有一位房主（原房主掉线时自动移交）
function ensureHost(room, prefer) {
  const joined = [...room.records.values()].filter((r) => r.joined);
  // 对局进行中：房主固定为开局者（断线重连也不会易主）
  if (room.game && room.game.controllerToken) {
    const ctrl = joined.find((r) => r.token === room.game.controllerToken);
    if (ctrl) {
      for (const r of joined) r.isHost = r === ctrl;
      return;
    }
  }
  const host = joined.find((r) => r.isHost);
  if (host && host.connected) return;
  const candidates = joined.filter((r) => r.connected);
  if (!candidates.length) return;
  if (host) host.isHost = false;
  const next = prefer && prefer.joined && prefer.connected ? prefer : candidates[0];
  next.isHost = true;
}

function lobbyPayload(room) {
  const players = [...room.records.values()]
    .filter((r) => r.joined)
    .sort((a, b) => (a.seat == null ? 99 : a.seat) - (b.seat == null ? 99 : b.seat))
    .map((r) => ({
      id: r.id,
      name: r.name,
      seat: r.seat,
      connected: r.connected,
      isHost: r.isHost
    }));
  return {
    room: room.id,
    isDefault: room.id === DEFAULT_ROOM,
    players,
    gameStarted: !!room.game,
    hotseatSeats: [...room.hotseatSeats].sort((a, b) => a - b)
  };
}

function broadcastLobby(room) {
  const payload = lobbyPayload(room);
  for (const r of room.records.values()) {
    send(r.connId, { t: 'lobby', lobby: payload });
  }
}

function personalizedState(room, r) {
  const game = room.game;
  // 自己的联网席位：用 token 在对局玩家表里查，座位号才是权威的
  const gp = game.players.find((p) => p.token && p.token === r.token);
  const gameSeat = gp ? gp.index : -1;
  // 本机控制的热座席位（热座 / 混合模式）
  const isHotseatOwner = !!game.hotseatToken && r.token === game.hotseatToken;
  const myHotseatSeats = isHotseatOwner
    ? game.players.filter((p) => !p.token).map((p) => p.index)
    : [];
  const controlled = [...(gameSeat >= 0 ? [gameSeat] : []), ...myHotseatSeats];
  const state = game.publicState(controlled);
  const ctrl = game.controllerToken
    ? [...room.records.values()].find((x) => x.token === game.controllerToken)
    : null;
  state.you = {
    seat: gameSeat,               // 自己的联网席位（热座设备为 -1）
    isGameHost: !!game.controllerToken && game.controllerToken === r.token, // 本局房主（开局者）
    hotseatSeats: myHotseatSeats, // 本机接管的热座席位
    lobbySeat: r.seat,
    isHost: r.isHost,
    controlsHotseat: isHotseatOwner,
    // 原热座操作者掉线时，房主可以接管操作权
    canTakeoverHotseat:
      !!game.hotseatToken && !isHotseatOwner && (!ctrl || !ctrl.connected)
  };
  // 当前行动席位的控制者是否掉线
  const ownerToken = game.seatOwnerToken(game.turn);
  const ownerRec = ownerToken
    ? [...room.records.values()].find((x) => x.token === ownerToken)
    : null;
  state.currentOffline = !ownerRec || !ownerRec.connected;
  return state;
}

function broadcastState(room) {
  if (!room.game) return;
  for (const r of room.records.values()) {
    send(r.connId, { t: 'state', state: personalizedState(room, r) });
  }
}

const sockets = new Map(); // connId -> peer

function send(connId, obj) {
  const peer = sockets.get(connId);
  if (peer && !peer.closed) {
    try {
      peer.sendJSON(obj);
    } catch (err) {
      /* ignore */
    }
  }
}

// 素材版本号：public/assets 下最新修改时间。
// 素材地址带上版本号后即可 immutable 长期缓存；换素材自动换版本，旧缓存自然失效。
let assetVerCache = { v: 0, at: 0 };
function assetVersion() {
  const now = Date.now();
  if (now - assetVerCache.at < 5000) return assetVerCache.v;
  let max = 0;
  const walk = (dir) => {
    let items = [];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const it of items) {
      const p = path.join(dir, it.name);
      if (it.isDirectory()) { walk(p); continue; }
      try { const st = fs.statSync(p); if (st.mtimeMs > max) max = st.mtimeMs; } catch (e) { /* ignore */ }
    }
  };
  walk(path.join(PUBLIC_DIR, 'assets'));
  assetVerCache = { v: Math.floor(max), at: now };
  return assetVerCache.v;
}

/* 代码版本号：public/js 下任意一个模块改动都会让版本号变化。
   入口页与模块之间的相对导入都带这个版本号，
   浏览器/Cloudflare 就不会继续用旧模块（旧的 icons.js / render.js 会导致界面不更新）。 */
let jsVerCache = { v: 0, at: 0 };
function jsVersion() {
  const now = Date.now();
  if (now - jsVerCache.at < 2000) return jsVerCache.v;
  let max = 0;
  let items = [];
  try { items = fs.readdirSync(path.join(PUBLIC_DIR, 'js')); } catch (e) { return jsVerCache.v; }
  for (const name of items) {
    if (!/\.js$/.test(name)) continue;
    try {
      const st = fs.statSync(path.join(PUBLIC_DIR, 'js', name));
      if (st.mtimeMs > max) max = st.mtimeMs;
    } catch (e) { /* ignore */ }
  }
  jsVerCache = { v: Math.floor(max), at: now };
  return jsVerCache.v;
}

/* ---------------- HTTP 静态服务 ---------------- */
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (BASE_PATH) {
    // 挂在子路径下：剥掉前缀；无前缀一律 404（隧道只转发该子路径）
    if (urlPath === BASE_PATH) {
      res.writeHead(301, { Location: BASE_PATH + '/' }).end();
      return;
    }
    if (urlPath.indexOf(BASE_PATH + '/') === 0) {
      urlPath = urlPath.slice(BASE_PATH.length);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }
  }
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^([\/])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    // 静态资源缓存策略：
    //   html / css / js  → no-cache + ETag：每次校验，未改动返回 304，不重复下载
    //   图片等素材        → public, max-age=604800：一周内直接用本地缓存，
    //                      牌面重绘时不会再发请求
    const isAsset = ASSET_EXT.has(ext);
    const etag = '"' + stat.size.toString(16) + '-' + Math.floor(stat.mtimeMs).toString(16) + '"';
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      ETag: etag,
      'Last-Modified': stat.mtime.toUTCString(),
      'Cache-Control': isAsset ? 'public, max-age=604800, immutable' : 'no-cache'
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    if (ext === '.html') {
      // 把挂载前缀注入页面，前端据此拼接 WebSocket 与分享地址
      fs.readFile(filePath, 'utf8', (e2, html) => {
        if (e2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
          return;
        }
        // 版本号按文件修改时间自动生成：改了 css/js 刷新即生效，不用手改版本
        let out = String(html).split('__BASE_PATH__').join(BASE_PATH);
        out = out.split('__ASSET_VER__').join(String(assetVersion()));
        out = out.replace(/([\w./-]+\.(?:css|js))\?v=[0-9a-zA-Z]+/g, (m, rel) => {
          if (/\.js$/.test(rel)) return rel + '?v=' + jsVersion();
          try {
            const st = fs.statSync(path.join(PUBLIC_DIR, rel));
            return rel + '?v=' + Math.floor(st.mtimeMs);
          } catch (e) {
            return m;
          }
        });
        res.writeHead(200, headers).end(out);
      });
      return;
    }
    if (ext === '.js') {
      // ES module 的相对导入（'./render.js' 等）也要带版本号：
      // 否则浏览器/Cloudflare 会按旧 URL 缓存模块，改了 icons.js 也不生效。
      // 这里按被导入文件的修改时间改写成 './render.js?v=<mtime>'。
      fs.readFile(filePath, 'utf8', (e2, js) => {
        if (e2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
          return;
        }
        const ver = jsVersion();
        const out = js.replace(/(['"])(\.\/[A-Za-z0-9_\-./]+\.js)\1/g, (m, q, rel) => {
          if (rel.indexOf('?') >= 0) return m;
          return q + rel + '?v=' + ver + q;
        });
        res.writeHead(200, headers).end(out);
      });
      return;
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    let players = 0;
    for (const room of rooms.values()) players += room.records.size;
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({ ok: true, rooms: rooms.size, players })
    );
    return;
  }
  serveStatic(req, res);
});

/* ---------------- WebSocket 协议 ---------------- */

// 把连接搬到另一个房间（换房间码 / 新建房间时调用）
function moveToRoom(conn, room) {
  const from = roomOf(conn.id);
  if (from === room) return room;
  const rec = from.records.get(conn.id);
  if (rec) {
    from.records.delete(conn.id);
    rec.seat = null;           // 新房间里重新排座
    rec.isHost = false;
    room.records.set(conn.id, rec);
  }
  connRooms.set(conn.id, room.id);
  // 旧房间可能因此失去房主
  ensureHost(from, null);
  broadcastLobby(from);
  return room;
}

function handleMessage(conn, msg) {
  let room = roomOf(conn.id);
  let rec = room.records.get(conn.id);
  // 任何一条客户端消息都算「房间仍在活动」，用来判断对局是否停滞
  room.activityAt = Date.now();
  room.idleWarned = false;

  switch (msg.t) {
    case 'hello': {
      const name = String(msg.name || '').trim().slice(0, 12) || '玩家';
      let token = String(msg.token || '').trim();
      if (!token) token = 'tok-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

      // 目标房间：create=true → 服务端生成新房间码；否则用 msg.room（空 = 主桌）
      const target = msg.create
        ? getRoom(randomRoomId())
        : getRoom(msg.room ? normalizeRoomId(msg.room) : DEFAULT_ROOM);
      if (target !== room) {
        room = moveToRoom(conn, target);
        rec = room.records.get(conn.id);
      }

      // 重连：同 token 找回原座位
      let existing = null;
      for (const r of room.records.values()) if (r.token === token && r.id !== conn.id) existing = r;
      if (existing) {
        room.records.delete(existing.id);
        existing.id = conn.id;
        existing.connId = conn.id;
        existing.connected = true;
        existing.joined = true;
        existing.name = name;
        room.records.set(conn.id, existing);
      } else {
        room.records.set(conn.id, {
          id: conn.id,
          name,
          token,
          seat: nextSeat(room),
          connId: conn.id,
          connected: true,
          joined: true,
          isHost: false
        });
      }
      rec = room.records.get(conn.id);
      ensureHost(room, rec);
      send(conn.id, {
        t: 'hello_ok',
        you: {
          id: conn.id,
          name: rec.name,
          seat: rec.seat,
          token: rec.token,
          isHost: rec.isHost
        },
        room: room.id,
        lobby: lobbyPayload(room)
      });
      broadcastLobby(room);
      if (room.game) broadcastState(room);
      break;
    }

    case 'rename': {
      // 房间里随时改昵称（加入页填的名字也可以改）
      const name = String(msg.name || '').trim().slice(0, 12);
      if (!name) return send(conn.id, { t: 'error', message: '昵称不能为空' });
      rec.name = name;
      // 对局中的名字也要同步
      if (room.game) {
        const gp = room.game.players.find((p) => p.token && p.token === rec.token);
        if (gp) gp.name = name;
      }
      broadcastLobby(room);
      if (room.game) broadcastState(room);
      break;
    }

    case 'takeover': {
      // 接管热座操作权：原操作者掉线时，房主可以接手本机的热座席位
      const game = room.game;
      if (!game || !game.hotseatToken) return send(conn.id, { t: 'error', message: '当前没有热座席位' });
      if (!rec.isHost) return send(conn.id, { t: 'error', message: '只有房主可以接管热座操作' });
      const ctrl = [...room.records.values()].find((r) => r.token === game.hotseatToken);
      if (ctrl && ctrl.connected) return send(conn.id, { t: 'error', message: '当前操作者仍在线，无需接管' });
      game.hotseatToken = rec.token;
      broadcastState(room);
      break;
    }

    case 'mark_hotseat': {
      // 房主在大厅把某个空席位标记为「本机热座席位」（用于联机 + 热座混用）
      if (!rec.isHost) return send(conn.id, { t: 'error', message: '只有房主可以设置热座席位' });
      if (room.game) return send(conn.id, { t: 'error', message: '对局进行中不能修改席位' });
      const seat = Number(msg.seat);
      if (!Number.isInteger(seat) || seat < 0 || seat > 5) return;
      if (msg.on === false) {
        room.hotseatSeats.delete(seat);
      } else {
        const occupied = [...room.records.values()].some((r) => r.seat === seat && r.id !== rec.id);
        if (occupied) return send(conn.id, { t: 'error', message: '该席位已有在线玩家' });
        room.hotseatSeats.add(seat);
      }
      broadcastLobby(room);
      break;
    }

    case 'take_host': {
      // 房主可以把房主身份交给其他玩家（对局中也可移交，便于换人操作）
      const old = isHostRecord(room);
      if (old) old.isHost = false;
      rec.isHost = true;
      broadcastLobby(room);
      break;
    }

    case 'sit': {
      if (room.game) return send(conn.id, { t: 'error', message: '对局进行中不能更换座位，请等本局结束' });
      const seat = Number(msg.seat);
      if (Number.isInteger(seat) && seat >= 0 && seat < 6) {
        let occupied = false;
        for (const r of room.records.values()) if (r.id !== rec.id && r.seat === seat) occupied = true;
        if (!occupied) {
          rec.seat = seat;
          room.hotseatSeats.delete(seat);
          broadcastLobby(room);
          if (room.game) broadcastState(room);
        }
      }
      break;
    }

    case 'stand': {
      if (room.game) {
        return send(conn.id, { t: 'error', message: '对局进行中不能更换座位，请等本局结束' });
      }
      const seat = msg.seat != null ? Number(msg.seat) : null;
      if (seat != null && seat !== rec.seat && rec.isHost) {
        // 房主可以请其他玩家移出座位
        const target = [...room.records.values()].find((x) => x.seat === seat && x.id !== rec.id);
        if (target) {
          target.seat = null;
          broadcastLobby(room);
        }
        break;
      }
      // 自己离座（房主常需要腾出自己的位置给「本机热座席位」）
      rec.seat = null;
      broadcastLobby(room);
      break;
    }

    case 'start': {
      // 任何玩家都可以开新局：本局房主由开局者担任，房间不会再因为某人掉线而卡死

      const mode = msg.mode === 'hotseat' ? 'hotseat' : 'online';
      let seats = [];
      let hotseatToken = null;
      if (mode === 'hotseat') {
        // 全热座：所有席位都由开局这台设备控制
        const names = Array.isArray(msg.names) ? msg.names : [];
        const count = Math.max(2, Math.min(4, names.length));
        for (let i = 0; i < count; i++) {
          seats.push({ index: i, name: String(names[i] || '').trim() || ('玩家' + (i + 1)), token: null });
        }
        hotseatToken = rec.token;
      } else {
        // 联机 / 混合：在线已就座的玩家 + 房主标记的热座席位
        const seated = [...room.records.values()]
          .filter((r) => r.seat != null && r.connected)
          .sort((a, b) => a.seat - b.seat);
        const hot = [...room.hotseatSeats]
          .filter((s) => !seated.some((r) => r.seat === s))
          .sort((a, b) => a - b);
        if (seated.length + hot.length < 2) {
          return send(conn.id, { t: 'error', message: '至少需要 2 位玩家（在线或热座）才能开局' });
        }
        seats = [
          ...seated.map((r) => ({ index: r.seat, name: r.name, token: r.token })),
          ...hot.map((s) => ({ index: s, name: '热座' + (s + 1), token: null }))
        ].sort((a, b) => a.index - b.index);
        if (hot.length) hotseatToken = rec.token;
      }
      room.game = new Game({
        mode: mode === 'hotseat' ? 'hotseat' : (hotseatToken ? 'mixed' : 'online'),
        seats,
        playerCount: seats.length,
        hotseatToken
      });
      room.game.controllerToken = rec.token;
      broadcastState(room);
      break;
    }

    case 'reset': {
      const game = room.game;
      const isGameHost = !!(game && game.controllerToken && game.controllerToken === rec.token);
      const ended = !game || game.phase === 'ended';
      if (!rec.isHost && !isGameHost && !ended) {
        return send(conn.id, { t: 'error', message: '对局进行中，只有本局房主可以结束本局' });
      }
      room.game = null;
      broadcastLobby(room);
      for (const r of room.records.values()) send(r.connId, { t: 'game_end' });
      break;
    }

    case 'skip': {
      const game = room.game;
      if (!game) return;
      // 当前行动席位的控制者可以跳过；控制者掉线时房主也可以跳过
      const ownerToken = game.seatOwnerToken(game.turn);
      const ownerRec = ownerToken
        ? [...room.records.values()].find((x) => x.token === ownerToken)
        : null;
      const ownerOffline = !ownerRec || !ownerRec.connected;
      const isOwner = !!ownerToken && ownerToken === rec.token;
      if (!(isOwner || (rec.isHost && ownerOffline))) {
        return send(conn.id, { t: 'error', message: '只有当前行动者（或其掉线时的房主）可以跳过回合' });
      }
      const res2 = game.skipCurrent();
      if (!res2.ok) return send(conn.id, { t: 'error', message: res2.error });
      broadcastState(room);
      break;
    }

    case 'act': {
      const game = room.game;
      if (!game) return;
      const action = msg.action || {};
      // 席位归属校验：热座 / 联机 / 混合都用同一套规则
      const actingSeat = game.turn;
      const ownerToken = game.seatOwnerToken(actingSeat);
      const canControl = !!ownerToken && ownerToken === rec.token;
      if (!canControl) return send(conn.id, { t: 'error', message: '还没轮到你行动' });
      const res2 = game.applyAction(actingSeat, action);
      if (!res2.ok) {
        send(conn.id, { t: 'error', message: res2.error });
        send(conn.id, { t: 'state', state: personalizedState(room, rec) }); // 立即回传最新状态，避免客户端状态漂移
        return;
      }
      broadcastState(room);
      break;
    }

    case 'leave': {
      room.records.delete(rec.id);
      sockets.delete(conn.id);
      ensureHost(room, null);
      broadcastLobby(room);
      if (room.game) broadcastState(room);
      break;
    }

    default:
      break;
  }
}

server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  const [pathname, query] = url.split('?');
  const wsPath = BASE_PATH ? BASE_PATH + '/ws' : '/ws';
  if (pathname !== wsPath) {
    socket.destroy();
    return;
  }
  // 连接时可以先用 ?room= 指定房间（默认主桌）；之后也能用 hello 消息换房间
  let roomParam = '';
  try {
    roomParam = new URLSearchParams(query || '').get('room') || '';
  } catch (e) {
    roomParam = '';
  }
  const room = getRoom(roomParam || DEFAULT_ROOM);
  attachWebSocket(req, socket, head, (peer) => {
    const connId = 'c' + (seq++);
    sockets.set(connId, peer);
    connRooms.set(connId, room.id);
    // 连接建立即占位（但不占座位），等待 hello 补全昵称与席位
    room.records.set(connId, {
      id: connId,
      name: '玩家',
      token: null,
      seat: null,
      connId,
      connected: true,
      joined: false,
      isHost: false
    });
    peer.on('message', (text) => {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch (err) {
        return;
      }
      try {
        handleMessage({ id: connId }, msg);
      } catch (err) {
        send(connId, { t: 'error', message: '服务端处理出错：' + err.message });
      }
    });
    peer.on('close', () => {
      sockets.delete(connId);
      const r = roomOf(connId);
      const rec = r.records.get(connId);
      if (rec) {
        rec.connected = false;
        rec.disconnectedAt = Date.now();
        // 断线保留座位，便于用同一 token 重连回来
        ensureHost(r, null);
        broadcastLobby(r);
        const game = r.game;
        if (game) broadcastState(r);
        // 掉线不自动跳过回合：等他重连回来继续，房主也可以手动跳过
      }
    });
  });
});

/* ---------------- 清理：停滞对局回收 / 掉线玩家 / 空房间 ----------------
   对局中超过 IDLE_GAME_MS（默认 5 分钟）没有任何操作，判定为「不活跃」：
   结束该局、通知房间里的人；没人在线的房间直接回收。 */
function killIdleRoom(room, reason) {
  for (const r of room.records.values()) {
    send(r.connId, { t: 'error', message: reason });
    send(r.connId, { t: 'game_end' });
  }
  room.game = null;
  room.hotseatSeats.clear();
  room.activityAt = Date.now();
  room.idleWarned = false;
  // 没人还在线的房间直接回收
  const alive = [...room.records.values()].some((r) => r.connected);
  if (!alive) {
    rooms.delete(room.id);
    return;
  }
  broadcastLobby(room);
}

setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    // 1) 对局停滞：超时回收
    if (room.game) {
      const idle = now - (room.activityAt || room.createdAt);
      if (idle >= IDLE_GAME_MS) {
        killIdleRoom(room, '对局超过 ' + Math.round(IDLE_GAME_MS / 60000) + ' 分钟没有任何操作，已自动结束并回收房间');
        continue;
      }
      // 结束前先提醒一次，让玩家还有机会动一下（任何操作都会重置计时）
      if (!room.idleWarned && idle >= IDLE_GAME_MS - IDLE_WARN_MS) {
        room.idleWarned = true;
        for (const r of room.records.values()) {
          send(r.connId, { t: 'error', message: '对局已停滞，' + Math.round(IDLE_WARN_MS / 1000) + ' 秒后将自动结束' });
        }
      }
      continue; // 对局中不做玩家清理
    }
    room.idleWarned = false;
    // 2) 没有对局：清理长时间掉线的玩家
    let changed = false;
    for (const r of [...room.records.values()]) {
      if (!r.connected && r.disconnectedAt && now - r.disconnectedAt > 30 * 60 * 1000) {
        room.records.delete(r.id);
        changed = true;
      }
    }
    if (changed) broadcastLobby(room);
    // 3) 空房间（没有连接也没有对局）30 分钟后回收
    const alive = [...room.records.values()].some((r) => r.connected);
    if (!alive && !room.game && now - room.lastActive > 30 * 60 * 1000) {
      rooms.delete(room.id);
    }
  }
}, 2 * 1000);

/* ---------------- 启动 ---------------- */
function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

server.listen(PORT, HOST, () => {
  const lines = [];
  lines.push('');
  lines.push('  ✦ 璀璨宝石 · Splendor 在线桌游已启动');
  lines.push('  ─────────────────────────────────────────────');
  lines.push('  本机访问：  http://localhost:' + PORT);
  for (const ip of lanAddresses()) lines.push('  局域网访问： http://' + ip + ':' + PORT);
  lines.push('');
  lines.push('  把「局域网访问」地址发给同事，他们在浏览器打开即可加入牌桌。');
  lines.push('  网页上点「新建房间」可以开一张独立牌桌，把房间码发给朋友即可。');
  lines.push('  按 Ctrl+C 停止服务。');
  lines.push('');
  console.log(lines.join('\n'));
});
