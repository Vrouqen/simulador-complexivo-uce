import { activate } from "@/lib/auth";
import { body, ok, route, sameOrigin, str } from "@/lib/http";

export const POST = route(async (req: Request) => {
  await sameOrigin();
  const b = await body(req);
  await activate({ email: str(b.email, 160), code: str(b.code, 40), password: String(b.password ?? ""), fp: b.fp });
  return ok();
});
