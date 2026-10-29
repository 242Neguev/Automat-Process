// Gabarit « carte » : aperçu d'une carte, cartes unitaires avec fond perdu, ou planches imposées.
// Fichiers virtuels : /projet.json (format, fonds, champs) et /agents.json (valeurs de chaque agent).
// Entrées (sys.inputs) : mode = apercu | cartes | planches ; agent et face (aperçu) ; feuille = A4 | A3 | SRA3.
// Les positions des champs sont en mm depuis le coin haut-gauche de la carte finie (hors fond perdu).
#let projet = json("/projet.json")
#let agents = json("/agents.json")
#let entree(cle, defaut) = sys.inputs.at(cle, default: defaut)
#let mode = entree("mode", "cartes")

#let fp = projet.format.fond_perdu_mm * 1mm
#let largeur = projet.format.largeur_mm * 1mm
#let hauteur = projet.format.hauteur_mm * 1mm
#let cw = largeur + 2 * fp
#let ch = hauteur + 2 * fp
#let couleur(c) = if "cmyk" in c { cmyk(..c.cmyk.map(v => v * 1%)) } else { rgb(c.rgb) }
#let REPERAGE = cmyk(100%, 100%, 100%, 100%)
#let K = 1.2 // interlignage des textes variables

#let style(f) = (font: f.police, weight: f.graisse, fill: couleur(f.couleur),
  tracking: f.interlettrage_em * 1em, top-edge: "baseline", bottom-edge: "baseline")
#let paragraphe(f, valeur, t) = par(leading: K * t, text(size: t, ..style(f), valeur))

// À appeler dans un `context` : taille retenue et nombre de lignes (réduction, puis passage sur N lignes).
#let ajuster(f, valeur) = {
  let W = f.largeur_max_mm * 1mm
  let tmin = f.taille_min_pt * 1pt
  let largeur-texte(t) = measure(text(size: t, ..style(f), valeur)).width
  let nb-lignes(t) = int(calc.round(measure(block(width: W, paragraphe(f, valeur, t))).height / (K * t))) + 1
  let t = f.taille_pt * 1pt
  while t > tmin and largeur-texte(t) > W { t -= 0.1pt }
  let lignes = 1
  let deborde = largeur-texte(t) > W
  if deborde and f.lignes_max > 1 {
    t = f.taille_pt * 1pt
    while t > tmin and nb-lignes(t) > f.lignes_max { t -= 0.1pt }
    lignes = nb-lignes(t)
    deborde = lignes > f.lignes_max
  }
  (taille: t, lignes: lignes, deborde: deborde)
}

#let poser(f, valeur, t, y) = {
  let W = f.largeur_max_mm * 1mm
  let x = f.x_mm * 1mm
  let (dx, al) = if f.ancre == "middle" { (x - W / 2, center) } else if f.ancre == "end" { (x - W, right) } else { (x, left) }
  place(top + left, dx: fp + dx, dy: fp + y, block(width: W, align(al, paragraphe(f, valeur, t))))
}

// Les textes forment un flux vertical : une ligne vide disparaît et les suivantes remontent ;
// un texte passé sur plusieurs lignes pousse les suivants vers le bas.
#let textes-variables(a) = context {
  let textes = projet.champs.filter(f => f.type == "texte").sorted(key: f => f.y_mm)
  let y = none
  let ecart-en-attente = none
  let precedent = none
  for f in textes {
    let v = a.valeurs.at(f.id, default: "")
    let ecart = if precedent == none { 0mm } else { (f.y_mm - precedent.y_mm) * 1mm }
    precedent = f
    if v == "" {
      if ecart-en-attente == none { ecart-en-attente = ecart }
      continue
    }
    let r = ajuster(f, v)
    y = if y == none { f.y_mm * 1mm } else { y + calc.max(ecart, if ecart-en-attente == none { 0mm } else { ecart-en-attente }) }
    ecart-en-attente = none
    [#metadata((agent: a.id, champ: f.id, taille: calc.round(r.taille / 1pt, digits: 1), origine: f.taille_pt,
      lignes: r.lignes, deborde: r.deborde)) <controle>]
    poser(f, v, r.taille, y)
    y += (r.lignes - 1) * K * r.taille
  }
}

// QR code vectoriel : un seul tracé fait des segments horizontaux de modules sombres.
#let qr(code, taille, fill) = {
  let m = taille / code.n
  box(width: taille, height: taille, curve(fill: fill, stroke: none, ..code.runs.map(((x, y, l)) => (
    curve.move((x * m, y * m)), curve.line(((x + l) * m, y * m)), curve.line(((x + l) * m, (y + 1) * m)),
    curve.line((x * m, (y + 1) * m)), curve.close(mode: "straight"),
  )).flatten()))
}

// Fond perdu d'un visuel au format fini : les 0,25 mm du bord sont étirés sur toute la largeur du fond
// perdu, sur les quatre côtés et dans les angles. La couleur du bord continue donc à l'identique : une
// coupe légèrement décalée ne laisse apparaître ni filet blanc ni motif parasite.
#let prolonger-bords(chemin) = {
  let bord = 0.25mm
  let k = fp / bord
  // Les bandes passent 0,2 mm sous le visuel : aucune jonction, donc aucun filet à l'impression.
  let c = 0.2mm
  // Sur chaque axe : bande d'avant (gauche ou haut, étirée), milieu (à l'échelle 1) ou d'après (étirée).
  let segments(taille) = (
    (pos: 0mm, long: fp + c, etire: true, apres: false),
    (pos: fp, long: taille, etire: false, apres: false),
    (pos: fp + taille - c, long: fp + c, etire: true, apres: true),
  )
  for sx in segments(largeur) {
    for sy in segments(hauteur) {
      if sx.etire or sy.etire {
        let w = if sx.etire { largeur * k } else { largeur }
        let h = if sy.etire { hauteur * k } else { hauteur }
        // Pour une bande d'après, le bord du visuel (taille - bord) doit tomber au début de la bande, après c.
        let dx = if sx.apres { c - (largeur - bord) * k } else { 0mm }
        let dy = if sy.apres { c - (hauteur - bord) * k } else { 0mm }
        place(dx: sx.pos, dy: sy.pos, box(width: sx.long, height: sy.long, clip: true,
          place(dx: dx, dy: dy, image(chemin, width: w, height: h, fit: "stretch"))))
      }
    }
  }
}

// Visuel de la carte, sans déformation (« cover »). S'il contient déjà le fond perdu, il couvre toute
// la carte. S'il est au format fini, il est posé tel quel dans la zone de coupe (rien n'est rogné) et
// son fond perdu est complété en prolongeant ses bords (inutile pour l'aperçu, qui ne montre pas le
// fond perdu). Sans visuel : carte blanche.
#let fond(chemin, avec-fond-perdu) = if chemin in (none, "") { [] } else if avec-fond-perdu {
  image(chemin, width: cw, height: ch, fit: "cover")
} else {
  if fp > 0mm and mode != "apercu" { prolonger-bords(chemin) }
  place(dx: fp, dy: fp, image(chemin, width: largeur, height: hauteur, fit: "cover"))
}
#let fond-verso = projet.at("fond_verso", default: none)
#let avec-verso = fond-verso not in (none, "")

// Carte complète, fond perdu compris (cw × ch).
#let carte-recto(a) = box(width: cw, height: ch, clip: true, fill: white, {
  place(fond(projet.at("fond_recto", default: none), projet.at("fond_recto_avec_fond_perdu", default: true)))
  textes-variables(a)
  // Pas de QR code quand l'agent n'a pas de vCard (aucune donnée de contact).
  if a.at("qr", default: none) != none {
    for f in projet.champs.filter(f => f.type == "qr") {
      place(top + left, dx: fp + f.x_mm * 1mm, dy: fp + f.y_mm * 1mm, qr(a.qr, f.taille_mm * 1mm, couleur(f.couleur)))
    }
  }
})
#let carte-verso() = box(width: cw, height: ch, clip: true, fill: white, fond(fond-verso, projet.at("fond_verso_avec_fond_perdu", default: true)))

// Page au format fini avec fond perdu natif : le PDF reçoit une TrimBox (zone de coupe) pour l'imprimeur.
#let page-carte(contenu) = page(width: largeur, height: hauteur, margin: 0pt, bleed: fp, background: contenu)[]

#let FEUILLES = (A4: (210mm, 297mm), A3: (297mm, 420mm), SRA3: (320mm, 450mm))

#let planches(feuille, marge: 10mm) = {
  // Orientation de la feuille qui loge le plus de cartes.
  let options = (feuille, feuille.rev()).map(((l, h)) => {
    let cols = calc.floor((l - 2 * marge) / cw)
    let rows = calc.floor((h - 2 * marge) / ch)
    (l: l, h: h, cols: cols, rows: rows, n: cols * rows)
  })
  let p = if options.at(1).n > options.at(0).n { options.at(1) } else { options.at(0) }
  let ox = (p.l - p.cols * cw) / 2
  let oy = (p.h - p.rows * ch) / 2
  let s = 0.25pt + REPERAGE
  let traits = {
    for c in range(p.cols) {
      for x in (ox + c * cw + fp, ox + (c + 1) * cw - fp) {
        place(line(start: (x, oy - 6mm), end: (x, oy - 1mm), stroke: s))
        place(line(start: (x, oy + p.rows * ch + 1mm), end: (x, oy + p.rows * ch + 6mm), stroke: s))
      }
    }
    for r in range(p.rows) {
      for y in (oy + r * ch + fp, oy + (r + 1) * ch - fp) {
        place(line(start: (ox - 6mm, y), end: (ox - 1mm, y), stroke: s))
        place(line(start: (ox + p.cols * cw + 1mm, y), end: (ox + p.cols * cw + 6mm, y), stroke: s))
      }
    }
  }
  let lots = agents.chunks(p.n)
  for (i, lot) in lots.enumerate() {
    for face in (if avec-verso { ("RECTO", "VERSO") } else { ("RECTO",) }) {
      page(width: p.l, height: p.h, margin: 0pt, {
        for (j, a) in lot.enumerate() {
          let c = calc.rem(j, p.cols)
          if face == "VERSO" { c = p.cols - 1 - c } // miroir gauche-droite : feuille retournée autour de l'axe vertical
          let r = calc.quo(j, p.cols)
          place(dx: ox + c * cw, dy: oy + r * ch, if face == "RECTO" { carte-recto(a) } else { carte-verso() })
        }
        traits
        place(bottom + center, dy: -3mm, text(font: "Arial", size: 6pt, fill: REPERAGE)[
          Automat-Process · planche #(i + 1)/#lots.len() · #face · #lot.len() cartes ·
          #projet.format.largeur_mm × #projet.format.hauteur_mm mm + fond perdu #projet.format.fond_perdu_mm mm
        ])
      })
    }
  }
}

#if mode == "apercu" {
  let a = agents.at(int(entree("agent", "0")))
  page-carte(if entree("face", "recto") == "verso" { carte-verso() } else { carte-recto(a) })
} else if mode == "cartes" {
  for a in agents {
    page-carte(carte-recto(a))
    if avec-verso { page-carte(carte-verso()) }
  }
} else if mode == "planches" {
  planches(FEUILLES.at(entree("feuille", "A4")))
}
