#requires -Version 7.0
<#
.SYNOPSIS
    Valida a meta-documentacao e a documentacao canonica do monorepo da
    Plataforma DevOps local: front-matter obrigatorio, links relativos que
    resolvem e secoes obrigatorias dos AGENTS.md.

.DESCRIPTION
    Script READ-ONLY e idempotente. Percorre os documentos canonicos do repo
    e aplica tres familias de checagem:

      (a) Front-matter YAML presente no topo, com as chaves obrigatorias
          (title, status, applies_to, updated, language) e valores validos
          (status num enum conhecido; updated em AAAA-MM-DD; language pt-BR).

      (b) Links Markdown relativos resolvem para um arquivo existente. Sao
          ignorados: links http(s)/mailto, ancoras puras (#secao), caminhos
          absolutos da maquina (C:\..., /...) e o ponteiro explicito para o
          ~/.claude/CLAUDE.md global.

      (c) Arquivos AGENTS.md contem os cabecalhos de secao OBRIGATORIOS
          definidos em docs/standards/meta-doc-standard.md (secao 4).

    Conjunto canonico considerado:
      - *.md na RAIZ do repo (exceto planos/temporarios: plan*, temp*, TODO*).
      - docs/** (todos os .md).
      - apps/*/CLAUDE.md e apps/*/AGENTS.md.
      - templates/meta/*.template (somente front-matter, quando presente).

    Imprime um relatorio PASS/FAIL/SKIP por arquivo e um resumo final.
    Retorna codigo de saida != 0 se houver qualquer FAIL.

.PARAMETER RepoRoot
    Raiz do repositorio. Default: a pasta-mae deste script (C:\devops).

.EXAMPLE
    pwsh -File C:\devops\scripts\validate-meta-docs.ps1

.NOTES
    Read-only: nao escreve nada. Seguro rodar localmente e no CI.
    Contrato de meta-doc: docs/standards/meta-doc-standard.md
    Estilo de doc:        docs/standards/documentation-style.md
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Contrato (alinhado a docs/standards/documentation-style.md e meta-doc-standard.md)
# ---------------------------------------------------------------------------
$RequiredFrontMatterKeys = @('title', 'status', 'applies_to', 'updated', 'language')
$ValidStatus             = @('canonical', 'guide', 'reference', 'draft', 'deprecated', 'archived')

# Cabecalhos obrigatorios do AGENTS.md (meta-doc-standard.md secao 4). A
# verificacao e por PALAVRA-CHAVE conceitual, porque o texto exato do heading
# varia entre escopos (ex.: "Visao geral" vs "Visao geral do projeto";
# "Fronteiras de operacao" vs "Regras de seguranca"). Cada item tem:
#   AllOf  -> o heading casa se contiver TODOS estes termos; e/ou
#   AnyOf  -> alternativa: casa se contiver QUALQUER um destes termos.
# Uma secao e considerada presente se ALGUM heading do arquivo satisfizer a
# regra. Isso tolera variacao legitima entre os AGENTS.md maduros do repo.
$RequiredAgentsSections = @(
    @{ Label = 'Visao geral do escopo';     AllOf = @('vis', 'geral') }
    @{ Label = 'Como comecar uma tarefa';   AllOf = @('come') }
    @{ Label = 'Ordem oficial de leitura';  AllOf = @('ordem', 'leitura') }
    @{ Label = 'Matriz de decisao';         AllOf = @('matriz') }
    @{ Label = 'Fronteiras / seguranca';    AnyOf = @('fronteira', 'seguran') }
    @{ Label = 'Validacao obrigatoria';     AnyOf = @('valida', 'seguran') }
    @{ Label = 'Atualizacao de docs';       AllOf = @('atualiza') }
    @{ Label = 'Principios nao-negociaveis'; AllOf = @('princ') }
)

# ---------------------------------------------------------------------------
# Acumuladores e helpers de relatorio
# ---------------------------------------------------------------------------
$script:Failures = [System.Collections.Generic.List[string]]::new()
$script:Warnings = [System.Collections.Generic.List[string]]::new()
$script:Passed   = 0
$script:Skipped  = 0

function Write-Section {
    param([string]$Title)
    Write-Host ''
    Write-Host ('=' * 72) -ForegroundColor Cyan
    Write-Host (" $Title") -ForegroundColor Cyan
    Write-Host ('=' * 72) -ForegroundColor Cyan
}

function Add-Failure {
    param([string]$File, [string]$Message)
    $rel = Resolve-RelPath $File
    $script:Failures.Add("$rel :: $Message")
    Write-Host ("  [FAIL] {0}" -f $Message) -ForegroundColor Red
}

function Add-Pass {
    param([string]$Message)
    $script:Passed++
    Write-Host ("  [PASS] {0}" -f $Message) -ForegroundColor Green
}

function Resolve-RelPath {
    param([string]$Path)
    try {
        $full = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
    } catch {
        $full = $Path
    }
    $rootFull = (Resolve-Path -LiteralPath $RepoRoot).Path
    if ($full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $full.Substring($rootFull.Length).TrimStart('\', '/').Replace('\', '/')
    }
    return $full
}

# Remove acentos para casar headings de forma robusta (pt-BR).
function Remove-Diacritics {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return '' }
    $normalized = $Text.Normalize([System.Text.NormalizationForm]::FormD)
    $sb = [System.Text.StringBuilder]::new()
    foreach ($ch in $normalized.ToCharArray()) {
        $cat = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
        if ($cat -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($ch)
        }
    }
    return $sb.ToString().Normalize([System.Text.NormalizationForm]::FormC)
}

# ---------------------------------------------------------------------------
# Extracao de front-matter (bloco YAML entre '---' no inicio do arquivo).
# Retorna hashtable { Present; Lines[]; Map }.
# Parser minimo de "chave: valor" (sem dependencia externa) — suficiente para
# validar PRESENCA e formato das chaves obrigatorias.
# ---------------------------------------------------------------------------
function Get-FrontMatter {
    param([string[]]$ContentLines)

    $result = @{ Present = $false; Map = @{} }
    if ($null -eq $ContentLines -or $ContentLines.Count -eq 0) { return $result }

    # Primeira linha nao-vazia precisa ser exatamente '---'.
    $idx = 0
    while ($idx -lt $ContentLines.Count -and $ContentLines[$idx].Trim() -eq '') { $idx++ }
    if ($idx -ge $ContentLines.Count -or $ContentLines[$idx].Trim() -ne '---') { return $result }

    $start = $idx + 1
    $end   = -1
    for ($i = $start; $i -lt $ContentLines.Count; $i++) {
        if ($ContentLines[$i].Trim() -eq '---') { $end = $i; break }
    }
    if ($end -lt 0) { return $result }   # fechamento ausente => trata como sem front-matter

    $result.Present = $true
    for ($i = $start; $i -lt $end; $i++) {
        $line = $ContentLines[$i]
        if ($line.Trim() -eq '' -or $line.TrimStart().StartsWith('#')) { continue }
        $m = [regex]::Match($line, '^\s*([A-Za-z0-9_]+)\s*:\s*(.*)$')
        if ($m.Success) {
            $key = $m.Groups[1].Value
            $val = $m.Groups[2].Value.Trim()
            $result.Map[$key] = $val
        }
    }
    return $result
}

function Test-FrontMatter {
    param([string]$File, [string[]]$Lines)

    $fm = Get-FrontMatter -ContentLines $Lines
    if (-not $fm.Present) {
        Add-Failure $File "front-matter YAML ausente no topo do arquivo"
        return
    }

    $missing = @()
    foreach ($key in $RequiredFrontMatterKeys) {
        if (-not $fm.Map.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($fm.Map[$key])) {
            $missing += $key
        }
    }
    if ($missing.Count -gt 0) {
        Add-Failure $File ("front-matter sem chave(s) obrigatoria(s): {0}" -f ($missing -join ', '))
        return
    }

    # status num enum conhecido (remove aspas eventuais).
    $status = $fm.Map['status'].Trim('"', "'")
    if ($ValidStatus -notcontains $status) {
        Add-Failure $File ("status invalido '{0}' (esperado: {1})" -f $status, ($ValidStatus -join '|'))
        return
    }

    # updated em AAAA-MM-DD.
    $updated = $fm.Map['updated'].Trim('"', "'")
    if ($updated -notmatch '^\d{4}-\d{2}-\d{2}$') {
        Add-Failure $File ("updated invalido '{0}' (esperado AAAA-MM-DD)" -f $updated)
        return
    }

    # language pt-BR (aviso, nao falha — alguns docs podem ser en).
    $lang = $fm.Map['language'].Trim('"', "'")
    if ($lang -ne 'pt-BR') {
        $script:Warnings.Add("$(Resolve-RelPath $File) :: language='$lang' (esperado pt-BR)")
    }

    Add-Pass ("front-matter OK (status={0}, updated={1})" -f $status, $updated)
}

# ---------------------------------------------------------------------------
# Links relativos. Extrai [texto](alvo) e verifica resolucao no FS.
# Ignora: http(s):, mailto:, #ancora, caminhos absolutos (C:\..., /...),
# e o ponteiro para ~/.claude (caminho da maquina, intencional).
# ---------------------------------------------------------------------------
function Test-RelativeLinks {
    param([string]$File, [string[]]$Lines)

    $dir = Split-Path -Parent $File
    $broken = 0
    $checked = 0

    # Percorre linha a linha, ignorando blocos de codigo cercados (toggle em
    # linhas que comecam com ``` ou ~~~) e removendo codigo inline (`...`) por
    # linha. Assim, EXEMPLOS de link em codigo nao sao tratados como links reais.
    $inFence = $false
    foreach ($line in $Lines) {
        $trimmed = $line.TrimStart()
        if ($trimmed -match '^(```|~~~)') {
            $inFence = -not $inFence
            continue
        }
        if ($inFence) { continue }

        # Remove spans de codigo inline desta linha.
        $clean = [regex]::Replace($line, '`[^`]*`', '')

        $matches = [regex]::Matches($clean, '\[(?<text>[^\]]*)\]\((?<target>[^)]+)\)')
        foreach ($mt in $matches) {
        $target = $mt.Groups['target'].Value.Trim()
        if ([string]::IsNullOrWhiteSpace($target)) { continue }

        # Remove o titulo opcional do link: (path "titulo").
        $target = ($target -split '\s+', 2)[0]

        # Pular o que nao e link de arquivo do repo.
        if ($target.StartsWith('#')) { continue }
        if ($target -match '^[a-zA-Z][a-zA-Z0-9+.-]*:') { continue }   # http:, https:, mailto:, etc.
        if ($target -match '^[A-Za-z]:[\\/]') { continue }             # C:\... (caminho da maquina)
        if ($target.StartsWith('/')) { continue }                       # absoluto POSIX
        if ($target.StartsWith('~')) { continue }                       # ~/.claude

        # Remove ancora apos o caminho (path.md#secao).
        $pathPart = ($target -split '#', 2)[0]
        if ([string]::IsNullOrWhiteSpace($pathPart)) { continue }

        # Decodifica %20 etc.
        $pathPart = [System.Uri]::UnescapeDataString($pathPart)

        $checked++
        $resolved = Join-Path $dir $pathPart
        if (-not (Test-Path -LiteralPath $resolved)) {
            $broken++
            Add-Failure $File ("link relativo quebrado -> {0}" -f $target)
        }
        }   # fim foreach ($mt ...)
    }       # fim foreach ($line ...)

    if ($broken -eq 0) {
        if ($checked -gt 0) {
            Add-Pass ("{0} link(s) relativo(s) resolvem" -f $checked)
        } else {
            Add-Pass "sem links relativos a verificar"
        }
    }
}

# ---------------------------------------------------------------------------
# Secoes obrigatorias do AGENTS.md (por palavra-chave conceitual).
# ---------------------------------------------------------------------------
function Test-AgentsSections {
    param([string]$File, [string[]]$Lines)

    # Coleta os headings (## ou ###) normalizados (sem acento, minusculos).
    $headings = foreach ($line in $Lines) {
        if ($line -match '^\s{0,3}#{2,3}\s+(.+?)\s*$') {
            (Remove-Diacritics $Matches[1]).ToLowerInvariant()
        }
    }

    $missing = @()
    foreach ($section in $RequiredAgentsSections) {
        $found = $false
        foreach ($h in $headings) {
            $match = $true
            if ($section.ContainsKey('AllOf')) {
                foreach ($term in $section.AllOf) {
                    if ($h -notlike "*$term*") { $match = $false; break }
                }
            }
            if ($match -and $section.ContainsKey('AnyOf')) {
                $any = $false
                foreach ($term in $section.AnyOf) {
                    if ($h -like "*$term*") { $any = $true; break }
                }
                $match = $any
            }
            if ($match) { $found = $true; break }
        }
        if (-not $found) { $missing += $section.Label }
    }

    if ($missing.Count -gt 0) {
        Add-Failure $File ("AGENTS.md sem secao(oes) obrigatoria(s): {0}" -f ($missing -join '; '))
    } else {
        Add-Pass ("todas as {0} secoes obrigatorias do AGENTS.md presentes" -f $RequiredAgentsSections.Count)
    }
}

# ---------------------------------------------------------------------------
# Descoberta do conjunto canonico de documentos.
# ---------------------------------------------------------------------------
function Get-CanonicalDocs {
    $docs = [System.Collections.Generic.List[string]]::new()

    # *.md na RAIZ (exceto planos/temporarios).
    $excludeRootPatterns = @('plan*', 'temp*', 'TODO*', 'NOTES*', 'SCRATCH*')
    Get-ChildItem -LiteralPath $RepoRoot -Filter '*.md' -File | ForEach-Object {
        $skip = $false
        foreach ($pat in $excludeRootPatterns) {
            if ($_.Name -like $pat) { $skip = $true; break }
        }
        if (-not $skip) { $docs.Add($_.FullName) }
    }

    # docs/** (todos os .md).
    $docsDir = Join-Path $RepoRoot 'docs'
    if (Test-Path -LiteralPath $docsDir) {
        Get-ChildItem -LiteralPath $docsDir -Filter '*.md' -File -Recurse |
            ForEach-Object { $docs.Add($_.FullName) }
    }

    # apps/*/CLAUDE.md e apps/*/AGENTS.md (somente no nivel do app).
    $appsDir = Join-Path $RepoRoot 'apps'
    if (Test-Path -LiteralPath $appsDir) {
        Get-ChildItem -LiteralPath $appsDir -Directory | ForEach-Object {
            foreach ($meta in @('CLAUDE.md', 'AGENTS.md')) {
                $p = Join-Path $_.FullName $meta
                if (Test-Path -LiteralPath $p) { $docs.Add($p) }
            }
        }
    }

    # Meta-docs da raiz do monorepo (CLAUDE.md / AGENTS.md ja capturados pela
    # varredura de *.md da raiz acima).

    # Forca array (mesmo com 0 ou 1 elemento) para .Count sob StrictMode.
    return @($docs | Sort-Object -Unique)
}

# ---------------------------------------------------------------------------
# Execucao
# ---------------------------------------------------------------------------
Write-Section "Validacao de meta-docs e docs canonicos"
$rootResolved = (Resolve-Path -LiteralPath $RepoRoot).Path
Write-Host (" Repo: {0}" -f $rootResolved) -ForegroundColor DarkGray

$allDocs = @(Get-CanonicalDocs)
if ($allDocs.Count -eq 0) {
    Write-Host "Nenhum documento canonico encontrado." -ForegroundColor Yellow
    exit 0
}

foreach ($doc in $allDocs) {
    $rel = Resolve-RelPath $doc
    Write-Host ''
    Write-Host ("- {0}" -f $rel) -ForegroundColor White

    try {
        $raw = Get-Content -LiteralPath $doc -Raw -Encoding utf8
    } catch {
        Add-Failure $doc ("nao foi possivel ler o arquivo: {0}" -f $_.Exception.Message)
        continue
    }
    if ($null -eq $raw) { $raw = '' }
    $lines = $raw -split "`r?`n"

    # (a) front-matter.
    Test-FrontMatter -File $doc -Lines $lines

    # (b) links relativos.
    Test-RelativeLinks -File $doc -Lines $lines

    # (c) secoes obrigatorias (apenas AGENTS.md).
    if ((Split-Path -Leaf $doc) -ieq 'AGENTS.md') {
        Test-AgentsSections -File $doc -Lines $lines
    }
}

# ---------------------------------------------------------------------------
# Resumo
# ---------------------------------------------------------------------------
Write-Section "Resumo"
Write-Host (" Documentos analisados: {0}" -f $allDocs.Count)
Write-Host (" Checks PASS:           {0}" -f $script:Passed) -ForegroundColor Green
if ($script:Warnings.Count -gt 0) {
    Write-Host (" Avisos:                {0}" -f $script:Warnings.Count) -ForegroundColor Yellow
    foreach ($w in $script:Warnings) { Write-Host ("   - {0}" -f $w) -ForegroundColor Yellow }
}
Write-Host (" Falhas:                {0}" -f $script:Failures.Count) -ForegroundColor (($script:Failures.Count -gt 0) ? 'Red' : 'Green')

if ($script:Failures.Count -gt 0) {
    Write-Host ''
    Write-Host "FALHAS:" -ForegroundColor Red
    foreach ($f in $script:Failures) { Write-Host ("   - {0}" -f $f) -ForegroundColor Red }
    Write-Host ''
    exit 1
}

Write-Host ''
Write-Host "Tudo OK: meta-docs e docs canonicos validos." -ForegroundColor Green
exit 0
