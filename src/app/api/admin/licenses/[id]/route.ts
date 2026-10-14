import { getLicenseDetail, requireAdmin, updateLicense } from "@/lib/admin";
import { ApiError, body, ok, route, sameOrigin } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const d = await getLicenseDetail((await ctx.params).id);
  if (!d) throw new ApiError(404, "NOT_FOUND", "Licencia no encontrada.");
  return ok(d);
});

export const PUT = route(async (req: Request, ctx: Ctx) => {
  await sameOrigin();
  await requireAdmin();
  await updateLicense((await ctx.params).id, await body(req));
  return ok();
});
