/*!
 * Teamleads Claude — an offline, Claude-styled chat overlay. NO network calls.
 * It answers from the site's own content (the same filesystem the shell uses):
 * matches your question against meetup/article titles and surfaces the pages,
 * with canned community wisdom as a fallback. Exposed as window.TeamleadsClaude.
 */
(function (w, d) {
  'use strict';

  var built = false, root, msgs, input, sendBtn, FS = { sections: {}, links: {} };

  function readFS() {
    var term = d.querySelector('[data-term]');
    if (term) { try { var f = JSON.parse(term.getAttribute('data-fs') || '{}'); if (f.sections) FS = f; } catch (e) {} }
  }

  function el(t, c, x) { var n = d.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }

  function sunburst() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = d.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'cl-mark'); svg.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 12; i++) {
      var r = d.createElementNS(ns, 'rect');
      r.setAttribute('x', '11.1'); r.setAttribute('y', '1.5'); r.setAttribute('width', '1.8'); r.setAttribute('height', '7.2');
      r.setAttribute('rx', '0.9'); r.setAttribute('transform', 'rotate(' + (i * 30) + ' 12 12)');
      svg.appendChild(r);
    }
    return svg;
  }

  function build() {
    if (built) return; built = true;
    root = el('div', 'cl-overlay'); root.setAttribute('hidden', '');
    root.innerHTML =
      '<div class="cl-panel" role="dialog" aria-label="Claude — офлайн-ассистент">' +
        '<div class="cl-bar">' +
          '<span class="cl-brand"></span>' +
          '<div class="cl-titles"><strong>Claude</strong><span>офлайн-демо · отвечает по материалам сообщества</span></div>' +
          '<button class="cl-close" aria-label="Закрыть">✕</button>' +
        '</div>' +
        '<div class="cl-msgs" data-cl-msgs></div>' +
        '<form class="cl-form"><textarea class="cl-input" rows="1" placeholder="Спросите что-нибудь…" data-cl-input></textarea>' +
          '<button class="cl-send" type="submit" aria-label="Отправить">↑</button></form>' +
      '</div>';
    d.body.appendChild(root);
    root.querySelector('.cl-brand').appendChild(sunburst());
    msgs = root.querySelector('[data-cl-msgs]');
    input = root.querySelector('[data-cl-input]');
    sendBtn = root.querySelector('.cl-send');

    root.querySelector('.cl-close').addEventListener('click', close);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !root.hasAttribute('hidden')) close(); });
    root.querySelector('.cl-form').addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    input.addEventListener('input', autoGrow);
  }

  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }

  function bubble(role) {
    var row = el('div', 'cl-row cl-' + role);
    if (role === 'bot') { var av = el('span', 'cl-av'); av.appendChild(sunburst()); row.appendChild(av); }
    var b = el('div', 'cl-bubble');
    row.appendChild(b); msgs.appendChild(row); msgs.scrollTop = msgs.scrollHeight;
    return b;
  }

  function typeInto(bubbleEl, text, links, done) {
    var reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var p = el('p', null, ''); bubbleEl.appendChild(p);
    if (reduced) { p.textContent = text; appendLinks(bubbleEl, links); if (done) done(); return; }
    var i = 0;
    (function step() {
      p.textContent = text.slice(0, i);
      msgs.scrollTop = msgs.scrollHeight;
      if (i < text.length) { i += Math.max(1, Math.round(text.length / 90)); setTimeout(step, 16); }
      else { p.textContent = text; appendLinks(bubbleEl, links); if (done) done(); }
    })();
  }

  function appendLinks(bubbleEl, links) {
    if (!links || !links.length) return;
    var box = el('div', 'cl-links');
    links.forEach(function (l) {
      var a = el('a', 'cl-link', l.title); a.href = l.url;
      box.appendChild(a);
    });
    bubbleEl.appendChild(box); msgs.scrollTop = msgs.scrollHeight;
  }

  function answer(q) {
    var ql = q.toLowerCase().trim();
    if (/(^|\s)(привет|здравств|хай|hello|hi|добр)/.test(ql))
      return { text: 'Привет! Я офлайн-версия Claude на сайте сообщества «Тимлид не кодит». Сетевых вызовов нет — я подсказываю по материалам встреч и статей. Спросите про бас-фактор, карьерные треки, найм или продуктовых разработчиков.', links: [] };
    if (/(кто ты|что ты|ты кто|кто это|про тебя)/.test(ql))
      return { text: 'Я демонстрационный ассистент в стиле Claude — без обращения к API. Отвечаю тем, что нахожу в материалах сообщества. Настоящий Claude живёт в Claude Code.', links: [{ title: 'claude.com/claude-code', url: 'https://claude.com/claude-code' }] };
    if (/(спасибо|благодар|thanks|thx)/.test(ql))
      return { text: 'Пожалуйста! Если хотите — спросите ещё или загляните в раздел статей.', links: [{ title: 'Все статьи →', url: '/articles/' }] };

    var words = ql.split(/\s+/).filter(function (x) { return x.length > 2; });
    var hits = [];
    Object.keys(FS.sections || {}).forEach(function (s) {
      (FS.sections[s] || []).forEach(function (it) {
        var t = (it.t || '').toLowerCase();
        if (words.some(function (x) { return t.indexOf(x) !== -1; })) hits.push(it);
      });
    });
    if (hits.length)
      return {
        text: 'Покопался в материалах сообщества и вот что нашёл по вашему вопросу — загляните:',
        links: hits.slice(0, 5).map(function (it) { return { title: it.t, url: it.u }; })
      };

    var quips = [
      'Точного материала не нашёл, но вот мысль из обсуждений: бас-фактор — это плата за экономию, отложенная во времени. Передавайте «почему», а не только «что».',
      'По этой теме в архиве ничего точного, но сообщество любит повторять: сеньора не дают — сеньора берут.',
      'Не нашёл прямого совпадения. Общий принцип из встреч: срочно — значит, некачественно автоматически.',
      'Прямого ответа в материалах нет. Зато есть наблюдение: тимлид и техлид — две разные работы с одним названием.'
    ];
    return { text: quips[Math.floor(Math.random() * quips.length)] + ' Попробуйте уточнить запрос или загляните в раздел статей.', links: [{ title: 'Все статьи →', url: '/articles/' }] };
  }

  function botReply(q) {
    var typing = el('div', 'cl-row cl-bot');
    var av = el('span', 'cl-av'); av.appendChild(sunburst()); typing.appendChild(av);
    var dots = el('div', 'cl-bubble cl-typing'); dots.innerHTML = '<span></span><span></span><span></span>';
    typing.appendChild(dots); msgs.appendChild(typing); msgs.scrollTop = msgs.scrollHeight;
    var reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () {
      msgs.removeChild(typing);
      var a = answer(q);
      typeInto(bubble('bot'), a.text, a.links);
    }, reduced ? 0 : 450);
  }

  // user messages appear instantly, not typed
  function userBubble(t) { var b = bubble('user'); var p = el('p', null, t); b.appendChild(p); msgs.scrollTop = msgs.scrollHeight; }

  function submit() {
    var t = input.value.trim(); if (!t) return;
    userBubble(t); input.value = ''; autoGrow(); botReply(t);
  }

  function open(initial) {
    build(); readFS();
    if (!msgs.childNodes.length) {
      typeInto(bubble('bot'), 'Здравствуйте! Я офлайн-ассистент в стиле Claude. Сетевых вызовов нет — отвечаю по материалам сообщества «Тимлид не кодит». О чём расскажете?', []);
    }
    root.removeAttribute('hidden');
    d.body.classList.add('cl-lock');
    setTimeout(function () { input.focus(); }, 50);
    if (initial && initial.trim()) { userBubble(initial.trim()); botReply(initial.trim()); }
  }
  function close() { if (root) { root.setAttribute('hidden', ''); d.body.classList.remove('cl-lock'); } }

  w.TeamleadsClaude = { open: open, close: close };
})(window, document);
