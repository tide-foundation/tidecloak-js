# Testing the local scaffolder

The public README documents `npm init @tidecloak/nextjs@latest my-app`, which pulls
the **published** package from npm. To test your local checkout instead, build the
package and run its bin directly.

## Prerequisites

- Node.js 20.9 or later (the templates are Next.js 16 apps).
- `curl` and `jq` on PATH (required by `init/tcinit.sh`).
- A **running TideCloak server** the scaffolder points at, *only* if you exercise the
  realm-provisioning step. Scaffolding/file-generation works with no server; the
  `tcinit.sh` realm/client/IGA provisioning half needs a live TideCloak.

## 1. Build the package (standalone)

From this package directory:

```bash
cd packages/tidecloak-create-nextjs
npm install        # also runs the "prepare" script -> npm run build
npm run build      # explicit rebuild (safe to re-run)
```

This produces the bin at `dist/cjs/create.cjs`. The package builds on its own; you do
**not** need to build the sibling `@tidecloak/nextjs` package first.

## 2. Run the local scaffolder

Pick one. Both run your checkout's bin, not the copy on the npm registry:

**a. Direct bin (simplest, recommended):**

```bash
node dist/cjs/create.cjs my-app
```

**b. npx against the local package path:**

```bash
npx /path/to/tidecloak-js/packages/tidecloak-create-nextjs my-app
```

> Do **not** use `npm link` + `npm init @tidecloak/nextjs`. `npm init` resolves the
> initializer through `npm exec`, which does not reliably honor a globally linked
> package and will silently fetch the **published** version from the registry. Use
> (a) or (b) so you know you are running the local code.

The scaffolder prompts for language (TypeScript / JavaScript), copies the matching
`template-*-app/` into `my-app`, then offers to run initialization
(`init/tcinit.sh`). Running init requires a live TideCloak; skip it if you only want
to verify scaffolding.

## 3. Run the scaffolded app

```bash
cd my-app
npm install
npm run dev      # http://localhost:3000
```

The scaffolded app installs `@tidecloak/nextjs` from npm, so this checks the templates,
not unpublished SDK changes in this repo.

## 4. Template checks

```bash
npm test         # fails if the three tcinit.sh copies drift apart
```

## What runs under the hood

The built bin resolves `packageRoot/init/tcinit.sh` and executes it via `bash`. That
script uses the iga-core native governance model (drains PENDING
`iga/change-requests` via the `/approve` endpoint), tracks HTTP status through the
`RESP_CODE` global, and sources its defaults from the co-located `init/.env.example`.
It writes the adapter config to `packageRoot/tidecloak.json`, which create.ts then
copies into the new app.
