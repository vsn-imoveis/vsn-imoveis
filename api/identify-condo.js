export default function handler(req,res){
  if(req.method!=='POST'){
    return res.status(405).json({error:'Método não permitido'});
  }

  const body=req.body||{};
  const {address,number,cep,city,state}=body;

  if(!address||!number){
    return res.status(400).json({error:'Informe endereço e número.'});
  }

  return res.status(200).json({
    ok:true,
    condominium_name:'',
    name_variants:[],
    confidence:'baixa',
    evidence:'Função base funcionando. Nenhuma lista fixa ou pesquisa externa foi usada.',
    sources:[],
    debug:{
      stage:'base',
      request:{address,number,cep:cep||'',city:city||'',state:state||''}
    }
  });
}