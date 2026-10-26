@AGENTS.md

## Implementation work goes to Codex

In this project, Claude's job is to plan, scope, and verify -- not to write
or edit application code directly. Any task that involves writing or
changing files under `app/`, `lib/`, or other source directories (not docs,
not pure investigation/research) is implemented by the `codex` CLI, not by
Claude's own Edit/Write tools. This doesn't apply to editing this repo's own
doc files (`CLAUDE.md`, `AGENTS.md`, `README.md`, `ROADMAP.md`,
`docs/TECHNICAL.md`, `plans/*.md`) -- Claude edits those directly.

1. Write a self-contained prompt to a scratch file first. Codex starts with
   none of the conversation's context, so the prompt has to spell out
   whatever a fresh engineer would need: exact file paths, the relevant
   pieces of this project's own conventions (design tokens in
   `app/globals.css`, the brutalist button classes, the font roles, the
   English-everywhere-except-the-chat-interface rule), and the precise
   scope -- what to change and what not to touch.
2. Run it non-interactively: `cat prompt.txt | codex exec -s workspace-write
   -C <repo root> -o <final-message file> -`. `-s workspace-write` lets it
   read/write within the repo and run shell commands (so it can run its own
   `tsc`/`eslint` checks) without network access or touching anything
   outside the working directory. Never pass
   `--dangerously-bypass-approvals-and-sandbox`.
3. Tell it explicitly, every time: read `AGENTS.md` and `CLAUDE.md` first;
   never create a git commit; run `npx tsc --noEmit -p .` and `npx eslint .`
   and fix every error before finishing; report file-by-file what changed
   and what it deliberately skipped and why.
4. After it finishes, Claude verifies independently rather than taking its
   summary on faith: `git diff --stat` to confirm only the expected files
   changed, rerun `tsc`/`eslint` itself, and read the actual diff on
   anything non-mechanical before reporting the work as done.

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
