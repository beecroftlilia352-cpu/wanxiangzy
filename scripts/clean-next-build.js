const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const nextDir = path.resolve(root, ".next");

function isInsideProject(target) {
  const relative = path.relative(root, target);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

if (!isInsideProject(nextDir) || path.basename(nextDir) !== ".next") {
  throw new Error(`Refusing to remove unexpected path: ${nextDir}`);
}

if (!fs.existsSync(nextDir)) {
  console.log("[clean-next-build] .next does not exist; build is already clean");
  process.exit(0);
}

const stat = fs.lstatSync(nextDir);
if (stat.isSymbolicLink()) {
  throw new Error(`Refusing to remove symbolic link .next path: ${nextDir}`);
}

if (!stat.isDirectory()) {
  throw new Error(`Refusing to remove non-directory .next path: ${nextDir}`);
}

fs.rmSync(nextDir, { recursive: true, force: true });
console.log("[clean-next-build] removed .next before production build");
