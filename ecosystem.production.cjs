"use strict";
/* global process */

const { resolve } = require("node:path");

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`[pm2] ${name} is required`);
  return value;
}

function boundedInteger(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(process.env[name] || fallback), 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`[pm2] ${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

const appName = required("PM2_APP_NAME");
if (!/^[A-Za-z0-9._-]+$/.test(appName)) {
  throw new Error("[pm2] PM2_APP_NAME contains unsafe characters");
}

const releaseDir = resolve(required("PM2_RELEASE_DIR"));
const nodeBin = resolve(required("PM2_NODE_BIN"));
const webInstances = boundedInteger("PM2_WEB_INSTANCES", 2, 2, 32);
const workerInstances = boundedInteger("PM2_WORKER_INSTANCES", 1, 1, 32);
const killTimeoutMs = boundedInteger("PM2_KILL_TIMEOUT_MS", 45_000, 31_000, 120_000);
const readyTimeoutMs = boundedInteger("PM2_READY_TIMEOUT_MS", 60_000, 10_000, 180_000);

const common = {
  cwd: releaseDir,
  interpreter: nodeBin,
  autorestart: true,
  kill_timeout: killTimeoutMs,
  listen_timeout: readyTimeoutMs,
  wait_ready: true,
  min_uptime: "10s",
  max_restarts: 10,
  restart_delay: 1_000,
  time: true,
  env: {
    NODE_ENV: "production",
  },
};

module.exports = {
  apps: [
    {
      ...common,
      name: appName,
      script: resolve(releaseDir, "scripts/pm2-web-server.cjs"),
      exec_mode: "cluster",
      instances: webInstances,
      instance_var: "PM2_INSTANCE_ID",
      max_memory_restart: "1200M",
    },
    {
      ...common,
      name: `${appName}-worker`,
      script: resolve(releaseDir, "scripts/pm2-worker-entry.cjs"),
      exec_mode: "fork",
      instances: workerInstances,
      instance_var: "PM2_INSTANCE_ID",
      max_memory_restart: "1500M",
    },
  ],
};
