#!/usr/bin/env node
// Keeps src/graphql/schema/upstream in step with the DAL repository.
//
//   node scripts/sync-upstream-schema.js          copy the upstream files locally
//   node scripts/sync-upstream-schema.js --check  exit 1 if anything differs
//
// Env: GITHUB_TOKEN or UPSTREAM_SCHEMA_TOKEN (auth), UPSTREAM_REPO, UPSTREAM_REF.
// An unreadable upstream (401/403/404) skips the comparison with a warning.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const UPSTREAM_REPO = process.env.UPSTREAM_REPO || 'DEFRA/fcp-dal-api'
const UPSTREAM_REF = process.env.UPSTREAM_REF || 'main'
const TYPES_DIR = 'app/graphql/types'
const STATIC_DIR = 'app/data-sources/static'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localSchemaDir = 'src/graphql/schema/upstream'

// Copied verbatim to the same relative path under localSchemaDir.
const VENDORED_TYPES = [
  'directives.gql',
  'scalar.gql',
  'common.gql',
  'business/business.gql',
  'business/land.gql',
  'business/agreement.gql',
  'business/application.gql',
  'business/county-parish-holding.gql',
  'business/permitted-functions.gql',
  'customer/customer.gql',
  'customer/messages.gql',
  'permissions/permissions.gql'
]

// Not copied, with the reason. Anything upstream that is in neither list fails the check.
const EXCLUDED_TYPES = {
  'base.gql':
    'Query/Mutation roots; the stub has its own in schema/stub/query.gql',
  'common-inputs.gql': 'mutation inputs',
  'business/query.gql': 'root fields live in schema/stub/query.gql',
  'customer/query.gql': 'root fields live in schema/stub/query.gql',
  'permissions/query.gql': 'root fields live in schema/stub/query.gql',
  'business/mutation/additional-details.gql': 'mutations not implemented',
  'business/mutation/all-fields.gql': 'mutations not implemented',
  'business/mutation/bank-details.gql': 'mutations not implemented',
  'business/mutation/create.gql': 'mutations not implemented',
  'business/mutation/details.gql': 'mutations not implemented',
  'business/mutation/permissions.gql': 'mutations not implemented',
  'customer/mutation.gql': 'mutations not implemented',
  'business/bank-accounts.gql': 'not served by the stub',
  'business/payments.gql': 'not served by the stub',
  'business/search.gql': 'not served by the stub',
  'customer/search.gql': 'not served by the stub',
  'permissions/internal-user.gql': 'not served by the stub',
  'reference-data/query.gql': 'not served by the stub',
  'reference-data/reference-data.gql': 'not served by the stub'
}

const VENDORED = {
  ...Object.fromEntries(
    VENDORED_TYPES.map((file) => [
      `${TYPES_DIR}/${file}`,
      `${localSchemaDir}/${file}`
    ])
  ),
  [`${STATIC_DIR}/permission-groups.json`]:
    'src/data/static/permission-groups.json'
}

const EXCLUDED = Object.fromEntries(
  Object.entries(EXCLUDED_TYPES).map(([file, reason]) => [
    `${TYPES_DIR}/${file}`,
    reason
  ])
)

const token = process.env.UPSTREAM_SCHEMA_TOKEN || process.env.GITHUB_TOKEN
const headers = {
  'user-agent': 'grants-platform-dal-stub schema sync',
  ...(token && { authorization: `Bearer ${token}` })
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

async function listUpstreamSchemaFiles() {
  const tree = await fetchJson(
    `https://api.github.com/repos/${UPSTREAM_REPO}/git/trees/${UPSTREAM_REF}?recursive=1`
  )
  if (tree.truncated) {
    throw new Error('GitHub tree listing was truncated')
  }
  return tree.tree
    .filter(
      (entry) => entry.type === 'blob' && entry.path.startsWith(`${TYPES_DIR}/`)
    )
    .map((entry) => entry.path)
    .sort()
}

async function listLocalSchemaFiles() {
  const entries = await fs.readdir(path.join(root, localSchemaDir), {
    recursive: true,
    withFileTypes: true
  })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.gql'))
    .map((entry) =>
      path
        .relative(root, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/')
    )
}

async function main() {
  const check = process.argv.includes('--check')
  const problems = []
  const updated = []

  const vendoredLocal = new Set(Object.values(VENDORED))
  for (const localPath of await listLocalSchemaFiles()) {
    if (!vendoredLocal.has(localPath)) {
      problems.push(
        `${localPath} is not a vendored copy of any upstream file; add it to VENDORED_TYPES or remove it`
      )
    }
  }

  let upstreamFiles
  try {
    upstreamFiles = await listUpstreamSchemaFiles()
  } catch (err) {
    if (!(err instanceof UpstreamUnreachable)) {
      throw err
    }
    const message = `Upstream schema check skipped: ${UPSTREAM_REPO}@${UPSTREAM_REF} is not readable (${err.message})`
    console.warn(message)
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(`::warning title=Upstream schema check skipped::${message}`)
    }
    report({ check, problems, updated, compared: false })
    return
  }

  for (const upstreamPath of upstreamFiles) {
    if (!(upstreamPath in VENDORED) && !(upstreamPath in EXCLUDED)) {
      problems.push(
        `new upstream file ${upstreamPath}: add it to VENDORED_TYPES (and copy it) or to EXCLUDED_TYPES with a reason`
      )
    }
  }

  for (const upstreamPath of Object.keys(EXCLUDED)) {
    if (!upstreamFiles.includes(upstreamPath)) {
      problems.push(
        `${upstreamPath} is in EXCLUDED_TYPES but no longer exists upstream`
      )
    }
  }

  for (const [upstreamPath, localPath] of Object.entries(VENDORED)) {
    const upstream = await fetchRaw(upstreamPath)
    if (upstream === null) {
      problems.push(
        `${upstreamPath} no longer exists upstream; update VENDORED_TYPES and ${localPath}`
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

  report({ check, problems, updated, compared: true })
}

function report({ check, problems, updated, compared }) {
  if (updated.length > 0) {
    for (const file of updated) console.log(`updated ${file}`)
    console.log(
      `Review the diff, update resolvers if needed, and record the upstream commit in ${localSchemaDir}/UPSTREAM.md`
    )
  } else if (!check && compared) {
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
  if (check && compared) {
    console.log(
      `Upstream schema check passed: ${Object.keys(VENDORED).length} vendored and ${Object.keys(EXCLUDED).length} excluded files accounted for at ${UPSTREAM_REPO}@${UPSTREAM_REF}`
    )
  }
}

await main()
