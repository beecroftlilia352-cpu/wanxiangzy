#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { chmodSync, writeFileSync } = require("node:fs");

const [outputPath, ...processNames] = process.argv.slice(2);
if (!outputPath || processNames.length === 0) {
  console.error("usage: snapshot-pm2-config.cjs <output> <process-name> [...process-name]");
  process.exit(2);
}

const wanted = new Set(processNames);
let processes;
try {
  processes = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
} catch {
  console.error("Unable to read the existing PM2 process configuration.");
  process.exit(1);
}

const grouped = new Map();
for (const processDescription of processes) {
  const name = processDescription?.name;
  if (!wanted.has(name)) continue;
  const group = grouped.get(name) || [];
  group.push(processDescription);
  grouped.set(name, group);
}

const apps = [];
const safeRuntimeEnvironmentKeys = ["NODE_ENV", "PORT", "HOST", "TZ"];
for (const name of processNames) {
  const group = grouped.get(name);
  if (!group?.length) continue;
  const pm2 = group[0].pm2_env || {};
  const originalEnvironment = pm2.env && typeof pm2.env === "object" ? pm2.env : pm2;
  const environment = Object.fromEntries(
    safeRuntimeEnvironmentKeys
      .filter((key) => typeof originalEnvironment[key] === "string")
      .map((key) => [key, originalEnvironment[key]]),
  );
  environment.NODE_ENV ||= "production";

  const app = {
    name,
    cwd: pm2.pm_cwd,
    script: pm2.pm_exec_path,
    args: Array.isArray(pm2.args) ? pm2.args : undefined,
    interpreter: pm2.exec_interpreter,
    node_args: Array.isArray(pm2.node_args) ? pm2.node_args : undefined,
    exec_mode: pm2.exec_mode,
    instances: group.length,
    wait_ready: Boolean(pm2.wait_ready),
    listen_timeout: pm2.listen_timeout,
    kill_timeout: pm2.kill_timeout,
    autorestart: pm2.autorestart !== false,
    max_memory_restart: pm2.max_memory_restart || undefined,
    restart_delay: pm2.restart_delay || undefined,
    // Production secrets are loaded from shared/.env.production. Never copy
    // the daemon's full inherited environment into this temporary snapshot.
    env: environment,
  };
  for (const key of Object.keys(app)) {
    if (app[key] === undefined) delete app[key];
  }
  apps.push(app);
}

writeFileSync(outputPath, `module.exports = ${JSON.stringify({ apps }, null, 2)};\n`, {
  encoding: "utf8",
  mode: 0o600,
});
chmodSync(outputPath, 0o600);
console.log(`Captured ${apps.length} managed PM2 process configuration(s).`);
