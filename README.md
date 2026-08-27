# livedeck

一个 Claude Code / Agent Skill:输出**自包含、可翻页的 HTML 演示 deck**,并能内嵌**活的 HTML 演示**
(动画 / 可交互图谱图表 / 实时组件 / 视频),靠 `<iframe>` 实现。

适合 `.pptx` 装不下动态内容、又想要 PPT 式放映体验(方向键翻页、全屏、`#n` 深链)的场合。

## 内容

- `SKILL.md` —— skill 说明(何时用、怎么做、铁律、QA、转 pptx)。
- `html-deck-template.html` —— 现成模板:固定 1280×720、等比缩放、内置放映引擎与 HUD、纯 CSS 排版类
  (`kicker` / `card` / `cols` / `table.grid` / `bars` / `chip` / `demo-wrap`)。
- `scripts/html2pptx.js` —— 把 deck 转成**文本框可编辑**的 `.pptx`(见下)。
- `scripts/measure.js` —— 注入页面的量版脚本,由上面那个调用。
- `scripts/force_theme.py` —— 内联被嵌 HTML 时把它的配色**钉死**成 deck 指定的主题(见下)。
- `CHANGELOG.md` —— 版本变更记录。

## 用法

复制 `html-deck-template.html`,每张幻灯片写成一个 `<section class="slide">…</section>`,顺序即放映顺序;
要动态演示就用 `<iframe>` 嵌(交付时把 `src` 转成内联 `srcdoc` 做成自包含单文件)。详见 `SKILL.md`。

## 转可编辑 pptx

```bash
node scripts/html2pptx.js deck.html out.pptx
```

**不是截图**:无头 Chrome 排完版后逐元素量坐标,再映射成 pptxgenjs 的 `addText` / `addShape` /
`addTable`,产出的 `.pptx` 里每个文本框在 PowerPoint 里双击就能改。

pptx 里只有 `<p:sp>`(形状 / 文本框,可编辑)和 `<p:pic>`(图片,不可编辑)两种东西,
截图和整页 SVG 一律落成后者 —— 这就是"转出来全是图片、不能编辑"的由来。SVG 也不例外。

设计框与 pptx 幅面是精确整数倍,换算零误差:`1280/10" = 720/5.625" = 128 px/inch`,字号 `1px = 0.5625pt`。

只依赖 Chrome/Edge + `npm i -g pptxgenjs`,**不调用 pptx skill 的任何脚本**。
能转到什么程度、哪些 CSS 不能用、动态内容怎么降级,见 `SKILL.md` 的「转 pptx」一节。

## 配色由 deck 决定,不跟随观众的系统

演示文稿的配色是**设计决定** —— 没有哪份 PPT 的颜色该随观众机器的深色 / 浅色设置变。
现成的可视化页却常是**深色优先**写法,而且主题多半**由 JS 算**(`matchMedia` 跟随系统、
`localStorage` 跟随上次点过的按钮),内联进 deck 后在深色系统上整块变黑。

```python
import os, sys
sys.path.insert(0, os.path.expanduser("~/.claude/skills/livedeck/scripts"))
from force_theme import force_theme

raw = force_theme(open("demo.html", encoding="utf-8").read(), "light")
```

三管齐下:CSS 拆媒体查询 + 在页面自己的脚本之前钉 `data-theme` + 接管 `matchMedia` 与
`Storage.getItem`。**只改 CSS 按不住**。验证必须在**强制深色**下截图量亮度(浅色系统上验不出来),
细节见 `SKILL.md`。

## 与官方 pptx skill 的关系(配套扩展,非独立自足)

本 skill 是 **Anthropic 官方 pptx skill 的配套扩展层**,负责"HTML 翻页 deck + 内嵌动态演示"这一层,
**建议与官方 pptx skill 一起安装使用**。

- **本 skill 自己提供**(HTML 层,不调 pptx 脚本):`html-deck-template.html`(模板 + 放映引擎,独立原创、
  不复制 pptx skill 内容)、`srcdoc` 自包含内联、以及用浏览器(`msedge --headless --screenshot`)做渲染 /
  视觉 QA。
- **仍依赖 pptx skill**:① 源素材摄取 —— `.pptx` / PDF 用 `markitdown` / `unpack` 抽文本;② 常先用
  `pptxgenjs` 出结构 / 设计初稿再改写成 HTML;③ 设计规范与"假设有 bug、subagent 逐页查"的视觉 QA 方法论,
  以 pptx skill 的 `SKILL.md` 为准。
- **边界**:只"把写好的 HTML 渲染成可翻页 deck"可只用本 skill;涉及导入素材、出初稿、或走完整设计 / QA
  纪律时需要 pptx skill 在场。**从零**做 `.pptx` 直接用 pptx skill 的 `pptxgenjs`;**已有 HTML deck** 想要可编辑 `.pptx`,用上面的 `html2pptx.js`。

## 安装

放进 `~/.claude/skills/livedeck/` 即可被 Claude Code 识别为 skill。
