#!/usr/bin/env node
/* html2pptx.js —— 把 livedeck 的 HTML deck 转成**文本框可编辑**的 .pptx
 *
 *   node scripts/html2pptx.js deck.html [out.pptx] [--chrome=...] [--slack=8] [--font=...]
 *
 * 原理:无头 Chrome 打开 deck → 注入 measure.js 量出每个元素的真实坐标 →
 *       映射成 pptxgenjs 的 addText/addShape/addTable → 生成 .pptx。
 *
 * 为什么不截图:pptx 里只有两种东西 —— <p:sp>(形状/文本框,可编辑)和 <p:pic>(图片,不可编辑)。
 * 截图或整页转 SVG 一律落成 <p:pic>。要可编辑就必须逐元素映射,别无他法。
 *
 * 依赖:Chrome/Edge(livedeck 的 QA 本来就要)+ npm i -g pptxgenjs。
 *      **不依赖 pptx skill 的任何脚本**(那是第三方 skill,更新即覆盖)。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

/* ── 单位:1280×720 设计框 ↔ 10″×5.625″ 恰好 128 px/inch,零误差 ── */
const PX_PER_IN = 128;
const PT_PER_PX = 72 / PX_PER_IN;   // 0.5625
const IN = px => px / PX_PER_IN;
const PT = px => Math.round(px * PT_PER_PX * 10) / 10;

/* ── 字体:CSS 系统栈 → pptx 里存在的具体字体 ──
 * 这里必须**按 run 的实际文字**选,不能只取字体栈的第一个。
 * 中文 deck 的字体栈通常是 "Segoe UI","PingFang SC","Microsoft YaHei" ——
 * 浏览器给汉字用的是后面那个 CJK 字体,只取第一个会把汉字判成 Segoe UI 的度量,
 * 换行位置就跟 HTML 对不上(实测页脚会多折一行并被切掉)。
 * 注:pptxgenjs 的 fontFace 会同时写进 <a:latin>/<a:ea>/<a:cs>,无法分设中西文,
 *     所以中西混排的 run 统一按 CJK 字体走。
 */
const CJK_RE = /[⺀-鿿豈-﫿＀-￯　-〿]/;
const CJK_MAP = {
  'pingfang sc': '微软雅黑', 'pingfang tc': '微软正黑体',
  'microsoft yahei': '微软雅黑', 'microsoft jhenghei': '微软正黑体',
  'noto sans sc': '微软雅黑', 'noto sans cjk sc': '微软雅黑',
  'source han sans sc': '思源黑体', 'hiragino sans gb': '微软雅黑',
  'simsun': '宋体', 'simhei': '黑体', 'kaiti': '楷体', 'fangsong': '仿宋'
};
const LATIN_MAP = {
  'segoe ui semibold': 'Segoe UI', 'segoe ui': 'Segoe UI',
  'ui-monospace': 'Consolas', 'cascadia mono': 'Consolas', 'consolas': 'Consolas',
  'system-ui': 'Segoe UI', 'sans-serif': 'Segoe UI', 'serif': 'Georgia', 'monospace': 'Consolas'
};
const CJK_FALLBACK = '微软雅黑';

function mapFont(cssFamily, text, override) {
  if (override) return override;
  const fams = String(cssFamily || '').split(',')
    .map(f => f.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  if (CJK_RE.test(text || '')) {
    for (const f of fams) { const hit = CJK_MAP[f.toLowerCase()]; if (hit) return hit; }
    return CJK_FALLBACK;                 // 栈里没写 CJK 字体,浏览器也是走系统兜底
  }
  for (const f of fams) {
    const k = f.toLowerCase();
    if (LATIN_MAP[k]) return LATIN_MAP[k];
    if (!CJK_MAP[k]) return f;           // 没听说过的具体字体,原样透传
  }
  return 'Segoe UI';
}

/* ── 参数 ── */
const argv = process.argv.slice(2);
const opt = { slack: 8, font: null, chrome: null, keep: false, svg: 'raster' };
const pos = [];
for (const a of argv) {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
  if (m) { opt[m[1]] = m[2] === undefined ? true : m[2]; }
  else pos.push(a);
}
if (!pos.length) {
  console.error('用法: node html2pptx.js <deck.html> [out.pptx] [--slack=8] [--font="微软雅黑"]');
  console.error('             [--svg=raster|embed] [--chrome=<path>] [--dumpjson=m.json] [--keep]');
  process.exit(2);
}
opt.slack = parseFloat(opt.slack) || 0;
const SVG_SCALE = 3;   // 内联 SVG 栅格化倍率,3× 足够清晰又不至于文件太大
const srcPath = path.resolve(pos[0]);
const outPath = path.resolve(pos[1] || srcPath.replace(/\.html?$/i, '') + '.pptx');

/* ── 找浏览器 ── */
function findChrome() {
  if (opt.chrome) return opt.chrome;
  const cands = process.platform === 'win32' ? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ] : [
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('找不到 Chrome/Edge,用 --chrome=<path> 指定');
}

/* ── 1. 量 ── */
function measure() {
  const html = fs.readFileSync(srcPath, 'utf8');
  const script = fs.readFileSync(path.join(__dirname, 'measure.js'), 'utf8');
  // 必须注入**最后一个** </body>。交付形态的 deck 会把被嵌演示内联进 srcdoc,
  // 那些 HTML 自带 </body>,且在 srcdoc 属性里是字面文本 —— 注入第一个会掉进 iframe,
  // 脚本在 iframe 里跑,顶层页面拿不到任何数据。
  const last = html.toLowerCase().lastIndexOf('</body>');
  if (last < 0) throw new Error('deck 里找不到 </body>,不像 livedeck 模板');
  const injected = html.slice(0, last) + `<script>\n${script}\n</script>\n` + html.slice(last);

  // 临时文件必须与原 deck 同目录:iframe src / <img src> 都是相对路径
  const tmp = path.join(path.dirname(srcPath), `.h2p-${process.pid}.html`);
  fs.writeFileSync(tmp, injected, 'utf8');
  try {
    const dom = execFileSync(findChrome(), [
      '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--window-size=1280,720', '--virtual-time-budget=6000',
      '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/')
    ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    // 取最后一处:注入的 measure.js 源码本身也会被 dump 出来,前面的匹配可能落在它里面
    const all = [...dom.matchAll(/<pre id="__H2P__">([\s\S]*?)<\/pre>/g)];
    const m = all.length ? all[all.length - 1] : null;
    if (!m) throw new Error('measure.js 没有产出数据 —— 多半是 deck 里有 JS 报错,先在浏览器里打开看 console');
    return JSON.parse(decodeEntities(m[1]));
  } finally {
    if (!opt.keep) { try { fs.unlinkSync(tmp); } catch (e) { } }
  }
}
function decodeEntities(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/* ── 2. 生成 ── */
// pptxgenjs 通常是 `npm i -g` 装的,而本脚本不在那棵 node_modules 里,直接 require 解析不到。
function loadPptxGen() {
  const tried = [];
  const cands = [];
  // Windows 全局包在 node.exe 同级的 node_modules;*nix 在 <prefix>/lib/node_modules
  const bin = path.dirname(process.execPath);
  cands.push(path.join(bin, 'node_modules', 'pptxgenjs'));
  cands.push(path.join(bin, '..', 'lib', 'node_modules', 'pptxgenjs'));
  (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)
    .forEach(p => cands.push(path.join(p, 'pptxgenjs')));
  try {
    // Node 18.20+ 起 spawn 一个 .cmd 必须显式 shell:true,否则 EINVAL
    const root = execFileSync('npm', ['root', '-g'],
      { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (root) cands.push(path.join(root, 'pptxgenjs'));
  } catch (e) { tried.push('npm root -g: ' + e.message.split('\n')[0]); }

  try { return require('pptxgenjs'); } catch (e) { tried.push('require(pptxgenjs)'); }
  for (const c of cands) {
    try { if (fs.existsSync(c)) return require(c); } catch (e) { tried.push(c + ': ' + e.message.split('\n')[0]); }
  }
  throw new Error('找不到 pptxgenjs,请先 `npm install -g pptxgenjs`\n  已探测: ' +
    cands.join('\n           ') + (tried.length ? '\n  ' + tried.join('\n  ') : ''));
}

function build(data) {
  const pptxgen = loadPptxGen();
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';                    // 10″×5.625″,与 1280×720 精确对应
  if (data.title) pres.title = data.title;

  const stats = { text: 0, shape: 0, table: 0, image: 0, unsupported: 0 };
  const warnings = [];
  const svgDir = path.join(path.dirname(outPath), '_h2p_svg');

  data.slides.forEach((sd, si) => {
    const slide = pres.addSlide();
    slide.background = { color: sd.bg };
    (sd.warnings || []).forEach(w => warnings.push(w));

    // 分层:形状 → 图片 → 表格/占位 → 文字。
    // 必须这么排。文档序里,行内 <span> 的高亮背景排在父段落文字**之后**,
    // 照原序写进 pptx 就会把已经画好的字盖掉(HTML 里背景永远在文字之下)。
    // 同一层内保持文档序(sort 稳定),层间用 rank 拉开。
    const RANK = { shape: 0, image: 1, svg: 1, table: 2, unsupported: 2, text: 3 };
    const ordered = sd.items
      .map((it, i) => ({ it, i }))
      .sort((a, b) => (RANK[a.it.kind] - RANK[b.it.kind]) || (a.i - b.i))
      .map(x => x.it);

    for (const it of ordered) {
      try {
        if (it.kind === 'shape') { addShape(pres, slide, it); stats.shape++; }
        else if (it.kind === 'text') { addText(slide, it); stats.text++; }
        else if (it.kind === 'table') { addTable(slide, it); stats.table++; }
        else if (it.kind === 'image') { addImage(slide, it); stats.image++; }
        else if (it.kind === 'svg') { addSvg(slide, it, svgDir, si); stats.image++; }
        else if (it.kind === 'unsupported') { addPlaceholder(pres, slide, it); stats.unsupported++; }
      } catch (e) {
        warnings.push(`第 ${si + 1} 页 ${it.sel} 转换失败: ${e.message}`);
      }
    }
  });

  return { pres, stats, warnings };
}

function addShape(pres, slide, it) {
  const type = it.shape === 'ellipse' ? pres.shapes.OVAL
    : it.shape === 'roundRect' ? pres.shapes.ROUNDED_RECTANGLE
      : pres.shapes.RECTANGLE;
  const o = { x: IN(it.x), y: IN(it.y), w: IN(it.w), h: IN(it.h) };
  // fill/line 每次都新建对象:pptxgenjs 会就地改写传入的 options(把值换算成 EMU),复用会污染下一个形状
  o.fill = it.fill
    ? (it.fillAlpha < 0.995
      ? { color: it.fill, transparency: Math.round((1 - it.fillAlpha) * 100) }
      : { color: it.fill })
    : { type: 'none' };
  if (it.line) o.line = { color: it.line.color, width: Math.max(0.5, PT(it.line.width)) };
  if (it.shape === 'roundRect') {
    // pptxgenjs 的 rectRadius 单位是英寸,且只对 ROUNDED_RECTANGLE 生效
    o.rectRadius = Math.min(IN(it.radius), Math.min(o.w, o.h) / 2);
  }
  slide.addShape(type, o);
}

function addText(slide, it) {
  const runs = it.runs.map((r, i) => ({
    text: r.text,
    options: {
      bold: r.bold, italic: r.italic, color: r.color,
      fontSize: PT(r.size), fontFace: mapFont(r.font, r.text, opt.font),
      breakLine: r.breakLine || undefined
    }
  }));

  // 浏览器里就只有一行的文字,在 pptx 里必须**禁止换行**。
  // 否则 PowerPoint/LibreOffice 的字体度量只要比 Chrome 宽一点点,就会折出第二行 ——
  // 实测模板页脚"页脚 · 可放机构/日期"正是这样被折断并切出页底的。
  // 单行禁 wrap 只会让文字向外溢出(不可见的框边界),不会改变起点,比调 slack 稳。
  const single = it.h <= it.lineHeight * 1.5;

  let x = it.x, w = it.w;
  if (it.block && typeof it.cbR === 'number') {
    if (it.align === 'center' || it.align === 'right') { x = it.cbL; w = it.cbR - it.cbL; }
    else { w = Math.max(it.w, it.cbR - it.x); }
  }
  if (!single) {
    // 多行才需要富余量:按比例给,固定 px 在大字号上不够、在小字号上又太多
    const pad = opt.slack + w * 0.03;
    if (it.align === 'center') { x -= pad / 2; w += pad; }
    else if (it.align === 'right') { x -= pad; w += pad; }
    else w += pad;
  }

  slide.addText(runs, {
    x: IN(x), y: IN(it.y - 1), w: IN(w), h: IN(it.h + 2),
    margin: 0,                        // 关键:pptx 文本框默认有内边距,不清零就对不齐
    valign: 'top',
    align: it.align || 'left',
    lineSpacing: PT(it.lineHeight),
    charSpacing: it.charSpacing ? PT(it.charSpacing) : undefined,
    wrap: !single, shrinkText: false, isTextBox: true
  });
}

function addTable(slide, it) {
  const rows = it.rows.map(r => r.cells.map(c => ({
    // 格内富文本:一个单元格里可能有不同颜色/粗细的片段(彩色 ✓/✗ 就是),
    // 压成单一 text 会把这些全丢掉
    text: (c.runs && c.runs.length > 1)
      ? c.runs.map(x => ({
        text: x.text,
        options: {
          bold: x.bold, italic: x.italic, color: x.color,
          fontSize: PT(x.size), fontFace: mapFont(x.font, x.text, opt.font),
          breakLine: x.breakLine || undefined
        }
      }))
      : c.text,
    options: {
      bold: c.bold, color: c.color, fontSize: PT(c.size),
      fontFace: mapFont(c.font, c.text, opt.font),
      fill: c.fill ? { color: c.fill } : undefined,
      align: c.align || 'left', valign: 'top',
      colspan: c.colspan, rowspan: c.rowspan,
      margin: [PT(it.padY), PT(it.padX), PT(it.padY), PT(it.padX)]
    }
  })));
  const o = {
    x: IN(it.x), y: IN(it.y), w: IN(it.w),
    colW: it.colW.map(IN),
    rowH: it.rows.map(r => IN(r.h)),
    valign: 'top', autoPage: false
  };
  o.border = it.border
    ? [{ type: 'none' }, { type: 'none' },
    { type: 'solid', color: it.border.color, pt: Math.max(0.5, PT(it.border.width)) },
    { type: 'none' }]
    : { type: 'none' };
  slide.addTable(rows, o);
}

function addImage(slide, it) {
  if (!it.src) return;
  const p = /^(https?:|data:)/.test(it.src) ? it.src
    : path.resolve(path.dirname(srcPath), decodeURIComponent(it.src));
  const o = { x: IN(it.x), y: IN(it.y), w: IN(it.w), h: IN(it.h) };
  // CSS object-fit 对应 pptxgenjs 的 sizing;不映射的话非等比的框会把图拉变形
  if (it.fit === 'cover' || it.fit === 'contain') o.sizing = { type: it.fit, w: o.w, h: o.h };
  if (/^data:/.test(it.src)) o.data = it.src; else o.path = p;
  slide.addImage(o);
}

// 内联 <svg> 默认**自己用 Chrome 栅格化成 PNG** 再嵌。
// 原因:pptxgenjs 在 Node 里没有栅格化能力,走 addImage(*.svg) 时会按 OOXML 的
// "PNG 兜底 + SVG 扩展"惯例占两个 part,却把 **同一份 SVG 字节原样写进那个 .png**
// —— 产出一个声明为 image/png、内容却是 SVG 的 part(实测两份文件字节完全相同)。
// 靠这个兜底渲染的阅读器会画歪(LibreOffice 实测流程图叠字)。
// SVG 在 pptx 里横竖都是不可编辑的图片,那不如给一张 3× 的真 PNG,到哪都画对。
// 想保留矢量就传 --svg=embed,但要接受上面那个坑。
function addSvg(slide, it, dir, si) {
  fs.mkdirSync(dir, { recursive: true });
  const base = `s${si + 1}-${Math.abs(hash(it.markup))}`;
  const o = { x: IN(it.x), y: IN(it.y), w: IN(it.w), h: IN(it.h) };

  if (opt.svg === 'embed') {
    const f = path.join(dir, base + '.svg');
    fs.writeFileSync(f, it.markup, 'utf8');
    slide.addImage({ ...o, path: f });
    return;
  }

  const png = path.join(dir, base + '.png');
  rasterizeSvg(it.markup, Math.max(1, Math.round(it.w)), Math.max(1, Math.round(it.h)), png);
  slide.addImage({ ...o, path: png });
}

function rasterizeSvg(markup, w, h, outPng) {
  const wrapper = outPng.replace(/\.png$/, '.wrap.html');
  fs.writeFileSync(wrapper,
    '<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light">' +
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>` +
    markup, 'utf8');
  try {
    execFileSync(findChrome(), [
      '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      `--window-size=${w},${h}`, `--force-device-scale-factor=${SVG_SCALE}`,
      '--default-background-color=00000000', '--virtual-time-budget=3000',
      `--screenshot=${outPng}`, 'file:///' + wrapper.replace(/\\/g, '/')
    ], { stdio: 'ignore' });
    if (!fs.existsSync(outPng)) throw new Error('Chrome 没有产出 PNG');
  } finally {
    try { fs.unlinkSync(wrapper); } catch (e) { }
  }
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

function addPlaceholder(pres, slide, it) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: IN(it.x), y: IN(it.y), w: IN(it.w), h: IN(it.h),
    fill: { color: 'F4F7FB' }, line: { color: 'DCE4EE', width: 1, dashType: 'dash' },
    rectRadius: 0.11
  });
  slide.addText([
    { text: '此处为活的 HTML 演示', options: { bold: true, fontSize: 15, breakLine: true } },
    { text: it.src, options: { fontSize: 10, color: '8595A5' } }
  ], {
    x: IN(it.x), y: IN(it.y + it.h / 2 - 24), w: IN(it.w), h: IN(48),
    margin: 0, align: 'center', valign: 'middle', color: '5B6B7C',
    fontFace: opt.font || 'Segoe UI', isTextBox: true
  });
}

/* ── 主流程 ── */
(async function main() {
  console.log(`量取版面: ${path.basename(srcPath)}`);
  const data = measure();
  // 排查用:把量出来的中间数据落盘,能直接看到每个条目的 sel / 坐标 / runs
  if (opt.dumpjson) {
    fs.writeFileSync(String(opt.dumpjson), JSON.stringify(data, null, 1), 'utf8');
    console.log(`  中间数据已写入 ${opt.dumpjson}`);
  }
  console.log(`  ${data.slides.length} 页,设计框 ${data.designW}×${data.designH}(= ${data.designW / PX_PER_IN}″×${data.designH / PX_PER_IN}″)`);

  const { pres, stats, warnings } = build(data);
  await pres.writeFile({ fileName: outPath });

  console.log(`\n已生成 ${path.basename(outPath)}`);
  console.log(`  可编辑文本框 ${stats.text} · 形状 ${stats.shape} · 表格 ${stats.table} · 图片 ${stats.image} · 占位 ${stats.unsupported}`);
  if (warnings.length) {
    console.log(`\n⚠️  ${warnings.length} 条需要人看:`);
    warnings.forEach(w => console.log('  · ' + w));
  }
  console.log(`\n下一步:务必做视觉 QA(见 SKILL.md「转 pptx」一节),第一遍渲染基本不会全对。`);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
