# =============================================================================
# platform/iac — IaC da SUPERFICIE EXTERNA da plataforma (OpenTofu)
# -----------------------------------------------------------------------------
# FRONTEIRA (ADR 0003): este modulo gerencia SOMENTE recursos EXTERNOS ao
# cluster (Cloudflare DNS/tunnel config, GitHub repo settings). O in-cluster
# continua 100% Helm + Argo CD — NUNCA adicione providers kubernetes/helm
# aqui para recursos de app.
#
# AVISO: alterar DNS publico/tunnel = "exposicao externa" (AGENTS.md par. 5/6)
# — plan e livre; APPLY somente com aprovacao do operador (workflow iac-apply
# manual ou operador local). Detalhes: README.md deste diretorio.
# =============================================================================

terraform {
  required_version = ">= 1.8.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }

    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

# Autenticacao preferida via env CLOUDFLARE_API_TOKEN (o provider le sozinho
# quando api_token = null); TF_VAR_cloudflare_api_token tambem funciona.
# NUNCA em tfvars commitado (docs/standards/hard-constraints.md par. 3).
provider "cloudflare" {
  api_token = var.cloudflare_api_token != "" ? var.cloudflare_api_token : null
}

# Autenticacao via env GITHUB_TOKEN (ex.: $env:GITHUB_TOKEN = (gh auth token)).
provider "github" {
  owner = var.github_owner
}
