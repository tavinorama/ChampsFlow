# Controlo da VPS e do Hermes

**Escrito em 29/09/2026**, depois de o founder dizer: "não tenho controle correto pela VPS e pelo Hermes agent". Este documento diz o que isso significa em factos, o que falta, e a ordem para recuperar o controlo. Os comandos estão no [RUNBOOK.md](RUNBOOK.md).

## O que está errado hoje, em factos

| # | Facto | Como sabemos | Consequência |
|---|---|---|---|
| 1 | **O código do servidor só existe na máquina.** `hermes-task-server.mjs`, os jobs de vídeo e os scripts de cron não estão em nenhum repositório | Nenhum ficheiro deles neste repo; as notas de julho registam cópias `.bak` ao lado | Não há histórico, revisão nem rollback. Se o disco falhar, o executor da empresa perde-se |
| 2 | **O servidor foi alterado por agentes a partir de dentro.** O fallback de motores de 28/07 foi aplicado por um `/task` que reescreveu o próprio servidor | Nota de 28/07 | Quem tem o token pode reescrever o programa que valida o token |
| 3 | **Tudo corre como `root`** | `hermes.service` com `User=root` | Um prompt mal-intencionado lido numa página web corre com poder total. Em 29/07 um job de limpeza apagou a pasta de trabalho e derrubou todos os motores |
| 4 | **Um único token faz tudo.** O mesmo `HERMES_TASK_TOKEN` está no worker (Railway) e no n8n, e `/task` aceita qualquer prompt | Código do worker; credencial "hermes Ozvor" no n8n | Não há "só publicar" ou "só ler estado". Quem o tiver executa o que quiser como root |
| 5 | **Não há shell fora do agente.** A sessão do Termius está no prompt do Hermes, não na linha de comandos. Do Mac o SSH dá "Permission denied" | Auditoria Codex 23/09 e 28/09; nota de 28/07 | Reautenticar um motor ou ler o crontab exige uma sessão que hoje não está montada |
| 6 | **`/health` diz `ok` com os motores caídos** | Lido em 29/09 05:59Z: 200 `ok:true`, enquanto 151 de 151 passos correm em kimi | O sinal verde não mede o que importa |
| 7 | **Ninguém tem a lista do que está agendado.** Há cron da VPS, timers, crons internos do Hermes (24, 2 ligados em 15/09) e 15 workflows no n8n | Mapa de 21/09 | Não se sabe o que corre, nem o que corre duas vezes |
| 8 | **As contas dos motores são as suas contas pessoais** (Claude Max, ChatGPT) | Nota de 23/07 | O limite é partilhado e o login expira. Desde ~21/09 o Claude está com OAuth expirado |

O que **não** está errado: a porta pública é só o Caddy com TLS; sem token, todas as rotas menos `/health` respondem 401 (testado em 29/09); o servidor escuta em `127.0.0.1`.

## O que é "ter controlo"

1. **Ver:** sei o que corre, de que ficheiro, com que utilizador, em que horário. *Prova: o relatório do `inventory.sh`.*
2. **Reproduzir:** o código está num repositório privado e o que corre na máquina é um commit. *Prova: `/version` devolve o SHA.*
3. **Limitar:** cada consumidor tem o seu token e só faz o que precisa; o serviço não corre como root. *Prova: o token do worker recebe 403 numa rota que não é dele.*
4. **Parar:** sei desligar tudo em um comando e sei voltar atrás. *Prova: ensaio do kill switch.*
5. **Saber quando falha:** motor caído chega ao Telegram com a causa. *Prova: alarme recebido.*

## Ordem de trabalho

| Passo | O quê | Quem | Tempo | Risco |
|---|---|---|---|---|
| **0** | Abrir uma sessão SSH **nova** no Termius, fora do separador do agente | Founder | 5 min | nenhum |
| **1** | Correr `inventory.sh` e enviar o relatório | Founder corre, Claude lê | 10 min | nenhum (só leitura) |
| **2** | Reautenticar o Claude e testar os motores | Founder | 10 min | nenhum |
| **3** | Tirar uma cópia (snapshot) no painel do fornecedor da VPS | Founder | 5 min | nenhum |
| **4** | `collect-source.sh` + primeiro commit num repositório **privado** | Founder corre, Claude revê o código | 30 min | nenhum (cópia) |
| **5** | Rota `/postiz-post/:id` e `/version`, a partir do repositório | Claude escreve, founder instala | 1 h | baixo, com rollback |
| **6** | Tokens por consumidor (worker, n8n, vigias) com escopo | Claude escreve, founder roda as chaves | 2 h | médio |
| **7** | Serviço com utilizador próprio em vez de root | Claude escreve, founder aplica | 2–3 h | médio; ensaiar com snapshot |
| **8** | Inventário de agendamentos: uma tabela, um dono por rotina | Claude, a partir do relatório | 1 h | nenhum |
| **9** | Regra: o agente nunca altera o próprio servidor; mudanças entram por commit | Founder decide | — | — |

Os passos 0 a 4 não mudam nada na máquina. Do 5 em diante cada mudança entra por commit, com cópia de segurança e comando de retorno escritos antes.

## O que o Claude pode e não pode fazer aqui

Pode: ler o relatório, rever o código recolhido, escrever as mudanças e os testes, preparar os comandos. Não pode, e não deve: ter a chave SSH, ver valores de segredos, ou aplicar mudanças na máquina. O controlo fica consigo por desenho.
