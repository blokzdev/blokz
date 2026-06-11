# Routines — Playbooks for Scheduled Content Sessions

This repo is designed to be operated by Claude routines (scheduled, GitHub-event, or
API-triggered sessions). CLAUDE.md is the binding contract; these are the per-routine
playbooks. Each playbook assumes: clean checkout, `npm ci` done, work on the session branch.

## Playbook: new article

1. Read `content/_index.json` — know what exists (avoid near-duplicates; prefer extending a
   series or interlinking with prior coverage).
2. Research the subject. Prefer primary sources (papers, specs, repos, docs) and record them
   for `sources:` frontmatter.
3. `npm run new:article -- --title "…" --topics <ids> [--series <id> --series-order N]`
4. Write the body per `docs/CONTENT-AUTHORING.md`. Interlink at least one related existing
   article when one exists. Embed an artifact if a concept genuinely benefits from one.
5. `npm run validate` → fix until green. `npm run build` if anything beyond pure content
   changed.
6. Commit (`content: add article <slug>`) including `content/_index.json`; push.

## Playbook: new artifact (+ optional companion article)

1. Survey `content/_index.json` artifacts to avoid overlap and to copy proven patterns —
   `block-mesh` (Three.js) and `neural-flow` (canvas 2D) are the references.
2. `npm run new:artifact -- --title "…" --type <t> --topics <ids>`
3. Implement per `docs/ARTIFACTS.md` (mount/cleanup contract, `createScene()` for Three).
4. **Verify it runs**: `npm run build` must pass; if a browser is available, load
   `/artifacts/<slug>` and confirm rendering + interaction + no console errors.
5. Fill in `controls`, set `featured` judiciously. Validate, commit (`artifact: add <slug>`).

## Playbook: refresh / iterate on existing content

1. Pick targets from `content/_index.json` (e.g. oldest `pubDate` in a fast-moving topic).
2. Verify claims against current sources; update body, code samples, and `sources:`.
3. Set `updatedDate`, add a brief in-body update note for substantive corrections.
4. `npm run index && npm run validate`, commit `content: update <slug> (<reason>)`.

## Playbook: taxonomy gardening (rare, deliberate)

Only when several queued articles genuinely don't fit existing topics: add one entry to
`content/taxonomy/topics.json` (unique `id`, `label`, `description`, unused-ish `hue` 0–360),
in its own commit (`taxonomy: add topic <id>`). Never rename or delete ids that published
articles use — URLs depend on them.

## Cadence suggestions (configure in claude.ai/code routines)

- **Weekly**: 1–2 new articles (alternate topics so no single topic stagnates).
- **Bi-weekly**: 1 new artifact, ideally paired with that week's article.
- **Monthly**: refresh pass over the 3–5 oldest articles in active topics; link-rot check on
  `sources:` URLs.
- **On PR / push (CI)**: validation + build already enforced by `.github/workflows/ci.yml`.

## Failure etiquette

- Validation failures are yours to fix in-session; never commit red.
- If a build failure traces to site code (not content), stop the content run and report it —
  don't patch `src/` from a content routine.
- If research can't substantiate the planned thesis, write the honest version or pick a
  different subject; never publish filler.
