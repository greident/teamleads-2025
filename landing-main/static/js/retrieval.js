/*!
 * Teamleads Retrieval – shared full-text lookup used by the Claude/Codex
 * offline assistants (and reusable anywhere). Fetches the Shell's grep index
 * (/shell-index.json) once, caches it, and ranks pages by query relevance:
 * phrase + title hits weighted above body hits, multi-word queries summed.
 * Returns ranked hits with snippets. NO network calls except the local static
 * index. Exposed as window.TeamleadsRetrieval.
 */
(function (w) {
  'use strict';

  var INDEX = null, loading = null;

  function fetchIndex() {
    if (INDEX) return Promise.resolve(INDEX);
    if (loading) return loading;
    if (!w.fetch) return Promise.reject(new Error('no fetch'));
    loading = w.fetch('/shell-index.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { INDEX = Array.isArray(j) ? j : []; return INDEX; }).catch(function (e) {
      loading = null; throw e;
    });
    return loading;
  }

  var STOP = {};
  'и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если или быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтобы будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем про без'
    .split(/\s+/).forEach(function (s) { if (s) STOP[s] = 1; });

  function tokens(q) {
    return (q || '').toLowerCase().split(/[^a-zа-я0-9ё]+/i).filter(function (t) {
      return t.length > 2 && !STOP[t];
    });
  }

  function snip(b, q) {
    if (!b) return '';
    var bl = b.toLowerCase(), want = (q || '').toLowerCase().trim(), pos = -1, toks = tokens(q);
    if (want) pos = bl.indexOf(want);
    for (var i = 0; pos === -1 && i < toks.length; i++) pos = bl.indexOf(toks[i]);
    if (pos === -1) pos = 0;
    var start = Math.max(0, pos - 42), end = start + 120;
    var chunk = b.slice(start, end).replace(/\s+/g, ' ').trim();
    return (start > 0 ? '… ' : '') + chunk + (end < b.length ? ' …' : '');
  }

  // Rank the index against the query. Returns [{ u, t, s, snip, score }] sorted desc.
  function rank(query) {
    if (!INDEX || !INDEX.length) return [];
    var words = tokens(query);
    if (!words.length) return [];
    var phrase = (query || '').toLowerCase().trim();
    var out = [];
    INDEX.forEach(function (p) {
      var t = (p.t || '').toLowerCase(), b = (p.b || '').toLowerCase(), score = 0;
      if (phrase && t.indexOf(phrase) !== -1) score += 14;
      if (phrase && b.indexOf(phrase) !== -1) score += 5;
      words.forEach(function (wd) {
        if (t.indexOf(wd) !== -1) score += 6;
        var i = b.indexOf(wd), c = 0;
        while (i !== -1 && c < 3) { score += 1; c++; i = b.indexOf(wd, i + wd.length); }
      });
      if (score > 0) out.push({ u: p.u, n: p.n, t: p.t, s: p.s, score: score, snip: snip(p.b, phrase || words[0]) });
    });
    out.sort(function (a, b2) { return b2.score - a.score; });
    return out;
  }

  function retrieve(query, limit) {
    return fetchIndex().then(function () { return rank(query).slice(0, limit || 5); }).catch(function () { return []; });
  }

  // Suggest the next shell command for an answer – a topical tool when the query
  // calls for one, otherwise `cat` of the best hit so the reader can open it inline.
  function suggest(query, hits) {
    var q = (query || '').toLowerCase();
    if (/зарплат|зп|вилк|грейд|сколько (?:получа|зараба|стоит)|salary/.test(q))
      return { cmd: 'salary', label: 'зарплатные вилки сообщества' };
    if (/симул|развилк|дилемм|\bsim\b/.test(q))
      return { cmd: 'sim', label: 'тимлид-симулятор' };
    var top = hits && hits[0];
    if (top && top.s && top.n) return { cmd: 'cat ' + top.s + '/' + top.n, label: 'прочитать в терминале' };
    return null;
  }

  // Shareable deep-link that reopens this question in the assistant (claude/codex)
  // via the shell's ?cmd= reader. Spaces become + (the reader maps them back).
  function shareUrl(verb, query) {
    var base = (w.location && w.location.origin) || 'https://teamleads.kz';
    return base + '/shell/?cmd=' + verb + '+' + encodeURIComponent((query || '').trim()).replace(/%20/g, '+');
  }

  w.TeamleadsRetrieval = { retrieve: retrieve, rank: rank, fetchIndex: fetchIndex, tokens: tokens, suggest: suggest, shareUrl: shareUrl };
})(window);
