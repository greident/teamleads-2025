/*!
 * Teamleads Codex — an offline, Codex/ChatGPT-styled chat overlay. NO network calls.
 * Same engine as the Claude tool, OpenAI dark theme. Answers from the site's own
 * content (the shell's filesystem). Exposed as window.TeamleadsCodex.
 */
(function (w, d) {
  'use strict';

  var built = false, root, msgs, input, FS = { sections: {}, links: {} };

  function readFS() {
    var term = d.querySelector('[data-term]');
    if (term) { try { var f = JSON.parse(term.getAttribute('data-fs') || '{}'); if (f.sections) FS = f; } catch (e) {} }
  }

  function el(t, c, x) { var n = d.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }

  function mark() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = d.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'cx-mark'); svg.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 6; i++) {
      var e = d.createElementNS(ns, 'ellipse');
      e.setAttribute('cx', '12'); e.setAttribute('cy', '7'); e.setAttribute('rx', '2.6'); e.setAttribute('ry', '4.8');
      e.setAttribute('transform', 'rotate(' + (i * 60) + ' 12 12)');
      svg.appendChild(e);
    }
    return svg;
  }

  function build() {
    if (built) return; built = true;
    root = el('div', 'cx-overlay'); root.setAttribute('hidden', '');
    root.innerHTML =
      '<div class="cx-panel" role="dialog" aria-label="Codex — офлайн-ассистент">' +
        '<div class="cx-bar">' +
          '<span class="cx-brand"></span>' +
          '<div class="cx-titles"><strong>Codex</strong><span>офлайн-демо · отвечает по материалам сообщества</span></div>' +
          '<button class="cx-close" aria-label="Закрыть">✕</button>' +
        '</div>' +
        '<div class="cx-msgs" data-cx-msgs></div>' +
        '<form class="cx-form"><textarea class="cx-input" rows="1" placeholder="Спросите что-нибудь…" data-cx-input></textarea>' +
          '<button class="cx-send" type="submit" aria-label="Отправить">↑</button></form>' +
      '</div>';
    d.body.appendChild(root);
    root.querySelector('.cx-brand').appendChild(mark());
    msgs = root.querySelector('[data-cx-msgs]');
    input = root.querySelector('[data-cx-input]');

    root.querySelector('.cx-close').addEventListener('click', close);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !root.hasAttribute('hidden')) close(); });
    root.querySelector('.cx-form').addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    input.addEventListener('input', autoGrow);
  }

  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }

  function bubble(role) {
    var row = el('div', 'cx-row cx-' + role);
    if (role === 'bot') { var av = el('span', 'cx-av'); av.appendChild(mark()); row.appendChild(av); }
    var b = el('div', 'cx-bubble');
    row.appendChild(b); msgs.appendChild(row); msgs.scrollTop = msgs.scrollHeight;
    return b;
  }

  function typeInto(bubbleEl, text, links) {
    var reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var p = el('p', null, ''); bubbleEl.appendChild(p);
    if (reduced) { p.textContent = text; appendLinks(bubbleEl, links); return; }
    var i = 0;
    (function step() {
      p.textContent = text.slice(0, i); msgs.scrollTop = msgs.scrollHeight;
      if (i < text.length) { i += Math.max(1, Math.round(text.length / 90)); setTimeout(step, 16); }
      else { p.textContent = text; appendLinks(bubbleEl, links); }
    })();
  }

  function appendLinks(bubbleEl, links) {
    if (!links || !links.length) return;
    var box = el('div', 'cx-links');
    links.forEach(function (l) { var a = el('a', 'cx-link', l.title); a.href = l.url; box.appendChild(a); });
    bubbleEl.appendChild(box); msgs.scrollTop = msgs.scrollHeight;
  }

  function answer(q) {
    var ql = q.toLowerCase().trim();
    if (/(^|\s)(привет|здравств|хай|hello|hi|добр)/.test(ql))
      return { text: 'Привет! Я офлайн-версия Codex на сайте «Тимлид не кодит». Сетевых вызовов нет — подсказываю по материалам встреч и статей. Спросите про бас-фактор, карьеру, найм или продуктовых разработчиков.', links: [] };
    if (/(кто ты|что ты|ты кто|кто это|про тебя)/.test(ql))
      return { text: 'Я демонстрационный ассистент в стиле Codex (OpenAI) — без обращения к API. Отвечаю тем, что нахожу в материалах сообщества.', links: [{ title: 'openai.com/codex', url: 'https://openai.com/codex/' }] };
    if (/(спасибо|благодар|thanks|thx)/.test(ql))
      return { text: 'Пожалуйста! Спросите ещё или загляните в раздел статей.', links: [{ title: 'Все статьи →', url: '/articles/' }] };

    var words = ql.split(/\s+/).filter(function (x) { return x.length > 2; });
    var hits = [];
    Object.keys(FS.sections || {}).forEach(function (s) {
      (FS.sections[s] || []).forEach(function (it) {
        var t = (it.t || '').toLowerCase();
        if (words.some(function (x) { return t.indexOf(x) !== -1; })) hits.push(it);
      });
    });
    if (hits.length)
      return { text: 'Поискал в материалах сообщества — вот что релевантно вашему вопросу:', links: hits.slice(0, 5).map(function (it) { return { title: it.t, url: it.u }; }) };

    var quips = [
      'Точного материала не нашёл, но вот мысль из обсуждений: бас-фактор — это плата за экономию, отложенная во времени.',
      'Прямого совпадения нет. Сообщество любит повторять: сеньора не дают — сеньора берут.',
      'Не нашёл прямого ответа. Общий принцип из встреч: срочно — значит, некачественно автоматически.',
      'В архиве ничего точного. Зато есть наблюдение: тимлид и техлид — две разные работы с одним названием.'
    ];
    return { text: quips[Math.floor(Math.random() * quips.length)] + ' Уточните запрос или загляните в раздел статей.', links: [{ title: 'Все статьи →', url: '/articles/' }] };
  }

  function botReply(q) {
    var typing = el('div', 'cx-row cx-bot');
    var av = el('span', 'cx-av'); av.appendChild(mark()); typing.appendChild(av);
    var dots = el('div', 'cx-bubble cx-typing'); dots.innerHTML = '<span></span><span></span><span></span>';
    typing.appendChild(dots); msgs.appendChild(typing); msgs.scrollTop = msgs.scrollHeight;
    var reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () { msgs.removeChild(typing); var a = answer(q); typeInto(bubble('bot'), a.text, a.links); }, reduced ? 0 : 450);
  }

  function userBubble(t) { var b = bubble('user'); b.appendChild(el('p', null, t)); msgs.scrollTop = msgs.scrollHeight; }

  function submit() {
    var t = input.value.trim(); if (!t) return;
    userBubble(t); input.value = ''; autoGrow(); botReply(t);
  }

  function open(initial) {
    build(); readFS();
    if (!msgs.childNodes.length)
      typeInto(bubble('bot'), 'Здравствуйте! Я офлайн-ассистент в стиле Codex. Сетевых вызовов нет — отвечаю по материалам сообщества «Тимлид не кодит». О чём расскажете?', []);
    root.removeAttribute('hidden'); d.body.classList.add('cx-lock');
    setTimeout(function () { input.focus(); }, 50);
    if (initial && initial.trim()) { userBubble(initial.trim()); botReply(initial.trim()); }
  }
  function close() { if (root) { root.setAttribute('hidden', ''); d.body.classList.remove('cx-lock'); } }

  w.TeamleadsCodex = { open: open, close: close };
})(window, document);
