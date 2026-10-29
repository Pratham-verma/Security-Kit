---
title: Describe your app
description: How Security Kit decides which security controls your app needs.
sidebar: { order: 1 }
---

Security Kit builds your plan from a short description of your app, saved as `seckit.yaml`.

## The questions

- **Where does it run?** Web frontend, backend/API, Android, iOS. A control only applies to the platforms it is for.
- **Most sensitive data:** low, medium or high.
- **How strict?** Level 1 (baseline), 2 (most apps with accounts or personal data) or 3 (critical apps such as
  banking or health) — based on OWASP ASVS levels. Higher levels add controls.
- **What your app has:** authentication, sessions, web frontend, API, databases, file uploads, payments, secrets,
  logging, mobile storage, mobile platform, AI features. Each has a few follow-up questions — for example *which
  database?* or *does the app fetch URLs that users provide?*
- **AI assistants:** which tools should get the rules.

## "Not sure" is a safe answer

When you answer **Not sure**, Security Kit includes every control that could apply. You get a slightly longer
checklist instead of missing something. Answer later for a tighter plan.

## Automatic detection

In the browser, **Detect from my project** reads your dependency files (`package.json`, `requirements.txt`,
`pyproject.toml`, `pom.xml`, Gradle files, `Podfile`, `Package.swift`, `pubspec.yaml`) and mobile config
(`AndroidManifest.xml`, `Info.plist`) locally. On your computer, `seckit init` does the same. It recognises
Node.js, Python (Django, Flask, FastAPI…), Java/Kotlin (Spring Boot, Micronaut, Quarkus, Ktor), Android, iOS,
Flutter and React Native, plus common databases, payment providers, auth libraries and AI SDKs. Always check the
result — detection suggests, you decide.
