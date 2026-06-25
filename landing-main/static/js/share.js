/*!
 * Teamleads Share — a tiny, dependency-free copy control for report pages.
 * Reads config from data-* on the [data-share] root:
 *   data-url       canonical page URL → copied by [data-share-copy]
 *   data-cmd-url   /shell/?cmd=… deep-link → copied by [data-share-cmd-copy]
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
    var cmdUrl = root.getAttribute('data-cmd-url') || '';
    var toast = root.querySelector('[data-share-toast]');
    var toastT;

    function flash(msg) {
      if (!toast) return;
      toast.textContent = msg;
      root.classList.add('is-toast');
      clearTimeout(toastT);
      toastT = setTimeout(function () { root.classList.remove('is-toast'); }, 2000);
    }

    root.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-share-copy],[data-share-cmd-copy]') : null;
      if (!btn || !root.contains(btn)) return;
      e.preventDefault();
      if (btn.hasAttribute('data-share-cmd-copy')) {
        copy(cmdUrl).then(function () { flash('Ссылка на терминал скопирована'); }, function () { flash('Не удалось скопировать'); });
      } else {
        copy(url).then(function () { flash('Ссылка скопирована'); }, function () { flash('Не удалось скопировать'); });
      }
    });
  }

  function auto() { var ns = d.querySelectorAll('[data-share]'); for (var i = 0; i < ns.length; i++) init(ns[i]); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', auto); else auto();
  w.TeamleadsShare = { init: init };
})(window, document);
