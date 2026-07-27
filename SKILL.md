---
name: livedeck
description: >-
  输出一个自包含、可翻页的 HTML 演示 deck(方向键翻页、全屏放映、#n 深链),并且能内嵌活的
  HTML 演示(动画 / 可交互图谱图表 / 实时组件 / 视频),靠 <iframe> 实现 —— 用于 .pptx 装不下动态
  内容、又想要 PPT 式放映体验的场合。本 skill 是 Anthropic 官方 pptx skill 的**配套扩展层**,不是独立
  自足的 skill:它自己提供 HTML deck 的模板 / 放映引擎 / 浏览器截图 QA,但源素材摄取、初稿与设计、视觉 QA
  方法论仍依赖 pptx skill,应与其配套使用。需要真正的 .pptx 文件时直接用 pptx skill。
---

# LiveDeck — 可翻页 + 内嵌动态演示的 HTML 演示文稿

当用户想要**能像 PPT 一样翻页、并且能内嵌动画 / 可交互组件 / 实时图表**的演示时,输出一个自包含的
HTML deck,而不是 .pptx。PPTX 无法嵌入活的 HTML;HTML deck 天生可以(用 `<iframe>`)。

## 与官方 pptx skill 的关系(配套扩展,非独立自足)

本 skill 是 **Anthropic 官方 pptx skill 的配套扩展层**,负责"HTML 翻页 deck + 内嵌动态演示"这一层;
完整的"从素材到成品"工作流仍依赖 pptx skill,**建议二者一起安装使用**。

**本 skill 自己提供(HTML 层,不调 pptx 脚本):**
- `html-deck-template.html` —— 1280×720 模板 + 放映引擎 + HUD(独立原创,不复制 pptx skill 内容)。
- 交付形态:`srcdoc` 内联成自包含单文件。
- 渲染 / 视觉 QA:用浏览器(`msedge --headless --screenshot`),而非 pptx 的 `soffice`→pdf→`pdftoppm`。

**仍依赖 pptx skill 的部分(真实端到端流程里会用到):**
- **源素材摄取**:源材料常是 `.pptx` / PDF,用 pptx skill 的 `python -m markitdown` / `office/unpack.py`
  抽成文本再重排。
- **初稿与设计**:实践中常先用 pptx skill 的 `pptxgenjs` 出一版结构 / 设计稿,再据此改写成 HTML deck。
- **设计规范 + 视觉 QA 方法论**:配色 / 字体 / 版式禁忌,以及"假设有 bug、用 subagent 新眼睛逐页查、
  改完再验"这套纪律,均以 pptx skill 的 `SKILL.md` 为准。

**边界**:纯粹"把已写好的 HTML 渲染成可翻页 deck 并内嵌演示",可只用本 skill、不调 pptx 脚本;但只要涉及
**导入素材、出结构初稿、或走完整设计 / QA 纪律**,就需要 pptx skill 在场。需要真正的 `.pptx` 产物时直接
用 pptx skill。

## 什么时候用它

- 需要**动态演示**:内嵌动画、可交互图谱 / 图表、实时组件、视频。
- 想要**方向键翻页、全屏放映**,又要保留网页的表现力。
- 交付物在浏览器里看 / 演示,不强求 .pptx 兼容。

## 怎么做

1. 复制 `html-deck-template.html` 到目标位置,改标题。
2. 每张幻灯片是一个 `<section class="slide">…</section>`,顺序即放映顺序。增删 section 即可,放映引擎
   自动统计页数。
3. 用模板里现成的类排版:`kicker`(章节眉)/ `h1.t`(大标题)/ `card`+`cols`(卡片栏)/ `table.grid`
   (表格)/ `bars`(纯 CSS 条形图)/ `chip` / `demo-wrap`(内嵌演示)。
4. **动态演示**:两种嵌法。
   - **同目录 + `src`**(开发时方便):`<iframe src="your-demo.html">`,本地 `file://` 直接加载。
     缺点:deck 依赖旁边的文件,单发 / 移动 / 在预览面板里打开会**加载不到 → 空白**。
   - **内联 `srcdoc`(交付 / 分享用,推荐)**:把被嵌 HTML 转义后塞进 `srcdoc`,deck 变**自包含单
     文件**,拷走 / 预览都能动。转义只需两步(顺序别反):`&`→`&amp;`,再 `"`→`&quot;`。可用脚本
     一键把 `src="x.html"` 换成 `srcdoc="…"`:
     ```python
     esc=open("x.html",encoding="utf-8").read().replace("&","&amp;").replace('"',"&quot;")
     deck=deck.replace('src="x.html"', 'srcdoc="%s"'%esc)
     ```
     被嵌文件自身要**自包含**(自带 CSS/JS、数据内联,不引外链),srcdoc 里 `?query` / 拖拽 / `fetch`
     相对路径都不可用。
5. 用浏览器打开验收(见下 QA)。

## 放映交互(引擎已内置,无需额外代码)

- `←/→`、`空格`、`PageUp/Down` 翻页;`Home/End` 跳首尾;`F` 全屏;左右 `‹ ›` 按钮;触摸左右滑动。
- `#n` 深链直达第 n 页(如 `deck.html#5`),刷新 / 分享保持页码。
- **fragment 逐步显现**:给元素加 `class="fragment"`,同页内按 `→` 逐个点亮,全亮后再 `→` 才翻页。

## 铁律 / 常见坑(务必遵守)

- **必须声明 `color-scheme: light`**(`<meta>` + `:root` 两处都留)。否则浏览器 / 系统处于深色模式时,
  **auto-dark-mode 会把白色幻灯片整体压暗**成灰。想更硬的 opt-out 用 `only light`。模板已内置。
- **入场动画只动 `transform`、不要从 `opacity:0` 开始**。个别环境(如无头截图、动画时钟不推进)会让
  幻灯片卡在透明 → 看起来全黑。模板已改成只滑入。
- **固定设计尺寸 1280×720**,JS 等比缩放铺满视口(letterbox)。想改 16:10 / 4:3 就同时改 CSS 里
  `#stage` 宽高和 JS `fit()` 里的 `1280/720`。
- **自包含优先**:字体用系统字体栈;图表用纯 CSS/SVG(模板的 `bars` 即纯 CSS);要嵌的演示文件跟
  deck 放一起、相对路径引用,别引外链(离线 / 内网要能开)。
- **iframe 内容各自独立**:被嵌的演示自己也要遵守 color-scheme 等规则;它有自己的键盘 / 滚轮交互时,
  焦点在 iframe 内时方向键归它、不翻页(点幻灯片空白处夺回焦点即可)。

## QA(必做,当成找 bug)

在浏览器里逐页翻一遍,重点查:

- 深色系统主题下白底是否被压暗(漏了 color-scheme 的典型症状)。
- 每页有没有溢出 / 被裁(内容超 1280×720 设计框)、字号对比是否够。
- iframe 演示能否加载、可交互是否正常、相对路径对不对。
- 方向键 / 空格 / Home / End / 全屏 / `#n` 深链是否都工作。
- 无头截图核对(可选):
  ```
  msedge --headless --disable-gpu --window-size=1280,720 --virtual-time-budget=4500 \
    --screenshot=out.png "file:///abs/path/deck.html#6"
  ```
  截图偏暗多半是上面两条铁律没遵守。

## 结构速查

```
<div id="stage">                     固定 1280×720,JS 缩放
  <section class="slide"> …页1… </section>
  <section class="slide"> …页2… </section>
  …
</div>
<!-- HUD:计数 / 进度 / ‹› / hint,勿删 -->
<script> …放映引擎,勿删… </script>
```

一页 = 一个 `.slide`;放映引擎和 HUD 保持原样;只管往 `#stage` 里增删 `.slide`、往每页里填内容。
