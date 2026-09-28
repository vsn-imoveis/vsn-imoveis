(function(){
  const URL='https://jpdfynaioepcmgqlqlht.supabase.co';
  const KEY='sb_publishable_bDiXCzTT1gXO_xbVGhnAXg_Muy4lx03';
  if(!window.supabase?.createClient)return;
  const client=window.supabase.createClient(URL,KEY);
  const css=`.site-auth-controls{display:flex;align-items:center;gap:12px;color:#fff;font-family:inherit}.site-auth-profile{display:inline-flex;align-items:center;gap:9px;padding:7px 13px;border:0;border-radius:28px;background:#fff;color:#10283a;font:600 13px Manrope,Arial,sans-serif;cursor:pointer;white-space:nowrap}.site-auth-avatar{width:34px;height:34px;border-radius:50%;object-fit:cover;background:#f5ead7;display:grid;place-items:center;font-weight:800;color:#10283a}.site-auth-name{font-size:13px;white-space:nowrap;color:#fff}.site-auth-bell,.site-auth-logout{height:42px;min-width:44px;padding:0 13px;border:1px solid #385064;border-radius:12px;background:transparent;color:#fff;font-size:20px;cursor:pointer}.site-auth-logout{font-size:13px;font-weight:700}.site-auth-bell{border-radius:50%;width:48px;padding:0}.site-auth-controls a{text-decoration:none}@media(max-width:650px){.site-auth-controls{gap:6px}.site-auth-name{display:none}.site-auth-profile{padding:5px}.site-auth-avatar{width:31px;height:31px}.site-auth-logout{padding:0 9px;min-width:auto}}`;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function host(){return document.querySelector('.actions')||document.querySelector('.header-actions')}
  function loginElement(){return document.getElementById('siteLoginButton')||document.querySelector('.header-btn.login')}
  function resetLogin(){const el=loginElement();if(!el)return;if(el.id==='siteLoginButton'){el.textContent='Entrar';el.onclick=()=>window.openAccessModal?.()}else{el.innerHTML='<i class="fa fa-sign-in" aria-hidden="true"></i> Entrar';el.href='/admin/painel-login.html';el.onclick=null}}
  async function render(session){
    const h=host(),el=loginElement();if(!h||!el)return;
    if(!session?.user){const old=h.querySelector('.site-auth-controls');if(old)old.remove();el.hidden=false;resetLogin();return}
    let profile={};try{const r=await client.from('profiles').select('role,full_name,avatar_url').eq('id',session.user.id).maybeSingle();profile=r.data||{}}catch(_){}
    const role=profile.role||session.user.user_metadata?.role||'';
    const dest=role==='proprietario'?'/proprietario/':'/admin/painel-login.html';
    const display=profile.full_name||session.user.user_metadata?.full_name||session.user.email?.split('@')[0]||'Minha conta';
    const firstName=display.trim().split(/\\s+/)[0]||'Minha conta';
    const photo=profile.avatar_url?'<img class="site-auth-avatar" src="'+esc(profile.avatar_url)+'" alt="">':'<span class="site-auth-avatar">'+esc(firstName.charAt(0).toUpperCase())+'</span>';
    const old=h.querySelector('.site-auth-controls');if(old)old.remove();
    const group=document.createElement('div');group.className='site-auth-controls';
    group.innerHTML='<a class="site-auth-profile" href="'+dest+'" aria-label="Abrir perfil">'+photo+'<span>'+esc(firstName)+'</span></a><button type="button" class="site-auth-bell" aria-label="Notificações" title="Notificações">🔔</button><button type="button" class="site-auth-logout">Sair</button>';
    group.querySelector('.site-auth-bell').addEventListener('click',()=>location.href=role==='proprietario'?'/proprietario/':'/admin/solicitacoes-proprietario.html');
    group.querySelector('.site-auth-logout').addEventListener('click',async()=>{const b=group.querySelector('.site-auth-logout');b.disabled=true;b.textContent='Saindo...';const {error}=await client.auth.signOut();if(error){b.disabled=false;b.textContent='Sair';alert('Não foi possível sair: '+error.message);return}render(null)});
    el.hidden=true;h.appendChild(group);
  }
  client.auth.getSession().then(({data})=>render(data?.session||null)).catch(()=>{});
  client.auth.onAuthStateChange((_event,session)=>{render(session||null)});
})();