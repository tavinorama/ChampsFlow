-- smartlead-bounce-reasons.sql — READ-ONLY. Why did the bounces bounce?
--
-- 18/09: bounce hit 3.0% on day 1 of the v4 campaigns and the first guess was
-- "bad list". The bounce notices the webhook stores say otherwise: of 6, only 1
-- was an address that does not exist; 3 were the recipient's Mimecast filter
-- calling the message spam (5.7.352), 1 a policy reject (5.7.1), 1 a Microsoft
-- 365 group that refuses outsiders (5.7.193). That is sender reputation, not
-- list quality, and the fix is different (R18, not a new list).
--
-- Aggregates only: no address is selected. `payload` is a JSON *string*, hence #>> '{}'.
-- Edit the campaign ids in the first CTE.
with ev as (
  select campaign_id, payload #>> '{}' as t
  from smartlead_event
  where event_type = 'EMAIL_BOUNCE' and campaign_id in (3975169, 3975170)
), coded as (
  select campaign_id, coalesce(substring(t from 'Status code: 5\d\d (5\.\d\.\d{1,3})'), 'sem_codigo') as codigo from ev
)
select campaign_id, codigo,
       case codigo
         when '5.4.1'   then 'endereco nao existe (lista)'
         when '5.1.1'   then 'endereco nao existe (lista)'
         when '5.1.10'  then 'endereco nao existe (lista)'
         when '5.7.352' then 'filtro do destinatario marcou como spam (reputacao)'
         when '5.7.1'   then 'politica do dominio destinatario rejeitou (reputacao)'
         when '5.7.193' then 'grupo M365 que recusa remetente externo (endereco de grupo)'
         when '5.2.2'   then 'caixa cheia (temporario)'
         else 'ler o aviso'
       end as leitura,
       count(*) as n
from coded group by 1, 2 order by 1, n desc;
