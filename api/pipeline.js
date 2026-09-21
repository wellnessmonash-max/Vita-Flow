import { db, auth } from 'hatchable';
import { trackLeadEvent } from '../lib/meta-capi.js';
export const access='public'; export const methods=['PATCH'];
export default async function(req,res){
 const user=await auth.requireUser(req,res);if(!user)return;
 const b=req.body||{};if(!b.lead_id||!b.status)return res.status(400).json({error:'lead_id and status required'});
 const allowed=['New','Contacted','Assessment_Scheduled','Trial_Active','Converted','Lost'];
 if(!allowed.includes(b.status))return res.status(400).json({error:'invalid status'});
 const {rows}=await db.query("UPDATE leads SET status=$1,updated_at=now() WHERE id=$2 AND user_id=$3 RETURNING *",[b.status,b.lead_id,user.id]);
 if(!rows.length)return res.status(404).json({error:'Lead not found'});
 const lead=rows[0];
 if(b.status==='Trial_Active' || b.status==='Converted'){
   const attr=await db.query('SELECT * FROM lead_attribution WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 1',[lead.id]);
   const eventName=b.status==='Trial_Active'?'StartTrial':'Purchase';
   await trackLeadEvent(lead,attr.rows[0]||{},eventName,String(b.event_source_url||''));
 }
 res.json({id:lead.id,first_name:lead.first_name,last_name:lead.last_name,status:lead.status,ai_score:lead.ai_score});
}