#!/usr/bin/env bash
# Run by the Sync DAL Schema workflow once schema:sync has changed a vendored file.
# Commits the working tree changes to $BRANCH through the API, so the commit is signed,
# then opens or updates the pull request and starts its checks.
set -euo pipefail

pr_url=$(gh pr list --head "$BRANCH" --state open --json url --jq '.[0].url // empty')
if [ -n "$pr_url" ]; then
  git fetch --quiet origin "$BRANCH"
  mapfile -t drifted < <(git diff --name-only -- . ":!$UPSTREAM_NOTES")
  if git diff --quiet FETCH_HEAD -- "${drifted[@]}"; then
    echo "$pr_url already holds this sync"
    exit 0
  fi
  branch_head=$(git rev-parse FETCH_HEAD)
else
  branch_head=$(git rev-parse HEAD)
  gh api --silent -X PATCH "repos/$GITHUB_REPOSITORY/git/refs/heads/$BRANCH" -f sha="$branch_head" -F force=true 2>/dev/null ||
    gh api --silent "repos/$GITHUB_REPOSITORY/git/refs" -f ref="refs/heads/$BRANCH" -f sha="$branch_head"
fi

upstream_sha=$(sed -n 's/^Upstream commit: //p' "$UPSTREAM_NOTES")
for file in $(git diff --name-only); do
  jq -n --arg path "$file" --rawfile contents <(base64 -w0 "$file") '{path: $path, contents: $contents}'
done |
  jq -s --arg repo "$GITHUB_REPOSITORY" --arg branch "$BRANCH" --arg head "$branch_head" \
    --arg headline "Sync DAL schema with upstream ${upstream_sha:0:7}" '{
      query: "mutation ($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }",
      variables: {
        input: {
          branch: { repositoryNameWithOwner: $repo, branchName: $branch },
          expectedHeadOid: $head,
          message: { headline: $headline },
          fileChanges: { additions: . }
        }
      }
    }' |
  gh api graphql --silent --input -

{
  echo "The vendored DAL schema is behind [$UPSTREAM_REPO@${upstream_sha:0:7}](https://github.com/$UPSTREAM_REPO/commit/$upstream_sha). This PR is the output of \`npm run schema:sync\`."
  echo
  echo 'Before merging: review the diff and push any resolver or fixture fixes to this branch. Anything listed as FAILED below needs classifying by hand in `scripts/sync-upstream-schema.js`.'
  echo
  echo '```'
  cat "$RUNNER_TEMP/sync.log"
  echo '```'
} > "$RUNNER_TEMP/pr-body.md"

if [ -n "$pr_url" ]; then
  gh pr edit "$pr_url" --body-file "$RUNNER_TEMP/pr-body.md"
else
  pr_url=$(gh pr create --base "$GITHUB_REF_NAME" --head "$BRANCH" \
    --title 'Sync DAL schema with upstream' \
    --body-file "$RUNNER_TEMP/pr-body.md")
  jq -n --arg text ":arrows_counterclockwise: $GITHUB_REPOSITORY: the DAL schema changed upstream. Review and merge <$pr_url|the sync pull request>." '{text: $text}' |
    curl -sf -X POST -H 'content-type: application/json' --data @- "$SLACK_WEBHOOK_URL" ||
    echo '::warning::Could not announce the pull request in Slack'
fi

gh workflow run check-pull-request.yml --ref "$BRANCH"
