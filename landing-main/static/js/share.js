/*!
 * Teamleads Share — a tiny, dependency-free share control for report pages.
 * Two modes, both reading config from data-* on the [data-share] root:
 *   data-url    canonical page URL (general share)
 *   data-title  page title (passed to the Web Share API)
 *   data-shell  deep-link into /shell/ that auto-runs `cat <section>/<base>`
 * Auto-mounts every [data-share] on load. Also exposed as window.TeamleadsShare.
 */
(function (w, d) {
  'use strict';

  function copy(text) {
    if (w.navigator && w.navigator.clipboard && w.navigator.clipboard.writeText) {
      return w.navigator.clipboard.writeText(text);
    }
    return new Promise(function (res, rej) {
      try {
        var ta = d.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        d.body.appendChild(ta);
        ta.select();
        var ok = d.execCommand('copy');
        d.body.removeChild(ta);
        ok ? res() : rej(new Error('execCommand failed'));
      } catch (e) { rej(e); }
    });
  }

  function init(root) {
    if (!root || root.__share) return;
    root.__share = true;

    var url = root.getAttribute('data-url') || w.location.href;
    var title = root.getAttribute('data-title') || d.title;
    var shell = root.getAttribute('data-shell') || '';
    var trigger = root.querySelector('[data-share-trigger]');
    var menu = root.querySelector('[data-share-menu]');
    var toast = root.querySelector('[data-share-toast]');
    var nativeBtn = root.querySelector('[data-share-native]');
    var canShare = !!(w.navigator && w.navigator.share);
    var toastT;

    function flash(msg) {
      if (!toast) return;
      toast.textContent = msg;
      root.classList.add('is-toast');
      clearTimeout(toastT);
      toastT = setTimeout(function () { root.classList.remove('is-toast'); }, 2200);
    }
    function openMenu(o) {
      if (!menu) return;
      menu.hidden = !o;
      root.classList.toggle('is-open', o);
      if (trigger) trigger.setAttribute('aria-expanded', o ? 'true' : 'false');
    }
    function done(msg) { flash(msg); openMenu(false); }

    if (nativeBtn && canShare) nativeBtn.hidden = false;

    if (trigger) trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      openMenu(!!menu.hidden);
    });

    root.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('[data-share-act]') : null;
      if (!item || !root.contains(item)) return;
      var act = item.getAttribute('data-share-act');
      if (act === 'copy') {
        e.preventDefault();
        copy(url).then(function () { done('Ссылка скопирована'); }, function () { done('Не удалось скопировать'); });
      } else if (act === 'shell-copy') {
        e.preventDefault();
        copy(shell).then(function () { done('Shell-ссылка скопирована'); }, function () { done('Не удалось скопировать'); });
      } else if (act === 'native') {
        e.preventDefault();
        if (canShare) w.navigator.share({ title: title, url: url }).catch(function () {});
        openMenu(false);
      } else if (act === 'shell-open') {
        openMenu(false); // it's a real <a> — let it navigate to the terminal
      }
    });

    d.addEventListener('click', function (e) { if (!root.contains(e.target)) openMenu(false); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') { openMenu(false); if (trigger) trigger.focus(); }
    });
  }

  function auto() { var ns = d.querySelectorAll('[data-share]'); for (var i = 0; i < ns.length; i++) init(ns[i]); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', auto); else auto();
  w.TeamleadsShare = { init: init };
})(window, document);
