export function publicUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1800) throw new Error('invalid_url');
  const text=value.trim();let u:URL;try{u=new URL(/^https?:\/\//i.test(text)?text:'https://'+text)}catch{throw new Error('invalid_url')};
  const h=u.hostname.toLowerCase().replace(/\.$/,'');
  if (!['http:','https:'].includes(u.protocol)||u.username||u.password||(u.port&&!['80','443'].includes(u.port))||!h.includes('.')||h.includes(':')||/^\[|^[\d.]+$/.test(h)||/\.(localhost|local|internal|test|invalid|onion)$/.test(h)||h==='localhost'||h==='metadata.google.internal') throw new Error('invalid_url');
  u.hash='';u.hostname=h;return u.toString();
}
export async function sha256(text:string):Promise<string>{return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))}
function hex(b:ArrayBuffer){return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function reportToken(id:string):Promise<string>{const secret=Deno.env.get('ICP_SHORTLIST_SECRET');if(!secret)throw new Error('missing_secret');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id)))}
export async function pg(path:string,init:RequestInit={}):Promise<any>{const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';const r=await fetch((Deno.env.get('SUPABASE_URL')||'')+'/rest/v1/'+path,{...init,signal:init.signal||AbortSignal.timeout(20000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...init.headers}});if(!r.ok){const data=await r.json().catch(()=>({}));throw new Error('database:'+r.status+':'+(data.message||data.code||'error'))}return r.status===204?null:await r.json()}
