---

name: custom-pages
description: Add a new screen to the Liv app (a dashboard, checklist, report, calculator or form) as a custom page in the farm workspace. Use when the farmer wants to see or do something the app has no screen for.
---

# Custom pages

Read and follow `ui-design` before building or changing a screen or Home card.

A custom page is a folder `pages/<id>/` in the farm workspace (your working directory). Liv lists
every folder with an `index.html` in its menu under "Your pages" and shows it inside the app.

For a herd list, a calendar or a camera wall, do not start from an empty file. `skill_search` the
catalog (for example `herd`), `skill_install` the `farm-views` skill and follow it: `page_scaffold`
copies a tested page that you then tune to the farmer. Build from scratch only what the catalog lacks.

1. Agree on what the page shows or does in one sentence.
2. Pick an id: lowercase letters, digits, `-` or `_` (for example `milk-board`).
3. Write `pages/<id>/page.json`: `{ "title": "Milk board", "description": "Yield per cow this week" }`.
   Add `"card": "card.html"` when the page should also show as a card on Home: a small summary
   (about 208 pixels tall, no controls, no scrolling) in `pages/<id>/card.html`. The card opens the page.
4. Write `pages/<id>/index.html`. Keep it small; extra files in the folder are served too, by
   relative path, so scripts can be modules (`<script type="module" src="./board.js">`) and settings
   can live in a JSON file you `fetch("./config.json")`. No CDNs or external requests: the farm PC
   may be offline.
5. For farm data, load the Liv helper and call it:

   ```html
   <script src="../_liv.js"></script>
   <script>
     const summary = await liv.query("farm.summary");          // any db.query name
     const cows = await liv.query("animals.list", { species: "cattle", limit: 200 });
     await liv.mutate("animals.upsert", { animal: { id, species: "cattle", groupName: "Dry" } });
     liv.on((event) => { if (event.type === "db.changed") refresh(); });
   </script>
   ```

   Wrap top-level `await` in an `async` function or use `<script type="module">`. Use the same
   named queries and mutations as the farm tools; never open `liv.sqlite`.
6. Match Liv's look by loading its stylesheet before the helper:
   `<link rel="stylesheet" href="../_liv.css">`. It brings Liv's colours, fonts and parts, in
   light and dark (the page follows the app's theme by itself): `liv-btn liv-btn--primary
   liv-btn--md`, `liv-badge liv-badge--ok|warn|danger|info`, `liv-input`, and for layout
   `kit-page`, `kit-page__title`, `kit-chips` + `kit-chip`, `kit-tiles` + `kit-tile`, `kit-list` +
   `kit-row`, `kit-facts`, `kit-figure`, `kit-tag` (ear tags), `kit-sheet` (a `<dialog>`), and
   `kit-cardview` on the `<body>` of a card. Use its colour variables (`var(--text-muted)`,
   `var(--accent-primary)`, `var(--border-subtle)`) instead of your own colours. No emoji as icons.
7. Tell the farmer where to find it ("Your pages" in the menu) and that they can undo it.

Rules
- The one-wearable rule applies in pages too: never let a page attach a second wearable.
- Pages run sandboxed: no pop-ups, no access to the app window. Do not try to work around it.
