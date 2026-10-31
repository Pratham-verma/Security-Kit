---
title: Describe your app
description: How Security Kit decides which security controls your app needs.
sidebar: { order: 1 }
---

Security Kit builds your plan from a short description of your app, saved as `seckit.yaml`.

## Three ways to start

In the browser app, choose how to describe your app. Each way fills in the same questions; you check the answers,
save, and the security plan is built from them.

1. **Use your project files** (recommended) — choose a `.zip` of your project, or drop it on the page. You can also
   pick the folder instead. The zip is opened in your browser and never uploaded; only dependency, config and
   infrastructure files are read, and `.env` files never are. Leave out `node_modules` and build folders to make it
   faster. Archives over 2 GB, or with more than 500,000 entries, are refused.
2. **Describe it in your own words** — a few sentences such as *"A React web app with a Node.js API and PostgreSQL.
   Users sign in with Google. They pay with Stripe and upload photos to S3. It runs on AWS Lambda."* Security Kit
   recognises platforms, sign-in methods, databases, payments, uploads, AI features, mobile features and AWS
   services, and understands "no payments" or "without a password". It also suggests the data sensitivity and
   security level — health, finance and payments raise them. Your text is read in the browser, not sent anywhere.
3. **Answer the questions** — choose everything yourself.

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

In the browser, **Use your project files** reads your dependency files (`package.json`, `requirements.txt`,
`pyproject.toml`, `pom.xml`, Gradle files, `Podfile`, `Package.swift`, `pubspec.yaml`) and mobile config
(`AndroidManifest.xml`, `Info.plist`) locally. On your computer, `seckit init` does the same. It recognises
Node.js, Python (Django, Flask, FastAPI…), Java/Kotlin (Spring Boot, Micronaut, Quarkus, Ktor), Android, iOS,
Flutter and React Native, plus common databases, payment providers, auth libraries and AI SDKs. Always check the
result — detection suggests, you decide.
