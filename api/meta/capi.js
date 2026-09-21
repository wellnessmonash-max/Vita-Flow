import { db, auth } from 'hatchable';
import { trackLeadEvent } from '../../lib/meta-capi.js';
export const access='public'; export const methods=['POST'];
export default async function(req,res){
  const user=await auth.requireUser(req,res); if(!user)return;
  const b=req.body||{}; if(!b.lead_id||!b.event_name)return res.status(400).json({error:'lead_id and event_name required'});
  const allowed=['Lead','StartTrial','Purchase']; if(!allowed.includes(b.event_name)) return res.status(400).json({error:'unsupported event_name'});
  const leadQ=await db.query('SELECT * FROM leads WHERE id=$1 AND user_id=$2 LIMIT 1',[b.lead_id,user.id]); if(!leadQ.rows.length)return res.status(404).json({error:'Lead not found'});
  const attrQ=await db.query('SELECT * FROM lead_attribution WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 1',[b.lead_id]);
  const result=await trackLeadEvent(leadQ.rows[0],attrQ.rows[0]||{},b.event_name,String(b.event_source_url||''));
  res.json(result);
}