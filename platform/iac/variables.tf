# =============================================================================
# Variaveis do modulo. O token da Cloudflare entra SEMPRE via env
# (CLOUDFLARE_API_TOKEN ou TF_VAR_cloudflare_api_token) — nunca em tfvars
# commitado (docs/standards/hard-constraints.md par. 3).
# =============================================================================

variable "cloudflare_api_token" {
  description = "API token da Cloudflare (escopos: Zone.Zone:Read + Zone.DNS:Edit na zona). Prefira a env CLOUDFLARE_API_TOKEN; deixe vazio para o provider ler a env."
  type        = string
  sensitive   = true
  default     = ""
}

variable "cloudflare_account_id" {
  description = "Account ID da Cloudflare (32 hex; NAO e segredo). Usado pela config remota do tunnel — hoje comentada em tunnel.tf."
  type        = string
  default     = ""
}

variable "cloudflare_zone" {
  description = "Zona DNS gerenciada por este modulo (deve casar com o campo 'zone' de platform/dns/domains.yaml)."
  type        = string
  default     = "nvit.com.br"
}

variable "github_owner" {
  description = "Owner do repositorio no GitHub."
  type        = string
  default     = "FlavioNeto11"
}

variable "github_repository" {
  description = "Nome do repositorio (sem o owner)."
  type        = string
  default     = "devops"
}

variable "tunnel_id" {
  description = "UUID do Cloudflare Tunnel EXISTENTE 'nvit-local' (CLI-managed). O tunnel NAO e recriado por este modulo — o id apenas materializa o CNAME <id>.cfargotunnel.com."
  type        = string
  default     = "c0c5cfc2-6c20-42ed-9d53-e67e2f6bcc51"

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.tunnel_id))
    error_message = "tunnel_id deve ser o UUID do tunnel existente (veja: cloudflared tunnel list)."
  }
}
