let shutdownController = new AbortController();

export function getWorkerShutdownSignal(): AbortSignal {
  return shutdownController.signal;
}

export function requestWorkerShutdown(reason = "worker shutdown requested") {
  if (!shutdownController.signal.aborted) shutdownController.abort(new Error(reason));
}

/** Test/process reuse must start from a fresh controller after a prior stop. */
export function resetWorkerShutdownForTests() {
  shutdownController = new AbortController();
}
