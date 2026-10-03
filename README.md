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
3. O script cria/reutiliza `stores`, `store_members`, `evaluations` e o bucket privado, adiciona `submitted_by`, remove `claim_initial_gringas_admin` e substitui as permissões/policies dessas tabelas. É transacional e reaplicável sobre o schema original; não apaga avaliações ou membros. Em instalações existentes, faça backup, revise membros e objetos customizados antes: um owner criado pelo bootstrap antigo pode não ser legítimo. `CREATE TABLE IF NOT EXISTS` não reconcilia schemas customizados.
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
- **Validação:** o banco limita descrições, arrays, metadata, valores e payload a 32 KiB; fotos são paths, nunca base64 ou URLs. Estimativas continuam sendo declarações não confiáveis do navegador, não preço aprovado. A validação roda novamente quando o remetente edita o payload.
- **Modo local:** avaliações continuam disponíveis no painel local, mas os base64 das fotos nunca são persistidos no `localStorage`. A tela informa essa limitação ao usuário.
- **Painel:** membros leem somente avaliações/fotos da própria loja; `createSignedUrl` usa a sessão autenticada. Owner/admin/seller atualizam os campos operacionais permitidos; viewer apenas lê. Nenhum membro é provisionado ou promovido pelo frontend.

## Pendências que dependem de acesso ao Supabase

1. Habilitar **Anonymous Sign-Ins** e rodar `supabase/setup.sql`. Enquanto isso não for feito, `js/evaluation/repository.js` usa um envio temporário e inseguro, sem sessão (flag `ALLOW_LEGACY_ANONYMOUS_SUBMISSION`). Depois, mude a flag para `false` e apague `createCloudLegacy()` e o bloco `if (!session)` em `saveEvaluation()`.
2. Criar tabelas de preços, regras e upgrades (hoje fixos em `js/evaluation/calculator.js`) e passar a editá-los pelo admin.
3. Calcular a estimativa no servidor (RPC ou Edge Function), em vez de confiar no valor enviado pelo navegador.

## Limitações e operação

Existe uma proteção básica contra abuso: envio exige Supabase Auth, cada identidade pode criar até cinco avaliações em 15 minutos, o Auth acrescenta seus limites de criação de sessão e cada avaliação possui no máximo cinco slots de foto, com até duas versões temporárias por slot. Isso reduz spam acidental e abuso simples, mas **não substitui CAPTCHA, WAF ou rate limit por IP compartilhado**; um atacante distribuído ainda pode criar sessões diferentes. Monitore volume, usuários anônimos e custos, e defina uma política de retenção.

O fluxo remove uploads parciais e fotos substituídas usando a identidade proprietária. Uma interrupção abrupta do navegador ou da rede ainda pode impedir o cleanup final; o limite de duas versões por slot impede crescimento ilimitado dentro da mesma avaliação. Para garantia operacional completa, agende uma rotina privilegiada que compare `storage.objects` com `evaluations.photos` e remova arquivos antigos não referenciados pela Storage API.

MIME/extensão não comprovam conteúdo real da imagem; não há inspeção binária, antivírus ou remoção explícita de EXIF no servidor. A recompressão em canvas normalmente elimina metadados, mas isso não deve ser tratado como garantia de segurança. Trate todo conteúdo recebido como não confiável.

Policies restritivas protegem o bucket contra permissões amplas legadas e pressupõem roles/RLS padrão do Supabase. Funções privilegiadas, views, roles customizadas e dados antigos exigem revisão própria. URLs assinadas já emitidas e caches não são invalidados imediatamente ao revogar membership.

**Evolução recomendada se o projeto ganhar tráfego:** Edge Function com CAPTCHA validado no servidor, rate limit compartilhado/atômico, quotas globais, inspeção real de imagens e cálculo confiável no backend.

A organização e a sintaxe dos módulos foram verificadas localmente. O SQL não foi executado e nenhum banco remoto foi acessado; valide a integração em um projeto Supabase de desenvolvimento antes da produção.
