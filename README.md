# 璀璨宝石 · Splendor 网页版（好友联机 + 热座）

零依赖的《璀璨宝石》(Splendor) 网页桌游：**打开网页就能加入同一张牌桌**，也支持**同一台设备多人轮流玩（热座模式）**。
服务端只用 Node 内置模块（自实现 WebSocket），**不需要 npm install**。

* 规则：官方中文规则书（玩樂小子 / Asmodee《璀璨宝石》）基础版，规则原图见 `rules/page_01~05.webp`
* 卡面：**实体版原版卡图**（90 张发展卡 + 10 张贵族圆板 + 6 枚指示物），已与游戏数据一一对应
* 视觉：**胡桃木桌 + 羊皮纸面板 + 黄铜**的暖调体系，排版沿用 `DESIGN.md` 的 Apple 字阶 / 药丸按钮 / 发丝描边 / 间距刻度
* 动效：卡牌悬停抬起、可购买卡黄铜微光、指示物进出与声望上涨的即时反馈、弹窗与交接帘过渡（尊重 `prefers-reduced-motion`）
* 《城市璀璨宝石》扩展未实现（按需求只做基础版）

---

## 0. 房间

- **主桌**：直接打开网址就在主桌，不需要任何额外操作。
- **新建房间**：加入页点「新建房间」，服务端生成一个 5 位房间码（去掉 0/O/1/I/L 等易混字符），
  地址栏自动变成 `?room=XXXXXX`，大厅里会显示房间码和带房间码的分享地址。
- **按房间码加入**：好友打开分享地址即可；也可以在加入页的「房间码」输入框里填码进来。
- **房间里改昵称**：大厅里自己那一行的昵称就是输入框，改完点「保存」或回车，全房间实时生效。
- 各房间**完全隔离**：座位、对局、战报互不影响，可以同时开多桌。空房间 30 分钟后自动回收。
- **不活跃对局自动回收**：对局中连续 **5 分钟没有任何操作**（没人行动、没人改席位），
  判定为不活跃并自动结束该局、回收房间；结束前 1 分钟会提示一次，
  期间只要动一下（拿牌 / 跳过 / 改席位）计时就会重置。阈值可用环境变量 `IDLE_GAME_MS` 调整。

## 1. 快速开始

```bash
node server.js
```

Windows 可双击 `start.bat`。**想连公网固定域名一起起来，直接双击 `start-all.bat`**（服务端 + Cloudflare 隧道 + 自检一条龙）。

启动后控制台会打印：

```
  本机访问：  http://localhost:3000
  局域网访问： http://192.168.x.x:3000
```

* **好友联机**：把「局域网访问」地址发给同事 → 他们打开同一地址 → 输入昵称自动入座 → **任何一位玩家**都可以点「开始游戏」，谁开谁当本局房主（原房主掉线也不会卡住房间）。
* **热座模式**：房主点「全热座模式（同一设备）」→ 填 2~4 位玩家 → 每回合弹出「请把设备交给 XX」交接提示。
* **联机 + 热座混用**：房主在空席位上点「标为热座」，这些席位由**这台设备**轮流操作；其他席位由联网好友在自己设备上行动。
  例：1 位朋友联网 + 2 位玩家共用本机热座 = 3 人同桌。轮到热座席位时本机弹交接提示，轮到联网玩家时本机显示「等待 XX 行动」。

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | 3000 | 监听端口 |
| `HOST` | 0.0.0.0 | 监听地址（默认允许局域网访问） |
| `SPLENDOR_TOKEN_LIMIT` | 10 | 手上指示物上限，仅用于联调测试，正常游戏保持 10 |

---

## 2. 界面布局

```
┌────────────────────────────────────────────────────────────┐
│ 顶栏：当前行动者 / 轮次 / 胜利分 / 跳过 / 规则 / 重开 / 离开    │
├───────────────┬──────────────────────────┬─────────────────┤
│ 左栏           │ 中栏                      │ 右栏             │
│ ▸ 指示物台      │ ▸ 贵族圆板（原版圆板图）   │ ▸ 玩家信息       │
│   （原版木牌）  │   整行铺满，宽度=发展卡    │ ▸ 当前玩家保留卡  │
│ ▸ 拿取确认条    │ ▸ 发展卡市场（原版卡面）   │                 │
│ ▸ 红利/持有     │   等级1→2→3，每行5格铺满  │                 │
│                 │   买 / 留 按钮在卡牌下方    │                 │
├───────────────┴──────────────────────────┴─────────────────┤
│ 战报（左栏底部，与卡片区齐平，内容可滚动）                       │
└────────────────────────────────────────────────────────────┘
```

### 适配 iPad / 手机

| 设备 | 布局 |
| --- | --- |
| 桌面 ≥1181px | 三栏：**左 : 中 : 右 = 2.4 : 5 : 2.6**（指示物 / 牌桌 / 玩家），内容最大宽度 2000px，屏幕更宽时三栏等比放大铺满 |
| 字号 | 全局只用 28 / 21 / 17 / 14 / 12 / 10 六档（`--fs-*`），不出现阶外字号 |
| iPad 横竖屏 741–1180px | 两栏：**左 : 中 = 2.4 : 5**，玩家与战报在下方铺满 |
| 手机 ≤740px | 单栏并重排为 **拿取区 → 我的资产 → 牌桌 → 玩家 → 战报**，每级卡牌横向滑动 |

发展卡与贵族圆板按**弹性等分**排布：每行 4 张卡 + 牌库始终在一行内，不会换行或溢出（iPad 竖屏约 81px/张，横屏约 153px/张）。

触控设备（`pointer:coarse`）下按钮与热区自动放大到 44px；
支持 iPhone 刘海/底部指示条安全区（`env(safe-area-inset-*)`）；
按钮禁用 iOS 的点击高亮与双击缩放；顶栏在窄屏改为横向滚动。

交互约定：

* **购买发展卡：双击卡面**。卡面不再显示「买」按钮；买得起的卡会亮起黄铜色描边，鼠标悬停提示「双击这张卡购买」。
  触屏上双击同样有效（iOS / Android 会触发 `dblclick`）。
* **保留发展卡**：点卡牌下的「留」→ 弹出确认框 → 确认后才保留（保留会拿走 1 个黄金）。
* **贵族圆板**在人物下方用**原版指示物贴图**（`public/assets/tokens/`）标出拜访所需红利数量。
* **红利**与**持有**、**贵族需求**共用同一张贴图（`assets/tokens/*.png`），三处显示完全一致。
* **音效**：顶栏「音效 开 / 关」控制点击提示音与背景音乐（WebAudio 实时合成，无音频文件）。
* **增量渲染**：只有变化的区域会重绘——选宝石、拿牌时卡片图片与宝石贴图都不会重新加载。
* **左右两栏固定且紧凑**：指示物 / 玩家两栏随页面停在视口内，只有中间的牌桌随页面滚动；
  两栏面板内边距、间距与字号都做了收紧，玩家信息（持有 / 红利 / 保留 / 贵族）合并在一行显示，不留多余空白。


* **拿取指示物**：点选颜色 → 左栏出现「已选 …」并高亮 → 按「确认拿取」才真正执行（拿 2 个同色也走同一条确认路径）。
  规则要求「拿 3 种不同颜色」，不足 3 种时才可少拿；按钮上会实时显示「已选 2/3」，不够时不可点。
  * 黄金是「萬用指示物」：可以算作「3 种不同颜色」中的一种，但**不能拿 2 个**（规则书把"拿 2 个同色"限定在 5 种寶石指示物上）。
* **保留发展卡**：点卡牌下的「留」→ 弹出确认框（显示卡面与说明）→ 确认后才保留。
* **牌顶盲保留**：点牌库同样走二次确认，弹窗显示该等级的**卡背**并提示「这是盲保留，你看不到保留的是哪张卡」。
* **购买发展卡**：点「买」直接成交（付得起的卡才会出现「买」）。
* **买得起的卡会亮起金色流光边框**，当前回合可以买哪张一眼可见。
* 回合结束若持有超过 10 个指示物，会弹出「放回多余指示物」窗口由你选择放回哪些。
* 当前行动者掉线时，顶部会出现橙色提示条：**不会自动跳过**，等他重连回来继续，房主也可以手动跳过该回合。

界面元素全部使用图形化表示：

* **持有**：原版指示物木牌贴图（`assets/tokens/*.png`），一枚一枚显示；
* **红利**：宝石图形（对应实体卡右上角的红利宝石），按颜色区分；
* **贵族圆板**：原版圆板整图（含印刷的点数与需求宝石）。

---

## 3. 规则实现（基础版）

### 设置
* 指示物 40 个：绿/白/蓝/黑/红各 7 个 + 黄金 5 个（万能）。
  * 2 人局：每色移除 3 个（各剩 4 个），黄金不变，翻 3 张贵族。
  * 3 人局：每色移除 2 个（各剩 5 个），黄金不变，翻 4 张贵族。
  * 4 人局：全部使用，翻 5 张贵族。
* 发展卡 90 张分 3 个等级（40 / 30 / 20 张），每级场上翻开 4 张，牌库空则不补。
* 贵族圆板 10 张，开局翻开「人数 + 1」张。

### 每回合四选一
1. 拿 **3 种不同颜色**的指示物（凑不满 3 种时可拿 2 种甚至 1 种）；
2. 拿 **2 个同色**指示物（该颜色场上需剩 4 个以上）；
3. **保留** 1 张发展卡（场上翻开或牌库顶，牌库顶为暗牌）并拿 **1 个黄金**（保留是获得黄金的唯一方式，上限 3 张、不能弃牌）；
4. **购买** 1 张发展卡（场上翻开或自己保留的；黄金可代替任意颜色，花掉的指示物回到场中）。

### 其他
* 回合结束时手上指示物**不得超过 10 个（含黄金）**，超出必须放回。
* 卡面右上角的宝石是**永久红利**，购买时抵扣同色费用（不消耗）。
* 回合结束检查**贵族拜访**：满足需求自动获得、不可拒绝；同时满足多张时可自选一张；每片 3 点。
* 有人达到 **15 点声望**时结束当前回合，让每人回合数相同后结束；平局看购买发展卡数。
* 服务端权威：所有动作由服务端校验后广播。

---

## 4. 目录结构

```
server.js                 # HTTP 静态服务 + WebSocket + 大厅/牌桌逻辑
server/websocket.js       # 自实现 RFC6455 WebSocket 服务端（零依赖）
server/game.js            # 规则引擎（服务端权威）
shared/data/cards.js      # 90 张发展卡（等级/费用/点数/红利 + 卡图文件名）
shared/data/nobles.js     # 10 张贵族圆板（需求 + 中英文名 + 圆板图）
public/                   # 前端（原生 ES Module，无构建步骤）
  index.html  css/style.css  js/main.js  js/render.js  js/icons.js
  assets/cards/    # 90 张原版发展卡 + 3 张卡背
  assets/nobles/   # 10 张原版贵族圆板
  assets/tokens/   # 6 枚原版指示物
DESIGN.md                  # 视觉规范：Apple 设计系统（单一 Action Blue / SF Pro 字阶 / 无装饰渐变）
docs/rules-spec.md        # 规则规格与数据来源、校验说明
rules/page_*.webp         # 官方规则书原图（第 6 页起为城市扩展，未实现）
tools/                      # 按用途分四类，脚本都归到对应子目录
  test/                    # 全部测试（各自独立端口，可直接跑）
    rules-test.js          # 规则书测试：50 项断言锁定四条动作与各项限制
    render-test.mjs        # 渲染层测试：可购买高亮 / 图形化持有与红利 / 等级顺序 / 样式表语法体检
    smoke-test.js          # 冒烟测试：脚本自动打完整一局
    multiplayer-test.js    # 联机测试：入座/开局/越权拦截/保留卡私密性/断线重连
    mixed-test.js          # 混合模式测试：1 联机 + 2 热座同桌、席位归属与权限、保留卡私密性
    room-test.js           # 多房间测试：新建房间 / 按房间码加入 / 房间之间互相隔离
    idle-test.js           # 不活跃回收测试：停滞对局被结束回收 / 有操作则不回收
    basepath-test.js       # 子路径部署测试（BASE_PATH=/splendor）
    cache-test.js          # 缓存头 / ETag / 版本号测试
    test-server.js         # 测试专用服务端（独立端口，跑完自动关闭）
    ws-client.js           # 测试用 WebSocket 客户端（联机/混合测试共用）
  build/                   # 构建与打包
    package.bat            # 一键生成 splendor-web.zip
    package.ps1            # 同上（PowerShell 实现，被 package.bat 调用）
    build-card-data.js     # 由卡牌数据表重建 shared/data/*.js（附卡图映射）
  assets/                  # 素材
    fetch-assets.ps1       # 卡图下载脚本（见下方「素材来源」）
  deploy/                  # 公网部署
    setup-tunnel.js        # Cloudflare 隧道创建 + DNS 绑定（API Token 版）
    deploy-tunnel.ps1      # 同上（交互式 tunnel login 版）
    tunnel-check.js        # 隧道与公网自检
  cloudflared.exe          # 隧道二进制（55MB，不入库）
```

---

## 5. 自测

四个测试脚本会**各自在独立端口起一个干净的服务端**，互不干扰，可直接运行：

```bash
node tools/test/rules-test.js              # 规则书逐条断言（50 项，不依赖服务端）
node tools/test/render-test.mjs             # 渲染层契约（流光边框、图形化持有/红利、等级顺序…）
node tools/test/smoke-test.js              # 自动打一整局热座游戏，检查终局与得分
node tools/test/multiplayer-test.js         # 两个客户端联机全流程断言
node tools/test/mixed-test.js               # 联机 + 热座混合同桌
node tools/test/room-test.js                # 多房间隔离
node tools/test/idle-test.js                # 不活跃对局回收
node tools/test/basepath-test.js            # 子路径部署
node tools/test/cache-test.js               # 缓存头 / ETag / 版本号
```

> `rules-test.js` 把官方中文规则书固化成用例：设置（人数差异）、四个动作、红利与贵族拜访、
> 手上 10 个上限、15 点终局，共 50 项断言。改引擎后请先跑它。


---

## 6. 公网部署（Cloudflare Tunnel）

朋友不在同一个局域网时，用 **Cloudflare Tunnel** 把本机 `localhost:3000` 暴露成公网 HTTPS 网址即可，
**不需要买服务器、不需要公网 IP、不需要开放路由器端口**。
本作的 WebSocket 是自己实现的（`server/websocket.js`），Cloudflare 边缘原生支持 WebSocket 升级，**无需任何改动**。

### 6.0 重启后公网访问不了？——多半是隧道没起来

服务端（`node server.js`）和 Cloudflare 隧道（`cloudflared.exe`）是**两个独立进程**。
重启电脑、或只重启了服务端之后，隧道不会自动恢复，Cloudflare 会返回 **530 / 502**。

症状对照：

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `http://localhost:3000` 能开，公网地址 530 / 502 | 隧道进程没了 | 双击 `start-all.bat`（会补起隧道） |
| 本机也打不开 | 服务端没跑 | 双击 `start-all.bat` 或 `start.bat` |

`start-all.bat` 的逻辑（`start-all.ps1` 是同一套逻辑的转发版）：

1. 探测 `:3000` 是否在响应，没响应就启动 `node server.js`；
2. 探测 `cloudflared.exe` 是否已在跑，没跑就用 `%USERPROFILE%\.cloudflared\config.yml` 启动命名隧道 `splendor`；
3. 请求 `https://game.ruciazyt.cn/health` 自检公网是否可访问。

登录 Windows 时会自动执行一次（启动项 `splendor-server.cmd` → `start-all.bat`），所以重启后不用手动干预。

### 6.1 临时地址（最快，3 步）

```bash
node server.js                # 先把游戏跑起来
start-tunnel.bat              # 或手动执行 tools\cloudflared.exe tunnel --url http://localhost:3000
```

控制台会打印一个形如 `https://xxxx-yyyy-zzz.trycloudflare.com` 的地址，发给朋友即可；
关闭该窗口 = 关闭公网入口（地址每次重启都会变）。

### 6.2 固定域名（命名隧道，需要 Cloudflare 账号）

```bash
cloudflared tunnel login                 # 浏览器授权，证书存到 ~/.cloudflared/cert.pem
cloudflared tunnel create splendor       # 创建隧道
cloudflared tunnel route dns splendor game.ruciazyt.cn
```

然后写 `~/.cloudflared/config.yml`：

```yaml
tunnel: <TUNNEL-ID>
credentials-file: C:/Users/<你的用户名>/.cloudflared/<TUNNEL-ID>.json
ingress:
  - hostname: game.ruciazyt.cn
    service: http://localhost:3000
  - service: http_status:404
```

```bash
cloudflared tunnel run splendor          # 注册为 Windows 服务可开机自启
```

### 6.3 本项目当前的线上部署

| 项目 | 值 |
| --- | --- |
| 访问地址 | `https://game.ruciazyt.cn/` |
| 隧道名 / ID | `splendor` / `66b8c54a-306c-48b3-908a-014f400255a4` |
| DNS | `game.ruciazyt.cn` CNAME → `<隧道ID>.cfargotunnel.com`（Cloudflare 橙云代理） |
| ingress | `game.ruciazyt.cn` → `http://localhost:3000`，兜底 404 |
| 隧道配置 | `~/.cloudflared/config.yml` |
| 授权证书 | `~/.cloudflared/cert.pem`（`tunnel login` 生成） |
| 启动命令 | `tools\cloudflared.exe tunnel --config %USERPROFILE%\.cloudflared\config.yml run splendor` |

部署脚本已备好：`tools/deploy/deploy-tunnel.ps1`（创建隧道 + 绑定 DNS + 写配置 + 启动），
`tools/deploy/setup-tunnel.js` 是走 API Token 的等价版本，`tools/deploy/tunnel-check.js` 负责自检。

### 6.4 几个注意点

* **地址即门票**：大厅是「同一地址即同一张牌桌」，任何拿到网址的人都能进这张桌。
  当前是独立子域名 `game.ruciazyt.cn`，不影响 `www.ruciazyt.cn` 的原站。
* **DNS 同步有延迟**：新加的记录在部分国内 DNS（如 114DNS）上可能滞后几十分钟，
  表现为「本机能解析 1.1.1.1/8.8.8.8 解析不了」；换个解析器或稍等即可。
* **静态资源缓存**：卡片 / 指示物 / 贵族图片带自动版本号并 `immutable` 长期缓存，**牌面重绘与刷新都不会重复请求图片**；html / css / js 用 `no-cache + ETag` 协商缓存，未改动返回 304（只校验不重传），版本号由服务端按文件修改时间自动注入。
  改完代码刷新即可生效，不会拿到旧脚本。
  ES module 的相对导入（`main.js` → `render.js` / `icons.js`）也由服务端按「public/js 下最新修改时间」统一加上版本号，
  任何一个模块改动都会让整条导入链的 URL 变化，避免浏览器/CDN 缓存住旧模块（否则会报 "does not provide an export named ..."）。
* **子路径部署也已支持**：设置环境变量 `BASE_PATH=/splendor` 即可把应用挂到 `https://域名/splendor/` 下，
  静态资源会自动剥前缀、WebSocket 监听 `<前缀>/ws`，用 `node tools/test/basepath-test.js` 验证。
* 隧道断开不影响本机继续玩；客户端会自动重连（断线保留席位）。

---

## 6. 素材来源与复现

卡面素材取自 GitHub 上复刻《璀璨宝石》的开源项目 **NicolasVero/splendor**（Java 实现），
其 `application/splendor/images/` 内含本中文版全部卡面、贵族圆板与指示物贴图，
`application/splendor/data/cartes.txt` / `nobles.txt` 则是与之对应的卡牌数据表
（编码规则见该仓库 `splendor/metier/CreerCartes.java`、`CreerNobles.java`）。

本项目据此重建了数据与图片的对应关系，并做了三重校验：

1. **图片自证**：逐张放大卡面读取印刷的声望点数、费用宝石与红利宝石，与数据表一致；
2. **分布自检**：等级 1/2/3 = 40/30/20 张；点数分布 0–1 / 1–3 / 3–5；红利每色恰好 18 张（= 8+6+4）；
3. **贵族核验**：10 张圆板的需求与官方人物清单（Assorted Meeples）逐一对应。

复现素材下载（需要能访问 GitHub；脚本用的是 `ghproxy.net` 镜像）：

```powershell
powershell -ExecutionPolicy Bypass -File tools/assets/fetch-assets.ps1
```

数据表重建（需先准备 `cartes.txt` / `nobles.txt`）：

```bash
node tools/build/build-card-data.js
```

> 美术与商标归 Space Cowboys / Asmodee 所有，本项目仅供内部非商业使用。

---

## 7. 想让同事从外网也能玩？

局域网直连就是**完全免费**的。公网方案：

| 方案 | 费用 | 注意事项 |
| --- | --- | --- |
| **Cloudflare Workers + Durable Objects** | 免费额度 | 支持 WebSocket，适合长期；需 CF 账号并把 `server/websocket.js` 的握手迁到 DO |
| **内网穿透（cpolar 免费版 / frp）** | 免费 / 需自建 | 把本机 3000 端口映射出去，最省事 |
| **云服务器（阿里云/腾讯云轻量）** | 几元/月 | 国内访问最快；直接 `node server.js` |
| Render / Railway 免费层 | 有免费额度 | 需绑卡，实例会休眠，长连接易被踢 |

> Vercel / Netlify 这类 Serverless **不支持 WebSocket 长连接**，不能直接部署本项目。

### 换成你自己手上的卡图
把图片放进 `public/assets/cards/`，文件名沿用 `dev_I_01.png` / `dev_II_XX.png` / `dev_III_XX.png` 即可；
若要整体换掉映射，改 `shared/data/cards.js` 里的 `image` 字段，或用 `public/assets/cards/manifest.json` 覆盖。
