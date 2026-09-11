# Piloto da leva 2 — 100 leads ("outbound com prova") · 2026-09

**TL;DR** — 100 leads escolhidas dentro das que já temos, otimizadas para **resposta em cold**:
segmento local com dor de visibilidade, site vivo em domínio próprio, **nenhuma tocada na leva 1**,
nenhuma com STOP, e nenhuma das 20 do canal B. Divisão **60 OZ-local / 40 aistack**, exatamente a
que o founder pediu — e sem relaxar o teto por segmento. 15 segmentos, 27 estados. Custo de
seleção: zero de API paga. O free test da leva 2 custa ≈ US$ 0,03 por lead → **≈ US$ 3,00 pelo
piloto inteiro** antes do e-mail 1. Os 100 registros saem em artefato privado; aqui só agregados.

---

## Agregados da seleção

Corrida de referência: **[34570426016](https://github.com/tavinorama/ChampsFlow/actions/runs/34570426016)**
· workflow `.github/workflows/smartlead-shortlist.yml` · `mode=run`.

**Cota pedida x entregue:** 60 local / 40 aistack — entregue 60 / 40. `teto_relaxado: false`.
**Sinais de marketing por lead (média):** 1,54 de 4.
**Pool disponível:** 191 leads passaram em todos os filtros; 100 foram escolhidas.

### Por campanha de origem

| Campanha de origem | id | Leads |
|---|---|---|
| Ozvor 1 | 3741204 | 70 |
| OZ-A Agencies | 3783524 | 24 |
| OZ-C SaaS | 3783526 | 6 |

> OZ-B Local e aistack não aparecem: **todas** as leads dessas duas campanhas já foram tocadas na
> leva 1 (610 e 411 `completed`), e o piloto exige lead não tocada.

### Por segmento

| Segmento | Leads |  | Segmento | Leads |
|---|---|---|---|---|
| real estate | 25 | | construction | 2 |
| law firm | 24 | | finance other | 1 |
| design/media | 16 | | fitness | 1 |
| it services | 11 | | food/retail | 1 |
| agency/saas | 6 | | hvac | 1 |
| remodeling | 6 | | landscaping | 1 |
| agency | 3 | | moving | 1 |
| | | | saas | 1 |

Teto de 25 por segmento (25% do piloto), aplicado sem precisar ser relaxado. Real estate e law
firm batem no teto porque são, de fato, o que sobra de não tocado no estoque — ver "o que este
piloto não consegue testar".

### Por estado

TX 14 · CA 11 · MA 7 · IL 5 · MN 5 · NY 5 · FL 4 · GA 4 · WA 4 · VA 3 · CO 2 · IN 2 · KS 2 ·
MD 2 · NC 2 · OH 2 · OR 2 · AZ 1 · HI 1 · LA 1 · ME 1 · MI 1 · MO 1 · PA 1 · SC 1 · WI 1 ·
sem estado no dado 15.

## Critério (o que entrou)

1. Não tocada na leva 1 (`status = STARTED` no SmartLead) — **nenhuma** das 100 recebeu e-mail nosso.
2. Zero STOP: exclui `is_unsubscribed`, status `BLOCKED` e `lead_category_id` em {3, 4, 7, 9}.
3. Site vivo: HTTP 200 verificado nesta corrida, em **domínio próprio** (fora Facebook, Yelp,
   Linktree, business.site, wixsite e afins).
4. Segmento local com dor de visibilidade em busca com IA; sem hotelaria, hospital, clínica de
   rede, franquia nacional, governo ou escola.
5. US apenas.
6. Fora as 20 do canal B — nenhuma empresa recebe cold e proposta de parceria ao mesmo tempo.
7. Rodízio por segmento na escolha: o piloto precisa ser lido **por segmento**, e ranking puro por
   score entregava 49 imobiliárias em 100.

## O que este piloto não consegue testar (dizer antes, não depois)

- **O estoque não tocado é pequeno: 244 leads elegíveis no total.** As 100 são 41% de tudo que
  temos disponível. Um segundo piloto do mesmo tamanho não sai daqui sem importar leads novas ou
  reciclar não respondentes (regra dos 2 meses).
- **Metade do pool é imobiliária** (112 de 191). Real estate e law firm bateram no teto por
  escassez, não por preferência.
- **`agency`/`saas` (4 leads) usam a campanha como rótulo**: são leads de OZ-A/OZ-C cujo nome e
  site não revelam o segmento, mas cuja lista foi montada por nós com esse critério.
- **Blog recente é aproximação** (lemos só a home). Não use "tem blog" como afirmação no e-mail.

## Artefato e como carregar nas campanhas da leva 2

Artefato privado da corrida [34570426016](https://github.com/tavinorama/ChampsFlow/actions/runs/34570426016)
→ `smartlead-shortlist-2026-09` (13 KB, expira 2026-09-25):

- `piloto-leva2-2026-09.json` — os 100 registros + o bloco `como_carregar`
- `piloto-leva2-2026-09.csv` — mesma coisa em planilha
- `design-partners-2026-09.json` — as 20 do canal B (para conferir a exclusão)

Cada registro traz: `smartlead_lead_id`, `campaign_id_origem`, `campanha_origem`, `bucket`,
`company`, `website`, `domain`, `city`, `state`, `segment`, `segmento_fonte`, `industry`, `sector`,
`headcount`, `revenue`, `score`, `tocada_leva1`, `status_smartlead` e os 6 sinais de site.
**Sem e-mail, sem nome de pessoa, sem telefone.**

### Regra de carga (não negociável)

Destino: `oz-local-2026-09-14` (bucket `local`, 60 leads) e `aistack-2026-09-14`
(bucket `aistack`, 40 leads), ambas em DRAFTED.

**Mover por `smartlead_lead_id`. Nunca reimportar por CSV.** Reimportar cria lead duplicada, zera o
histórico da leva 1 e quebra a correlação por e-mail do 1º toque. O caminho é:
`POST /campaigns/{destino}/leads` com a lead existente, depois
`DELETE /campaigns/{origem}/leads/{lead_id}` — contando as duas pontas, como o
`smartlead-classify.yml` já faz. Se a remoção falhar, a lead fica em duas campanhas: pare e conte,
não insista.

Antes de disparar, a leva 2 ainda precisa: free test rodado para as 100 (≈ US$ 3,00) e o 1º e-mail
**sem link** (regra de 27/08).
