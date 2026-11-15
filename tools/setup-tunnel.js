'use strict';
/**
 * Cloudflare 命名隧道一键部署：把应用挂到 https://<域名>/<子路径>/。
 *
 * 需要 Cloudflare API Token（权限：Account:Cloudflare Tunnel:Edit、Zone:DNS:Edit、Zone:Zone:Read）
 * Token 从环境变量 CLOUDFLARE_API_TOKEN 读取，或放在 tools/.cf-token 文件里。
 *
 * 用法： node tools/setup-tunnel.js --domain ruciazyt.cn --host www --path /splendor --origin https://ruciazyt.github.io
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const DOMAIN = arg('domain', 'ruciazyt.cn');
const HOSTNAME = arg('host', 'www');
const BASE_PATH = arg('path', '/splendor');
const ORIGIN = arg('origin', '');           // 兜底回源（保持原网站可用）
const PORT = Number(arg('port', '3000'));
const TUNNEL_NAME = arg('tunnel', 'splendor');
const TOKEN_FILE = path.join(__dirname, '.cf-token');

function readToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN.trim();
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  return '';
}

async function api(pathname, method, body) {
  const token = readToken();
  if (!token) throw new Error('缺少 Cloudflare API Token：请设置环境变量 CLOUDFLARE_API_TOKEN，或把 Token 写入 tools/.cf-token');
  const res = await fetch('https://api.cloudflare.com/client/v4' + pathname, {
    method: method || 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const errs = (data.errors || []).map((e) => e.message || e.code).join('; ');
    throw new Error(method + ' ' + pathname + ' 失败：' + (errs || ('HTTP ' + res.status)));
  }
  return data.result;
}

(async () => {
  console.log('参数：' + HOSTNAME + '.' + DOMAIN + BASE_PATH + '/  ->  http://localhost:' + PORT);
  // 1. 账号
  const accounts = await api('/accounts?per_page=50', 'GET');
  if (!accounts.length) throw new Error('该 Token 没有可见的账号');
  const accountId = accounts[0].id;
  console.log('账号：' + accounts[0].name + ' (' + accountId + ')');
  // 2. 区域
  const zones = await api('/zones?name=' + encodeURIComponent(DOMAIN), 'GET');
  if (!zones.length) throw new Error('找不到域名 ' + DOMAIN + ' 对应的 zone（Token 需要 Zone:Zone:Read 权限）');
  const zone = zones[0];
  console.log('域名：' + zone.name + ' (zone ' + zone.id + ')');
  // 3. 隧道
  const list = await api('/accounts/' + accountId + '/cfd_tunnel?is_deleted=false', 'GET');
  let tunnel = list.find((t) => t.name === TUNNEL_NAME);
  if (!tunnel) {
    tunnel = await api('/accounts/' + accountId + '/cfd_tunnel', 'POST', { name: TUNNEL_NAME, tunnel_type: 'cfd_tunnel' });
    console.log('已创建隧道：' + tunnel.id);
  } else {
    console.log('复用已有隧道：' + tunnel.id);
  }
  // 4. 隧道凭据
  const cred = await api('/accounts/' + accountId + '/cfd_tunnel/' + tunnel.id + '/token', 'GET');
  const credPath = path.join(__dirname, 'cloudflared-tunnel.json');
  fs.writeFileSync(credPath, JSON.stringify(cred, null, 2));
  console.log('凭据已写入 ' + credPath);
  // 5. ingress 规则
  const ingress = [];
  ingress.push({ hostname: HOSTNAME + '.' + DOMAIN, path: BASE_PATH + '.*', service: 'http://localhost:' + PORT });
  if (ORIGIN) ingress.push({ hostname: HOSTNAME + '.' + DOMAIN, service: ORIGIN });
  ingress.push({ service: 'http_status:404' });
  await api('/accounts/' + accountId + '/cfd_tunnel/' + tunnel.id + '/configurations', 'PUT',
    { config: { ingress: ingress, warp_routing: { enabled: false } } });
  console.log('ingress 规则已写入：');
  ingress.forEach((r) => console.log('   ' + (r.hostname || '*') + ' ' + (r.path || '') + '  ->  ' + r.service));
  // 6. DNS：把主机名指向隧道
  const fqdn = HOSTNAME + '.' + DOMAIN;
  const records = await api('/zones/' + zone.id + '/dns_records?type=CNAME&name=' + encodeURIComponent(fqdn), 'GET');
  const target = tunnel.id + '.cfargotunnel.com';
  if (records.length) {
    await api('/zones/' + zone.id + '/dns_records/' + records[0].id, 'PUT',
      { type: 'CNAME', name: fqdn, content: target, ttl: 1, proxied: true });
    console.log('已更新 DNS：' + fqdn + ' -> ' + target);
  } else {
    await api('/zones/' + zone.id + '/dns_records', 'POST',
      { type: 'CNAME', name: fqdn, content: target, ttl: 1, proxied: true });
    console.log('已创建 DNS：' + fqdn + ' -> ' + target);
  }
  console.log('');
  console.log('完成。启动隧道：');
  console.log('  tools\\cloudflared.exe tunnel --no-autoupdate --config tools\\cloudflared-config.yml run ' + TUNNEL_NAME);
  console.log('然后用 BASE_PATH=' + BASE_PATH + ' node server.js 启动游戏。');
})().catch((e) => { console.error('失败：' + e.message); process.exit(1); });