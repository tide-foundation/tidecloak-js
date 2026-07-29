// Drop CommonJS/ESM "type" markers into the build output directories so Node
// interprets each build correctly regardless of the root package.json "type"
// (this package is "type":"module", so dist/cjs/*.js would otherwise be parsed
// as ESM and break `require()`).
//
// dist/types is marked "commonjs" on purpose. The exports map serves the same
// dist/types/*.d.ts under BOTH the "import" and "require" conditions, so its
// declared module format must be one a CommonJS consumer can `require`. Without
// this marker the declarations inherit the root "type":"module" and are seen as
// ESM, which makes any CommonJS build that imports this package under TypeScript
// 7 (moduleResolution node16/nodenext) fail with TS1479 ("ECMAScript module ...
// cannot be imported with require") - e.g. @tidecloak/react's dist/cjs build.
// CommonJS-typed declarations are consumable from BOTH CommonJS and ESM (ESM can
// import CJS), so this is safe for ESM consumers too. Mirrors how `jose` ships a
// single CommonJS-typed .d.ts reused by both conditions.
const fs = require("fs");
const path = require("path");

const writeMarker = (dir, type) => {
  const target = path.join(__dirname, "..", dir);
  if (!fs.existsSync(target)) return;
  fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({ type }) + "\n");
};

writeMarker("dist/cjs", "commonjs");
writeMarker("dist/esm", "module");
writeMarker("dist/types", "commonjs");
