const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const nextDir = path.resolve(root, ".next");
const mib = 1024 * 1024;
const edgeOneLimitBytes = readBytesEnv("SSR_SIZE_LIMIT_MIB", 128 * mib);
const warnAtBytes = readBytesEnv("SSR_SIZE_WARN_MIB", Math.floor(edgeOneLimitBytes * 0.9));
const largeFileBytes = readBytesEnv("SSR_SIZE_LARGE_FILE_MIB", 8 * mib);
const failOnRisk = process.env.SSR_SIZE_FAIL_ON_RISK === "1";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node scripts/check-next-ssr-size.js [--help]

Checks the Next.js .next output for EdgeOne SSR Node function package size risk.
Run npm run build before this check.

Environment:
  SSR_SIZE_LIMIT_MIB       Hard runtime package limit. Default: 128
  SSR_SIZE_WARN_MIB        Warn threshold. Default: 90% of limit
  SSR_SIZE_LARGE_FILE_MIB  Large file report threshold. Default: 8
  SSR_SIZE_FAIL_ON_RISK=1  Exit non-zero when risk is detected
`);
  process.exit(0);
}

const sections = [
  {
    name: "server reference manifest",
    kind: "files",
    paths: [
      path.join(nextDir, "server", "server-reference-manifest.json"),
      path.join(nextDir, "server", "server-reference-manifest.js"),
    ],
  },
  {
    name: "standalone output",
    kind: "dir",
    paths: [path.join(nextDir, "standalone")],
  },
  {
    name: "server chunks",
    kind: "dir",
    paths: [path.join(nextDir, "server")],
  },
];

function readBytesEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive MiB value, got ${raw}`);
  }

  return Math.round(value * mib);
}

function formatBytes(bytes) {
  if (bytes >= mib) return `${(bytes / mib).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  return `${bytes} B`;
}

function walkFiles(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [{ path: target, size: stat.size }];
  if (!stat.isDirectory()) return [];

  const files = [];
  const stack = [target];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push({ path: fullPath, size: fs.statSync(fullPath).size });
      }
    }
  }

  return files;
}

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function summarize(section) {
  const existingPaths = section.paths.filter((target) => fs.existsSync(target));
  const files = existingPaths.flatMap(walkFiles);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 10);
  const largeFiles = largest.filter((file) => file.size >= largeFileBytes);

  return {
    ...section,
    existingPaths,
    files,
    total,
    largest,
    largeFiles,
    missing: section.paths.filter((target) => !fs.existsSync(target)),
  };
}

function riskLabel(total) {
  if (total >= edgeOneLimitBytes) return "FAIL";
  if (total >= warnAtBytes) return "WARN";
  return "OK";
}

function printSummary(summary) {
  console.log(`\n[${summary.name}]`);

  if (summary.existingPaths.length === 0) {
    console.log(`  not found: ${summary.paths.map(relative).join(", ")}`);
    return false;
  }

  const label = riskLabel(summary.total);
  const missing = summary.missing.length > 0 ? `; missing ${summary.missing.map(relative).join(", ")}` : "";
  console.log(`  ${label} total ${formatBytes(summary.total)} across ${summary.files.length} file(s)${missing}`);

  if (summary.largeFiles.length > 0) {
    console.log(`  large files >= ${formatBytes(largeFileBytes)}:`);
    for (const file of summary.largeFiles) {
      console.log(`    ${formatBytes(file.size).padStart(10)}  ${relative(file.path)}`);
    }
  }

  if (summary.largest.length > 0) {
    console.log("  largest files:");
    for (const file of summary.largest.slice(0, 5)) {
      console.log(`    ${formatBytes(file.size).padStart(10)}  ${relative(file.path)}`);
    }
  }

  return label !== "OK" || summary.largeFiles.length > 0;
}

if (!fs.existsSync(nextDir)) {
  console.error("[check-next-ssr-size] .next not found. Run `npm run build` first.");
  process.exit(1);
}

console.log("[check-next-ssr-size] EdgeOne SSR Node function size guard");
console.log(`  limit: ${formatBytes(edgeOneLimitBytes)}, warn at: ${formatBytes(warnAtBytes)}, large file: ${formatBytes(largeFileBytes)}`);

const summaries = sections.map(summarize);
const hasRisk = summaries.map(printSummary).some(Boolean);

if (hasRisk) {
  console.log("\n[check-next-ssr-size] Risk reported. Review large server files before deploying to a 128 MiB SSR runtime.");
  if (failOnRisk) process.exit(2);
} else {
  console.log("\n[check-next-ssr-size] No SSR bundle size risk found.");
}
