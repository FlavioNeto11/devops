# Dashboards do Grafana

Esta pasta contem dashboards do Grafana versionados em JSON para a plataforma DevOps local.

- `cluster-overview.json` — Visao geral do cluster (CPU/memoria por namespace, pods por fase, restarts de containers e replicas de deployments). UID: `cluster-overview`.

## Como o dashboard e provisionado (sidecar via ConfigMap)

O Grafana do `kube-prometheus-stack` esta configurado (em
`C:/devops/platform/observability/grafana-values.yaml`) com o **sidecar de
dashboards** habilitado:

```yaml
grafana:
  sidecar:
    dashboards:
      enabled: true
      label: grafana_dashboard
      searchNamespace: ALL
```

Com isso, o sidecar observa **ConfigMaps** em todos os namespaces e, sempre que
encontra um ConfigMap com o **label `grafana_dashboard`**, carrega o JSON contido
nele como um dashboard — sem precisar reiniciar o Grafana.

### Publicar/atualizar o dashboard

A forma mais simples e gerar um ConfigMap a partir do arquivo JSON e aplicar o
label esperado. Exemplo (PowerShell 7, contexto `docker-desktop`):

```powershell
# Cria/atualiza o ConfigMap a partir do JSON (idempotente)
kubectl create configmap cluster-overview-dashboard `
  --namespace observability `
  --from-file=cluster-overview.json=C:/devops/platform/observability/dashboards/cluster-overview.json `
  --dry-run=client -o yaml | kubectl apply -f -

# Aplica o label que o sidecar procura
kubectl label configmap cluster-overview-dashboard `
  --namespace observability grafana_dashboard=1 --overwrite
```

> Observacao: o `--dry-run=client -o yaml | kubectl apply -f -` torna o comando
> **idempotente** (pode rodar de novo sem erro), pois faz um *apply* em vez de um
> *create* puro.

Em poucos segundos o dashboard aparece no Grafana, dentro da pasta configurada
pelo sidecar (por padrao, listada na UI em **Dashboards**).

### Recomendacoes para o JSON

- Mantenha o campo `uid` fixo (`cluster-overview`) para que atualizacoes
  substituam o mesmo dashboard em vez de criar duplicatas.
- O dashboard usa a variavel de template **`datasource`** (tipo `datasource`,
  query `prometheus`), entao ele funciona com qualquer datasource Prometheus
  provisionado, inclusive o padrao criado pelo `kube-prometheus-stack`.

## Como importar manualmente pelo UID/JSON

Caso prefira importar pela interface (sem ConfigMap):

1. Acesse o Grafana em `http://xpto.localhost/grafana` e faca login
   (usuario `admin`, senha `admin` no laboratorio).
2. Menu lateral: **Dashboards** -> **New** -> **Import**.
3. Cole o conteudo de `cluster-overview.json` no campo *Import via dashboard
   JSON model* (ou faca upload do arquivo) e clique em **Load**.
4. Na tela seguinte, selecione o datasource **Prometheus** quando solicitado e
   confirme em **Import**.

Para abrir um dashboard ja existente diretamente pelo UID, use a URL:

```
http://xpto.localhost/grafana/d/cluster-overview
```

> Em producao (`https://www.xpto.com/grafana`), o mesmo caminho de UID se aplica,
> trocando apenas o host.
