'use strict';
const fs = require('fs');
const path = require('path');

// 项目根（脚本在 tools/build/ 下）
const ROOT = path.resolve(__dirname, '..', '..');

const COST_ORDER = ['white', 'blue', 'black', 'red', 'green'];
const BONUS_ORDER = ['white', 'blue', 'green', 'red', 'black'];

const cart = fs.readFileSync('tmp_cartes.txt', 'utf8').split(/\r?\n/).filter((l) => l.trim());
const nobl = fs.readFileSync('tmp_nobles.txt', 'utf8').split(/\r?\n/).filter((l) => l.trim());
const sig = (req) => COST_ORDER.map((c) => req[c] || 0).join(',');

// 贵族姓名（依据官方人物与各自需求；中文版圆板需求与图片一致）
const NOBLE_NAMES = {
  '0,0,0,4,4': ['Mary Stuart', '玛丽·斯图亚特'],
  '0,0,4,4,0': ['Charles V', '查理五世'],
  '4,0,4,0,0': ['Isabella of Castile', '卡斯蒂利亚的伊莎贝拉'],
  '0,4,0,0,4': ['Suleiman the Magnificent', '苏莱曼大帝'],
  '4,4,0,0,0': ['Niccolo Machiavelli', '尼可洛·马基雅维利'],
  '0,3,0,3,3': ['Catherine de Medici', '卡特琳·德·美第奇'],
  '0,0,3,3,3': ['Henry VIII', '亨利八世'],
  '3,0,3,3,0': ['Francis I of France', '弗朗索瓦一世'],
  '3,3,0,0,3': ['Anne of Brittany', '安妮·布列塔尼'],
  '3,3,3,0,0': ['Elisabeth of Austria', '奥地利的伊丽莎白']
};

const cards = [];
cart.forEach((line, idx) => {
  const n = idx + 1;
  const level = n <= 40 ? 1 : n <= 70 ? 2 : 3;
  const inLevel = n <= 40 ? n : n <= 70 ? n - 40 : n - 70;
  const digits = line.substring(0, 5).split('').map(Number);
  const points = Number(line.substring(6, 7));
  const cost = {};
  COST_ORDER.forEach((c, i) => { cost[c] = digits[i] || 0; });
  const interval = level === 1 ? 8 : level === 2 ? 6 : 4;
  const bonusColor = BONUS_ORDER[Math.min(4, Math.floor((inLevel - 1) / interval))];
  const prefix = level === 1 ? 'I' : level === 2 ? 'II' : 'III';
  cards.push({
    id: 'L' + level + '-' + String(inLevel).padStart(2, '0'),
    cardKey: 'L' + level + '-' + String(inLevel).padStart(2, '0'),
    level, points,
    bonus: { color: bonusColor, count: 1 },
    cost,
    image: 'dev_' + prefix + '_' + String(inLevel).padStart(2, '0') + '.png'
  });
});

const nobles = nobl.map((line, idx) => {
  const digits = line.substring(0, 5).split('').map(Number);
  const require = {};
  COST_ORDER.forEach((c, i) => { require[c] = digits[i] || 0; });
  const nm = NOBLE_NAMES[sig(require)] || ['Noble ' + (idx + 1), '贵族 ' + (idx + 1)];
  return {
    id: 'N-' + String(idx + 1).padStart(2, '0'),
    name: nm[0], nameZh: nm[1],
    require, points: 3,
    image: 'noble_' + String(idx + 1).padStart(2, '0') + '.png'
  };
});

fs.writeFileSync(path.join(ROOT, 'shared','data','cards.js'),
  "'use strict';\n/* 基础版 90 张发展卡：数据与官方卡面图片一一对应 */\nmodule.exports = {\n  source: 'official-art',\n  cards: " + JSON.stringify(cards, null, 2) + "\n};\n");
fs.writeFileSync(path.join(ROOT, 'shared','data','nobles.js'),
  "'use strict';\n/* 基础版 10 张贵族圆板 */\nmodule.exports = {\n  source: 'official-art',\n  nobles: " + JSON.stringify(nobles, null, 2) + "\n};\n");
fs.writeFileSync(path.join(ROOT, 'public','assets','cards','manifest.json'),
  JSON.stringify(cards.reduce((m,c)=>{m[c.cardKey]=c.image;return m;},{})));
fs.writeFileSync(path.join(ROOT, 'public','assets','nobles','manifest.json'),
  JSON.stringify(nobles.reduce((m,n)=>{m[n.id]=n.image;return m;},{})));

// 统计自检
const byLevel = [1,2,3].map(l => cards.filter(c=>c.level===l));
const pts = byLevel.map(ls => {
  const s = {}; ls.forEach(c => s[c.points]=(s[c.points]||0)+1); return s;
});
const bonus = {}; cards.forEach(c => bonus[c.bonus.color]=(bonus[c.bonus.color]||0)+1);
console.log('cards per level:', byLevel.map(l=>l.length).join('/'));
console.log('points distribution:', JSON.stringify(pts));
console.log('bonus distribution:', JSON.stringify(bonus));
console.log('nobles:', nobles.map(n=>n.nameZh+' '+sig(n.require)).join(' | '));
