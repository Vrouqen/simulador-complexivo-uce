import { requireSession } from "@/lib/auth";
import { createAttempt } from "@/lib/exam";
import { body, ok, route, sameOrigin, str } from "@/lib/http";

export const POST = route(async (req: Request) => {
  await sameOrigin();
  const s = await requireSession();
  const b = await body(req);
  return ok(await createAttempt(s, str(b.bank, 40), (b.config ?? {}) as never));
});
