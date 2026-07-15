---
'@adonis-agora/agent-dashboard': minor
---

Acompanha o `@adonis-agora/agent` 0.2.x (o peer passa de `^0.1.0` para `^0.2.0`).

O dashboard em si não mudou. Ele sobe junto porque o peer aponta para uma faixa que o agent acabou
de deixar: publicar só o agent deixaria `agent-dashboard@0.1.0` exigindo um agent `^0.1.0` que não
é mais a versão corrente.

O peer já vai fixado em `^0.2.0` neste commit de propósito. Se ele ficasse em `^0.1.0`, o agent
subindo para 0.2.0 o deixaria fora de range, e o changesets responde a isso bumpando o dependente
para **major** (1.0.0) — mesmo com este changeset pedindo minor, porque ele toma o máximo dos dois.
Com o peer já dentro da faixa nova, a cascata não dispara.
