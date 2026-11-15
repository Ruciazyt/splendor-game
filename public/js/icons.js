// 图形：宝石 / 指示物 / 需求，全部为真实图形素材
//  - 指示物用原版木牌贴图（public/assets/tokens/*.png）
//  - 红利与贵族需求与「持有」共用同一张指示物贴图（assets/tokens/*.png），全局一致
export const COLORS = ['white', 'blue', 'red', 'green', 'black'];
export const ALL_COLORS = [...COLORS, 'gold'];

export const COLOR_META = {
  white: { name: '钻石', hex: '#e9eef5', light: '#ffffff', deep: '#93a3ba' },
  blue:  { name: '蓝宝石', hex: '#3a7bd5', light: '#9dc4ff', deep: '#173a72' },
  red:   { name: '红宝石', hex: '#cf4b42', light: '#ff9d92', deep: '#7d1d18' },
  green: { name: '翡翠', hex: '#2f9c6a', light: '#86e3b4', deep: '#12583a' },
  black: { name: '缟玛瑙', hex: '#3f3f4d', light: '#8a8a9c', deep: '#16161d' },
  gold:  { name: '黄金', hex: '#d8a838', light: '#ffe6a8', deep: '#7d5711' }
};

// 原版指示物（木牌 + 宝石）贴图
export const COLOR_IMG = {
  white: 'assets/tokens/white.png',
  blue: 'assets/tokens/blue.png',
  red: 'assets/tokens/red.png',
  green: 'assets/tokens/green.png',
  black: 'assets/tokens/black.png',
  gold: 'assets/tokens/gold.png'
};

export const CARD_BACK = {
  1: 'assets/cards/dev_I_dos.png',
  2: 'assets/cards/dev_II_dos.png',
  3: 'assets/cards/dev_III_dos.png'
};

// 素材版本号（服务端注入）：素材地址带版本号后即可长期缓存，
// 牌桌重绘时浏览器直接用本地副本，不会重复请求卡片图片。
export const ASSET_V = (typeof window !== 'undefined' && window.__ASSETV__) || '';
export function av(url) {
  if (!url || !ASSET_V) return url;
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + ASSET_V;
}
for (const k of Object.keys(COLOR_IMG)) COLOR_IMG[k] = av(COLOR_IMG[k]);
for (const k of Object.keys(CARD_BACK)) CARD_BACK[k] = av(CARD_BACK[k]);

let gemSeq = 0;

/** 宝石图形（红利 / 贵族需求用）：与「持有」使用同一张原版指示物贴图 */
export function gem(color, size = 16) {
  const m = COLOR_META[color] || COLOR_META.white;
  const src = COLOR_IMG[color] || COLOR_IMG.white;
  return `<img class="gem-img" src="${src}" width="${size}" height="${size}" alt="${m.name}" title="${m.name}" />`;
}

/** 原版指示物贴图 */
export function tokenImg(color, size = 22) {
  const m = COLOR_META[color] || COLOR_META.white;
  return `<img class="token-img" src="${COLOR_IMG[color]}" width="${size}" height="${size}" alt="${m.name}" title="${m.name}" />`;
}

/** 持有：同种宝石合并为「图 + ×N」 */
export function tokenList(counts, opts = {}) {
  const keys = opts.keys || ALL_COLORS;
  const size = opts.size || 22;
  const items = [];
  for (const c of keys) {
    const n = counts[c] || 0;
    if (n > 0) {
      items.push(
        '<span class="stack" title="' + (COLOR_META[c] || {}).name + ' ×' + n + '">' +
          tokenImg(c, size) +
          (n > 1 ? '<b>×' + n + '</b>' : '') +
        '</span>'
      );
    }
  }
  return items.length ? items.join('') : '<span class="hold-empty">无</span>';
}

/** 红利：同种宝石合并为「图 + ×N」 */
export function gemList(counts, opts = {}) {
  const keys = opts.keys || COLORS;
  const size = opts.size || 18;
  const items = [];
  for (const c of keys) {
    const n = counts[c] || 0;
    if (n > 0) {
      items.push(
        '<span class="stack" title="' + (COLOR_META[c] || {}).name + ' 红利 ×' + n + '">' +
          gem(c, size) +
          (n > 1 ? '<b>×' + n + '</b>' : '') +
        '</span>'
      );
    }
  }
  return items.length ? items.join('') : '<span class="hold-empty">无</span>';
}

/** 贵族需求：宝石 + 数量 */
export function reqList(req, size = 14) {
  const items = COLORS
    .filter((c) => (req[c] || 0) > 0)
    .map((c) => `<span class="req-item">${gem(c, size)}${req[c]}</span>`)
    .join('');
  return items || '<span class="hold-empty">—</span>';
}
