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

## 与官方 pptx skill 的关系

本 skill 的模板与放映引擎为**独立原创实现**,不复制 Anthropic 官方 pptx skill 的任何内容。需要真正的
`.pptx` 文件(PowerPoint 兼容 / 可再编辑)时用官方 pptx skill;需要浏览器里翻页放映 + 内嵌活 HTML 时用
本 skill。两者可并存。

## 安装

放进 `~/.claude/skills/livedeck/` 即可被 Claude Code 识别为 skill。
