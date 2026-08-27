# Changelog

本文件记录 livedeck 的显著变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
仓库尚未打 tag,版本号按发布日期归档。

## [0.2.3] — 2026-08-28

### 新增

- **`scripts/force_theme.py`** —— 把被嵌页的配色钉死成上一层指定的主题,替代 0.2.2 写在文档里的
  内联 `force_light()`。上一版只处理 CSS,**按不住** —— 被嵌页的主题多半是 **JS 算出来的**:
  `matchMedia("(prefers-color-scheme: dark)").matches` 跟随系统、
  `localStorage.getItem("…theme")` 跟随上次点过的按钮,然后把 `data-theme` 写回 `<html>`。
  两个真实被嵌页在深色系统下实测 **29/255、10/255** —— 拆完 `@media` 照样全黑。
  现在三管齐下:① CSS 拆媒体查询 ② 在页面自己的脚本**之前**注入 shim 钉 `data-theme`
  ③ 接管 `matchMedia` 与 `Storage.prototype.getItem`,让页面自己那套逻辑算出来的**就是**目标主题。
  `theme` 只接受 `light` / `dark`,非法值直接抛错 —— 主题是上一层的决定,不留"auto"这个口子。

### 修复

- **`force_light()` 会删掉被嵌页的大段代码(数据丢失级,而且不报错)。**
  旧写法是「找到 `prefers-color-scheme`,再往前 `rfind('@media')`」。JS 里的
  `matchMedia("(prefers-color-scheme: dark)")` 并不在任何 `@media` 里,`rfind` 于是命中很靠前的
  一个**真** `@media`,把中间整段一起删掉 —— 实测把一个 122KB 的可视化页削到 **40KB**、
  入口函数直接消失。页面还能打开、只是空白,所以只有看截图才会发现。
  现在只在 `<style>` 块内解析,且只认真正的 `@media` 前奏(`@media` 到其后第一个 `{`)。

- **注入点不能用 `replace("</head>", …)`** —— 很多手写的可视化页**根本没有 `</head>`**,
  这一句静默无效。改为按 `<head …>` → `<html …>` → 文首 退化注入。

- 文档里的 `sys.path.insert(0, "~/...")` 改为 `os.path.expanduser` —— Python 不展开 `~`,
  照抄会 import 失败。

### 文档

- 「被嵌页的深色优先陷阱」拆成 **CSS / JS 两条独立来源**,写明只堵 CSS 为什么不够。
- 新增两条铁律:别用 `rfind('@media')`、别用 `replace("</head>")`。
- QA 的亮度核验改成可直接执行的命令,并写明**只截第 1 页不算验过** —— iframe 通常不在首页,
  要用 `#n` 逐个截有 iframe 的那几页。
- **补两个会读到假结果的坑**(都踩过,症状都是全黑,但都与主题无关):① 路径含中文 → Chrome
  `ERR_FILE_NOT_FOUND`;② `#n` 必须走 `file:///` URL,传裸路径时 `deck.html#8` 会被当成
  **文件名的一部分**,同样加载失败。两种情况量到的都是 **Chrome 自己那张深色错误页**。
  给出判别法:**看主色不要只看均值** —— 错误页主色 `(32,33,36)` 占九成以上像素;
  多页测出**完全相同**的亮度值也是这个信号。

验证:对 20 个真实被嵌页(1.5KB–290KB,含深色优先、JS 定主题、无 `</head>` 三类)跑
`force_theme`,与项目内已实战验证的同款实现**逐字节一致**;`reasoning-graph.html`
122132 → 123679 字节(增,不再是被削成 40KB)。
另在**强制深色**下对一份 19 页真实 deck 逐页截图:首页与三个含 iframe 的页面亮度
247 / 239 / 237 / 242,主色均为近白底 —— 被嵌页确实被钉住了。

## [0.2.2] — 2026-08-27

### 变更

- **铁律改口:配色跟随上一层,不跟随系统。**
  演示文稿的配色是**设计决定** —— 没有哪份 PPT 的颜色是随观众机器的系统设置变的。
  原来只写了"deck 自己声明 `color-scheme: light`",不够。

- **新增「被嵌页的深色优先陷阱」**(真实踩到):
  很多现成的可视化页是**深色优先**写法 —— 基础 `:root` 放深色变量,浅色只写在
  `@media (prefers-color-scheme: light)` 里。观众系统处于深色时媒体查询**不匹配**,
  整块 iframe 变深,和四周的白色幻灯片撞在一起。
  **声明 `color-scheme` 救不了** —— 颜色是 CSS 变量给的,不是 UA 给的。
  处置写进「怎么做」第 4 条的内联脚本:light 分支拆出媒体查询外壳无条件生效
  (它在深色基底之后,按源码顺序胜出),dark 分支整块删。

- **QA 清单加一条**:深色系统下逐个 iframe 看有没有变深。
  验证方式 `chrome --headless --force-dark-mode` 截图后量 iframe 区平均亮度,应 >170/255。
  **只在浅色系统上看是验不出来这个问题的** —— 这正是它一直没被发现的原因。

文档里那段 `force_light()` 已原样抽出执行验证:处理后 `prefers-color-scheme` 归零、
浅色变量保留,强制深色系统下渲染亮度 237/255。

## [0.2.1] — 2026-08-26

拿一份真实的 15 页 deck(含 5 个内联 `<svg>`、4 个 iframe、4 张表)跑 `html2pptx.js`,
逐页与 HTML 原件比对。改完:`p:sp=250  p:pic=5  p:graphicFrame=4  a:t=485`。
下面每一条都是这轮比对撞出来的,自带模板测不出来。

### 修复

- **srcdoc 里的 `</body>` 让注入落进 iframe**(整份 deck 直接转不了)。
  交付形态会把被嵌演示内联进 `srcdoc`,那些 HTML 自带 `</body>`,在属性里是字面文本 ——
  实测该 deck 有 4 个 `</body>`,注入第一个等于把量版脚本塞进了第一个 iframe。
  改为注入**最后一个**。

- **行内元素的文字被抽两遍,叠在同一位置糊成一团**。
  `<p>要同时满足<b>结论经过验证</b>…</p>`:父段落的 runs 已经含 `<b>`,walk 又下钻到 `<b>`
  单独出一个文本框。加 `consumed` 集合,文字被祖先收走的元素不再自己出框。
  实测该 deck 文本框数 248 → 136。

- **z 序错误:行内高亮背景盖住文字**。
  文档序里 `<span>` 的背景排在父段落文字**之后**,照原序写就把已画好的字盖掉
  (HTML 里背景永远在文字之下)。改为分层输出:形状 → 图片 → 表格/占位 → 文字,层内保持文档序。

- **渐变背景静默丢失,导致白字落白底、整块隐形**。
  `background:linear-gradient(...)` 时 `backgroundColor` 是透明,不出形状;该 deck 的两条深色
  面板标题栏因此整条消失。改为**压平成各色标的平均色**并报 warning。

- **内联 `<svg>` 的 PNG 兜底是假的**。pptxgenjs 在 Node 里没有栅格化能力,走 `addImage(*.svg)`
  时会按 OOXML 惯例占"PNG 兜底 + SVG"两个 part,却把**同一份 SVG 字节原样写进那个 `.png`**
  —— 实测两份文件字节完全相同、都以 `<svg viewBox=` 开头,等于交出一个声明 `image/png`、
  内容是 SVG 的 part。靠它渲染的阅读器会画歪(LibreOffice 实测流程图叠字)。
  改为**自己用 Chrome 栅格化成 3× 真 PNG**;想保留矢量传 `--svg=embed`。

- **表格单元格被压成单一样式**,格内彩色 ✓/✗ 全变同色。改用递归 runs,单元格支持富文本。

### 新增

- `--svg=raster|embed`(默认 `raster`)。
- `--dumpjson=<file>` —— 把量出来的中间数据落盘,能直接看到每个条目的 `sel` / 坐标 / runs,排查用。
- `transform` 告警 —— `rotate`/`skew` 不映射,是静默差异(斜着的图章在 pptx 里会变正),现在会报出来。
- warning 统一补页号(此前 `shapeOf` / `pseudoOf` 报的那几条不知道自己在第几页)。

### 已知边界(新增)

- `transform: rotate / skew` 不映射,按未变换绘制,有告警。
- 渐变一律压平为单色,有告警。
- SVG 默认栅格化,失去矢量缩放;要矢量就得接受上面那个假 PNG 兜底。

## [0.2.0] — 2026-08-26

把 HTML deck 接上了 `.pptx` 这条出口。在此之前 livedeck 的 HTML 是**终态产物**,想要 `.pptx` 只能另起炉灶;
现在它成了可以继续往下走的**中间态**。

### 新增

- **`scripts/html2pptx.js`** —— 把 deck 转成**文本框可编辑**的 `.pptx`。

  ```bash
  node scripts/html2pptx.js deck.html out.pptx
  ```

  逐元素映射:文字 → `addText`、背景/边框 → `addShape`、`<table>` → `addTable`。
  拿自带模板实测(5 页):`p:sp=54  p:pic=0  p:graphicFrame=1  a:t=39` —— **产物里没有任何图片**,
  每个文本框在 PowerPoint 里双击就能改。

  参数:`--slack=8`(多行文本换行富余量,px)、`--font="微软雅黑"`(强制统一字体)、
  `--chrome=<path>`、`--keep`(保留注入后的临时 HTML 便于排查)。

- **`scripts/measure.js`** —— 注入页面的量版脚本,由上面那个调用。
  用无头 Chrome 排完版后,靠 `getBoundingClientRect` + `getComputedStyle` 取出每个元素的真实坐标。
  会先中和放映引擎的干扰:展开全部 `.slide`、点亮全部 `.fragment`、去掉 `#stage` 的 `transform`、
  停掉动画与过渡、隐藏 HUD。

- **`SKILL.md` 新增「转 pptx」一节** —— 含 pptx 兼容子集、两条静默变形的坑、动态内容三层降级、转后 QA。

- 本 CHANGELOG。

### 设计要点(为什么是这个做法)

- **不截图**。pptx 里只有两种东西:`<p:sp>`(形状/文本框,可编辑)和 `<p:pic>`(图片,不可编辑)。
  截图、整页转 SVG、把 SVG 塞进 `addImage`,统统落成 `<p:pic>`。SVG 也不例外 —— PowerPoint 虽能渲染 SVG,
  但它在 OOXML 里仍是图片,右键"转换为形状"是手动的、逐张的,还常打散字体。要可编辑就只能逐元素映射。

- **必须靠浏览器量坐标**。livedeck 用 grid / flex / 普通流,**源码里没有坐标**;OOXML 却要求每个 shape
  都有绝对 x/y/w/h。坐标只在浏览器排完版之后才存在。

- **单位零误差**。设计框与 pptx 幅面恰好是整数倍:

  ```
  1280 / 10"    = 128     →  1 px = 1/128 inch
   720 / 5.625" = 128     →  字号 1 px = 0.5625 pt(72/128)
  ```

- **不依赖 pptx skill 的任何脚本**。只用 Chrome/Edge + `npm i -g pptxgenjs`。
  pptx skill 是第三方 skill,改它的文件会在下次更新时被覆盖。

- **零 npm 新增依赖**。量版走 `chrome --headless --dump-dom`,不引 puppeteer。

### 已知边界

- **iframe 里的活演示 / 视频 / 可交互组件,pptx 物理上装不下** —— 这正是 livedeck 存在的理由。
  转换器降级成虚线占位框 + 文件名,并报 warning。
- **内联 `<svg>` 只能作为图片嵌入**;若其中含文字,改字要回头改 HTML(转换器会专门提示这一点)。
- **圆角表头在 pptx 里会变直角**(OOXML 表格不支持单元格圆角)。
- **`::before` / `::after`** 只支持 flex 容器里带固定宽高和背景的装饰条(如 `.kicker::before`),
  其余记 warning 跳过;伪元素里放文字不支持。
- `box-shadow` / `filter` / CSS 渐变 / `transform: rotate` 不映射。

### 开发中实测撞出并修掉的问题

- **JSON 解析失败**:`measure.js` 注释里写了输出节点的字面标签,自己的源码被 `--dump-dom` 一起吐出来,
  解析端正则先匹配到注释。改标记名 + 取最后一处匹配。
- **找不到 pptxgenjs**:Node 18.20+ 起 spawn 一个 `.cmd` 必须显式 `shell:true`,否则 `npm root -g`
  直接 EINVAL。改为多路探测,不再依赖 npm 可执行。
- **页脚多折一行并被切出页底**:字体栈第一个是 Segoe UI,但汉字在浏览器里实际走的是后面的 CJK 字体,
  只取第一个就按错的度量算宽度。改为**按 run 的实际文字**选字体;并且**浏览器里只有一行的文字一律禁止换行**
  —— PowerPoint 度量只要宽一点点就会折出第二行,调 slack 治标不治本。
- **SVG 上方凭空多出一行字**:`<svg>` 的 computed display 是 `inline`,被当成父容器的内联文本又抽了一遍。
  加了替换元素排除表(svg / img / iframe / canvas / video / object / embed / 表单控件)。
- **图片被压扁**:CSS `object-fit` 没有映射到 pptxgenjs 的 `sizing`。

### 变更

- `README.md`:新增「转可编辑 pptx」一节;文件清单补上 `scripts/`。
- `SKILL.md` frontmatter 与「边界」段:此前写的"需要真正的 .pptx 产物时直接用 pptx skill"已不完整。
  现在的说法是 —— **从零**做 `.pptx` 仍用 pptx skill 的 `pptxgenjs`;**已有 HTML deck** 想要可编辑
  `.pptx`,用本 skill 的 `html2pptx.js`。

## [0.1.0] — 2026-07-27

首个版本。

### 新增

- `SKILL.md` —— 何时用 / 怎么做 / 铁律 / QA。
- `html-deck-template.html` —— 1280×720 固定设计框、JS 等比缩放(letterbox)、内置放映引擎与 HUD、
  纯 CSS 排版类(`kicker` / `card` / `cols` / `table.grid` / `bars` / `chip` / `demo-wrap`)。
- 放映交互:方向键 / 空格 / PageUp-Down 翻页,Home/End 跳首尾,`F` 全屏,`#n` 深链,
  `.fragment` 逐步显现,触摸滑动。
- 两条写进模板的铁律:必须声明 `color-scheme: light`(否则深色模式会把白底幻灯片整体压暗);
  入场动画只动 `transform`、不要从 `opacity:0` 开始(否则无头截图可能卡在全透明)。
- 内嵌活演示的两种嵌法:开发期 `<iframe src>`,交付期转成内联 `srcdoc` 做成自包含单文件。

### 变更

- 两次修正与官方 pptx skill 的关系描述,最终定为**配套扩展层、非独立自足**。
