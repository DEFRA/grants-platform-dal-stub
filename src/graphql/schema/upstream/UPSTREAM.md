# Upstream schema files

Every `.gql` file in this directory is a verbatim copy of a file under
`app/graphql/types/` in [DEFRA/fcp-dal-api](https://github.com/DEFRA/fcp-dal-api),
the real Data Access Layer (DAL). Do not edit them here. To pick up upstream
changes run `npm run schema:sync` and review the diff; `npm run schema:check`
fails when the copies have drifted from upstream `main`.

Only the read-side types the stub serves are copied: business, land, agreement,
application, county parish holding, permitted functions, customer, messages,
permissions, plus the shared common, scalar and directive definitions. Mutations,
search, payments, bank accounts, reference data and internal-user types are not
copied because the stub does not implement them. The `Query` type is authored
in `../stub/query.gql`, so the operations the stub advertises are exactly the
ones it answers.

`scripts/sync-upstream-schema.js` holds the authoritative lists: `VENDORED`
(upstream path to local path) and `EXCLUDED` (upstream files looked at and
deliberately not copied, with the reason). The check lists the upstream
`app/graphql/types` directory, so a file that is new upstream, or one that has
been renamed or removed, fails the check until it is classified in one of those
two lists.

Also copied verbatim: `src/data/static/permission-groups.json` from
`app/data-sources/static/permission-groups.json`.

Upstream commit: baacfb8061ecce3951d3100cac593741932295b7
