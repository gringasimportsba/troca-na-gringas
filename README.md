# Gringas Troca

Frontend estático com Supabase como backend (Auth, PostgreSQL/RLS e Storage), usando o SDK no navegador. O envio público usa uma sessão anônima do Supabase Auth para identificar o remetente sem exigir formulário de cadastro.

## Estrutura e execução

- `index.html`, `avaliar.html`, `admin.html`: páginas públicas e painel.
- `js/shared/`: validação e sanitização reutilizáveis.
- `js/evaluation/`: regras, persistência e fluxo da avaliação.
- `js/admin/`: acesso a dados e interface do painel.
- `css/`, `assets/`: estilos e recursos visuais.
- **`supabase/setup.sql`**: SQL de instalação vigente; use este arquivo, não os setups anteriores.

Para desenvolvimento, na raiz do repositório:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra `http://localhost:8000`. Não abra HTML via `file://`; UUIDs e APIs do navegador exigem localhost ou HTTPS. Esse servidor é apenas de desenvolvimento e expõe arquivos da pasta; em produção publique somente o frontend e use HTTPS. O `vercel.json` já define CSP e demais headers de segurança; se trocar de projeto Supabase ou de CDN, atualize a CSP. O SDK do Supabase é carregado com versão fixa e SRI: ao atualizá-lo, recalcule o hash `integrity` em `avaliar.html` e `admin.html`.

## Configuração pública

Edite `js/config.js`: `mode: 'cloud'`, `supabaseUrl`, `supabaseAnonKey` (chave **publishable/anon**), `storeId: '11111111-1111-1111-1111-111111111111'`, `photoBucket: 'evaluation-photos'` e contato de WhatsApp. URL e chave pública podem estar no browser; **jamais use `service_role`, secret key ou senha do banco**.

`avaliar.html` e `admin.html` carregam o SDK oficial `supabase-js` v2 antes dos módulos da aplicação. Os repositories usam `window.supabase.createClient`. Usar chave pública não concede administração: a autorização é feita por grants e RLS.

## Instalar o banco

1. Crie um projeto Supabase. Em **Authentication → Providers → Anonymous Sign-Ins**, habilite logins anônimos. Revise também os limites de requisição do Auth; eles são parte da proteção básica do envio público.
2. No **SQL Editor**, execute inteiro `supabase/setup.sql` como operador privilegiado.
3. O script cria/reutiliza `stores`, `store_members`, `evaluations`, `pricing_models`, `pricing_rules`, `upgrade_products` e o bucket privado, cria o trigger que calcula a estimativa no banco, adiciona `submitted_by`, remove `claim_initial_gringas_admin` e substitui as permissões/policies dessas tabelas. É transacional e reaplicável sobre o schema original; não apaga avaliações ou membros. Em instalações existentes, faça backup, revise membros e objetos customizados antes: um owner criado pelo bootstrap antigo pode não ser legítimo. `CREATE TABLE IF NOT EXISTS` não reconcilia schemas customizados.
4. Crie/convide o primeiro administrador em **Authentication → Users**, confirme email e identidade por um canal confiável. No SQL Editor, encontre o UUID:

```sql
select id, email, email_confirmed_at
from auth.users
where lower(email) = lower('admin@sua-empresa.com');
```

5. Substitua o UUID abaixo pelo usuário verificado e execute **somente no SQL Editor**:

```sql
insert into public.store_members (store_id, user_id, role)
select
  '11111111-1111-1111-1111-111111111111'::uuid,
  id,
  'owner'
from auth.users
where id = 'SUBSTITUA_PELO_UUID_REAL'::uuid
  and email_confirmed_at is not null
  and deleted_at is null
  and (banned_until is null or banned_until < now())
returning store_id, user_id, role;
```

É necessário retornar uma linha. Sem resultado, revise a conta; conflito indica membership existente e exige revisão, não autopromoção. Para outros membros, repita explicitamente com `admin`, `seller` ou `viewer`. Para revogar acesso, remova a membership específica pelo SQL Editor e encerre as sessões pelo Auth. Não existe RPC pública de provisionamento. Desabilite signup público se não for necessário para o produto.

## Contrato do navegador

- **Sessão de envio:** antes do primeiro envio, o repository reutiliza a sessão existente ou chama `auth.signInAnonymously()`. A identidade do JWT vira `submitted_by`; esse valor não é aceito no payload enviado pelo navegador. O remetente pode ler e editar somente sua própria avaliação enquanto o status for `Nova`. Isso não concede acesso a `store_members` nem ao painel.
- **Criar avaliação:** primeiro insere a linha com `photos: {}` e código `GT-${crypto.randomUUID()}`; depois envia as fotos e atualiza a mesma linha. O botão **Voltar e editar** preserva código e identidade, portanto não cria um segundo lead. Se a criação ou o upload falhar, o repository remove os arquivos enviados e pode excluir por até 15 minutos a linha ainda vazia. Não enviar `id`, timestamps, `submitted_by` nem `upgrade_*`.
- **Upload:** path obrigatório: `<storeId>/<GT-uuid>/<slot>-<uuid>.jpg|jpeg|png|webp`, onde o slot é `front`, `back`, `left`, `right` ou `detail`. O banco exige uma avaliação `Nova` pertencente ao JWT. Cada slot aceita no máximo duas versões simultâneas para permitir substituição com cleanup; JPEG/PNG/WebP têm limite de **6 MiB (6.291.456 bytes)** no envio; a foto escolhida pode ter até 20 MiB, pois é reduzida no aparelho antes de subir. O remetente pode ler/apagar somente objetos cujo `owner_id` seja o próprio usuário. HEIC/HEIF não é aceito.
- **Validação:** o banco limita descrições, arrays, metadata, valores e payload a 32 KiB; fotos são paths, nunca base64 ou URLs. A estimativa é **recalculada pelo banco** (trigger `calculate_evaluation_values`, com as tabelas `pricing_models` e `pricing_rules`); os valores enviados pelo navegador são descartados. Quando o remetente reenvia sem mudar as respostas, os valores gravados são mantidos. A estimativa continua sendo uma referência, não preço aprovado. A validação roda novamente quando o remetente edita o payload.
- **Modo local:** avaliações continuam disponíveis no painel local, mas os base64 das fotos nunca são persistidos no `localStorage`. A tela informa essa limitação ao usuário.
- **Painel:** membros leem somente avaliações/fotos da própria loja; `createSignedUrl` usa a sessão autenticada. Owner/admin/seller atualizam os campos operacionais permitidos; viewer apenas lê. Nenhum membro é provisionado ou promovido pelo frontend.

## Preços e regras

No modo cloud o cálculo oficial roda no banco. Preços e regras são editados no painel, por owner/admin:

- **Aparelhos e preços:** valor-base de cada modelo (`pricing_models`) e acréscimo por capacidade (`pricing_rules.storageBonus`).
- **Regras de avaliação:** descontos de bateria, estado físico, tela, funções, manutenção e o limite de desconto automático (`pricing_rules`). O trigger `validate_pricing_rules` recusa regras malformadas, que travariam o cálculo.
- **Produtos para upgrade:** catálogo da tela "Escolha seu próximo iPhone" (`upgrade_products`). O formulário lê os produtos ativos; se a leitura falhar, usa a lista padrão de `calculator.js`.

Seller e viewer só consultam. Rodar o `setup.sql` de novo não sobrescreve valores editados.

`js/evaluation/calculator.js` ainda monta as opções do formulário (modelos, capacidades e respostas) e calcula no modo local. O painel altera só valores; para **adicionar um modelo, capacidade ou opção de resposta**, altere no JS e no banco, senão o envio é recusado.

## Ordem de implantação (Supabase antes do código)

Esta versão do código exige o login anônimo e o `setup.sql` atual. Faça nesta ordem:

1. **Diagnóstico** no SQL Editor: `select policyname, roles from pg_policies where schemaname = 'public' and tablename = 'evaluations';` e `select * from public.store_members;`.
2. **Backup:** Database → Backups, ou exporte `evaluations` em CSV pelo Table Editor.
3. **Authentication → Sign In / Providers → Anonymous Sign-Ins:** habilitar.
4. **SQL Editor:** rodar `supabase/setup.sql` inteiro. Se abortar, nada é aplicado; leia a mensagem.
5. **Publicar o código** (merge do PR).
6. **Teste:** enviar uma avaliação; em `evaluations`, a linha deve ter `submitted_by` preenchido e a estimativa calculada.
7. **Admin:** criar o primeiro owner, se não houver (seção "Instalar o banco", passos 4 e 5).

Se o envio falhar, o formulário oferece ao cliente um botão para mandar a avaliação pelo WhatsApp.

## Limitações e operação

Existe uma proteção básica contra abuso: envio exige Supabase Auth, cada identidade pode criar até cinco avaliações em 15 minutos, o Auth acrescenta seus limites de criação de sessão e cada avaliação possui no máximo cinco slots de foto, com até duas versões temporárias por slot. Isso reduz spam acidental e abuso simples, mas **não substitui CAPTCHA, WAF ou rate limit por IP compartilhado**; um atacante distribuído ainda pode criar sessões diferentes. Monitore volume, usuários anônimos e custos, e defina uma política de retenção.

O fluxo remove uploads parciais e fotos substituídas usando a identidade proprietária. Uma interrupção abrupta do navegador ou da rede ainda pode impedir o cleanup final; o limite de duas versões por slot impede crescimento ilimitado dentro da mesma avaliação. Para garantia operacional completa, agende uma rotina privilegiada que compare `storage.objects` com `evaluations.photos` e remova arquivos antigos não referenciados pela Storage API.

MIME/extensão não comprovam conteúdo real da imagem; não há inspeção binária, antivírus ou remoção explícita de EXIF no servidor. A recompressão em canvas normalmente elimina metadados, mas isso não deve ser tratado como garantia de segurança. Trate todo conteúdo recebido como não confiável.

Policies restritivas protegem o bucket contra permissões amplas legadas e pressupõem roles/RLS padrão do Supabase. Funções privilegiadas, views, roles customizadas e dados antigos exigem revisão própria. URLs assinadas já emitidas e caches não são invalidados imediatamente ao revogar membership.

**Evolução recomendada se o projeto ganhar tráfego:** Edge Function com CAPTCHA validado no servidor, rate limit compartilhado/atômico, quotas globais, inspeção real de imagens e cálculo confiável no backend.

A organização e a sintaxe dos módulos foram verificadas localmente. O SQL não foi executado e nenhum banco remoto foi acessado; valide a integração em um projeto Supabase de desenvolvimento antes da produção.
