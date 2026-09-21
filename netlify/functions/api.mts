import { getStore } from "@netlify/blobs";
import type { Context, Config } from "@netlify/functions";

type Lead={id:string;first_name:string;last_name:string;phone_number:string;instagram_handle:string;source:string;status:string;health_goals:string;pain_points:string;ai_score:number;next_follow_up_at:string;created_at:string;updated_at:string};
type Interaction={id:string;lead_id:string;type:string;content:string;sentiment:string;ai_suggested_reply:string;created_at:string};
type Proof={id:string;client_name:string;image_before_url:string;image_after_url:string;category:string;testimonial_text:string;created_at:string};
type State={leads:Lead[];interactions:Interaction[];proofs:Proof[];scripts:any[]};

const store=getStore({name:"vita-flow-data",consistency:"strong"});
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
async function state(userId:string):Promise<State>{
  const s=await store.get(`user/${userId}`,{type:"json"}) as State|null;
  return s||{leads:[],interactions:[],proofs:[],scripts:[
    {id:"s1",title:"First Follow-up",category:"Follow-up",body:"Hey {{name}}, just checking in. How are you feeling about your {{goal}} goal? Happy to help with the next step."},
    {id:"s2",title:"Warm Lead",category:"Follow-up",body:"Hey {{name}}, great to hear from you. What would make this week feel like real progress toward your {{goal}}?"},
    {id:"s3",title:"No Pressure",category:"Re-engage",body:"Hey {{name}}, no pressure at all. If {{goal}} is still on your mind, I’m here whenever you’re ready."}
  ]};
}
async function save(userId:string,s:State){await store.setJSON(`user/${userId}`,s)}

function json(data:any,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
function replyFor(l:Lead,msg?:string){const base=msg&&/not interested|busy|expensive/i.test(msg)?"Totally understand. No pressure — if you want, we can keep it simple and revisit when the timing feels right.":msg&&/ready|yes|interested|when/i.test(msg)?`Love that, ${l.first_name}. Let’s make the next step simple — what would you most like to improve with your ${l.health_goals||"goal"}?`:`Hey ${l.first_name}, I’d love to understand your goal a little better. What’s the biggest result you want right now?`;return replyFor}
function score(l:Lead,s:State){const interactions=s.interactions.filter(i=>i.lead_id===l.id).length;return Math.min(100,20+interactions*12+(l.health_goals?25:0)+(l.pain_points?15:0))}

export default async (req:Request,context:Context)=>{
  const userId="public";
  const s=await state(userId); const u=new URL(req.url); const path=u.pathname.replace(/^\/api\/?/,"");
  if(path==="leads"&&req.method==="GET"){const q=(u.searchParams.get("q")||"").toLowerCase();return json(s.leads.filter(l=>!q||[l.first_name,l.last_name,l.instagram_handle].join(" ").toLowerCase().includes(q)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)))}
  if(path==="leads"&&req.method==="POST"){const b=await req.json();if(!b.first_name)return json({error:"first_name required"},400);const dup=s.leads.find(l=>(b.phone_number&&l.phone_number===b.phone_number)||(b.instagram_handle&&l.instagram_handle===b.instagram_handle));if(dup)return json({error:"Lead already exists. Merge or Create New?",duplicate:dup},409);const t=now();const l:Lead={id:uid(),first_name:b.first_name,last_name:b.last_name||"",phone_number:b.phone_number||"",instagram_handle:b.instagram_handle||"",source:b.source||"Referral",status:"New",health_goals:b.health_goals||"",pain_points:b.pain_points||"",ai_score:10,next_follow_up_at:new Date(Date.now()+86400000).toISOString(),created_at:t,updated_at:t};s.leads.unshift(l);await save(userId,s);return json(l,201)}
  if(path.startsWith("leads/detail/")&&req.method==="GET"){const id=path.split("/").pop()!;const lead=s.leads.find(l=>l.id===id);if(!lead)return json({error:"Lead not found"},404);return json({lead,interactions:s.interactions.filter(i=>i.lead_id===id).sort((a,b)=>b.created_at.localeCompare(a.created_at))})}
  if(path==="dashboard"&&req.method==="GET"){const today=new Date().toISOString().slice(0,10);const due=s.leads.filter(l=>l.next_follow_up_at<=now()&&!["Converted","Lost"].includes(l.status)).length;return json({stats:{newLeadsToday:s.leads.filter(l=>l.created_at.slice(0,10)===today).length,followUpsDue:due,activeTrials:s.leads.filter(l=>l.status==="Trial_Active").length,monthlyRevenue:0},actions:[...s.leads].sort((a,b)=>b.ai_score-a.ai_score).slice(0,8)})}
  if(path==="proofs"&&req.method==="GET")return json(s.proofs);
  if(path==="proofs"&&req.method==="POST"){const b=await req.json();const p={id:uid(),client_name:b.client_name||"",image_before_url:b.image_before_url||"",image_after_url:b.image_after_url||"",category:b.category||"WeightLoss",testimonial_text:b.testimonial_text||"",created_at:now()};s.proofs.unshift(p);await save(userId,s);return json(p,201)}
  if(path==="scripts"&&req.method==="GET")return json(s.scripts);
  if(path==="analytics"&&req.method==="GET"){const leads=s.leads.length,ass=s.leads.filter(l=>l.status==="Assessment_Scheduled").length,conv=s.leads.filter(l=>l.status==="Converted").length;const sources=Object.entries(s.leads.reduce((a,l)=>{a[l.source]=(a[l.source]||0)+1;return a},{} as Record<string,number>)).map(([source,n])=>({source,n}));return json({totals:{leads,assessments:ass,converted:conv,interactions:s.interactions.length},ratios:{leadToAssessment:leads?Math.round(ass/leads*100):0,assessmentToSale:ass?Math.round(conv/ass*100):0},sources})}
  if(path==="ai/score"&&req.method==="POST"){const b=await req.json();const l=s.leads.find(x=>x.id===b.lead_id);if(!l)return json({error:"Lead not found"},404);l.ai_score=score(l,s);l.updated_at=now();await save(userId,s);return json({score:l.ai_score,label:l.ai_score>80?"Hot":l.ai_score>50?"Warm":"Cold"})}
  if(path.startsWith("ai/reply/")&&req.method==="GET"){const id=path.split("/").pop()!;const l=s.leads.find(x=>x.id===id);if(!l)return json({error:"Lead not found"},404);const r=replyFor(l);return json({variations:{short:r,detailed:`Hey ${l.first_name}, thanks for sharing. I’d love to understand what matters most to you about ${l.health_goals||"your goal"} and help you map a simple next step.`,question:`What would success look like for you over the next few weeks?`},proof:s.proofs.slice(0,3)})}
  if(path==="interactions"&&req.method==="POST"){const b=await req.json();const l=s.leads.find(x=>x.id===b.lead_id);if(!l)return json({error:"Lead not found"},404);const msg=String(b.content||"");const sentiment=/love|excited|ready|yes|interested|when/i.test(msg)?"positive":/no|not interested|busy|expensive/i.test(msg)?"negative":"neutral";const reply=replyFor(l,msg);const i:Interaction={id:uid(),lead_id:l.id,type:b.type||"WhatsApp",content:msg,sentiment,ai_suggested_reply:reply,created_at:now()};s.interactions.unshift(i);l.ai_score=Math.max(l.ai_score,sentiment==="positive"?90:sentiment==="negative"?35:65);l.next_follow_up_at=new Date(Date.now()+172800000).toISOString();l.updated_at=now();await save(userId,s);return json({reply,sentiment,ai_score:l.ai_score,next_follow_up_at:l.next_follow_up_at})}
  if(path==="pipeline"&&req.method==="PATCH"){const b=await req.json();const allowed=["stage1","stage2","stage3","stage4","stage5","stage6"];if(!allowed.includes(b.status))return json({error:"invalid status"},400);const l=s.leads.find(x=>x.id===b.lead_id);if(!l)return json({error:"Lead not found"},404);l.status=b.status;l.updated_at=now();await save(userId,s);return json(l)}
  return json({error:"Not found"},404)
};
export const config:Config={path:"/api/*"};
