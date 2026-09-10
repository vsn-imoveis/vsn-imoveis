export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const {address,number,cep,neighborhood,city,state}=req.body||{};
  if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});
  const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');
  const clean=(s='')=>String(s).replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  const sources=[];
  try{
    // Primeiro tenta a IA quando a chave estiver configurada.
    if(process.env.OPENAI_API_KEY){
      const prompt=`Você é um pesquisador imobiliário. Identifique o condomínio residencial associado ao endereço abaixo usando busca na web. Não invente dados. Endereço: ${location}. Procure o nome exato do condomínio e características/amenidades publicamente divulgadas. Só marque uma amenidade se houver evidência razoável em uma fonte. Se houver mais de um resultado possível, escolha o mais provável e informe confiança baixa/média/alta. Retorne SOMENTE JSON válido neste formato: {"condominium_name":"","confidence":"alta|media|baixa","features":[],"evidence":"","sources":[{"title":"","url":""}]}. features deve usar apenas estes valores quando confirmados: Mobiliado,Varanda,Churrasqueira,Piscina,Academia,Salão de festas,Playground,Elevador,Portaria 24h,Aceita pets. Diferencie amenidades do condomínio de características da unidade.`;
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:'gpt-5.6-luna',tools:[{type:'web_search'}],input:prompt})});
      const j=await r.json();
      if(r.ok){
        let text=j.output_text||''; text=text.replace(/^```json\s*/,'').replace(/\s*```$/,'').trim();
        const data=JSON.parse(text);
        if(data.condominium_name) return res.status(200).json(data);
      }
    }

    // Fallback sem chave: pesquisa pública para que o preenchimento automático não dependa da API da IA.
    const queries=[
      `"${address}" "${number}" condomínio ${city||''}`,
      `"${address}, ${number}" "Condomínio"`,
      `"${address}" "${number}" apartamento condomínio`
    ];
    const results=[];
    for(const q of queries){
      const url='https://html.duckduckgo.com/html/?q='+encodeURIComponent(q);
      const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; VSN-Imoveis/1.0)'}});
      if(!r.ok) continue;
      const html=await r.text();
      const re=/<a[^>]+class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while((m=re.exec(html))&&results.length<12){
        const title=clean(m[2]);
        const href=m[1];
        if(title) results.push({title,url:href});
      }
    }
    const combined=results.map(x=>x.title).join(' | ');
    const addressKey=`${address} ${number}`.toLowerCase();
    const exact=results.find(x=>/condom[ií]nio|residencial|space residence|parque das orqu[ií]deas/i.test(x.title));
    if(!exact){
      return res.status(200).json({condominium_name:'',confidence:'baixa',features:[],evidence:'Não encontramos evidência pública suficiente para identificar o condomínio automaticamente. Informe manualmente ou tente novamente.',sources:results.slice(0,5)});
    }
    let name=exact.title.replace(/\s*[|–-].*$/,'').trim();
    name=name.replace(/^apartamento\s+(?:no|em|na|para venda|para locação)\s+/i,'').trim();
    const featureText=(combined+' '+results.map(x=>x.title).join(' ')).toLowerCase();
    const features=[];
    if(/\belevador\b/.test(featureText)) features.push('Elevador');
    if(/\bchurrasqueira\b/.test(featureText)) features.push('Churrasqueira');
    if(/\bacademia\b/.test(featureText)) features.push('Academia');
    if(/sal[aã]o de festas/.test(featureText)) features.push('Salão de festas');
    if(/playground/.test(featureText)) features.push('Playground');
    if(/portaria.{0,20}24|24.{0,20}portaria|seguran[cç]a 24/.test(featureText)) features.push('Portaria 24h');
    if(/\bpiscina\b/.test(featureText)) features.push('Piscina');
    if(/\bvaranda\b|\bsacada\b/.test(featureText)) features.push('Varanda');
    if(/\baceita pets\b|\bpets\b/.test(featureText)) features.push('Aceita pets');
    return res.status(200).json({
      condominium_name:name,
      confidence:'media',
      features:[...new Set(features)],
      evidence:`Identificado por fontes públicas que relacionam o endereço ${address}, ${number} ao condomínio. Revise antes de publicar.`,
      sources:results.slice(0,5)
    });
  }catch(e){
    return res.status(500).json({error:'Não foi possível pesquisar o condomínio automaticamente agora. Tente novamente pelo botão.',details:e.message});
  }
}
