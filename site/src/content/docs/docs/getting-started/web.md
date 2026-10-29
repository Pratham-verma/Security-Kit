---
title: Use it in your browser
description: Describe your app and get your checklist or AI prompt at /app — no install, nothing uploaded.
---

1. Open **[the app](/app/)** and click **Describe your app**.
2. Answer the questions — or click **Detect from my project** and pick your project folder. Security Kit reads your
   dependency and config files (like `package.json`, `pom.xml`, `pubspec.yaml`) **in your browser** and fills in the
   answers. Nothing is uploaded, and `.env` files are never opened.
3. Click **Save and continue**, then choose:
   - **[Checklist](/docs/guides/checklist/)** to work through the checks yourself, or
   - **[AI prompt](/docs/guides/ai-prompt/)** to let your AI coding tool do it.

Your answers and checklist ticks are saved in this browser (local storage). To keep them with your code, open
**Get your kit → Download seckit.yaml** and put the file in your project's root folder. To remove them from the
browser, use **Clear my answers** at the bottom of the sidebar.

## Already have a seckit.yaml?

Use **Import seckit.yaml** on the Describe page. The website and the CLI read and write the same file.
