# livedeck

一个 Claude Code / Agent Skill:输出**自包含、可翻页的 HTML 演示 deck**,并能内嵌**活的 HTML 演示**
(动画 / 可交互图谱图表 / 实时组件 / 视频),靠 `<iframe>` 实现。

适合 `.pptx` 装不下动态内容、又想要 PPT 式放映体验(方向键翻页、全屏、`#n` 深链)的场合。

## 内容

- `SKILL.md` —— skill 说明(何时用、怎么做、铁律、QA)。
- `html-deck-template.html` —— 现成模板:固定 1280×720、等比缩放、内置放映引擎与 HUD、纯 CSS 排版类
  (`kicker` / `card` / `cols` / `table.grid` / `bars` / `chip` / `demo-wrap`)。

## 用法

复制 `html-deck-template.html`,每张幻灯片写成一个 `<section class="slide">…</section>`,顺序即放映顺序;
要动态演示就用 `<iframe>` 嵌(交付时把 `src` 转成内联 `srcdoc` 做成自包含单文件)。详见 `SKILL.md`。

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
  纪律时需要 pptx skill 在场。需要真正的 `.pptx` 产物时直接用 pptx skill。

## 安装

放进 `~/.claude/skills/livedeck/` 即可被 Claude Code 识别为 skill。
