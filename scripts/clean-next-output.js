const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const nextDir = path.resolve(root, ".next");
const targets = [
  path.join(nextDir, "cache"),
  path.join(nextDir, "diagnostics"),
];

for (const target of targets) {
  const relative = path.relative(root, target);
  const isInsideProject = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (!isInsideProject || !target.startsWith(nextDir)) {
    throw new Error(`Refusing to remove unexpected path: ${target}`);
  }

  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[clean-next-output] removed ${path.relative(root, target)}`);
  }
}
