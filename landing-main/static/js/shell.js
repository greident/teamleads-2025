/*!
 * Teamleads Shell — a tiny, dependency-free terminal that turns the site into a
 * navigable filesystem. Config comes from data-* attributes on the mount node:
 *   data-mode  "full" | "404"
 *   data-tg    Telegram URL
 *   data-fs    JSON: { sections: {name: [{n,u,t,d}]}, links: {name:url} }
 * Auto-mounts every [data-term] on load. Also exposed as window.TeamleadsShell.
 */
(function (w, d) {
  'use strict';

  function mount(root) {
    if (!root || root.__shell) return;
    root.__shell = true;

    var out = root.querySelector('[data-term-out]');
    var body = root.querySelector('[data-term-body]');
    var line = root.querySelector('[data-term-prompt-line]');
    var input = root.querySelector('[data-term-input]');
    var promptEl = root.querySelector('[data-term-prompt]');
    var titleEl = root.querySelector('[data-term-title]');
    var simPanel = root.querySelector('[data-term-sim]');
    if (!out || !body || !input) return;

    var mode = root.getAttribute('data-mode') || 'full';
    var TG = root.getAttribute('data-tg') || 'https://t.me/teamleads_kz';
    var FS = {};
    try { FS = JSON.parse(root.getAttribute('data-fs') || '{}') || {}; } catch (e) { FS = {}; }
    var SAL = {};
    try { SAL = JSON.parse(root.getAttribute('data-salary') || '{}') || {}; } catch (e) { SAL = {}; }
    var FRIENDS = [];
    try { FRIENDS = JSON.parse(root.getAttribute('data-friends') || '[]') || []; } catch (e) { FRIENDS = []; }
    var SCEN = {};
    try { SCEN = JSON.parse(root.getAttribute('data-scenarios') || '{}') || {}; } catch (e) { SCEN = {}; }
    var SHARE = {};  // verb → /s/<id>/ card id (from data/shell_commands.toml)
    try { SHARE = JSON.parse(root.getAttribute('data-share') || '{}') || {}; } catch (e) { SHARE = {}; }
    var hintedShare = false;
    var sections = FS.sections || {};
    var links = FS.links || {};
    var sectionNames = Object.keys(sections);
    var linkNames = Object.keys(links);
    var pool = [];
    sectionNames.forEach(function (s) { (sections[s] || []).forEach(function (it) { pool.push(it); }); });

    var reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var cwd = '';            // '' = root, otherwise a section name
    var vimMode = false;
    var hist = [], hpos = -1;
    var comp = { base: '', list: [], idx: 0, full: null };  // Tab-completion cycling state
    var SEARCH_INDEX = null;                                 // grep index (fetched once, cached)
    var HKEY = 'tnk_shell_history';
    try { var _hs = w.localStorage && w.localStorage.getItem(HKEY); if (_hs) { hist = JSON.parse(_hs) || []; hpos = hist.length; } } catch (e) {}
    function saveHist() { try { if (w.localStorage) w.localStorage.setItem(HKEY, JSON.stringify(hist.slice(-100))); } catch (e) {} }
    function histPrev() { if (hpos > 0) { hpos--; input.value = hist[hpos]; } }
    function histNext() { if (hpos < hist.length - 1) { hpos++; input.value = hist[hpos]; } else { hpos = hist.length; input.value = ''; } }

    function el(t, c, x) { var n = d.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
    function print(text, cls) { var n = el('div', 'ln' + (cls ? ' ' + cls : ''), text == null ? '' : text); out.appendChild(n); body.scrollTop = body.scrollHeight; return n; }
    function printNode(node) { var n = el('div', 'ln'); n.appendChild(node); out.appendChild(n); body.scrollTop = body.scrollHeight; return n; }
    function link(href, text, ext) { var a = el('a', null, text); a.href = href; if (ext) { a.target = '_blank'; a.rel = 'noopener'; } return a; }
    function pad(s, n) { s = String(s); return s.length >= n ? s + ' ' : s + new Array(n - s.length + 1).join(' '); }
    function pathStr() { return '/' + cwd; }
    function setPrompt() {
      if (promptEl) promptEl.innerHTML = '<b>guest@teamleads</b>:' + pathStr() + '$';
      if (titleEl) titleEl.textContent = 'guest@teamleads: ' + pathStr();
    }
    function go(href) { print(''); print('переход → ' + href, 'ok'); setTimeout(function () { w.location.href = href; }, reduced ? 0 : 360); }

    // Markdown line renderer for `cat`: colorizes headings, quotes, lists, links,
    // and inline **bold** / *em* / `code` so long pages read like a document, not a wall.
    function mdInline(node, s) {
      var re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|_([^_]+)_/g;
      var last = 0, m;
      while ((m = re.exec(s))) {
        if (m.index > last) node.appendChild(d.createTextNode(s.slice(last, m.index)));
        if (m[2] != null) node.appendChild(link(m[2], m[1], /^https?:/i.test(m[2])));
        else if (m[3] != null) node.appendChild(el('span', 'md-strong', m[3]));
        else if (m[4] != null) node.appendChild(el('span', 'md-em', m[4]));
        else if (m[5] != null) node.appendChild(el('span', 'md-code', m[5]));
        else if (m[6] != null) node.appendChild(el('span', 'md-em', m[6]));
        last = re.lastIndex;
      }
      if (last < s.length) node.appendChild(d.createTextNode(s.slice(last)));
      return node;
    }
    function mdLine(line) {
      if (!line.trim()) return null;   // collapse blank lines — spacing is controlled by CSS margins
      var div = el('div', 'ln'), m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { div.className = 'ln md-h md-h' + m[1].length; return mdInline(div, m[2]); }
      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { div.className = 'ln md-hr'; div.textContent = '────────────────────────────'; return div; }
      if ((m = /^>\s?(.*)$/.exec(line))) { div.className = 'ln md-quote'; return mdInline(div, m[1]); }
      if ((m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line))) {
        div.className = 'ln md-li';
        div.appendChild(el('span', 'md-bullet', /\d/.test(m[2]) ? m[2] + ' ' : '• '));
        return mdInline(div, m[3]);
      }
      if (line.trim()) div.className = 'ln md-p';   // paragraph — gets extra spacing
      return mdInline(div, line);
    }

    // ── Тимлид-симулятор: an interactive panel mode. Instead of streaming
    //    append-only lines, it takes over the terminal body with a card that
    //    re-renders in place on each step. Scenarios come from data-scenarios.
    var simSt = null;   // { list, idx, score, phase: 'choice'|'outcome'|'done', chosen }
    var simToastT = null;
    function copyText(t) {
      if (w.navigator && w.navigator.clipboard && w.navigator.clipboard.writeText) return w.navigator.clipboard.writeText(t);
      return new Promise(function (res, rej) {
        try { var ta = d.createElement('textarea'); ta.value = t; ta.style.position = 'absolute'; ta.style.left = '-9999px'; d.body.appendChild(ta); ta.select(); var ok = d.execCommand('copy'); d.body.removeChild(ta); ok ? res() : rej(new Error('copy')); } catch (e) { rej(e); }
      });
    }
    function simLink(ref) {
      if (!ref) return null;
      var p = ref.split('/'), sec = p[0], name = p[1], hit = null;
      if (sec && sections[sec]) sections[sec].forEach(function (it) { if (it.n === name) hit = it; });
      if (!hit) pool.forEach(function (it) { if (it.n === name) hit = it; });
      return hit;
    }
    function simBtn(label, cls, onclick) { var b = el('button', 'sim-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.onclick = onclick; return b; }
    function simToast(msg) {
      var t = simPanel && simPanel.querySelector('.sim-toast'); if (!t) return;
      t.textContent = msg; t.classList.add('show');
      clearTimeout(simToastT); simToastT = setTimeout(function () { t.classList.remove('show'); }, 2000);
    }
    function simFocus() { if (!simPanel) return; try { simPanel.focus({ preventScroll: true }); } catch (e) { simPanel.focus(); } }
    function simStart() {
      if (!simPanel) { print('sim: панель симулятора недоступна на этой странице.', 'err'); return; }
      var list = (SCEN.scenarios || []).slice();
      if (!list.length) { print('sim: сценарии не загружены', 'err'); return; }
      for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = list[i]; list[i] = list[j]; list[j] = t; }
      list = list.slice(0, 6);
      simSt = { list: list, idx: 0, score: 0, phase: 'choice', chosen: null };
      body.style.display = 'none';
      if (keysBar) keysBar.style.display = 'none';
      simPanel.hidden = false;
      if (titleEl) titleEl.textContent = 'guest@teamleads: ~/sim';
      simRender();
      simPanel.focus();
    }
    function simExit() {
      simSt = null;
      if (simPanel) { simPanel.hidden = true; simPanel.innerHTML = ''; }
      body.style.display = '';
      if (keysBar) keysBar.style.display = '';
      setPrompt();
      input.focus();
    }
    function simPick(i) {
      if (!simSt || simSt.phase !== 'choice') return;
      var o = simSt.list[simSt.idx].options[i]; if (!o) return;
      simSt.chosen = i; if (o.good) simSt.score++;
      simSt.phase = 'outcome'; simRender();
    }
    function simAdvance() {
      if (!simSt) return;
      if (simSt.phase === 'outcome') {
        simSt.idx++;
        if (simSt.idx >= simSt.list.length) simSt.phase = 'done';
        else { simSt.phase = 'choice'; simSt.chosen = null; }
        simRender();
      } else if (simSt.phase === 'done') simStart();
    }
    function simShareUI() {
      var url = SCEN.shareUrl || (w.location.origin + '/shell/#sim');
      var played = simSt.phase === 'done' || simSt.idx > 0 || simSt.phase === 'outcome';
      var txt = played ? ('Тимлид-симулятор: ' + simSt.score + '/' + simSt.list.length + ' разумных решений. Пройди и ты: ' + url)
        : ('Тимлид-симулятор: ' + url);
      copyText(txt).then(function () { simToast('Ссылка скопирована'); }, function () { simToast('Не удалось скопировать'); });
    }
    function simHead() {
      var head = el('div', 'sim-head');
      head.appendChild(el('span', 'sim-kicker', SCEN.title || 'Тимлид-симулятор'));
      head.appendChild(el('span', 'sim-progress', simSt.phase === 'done' ? 'итог' : (simSt.idx + 1) + ' / ' + simSt.list.length));
      head.appendChild(simBtn('✕', 'sim-x', simExit));
      simPanel.appendChild(head);
      var bar = el('div', 'sim-bar'), fill = el('span');
      var done = simSt.idx + (simSt.phase === 'outcome' || simSt.phase === 'done' ? 1 : 0);
      fill.style.width = Math.round(done / simSt.list.length * 100) + '%';
      bar.appendChild(fill); simPanel.appendChild(bar);
    }
    function simRender() {
      if (!simPanel) return;
      simPanel.innerHTML = '';
      simHead();
      if (simSt.phase === 'done') { simRenderDone(); simPanel.appendChild(el('div', 'sim-toast')); simFocus(); return; }
      var s = simSt.list[simSt.idx];
      var pr = el('div', 'sim-prompt');
      String(s.prompt || '').split('\n').forEach(function (l) { if (l.trim()) pr.appendChild(el('p', null, l.trim())); });
      simPanel.appendChild(pr);
      var opts = el('div', 'sim-opts');
      s.options.forEach(function (o, i) {
        var b = el('button', 'sim-opt'); b.type = 'button';
        b.appendChild(el('span', 'sim-opt-key', String.fromCharCode(97 + i)));
        b.appendChild(el('span', 'sim-opt-label', o.label));
        if (simSt.phase === 'outcome') {
          b.disabled = true;
          if (i === simSt.chosen) b.className += o.good ? ' is-good' : ' is-bad';
          else if (o.good) b.className += ' is-answer';
        } else {
          b.onclick = (function (idx) { return function () { simPick(idx); }; })(i);
        }
        opts.appendChild(b);
      });
      simPanel.appendChild(opts);
      if (simSt.phase === 'choice') {
        simPanel.appendChild(el('p', 'sim-hint', 'Выберите вариант – клик или клавиша a / b / c'));
        simFocus(); return;
      }
      var o = s.options[simSt.chosen];
      var res = el('div', 'sim-result');
      var verdict = el('p', 'sim-outcome ' + (o.good ? 'is-good' : 'is-bad'));
      verdict.appendChild(el('span', 'sim-mark', o.good ? '✓' : '✗'));
      verdict.appendChild(d.createTextNode(' ' + o.outcome));
      res.appendChild(verdict);
      if (s.lesson) { var ls = el('p', 'sim-lesson'); ls.appendChild(d.createTextNode('💡 ' + s.lesson)); res.appendChild(ls); }
      if (o.votes != null) {
        var vr = el('div', 'sim-votes');
        var vbar = el('span', 'sim-votebar'), vf = el('span'); vf.style.width = o.votes + '%'; vbar.appendChild(vf);
        vr.appendChild(vbar); vr.appendChild(el('span', 'sim-votenum', 'так выбрали ' + o.votes + '%'));
        res.appendChild(vr);
      }
      var hit = simLink(s.link);
      if (hit) { var rm = el('div', 'sim-readmore'); rm.appendChild(el('span', 'dim', 'разбор → ')); rm.appendChild(link(hit.u, hit.t)); res.appendChild(rm); }
      simPanel.appendChild(res);
      var last = simSt.idx >= simSt.list.length - 1;
      var acts = el('div', 'sim-actions');
      acts.appendChild(simBtn(last ? 'Итог →' : 'Дальше →', 'primary', simAdvance));
      acts.appendChild(simBtn('Поделиться', '', simShareUI));
      acts.appendChild(simBtn('Выйти', 'ghost', simExit));
      simPanel.appendChild(acts);
      simPanel.appendChild(el('div', 'sim-toast'));
      simFocus();
    }
    function simRenderDone() {
      var n = simSt.list.length, sc = simSt.score;
      var card = el('div', 'sim-done');
      card.appendChild(el('p', 'sim-score', 'ИТОГ: ' + sc + ' / ' + n + ' разумных решений'));
      card.appendChild(el('p', 'sim-verdict', sc === n ? 'Чистый прогон. Тимлид не кодит – тимлид анблокает.'
        : sc >= Math.ceil(n / 2) ? 'Крепко. Но часть развилок стоит обсудить вживую.'
          : 'Есть над чем подумать – как раз тема для встречи.'));
      var funnel = el('div', 'sim-funnel');
      funnel.appendChild(d.createTextNode('Продолжить вживую: '));
      var j = el('a', null, 'join'); j.href = '/join/'; funnel.appendChild(j);
      funnel.appendChild(d.createTextNode(' · ')); funnel.appendChild(link(TG, 'telegram', true));
      card.appendChild(funnel);
      var acts = el('div', 'sim-actions');
      acts.appendChild(simBtn('Ещё раз', 'primary', simStart));
      acts.appendChild(simBtn('Поделиться', '', simShareUI));
      acts.appendChild(simBtn('Выйти', 'ghost', simExit));
      card.appendChild(acts);
      simPanel.appendChild(card);
    }

    var commands = {
      help: function () {
        print('НАВИГАЦИЯ', 'accent');
        [
          ['ls [раздел]', 'что вокруг / содержимое раздела'],
          ['cd <раздел>', 'войти в раздел (cd .. — наверх)'],
          ['open <стр>', 'открыть страницу в браузере'],
          ['cat <стр>', 'показать markdown страницы здесь'],
          ['pwd', 'где я сейчас'],
          ['tree', 'всё дерево сайта'],
          ['find <слово>', 'поиск по заголовкам'],
          ['grep <слово>', 'полнотекстовый поиск по страницам'],
          ['latest', 'последняя встреча'],
          ['random', 'случайный материал']
        ].forEach(function (r) { print('  ' + pad(r[0], 16) + r[1]); });
        print(''); print('УТИЛИТЫ', 'accent');
        [
          ['claude <вопрос>', 'спросить Claude (офлайн-демо)'],
          ['codex <вопрос>', 'спросить Codex (офлайн-демо)'],
          ['salary', 'зарплатные вилки: salary senior backend'],
          ['sim', 'тимлид-симулятор: развилки и решения'],
          ['principles', 'доктрина сообщества: принципы из реальных кейсов'],
          ['tools', 'топ инструментов сообщества'],
          ['friends', 'дружественные сообщества и сервисы'],
          ['join', 'ссылка на встречу'],
          ['telegram', 'наш Telegram'],
          ['contribute', 'код сайта на GitHub'],
          ['man <cmd>', 'справка по команде'],
          ['neofetch / date', 'инфо / время'],
          ['clear', 'очистить (Ctrl+L)'],
          ['home', 'на главную сайта']
        ].forEach(function (r) { print('  ' + pad(r[0], 16) + r[1]); });
        print(''); print('Пасхалки: fortune, vim, top, sudo, git blame, coffee, 42, rm -rf /.', 'dim');
      },
      ls: function (a) {
        var where = (a[0] || '').replace(/^\/|\/$/g, '') || cwd;
        if (!where) {
          print('drwxr-xr-x  разделы:', 'dim');
          sectionNames.forEach(function (s) {
            var n = el('span'); n.appendChild(el('span', 'dim', '  ')); n.appendChild(link('/' + s + '/', pad(s + '/', 13))); n.appendChild(el('span', 'dim', (sections[s] || []).length + ' материалов')); printNode(n);
          });
          if (linkNames.length) { print(''); print('-rw-r--r--  страницы:', 'dim'); linkNames.forEach(function (k) { var n = el('span'); n.appendChild(el('span', 'dim', '  ')); n.appendChild(link(links[k], k)); printNode(n); }); }
          print(''); print('cd <раздел> — войти, open <страница> — открыть, find <слово> — поиск.', 'dim');
          return;
        }
        if (sections[where]) {
          var items = sections[where];
          if (!items.length) { print('пусто', 'dim'); return; }
          items.forEach(function (it) {
            var n = el('span'); n.appendChild(el('span', 'dim', '  ')); n.appendChild(link(it.u, pad(it.n, 26)));
            if (it.d) n.appendChild(el('span', 'dim', it.d + '  ')); n.appendChild(d.createTextNode(it.t)); printNode(n);
          });
          return;
        }
        print('ls: нет такого раздела: ' + where, 'err');
      },
      cd: function (a) {
        var t = (a[0] || '').replace(/\/+$/, '');
        if (t === '' || t === '~' || t === '/' || t === '..') { cwd = ''; setPrompt(); return; }
        if (t.indexOf('/') !== -1) { return commands.open(a); }
        if (sections[t]) { cwd = t; setPrompt(); return; }
        if (links[t]) { go(links[t]); return; }
        print('cd: нет такого раздела: ' + t, 'err');
        print('доступно: ' + sectionNames.concat(linkNames).join(', '), 'dim');
      },
      open: function (a) {
        var arg = (a[0] || '').replace(/^\/|\/$/g, '');
        if (!arg) { print('open: укажите страницу. Список — ls.', 'err'); return; }
        if (links[arg]) { go(links[arg]); return; }
        var sec = null, name = arg;
        if (arg.indexOf('/') !== -1) { var p = arg.split('/'); sec = p[0]; name = p[1]; }
        else if (cwd) { sec = cwd; }
        else if (sections[arg]) { return commands.cd(a); }
        var hit = null;
        if (sec && sections[sec]) sections[sec].forEach(function (it) { if (it.n === name) hit = it; });
        if (!hit) pool.forEach(function (it) { if (it.n === name) hit = it; });
        if (hit) { go(hit.u); return; }
        print('open: не найдено: ' + arg, 'err');
      },
      cat: function (a) {
        var raw = false;
        a = a.filter(function (x) { if (x === '--raw' || x === '-r') { raw = true; return false; } return true; });
        var arg = (a[0] || '').replace(/^\/|\/$/g, '');
        if (!arg) { print('cat: укажите страницу. Список — ls.', 'err'); return; }
        if (links[arg]) { print('cat: «' + arg + '» — служебная страница без markdown. Откройте: open ' + arg, 'dim'); return; }
        var sec = null, name = arg;
        if (arg.indexOf('/') !== -1) { var p = arg.split('/'); sec = p[0]; name = p[1]; }
        else if (cwd) { sec = cwd; }
        var hit = null;
        if (sec && sections[sec]) sections[sec].forEach(function (it) { if (it.n === name) hit = it; });
        if (!hit) pool.forEach(function (it) { if (it.n === name) hit = it; });
        if (!hit) { print('cat: не найдено: ' + arg, 'err'); return; }
        if (!w.fetch) { print('cat: fetch недоступен в этом браузере — попробуйте open ' + arg, 'err'); return; }
        var url = hit.u + 'index.md';
        print('— ' + url + ' —', 'dim');
        var loading = print('загрузка…', 'dim');
        w.fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(function (txt) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          var lines = txt.replace(/\s+$/, '').split('\n'), CAP = 400;
          lines.slice(0, CAP).forEach(function (l) { if (raw) { print(l); return; } var node = mdLine(l); if (node) out.appendChild(node); });
          body.scrollTop = body.scrollHeight;
          if (lines.length > CAP) print('… обрезано (' + (lines.length - CAP) + ' строк). open ' + arg + ' — полная версия.', 'dim');
        }).catch(function (e) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          print('cat: не удалось загрузить — ' + e.message, 'err');
        });
      },
      pwd: function () { print(pathStr()); },
      tree: function () {
        print('teamleads.kz', 'accent');
        var rows = sectionNames.map(function (s) { return [s, '/' + s + '/', (sections[s] || []).length]; })
          .concat(linkNames.map(function (k) { return [k, links[k], null]; }));
        rows.forEach(function (r, i) {
          var n = el('span'); n.appendChild(el('span', 'cy', (i === rows.length - 1 ? '└─ ' : '├─ ')));
          n.appendChild(link(r[1], r[0])); n.appendChild(el('span', 'dim', r[2] != null ? '  (' + r[2] + ')' : '')); printNode(n);
        });
      },
      find: function (a) {
        var q = a.join(' ').toLowerCase().trim();
        if (!q) { print('find: укажите запрос. Напр.: find бас-фактор', 'dim'); return; }
        var hits = [];
        sectionNames.forEach(function (s) { (sections[s] || []).forEach(function (it) { if ((it.t || '').toLowerCase().indexOf(q) !== -1 || (it.n || '').toLowerCase().indexOf(q) !== -1) hits.push([s, it]); }); });
        linkNames.forEach(function (k) { if (k.indexOf(q) !== -1) hits.push([null, { n: k, u: links[k], t: k }]); });
        if (!hits.length) { print('ничего не найдено по «' + q + '»', 'dim'); return; }
        print('найдено ' + hits.length + ':', 'dim');
        hits.forEach(function (h) { var n = el('span'); n.appendChild(el('span', 'dim', '  ')); n.appendChild(link(h[1].u, (h[0] ? h[0] + '/' : '') + h[1].n)); n.appendChild(el('span', 'dim', '  ' + (h[1].t || ''))); printNode(n); });
      },
      grep: function (a) {
        var q = a.join(' ').toLowerCase().trim();
        if (!q) { print('grep: укажите слово. Напр.: grep бас-фактор', 'dim'); return; }
        if (!w.fetch) { print('grep: fetch недоступен — попробуйте find <слово>', 'err'); return; }
        function search(items) {
          var hits = [];
          items.forEach(function (p) {
            var b = (p.b || '').toLowerCase(), pos = b.indexOf(q), inTitle = (p.t || '').toLowerCase().indexOf(q) !== -1;
            if (pos === -1 && !inTitle) return;
            var snip = '';
            if (pos !== -1) { var st = Math.max(0, pos - 32); snip = (st > 0 ? '…' : '') + p.b.substr(st, 90).replace(/\s+/g, ' ').trim() + '…'; }
            hits.push({ u: p.u, t: p.t, s: p.s, snip: snip });
          });
          if (!hits.length) { print('grep: ничего не найдено по «' + q + '»', 'dim'); return; }
          print('найдено ' + hits.length + ':', 'dim');
          hits.slice(0, 12).forEach(function (h) {
            var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(link(h.u, h.s + '/' + h.t)); printNode(n);
            if (h.snip) print('   ' + h.snip, 'dim');
          });
          if (hits.length > 12) print('… ещё ' + (hits.length - 12) + '. Уточните запрос.', 'dim');
        }
        if (SEARCH_INDEX) { search(SEARCH_INDEX); return; }
        var loading = print('grep: индексирую…', 'dim');
        w.fetch('/shell-index.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
          SEARCH_INDEX = j;
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          search(j);
        }).catch(function (e) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          print('grep: индекс недоступен — ' + e.message, 'err');
        });
      },
      latest: function () { var ev = sections.events || []; if (ev.length) { print('последняя встреча: ' + ev[0].t, 'cy'); go(ev[0].u); } else print('latest: нет данных', 'err'); },
      random: function () { if (!pool.length) { print('random: нет данных', 'err'); return; } var r = pool[Math.floor(Math.random() * pool.length)]; print('случайный выбор: ' + r.t, 'cy'); go(r.u); },
      tools: function () {
        print('Топ инструментов, которые советует сообщество:', 'accent');
        [
          ['Claude Code (Opus)', 'AI-разработка и рефакторинг под контролем', 'https://claude.com/claude-code'],
          ['Hetzner', 'дешёвый и стабильный хостинг вместо локальных провайдеров', 'https://www.hetzner.com/'],
          ['GitHub / Forgejo', 'код всегда в общем репозитории — лекарство от бас-фактора', 'https://forgejo.org/'],
          ['SonarQube', 'статанализ и дисциплина декомпозиции', 'https://www.sonarsource.com/'],
          ['Swagger / OpenAPI', 'документация API, по которой конформятся новички', 'https://swagger.io/'],
          ['Sales Navigator', 'выход на западных заказчиков через прогрев', 'https://business.linkedin.com/sales-solutions/sales-navigator'],
          ['techinterview.space', 'зарплаты по рынку и подготовка к собеседованиям', 'https://techinterview.space/']
        ].forEach(function (t) { var n = el('span'); n.appendChild(el('span', 'accent', '• ')); n.appendChild(link(t[2], t[0], true)); n.appendChild(el('span', 'dim', ' — ' + t[1])); printNode(n); });
      },
      friends: function () {
        if (!FRIENDS.length) { print('friends: список пуст', 'dim'); return; }
        print('Дружественные сообщества и сервисы:', 'accent');
        FRIENDS.forEach(function (f) {
          var dash = (f.t || '').split(' — '); var name = dash[0]; var desc = dash.slice(1).join(' — ');
          var n = el('span'); n.appendChild(el('span', 'accent', '• ')); n.appendChild(link(f.u, name, true));
          if (desc) n.appendChild(el('span', 'dim', ' — ' + desc)); printNode(n);
        });
      },
      salary: function (a) {
        var grades = SAL.grades || {}, roles = SAL.roles || {}, aliases = SAL.aliases || {}, titles = SAL.roleTitles || {};
        var gradeNames = Object.keys(grades), roleNames = Object.keys(roles);
        if (!gradeNames.length || !roleNames.length) { print('salary: данные о зарплатах не загружены', 'err'); return; }
        // Resolve every token to a grade or a role (via aliases); last one wins.
        var grade = '', role = '';
        a.forEach(function (raw) {
          var t = (aliases[raw.toLowerCase()] || raw.toLowerCase());
          if (grades[t]) grade = t; else if (roles[t]) role = t;
        });
        if (!grade && !role) {
          print('Зарплатные вилки сообщества — ' + (SAL.unit || ''), 'accent');
          print('Использование: salary <грейд> <роль>. Напр.: salary senior backend', 'hint');
          print('  грейды: ' + gradeNames.join(', '), 'dim');
          print('  роли:   ' + roleNames.join(', '), 'dim');
          return;
        }
        if (!grade) { grade = 'senior'; print('грейд не указан — беру senior', 'dim'); }
        if (!role) { role = 'backend'; print('роль не указана — беру backend', 'dim'); }
        var base = grades[grade], k = roles[role];
        if (!base || k == null) { print('salary: нет данных для этой пары', 'err'); return; }
        var vals = base.map(function (v) { return Math.round(v * k / 10000) * 10000; });
        var cur = SAL.currency || '₸', top = vals[2] || 1;
        function fmt(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + cur; }
        function bar(v) { var w = Math.max(1, Math.round(v / top * 14)); return new Array(w + 1).join('▓') + new Array(14 - w + 1).join('░'); }
        print((titles[role] || role) + ' · ' + grade + ' · ' + (SAL.unit || ''), 'accent');
        print('────────────────────────────────────────', 'dim');
        [['p25', vals[0]], ['med', vals[1]], ['p75', vals[2]]].forEach(function (r) {
          print('  ' + pad(r[0], 5) + bar(r[1]) + '   ' + fmt(r[1]));
        });
        print('────────────────────────────────────────', 'dim');
        if (SAL.disclaimer) print(SAL.disclaimer, 'dim');
        if (SAL.source && SAL.source.url) { var n = el('span'); n.appendChild(el('span', 'dim', 'Сверить → ')); n.appendChild(link(SAL.source.url, SAL.source.title || SAL.source.url, true)); printNode(n); }
      },
      claude: function (a) {
        var q = a.join(' ').trim();
        if (w.TeamleadsClaude) {
          print('открываю Claude' + (q ? ' с вашим вопросом' : '') + '…', 'cy');
          w.TeamleadsClaude.open(q);
          return;
        }
        // Fallback if the Claude overlay isn't loaded — search content inline.
        print('Claude-окно недоступно — ищу прямо здесь.', 'dim');
        var words = q.toLowerCase().split(/\s+/).filter(function (x) { return x.length > 2; });
        var hits = [];
        sectionNames.forEach(function (s) {
          (sections[s] || []).forEach(function (it) {
            var t = (it.t || '').toLowerCase();
            if (words.some(function (x) { return t.indexOf(x) !== -1; })) hits.push(it);
          });
        });
        if (hits.length) { hits.slice(0, 4).forEach(function (it) { var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(link(it.u, it.t)); printNode(n); }); }
        else { print('Ничего не нашёл — попробуйте find <слово> или раздел articles.', 'dim'); }
      },
      codex: function (a) {
        var q = a.join(' ').trim();
        if (w.TeamleadsCodex) { print('открываю Codex' + (q ? ' с вашим вопросом' : '') + '…', 'cy'); w.TeamleadsCodex.open(q); return; }
        print('Codex-окно недоступно на этой странице.', 'dim');
      },
      join: function () { print('Еженедельная встреча, среда 17:00 (Астана).', 'cy'); go('/join/'); },
      telegram: function () { print('открываю Telegram…', 'ok'); printNode(link(TG, TG, true)); w.open(TG, '_blank', 'noopener'); },
      contribute: function () {
        var url = 'https://github.com/belyaevsa/teamleads-2025';
        print('Сайт открытый — буду рад правкам и pull request:', 'cy');
        printNode(link(url, url, true));
        w.open(url, '_blank', 'noopener');
      },
      whoami: function () {
        print('«Тимлид не кодит» — сообщество тимлидов, EM и CTO Казахстана.', 'accent');
        var facts = [
          ['состав', '400+ практик: Kaspi, Kolesa, DAR, Chocofamily, InDrive и другие'],
          ['формат', 'еженедельные встречи, разбор реальных кейсов, отчёты публикуем открыто'],
          ['о чём', 'люди · архитектура · найм · процессы · карьера — без слайдов и хайпа'],
          ['с чего начать', 'sim · salary senior backend · principles · latest']
        ];
        facts.forEach(function (r) { var n = el('span'); n.appendChild(el('span', 'accent', pad(r[0], 15))); n.appendChild(d.createTextNode(r[1])); printNode(n); });
        print('');
        print('whoami → guest. …но мы-то видим тимлида. Добро пожаловать.', 'dim');
      },
      principles: function () {
        print('Доктрина «Тимлид не кодит» — выжимка из реальных кейсов сообщества.', 'accent');
        print('');
        var p = [
          ['Сеньора берут, не дают — лычка не равна уровню.', 'карьера'],
          ['Тимлид — не «сеньор плюс подчинённые». Тимлид и техлид — разные работы.', 'роли'],
          ['Бас-фактор — плата за экономию, отложенная во времени. Знание — живому дублёру, не в документ.', 'бас-фактор'],
          ['Метрики врут не потому что ложны, а потому что вы смотрите не туда.', 'метрики'],
          ['Сначала диагноз (не хочет / забывает / не видит ценности), потом лекарство.', 'процессы'],
          ['Ответственность не передаётся лекцией — дайте обжечься под присмотром и научите откатывать.', 'рост'],
          ['Дорогая оценка часто прячется за страх. Проверяйте её дешёвым совместным экспериментом.', 'оценки'],
          ['Влияние — не подчинение и не саботаж, а аргументы и информированный выбор.', 'стейкхолдеры'],
          ['Нанимать стоит под конкретную перегруженную роль, а не чтобы «стало полегче».', 'найм'],
          ['Самый зрелый способ внедрить ИИ — иногда внедрить его временно: разведать и уйти.', 'AI'],
          ['Не ставьте на один сценарий. Ценна команда, сильная при любом будущем.', 'AI · команда'],
          ['Сначала инженер, потом — продуктовый. Гемба вместо хайпа.', 'продукт']
        ];
        p.forEach(function (r, i) {
          var n = el('div', 'ln');
          n.appendChild(el('span', 'accent', pad(String(i + 1), 3)));
          n.appendChild(d.createTextNode(r[0] + ' '));
          n.appendChild(el('span', 'dim', '— ' + r[1]));
          printNode(n);
        });
        print('');
        print('Каждый принцип — развернутый разбор в статьях: find <тема> или cat articles/…', 'dim');
      },
      date: function () { print(new Date().toString()); },
      echo: function (a) { print(a.join(' ')); },
      history: function () { if (!hist.length) { print('история пуста', 'dim'); return; } hist.forEach(function (c, i) { print('  ' + pad(i + 1, 4) + c); }); },
      clear: function () { out.innerHTML = ''; },
      man: function (a) {
        var pages = {
          ls: 'ls [раздел] — содержимое текущего или указанного раздела.',
          cd: 'cd <раздел> — войти. cd .. — наверх. cd — в корень.',
          open: 'open <страница> — открыть страницу в браузере.',
          cat: 'cat <страница> — показать markdown-версию страницы с подсветкой (заголовки, цитаты, ссылки). cat <страница> --raw — без подсветки.',
          pwd: 'pwd — текущий путь.',
          tree: 'tree — всё дерево сайта со счётчиками.',
          find: 'find <слово> — поиск по заголовкам и именам.',
          grep: 'grep <слово> — полнотекстовый поиск по содержимому всех страниц.',
          latest: 'latest — открыть последнюю встречу.',
          random: 'random — открыть случайный материал.',
          tools: 'tools — топ инструментов сообщества.',
          salary: 'salary <грейд> <роль> — зарплатная вилка (p25/медиана/p75). Напр.: salary senior backend. Грубые оценки сообщества.',
          sim: 'sim — тимлид-симулятор: развилки из реальных споров сообщества. Выбор a/b/c, [s] поделиться, [q] выйти. Синонимы: simulator, game, play.',
          principles: 'principles — доктрина сообщества: принципы управления, выжатые из реальных кейсов и статей. Синонимы: doctrine, manifesto.',
          friends: 'friends — дружественные сообщества и сервисы (Claude Community KZ, techinterview.space).',
          claude: 'claude <вопрос> — Claude-окно: офлайн-ответ по материалам сообщества. Ищет по полному тексту (как grep), показывает сниппеты и ссылки.',
          codex: 'codex <вопрос> — Codex-окно: офлайн-ответ по материалам сообщества. Ищет по полному тексту (как grep), показывает сниппеты и ссылки.',
          join: 'join — ссылка на еженедельную встречу.',
          contribute: 'contribute — открыть репозиторий сайта на GitHub (правки, PR). Синонимы: github, gh, pr.',
          fortune: 'fortune — случайная мудрость тимлида.',
          vim: 'vim — открыть редактор. Выход: :q (если повезёт).',
          sudo: 'sudo — для guest недоступно.',
          help: 'help — список всех команд.'
        };
        var k = (a[0] || '').toLowerCase();
        if (!k) { print('Использование: man <команда>. Напр.: man tree', 'dim'); return; }
        print(pages[k] || ('man: нет страницы для ' + k), pages[k] ? null : 'err');
      },
      neofetch: function () {
        var info = [['OS', 'Teamleads OS (rolling)'], ['Host', 'teamleads.kz'], ['Shell', 'tlsh 1.0'], ['Разделы', sectionNames.length + ' + ' + linkNames.length + ' страниц'], ['Материалов', pool.length], ['Встречи', 'каждую среду, 17:00 Астана']];
        var art = ['     ◇◇◇   ', '   ◇     ◇ ', '  ◇   ◇   ◇', '   ◇     ◇ ', '     ◇◇◇   ', '          '];
        info.forEach(function (r, i) { var n = el('span'); n.appendChild(el('span', 'cy', (art[i] || '          ') + '  ')); n.appendChild(el('span', 'accent', r[0] + ': ')); n.appendChild(d.createTextNode(String(r[1]))); printNode(n); });
      },
      fortune: function () {
        var f = ['Сеньора не дают — сеньора берут.', 'Бас-фактор — это плата за экономию, отложенная во времени.', 'Документ говорит «что». Человек знает «почему».', 'Срочно — значит, некачественно. Автоматически.', 'За большим хайпом скрывается большой попил.', 'Тимлид и техлид — две разные работы с одним названием.', 'Стоять надо не там, где интересно, а у кормушки с деньгами.', 'Молчаливое большинство, которое читает, — здоровый показатель.'];
        print('« ' + f[Math.floor(Math.random() * f.length)] + ' »', 'accent');
      },
      sim: function () { simStart(); },
      vim: function () { vimMode = true; print('~', 'dim'); print('~  VIM — Vi IMproved', 'dim'); print('~', 'dim'); print('Вы в vim. Удачи с выходом: :q (или :q!).', 'hint'); },
      top: function () {
        print('PID   COMMAND           %CPU  STATE', 'dim');
        [['1', 'daily-standup', '38', 'running'], ['7', 'retro', '12', 'blocked'], ['42', 'coffee', '73', 'critical'], ['99', 'code-review', '21', 'waiting'], ['100', 'tg-notifications', '55', 'running']].forEach(function (p) { print('  ' + pad(p[0], 5) + pad(p[1], 18) + pad(p[2], 6) + p[3]); });
        print('тимлид не кодит — тимлид анблокает.', 'dim');
      },
      sudo: function () { print('guest отсутствует в файле sudoers. Инцидент запротоколирован. 🚨', 'err'); },
      git: function (a) {
        if (a[0] === 'blame') print('fatal: винить некого — 404 это не баг, а фича вашего URL.', 'dim');
        else if (a[0] === 'push') print('Everything up-to-date. А страница всё равно не та.', 'dim');
        else print("git: '" + (a[0] || '') + "' — не команда здесь. Попробуйте git blame.", 'err');
      },
      coffee: function () { print('☕  Тимлид не кодит. Тимлид пьёт кофе и анблокает команду.', 'accent'); },
      rm: function (a) {
        var s = ' ' + a.join(' ') + ' ';
        if (/ -[a-z]*[rf][a-z]* /.test(s) && / \/ /.test(s)) { print('rm: удаляю / …', 'err'); print('…', 'dim'); setTimeout(function () { print('обошлось. В этот раз. На проде так не надо.', 'ok'); }, reduced ? 0 : 550); return; }
        print('rm: давайте без rm здесь. Это не тот терминал.', 'dim');
      },
      '42': function () { print('Ответ на главный вопрос жизни, вселенной и всего такого — 42.', 'accent'); print('Но запрошенной страницы среди ответов нет.', 'dim'); },
      home: function () { go('/'); },
      exit: function () { go('/'); }
    };
    commands.go = commands.open; commands.search = commands.find;
    commands.answer = commands['42']; commands.vi = commands.vim;
    commands.ai = commands.claude; commands.ask = commands.claude;
    commands.gpt = commands.codex; commands.openai = commands.codex;
    commands.github = commands.contribute; commands.gh = commands.contribute; commands.pr = commands.contribute;
    commands.simulator = commands.sim; commands.game = commands.sim; commands.play = commands.sim;
    commands.about = commands.whoami; commands.manifesto = commands.principles; commands.doctrine = commands.principles;

    // Analytics: count each typed command as a Yandex.Metrika goal (counter 106055675).
    // Sends only the command NAME (first token) — never the free-text arguments — so no PII.
    function track(str) {
      try {
        var name = (str.split(/\s+/)[0] || '').toLowerCase();
        if (!name) return;
        var known = commands.hasOwnProperty(name);
        if (w.ym) w.ym(106055675, 'reachGoal', 'shell_command', { command: name, known: known ? 'yes' : 'no' });
      } catch (e) {}
    }

    // Make the address bar a shareable link for the command just run: a /s/<id>/
    // OG-card page when one exists, else /shell/#<cmd>. Copying the URL = sharing.
    function syncUrl(cmd) {
      try {
        if (!(w.history && w.history.replaceState)) return;
        var verb = (cmd.split(/\s+/)[0] || '').toLowerCase();
        var id = SHARE[verb];
        var url = id ? (w.location.origin + '/s/' + id + '/') : (w.location.origin + '/shell/#' + encodeURIComponent(cmd));
        w.history.replaceState(null, '', url);
        if (!hintedShare) { hintedShare = true; print('адрес в строке браузера обновился — это ссылка на эту команду, делитесь', 'dim'); }
      } catch (e) {}
    }

    function run(raw, noTrack) {
      var str = raw.trim();
      var p = el('div', 'ln'); var pr = el('span', 'term-prompt'); pr.innerHTML = '<b>guest@teamleads</b>:' + pathStr() + '$ ';
      p.appendChild(pr); p.appendChild(d.createTextNode(str)); out.appendChild(p);
      if (vimMode) {
        if (/^:(q|q!|wq|wq!|x)$/.test(str)) { vimMode = false; print('вышли из vim. Невозможное возможно.', 'ok'); }
        else print('E37: незаписанные изменения. :q! чтобы выйти не сохраняя.', 'err');
        body.scrollTop = body.scrollHeight; return;
      }
      if (!str) { body.scrollTop = body.scrollHeight; return; }
      if (!noTrack) { hist.push(str); track(str); saveHist(); syncUrl(str); }
      hpos = hist.length;
      var parts = str.split(/\s+/), cmd = parts[0].toLowerCase(), args = parts.slice(1);
      if (commands.hasOwnProperty(cmd)) { try { commands[cmd](args); } catch (e) { print('ошибка: ' + e.message, 'err'); } }
      else print(cmd + ': команда не найдена. help — список команд.', 'err');
      body.scrollTop = body.scrollHeight;
    }

    function complete() {
      var v = input.value;
      // Repeated Tab on an unchanged value → cycle to the next candidate
      if (comp.full !== null && v === comp.full && comp.list.length > 1) {
        comp.idx = (comp.idx + 1) % comp.list.length;
        input.value = comp.base + comp.list[comp.idx];
        comp.full = input.value;
        return;
      }
      var parts = v.split(/\s+/), frag = parts[parts.length - 1], pool;
      if (parts.length <= 1) {
        pool = Object.keys(commands);
      } else if (frag.indexOf('/') !== -1) {
        // "section/partial" → complete page names within that section
        var s = frag.split('/')[0];
        pool = (sections[s] || []).map(function (it) { return s + '/' + it.n; });
      } else {
        pool = sectionNames.concat(linkNames);
        if (cwd && sections[cwd]) pool = pool.concat(sections[cwd].map(function (it) { return it.n; }));
      }
      if (!frag) { if (pool.length) print(pool.slice(0, 40).join('   '), 'dim'); comp.full = null; return; }
      var hits = pool.filter(function (c) { return c.indexOf(frag) === 0; });
      if (!hits.length) { comp.full = null; return; }
      comp.base = parts.slice(0, parts.length - 1).join(' '); if (comp.base) comp.base += ' ';
      comp.list = hits; comp.idx = 0;
      input.value = comp.base + hits[0];     // fill the first match…
      comp.full = input.value;
      if (hits.length > 1) print(hits.slice(0, 40).join('   '), 'dim');  // …and show the rest (Tab cycles them)
    }

    input.addEventListener('keydown', function (e) {
      if (simSt) return;  // simulator panel owns the keyboard while active
      if (e.key === 'Enter') { run(input.value); input.value = ''; }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); histPrev(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); histNext(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); commands.clear(); }
    });

    // Simulator keyboard: a/b/c (or 1/2/3) to choose, Enter to advance, s share, q/Esc quit.
    root.addEventListener('keydown', function (e) {
      if (!simSt) return;
      var k = (e.key || '');
      if (k === 'Escape' || k.toLowerCase() === 'q') { e.preventDefault(); simExit(); return; }
      if (k.toLowerCase() === 's') { e.preventDefault(); simShareUI(); return; }
      if (simSt.phase === 'choice') {
        var idx = 'abcdefgh'.indexOf(k.toLowerCase());
        if (idx < 0 && /^[1-9]$/.test(k)) idx = parseInt(k, 10) - 1;
        if (idx >= 0 && idx < simSt.list[simSt.idx].options.length) { e.preventDefault(); simPick(idx); }
      } else if (k === 'Enter') {
        if (e.target && e.target.tagName === 'BUTTON') return;  // let the focused button fire its own click
        e.preventDefault(); simAdvance();
      }
    });
    body.addEventListener('click', function (e) { if (e.target.tagName !== 'A') input.focus(); });

    // Mobile helper bar — taps map to the same actions as the hardware keys.
    var keysBar = root.querySelector('[data-term-keys]');
    if (keysBar) keysBar.addEventListener('click', function (e) {
      var k = e.target && e.target.getAttribute ? e.target.getAttribute('data-k') : null;
      if (!k) return;
      input.focus();
      if (k === 'tab') complete();
      else if (k === 'up') histPrev();
      else if (k === 'down') histNext();
      else if (k === 'run') { run(input.value); input.value = ''; }
      else if (k === 'clear') commands.clear();
    });

    // A shareable deep-link can carry a command: /shell/#cat events/meetup-2026-06-24
    // or /shell/?cmd=cat%20articles/... — it runs once the shell is ready.
    function urlCommand() {
      try {
        var h = (w.location.hash || '').replace(/^#/, '');
        if (h) return decodeURIComponent(h).trim();
        var m = (w.location.search || '').match(/[?&]cmd=([^&]*)/);
        if (m) return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
      } catch (e) {}
      return '';
    }
    function ready() {
      if (line) line.hidden = false; input.focus();
      var urlcmd = urlCommand();
      if (urlcmd) {
        // Assistant share links (claude/codex …) land in the terminal with the command
        // ENTERED in the prompt, ready to run — don't auto-fire someone else's question.
        // Other share links (cat, sim, salary …) still auto-run.
        var verb0 = (urlcmd.split(/\s+/)[0] || '').toLowerCase();
        if (/^(claude|codex|ai|ask|gpt|openai)$/.test(verb0)) {
          input.value = urlcmd;
          try { input.setSelectionRange(urlcmd.length, urlcmd.length); } catch (e) {}
          input.focus();
          return;
        }
        setTimeout(function () { run(urlcmd); }, reduced ? 0 : 150); return;
      }
      if (mode === 'full') setTimeout(function () { run('ls', true); }, reduced ? 0 : 140);
    }
    var boot;
    if (mode === '404') {
      var path = w.location.pathname || '/404';
      boot = [['$ curl -i https://teamleads.kz' + path, 'cy'], ['HTTP/1.1 404 Not Found', 'dim'], ['content-type: text/html; charset=utf-8', 'dim'], ['', null], ['Ресурс не найден. Но раз вы здесь — поднимаем сессию.', null], ['Это Shell Mode: навигируйте по сайту прямо отсюда. help — команды.', 'hint'], ['', null]];
    } else {
      boot = [['Teamleads Shell — навигация по сайту из терминала.', 'cy'], ['help — команды · ls — осмотреться · open <стр> — открыть · find <слово> — поиск.', 'hint'], ['С чего начать: sim — симулятор развилок · salary senior backend · principles — доктрина.', 'hint'], ['', null]];
    }
    function bootSeq(i) { if (i >= boot.length) { ready(); return; } print(boot[i][0], boot[i][1]); setTimeout(function () { bootSeq(i + 1); }, reduced ? 0 : 200); }
    setPrompt(); bootSeq(0);

    // Let other UI (the Claude/Codex assistants) run a command in this live terminal.
    if (mode === 'full') { w.TeamleadsShell = w.TeamleadsShell || {}; w.TeamleadsShell.run = function (c) { if (simSt) simExit(); input.value = ''; run(String(c || '')); }; }
  }

  function autoMount() { var ns = d.querySelectorAll('[data-term]'); for (var i = 0; i < ns.length; i++) mount(ns[i]); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', autoMount); else autoMount();
  w.TeamleadsShell = w.TeamleadsShell || {}; w.TeamleadsShell.mount = mount;
})(window, document);
