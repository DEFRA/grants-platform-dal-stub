import neostandard from 'neostandard'

export default [
  ...neostandard({
    env: ['node', 'vitest'],
    ignores: [...neostandard.resolveIgnoresFromGitignore()],
    noJsx: true,
    noStyle: true
  }),
  {
    // neostandard pins an ecmaVersion that predates import attributes
    // (`import x from './x.json' with { type: 'json' }`), which Node 24 supports.
    languageOptions: { ecmaVersion: 'latest' }
  }
]
