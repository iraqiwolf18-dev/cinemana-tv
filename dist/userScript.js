/*
 * Cinemana TV — تنقّل بأسهم ريموت التلفزيون على cinemana.shabakaty.cc
 * يُحقن بواسطة TizenBrew في كل صفحة من الموقع.
 *
 *   الأسهم        تنقّل بين كل ما ينضغط
 *   OK            ضغط — وعلى الفيديو: شاشة كاملة وتشغيل/إيقاف
 *   رجوع          يسكّر القائمة/الشاشة الكاملة/الكيبورد، وإلا يرجع صفحة
 *   أزرار الوسائط تشغيل، إيقاف، تقديم وترجيع 10 ثواني
 *
 * مكتوب بدون ?. و?? لأن محرّك Tizen 6.x أقدم منها.
 */
(function () {
  'use strict';
  // موقع سينمانا المخصص للتلفزيون (/CTV/) عنده تنقّل بالريموت خاص به، فلا نتدخل
  if (/^\/CTV(\/|$)/i.test(location.pathname)) return;
  if (window.__cinemanaTV) return;
  window.__cinemanaTV = true;

  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, ESC: 27, BACKSPACE: 8,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412,
    IME_DONE: 65376, IME_CANCEL: 65385
  };
  var SEEK = 10;
  var ACCENT = '#e50914';

  // ---------------------------------------------------------------- مفاتيح Tizen
  try {
    ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
     'MediaFastForward', 'MediaRewind'].forEach(function (k) {
      tizen.tvinputdevice.registerKey(k);
    });
  } catch (e) { /* خارج التلفزيون */ }

  // ---------------------------------------------------------------- إطار التركيز
  var ring = document.createElement('div');
  ring.id = 'ctv-ring';
  ring.style.cssText =
    'position:fixed;pointer-events:none;z-index:2147483647;display:none;' +
    'border:4px solid ' + ACCENT + ';border-radius:10px;' +
    'box-shadow:0 0 0 3px rgba(0,0,0,.55),0 0 22px 4px rgba(229,9,20,.75);' +
    'transition:left .12s,top .12s,width .12s,height .12s;';

  var toast = document.createElement('div');
  toast.style.cssText =
    'position:fixed;left:50%;bottom:8%;transform:translateX(-50%);z-index:2147483647;' +
    'background:rgba(0,0,0,.8);color:#fff;font:600 30px Tahoma,sans-serif;' +
    'padding:14px 30px;border-radius:12px;display:none;pointer-events:none;';
  var toastTimer = 0;
  function say(text) {
    toast.textContent = text;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.style.display = 'none'; }, 1200);
  }

  function mount() {
    var host = document.fullscreenElement || document.webkitFullscreenElement || document.body;
    if (!host) return;
    if (ring.parentNode !== host) host.appendChild(ring);
    if (toast.parentNode !== host) host.appendChild(toast);
  }

  var current = null;
  var lastRect = null;

  function drawRing() {
    placeRing();
    requestAnimationFrame(drawRing);
  }

  function placeRing() {
    mount();
    if (!current || !document.contains(current)) {
      ring.style.display = 'none';
      if (current) current = null;
    } else {
      var r = current.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        ring.style.display = 'none';
      } else {
        lastRect = r;
        ring.style.display = 'block';
        ring.style.left = (r.left - 6) + 'px';
        ring.style.top = (r.top - 6) + 'px';
        ring.style.width = (r.width + 4) + 'px';
        ring.style.height = (r.height + 4) + 'px';
      }
    }
  }

  // ---------------------------------------------------------------- المرشّحون
  var SEMANTIC = 'a,button,input:not([type=hidden]),textarea,select,' +
                 '[role=button],[role=tab],[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox],' +
                 '[role=option],[role=checkbox],[tabindex]:not([tabindex="-1"]),.video-js,.vjs-menu-item';

  // إذا واجهة الشاشة الكاملة رفضت، نكبّر المشغّل بالـCSS على كامل الشاشة
  var pseudoFull = null;

  function fsRoot() {
    return document.fullscreenElement || document.webkitFullscreenElement ||
           (pseudoFull && document.contains(pseudoFull) ? pseudoFull : null);
  }

  // قائمة منبثقة مفتوحة (اختيار موسم، قائمة المستخدم...) تحبس التنقل داخلها
  function overlayRoot() {
    // قائمة الجودة/الترجمة بالمشغّل
    var vm = document.querySelector('.vjs-menu.vjs-lock-showing');
    if (vm && vm.querySelector('.vjs-menu-item')) return vm;
    var panes = document.querySelectorAll('.cdk-overlay-pane');
    for (var i = panes.length - 1; i >= 0; i--) {
      var r = panes[i].getBoundingClientRect();
      if (panes[i].children.length && r.width > 20 && r.height > 20) return panes[i];
    }
    return null;
  }

  function navRoot() {
    return overlayRoot() || fsRoot() || document;
  }

  function isExternal(el) {
    if (el.tagName !== 'A') return false;
    var h = el.getAttribute('href') || '';
    if (!/^https?:/i.test(h)) return false;
    return !/shabakaty\./i.test(h);
  }

  function hiddenByStyle(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return true;
      // شريط المشغّل يختفي (شفافية صفر) لما ما تتحرك؛ نصحّيه وقت ما نوصله
      if (parseFloat(s.opacity) === 0 && !n.classList.contains('vjs-control-bar')) return true;
      if (n.getAttribute('aria-hidden') === 'true' && n !== el && !n.classList.contains('video-js')) return true;
    }
    return false;
  }

  // أقرب شريط keen-slider (الأشرطة الأفقية) — العناصر خارجه تُقبل ثم نحرّك الشريط لها
  function sliderOf(el) {
    return el.closest ? el.closest('.keen-slider') : null;
  }

  // أقرب أب يسكرول أفقياً (مثل صف أرقام المواسم)
  function hScroller(el) {
    for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 4) return n;
    }
    return null;
  }

  // المستطيل الظاهر فعلاً بعد قصّ الآباء اللي overflow مالهم مخفي؛
  // اللي يسكرول أفقياً ما يُحسب قصّاً لأننا نسكروله للعنصر
  function clipRect(el) {
    var L = 0, T = -Infinity, R = window.innerWidth, B = Infinity;
    for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (s.overflowX !== 'visible' && !/(auto|scroll)/.test(s.overflowX)) {
        var r = n.getBoundingClientRect();
        L = Math.max(L, r.left); R = Math.min(R, r.right);
      }
    }
    return { left: L, right: R, top: T, bottom: B };
  }

  // حساب المرشّحين يمر على كل عناصر الصفحة، ومعالج التلفزيون بطيء؛
  // فنحتفظ بالقائمة لحد ما تتغيّر الصفحة فعلاً
  var cache = null, cacheRoot = null, dirty = true;
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var t = records[i].target;
      if (t !== ring && t !== toast && !(ring.contains(t)) && !(toast.contains(t))) { dirty = true; return; }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true,
                                         attributeFilter: ['class', 'style', 'hidden', 'disabled', 'aria-hidden'] });

  function candidates() {
    var root = navRoot();
    if (!dirty && cache && cacheRoot === root) {
      return cache.filter(function (el) { return document.contains(el); });
    }
    dirty = false;
    cacheRoot = root;
    cache = computeCandidates(root);
    return cache;
  }

  function computeCandidates(root) {
    var list = Array.prototype.slice.call(root.querySelectorAll(SEMANTIC));
    // عناصر Angular اللي تنضغط بدون ما تكون زر: نعرفها من مؤشر الماوس
    var all = root.querySelectorAll('div,span,li,img,svg,mat-icon,mat-checkbox,label,cinemana-video-card,[class*=card],[class*=item]');
    for (var i = 0; i < all.length; i++) {
      if (getComputedStyle(all[i]).cursor === 'pointer') list.push(all[i]);
    }
    var seen = new Set();
    var out = [];
    list.forEach(function (el) {
      if (seen.has(el)) return;
      seen.add(el);
      if (el === ring || el.tagName === 'IFRAME' || el.closest('iframe')) return;
      if (el.disabled || isExternal(el)) return;
      // أسهم الأشرطة: السكربت يحرّك الشريط وحده، فالوقوف عليها خطوة زايدة
      if (el.closest('.leftRs, .rightRs, .arrow--left, .arrow--right')) return;
      var r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return;
      if (hiddenByStyle(el)) return;
      // صفحة الفلم تغطي المشغّل بلوحة المعلومات: المشغّل موجود بس مو ظاهر
      if (el.classList.contains('video-js') && !fsRoot()) {
        var hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        if (hit && !el.contains(hit)) return;
      }
      if (!sliderOf(el)) {
        var c = clipRect(el);
        var cx = (r.left + r.right) / 2;
        if (cx < c.left - 2 || cx > c.right + 2) return;
      }
      out.push(el);
    });
    // نخلّي الأبعد (الأب) إذا واحد جوّا الثاني — إلا مشغّل الفيديو: أزراره تبقى
    var set = new Set(out);
    return out.filter(function (el) {
      for (var p = el.parentElement; p; p = p.parentElement) {
        if (set.has(p) && !p.classList.contains('video-js')) return false;
      }
      return true;
    });
  }

  // ---------------------------------------------------------------- اختيار الاتجاه
  function center(r) { return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }

  function score(from, to, dir) {
    var f = center(from), t = center(to);
    var primary, ortho, overlap;
    if (dir === 'left' || dir === 'right') {
      var edge = dir === 'right' ? to.left - from.right : from.left - to.right;
      if ((dir === 'right' ? t.x <= f.x + 1 : t.x >= f.x - 1)) return Infinity;
      primary = Math.max(0, edge);
      overlap = Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top);
      ortho = overlap > 0 ? 0 : Math.abs(t.y - f.y);
      // عنصر بصف ثاني لازم يكون الخيار الأخير
      if (overlap <= 0) primary += 2000;
    } else {
      var e2 = dir === 'down' ? to.top - from.bottom : from.top - to.bottom;
      if ((dir === 'down' ? t.y <= f.y + 1 : t.y >= f.y - 1)) return Infinity;
      primary = Math.max(0, e2);
      overlap = Math.min(from.right, to.right) - Math.max(from.left, to.left);
      ortho = overlap > 0 ? Math.abs(t.x - f.x) * 0.3 : Math.abs(t.x - f.x);
    }
    return primary + ortho * 2;
  }

  function best(dir) {
    var list = candidates();
    if (!list.length) return null;
    var from = current && document.contains(current) ? current.getBoundingClientRect() : null;
    if (from && from.width === 0 && from.height === 0) from = null;
    if (!from) return firstTarget(list);
    var winner = null, bestScore = Infinity;
    list.forEach(function (el) {
      if (el === current) return;
      if (current.contains(el) && !current.classList.contains('video-js')) return;
      // من زر بالمشغّل ما نرجع للمشغّل كله بالأسهم الجانبية؛ نبقى بين الأزرار
      if (el.contains(current)) return;
      var s = score(from, el.getBoundingClientRect(), dir);
      if (s < bestScore) { bestScore = s; winner = el; }
    });
    return winner;
  }

  // أول تركيز: زر "شاهد" إن وجد، وإلا الأقرب لمنتصف الشاشة
  function firstTarget(list) {
    var watch = list.filter(function (el) {
      var cls = typeof el.className === 'string' ? el.className : '';
      var r = el.getBoundingClientRect();
      return /watch-button|watch-btn/.test(cls) && r.top >= 0 && r.bottom <= window.innerHeight;
    })[0];
    if (watch) return watch;
    // وإلا المشغّل إذا ظاهر
    var box = list.filter(function (el) {
      return el.classList.contains('video-js') && el.getBoundingClientRect().width >= 300;
    })[0];
    if (box) return box;
    var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    if (lastRect) { var lc = center(lastRect); cx = lc.x; cy = lc.y; }
    var winner = null, d = Infinity;
    list.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      var c = center(r), dd = Math.pow(c.x - cx, 2) + Math.pow(c.y - cy, 2);
      if (dd < d) { d = dd; winner = el; }
    });
    return winner || list[0];
  }

  // ---------------------------------------------------------------- تمرير
  function scrollParent(el) {
    for (var n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
    }
    return null;
  }

  function revealVertically(el) {
    var r = el.getBoundingClientRect();
    var sp = scrollParent(el);
    var top = sp ? sp.getBoundingClientRect().top : 0;
    var bottom = sp ? sp.getBoundingClientRect().bottom : window.innerHeight;
    var margin = Math.min(160, (bottom - top) / 5);
    var delta = 0;
    if (r.top < top + margin) delta = r.top - top - margin;
    else if (r.bottom > bottom - margin) delta = r.bottom - bottom + margin;
    if (r.height > bottom - top - 2 * margin) delta = r.top - top - margin;
    if (!delta) return;
    if (sp) sp.scrollTop += delta; else window.scrollBy(0, delta);
  }

  // الأشرطة الأفقية تتحرك بأسهمها مو بالسكرول:
  // svg.arrow--left/right بالرئيسية، وbutton.leftRs/rightRs بشريط الحلقات
  function sliderArrows(slider) {
    for (var n = slider.parentElement, i = 0; n && i < 6; n = n.parentElement, i++) {
      var l = n.querySelector('.arrow--left, .leftRs'), r = n.querySelector('.arrow--right, .rightRs');
      if (l || r) return { left: l, right: r };
    }
    return null;
  }

  // الضغط على أعمق عنصر بنص البطاقة: Angular يربط (click) أحياناً على عنصر
  // داخلي، والنقرة تصعد للآباء بس ما تنزل للأبناء
  function fire(el) {
    var tag = el.tagName;
    if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'LABEL') { el.click(); return; }
    var r = el.getBoundingClientRect();
    var x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
    var hit = document.elementFromPoint(x, y);
    // إذا شي مغطيه (مثل شريط مشغّل مخفي) نضغط زره الداخلي مباشرة
    var target = hit && el.contains(hit) ? hit :
                 (el.querySelector('button, a, [role=button], [role=menuitemradio]') || el);
    ['mousedown', 'mouseup', 'click'].forEach(function (type) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window,
                                                  clientX: x, clientY: y, button: 0 }));
    });
  }

  function outside(el) {
    var r = el.getBoundingClientRect(), c = clipRect(el);
    if (r.left < c.left - 2) return -1;
    if (r.right > c.right + 2) return 1;
    return 0;
  }

  function revealHorizontally(el, tries, lastSide, lastArrow) {
    var slider = sliderOf(el);
    if (!slider) {
      var sc = hScroller(el);
      if (sc) {
        var er = el.getBoundingClientRect(), cr = sc.getBoundingClientRect();
        if (er.left < cr.left || er.right > cr.right) {
          var dx = (er.left + er.right) / 2 - (cr.left + cr.right) / 2;
          if (sc.scrollBy) sc.scrollBy(dx, 0); else sc.scrollLeft += dx;
        }
      }
      return;
    }
    var side = outside(el);
    if (!side || tries > 12) return;
    var arrows = sliderArrows(slider);
    if (!arrows) return;
    var arrow = side < 0 ? arrows.left : arrows.right;
    // إذا الضغطة السابقة بعّدته بدل ما تقرّبه، نبدّل السهم
    if (lastArrow && lastSide === side) arrow = lastArrow === arrows.left ? arrows.right : arrows.left;
    if (!arrow) return;
    var before = el.getBoundingClientRect().left;
    fire(arrow);
    setTimeout(function () {
      var after = el.getBoundingClientRect().left;
      var improved = side < 0 ? after > before : after < before;
      revealHorizontally(el, tries + 1, improved ? null : side, improved ? null : arrow);
    }, 380);
  }

  // ---------------------------------------------------------------- التركيز
  // حقول الكتابة فقط — الـcheckbox وأخواته تنضغط مثل الأزرار
  function isField(el) {
    if (!el) return false;
    if (el.tagName === 'INPUT') return !/^(checkbox|radio|button|submit|reset|file|range|color|image)$/i.test(el.type);
    return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
  }

  function setCurrent(el) {
    if (!el) return;
    current = el;
    // الحقول ما تاخذ focus بالتنقل حتى ما يطلع الكيبورد كل ما نمر عليها
    if (!isField(el) && typeof el.focus === 'function') {
      try { el.focus({ preventScroll: true }); } catch (e) {}
    } else if (isField(document.activeElement)) {
      document.activeElement.blur();
    }
    if (el.closest('.video-js')) wake();
    revealVertically(el);
    revealHorizontally(el, 0, null, null);
    placeRing();
  }

  function move(dir) {
    var next = best(dir);
    if (next) setCurrent(next);
  }

  // ---------------------------------------------------------------- الفيديو
  function videoEl() { return document.querySelector('video.vjs-tech') || document.querySelector('video'); }

  function player() {
    var v = videoEl();
    if (!v || !window.videojs) return null;
    var box = v.closest('.video-js');
    try { return box ? window.videojs.getPlayer(box) || window.videojs(box) : null; } catch (e) { return null; }
  }

  function wake() {
    var p = player();
    if (p) { try { p.userActive(true); } catch (e) {} }
  }

  function togglePlay() {
    var v = videoEl();
    if (!v) return;
    if (v.paused) { v.play(); say('▶'); } else { v.pause(); say('❚❚'); }
    wake();
  }

  function seek(sec) {
    var v = videoEl();
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + sec));
    var m = Math.floor(v.currentTime / 60), s = Math.floor(v.currentTime % 60);
    say((sec > 0 ? '⏩ ' : '⏪ ') + m + ':' + (s < 10 ? '0' : '') + s);
    wake();
  }

  function enterFullscreen(box) {
    var p = player();
    try {
      if (p) p.requestFullscreen();
      else (box.requestFullscreen || box.webkitRequestFullscreen).call(box);
    } catch (e) {}
    setTimeout(function () {
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      pseudoFull = box;
      box.classList.add('ctv-full');
      // القائمة الجانبية والشريط العلوي بطبقة أعلى؛ نرفع سلسلة آباء المشغّل فوقهم
      for (var n = box.parentElement; n && n !== document.body; n = n.parentElement) n.classList.add('ctv-full-anc');
      dirty = true;
      wake();
    }, 600);
  }

  function exitFullscreen() {
    if (pseudoFull) {
      pseudoFull.classList.remove('ctv-full');
      Array.prototype.forEach.call(document.querySelectorAll('.ctv-full-anc'), function (n) {
        n.classList.remove('ctv-full-anc');
      });
      pseudoFull = null;
      dirty = true;
      return;
    }
    var p = player();
    if (p && p.isFullscreen && p.isFullscreen()) { try { p.exitFullscreen(); return; } catch (e) {} }
    var f = document.exitFullscreen || document.webkitExitFullscreen;
    if (f) f.call(document);
  }

  // التركيز على الفيديو نفسه (مو على زر من أزراره)
  function onVideoSurface() {
    if (fsRoot() && fsRoot().querySelector('video')) {
      return !current || !fsRoot().contains(current) || current.classList.contains('video-js') ||
             !current.closest('.vjs-control-bar,.vjs-menu,.vjs-modal-dialog');
    }
    return current && current.classList && current.classList.contains('video-js');
  }

  function focusPlayer() {
    var box = document.querySelector('.video-js');
    if (!box || hiddenByStyle(box)) return;
    if (box.getBoundingClientRect().width < 50) return;
    setCurrent(box);
  }

  // ---------------------------------------------------------------- الرجوع
  function closeOverlay() {
    var open = document.querySelector('.vjs-menu.vjs-lock-showing');
    if (open) {
      // نفس زر القائمة يسكّرها، حتى تبقى حالة المشغّل الداخلية صحيحة
      var btn = open.parentElement && open.parentElement.querySelector('button.vjs-menu-button');
      if (btn) btn.click(); else open.classList.remove('vjs-lock-showing');
      if (btn) setCurrent(btn.closest('.vjs-control') || btn);
      return 'kept';
    }
    var backdrop = document.querySelector('.cdk-overlay-backdrop-showing, .cdk-overlay-backdrop');
    if (backdrop && backdrop.getBoundingClientRect().width) { fire(backdrop); return true; }
    var pane = document.querySelector('.cdk-overlay-pane');
    if (pane && pane.children.length) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      return true;
    }
    var vjsMenu = document.querySelector('.vjs-menu.vjs-lock-showing, .vjs-modal-dialog:not(.vjs-hidden)');
    if (vjsMenu) {
      var close = vjsMenu.querySelector('.vjs-close-button, .vjs-done-button');
      if (close) fire(close); else vjsMenu.classList.remove('vjs-lock-showing');
      return true;
    }
    return false;
  }

  function back() {
    if (isField(document.activeElement)) { document.activeElement.blur(); return; }
    var closed = closeOverlay();
    if (closed) { if (closed !== 'kept') current = null; return; }
    if (fsRoot()) { exitFullscreen(); return; }
    var path = location.pathname;
    if (path === '/home' || path === '/' || path === '/landing') {
      try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
      return;
    }
    current = null;
    history.back();
  }

  // ---------------------------------------------------------------- لوحة المفاتيح
  function stop(e) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    var inField = isField(document.activeElement);

    // الكيبورد مفتوح: نخلي الكتابة والأسهم الأفقية للحقل
    if (inField) {
      if (k === K.IME_DONE) {
        // "تم" بكيبورد التلفزيون = Enter: البحث يفتح صفحة النتائج
        var field = document.activeElement;
        ['keydown', 'keypress', 'keyup'].forEach(function (type) {
          field.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13,
                                                        which: 13, bubbles: true, cancelable: true }));
        });
        field.blur();
        stop(e); return;
      }
      if (k === K.IME_CANCEL) { document.activeElement.blur(); stop(e); return; }
      if (k === K.UP || k === K.DOWN) {
        current = document.activeElement;
        document.activeElement.blur();
        move(k === K.UP ? 'up' : 'down');
        stop(e); return;
      }
      if (k === K.BACK) { document.activeElement.blur(); stop(e); return; }
      return;
    }

    switch (k) {
      case K.PLAYPAUSE: case K.PLAY: case K.PAUSE:
        if (videoEl()) { togglePlay(); stop(e); } return;
      case K.STOP:
        if (videoEl()) { videoEl().pause(); exitFullscreen(); stop(e); } return;
      case K.FF: if (videoEl()) { seek(SEEK * 3); stop(e); } return;
      case K.RW: if (videoEl()) { seek(-SEEK * 3); stop(e); } return;
      case K.BACK: case K.ESC:
        back(); stop(e); return;
      case K.BACKSPACE:
        if (!window.tizen) { back(); stop(e); } return;
    }

    var dir = k === K.LEFT ? 'left' : k === K.RIGHT ? 'right' : k === K.UP ? 'up' : k === K.DOWN ? 'down' : null;

    if (dir) {
      if (onVideoSurface() && (dir === 'left' || dir === 'right')) {
        seek(dir === 'right' ? SEEK : -SEEK); stop(e); return;
      }
      if (fsRoot() && onVideoSurface() && dir === 'down') {
        wake();
        var play = fsRoot().querySelector('.vjs-play-control');
        if (play) setCurrent(play);
        stop(e); return;
      }
      if (fsRoot()) wake();
      move(dir); stop(e); return;
    }

    if (k === K.ENTER) {
      if (!current || !document.contains(current)) { move('down'); stop(e); return; }
      if (onVideoSurface()) {
        if (!fsRoot()) {
          var box = current.classList.contains('video-js') ? current : current.closest('.video-js');
          if (box) { enterFullscreen(box); if (videoEl().paused) videoEl().play(); setCurrent(box); }
        } else {
          togglePlay();
        }
        stop(e); return;
      }
      if (isField(current)) {
        current.focus();
        if (typeof current.click === 'function') current.click();
        stop(e); return;
      }
      var target = current;
      if (target.closest('.video-js')) wake();
      var menuOwner = target.closest('.vjs-menu') && target.closest('.vjs-menu-button');
      fire(target);
      // خيار من قائمة الجودة/الترجمة: القائمة تتسكّر، فنرجع لزرها
      if (menuOwner) setTimeout(function () { if (document.contains(menuOwner)) setCurrent(menuOwner); }, 200);
      if (fsRoot()) wake();
      // قائمة الجودة/الترجمة انفتحت: التركيز على الخيار المختار حالياً
      if (target.classList.contains('vjs-menu-button') || target.closest('.vjs-menu-button') && !target.closest('.vjs-menu')) {
        setTimeout(function () {
          var holder = target.classList.contains('vjs-menu-button') ? target : target.closest('.vjs-menu-button');
          var menu = holder.querySelector('.vjs-menu.vjs-lock-showing');
          if (!menu) return;
          dirty = true;
          setCurrent(menu.querySelector('.vjs-menu-item.vjs-selected') || menu.querySelector('.vjs-menu-item'));
        }, 150);
      }
      // بعد "شاهد" يطلع المشغّل: نحط التركيز عليه حتى OK الجاية تفتحه شاشة كاملة
      // بعد "شاهد" أو اختيار حلقة يشتغل المشغّل
      if (/watch-btn|watch-button/.test(typeof target.className === 'string' ? target.className : '') ||
          target.closest('cinemana-season-carousel-list')) {
        setTimeout(focusPlayer, 1500);
      }
      stop(e);
    }
  }, true);

  // الماوس يرجع يشتغل عادي: أي حركة تشيل الإطار
  document.addEventListener('mousemove', function () {
    if (current) { current = null; }
  }, true);

  // انتقال صفحة بـAngular يمسح العنصر، فنرجع نختار من جديد بأول سهم
  var lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      current = null;
      lastRect = null;
      if (pseudoFull) exitFullscreen();
    }
  }, 400);

  // ---------------------------------------------------------------- تعديلات شكل للتلفزيون
  var style = document.createElement('style');
  style.textContent =
    // الإطار هو مؤشر التركيز؛ نشيل حدود التركيز الافتراضية حتى ما يصير إطارين
    '*:focus{outline:none!important}' +
    // أزرار المشغّل أكبر شوية حتى تنقرأ من الكنبة
    '.video-js .vjs-control-bar{font-size:150%}' +
    '.video-js.ctv-full{position:fixed!important;left:0!important;top:0!important;width:100vw!important;' +
    'height:100vh!important;max-width:none!important;z-index:2147483646!important;background:#000}' +
    '.video-js.ctv-full .vjs-control-bar{font-size:190%}' +
    '.ctv-full-anc{z-index:2147483646!important;transform:none!important}' +
    '.video-js.vjs-fullscreen .vjs-control-bar{font-size:190%}';
  (document.head || document.documentElement).appendChild(style);

  function start() {
    mount();
    requestAnimationFrame(drawRing);
  }

  // للفحص من أدوات المطوّر: __ctv.current()، __ctv.list()
  window.__ctv = {
    current: function () { return current; },
    list: function () { return candidates(); },
    move: move
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
