#!/usr/bin/env bash
# Run once by the repo owner after the first push to GitHub (docs/OPERATIONS.md § 5).
# Needs gh logged in with admin rights on the repo.
#
#   ./scripts/protect-main.sh               PR required, CI (check + secrets) green, no force-push/deletion
#   ./scripts/protect-main.sh --reviews 1   … and one approving review
#
# The required check names are the job names in .github/workflows/ci.yml; rename one there, rename it here.
set -euo pipefail
cd "$(dirname "$0")/.."

REVIEWS=0
if [ "${1:-}" = "--reviews" ]; then REVIEWS=${2:?"--reviews needs a number, e.g. --reviews 1"}; fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Protecting main on $REPO (required approving reviews: $REVIEWS) …"

if ! gh api -X PUT "repos/$REPO/branches/main/protection" --input - > /dev/null << JSON; then
{
  "required_status_checks": { "strict": false, "contexts": ["check", "secrets"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": $REVIEWS },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
  echo "✗ GitHub refused. Private repos on a free plan can't use branch protection: make the repo public," >&2
  echo "  upgrade the plan, or rely on the local hooks and the team rules (CONTRIBUTING.md)." >&2
  exit 1
fi

gh repo edit "$REPO" --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
  --delete-branch-on-merge > /dev/null

echo "✓ main: PR required, 'check' and 'secrets' must pass, no force-push, no deletion."
echo "✓ repo: squash merges only, branches deleted after merge."
