# =============================================================================
# Cloudflare Tunnel — AVALIACAO da migracao CLI-managed -> remotely-managed.
# -----------------------------------------------------------------------------
# ESTADO ATUAL (nao tocar): o tunnel 'nvit-local' (id = var.tunnel_id) e
# CLI-MANAGED — criado com `cloudflared tunnel create`, credencial local
# (C:\cloudflared\<id>.json), ingress declarado em C:\cloudflared\config.yml e
# servico Windows rodando `tunnel run` (scripts/install-cloudflare-tunnel.ps1
# -Cli). Nesse modelo a Cloudflare NAO aceita gerenciar o ingress via
# API/IaC: a configuracao vive no arquivo local da maquina.
#
# Para gerenciar o ingress por aqui (recurso
# cloudflare_zero_trust_tunnel_cloudflared_config) o tunnel precisa migrar
# para REMOTELY-MANAGED (config no painel Zero Trust, conector instalado por
# token). Trade-offs e runbook completo: README.md, secao "Migracao do
# tunnel". Resumo dos motivos de NAO migrar agora:
#   1. o painel Zero Trust exige cartao de credito mesmo no plano Free — foi
#      exatamente por isso que o modelo CLI-managed foi adotado
#      (docs/cloudflare-tunnel-setup.md, "Caminho A");
#   2. a migracao e one-way e mexe no tunel VIVO (exposicao externa =
#      operacao COM APROVACAO, AGENTS.md par. 5/6);
#   3. o ganho hoje e pequeno (1 hostname estavel, config raramente muda).
#
# Este arquivo fica como PLACEHOLDER documentado: NENHUM recurso ativo.
# Quando (e se) o operador aprovar a migracao, descomente e ajuste abaixo
# (confira o schema exato na versao instalada do provider):
# =============================================================================
# resource "cloudflare_zero_trust_tunnel_cloudflared_config" "nvit_local" {
#   account_id = var.cloudflare_account_id
#   tunnel_id  = var.tunnel_id
#
#   config = {
#     ingress = [
#       {
#         hostname = "dev.nvit.com.br"
#         service  = "http://localhost:80"
#       },
#       {
#         service = "http_status:404"
#       },
#     ]
#   }
# }
