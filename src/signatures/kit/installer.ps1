# Installe une signature e-mail dans Outlook classique (Windows). Kit cree par Automat-Process :
# kit.json decrit la signature et les agents ; chaque agent a son dossier dans 'signatures'
# (signature.htm, signature.txt et ses images).
#
# Parametres facultatifs, pour un deploiement sans question par le service informatique :
#   -Choix         numero, nom ou adresse e-mail de l'agent
#   -Destination   dossier des signatures d'Outlook (par defaut %APPDATA%\Microsoft\Signatures)
#   -SansRegistre  ne pas definir la signature par defaut ni lire les comptes Outlook
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '', Justification = 'Installation interactive : messages en couleur pour l''agent.')]
param(
    [string]$Choix,
    [string]$Destination,
    [switch]$SansRegistre
)

$ErrorActionPreference = 'Stop'
if (-not $Destination) { $Destination = Join-Path $env:APPDATA 'Microsoft\Signatures' }
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'kit.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$agents = @($config.agents)
$nomSignature = $config.signature

# Adresses des comptes Outlook de cette session (Office 2013 a Microsoft 365).
function Get-AdresseOutlook {
    $adresses = @()
    foreach ($version in '16.0', '15.0') {
        $profils = "HKCU:\Software\Microsoft\Office\$version\Outlook\Profiles"
        if (-not (Test-Path -LiteralPath $profils)) { continue }
        foreach ($cle in Get-ChildItem -LiteralPath $profils -Recurse -ErrorAction SilentlyContinue) {
            $valeur = $cle.GetValue('Account Name')
            if ($valeur -is [byte[]]) { $adresses += [Text.Encoding]::Unicode.GetString($valeur).TrimEnd([char]0) }
            elseif ($valeur) { $adresses += [string]$valeur }
        }
    }
    return @($adresses | Where-Object { $_ -match '@' } | Select-Object -Unique)
}

# Agents qui correspondent a un numero, une adresse e-mail ou une partie du nom.
function Find-Agent([object[]]$parmi, [string]$texte) {
    $texte = $texte.Trim()
    if ($texte -match '^\d+$') { return @($parmi | Where-Object { $_.numero -eq [int]$texte }) }
    return @($parmi | Where-Object { $_.email -eq $texte -or $_.nom -like "*$texte*" })
}

$agent = $null
if ($Choix) {
    $trouves = Find-Agent $agents $Choix
    if ($trouves.Count -ne 1) {
        [Console]::Error.WriteLine("Aucun agent unique ne correspond a '$Choix'.")
        exit 1
    }
    $agent = $trouves[0]
} else {
    Write-Host ''
    Write-Host "Installation de la signature '$nomSignature' dans Outlook" -ForegroundColor Cyan
    # Proposition d'office : l'agent dont l'adresse est celle d'un compte Outlook de ce poste.
    $adresses = @()
    if (-not $SansRegistre) { $adresses = Get-AdresseOutlook }
    $propose = $agents | Where-Object { $adresses -contains $_.email } | Select-Object -First 1
    if ($propose) {
        $reponse = Read-Host "Vous etes $($propose.nom) ($($propose.email)) ? [O/n]"
        if ($reponse -eq '' -or $reponse -match '^[oOyY]') { $agent = $propose }
    }
    $liste = $agents
    while (-not $agent) {
        Write-Host ''
        foreach ($a in $liste) { Write-Host ('{0,4}. {1}  {2}' -f $a.numero, $a.nom, $a.email) }
        $saisie = Read-Host 'Tapez votre numero (ou une partie de votre nom)'
        if (-not $saisie) { continue }
        $trouves = Find-Agent $agents $saisie
        if ($trouves.Count -eq 1) { $agent = $trouves[0] }
        elseif ($trouves.Count -gt 1) {
            Write-Host 'Plusieurs agents correspondent : precisez.' -ForegroundColor Yellow
            $liste = $trouves
        } else {
            Write-Host 'Aucun agent ne correspond.' -ForegroundColor Yellow
        }
    }
}

# Fichiers d'Outlook : <signature>.htm, <signature>.txt et le dossier <signature>_fichiers des images.
$source = Join-Path (Join-Path $PSScriptRoot 'signatures') $agent.dossier
if (-not (Test-Path -LiteralPath $Destination)) { New-Item -ItemType Directory -Path $Destination | Out-Null }
Copy-Item -LiteralPath (Join-Path $source 'signature.htm') -Destination (Join-Path $Destination "$nomSignature.htm") -Force
Copy-Item -LiteralPath (Join-Path $source 'signature.txt') -Destination (Join-Path $Destination "$nomSignature.txt") -Force
$images = Join-Path $source 'images'
if (Test-Path -LiteralPath $images) {
    $cible = Join-Path $Destination "$($nomSignature)_fichiers"
    if (-not (Test-Path -LiteralPath $cible)) { New-Item -ItemType Directory -Path $cible | Out-Null }
    Copy-Item -Path (Join-Path $images '*') -Destination $cible -Force
}

if (-not $SansRegistre) {
    foreach ($version in '16.0', '15.0') {
        if (-not (Test-Path -LiteralPath "HKCU:\Software\Microsoft\Office\$version\Outlook")) { continue }
        # Les cles existantes sont completees, jamais remplacees.
        $reglages = "HKCU:\Software\Microsoft\Office\$version\Common\MailSettings"
        if (-not (Test-Path -LiteralPath $reglages)) { New-Item -Path $reglages | Out-Null }
        Set-ItemProperty -LiteralPath $reglages -Name 'NewSignature' -Value $nomSignature
        Set-ItemProperty -LiteralPath $reglages -Name 'ReplySignature' -Value $nomSignature
        # Les signatures 'itinerantes' de Microsoft 365 ignoreraient les fichiers installes ici.
        $installation = "HKCU:\Software\Microsoft\Office\$version\Outlook\Setup"
        if (-not (Test-Path -LiteralPath $installation)) { New-Item -Path $installation | Out-Null }
        Set-ItemProperty -LiteralPath $installation -Name 'DisableRoamingSignaturesTemporaryToggle' -Value 1 -Type DWord
    }
}

Write-Host ''
Write-Host "Signature de $($agent.nom) installee." -ForegroundColor Green
Write-Host "Fermez puis rouvrez Outlook pour l'utiliser."
Write-Host 'Nouvel Outlook, Outlook sur le web ou Gmail : utilisez la page de votre signature (copier-coller).'
exit 0
