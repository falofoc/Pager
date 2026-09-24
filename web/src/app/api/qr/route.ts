import QRCode from "qrcode";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const d = new URL(req.url).searchParams.get("d");
  if (!d || d.length > 400) return new Response("bad", { status: 400 });
  const svg = await QRCode.toString(d, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1C1B1A", light: "#FFFFFF" } });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
