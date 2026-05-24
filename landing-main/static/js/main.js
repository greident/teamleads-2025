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

    // Parallax effect for gradient orbs
    let ticking = false;
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
            var label = this.closest('nav') ? 'nav'
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

})();
