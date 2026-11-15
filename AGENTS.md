# 璀璨宝石网页版（Splendor）· 项目约定

## 目录与产物

> - **固定根目录 = `D:\Splendor`**，所有 session 共用这一份代码；不要在别的盘/会话目录另起副本。
>   服务端、隧道、测试、打包全部在 `D:\Splendor` 下跑（工作目录必须是仓库根，静态目录按 `__dirname` 解析）。
> - 根目录 = **唯一源码**（`public/`、`server/`、`shared/`、`tools/`、`docs/`、`rules/`），**代码本体就是交付物**。
> - **不再维护 `splendor-web.zip` 交付包**（2026-11-15 起）：公网 https://game.ruciazyt.cn/ 直接就是成品，
>   再留一份 zip 就是多一个会过期的代码副本。需要离线给别人的便携包时，按需跑 `tools\build\package.bat` 生成即可，
>   **用完即删**，别让它长期留在仓库里。

## tools/ 目录分类（改完记得同步本文档）

- `tools/test/` — 全部测试：`rules-test.js` `render-test.mjs` `smoke-test.js` `multiplayer-test.js`
  `mixed-test.js` `basepath-test.js` `cache-test.js` `room-test.js` `idle-test.js`
  + `test-server.js`（测试专用服务端）`ws-client.js`（测试用 WS 客户端）。
- `tools/build/` — `package.bat` / `package.ps1`（按需生成便携 zip，非交付物）`build-card-data.js`（重建数据表）。
- `tools/assets/` — `fetch-assets.ps1`（卡图下载）。
- `tools/deploy/` — `setup-tunnel.js` `deploy-tunnel.ps1` `tunnel-check.js`（隧道创建/绑定/自检）
  `sftp-sync.js`（**更新云服务器代码用这个**：整仓 SFTP 推送 + 换目录 + 重启服务 + 健康检查）。
- `tools/cloudflared.exe` 保留在 tools 根目录（用户脚本 `start-all.bat` / `start-tunnel.bat` 按此路径找它），
  55MB 二进制不入库（已 gitignore）。

## 运行与验证

- 开发服务端：`node server.js` → http://localhost:3000（工作目录必须是仓库根，静态目录按 `__dirname` 解析）。
- **一键起服：`start-all.bat` / `start-all.ps1`**（服务端 + 命名隧道 `splendor` + 公网自检）。重启电脑后公网 530/502 就是隧道没起来，跑这个脚本即可。
  - 命名隧道命令：`tools\cloudflared.exe tunnel --no-autoupdate --config %USERPROFILE%\.cloudflared\config.yml run splendor`
  - 隧道配置在 `%USERPROFILE%\.cloudflared\config.yml`（含 credentials-file），隧道进程**不会开机自启**。
- 公网：**正式地址 = 云服务器 `http://124.221.228.93:3000`**（systemd 服务 `splendor.service`，
  代码在 `~/splendor-game`，部署脚本 `~/deploy.sh`）。本机的 cloudflared 隧道**默认不启动**
  （`start-all.bat` 只起服务端；要临时用域名才跑 `start-all.bat tunnel`）。
- **服务器拉不到 GitHub**（腾讯云出口到 github.com 超时），`deploy.sh` 里的 `git fetch` 会失败。
  更新服务器代码的可靠做法：跑 `node tools/deploy/sftp-sync.js`（整仓 SFTP 推送 + 自动换目录 + 重启服务 + 健康检查）；
  它需要 `ssh2`（临时装在仓库外，用 `NODE_PATH` 指过去）。
  SSH 账号是 `ubuntu@124.221.228.93`（免密 sudo 可用）；**密码不要写进仓库**，用环境变量 `DEPLOY_PASS` 传入。
- 测试（各自独立端口，可直接跑，工作目录 = `D:\Splendor`）：
  `node tools/test/rules-test.js`、`node tools/test/render-test.mjs`、`node tools/test/smoke-test.js`、
  `node tools/test/multiplayer-test.js`、`node tools/test/mixed-test.js`、`node tools/test/basepath-test.js`、
  `node tools/test/cache-test.js`、`node tools/test/room-test.js`、`node tools/test/idle-test.js`。
  改前端后九套都要绿（`room-test` / `idle-test` 是多房间与不活跃回收的回归）。

## 缓存与版本号（改前端必读）

- `server.js` 会给入口页的 css/js 引用注入 `?v=` 版本号；**ES module 的相对导入**（`main.js` → `render.js` / `icons.js`）由服务端按「`public/js` 下最新修改时间」统一改写成 `?v=`，入口页 script 标签用同一个版本号。
- 目的：任何一个模块改动都会让整条导入链的 URL 变化，避免浏览器/CDN 缓存住旧模块。
- **不要往 js 文件里硬写 import 版本号**，服务端已接管。
- 历史坑：版本号没覆盖嵌套导入时，线上会报 `does not provide an export named 'assetsHtml'`，页面卡在「正在载入璀璨宝石…」。

## UI 偏好（用户反复强调）

- 三个要求反复出现：**去掉多余留白、信息密度要高**。字号降级、同一信息合并到一行、面板/格子间距收紧、左栏不要过宽。
- 当前三栏比例 **2.4 : 5 : 2.6**（左 : 中 : 右），`--content-max:2000px`：屏幕变宽时三栏**等比放大铺满**，不要给左右栏设固定宽度。
  - 指示物图片随屏放大：`clamp(46px,3.2vw,72px)`；贵族圆板 `max-width:380px`、卡牌 `max-width:220px`（flex 等分，宽屏自动变大）。
- 玩家行「声望」块用 flex + `align-self:center` 垂直居中。
- 玩家行是三列网格：`声望 | 内容 | 详情`。详情按钮独占第三列（垂直居中、永远靠右，不会被挤到下一行）。
- 玩家侧栏只留关键信息（声望 / 持有 / 红利 / 保留 / 贵族）；已购卡与保留卡的缩略图**不放侧栏**，在「详情」弹窗里看。
- 当前分栏：**左栏 = 指示物台 + 贵族圆板（竖排）**；**中栏 = 发展卡市场**；**右栏 = 玩家 + 保留卡 + 战报**。
  原来的「你的红利与持有」面板已删除（与右栏重复），别再加回来。
- 左栏贵族圆板一行一个：**大图（clamp(76px,6vw,112px)）+ 中文名 + 英文名**，
  图要够大才能看清圆板上印的需求宝石（原图 145×145，放大到 112px 仍清晰）；
  需求宝石行不再单独画在圆板下面（`.noble__req` 已废弃，render-test 有断言守着）。
- **多房间**：服务端 `rooms` 是 Map，每个房间有自己的 records / game / hotseatSeats，互不影响。
  - 房间码统一大写（`normalizeRoomId`），默认房间固定为 `MAIN`；服务端用 `randomRoomId()` 生成 5 位码（去掉易混字符）。
  - 客户端用 `hello` 消息切换房间：带 `room` 进指定房间，带 `create: true` 让服务端新建房间。
  - 分享地址带 `?room=XXXXXX`；加入页的「房间码」输入框可手动填码。
  - 改动房间相关逻辑后跑 `node tools/test/room-test.js`。
- **不活跃对局回收**：对局中 `IDLE_GAME_MS`（默认 5 分钟）没有任何客户端消息就结束该局并回收房间，
  结束前 `IDLE_WARN_MS`（默认 1 分钟）提醒一次；任何客户端消息都会刷新 `room.activityAt`。
  清理循环每 2 秒跑一次。改这块后跑 `node tools/test/idle-test.js`（用环境变量把阈值缩到秒级）。
- 纯热座模式下不显示「本机热座」标签（每人都有就没意义了），混合模式才显示。
- 保留卡在右栏里最大 104px（`.cards-row .card-slot`），别让它撑满整栏。
- 贵族圆板（横向变体，用于窄屏横滑）：中文名固定两行高（`grid-template-rows:40px auto`）+ 英文名单独一行，宝石行不再单独绘制。
- 中栏面板标题与说明同行，说明用 11px（`.col--center .panel__title .hint`）。
- 素材：**红利 / 贵族需求用 `assets/gems/*.png`**（宝石切片，透明底正方形），
  **持有 / 指示物台用 `assets/tokens/*.png`**（盘中宝石）；两者都是上游 jrbarronumd/Splendor 的图。
  卡面 = `assets/cards/L{1,2,3}-xx.jpg`，贵族 = `assets/nobles/noble_xx.jpg`，卡背 = `assets/cards/back-L*.jpg`。
  换素材时必须按「等级+点数+红利色+费用」四元组做**唯一匹配**（90/90 已验证），别按文件名顺序硬套。
- **字阶**：全局只用 28 / 21 / 17 / 14 / 12 / 10 六档（`--fs-lead` / `--fs-tagline` / `--fs-body` / `--fs-caption` / `--fs-fine` / `--fs-micro`）。
  不要再写 15px / 11px 这类阶外字号，也不要用裸 `font-size:14px`，一律引用变量。
  角色分配：声望数字 28 · 中栏面板标题 21 · 左右栏面板标题 17 · 玩家名/贵族名/正文 14 · 统计行/说明/战报 12 · 单位标签/需求数量/英文名 10。
  指示物台的数字与名称随指示物同比放大（`clamp()`），这是唯一的例外。