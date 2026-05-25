// Drop CommonJS/ESM "type" markers into the build output directories so Node
// interprets each build correctly regardless of the root package.json "type".
// Without these, .js files in dist/esm are parsed as CommonJS (and vice-versa),
// breaking `import`/`require` of the published package.
const fs = require("fs");
const path = require("path");

const writeMarker = (dir, type) => {
  const target = path.join(__dirname, "..", dir);
  if (!fs.existsSync(target)) return;
  fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({ type }) + "\n");
};

writeMarker("dist/cjs", "commonjs");
writeMarker("dist/esm", "module");
