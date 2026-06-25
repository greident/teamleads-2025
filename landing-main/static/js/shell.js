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
    if (!out || !body || !input) return;

    var mode = root.getAttribute('data-mode') || 'full';
    var TG = root.getAttribute('data-tg') || 'https://t.me/teamleads_kz';
    var FS = {};
    try { FS = JSON.parse(root.getAttribute('data-fs') || '{}') || {}; } catch (e) { FS = {}; }
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

    var commands = {
      help: function () {
        print('НАВИГАЦИЯ', 'accent');
        [
          ['ls [раздел]', 'что вокруг / содержимое раздела'],
          ['cd <раздел>', 'войти в раздел (cd .. — наверх)'],
          ['open <стр>', 'открыть страницу (cat — синоним)'],
          ['pwd', 'где я сейчас'],
          ['tree', 'всё дерево сайта'],
          ['find <слово>', 'поиск по заголовкам'],
          ['latest', 'последняя встреча'],
          ['random', 'случайный материал']
        ].forEach(function (r) { print('  ' + pad(r[0], 16) + r[1]); });
        print(''); print('УТИЛИТЫ', 'accent');
        [
          ['tools', 'топ инструментов сообщества'],
          ['join', 'ссылка на встречу'],
          ['telegram', 'наш Telegram'],
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
          ['Sales Navigator', 'выход на западных заказчиков через прогрев', 'https://business.linkedin.com/sales-solutions/sales-navigator']
        ].forEach(function (t) { var n = el('span'); n.appendChild(el('span', 'accent', '• ')); n.appendChild(link(t[2], t[0], true)); n.appendChild(el('span', 'dim', ' — ' + t[1])); printNode(n); });
      },
      join: function () { print('Еженедельная встреча, среда 17:00 (Астана).', 'cy'); go('/join/'); },
      telegram: function () { print('открываю Telegram…', 'ok'); printNode(link(TG, TG, true)); w.open(TG, '_blank', 'noopener'); },
      whoami: function () { print('guest', 'cy'); print('…но мы-то видим тимлида. Добро пожаловать.', 'dim'); },
      date: function () { print(new Date().toString()); },
      echo: function (a) { print(a.join(' ')); },
      history: function () { if (!hist.length) { print('история пуста', 'dim'); return; } hist.forEach(function (c, i) { print('  ' + pad(i + 1, 4) + c); }); },
      clear: function () { out.innerHTML = ''; },
      man: function (a) {
        var pages = {
          ls: 'ls [раздел] — содержимое текущего или указанного раздела.',
          cd: 'cd <раздел> — войти. cd .. — наверх. cd — в корень.',
          open: 'open <страница> — перейти на страницу. Синоним: cat.',
          pwd: 'pwd — текущий путь.',
          tree: 'tree — всё дерево сайта со счётчиками.',
          find: 'find <слово> — поиск по заголовкам и именам.',
          latest: 'latest — открыть последнюю встречу.',
          random: 'random — открыть случайный материал.',
          tools: 'tools — топ инструментов сообщества.',
          join: 'join — ссылка на еженедельную встречу.',
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
    commands.cat = commands.open; commands.go = commands.open; commands.search = commands.find;
    commands.answer = commands['42']; commands.vi = commands.vim;

    function run(raw) {
      var str = raw.trim();
      var p = el('div', 'ln'); var pr = el('span', 'term-prompt'); pr.innerHTML = '<b>guest@teamleads</b>:' + pathStr() + '$ ';
      p.appendChild(pr); p.appendChild(d.createTextNode(str)); out.appendChild(p);
      if (vimMode) {
        if (/^:(q|q!|wq|wq!|x)$/.test(str)) { vimMode = false; print('вышли из vim. Невозможное возможно.', 'ok'); }
        else print('E37: незаписанные изменения. :q! чтобы выйти не сохраняя.', 'err');
        body.scrollTop = body.scrollHeight; return;
      }
      if (!str) { body.scrollTop = body.scrollHeight; return; }
      hist.push(str); hpos = hist.length;
      var parts = str.split(/\s+/), cmd = parts[0].toLowerCase(), args = parts.slice(1);
      if (commands.hasOwnProperty(cmd)) { try { commands[cmd](args); } catch (e) { print('ошибка: ' + e.message, 'err'); } }
      else print(cmd + ': команда не найдена. help — список команд.', 'err');
      body.scrollTop = body.scrollHeight;
    }

    function complete() {
      var parts = input.value.split(/\s+/), p2;
      if (parts.length <= 1) p2 = Object.keys(commands);
      else { p2 = sectionNames.concat(linkNames); if (cwd && sections[cwd]) p2 = p2.concat(sections[cwd].map(function (it) { return it.n; })); }
      var frag = parts[parts.length - 1];
      var hits = p2.filter(function (c) { return c.indexOf(frag) === 0; });
      if (hits.length === 1) { parts[parts.length - 1] = hits[0]; input.value = parts.join(' '); }
      else if (hits.length > 1) print(hits.slice(0, 40).join('   '), 'dim');
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { run(input.value); input.value = ''; }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (hpos > 0) { hpos--; input.value = hist[hpos]; } }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (hpos < hist.length - 1) { hpos++; input.value = hist[hpos]; } else { hpos = hist.length; input.value = ''; } }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); commands.clear(); }
    });
    body.addEventListener('click', function (e) { if (e.target.tagName !== 'A') input.focus(); });

    function ready() { if (line) line.hidden = false; input.focus(); if (mode === 'full') setTimeout(function () { run('ls'); }, reduced ? 0 : 140); }
    var boot;
    if (mode === '404') {
      var path = w.location.pathname || '/404';
      boot = [['$ curl -i https://teamleads.kz' + path, 'cy'], ['HTTP/1.1 404 Not Found', 'dim'], ['content-type: text/html; charset=utf-8', 'dim'], ['', null], ['Ресурс не найден. Но раз вы здесь — поднимаем сессию.', null], ['Это Shell Mode: навигируйте по сайту прямо отсюда. help — команды.', 'hint'], ['', null]];
    } else {
      boot = [['Teamleads Shell — навигация по сайту из терминала.', 'cy'], ['help — команды · ls — осмотреться · open <стр> — открыть · find <слово> — поиск.', 'hint'], ['', null]];
    }
    function bootSeq(i) { if (i >= boot.length) { ready(); return; } print(boot[i][0], boot[i][1]); setTimeout(function () { bootSeq(i + 1); }, reduced ? 0 : 200); }
    setPrompt(); bootSeq(0);
  }

  function autoMount() { var ns = d.querySelectorAll('[data-term]'); for (var i = 0; i < ns.length; i++) mount(ns[i]); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', autoMount); else autoMount();
  w.TeamleadsShell = { mount: mount };
})(window, document);
