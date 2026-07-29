# Testing the local (branch) scaffolder

The public README documents `npm init @tidecloak/nextjs@latest my-app`, which pulls
the **published** package from npm. To test the code on **this branch**
(`agent/tcinit-native-on-main`) instead, build the package locally and run its built
bin directly. These steps are verified.

## Prerequisites

- Node.js >= 18.17.0 (verified on Node 22).
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

## 2. Run the LOCAL branch scaffolder

Pick one (both verified to launch the branch's bin, not npm's registry copy):

**a. Direct bin (simplest, recommended):**

```bash
node dist/cjs/create.cjs my-app
```

**b. npx against the local package path:**

```bash
npx /home/sasha/tidecloak-js/packages/tidecloak-create-nextjs my-app
```

> Do **not** use `npm link` + `npm init @tidecloak/nextjs`. `npm init` resolves the
> initializer through `npm exec`, which does not reliably honor a globally linked
> package and will silently fetch the **published** version from the registry. Use
> (a) or (b) so you know you are running the branch code.

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

## What runs under the hood

The built bin resolves `packageRoot/init/tcinit.sh` and executes it via `bash`. On this
branch that script uses the current iga-core native governance model (drains PENDING
`iga/change-requests` via the `/approve` endpoint), tracks HTTP status through the
`RESP_CODE` global, and sources its defaults from the co-located `init/.env.example`.
