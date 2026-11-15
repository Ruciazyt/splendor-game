'use strict';
/**
 * 测试用 WebSocket 客户端（零依赖）。
 * 用法： const { connect } = require('./ws-client.js');
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');

function connect(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    // ws:// 用 http，wss:// 用 https（Cloudflare Tunnel 走的是 wss）
    const agent = u.protocol === 'wss:' || u.protocol === 'https:' ? https : http;
    // opts.ip：直连指定 IP（保留 SNI 与 Host，用于本地 DNS 未生效时验证域名）
    const ip = (opts && opts.ip) || null;
    const req = agent.request({
      hostname: ip || u.hostname,
      servername: u.hostname,
      port: u.port, path: u.pathname,
      headers: {
        Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
        Host: u.host
      }
    });
    req.on('upgrade', (res, socket) => {
      socket.setNoDelay(true);
      const st = { handlers: [], errors: [], last: null, buffer: Buffer.alloc(0) };
      st.send = (obj) => {
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
      st.onMessage = (fn) => st.handlers.push(fn);
      socket.on('data', (chunk) => {
        st.buffer = Buffer.concat([st.buffer, chunk]);
        for (;;) {
          const buf = st.buffer;
          if (buf.length < 2) return;
          const opcode = buf[0] & 0x0f;
          let len = buf[1] & 0x7f, off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const payload = buf.slice(off, off + len);
          st.buffer = buf.slice(off + len);
          if (opcode === 1) {
            const msg = JSON.parse(payload.toString('utf8'));
            st.last = msg;
            if (msg.t === 'state') st.state = msg.state;
            if (msg.t === 'lobby') st.lobby = msg.lobby;
            if (msg.t === 'error') st.errors.push(msg.message);
            st.handlers.forEach((h) => h(msg));
          }
        }
      });
      socket.on('error', reject);
      resolve(st);
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { connect };
