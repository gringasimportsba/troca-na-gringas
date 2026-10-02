# Gringas Troca

Frontend estático com Supabase como backend (Auth, PostgreSQL/RLS e Storage), usando o SDK no navegador. Nesta etapa não há Edge Function.

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

Abra `http://localhost:8000`. Não abra HTML via `file://`; UUIDs e APIs do navegador exigem localhost ou HTTPS. Esse servidor é apenas de desenvolvimento e expõe arquivos da pasta; em produção publique somente o frontend, use HTTPS e configure headers/CSP adequados ao SDK e ao Supabase.

## Configuração pública

Edite `js/config.js`: `mode: 'cloud'`, `supabaseUrl`, `supabaseAnonKey` (chave **publishable/anon**), `storeId: '11111111-1111-1111-1111-111111111111'`, `photoBucket: 'evaluation-photos'` e contato de WhatsApp. URL e chave pública podem estar no browser; **jamais use `service_role`, secret key ou senha do banco**.

`avaliar.html` e `admin.html` carregam o SDK oficial `supabase-js` v2 antes dos módulos da aplicação. Os repositories usam `window.supabase.createClient`. Usar chave pública não concede administração: a autorização é feita por grants e RLS.

## Instalar o banco

1. Crie um projeto Supabase. No **SQL Editor**, execute inteiro `supabase/setup.sql` como operador privilegiado.
2. O script cria/reutiliza `stores`, `store_members`, `evaluations` e o bucket privado, remove `claim_initial_gringas_admin` e substitui as permissões/policies dessas tabelas. É transacional e reaplicável sobre o schema original; não apaga registros ou membros. Em instalações existentes, faça backup, revise membros e objetos customizados antes: um owner criado pelo bootstrap antigo pode não ser legítimo. `CREATE TABLE IF NOT EXISTS` não reconcilia schemas customizados.
3. Crie/convide o primeiro administrador em **Authentication → Users**, confirme email e identidade por um canal confiável. No SQL Editor, encontre o UUID:

```sql
select id, email, email_confirmed_at
from auth.users
where lower(email) = lower('admin@sua-empresa.com');
```

4. Substitua o UUID abaixo pelo usuário verificado e execute **somente no SQL Editor**:

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

- **Criar avaliação:** `client.from('evaluations').insert(row)`, sem `.select()` e sem upsert. Anon e usuários autenticados podem criar apenas na loja fixa, com código `GT-${crypto.randomUUID()}`, `status: 'Nova'`, `approved_value: null` e `adjustment_reason` vazio/null. Não enviar `id`, timestamps nem `upgrade_*` no INSERT. O banco limita descrições, arrays, metadata, valores e payload a 32 KiB; fotos são paths, nunca base64/URLs. Nome até 160 caracteres, telefone até 40, observações até 4000, bateria 0–100/null. Estimativas entre 0 e 1.000.000 continuam sendo declarações não confiáveis do cliente, não preço aprovado.
- **Upload:** `client.storage.from('evaluation-photos').upload(path, blob, { upsert: false, contentType: blob.type })`. Path obrigatório: `<storeId>/<GT-uuid>/<nome-seguro>.jpg|jpeg|png|webp`. Nome com 1–100 letras ASCII, números, `_` ou `-` antes da extensão; UUID hexadecimal minúsculo. JPEG/PNG/WebP, até **6 MiB (6.291.456 bytes) por arquivo**. Em `photos`, usar objeto slot → path da própria loja/código, até seis referências. HEIC/HEIF não são aceitos.
- **Visitante:** não lê, altera ou apaga avaliações/fotos. Não recebe URL assinada. `updateUpgrade` público continua proibido: código não é autorização; guardar interesse só localmente ou informar claramente a falha. Nunca mostrar sucesso na nuvem após erro.
- **Painel:** membros leem somente avaliações/fotos da própria loja; `createSignedUrl` usa a sessão autenticada. Owner/admin/seller atualizam apenas `status`, `approved_value`, `adjustment_reason`, `upgrade_*` e `updated_at`; o banco controla timestamps. Viewer apenas lê dados administrativos (mantém a mesma possibilidade de envio público que qualquer visitante). Nenhum membro promove usuários, altera cliente/cálculo/fotos ou apaga registros via API.
- UPDATE com RLS pode afetar zero linhas sem erro: confirmar retorno/registro antes de anunciar sucesso. Status aceitos são os oito estados do painel, de `Nova` a `Cliente desistiu`. Valores operacionais até 1.000.000; diferença de upgrade pode ser negativa.

## Limitações e operação

**Não há proteção total contra spam.** O ingresso anônimo permite criar muitas avaliações e arquivos: UUID, RLS, limites por registro/arquivo, CORS e validação no browser não são rate limiting. Não há quota por pessoa/IP/dia nem limite real de seis uploads — apenas seis referências por avaliação. Monitore volume/custos, defina retenção e limpe órfãos por operação privilegiada via Storage API. Falhas entre upload e INSERT podem deixar arquivos; tentativa de limpeza pelo visitante será negada.

MIME/extensão não comprovam conteúdo real da imagem; não há inspeção, remoção de EXIF nem prova de propriedade/existência da foto referenciada. Pastas UUID não são credenciais: quem conhecer um código pode tentar inserir novos arquivos nessa pasta, mas não ler/substituir os existentes. Membros podem ler também uploads órfãos da sua loja. Trate todo conteúdo recebido como não confiável e renderize-o sem interpolação HTML insegura.

Policies restritivas protegem este bucket contra permissões amplas legadas; pressupõem roles/RLS padrão do Supabase. Funções privilegiadas, views, roles customizadas e dados antigos exigem revisão própria. URLs assinadas já emitidas e caches não são invalidados imediatamente ao revogar membership.

**Evolução recomendada:** Edge Function com CAPTCHA validado no servidor, rate limit compartilhado/atômico, quotas de bytes/volume, validação real de imagens e cálculos confiáveis; nessa etapa futura, fechar novamente a escrita anônima direta para não permitir contorno do endpoint.

A organização e a sintaxe dos módulos foram verificadas localmente. O SQL não foi executado e nenhum banco remoto foi acessado; valide a integração em um projeto Supabase de desenvolvimento antes da produção.
