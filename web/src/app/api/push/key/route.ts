import { getVapid } from "@/server/appconfig";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ publicKey: (await getVapid()).publicKey });
}
