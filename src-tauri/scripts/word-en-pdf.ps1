# Convertit des documents Word en PDF avec Microsoft Word, pilote sans l'afficher.
# -Liste : fichier texte (UTF-8), une conversion par ligne : « source.docx<TAB>cible.pdf ».
# Codes de sortie : 0 = conversions faites ; 3 = Word n'est pas installe ; 1 = erreur (message sur stderr).
param([Parameter(Mandatory = $true)][string]$Liste)

$ErrorActionPreference = 'Stop'
try {
    $word = New-Object -ComObject Word.Application
} catch {
    exit 3
}
try {
    $word.Visible = $false
    $word.DisplayAlerts = 0
    foreach ($ligne in [System.IO.File]::ReadAllLines($Liste, [System.Text.Encoding]::UTF8)) {
        if (-not $ligne) { continue }
        $morceaux = $ligne -split "`t", 2
        # Ouvert en lecture seule, sans conversion ni ajout aux documents recents.
        $document = $word.Documents.Open($morceaux[0], $false, $true, $false)
        try {
            $document.ExportAsFixedFormat($morceaux[1], 17)
        } finally {
            $document.Close(0)
        }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    $word.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
exit 0
