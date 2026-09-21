import { db } from 'hatchable';
import { trackLeadEvent } from '../../../lib/meta-capi.js';
export const access='public'; export const methods=['GET','POST'];

export default async function(req,res){
  if(req.method==='GET'){
    const mode=req.query?.['hub.mode']; const token=req.query?.['hub.verify_token']; const challenge=req.query?.['hub.challenge'];
    if(mode==='subscribe' && token && token===process.env.META_VERIFY_TOKEN) return res.status(200).send(String(challenge||''));
    return res.status(403).send('Verification failed');
  }
  const body=req.body||{};
  if(!body.entry) return res.status(200).json({ok:true});
  const pageToken=process.env.META_PAGE_ACCESS_TOKEN||'';
  for(const entry of body.entry||[]){
    for(const change of entry.changes||[]){
      const leadgenId=change?.value?.leadgen_id;
      if(!leadgenId || !pageToken) continue;
      try{
        const r=await fetch(`https://graph.facebook.com/v24.0/${encodeURIComponent(leadgenId)}?access_token=${encodeURIComponent(pageToken)}`);
        const data=await r.json();
        const fields=Object.fromEntries((data.field_data||[]).map(x=>[x.name,Array.isArray(x.values)?x.values[0]:x.values]));
        const userId=String(change?.value?.user_id||change?.value?.page_id||'');
        if(!userId || !fields.email && !fields.phone_number && !fields.phone) continue;
        const phone=String(fields.phone_number||fields.phone||''); const email=String(fields.email||'').toLowerCase();
        const existing=await db.query("SELECT * FROM leads WHERE user_id=$1 AND ((phone_number<>'' AND phone_number=$2) OR (email<>'' AND email=$3)) LIMIT 1",[userId,phone,email]);
        let lead;
        if(existing.rows.length){ lead=existing.rows[0]; }
        else {
          const ins=await db.query("INSERT INTO leads(user_id,first_name,last_name,email,phone_number,source,status,health_goals,pain_points,ai_score,next_follow_up_at) VALUES($1,$2,$3,$4,$5,'Meta Instant Form','New','','',10,now()+interval '1 day') RETURNING *",[userId,String(fields.first_name||fields.name||'Lead'),String(fields.last_name||''),email,phone]);
          lead=ins.rows[0];
        }
        await db.query("INSERT INTO lead_attribution(lead_id,user_id,email,fb_lead_id,form_id,landing_page_url) VALUES($1,$2,$3,$4,$5,'')",[lead.id,userId,email,String(leadgenId),String(change?.value?.form_id||'')]);
        await trackLeadEvent(lead,{email},'Lead','');
      }catch(err){ /* acknowledge webhook; failed lead can be retried from Meta */ }
    }
  }
  return res.status(200).json({ok:true});
}