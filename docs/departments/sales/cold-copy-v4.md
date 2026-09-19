# Cold e-mail v4 — pessoal, pela dor do ofício, com urgência verdadeira (17/09/2026)

> **Aprovado pelo founder em 17/09/2026.** A fonte que o código lê é [campaigns-v4.json](campaigns-v4.json); este ficheiro é a versão para humanos. Mudou o texto? Editar o JSON, correr `python3 scripts/smartlead/campaigns_v4.py validate`, e espelhar aqui. Execução: workflow `smartlead-campaigns-v4.yml` (`action=create`, depois `action=load`; `confirm=no` é ensaio). Substitui as sequências da leva 2 em [geo-campaign-kit.md](geo-campaign-kit.md) §5 e [aistack-campaign-kit.md](aistack-campaign-kit.md) §5, que ficam como histórico.

Substitui a v3. Continuam só **duas campanhas**: AI Geo Search e AI Audit Stack. 4 toques cada (dias 0, 3, 7, 14), variantes A/B nos toques 1 e 2.

## O que mudou da v3 para a v4

1. **Fala com um telhador de Tulsa, não com "um negócio local".** Cada lead recebe o seu ofício, a sua cidade e a pergunta que o cliente DELE faz no momento de aflição ("My AC just died. Who should I call in Tempe?").
2. **A dor é a que ele já sente:** o telefone calado, a semana fraca, a hora perdida em orçamentos. O e-mail dá-lhe uma causa que ele não consegue ver sozinho.
3. **A urgência é histórica, não inventada:** as Páginas Amarelas. Ninguém avisou quando as chamadas mudaram para o Google. Está a acontecer outra vez.
4. **Tom de pessoa:** "Question from one owner to another." Pede uma resposta de uma linha, não um clique.

**O que NÃO escrevi, de propósito:** "a sua empresa vai quebrar". Não conseguimos prová-lo, o dono cheira o exagero, e os filtros de spam também. O e-mail das Páginas Amarelas carrega esse medo com um facto que ele viveu.

**Regras mantidas.** Inglês. Frases até 12 palavras. Toque 1 sem link nem domínio, uma pergunta, 40 a 80 palavras. Links só do toque 2 em diante, com `?from={{campaign}}`. Sem travessão. Depois de `%signature%`: `P.S. If you'd rather not hear from me, just reply STOP and I won't write again.`

**Números usados (nossos, de 17/09):** dez negócios locais dos EUA (dois telhadores, dois canalizadores/HVAC, dois advogados, um remodelador, um construtor, um HVAC, uma imobiliária), quatro motores, dez perguntas cada. 395 respostas, nomeados em 114. De fora em 71%. Re-medir se usar depois de outubro.

---

## Campos por lead (calculados por código a partir do segmento e da localização, custo zero)

| Campo | Exemplo (telhados, Oklahoma City) |
|---|---|
| `{{city}}` | Oklahoma City |
| `{{trade}}` | roofer |
| `{{a_trade}}` | a roofer (o código escolhe "a" ou "an") |
| `{{buyer_question}}` | My roof is leaking. Who is a good roofer in Oklahoma City? |
| `{{job}}` | roof job |
| `{{pain_task}}` | quotes and scheduling |
| `{{lost_hour}}` | an hour off the roof |

Tabela completa por segmento no fim deste ficheiro. **Lead sem segmento reconhecido não entra na v4** (fica para a v3 genérica ou fica de fora).

---

# CAMPANHA 1 — AI Geo Search

### GEO-1A · dia 0 · sem link · "a pergunta do cliente dele"

```
Subject: {{trade}} in {{city}}

Hi {{first_name}},

Here is a question people now ask ChatGPT:
"{{buyer_question}}"

It answers with a few names. Not ten options.
If your name is missing, that call goes elsewhere.
And nobody tells you.

I have not checked {{company_name}} yet.

Want me to check and send you what it says?
```

### GEO-1B · dia 0 · sem link · "o telefone calado"

```
Subject: a quiet phone

Hi {{first_name}},

When the phone goes quiet, you check the usual things.
Ads. Reviews. The season.

Here is one that is easy to miss.
People ask ChatGPT: "{{buyer_question}}"
It gives a few names. Yours may not be one.

I can check it for {{company_name}}.

Want the answer?
```

### GEO-2A · dia 3 · com link · "7 em 10, e o que vale um serviço"

```
Subject: 7 in 10

Hi {{first_name}},

This week I tested ten local businesses.
Roofers, plumbers, lawyers, HVAC, a builder, a realtor.
AI left them out of 7 in 10 answers.
Every miss is a recommendation that went to someone else.

You know what one new {{job}} is worth.

See if AI names {{company_name}}. It takes 60 seconds.

Run my free test → https://ozvor.com/test?from={{campaign}}
```

### GEO-2B · dia 3 · com link · "as Páginas Amarelas"

```
Subject: the Yellow Pages moment

Hi {{first_name}},

Remember when the Yellow Pages stopped working?
Nobody sent a memo. The calls just moved to Google.

It is happening again.
This time the calls move to AI answers.
The ones who moved early got a head start.

Where does {{company_name}} stand today?
It takes 60 seconds to see.

See what AI says → https://ozvor.com/test?from={{campaign}}
```

### GEO-3 · dia 7 · "tem conserto"

```
Subject: this part is fixable

Hi {{first_name}},

Good news. This is not about ads or luck.
AI builds its answer from pages it can read and quote.
If it cannot quote you, it names another {{trade}}.

That can change. Pages can be fixed.
First you need to see who it names today.

See who AI names → https://ozvor.com/test?from={{campaign}}
```

### GEO-4 · dia 14 · despedida de pessoa

```
Subject: I will stop here

Hi {{first_name}},

This is my last note.
I know you are busy running {{company_name}}.

If a slow month ever makes you wonder, remember this.
People ask AI who to hire in {{city}}.
You should know if it says your name.

The test is free and takes 60 seconds.

https://ozvor.com/test?from={{campaign}}
```

---

# CAMPANHA 2 — AI Audit Stack

### STACK-1A · dia 0 · sem link · "de um dono para outro"

```
Subject: {{pain_task}}

Hi {{first_name}},

Question from one owner to another.
It is about {{company_name}}.
How many hours a week go to {{pain_task}}?

If it is two, that is 100 hours a year.
Two and a half work weeks, gone.

Reply with your number.
I will send back the one AI tool I would test first.
No pitch. Just the tool.
```

### STACK-1B · dia 0 · sem link · "não foi para isto que abriu a empresa"

```
Subject: not why you started

Hi {{first_name}},

Think about {{pain_task}}.
You did not start {{company_name}} for that.
But every hour on it is {{lost_hour}}.

There is usually one AI tool that takes most of it back.
Not ten tools. One.

Which part would you hand off first?

Reply in one line. I will name the tool.
```

### STACK-2A · dia 3 · com link

```
Subject: one tool, not ten

Hi {{first_name}},

I built a 60-second audit for owners like you.
Five questions about how {{company_name}} runs.
It names the right AI tool for your worst bottleneck.
One tool. Not a list of ten.

It costs $49.
Money back in 30 days if it tells you nothing new.

I want to see my stack → https://ozvor.com/ai-audit?from={{campaign}}
```

### STACK-2B · dia 3 · com link

```
Subject: $49 or 100 hours

Hi {{first_name}},

Two hours a week on {{pain_task}}.
That is 100 hours a year.
The audit that finds the fix costs $49.

Five questions. 60 seconds.
It names one AI tool for your worst bottleneck.
If it tells you nothing new, you get the $49 back.
You have 30 days to decide.

I want to see my stack → https://ozvor.com/ai-audit?from={{campaign}}
```

### STACK-3 · dia 7

```
Subject: not another tool list

Hi {{first_name}},

You do not need ten new tools.
You need the one that fits {{company_name}}.

That is all the audit does.
Five questions in. One tool out.
$49, with 30 days to get your money back.

I want to see my stack → https://ozvor.com/ai-audit?from={{campaign}}
```

### STACK-4 · dia 14 · despedida, com a parte grátis

```
Subject: I will stop here

Hi {{first_name}},

This is my last note.
Before any audit, try the free part.
See what AI says about {{a_trade}} in {{city}}.
It takes 60 seconds.

If now is not the time, no worries.

https://ozvor.com/test?from={{campaign}}
```

---

# COM PROVA POR LEAD (o nível mais pessoal que existe: o nome do rival dele)

Troca só o toque 1 da AI Geo Search. Exige o mini-teste por lead (cerca de US$ 0,03 cada), que hoje está bloqueado só pelo secret `OZVOR_OPERATOR_KEY`. **É este toque que mais deve subir a taxa de resposta:** o dono conhece o concorrente pelo nome.

### GEO-1A-PROVA

```
Subject: {{competitor_1}} instead of you

Hi {{first_name}},

Picture someone in {{city}} asking {{ai_engine}} this:
"{{query}}"

I asked it myself this week.
It said to call {{competitor_1}}. Then {{competitor_2}}.
{{company_name}} was not mentioned.

If they pick up the phone, they do not call you.
And you never see it happen.

I saved the full answer. Want it?
```

### GEO-1B-PROVA

```
Subject: the calls you never see

Hi {{first_name}},

A slow week has many causes.
Here is one you cannot see.

I asked {{ai_engine}}: "{{query}}"
It named {{competitor_1}} and {{competitor_2}}.
It did not name {{company_name}}.

Nobody tells you when that happens.
The phone just stays quiet.

Want to see the exact answer it gave?
```

---

# Quando alguém responde (em menos de 2 horas, do seu e-mail, à mão)

**Geo Search, resposta "yes":** correr o teste com o negócio dele e um rival da cidade, e responder na mesma conversa. Aqui o link é permitido, foi ele quem pediu.

```
Hi {{first_name}},

Done. I asked ChatGPT: "{{buyer_question}}"
It named {{competitor_1}}. Then {{competitor_2}}.
{{company_name}} was not on the list.

Full report, all four engines:
{{report_url}}

Want me to walk you through it? Ten minutes, no slides.
```

Se o negócio FOI nomeado, dizer a verdade ("Good news. It named you second.") e mostrar onde não aparece. Nunca inventar dor.

**Audit Stack, resposta com um número ou uma tarefa:** responder com UMA ferramenta real para aquela tarefa, sem vender. Só na última linha: "If you want the full picture, the audit is $49: https://ozvor.com/ai-audit?from={{campaign}}".

---

# Tabela de segmentos (o que o código escreve em cada lead)

| Segmento | trade | buyer_question | job | pain_task | lost_hour |
|---|---|---|---|---|---|
| roofing | roofer | My roof is leaking. Who is a good roofer in {city}? | roof job | quotes and scheduling | an hour off the roof |
| hvac | HVAC company | My AC just died. Who should I call in {city}? | install | dispatch and scheduling | an hour off the job |
| plumbing | plumber | I have a burst pipe. Who is a good plumber in {city}? | plumbing job | dispatch and quotes | an hour off the job |
| remodeling | remodeler | Who is the best kitchen remodeler in {city}? | remodel | estimates and follow-ups | an hour off the job site |
| electrical | electrician | I need an electrician in {city}. Who is good? | electrical job | quotes and scheduling | an hour off the job |
| landscaping | landscaper | Who is a good landscaper in {city}? | landscaping job | quotes and scheduling | an hour off the job |
| cleaning | cleaning company | Who is a good cleaning company in {city}? | cleaning contract | scheduling and follow-ups | an hour away from clients |
| pest | pest control company | I have termites. Who should I call in {city}? | pest contract | scheduling and follow-ups | an hour off the route |
| garage/doors | garage door company | Who installs garage doors in {city}? | install | quotes and scheduling | an hour off the job |
| pool | pool company | Who is a good pool company in {city}? | pool job | quotes and scheduling | an hour off the job |
| moving | moving company | Who are reliable movers in {city}? | move | quotes and scheduling | an hour off the truck |
| auto body | auto body shop | Who does good collision repair in {city}? | repair job | estimates and insurance paperwork | an hour off the shop floor |
| law firm | law firm | I need a lawyer in {city}. Who do you recommend? | case | client intake and follow-ups | an hour you cannot bill |
| accounting | accounting firm | Who is a good accountant for a small business in {city}? | client | document chasing and data entry | an hour you cannot bill |
| insurance | insurance agency | Who is a good insurance agent in {city}? | policy | quotes and renewals | an hour away from clients |
| real estate | real estate agent | Who is the best real estate agent in {city}? | listing | lead follow-up | an hour away from clients |
| dental | dental office | Who is a good dentist in {city} taking new patients? | patient | scheduling and reminders | an hour away from patients |
| ortho | orthodontist | Who is the best orthodontist in {city}? | patient | scheduling and reminders | an hour away from patients |
| med spa | med spa | What is the best med spa in {city}? | client | bookings and follow-ups | an hour away from clients |
| chiro/pt | chiropractor | Who is a good chiropractor in {city}? | patient | scheduling and reminders | an hour away from patients |
| vet | vet clinic | Who is a good vet in {city}? | client | scheduling and reminders | an hour away from patients |
| salon | hair salon | What is the best hair salon in {city}? | client | bookings and no-shows | an hour away from clients |
| fitness | gym | What is the best gym in {city}? | member | sign-ups and follow-ups | an hour off the floor |
| agency/saas | marketing agency | Who is a good marketing agency in {city}? | client | client reports | an hour you cannot bill |
| design/media | design studio | Who is a good design studio in {city}? | project | proposals and invoices | an hour you cannot bill |
| it services | IT services company | Who is a good IT support company in {city}? | contract | tickets and quotes | an hour you cannot bill |
| painting | painter | Who is a good house painter in {city}? | paint job | quotes and scheduling | an hour off the job |
| concrete/paving | concrete contractor | Who does good concrete work in {city}? | concrete job | bids and scheduling | an hour off the job |
| flooring | flooring company | Who installs flooring in {city}? | flooring job | quotes and scheduling | an hour off the job |
| fencing | fence company | Who builds fences in {city}? | fence job | quotes and scheduling | an hour off the job |
| construction | contractor | Who is a good general contractor in {city}? | construction job | bids and scheduling | an hour off the job site |
