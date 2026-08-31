import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(url, key);

const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const statuses = ['Novo','Em contato','Em negociação','Proposta','Follow-up','Sem interesse','Fechado','Perdido'];

function App(){
  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [team,setTeam]=useState([]);
  const [clients,setClients]=useState([]);
  const [tab,setTab]=useState('dashboard');
  const [loading,setLoading]=useState(true);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [authMsg,setAuthMsg]=useState('');
  const [form,setForm]=useState({client_name:'',phone:'',seller_id:'',interest:'',desired_value:'',status:'Novo',next_contact_at:'',notes:''});
  const [saving,setSaving]=useState(false);

  async function load(){
    const {data:{session}}=await supabase.auth.getSession();
    setSession(session);
    if(!session){setLoading(false);return;}
    const p=await supabase.from('sales_user_profiles').select('*').eq('user_id',session.user.id).maybeSingle();
    setProfile(p.data);
    const t=await supabase.from('sales_team_members').select('*').eq('active',true).order('name');
    setTeam(t.data||[]);
    const c=await supabase.from('sales_clients').select('*').order('created_at',{ascending:false});
    setClients(c.data||[]);
    setLoading(false);
  }
  useEffect(()=>{load(); const {data}=supabase.auth.onAuthStateChange(()=>load()); return()=>data.subscription.unsubscribe()},[]);

  useEffect(()=>{
    if(!session)return;
    const ch=supabase.channel('sales-live').on('postgres_changes',{event:'*',schema:'public',table:'sales_clients'},()=>load()).subscribe();
    return()=>supabase.removeChannel(ch);
  },[session]);

  async function login(e){
    e.preventDefault(); setAuthMsg('');
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error)setAuthMsg(error.message);
  }
  async function saveClient(e){
    e.preventDefault(); setSaving(true);
    const payload={...form,desired_value:form.desired_value?Number(form.desired_value):null,next_contact_at:form.next_contact_at||null};
    const {error}=await supabase.from('sales_clients').insert(payload);
    setSaving(false);
    if(error){alert(error.message);return;}
    setForm({client_name:'',phone:'',seller_id:profile?.team_member_id||'',interest:'',desired_value:'',status:'Novo',next_contact_at:'',notes:''});
    setTab('clients');
    load();
  }
  async function updateStatus(id,status){
    await supabase.from('sales_clients').update({status,updated_at:new Date().toISOString()}).eq('id',id);
    load();
  }
  async function signout(){await supabase.auth.signOut();}

  const visible=clients;
  const stats=useMemo(()=>{
    const sold=visible.filter(c=>c.status==='Fechado');
    return {clients:visible.length,neg:visible.filter(c=>c.status==='Em negociação').length,proposals:visible.filter(c=>c.status==='Proposta').length,sales:sold.length,value:sold.reduce((a,c)=>a+Number(c.sold_value||0),0)}
  },[visible]);

  const ranking=useMemo(()=>team.map(t=>({...t,count:visible.filter(c=>c.seller_id===t.id).length,sales:visible.filter(c=>c.seller_id===t.id&&c.status==='Fechado').length,value:visible.filter(c=>c.seller_id===t.id).reduce((a,c)=>a+Number(c.sold_value||0),0)})).sort((a,b)=>b.value-a.value),[team,visible]);

  if(loading)return <div className="center">Carregando TR Representações...</div>;
  if(!session)return <div className="login"><div className="login-card"><div className="logo">TR</div><h1>TR Representações</h1><p>Gestão comercial da sua equipe</p><form onSubmit={login}><input placeholder="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><input placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><button>Entrar</button>{authMsg&&<small>{authMsg}</small>}</form><div className="hint">O usuário precisa ser criado no Supabase Auth e vinculado a um vendedor.</div></div></div>;

  if(!profile)return <div className="center"><div><h2>Acesso ainda não configurado</h2><p>Seu login existe, mas ainda não foi vinculado a um vendedor ou administrador.</p><button onClick={signout}>Sair</button></div></div>;

  return <div className="app">
    <aside><div className="brand"><b>TR</b><span>Representações</span></div>
      {['dashboard','clients','ranking','new'].map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x==='dashboard'?'📊 Dashboard':x==='clients'?'👥 Clientes':x==='ranking'?'🏆 Ranking':'➕ Novo cliente'}</button>)}
      <div className="user"><strong>{profile.role==='admin'?'Administrador':(team.find(t=>t.id===profile.team_member_id)?.name||'Vendedor')}</strong><button onClick={signout}>Sair</button></div>
    </aside>
    <main><header><div><h1>{tab==='dashboard'?'Dashboard':tab==='clients'?'Clientes':tab==='ranking'?'Ranking':'Novo cliente'}</h1><span>Atualização em tempo real</span></div></header>
      {tab==='dashboard'&&<><section className="cards"><Card t="Clientes" v={stats.clients}/><Card t="Negociação" v={stats.neg}/><Card t="Propostas" v={stats.proposals}/><Card t="Vendas" v={stats.sales}/><Card t="Valor vendido" v={money(stats.value)}/></section><section className="panel"><h2>🏆 Ranking</h2><Table rows={ranking}/></section></>}
      {tab==='ranking'&&<section className="panel"><h2>Ranking da equipe</h2><Table rows={ranking}/></section>}
      {tab==='clients'&&<section className="panel"><div className="toolbar"><input placeholder="Buscar cliente..." onChange={e=>{}}/><button onClick={()=>setTab('new')}>+ Novo cliente</button></div><div className="client-list">{visible.map(c=><div className="client" key={c.id}><div><strong>{c.client_name}</strong><span>{c.phone||'Sem telefone'} · {team.find(t=>t.id===c.seller_id)?.name||'—'}</span></div><div><b>{c.status}</b><small>{c.next_contact_at?new Date(c.next_contact_at).toLocaleDateString('pt-BR'):''}</small></div></div>)}</div></section>}
      {tab==='new'&&<section className="panel form"><form onSubmit={saveClient}><div className="grid"><label>Cliente<input value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})} required/></label><label>Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Vendedor<select value={form.seller_id} onChange={e=>setForm({...form,seller_id:e.target.value})} required><option value="">Selecione</option>{team.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label>Interesse<input value={form.interest} onChange={e=>setForm({...form,interest:e.target.value})}/></label><label>Valor desejado<input type="number" value={form.desired_value} onChange={e=>setForm({...form,desired_value:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><label>Próximo contato<input type="datetime-local" value={form.next_contact_at} onChange={e=>setForm({...form,next_contact_at:e.target.value})}/></label><label>Observações<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div><button disabled={saving}>{saving?'Salvando...':'Salvar cliente'}</button></form></section>}
    </main>
  </div>
}
function Card({t,v}){return <div className="card"><span>{t}</span><strong>{v}</strong></div>}
function Table({rows}){return <div className="ranking">{rows.map((r,i)=><div className="rank" key={r.id}><span className="pos">{i+1}º</span><div><strong>{r.name}</strong><small>{r.count} clientes · {r.sales} vendas</small></div><b>{money(r.value)}</b></div>)}</div>}
createRoot(document.getElementById('root')).render(<App/>);