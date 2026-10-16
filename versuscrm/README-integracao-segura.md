# Integração segura do VersusCRM com o projeto HTML da VSN

## Estado desta branch
Esta branch parte de `main` e é isolada da produção: `integration/versuscrm-safe`.
Nenhuma alteração de roteamento, autenticação, banco de dados ou deploy de produção foi feita neste passo.

## Limites obrigatórios
- Não alterar `site-auth.js` nem o fluxo de login administrativo atual da VSN.
- Não apontar o site atual para o projeto Supabase Blue Dog.
- Não executar migrações de CRM no projeto Supabase legado `jpdfynaioepcmgqlqlht`.
- Não alterar `vercel.json` até existir resolução de tenant e testes de regressão para as rotas atuais.
- Manter páginas, APIs, ativos, SEO, sitemap, importador de anúncios e área do proprietário existentes.

## Achados da auditoria inicial
- O site original é estático/HTML com funções serverless em `api/`.
- `site-auth.js` cria o cliente Supabase com URL e chave publicável do banco legado. Isso faz parte do login existente e não deve ser trocado durante a integração.
- `api/property-share.js` consulta `public_properties` no banco legado e monta páginas compartilháveis com SEO. Essa rota deve continuar intacta para o site VSN.
- `api/leads.js` envia leads para o e-mail fixo da VSN. Para tenants será necessário acrescentar uma ramificação isolada por tenant, sem mudar o comportamento quando a rota atual é usada pela VSN.
- `vercel.json` tem rewrites importantes para `/imovel/:slug`, `/condominio/:slug` e `/sitemap-properties.xml`; rotas de tenant precisam ser desenhadas sem capturar ou quebrar essas rotas.

## Próxima implementação, em etapas pequenas
1. Preparar uma camada nova e isolada para resolver o tenant a partir do caminho/subdomínio, sem carregá-la nas páginas VSN existentes.
2. Criar endpoints CRM no servidor que consultem exclusivamente o Supabase Blue Dog por variáveis de ambiente específicas do CRM.
3. Aplicar isolamento por `company_id` em dados e operações, com autorização server-side e RLS no banco dedicado.
4. Integrar cópias/adaptações das páginas HTML originais somente em rotas de tenant; preservar os arquivos originais.
5. Testar regressão das rotas atuais e fluxo de login VSN antes de qualquer alteração de produção.

## Bloqueio de segurança conhecido
As migrações antigas de CRM contêm uma anotação de aplicação no banco legado. Elas não devem ser executadas novamente nesse banco. Antes de preparar uma migração para Blue Dog, comparar a estrutura real existente nesse projeto dedicado e gerar uma migração idempotente específica para ele.
