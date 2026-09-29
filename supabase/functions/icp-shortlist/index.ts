import {publicUrl,sha256,reportToken,pg} from '../_shared/icp-shortlist/core.ts';
const base='https://resources.ivanmanfredi.com/target-companies/report.html#';
const origins=new Set(['https://resources.ivanmanfredi.com','https://inboundonsteroids.com','http://127.0.0.1:8769','http://localhost:8769']);
function headers(req:Request){const origin=req.headers.get('Origin')||'';return {'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://resources.ivanmanfredi.com','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type,authorization,apikey,x-client-info','Vary':'Origin'}}
function response(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:headers(req)})}
export function validateInput(body:Record<string,unknown>){
 const agency_url=publicUrl(body.agency_url),client_url=publicUrl(body.client_url);
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 const service=typeof body.service==='string'?body.service.trim():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('invalid_email');
 if(service.length<8||service.length>1200)throw new Error('invalid_service');
 if(new URL(agency_url).hostname.replace(/^www\./,'')===new URL(client_url).hostname.replace(/^www\./,''))throw new Error('same_company');
 if(typeof body.idempotency_key!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotency_key))throw new Error('invalid_request_key');
 if(body.website)throw new Error('invalid_submission');
 const attribution:Record<string,string>={};for(const k of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','campaign_id','creative_id','referrer']){const v=(body.attribution as Record<string,unknown>)?.[k];if(typeof v==='string')attribution[k]=v.slice(0,500)}
 return {agency_url,client_url,email,service,idempotency_key:body.idempotency_key,attribution};
}
export default async function handler(req:Request):Promise<Response>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req)});
 try{
  if(req.method==='GET'){
   const token=new URL(req.url).searchParams.get('token')||'';
   if(!/^[a-f0-9]{64}$/.test(token))return response(req,{error:'not_found',message:'This report link is not valid.'},404);
   const rows=await pg('icp_shortlist_requests?token_hash=eq.'+await sha256(token)+'&select=status,phase,report,created_at,completed_at,email_status');
   const row=rows[0];if(!row)return response(req,{error:'not_found',message:'This report link is not valid.'},404);
   const hold=row.status==='pending_review';const report=hold?{}:row.report;
   return response(req,{status:hold?'researching':row.status,phase:hold?'finalize':row.phase,companies:report.companies||[],summary:report.summary||'',created_at:row.created_at,completed_at:row.completed_at,email_status:row.email_status});
  }
  if(req.method!=='POST')return response(req,{error:'method_not_allowed'},405);
  const origin=req.headers.get('Origin');if(origin&&!origins.has(origin))return response(req,{error:'origin_not_allowed'},403);
  if(Number(req.headers.get('Content-Length')||0)>10000)return response(req,{error:'too_large'},413);
  const text=await req.text();if(text.length>10000)return response(req,{error:'too_large'},413);
  const body=JSON.parse(text);const input=validateInput(body);
  const id=crypto.randomUUID();const token=await reportToken(id);
  const adminAuth=req.headers.get('Authorization');const is_test=body.is_test===true&&(adminAuth==='Bearer '+Deno.env.get('ICP_SHORTLIST_SECRET')||adminAuth==='Bearer '+Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0].trim()||req.headers.get('cf-connecting-ip')||'unknown';
  const rows=await pg('rpc/icp_shortlist_submit',{method:'POST',body:JSON.stringify({p_request:{...input,id,token_hash:await sha256(token),ip_hash:await sha256((Deno.env.get('ICP_SHORTLIST_SECRET')||'')+ip),is_test}})});
  const row=rows[0];if(!row)throw new Error('empty_insert');
  return response(req,{report_url:base+await reportToken(row.id),status:row.status},202);
 }catch(err){const code=String((err as Error).message);const messages:Record<string,[number,string]>={invalid_url:[400,'Add a public website, such as https://youragency.com.'],invalid_email:[400,'Add a valid email address for your report.'],invalid_service:[400,'Describe what you do for this client in a short sentence.'],same_company:[400,'Add your client’s website, separate from your agency website.'],invalid_request_key:[400,'Refresh the page and try again.'],invalid_submission:[400,'We could not accept this request.'],intake_closed:[503,'We are preparing the research service. Please try again later.'],daily_capacity:[429,'Today’s research slots are full. Please try again tomorrow.'],rate_limited:[429,'You have reached today’s request limit. Please try again tomorrow.'],duplicate_request:[409,'We already have a request for this email today. Check your original report link or your inbox.'],idempotency_conflict:[409,'Your request changed. Refresh the page and try again.']};
  for(const [key,[status,message]] of Object.entries(messages)){if(code.includes(key))return response(req,{error:key,message},status)}
  if(err instanceof SyntaxError)return response(req,{error:'invalid_json',message:'We could not read the request. Please try again.'},400);
  console.error('icp_intake_error',code.slice(0,140));return response(req,{error:'temporarily_unavailable',message:'We could not save your request. Please try again.'},503);
 }
}
if(import.meta.main)Deno.serve(handler);
