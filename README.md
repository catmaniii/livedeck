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

## 与官方 pptx skill 的关系(独立,不依赖)

**本 skill 独立工作,不依赖 pptx skill。** 出"可翻页 HTML deck + 内嵌动态演示"的全部能力,都由本 skill
自带的 `html-deck-template.html`(模板 + 放映引擎)完成 —— 不 import、不引用官方 pptx skill,缺了它也照常
工作;模板与引擎均为独立原创实现,不复制其任何内容。

两者是**面向不同产物的兄弟 skill**,不是替代、也不是子集:需要真正的 `.pptx`(PowerPoint 兼容 / 可再编辑)
用官方 pptx skill;需要浏览器里翻页放映 + 内嵌活 HTML 用本 skill。**唯一会用到 pptx skill 的是上游、可选的
一步**——源材料是现成 `.pptx`、想转成 HTML deck 时,先用 pptx skill 抽取内容再用本 skill 重排;从零写 deck
完全用不到它。

## 安装

放进 `~/.claude/skills/livedeck/` 即可被 Claude Code 识别为 skill。
