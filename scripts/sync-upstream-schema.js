#!/usr/bin/env node
// Keeps src/graphql/schema/upstream in step with the DAL repository.
//
//   node scripts/sync-upstream-schema.js          copy the files from the upstream branch and record its commit
//   node scripts/sync-upstream-schema.js --check  exit 1 if anything differs from the recorded commit
//
// Env: GITHUB_TOKEN or UPSTREAM_SCHEMA_TOKEN (auth), UPSTREAM_REPO, UPSTREAM_REF (the branch).
// An unreadable upstream repository (401/403/404) skips the comparison with a warning.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const UPSTREAM_REPO = process.env.UPSTREAM_REPO || 'DEFRA/fcp-dal-api'
const UPSTREAM_BRANCH = process.env.UPSTREAM_REF || 'main'
const UPSTREAM_API = `https://api.github.com/repos/${UPSTREAM_REPO}`
const TYPES_DIR = 'app/graphql/types'
const STATIC_DIR = 'app/data-sources/static'

const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const UNREADABLE_STATUSES = new Set([
  HTTP_UNAUTHORIZED,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND
])

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localSchemaDir = 'src/graphql/schema/upstream'
const upstreamNotes = `${localSchemaDir}/UPSTREAM.md`
const RECORDED_COMMIT = /^Upstream commit: (\S+)$/m

// The upstream commit every comparison and copy is made against.
let commit

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

const ROOT_FIELDS_IN_STUB = 'root fields live in schema/stub/query.gql'
const MUTATIONS_NOT_IMPLEMENTED = 'mutations not implemented'
const NOT_SERVED = 'not served by the stub'

// Not copied, with the reason. Anything upstream that is in neither list fails the check.
const EXCLUDED_TYPES = {
  'base.gql':
    'Query/Mutation roots; the stub has its own in schema/stub/query.gql',
  'common-inputs.gql': 'mutation inputs',
  'business/query.gql': ROOT_FIELDS_IN_STUB,
  'customer/query.gql': ROOT_FIELDS_IN_STUB,
  'permissions/query.gql': ROOT_FIELDS_IN_STUB,
  'business/mutation/additional-details.gql': MUTATIONS_NOT_IMPLEMENTED,
  'business/mutation/all-fields.gql': MUTATIONS_NOT_IMPLEMENTED,
  'business/mutation/bank-details.gql': MUTATIONS_NOT_IMPLEMENTED,
  'business/mutation/create.gql': MUTATIONS_NOT_IMPLEMENTED,
  'business/mutation/details.gql': MUTATIONS_NOT_IMPLEMENTED,
  'business/mutation/permissions.gql': MUTATIONS_NOT_IMPLEMENTED,
  'customer/mutation.gql': MUTATIONS_NOT_IMPLEMENTED,
  'business/bank-accounts.gql': NOT_SERVED,
  'business/payments.gql': NOT_SERVED,
  'business/search.gql': NOT_SERVED,
  'customer/search.gql': NOT_SERVED,
  'permissions/internal-user.gql': NOT_SERVED,
  'reference-data/query.gql': NOT_SERVED,
  'reference-data/reference-data.gql': NOT_SERVED
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

async function upstreamIsReadable() {
  const response = await fetch(UPSTREAM_API, { headers })
  return !UNREADABLE_STATUSES.has(response.status)
}

async function fetchJson(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} fetching ${url}`)
  }
  return response.json()
}

async function fetchRaw(upstreamPath) {
  const url = `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${commit}/${upstreamPath}`
  const response = await fetch(url, { headers })
  if (response.status === HTTP_NOT_FOUND) {
    return null
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} fetching ${url}`)
  }
  return response.text()
}

async function listUpstreamSchemaFiles() {
  const tree = await fetchJson(
    `${UPSTREAM_API}/git/trees/${commit}?recursive=1`
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

async function recordedCommit() {
  const notes = await fs.readFile(path.join(root, upstreamNotes), 'utf8')
  return notes.match(RECORDED_COMMIT)?.[1]
}

async function recordCommit() {
  const absolute = path.join(root, upstreamNotes)
  const notes = await fs.readFile(absolute, 'utf8')
  await fs.writeFile(
    absolute,
    notes.replace(RECORDED_COMMIT, `Upstream commit: ${commit}`)
  )
}

// A commit that only exists in a fork is still served under the upstream repository's URLs.
async function recordedCommitProblem() {
  const response = await fetch(
    `${UPSTREAM_API}/compare/${commit}...${UPSTREAM_BRANCH}`,
    { headers }
  )
  const { status } = response.ok ? await response.json() : {}
  return ['ahead', 'identical'].includes(status)
    ? null
    : `${upstreamNotes} records commit ${commit}, which is not on ${UPSTREAM_REPO}@${UPSTREAM_BRANCH}`
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

async function strayLocalFileProblems() {
  const vendoredLocal = new Set(Object.values(VENDORED))
  return (await listLocalSchemaFiles())
    .filter((localPath) => !vendoredLocal.has(localPath))
    .map(
      (localPath) =>
        `${localPath} is not a vendored copy of any upstream file; add it to VENDORED_TYPES or remove it`
    )
}

function classificationProblems(upstreamFiles) {
  const unclassified = upstreamFiles
    .filter(
      (upstreamPath) =>
        !(upstreamPath in VENDORED) && !(upstreamPath in EXCLUDED)
    )
    .map(
      (upstreamPath) =>
        `new upstream file ${upstreamPath}: add it to VENDORED_TYPES (and copy it) or to EXCLUDED_TYPES with a reason`
    )
  const gone = Object.keys(EXCLUDED)
    .filter((upstreamPath) => !upstreamFiles.includes(upstreamPath))
    .map(
      (upstreamPath) =>
        `${upstreamPath} is in EXCLUDED_TYPES but no longer exists upstream`
    )
  return [...unclassified, ...gone]
}

async function readVendored([upstreamPath, localPath]) {
  const absolute = path.join(root, localPath)
  const [upstream, local] = await Promise.all([
    fetchRaw(upstreamPath),
    fs.readFile(absolute, 'utf8').catch(() => null)
  ])
  return { upstreamPath, localPath, absolute, upstream, local }
}

function vendoredProblem({ upstreamPath, localPath, upstream, local }, check) {
  if (upstream === null) {
    return `${upstreamPath} no longer exists upstream; update VENDORED_TYPES and ${localPath}`
  }
  if (check && local !== upstream) {
    return `${localPath} differs from upstream ${upstreamPath}`
  }
  return null
}

// Compares every vendored file with upstream; without --check, overwrites the stale ones.
async function syncVendored(check) {
  const files = await Promise.all(Object.entries(VENDORED).map(readVendored))
  const problems = files
    .map((file) => vendoredProblem(file, check))
    .filter(Boolean)
  const stale = check
    ? []
    : files.filter(
        (file) => file.upstream !== null && file.local !== file.upstream
      )
  await Promise.all(
    stale.map(async ({ absolute, upstream }) => {
      await fs.mkdir(path.dirname(absolute), { recursive: true })
      await fs.writeFile(absolute, upstream)
    })
  )
  return { problems, updated: stale.map((file) => file.localPath) }
}

function warnSkipped() {
  const message = `Upstream schema check skipped: ${UPSTREAM_REPO} is not readable`
  console.warn(message)
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::warning title=Upstream schema check skipped::${message}`)
  }
}

function summary({ check, updated, compared }) {
  if (updated.length > 0) {
    return 'Review the diff and update resolvers if needed'
  }
  if (!check && compared) {
    return 'Vendored files already up to date'
  }
  return null
}

function report({ check, problems, updated, compared }) {
  for (const file of updated) {
    console.log(`updated ${file}`)
  }
  const line = summary({ check, updated, compared })
  if (line) {
    console.log(line)
  }

  if (problems.length > 0) {
    console.error(
      `Upstream schema check against ${UPSTREAM_REPO}@${commit} FAILED:`
    )
    for (const problem of problems) {
      console.error(`  - ${problem}`)
    }
    process.exitCode = 1
    return
  }
  if (check && compared) {
    console.log(
      `Upstream schema check passed: ${Object.keys(VENDORED).length} vendored and ${Object.keys(EXCLUDED).length} excluded files accounted for at ${UPSTREAM_REPO}@${commit}`
    )
  }
}

async function main() {
  const check = process.argv.includes('--check')
  const problems = await strayLocalFileProblems()

  if (!(await upstreamIsReadable())) {
    warnSkipped()
    report({ check, problems, updated: [], compared: false })
    return
  }

  if (check) {
    commit = await recordedCommit()
    const problem = await recordedCommitProblem()
    if (problem) {
      report({ check, problems: [...problems, problem], updated: [] })
      return
    }
  } else {
    commit = (await fetchJson(`${UPSTREAM_API}/commits/${UPSTREAM_BRANCH}`)).sha
  }

  problems.push(...classificationProblems(await listUpstreamSchemaFiles()))
  const { problems: vendoredProblems, updated } = await syncVendored(check)
  problems.push(...vendoredProblems)
  if (!check) {
    await recordCommit()
  }
  report({ check, problems, updated, compared: true })
}

await main()
