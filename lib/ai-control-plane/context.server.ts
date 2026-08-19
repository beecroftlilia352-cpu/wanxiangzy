import { AsyncLocalStorage } from "node:async_hooks";
import type { AiRouteContext } from "@/lib/ai-control-plane/types";

const routingContext = new AsyncLocalStorage<AiRouteContext>();

export function runWithAiRouteContext<T>(context: AiRouteContext, fn: () => Promise<T>): Promise<T> {
  return routingContext.run(context, fn);
}

export function getAiRouteContext(): AiRouteContext {
  return routingContext.getStore() || {};
}
