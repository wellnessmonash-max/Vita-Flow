import { db } from 'hatchable';
import { trackLeadEvent } from '../../lib/meta-capi.js';
export const access='public'; export const methods=['POST'];

function secretOk(req) {
  const expected = process.env.VITA_FLOW_INGEST_SECRET || '';
  if (!expected) return false;
  const supplied = req.headers?.['x-vita-flow-secret'] || req.body?.ingest_secret || '';
  return String(supplied) === expected;
}

export default async function(req,res){
  if(!secretOk(req)) return res.status(401).json({error:'Invalid ingest secret'});
  const b=req.body||{};
  const userId=String(b.user_id||b.coach_id||'').trim();
  const firstName=String(b.first_name||b.name||'').trim();
  if(!userId || !firstName) return res.status(400).json({error:'user_id/coach_id and first_name/name are required'});

  const phone=String(b.phone_number||b.phone||'').trim();
  const instagram=String(b.instagram_handle||b.instagram||'').trim();
  const email=String(b.email||'').trim().toLowerCase();
  const source=String(b.source||'Landing Page').trim();
  const existing=await db.query("SELECT * FROM leads WHERE user_id=$1 AND ((phone_number<>'' AND phone_number=$2) OR (email<>'' AND email=$3) OR (instagram_handle<>'' AND instagram_handle=$4)) LIMIT 1",[userId,phone,email,instagram]);
  let lead;
  let created=false;
  if(existing.rows.length){
    lead=existing.rows[0];
    const update=await db.query("UPDATE leads SET email=CASE WHEN $2<>'' THEN $2 ELSE email END, phone_number=CASE WHEN $3<>'' THEN $3 ELSE phone_number END, instagram_handle=CASE WHEN $4<>'' THEN $4 ELSE instagram_handle END, health_goals=CASE WHEN $5<>'' THEN $5 ELSE health_goals END, pain_points=CASE WHEN $6<>'' THEN $6 ELSE pain_points END, updated_at=now() WHERE id=$1 RETURNING *",[lead.id,email,phone,instagram,String(b.health_goals||''),String(b.pain_points||'')]);
    lead=update.rows[0];
  } else {
    const inserted=await db.query("INSERT INTO leads(user_id,first_name,last_name,email,phone_number,instagram_handle,source,status,health_goals,pain_points,ai_score,next_follow_up_at) VALUES($1,$2,$3,$4,$5,$6,$7,'New',$8,$9,10,now()+interval '1 day') RETURNING *",[userId,firstName,String(b.last_name||''),email,phone,instagram,source,String(b.health_goals||''),String(b.pain_points||'')]);
    lead=inserted.rows[0]; created=true;
  }

  await db.query("INSERT INTO lead_attribution(lead_id,user_id,email,fb_lead_id,fbclid,fbc,fbp,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,form_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,landing_page_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)",[lead.id,userId,email,String(b.fb_lead_id||b.leadgen_id||''),String(b.fbclid||''),String(b.fbc||''),String(b.fbp||''),String(b.campaign_id||''),String(b.campaign_name||''),String(b.adset_id||''),String(b.adset_name||''),String(b.ad_id||''),String(b.ad_name||''),String(b.form_id||''),String(b.utm_source||''),String(b.utm_medium||''),String(b.utm_campaign||''),String(b.utm_content||''),String(b.utm_term||''),String(b.landing_page_url||'')]);

  let meta={skipped:true};
  if(created) meta=await trackLeadEvent(lead,{fbp:b.fbp,fbc:b.fbc,email},'Lead',String(b.landing_page_url||''));
  return res.status(created?201:200).json({ok:true,created,lead_id:lead.id,lead,meta});
}