/*!
 * TeamleadsSearch — site search as a deep-link into the Claude/Codex chat tool.
 * ONE function (open) powers MANY entry points: the nav magnifier, global
 * Ctrl/Cmd+K, the /search/?q= page, and the in-overlay Claude⇄Codex switcher.
 * The "results UI" is the existing chat overlay (full-text grep + citations),
 * so this file only wires triggers — no new results rendering. Falls back to
 * the shell's `grep` when the overlay isn't available.
 * Exposed as window.TeamleadsSearch = { open, switchTool }.
 */
(function (w, d) {
  'use strict';

  function claudeVisible() { var r = d.querySelector('.cl-overlay'); return !!(r && !r.hasAttribute('hidden')); }
  function codexVisible() { var r = d.querySelector('.cx-overlay'); return !!(r && !r.hasAttribute('hidden')); }
  function anyVisible() { return claudeVisible() || codexVisible(); }

  function openClaude(q) { var C = w.TeamleadsClaude; return !!(C && C.open && (C.open(q || ''), true)); }
  function openCodex(q) { var X = w.TeamleadsCodex; return !!(X && X.open && (X.open(q || ''), true)); }

  // Yandex.Metrika goal: who opened search, and from where (counter 106055675).
  // Records the SOURCE and whether a query was present — never the query text.
  function track(source, q, tool) {
    try {
      if (!w.ym) return;
      w.ym(106055675, 'reachGoal', 'search_open', {
        source: source || 'unknown',
        tool: tool || (codexVisible() ? 'codex' : 'claude'),
        query: q ? 'yes' : 'no'
      });
    } catch (e) {}
  }

  // The single entry point every trigger calls. `source` = who called it.
  function open(query, tool, source) {
    var q = (query == null ? '' : String(query)).trim();
    track(source, q, tool);
    if (tool === 'codex' && openCodex(q)) return true;
    if (tool === 'claude' && openClaude(q)) return true;
    // if a tool is already open, keep that surface
    if (codexVisible() && openCodex(q)) return true;
    if (openClaude(q)) return true;
    // fallback: deep-link into the shell grep
    w.location.href = '/shell/#grep ' + encodeURIComponent(q || '');
    return false;
  }

  // Claude ⇄ Codex: re-run the current query in the other tool.
  function currentQuery() {
    if (claudeVisible() && w.TeamleadsClaude && w.TeamleadsClaude.lastQuery) return w.TeamleadsClaude.lastQuery();
    if (codexVisible() && w.TeamleadsCodex && w.TeamleadsCodex.lastQuery) return w.TeamleadsCodex.lastQuery();
    return '';
  }
  function switchTool() {
    var q = currentQuery();
    if (claudeVisible()) { track('switch', q, 'codex'); w.TeamleadsClaude && w.TeamleadsClaude.close && w.TeamleadsClaude.close(); openCodex(q); }
    else if (codexVisible()) { track('switch', q, 'claude'); w.TeamleadsCodex && w.TeamleadsCodex.close && w.TeamleadsCodex.close(); openClaude(q); }
    else open(q, 'claude', 'switch');
  }

  // Global Ctrl/Cmd+K: open Claude, or close if a tool is already open (toggle).
  // Left alone inside the shell terminal input (Ctrl+K = kill-to-EOL there).
  d.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      var ae = d.activeElement;
      if (ae && ae.classList && ae.classList.contains('term-input')) return;
      e.preventDefault();
      if (claudeVisible()) { w.TeamleadsClaude.close(); return; }
      if (codexVisible()) { w.TeamleadsCodex.close(); return; }
      open('', '', 'hotkey');
    }
  });

  // Declarative triggers: any [data-search-open] opens search.
  // Label the source via data-search-source (e.g. the nav magnifier → "nav").
  d.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-search-open]');
    if (!t) return;
    e.preventDefault();
    open(t.getAttribute('data-search-q') || '', t.getAttribute('data-search-tool') || '', t.getAttribute('data-search-source') || 'button');
  });

  // /search/ page: bind the form + auto-run ?q= on load.
  function initSearchPage() {
    var page = d.querySelector('[data-search-page]');
    if (!page) return;
    var form = page.querySelector('[data-search-form]');
    var input = page.querySelector('[data-search-input]');
    if (form && input) form.addEventListener('submit', function (e) { e.preventDefault(); open(input.value, '', 'search_page'); });
    var q = '';
    try { q = (new URLSearchParams(w.location.search || '')).get('q') || ''; } catch (e) {}
    q = q.trim();
    if (q) { if (input) input.value = q; setTimeout(function () { open(q, '', 'search_page_url'); }, 250); }
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', initSearchPage);
  else initSearchPage();

  w.TeamleadsSearch = { open: open, switchTool: switchTool };
})(window, document);
