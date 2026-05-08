const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const nextDir = path.resolve(root, ".next");
const mib = 1024 * 1024;
const edgeOneLimitBytes = readBytesEnv("SSR_SIZE_LIMIT_MIB", 128 * mib);
const warnAtBytes = readBytesEnv("SSR_SIZE_WARN_MIB", Math.floor(edgeOneLimitBytes * 0.9));
const largeFileBytes = readBytesEnv("SSR_SIZE_LARGE_FILE_MIB", 8 * mib);
const failOnRisk = process.env.SSR_SIZE_FAIL_ON_RISK === "1";
const topCount = readCountEnv("SSR_SIZE_TOP_COUNT", 10);

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node scripts/check-next-ssr-size.js [--help]

Checks the Next.js .next output for EdgeOne SSR Node function package size risk.
Run npm run build before this check.

Environment:
  SSR_SIZE_LIMIT_MIB       Hard runtime package limit. Default: 128
  SSR_SIZE_WARN_MIB        Warn threshold. Default: 90% of limit
  SSR_SIZE_LARGE_FILE_MIB  Large file report threshold. Default: 8
  SSR_SIZE_TOP_COUNT       Number of largest files/modules to print. Default: 10
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

function readCountEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${raw}`);
  }

  return value;
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

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`[check-next-ssr-size] Could not read ${relative(filePath)}: ${error.message}`);
    return null;
  }
}

function normalizeAbsolute(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function buildTraceIndex() {
  const traceFiles = walkFiles(nextDir).filter((file) => file.path.endsWith(".nft.json"));
  const index = new Map();

  for (const traceFile of traceFiles) {
    const json = readJson(traceFile.path);
    if (!json || !Array.isArray(json.files)) continue;

    const baseDir = path.dirname(traceFile.path);
    for (const traced of json.files) {
      if (typeof traced !== "string") continue;

      const absolute = normalizeAbsolute(path.resolve(baseDir, traced));
      const entries = index.get(absolute) || [];
      entries.push(traceFile.path);
      index.set(absolute, entries);
    }
  }

  return index;
}

function moduleFromNodeModules(filePath) {
  const parts = relative(filePath).split("/");
  const nodeModulesIndex = parts.lastIndexOf("node_modules");
  if (nodeModulesIndex === -1 || nodeModulesIndex === parts.length - 1) return null;

  const first = parts[nodeModulesIndex + 1];
  if (first && first.startsWith("@") && parts[nodeModulesIndex + 2]) {
    return `${first}/${parts[nodeModulesIndex + 2]}`;
  }

  return first || null;
}

function moduleHint(filePath) {
  const rel = relative(filePath);
  const nodeModule = moduleFromNodeModules(filePath);
  if (nodeModule) return `node module ${nodeModule}`;

  const vendorPrefix = ".next/server/vendor-chunks/";
  if (rel.startsWith(vendorPrefix)) {
    return `vendor chunk ${path.basename(rel, ".js")}`;
  }

  const appPrefix = ".next/server/app/";
  if (rel.startsWith(appPrefix)) {
    const route = rel.slice(appPrefix.length).replace(/\/(page|route)\.js$/, "");
    if (route !== rel.slice(appPrefix.length)) return `app route /${route || ""}`;
  }

  const chunkPrefix = ".next/server/chunks/";
  if (rel.startsWith(chunkPrefix)) return "server chunk";

  return null;
}

function traceHint(filePath, traceIndex) {
  const traces = traceIndex.get(normalizeAbsolute(filePath));
  if (!traces || traces.length === 0) return null;

  return traces.slice(0, 3).map(relative).join(", ");
}

function fileDetails(file, traceIndex) {
  const hints = [];
  const module = moduleHint(file.path);
  const traces = traceHint(file.path, traceIndex);

  if (module) hints.push(module);
  if (traces) hints.push(`traced by ${traces}`);

  return hints.length > 0 ? ` (${hints.join("; ")})` : "";
}

function directoryName(filePath, sectionPath) {
  const rel = path.relative(sectionPath, filePath).split(path.sep);
  return rel.length > 1 ? rel[0] : ".";
}

function topDirectories(files, sectionPath) {
  const groups = new Map();

  for (const file of files) {
    const name = directoryName(file.path, sectionPath);
    const current = groups.get(name) || { name, size: 0, count: 0 };
    current.size += file.size;
    current.count += 1;
    groups.set(name, current);
  }

  return [...groups.values()].sort((a, b) => b.size - a.size).slice(0, 5);
}

function summarize(section) {
  const existingPaths = section.paths.filter((target) => fs.existsSync(target));
  const files = existingPaths.flatMap(walkFiles);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const largest = [...files].sort((a, b) => b.size - a.size).slice(0, topCount);
  const largeFiles = largest.filter((file) => file.size >= largeFileBytes);
  const directories =
    section.kind === "dir" && existingPaths.length === 1
      ? topDirectories(files, existingPaths[0])
      : [];

  return {
    ...section,
    existingPaths,
    files,
    total,
    largest,
    largeFiles,
    directories,
    missing: section.paths.filter((target) => !fs.existsSync(target)),
  };
}

function riskLabel(total) {
  if (total >= edgeOneLimitBytes) return "FAIL";
  if (total >= warnAtBytes) return "WARN";
  return "OK";
}

function printFileList(files, traceIndex) {
  for (const file of files) {
    console.log(`    ${formatBytes(file.size).padStart(10)}  ${relative(file.path)}${fileDetails(file, traceIndex)}`);
  }
}

function printSummary(summary, traceIndex) {
  console.log(`\n[${summary.name}]`);

  if (summary.existingPaths.length === 0) {
    console.log(`  not found: ${summary.paths.map(relative).join(", ")}`);
    return false;
  }

  const label = riskLabel(summary.total);
  const missing = summary.missing.length > 0 ? `; missing ${summary.missing.map(relative).join(", ")}` : "";
  const percentOfLimit = ((summary.total / edgeOneLimitBytes) * 100).toFixed(1);
  console.log(`  ${label} total ${formatBytes(summary.total)} (${percentOfLimit}% of limit) across ${summary.files.length} file(s)${missing}`);

  if (summary.directories.length > 0 && label !== "OK") {
    console.log("  largest directories:");
    for (const directory of summary.directories) {
      console.log(`    ${formatBytes(directory.size).padStart(10)}  ${directory.name}/ (${directory.count} file(s))`);
    }
  }

  if (summary.largeFiles.length > 0) {
    console.log(`  large files >= ${formatBytes(largeFileBytes)}:`);
    printFileList(summary.largeFiles, traceIndex);
  }

  if (summary.largest.length > 0 && (label !== "OK" || summary.largeFiles.length > 0)) {
    console.log(`  largest files/modules (top ${summary.largest.length}):`);
    printFileList(summary.largest, traceIndex);
  }

  return label !== "OK" || summary.largeFiles.length > 0;
}

if (!fs.existsSync(nextDir)) {
  console.error("[check-next-ssr-size] .next not found. Run `npm run build` first.");
  process.exit(1);
}

console.log("[check-next-ssr-size] EdgeOne SSR Node function size guard");
console.log(`  limit: ${formatBytes(edgeOneLimitBytes)}, warn at: ${formatBytes(warnAtBytes)}, large file: ${formatBytes(largeFileBytes)}, top count: ${topCount}`);

const traceIndex = buildTraceIndex();
const summaries = sections.map(summarize);
const hasRisk = summaries.map((summary) => printSummary(summary, traceIndex)).some(Boolean);

if (hasRisk) {
  console.log("\n[check-next-ssr-size] Risk reported. Review the listed server files/modules before deploying to a 128 MiB SSR runtime.");
  if (failOnRisk) process.exit(2);
} else {
  console.log("\n[check-next-ssr-size] No SSR bundle size risk found.");
}
