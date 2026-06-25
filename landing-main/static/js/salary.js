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

  // techinterview.space KazakhstanCity enum → label, plus RU/EN aliases → id.
  var CITY_LABEL = {
    1: 'Актау', 2: 'Актобе', 3: 'Алматы', 4: 'Атырау', 5: 'Астана', 10: 'Караганда',
    12: 'Кызылорда', 14: 'Костанай', 17: 'Павлодар', 22: 'Семей', 25: 'Тараз',
    27: 'Туркестан', 28: 'Уральск', 29: 'Усть-Каменогорск', 30: 'Шымкент', 33: 'Экибастуз'
  };
  var CITY_BY_KEY = {
    almaty: 3, 'алматы': 3, alma: 3,
    astana: 5, 'астана': 5, 'нур-султан': 5, nursultan: 5, 'нурсултан': 5,
    shymkent: 30, 'шымкент': 30,
    karaganda: 10, 'караганда': 10,
    atyrau: 4, 'атырау': 4,
    aktobe: 2, 'актобе': 2,
    aktau: 1, 'актау': 1,
    pavlodar: 17, 'павлодар': 17,
    taraz: 25, 'тараз': 25,
    semey: 22, 'семей': 22,
    kostanay: 14, 'костанай': 14,
    oral: 28, uralsk: 28, 'уральск': 28,
    oskemen: 29, ustkamenogorsk: 29, 'усть-каменогорск': 29,
    kyzylorda: 12, 'кызылорда': 12, turkestan: 27, 'туркестан': 27, ekibastuz: 33, 'экибастуз': 33
  };

  // Popular skill ids (techinterview.space skill enum) → label, plus aliases → id.
  var SKILL_LABEL = {
    1: '.NET', 2: 'Laravel', 3: 'Angular', 6: 'C/C++', 7: 'Flutter', 10: 'Golang', 11: 'Java',
    12: 'React', 13: 'Vue', 14: 'TypeScript', 15: 'JavaScript', 16: 'Node.js', 17: 'PHP',
    19: 'Ruby', 20: 'Rust', 21: 'Scala', 27: 'Python', 31: 'Kotlin', 32: 'Swift', 35: 'Spring', 36: 'Django'
  };
  var SKILL_BY_KEY = {
    dotnet: 1, '.net': 1, net: 1, csharp: 1, 'c#': 1, laravel: 2, angular: 3,
    'c++': 6, cpp: 6, c: 6, flutter: 7, golang: 10, go: 10, java: 11,
    react: 12, vue: 13, vuejs: 13, typescript: 14, ts: 14, javascript: 15, js: 15,
    node: 16, nodejs: 16, 'node.js': 16, php: 17, ruby: 19, rails: 19, rust: 20, scala: 21,
    python: 27, py: 27, kotlin: 31, swift: 32, spring: 35, django: 36
  };

  function lookup(name, byKey, byLabel) {
    if (name == null || name === '') return null;
    var k = String(name).toLowerCase();
    if (byKey[k] != null) return byKey[k];
    if (byLabel[k]) return Number(k);   // already a numeric id
    return null;
  }
  function resolveGrade(name) { return lookup(name, GRADE_BY_KEY, GRADES); }
  function resolveProfession(name) { return lookup(name, PROF_BY_KEY, PROF_LABEL); }
  function resolveCity(name) { return lookup(name, CITY_BY_KEY, CITY_LABEL); }
  function resolveSkill(name) { return lookup(name, SKILL_BY_KEY, SKILL_LABEL); }
  function resolveMany(val, fn) {
    var arr = Array.isArray(val) ? val : (val == null || val === '' ? [] : [val]);
    var out = [];
    arr.forEach(function (v) { var id = fn(v); if (id != null && out.indexOf(id) === -1) out.push(id); });
    return out;
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
    var cids = resolveMany(opts.cities != null ? opts.cities : opts.city, resolveCity);
    var sids = resolveMany(opts.skills != null ? opts.skills : opts.skill, resolveSkill);
    var qs = '';
    if (gid != null) qs += '&grade=' + gid;
    if (pid != null) qs += '&profsInclude=' + pid;
    cids.forEach(function (c) { qs += '&cities=' + c; });
    sids.forEach(function (s) { qs += '&skills=' + s; });
    var key = (gid || '') + ':' + (pid || '') + ':' + cids.join(',') + ':' + sids.join(',');
    var cached = cacheGet(key);
    if (cached) { cached._cached = true; return Promise.resolve(cached); }
    if (!w.fetch) return Promise.reject(new Error('no fetch'));
    return w.fetch(API + qs, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      var n = normalize(d, {
        grade: gid, profession: pid, cities: cids, skills: sids,
        gradeLabel: gid && GRADES[gid] ? GRADES[gid].label : '',
        professionLabel: pid ? PROF_LABEL[pid] : '',
        cityLabels: cids.map(function (c) { return CITY_LABEL[c] || c; }),
        skillLabels: sids.map(function (s) { return SKILL_LABEL[s] || s; })
      });
      cacheSet(key, n);
      return n;
    });
  }

  w.TeamleadsSalary = {
    chart: chart,
    toUSD: toUSD,
    resolveGrade: resolveGrade,
    resolveProfession: resolveProfession,
    resolveCity: resolveCity,
    resolveSkill: resolveSkill,
    GRADES: GRADES,
    GRADE_BY_KEY: GRADE_BY_KEY,
    PROF_BY_KEY: PROF_BY_KEY,
    PROF_LABEL: PROF_LABEL,
    CITY_BY_KEY: CITY_BY_KEY,
    CITY_LABEL: CITY_LABEL,
    SKILL_BY_KEY: SKILL_BY_KEY,
    SKILL_LABEL: SKILL_LABEL,
    // Curated latin keys for autocomplete / hints (no cyrillic dupes).
    CITY_KEYS: ['almaty', 'astana', 'shymkent', 'karaganda', 'atyrau', 'aktobe', 'aktau', 'pavlodar', 'taraz', 'semey', 'kostanay', 'oral', 'oskemen', 'kyzylorda', 'turkestan'],
    SKILL_KEYS: ['python', 'java', 'golang', 'csharp', 'php', 'javascript', 'typescript', 'react', 'vue', 'angular', 'node', 'kotlin', 'swift', 'flutter', 'ruby', 'rust', 'scala', 'django', 'spring', 'laravel'],
    CONTRIBUTE_URL: CONTRIBUTE_URL,
    SOURCE_URL: SOURCE_URL
  };
})(window);
