'use strict';
/**
 * 测试专用服务端：每次测试在独立端口起一个干净的服务端，跑完关掉。
 * 避免其它客户端（浏览器、其它测试）连进来干扰对局。
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

function startTestServer(port = 3199, extraEnv) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, { PORT: String(port) }, extraEnv || {}),
    stdio: 'ignore'
  });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const check = () => {
      http
        .get({ host: '127.0.0.1', port, path: '/health' }, (res) => {
          res.resume();
          resolve({ child, port });
        })
        .on('error', () => {
          if (Date.now() - t0 > 15000) {
            child.kill();
            reject(new Error('测试服务端启动超时'));
          } else setTimeout(check, 200);
        });
    };
    check();
  });
}

function stopTestServer(s) {
  if (!s) return;
  try { s.child.kill(); } catch (e) { /* ignore */ }
}

module.exports = { startTestServer, stopTestServer };
