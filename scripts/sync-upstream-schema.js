#!/usr/bin/env node
/**
 * Keeps src/graphql/schema/upstream in step with DEFRA/fcp-dal-api.
 *
 *   node scripts/sync-upstream-schema.js          overwrite the local copies from upstream
 *   node scripts/sync-upstream-schema.js --check  exit 1 on any difference from upstream
 *
 * The check lists the upstream schema directory itself (GitHub trees API), so it
 * notices files we have never seen as well as changes to the ones we copy:
 *
 *   - a vendored file differs upstream        -> drift, run the sync
 *   - a vendored file no longer exists upstream -> renamed or removed, update VENDORED
 *   - an upstream file is neither vendored nor
 *     listed in EXCLUDED                        -> new file, decide and classify it
 *
 * Set GITHUB_TOKEN to lift the anonymous API rate limit; the PR workflow passes the
 * Actions token automatically.
 *
 * If the upstream repository cannot be read at all (404/401/403, e.g. it is private and
 * the token has no access) the check reports that and exits 0: the vendored copies are
 * still what the stub serves, and an unreachable upstream must not block every pull
 * request. Any other failure, and any drift, exits 1.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const UPSTREAM_REPO = 'DEFRA/fcp-dal-api'
const UPSTREAM_REF = 'main'
const TYPES_DIR = 'app/graphql/types'
const STATIC_DIR = 'app/data-sources/static'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localSchemaDir = 'src/graphql/schema/upstream'

/**
 * Upstream path -> local path. Everything under TYPES_DIR must appear either
 * here or in EXCLUDED, otherwise the check fails.
 */
const VENDORED = {
  [`${TYPES_DIR}/directives.gql`]: `${localSchemaDir}/directives.gql`,
  [`${TYPES_DIR}/scalar.gql`]: `${localSchemaDir}/scalar.gql`,
  [`${TYPES_DIR}/common.gql`]: `${localSchemaDir}/common.gql`,
  [`${TYPES_DIR}/business/business.gql`]: `${localSchemaDir}/business/business.gql`,
  [`${TYPES_DIR}/business/land.gql`]: `${localSchemaDir}/business/land.gql`,
  [`${TYPES_DIR}/business/agreement.gql`]: `${localSchemaDir}/business/agreement.gql`,
  [`${TYPES_DIR}/business/application.gql`]: `${localSchemaDir}/business/application.gql`,
  [`${TYPES_DIR}/business/county-parish-holding.gql`]: `${localSchemaDir}/business/county-parish-holding.gql`,
  [`${TYPES_DIR}/business/permitted-functions.gql`]: `${localSchemaDir}/business/permitted-functions.gql`,
  [`${TYPES_DIR}/customer/customer.gql`]: `${localSchemaDir}/customer/customer.gql`,
  [`${TYPES_DIR}/customer/messages.gql`]: `${localSchemaDir}/customer/messages.gql`,
  [`${TYPES_DIR}/permissions/permissions.gql`]: `${localSchemaDir}/permissions/permissions.gql`,
  [`${STATIC_DIR}/permission-groups.json`]:
    'src/data/static/permission-groups.json'
}

/**
 * Upstream files we have looked at and deliberately do not copy, with the reason.
 * A file that stops being relevant should be moved here rather than silently dropped.
 */
const EXCLUDED = {
  [`${TYPES_DIR}/base.gql`]:
    'declares Query/Mutation roots and a WIP example; the stub authors its own Query in schema/stub/query.gql',
  [`${TYPES_DIR}/common-inputs.gql`]: 'input types used only by mutations',
  [`${TYPES_DIR}/business/query.gql`]:
    'root fields are authored in schema/stub/query.gql so only implemented operations are advertised',
  [`${TYPES_DIR}/customer/query.gql`]:
    'root fields are authored in schema/stub/query.gql so only implemented operations are advertised',
  [`${TYPES_DIR}/permissions/query.gql`]:
    'root fields are authored in schema/stub/query.gql so only implemented operations are advertised',
  [`${TYPES_DIR}/business/mutation/additional-details.gql`]:
    'mutations are not implemented',
  [`${TYPES_DIR}/business/mutation/all-fields.gql`]:
    'mutations are not implemented',
  [`${TYPES_DIR}/business/mutation/bank-details.gql`]:
    'mutations are not implemented',
  [`${TYPES_DIR}/business/mutation/create.gql`]:
    'mutations are not implemented',
  [`${TYPES_DIR}/business/mutation/details.gql`]:
    'mutations are not implemented',
  [`${TYPES_DIR}/business/mutation/permissions.gql`]:
    'mutations are not implemented',
  [`${TYPES_DIR}/customer/mutation.gql`]: 'mutations are not implemented',
  [`${TYPES_DIR}/business/bank-accounts.gql`]:
    'bank accounts are not served by the stub',
  [`${TYPES_DIR}/business/payments.gql`]:
    'payments come from Hitachi and are not served by the stub',
  [`${TYPES_DIR}/business/search.gql`]: 'search is not served by the stub',
  [`${TYPES_DIR}/customer/search.gql`]: 'search is not served by the stub',
  [`${TYPES_DIR}/permissions/internal-user.gql`]:
    'internal (Rural Payments portal) users are not served by the stub',
  [`${TYPES_DIR}/reference-data/query.gql`]:
    'reference data is not served by the stub',
  [`${TYPES_DIR}/reference-data/reference-data.gql`]:
    'reference data is not served by the stub'
}

const headers = {
  'user-agent': 'grants-platform-dal-stub schema sync',
  ...(process.env.GITHUB_TOKEN && {
    authorization: `Bearer ${process.env.GITHUB_TOKEN}`
  })
}

class UpstreamUnreachable extends Error {}

async function fetchJson(url) {
  const response = await fetch(url, { headers })
  if ([401, 403, 404].includes(response.status)) {
    throw new UpstreamUnreachable(
      `${response.status} ${response.statusText} fetching ${url}`
    )
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} fetching ${url}`)
  }
  return response.json()
}

async function fetchRaw(upstreamPath) {
  const url = `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${UPSTREAM_REF}/${upstreamPath}`
  const response = await fetch(url, { headers })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} fetching ${url}`)
  }
  return response.text()
}

/** Every file path under TYPES_DIR at the upstream ref. */
async function listUpstreamSchemaFiles() {
  const tree = await fetchJson(
    `https://api.github.com/repos/${UPSTREAM_REPO}/git/trees/${UPSTREAM_REF}?recursive=1`
  )
  if (tree.truncated) {
    throw new Error(
      'GitHub tree listing was truncated; cannot verify upstream schema files'
    )
  }
  return tree.tree
    .filter(
      (entry) => entry.type === 'blob' && entry.path.startsWith(`${TYPES_DIR}/`)
    )
    .map((entry) => entry.path)
    .sort()
}

async function main() {
  const check = process.argv.includes('--check')
  const problems = []
  const updated = []

  // 1. Files upstream that we have never classified (new or renamed-to).
  let upstreamFiles
  try {
    upstreamFiles = await listUpstreamSchemaFiles()
  } catch (err) {
    if (err instanceof UpstreamUnreachable) {
      console.warn(
        `Upstream schema check SKIPPED: ${UPSTREAM_REPO}@${UPSTREAM_REF} is not readable (${err.message}).\n` +
          'The comparison resumes once the repository is readable again.'
      )
      return
    }
    throw err
  }
  for (const upstreamPath of upstreamFiles) {
    if (!(upstreamPath in VENDORED) && !(upstreamPath in EXCLUDED)) {
      problems.push(
        `new upstream file ${upstreamPath}: add it to VENDORED (and copy it) or to EXCLUDED with a reason`
      )
    }
  }

  // 2. Classified files that no longer exist upstream (renamed-from or removed).
  for (const upstreamPath of Object.keys(EXCLUDED)) {
    if (
      upstreamPath.startsWith(`${TYPES_DIR}/`) &&
      !upstreamFiles.includes(upstreamPath)
    ) {
      problems.push(
        `${upstreamPath} is listed in EXCLUDED but no longer exists upstream; remove the entry`
      )
    }
  }

  // 3. Vendored files: compare content (and detect removal).
  for (const [upstreamPath, localPath] of Object.entries(VENDORED)) {
    const upstream = await fetchRaw(upstreamPath)
    if (upstream === null) {
      problems.push(
        `${upstreamPath} no longer exists upstream (renamed or removed); update VENDORED and ${localPath}`
      )
      continue
    }
    const absolute = path.join(root, localPath)
    const local = await fs.readFile(absolute, 'utf8').catch(() => null)
    if (local === upstream) continue

    if (check) {
      problems.push(`${localPath} differs from upstream ${upstreamPath}`)
    } else {
      await fs.mkdir(path.dirname(absolute), { recursive: true })
      await fs.writeFile(absolute, upstream)
      updated.push(localPath)
    }
  }

  if (updated.length > 0) {
    for (const file of updated) console.log(`updated ${file}`)
    console.log(
      `Review the diff, update resolvers if needed, and record the upstream commit in ${localSchemaDir}/UPSTREAM.md`
    )
  } else if (!check) {
    console.log('Vendored files already up to date')
  }

  if (problems.length > 0) {
    console.error(
      `Upstream schema check against ${UPSTREAM_REPO}@${UPSTREAM_REF} FAILED:`
    )
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exitCode = 1
    return
  }
  if (check) {
    console.log(
      `Upstream schema check passed: ${Object.keys(VENDORED).length} vendored and ${Object.keys(EXCLUDED).length} excluded files all accounted for at ${UPSTREAM_REPO}@${UPSTREAM_REF}`
    )
  }
}

await main()
