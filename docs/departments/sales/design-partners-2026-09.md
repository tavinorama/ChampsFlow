# Design partners — canal B (Managed Visibility) · 2026-09

**TL;DR** — Varremos as 1.818 leads únicas que já temos no SmartLead (as 5 campanhas, coleta
conferida contra a contagem do próprio SmartLead), filtramos por segmento de ticket alto, STOP,
site próprio e mercado US, e verificamos 400 sites por HTTP. Sobraram 91 empresas que provam
investimento em marketing no próprio HTML. Destas saem **10 empresas para a oferta de design
partner** (US$ 750 no 1º mês, depois US$ 1.500/mês) e **10 reservas**. Nenhum e-mail, nome de
pessoa ou telefone aparece aqui: os registros completos estão no artefato privado do workflow.
Custo desta seleção: zero de API paga. As 20 empresas são todas US, todas com site vivo (HTTP 200),
JSON-LD LocalBusiness e pixel de anúncio no HTML — ou seja, já gastam com aquisição hoje.

---

## As 10 (ordem = score)

| # | Empresa | Site | Cidade/UF | Segmento | Score | Por que ela |
|---|---|---|---|---|---|---|
| 1 | *(nome pessoal — ver artefato)* | tibmadesignbuild.com | Needham, MA | remodeling | 102 | Único do top 10 com os 4 sinais de marketing **e** nunca tocado na leva 1. Reforma de alto padrão em Boston: ticket final de cinco dígitos, ciclo de recomendação puro ("quem faz reforma boa em Needham"). |
| 2 | Robert Crow Law | robertcrowlaw.com | Portland, OR | law firm | 100 | Escritório com blog ativo, schema, reviews e pixel. Advogado é o caso de uso mais direto de busca com IA: a pergunta do cliente final já é "que advogado você recomenda". |
| 3 | LG Law LLC | lglawllc.com | Kansas City, MO | law firm | 100 | Mesmo perfil do #2 em mercado menor — mais fácil de mover o ponteiro e mostrar progresso mês a mês. |
| 4 | Rautmann Custom Homes | rautmanncustomhomes.com | Saukville, WI | remodeling | 98 | Construtora de casas sob medida, nunca tocada. Blog recente + schema; único sem telefone no HTML da home (falha pequena e fácil de corrigir na 1ª entrega). |
| 5 | Mcray Roofing & Exteriors | mcrayroofing.com | Oklahoma City, OK | roofing | 98 | Telhado é o segmento de maior urgência + maior ticket da lista; site completo, já anuncia. |
| 6 | Hawk Plumbing Heating & Air Conditioning | hawkphac.com | Fort Worth, TX | hvac | 96 | HVAC + plumbing no mesmo CNPJ = receita recorrente de manutenção. Mercado grande (DFW) e competitivo. |
| 7 | Advantage Roofing & Exteriors | advantageroofingandexteriors.com | Kalamazoo, MI | roofing | 94 | Perfil idêntico ao #5 em outro estado; serve de par de controle para comparar resultado entre mercados. |
| 8 | Shamrock Heating & Cooling | shamrockheatingandcooling.com | Gilbert, AZ | hvac | 92 | HVAC em Phoenix metro: sazonalidade forte e busca local intensa. |
| 9 | Leanhart Plumbing | leanhartplumbing.com | Louisville, KY | plumbing | 84 | Encanamento com schema, reviews e pixel, **sem blog** — é a prova mais limpa de que a execução de conteúdo (OrganicPosts) muda o número. |
| 10 | D'AG Real Estate | dagrealtors.com | Sarasota, FL | real estate | 84 | Time imobiliário na Flórida, com schema e anúncios. Sem página de reviews — lacuna óbvia para a 1ª entrega. |

## As 10 reservas

| # | Empresa | Site | Cidade/UF | Segmento | Score |
|---|---|---|---|---|---|
| R1 | Zieba Builders | ziebabuilders.com | Long Beach, CA | remodeling | 96 |
| R2 | SuperiorBuiltRoofing | superiorbuiltroofing.com | Fort Myers, FL | roofing | 94 |
| R3 | D&L Roofing | dandlroofing.com | Las Vegas, NV | roofing | 94 |
| R4 | Dr. Roof Atlanta | drroof.com | Roswell, GA | roofing | 94 |
| R5 | A-R Roofing & Exteriors | arroofing.com | Chesterfield, MO | roofing | 94 |
| R6 | Masterpiece Builders | masterpiecebuilders.com | Stuart, FL | remodeling | 94 |
| R7 | Daniels Design & Remodeling | danielsremodeling.com | Fairfax Station, VA | remodeling | 94 |
| R8 | Doors For Builders | doorsforbuilders.com | Elk Grove Village, IL | remodeling | 92 |
| R9 | Elite Air Conditioning and Plumbing | eliteaustinac.com | Austin, TX | hvac | 92 |
| R10 | Illiana Heating & Air Conditioning | illianaheating.net | Crown Point, IN | hvac | 92 |

> Cidade/UF sem estado no log: o SmartLead guarda a localização como texto livre e algumas leads
> só trazem a cidade. O estado acima foi completado pela cidade quando ela é inequívoca; onde o
> dado não existe, o artefato traz o campo vazio em vez de um palpite.

**Mistura dos 20:** remodeling 6 · roofing 6 · hvac 4 · law firm 2 · plumbing 1 · real estate 1.
Nenhum segmento passa de 2 no top 10 (teto proposital: um piloto de parceria monotema não ensina nada).

---

## Método (o que a máquina fez, na ordem)

Workflow: `.github/workflows/smartlead-shortlist.yml` · `mode=run` · determinístico (python puro,
sem LLM) · **corrida de referência: [34570426016](https://github.com/tavinorama/ChampsFlow/actions/runs/34570426016)**.

1. **Coleta completa das 5 campanhas** (`/campaigns/{id}/leads`, paginação avançando por `len(rows)`).
   Conferência obrigatória contra `campaign_lead_stats.total` do próprio SmartLead — se divergir, o
   relatório marca `completo: false` em vez de seguir calado.

   | Campanha | id | Coletado | Oficial SmartLead | Tocadas | Bloqueadas |
   |---|---|---|---|---|---|
   | OZ-B Local | 3783525 | 622 | 622 | 610 | 12 |
   | aistack | 3888686 | 418 | 418 | 411 | 7 |
   | OZ-A Agencies | 3783524 | 163 | 163 | 0 | 2 |
   | OZ-C SaaS | 3783526 | 24 | 24 | 0 | 0 |
   | Ozvor 1 | 3741204 | 1.400 | 1.400 | 0 | 12 |

2. **Dedupe por lead e por domínio** → 1.818 leads únicas (2.627 linhas; 809 leads estão em mais de
   uma campanha). Quando a mesma lead aparece numa campanha tocada e numa não tocada, vale o
   registro tocado — nunca o contrário.
3. **Exclusões** (funil da corrida): STOP/unsubscribed/bloqueada 36 · sem site 28 · hotelaria,
   hospital, clínica de rede, governo e escola 11 · franquia nacional 3 · fora dos US 1 ·
   domínio repetido 13 · sem segmento reconhecível 632 → **1.094 elegíveis**.
4. **Segmento de ticket alto** (peso no score): ortho e med spa e law 32 · dental e roofing 30 ·
   remodeling e hvac 28 · plumbing e accounting 26 · auto body e real estate 24.
5. **Verificação HTTP de 400 sites** (teto duro, 16 em paralelo, timeout 8s, 51s no total):
   316 responderam 200. Para cada um: JSON-LD LocalBusiness, blog com data recente, pixel de
   anúncio (Meta/Google/Bing/LinkedIn), página de reviews, telefone no HTML, HTTPS.
6. **Score** = segmento + site vivo 10 + domínio próprio 6 + JSON-LD 12 + blog recente 10 +
   pixel 10 + reviews 8 + telefone 4 + HTTPS 2 + (não tocada 8 / tocada 2) + estado US 4.
7. **Corte do canal B**: site vivo + domínio próprio + ≥1 sinal de marketing + **segmento provado
   pelo nome ou site da própria empresa**. Pool final: 91 empresas. Top 10 com teto de 2 por segmento;
   as 10 seguintes viram reserva.

### Onde este método erra (e como ele avisa)

- **Blog recente é aproximação.** Lemos só a home: "tem link para /blog **e** aparece data de
  2025+ no HTML". Um blog parado com rodapé "© 2026" passa. Conferir na visita.
- **Rótulo de segmento do enriquecimento não entra aqui.** A taxonomia do Adapt chama mudança,
  marcenaria e paisagismo de "Real Estate" — por isso o canal B só aceita segmento que o nome ou o
  site da empresa provam (`segmento_fonte=empresa`). O piloto, de risco menor, ainda aceita.
- **Tocada ≠ queimada.** 14 dos 20 já receberam os 3 toques da leva 1 sem responder STOP. A abertura
  da conversa tem que reconhecer isso, não fingir primeiro contato.
- **12 STOP saíram por construção**: são as `blocked` da OZ-B, e a contagem do SmartLead bate com as
  12 que o founder conhece.

## Artefato privado (com os dados completos)

Corrida [34570426016](https://github.com/tavinorama/ChampsFlow/actions/runs/34570426016) →
artefato `smartlead-shortlist-2026-09` (13 KB, expira 2026-09-25) →
`design-partners-2026-09.json`: as 20 empresas com `smartlead_lead_id`, campanha de origem,
empresa, site, cidade, estado, segmento, fonte do segmento, industry/sector, headcount, revenue,
score e cada sinal de marketing. Sem e-mail, sem nome de pessoa, sem telefone.

## Próximo passo

Abordagem 1 a 1 do founder (não entra em campanha de e-mail): essas 20 empresas estão **excluídas
do piloto da leva 2** justamente para nenhuma receber cold e proposta de parceria ao mesmo tempo.
