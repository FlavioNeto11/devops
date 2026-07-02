# =============================================================================
# Backend de estado: Secret Kubernetes no cluster local (docker-desktop).
# -----------------------------------------------------------------------------
# O estado fica no Secret "tfstate-default-platform-iac" do namespace dedicado
# devops-iac (manifest em platform/namespaces/namespaces.yaml — aplique com
# kubectl ANTES do primeiro `tofu init`; passo no README). O estado PODE
# conter valores sensiveis: nunca exporte esse Secret para o git.
# =============================================================================

terraform {
  backend "kubernetes" {
    secret_suffix  = "platform-iac"
    namespace      = "devops-iac"
    config_path    = "~/.kube/config"
    config_context = "docker-desktop"
  }
}
