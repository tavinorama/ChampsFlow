# Ozvor — Closed Loop: mapa de remediação (Discovery Fase 0)

> **Estado deste documento:** DISCOVERY / MAPEAMENTO. Nenhuma linha de código de produto foi alterada nesta entrega.
> **Branch:** `docs/closed-loop-discovery` · **Baseline de main:** `8d6a6a9`

---

## TL;DR

*(preenchido ao final do mapeamento — ver seção "TL;DR final" no fim do documento se esta linha ainda estiver aqui)*

---

## Como ler este documento

Regra da casa aplicada em todas as afirmações:

- Toda afirmação factual traz `arquivo:linha`.
- O que não foi verificado está marcado **NÃO VERIFIQUEI**.
- O que é dedução e não leitura direta está marcado **HIPÓTESE A CONFIRMAR**.

---

## Baseline de testes (executado nesta branch)

Comando: `npx vitest run` (na raiz do worktree, após `npm install`).

```
 Test Files  205 passed | 2 skipped (207)
      Tests  2586 passed | 42 skipped (2628)
   Start at  17:38:12
   Duration  25.65s (transform 1.40s, setup 394ms, import 6.04s, tests 6.60s, environment 9ms)
```

Notas:
- Suíte unitária/integração verde na íntegra. **NÃO VERIFIQUEI** a suíte E2E (`npm run test:e2e`, Playwright) — ela exige app em execução e, conforme histórico do projeto, falha na main sem derrubar o workflow.
- `npx vitest run --reporter=basic` falha no arranque (reporter `basic` não existe nesta versão do Vitest); o baseline acima usa o reporter padrão.

---

## Achados do relatório de auditoria: PENDENTE — ficheiro não entregue

O ficheiro `RELATORIO-AUDITORIA-COMPLETA-OZVOR.md` **não existe** no repositório nem em Desktop/Downloads/Documents do founder.

Busca executada:

```
find /Users/otaviofranca/Desktop /Users/otaviofranca/Downloads /Users/otaviofranca/Documents -maxdepth 3 -iname "*RELATORIO*"
→ /Users/otaviofranca/Desktop/DOUTORADO/FORMULÁRIOS/RelatorioProgresso_EPOLDI - Otavio_Franca2023.2024.docx   (não relacionado)
→ /Users/otaviofranca/Downloads/ozvor-relatorio-completo-2026-07-07.md                                        (relacionado, mas NÃO é o ficheiro pedido)
→ /Users/otaviofranca/Documents/CARMEN/Documentos 2/IR_RELATORIO_DE_AJUSTE_ANUAL_2018.pdf                     (não relacionado)
```

O único ficheiro relacionado é `ozvor-relatorio-completo-2026-07-07.md` (652 linhas, datado 07/07/2026). Ele **não** é a auditoria encomendada agora: é um relatório de estado comercial/técnico de dois meses atrás, escrito a partir do site público + API operator PII-free, e ele próprio declara que não teve acesso a dados de tenant/billing (`READ_SCOPE_REQUIRED`). Não usei os seus números como verdade presente.

**Nada disto bloqueia o mapeamento** — este documento foi construído a partir do código real.

### Perguntas que o relatório precisa responder quando chegar

Quando o ficheiro for entregue, estas são as lacunas que só ele fecha (o código não responde a nenhuma delas):

1. **Quantos tenants pagantes existem hoje por plano** (Free / Kit / Growth / Agency / Pages / AI Audit / OrganicPosts) e qual a receita por linha?
2. **Quantos audits completos rodaram nos últimos 30 dias**, e em quantos deles o conjunto de motores variou?
3. **Qual a taxa real de "All caught up"** — quantos tenants viram o Do Next vazio, e por quanto tempo?
4. **Execution %: qual o número reportado hoje aos clientes** e em quantos casos ele derivou de checkbox sem verificação?
5. **Quantos clientes têm BYOK configurado** vs. quantos ficaram bloqueados sem conseguir gerar conteúdo?
6. **Opportunity Radar: teve algum uso real?** Alguma conta com dados?
7. **System Health: houve incidente em que o painel ficou verde com motor caído?** (o histórico do projeto sugere que sim — 5º motor DataForSEO caído)
8. **Overflow mobile: qual a taxa de bounce mobile** em `/`, `/pricing`, `/test` e qual o impacto medido?
9. **Jobs: qual o volume de falhas** por fila e quantas ficaram sem retry/sem dead-letter?
10. **Qual a divergência promessa × entrega** que o relatório encontrou e que não aparece no código (copy de marketing, e-mails, materiais de venda)?

---

*(seções 1–9 do mapeamento seguem abaixo, adicionadas incrementalmente)*
