'use strict';
/* ============================================================================
 * sftp-sync.js —— 把本地仓库整份推到云服务器（服务器拉不到 GitHub 时的同步方式）
 *
 * 用法（PowerShell）：
 *   $env:DEPLOY_HOST='124.221.228.93'
 *   $env:DEPLOY_USER='ubuntu'
 *   $env:DEPLOY_PASS='你的密码'
 *   $env:DEPLOY_DIR='/home/ubuntu/splendor-game'
 *   node tools/deploy/sftp-sync.js
 *
 * 行为：
 *   1. 用 git ls-files 拿到受版本控制的文件清单 + 整份 .git（保留历史与分支）
 *   2. SFTP 传到 <DEPLOY_DIR>.new
 *   3. 远端停服 → 旧目录改名为 .old → 新目录就位 → 启服 → 健康检查
 *
 * 依赖：ssh2（临时装在仓库外即可）：
 *   npm install ssh2 --prefix <任意临时目录>
 *   然后用 NODE_PATH=<该目录>/node_modules 运行本脚本
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = process.env.DEPLOY_HOST || '124.221.228.93';
const USER = process.env.DEPLOY_USER || 'ubuntu';
const PASS = process.env.DEPLOY_PASS || '';
const DIR = (process.env.DEPLOY_DIR || '/home/ubuntu/splendor-game').replace(/\/+$/, '');
const STAGE = DIR + '.new';
const SERVICE = process.env.DEPLOY_SERVICE || 'splendor';
const PORT = process.env.DEPLOY_PORT || '3000';

if (!PASS) { console.error('缺少环境变量 DEPLOY_PASS'); process.exit(1); }

let Client;
try { ({ Client } = require('ssh2')); }
catch (e) {
  console.error('需要 ssh2：npm install ssh2 --prefix <临时目录>，并设置 NODE_PATH 指向它的 node_modules');
  process.exit(1);
}

const tracked = execSync('git -C "' + ROOT + '" ls-files', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const gitFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else gitFiles.push(path.relative(ROOT, p).split(path.sep).join('/'));
  }
})(path.join(ROOT, '.git'));

const files = [
  ...tracked.map(t => ({ rel: t, local: path.join(ROOT, t) })),
  ...gitFiles.map(t => ({ rel: t, local: path.join(ROOT, t) }))
];

const dirs = new Set();
for (const f of files) {
  let acc = '';
  for (const part of path.posix.dirname('/' + f.rel).split('/')) { if (!part) continue; acc += '/' + part; dirs.add(acc); }
}
const dirList = [...dirs].sort((a, b) => a.length - b.length);

function sh(c, cmd) {
  return new Promise((resolve, reject) => {
    c.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d.toString(); });
      stream.stderr.on('data', d => { out += d.toString(); });
      stream.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error('exit ' + code + '\n' + out))));
    });
  });
}

(async () => {
  const c = new Client();
  await new Promise((res, rej) => {
    c.on('ready', res);
    c.on('error', rej);
    c.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 20000 });
  });
  console.log('==> 已连接 ' + USER + '@' + HOST);

  console.log('==> 建立目录结构（' + dirList.length + ' 个）');
  await sh(c, 'mkdir -p ' + dirList.map(d => "'" + STAGE + d + "'").join(' '));

  console.log('==> 上传 ' + files.length + ' 个文件');
  await new Promise((resolve, reject) => {
    c.sftp((err, sftp) => {
      if (err) return reject(err);
      let i = 0, bytes = 0;
      const next = () => {
        if (i >= files.length) { console.log('    上传完成 ' + Math.round(bytes / 1048576) + ' MB'); return resolve(); }
        const f = files[i++];
        sftp.fastPut(f.local, STAGE + '/' + f.rel, { mode: 0o644, chunkSize: 32768, concurrency: 16 }, (e) => {
          if (e) console.error('    失败 ' + f.rel + '：' + e.message);
          else bytes += fs.statSync(f.local).size;
          if (i % 60 === 0) console.log('    ... ' + i + '/' + files.length);
          next();
        });
      };
      next();
    });
  });

  console.log('==> 切换目录并重启服务');
  const rev = execSync('git -C "' + ROOT + '" rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  const out = await sh(c, [
    'sudo -n systemctl stop ' + SERVICE,
    'rm -rf -- ' + DIR + '.old',
    'if [ -d ' + DIR + ' ]; then mv ' + DIR + ' ' + DIR + '.old; fi',
    'mv ' + STAGE + ' ' + DIR,
    'cd ' + DIR,
    'git log --oneline -1',
    'sudo -n systemctl start ' + SERVICE,
    'sleep 3',
    'systemctl is-active ' + SERVICE,
    'curl -sS http://127.0.0.1:' + PORT + '/health'
  ].join('; '));
  console.log(out.trim());
  console.log('==> 完成，本地版本 ' + rev);
  c.end();
})().catch(e => { console.error('部署失败：' + e.message); process.exit(1); });
