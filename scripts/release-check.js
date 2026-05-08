const { spawn } = require("node:child_process");

const isWindows = process.platform === "win32";

function npmCheck(name, script, reason) {
  return isWindows
    ? {
        name,
        command: "cmd.exe",
        args: ["/d", "/s", "/c", `npm run ${script}`],
        reason,
      }
    : {
        name,
        command: "npm",
        args: ["run", script],
        reason,
      };
}

const checks = [
  npmCheck("test", "test", "Unit/regression tests failed. Fix the failing tests before release."),
  npmCheck("build", "build", "Production build failed. Fix the build error before release."),
  npmCheck("check:ssr-size", "check:ssr-size", "SSR package size check failed. Review .next output before deploying to EdgeOne."),
];

function printHelp() {
  console.log(`Usage: node scripts/release-check.js [--help]

Runs release gates in order:
  1. npm run test
  2. npm run build
  3. npm run check:ssr-size

The first failing step stops the release check and returns its exit code.
`);
}

function runCheck(check) {
  return new Promise((resolve) => {
    console.log(`\n[release-check] Starting ${check.name}: ${check.command} ${check.args.join(" ")}`);

    const child = spawn(check.command, check.args, {
      stdio: "inherit",
      shell: false,
      windowsHide: isWindows,
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        code: 1,
        message: `Could not start ${check.name}: ${error.message}`,
      });
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        console.log(`[release-check] Passed ${check.name}`);
        resolve({ ok: true, code: 0 });
        return;
      }

      const exitCode = typeof code === "number" ? code : 1;
      const signalText = signal ? `, signal ${signal}` : "";
      resolve({
        ok: false,
        code: exitCode,
        message: `${check.name} failed with exit code ${exitCode}${signalText}. ${check.reason}`,
      });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const unknownArgs = args.filter((arg) => arg !== "--help" && arg !== "-h");
  if (unknownArgs.length > 0) {
    console.error(`[release-check] Unknown option(s): ${unknownArgs.join(", ")}`);
    printHelp();
    process.exit(1);
  }

  console.log("[release-check] Running pre-release checks.");

  for (const check of checks) {
    const result = await runCheck(check);
    if (!result.ok) {
      console.error(`\n[release-check] FAILED: ${result.message}`);
      process.exit(result.code);
    }
  }

  console.log("\n[release-check] All release checks passed.");
}

main().catch((error) => {
  console.error(`[release-check] Unexpected error: ${error.stack || error.message}`);
  process.exit(1);
});
