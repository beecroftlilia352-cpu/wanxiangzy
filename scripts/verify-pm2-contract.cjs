#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { realpathSync } = require("node:fs");

const [appName, expectedDirectory, expectedInstancesValue] = process.argv.slice(2);
try {
  if (!appName || !expectedDirectory) throw new Error("missing expected process contract arguments");
  const expectedDirectoryReal = realpathSync(expectedDirectory);
  const expectedInstances = Number(expectedInstancesValue);
  const processes = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
  const web = processes.filter((entry) => entry.name === appName);
  const worker = processes.filter((entry) => entry.name === `${appName}-worker`);
  const online = (entry) => entry?.pm2_env?.status === "online";
  const inRelease = (entry) => realpathSync(entry?.pm2_env?.pm_cwd || "") === expectedDirectoryReal;

  if (!Number.isInteger(expectedInstances) || web.length !== expectedInstances || web.length < 2) {
    throw new Error("invalid Web instance count");
  }
  if (!web.every((entry) => online(entry) && inRelease(entry) && entry?.pm2_env?.exec_mode === "cluster_mode")) {
    throw new Error("Web cluster is not ready on the new release");
  }
  if (worker.length !== 1 || !online(worker[0]) || !inRelease(worker[0]) || worker[0]?.pm2_env?.exec_mode !== "fork_mode") {
    throw new Error("Worker is not ready on the new release");
  }
  console.log(`PM2 contract passed (${web.length} Web cluster instances, 1 Worker).`);
} catch (error) {
  console.error(`PM2 contract failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
