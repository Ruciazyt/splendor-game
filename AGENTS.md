# 璀璨宝石网页版（Splendor）· 项目约定

## 目录与产物

- 根目录 = 开发源（`public/`、`server/`、`shared/`、`tools/`）。
- `splendor-web/` = 打包副本（与根目录内容一致）；`splendor-web.zip` = 最终交付包（根目录为内容根，不含外层文件夹）。
- **改完源码必须同步到 `splendor-web/` 并重建 zip**，否则交付包与线上不一致。

## 运行与验证

- 开发服务端：`node server.js` → http://localhost:3000（工作目录必须是仓库根，静态目录按 `__dirname` 解析）。
- **一键起服：`start-all.bat` / `start-all.ps1`**（服务端 + 命名隧道 `splendor` + 公网自检）。重启电脑后公网 530/502 就是隧道没起来，跑这个脚本即可。
  - 命名隧道命令：`tools\cloudflared.exe tunnel --no-autoupdate --config %USERPROFILE%\.cloudflared\config.yml run splendor`
  - 隧道配置在 `%USERPROFILE%\.cloudflared\config.yml`（含 credentials-file），隧道进程**不会开机自启**。
- 公网：cloudflared 隧道指向 localhost:3000 → https://game.ruciazyt.cn/ 。
- 测试（各自独立端口，可直接跑）：`node tools/rules-test.js`、`tools/render-test.mjs`、`tools/smoke-test.js`、`tools/multiplayer-test.js`、`tools/mixed-test.js`、`tools/basepath-test.js`、`tools/cache-test.js`。改前端后七套都要绿。

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
- 左栏只有两块：**指示物台** + **战报**。原来的「你的红利与持有」面板已删除（与右栏重复），别再加回来。
- **多房间**：服务端 `rooms` 是 Map，每个房间有自己的 records / game / hotseatSeats，互不影响。
  - 房间码统一大写（`normalizeRoomId`），默认房间固定为 `MAIN`；服务端用 `randomRoomId()` 生成 5 位码（去掉易混字符）。
  - 客户端用 `hello` 消息切换房间：带 `room` 进指定房间，带 `create: true` 让服务端新建房间。
  - 分享地址带 `?room=XXXXXX`；加入页的「房间码」输入框可手动填码。
  - 改动房间相关逻辑后跑 `node tools/room-test.js`。
- **不活跃对局回收**：对局中 `IDLE_GAME_MS`（默认 5 分钟）没有任何客户端消息就结束该局并回收房间，
  结束前 `IDLE_WARN_MS`（默认 1 分钟）提醒一次；任何客户端消息都会刷新 `room.activityAt`。
  清理循环每 2 秒跑一次。改这块后跑 `node tools/idle-test.js`（用环境变量把阈值缩到秒级）。
- 纯热座模式下不显示「本机热座」标签（每人都有就没意义了），混合模式才显示。
- 保留卡在右栏里最大 104px（`.cards-row .card-slot`），别让它撑满整栏。
- 贵族圆板：中文名固定两行高（`grid-template-rows:40px auto`）+ 英文名单独一行 + 宝石再单独一行，四张卡的宝石行必须横向对齐。
- 中栏面板标题与说明同行，说明用 11px（`.col--center .panel__title .hint`）。
- 素材：红利、贵族需求、持有三处**共用 `assets/tokens/*.png`** 同一张贴图，不要再引入 `assets/gems/` 那套裁切图。
- **字阶**：全局只用 28 / 21 / 17 / 14 / 12 / 10 六档（`--fs-lead` / `--fs-tagline` / `--fs-body` / `--fs-caption` / `--fs-fine` / `--fs-micro`）。
  不要再写 15px / 11px 这类阶外字号，也不要用裸 `font-size:14px`，一律引用变量。
  角色分配：声望数字 28 · 中栏面板标题 21 · 左右栏面板标题 17 · 玩家名/贵族名/正文 14 · 统计行/说明/战报 12 · 单位标签/需求数量/英文名 10。
  指示物台的数字与名称随指示物同比放大（`clamp()`），这是唯一的例外。