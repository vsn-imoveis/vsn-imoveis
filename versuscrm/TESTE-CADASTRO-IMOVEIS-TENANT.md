# Cadastro de imóveis por imobiliária — VersusCRM

Arquivos desta etapa:
- `api/crm-properties.js`: endpoint POST isolado do CRM.
- `versuscrm/supabase/migrations/20261016120000_properties_tenant_isolation.sql`: adiciona `company_id` e políticas RLS na tabela `properties`.

## Proteções implementadas
- A API valida o JWT do Supabase dedicado ao CRM.
- Busca a associação do usuário em `crm_memberships`.
- Exige exatamente uma imobiliária vinculada.
- Ignora qualquer `company_id` enviado pelo navegador e deriva o ID da associação autenticada.
- Insere com a chave publicável e JWT do usuário, mantendo RLS como camada final de autorização.
- Não usa service-role key e não altera as APIs de cadastro da VSN.

## Antes de executar a migração
1. Confirme no dashboard que o projeto selecionado é o Supabase dedicado do VersusCRM, ref `xmwkakimyifmspzoziji`.
2. Confira a estrutura real de `public.properties` e se os nomes dos campos da API correspondem às colunas existentes.
3. Confirme que `crm_memberships` tem `company_id` e `user_id`, e que usuários autenticados podem ler somente sua própria associação.
4. Aplique a migração apenas nesse projeto. Não a execute no Supabase legado da VSN.
5. Como a migração habilita RLS e substitui políticas nomeadas de propriedades, revise as políticas atuais de `properties` antes de aplicar. A migração não atribui registros antigos a empresas.

## Configuração da API
Configure no ambiente de preview/integração:
- `CRM_SUPABASE_URL` apontando para o projeto dedicado.
- `CRM_SUPABASE_ANON_KEY` ou `CRM_SUPABASE_PUBLISHABLE_KEY` com a chave publicável desse projeto.

O token do usuário deve ser enviado em `Authorization: Bearer <access_token>`.
O endpoint ainda não é chamado automaticamente pelo formulário HTML original; essa integração deve ocorrer depois da validação da tabela e do endpoint.

## Testes de segurança
- Sem token: HTTP 401.
- Token expirado/inválido: HTTP 401.
- Usuário sem associação: HTTP 403.
- Usuário com múltiplas associações: HTTP 403 até haver seletor de imobiliária explícito.
- `company_id` forjado no corpo: ignorado; o servidor usa a associação autenticada.
- Título vazio: HTTP 400.
- Mais de 35 fotos: HTTP 400.
- Tentativa de ler/alterar imóvel de outra empresa diretamente via API REST: deve ser bloqueada por RLS.
- Cadastro VSN existente e login administrativo VSN: não devem mudar; nenhuma página VSN importa esta API.

## Limitação pendente
Não foi possível verificar o esquema real do banco Blue Dog através das ferramentas conectadas nesta sessão. Por isso, a migração e o endpoint foram preparados na branch isolada, mas não foram aplicados nem executados. A integração do formulário deve aguardar a validação das colunas de `properties` e os testes acima.
