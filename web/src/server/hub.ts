import { EventEmitter } from "node:events";

const g = globalThis as unknown as { __dorakHub?: EventEmitter };
const hub = g.__dorakHub ?? new EventEmitter();
hub.setMaxListeners(0);
g.__dorakHub = hub;

export function publish(channel: string, data: unknown) {
  hub.emit(channel, data);
}

export function subscribe(channel: string, fn: (d: unknown) => void) {
  hub.on(channel, fn);
  return () => {
    hub.off(channel, fn);
  };
}

export const ch = {
  branch: (id: string) => `branch:${id}`,
  order: (id: string) => `order:${id}`,
  tick: (branchId: string) => `tick:${branchId}`,
};
