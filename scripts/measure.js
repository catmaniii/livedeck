/* measure.js —— 注入到 deck 页面里,把浏览器排好的版量成结构化数据。
 *
 * 为什么必须靠浏览器量:livedeck 的 HTML 用的是 grid/flex/普通流,源码里**没有坐标**;
 * 而 OOXML 要求每个 shape 都有绝对 x/y/w/h。坐标只在浏览器排完版后才存在。
 * 量完再交给 pptxgenjs 生成 <p:sp>/<a:t>,才能得到**可编辑**的 pptx;
 * 截图只会得到 <p:pic>,一律不可编辑。
 *
 * 输出:一个 id 为 __H2P__ 的 pre 节点,内含 JSON;坐标单位 = 设计框 px(1280×720)。
 * 注意:本文件会被整体注入页面,dump 出来的 DOM 里含有它的源码 ——
 * 所以注释里**不能出现该 pre 的字面标签**,否则解析端的正则会先匹配到注释。
 * 由 html2pptx.js 通过 chrome --dump-dom 取回。
 */
(function () {
  'use strict';

  var DESIGN_W = 1280, DESIGN_H = 720;
  var EPS = 0.01;

  /* ---------- 0. 把页面掰成"可测量"状态 ---------- */
  // 放映引擎只让 .current 可见、#stage 带 scale、fragment 初始 opacity:0、还有入场动画。
  // 这些都会让 getBoundingClientRect 量不到或量错,先全部中和掉。
  var css = document.createElement('style');
  css.textContent = [
    '*{animation:none !important;transition:none !important}',
    '#stage{left:0 !important;top:0 !important;transform:none !important}',
    '.slide{display:block !important;position:relative !important;inset:auto !important;' +
      'width:' + DESIGN_W + 'px !important;height:' + DESIGN_H + 'px !important;overflow:visible !important}',
    '.fragment{opacity:1 !important;transform:none !important}',
    '#hud,#counter,#hint,.navbtn{display:none !important}'
  ].join('\n');
  document.head.appendChild(css);
  // 逐张改成 relative 后各页纵向堆叠,互不影响内部排版;每页坐标再各自减去自身 rect 原点。

  /* ---------- 1. 小工具 ---------- */
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  function rgb(str) {
    // "rgb(r, g, b)" / "rgba(r, g, b, a)" -> {hex, a}
    var m = /rgba?\(([^)]+)\)/.exec(str || '');
    if (!m) return { hex: null, a: 0 };
    var p = m[1].split(',').map(function (x) { return parseFloat(x); });
    var a = p.length > 3 ? p[3] : 1;
    var hex = [p[0], p[1], p[2]].map(function (c) {
      return ('0' + Math.round(c).toString(16)).slice(-2);
    }).join('').toUpperCase();
    return { hex: hex, a: a };
  }

  // pptxgenjs 不支持渐变填充。不处理的话:不出形状 → 白字落白底 → **整条隐形**,
  // 而且毫无提示。压平成各色标的平均色,并报 warning 让人自己决定要不要改设计。
  function flattenGradient(bgImage) {
    if (!bgImage || bgImage.indexOf('gradient(') < 0) return null;
    var stops = bgImage.match(/rgba?\([^)]+\)/g);
    if (!stops || !stops.length) return null;
    var r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i < stops.length; i++) {
      var p = stops[i].replace(/rgba?\(|\)/g, '').split(',').map(parseFloat);
      var a = p.length > 3 ? p[3] : 1;
      if (a <= EPS) continue;           // 透明色标不参与平均
      r += p[0]; g += p[1]; b += p[2]; n++;
    }
    if (!n) return null;
    return [r / n, g / n, b / n].map(function (c) {
      return ('0' + Math.round(c).toString(16)).slice(-2);
    }).join('').toUpperCase();
  }

  function union(a, b) {
    if (!b || (b.width <= 0 && b.height <= 0)) return a;
    if (!a) return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    return {
      left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom)
    };
  }

  function visible(el, cs) {
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (num(cs.opacity) < 0.02) return false;
    return true;
  }

  var INLINE = { inline: 1, 'inline-block': 1, 'inline-flex': 1, 'inline-grid': 1 };

  // 替换元素:computed display 也可能是 inline(<svg> 就是),但它们的 textContent
  // **不是**父容器的文字。不排除掉,SVG 里的 <text> 会被当成父元素的内联文本再抽一遍,
  // 于是图的上方凭空多出一行字。
  var REPLACED = { SVG: 1, IMG: 1, IFRAME: 1, CANVAS: 1, VIDEO: 1, OBJECT: 1, EMBED: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1 };

  function applyTransform(text, cs) {
    switch (cs.textTransform) {
      case 'uppercase': return text.toUpperCase();
      case 'lowercase': return text.toLowerCase();
      case 'capitalize': return text.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      default: return text;
    }
  }

  /* ---------- 2. 文本:量"字"的真实外框,不是容器外框 ---------- */
  // 关键点。.card h3 里是 <span class="dot"> + 文字,若拿 h3 的 rect 当文本框,
  // 文字会从 h3 左边缘开始 → 压在圆点上。用 Range 量文本节点就能拿到 flex gap 之后的真实起点。
  function textGeom(el) {
    var r = null, has = false;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) {
        if (!n.nodeValue.replace(/\s/g, '')) continue;
      } else if (n.nodeType === 1) {
        if (REPLACED[n.tagName.toUpperCase()]) continue;
        var cs = getComputedStyle(n);
        if (!INLINE[cs.display]) continue;          // 块级子元素单独成条目
        if (!n.textContent.replace(/\s/g, '')) continue; // 例如 .dot,纯装饰,交给 shape 分支
      } else continue;
      var rg = document.createRange();
      rg.selectNode(n);
      var rects = rg.getClientRects();
      for (var k = 0; k < rects.length; k++) r = union(r, rects[k]);
      rg.detach && rg.detach();
      has = true;
    }
    return has ? r : null;
  }

  // 富文本:递归收集 run。
  // 递归而非只看一层,是为了 <b><span style="color:..">x</span></b> 这种嵌套不丢样式;
  // 表格单元格尤其需要(格内彩色 ✓/✗ 全靠它)。
  function collectRuns(el, opts) {
    opts = opts || {};
    var runs = [];
    function push(text, cs, br) {
      text = applyTransform(text.replace(/\s+/g, ' '), cs);
      if (!text.replace(/\s/g, '') && !br) return;
      var c = rgb(cs.color);
      runs.push({
        text: text,
        bold: num(cs.fontWeight) >= 600 || cs.fontWeight === 'bold',
        italic: cs.fontStyle === 'italic',
        color: c.hex,
        size: num(cs.fontSize),
        font: cs.fontFamily,
        breakLine: !!br
      });
    }
    (function rec(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var n = node.childNodes[i];
        if (n.nodeType === 3) { push(n.nodeValue, getComputedStyle(node), false); continue; }
        if (n.nodeType !== 1) continue;
        if (REPLACED[n.tagName.toUpperCase()]) continue;
        if (n.tagName === 'BR') {
          if (runs.length) runs[runs.length - 1].breakLine = true; else push('', getComputedStyle(node), true);
          continue;
        }
        var cs = getComputedStyle(n);
        if (!visible(n, cs)) continue;
        var block = !INLINE[cs.display];
        // 常规文本条目:块级子元素自己会成为独立条目,这里不收
        if (block && !opts.acrossBlocks) continue;
        if (block && runs.length) runs[runs.length - 1].breakLine = true;
        rec(n);
      }
    })(el);
    if (runs.length) {
      runs[0].text = runs[0].text.replace(/^\s+/, '');
      runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
    }
    return runs.filter(function (r) { return r.text.length || r.breakLine; });
  }

  // 一个元素的文字一旦被祖先的 runs 收走,它自己就不能再出一个文本框 ——
  // 否则 <p>要同时满足<b>结论经过验证</b>…</p> 会出两个框叠在同一位置,字糊成一团。
  function markConsumed(el, set) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType !== 1) continue;
      if (REPLACED[n.tagName.toUpperCase()]) continue;
      var cs = getComputedStyle(n);
      if (!INLINE[cs.display]) continue;
      if (!n.textContent.replace(/\s/g, '')) continue;
      set.add(n);
      var all = n.getElementsByTagName('*');
      for (var k = 0; k < all.length; k++) set.add(all[k]);
    }
  }

  /* ---------- 3. 形状:背景 / 边框 / 单边强调条 ---------- */
  function shapeOf(el, cs, rect, origin, warn) {
    var out = [];
    var bg = rgb(cs.backgroundColor);
    var bw = {
      t: num(cs.borderTopWidth), r: num(cs.borderRightWidth),
      b: num(cs.borderBottomWidth), l: num(cs.borderLeftWidth)
    };
    var bc = {
      t: rgb(cs.borderTopColor), r: rgb(cs.borderRightColor),
      b: rgb(cs.borderBottomColor), l: rgb(cs.borderLeftColor)
    };
    var sides = ['t', 'r', 'b', 'l'].filter(function (s) { return bw[s] > 0.4 && bc[s].a > EPS; });
    var hasBg = bg.a > EPS;

    var grad = flattenGradient(cs.backgroundImage);
    if (grad) {
      bg = { hex: grad, a: 1 };
      hasBg = true;
      warn.push(sel(el) + ' 的渐变背景已压平为单色 #' + grad + '(pptx 不支持渐变填充)');
    }

    if (!hasBg && !sides.length) return out;

    var radius = Math.max(
      num(cs.borderTopLeftRadius), num(cs.borderTopRightRadius),
      num(cs.borderBottomLeftRadius), num(cs.borderBottomRightRadius)
    );
    var w = rect.width, h = rect.height;
    var kind = 'rect';
    if (radius >= Math.min(w, h) / 2 - 0.5) {
      // 圆角吃满短边:近正方 -> 椭圆(.dot);细长 -> 胶囊(.chip)
      kind = (Math.abs(w - h) <= 1.5) ? 'ellipse' : 'roundRect';
    } else if (radius > 0.5) {
      kind = 'roundRect';
    }

    // 四边等宽等色 -> 当作一圈 line;否则取最细的一边作 line,其余更粗的边单独出强调条
    var uniform = sides.length === 4 &&
      bw.t === bw.r && bw.r === bw.b && bw.b === bw.l &&
      bc.t.hex === bc.r.hex && bc.r.hex === bc.b.hex && bc.b.hex === bc.l.hex;
    var line = null;
    if (sides.length) {
      var thin = sides.reduce(function (m, s) { return bw[s] < bw[m] ? s : m; }, sides[0]);
      if (uniform || sides.length >= 3) line = { color: bc[thin].hex, width: bw[thin] };
    }

    out.push({
      kind: 'shape', shape: kind,
      x: rect.left - origin.left, y: rect.top - origin.top, w: w, h: h,
      fill: hasBg ? bg.hex : null,
      fillAlpha: hasBg ? bg.a : 0,
      line: line,
      radius: Math.min(radius, Math.min(w, h) / 2),
      sel: sel(el)
    });

    // 单边强调条(.card 的 border-left:4px 就是这一类;pptx 里得单独画一条矩形)
    var base = line ? line.width : 0;
    ['t', 'r', 'b', 'l'].forEach(function (s) {
      if (bw[s] <= base + 0.4 || bc[s].a <= EPS) return;
      var b = { x: rect.left - origin.left, y: rect.top - origin.top, w: w, h: h };
      if (s === 't') b.h = bw.t;
      if (s === 'b') { b.y = b.y + h - bw.b; b.h = bw.b; }
      if (s === 'l') b.w = bw.l;
      if (s === 'r') { b.x = b.x + w - bw.r; b.w = bw.r; }
      out.push({
        kind: 'shape', shape: 'rect', x: b.x, y: b.y, w: b.w, h: b.h,
        fill: bc[s].hex, fillAlpha: bc[s].a, line: null, radius: 0,
        sel: sel(el) + '::border-' + s
      });
    });
    return out;
  }

  /* ---------- 4. 伪元素(::before/::after) ---------- */
  // 伪元素没有 DOM 节点,量不到 rect。只处理最常见的一类:flex 容器里带固定宽高和背景的装饰条
  // (模板的 .kicker::before 就是),按 flex 主轴起点 + 交叉轴居中推算位置。其余记 warning。
  function pseudoOf(el, cs, rect, origin, warn) {
    var out = [];
    ['::before', '::after'].forEach(function (which) {
      var ps;
      try { ps = getComputedStyle(el, which); } catch (e) { return; }
      if (!ps || ps.content === 'none' || ps.content === 'normal') return;
      var bg = rgb(ps.backgroundColor);
      var pw = num(ps.width), ph = num(ps.height);
      if (bg.a <= EPS || pw <= 0 || ph <= 0) {
        if (ps.content !== 'none' && ps.content !== '""' && ps.content !== "''") {
          warn.push(sel(el) + ' 的 ' + which + ' 无法转换(非纯装饰或无固定尺寸)');
        }
        return;
      }
      if (cs.display.indexOf('flex') < 0) {
        warn.push(sel(el) + ' 的 ' + which + ' 只在 flex 容器里支持定位,已跳过');
        return;
      }
      var padL = num(cs.paddingLeft), padT = num(cs.paddingTop), padB = num(cs.paddingBottom);
      var x = rect.left - origin.left + padL;
      var y = rect.top - origin.top + padT + (rect.height - padT - padB - ph) / 2;
      var r = Math.max(num(ps.borderTopLeftRadius), num(ps.borderBottomLeftRadius));
      out.push({
        kind: 'shape',
        shape: r >= Math.min(pw, ph) / 2 - 0.5 ? (Math.abs(pw - ph) <= 1.5 ? 'ellipse' : 'roundRect') : (r > 0.5 ? 'roundRect' : 'rect'),
        x: x, y: y, w: pw, h: ph,
        fill: bg.hex, fillAlpha: bg.a, line: null,
        radius: Math.min(r, Math.min(pw, ph) / 2),
        sel: sel(el) + which
      });
    });
    return out;
  }

  /* ---------- 5. 表格 ---------- */
  function tableOf(tbl, origin) {
    var rect = tbl.getBoundingClientRect();
    var rows = [], colW = null;
    var trs = tbl.querySelectorAll('tr');
    for (var i = 0; i < trs.length; i++) {
      var cells = trs[i].children, row = [];
      if (!colW) {
        colW = [];
        for (var c = 0; c < cells.length; c++) colW.push(cells[c].getBoundingClientRect().width);
      }
      for (var j = 0; j < cells.length; j++) {
        var td = cells[j], cs = getComputedStyle(td);
        var bg = rgb(cs.backgroundColor);
        if (bg.a <= EPS) {                       // 单元格透明时取行底色(nth-child(even))
          var rs = getComputedStyle(trs[i]);
          bg = rgb(rs.backgroundColor);
        }
        var col = rgb(cs.color);
        row.push({
          runs: collectRuns(td, { acrossBlocks: true }),   // 格内彩色 ✓/✗ 靠这个保住
          text: applyTransform(td.textContent.replace(/\s+/g, ' ').trim(), cs),
          bold: num(cs.fontWeight) >= 600 || cs.fontWeight === 'bold',
          color: col.hex,
          size: num(cs.fontSize),
          font: cs.fontFamily,
          fill: bg.a > EPS ? bg.hex : null,
          align: cs.textAlign === 'start' ? 'left' : cs.textAlign,
          colspan: td.colSpan > 1 ? td.colSpan : undefined,
          rowspan: td.rowSpan > 1 ? td.rowSpan : undefined
        });
      }
      rows.push({
        cells: row,
        h: trs[i].getBoundingClientRect().height
      });
    }
    var bcs = getComputedStyle(tbl.querySelector('td,th') || tbl);
    return {
      kind: 'table',
      x: rect.left - origin.left, y: rect.top - origin.top,
      w: rect.width, h: rect.height,
      colW: colW || [], rows: rows,
      padX: num(bcs.paddingLeft), padY: num(bcs.paddingTop),
      border: (function () { var b = rgb(bcs.borderBottomColor); return b.a > EPS && num(bcs.borderBottomWidth) > 0.4 ? { color: b.hex, width: num(bcs.borderBottomWidth) } : null; })(),
      sel: sel(tbl)
    };
  }

  /* ---------- 6. 选择器(只为报错好读) ---------- */
  function sel(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList.length) s += '.' + [].slice.call(el.classList).join('.');
    return s;
  }

  /* ---------- 7. 主遍历 ---------- */
  function walkSlide(slide, si) {
    var origin = slide.getBoundingClientRect();
    var items = [], warn = [];
    var consumed = new Set();   // 文字已被祖先 runs 收走的元素

    (function walk(el) {
      var cs = getComputedStyle(el);
      if (!visible(el, cs)) return;
      var rect = el.getBoundingClientRect();

      if (el.tagName === 'TABLE') { items.push(tableOf(el, origin)); return; }

      if (el.tagName === 'IFRAME') {
        items.push({
          kind: 'unsupported', reason: 'iframe',
          x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height,
          sel: sel(el), src: el.getAttribute('src') || '(srcdoc 内联)'
        });
        warn.push('第 ' + (si + 1) + ' 页有 iframe 活演示 —— pptx 装不下,已降级为占位框');
        return;
      }

      if (el.tagName === 'IMG') {
        items.push({
          kind: 'image', src: el.getAttribute('src'),
          x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height,
          fit: cs.objectFit,      // cover/contain 不带过去的话,非等比的框会把图压扁
          sel: sel(el)
        });
        return;
      }

      if (el.tagName.toLowerCase() === 'svg') {
        items.push({
          kind: 'svg', markup: el.outerHTML,
          x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height,
          sel: sel(el)
        });
        warn.push('第 ' + (si + 1) + ' 页的内联 <svg> 只能作为图片嵌入,pptx 里不可编辑' +
          (el.textContent.replace(/\s/g, '') ? ' —— 且其中含文字,改字需回改 HTML' : ''));
        return;
      }

      // transform 不映射,而且是静默差异 —— 图章、斜标签在 pptx 里会变正
      if (cs.transform && cs.transform !== 'none' && el.textContent.replace(/\s/g, '')) {
        warn.push(sel(el) + ' 带 transform(' + cs.transform.slice(0, 28) + '…),pptx 不映射,已按未变换绘制');
      }

      // 背景 / 边框 / 强调条 / 伪元素
      if (rect.width > 0 && rect.height > 0) {
        shapeOf(el, cs, rect, origin, warn).forEach(function (s) { items.push(s); });
        pseudoOf(el, cs, rect, origin, warn).forEach(function (s) { items.push(s); });
      }

      // 文本(量的是字的真实外框)
      var tg = consumed.has(el) ? null : textGeom(el);
      if (tg) {
        var runs = collectRuns(el);
        if (runs.length) {
          markConsumed(el, consumed);
          // 内容盒左右边界。文本框宽度不能只取"字的外框":一段会换行的文字,
          // 字外框 = 最宽那一行 ≤ 容器宽,直接拿去当 pptx 文本框会**比 HTML 更早换行**,
          // 行数变多就往下溢出。所以块级元素向右补齐到内容盒右边缘。
          var cbL = rect.left + num(cs.borderLeftWidth) + num(cs.paddingLeft);
          var cbR = rect.right - num(cs.borderRightWidth) - num(cs.paddingRight);
          items.push({
            kind: 'text',
            x: tg.left - origin.left, y: tg.top - origin.top,
            w: tg.right - tg.left, h: tg.bottom - tg.top,
            cbL: cbL - origin.left, cbR: cbR - origin.left,
            block: !INLINE[cs.display],
            runs: runs,
            align: (cs.textAlign === 'start' || cs.textAlign === 'justify') ? 'left' : cs.textAlign,
            lineHeight: cs.lineHeight === 'normal' ? num(cs.fontSize) * 1.2 : num(cs.lineHeight),
            charSpacing: cs.letterSpacing === 'normal' ? 0 : num(cs.letterSpacing),
            sel: sel(el)
          });
        }
      }

      for (var i = 0; i < el.children.length; i++) walk(el.children[i]);
    })(slide);

    // 出框检查(pptx 会真的裁掉,HTML 里被 overflow:hidden 遮住的问题在这里必须暴露)
    items.forEach(function (it) {
      if (it.kind === 'unsupported') return;
      if (it.x < -0.5 || it.y < -0.5 ||
        it.x + it.w > DESIGN_W + 0.5 || it.y + it.h > DESIGN_H + 0.5) {
        warn.push('第 ' + (si + 1) + ' 页 ' + it.sel + ' 超出 ' + DESIGN_W + '×' + DESIGN_H +
          ' 设计框(x=' + Math.round(it.x) + ' y=' + Math.round(it.y) +
          ' w=' + Math.round(it.w) + ' h=' + Math.round(it.h) + ')');
      }
    });

    // 统一补页号:shapeOf / pseudoOf 里报的 warning 不知道自己在第几页
    warn = warn.map(function (w) {
      return w.indexOf('第 ') === 0 ? w : '第 ' + (si + 1) + ' 页 ' + w;
    });

    var sbg = rgb(getComputedStyle(slide).backgroundColor);
    return { index: si, bg: sbg.a > EPS ? sbg.hex : 'FFFFFF', items: items, warnings: warn };
  }

  var slides = [].slice.call(document.querySelectorAll('#stage .slide'));
  var out = {
    designW: DESIGN_W, designH: DESIGN_H,
    title: (document.title || '').trim(),
    slides: slides.map(walkSlide)
  };

  var pre = document.createElement('pre');
  pre.id = '__H2P__';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
})();
