import { requireSession } from "@/lib/auth";
import { submitAttempt } from "@/lib/exam";
import { body, ok, route, sameOrigin } from "@/lib/http";

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await sameOrigin();
  const s = await requireSession();
  return ok(await submitAttempt(s, (await ctx.params).id, await body(req)));
});
