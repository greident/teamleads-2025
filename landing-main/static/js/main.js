/**
 * Тимлид не кодит - Landing Page Scripts
 */

(function() {
    'use strict';

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Animate value counter
    function animateValue(element, start, end, duration, suffix = '') {
        const range = end - start;
        const startTime = performance.now();

        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(start + range * easeOut);

            element.textContent = current.toLocaleString('ru-RU').replace(/,/g, ' ') + suffix;

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };

        requestAnimationFrame(update);
    }

    // Stats animation on scroll
    const observerOptions = {
        threshold: 0.5,
        rootMargin: '0px'
    };

    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const statNumbers = entry.target.querySelectorAll('.stat-number');
                statNumbers.forEach(stat => {
                    const value = parseInt(stat.dataset.value || stat.textContent.replace(/\D/g, ''));
                    const suffix = stat.dataset.suffix || '';
                    animateValue(stat, 0, value, 2000, suffix);
                });
                statsObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const heroStats = document.querySelector('.hero-stats');
    if (heroStats) {
        statsObserver.observe(heroStats);
    }

    // Parallax effect for gradient orbs (desktop pointers only — no-op on touch)
    let ticking = false;
    if (window.matchMedia('(pointer: fine)').matches)
    document.addEventListener('mousemove', (e) => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const orbs = document.querySelectorAll('.gradient-orb');
                const x = e.clientX / window.innerWidth;
                const y = e.clientY / window.innerHeight;

                orbs.forEach((orb, index) => {
                    const speed = (index + 1) * 15;
                    const xOffset = (x - 0.5) * speed;
                    const yOffset = (y - 0.5) * speed;
                    orb.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
                });
                ticking = false;
            });
            ticking = true;
        }
    });

    // Fade in elements on scroll
    const fadeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                fadeObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    document.querySelectorAll('.feature-card, .section-header, .topics-cloud, .topics-insight').forEach(el => {
        el.classList.add('fade-in');
        fadeObserver.observe(el);
    });

    // Track Telegram link clicks via Yandex.Metrika
    document.querySelectorAll('a[href*="t.me/"]').forEach(link => {
        link.addEventListener('click', function () {
            var label = this.closest('.bottom-nav') ? 'bottom-nav'
                : this.closest('nav') ? 'nav'
                : this.closest('.hero') ? 'hero'
                : this.closest('.cta') ? 'cta'
                : this.closest('.footer') ? 'footer'
                : this.closest('.report-contribute') ? 'report'
                : location.pathname;
            if (typeof ym === 'function') {
                ym(106055675, 'reachGoal', 'telegram_click', { placement: label });
            }
        });
    });

    // Track add-to-calendar clicks
    document.querySelectorAll('[data-cal]').forEach(el => {
        el.addEventListener('click', function () {
            if (typeof ym === 'function') {
                ym(106055675, 'reachGoal', 'calendar_add', { type: this.dataset.cal });
            }
        });
    });

    // --- Next meetup: concrete date + live countdown -----------------------
    (function nextMeetup() {
        const card = document.querySelector('[data-iso-weekday]');
        const out = document.querySelector('[data-next-meetup]');
        if (!card || !out) return;
        const isoWd = parseInt(card.dataset.isoWeekday, 10); // Mon=1 … Wed=3
        const hour = parseInt(card.dataset.hour, 10);
        const tz = card.dataset.tz;
        const wdMap = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

        function tzOffsetMin(date) {
            const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit' })
                .formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
            const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
            return (asUTC - date.getTime()) / 60000; // minutes the tz is ahead of UTC
        }
        function nextInstant() {
            const now = new Date();
            for (let i = 0; i < 14; i++) {
                const probe = new Date(now.getTime() + i * 86400000);
                const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz,
                    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
                    .formatToParts(probe).reduce((a, x) => (a[x.type] = x.value, a), {});
                if (wdMap[p.weekday] !== isoWd) continue;
                const guess = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, hour, 0, 0));
                const inst = new Date(guess.getTime() - tzOffsetMin(guess) * 60000);
                if (inst.getTime() > now.getTime()) return inst;
            }
            return null;
        }
        const inst = nextInstant();
        if (!inst) return;
        let dateStr = new Intl.DateTimeFormat('ru-RU', { timeZone: tz,
            weekday: 'long', day: 'numeric', month: 'long' }).format(inst);
        dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
        const timeStr = new Intl.DateTimeFormat('ru-RU', { timeZone: tz,
            hour: '2-digit', minute: '2-digit' }).format(inst);

        function render() {
            const diff = inst.getTime() - Date.now();
            if (diff <= 0) { out.textContent = 'Идёт прямо сейчас — заходите в Telegram'; out.hidden = false; return; }
            const d = Math.floor(diff / 86400000),
                  h = Math.floor((diff % 86400000) / 3600000),
                  m = Math.floor((diff % 3600000) / 60000);
            const cd = d > 0 ? `через ${d} дн ${h} ч` : (h > 0 ? `через ${h} ч ${m} мин` : `через ${m} мин`);
            out.textContent = `Ближайшая: ${dateStr}, ${timeStr} · ${cd}`;
            out.hidden = false;
        }
        render();
        setInterval(render, 60000);
    })();

    // --- Bottom nav: active section ----------------------------------------
    (function bottomNav() {
        const path = location.pathname;
        document.querySelectorAll('.bottom-nav-item').forEach(a => {
            const p = a.dataset.path;
            const active = p === '/' ? (path === '/') : path.startsWith(p);
            if (active) a.classList.add('is-active');
        });
    })();

    // --- Report TOC scrollspy ----------------------------------------------
    (function reportScrollspy() {
        const toc = document.querySelector('[data-report-toc]');
        if (!toc) return;
        const links = Array.from(toc.querySelectorAll('a[href^="#"]'));
        const entries = links
            .map(a => ({ a, sec: document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))) }))
            .filter(e => e.sec);
        if (!entries.length) return;

        let active = null;
        const setActive = (a) => {
            if (a === active) return;
            if (active) active.parentElement.classList.remove('is-active');
            if (a) a.parentElement.classList.add('is-active');
            active = a;
        };

        // Highlight the last heading/section whose top has scrolled above the
        // offset line. Works for both tall section blocks (events) and thin
        // heading elements (articles), where an IntersectionObserver band would
        // miss targets at rest between headings.
        const offset = 120;
        const onScroll = () => {
            let current = entries[0];
            for (const e of entries) {
                if (e.sec.getBoundingClientRect().top - offset <= 0) current = e;
                else break;
            }
            setActive(current.a);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        onScroll();
    })();

    // --- Reading progress bar ----------------------------------------------
    (function readingProgress() {
        const bar = document.querySelector('[data-reading-progress] span');
        if (!bar) return;
        const upd = () => {
            const h = document.documentElement;
            const max = h.scrollHeight - h.clientHeight;
            bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
        };
        window.addEventListener('scroll', upd, { passive: true });
        window.addEventListener('resize', upd);
        upd();
    })();

    // --- Back to top --------------------------------------------------------
    (function backToTop() {
        const btn = document.querySelector('[data-back-to-top]');
        if (!btn) return;
        const upd = () => btn.classList.toggle('is-visible', window.scrollY > 600);
        window.addEventListener('scroll', upd, { passive: true });
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        upd();
    })();

    // --- PWA service worker (network-first; never serves stale content) -----
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
    }

})();
