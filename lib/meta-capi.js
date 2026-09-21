import { db } from 'hatchable';

const META_VERSION = 'v24.0';

async function sha256(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  const bytes = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function env(name) { return process.env[name] || ''; }

export async function sendMetaEvent({ lead, attribution, eventName, eventId, eventSourceUrl }) {
  const datasetId = env('META_DATASET_ID');
  const accessToken = env('META_CAPI_ACCESS_TOKEN');
  if (!datasetId || !accessToken) return { skipped: true, reason: 'Meta CAPI credentials are not configured.' };

  const existing = await db.query('SELECT id,status FROM meta_capi_events WHERE event_id=$1 LIMIT 1', [eventId]);
  if (existing.rows.length && existing.rows[0].status === 'sent') return { skipped: true, reason: 'Already sent.' };

  await db.query('INSERT INTO meta_capi_events(lead_id,event_name,event_id,status) VALUES($1,$2,$3,\'pending\') ON CONFLICT(event_id) DO NOTHING', [lead.id, eventName, eventId]);

  const user_data = {};
  const emailHash = await sha256(lead.email || attribution?.email);
  const phoneHash = await sha256(lead.phone_number);
  if (emailHash) user_data.em = [emailHash];
  if (phoneHash) user_data.ph = [phoneHash];
  if (attribution?.fbp) user_data.fbp = attribution.fbp;
  if (attribution?.fbc) user_data.fbc = attribution.fbc;

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: 'website',
    user_data,
    custom_data: {},
    ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {})
  };

  const url = `https://graph.facebook.com/${META_VERSION}/${datasetId}/events?access_token=${encodeURIComponent(accessToken)}`;
  let responseText = '';
  let ok = false;
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: [event] }) });
    responseText = await response.text();
    ok = response.ok;
  } catch (err) {
    responseText = String(err?.message || err);
  }

  await db.query('UPDATE meta_capi_events SET status=$1,response=$2,sent_at=CASE WHEN $1=\'sent\' THEN now() ELSE sent_at END WHERE event_id=$3', [ok ? 'sent' : 'failed', responseText.slice(0, 4000), eventId]);
  return { sent: ok, response: responseText };
}

export async function trackLeadEvent(lead, attribution, eventName, eventSourceUrl) {
  const eventId = `vita_${lead.id}_${eventName}_${Date.now()}`;
  return sendMetaEvent({ lead, attribution, eventName, eventId, eventSourceUrl });
}