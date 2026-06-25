/*!
 * Teamleads Shell – a tiny, dependency-free terminal that turns the site into a
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
    // Windows visitors get a PowerShell skin (blue theme + PS prompt + PS aliases);
    // everyone else keeps the bash-style shell. Detect via UA-CH, then platform/UA.
    var WIN = false;
    try {
      var uad = w.navigator && w.navigator.userAgentData;
      var plat = (uad && uad.platform) || (w.navigator && w.navigator.platform) || '';
      var ua = (w.navigator && w.navigator.userAgent) || '';
      WIN = /win/i.test(plat) || /Windows/i.test(ua);
    } catch (e) {}
    if (WIN) root.classList.add('term--ps');
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
    var QUESTIONS = [];  // open discussion backlog (events' nextQuestions) → `discuss`
    try { QUESTIONS = JSON.parse(root.getAttribute('data-questions') || '[]') || []; } catch (e) { QUESTIONS = []; }
    var VOICES = [];     // curated chat quotes (data/voices.yaml) → `voices`
    try { VOICES = JSON.parse(root.getAttribute('data-voices') || '[]') || []; } catch (e) { VOICES = []; }
    var COMPANIES = [];  // pre-fetched companies with reviews (data/companies.json) → `companies`
    try { COMPANIES = JSON.parse(root.getAttribute('data-companies') || '[]') || []; } catch (e) { COMPANIES = []; }
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
    // A link whose column padding sits OUTSIDE the anchor, so hover-underline covers only the name.
    function linkpad(href, name, width, ext) {
      var f = d.createDocumentFragment();
      f.appendChild(link(href, name, ext));
      var gap = width - String(name).length;
      f.appendChild(el('span', 'dim', gap > 0 ? new Array(gap + 1).join(' ') : ' '));
      return f;
    }
    // ── techinterview.space company reviews (data source attribution required) ──
    var TIAPI = 'https://api.techinterview.space/api';
    var TIWEB = 'https://techinterview.space';
    function linkTI(path, text) { return link(TIWEB + path, text, true); }
    var RU_MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    function fmtDate(iso) { if (!iso) return ''; var t = new Date(iso); if (isNaN(t.getTime())) return ''; return t.getDate() + ' ' + RU_MON[t.getMonth()] + ' ' + t.getFullYear(); }
    function rstar(n) { return '★ ' + ((n || n === 0) ? Number(n).toFixed(1) : '–'); }
    // Generic pager: returns the requested slice + page metadata.
    function paginate(items, page, per) {
      per = per || 8; var total = items.length;
      var pages = Math.max(1, Math.ceil(total / per));
      page = Math.min(Math.max(1, page || 1), pages);
      var from = (page - 1) * per;
      return { slice: items.slice(from, from + per), page: page, pages: pages, total: total, from: total ? from + 1 : 0, to: Math.min(from + per, total) };
    }
    // Footer line + next/prev hints for a paginated command (base = command without page arg).
    function pageNav(p, base) {
      if (p.pages <= 1) { if (p.total) print('всего: ' + p.total, 'dim'); return; }
      print('стр. ' + p.page + '/' + p.pages + '  ·  ' + p.from + '–' + p.to + ' из ' + p.total, 'dim');
      var nav = [];
      if (p.page < p.pages) nav.push(base + ' ' + (p.page + 1) + ' – дальше');
      if (p.page > 1) nav.push(base + ' ' + (p.page - 1) + ' – назад');
      if (nav.length) print(nav.join('  ·  '), 'hint');
    }
    // Split args into a trailing page number and the rest of the query.
    function pageArg(a) {
      var args = (a || []).slice(); var page = 1;
      if (args.length && /^\d+$/.test(args[args.length - 1])) page = parseInt(args.pop(), 10);
      return { q: args.join(' ').trim(), page: page };
    }
    // Resolve a free-text query to a baked company (exact slug, then name/slug contains).
    function resolveCompany(q) {
      q = (q || '').toLowerCase();
      for (var i = 0; i < COMPANIES.length; i++) { if (COMPANIES[i].slug === q) return COMPANIES[i]; }
      for (i = 0; i < COMPANIES.length; i++) { var c = COMPANIES[i]; if (c.name.toLowerCase().indexOf(q) !== -1 || c.slug.indexOf(q) !== -1) return c; }
      return null;
    }
    function pathStr() { return '/' + cwd; }
    // PowerShell maps the section to a Windows path: C:\Users\guest[\section].
    function winPath() { return 'C:\\Users\\guest' + (cwd ? '\\' + cwd : ''); }
    function promptMarkup() {
      return WIN ? ('PS ' + winPath() + '>') : ('<b>guest@teamleads</b>:' + pathStr() + '$');
    }
    function setPrompt() {
      if (promptEl) promptEl.innerHTML = promptMarkup();
      if (titleEl) titleEl.textContent = WIN ? ('Windows PowerShell – ' + winPath()) : ('guest@teamleads: ' + pathStr());
    }
    function go(href) { print(''); print('переход → ' + href, 'ok'); setTimeout(function () { w.location.href = href; }, reduced ? 0 : 360); }

    // Footer for `discuss`: a one-click deep-dive into the assistant + the live-meetup nudge.
    function discussFooter(item) {
      print('────────────────────────────', 'dim');
      var row = el('span'); row.appendChild(el('span', 'dim', 'Разобрать глубже: '));
      var qShort = item.q.length > 44 ? item.q.slice(0, 44) + '…' : item.q;
      var a = el('a', null, 'claude «' + qShort + '»'); a.href = 'javascript:void(0)';
      a.addEventListener('click', function (e) { e.preventDefault(); run('claude ' + item.q); });
      row.appendChild(a); printNode(row);
      print('Обсудить вживую: join – среда 17:00 (Астана) · ещё тема – discuss', 'hint');
    }

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
      if (!line.trim()) return null;   // collapse blank lines – spacing is controlled by CSS margins
      var div = el('div', 'ln'), m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { div.className = 'ln md-h md-h' + m[1].length; return mdInline(div, m[2]); }
      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { div.className = 'ln md-hr'; div.textContent = '────────────────────────────'; return div; }
      if ((m = /^>\s?(.*)$/.exec(line))) { div.className = 'ln md-quote'; return mdInline(div, m[1]); }
      if ((m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line))) {
        div.className = 'ln md-li';
        div.appendChild(el('span', 'md-bullet', /\d/.test(m[2]) ? m[2] + ' ' : '• '));
        return mdInline(div, m[3]);
      }
      if (line.trim()) div.className = 'ln md-p';   // paragraph – gets extra spacing
      return mdInline(div, line);
    }
    // ── GitHub-style markdown tables ──────────────────────────────
    function mdRow(line) {
      return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
    }
    function mdIsSep(line) {
      if (!line || line.indexOf('|') === -1) return false;
      var cells = mdRow(line);
      return cells.length > 0 && cells.every(function (c) { return /^:?-{1,}:?$/.test(c); });
    }
    // If a table starts at lines[i] (header row + `|---|` separator), build it.
    // Returns { node, next } where next is the index after the table, else null.
    function mdTable(lines, i) {
      if (!lines[i] || lines[i].indexOf('|') === -1) return null;
      if (!mdIsSep(lines[i + 1] || '')) return null;
      var headers = mdRow(lines[i]);
      var table = el('table', 'term-table');
      var thead = d.createElement('thead'), htr = d.createElement('tr');
      headers.forEach(function (c) { var th = d.createElement('th'); mdInline(th, c); htr.appendChild(th); });
      thead.appendChild(htr); table.appendChild(thead);
      var tbody = d.createElement('tbody'), j = i + 2;
      for (; j < lines.length; j++) {
        if (!lines[j] || !lines[j].trim() || lines[j].indexOf('|') === -1) break;
        var cells = mdRow(lines[j]), tr = d.createElement('tr');
        for (var c = 0; c < headers.length; c++) { var td = d.createElement('td'); mdInline(td, cells[c] || ''); tr.appendChild(td); }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      return { node: table, next: j };
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

    // ── salary: live market data from techinterview.space via the shared
    //    TeamleadsSalary module, with the static community model as an offline
    //    fallback. salaryLive renders charts/analytics; salaryNudge always asks
    //    the visitor to contribute their own salary so the sample improves.
    function salFmt(v, cur) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + (cur || '₸'); }
    function salMoney(v) {
      v = Number(v);
      if (v >= 1e6) { var m = v / 1e6; return (m % 1 ? m.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : m.toFixed(0)) + 'M'; }
      return Math.round(v / 1e3) + 'k';
    }
    function salBar(ch, count, max, width) { var n = max ? Math.max(count > 0 ? 1 : 0, Math.round(count / max * width)) : 0; return new Array(n + 1).join(ch); }
    function salaryNudge() {
      var url = (w.TeamleadsSalary && w.TeamleadsSalary.CONTRIBUTE_URL) || 'https://techinterview.space/salaries';
      var n = el('span'); n.appendChild(el('span', 'accent', '📊 '));
      n.appendChild(d.createTextNode('В выборке нет твоей вилки? Добавь анонимно за пару минут → '));
      n.appendChild(link(url, 'techinterview.space/salaries', true));
      printNode(n);
      print('Чем больше анкет – тем точнее цифры для всего сообщества. Прямо здесь: submit salary', 'dim');
    }
    function salaryLive(grade, role, cities, skills) {
      var S = w.TeamleadsSalary, titles = SAL.roleTitles || {};
      var loading = print('запрашиваю свежие данные с techinterview.space…', 'dim');
      S.chart({ grade: grade, profession: role, cities: cities, skills: skills }).then(function (res) {
        if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
        if (!res || !res.count) { print('salary: по такому фильтру данных нет – показываю оценку сообщества.', 'dim'); salaryOffline(grade, role); return; }
        var rate = res.usdRate, q = res.query || {};
        function usd(v) { return rate ? ' (~$' + String(S.toUSD(v, rate)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ')' : ''; }
        var roleLabel = role ? (titles[role] || S.PROF_LABEL[S.resolveProfession(role)] || role) : '';
        var gradeLabel = grade ? (q.gradeLabel || grade) : '';
        var head = [roleLabel, gradeLabel].concat(q.cityLabels || [], q.skillLabels || []).filter(Boolean).join(' · ') || 'Весь рынок IT · РК';
        print('💰 ' + head + ' · нетто/мес', 'accent');
        print('живые данные · ' + res.count + ' зарплат · обновлено ' + res.updated + (res._cached ? ' · из кеша' : ''), 'dim');
        print('────────────────────────────────────────', 'dim');
        print('  медиана  ' + salFmt(res.median) + usd(res.median));
        print('  среднее  ' + salFmt(res.average) + usd(res.average), 'dim');
        if (res.remoteMedian) {
          var prem = res.median ? Math.round((res.remoteMedian / res.median - 1) * 100) : 0;
          print('  ремоут   ' + salFmt(res.remoteMedian) + (prem > 0 ? '  +' + prem + '% к локальному рынку' : ''), 'cy');
        }
        if (!grade && res.byGrade && res.byGrade.length) {
          print('────────────────────────────────────────', 'dim');
          print('Грейд-лестница (медиана):', 'accent');
          var topG = Math.max.apply(null, res.byGrade.map(function (g) { return g.median; })) || 1;
          res.byGrade.forEach(function (g) {
            print('  ' + pad(g.label, 8) + salBar('█', g.median, topG, 16) + '  ' + salFmt(g.median) + '  · ' + g.count);
          });
        }
        if (res.histogram && res.histogram.items && res.histogram.items.length) {
          print('────────────────────────────────────────', 'dim');
          print('Распределение (локальный рынок · нетто/мес):', 'accent');
          var h = res.histogram, mx = Math.max.apply(null, h.items) || 1;
          h.labels.forEach(function (lab, i) {
            var c = h.items[i] || 0;
            var rng = i === 0 ? 'до ' + salMoney(lab) : salMoney(h.labels[i - 1]) + '–' + salMoney(lab);
            print('  ' + pad(rng, 12) + salBar('▓', c, mx, 16) + ' ' + c + ' чел.', c ? null : 'dim');
          });
          print('  столбик = число анкет в диапазоне; самые высокие (>' + salMoney(h.labels[h.labels.length - 1]) + ') в график не попали', 'dim');
        }
        print('────────────────────────────────────────', 'dim');
        salaryNudge();
        print('Уточнить: salary <грейд> <роль> <город> <скилл> · Tab – подсказки. Напр.: salary senior backend almaty', 'hint');
        print('Полная страница с графиками: open salary', 'dim');
      }).catch(function (e) {
        if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
        print('salary: сервис недоступен (' + e.message + ') – показываю оценку сообщества.', 'dim');
        salaryOffline(grade, role);
      });
    }
    function salaryOffline(grade, role) {
      var grades = SAL.grades || {}, roles = SAL.roles || {}, titles = SAL.roleTitles || {};
      if (!Object.keys(grades).length || !Object.keys(roles).length) { print('salary: данные о зарплатах не загружены', 'err'); return; }
      if (!grade) { grade = 'senior'; print('грейд не указан – беру senior', 'dim'); }
      if (!role) { role = 'backend'; print('роль не указана – беру backend', 'dim'); }
      var base = grades[grade], k = roles[role];
      if (!base || k == null) { print('salary: нет данных для этой пары', 'err'); return; }
      var vals = base.map(function (v) { return Math.round(v * k / 10000) * 10000; });
      var cur = SAL.currency || '₸', top = vals[2] || 1;
      function bar(v) { var ww = Math.max(1, Math.round(v / top * 14)); return new Array(ww + 1).join('▓') + new Array(14 - ww + 1).join('░'); }
      print((titles[role] || role) + ' · ' + grade + ' · ' + (SAL.unit || '') + ' (оценка сообщества)', 'accent');
      print('────────────────────────────────────────', 'dim');
      [['p25', vals[0]], ['med', vals[1]], ['p75', vals[2]]].forEach(function (r) {
        print('  ' + pad(r[0], 5) + bar(r[1]) + '   ' + salFmt(r[1], cur));
      });
      print('────────────────────────────────────────', 'dim');
      if (SAL.disclaimer) print(SAL.disclaimer, 'dim');
      salaryNudge();
    }

    var commands = {
      help: function () {
        print('НАВИГАЦИЯ', 'accent');
        [
          ['ls [раздел]', 'что вокруг / содержимое раздела'],
          ['cd <раздел>', 'войти в раздел (cd .. – наверх)'],
          ['open <стр>', 'открыть страницу в браузере'],
          ['cat <стр>', 'показать markdown страницы здесь'],
          ['pwd', 'где я сейчас'],
          ['tree', 'всё дерево сайта'],
          ['find <запрос>', 'поиск по материалам (ранжированный)'],
          ['grep <запрос>', 'полнотекстовый поиск; --exact – подстрока'],
          ['latest', 'последняя встреча'],
          ['random', 'случайный материал']
        ].forEach(function (r) { print('  ' + pad(r[0], 16) + r[1]); });
        print(''); print('УТИЛИТЫ', 'accent');
        [
          ['claude <вопрос>', 'спросить Claude (офлайн-демо)'],
          ['codex <вопрос>', 'спросить Codex (офлайн-демо)'],
          ['salary', 'зарплаты рынка (живые данные): salary senior backend'],
          ['submit salary', 'добавить свою вилку в выборку (нужна авторизация)'],
          ['sim', 'тимлид-симулятор: развилки и решения'],
          ['discuss', 'случайная тема из бэклога + разбор по ней'],
          ['principles', 'доктрина сообщества: принципы из реальных кейсов'],
          ['tools', 'топ инструментов сообщества'],
          ['toolkit', 'шаблоны операционки: 1-on-1, ретро, постмортем…'],
          ['showcase submit', 'добавить свой проект в витрину (инструкция)'],
          ['voices', 'реальные реплики участников из чата'],
          ['companies', 'отзывы о компаниях (techinterview.space)'],
          ['company <имя>', 'читать отзывы о компании + ссылка'],
          ['addreview <имя>', 'оставить свой отзыв о компании'],
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
        // accept and ignore flags (-l, -a, -la, -al …); first non-flag arg is the path,
        // a trailing number is the page (ls articles 2)
        var args = (a || []).filter(function (x) { return x && x.charAt(0) !== '-'; });
        var lsPage = 1;
        for (var ai = args.length - 1; ai >= 0; ai--) { if (/^\d+$/.test(args[ai])) { lsPage = parseInt(args[ai], 10); args.splice(ai, 1); break; } }
        var where = (args[0] || '').replace(/^\/|\/$/g, '') || cwd;
        if (!where) {
          print('drwxr-xr-x  разделы:', 'dim');
          sectionNames.forEach(function (s) {
            var n = el('span'); n.appendChild(el('span', 'dim', '  ')); n.appendChild(linkpad('/' + s + '/', s + '/', 13)); n.appendChild(el('span', 'dim', (sections[s] || []).length + ' материалов')); printNode(n);
          });
          if (linkNames.length) { print(''); print('-rw-r--r--  страницы:', 'dim'); linkNames.forEach(function (k) { var n = el('span'); n.appendChild(el('span', 'dim', '  ')); n.appendChild(link(links[k], k)); printNode(n); }); }
          print(''); print('cd <раздел> – войти, open <страница> – открыть, find <слово> – поиск.', 'dim');
          return;
        }
        if (sections[where]) {
          var items = sections[where];
          if (!items.length) { print('пусто', 'dim'); return; }
          var lp = paginate(items, lsPage, 8);
          lp.slice.forEach(function (it) {
            var n = el('span'); n.appendChild(el('span', 'dim', '  ')); n.appendChild(linkpad(it.u, it.n, 26));
            if (it.d) n.appendChild(el('span', 'dim', it.d + '  ')); n.appendChild(d.createTextNode(it.t)); printNode(n);
          });
          pageNav(lp, 'ls ' + where);
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
        if (!arg) { print('open: укажите страницу. Список – ls.', 'err'); return; }
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
        if (!arg) { print('cat: укажите страницу. Список – ls.', 'err'); return; }
        if (links[arg]) { print('cat: «' + arg + '» – служебная страница без markdown. Откройте: open ' + arg, 'dim'); return; }
        var sec = null, name = arg;
        if (arg.indexOf('/') !== -1) { var p = arg.split('/'); sec = p[0]; name = p[1]; }
        else if (cwd) { sec = cwd; }
        var hit = null;
        if (sec && sections[sec]) sections[sec].forEach(function (it) { if (it.n === name) hit = it; });
        if (!hit) pool.forEach(function (it) { if (it.n === name) hit = it; });
        if (!hit) { print('cat: не найдено: ' + arg, 'err'); return; }
        if (!w.fetch) { print('cat: fetch недоступен в этом браузере – попробуйте open ' + arg, 'err'); return; }
        var url = hit.u + 'index.md';
        print('– ' + url + ' –', 'dim');
        var loading = print('загрузка…', 'dim');
        w.fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(function (txt) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          var lines = txt.replace(/\s+$/, '').split('\n'), CAP = 400;
          var slice = lines.slice(0, CAP);
          if (raw) { slice.forEach(function (l) { print(l); }); }
          else {
            for (var li = 0; li < slice.length; li++) {
              var tbl = mdTable(slice, li);
              if (tbl) { out.appendChild(tbl.node); li = tbl.next - 1; continue; }
              var node = mdLine(slice[li]); if (node) out.appendChild(node);
            }
          }
          body.scrollTop = body.scrollHeight;
          if (lines.length > CAP) print('… обрезано (' + (lines.length - CAP) + ' строк). open ' + arg + ' – полная версия.', 'dim');
        }).catch(function (e) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          print('cat: не удалось загрузить – ' + e.message, 'err');
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
        if (!q) { print('find: укажите запрос. Напр.: find карьера', 'dim'); return; }
        var lh = [];
        linkNames.forEach(function (k) { if (k.indexOf(q) !== -1) lh.push({ n: k, u: links[k] }); });
        function render(hits) {
          if (!hits.length && !lh.length) { print('ничего не найдено по «' + q + '»', 'dim'); return; }
          if (hits.length) {
            print('найдено ' + hits.length + ' (по релевантности):', 'dim');
            hits.slice(0, 12).forEach(function (h) { var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(link(h.u, h.s + '/' + h.t)); printNode(n); });
            if (hits.length > 12) print('… ещё ' + (hits.length - 12) + '.', 'dim');
          }
          if (lh.length) { print('страницы:', 'dim'); lh.forEach(function (l) { var n = el('span'); n.appendChild(el('span', 'dim', '  ')); n.appendChild(link(l.u, l.n)); printNode(n); }); }
        }
        var R = w.TeamleadsRetrieval;
        if (R && R.fetchIndex && R.rank) {
          var loading = print('find: ищу…', 'dim');
          R.fetchIndex().then(function () { if (loading && loading.parentNode) loading.parentNode.removeChild(loading); render(R.rank(q)); }).catch(function () { if (loading && loading.parentNode) loading.parentNode.removeChild(loading); render([]); });
        } else { render([]); }
      },
      grep: function (a) {
        var exact = false;
        a = a.filter(function (x) { if (x === '--exact' || x === '-e') { exact = true; return false; } return true; });
        var q = a.join(' ').toLowerCase().trim();
        if (!q) { print('grep: укажите запрос. Напр.: grep бас-фактор · grep --exact <строка> – буквальная подстрока', 'dim'); return; }
        var R = w.TeamleadsRetrieval;
        if (!R || !R.fetchIndex || !R.rank) { print('grep: индекс недоступен – попробуйте find <запрос>', 'err'); return; }
        function show(hits, label) {
          if (!hits.length) { print('grep: ничего не найдено по «' + q + '»', 'dim'); return; }
          print('найдено ' + hits.length + label + ':', 'dim');
          hits.slice(0, 12).forEach(function (h) {
            var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(link(h.u, h.s + '/' + h.t)); printNode(n);
            if (h.snip) print('   ' + h.snip, 'dim');
          });
          if (hits.length > 12) print('… ещё ' + (hits.length - 12) + '. Уточните запрос.', 'dim');
        }
        var loading = print('grep: ищу…', 'dim');
        R.fetchIndex().then(function (items) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          if (exact) {
            var hits = [];
            items.forEach(function (p) {
              var b = (p.b || '').toLowerCase(), pos = b.indexOf(q), inTitle = (p.t || '').toLowerCase().indexOf(q) !== -1;
              if (pos === -1 && !inTitle) return;
              var snip = '';
              if (pos !== -1) { var st = Math.max(0, pos - 32); snip = (st > 0 ? '…' : '') + p.b.substr(st, 90).replace(/\s+/g, ' ').trim() + '…'; }
              hits.push({ u: p.u, t: p.t, s: p.s, snip: snip });
            });
            show(hits, ' (точное совпадение)');
          } else {
            show(R.rank(q), ' (по релевантности)');
          }
        }).catch(function (e) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          print('grep: индекс недоступен – ' + e.message, 'err');
        });
      },
      latest: function () { var ev = sections.events || []; if (ev.length) { print('последняя встреча: ' + ev[0].t, 'cy'); go(ev[0].u); } else print('latest: нет данных', 'err'); },
      random: function () { if (!pool.length) { print('random: нет данных', 'err'); return; } var r = pool[Math.floor(Math.random() * pool.length)]; print('случайный выбор: ' + r.t, 'cy'); go(r.u); },
      discuss: function () {
        if (!QUESTIONS.length) { print('Бэклог тем пуст. Загляните на ', 'dim'); var nq = el('span'); nq.appendChild(link('/questions/', '/questions/')); printNode(nq); return; }
        var item = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
        print(''); print('💬 Тема для обсуждения:', 'accent');
        print(item.q);
        if (item.u) { var src = el('span'); src.appendChild(el('span', 'dim', 'предложена на встрече ' + (item.d || '') + ' → ')); src.appendChild(link(item.u, item.ev || 'встреча')); printNode(src); }
        print('────────────────────────────', 'dim');
        var R = w.TeamleadsRetrieval;
        if (R && R.retrieve) {
          var loading = print('ищу разбор по теме в архиве…', 'dim');
          R.retrieve(item.q, 2).then(function (hits) {
            if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
            if (hits && hits.length) {
              print('Что есть по теме в архиве:', 'cy');
              hits.forEach(function (h) {
                var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(link(h.u, h.t)); printNode(n);
                if (h.snip) print('   ' + h.snip, 'dim');
              });
            } else { print('Прямого разбора в архиве нет – отличный повод обсудить первыми.', 'dim'); }
            discussFooter(item);
          }).catch(function () { discussFooter(item); });
        } else { discussFooter(item); }
      },
      toolkit: function () {
        var items = (sections.toolkit || []).slice().sort(function (a, b) { return (a.n || '').localeCompare(b.n || ''); });
        if (!items.length) { print('toolkit: шаблоны не загружены', 'err'); return; }
        print('Операционка тимлида – рабочие шаблоны сообщества:', 'accent');
        items.forEach(function (it) { var n = el('span'); n.appendChild(el('span', 'accent', '• ')); n.appendChild(linkpad(it.u, it.n, 22)); n.appendChild(el('span', 'dim', it.t)); printNode(n); });
        print(''); print('cat toolkit/<имя> – открыть здесь. /toolkit/ – на сайте.', 'dim');
      },
      voices: function () {
        if (!VOICES.length) { print('voices: реплики не загружены', 'err'); return; }
        print('Голоса сообщества – реальные реплики из чата, без редактуры:', 'accent');
        VOICES.forEach(function (v) {
          print('  « ' + v.text + ' »');
          print('    – ' + v.author + (v.topic ? '  · ' + v.topic : ''), 'dim');
        });
        print(''); print('Больше из чата: open insights', 'hint');
      },
      companies: function (a) {
        if (!COMPANIES.length) { print('companies: список не загружен', 'err'); return; }
        var pa = pageArg(a);
        var list = COMPANIES;
        if (pa.q) list = COMPANIES.filter(function (c) { return c.name.toLowerCase().indexOf(pa.q.toLowerCase()) !== -1; });
        if (!list.length) { print('companies: ничего не найдено по «' + pa.q + '»', 'dim'); return; }
        print('Отзывы о компаниях' + (pa.q ? ' · поиск: ' + pa.q : '') + ' (данные techinterview.space):', 'accent');
        var p = paginate(list, pa.page, 8);
        p.slice.forEach(function (c) {
          var n = el('span');
          n.appendChild(el('span', 'accent', pad(rstar(c.rating), 7)));
          n.appendChild(linkpad(TIWEB + '/companies/' + c.slug, c.name, 28, true));
          n.appendChild(el('span', 'dim', c.reviewsCount + ' отз.'));
          printNode(n);
        });
        pageNav(p, 'companies' + (pa.q ? ' ' + pa.q : ''));
        print('Источник: techinterview.space · company <имя> – отзывы в терминале', 'dim');
      },
      company: function (a) {
        var pa = pageArg(a);
        if (!pa.q) { print('company: укажите компанию. Список: companies. Напр.: company kaspi', 'err'); return; }
        var match = resolveCompany(pa.q);
        if (!match) { print('company: «' + pa.q + '» не найдена среди компаний с отзывами. companies – список.', 'err'); return; }
        if (!w.fetch) { print('company: fetch недоступен – откройте ' + TIWEB + '/companies/' + match.slug, 'err'); return; }
        var loading = print('загрузка отзывов о «' + match.name + '»…', 'dim');
        w.fetch(TIAPI + '/companies/' + match.slug).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (data) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          var c = (data && data.company) || {};
          var reviews = (c.reviews || []).slice().sort(function (x, y) { return (y.createdAt || '').localeCompare(x.createdAt || ''); });
          print(c.name + '  ' + rstar(c.rating) + '  ·  ' + (c.reviewsCount || reviews.length) + ' отзывов', 'accent');
          var hn = el('span'); hn.appendChild(el('span', 'dim', 'страница: ')); hn.appendChild(linkTI('/companies/' + c.slug, 'techinterview.space/companies/' + c.slug)); printNode(hn);
          print('────────────────────────────', 'dim');
          if (!reviews.length) { print('Пока нет одобренных отзывов. Будьте первым: addreview ' + match.slug, 'hint'); }
          else {
            var p = paginate(reviews, pa.page, 3);
            p.slice.forEach(function (rv) {
              print(rstar(rv.totalRating) + '  ' + (rv.iWorkHere ? 'работает сейчас' : 'бывш. сотрудник') + (rv.createdAt ? ' · ' + fmtDate(rv.createdAt) : ''), 'cy');
              if (rv.pros) print('  + ' + rv.pros);
              if (rv.cons) print('  – ' + rv.cons);
              print('  👍 ' + (rv.likesCount || 0) + '   👎 ' + (rv.dislikesCount || 0), 'dim');
              print('');
            });
            pageNav(p, 'company ' + match.slug);
          }
          print('Источник данных: techinterview.space/companies/' + c.slug, 'dim');
          print('Оставить свой отзыв: addreview ' + match.slug, 'hint');
        }).catch(function (e) {
          if (loading && loading.parentNode) loading.parentNode.removeChild(loading);
          print('company: не удалось загрузить – ' + e.message + '. Откройте ' + TIWEB + '/companies/' + match.slug, 'err');
        });
      },
      addreview: function (a) {
        var q = (a || []).join(' ').trim();
        if (!q) { print('addreview: укажите компанию. Напр.: addreview kaspi', 'err'); return; }
        var match = resolveCompany(q);
        if (!match) { print('addreview: «' + q + '» не найдена. companies – список.', 'err'); return; }
        print('Оставить отзыв о «' + match.name + '» на techinterview.space:', 'accent');
        var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(linkTI('/companies/' + match.id + '/add-review', 'Открыть форму отзыва')); printNode(n);
        print('Форма откроется на techinterview.space – партнёрском сервисе сообщества.', 'dim');
      },
      tools: function () {
        print('Топ инструментов, которые советует сообщество:', 'accent');
        [
          ['Claude Code (Opus)', 'AI-разработка и рефакторинг под контролем', 'https://claude.com/claude-code'],
          ['Hetzner', 'дешёвый и стабильный хостинг вместо локальных провайдеров', 'https://www.hetzner.com/'],
          ['GitHub / Forgejo', 'код всегда в общем репозитории – лекарство от бас-фактора', 'https://forgejo.org/'],
          ['SonarQube', 'статанализ и дисциплина декомпозиции', 'https://www.sonarsource.com/'],
          ['Swagger / OpenAPI', 'документация API, по которой конформятся новички', 'https://swagger.io/'],
          ['Sales Navigator', 'выход на западных заказчиков через прогрев', 'https://business.linkedin.com/sales-solutions/sales-navigator'],
          ['techinterview.space', 'зарплаты по рынку и подготовка к собеседованиям', 'https://techinterview.space/']
        ].forEach(function (t) { var n = el('span'); n.appendChild(el('span', 'accent', '• ')); n.appendChild(link(t[2], t[0], true)); n.appendChild(el('span', 'dim', ' – ' + t[1])); printNode(n); });
      },
      friends: function () {
        if (!FRIENDS.length) { print('friends: список пуст', 'dim'); return; }
        print('Дружественные сообщества и сервисы:', 'accent');
        FRIENDS.forEach(function (f) {
          var dash = (f.t || '').split(' – '); var name = dash[0]; var desc = dash.slice(1).join(' – ');
          var n = el('span'); n.appendChild(el('span', 'accent', '• ')); n.appendChild(link(f.u, name, true));
          if (desc) n.appendChild(el('span', 'dim', ' – ' + desc)); printNode(n);
        });
      },
      salary: function (a) {
        var grades = SAL.grades || {}, roles = SAL.roles || {}, aliases = SAL.aliases || {};
        var gradeNames = Object.keys(grades), roleNames = Object.keys(roles);
        if (!gradeNames.length || !roleNames.length) { print('salary: данные о зарплатах не загружены', 'err'); return; }
        var S = w.TeamleadsSalary;
        if (a[0] === 'help' || a[0] === '--help' || a[0] === '-h') {
          print('Зарплаты рынка РК – живые данные techinterview.space', 'accent');
          print('Использование: salary [грейд] [роль] [город] [скилл]. Напр.: salary senior backend almaty', 'hint');
          print('  без аргументов – обзор всего рынка (медиана, грейд-лестница, распределение)', 'dim');
          print('  грейды: ' + gradeNames.join(', '), 'dim');
          print('  роли:   ' + roleNames.join(', '), 'dim');
          if (S) {
            print('  города: ' + Object.keys(S.CITY_LABEL).map(function (k) { return S.CITY_LABEL[k]; }).slice(0, 8).join(', ') + ' …', 'dim');
            print('  скиллы: ' + Object.keys(S.SKILL_LABEL).map(function (k) { return S.SKILL_LABEL[k]; }).join(', '), 'dim');
          }
          print('Подробная страница: open salary · /salary/', 'dim');
          print('Добавить свою вилку в выборку: salary submit', 'hint');
          return;
        }
        if (/^(submit|add|добавить|поделиться)$/.test((a[0] || '').toLowerCase())) { return commands.submit(); }
        // Resolve every token to a grade / role / city / skill (via RU aliases); last grade & role win, cities/skills accumulate.
        var grade = '', role = '', cities = [], skills = [];
        a.forEach(function (raw) {
          var lc = raw.toLowerCase(), t = (aliases[lc] || lc);
          if (grades[t]) { grade = t; return; }
          if (roles[t]) { role = t; return; }
          if (S && S.resolveCity(lc) != null) { cities.push(lc); return; }
          if (S && S.resolveSkill(lc) != null) { skills.push(lc); return; }
        });
        if (S && w.fetch) salaryLive(grade, role, cities, skills);
        else salaryOffline(grade, role);
      },
      claude: function (a) {
        var q = a.join(' ').trim();
        try { if (w.ym) w.ym(106055675, 'reachGoal', 'search_open', { source: 'shell', tool: 'claude', query: q ? 'yes' : 'no' }); } catch (e) {}
        if (w.TeamleadsClaude) {
          print('открываю Claude' + (q ? ' с вашим вопросом' : '') + '…', 'cy');
          w.TeamleadsClaude.open(q);
          return;
        }
        // Fallback if the Claude overlay isn't loaded – search content inline.
        print('Claude-окно недоступно – ищу прямо здесь.', 'dim');
        var words = q.toLowerCase().split(/\s+/).filter(function (x) { return x.length > 2; });
        var hits = [];
        sectionNames.forEach(function (s) {
          (sections[s] || []).forEach(function (it) {
            var t = (it.t || '').toLowerCase();
            if (words.some(function (x) { return t.indexOf(x) !== -1; })) hits.push(it);
          });
        });
        if (hits.length) { hits.slice(0, 4).forEach(function (it) { var n = el('span'); n.appendChild(el('span', 'accent', '→ ')); n.appendChild(link(it.u, it.t)); printNode(n); }); }
        else { print('Ничего не нашёл – попробуйте find <слово> или раздел articles.', 'dim'); }
      },
      codex: function (a) {
        var q = a.join(' ').trim();
        try { if (w.ym) w.ym(106055675, 'reachGoal', 'search_open', { source: 'shell', tool: 'codex', query: q ? 'yes' : 'no' }); } catch (e) {}
        if (w.TeamleadsCodex) { print('открываю Codex' + (q ? ' с вашим вопросом' : '') + '…', 'cy'); w.TeamleadsCodex.open(q); return; }
        print('Codex-окно недоступно на этой странице.', 'dim');
      },
      join: function () { print('Еженедельная встреча, среда 17:00 (Астана).', 'cy'); go('/join/'); },
      telegram: function () { print('открываю Telegram…', 'ok'); printNode(link(TG, TG, true)); w.open(TG, '_blank', 'noopener'); },
      contribute: function () {
        var url = 'https://github.com/belyaevsa/teamleads-2025';
        print('Сайт открытый – буду рад правкам и pull request:', 'cy');
        printNode(link(url, url, true));
        w.open(url, '_blank', 'noopener');
      },
      submit: function () {
        var url = 'https://techinterview.space/salaries/add-new';
        try { if (w.ym) w.ym(106055675, 'reachGoal', 'salary_submit', { source: 'shell' }); } catch (e) {}
        print('Поделиться своей зарплатой – анонимно, пара минут.', 'accent');
        print('Откроется форма techinterview.space. Нужна авторизация (вход через GitHub/Google).', 'dim');
        printNode(link(url, url, true));
        print('Чем больше анкет – тем точнее цифры в salary для всего сообщества.', 'dim');
        w.open(url, '_blank', 'noopener');
      },
      showcase: function (a) {
        var sub = (a[0] || '').toLowerCase();
        if (/^(submit|add|new|добавить)$/.test(sub)) {
          var url = 'https://github.com/belyaevsa/teamleads-2025/blob/master/landing-main/SHOWCASE.md';
          try { if (w.ym) w.ym(106055675, 'reachGoal', 'showcase_submit', { source: 'shell' }); } catch (e) {}
          print('Добавить свой проект в витрину сообщества.', 'accent');
          print('Инструкция (SHOWCASE.md): форк репозитория → шаблон в content/showcase/ → Pull Request.', 'dim');
          printNode(link(url, url, true));
          w.open(url, '_blank', 'noopener');
          return;
        }
        // bare `showcase` (or anything else) → list the section in place
        commands.ls(['showcase']);
        print('Добавить свой проект: showcase submit', 'hint');
      },
      whoami: function () {
        print('«Тимлид не кодит» – сообщество тимлидов, EM и CTO Казахстана.', 'accent');
        var facts = [
          ['состав', '400+ практик: Kaspi, Kolesa, DAR, Chocofamily, InDrive и другие'],
          ['формат', 'еженедельные встречи, разбор реальных кейсов, отчёты публикуем открыто'],
          ['о чём', 'люди · архитектура · найм · процессы · карьера – без слайдов и хайпа'],
          ['с чего начать', 'sim · salary senior backend · principles · latest']
        ];
        facts.forEach(function (r) { var n = el('span'); n.appendChild(el('span', 'accent', pad(r[0], 15))); n.appendChild(d.createTextNode(r[1])); printNode(n); });
        print('');
        print('whoami → guest. …но мы-то видим тимлида. Добро пожаловать.', 'dim');
      },
      principles: function () {
        print('Доктрина «Тимлид не кодит» – выжимка из реальных кейсов сообщества.', 'accent');
        print('');
        var p = [
          ['Сеньора берут, не дают – лычка не равна уровню.', 'карьера'],
          ['Тимлид – не «сеньор плюс подчинённые». Тимлид и техлид – разные работы.', 'роли'],
          ['Бас-фактор – плата за экономию, отложенная во времени. Знание – живому дублёру, не в документ.', 'бас-фактор'],
          ['Метрики врут не потому что ложны, а потому что вы смотрите не туда.', 'метрики'],
          ['Сначала диагноз (не хочет / забывает / не видит ценности), потом лекарство.', 'процессы'],
          ['Ответственность не передаётся лекцией – дайте обжечься под присмотром и научите откатывать.', 'рост'],
          ['Дорогая оценка часто прячется за страх. Проверяйте её дешёвым совместным экспериментом.', 'оценки'],
          ['Влияние – не подчинение и не саботаж, а аргументы и информированный выбор.', 'стейкхолдеры'],
          ['Нанимать стоит под конкретную перегруженную роль, а не чтобы «стало полегче».', 'найм'],
          ['Самый зрелый способ внедрить ИИ – иногда внедрить его временно: разведать и уйти.', 'AI'],
          ['Не ставьте на один сценарий. Ценна команда, сильная при любом будущем.', 'AI · команда'],
          ['Сначала инженер, потом – продуктовый. Гемба вместо хайпа.', 'продукт']
        ];
        p.forEach(function (r, i) {
          var n = el('div', 'ln');
          n.appendChild(el('span', 'accent', pad(String(i + 1), 3)));
          n.appendChild(d.createTextNode(r[0] + ' '));
          n.appendChild(el('span', 'dim', '– ' + r[1]));
          printNode(n);
        });
        print('');
        print('Каждый принцип – развернутый разбор в статьях: find <тема> или cat articles/…', 'dim');
      },
      date: function () { print(new Date().toString()); },
      echo: function (a) { print(a.join(' ')); },
      history: function () { if (!hist.length) { print('история пуста', 'dim'); return; } hist.forEach(function (c, i) { print('  ' + pad(i + 1, 4) + c); }); },
      clear: function () { out.innerHTML = ''; },
      man: function (a) {
        var pages = {
          ls: 'ls [раздел] – содержимое текущего или указанного раздела.',
          cd: 'cd <раздел> – войти. cd .. – наверх. cd – в корень.',
          open: 'open <страница> – открыть страницу в браузере.',
          cat: 'cat <страница> – показать markdown-версию страницы с подсветкой (заголовки, цитаты, ссылки). cat <страница> --raw – без подсветки.',
          pwd: 'pwd – текущий путь.',
          tree: 'tree – всё дерево сайта со счётчиками.',
          find: 'find <запрос> – ранжированный поиск по всем материалам (по релевантности).',
          grep: 'grep <запрос> – полнотекстовый ранжированный поиск по всем страницам. grep --exact <строка> (или -e) – буквальная подстрока.',
          latest: 'latest – открыть последнюю встречу.',
          random: 'random – открыть случайный материал.',
          discuss: 'discuss – случайная тема для обсуждения из бэклога /questions/ + что есть по ней в архиве. Синонимы: topic, тема, обсудить.',
          tools: 'tools – топ инструментов сообщества.',
          toolkit: 'toolkit – рабочие шаблоны (1-on-1, ретро, постмортем, найм, ADR). cat toolkit/<имя> – открыть шаблон здесь.',
          salary: 'salary [грейд] [роль] – зарплаты рынка РК: живые данные techinterview.space (медиана, среднее, ремоут-премия, грейд-лестница, распределение). Без аргументов – обзор всего рынка. Напр.: salary senior backend. При офлайне – оценка сообщества. salary submit – добавить свою вилку.',
          submit: 'submit (salary) – открыть форму techinterview.space/salaries/add-new и добавить свою зарплату в общую выборку. Анонимно; нужна авторизация (GitHub/Google). Синонимы: salary submit, salary add.',
          showcase: 'showcase – витрина проектов участников. showcase submit – открыть инструкцию SHOWCASE.md (форк → шаблон → Pull Request).',
          sim: 'sim – тимлид-симулятор: развилки из реальных споров сообщества. Выбор a/b/c, [s] поделиться, [q] выйти. Синонимы: simulator, game, play.',
          principles: 'principles – доктрина сообщества: принципы управления, выжатые из реальных кейсов и статей. Синонимы: doctrine, manifesto.',
          friends: 'friends – дружественные сообщества и сервисы (Claude Community KZ, techinterview.space).',
          claude: 'claude <вопрос> – Claude-окно: офлайн-ответ по материалам сообщества. Ищет по полному тексту (как grep), показывает сниппеты и ссылки.',
          codex: 'codex <вопрос> – Codex-окно: офлайн-ответ по материалам сообщества. Ищет по полному тексту (как grep), показывает сниппеты и ссылки.',
          join: 'join – ссылка на еженедельную встречу.',
          contribute: 'contribute – открыть репозиторий сайта на GitHub (правки, PR). Синонимы: github, gh, pr.',
          fortune: 'fortune – случайная мудрость тимлида.',
          vim: 'vim – открыть редактор. Выход: :q (если повезёт).',
          sudo: 'sudo – для guest недоступно.',
          help: 'help – список всех команд.'
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
        var f = ['Сеньора не дают – сеньора берут.', 'Бас-фактор – это плата за экономию, отложенная во времени.', 'Документ говорит «что». Человек знает «почему».', 'Срочно – значит, некачественно. Автоматически.', 'За большим хайпом скрывается большой попил.', 'Тимлид и техлид – две разные работы с одним названием.', 'Стоять надо не там, где интересно, а у кормушки с деньгами.', 'Молчаливое большинство, которое читает, – здоровый показатель.'];
        print('« ' + f[Math.floor(Math.random() * f.length)] + ' »', 'accent');
      },
      sim: function () { simStart(); },
      vim: function () { vimMode = true; print('~', 'dim'); print('~  VIM – Vi IMproved', 'dim'); print('~', 'dim'); print('Вы в vim. Удачи с выходом: :q (или :q!).', 'hint'); },
      top: function () {
        print('PID   COMMAND           %CPU  STATE', 'dim');
        [['1', 'daily-standup', '38', 'running'], ['7', 'retro', '12', 'blocked'], ['42', 'coffee', '73', 'critical'], ['99', 'code-review', '21', 'waiting'], ['100', 'tg-notifications', '55', 'running']].forEach(function (p) { print('  ' + pad(p[0], 5) + pad(p[1], 18) + pad(p[2], 6) + p[3]); });
        print('тимлид не кодит – тимлид анблокает.', 'dim');
      },
      sudo: function () { print('guest отсутствует в файле sudoers. Инцидент запротоколирован. 🚨', 'err'); },
      git: function (a) {
        if (a[0] === 'blame') print('fatal: винить некого – 404 это не баг, а фича вашего URL.', 'dim');
        else if (a[0] === 'push') print('Everything up-to-date. А страница всё равно не та.', 'dim');
        else print("git: '" + (a[0] || '') + "' – не команда здесь. Попробуйте git blame.", 'err');
      },
      coffee: function () { print('☕  Тимлид не кодит. Тимлид пьёт кофе и анблокает команду.', 'accent'); },
      rm: function (a) {
        var s = ' ' + a.join(' ') + ' ';
        if (/ -[a-z]*[rf][a-z]* /.test(s) && / \/ /.test(s)) { print('rm: удаляю / …', 'err'); print('…', 'dim'); setTimeout(function () { print('обошлось. В этот раз. На проде так не надо.', 'ok'); }, reduced ? 0 : 550); return; }
        print('rm: давайте без rm здесь. Это не тот терминал.', 'dim');
      },
      '42': function () { print('Ответ на главный вопрос жизни, вселенной и всего такого – 42.', 'accent'); print('Но запрошенной страницы среди ответов нет.', 'dim'); },
      home: function () { go('/'); },
      exit: function () { go('/'); }
    };
    commands.go = commands.open; commands.search = commands.find;
    commands.answer = commands['42']; commands.vi = commands.vim;
    commands.ai = commands.claude; commands.ask = commands.claude;
    commands.gpt = commands.codex; commands.openai = commands.codex;
    commands.github = commands.contribute; commands.gh = commands.contribute; commands.pr = commands.contribute;
    commands.simulator = commands.sim; commands.game = commands.sim; commands.play = commands.sim;
    commands.topic = commands.discuss; commands['обсудить'] = commands.discuss; commands['тема'] = commands.discuss;
    commands.chat = commands.voices; commands['голоса'] = commands.voices; commands.quotes = commands.voices;
    commands.reviews = commands.company; commands.review = commands.company; commands.submit = commands.addreview;
    commands['компании'] = commands.companies; commands['компания'] = commands.company;
    commands.about = commands.whoami; commands.manifesto = commands.principles; commands.doctrine = commands.principles;
    commands.contribute_salary = commands.submit; commands['добавить-зарплату'] = commands.submit;
    commands.projects = commands.showcase; commands['витрина'] = commands.showcase;

    // PowerShell dialect – so Windows visitors can drive the shell with the verbs
    // (and aliases) they already know. Cmdlet names arrive lowercased via run().
    commands.dir = commands.gci = commands['get-childitem'] = commands.ls;
    commands.sl = commands.chdir = commands['set-location'] = commands.cd;
    commands.type = commands.gc = commands['get-content'] = commands.cat;
    commands.gl = commands['get-location'] = commands.pwd;
    commands.cls = commands['clear-host'] = commands.clear;
    commands.del = commands.erase = commands.ri = commands['remove-item'] = commands.rm;
    commands.sls = commands['select-string'] = commands.grep;
    commands['write-output'] = commands['write-host'] = commands.echo;
    commands.ghy = commands['get-history'] = commands.history;
    commands.start = commands.ii = commands['invoke-item'] = commands.open;

    // Analytics: count each typed command as a Yandex.Metrika goal (counter 106055675).
    // Sends only the command NAME (first token) – never the free-text arguments – so no PII.
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
        var parts = cmd.split(/\s+/), verb = (parts[0] || '').toLowerCase(), args = parts.slice(1).join(' ');
        var id = SHARE[verb], url;
        if (id) {
          // /s/<id>/ card, carrying the exact arguments as ?cmd= (e.g. `find metrics` → /s/find/?cmd=metrics)
          url = w.location.origin + '/s/' + id + '/';
          if (args) url += '?cmd=' + encodeURIComponent(args).replace(/%20/g, '+');
        } else {
          url = w.location.origin + '/shell/#' + encodeURIComponent(cmd);
        }
        w.history.replaceState(null, '', url);
        if (!hintedShare) { hintedShare = true; print('адрес в строке браузера обновился – это ссылка на эту команду с запросом, делитесь', 'dim'); }
      } catch (e) {}
    }

    function run(raw, noTrack) {
      var str = raw.trim();
      var p = el('div', 'ln'); var pr = el('span', 'term-prompt'); pr.innerHTML = promptMarkup() + ' ';
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
      else print(cmd + ': команда не найдена. help – список команд.', 'err');
      body.scrollTop = body.scrollHeight;
    }

    // Echo the current prompt + typed text into the output, like run() does on Enter,
    // so Tab-completion listings appear BELOW the command instead of above the live prompt.
    function echoLine() {
      var p = el('div', 'ln'); var pr = el('span', 'term-prompt'); pr.innerHTML = promptMarkup() + ' ';
      p.appendChild(pr); p.appendChild(d.createTextNode(input.value)); out.appendChild(p); body.scrollTop = body.scrollHeight;
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
      var verb0 = (parts[0] || '').toLowerCase();
      if (parts.length <= 1) {
        pool = Object.keys(commands);
      } else if (verb0 === 'salary' && frag.indexOf('/') === -1) {
        // `salary <Tab>` → suggest grades, roles, cities, skills. On empty fragment
        // show a grouped cheatsheet so it's clear what each argument means.
        var S = w.TeamleadsSalary;
        pool = Object.keys(SAL.grades || {}).concat(Object.keys(SAL.roles || {}));
        if (S) pool = pool.concat(S.CITY_KEYS || [], S.SKILL_KEYS || []);
        if (!frag) {
          echoLine();
          print('грейд: ' + Object.keys(SAL.grades || {}).join(' '), 'dim');
          print('роль:  ' + Object.keys(SAL.roles || {}).join(' '), 'dim');
          if (S) {
            print('город: ' + (S.CITY_KEYS || []).slice(0, 10).join(' ') + ' …', 'dim');
            print('скилл: ' + (S.SKILL_KEYS || []).slice(0, 12).join(' ') + ' …', 'dim');
          }
          print('пример: salary senior backend almaty python', 'hint');
          comp.full = null; return;
        }
      } else if (/^(company|reviews|review|addreview|submit)$/.test(verb0)) {
        // `company <Tab>` → complete company slugs from the baked list
        if (!frag) {
          echoLine();
          print('напр.: ' + COMPANIES.slice(0, 10).map(function (c) { return c.slug.replace(/-[0-9a-f]{6,}$/, ''); }).join(' · '), 'dim');
          print('companies – полный список компаний с отзывами', 'hint');
          comp.full = null; return;
        }
        pool = COMPANIES.map(function (c) { return c.slug; });
      } else if (frag.indexOf('/') !== -1) {
        // "section/partial" → complete page names within that section
        var s = frag.split('/')[0];
        pool = (sections[s] || []).map(function (it) { return s + '/' + it.n; });
      } else {
        pool = sectionNames.concat(linkNames);
        if (cwd && sections[cwd]) pool = pool.concat(sections[cwd].map(function (it) { return it.n; }));
      }
      if (!frag) { if (pool.length) { echoLine(); print(pool.slice(0, 40).join('   '), 'dim'); } comp.full = null; return; }
      var hits = pool.filter(function (c) { return c.indexOf(frag) === 0; });
      if (!hits.length) { comp.full = null; return; }
      comp.base = parts.slice(0, parts.length - 1).join(' '); if (comp.base) comp.base += ' ';
      comp.list = hits; comp.idx = 0;
      input.value = comp.base + hits[0];     // fill the first match…
      comp.full = input.value;
      if (hits.length > 1) { echoLine(); print(hits.slice(0, 40).join('   '), 'dim'); }  // …and show the rest (Tab cycles them)
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

    // Mobile helper bar – taps map to the same actions as the hardware keys.
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
    // or /shell/?cmd=cat%20articles/... – it runs once the shell is ready.
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
        // ENTERED in the prompt, ready to run – don't auto-fire someone else's question.
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
      boot = [['$ curl -i https://teamleads.kz' + path, 'cy'], ['HTTP/1.1 404 Not Found', 'dim'], ['content-type: text/html; charset=utf-8', 'dim'], ['', null], ['Ресурс не найден. Но раз вы здесь – поднимаем сессию.', null], ['Это Shell Mode: навигируйте по сайту прямо отсюда. help – команды.', 'hint'], ['', null]];
    } else {
      boot = [['Teamleads Shell – навигация по сайту из терминала.', 'cy'], ['help – команды · ls – осмотреться · open <стр> – открыть · find <слово> – поиск.', 'hint'], ['С чего начать: sim – симулятор развилок · salary senior backend · principles – доктрина.', 'hint'], ['', null]];
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
