# Тимлид не кодит

Monorepo for [teamleads.kz](https://teamleads.kz).

"Тимлид не кодит" is a professional community for tech leads, engineering managers, and CTOs in Kazakhstan. 400+ members from companies like Kaspi, Kolesa, DAR, Chocofamily, InDrive, and others share real-world experience on team management, architecture decisions, hiring, processes, and career growth. The community runs regular online meetups with structured discussions and published reports.

Telegram: [@teamleads_kz](https://t.me/teamleads_kz)

## Structure

```
.
├── landing-main/          # Main site (teamleads.kz) – Hugo
│   ├── content/events/    # Meeting report pages
│   ├── layouts/           # Templates, OG image generation
│   ├── assets/            # CSS, fonts, images
│   ├── static/            # Fonts, favicons
│   ├── deploy.sh          # rsync to production
│   └── Dockerfile         # Minimal Docker build
│
├── 2025/                  # Year-in-review analysis (2025.teamleads.kz)
│   ├── scripts/           # Python analysis scripts
│   ├── data/              # CSV exports, sentiment data
│   └── hugo-claude/       # Hugo site for 2025 review
│
└── 2026/
    └── events-reports/    # Raw meeting reports (markdown)
```

## Landing (teamleads.kz)

Hugo 0.153.4 extended. No external theme – custom layouts.

### Local dev

```bash
cd landing-main
hugo server
```

### Build

```bash
hugo --minify
```

### Docker

```bash
docker build -t teamleads-landing .
```

Two-stage build: `hugomods/hugo:exts-0.153.4` + `scratch`. Final image ~5MB, contains only static files in `/public`.

### Deploy

```bash
./deploy.sh
```

Builds and rsyncs to `ps-enter:/opt/teamleads.kz/latest/`.

## Meeting reports

Each community meeting produces:

1. **Raw report** in `2026/events-reports/meetup-YYYY-MM-DD/report.md`
2. **Hugo page** in `landing-main/content/events/meetup-YYYY-MM-DD.md` (HTML with CSS classes)
3. **Homepage card** in `landing-main/layouts/index.html`
4. **OG image** – auto-generated at build time via `layouts/partials/og-image.html`

OG images use Hugo's `images.Text` filter to render topic headers on a light gradient background with Inter TTF fonts.

## 2025 year-in-review

Telegram chat analysis: sentiment, topics, network graphs, activity patterns. Published at [2025.teamleads.kz](https://2025.teamleads.kz). See `2025/README.md` for details.
