import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import './style.css';

const supabase=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const statuses=['Novo','Em contato','Em negociação','Proposta','Follow-up','Sem interesse','Fechado','Perdido'];

function App(){
 const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[team,setTeam]=useState([]),[clients,setClients]=useState([]);
 const [activities,setActivities]=useState([]),[tab,setTab]=useState('dashboard'),[loading,setLoading]=useState(true);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[authMsg,setAuthMsg]=useState(''),[saving,setSaving]=useState(false);
 const [reportMonth,setReportMonth]=useState(new Date().toISOString().slice(0,7)),[reportSeller,setReportSeller]=useState('');
 const [editingSeller,setEditingSeller]=useState(null),[sellerName,setSellerName]=useState(''),[sellerGoal,setSellerGoal]=useState(''),[sellerWhatsapp,setSellerWhatsapp]=useState('');
  const [signupMode,setSignupMode]=useState(false),[signup,setSignup]=useState({name:'',email:'',phone:'',whatsapp_number:'',password:''}),[signupMsg,setSignupMsg]=useState('');
  const [pendingSignups,setPendingSignups]=useState([]);
 const [form,setForm]=useState({client_name:'',phone:'',seller_id:'',interest:'',desired_value:'',status:'Novo',next_contact_at:'',notes:''});

 async function load(){
  const {data:{session}}=await supabase.auth.getSession();setSession(session);
  if(!session){setLoading(false);return}
  const p=await supabase.from('sales_user_profiles').select('*').eq('user_id',session.user.id).maybeSingle();setProfile(p.data);
  const t=await supabase.from('sales_team_members').select('*').eq('active',true).order('name');setTeam(t.data||[]);
  const c=await supabase.from('sales_clients').select('*').order('created_at',{ascending:false});setClients(c.data||[]);
  const a=await supabase.from('sales_daily_activity').select('*').order('activity_date');setActivities(a.data||[]);
   if(p.data?.role==='admin'){
    const {data:pendingData,error:pendingError}=await supabase.functions.invoke('manage-seller',{body:{action:'list_pending'}});
    if(!pendingError && pendingData?.ok) setPendingSignups(pendingData.requests||[]);
    else setPendingSignups([]);
   }else setPendingSignups([]);
  setLoading(false);
 }
 useEffect(()=>{load();const {data}=supabase.auth.onAuthStateChange(()=>load());return()=>data.subscription.unsubscribe()},[]);
 useEffect(()=>{if(!session)return;const ch=supabase.channel('sales-live').on('postgres_changes',{event:'*',schema:'public',table:'sales_clients'},()=>load()).on('postgres_changes',{event:'*',schema:'public',table:'sales_daily_activity'},()=>load()).subscribe();return()=>supabase.removeChannel(ch)},[session]);

 async function login(e){e.preventDefault();setAuthMsg('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setAuthMsg(error.message)}
 async function signout(){await supabase.auth.signOut()}
  async function submitSignup(e){
   e.preventDefault();setSignupMsg('');
   const {data,error}=await supabase.functions.invoke('manage-seller',{body:{action:'signup',...signup,name:signup.name.trim(),email:signup.email.trim().toLowerCase(),phone:signup.phone.trim(),whatsapp_number:signup.whatsapp_number.trim()}});
   if(error||!data?.ok){setSignupMsg(data?.error||error?.message||'Não foi possível enviar o cadastro.');return}
   setSignupMsg('Cadastro enviado! Aguarde a aprovação do administrador.');
   setSignup({name:'',email:'',phone:'',whatsapp_number:'',password:''});
  }
  async function reviewSignup(id,status){
   const action=status==='approved'?'approve':'reject';
   const {data,error}=await supabase.functions.invoke('manage-seller',{body:{action,request_id:id}});
   if(error||!data?.ok){alert(data?.error||error?.message||'Não foi possível atualizar o cadastro.');return}
   load();
  }
 async function saveClient(e){
  e.preventDefault();setSaving(true);
  const payload={...form,desired_value:form.desired_value?Number(form.desired_value):null,next_contact_at:form.next_contact_at||null};
  const {error}=await supabase.from('sales_clients').insert(payload);setSaving(false);
  if(error){alert(error.message);return}setForm({client_name:'',phone:'',seller_id:'',interest:'',desired_value:'',status:'Novo',next_contact_at:'',notes:''});setTab('clients');load();
 }
 async function saveSeller(e){
  e.preventDefault();
  if(!editingSeller)return;
  const name=sellerName.trim();
  if(!name)return;
  const {error}=await supabase.from('sales_team_members').update({name,monthly_goal:Number(sellerGoal||0),whatsapp_number:sellerWhatsapp.trim()}).eq('id',editingSeller);
  if(error){alert(error.message);return}
  setEditingSeller(null);setSellerName('');setSellerGoal('');setSellerWhatsapp('');load();
 }
 async function toggleSeller(id,active){
  const {error}=await supabase.from('sales_team_members').update({active}).eq('id',id);
  if(error){alert(error.message);return}load();
 }

 async function saveActivity(day,field,value){
  const sellerId=profile?.role==='admin'?(reportSeller||team[0]?.id):profile?.team_member_id;if(!sellerId)return;
  const date=`${reportMonth}-${String(day).padStart(2,'0')}`,current=activities.find(a=>a.activity_date===date&&a.seller_id===sellerId);
  const payload={activity_date:date,seller_id:sellerId};['ads','calls','appointments','attendances'].forEach(k=>payload[k]=Number(current?.[k]||0));payload[field]=Math.max(0,Number(value||0));
  if(current)await supabase.from('sales_daily_activity').update({...payload,updated_at:new Date().toISOString()}).eq('id',current.id);
  else await supabase.from('sales_daily_activity').insert(payload);
  const {data}=await supabase.from('sales_daily_activity').select('*').order('activity_date');setActivities(data||[]);
 }
 const stats=useMemo(()=>{const sold=clients.filter(c=>c.status==='Fechado');return{clients:clients.length,neg:clients.filter(c=>c.status==='Em negociação').length,proposals:clients.filter(c=>c.status==='Proposta').length,sales:sold.length,value:sold.reduce((a,c)=>a+Number(c.sold_value||0),0)}},[clients]);
 const ranking=useMemo(()=>team.map(t=>({...t,count:clients.filter(c=>c.seller_id===t.id).length,sales:clients.filter(c=>c.seller_id===t.id&&c.status==='Fechado').length,value:clients.filter(c=>c.seller_id===t.id).reduce((a,c)=>a+Number(c.sold_value||0),0)})).sort((a,b)=>b.value-a.value),[team,clients]);

 if(loading)return <div className="center">Carregando TR Representações...</div>;
 if(!session)return <div className="login"><div className="login-card"><div className="logo">TR</div><h1>TR Representações</h1>{!signupMode?<><p>Gestão comercial da sua equipe</p><form onSubmit={login}><input placeholder="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><input placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><button>Entrar</button>{authMsg&&<small>{authMsg}</small>}</form><button className="secondary" onClick={()=>{setSignupMode(true);setAuthMsg('')}}>Criar cadastro de vendedor</button></>:<><p>Solicite seu acesso ao CRM</p><form onSubmit={submitSignup}><input placeholder="Nome completo" value={signup.name} onChange={e=>setSignup({...signup,name:e.target.value})} required/><input placeholder="E-mail" type="email" value={signup.email} onChange={e=>setSignup({...signup,email:e.target.value})} required/><input placeholder="Telefone" value={signup.phone} onChange={e=>setSignup({...signup,phone:e.target.value})}/><input placeholder="WhatsApp" value={signup.whatsapp_number} onChange={e=>setSignup({...signup,whatsapp_number:e.target.value})}/><input placeholder="Senha desejada" type="password" value={signup.password} onChange={e=>setSignup({...signup,password:e.target.value})} required/><small>A senha será usada para o acesso do vendedor após a aprovação.</small><button>Enviar cadastro</button>{signupMsg&&<small>{signupMsg}</small>}</form><button className="secondary" onClick={()=>setSignupMode(false)}>Voltar para entrar</button></>}</div></div>;
 if(!profile)return <div className="center"><div><h2>Acesso ainda não configurado</h2><button onClick={signout}>Sair</button></div></div>;

 return <div className="app"><aside><div className="brand"><b>TR</b><span>Representações</span></div>
 {['dashboard','clients','ranking','report','team','pending','new'].map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x==='dashboard'?'📊 Dashboard':x==='clients'?'👥 Clientes':x==='ranking'?'🏆 Ranking':x==='report'?'📅 Relatório diário':x==='team'?'👨‍💼 Equipe':x==='pending'?'🟡 Aprovações':'➕ Novo cliente'}</button>)}
 <div className="user"><strong>{profile.role==='admin'?'Administrador':(team.find(t=>t.id===profile.team_member_id)?.name||'Vendedor')}</strong><button onClick={signout}>Sair</button></div></aside>
 <main><header><div><h1>{tab==='dashboard'?'Dashboard':tab==='clients'?'Clientes':tab==='ranking'?'Ranking':tab==='report'?'Relatório diário':tab==='team'?'Equipe':tab==='pending'?'Aprovações':'Novo cliente'}</h1><span>Atualização em tempo real</span></div></header>
 {tab==='dashboard'&&<><section className="cards"><Card t="Clientes" v={stats.clients}/><Card t="Negociação" v={stats.neg}/><Card t="Propostas" v={stats.proposals}/><Card t="Vendas" v={stats.sales}/><Card t="Valor vendido" v={money(stats.value)}/></section><section className="panel"><h2>🏆 Ranking</h2><Table rows={ranking}/></section></>}
 {tab==='ranking'&&<section className="panel"><h2>Ranking da equipe</h2><Table rows={ranking}/></section>}
 {tab==='clients'&&<section className="panel"><div className="toolbar"><input placeholder="Buscar cliente..."/><button onClick={()=>setTab('new')}>+ Novo cliente</button></div><div className="client-list">{clients.map(c=><div className="client" key={c.id}><div><strong>{c.client_name}</strong><span>{c.phone||'Sem telefone'} · {team.find(t=>t.id===c.seller_id)?.name||'—'}</span>{team.find(t=>t.id===c.seller_id)?.whatsapp_number&&<a className="wa-client" href={`https://wa.me/${String(team.find(t=>t.id===c.seller_id).whatsapp_number).replace(/\D/g,'')}`} target="_blank" rel="noreferrer">💬 WhatsApp do vendedor</a>}</div><div><b>{c.status}</b><small>{c.next_contact_at?new Date(c.next_contact_at).toLocaleDateString('pt-BR'):''}</small></div></div>)}</div></section>}
 {tab==='team'&&profile.role==='admin'&&<section className="panel team-panel"><div className="team-head"><div><h2>👨‍💼 Equipe</h2><p>Altere nomes, metas e ative/desative vendedores sem mexer no GitHub.</p></div></div>
 <div className="team-list">{team.map(t=><div className="team-row" key={t.id}><div className="team-avatar">{t.name.slice(0,1).toUpperCase()}</div><div className="team-info"><strong>{t.name}</strong><small>Meta: {money(t.monthly_goal)} · {t.active?'Ativo':'Inativo'}</small>{t.whatsapp_number&&<a className="wa-link" href={`https://wa.me/${String(t.whatsapp_number).replace(/\D/g,'')}`} target="_blank" rel="noreferrer">💬 {t.whatsapp_number}</a>}</div><button className="secondary" onClick={()=>{setEditingSeller(t.id);setSellerName(t.name);setSellerGoal(t.monthly_goal||0);setSellerWhatsapp(t.whatsapp_number||'')}}>✏️ Editar</button><button className={t.active?'danger secondary':'secondary'} onClick={()=>toggleSeller(t.id,!t.active)}>{t.active?'Desativar':'Ativar'}</button></div>)}</div>
 {editingSeller&&<div className="modal-backdrop"><form className="modal" onSubmit={saveSeller}><h3>Editar vendedor</h3><label>Nome<input value={sellerName} onChange={e=>setSellerName(e.target.value)} required/></label><label>Meta mensal<input type="number" value={sellerGoal} onChange={e=>setSellerGoal(e.target.value)} min="0"/></label><label>WhatsApp do vendedor<input placeholder="5515999999999" value={sellerWhatsapp} onChange={e=>setSellerWhatsapp(e.target.value)}/><small className="hint">Use DDI + DDD + número. Ex.: 5515999999999</small></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setEditingSeller(null)}>Cancelar</button><button>Salvar alterações</button></div></form></div>}
 </section>}
 {tab==='report'&&<DailyReport team={team} activities={activities} month={reportMonth} setMonth={setReportMonth} seller={reportSeller} setSeller={setReportSeller} profile={profile} onSave={saveActivity}/>}
 {tab==='new'&&<section className="panel form"><form onSubmit={saveClient}><div className="grid"><label>Cliente<input value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})} required/></label><label>Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Vendedor<select value={form.seller_id} onChange={e=>setForm({...form,seller_id:e.target.value})} required><option value="">Selecione</option>{team.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label>Interesse<input value={form.interest} onChange={e=>setForm({...form,interest:e.target.value})}/></label><label>Valor desejado<input type="number" value={form.desired_value} onChange={e=>setForm({...form,desired_value:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Próximo contato<input type="datetime-local" value={form.next_contact_at} onChange={e=>setForm({...form,next_contact_at:e.target.value})}/></label><label>Observações<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div><button disabled={saving}>{saving?'Salvando...':'Salvar cliente'}</button></form></section>}
 </main></div>
}
function DailyReport({team,activities,month,setMonth,seller,setSeller,profile,onSave}){
 const sellerId=profile?.role==='admin'?(seller||team[0]?.id||''):profile?.team_member_id;
 const rows=Array.from({length:31},(_,i)=>{const day=i+1,date=`${month}-${String(day).padStart(2,'0')}`;const a=activities.find(x=>x.activity_date===date&&x.seller_id===sellerId)||{};return{day,...a}});
 const totals=['ads','calls','appointments','attendances'].reduce((o,k)=>(o[k]=rows.reduce((s,r)=>s+Number(r[k]||0),0),o),{});
 return <section className="panel report"><div className="report-head"><div><h2>📅 Relatório de atividades</h2><p>Dia 01 ao 31 — anúncios, ligações, agendamentos e atendimentos.</p></div><div className="report-filters"><label>Mês<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>{profile?.role==='admin'&&<label>Vendedor<select value={sellerId} onChange={e=>setSeller(e.target.value)}>{team.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>}</div></div><div className="totals"><Card t="Anúncios" v={totals.ads}/><Card t="Ligações" v={totals.calls}/><Card t="Agendamentos" v={totals.appointments}/><Card t="Atendimentos" v={totals.attendances}/></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Dia</th><th>Anúncios</th><th>Ligações</th><th>Agendamentos</th><th>Atendimentos</th></tr></thead><tbody>{rows.map(r=><tr key={r.day}><td>{String(r.day).padStart(2,'0')}</td>{['ads','calls','appointments','attendances'].map(f=><td key={f}><input type="number" min="0" value={r[f]??0} onChange={e=>onSave(r.day,f,e.target.value)}/></td>)}</tr>)}</tbody><tfoot><tr><th>Total</th><th>{totals.ads}</th><th>{totals.calls}</th><th>{totals.appointments}</th><th>{totals.attendances}</th></tr></tfoot></table></div></section>
}
function Card({t,v}){return <div className="card"><span>{t}</span><strong>{v}</strong></div>}
function Table({rows}){return <div className="ranking">{rows.map((r,i)=><div className="rank" key={r.id}><span className="pos">{i+1}º</span><div><strong>{r.name}</strong><small>{r.count} clientes · {r.sales} vendas</small></div><b>{money(r.value)}</b></div>)}</div>}
createRoot(document.getElementById('root')).render(<App/>);
