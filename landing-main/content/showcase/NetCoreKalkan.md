---
# Скопируйте этот файл в landing-main/content/showcase/
# Назовите файл латиницей через дефис: my-cool-project.md
# Отправьте Pull Request в репозиторий.

title: "NetCoreKalkan"
description: "Библиотека для работы с криптопровайдером АО \"НУЦ\" NetCoreKalkan" Ну или нейрослоп
projectUrl: "https://github.com/greident/NetCoreKalkan"
author: "Андрій Курдюмов"
date: 2026-05-24

# Теги (1–3 штуки). Примеры: SaaS, Open Source, Блог, Инструмент, Курс, Телеграм-канал, Библиотека
tags:
  - Open Source
  - Библиотека

# Контакты (заполните нужные, остальные удалите)
social:
  telegram: "greident"
  github: "greident"
  linkedin: ""
  twitter: ""

# Не меняйте
draft: false
---

<!-- Опишите проект подробнее: для кого, какую проблему решает, чем интересен. Markdown поддерживается. -->
канонизация).

KalkanCore — REST-эндпоинты crypt/SignXml, crypt/SignWsse, crypt/SignWsseRaw, crypt/verify/xml, crypt/verify/xml/base64. Деплой через Docker (docker-compose.yml), CI на GitLab.

Важный момент по безопасности

Verify* валидирует входящие запросы, поэтому trust-валидация обязательна (fail-closed). Без trust-стора проверяется только криптоматематика — самоподписанный сертификат с поддельным IIN/BIN прошёл бы  
как валидный. Это закрыто ChainValidator. Детали и открытые риски (GOST-2004 не покрыт тестом, hash-алгоритм OCSP CertID не подтверждён против живого ответчика) — в SECURITY_VALIDATION.md.             
                                                                                      

