/**
 * 渲染层单测：验证「可购买卡流光边框」「持有/红利的图形化」「等级顺序」「战报位置」等 UI 契约。
 * 用法： node tools/test/render-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = path.join(root, '.render-test-tmp');
fs.mkdirSync(tmp, { recursive: true });
fs.copyFileSync(path.join(root, 'public/js/icons.js'), path.join(tmp, 'icons.mjs'));
const src = fs
  .readFileSync(path.join(root, 'public/js/render.js'), 'utf8')
  .replace("from './icons.js'", "from './icons.mjs'");
fs.writeFileSync(path.join(tmp, 'render.mjs'), src, 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/style.css'), 'utf8');

// CSS 语法体检：括号必须配平，否则解析器会从出错处丢弃后续所有规则
function balanced(src) {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const count = (re) => (noComments.match(re) || []).length;
  return count(/\(/g) === count(/\)/g) && count(/\{/g) === count(/\}/g);
}

const { renderGame } = await import(pathToFileURL(path.join(tmp, 'render.mjs')).href);

const base = {
  mode: 'hotseat',
  phase: 'action',
  turn: 0,
  turnsTaken: 0,
  finalRound: null,
  results: null,
  tokens: { white: 5, blue: 5, red: 5, green: 5, black: 5, gold: 5 },
  deckCounts: [36, 26, 16],
  market: [
    [
      {
        cardKey: 'L1-01', level: 1, points: 0, bonus: { color: 'white', count: 1 },
        cost: { white: 1, blue: 1, red: 0, green: 0, black: 0 }, image: 'L1-01.jpg'
      }
    ],
    [],
    []
  ],
  nobles: [
    { id: 'N-01', name: 'Mary Stuart', nameZh: '玛丽', image: 'noble_01.jpg',
      require: { white: 0, blue: 0, black: 0, red: 4, green: 4 }, points: 3, takenBy: null }
  ],
  players: [
    {
      index: 0, name: '玩家1', points: 5,
      tokens: { white: 3, blue: 3, red: 0, green: 0, black: 0, gold: 0 },
      bonuses: { white: 2, blue: 1, red: 0, green: 0, black: 0 },
      bought: [], reserved: [], reservedCount: 0, nobles: []
    }
  ],
  pending: null,
  log: [{ text: '测试' }]
};

const view = {
  game: base, ui: { takeSel: {}, takeTwo: null }, meSeat: 0, meName: '房主',
  hotseat: true, canAct: true, canSkip: false, currentOffline: false,
  currentName: '玩家1', minTake: 3, activePlayer: base.players[0],
  winScore: 15, isHost: true, artMap: {}
};

const html = renderGame(view);
const poor = {
  ...view,
  activePlayer: {
    ...base.players[0],
    tokens: { white: 0, blue: 0, red: 0, green: 0, black: 0, gold: 0 },
    bonuses: { white: 0, blue: 0, red: 0, green: 0, black: 0 }
  }
};
const html2 = renderGame(poor);

// 黄金堆：只作展示，不可被选入「3 种不同颜色」
const goldCell = (html.split('<div class="token-cell">').find((c) => c.includes('data-color="gold"')) || '').split('</div>')[0];

// 买 / 留按钮必须在卡牌本体之外（高亮只描卡面）
const cardInner = (html.match(/<div class="card [^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="card__acts"/) || ['', ''])[1];

const checks = [
  ['「买 / 留」按钮在卡牌框外', cardInner !== '' && !cardInner.includes('card__acts')],
  ['玩家行有「详情」按钮', html.includes('data-act="player-detail"')],
  ['同种宝石合并为 ×N 显示', html.includes('×3')],
  ['黄金堆不可点选（不进入拿取动作）', !!goldCell && !goldCell.includes('data-act="pick-token"') && !goldCell.includes('data-act="pick-two"')],
  ['黄金堆注明「保留卡牌获得」', html.includes('保留卡牌获得')],
  ['可购买的卡带高亮描边', html.includes('card-slot--buyable')],
  ['可购买的卡支持双击购买（无买按钮）', html.includes('data-dblbuy') && !html.includes('data-act="buy"')],
  ['持有用原版指示物贴图', html.includes('assets/tokens/white.png')],
  ['红利用宝石图形', html.includes('class="gem-img"') && html.includes('assets/gems/white.png')],
  ['贵族用原版圆板图', html.includes('assets/nobles/noble_01.jpg')],
  ['市场等级顺序 1→2→3', html.indexOf('等级 1') < html.indexOf('等级 2') && html.indexOf('等级 2') < html.indexOf('等级 3')],
  ['战报位于左栏（指示物之后）', html.indexOf('ledger') > html.indexOf('指示物')],
  ['战报在右栏（玩家与保留卡之后）', html.indexOf('col--center') < html.indexOf('col--right') && html.indexOf('class="players"') < html.indexOf('ledger')],
  ['左右栏固定，仅中间牌桌滚动', css.includes('.col--left{') && css.includes('.col--right{') && css.includes('position:sticky')],
  ['战报内容内部可滚动', css.includes('overflow-y:auto;overscroll-behavior:contain') && css.includes('overflow:hidden;')],
  ['买按钮使用黄铜主按钮样式', css.includes('.card__acts .btn--primary{') && css.includes('linear-gradient(180deg,var(--gold),var(--brass-2))')],
  ['可购买卡带黄铜微光动画', css.includes('@keyframes brassPulse') && css.includes('.card-slot--buyable .card')],
  ['暖调羊皮纸 + 黄铜配色', css.includes('--paper:#f4ead0') && css.includes('--brass-2:#c79a45')],
  ['尊重 prefers-reduced-motion', css.includes('prefers-reduced-motion')],
  ['贵族卡不再显示宝石需求行', !html.includes('noble__req')],
  ['左栏贵族圆板图已放大（最小 ≥ 76px）', (() => {
    const m = /\.col--left \.noble__art\{[^}]*?clamp\((\d+)px/.exec(css);
    return !!m && Number(m[1]) >= 76;
  })()],
  ['音效开关存在', html.includes('data-act="sound"')],
  ['样式表括号配平（语法完整性）', balanced(css)],
  ['手机单栏重排（拿取区在最前）', css.includes('.col{display:contents}') && css.includes('.col--left > .panel:first-child{order:1}')],
  ['手机卡牌横向滑动', css.includes('scroll-snap-type:x') && css.includes('overflow-x:auto')],
  ['触控热区不小于 44px', css.includes('@media (pointer:coarse)') && css.includes('min-height:44px')],
  ['刘海屏安全区适配', css.includes('env(safe-area-inset')],
  ['断点覆盖 iPad（1180 / 740）', css.includes('@media (max-width:1180px)') && css.includes('@media (max-width:740px)')],

  ['不是你的回合时按钮禁用', renderGame({ ...view, canAct: false }).includes('disabled')],
  ['付不起时不出现「买」按钮', !html2.includes('data-act="buy"')],
  ['付不起时无流光边框', !html2.includes('card-slot--buyable')]
];

let bad = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '  \u2713 ' : '  \u2717 ') + name);
  if (!ok) bad++;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? '\n' + bad + ' 项失败' : '\n全部通过 \u2713');
process.exit(bad ? 1 : 0);
