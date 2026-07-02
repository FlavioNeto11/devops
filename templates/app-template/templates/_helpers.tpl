{{/*
=============================================================================
_helpers.tpl — Funcoes auxiliares (templates nomeados) do chart app-template.
-----------------------------------------------------------------------------
Convencoes:
  * O nome de cada recurso de service e "<app.name>-<serviceName>".
  * Labels seguem o padrao app.kubernetes.io/* + um label especifico da
    plataforma (devops.flavioneto/app).
Os helpers recebem um dicionario via "include ... (dict ...)" para terem
acesso ao contexto raiz ($) e ao service em iteracao quando necessario.
=============================================================================
*/}}

{{/*
app-template.appName
Nome logico da aplicacao (app.name), normalizado e truncado para uso em DNS.
Uso: {{ include "app-template.appName" . }}
*/}}
{{- define "app-template.appName" -}}
{{- .Values.app.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
app-template.fullname
Nome completo de um recurso de service: "<app.name>-<serviceName>".
Espera um dict: { "root": $, "name": <serviceName> }
Uso: {{ include "app-template.fullname" (dict "root" $ "name" $name) }}
*/}}
{{- define "app-template.fullname" -}}
{{- $root := .root -}}
{{- $name := .name -}}
{{- printf "%s-%s" $root.Values.app.name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
app-template.image
Imagem efetiva de um service.
  * registry vazio  -> "<svc.image>:<svc.tag>" (imagem local do laboratorio)
  * registry setado -> "<registry>/<app.name>/<serviceName>:<svc.tag>"
Espera um dict: { "root": $, "name": <serviceName>, "svc": <serviceDef> }
Uso: {{ include "app-template.image" (dict "root" $ "name" $name "svc" $svc) }}
*/}}
{{- define "app-template.image" -}}
{{- $root := .root -}}
{{- $name := .name -}}
{{- $svc := .svc -}}
{{- $tag := default "latest" $svc.tag -}}
{{- $registry := $root.Values.registry | default "" -}}
{{- if eq (trim $registry) "" -}}
{{- printf "%s:%s" $svc.image $tag -}}
{{- else -}}
{{- printf "%s/%s/%s:%s" (trim $registry) $root.Values.app.name $name $tag -}}
{{- end -}}
{{- end -}}

{{/*
app-template.commonLabels
Labels comuns aplicados a TODOS os recursos do chart.
Espera um dict: { "root": $, "name": <serviceName|""> , "component": <tipo|""> }
Convencao VIVA (hard-constraints §1): app.kubernetes.io/name = "<app>-<service>"
(recursos do app inteiro, sem service, usam so "<app>").
Uso (em metadata.labels, ja indentado pelo chamador):
  {{- include "app-template.commonLabels" (dict "root" $ "name" $name "component" $svc.type) | nindent 4 }}
*/}}
{{- define "app-template.commonLabels" -}}
{{- $nameLabel := .root.Values.app.name -}}
{{- if .name -}}
{{- $nameLabel = include "app-template.fullname" (dict "root" .root "name" .name) -}}
{{- end -}}
app.kubernetes.io/name: {{ $nameLabel | quote }}
app.kubernetes.io/part-of: {{ .root.Values.app.name | quote }}
{{- with .component }}
app.kubernetes.io/component: {{ . | quote }}
{{- end }}
app.kubernetes.io/managed-by: devops-platform
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version | replace "+" "_" | quote }}
devops.flavioneto/app: {{ .root.Values.app.name | quote }}
{{- with .root.Values.app.appType }}
devops.flavioneto/app-type: {{ . | quote }}
{{- end }}
{{- /* Multi-env opt-in (Forja 4.0 B2): quando app.environment esta setado
       (compile com --env), TODO recurso leva o label de ambiente. NAO entra
       nos selectorLabels (selectors devem ser estaveis entre upgrades). */}}
{{- with .root.Values.app.environment }}
devops.flavioneto/environment: {{ . | quote }}
{{- end }}
{{- end -}}

{{/*
app-template.selectorLabels
Labels usados em selectors. spec.selector de Deployment e IMUTAVEL no apiserver:
o chart adota EXATAMENTE a convencao dos produtos VIVOS (antigo buildK8s) —
{ app.kubernetes.io/name: "<app>-<svc>" } e NADA alem disso (adicionar uma chave,
p.ex. part-of, tambem e mutacao de campo imutavel e bloquearia a convergencia
v1 -> v2; ver docs/new-project-contract.md §11.5). part-of continua em TODOS os
labels dos recursos/pods (hard-constraints §1) — so nao entra no selector.
Espera um dict: { "root": $, "name": <serviceName> }
Uso: {{- include "app-template.selectorLabels" (dict "root" $ "name" $name) | nindent 6 }}
*/}}
{{- define "app-template.selectorLabels" -}}
app.kubernetes.io/name: {{ include "app-template.fullname" (dict "root" .root "name" .name) | quote }}
{{- end -}}

{{/*
app-template.publishAnnotations
Annotations de publicacao (CI/CD) lidas de .Values.publish.
Uso (em metadata.annotations, ja indentado pelo chamador):
  {{- include "app-template.publishAnnotations" $ | nindent 4 }}
*/}}
{{- define "app-template.publishAnnotations" -}}
devops.flavioneto/commit-sha: {{ .Values.publish.commitSha | default "" | quote }}
devops.flavioneto/branch: {{ .Values.publish.branch | default "" | quote }}
devops.flavioneto/image-tag: {{ .Values.publish.imageTag | default "" | quote }}
devops.flavioneto/deployed-at: {{ .Values.publish.deployedAt | default "" | quote }}
devops.flavioneto/run-id: {{ .Values.publish.runId | default "" | quote }}
{{- end -}}

{{/*
app-template.resources
Bloco de resources de um service: usa defaults, com override opcional por
service via svc.resources.
Espera um dict: { "root": $, "svc": <serviceDef> }
Uso: {{- include "app-template.resources" (dict "root" $ "svc" $svc) | nindent 10 }}
*/}}
{{- define "app-template.resources" -}}
{{- $res := .root.Values.defaults.resources -}}
{{- with .svc.resources -}}
{{- $res = . -}}
{{- end -}}
{{- toYaml $res -}}
{{- end -}}

{{/*
app-template.fullPrefix
Prefixo COMPLETO de roteamento de um service api/api2: basePath + svc.path.
Normaliza barras duplicadas. Ex.: base "/aplicacao1" + path "/api" => "/aplicacao1/api"
Espera um dict: { "root": $, "svc": <serviceDef> }
Uso: {{ include "app-template.fullPrefix" (dict "root" $ "svc" $svc) }}
*/}}
{{- define "app-template.fullPrefix" -}}
{{- $base := .root.Values.app.basePath | default "/" -}}
{{- $path := .svc.path | default "" -}}
{{- $joined := printf "%s%s" $base $path -}}
{{- $joined | replace "//" "/" -}}
{{- end -}}
