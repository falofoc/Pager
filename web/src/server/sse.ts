import { subscribe } from "./hub";

/** يفتح بثًا SSE على عدة قنوات. */
export function sseResponse(
  req: Request,
  channels: string[],
  opts: { initial?: () => Promise<unknown>; onOpen?: () => void; onClose?: () => void } = {},
) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (d: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const unsubs = channels.map((c) => subscribe(c, send));
      const ka = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`: ka\n\n`));
        } catch {
          closed = true;
        }
      }, 20000);
      cleanup = () => {
        if (closed && unsubs.length === 0) return;
        closed = true;
        unsubs.splice(0).forEach((u) => u());
        clearInterval(ka);
        opts.onClose?.();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
      controller.enqueue(enc.encode(`retry: 3000\n\n`));
      opts.onOpen?.();
      if (opts.initial) send(await opts.initial());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
