import { requireSession } from "@/lib/auth";
import { bankStats, getBank, getOpenAttempt } from "@/lib/exam";
import { ok, route } from "@/lib/http";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const s = await requireSession();
  const bank = await getBank(slug, s);
  const [stats, open] = await Promise.all([bankStats(s, slug), getOpenAttempt(s, slug)]);
  return ok({ bank, stats, open });
});
