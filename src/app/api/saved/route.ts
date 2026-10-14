import { requireSession } from "@/lib/auth";
import { clearSaved, setSaved } from "@/lib/exam";
import { body, ok, route, sameOrigin, str } from "@/lib/http";

export const POST = route(async (req: Request) => {
  await sameOrigin();
  const s = await requireSession();
  const b = await body(req);
  await setSaved(s, str(b.questionId, 60), b.saved === true);
  return ok();
});

export const DELETE = route(async (req: Request) => {
  await sameOrigin();
  const s = await requireSession();
  await clearSaved(s, str(new URL(req.url).searchParams.get("bank"), 40));
  return ok();
});
