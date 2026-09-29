import React,{useEffect,useRef,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';

const endpoint='https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/icp-shortlist';
const fields=[
 {name:'agency_url',label:'Your agency website',placeholder:'youragency.com',hint:'We’ll use this to understand your agency.',mode:'url'},
 {name:'client_url',label:"Your best client’s website",placeholder:'yourbestclient.com',hint:'Choose a client you’d like more of.',mode:'url'},
 {name:'service',label:'What do you do for them?',placeholder:'e.g. Paid social and landing pages',hint:'Name the service you want to sell to similar companies.'},
 {name:'email',label:'Where should we send your shortlist?',placeholder:'you@youragency.com',hint:'We’ll send your report link here.',mode:'email'}
];
function webAddress(value){try{const url=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);return ['https:','http:'].includes(url.protocol)&&url.hostname.includes('.')&&!url.username&&!url.password?url.href:null}catch{return null}}
function safeLink(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}}
function Link({url,children}){const href=safeLink(url);return href?<a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>:null}
function requestKey(brief,previous){const fingerprint=JSON.stringify(brief);let saved=previous;try{saved=JSON.parse(sessionStorage.getItem('icp-shortlist-request'))||previous}catch{}if(saved?.fingerprint!==fingerprint)saved={fingerprint,key:crypto.randomUUID()};try{sessionStorage.setItem('icp-shortlist-request',JSON.stringify(saved))}catch{}return saved}
export function ProgressiveForm(){
 const [step,setStep]=useState(0),[values,setValues]=useState({agency_url:'',client_url:'',service:'',email:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const input=useRef(null),started=useRef(false),pending=useRef(false),lastRequest=useRef(null);const reduced=useReducedMotion();const field=fields[step];
 useEffect(()=>{if(started.current)input.current?.focus({preventScroll:true});started.current=true},[step]);
 async function advance(e){
  e.preventDefault();if(pending.current)return;
  const value=values[field.name].trim();
  let problem=!value?'Please fill in this field.':field.mode==='url'&&!webAddress(value)?'Enter a website, such as youragency.com.':field.mode==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)?'Enter a valid email address.':field.name==='service'&&value.length<8?'Tell us a little more about your service.':'';
  if(problem){setError(problem);input.current?.focus();return}
  setError('');if(step<3){setStep(step+1);return}
  const brief={agency_url:webAddress(values.agency_url.trim()),client_url:webAddress(values.client_url.trim()),service:values.service.trim(),email:value};
  lastRequest.current=requestKey(brief,lastRequest.current);
  const params=new URLSearchParams(location.search),attribution={};for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'])if(params.has(key))attribution[key]=params.get(key).slice(0,300);
  pending.current=true;setBusy(true);
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...brief,website:'',idempotency_key:lastRequest.current.key,attribution}),signal:AbortSignal.timeout(30000)});
   const result=await response.json();if(!response.ok)throw new Error(result.message||'We couldn’t start the research. Please try again.');
   const destination=new URL(result.report_url);if(destination.origin!=='https://resources.ivanmanfredi.com'||destination.pathname!=='/target-companies/report.html'||!destination.hash)throw new Error('The report link was missing. Please try again.');
   location.assign(destination.href);
  }catch(err){setError(err.name==='TimeoutError'?'The request took too long. Try again; we’ll check for your existing request.':err instanceof TypeError?'Couldn’t connect. Check your connection and try again.':err.message);pending.current=false;setBusy(false)}
 }
 return <form id="signup" className="progressive-form" onSubmit={advance} noValidate aria-label="Get your target-company shortlist" aria-busy={busy}>
  <div className="form-progress"><span aria-live="polite">Step {step+1} of 4</span><span>Free for agency owners</span></div>
  <div className="progress-track" role="progressbar" aria-label="Your brief" aria-valuemin={0} aria-valuemax={4} aria-valuenow={step+1}>{fields.map((f,i)=><span key={f.name} className={i<=step?'filled':''}/>)}</div>
  <motion.div key={field.name} initial={reduced?false:{opacity:0,y:5}} animate={{opacity:1,y:0}} transition={{duration:.15}}>
   <label htmlFor="shortlist-input"><span>{field.label}</span></label>
   <input id="shortlist-input" ref={input} name={field.name} type={field.mode==='email'?'email':'text'} inputMode={field.mode||'text'} autoComplete={field.name==='email'?'email':field.name==='agency_url'?'url':'off'} autoCapitalize="none" spellCheck={false} maxLength={field.name==='service'?500:320} placeholder={field.placeholder} value={values[field.name]} onChange={e=>{setValues({...values,[field.name]:e.target.value});setError('')}} aria-invalid={!!error} aria-describedby={'field-hint'+(error?' form-error':'')} disabled={busy} required/>
   <p id="field-hint" className="field-hint">{field.hint}</p>
  </motion.div>
  {error&&<p id="form-error" className="form-error" role="alert">{error}</p>}
  <div className="form-actions">{step>0&&<button type="button" className="form-back" disabled={busy} onClick={()=>{setError('');setStep(step-1)}}>← Back</button>}<button type="submit" className="button primary" disabled={busy}>{busy?'Starting your research…':step===3?(error?'Try again':'Find my target companies'):'Continue'} {!busy&&<span aria-hidden="true">→</span>}</button></div>
  <p className="form-assurance">{busy?'Keep this page open while we create your report.':'Companies, evidence, contacts and a draft first message.'}</p>
 </form>
}
const states={queued:['Your research is in the queue.','We’ll check companies against your brief, then look for a relevant finding and person to contact.'],researching:['We’re researching your shortlist.','We’re checking company websites and sources. Your report will update here.'],complete:['Your shortlist is ready.','Review the evidence and make each draft your own before contacting anyone.'],partial:['Here’s what the research found.','We’ve included the matches we could support. Read the notes for any gaps.'],needs_clarification:['Your brief needs a little more detail.','The research couldn’t establish enough matches. Try a more specific service or a different best client.'],failed:['We couldn’t finish this research.','Please start a new request or come back to this link to check again.']};
function csvCell(value){let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
function downloadReport(companies){const rows=[['Company','Website','Why they fit','Finding','Observation','Source','Quote','Checked at','Agency help','Contact','Role','LinkedIn','Role source','Business email','Email status','Verified at','Message'],...companies.map(c=>[c.name,c.website,c.fit,c.finding?.title,c.finding?.observation,c.finding?.source_url,c.finding?.quote,c.finding?.checked_at,c.finding?.agency_help,c.contact?.name,c.contact?.role,c.contact?.linkedin_url,c.contact?.source_url,c.contact?.email_status==='verified'?c.contact?.email:'',c.contact?.email_status,c.contact?.verified_at,c.message])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='target-company-shortlist.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function DisplayDate({value}){const date=new Date(value);return value&&!isNaN(date)?<time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}</time>:null}
function Company({company,index}){const [copyStatus,setCopyStatus]=useState('');const finding=company.finding||{},contact=company.contact||{};async function copy(){try{await navigator.clipboard.writeText(company.message);setCopyStatus('Copied.')}catch{setCopyStatus('Couldn’t copy. Select the message to copy it.')}}return <article className="live-company" id={'company-'+index}>
 <div className="live-company-heading"><span className="eyebrow">Company {index+1}</span><h2>{company.name}</h2><Link url={company.website}>Company website</Link></div>
 <section className="live-detail"><h3>Why they fit</h3><p>{company.fit}</p>{company.fit_sources?.length>0&&<ul className="source-list">{company.fit_sources.map((source,i)=><li key={i}>{source.quote&&<blockquote>{source.quote}</blockquote>}<Link url={source.url}>Check source</Link></li>)}</ul>}</section>
 <section className="live-detail"><p className="eyebrow">What we observed</p><h3>{finding.title||'Research finding'}</h3><p>{finding.observation}</p>{finding.quote&&<blockquote>{finding.quote}</blockquote>}<div className="source-meta"><Link url={finding.source_url}>Check the evidence</Link>{finding.checked_at&&<span>Checked <DisplayDate value={finding.checked_at}/></span>}</div>{finding.agency_help&&<div className="help-note"><h3>What you could help with</h3><p>{finding.agency_help}</p></div>}<p className="note">This observation gives you a reason to ask a question. It does not establish buying intent.</p></section>
 <section className="live-detail"><h3>Who to contact</h3>{contact.name?<><p className="contact-name">{contact.name}</p><p>{contact.role}</p><div className="source-meta"><Link url={contact.linkedin_url}>LinkedIn profile</Link><Link url={contact.source_url}>Role source</Link></div></>:<p>We couldn’t verify a relevant contact for this company.</p>}{contact.email&&contact.email_status==='verified'?<p className="verified-email">{contact.email}<span>Verified business email{contact.verified_at&&<> · <DisplayDate value={contact.verified_at}/></>}</span></p>:<p className="note">No verified business email found.</p>}</section>
 {company.message&&<section className="live-detail"><h3>Your first message</h3><p className="live-message">{company.message}</p><button className="button outline" onClick={copy}>Copy message <span aria-hidden="true">↗</span></button><span className="copy-status" role="status">{copyStatus}</span><p className="note">Check the source and edit the draft before sending.</p></section>}
 </article>}
export function LiveReport({token}){
 const [report,setReport]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let alive=true,timer;const controller=new AbortController();async function load(){try{const response=await fetch(endpoint+'?token='+encodeURIComponent(token),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]),cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.message||'We couldn’t load this report. Please try again.');if(!states[data.status])throw new Error('We couldn’t read this report. Please try again.');if(!alive)return;setReport(data);setError('');if(['queued','researching'].includes(data.status))timer=setTimeout(load,6000)}catch(err){if(alive&&err.name!=='AbortError')setError(err.name==='TimeoutError'?'Loading took too long. Please try again.':err instanceof TypeError?'Couldn’t connect. Check your connection and try again.':err.message)}}load();return()=>{alive=false;clearTimeout(timer);controller.abort()}},[token,attempt]);
 const waiting=report&&['queued','researching'].includes(report.status),companies=Array.isArray(report?.companies)?report.companies:[],state=states[report?.status]||['Opening your report…',''];
 return <main className="shell live-report"><section className="report-intro"><p className="eyebrow">Your target-company shortlist</p><h1 aria-live="polite">{state[0]}</h1><p>{state[1]}</p></section>
 {error&&<div className="report-status report-error" role="alert"><p>{error}</p><button className="button outline" onClick={()=>{setError('');setAttempt(attempt+1)}}>Try again</button></div>}
 {waiting&&<div className="report-status" role="status"><span className="research-indicator" aria-hidden="true"/><div><strong>{report.status==='queued'?'Request received':'Research in progress'}</strong><p>Save this link to return to your report. This page refreshes as the research progresses.</p></div></div>}
 {report?.summary&&<div className="report-summary"><h2>Research notes</h2><p>{report.summary}</p></div>}
 {report&&!waiting&&<div className="report-delivery"><p className="note">{report.email_status==='sent'?'The report email has been sent.':report.email_status==='failed'?'We couldn’t send the report email. You can save or download your report here.':'Your report is available here. Email delivery has not been confirmed.'}</p>{report.completed_at&&<p className="note">Research completed <DisplayDate value={report.completed_at}/></p>}</div>}
 {companies.length>0&&<><div className="report-toolbar"><p>{companies.length} {companies.length===1?'company':'companies'} in your shortlist</p><button className="button outline" onClick={()=>downloadReport(companies)}>Download CSV ↓</button></div>{companies.map((company,i)=><Company key={company.website||i} company={company} index={i}/>)}</>}
 {report&&!waiting&&companies.length===0&&<div className="report-status"><p>No supported company matches are available for this brief.</p><a className="button primary" href="resource.html#signup">Update your brief →</a></div>}
 <section className="closing"><div><h2>Want us to run LinkedIn<br/>for your agency?</h2><p>We create content and handle outreach to the buyers you want.</p></div><a className="button primary" href="https://inboundonsteroids.com/start" target="_blank" rel="noopener noreferrer">See how we work ↗</a></section></main>
}
