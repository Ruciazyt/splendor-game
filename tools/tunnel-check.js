'use strict';
/**
 * 公网隧道自检：验证 HTTP 与 WebSocket 是否都通。
 * 用法： node tools/tunnel-check.js <公网地址> [直连IP]
 *   第二个参数用于本地 DNS 尚未生效时，绕过解析直连 Cloudflare 边缘 IP。
 */
const { connect } = require('./ws-client.js');

const target = (process.argv[2] || '').replace(/\/$/, '');
const ip = process.argv[3] || null;
if (!target) { console.error('用法: node tools/tunnel-check.js <公网地址> [直连IP]'); process.exit(1); }

(async () => {
  const wsUrl = target.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws';
  try {
    const ws = await connect(wsUrl, ip ? { ip: ip } : null);
    const seen = [];
    ws.onMessage((msg) => seen.push(msg.t));
    ws.send({ t: 'hello', name: '隧道自检' });
    await new Promise((r) => setTimeout(r, 2000));
    const ok = seen.indexOf('hello_ok') >= 0;
    console.log('WebSocket: ' + (ok ? '已连通 ✓' : '握手失败 ✗'));
    console.log('收到消息: ' + seen.join(' -> '));
    console.log('大厅人数: ' + ((ws.lobby && ws.lobby.players || []).length));
    ws.send({ t: 'leave' });
    process.exit(ok ? 0 : 1);
  } catch (err) {
    console.log('WebSocket: 连接失败 ✗ ' + err.message);
    process.exit(1);
  }
})();