# Convertit des documents Word en PDF avec Microsoft Word, pilote sans l'afficher.
# -Liste : fichier texte (UTF-8), une conversion par ligne : « source.docx<TAB>cible.pdf ».
# Sortie standard : « pret » quand Word a demarre, puis « fait » apres chaque document. Ces signes de vie
# permettent a l'application d'arreter un Word bloque (fenetre invisible d'activation, de premier lancement...).
# Codes de sortie : 0 = conversions faites ; 3 = Word n'est pas installe ; 1 = erreur (message sur stderr).
param([Parameter(Mandatory = $true)][string]$Liste)

$ErrorActionPreference = 'Stop'
# Messages en UTF-8 : l'application les lit ainsi, accents compris.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

function Write-Signe([string]$texte) {
    [Console]::Out.WriteLine($texte)
    [Console]::Out.Flush()
}

if (-not [Type]::GetTypeFromProgID('Word.Application')) {
    exit 3
}
try {
    $word = New-Object -ComObject Word.Application
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
$code = 0
try {
    $word.Visible = $false
    $word.DisplayAlerts = 0
    Write-Signe 'pret'
    foreach ($ligne in [System.IO.File]::ReadAllLines($Liste, [System.Text.Encoding]::UTF8)) {
        if (-not $ligne) { continue }
        $morceaux = $ligne -split "`t", 2
        # Ouvert en lecture seule, sans conversion ni ajout aux documents recents.
        $document = $word.Documents.Open($morceaux[0], $false, $true, $false)
        try {
            $document.ExportAsFixedFormat($morceaux[1], 17)
        } finally {
            try { $document.Close(0) } catch { }
        }
        Write-Signe 'fait'
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $code = 1
} finally {
    # Word a pu disparaitre entre-temps : sa fermeture ne doit pas masquer le vrai message.
    try { $word.Quit() } catch { }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) } catch { }
}
exit $code
