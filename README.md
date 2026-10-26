# grants-platform-dal-stub

A stub of the FCP Data Access Layer (DAL, [DEFRA/fcp-dal-api](https://github.com/DEFRA/fcp-dal-api))
that serves the DAL's own GraphQL schema from a small set of **synthetic** fixtures. Consumers
talk to it exactly as they talk to the real DAL, so switching between the two is a change of
endpoint, not of code.

> **Synthetic data only.** Every CRN, SBI, name, address, phone number and email in this
> repository is made up, and must stay that way. `npm run check:fixtures` and the server's own
> fixture loader reject any identifier outside the reserved synthetic ranges; do not widen those
> ranges to make a test pass. If an environment must sign in with identifiers the stub does not
> know, use the [identifier mapping](#identifier-mapping) instead of adding them here.

- [Design](#design)
- [Running it](#running-it)
- [Consuming it](#consuming-it)
- [Fixture data](#fixture-data)
  - [Synthetic identifier ranges](#synthetic-identifier-ranges)
  - [Adding or changing fixtures](#adding-or-changing-fixtures)
  - [Test personas](#test-personas)
- [Identifier mapping](#identifier-mapping)
- [Keeping the schema in step with the real DAL](#keeping-the-schema-in-step-with-the-real-dal)
- [Development](#development)
- [Licence](#licence)

## Design

- **It executes the real DAL schema.** The GraphQL type definitions are verbatim copies from
  `fcp-dal-api`, checked against upstream on every pull request. Identifiers are read from the
  query, exactly as the real DAL reads them, and only the requested fields are returned.
- **One endpoint, `POST /graphql`**, the same path as the real DAL, for every consumer.
- **DAL-shaped errors**: an unknown or malformed identifier is reported in `errors[]` with
  `extensions.code` and a matching HTTP status, as the real DAL reports it.
- **Fixtures stored in the shape of the DAL types** (`Business`, `Customer`) plus a relationship
  document per business–customer pair, so each fact lives in one place.
- **No authentication.** Consumers disable their service-to-service token when pointing at the
  stub.

## Running it

Requires Node.js `>= v24` (`nvm use` picks the pinned version).

```bash
npm install
npm run dev          # http://localhost:3008/graphql
```

Or with Docker Compose, which exposes it on port 3008:

```bash
docker compose up --build -d   # http://localhost:3008/graphql
```

| Endpoint        | Description                               |
| --------------- | ----------------------------------------- |
| `GET /health`   | Health check                              |
| `POST /graphql` | The DAL schema. Introspection is enabled. |

| Environment variable | Default  | Purpose                                                                    |
| -------------------- | -------- | -------------------------------------------------------------------------- |
| `PORT`               | `3008`   | Port to listen on; the port consumers' local stacks expect the DAL stub on |
| `DATA_PATH`          | `./data` | Directory holding the fixture collections                                  |
| `CRN_MAP`            | empty    | Real-to-synthetic CRN map, see [below](#identifier-mapping)                |
| `SBI_MAP`            | empty    | Real-to-synthetic SBI map, see [below](#identifier-mapping)                |

## Consuming it

Point the DAL endpoint of the consuming service at `http://<host>:<port>/graphql` and
disable the service's Entra authentication for that environment. The stub accepts and
ignores `Authorization`, `x-forwarded-authorization`, `gateway-type` and `email` headers.

The stub answers any query that the vendored schema supports, including everything
its current consumers send. Behaviour that mirrors the real DAL:

- Unknown SBI or CRN: `errors[0].extensions.code === "NOT_FOUND"` with HTTP 404 and
  `data.business` / `data.customer` set to `null`.
- Malformed SBI or CRN (wrong length, or a leading zero): `errors[0].extensions.code === "BAD_REQUEST"`
  with HTTP 400, as the DAL's `@validateVariable` directive answers.
- `business.customer(crn)` for a CRN not associated with the business: `NOT_FOUND`.
- `customer.business(sbi)` for an SBI not associated with the customer: `null`, no error.
- `land.parcels(date)`: the `date` argument is accepted and ignored.
- `land.parcel` / `parcelCovers` / `parcelLandUses` for an unknown parcel: `NOT_FOUND`.
- `permissionGroups`: the DAL's own reference data, vendored verbatim.

Not implemented (not in the vendored schema): mutations, search, payments, bank accounts,
reference data, internal users.

## Fixture data

Fixtures live under `data/` as one JSON document per record. The server loads them into
memory on start-up and refuses to start if any document is invalid.

| Collection            | File name          | Content                                                                                                                                  |
| --------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `data/businesses/`    | `<sbi>.json`       | A DAL `Business`: `sbi`, `organisationId`, `info`, `land.parcels[]`, optional `countyParishHoldings[]`, `agreements[]`, `applications[]` |
| `data/customers/`     | `<crn>.json`       | A DAL `Customer`: `crn`, `personId`, `info`                                                                                              |
| `data/relationships/` | `<sbi>-<crn>.json` | Which customers can act for which business: `sbi`, `crn`, `role`, `permissionGroups[]`                                                   |

`business.customers`, `customer.businesses` and the `permissionGroups` seen from either
side are all derived from the relationship documents, and `CustomerBusiness.name` always
comes from the business document, so there is a single source of truth for each fact.
Relationship documents may also carry `messages[]` for `customer.businesses[].messages`.

**Every query in the schema is answerable.** A test generates a selection of every field
reachable from `Business` and `Customer` from the schema itself and fails if the primary
persona (`1300000001` / `300000001`) returns an error, so a field added upstream cannot break
a consumer. The fixtures populate the fields consumers use: business name, reference, VAT,
type, legal status, registration numbers, contact details and address; land parcels
(`sheetId`/`parcelId`); county parish holding numbers; agreements with payment schedules;
customer name, contact details and address; and the per-business role and permission groups.
Everything else (land covers and uses, applications, messages, authentication questions and
so on) resolves to `null` or an empty list, as the real DAL does for a record without that
data, and can be added to a fixture when a scenario needs it. `business.permittedFunctions`
reports a function as permitted when any customer of the business holds it.

### Synthetic identifier ranges

Defined once in `src/data/synthetic-ranges.js` and enforced by the loader, by
`npm run check:fixtures` and in CI.

| Kind     | Pattern              | Allowed values                                       |
| -------- | -------------------- | ---------------------------------------------------- |
| CRN      | `1[234]00000NNN`     | `1200000NNN`, `1300000NNN`, `1400000NNN`             |
| SBI      | `[234]00000NNN`      | `200000NNN`, `300000NNN`, `400000NNN`                |
| FRN      | `0` + synthetic SBI  | `0300000001` for `reference` / `frn`                 |
| Postcode | `ZZ<1-3 digits> NAA` | `ZZ99 9ZZ`, `ZZ101 9ZZ` (`ZZ` is not an issued area) |
| Email    | `*@example.test`     | `alice.carter+1300000001@example.test`               |

Issued SBIs are 9 digits starting with `1`, and issued CRNs and FRNs are 10 digits starting
`1`. The blocks above are obviously sequential and sit outside anything issued. The loader
also rejects any 9- or 10-digit value elsewhere in a fixture that looks like an issued
identifier, any `postalCode` outside the `ZZ` area, any email address not at `example.test`,
and any relationship permission group whose id or level is not in the DAL's
`permission-groups.json`, so a real address or a typo in a persona's permissions fails
`npm run check:fixtures` rather than surfacing in a journey.

### Adding or changing fixtures

1. Pick unused identifiers inside the ranges above.
2. Add `data/businesses/<sbi>.json` and/or `data/customers/<crn>.json`, and a
   `data/relationships/<sbi>-<crn>.json` linking them with the permission groups the
   scenario needs (ids and levels are checked against `src/data/static/permission-groups.json`).
3. Use obviously fake contact details. The loader insists on `@example.test` email addresses
   and `ZZ99 9ZZ`-style postcodes; follow the existing fixtures for the rest (`Test Lane`,
   `Testshire`, `07<sbi>` phone numbers, `9000000NNNNN` UPRNs). Never copy an address from
   another data set, however anonymised it looks.
4. Run `npm run check:fixtures && npm test`.
5. If the persona should be able to sign in locally, add the same CRN, SBI and names to
   the identity stub's users file in your consumer's local setup (for
   [fcp-defra-id-stub](https://github.com/DEFRA/fcp-defra-id-stub), the file mounted as
   `AUTH_OVERRIDE_FILE`). The two stubs must agree, or sign-in succeeds and the first
   DAL call returns `NOT_FOUND`.

Land parcel references (`sheetId`/`parcelId`) must match parcels seeded in
the land service used alongside the stub for land journeys to work end to end.

### Test personas

The data set is deliberately tiny: five customers across three businesses, every one of
them obviously fake. Add more only when a scenario genuinely needs it.

| CRN          | Name            | SBI                                                          | Permissions                                                             | Notes                                            |
| ------------ | --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------ |
| `1300000001` | Alice Carter    | `300000001` Green Farm                                       | Every group at its highest level (`BUSINESS_DETAILS` `FULL_PERMISSION`) | Happy path. Two signed SFI agreements, 5 parcels |
| `1300000002` | Benjamin Carter | `300000001`                                                  | CS applications and agreements `AMEND`, `BUSINESS_DETAILS` `AMEND`      |                                                  |
| `1300000003` | Chloe Carter    | `300000001`                                                  | CS applications and agreements `VIEW`, `BUSINESS_DETAILS` `VIEW`        |                                                  |
| `1300000004` | Daniel Carter   | `300000001`                                                  | No permission groups                                                    |                                                  |
| `1200000003` | Nadia Khan      | `200000001` High Fell Farm, `200000002` Hope Valley Farm Ltd | Full on High Fell Farm, `VIEW` only on Hope Valley                      | Multi-business customer; neither has agreements  |

## Identifier mapping

Some environments sign users in with a Defra ID instance whose CRNs and SBIs are not in these
fixtures. For those environments, configure a mapping from those identifiers to synthetic ones
as secrets in the environment's CDP configuration. The sources are valid sign-in identifiers,
so keep them out of committed configuration files, and never put them in this repository:

```env
CRN_MAP=<crn>:1300000001,<crn>:1300000002
SBI_MAP=<sbi>:300000001,<sbi>:300000002
```

Incoming identifiers are translated to the synthetic ones before fixture lookup. In the
response (`business.sbi`, `customer.crn`, `customer.businesses[].sbi`,
`business.customers[].crn`) an identifier the request supplied is echoed exactly as
supplied, so a synthetic identifier asked for directly stays synthetic. An identifier the
request did not supply is translated back when exactly one source maps to it, and returned
as the synthetic value otherwise. Several sources may share one target, so several
sign-ins can use the same persona. Unmapped identifiers pass through unchanged. The server
refuses to start if a map entry's target is outside the synthetic ranges or has no fixture,
or if its source is itself synthetic.

## Keeping the schema in step with the real DAL

Every `.gql` file under `src/graphql/schema/upstream/` and
`src/data/static/permission-groups.json` is a verbatim copy from `DEFRA/fcp-dal-api`;
see `src/graphql/schema/upstream/UPSTREAM.md` for what is and is not copied. The `Query`
type is authored in `src/graphql/schema/stub/query.gql` so the operations advertised are
exactly the ones implemented.

```bash
npm run schema:check   # exit 1 if the copies differ from fcp-dal-api main
npm run schema:sync    # overwrite the copies from fcp-dal-api main, then review the diff
```

The check runs on every pull request as its own job and fails the PR on any drift, on a
vendored file that has been renamed or removed upstream, on an upstream file that is not
yet classified in `scripts/sync-upstream-schema.js`, or on a local file under `upstream/`
that is not a vendored copy. If the upstream repository cannot be read the job passes with
a warning annotation on the pull request, since the vendored copies are still what the stub
serves; the comparison resumes by itself once the repository is readable again.
`UPSTREAM_REPO`, `UPSTREAM_REF` and `UPSTREAM_SCHEMA_TOKEN` override the repository, ref
and token the scripts use. After syncing, update the commit recorded in `UPSTREAM.md` and
add resolvers for any new fields the consumers need.

## Development

```bash
npm run dev            # watch mode
npm test               # vitest with coverage
npm run lint
npm run format
npm run check:fixtures # synthetic data guardrail (same validation the server runs at startup)
```

The pre-commit hook (`npm run git:pre-commit-hook`) runs the security audit, formatting,
lint, the fixture check and the tests.

### Docker

```bash
docker build --target development --tag grants-platform-dal-stub:development .
docker run -p 3008:3008 grants-platform-dal-stub:development

docker build --tag grants-platform-dal-stub .
docker run -p 3008:3008 grants-platform-dal-stub
```

### Dependabot

Enable it by renaming `.github/example.dependabot.yml` to `.github/dependabot.yml`.

### SonarCloud

See `sonar-project.properties`.

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government license v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.
