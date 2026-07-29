---
'@adonis-agora/agent-dashboard': minor
---

O console de governança agora também se recusa a montar quando `governanceQueries: false`, não só quando falta o `governanceAuthorize`.

Os dois casos produzem o MESMO console quebrado — 10 dos 11 endpoints de leitura do console são `/agent/governance/*`, e sem read-model essas rotas não existem, então todo painel menos o Quota dá 404 no clique. Antes, `governanceQueries: false` com um gate configurado passava pela checagem de mount e servia esse console morto sem nada explicando o motivo.

**Como voltar a ter o console:** o aviso de boot agora nomeia QUAL das duas peças falta, porque as duas quebram igual e mensagem genérica não ajuda ninguém a diagnosticar.

- Faltando o gate → configure `governanceAuthorize` em `config/agent.ts` (tipicamente uma checagem de ADMIN), ou `governanceAuthorize: () => true` pra restaurar deliberadamente o comportamento antigo de deixar QUALQUER ator autenticado ler.
- `governanceQueries: false` → remova essa linha (omitir dá o read-model Lucid quando o store principal é Lucid) ou passe um store/factory explícito.
- Pra manter o console desligado de propósito e sem aviso: `dashboard: { enabled: false }`.

Só um `false` explícito em `governanceQueries` bloqueia o mount. `undefined` NÃO é esse caso: o provider do agent resolve o read-model Lucid por default quando o store principal é Lucid, então omitir a chave continua montando o console normalmente.

`GET /agent/approvals/mine` segue inalterado — montado e escopado ao ator chamador.
