import { currentDevice } from "./auth";
import { loadBranch } from "./orders";
import { fail } from "./http";

export async function staffContext() {
  const device = await currentDevice();
  if (!device) return { error: fail("UNAUTHORIZED", 401) } as const;
  const branch = await loadBranch(device.branchId);
  if (!branch) return { error: fail("UNAUTHORIZED", 401) } as const;
  return { device, branch, actor: `device:${device.id}` } as const;
}
