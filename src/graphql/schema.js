import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const schemaDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'schema'
)

/**
 * Loads every `.gql` under `schema/` (the verbatim upstream copies plus the
 * stub-authored Query type). Apollo Server builds the executable schema from
 * these and the resolvers. Upstream directives such as @auth and
 * @validateVariable are declared by `upstream/directives.gql` and deliberately
 * have no runtime behaviour here.
 */
export async function loadTypeDefs() {
  const files = (
    await fs.readdir(schemaDir, { recursive: true, withFileTypes: true })
  )
    .filter((entry) => entry.isFile() && entry.name.endsWith('.gql'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort()

  return Promise.all(files.map((file) => fs.readFile(file, 'utf8')))
}
