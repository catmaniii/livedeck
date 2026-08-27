---
name: livedeck
description: >-
  输出一个自包含、可翻页的 HTML 演示 deck(方向键翻页、全屏放映、#n 深链),并且能内嵌活的
  HTML 演示(动画 / 可交互图谱图表 / 实时组件 / 视频),靠 <iframe> 实现 —— 用于 .pptx 装不下动态
  内容、又想要 PPT 式放映体验的场合。本 skill 是 Anthropic 官方 pptx skill 的**配套扩展层**,不是独立
  自足的 skill:它自己提供 HTML deck 的模板 / 放映引擎 / 浏览器截图 QA,但源素材摄取、初稿与设计、视觉 QA
  方法论仍依赖 pptx skill,应与其配套使用。也可用自带的 scripts/html2pptx.js 把 deck 转成**文本框可编辑**的 .pptx
  (逐元素映射,不是截图)。
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
**导入素材、出结构初稿、或走完整设计 / QA 纪律**,就需要 pptx skill 在场。

**从零做一份 .pptx** 仍然直接用 pptx skill 的 `pptxgenjs`。但**已经有 HTML deck、想要一份可编辑 .pptx**
时,用本 skill 自带的 `scripts/html2pptx.js`(见下「转 pptx」)—— 它只依赖 Chrome + `pptxgenjs`,
**不调用 pptx skill 的任何脚本**。pptx skill 是第三方 skill,改它的文件会在下次更新时被覆盖。

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
     import os, sys                                 # 注意:Python 不展开 ~,必须 expanduser
     sys.path.insert(0, os.path.expanduser("~/.claude/skills/livedeck/scripts"))
     from force_theme import force_theme            # 配色由 deck 决定,不由被嵌页决定

     raw = force_theme(open("x.html", encoding="utf-8").read(), "light")
     esc = raw.replace("&", "&amp;").replace('"', "&quot;")    # 顺序别反
     deck = deck.replace('src="x.html"', 'srcdoc="%s"' % esc)
     ```
     `scripts/force_theme.py` 三管齐下(CSS 拆媒体查询 + DOM 钉 `data-theme` + 接管 `matchMedia`
     与 `localStorage`),因为**被嵌页的主题多半是 JS 算出来的,只改 CSS 按不住** —— 见下方
     「被嵌页的深色优先陷阱」。
     **验证**:`chrome --headless --force-dark-mode --screenshot=…` 截一张,量 iframe 区平均亮度,
     应 >170/255。只在浅色系统上看是**验不出来**这个问题的。
     被嵌文件自身要**自包含**(自带 CSS/JS、数据内联,不引外链),srcdoc 里 `?query` / 拖拽 / `fetch`
     相对路径都不可用。
5. 用浏览器打开验收(见下 QA)。

## 放映交互(引擎已内置,无需额外代码)

- `←/→`、`空格`、`PageUp/Down` 翻页;`Home/End` 跳首尾;`F` 全屏;左右 `‹ ›` 按钮;触摸左右滑动。
- `#n` 深链直达第 n 页(如 `deck.html#5`),刷新 / 分享保持页码。
- **fragment 逐步显现**:给元素加 `class="fragment"`,同页内按 `→` 逐个点亮,全亮后再 `→` 才翻页。

## 铁律 / 常见坑(务必遵守)

- **配色跟随上一层,不跟随系统。** 演示文稿的配色是**设计决定**,没有哪份 PPT 的颜色是随观众机器的
  系统设置变的。deck 自己必须声明 `color-scheme: light`(`<meta>` + `:root` 两处都留,想更硬用
  `only light`),否则深色模式下 **auto-dark-mode 会把白色幻灯片整体压暗**成灰。模板已内置。
  **被嵌的演示同样要钉死 —— 而且光声明 `color-scheme` 往往不够,见下方「被嵌页的深色优先陷阱」。**
- **入场动画只动 `transform`、不要从 `opacity:0` 开始**。个别环境(如无头截图、动画时钟不推进)会让
  幻灯片卡在透明 → 看起来全黑。模板已改成只滑入。
- **固定设计尺寸 1280×720**,JS 等比缩放铺满视口(letterbox)。想改 16:10 / 4:3 就同时改 CSS 里
  `#stage` 宽高和 JS `fit()` 里的 `1280/720`。
- **自包含优先**:字体用系统字体栈;图表用纯 CSS/SVG(模板的 `bars` 即纯 CSS);要嵌的演示文件跟
  deck 放一起、相对路径引用,别引外链(离线 / 内网要能开)。
- **被嵌页的深色优先陷阱(声明 `color-scheme` 救不了,只改 CSS 也救不了)**:现成的可视化页常是
  **深色优先**写法,而且主题往往**由 JS 决定**,有两条独立来源:
  1. **CSS** —— 基础 `:root` 放深色变量,浅色只写在 `@media (prefers-color-scheme: light)` 里;
     观众系统处于深色时媒体查询**不匹配**,整块 iframe 变深。`color-scheme` 管不着 ——
     颜色是 CSS 变量给的,不是 UA 给的。
  2. **JS** —— `matchMedia("(prefers-color-scheme: dark)").matches` 跟随系统、
     `localStorage.getItem("…theme")` 跟随上次点过的按钮,然后把 `data-theme` 写回 `<html>`。
     **只拆 `@media` 完全按不住这条**:两个真实被嵌页在深色系统下实测 29/255、10/255,全黑。
  处置:用 `scripts/force_theme.py`,三管齐下 —— light 分支拆出媒体查询无条件生效、dark 分支整块删;
  在页面自己的脚本**之前**注入 shim 钉死 `data-theme`;接管 `matchMedia` 与 `Storage.getItem`,
  让页面自己那套逻辑算出来的结果就是 deck 指定的主题。
- **改被嵌页的 CSS 时,别用「找到关键字再往前 `rfind('@media')`」。** JS 里的
  `matchMedia("(prefers-color-scheme: dark)")` 不在任何 `@media` 里,`rfind` 会命中很靠前的一个真
  `@media`,把中间**整段代码**删掉 —— 实测把 122KB 的页削到 40KB、入口函数消失。而且它**不报错**,
  页面照样打开、只是空白,只有看截图才发现。正确做法:只在 `<style>` 块内解析,且只认真正的
  `@media` 前奏(`force_theme.py` 已经这么做)。
- **注入 shim 别用 `replace("</head>", …)`。** 很多手写的可视化页**根本没有 `</head>`**,
  这一句会静默无效。按 `<head …>` → `<html …>` → 文首 退化着注入。
- **iframe 内容各自独立**:它有自己的键盘 / 滚轮交互时,焦点在 iframe 内时方向键归它、不翻页
  (点幻灯片空白处夺回焦点即可)。

## QA(必做,当成找 bug)

在浏览器里逐页翻一遍,重点查:

- 深色系统主题下白底是否被压暗(漏了 color-scheme 的典型症状)。
- **深色系统下逐个 iframe 看有没有变深** —— 被嵌页深色优先时,只有这一步能发现。
  在浅色系统上是**验不出来**的,必须强制深色再量:
  ```bash
  # 注意是 file:/// URL,不是裸路径 —— 见下面第 2 条
  chrome --headless --disable-gpu --force-dark-mode --window-size=1280,720          --virtual-time-budget=6000 --screenshot=dk.png "file:///C:/tmp/deck.html#8"
  python -c "
  from PIL import Image, ImageStat
  im = Image.open('dk.png').convert('RGB')
  print(ImageStat.Stat(im.convert('L')).mean[0], sorted(im.getcolors(3*10**5), reverse=True)[0][1])"
  ```
  整页平均亮度应 **>170/255**;低于这个数就去逐个 iframe 找哪个没被钉住。
  **只截第 1 页不算验过** —— iframe 通常不在首页,要用 `#n` 逐个截有 iframe 的那几页。

  这一步有两个会让你**读到假结果**的坑,都踩过,症状一模一样(全黑),但和主题无关:
  1. **路径含中文** → Chrome `ERR_FILE_NOT_FOUND`。先拷成 ASCII 文件名再截。
  2. **`#n` 必须走 `file:///` URL**。传裸路径时 `deck.html#8` 会被当成**文件名的一部分**,
     同样是加载失败。
  两种情况你量到的都是 **Chrome 自己那张深色错误页**,会误判成"被嵌页没钉住"。
  **判别方法:看主色,不要只看均值** —— 错误页的主色是 `(32,33,36)` 且占满九成以上像素;
  真正渲染出来的幻灯片主色是接近白的底色。多页测出**完全相同**的亮度值,也是这个信号。
- 每页有没有溢出 / 被裁(内容超 1280×720 设计框)、字号对比是否够。
- iframe 演示能否加载、可交互是否正常、相对路径对不对。
- 方向键 / 空格 / Home / End / 全屏 / `#n` 深链是否都工作。
- 无头截图核对(可选):
  ```
  msedge --headless --disable-gpu --window-size=1280,720 --virtual-time-budget=4500 \
    --screenshot=out.png "file:///abs/path/deck.html#6"
  ```
  截图偏暗多半是上面两条铁律没遵守。

## 转 pptx(可编辑,不是截图)

```bash
node ~/.claude/skills/livedeck/scripts/html2pptx.js deck.html out.pptx
```

逐元素映射:文字 → `addText`、背景/边框 → `addShape`、`<table>` → `addTable`。产物里**没有 `<p:pic>`**
(除非 deck 里真有 `<img>` / `<svg>`),每个文本框在 PowerPoint 里双击就能改。

**为什么不能截图**:pptx 里只有两种东西 —— `<p:sp>`(形状 / 文本框,可编辑)和 `<p:pic>`(图片,不可编辑)。
截图、整页转 SVG、把 SVG 塞进 `addImage`,**统统落成 `<p:pic>`**。SVG 也不例外:PowerPoint 虽然能渲染 SVG,
但它在 OOXML 里仍然是图片;右键"转换为形状"是手动的、逐张的,还常打散字体。要可编辑就只能逐元素映射。

**坐标从哪来**:livedeck 用 grid / flex / 普通流,**源码里没有坐标**;OOXML 却要求每个 shape 都有绝对
x/y/w/h。所以先让无头 Chrome 排完版,再注入 `scripts/measure.js`,用 `getBoundingClientRect` +
`getComputedStyle` 把版量出来。好在设计框与 pptx 幅面是精确整数倍,换算零误差:

```
1280 / 10"    = 128     →  1 px = 1/128 inch
 720 / 5.625" = 128     →  字号 1 px = 0.5625 pt(72/128)
```

参数:`--slack=8`(多行文本的换行富余量,px)、`--font="微软雅黑"`(强制统一字体)、
`--svg=raster|embed`(内联 SVG 默认自己用 Chrome 栅格化成 3× PNG,见下)、`--chrome=<path>`、
`--dumpjson=m.json`(把量出来的中间数据落盘,排查时能直接看每个条目的 sel / 坐标 / runs)、
`--keep`(保留注入后的临时 HTML)。

### pptx 兼容子集(想要可编辑就得守)

deck 照常写,但**打算转 pptx 的页**避开下面这些 —— 它们在 OOXML 里没有对应物,只能丢掉或退化成图片:

| 别用 | 原因 / 替代 |
|---|---|
| `box-shadow`、`filter`、`backdrop-filter`、`mix-blend-mode` | 不映射,直接丢 |
| CSS 渐变背景(`linear-gradient` 等) | pptxgenjs 不支持渐变填充。转换器会**压平成各色标的平均色**并报 warning;真要渐变就放一张渐变图 |
| `::before` / `::after` 里放**文字** | 伪元素没有 DOM 节点,量不到。只有 flex 容器里**带固定宽高和背景的装饰条**(如 `.kicker::before`)被支持,其余记 warning 跳过 |
| 自定义 web font(`@font-face`) | pptx 不内嵌字体,到别人机器上会被替换;用系统字体栈 |
| `transform: rotate / skew` | 不映射,按未变换绘制(斜着的图章会变正),有 warning |
| `position:sticky`、滚动容器 | 幻灯片没有滚动这个概念 |
| **把文字画进 `<svg>` 里** | 整块变图片,改字得回头改 HTML。见下方降级三层 |

还有三条**必须知道**的:

- **被 `overflow:hidden` 遮住的溢出**,在 pptx 里会真的被裁掉。转换器已加出框检查,超出 1280×720 一律报
  warning —— 别忽略。
- **浏览器里只有一行的文字,转换时会被设成"禁止换行"**。因为 PowerPoint 的字体度量只要比 Chrome 宽一点点
  就会折出第二行,实测模板页脚正是这样被折断并切出页底的。副作用是那行字在 pptx 里可以越出自己的框,
  这是有意为之。
- **内联 `<svg>` 默认被栅格化成 3× PNG**,不是原样嵌入。原因是 pptxgenjs 在 Node 里没有栅格化能力,
  走 `addImage(*.svg)` 会按 OOXML 惯例占"PNG 兜底 + SVG"两个 part,却把**同一份 SVG 字节原样写进
  那个 `.png`** —— 产出一个声明 `image/png`、内容是 SVG 的 part,靠它渲染的阅读器会画歪。
  SVG 在 pptx 里横竖不可编辑,给一张画得对的 PNG 更划算。要矢量就传 `--svg=embed`,并接受这个坑。

### 动态内容的三层降级(转 pptx 前先想清楚)

1. **带文字的示意图(方框 + 箭头 + 标签)—— 别画 SVG,用 HTML 元素拼。**
   `div` + 背景色 + 边框 + 文字,转过去就是 `addShape` + `addText`,**在 pptx 里完全可编辑**。
   模板的 `bars`(纯 CSS 条形图)就是这么做的,零特殊处理就能转。
2. **mermaid / 外部渲染图 —— 只能是图片。**
   所以**凡是需要在 pptx 里改字的图,就不要用 mermaid**;否则改一行标签要重跑整条渲染链。
3. **iframe 里的活演示 / 视频 / 可交互组件 —— pptx 物理上装不下。**
   这正是 livedeck 存在的理由。转换器会降级成一个虚线占位框 + 文件名并报 warning;
   要么接受占位,要么自己截一张静帧放上去。

### 转完必须做的 QA

`html2pptx.js` 的第一遍产物基本不会全对,当成找 bug:

```bash
soffice --headless --convert-to pdf out.pptx --outdir .
pdftoppm -jpeg -r 150 out.pdf slide          # 或用 PyMuPDF 逐页出图
```

逐页比对 HTML 原件与 pptx 渲染,重点查:

- 文字有没有**多折一行**或被裁(字体度量差异的典型症状)。
- 卡片 / 色块的位置、圆角、单边强调条对不对。
- 表格列宽、表头底色、隔行浅底;**圆角表头在 pptx 里会变直角**,已知损失。
- **有没有整块内容凭空消失**(白字落白底最常见,来源是渐变背景;转换器现在会报 warning,但别只信它)。
- **文字有没有被色块盖住**(z 序问题,转换器已按 形状→图片→表格→文字 分层,异常设计仍可能翻车)。
- 控制台那几条 warning 一条条看完,别跳过。
- 截 HTML 那一侧做对比时注意:`.fragment` 默认隐藏,`#n` 深链截出来会缺内容;
  pptx 一律按**全部显现**导出,这不是 bug。

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
