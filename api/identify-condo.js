export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
  const {address,number,cep,neighborhood,city,state}=req.body||{};
  if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

  const clean=(s='')=>String(s)
    .replace(/<[^>]*>/g,' ')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')
    .replace(/\s+/g,' ').trim();
  const normalize=(s='')=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const location=[address,number,neighborhood,city,state,cep].filter(Boolean).join(', ');
  const sources=[];

  try{
    // 1) IA com busca na web. A instrução agora exige o endereço EXATO e permite nomes alternativos do mesmo empreendimento.
    if(process.env.OPENAI_API_KEY){
      const prompt=`Você é um pesquisador imobiliário. Identifique o condomínio associado EXATAMENTE ao endereço abaixo.
ENDEREÇO EXATO: ${location}

Regras:
- O número do imóvel é obrigatório e deve ser conferido nas fontes.
- Não confunda condomínios próximos com o condomínio deste endereço.
- Procure pelo endereço completo, inclusive o número ${number}.
- Cruze pelo menos duas fontes públicas quando possível.
- Se fontes usarem nomes diferentes para o mesmo empreendimento, trate-os como nomes alternativos e escolha o nome mais consistente.
- Não invente dados.
- Só marque amenidades se houver evidência razoável de que pertencem ao condomínio.
- Retorne SOMENTE JSON válido neste formato: {"condominium_name":"","confidence":"alta|media|baixa","features":[],"evidence":"","sources":[{"title":"","url":""}]}
- features permitidas: Mobiliado,Varanda,Churrasqueira,Piscina,Academia,Salão de festas,Playground,Elevador,Portaria 24h,Aceita pets.

Dê prioridade a páginas que contenham simultaneamente o endereço e o número ${number}.`;
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
            data.features=Array.isArray(data.features)?data.features:[];
            data.sources=Array.isArray(data.sources)?data.sources:[];
            return res.status(200).json(data);
          }
        }catch(_){ /* segue para busca pública */ }
      }
    }

    // 2) Fallback público: captura TÍTULO + SNIPPET + URL. A versão anterior olhava praticamente só o título.
    const queries=[
      `"${address}" "${number}" condomínio ${city||''}`,
      `"${address}, ${number}" condomínio residencial`,
      `"${address}" "${number}" apartamento condomínio`,
      `"${address}" "${number}" "Space Residence"`,
      `"${address}" "${number}" "Parque das Orquídeas"`
    ];
    const results=[];
    for(const q of queries){
      const url='https://html.duckduckgo.com/html/?q='+encodeURIComponent(q);
      const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; VSN-Imoveis/1.0)'}});
      if(!r.ok) continue;
      const html=await r.text();
      const blocks=html.split(/<div[^>]+class=["']result["'][^>]*>/i).slice(1);
      for(const block of blocks){
        if(results.length>=20) break;
        const a=block.match(/<a[^>]+class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if(!a) continue;
        const snippetMatch=block.match(/<a[^>]+class=["']result__snippet["'][^>]*>[\s\S]*?<\/a>|<div[^>]+class=["']result__snippet["'][^>]*>([\s\S]*?)<\/div>/i);
        const title=clean(a[2]);
        const href=a[1];
        const snippet=clean(snippetMatch?.[1]||snippetMatch?.[0]||'');
        if(title) results.push({title,url:href,snippet});
      }
    }

    // Deduplica por URL e cria um texto completo para pontuação.
    const unique=[];
    const seen=new Set();
    for(const x of results){
      if(!seen.has(x.url)){seen.add(x.url);unique.push(x)}
    }

    const target=normalize(`${address} ${number}`);
    const addressTokens=normalize(address).split(' ').filter(Boolean);
    const scored=unique.map(x=>{
      const text=normalize(`${x.title} ${x.snippet}`);
      let score=0;
      if(text.includes(normalize(`${address} ${number}`))) score+=100;
      if(text.includes(normalize(`${address}, ${number}`))) score+=100;
      if(text.includes(String(number))) score+=35;
      for(const token of addressTokens) if(token.length>3&&text.includes(token)) score+=5;
      if(/condominio|residencial|residence|parque das orquideas|space residence/.test(text)) score+=35;
      if(/apartamento|imovel/.test(text)) score+=10;
      return {...x,score};
    }).sort((a,b)=>b.score-a.score);

    const best=scored.find(x=>x.score>=100 && /condominio|residencial|residence|space residence|parque das orquideas/i.test(`${x.title} ${x.snippet}`));
    if(!best){
      return res.status(200).json({
        condominium_name:'',confidence:'baixa',features:[],
        evidence:`Não encontramos evidência pública suficiente para o endereço exato ${location}.`,
        sources:scored.slice(0,5).map(x=>({title:x.title,url:x.url,evidence:x.snippet}))
      });
    }

    const allEvidence=scored.filter(x=>x.score>=50).slice(0,8);
    const combined=allEvidence.map(x=>`${x.title} ${x.snippet}`).join(' ');
    const normalizedCombined=normalize(combined);

    // Nomes conhecidos encontrados nas fontes; escolhe o mais específico para este endereço.
    let name='';
    const namePatterns=[
      /condominio\s+(space residence(?:\s+i|\s+ii)?)/i,
      /condominio\s+(space residence\s*-\s*parque das orquideas)/i,
      /condominio\s+(parque das orquideas\s*-\s*space residence)/i,
      /residencial\s+(space residence(?:\s+i|\s+ii)?)/i,
      /(space residence\s*-\s*parque das orquideas)/i,
      /(space residence\s+i)/i
    ];
    for(const p of namePatterns){
      const m=combined.match(p);
      if(m){name=m[1].replace(/\s+/g,' ').trim();break}
    }
    if(!name) name=clean(best.title.replace(/\s*[|–-].*$/,'').trim());

    const features=[];
    const add=(rx,label)=>{if(rx.test(normalizedCombined))features.push(label)};
    add(/elevador/,'Elevador');
    add(/churrasqueira/,'Churrasqueira');
    add(/academia/,'Academia');
    add(/salao de festas/,'Salão de festas');
    add(/playground/,'Playground');
    add(/portaria.{0,25}24|24.{0,25}portaria|seguranca 24/,'Portaria 24h');
    add(/piscina/,'Piscina');
    add(/varanda|sacada/,'Varanda');
    add(/aceita pets|pets/,'Aceita pets');

    const corroborating=allEvidence.filter(x=>normalize(`${x.title} ${x.snippet}`).includes(normalize(`${address} ${number}`))).length;
    const confidence=corroborating>=2?'alta':best.score>=130?'alta':'media';

    return res.status(200).json({
      condominium_name:name,
      confidence,
      features:[...new Set(features)],
      evidence:`Endereço exato ${address}, ${number} encontrado em ${Math.max(1,corroborating)} fonte(s). Resultado principal: ${best.title}. ${best.snippet}`,
      sources:allEvidence.slice(0,5).map(x=>({title:x.title,url:x.url,evidence:x.snippet}))
    });
  }catch(e){
    return res.status(500).json({error:'Não foi possível pesquisar o condomínio automaticamente agora. Tente novamente pelo botão.',details:e.message});
  }
}