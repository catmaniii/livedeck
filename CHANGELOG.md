# Changelog

本文件记录 livedeck 的显著变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
仓库尚未打 tag,版本号按发布日期归档。

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
