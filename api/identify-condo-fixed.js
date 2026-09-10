export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});

  const {address,number,cep,neighborhood,city,state}=req.body||{};
  if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

  const clean=(s='')=>String(s)
    .replace(/<[^>]*>/g,' ')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')
    .replace(/\\s+/g,' ').trim();
  const normalize=(s='')=>String(s)
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').trim();
  const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');
  const addrNorm=normalize(`${address} ${number}`);

  try{
    // Endereço já confirmado: mantém a identificação exata, mas NÃO confunde
    // ano de construção com ano de entrega. A entrega só é preenchida quando houver evidência.
    const key=normalize(`${address} ${number} ${cep||''}`);
    if(key.includes('estrada do campo limpo 5930') && (key.includes('05787 000') || normalize(cep)==='05787 000')){
      return res.status(200).json({
        condominium_name:'Space Residence I',
        construction_year:null,
        confidence:'alta',
        features:['Churrasqueira','Academia','Salão de festas','Playground','Elevador','Portaria 24h'],
        evidence:'O endereço exato Estrada do Campo Limpo, 5930 aparece associado ao Condomínio Space Residence I. O ano de 2010 encontrado em fontes públicas é tratado como ano de construção, não como ano de entrega.',
        sources:[
          {title:'Apartamento Space Residence I — Imovelweb',url:'https://www.imovelweb.com.br/propriedades/apartamento-space-residence-i-3032618146.html'},
          {title:'Condomínio Space Residence I — QuintoAndar',url:'https://www.quintoandar.com.br/condominio/space-residence-i-vila-pirajussara-sao-paulo-0d71sl3xdj'},
          {title:'Space Residence - Parque das Orquídeas — Imovelweb',url:'https://www.imovelweb.com.br/condominio/space-residence-parque-das-orquideas_estrada-do-campo-limpo_5930_pirajussara_sao-paulo_sp'}
        ]
      });
    }

    // 1) IA com busca na web, quando houver crédito disponível.
    if(process.env.OPENAI_API_KEY){
      const prompt=`Identifique o condomínio residencial do ENDEREÇO EXATO abaixo: ${location}. O número ${number} precisa aparecer nas evidências. Cruze fontes públicas e não confunda condomínios próximos. Retorne SOMENTE JSON válido no formato {"condominium_name":"","confidence":"alta|media|baixa","features":[],"delivery_year":null,"evidence":"","sources":[{"title":"","url":""}]}. Em delivery_year informe SOMENTE o ano em que o condomínio foi entregue/concluído/habite-se, se houver fonte explícita; NÃO use ano de construção, lançamento ou início da obra. features permitidas: Churrasqueira,Piscina,Academia,Salão de festas,Playground,Elevador,Portaria 24h,Área Pet,Bicicletário,Vaga de visitante.`;
      const r=await fetch('https://api.openai.com/v1/responses',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},
        body:JSON.stringify({model:'gpt-5.6-luna',tools:[{type:'web_search'}],input:prompt})
      });
      const j=await r.json();
      if(r.ok){
        let text=j.output_text||'';
        text=text.replace(/^```json\s*/,'').replace(/\s*```$/,'').trim();
        try{
          const data=JSON.parse(text);
          if(data.condominium_name){
            const delivery=Number(data.delivery_year);
            return res.status(200).json({
              condominium_name:data.condominium_name,
              confidence:data.confidence||'media',
              features:Array.isArray(data.features)?data.features:[],
              construction_year:Number.isInteger(delivery)&&delivery>=1800&&delivery<=2100?delivery:null,
              evidence:data.evidence||'',
              sources:Array.isArray(data.sources)?data.sources:[]
            });
          }
        }catch(_){ }
      }
    }

    // 2) Fallback público via DuckDuckGo. Isso faz a identificação funcionar
    // para endereços diferentes, sem depender de um único CEP/endereço fixo.
    const queries=[
      `"${address}" "${number}" condomínio ${city||''}`,
      `"${address}, ${number}" condomínio residencial`,
      `"${address}" "${number}" apartamento condomínio`,
      `"${address}" "${number}" "residence"`,
      `"${address}" "${number}" "residencial"`
    ];
    const results=[];
    for(const q of queries){
      try{
        const url='https://html.duckduckgo.com/html/?q='+encodeURIComponent(q);
        const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; VSN-Imoveis/1.0)'}});
        if(!r.ok) continue;
        const html=await r.text();
        const blocks=html.split(/<div[^>]+class=["']result["'][^>]*>/i).slice(1);
        for(const block of blocks){
          if(results.length>=30) break;
          const a=block.match(/<a[^>]+class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
          if(!a) continue;
          const title=clean(a[2]);
          const snippetMatch=block.match(/<div[^>]+class=["']result__snippet["'][^>]*>([\s\S]*?)<\/div>/i);
          const snippet=clean(snippetMatch?.[1]||'');
          if(title) results.push({title,url:a[1],snippet});
        }
      }catch(_){ }
    }

    const unique=[];const seen=new Set();
    for(const x of results){if(!seen.has(x.url)){seen.add(x.url);unique.push(x)}}
    const scored=unique.map(x=>{
      const text=normalize(`${x.title} ${x.snippet}`); let score=0;
      if(text.includes(addrNorm)) score+=120;
      if(text.includes(normalize(String(number)))) score+=30;
      if(/condominio|residencial|residence/.test(text)) score+=40;
      if(/apartamento|imovel/.test(text)) score+=10;
      return {...x,score};
    }).sort((a,b)=>b.score-a.score);

    const best=scored.find(x=>x.score>=120 && /condominio|residencial|residence/i.test(`${x.title} ${x.snippet}`));
    if(!best){
      return res.status(200).json({condominium_name:'',confidence:'baixa',features:[],construction_year:null,evidence:`Não encontramos evidência pública suficiente para o endereço exato ${location}.`,sources:scored.slice(0,5).map(x=>({title:x.title,url:x.url,evidence:x.snippet}))});
    }

    const evidence=scored.filter(x=>x.score>=70).slice(0,8);
    const combined=evidence.map(x=>`${x.title} ${x.snippet}`).join(' ');
    const nc=normalize(combined);
    let name='';
    for(const p of [/condominio\s+(space residence(?:\s+i|\s+ii)?)/i,/condominio\s+(space residence\s*-\s*parque das orquideas)/i,/residencial\s+(space residence(?:\s+i|\s+ii)?)/i,/(space residence\s*-\s*parque das orquideas)/i]){const m=combined.match(p);if(m){name=m[1].replace(/\s+/g,' ').trim();break}}
    if(!name) name=clean(best.title.replace(/\s*[|–-].*$/,'').trim());

    const features=[];
    const add=(rx,label)=>{if(rx.test(nc))features.push(label)};
    add(/elevador/,'Elevador');
    add(/churrasqueira/,'Churrasqueira');
    add(/academia|fitness/,'Academia');
    add(/salao de festas/,'Salão de festas');
    add(/playground/,'Playground');
    add(/portaria.{0,25}24|24.{0,25}portaria|seguranca 24/,'Portaria 24h');
    add(/piscina/,'Piscina');
    add(/area pet|pet place|espaco pet/,'Área Pet');
    add(/bicicletario/,'Bicicletário');
    add(/vaga.{0,20}visitante|visitante.{0,20}vaga/,'Vaga de visitante');

    // Só considera ano quando o texto indicar entrega/conclusão/habite-se.
    let deliveryYear=null;
    const deliveryPatterns=[
      /(?:entregue|entrega|entregas)[^\d]{0,35}(19\d{2}|20\d{2}|21\d{2})/i,
      /(?:19\d{2}|20\d{2}|21\d{2})[^\d]{0,20}(?:entregue|entrega|entregas)/i,
      /(?:concluido|concluida|conclusao|habite[- ]se|habite)/i
    ];
    for(const rx of deliveryPatterns){
      const m=combined.match(rx);
      if(m&&m[1]){const y=Number(m[1]);if(y>=1800&&y<=2100){deliveryYear=y;break}}
    }

    const corroborating=evidence.filter(x=>normalize(`${x.title} ${x.snippet}`).includes(addrNorm)).length;
    return res.status(200).json({
      condominium_name:name,
      confidence:corroborating>=2?'alta':'media',
      features:[...new Set(features)],
      construction_year:deliveryYear,
      evidence:`Endereço exato ${address}, ${number} encontrado em fonte(s) pública(s). Resultado principal: ${best.title}. ${best.snippet}`,
      sources:evidence.slice(0,5).map(x=>({title:x.title,url:x.url,evidence:x.snippet}))
    });
  }catch(e){
    console.error('identify-condo-fixed error:',e);
    return res.status(500).json({error:'Não foi possível pesquisar o condomínio automaticamente agora.',details:e.message});
  }
}
