export default async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="POST") return res.status(405).json({error:"Método não permitido"});
  const secret=String(process.env.CONDO_IMPORT_SECRET||"");
  if(!secret||String(req.headers["x-condo-import-secret"]||"")!==secret) return res.status(401).json({error:"Não autorizado"});
  const base=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||"");
  if(!base||!key) return res.status(500).json({error:"Supabase não configurado"});
  try{
    const b=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const cursor=b.cursor?String(b.cursor):"";
    const maxPages=Math.min(Math.max(Number(b.pages||1),1),5);
    const limit=Math.min(Math.max(Number(b.limit||1024),1),1024);
    const saved=[];
    let next=cursor||null;
    for(let page=0;page<maxPages;page++){
      const p=new URLSearchParams({cnae_fiscal:"8112500",municipio:"3550308",limit:String(limit)});
      if(next)p.set("cursor",next);
      const r=await fetch("https://minhareceita.org/?"+p.toString(),{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(15000)});
      if(!r.ok) return res.status(502).json({error:"Minha Receita retornou erro",status:r.status,page});
      const data=await r.json();
      const rows=Array.isArray(data.data)?data.data:(Array.isArray(data.results)?data.results:[]);
      if(!rows.length){next=null;break;}
      const payload=rows.map(x=>{
        const cnpj=String(x.cnpj||"").replace(/\D/g,"")||null;
        const name=String(x.nome_fantasia||x.razao_social||x.nome_empresarial||"").trim();
        const norm=String(name).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
        return {normalized_name:norm,name,cnpj,address:x.logradouro||null,number:x.numero||null,complement:x.complemento||null,neighborhood:x.bairro||null,city:"São Paulo",state:"SP",cep:x.cep||null,confidence:"cnpj",source_urls:[{title:"Minha Receita / CNPJ",url:"https://minhareceita.org/"+cnpj}],updated_at:new Date().toISOString()};
      }).filter(x=>x.name&&x.normalized_name);
      const up=await fetch(base+"/rest/v1/condominiums?on_conflict=normalized_name",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json","Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(payload)});
      if(!up.ok)return res.status(502).json({error:"Falha ao salvar no Supabase",status:up.status,message:(await up.text()).slice(0,500),page});
      saved.push(...payload.map(x=>({name:x.name,cnpj:x.cnpj,address:x.address,number:x.number})));
      next=data.cursor||data.next_cursor||null;
      if(!next||rows.length<limit)break;
    }
    return res.status(200).json({ok:true,saved_count:saved.length,preview:saved.slice(0,10),next_cursor:next,has_more:!!next,cnae:"8112500",municipio:"3550308"});
  }catch(e){return res.status(500).json({error:"Erro no importador",message:String(e?.message||e)});}
}
