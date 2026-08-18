#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

const child = spawn(process.execPath, [
  resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
  "--env-file-if-exists=.env.production",
  "--env-file-if-exists=.env.local",
  resolve(process.cwd(), "scripts/worker.ts"),
], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});

let ready = false;
let stopping = false;
let stdoutBuffer = "";

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  stdoutBuffer += chunk.toString("utf8");
  const lines = stdoutBuffer.split(/\r?\n/);
  stdoutBuffer = lines.pop() || "";
  for (const line of lines) {
    if (!ready && isSupervisorReady(line)) {
      ready = true;
      if (typeof process.send === "function") process.send("ready");
    }
  }
});
child.stderr.pipe(process.stderr);

child.once("error", (error) => {
  console.error("[worker-entry] failed to start supervisor", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`[worker-entry] supervisor exited from ${signal}`);
  }
  process.exit(code ?? (stopping ? 0 : 1));
});

function isSupervisorReady(line) {
  try {
    const event = JSON.parse(line);
    return event?.service === "worker" && event?.event === "supervisor.ready";
  } catch {
    return false;
  }
}

function forwardSignal(signal) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
  const forceExit = setTimeout(() => {
    child.kill("SIGKILL");
    process.exit(1);
  }, 35_000);
  forceExit.unref();
}

process.once("SIGTERM", () => forwardSignal("SIGTERM"));
process.once("SIGINT", () => forwardSignal("SIGINT"));
