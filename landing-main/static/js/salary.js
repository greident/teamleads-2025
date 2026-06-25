/*!
 * Teamleads Salary – shared live-salary data source for the community.
 * Pulls fresh, anonymized market data from the friendly service
 * techinterview.space (open CORS, read-only) and normalizes it into a small,
 * UI-agnostic shape: market median, per-grade ladder, local-vs-remote split,
 * a distribution histogram, FX rates and freshness. Caches per-filter in
 * sessionStorage (6h) so repeated queries are instant and kind to the API.
 *
 * Single source of truth: the Shell `salary` command consumes this, but so can
 * any page widget. NO dependencies. Exposed as window.TeamleadsSalary.
 *
 * Data © techinterview.space. We only read it and nudge people to contribute
 * their own salary back (CONTRIBUTE_URL) so the sample keeps improving.
 */
(function (w) {
  'use strict';

  var API = 'https://api.techinterview.space/api/salaries/chart?allowReadonly=true';
  var CONTRIBUTE_URL = 'https://techinterview.space/salaries';
  var SOURCE_URL = 'https://techinterview.space/salaries/overview';
  var TTL = 6 * 60 * 60 * 1000;   // 6h – salary data moves slowly
  var KEY = 'tnk_sal_';

  // techinterview.space grade enum → our canonical keys / RU labels / sort order.
  var GRADES = {
    1:  { key: 'trainee', label: 'Trainee', order: 1 },
    2:  { key: 'junior',  label: 'Junior',  order: 2 },
    5:  { key: 'middle',  label: 'Middle',  order: 3 },
    8:  { key: 'senior',  label: 'Senior',  order: 4 },
    11: { key: 'lead',    label: 'Lead',    order: 5 }
  };
  // Canonical grade key → API grade id. staff/principal isn't a separate grade
  // upstream, so it borrows lead's pool (closest live signal).
  var GRADE_BY_KEY = { trainee: 1, junior: 2, middle: 5, senior: 8, lead: 11, staff: 11 };

  // Canonical role key → API profession id (techinterview.space profession enum).
  var PROF_BY_KEY = {
    backend: 34, frontend: 33, fullstack: 35, mobile: 32,
    devops: 7, data: 14, ml: 38, qa: 2, analyst: 18, pm: 25, design: 23,
    teamlead: 10, techlead: 17, architect: 11, sysadmin: 8, ds: 12,
    security: 40, gamedev: 36, embedded: 37, ba: 4, sa: 18, po: 9
  };
  var PROF_LABEL = {
    34: 'Backend', 33: 'Frontend', 35: 'Fullstack', 32: 'Mobile',
    7: 'DevOps', 14: 'Data Engineer', 38: 'ML / AI', 2: 'QA', 18: 'System Analyst',
    25: 'Product Manager', 23: 'UI/UX Designer', 10: 'Teamlead', 17: 'Techlead',
    11: 'Architect', 8: 'System Administrator', 12: 'Data Scientist',
    40: 'Security Engineer', 36: 'Game Developer', 37: 'Embedded', 4: 'Business Analyst', 9: 'Product Owner'
  };

  function resolveGrade(name) {
    if (name == null || name === '') return null;
    var k = String(name).toLowerCase();
    if (GRADE_BY_KEY[k] != null) return GRADE_BY_KEY[k];
    if (GRADES[k]) return Number(k);          // already a numeric id
    return null;
  }
  function resolveProfession(name) {
    if (name == null || name === '') return null;
    var k = String(name).toLowerCase();
    if (PROF_BY_KEY[k] != null) return PROF_BY_KEY[k];
    if (PROF_LABEL[k]) return Number(k);      // already a numeric id
    return null;
  }

  function cacheGet(key) {
    try {
      if (!w.sessionStorage) return null;
      var raw = w.sessionStorage.getItem(KEY + key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.t || (nowMs() - o.t) > TTL) return null;
      return o.d;
    } catch (e) { return null; }
  }
  function cacheSet(key, data) {
    try { if (w.sessionStorage) w.sessionStorage.setItem(KEY + key, JSON.stringify({ t: nowMs(), d: data })); } catch (e) {}
  }
  // Math.random/Date.now are fine in the browser – just guard for odd hosts.
  function nowMs() { try { return Date.now(); } catch (e) { return 0; } }

  function usdRate(currencies) {
    var r = 0;
    (currencies || []).forEach(function (c) { if (c && (c.currencyString === '$' || c.currencyString === 'usd')) r = c.value; });
    return r;   // KZT per 1 USD
  }

  function ladder(rows) {
    return (rows || []).map(function (g) {
      var meta = GRADES[g.grade] || { key: String(g.grade), label: String(g.grade), order: g.grade };
      return { id: g.grade, key: meta.key, label: meta.label, order: meta.order,
               count: g.count || 0, median: g.medianSalary || 0, average: Math.round(g.averageSalary || 0), hasData: !!g.hasData };
    }).sort(function (a, b) { return a.order - b.order; });
  }
  function hist(h) {
    if (!h || !h.labels) return null;
    return { labels: h.labels.map(Number), items: (h.items || []).slice(), step: h.step || 0 };
  }

  // Normalize the raw API payload into a stable, UI-agnostic shape.
  function normalize(d, q) {
    var rate = usdRate(d.currencies);
    var pub = (d.currencies && d.currencies[0] && d.currencies[0].pubDate) || d.rangeEnd || '';
    return {
      query: q,
      count: d.salariesCount || 0,
      median: d.medianSalary || 0,
      average: Math.round(d.averageSalary || 0),
      remoteMedian: d.medianRemoteSalary || 0,
      remoteAverage: Math.round(d.averageRemoteSalary || 0),
      byGrade: ladder(d.localSalariesByGrade),
      remoteByGrade: ladder(d.remoteSalariesByGrade),
      histogram: hist(d.salariesByMoneyBarChart),
      remoteHistogram: hist(d.salariesByMoneyBarChartForRemote),
      usdRate: rate,
      rangeStart: d.rangeStart || '', rangeEnd: d.rangeEnd || '',
      updated: (pub || '').slice(0, 10),
      source: SOURCE_URL, contribute: CONTRIBUTE_URL
    };
  }
  function toUSD(kzt, rate) { return rate ? Math.round(kzt / rate) : 0; }

  // chart({ grade, profession }) → Promise<normalized>. grade/profession accept
  // canonical keys ('senior','backend'), RU is resolved upstream by the caller,
  // or raw numeric API ids. Omit both for the whole-market overview.
  function chart(opts) {
    opts = opts || {};
    var gid = resolveGrade(opts.grade), pid = resolveProfession(opts.profession);
    var qs = '';
    if (gid != null) qs += '&grade=' + gid;
    if (pid != null) qs += '&profsInclude=' + pid;
    var key = (gid || '') + ':' + (pid || '');
    var cached = cacheGet(key);
    if (cached) { cached._cached = true; return Promise.resolve(cached); }
    if (!w.fetch) return Promise.reject(new Error('no fetch'));
    return w.fetch(API + qs, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      var n = normalize(d, { grade: gid, profession: pid, gradeLabel: gid && GRADES[gid] ? GRADES[gid].label : '', professionLabel: pid ? PROF_LABEL[pid] : '' });
      cacheSet(key, n);
      return n;
    });
  }

  w.TeamleadsSalary = {
    chart: chart,
    toUSD: toUSD,
    resolveGrade: resolveGrade,
    resolveProfession: resolveProfession,
    GRADES: GRADES,
    GRADE_BY_KEY: GRADE_BY_KEY,
    PROF_BY_KEY: PROF_BY_KEY,
    PROF_LABEL: PROF_LABEL,
    CONTRIBUTE_URL: CONTRIBUTE_URL,
    SOURCE_URL: SOURCE_URL
  };
})(window);
