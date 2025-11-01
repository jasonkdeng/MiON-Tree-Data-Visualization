Tree Yard 3D — Heights Visualizer

Overview

This is a small static project that visualizes tree heights in a 3D yard using three.js. You upload an Excel (.xlsx/.xls) or CSV file where the first column contains tree heights (numeric). The app arranges trees in a grid and scales each tree by its height.

Files

- index.html — UI and includes
- src/main.js — three.js scene, Excel parsing (SheetJS), and UI handling
- The site optionally supports `.xlsx` datasets via SheetJS in the browser; you can add `.xlsx` files named `dataset1.xlsx` etc. into `data/` and push them.
- If you'd like, I can update the workflow to run only for changes to filenames that match `data/dataset*.csv` (currently it triggers on all `data/**`). I can also add failure notifications (Slack/email) or limit to a specific branch only.
-
---

If you'd like, I can now: add an Action that creates a PR preview instead of directly deploying to production, or add a small test step that validates dataset shape (4x10) before deploying. Tell me which you prefer.


How to run (quick)
