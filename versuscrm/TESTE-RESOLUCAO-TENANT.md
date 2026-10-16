# Teste da resolução pública de imobiliárias

A API nova está em `/api/crm-tenant?slug=mario`. Ela é isolada e não substitui nenhuma rota da VSN.

## Variáveis exigidas apenas no ambiente de integração
- `CRM_SUPABASE_URL`: URL do projeto Supabase dedicado ao CRM (Blue Dog).
- `CRM_SUPABASE_ANON_KEY` ou `CRM_SUPABASE_PUBLISHABLE_KEY`: chave publicável desse mesmo projeto.

Não copie para estas variáveis a URL/chave do Supabase legado da VSN. Não use a service-role key no navegador.

## Contrato esperado do RPC
`public.get_public_crm_company(p_slug text)` deve devolver, para um slug ativo, os campos:
`id, name, slug, logo_url, primary_color, status`.
O RPC deve filtrar `status = 'active'` no servidor e nunca devolver e-mail, telefone, dados de cobrança, membros ou outras informações privadas.

## Testes manuais após configurar as variáveis
1. `GET /api/crm-tenant?slug=mario` — deve retornar somente os campos públicos acima.
2. `GET /api/crm-tenant?slug=nao-existe` — deve retornar 404.
3. `GET /api/crm-tenant?slug=../admin` — deve retornar 400.
4. `POST /api/crm-tenant?slug=mario` — deve retornar 405.
5. Desative temporariamente a variável no ambiente de preview: deve retornar 503, sem tentar usar o banco antigo.

A resolução ainda não é usada por nenhuma página. Essa separação é intencional até a validação do endpoint e a integração gradual das páginas.
