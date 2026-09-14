# Design Partner Pack — kit do canal B (19 dias)

> Owner: Head of Sales Engineering · Criado: 2026-09-11 (canal B aprovado pelo founder no mesmo dia)
> **O que o founder leva para a conversa.** O funil e o ICP continuam em
> [icp.md](icp.md); a trilha fria em [geo-campaign-kit.md](geo-campaign-kit.md).
> Este kit é só o canal B: **3 a 5 design partners no Managed Visibility
> (OrganicPosts by Ozvor), US$ 750 no 1º mês, US$ 1.500/mês depois**, vindos da
> rede do founder, com meta de 10 clientes pagos até 30/09.

## TL;DR

O founder faz as 10 conversas. Nós construímos o que ele leva: um documento de
1–2 páginas **por empresa**, gerado de uma **auditoria REAL** (não um exemplo,
não um modelo). Um comando: `npx tsx scripts/design-partner-pack.ts`. Ele
imprime o custo (~US$ 0,55) e **para**; só gasta com `--confirm`; recusa rodar
com motor sem API key, porque um pack feito de mock é uma auditoria fabricada
com o nome de uma empresa real. O pack mostra onde a empresa não aparece
(perguntas reais + motores + quem foi citado no lugar), as 3 ações mais fortes
do Do Next em linguagem de cliente, o que fazemos nos primeiros 30 dias, **o
que NÃO prometemos** (secção 28, sempre, não editável) e a oferta. Sai em
inglês por omissão e em pt-BR com `--lang pt-BR`. Dois e-mails de abordagem
(conhecido / conhecido de conhecido), texto puro, **sem link no 1º**, uma
pergunta. Cada design partner entra no `crm_contact` com
`source='design-partner'` e o funil aparece em `/api/v1/operator/crm` para o
weekly-report ler. **Nada é enviado pela máquina: o founder envia.**

---

## 1. Gerar o pack (1 comando)

```bash
# 1) SEMPRE primeiro: ver o custo. Isto não chama motor nenhum.
npx tsx scripts/design-partner-pack.ts \
  --domain northgateroofing.com \
  --company "Northgate Roofing" \
  --category "roofing contractor" \
  --competitors "Summit Roofworks,Harborline Roofing"

# 2) Aprovar e rodar de verdade (gasta dinheiro):
#    ... o mesmo comando + --confirm
```

O que ele imprime antes de gastar (exemplo real):

```
Design Partner Pack — cost before anything runs
Company        Northgate Roofing
Category       roofing contractor
Questions      10
Engines        openai, anthropic, gemini, perplexity
Answers read   80

  anthropic      20 gens x 1.64c = $0.33
  perplexity     20 gens x 0.68c = $0.14
  openai         20 gens x 0.41c = $0.08
  gemini         20 gens x 0.00c = $0.00
  extraction      0 calls x 0.20c = $0.00

ESTIMATED COST: $0.55 (floor — escalation can add runs)
It will be recorded in api_spend as op='design_partner_pack'.

NOTHING WAS CALLED AND NOTHING WAS CHARGED. Re-run with --confirm to approve.
```

### As opções que importam

| Flag | Para quê |
|---|---|
| `--category "<o que o comprador procura>"` | **Obrigatória ao vivo.** Ela define as 10 perguntas. Sem ela, adivinharíamos o mercado e venderíamos o palpite como medição. |
| `--competitors "A,B"` | Opcional e honesta: **sem ela o pack mostra as FONTES da resposta e não afirma quem venceu.** Com ela, mostra os nomes. |
| `--lang pt-BR` | O mesmo pack em português. Regra da casa: peça pública sai em inglês; a rede do founder recebe em PT quando ele pedir. |
| `--out <caminho>` | Onde escrever o HTML (por omissão `./design-partner-<domínio>.html`). |
| `--fixture <caminho>` | Constrói de uma auditoria **gravada**: zero motor, zero custo, não precisa de `--confirm`. É como se ensaia e como os testes correm. |
| `--confirm` | Aprova o gasto. **Sem ela nada é chamado.** |

### O que ele recusa fazer

- **Gastar sem `--confirm`.** Por omissão imprime e sai.
- **Rodar ao vivo com um motor sem API key.** O adaptador sem chave responde de
  um mock determinístico, e um pack feito de mocks é uma auditoria fabricada com
  o nome de uma empresa real (regra de integridade, PR #90). Ele diz quais
  motores, e para.
- **Rodar ao vivo sem `DATABASE_URL`.** Uma chamada paga que não conseguimos ver
  é dinheiro que não temos. O gasto vai para `api_spend` como
  `op='design_partner_pack'`.
- **Renderizar sem evidência.** Zero perguntas sondadas = erro, não um pack de
  exemplo.
- **Deixar passar a copy proibida da secção 28** — em inglês ou português. O
  lint lê o que **nós** escrevemos; as palavras verbatim do prospect (a pergunta
  dele, o nome do concorrente) não disparam o bloqueio, porque citar o mercado
  de volta é evidência, não promessa.

### Depois de gerar

Abra o HTML no browser e imprima para PDF. É autossuficiente: nada de rede, nada
de fonte externa, abre de um `file://` num portátil sem internet, numa reunião.

O resumo no terminal diz também quantas ações o **guarda de especificidade
recusou** e por quê. Uma ação recusada é uma lacuna na NOSSA evidência: o
founder precisa saber disso antes da conversa, não durante.

---

## 2. O que está dentro do pack

1. **Cabeçalho honesto** — data, versão do método, que motores perguntámos, e
   quais **não** perguntámos (bloqueio de região) ou falharam. Cobertura nunca é
   escondida.
2. **Uma linha de resumo** — "Fizemos 5 perguntas. Lemos 8 respostas. Você
   apareceu em 2."
3. **Onde o comprador procura e você não está** — a pergunta real, o motor, quem
   foi citado no lugar, de que fontes a resposta foi montada.
4. **Onde você já aparece** — com a posição. Se não aparece em lado nenhum, o
   pack diz isso: *"No answer named you in this run. That is the honest result."*
5. **Os 3 movimentos mais fortes** — do Do Next, em linguagem de cliente. Cada
   um com: a pergunta que resolve, o motor, quem venceu, o artefato que
   produzimos, o que significa "pronto", **a data de rechecagem** e quem faz.
   São três gaps **diferentes**, nunca o mesmo conselho três vezes.
6. **Os primeiros 30 dias**, semana a semana (cadência da secção 8 do relatório).
7. **O que NÃO prometemos** — secção 28, sempre presente, não editável por
   prospect.
8. **A oferta de design partner** — US$ 750 no 1º mês, US$ 1.500/mês depois, sem
   fidelidade, export completo, cinco vagas.
9. **O CTA** — `/book` + `hello@ozvor.com`.

### Diferença de método, dita em voz alta

O teste do pack é **"a resposta citou a marca"**. Ele **não** roda o verificador
de duas passagens que uma auditoria paga roda, por isso não há chamadas de
extração no custo. Isto está impresso no pré-voo e o pack nunca afirma mais do
que mediu.

---

## 3. Os dois e-mails de abordagem

Regras aplicadas: texto puro, **ZERO link/URL/domínio no 1º toque**, **uma**
pergunta, ≤80 palavras, frases ≤12 palavras, nível 15-17, assinatura "Otavio".
Links só a partir do 2º toque, sempre com `?from=design-partner`.
**Nada é enviado pela máquina — o founder envia, do e-mail dele.**

> **Antes de enviar qualquer um dos dois: gere o pack.** As duas versões afirmam
> um resultado ("o seu nome não apareceu"). Se o pack disser o contrário, use a
> variante do fim desta secção. Nunca afirmar um achado que não medimos.

### Versão A — alguém que ele conhece bem

```
Assunto: uma coisa rápida

Oi {{primeiro_nome}},

Fiz um teste real sobre a {{empresa}} na busca com IA.
Perguntei ao ChatGPT, Claude, Gemini e Perplexity o que os teus
clientes perguntam.
Escrevi as respostas, e quem apareceu no teu lugar.
Estou a pegar três design partners este mês.

Posso te mostrar o que encontrei esta semana?

Otavio

P.S. Se preferires que eu não escreva mais, responde PARA e eu paro.
```

**English:**

```
Subject: quick one

Hi {{first_name}},

I ran a real test on {{company}} in AI search.
I asked ChatGPT, Claude, Gemini and Perplexity what your buyers ask.
I wrote down the answers, and who came up instead.
I am taking three design partners this month.

Can I show you what I found this week?

Otavio

P.S. If you'd rather not hear from me, just reply STOP and I won't write again.
```

### Versão B — conhecido de conhecido

```
Assunto: {{quem_indicou}} disse para eu escrever

Oi {{primeiro_nome}},

{{quem_indicou}} disse que tu tocas a {{empresa}}.
Eu faço ferramentas de visibilidade em busca com IA.
Fiz um teste real sobre a {{empresa}}.
Perguntei ao ChatGPT, Claude, Gemini e Perplexity o que os teus
clientes perguntam.
Na maioria, o teu nome não apareceu. Apareceu outro.
Quero três conversas honestas antes de vender isto.

Vinte minutos te seriam úteis?

Otavio

P.S. Se preferires que eu não escreva mais, responde PARA e eu paro.
```

**English:**

```
Subject: {{referrer}} said I should write

Hi {{first_name}},

{{referrer}} said you run {{company}}.
I build AI-search visibility tools.
I ran a real test on {{company}}.
I asked ChatGPT, Claude, Gemini and Perplexity what your buyers ask.
On most of them your name did not come up. Someone else did.
I want three honest conversations before I sell this.

Would twenty minutes be useful to you?

Otavio

P.S. If you'd rather not hear from me, just reply STOP and I won't write again.
```

### Variante obrigatória quando a empresa JÁ aparece

Trocar a linha do achado por uma destas, conforme o pack:

- PT: *"Apareces em algumas. Nas que pagam, aparece outro."*
- EN: *"You come up on some. On the ones that pay, someone else does."*

E se aparecer em todas: **não enviar este e-mail.** Não há dor a mostrar, e
inventá-la queimaria a relação que é o ativo do canal B.

### Checagem antes de colar no cliente de e-mail

1. O 1º toque não tem **nenhuma** URL, `.com`, nem domínio escrito.
2. Há **uma** pergunta, no fim.
3. ≤80 palavras, frases ≤12 palavras.
4. O achado afirmado bate com o pack gerado para ESTA empresa.
5. O rodapé de opt-out está lá, depois da assinatura (decisão do founder 02/09:
   só a linha de opt-out, sem endereço postal — risco aceito e registado em
   [sop-dia-do-disparo.md](sop-dia-do-disparo.md)).

O pack **não** vai anexado no 1º toque. Ele é o que o founder abre **na
conversa**, ou envia no 2º toque com `ozvor.com/book?from=design-partner`.

---

## 4. Registar no CRM

Cada design partner entra em `crm_contact` com `source='design-partner'` desde o
primeiro toque, e o ficheiro dele cresce por **linhas anexadas**, nunca
substituídas (`appendNote` — é assim que
[`lib/dossier.ts`](../../../apps/api/src/lib/dossier.ts) já lê o histórico).

```bash
# Primeiro toque
curl -X PATCH https://api.ozvor.com/api/v1/operator/crm \
  -H "Authorization: Bearer $OPERATOR_KEY" -H "Content-Type: application/json" \
  -d '{"email":"sam@northgateroofing.com","stage":"contacted",
       "source":"design-partner",
       "appendNote":"pack gerado 2026-09-11, 6 lacunas, 3 acoes; e-mail versao A"}'

# Depois da conversa
  -d '{"email":"sam@northgateroofing.com","stage":"call_done",
       "appendNote":"conversa 12/09: dor real e o Summit aparecer no lugar; quer a proposta"}'
```

### O funil (o que o weekly-report lê)

`GET /api/v1/operator/crm` devolve, além dos contactos, um bloco
`designPartnerFunnel` já somado:

| Estágio | Valor guardado |
|---|---|
| Contatado | `contacted` |
| Conversa marcada | `call_booked` |
| Conversa feita | `call_done` |
| Proposta | `proposal` |
| Pago | `paid` (e `customer`, que é a palavra antiga para o mesmo) |

Duas coisas que o relatório precisa saber sobre esse bloco:

- **É monotónico.** Quem está em "proposta" necessariamente foi contactado, teve
  a conversa marcada e teve a conversa. Cada estágio conta quem **chegou ali ou
  passou**. Sem isso, "conversa feita: 0" apareceria no instante em que o último
  avançasse, e leria como colapso na semana que correu melhor. `atStage` diz,
  ao lado, quem está exatamente ali agora.
- **`available: false` não é zero.** Se o funil não puder ser lido, ele diz que
  não pode e por quê — nunca uma fila de zeros. "Ninguém foi contactado" e "a
  coluna ainda não existe" são idênticos num relatório e significam o oposto.

### 🔴 ESTÁ DESLIGADO ATÉ A MIGRAÇÃO CORRER

`source` e os quatro estágios novos precisam da migração
**`20260911000001_crm_design_partner`**, que vai num **PR separado, sem a label
`claude-ready`** — o founder aplica. Até lá, e por desenho:

- `source='design-partner'` **não é gravado**: o upsert repete sem a coluna e
  responde com `degraded: "source was not stored: migration ... is pending."`.
  O estágio, a nota e o follow-up **entram** — perder um rótulo é mais barato do
  que perder a linha.
- um estágio do funil (`call_booked`/`call_done`/`proposal`/`paid`) é
  **recusado** com `409 CRM_STAGE_MIGRATION_PENDING`, não substituído por outro.
  Guardar `qualified` onde o founder disse `proposal` poria um número errado no
  relatório de segunda, e um número errado é pior do que um erro.
- `designPartnerFunnel.available` vem `false` com a razão e a migração nomeada.

**A ação que destrava:** aplicar `20260911000001_crm_design_partner`.

Enquanto isso, o funil pode ser tocado com os estágios antigos
(`contacted` → `qualified` → `customer`) e o `appendNote`, que **funcionam
hoje** — o ficheiro do contacto não espera migração nenhuma.

---

## 5. O que não fazemos neste canal

- Não prometemos ranking, citação, nem data para nenhum dos dois.
- Não prometemos mexer em score.
- Não inventamos testimonial nem case. Não temos nenhum ainda, e dizê-lo é parte
  da oferta de design partner.
- Não enviamos e-mail pela máquina. O founder envia.
- Não geramos um pack "de exemplo" para mostrar como seria. Ou é a auditoria
  daquela empresa, ou não existe.
