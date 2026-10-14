import { requireSession } from "@/lib/auth";
import { getReview, saveProgress } from "@/lib/exam";
import { body, ok, route, sameOrigin } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const s = await requireSession();
  return ok(await getReview(s, (await ctx.params).id));
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await sameOrigin();
  const s = await requireSession();
  await saveProgress(s, (await ctx.params).id, await body(req));
  return ok();
});
