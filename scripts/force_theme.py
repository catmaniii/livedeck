# -*- coding: utf-8 -*-
"""把被嵌 HTML 的配色**钉死**成上一层(deck)指定的主题,不跟随观众的系统设置。

演示文稿的配色是**设计决定** —— 没有哪份 PPT 的颜色该随观众机器的系统设置变。
deck 决定主题,被嵌页无权决定;这个模块就是执行这条规则的地方。

为什么光改 CSS 不够(实测出来的,不是推测):
  被嵌页的主题往往由 **JS** 决定,不是 CSS ——
    · matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"   跟随系统
    · localStorage.getItem("xxx-theme")                                       跟随上次点过的按钮
  只拆 @media (prefers-color-scheme: ...) 的话,这两条照样把 data-theme 设回 dark。
  两个真实被嵌页在深色系统下的平均亮度:29/255 和 10/255 —— 全黑,和四周白色幻灯片撞在一起。

所以三管齐下:
  ① CSS —— 与目标主题一致的媒体查询拆出外壳无条件生效,另一支整块删;
  ② DOM —— 在页面自己的脚本**之前**把 data-theme 钉死;
  ③ JS  —— 接管 matchMedia 的 prefers-color-scheme 查询和 localStorage 的主题键,
            让页面自己那套「跟随系统 / 记住上次」的逻辑算出来的结果**就是**我们要的主题。

用法:

    from force_theme import force_theme

    raw = force_theme(open("demo.html", encoding="utf-8").read(), "light")
    esc = raw.replace("&", "&amp;").replace('"', "&quot;")     # 顺序别反
    deck = deck.replace('src="demo.html"', 'srcdoc="%s"' % esc)

验证方式见 SKILL.md 的 QA 一节:必须在**深色系统**下截图量亮度,浅色系统上验不出来。
"""
import re


def _brace_end(t, i):
    """t[i] 必须是 '{',返回配对 '}' 的下标。"""
    d = 0
    while i < len(t):
        d += (t[i] == "{") - (t[i] == "}")
        if d == 0:
            return i
        i += 1
    raise ValueError("CSS 花括号不配对")


def _strip_media_in_css(css, theme):
    """在一段 CSS 里:保留与 theme 一致的媒体查询(拆掉外壳无条件生效),删掉另一支。

    ⚠️ 只认**真正的 @media 前奏** —— 从 "@media" 到它后面第一个 "{" 之间的那段文字。
    早先的写法是「找到 prefers-color-scheme,再往前 rfind @media」,结果被 JS 里的
    matchMedia("(prefers-color-scheme: dark)") 骗到:那句话不在任何 @media 里,
    rfind 会命中很靠前的一个真 @media,于是把中间**整段代码**一起删掉。
    实测把一个 122KB 的可视化页削到 40KB、入口函数直接没了,而且页面还能打开、只是空白 ——
    所以这个 bug 不会当场报错,只会在你看截图时才发现。
    """
    out, i = [], 0
    while True:
        k = css.find("@media", i)
        if k < 0:
            out.append(css[i:])
            break
        br = css.find("{", k)
        if br < 0:
            out.append(css[i:])
            break
        prelude = css[k + 6:br]
        try:
            end = _brace_end(css, br)
        except ValueError:
            out.append(css[i:])
            break
        if "prefers-color-scheme" in prelude:
            keep_light = "light" in prelude and "dark" not in prelude
            keep_dark = "dark" in prelude
            inner = css[br + 1:end]
            if (keep_light and theme == "light") or (keep_dark and theme == "dark"):
                out.append(css[i:k]); out.append(inner)      # 拆掉外壳,无条件生效
            else:
                out.append(css[i:k])                          # 整块丢弃
        else:
            out.append(css[i:end + 1])                        # 与主题无关的媒体查询,原样保留
        i = end + 1
    return "".join(out)


def _strip_media(html, theme):
    """只处理 <style> 块里的 CSS,绝不碰 JS 与正文。"""
    def rep(m):
        return m.group(1) + _strip_media_in_css(m.group(2), theme) + m.group(3)
    return re.sub(r"(<style[^>]*>)([\s\S]*?)(</style>)", rep, html, flags=re.I)


_SHIM = """<meta name="color-scheme" content="only %(T)s">
<script>
/* 由上一层(deck)钉死配色 —— 不跟随系统、不跟随 localStorage。
   必须在页面自己的脚本之前执行:它们会在 DOMContentLoaded 里读 matchMedia 与
   localStorage 去算主题,这里先把这两个来源接管掉,让它们算出来的就是 "%(T)s"。 */
(function () {
  var T = "%(T)s";
  try { document.documentElement.setAttribute("data-theme", T); } catch (e) {}

  var mm = window.matchMedia && window.matchMedia.bind(window);
  window.matchMedia = function (q) {
    if (/prefers-color-scheme/i.test(q)) {
      var want = /dark/i.test(q) ? (T === "dark") : (T === "light");
      return { matches: want, media: q, onchange: null,
               addListener: function () {}, removeListener: function () {},
               addEventListener: function () {}, removeEventListener: function () {},
               dispatchEvent: function () { return false; } };
    }
    return mm ? mm(q) : { matches: false, media: q,
                          addListener: function () {}, removeListener: function () {},
                          addEventListener: function () {}, removeEventListener: function () {},
                          dispatchEvent: function () { return false; } };
  };

  try {
    var get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      if (/theme/i.test(String(k))) return T;      /* 忽略上次点过的主题按钮 */
      return get.call(this, k);
    };
  } catch (e) {}

  /* 页面脚本跑完后再钉一次 —— 有的实现会在自己的 init 里覆盖 data-theme。 */
  document.addEventListener("DOMContentLoaded", function () {
    try { document.documentElement.setAttribute("data-theme", T); } catch (e) {}
  });
})();
</script>
"""


def force_theme(html, theme="light"):
    """theme 只接受 'light' / 'dark' —— 由调用方(上一层)决定,被嵌页无权决定。"""
    if theme not in ("light", "dark"):
        raise ValueError("theme 只能是 light 或 dark")

    html = _strip_media(html, theme)

    # 已有的 color-scheme meta 先去掉,免得和注入的那条打架
    html = re.sub(r'<meta[^>]*name=["\']color-scheme["\'][^>]*>', "", html, flags=re.I)

    shim = _SHIM % {"T": theme}
    # 注入点按 <head> → <html> → 文首 退化。
    # ⚠️ 不能用 html.replace("</head>", ...):很多手写的可视化页**根本没有 </head>**,
    #    replace 会静默什么都不做,而你要到看截图时才发现没生效。
    m = re.search(r"<head[^>]*>", html, re.I)
    if m:
        return html[:m.end()] + "\n" + shim + html[m.end():]
    m = re.search(r"<html[^>]*>", html, re.I)
    if m:
        return html[:m.end()] + "\n" + shim + html[m.end():]
    return shim + html
