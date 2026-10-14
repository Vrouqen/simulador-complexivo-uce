import { requireSession } from "@/lib/auth";
import { lockAnswer } from "@/lib/exam";
import { body, ok, route, sameOrigin } from "@/lib/http";

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await sameOrigin();
  const s = await requireSession();
  const b = await body<{ index: number; choice: number | null }>(req);
  return ok(await lockAnswer(s, (await ctx.params).id, Number(b.index), b.choice));
});
