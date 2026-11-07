'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Building2, Bell, Check, CreditCard, ClipboardList, ExternalLink, Globe2, LayoutDashboard, MessageCircle, Pencil, Plus, RefreshCw, Search, Trash2, UserRound, X, XCircle, Menu, ChevronLeft } from 'lucide-react'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xmwkakimyifmspzoziji.supabase.co', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Ulvr8RljdGaSS1dqlBijkg_vIC4wT4C')
type Company = { id: string; name: string; slug: string; contact_name: string; contact_email: string; contact_phone: string | null; status: string; max_properties: number; max_photos_per_property: number; created_at: string }
type Subscription = { company_id: string; plan_name: string; monthly_price: number; property_limit: number; photo_limit: number; status: string }
type PublicLead = { id: string; company_id: string | null; contact_name: string; email: string | null; phone: string | null; interest: string | null; message: string | null; status: string; source: string | null; source_url: string | null; converted_company_id: string | null; created_at: string }
type LeadAlert = { id: string; title: string; message: string; status: string; created_at: string; lead_request_id: string | null; company_id: string | null; request_id?: string | null; entity_type?: string | null; action?: string | null }
type BrokerRequest = { id: string; company_id: string; contact_name: string; email: string | null; phone: string | null; request_type: string; subject: string; message: string | null; status: string; source: string | null; created_at: string; assigned_to: string | null; created_by?: string | null; company_name?: string | null; admin_response?: string | null; responded_at?: string | null }
type CatalogRequest = { id: string; entity_type: 'developer' | 'condominium'; action: 'create' | 'update' | 'delete'; company_id: string; requested_by: string; requester_name?: string | null; requester_email?: string | null; company_name?: string | null; record_id: string | null; current_data: Record<string, unknown> | null; proposed_data: Record<string, unknown>; created_at: string; status: string }
type FormState = { name: string; slug: string; contact_name: string; contact_email: string; contact_phone: string; account_status: string; subscription_status: string; monthly_price: string; property_limit: string; photo_limit: string }
const statusLabel: Record<string, string> = { pending: 'Pendente', active: 'Ativa', suspended: 'Suspensa', cancelled: 'Cancelada', trial: 'Teste', past_due: 'Inadimplente' }
const money = (value: number | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
const emptyForm: FormState = { name: '', slug: '', contact_name: '', contact_email: '', contact_phone: '', account_status: 'pending', subscription_status: 'trial', monthly_price: '100', property_limit: '100', photo_limit: '35' }

export default function Page() {
  const [session, setSession] = useState(false), [loading, setLoading] = useState(true), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false), [profileName, setProfileName] = useState('V'), [requests, setRequests] = useState<CatalogRequest[]>([]), [notificationsOpen, setNotificationsOpen] = useState(false), [decisionNote, setDecisionNote] = useState(''), [view, setView] = useState('overview'), [companies, setCompanies] = useState<Company[]>([]), [subscriptions, setSubscriptions] = useState<Subscription[]>([]), [brokerRequests, setBrokerRequests] = useState<BrokerRequest[]>([]), [search, setSearch] = useState(''), [modal, setModal] = useState(false), [editingCompany, setEditingCompany] = useState<Company | null>(null), [saving, setSaving] = useState(false), [notice, setNotice] = useState(''), [form, setForm] = useState<FormState>(emptyForm), [alertRows, setAlertRows] = useState<LeadAlert[]>([]), [alertOpen, setAlertOpen] = useState(false), [adminUserId, setAdminUserId] = useState(''), [publicLeads, setPublicLeads] = useState<PublicLead[]>([]), [leadStatusDraft, setLeadStatusDraft] = useState<Record<string,string>>({}), [brokerReplyDraft, setBrokerReplyDraft] = useState<Record<string,string>>({}), [replySavingId, setReplySavingId] = useState('')
  async function loadData() { setNotice('Atualizando dados...'); const [c, s, q, br] = await Promise.all([supabase.from('crm_companies').select('*').order('created_at', { ascending: false }), supabase.from('crm_subscriptions').select('*').order('created_at', { ascending: false }), supabase.from('crm_catalog_change_requests').select('*').eq('status','pending').order('created_at',{ascending:false}), supabase.from('crm_requests').select('*').order('created_at',{ascending:false})]); if (c.error || s.error) { setNotice('Não foi possível carregar os dados.'); return } setCompanies(c.data || []); setSubscriptions(s.data || []); if (!br.error) { const companyNames = new Map((c.data || []).map((company: Company) => [company.id, company.name])); setBrokerRequests(((br.data || []) as BrokerRequest[]).map(item => ({...item, company_name: companyNames.get(item.company_id) || 'Imobiliária'}))) }
    const catalogRequests = (q.data || []) as CatalogRequest[]
    const requesterIds = [...new Set(catalogRequests.map(item => item.requested_by).filter(Boolean))]
    const [profilesResult, companiesResult] = await Promise.all([
      requesterIds.length ? supabase.from('profiles').select('id,full_name').in('id', requesterIds) : Promise.resolve({ data: [] as {id:string;full_name:string|null}[] }),
      supabase.from('crm_companies').select('id,name,contact_name,contact_email')
    ])
    const profiles = new Map((profilesResult.data || []).map((profile: {id:string;full_name:string|null}) => [profile.id, profile.full_name]))
    const companyMap = new Map((companiesResult.data || []).map((company: {id:string;name:string;contact_name:string|null;contact_email:string|null}) => [company.id, company]))
    setRequests(catalogRequests.map(item => {
      const company = companyMap.get(item.company_id)
      return { ...item, requester_name: profiles.get(item.requested_by) || company?.contact_name || null, requester_email: company?.contact_email || null, company_name: company?.name || null }
    }))
    setNotice('Dados atualizados agora.') }
  useEffect(() => { (async () => { const { data: { session: current } } = await supabase.auth.getSession(); if (!current) { setLoading(false); return } const { data: profile } = await supabase.from('profiles').select('full_name,role').eq('id', current.user.id).maybeSingle(); if (profile?.role !== 'admin') { await supabase.auth.signOut(); setError('Esta conta não possui permissão de administrador.'); setLoading(false); return } setProfileName((profile.full_name || current.user.email || 'V').charAt(0).toUpperCase()); setAdminUserId(current.user.id); setSession(true); await loadData(); await loadLeadAlerts(current.user.id); setLoading(false) })() }, [])
  const subs = useMemo(() => new Map(subscriptions.map(s => [s.company_id, s])), [subscriptions])
  const filtered = companies.filter(c => [c.name, c.slug, c.contact_name, c.contact_email].some(v => String(v || '').toLowerCase().includes(search.toLowerCase()))).filter(c => view !== 'subscriptions' || subs.has(c.id))
  const totals = { active: subscriptions.filter(s => s.status === 'active').length, mrr: subscriptions.filter(s => s.status === 'active').reduce((sum, s) => sum + Number(s.monthly_price || 0), 0) }
  const title = { leads: ['Leads', 'Todos os contatos recebidos pelos sites dos clientes.'], overview: ['Visão geral', 'Clientes, planos e estrutura da plataforma.'], clients: ['Clientes', 'Cadastre e acompanhe as empresas que usam o Versus CRM.'], subscriptions: ['Assinaturas', 'Consulte plano, preço, limites e situação das assinaturas.'], domains: ['Sites e domínios', 'Prepare os endereços de cada cliente.'], catalog: ['Solicitações', 'Revise pedidos de cadastro, alteração e exclusão enviados pelas imobiliárias.'] }[view as 'overview' | 'clients' | 'subscriptions' | 'domains' | 'leads'] || ['Leads','Consulte os contatos recebidos pelos sites.']
  async function loadPublicLeads() { setNotice('Consultando leads...'); const { data, error } = await supabase.from('crm_leads').select('id,company_id,contact_name,email,phone,interest,message,status,source,source_url,converted_company_id,created_at').order('created_at',{ascending:false}); if(error){setNotice('Não foi possível consultar a tabela crm_leads.');return} setPublicLeads((data||[]) as PublicLead[]); setNotice(`${(data||[]).filter((lead: PublicLead) => lead.status !== 'converted').length} leads encontrados.`) }
  async function updateLeadStatus(lead: PublicLead, status: string) { const { error } = await supabase.from('crm_leads').update({status,updated_at:new Date().toISOString()}).eq('id',lead.id); if(error){setNotice('Não foi possível atualizar o status do lead.');return} setPublicLeads(prev=>prev.map(row=>row.id===lead.id?{...row,status}:row));setNotice('Status do lead atualizado.') }
  async function convertLeadToClient(lead: PublicLead) {
    if (!lead.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) { setNotice('Este lead não possui e-mail válido para criar o acesso.'); return }
    if (lead.converted_company_id) { setNotice('Este lead já foi convertido em cliente.'); return }
    if (!window.confirm(`Converter ${lead.contact_name} em cliente? Será criado o site e o acesso ao painel com este e-mail: ${lead.email}`)) return
    setNotice('Criando cliente, site e acesso ao painel...')
    const { data: { session: current } } = await supabase.auth.getSession()
    if (!current?.access_token) { setNotice('Sessão administrativa expirou. Entre novamente.'); return }
    const name = lead.contact_name.trim()
    const slugBase = slugify(name)
    if (!slugBase) { setNotice('Não foi possível gerar o endereço do site a partir do nome do lead.'); return }
    const { data: existing, error: lookupError } = await supabase.from('crm_companies').select('slug')
    if (lookupError) { setNotice('Não foi possível verificar os sites existentes.'); return }
    const used = new Set((existing || []).map((row: {slug:string}) => row.slug))
    let slug = slugBase, suffix = 2
    while (used.has(slug)) slug = `${slugBase}-${suffix++}`
    const company = { name, slug, status: 'active', contact_name: name, contact_email: lead.email.trim().toLowerCase(), contact_phone: lead.phone, max_properties: 100, max_photos_per_property: 35 }
    const { data: createdCompany, error: companyError } = await supabase.from('crm_companies').insert(company).select().single()
    if (companyError || !createdCompany) { setNotice('Não foi possível criar o cliente: ' + (companyError?.message || 'erro inesperado')); return }
    const { error: subscriptionError } = await supabase.from('crm_subscriptions').insert({ company_id: createdCompany.id, plan_code: 'essencial', plan_name: 'Essencial', monthly_price: 100, property_limit: 100, photo_limit: 35, status: 'active' })
    if (subscriptionError) { await supabase.from('crm_companies').delete().eq('id',createdCompany.id); setNotice('Cliente criado parcialmente; falha ao criar assinatura. ' + subscriptionError.message); return }
    const response = await fetch('/api/admin/provision-client', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${current.access_token}`}, body:JSON.stringify({companyId:createdCompany.id,email:lead.email.trim().toLowerCase(),companyName:name}) })
    const provision = await response.json().catch(()=>({}))
    if (!response.ok) {
      await supabase.from('crm_subscriptions').delete().eq('company_id',createdCompany.id)
      await supabase.from('crm_companies').delete().eq('id',createdCompany.id)
      setNotice('Não foi possível criar o acesso. Cliente não foi concluído: ' + (provision.error || 'erro no provisionamento'))
      return
    }
    const { error: leadError } = await supabase.from('crm_leads').update({status:'converted',converted_company_id:createdCompany.id,updated_at:new Date().toISOString()}).eq('id',lead.id)
    if (leadError) { setNotice('Cliente e acesso criados, mas não foi possível atualizar o lead: ' + leadError.message); await loadData(); return }
    setPublicLeads(prev=>prev.map(row=>row.id===lead.id?{...row,status:'converted',converted_company_id:createdCompany.id}:row))
    setLeadStatusDraft(prev=>({...prev,[lead.id]:'converted'}))
    setNotice(provision.initialPassword ? `Lead convertido! Site: https://versuscrm.vercel.app/${slug} | Painel: https://versuscrm.vercel.app/${slug}/area-cliente | Login: ${provision.email} | Senha inicial: ${provision.initialPassword}. Oriente a troca após o primeiro acesso.` : `Lead convertido! Site: https://versuscrm.vercel.app/${slug} | Painel: https://versuscrm.vercel.app/${slug}/area-cliente | Login: ${provision.email}. A senha existente foi mantida.`)
    await loadData()
  }
  async function deleteLead(lead: PublicLead) { if (!window.confirm(`Excluir definitivamente o lead de ${lead.contact_name}?`)) return; const { error } = await supabase.from('crm_leads').delete().eq('id', lead.id); if (error) { setNotice('Não foi possível excluir o lead.'); return } setPublicLeads(prev => prev.filter(row => row.id !== lead.id)); setNotice('Lead excluído com sucesso.') }
  async function loadLeadAlerts(userId: string) { if (!userId) return; const { data, error } = await supabase.from('crm_user_notifications').select('id,title,message,status,created_at,lead_request_id,company_id,request_id,entity_type,action').eq('user_id',userId).order('created_at',{ascending:false}).limit(30); if (!error) setAlertRows((data || []) as LeadAlert[]) }
  async function markAlertRead(alert: LeadAlert) { if (alert.status !== 'read') { await supabase.from('crm_user_notifications').update({status:'read',read_at:new Date().toISOString()}).eq('id',alert.id).eq('user_id',adminUserId); setAlertRows(prev=>prev.map(row=>row.id===alert.id?{...row,status:'read'}:row)) } setAlertOpen(false); if (alert.entity_type === 'catalog_request' || alert.request_id || alert.entity_type === 'crm_request' || alert.action?.startsWith('view_request:')) { setView('catalog'); await loadData() } else { setView('leads'); await loadPublicLeads() } }
  async function decideCatalogRequest(item: CatalogRequest, decision: 'approved' | 'rejected') {
    const note = decision === 'rejected' ? window.prompt('Informe o motivo da rejeição (opcional):') : window.prompt('Observação para a imobiliária (opcional):')
    if (note === null) return
    const actionLabel = decision === 'approved' ? 'aprovar' : 'rejeitar'
    if (!window.confirm(`Confirma ${actionLabel} esta solicitação?`)) return
    const { data: { session: current } } = await supabase.auth.getSession()
    if (!current?.access_token) { setNotice('Sessão administrativa expirada. Entre novamente.'); return }
    setNotice('Processando decisão...')
    const response = await fetch('/api/admin/decide-catalog-request', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${current.access_token}`}, body:JSON.stringify({requestId:item.id,decision,note}) })
    const result = await response.json().catch(()=>({}))
    if (!response.ok) { setNotice(result.error || 'Não foi possível concluir a solicitação.'); return }
    setNotice(decision === 'approved' ? 'Solicitação aprovada e cadastro atualizado.' : 'Solicitação rejeitada. O solicitante será notificado.')
    await loadData()
    await loadLeadAlerts(adminUserId)
  }
  async function sendBrokerReply(item: BrokerRequest) {
    const message = (brokerReplyDraft[item.id] || '').trim()
    if (!message) { setNotice('Escreva a resposta antes de enviar.'); return }
    if (!window.confirm('Enviar resposta ao corretor?')) return
    setReplySavingId(item.id)
    const { data: { session: current } } = await supabase.auth.getSession()
    if (!current?.user?.id) { setNotice('Sessão administrativa expirada. Entre novamente.'); setReplySavingId(''); return }
    const { error: updateError } = await supabase.from('crm_requests').update({admin_response: message, responded_at: new Date().toISOString(), responded_by: current.user.id, status: 'resolved'}).eq('id', item.id)
    if (updateError) { setNotice('Não foi possível enviar a resposta: ' + updateError.message); setReplySavingId(''); return }
    setBrokerReplyDraft(prev => ({...prev,[item.id]:''}))
    setNotice('Resposta registrada. O corretor poderá visualizá-la na área de solicitações.')
    setReplySavingId('')
    await loadData()
  }
  async function login(e: FormEvent) { e.preventDefault(); setError(''); const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (loginError) { setError('Não foi possível entrar. Confira e-mail e senha.'); return } const { data: { session: current } } = await supabase.auth.getSession(); const { data: profile } = await supabase.from('profiles').select('full_name,role').eq('id', current?.user.id).maybeSingle(); if (profile?.role !== 'admin') { await supabase.auth.signOut(); setError('Esta conta não possui permissão de administrador.'); return } setProfileName((profile.full_name || email).charAt(0).toUpperCase()); setAdminUserId(current?.user.id || ''); setSession(true); await loadData(); if (current?.user.id) await loadLeadAlerts(current.user.id) }
  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) { setForm(prev => ({ ...prev, [key]: value })) }
  async function saveClient(e: FormEvent) {
    e.preventDefault()
    const name = form.name.trim(), contact = form.contact_name.trim(), contactEmail = form.contact_email.trim()
    let slug = slugify(name)
    if (!name || !contact || !contactEmail || !slug) { setNotice('Preencha os campos obrigatórios.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { setNotice('Informe um e-mail válido.'); return }
    const properties = Number(form.property_limit), photos = Number(form.photo_limit), price = Number(form.monthly_price)
    if (![properties, photos, price].every(Number.isFinite) || properties < 1 || photos < 1 || price < 0) { setNotice('Mensalidade e limites devem conter valores válidos.'); return }

    setSaving(true)
    if (editingCompany) {
      setNotice('Salvando alterações do cliente...')
      const { error: companyError } = await supabase.from('crm_companies').update({
        name,
        contact_name: contact,
        contact_email: contactEmail,
        contact_phone: form.contact_phone.trim() || null,
        status: form.account_status,
        max_properties: properties,
        max_photos_per_property: photos,
      }).eq('id', editingCompany.id)
      if (companyError) {
        setNotice('Não foi possível atualizar os dados do cliente: ' + companyError.message)
        setSaving(false)
        return
      }
      const { error: subscriptionError } = await supabase.from('crm_subscriptions').update({
        monthly_price: price,
        property_limit: properties,
        photo_limit: photos,
        status: form.subscription_status,
      }).eq('company_id', editingCompany.id)
      if (subscriptionError) {
        setNotice('Os dados do cliente foram atualizados, mas houve erro ao atualizar a assinatura: ' + subscriptionError.message)
        setSaving(false)
        await loadData()
        return
      }
      setModal(false)
      setEditingCompany(null)
      setForm(emptyForm)
      setNotice('Cliente e assinatura atualizados com sucesso.')
      setSaving(false)
      await loadData()
      return
    }
    setNotice('Criando empresa e assinatura...')
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (!currentSession?.access_token) {
      setNotice('Sua sessão administrativa expirou. Entre novamente e tente de novo.')
      setSaving(false)
      return
    }

    const { data: existingSlugs, error: slugsError } = await supabase.from('crm_companies').select('slug')
    if (slugsError) { setNotice('Não foi possível verificar os endereços disponíveis.'); setSaving(false); return }
    const taken = new Set((existingSlugs || []).map((item: { slug: string }) => item.slug))
    const baseSlug = slug
    let suffix = 2
    while (taken.has(slug)) slug = `${baseSlug}-${suffix++}`

    const company = { name, slug, status: form.account_status, contact_name: contact, contact_email: contactEmail, contact_phone: form.contact_phone.trim() || null, max_properties: properties, max_photos_per_property: photos }
    const { data: c, error: ce } = await supabase.from('crm_companies').insert(company).select().single()
    if (ce || !c) {
      setNotice(ce?.code === '23505' ? 'Este identificador já está em uso.' : 'Não foi possível salvar o cliente.')
      setSaving(false)
      return
    }

    const { error: se } = await supabase.from('crm_subscriptions').insert({ company_id: c.id, plan_code: 'essencial', plan_name: 'Essencial', monthly_price: price, property_limit: properties, photo_limit: photos, status: form.subscription_status })
    if (se) {
      await supabase.from('crm_companies').delete().eq('id', c.id)
      setNotice('Não foi possível salvar a assinatura; o cliente não foi criado.')
      setSaving(false)
      return
    }

    const response = await fetch('/api/admin/provision-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentSession.access_token}` },
      body: JSON.stringify({ companyId: c.id, email: contactEmail, companyName: name }),
    })
    const provision = await response.json().catch(() => ({}))
    if (!response.ok) {
      await supabase.from('crm_subscriptions').delete().eq('company_id', c.id)
      await supabase.from('crm_companies').delete().eq('id', c.id)
      setNotice(`Cliente não criado: ${provision.error || 'falha ao criar o acesso do cliente'}`)
      setSaving(false)
      return
    }

    setModal(false)
    setForm(emptyForm)
    setNotice(provision.initialPassword ? `Cliente criado com acesso automático. Login: ${provision.email} | Senha inicial: ${provision.initialPassword}. Painel: https://versuscrm.vercel.app/${slug}/area-cliente. Oriente o cliente a trocar a senha após o primeiro acesso.` : `Cliente criado e conta existente vinculada. Login: ${provision.email}. A senha atual foi mantida. Painel: https://versuscrm.vercel.app/${slug}/area-cliente.`)
    setSaving(false)
    await loadData()
  }
  if (loading) return <main className="min-h-screen bg-[#0b1020] text-white grid place-items-center">Carregando Versus CRM...</main>
  if (!session) return <main className="min-h-screen bg-[#0b1020] text-[#f4f7ff] grid place-items-center px-4"><section className="w-full max-w-md rounded-2xl border border-[#dfe4e8] bg-white p-8 shadow-2xl"><Brand subtitle="PAINEL ADMINISTRATIVO"/><h1 className="mt-10 text-2xl font-bold">Acesso administrativo</h1><p className="mt-2 text-sm text-[#68737d]">Entre com sua conta de administrador do Versus CRM.</p><form onSubmit={login} className="mt-8 grid gap-4"><Field label="E-mail"><input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)}/></Field><Field label="Senha"><input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)}/></Field><button className="rounded-lg bg-[#d3aa62] px-4 py-3 font-bold text-[#061d2d]">Entrar no painel</button>{error && <p className="text-sm text-[#f1cc7b]">{error}</p>}</form></section></main>
  async function manageClientAccess(company: Company) {
    const first = window.prompt(`Defina uma senha inicial/nova para ${company.name} (mínimo de 12 caracteres):`)
    if (first === null) return
    if (first.length < 12) { setNotice('A senha precisa ter pelo menos 12 caracteres.'); return }
    const second = window.prompt('Digite a mesma senha novamente para confirmar:')
    if (second === null) return
    if (first !== second) { setNotice('As senhas não conferem. Nenhuma alteração foi feita.'); return }
    const { data: { session: current } } = await supabase.auth.getSession()
    if (!current?.access_token) { setNotice('Sua sessão administrativa expirou. Entre novamente.'); return }
    setNotice('Atualizando acesso de ' + company.name + '...')
    const response = await fetch('/api/admin/manage-client-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + current.access_token },
      body: JSON.stringify({ companyId: company.id, password: first }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) { setNotice(result.error || 'Não foi possível atualizar o acesso.'); return }
    setNotice(`Acesso de ${result.email} configurado com sucesso. A senha definida já pode ser usada na área do cliente.`)
  }

  return <main className="min-h-screen bg-[#f4f6f8] text-[#202a33]"><aside className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-[#061d2d] text-[#e8eef2] shadow-lg transition-all duration-200 ${sidebarCollapsed ? 'w-[70px]' : 'w-[230px]'}`}><a href="/" className="flex h-24 shrink-0 flex-col items-center justify-center border-b border-[#23394a] text-[#d3aa62] no-underline"><strong className="font-serif text-[31px] tracking-tight">VERSUS</strong>{!sidebarCollapsed && <small className="mt-1 text-[7px] tracking-[4px] text-white">CRM</small>}</a><nav className="grid gap-1 overflow-y-auto p-2"><p className={`px-3 pb-2 pt-3 text-[10px] font-bold uppercase tracking-[.15em] text-[#9aabb6] ${sidebarCollapsed ? 'hidden' : ''}`}>Plataforma</p><Nav icon={<LayoutDashboard/>} active={view === 'overview'} onClick={() => setView('overview')}>Visão geral</Nav><Nav icon={<UserRound/>} active={view === 'clients'} onClick={() => setView('clients')}>Clientes</Nav><Nav icon={<CreditCard/>} active={view === 'subscriptions'} onClick={() => setView('subscriptions')}>Assinaturas</Nav><Nav icon={<Globe2/>} active={view === 'domains'} onClick={() => setView('domains')}>Sites e domínios</Nav><Nav icon={<ClipboardList/>} active={view === 'leads'} onClick={() => {setView('leads');loadPublicLeads()}}>Leads</Nav><Nav icon={<Check/>} active={view === 'catalog'} onClick={() => {setView('catalog');loadData()}}>Solicitações {requests.length > 0 ? `(${requests.length})` : ''}</Nav></nav><div className="mt-auto border-t border-[#23394a] p-2"><Nav icon={<ExternalLink/>} onClick={() => window.open("https://versuscrm-site.vercel.app", "_blank", "noopener,noreferrer")}>Página de vendas</Nav><button onClick={() => setSidebarCollapsed(v => !v)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs text-[#d3aa62] hover:bg-[#142f43]" aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}>{sidebarCollapsed ? <Menu className="size-4"/> : <><ChevronLeft className="size-4"/> Recolher menu</>}</button></div></aside><section className={`min-w-0 transition-[margin] duration-200 ${sidebarCollapsed ? 'ml-[70px]' : 'ml-[230px]'}`}><header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#dfe4e8] bg-white px-5 shadow-sm md:px-8"><div><p className="text-xs text-[#68737d]">Versus CRM / {title[0]}</p><strong>Central de gestão</strong></div><div className="relative"><button onClick={()=>{setAlertOpen(v=>!v);if(!alertOpen)loadLeadAlerts(adminUserId)}} aria-label="Notificações de leads" title="Notificações de leads" className="relative flex items-center gap-2 rounded-lg border border-[#d3aa62]/50 bg-[#fffaf0] px-3 py-2 text-[#0b2940] shadow-sm hover:bg-[#f8edd8]"><Bell className="size-5"/><span className="hidden text-sm font-semibold sm:inline">Notificações</span>{alertRows.filter(n=>n.status!=="read").length>0&&<span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-5 text-white shadow">{alertRows.filter(n=>n.status!=="read").length}</span>}</button>{alertOpen && (
<div className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-[#dfe4e8] bg-white shadow-xl">
  <div className="flex items-center justify-between border-b border-[#e7ebef] p-4">
    <strong>Alertas e novos leads</strong>
    <button onClick={() => setAlertOpen(false)} aria-label="Fechar"><X className="size-4"/></button>
  </div>
  <div className="max-h-[420px] overflow-auto">
    {alertRows.length > 0 ? alertRows.map(alert => (
      <button key={alert.id} onClick={() => markAlertRead(alert)} className="block w-full border-b border-[#edf0f2] p-4 text-left hover:bg-[#f7f9fb]">
        <div className="flex items-start gap-2">
          <span className={alert.status !== "read" ? "mt-1 size-2 shrink-0 rounded-full bg-[#d3aa62]" : "mt-1 size-2 shrink-0 rounded-full bg-transparent"} />
          <div>
            <strong className="block text-sm">{alert.title}</strong>
            <span className="mt-1 block text-xs text-[#68737d]">{alert.message}</span>
            <span className="mt-1 block text-[10px] text-[#8a95a3]">{new Date(alert.created_at).toLocaleString("pt-BR")}</span>
          </div>
        </div>
      </button>
    )) : <p className="p-5 text-sm text-[#68737d]">Nenhum alerta por enquanto.</p>}
  </div>
</div>
)}</div></header><div className="mx-auto max-w-[1400px] p-5 md:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">{title[0]}</h1><p className="mt-1 text-sm text-[#68737d]">{title[1]}</p></div>{view !== 'catalog' && view !== 'subscriptions' && view !== 'domains' && <button onClick={() => { setEditingCompany(null); setForm(emptyForm); setNotice(''); setModal(true) }} className="flex items-center gap-2 rounded-lg bg-[#d3aa62] px-4 py-3 font-bold text-[#061d2d]"><Plus/> Cadastrar cliente</button>}</div>{view !== 'catalog' && <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Clientes cadastrados" value={companies.length} hint="Contas na plataforma"/><Stat label="Assinaturas ativas" value={totals.active} hint="Status de assinatura"/><Stat label="MRR atual" value={money(totals.mrr)} hint="Receita recorrente"/><Stat label="Limites controlados" value="100%" hint="Definidos pelo admin"/></div>}<div className={view === 'catalog' ? 'mt-4 flex flex-wrap items-center justify-between gap-3' : 'mt-6 flex flex-wrap items-center justify-between gap-3'}>{view !== 'catalog' && (<div className="relative w-full max-w-md"><Search className="absolute left-3 top-3 size-4 text-[#68737d]"/><input className="input pl-10" placeholder={view === 'leads' ? 'Buscar leads por nome, e-mail ou WhatsApp...' : 'Buscar clientes...'} value={search} onChange={e => setSearch(e.target.value)}/></div>)}<button onClick={loadData} className="flex items-center gap-2 rounded-lg border border-[#dfe4e8] px-3 py-2 text-sm text-[#68737d]"><RefreshCw/> Atualizar</button></div>{notice && <p className="mt-4 text-sm text-[#68737d]">{notice}</p>}{view === 'catalog' ? <div className="mt-4 grid gap-4">{requests.map(item => {
  const before = item.current_data || {}, after = item.proposed_data || {}
  const labels: Record<string,string> = {name:'Nome',legal_name:'Razão social',document:'Documento',phone:'Telefone',website:'Site',partnership_manager_name:'Responsável',partnership_manager_phone:'Telefone do responsável',description:'Descrição',logo_url:'Logo',active:'Ativo',address:'Endereço',neighborhood:'Bairro',city:'Cidade',state:'Estado',construction_year:'Ano de construção',builder:'Construtora',details:'Detalhes'}
  const actionName = item.action === 'create' ? 'Novo cadastro' : item.action === 'update' ? 'Alteração solicitada' : 'Exclusão solicitada'
  const values = item.action === 'delete' ? Object.entries(before) : Object.entries(after).filter(([key,value]) => JSON.stringify(before[key] ?? null) !== JSON.stringify(value ?? null))
  return <article key={item.id} className="rounded-xl border border-[#dfe4e8] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-[#fff5dd] px-3 py-1 text-xs font-bold text-[#805b15]">Aguardando aprovação</span><h2 className="mt-3 text-xl font-bold">{actionName}: {String(after.name || before.name || 'Cadastro')}</h2><p className="mt-1 text-xs text-[#68737d]">{item.entity_type === 'developer' ? 'Construtora' : 'Condomínio'} · {item.company_name || 'Imobiliária'} · {item.requester_name || item.requester_email || 'Solicitante'} · {new Date(item.created_at).toLocaleString('pt-BR')}</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{values.map(([key,value]) => <div key={key} className="rounded-lg border border-[#e7ebef] bg-[#f8fafb] p-3 text-sm"><strong>{labels[key] || key}</strong>{item.action !== 'create' && <p className="mt-2 text-xs text-[#68737d]">Atual: {String(before[key] ?? '—')}</p>}<p className="mt-1 break-words font-semibold text-[#174b32]">{item.action === 'delete' ? String(value ?? '—') : Array.isArray(value) ? value.join(', ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '—')}</p></div>)}</div><div className="mt-5 flex flex-wrap gap-2 border-t border-[#edf0f2] pt-4"><button onClick={() => decideCatalogRequest(item,'approved')} className="rounded-lg bg-[#d3aa62] px-4 py-2.5 text-sm font-bold text-[#061d2d]">Aprovar e aplicar</button><button onClick={() => decideCatalogRequest(item,'rejected')} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">Rejeitar</button></div></article>
})}{brokerRequests.length > 0 && <section className="mb-5 rounded-xl border border-[#dfe4e8] bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-bold">Solicitações dos corretores <span className="text-sm font-normal text-[#68737d]">({brokerRequests.length})</span></h2><div className="grid gap-3">{brokerRequests.map(item => <article key={item.id} className="rounded-lg border border-[#e7ebef] bg-[#f8fafb] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold">{item.subject || 'Sem assunto'}</h3><p className="mt-1 text-xs text-[#68737d]">{item.company_name} · {item.contact_name} · {new Date(item.created_at).toLocaleString('pt-BR')}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{({new:'Nova',in_progress:'Em andamento',waiting:'Aguardando retorno',resolved:'Resolvida',closed:'Encerrada'} as Record<string,string>)[item.status] || item.status}</span></div>{item.message && <p className="mt-3 whitespace-pre-wrap text-sm text-[#35424d]">{item.message}</p>}{item.admin_response && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-bold text-emerald-800">Resposta enviada · {item.responded_at ? new Date(item.responded_at).toLocaleString('pt-BR') : ''}</p><p className="mt-1 whitespace-pre-wrap text-sm text-emerald-900">{item.admin_response}</p></div>}<div className="mt-4 border-t border-[#e7ebef] pt-3"><label className="mb-1 block text-xs font-semibold text-[#35424d]">Responder ao corretor</label><textarea className="input min-h-[90px] w-full" placeholder="Digite a resposta que será exibida ao corretor..." value={brokerReplyDraft[item.id] ?? (item.admin_response || '')} onChange={e=>setBrokerReplyDraft(prev=>({...prev,[item.id]:e.target.value}))}/><div className="mt-2 flex justify-end"><button disabled={replySavingId===item.id || !(brokerReplyDraft[item.id] || item.admin_response || '').trim()} onClick={()=>sendBrokerReply(item)} className="rounded-lg bg-[#d3aa62] px-4 py-2 text-sm font-bold text-[#061d2d] disabled:opacity-50">{replySavingId===item.id?'Enviando...':item.admin_response?'Atualizar resposta':'Enviar resposta'}</button></div></div></article>)}</div></section>}{requests.length === 0 && brokerRequests.length === 0 && <div className="rounded-xl border border-dashed border-[#d3aa62] bg-white p-10 text-center text-[#68737d]">✓<p className="mt-2">Nenhuma solicitação pendente no momento.</p></div>}</div> : view === 'leads' ? <div className="mt-4 overflow-hidden rounded-xl border border-[#dfe4e8] bg-white"><table className="w-full text-left text-sm"><thead className="border-b border-[#dfe4e8] text-[#68737d]"><tr><th className="p-4">Contato</th><th className="p-3 text-center">WhatsApp</th><th className="p-4">Interesse</th><th className="p-4">Origem</th><th className="p-4">Recebido em</th><th className="p-4">Status</th><th className="p-4 text-right">Ações</th></tr></thead><tbody>{publicLeads.filter(l=>l.status!=='converted').filter(l=>[l.contact_name,l.email,l.phone,l.interest].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))).map(lead=><tr key={lead.id} className="border-b border-[#edf0f2]"><td className="p-4"><strong>{lead.contact_name}</strong>{lead.message&&<span className="mt-1 block max-w-md text-xs text-[#68737d]">{lead.message}</span>}{lead.source_url&&<a href={lead.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-[#0b2940] hover:underline">Ver site de origem <ExternalLink className="size-3"/></a>}</td><td className="p-3 text-center">{lead.phone&&<a href={"https://wa.me/" + (String(lead.phone).replace(/\\D/g,'').startsWith('55') ? String(lead.phone).replace(/\\D/g,'') : "55" + String(lead.phone).replace(/\\D/g,''))} target="_blank" rel="noreferrer" title={'Conversar no WhatsApp com ' + lead.contact_name} aria-label={'WhatsApp ' + lead.contact_name} className="inline-flex size-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:scale-105 hover:bg-[#1ebe5d] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#128C4A] focus:ring-offset-2"><MessageCircle className="size-7 stroke-[2.2]"/></a>}</td><td className="p-4">{lead.interest||'Contato geral'}</td><td className="p-4">{lead.source||'Site'}</td><td className="p-4 whitespace-nowrap">{new Date(lead.created_at).toLocaleString('pt-BR')}</td><td className="p-4"><select className="input min-w-[155px] text-xs" value={leadStatusDraft[lead.id] || lead.status} onChange={e=>{const value=e.target.value;if(value==='convert_client'){setLeadStatusDraft(prev=>({...prev,[lead.id]:value}));return}setLeadStatusDraft(prev=>({...prev,[lead.id]:value}));updateLeadStatus(lead,value)}}><option value="new">Novo</option><option value="contacted">Em contato</option><option value="qualified">Qualificado</option><option value="convert_client">Converter cliente</option><option value="converted">Convertido</option><option value="lost">Perdido</option></select>{(leadStatusDraft[lead.id]||lead.status)==='convert_client'&&<button onClick={()=>convertLeadToClient(lead)} className="mt-2 rounded-md bg-[#0b2940] px-3 py-2 text-xs font-semibold text-white hover:bg-[#173c58]">Atualizar</button>}{lead.status==='converted'&&<span className="block mt-1 text-[10px] text-emerald-700">Cliente criado</span>}</td><td className="p-4 text-right"><button onClick={() => deleteLead(lead)} title="Excluir lead" aria-label={'Excluir lead de ' + lead.contact_name} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 transition hover:bg-red-50"><Trash2 className="size-4"/></button></td></tr>)}</tbody></table>{publicLeads.filter(l=>l.status!=='converted').length===0&&<p className="p-8 text-center text-[#68737d]">Nenhum lead pendente. Os contatos convertidos estão registrados na plataforma.</p>}</div> : <div className="mt-4 overflow-hidden rounded-xl border border-[#dfe4e8] bg-white"><table className="w-full text-left text-sm"><thead className="border-b border-[#dfe4e8] text-[#68737d]"><tr><th className="p-4">Cliente</th><th className="p-4">Site público</th><th className="p-4">Conta</th><th className="p-4">Assinatura</th><th className="p-4">Plano</th></tr></thead><tbody>{filtered.map(c => { const s = subs.get(c.id); return <tr key={c.id} className="border-b border-[#edf0f2]"><td className="p-4"><strong>{c.name}</strong><span className="block text-xs text-[#68737d]">{c.contact_name} · {c.contact_email}</span></td><td className="p-4"><a className="inline-flex items-center gap-1 text-[#0b2940] hover:underline" href={'/' + c.slug} target="_blank" rel="noreferrer">versuscrm.vercel.app/{c.slug} <ExternalLink className="size-3"/></a></td><td className="p-4">{statusLabel[c.status] || c.status}</td><td className="p-4">{s ? statusLabel[s.status] || s.status : '—'}</td><td className="p-4">{s ? (s.plan_name + ' · ' + money(s.monthly_price)) : '—'}<span className="block text-xs text-[#68737d]">{s?.property_limit || c.max_properties} imóveis · {s?.photo_limit || c.max_photos_per_property || 35} fotos/imóvel</span><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => { setEditingCompany(c); setForm({ name: c.name, slug: c.slug, contact_name: c.contact_name || '', contact_email: c.contact_email || '', contact_phone: c.contact_phone || '', account_status: c.status || 'active', subscription_status: s?.status || 'trial', monthly_price: String(s?.monthly_price ?? 100), property_limit: String(s?.property_limit ?? c.max_properties ?? 100), photo_limit: String(s?.photo_limit ?? c.max_photos_per_property ?? 35) }); setNotice(''); setModal(true) }} className="inline-flex items-center gap-1 rounded-lg border border-[#91a8ff]/40 px-3 py-2 text-xs font-semibold text-[#0b2940] hover:bg-[#d3aa62]/10"><Pencil className="size-3"/> Editar cliente</button><button onClick={() => manageClientAccess(c)} className="rounded-lg border border-[#91a8ff]/40 px-3 py-2 text-xs font-semibold text-[#0b2940] hover:bg-[#d3aa62]/10">Criar / redefinir acesso</button></div></td></tr> })}</tbody></table>{filtered.length === 0 && <p className="p-8 text-center text-[#68737d]">Nenhum cliente encontrado.</p>}</div> }</div></section>{modal && <div className="fixed inset-0 z-20 grid place-items-center bg-black/70 p-4"><section className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl border border-[#dfe4e8] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">{editingCompany ? 'Editar cliente' : 'Cadastrar cliente'}</h2><p className="mt-1 text-sm text-[#68737d]">Edite os dados, a situação da conta e os limites do plano.</p></div><button onClick={() => { setModal(false); setEditingCompany(null) }} aria-label="Fechar"><X/></button></div><form onSubmit={saveClient} className="mt-6 grid gap-4">{notice && <p role="status" aria-live="polite" className="rounded-lg border border-[#f1cc7b]/30 bg-[#f1cc7b]/10 p-3 text-sm text-[#f1cc7b]">{notice}</p>}<div className="grid gap-4 md:grid-cols-2"><Field label="Nome da imobiliária/corretor *"><input className="input" required value={form.name} onChange={e => { updateForm('name', e.target.value); if (!editingCompany) updateForm('slug', slugify(e.target.value)) }}/></Field><Field label="Endereço do site (automático)"><input className="input opacity-75" value={form.slug ? 'https://versuscrm.vercel.app/' + form.slug : 'Digite o nome para gerar o endereço'} readOnly /></Field><Field label="Nome do contato *"><input className="input" required value={form.contact_name} onChange={e => updateForm('contact_name', e.target.value)}/></Field><Field label="E-mail *"><input className="input" required type="email" value={form.contact_email} onChange={e => updateForm('contact_email', e.target.value)}/></Field><Field label="Telefone"><input className="input" value={form.contact_phone} onChange={e => updateForm('contact_phone', e.target.value)}/></Field><Field label="Status da conta"><select className="input" value={form.account_status} onChange={e => updateForm('account_status', e.target.value)}><option value="pending">Pendente</option><option value="active">Ativa</option><option value="suspended">Suspensa</option><option value="cancelled">Cancelada</option></select></Field><Field label="Status da assinatura"><select className="input" value={form.subscription_status} onChange={e => updateForm('subscription_status', e.target.value)}><option value="trial">Teste</option><option value="active">Ativa</option><option value="pending">Pendente de pagamento</option><option value="past_due">Inadimplente</option><option value="cancelled">Cancelada</option></select></Field><Field label="Mensalidade (R$) *"><input className="input" required type="number" min="0" step="0.01" value={form.monthly_price} onChange={e => updateForm('monthly_price', e.target.value)}/></Field><Field label="Limite de imóveis *"><input className="input" required type="number" min="1" value={form.property_limit} onChange={e => updateForm('property_limit', e.target.value)}/></Field><Field label="Fotos por imóvel *"><input className="input" required type="number" min="1" value={form.photo_limit} onChange={e => updateForm('photo_limit', e.target.value)}/><small className="text-xs text-[#68737d]">Padrão do plano Essencial: 35</small></Field></div><div className="flex justify-end gap-3 border-t border-[#dfe4e8] pt-4"><button type="button" onClick={() => { setModal(false); setEditingCompany(null) }} className="rounded-lg border border-[#dfe4e8] px-4 py-3 text-sm">Cancelar</button><button disabled={saving} className="rounded-lg bg-[#d3aa62] px-4 py-3 font-bold text-[#061d2d]">{saving ? 'Salvando...' : editingCompany ? 'Salvar alterações' : 'Salvar cliente'}</button></div></form></section></div>}</main>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm">{label}{children}</label> }
function Brand({ subtitle }: { subtitle: string }) { return <div className="flex items-center gap-2 px-2 text-xl font-black tracking-tight"><span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#a6b9ff] to-[#647ef0] text-[#061d2d]">V</span><span>versus<small className="block text-[9px] tracking-[.17em] text-[#8d9ab3]">{subtitle}</small></span></div> }
function Nav({ children, icon, active, onClick }: { children: React.ReactNode; icon: React.ReactNode; active?: boolean; onClick?: () => void }) { return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${active ? 'bg-[#829cff19] text-[#c2ceff]' : 'text-[#aebbd1] hover:bg-[#829cff19]'}`}>{icon}{children}</button> }
function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) { return <article className="rounded-xl border border-[#dfe4e8] bg-white p-5"><p className="text-sm text-[#68737d]">{label}</p><strong className="mt-3 block text-3xl">{value}</strong><small className="mt-1 block text-[#68737d]">{hint}</small></article> }

// Classes kept local to preserve the existing visual language.
