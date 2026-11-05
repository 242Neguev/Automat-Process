# Installe une signature e-mail dans Outlook classique (Windows). Kit cree par Automat-Process :
# kit.json decrit la signature et les agents ; chaque agent a son dossier dans 'signatures'
# (signature.htm, signature.txt et ses images).
#
# La signature devient celle des nouveaux messages et des reponses du compte Outlook de l'agent (de
# tous ses comptes si son adresse n'y figure pas), comme si l'agent l'avait choisie lui-meme : il peut
# toujours en changer dans Outlook.
#
# Parametres facultatifs, pour un deploiement sans question par le service informatique :
#   -Choix         numero, nom ou adresse e-mail de l'agent
#   -Destination   dossier des signatures d'Outlook (par defaut %APPDATA%\Microsoft\Signatures)
#   -Imposer       impose la signature a tous les comptes : l'agent ne peut plus la changer dans Outlook
#   -SansRegistre  ne pas definir la signature par defaut ni lire les comptes Outlook
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '', Justification = 'Installation interactive : messages en couleur pour l''agent.')]
param(
    [string]$Choix,
    [string]$Destination,
    [switch]$Imposer,
    [switch]$SansRegistre,
    # Racine des reglages d'Office dans le registre (modifiable pour les essais).
    [string]$Office = 'HKCU:\Software\Microsoft\Office'
)

$ErrorActionPreference = 'Stop'

# --- Textes (remplaces par leur traduction quand le kit est cree dans une autre langue) ---
$T = @{
    SansReponse = "Aucune reponse : relancez le script, ou indiquez l'agent avec -Choix."
    AucunUnique = "Aucun agent unique ne correspond a '{0}'."
    Installation = "Installation de la signature '{0}' dans Outlook"
    VousEtes = 'Vous etes {0} ({1}) ? [O/n]'
    Tapez = 'Tapez votre numero (ou une partie de votre nom)'
    Plusieurs = 'Plusieurs agents correspondent : precisez.'
    Aucun = 'Aucun agent ne correspond.'
    Installee = 'Signature de {0} installee.'
    SansCompte = "Aucun compte Outlook n'a ete trouve sur ce poste : dans Outlook, choisissez la signature"
    SansCompte2 = "'{0}' dans Fichier > Options > Courrier > Signatures."
    Rouvrir = "Fermez puis rouvrez Outlook pour l'utiliser."
    Autres = 'Nouvel Outlook, Outlook sur le web ou Gmail : utilisez la page de votre signature (copier-coller).'
}
# --- Fin des textes ---

if (-not $Destination) { $Destination = Join-Path $env:APPDATA 'Microsoft\Signatures' }
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'kit.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$agents = @($config.agents)
$nomSignature = $config.signature
# Office 2013 a Microsoft 365.
$versions = @('16.0', '15.0') | Where-Object { Test-Path -LiteralPath (Join-Path $Office "$_\Outlook") }

# Texte d'une valeur du registre : Outlook en ecrit certaines en binaire (UTF-16).
function ConvertFrom-ValeurRegistre($valeur) {
    if ($valeur -is [byte[]]) { return [Text.Encoding]::Unicode.GetString($valeur).TrimEnd([char]0) }
    return [string]$valeur
}

# Comptes de messagerie des profils Outlook de cette session : leur cle de registre et leur adresse.
function Get-CompteOutlook {
    $comptes = @()
    foreach ($version in $versions) {
        $profils = Join-Path $Office "$version\Outlook\Profiles"
        if (-not (Test-Path -LiteralPath $profils)) { continue }
        foreach ($profil in Get-ChildItem -LiteralPath $profils -ErrorAction SilentlyContinue) {
            $racine = Join-Path $profil.PSPath '9375CFF0413111d3B88A00104B2A6676'
            if (-not (Test-Path -LiteralPath $racine)) { continue }
            foreach ($cle in Get-ChildItem -LiteralPath $racine -ErrorAction SilentlyContinue) {
                $nom = ConvertFrom-ValeurRegistre $cle.GetValue('Account Name')
                $email = ConvertFrom-ValeurRegistre $cle.GetValue('Email')
                $adresse = if ($nom -match '@') { $nom } elseif ($email -match '@') { $email } else { $null }
                if ($adresse) { $comptes += [pscustomobject]@{ Cle = $cle.PSPath; Adresse = $adresse.Trim() } }
            }
        }
    }
    return $comptes
}

# Signature par defaut d'un compte, pour les nouveaux messages et pour les reponses et transferts. Le type
# d'une valeur deja presente est conserve (texte, ou binaire UTF-16 des anciennes versions d'Outlook).
function Set-SignatureCompte([string]$cle, [string]$nom) {
    foreach ($valeur in 'New Signature', 'Reply-Forward Signature') {
        $binaire = $false
        try { $binaire = (Get-Item -LiteralPath $cle).GetValueKind($valeur) -eq [Microsoft.Win32.RegistryValueKind]::Binary } catch { }
        if ($binaire) {
            Set-ItemProperty -LiteralPath $cle -Name $valeur -Value ([Text.Encoding]::Unicode.GetBytes($nom + [char]0)) -Type Binary
        } else {
            Set-ItemProperty -LiteralPath $cle -Name $valeur -Value $nom -Type String
        }
    }
}

# Agents qui correspondent a un numero, une adresse e-mail ou une partie du nom. PowerShell deroule le
# tableau renvoye : l'appel s'ecrit @(Find-Agent ...), car sous Windows PowerShell 5.1 un agent seul
# (objet JSON) n'a pas de propriete Count.
function Find-Agent([object[]]$parmi, [string]$texte) {
    $texte = $texte.Trim()
    if ($texte -match '^\d+$') { return @($parmi | Where-Object { $_.numero -eq [int]$texte }) }
    return @($parmi | Where-Object { $_.email -eq $texte -or $_.nom -like "*$texte*" })
}

# Plus rien a lire (script lance sans clavier et sans -Choix) : arret, au lieu de reposer la question.
function Stop-SansReponse {
    [Console]::Error.WriteLine($T.SansReponse)
    exit 1
}

$comptes = @()
if (-not $SansRegistre) { $comptes = @(Get-CompteOutlook) }

$agent = $null
if ($Choix) {
    $trouves = @(Find-Agent $agents $Choix)
    if ($trouves.Count -ne 1) {
        [Console]::Error.WriteLine(($T.AucunUnique -f $Choix))
        exit 1
    }
    $agent = $trouves[0]
} else {
    Write-Host ''
    Write-Host ($T.Installation -f $nomSignature) -ForegroundColor Cyan
    # Proposition d'office : l'agent dont l'adresse est celle d'un compte Outlook de ce poste.
    $adresses = @($comptes | ForEach-Object { $_.Adresse })
    $propose = $agents | Where-Object { $adresses -contains $_.email } | Select-Object -First 1
    if ($propose) {
        $reponse = Read-Host ($T.VousEtes -f $propose.nom, $propose.email)
        if ($null -eq $reponse) { Stop-SansReponse }
        $reponse = $reponse.Trim()
        if ($reponse -eq '' -or $reponse -match '^[oOyY]') { $agent = $propose }
    }
    $liste = $agents
    while (-not $agent) {
        Write-Host ''
        foreach ($a in $liste) { Write-Host ('{0,4}. {1}  {2}' -f $a.numero, $a.nom, $a.email) }
        $saisie = Read-Host $T.Tapez
        if ($null -eq $saisie) { Stop-SansReponse }
        if (-not $saisie.Trim()) { continue }
        $trouves = @(Find-Agent $agents $saisie)
        if ($trouves.Count -eq 1) { $agent = $trouves[0] }
        elseif ($trouves.Count -gt 1) {
            Write-Host $T.Plusieurs -ForegroundColor Yellow
            $liste = $trouves
        } else {
            Write-Host $T.Aucun -ForegroundColor Yellow
        }
    }
}

# Fichiers d'Outlook : <signature>.htm, <signature>.txt et le dossier des images que le HTML designe
# (nom sans accents donne par kit.json ; <signature>_fichiers pour un kit plus ancien).
$source = Join-Path (Join-Path $PSScriptRoot 'signatures') $agent.dossier
if (-not (Test-Path -LiteralPath $Destination)) { New-Item -ItemType Directory -Path $Destination | Out-Null }
Copy-Item -LiteralPath (Join-Path $source 'signature.htm') -Destination (Join-Path $Destination "$nomSignature.htm") -Force
Copy-Item -LiteralPath (Join-Path $source 'signature.txt') -Destination (Join-Path $Destination "$nomSignature.txt") -Force
$images = Join-Path $source 'images'
if (Test-Path -LiteralPath $images) {
    $dossierImages = if ($config.images) { $config.images } else { "$($nomSignature)_fichiers" }
    $cible = Join-Path $Destination $dossierImages
    if (-not (Test-Path -LiteralPath $cible)) { New-Item -ItemType Directory -Path $cible | Out-Null }
    Copy-Item -Path (Join-Path $images '*') -Destination $cible -Force
}

$parDefaut = $false
if (-not $SansRegistre) {
    # Le compte de l'agent ; tous les comptes si son adresse n'est pas dans Outlook.
    $siens = @($comptes | Where-Object { $_.Adresse -eq $agent.email })
    if ($siens.Count -eq 0) { $siens = $comptes }
    foreach ($compte in $siens) { Set-SignatureCompte $compte.Cle $nomSignature }
    $parDefaut = $siens.Count -gt 0
    foreach ($version in $versions) {
        # -Imposer : reglage commun a tous les comptes, que l'agent ne peut plus changer. Sans -Imposer, un
        # reglage impose auparavant par ce kit est leve ; un reglage pose par quelqu'un d'autre est laisse.
        $reglages = Join-Path $Office "$version\Common\MailSettings"
        if ($Imposer) {
            if (-not (Test-Path -LiteralPath $reglages)) { New-Item -Path $reglages -Force | Out-Null }
            Set-ItemProperty -LiteralPath $reglages -Name 'NewSignature' -Value $nomSignature -Type ExpandString
            Set-ItemProperty -LiteralPath $reglages -Name 'ReplySignature' -Value $nomSignature -Type ExpandString
            $parDefaut = $true
        } elseif (Test-Path -LiteralPath $reglages) {
            $actuels = Get-ItemProperty -LiteralPath $reglages
            foreach ($valeur in 'NewSignature', 'ReplySignature') {
                if ($actuels.$valeur -eq $nomSignature) { Remove-ItemProperty -LiteralPath $reglages -Name $valeur }
            }
        }
        # Les signatures 'itinerantes' de Microsoft 365 ignoreraient les fichiers installes ici.
        $installation = Join-Path $Office "$version\Outlook\Setup"
        if (-not (Test-Path -LiteralPath $installation)) { New-Item -Path $installation -Force | Out-Null }
        Set-ItemProperty -LiteralPath $installation -Name 'DisableRoamingSignaturesTemporaryToggle' -Value 1 -Type DWord
    }
}

Write-Host ''
Write-Host ($T.Installee -f $agent.nom) -ForegroundColor Green
if (-not $SansRegistre -and -not $parDefaut) {
    Write-Host $T.SansCompte
    Write-Host ($T.SansCompte2 -f $nomSignature)
}
Write-Host $T.Rouvrir
Write-Host $T.Autres
exit 0
