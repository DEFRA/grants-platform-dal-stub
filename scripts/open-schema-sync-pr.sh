#!/usr/bin/env bash
# Run by the Sync DAL Schema workflow after schema:sync, whose result is the working tree.
# Opens a pull request for the vendored files that differ from the checked-out branch,
# brings an open one in line with upstream, or closes it once upstream no longer differs.
# Commits go through the API so they are signed.
set -euo pipefail

vendored=(src/graphql/schema/upstream src/data/static/permission-groups.json ":!$UPSTREAM_NOTES")

pr=$(gh pr list --base "$GITHUB_REF_NAME" --author app/github-actions --state open --json url,headRefName \
  --jq "map(select(.headRefName | startswith(\"$BRANCH_PREFIX\")))[0] // empty")
pr_url=$(jq -r '.url // empty' <<< "$pr")
branch=$(jq -r '.headRefName // empty' <<< "$pr")

if git diff --quiet -- "${vendored[@]}"; then
  # A failed sync leaves the files untouched too, so only a clean one proves upstream matches.
  if [ -n "$pr_url" ] && [ "$SYNC_STATUS" = 0 ]; then
    gh pr close "$pr_url" --comment "Closing: the vendored schema on \`$GITHUB_REF_NAME\` now matches upstream."
  fi
  exit 0
fi

upstream_sha=$(sed -n 's/^Upstream commit: //p' "$UPSTREAM_NOTES")
if [ -n "$pr_url" ]; then
  git fetch --quiet origin "$branch"
  branch_head=$(git rev-parse FETCH_HEAD)
else
  branch="$BRANCH_PREFIX-${upstream_sha:0:7}-$GITHUB_RUN_NUMBER"
  branch_head=$(git rev-parse HEAD)
  gh api --silent "repos/$GITHUB_REPOSITORY/git/refs" -f ref="refs/heads/$branch" -f sha="$branch_head"
fi

mapfile -t stale < <(git diff --name-only "$branch_head" -- "${vendored[@]}")
if [ "${#stale[@]}" -gt 0 ]; then
  branch_head=$(
    for file in "${stale[@]}" "$UPSTREAM_NOTES"; do
      jq -n --arg path "$file" --rawfile contents <(base64 -w0 "$file") '{path: $path, contents: $contents}'
    done |
      jq -s --arg repo "$GITHUB_REPOSITORY" --arg branch "$branch" --arg head "$branch_head" \
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
      gh api graphql --input - --jq .data.createCommitOnBranch.commit.oid
  )

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
    pr_url=$(gh pr create --base "$GITHUB_REF_NAME" --head "$branch" \
      --title 'Sync DAL schema with upstream' \
      --body-file "$RUNNER_TEMP/pr-body.md")
    jq -n --arg text ":arrows_counterclockwise: $GITHUB_REPOSITORY: the DAL schema changed upstream. Review and merge <$pr_url|the sync pull request>." '{text: $text}' |
      curl -sf -X POST -H 'content-type: application/json' --data @- "$SLACK_WEBHOOK_URL" ||
      echo '::warning::Could not announce the pull request in Slack'
  fi
fi

# Also covers a head whose checks were never started because an earlier run failed here.
if [ "$(gh run list --workflow check-pull-request.yml --commit "$branch_head" --json databaseId --jq length)" = 0 ]; then
  gh workflow run check-pull-request.yml --ref "$branch"
fi
