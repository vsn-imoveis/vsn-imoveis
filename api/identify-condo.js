export default async function handler(req,res){
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Método não permitido'});
    const body=req.body||{};
    const {address,number,cep}=body;
    if(!address||!number) return res.status(400).json({error:'Informe endereço e número.'});

    const norm=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const a=norm(address);
    const n=String(number).trim();
    const c=String(cep||'').replace(/\\D/g,'');

    // DEBUG FASE 1: confirma que Painel -> API -> Vercel está funcionando.
    // Mantemos somente os casos já confirmados para não introduzir buscas externas
    // enquanto isolamos o problema.
    if(a.includes('estrada do campo limpo')&&n==='5930'){
      return res.status(200).json({
        condominium_name:'Space Residence I',
        confidence:'alta',
        features:['Churrasqueira','Academia','Salão de festas','Playground'],
        evidence:'Identificação determinística de endereço já confirmado.',
        sources:[]
      });
    }

    return res.status(200).json({
      condominium_name:'',
      confidence:'baixa',
      features:[],
      evidence:'API OK — FASE 1. Dados recebidos: endereço + número' + (c?' + CEP':'') + '. Busca externa temporariamente desativada para diagnóstico.',
      sources:[]
    });
  }catch(e){
    return res.status(500).json({error:'Erro interno da API.',details:String(e?.message||e)});
  }
}
