---
title: FAQ
description: Common questions about Security Kit.
sidebar: { order: 2 }
---

**Is it free?** Yes. Security Kit is open source under the Apache-2.0 license.

**Does a full checklist mean my app is secure?** It means you covered the controls Security Kit knows for your
app. It is strong evidence, not a guarantee. High-risk apps should also get a professional review or penetration test.

**Does the website see my code?** No. The website never receives your code or answers. The automatic scan runs
only on your computer.

**Which languages and frameworks are supported?** Detection and code rules cover JavaScript/TypeScript,
Python, Java/Kotlin (Android and Spring), Swift and Dart (Flutter). The checklist and AI prompt work for any
stack — they describe *what* to do, and the AI or your team applies it in your language.

**Why are some checks marked "manual"?** Some things — authorization logic, backups, monitoring — can't be
proven by scanning code. Verify them and record a [sign-off](/docs/guides/sign-offs/).

**Can I use it in CI?** Yes — see [Check every pull request](/docs/guides/ci/).

**My AI tool made a change I don't like.** Review AI changes like any pull request. The prompt asks the AI to
make minimal changes, add tests, and list anything needing a human decision instead of guessing.
