#!/usr/bin/env bash
# Gera os 10 Design Partner Packs do lote de setembro/2026 (docs/departments/sales/design-partners-2026-09.md).
#
# COMO RODAR (o script exige DATABASE_URL + chaves dos motores — só existem em produção):
#   railway run --service api -- bash scripts/design-partner-packs-2026-09.sh            # DRY RUN: imprime o custo dos 10 e PARA
#   railway run --service api -- bash scripts/design-partner-packs-2026-09.sh --confirm  # gasta (≈ US$ 0,55/pack, ~US$ 5,50 no total)
#
# Sem Railway CLI: exporte as mesmas envs do serviço api e rode `bash scripts/design-partner-packs-2026-09.sh --confirm`.
# Cada pack sai em out/design-partner-packs/<dominio>.html. O gasto entra em api_spend como op='design_partner_pack'.
# Regra da casa: sem --confirm nada é chamado nem cobrado; motor sem chave = recusa (pack de mock é auditoria inventada).
set -euo pipefail
MODE="${1:-}"   # vazio = dry run · --confirm = gasta
run() { # domain | company | category
  npx tsx scripts/design-partner-pack.ts --domain "$1" --company "$2" --category "$3" ${MODE:+$MODE}
}
run tibmadesignbuild.com            "Tibma Design Build"                     "design-build remodeling contractor"
run robertcrowlaw.com               "Robert Crow Law"                        "law firm"
run lglawllc.com                    "LG Law LLC"                             "law firm"
run rautmanncustomhomes.com         "Rautmann Custom Homes"                  "custom home builder"
run mcrayroofing.com                "Mcray Roofing & Exteriors"              "roofing contractor"
run hawkphac.com                    "Hawk Plumbing Heating & Air Conditioning" "HVAC and plumbing contractor"
run advantageroofingandexteriors.com "Advantage Roofing & Exteriors"         "roofing contractor"
run shamrockheatingandcooling.com   "Shamrock Heating & Cooling"             "HVAC contractor"
run leanhartplumbing.com            "Leanhart Plumbing"                      "plumbing contractor"
run dagrealtors.com                 "D'AG Real Estate"                       "real estate team"
echo "-- 10 packs processados (modo: ${MODE:-DRY RUN, nada gasto}) --"
