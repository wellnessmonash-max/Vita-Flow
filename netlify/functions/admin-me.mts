import { getUser } from "@netlify/identity";
import type { Context, Config } from "@netlify/functions";
export default async (_req: Request, _context: Context) => {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!((user as any).roles || []).includes("admin")) return new Response("Forbidden", { status: 403 });
  return Response.json({ ok: true, email: user.email, roles: (user as any).roles || [] });
};
export const config: Config = { path: "/api/admin/me" };