#!/usr/bin/env bash
# Lists code commits that the tracking docs haven't caught up with yet.
#
# Each doc's baseline is the last commit that touched it, so a commit that
# changes code and the doc together counts as synced. plans/*.md is
# gitignored design material with no status in it, so it isn't checked.
#
# Always exits 0: this is a reminder, not a gate.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

DOCS=(docs/TECHNICAL.md ROADMAP.md)

# Paths whose changes the docs describe. Doc-only commits don't count.
CODE_PATHS=(app lib supabase evals scripts proxy.ts next.config.ts package.json
  ':(exclude)scripts/docs-status.sh')

stale=()
summary=""

for doc in "${DOCS[@]}"; do
  base=$(git log -1 --format=%H -- "$doc")
  if [[ -z $base ]]; then
    echo "?  $doc has never been committed"
    continue
  fi
  commits=$(git log --format='%h %ad %s' --date=short "$base..HEAD" -- "${CODE_PATHS[@]}")
  if [[ -z $commits ]]; then
    echo "✓  $doc is up to date (last updated in $(git rev-parse --short "$base"))"
  else
    stale+=("$doc")
    echo "✗  $doc is behind by $(wc -l <<<"$commits") code commit(s) since $(git rev-parse --short "$base"):"
    sed 's/^/     /' <<<"$commits"
    summary+=$'\n'"### \`$doc\`"$'\n```\n'"$commits"$'\n```\n'
  fi
done

if [[ ${GITHUB_ACTIONS:-} == true && ${#stale[@]} -gt 0 ]]; then
  echo "::warning title=Docs behind code::${stale[*]} not updated since the latest code commits. Ask Claude to \"sync docs\"."
  { echo "## Docs behind code"; echo "$summary"; } >>"$GITHUB_STEP_SUMMARY"
fi
exit 0
