# =============================================================================
# DNS publico (zona nvit.com.br) — materializa platform/dns/domains.yaml.
# -----------------------------------------------------------------------------
# O YAML e a interface amigavel (edite LA); este arquivo apenas transforma
# cada entrada em um cloudflare_dns_record. Estado atual = 1 CNAME proxied
# (dev.nvit.com.br -> <tunnel_id>.cfargotunnel.com). Apos o `tofu import`
# (README, secao "Import inicial"), o plan deve tender a ZERO mudancas.
#
# AVISO: alterar registros aqui/no YAML muda EXPOSICAO EXTERNA — apply
# somente com aprovacao do operador (AGENTS.md par. 5/6).
# =============================================================================

locals {
  dns_config  = yamldecode(file("${path.module}/../dns/domains.yaml"))
  dns_records = local.dns_config.records

  # Sentinela "@tunnel" no YAML -> CNAME do tunnel existente. A unica fonte do
  # UUID e var.tunnel_id; o tunnel NUNCA e criado/recriado por este modulo.
  tunnel_cname = "${var.tunnel_id}.cfargotunnel.com"
}

data "cloudflare_zone" "this" {
  filter = {
    name = var.cloudflare_zone
  }

  lifecycle {
    postcondition {
      condition     = self.name == local.dns_config.zone
      error_message = "var.cloudflare_zone difere do campo 'zone' de platform/dns/domains.yaml — alinhe os dois antes de planejar."
    }
  }
}

resource "cloudflare_dns_record" "managed" {
  for_each = local.dns_records

  zone_id = data.cloudflare_zone.this.id
  name    = each.value.name
  type    = each.value.type
  content = each.value.content == "@tunnel" ? local.tunnel_cname : each.value.content
  proxied = try(each.value.proxied, false)
  ttl     = try(each.value.ttl, 1)
  comment = try(each.value.comment, null)
}
