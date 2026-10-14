import { requestAction, requireAdmin } from "@/lib/admin";
import { body, ok, route, sameOrigin, str } from "@/lib/http";

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await sameOrigin();
  await requireAdmin();
  const b = await body(req);
  return ok(await requestAction((await ctx.params).id, str(b.action, 20), b));
});
