@AGENTS.md

## Keeping docs in sync

Each doc has one job. Feature status is recorded in exactly one place,
`ROADMAP.md`. Don't write status lines anywhere else.

| Doc | Holds | Committed? |
|---|---|---|
| `README.md` | What the app is, for visitors | yes |
| `ROADMAP.md` | **Feature status**: one row per feature, with status and commit | yes |
| `docs/TECHNICAL.md` | What is **built**: architecture, data model, §11 design-vs-code deltas, §12 limitations, §13 gotchas | yes |
| `plans/*.md` | Design notes only: `v1.md` (RAG steps 5-7), `flashcards.md`, `phase2.md`, `voice.md`, `byom.md` | no (gitignored) |
| `plans/archive/` | The original PLAN.md / PHASE2.md / FLASHCARDS.md, kept for history | no |

`npm run docs:status` lists code commits that TECHNICAL.md or ROADMAP.md
haven't caught up with. CI runs the same script on every push, and it only
warns.

**When asked to "sync docs"** (or after a push, when the user mentions it):

1. Run `npm run docs:status` and read the diff of every commit it lists
   (`git show <sha>`), not just the commit messages.
2. Update `docs/TECHNICAL.md`: the relevant sections, the header's "as of"
   date and commit, the "since the last revision" summary, §11 if the build
   departed from a design, §12/§13 if a limitation or gotcha was found. Check
   claims against the code. A file path or function location in the doc that
   no longer matches is a bug.
3. Update `ROADMAP.md`: status and commit for each feature the commits touch,
   a new row for work that shipped outside any plan, and the "Next up" line.
4. Edit `plans/*.md` only when a design decision changed (e.g. a migration
   number got taken). Never add status there.
5. Update `README.md` only if user-facing behavior changed.
6. Don't commit. Show the user what changed and ask first. Commit the code
   and the doc updates together where possible, so the check sees them as
   synced.
