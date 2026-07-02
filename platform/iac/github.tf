# =============================================================================
# GitHub (repo FlavioNeto11/devops) — recursos de BAIXO RISCO uteis a esteira.
# -----------------------------------------------------------------------------
# Labels que os workflows criavam "na mao" (gh label create em
# req-implement.yml, greenfield-launch.yml e greenfield-plan.yml) passam a ter
# dono declarativo aqui. Cores/descricoes espelham o estado VIVO capturado em
# 2026-07-02 via `gh label list` — apos o `tofu import` (README, secao
# "Import inicial") o plan tende a zero. Excecao: o label "planning" ainda nao
# existe no repo (o primeiro apply o cria; e o comportamento esperado).
#
# Branch protection: NAO gerenciada — exemplo comentado no fim do arquivo;
# ative somente com pedido explicito do operador.
# =============================================================================

locals {
  pipeline_labels = {
    requirement = {
      color       = "0e8a16"
      description = "Requisito (esteira reqhub)"
    }

    "claude-generated" = {
      color       = "1d76db"
      description = "Gerado pela Claude (esteira)"
    }

    "gpt-approved" = {
      color       = "5319e7"
      description = "Validado no ChatGPT (auto-merge)"
    }

    forge = {
      color       = "0e8a16"
      description = "FORGE (geração greenfield)"
    }

    planning = {
      color       = "fbca04"
      description = "PR de planejamento (arquitetura/build-plan)"
    }
  }
}

resource "github_issue_label" "pipeline" {
  for_each = local.pipeline_labels

  repository  = var.github_repository
  name        = each.key
  color       = each.value.color
  description = each.value.description
}

# -----------------------------------------------------------------------------
# EXEMPLO (desativado): branch protection da main. NAO habilitar sem pedido
# explicito do operador — hoje a esteira depende de auto-merge/admin-merge
# (escape documentado em MEMORY/ci-runner-stall) e uma protection mal
# calibrada TRAVA o fluxo da Forja e o admin override.
# -----------------------------------------------------------------------------
# data "github_repository" "this" {
#   name = var.github_repository
# }
#
# resource "github_branch_protection" "main" {
#   repository_id = data.github_repository.this.node_id
#   pattern       = "main"
#
#   required_status_checks {
#     strict   = false
#     contexts = ["secret-scan", "specs-governance"]
#   }
#
#   enforce_admins = false
# }
