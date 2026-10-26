# Repository Guidelines

This repository is a stub of the FCP Data Access Layer (DAL) GraphQL API for the grants platform. It serves the DAL's own schema from a small set of synthetic fixtures so consumers such as grants-ui and land-grants-api can run without the real DAL. Read `README.md` first: it is the source of truth for how the stub behaves, the synthetic identifier ranges and the identifier mapping.

## Project Structure & Module Organization

Application code lives in `src/`. The GraphQL layer is under `src/graphql`: `schema/upstream/` holds verbatim copies of the DAL's type definitions (see `UPSTREAM.md` there), `schema/stub/query.gql` is the only schema file authored here, and `resolvers/` answers the schema from the fixtures. Fixture loading, the synthetic ranges and the real-to-synthetic identifier mapping are under `src/data`; the vendored `permission-groups.json` reference data is in `src/data/static`. Hapi plugins are under `src/plugins`, the health route under `src/routes` and configuration in `src/config.js`. Fixtures live under `data/` as one JSON document per business, customer and business–customer relationship. Operational scripts are in `scripts/`. Unit tests are colocated as `*.test.js`.

## Build, Test, and Development Commands

Requires Node.js 24 (`.nvmrc`); the `#/` import map and the lint config do not work on older versions.

- `npm run dev`: runs the server in watch mode on port 3008.
- `npm test`: runs Vitest with coverage.
- `npm run lint` / `npm run lint:fix`: ESLint (neostandard).
- `npm run format` / `npm run format:check`: Prettier.
- `npm run check:fixtures`: loads `data/` exactly as the server does and fails on anything that is not synthetic.
- `npm run schema:check` / `npm run schema:sync`: compares or refreshes the vendored DAL schema against upstream.
- `docker compose up --build`: runs the development image on port 3008.

The pre-commit hook runs the security audit, format check, lint, fixture check and tests.

## Coding Style & Naming Conventions

Use ES modules and 2-space indentation. Prettier uses single quotes, no semicolons and no trailing commas. Keep comments short and plain, saying only what the code does not; no narrated steps and no docblocks that restate a signature. Use kebab-case filenames such as `synthetic-ranges.js` and keep tests beside the module as `module-name.test.js`.

## System Overview

```text
Consumer (grants-ui, land-grants-api) -> POST /graphql -> resolvers -> DataStore (data/*.json)
                                                        -> IdMapping (CRN_MAP / SBI_MAP)
```

Requests use the same schema, path and error shapes as the real DAL, so switching between the stub and the DAL is a change of endpoint only. Identifiers in a request are translated to synthetic ones through the identifier mapping before fixture lookup and echoed back as supplied in the response.

## Architectural Constraints

- Files under `src/graphql/schema/upstream/` and `src/data/static/permission-groups.json` are verbatim upstream copies. Never edit them by hand: run `npm run schema:sync`, review the diff, update resolvers and record the upstream commit in `UPSTREAM.md`. The pull request check fails on drift.
- The `Query` type is authored in `src/graphql/schema/stub/query.gql`, so the operations advertised are exactly the ones implemented. Add a root field and its resolver together.
- Resolver behaviour mirrors the real DAL: unknown identifiers are `NOT_FOUND` (404), malformed identifiers are `BAD_REQUEST` (400) through `src/graphql/identifiers.js`, and fields without fixture data resolve to `null` or an empty list rather than invented values.
- Every field reachable from `Business` and `Customer` must be answerable. `src/graphql/full-coverage.test.js` generates a selection from the schema and fails otherwise.
- `business.customers`, `customer.businesses` and permission groups are derived from the relationship documents. Do not duplicate those facts in business or customer documents.
- The synthetic ranges live in `src/data/synthetic-ranges.js` and are enforced by the loader at startup, by `npm run check:fixtures` and in CI. A fixture that fails the check is wrong; the range is not.
- Identifier mapping values (`CRN_MAP`, `SBI_MAP`) are set in environment configuration only. Map sources are valid sign-in identifiers and must never appear in this repository.
- Production logging redacts request and response headers. Do not log headers, and do not log a non-synthetic identifier; the resolvers log `[not synthetic]` in its place.

## Never Do This

- Never commit a real CRN, SBI, FRN, address, postcode, phone number or email address, however anonymised it looks. Use only the ranges in `README.md` under "Synthetic identifier ranges".
- Never widen or special-case a synthetic range to make a fixture, test or mapping load.
- Never copy fixture content from another data set, including the old `grants-ui-dal-stub` repository.
- Never put identifier mapping values in `compose.yml`, `.env` examples, tests or documentation.
- Never edit vendored schema files, or hand-write resolvers for operations the vendored schema does not define.
- Never commit, push or edit the pull request unless asked; the developer does that.

## Developer Addenda

Developers can add their own `AGENTS.local.md`, which should be read as an addendum to this file. Keep that file local to your machine and do not commit it.

## Testing Guidelines

Vitest is the test runner. Add or update colocated `*.test.js` files for resolver, data and plugin changes, and extend `src/graphql/graphql.test.js` for behaviour visible to consumers. Run the narrowest relevant test first, for example `npx vitest run src/data/store.test.js`, then `npm run lint`, `npm run check:fixtures` and `npm test`. When fixtures change, update the persona table in `README.md` as well.

## Commit & Pull Request Guidelines

Git history uses short imperative messages prefixed with the ticket, for example `TGC-1802 - Validate map targets at startup`. Keep commits focused. PRs should describe the change, link the ticket, list the validation commands run and call out anything a consumer must change, such as fixture identifiers, schema or environment variables.

## Security & Configuration Tips

Do not commit secrets. Service configuration is read through `src/config.js` (convict) from environment variables; developer tooling such as `scripts/sync-upstream-schema.js` reads its own variables directly and does not belong in the service config. Treat Snyk and Dependabot findings as release blockers when they affect touched dependencies.
