# Runbook da VPS (Hermes)

Todos os comandos correm numa **sessão SSH real**. Se o ecrã mostra o prompt do agente Hermes, não é aqui: abra outra sessão. Nunca cole tokens no chat.

## 1. Abrir um shell de verdade

No Termius: **New Host → o mesmo endereço e a mesma chave → Connect**, num separador novo. O separador antigo (agente) fica como está.
Confirme que é um shell:

```bash
echo "$0" && whoami && hostname
```

Tem de responder `bash` (ou `-bash`), `root` e o nome da máquina.

## 2. Inventário (só leitura)

Copie `ops/vps/inventory.sh` para a máquina e corra:

```bash
bash inventory.sh > /root/ozvor-inventory.txt
```

```bash
cat /root/ozvor-inventory.txt
```

O relatório não contém valores de segredos (só nomes de variáveis, impressões digitais de chaves e de ficheiros). Pode enviá-lo ao Claude.

## 3. Motores: reautenticar e testar

Claude (OAuth expirado desde ~21/09). O serviço usa `HOME=/root`, logo o login é feito como root:

```bash
claude /login
```

Siga o link no seu browser e cole o código. Depois teste, sem passar pelo servidor:

```bash
cd /root/hermes-work && claude -p "Responda só: pronto" --model haiku
```

Codex (timeout de 220 s; se o login expirou):

```bash
codex login --device-auth
```

```bash
cd /root/hermes-work && timeout 120 codex exec "Responda só: pronto"
```

Reinicie o serviço para ele ver os logins novos e confirme:

```bash
systemctl restart hermes.service && sleep 3 && systemctl is-active hermes.service
```

```bash
curl -s http://127.0.0.1:8787/health
```

**Aceite:** no dia seguinte, os passos dos graphs aparecem com `engine=claude` e os alarmes `followup_intent_engines_down` param.

## 4. Snapshot antes de qualquer mudança

No painel do fornecedor da VPS: **Snapshots → Create**. Anote a data. É o retorno de tudo o que vem a seguir.

## 5. Pôr o código em git (repositório privado)

```bash
bash collect-source.sh /root/hermes-source-staging
```

Se disser `BLOCKED`, há um valor secreto dentro de um ficheiro de código: mova-o para `hermes.env`, leia-o de `process.env`, corra de novo. Se disser `OK`:

```bash
cd /root/hermes-source-staging && git init -b main && git add . && git commit -m "Hermes VPS: estado de $(date -u +%F), como encontrado"
```

Crie um repositório **privado** `ozvor-hermes-vps` no GitHub e envie com uma deploy key só desse repositório. A partir daqui, o que corre na máquina tem de ser um commit.

## 6. Kill switch (parar tudo)

```bash
systemctl stop hermes.service
```

```bash
crontab -l > /root/crontab.paused.$(date +%F) && crontab -r
```

Para religar:

```bash
crontab /root/crontab.paused.$(date +%F) && systemctl start hermes.service
```

Isto pára a geração e a publicação. **Não** pára as campanhas do SmartLead nem os workflows do n8n, que correm fora da VPS.

## 7. Se tudo falhar com `spawn ... ENOENT`

A pasta de trabalho desapareceu:

```bash
mkdir -p /root/hermes-work && systemctl restart hermes.service
```

## 8. Rodar o token do servidor

O token tem dois consumidores conhecidos: a variável `HERMES_TASK_TOKEN` do **worker** na Railway e a credencial **"hermes Ozvor"** no n8n. Ordem: gerar o novo, gravar nos dois consumidores, só depois trocar em `/root/hermes.env` e reiniciar. Entre um passo e o outro os jobs falham com 401; faça fora das horas de publicação.

```bash
openssl rand -hex 32
```

## 9. O que nunca fazer

- Apagar por padrão de nome (`*-work`, `*-tmp`). Apague caminhos nomeados, um a um.
- Pedir ao agente que altere `hermes-task-server.mjs`, o `hermes.service`, o crontab ou os ficheiros `.env`.
- Correr `source hermes.env` num script: uma linha partida executa-se como comando.
- Colar um token no Telegram, no chat ou num PR.
