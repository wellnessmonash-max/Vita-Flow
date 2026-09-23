export default async (req: Request) => {
  const upstreamBase = "https://vita-flow-the-ai.hatchable.site/api";
  const incoming = new URL(req.url);
  const upstream = upstreamBase + incoming.pathname.replace(/^\/api/, "") + incoming.search;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");
  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();
  try {
    const r = await fetch(upstream, init);
    const out = new Headers(r.headers);
    out.set("cache-control","no-store");
    return new Response(r.body,{status:r.status,statusText:r.statusText,headers:out});
  } catch (e) {
    return new Response(JSON.stringify({error:"Upstream VITA-FLOW API unavailable"}),{status:502,headers:{"content-type":"application/json"}});
  }
};
export const config = { path: "/api/*" };