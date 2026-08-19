#!/usr/bin/env node
"use strict";

const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const http = require("node:http");
const next = require("next");

const port = parsePort(process.env.PORT, 3000);
const hostname = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
const app = next({ dev: false, dir: process.cwd(), hostname, port });
const handler = app.getRequestHandler();
let server;
let stopping = false;

async function start() {
  await app.prepare();
  server = http.createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      console.error("[web] request handler failed", safeMessage(error));
      if (!response.headersSent) response.statusCode = 500;
      response.end("Internal Server Error");
    });
  });
  server.requestTimeout = parsePositiveInteger(process.env.WEB_REQUEST_TIMEOUT_MS, 120_000);
  server.headersTimeout = parsePositiveInteger(process.env.WEB_HEADERS_TIMEOUT_MS, 65_000);
  server.keepAliveTimeout = parsePositiveInteger(process.env.WEB_KEEP_ALIVE_TIMEOUT_MS, 5_000);

  server.listen(port, hostname, () => {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      service: "web",
      event: "server.ready",
      port,
      instance: process.env.PM2_INSTANCE_ID || "0",
    }));
    if (typeof process.send === "function") process.send("ready");
  });
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: "web", event: "shutdown.requested", signal }));

  const forceExit = setTimeout(() => process.exit(1), 30_000);
  forceExit.unref();
  try {
    if (server) {
      server.closeIdleConnections?.();
      await new Promise((resolveClose) => server.close(resolveClose));
    }
    await app.close?.();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    console.error("[web] graceful shutdown failed", safeMessage(error));
    process.exit(1);
  }
}

function parsePort(value, fallback) {
  const portValue = Number.parseInt(String(value || fallback), 10);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return portValue;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
start().catch((error) => {
  console.error("[web] startup failed", safeMessage(error));
  process.exit(1);
});
