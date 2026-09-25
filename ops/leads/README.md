# OZvor Leads (atlas-dashboard) — operação

O serviço "OZvor Leads" (Python 3.12, `server.py`, Railway) vive **fora deste repositório**, na pasta do founder `Documents/Codex/2026-09-11/enco/outputs/atlas-dashboard`. Ela **não é um repositório git** e é publicada com `railway up --detach`. Esta pasta guarda o que o ChampsFlow precisa saber dele e os patches que lhe aplicámos.

## B15 (Codex D21, 23/09/2026) — o deploy não tinha identidade

O serviço respondia `/health` mas nada dizia **qual código** estava a correr: sem git, sem SHA, sem build id. Não dava para provar "o que está na Railway é o que está na pasta".

### Patch aplicado na pasta (25/09/2026)

Ficheiro: [`2026-09-25-version-endpoint.patch`](2026-09-25-version-endpoint.patch) (diff sobre `server.py`; cópia de segurança em `server.py.bak-2026-09-25`).

- `BUILD_ID` = primeiros 12 hex do sha256 dos ficheiros da aplicação (`server.py`, `platform_store.py`, `*.js`, `index.html`, `login.html`), ordenados, calculado no arranque. Ficheiro em falta é saltado, nunca inventado.
- `GET /version` (público, antes da autenticação, sem PII nem segredos): `build_id`, `files_hashed`, `git_sha` (se a Railway o expuser), `railway_deployment_id`, `started_at`.
- `GET /health` passa a incluir `build_id`.
- Teste: `tests/test_version.py` (`python3 -m unittest tests.test_version`), 3 casos: id estável e muda com o conteúdo; ficheiros em falta saltados; a árvore real tem id.

Resultado local (25/09): 9 testes verdes (3 novos + 6 existentes); `build_id` da pasta = `feed7891a52d` sobre 14 ficheiros.

### Como provar que o deploy é o código da pasta (founder)

```bash
cd ~/Documents/Codex/2026-09-11/enco/outputs/atlas-dashboard
python3 -c "import server; print(server.BUILD_ID)"
curl -s https://<domínio-do-leads>/version
```

Os dois `build_id` têm de ser iguais. Se diferirem, o deploy está atrasado (ou a pasta mudou depois do `railway up`).

### Fica com o founder

- `railway up --detach` na pasta (deploy é ação do founder).
- Guardar o `build_id` de cada deploy na nota do dia (ou no Notion) para o Codex conseguir auditar "que código respondeu".
