// Gabarit « carte » : aperçu d'une carte, cartes unitaires avec fond perdu, planches imposées, vignettes
// de la mosaïque, ou mesures de contrôle seules.
// Fichiers virtuels : /projet.json (format, fonds, champs) et /agents.json (valeurs de chaque agent).
// Entrées (sys.inputs) : mode = apercu | cartes | planches | mosaique | ecran | controle | bat ; agent et
// face (aperçu) ; feuille = A4 | A3 | SRA3 ; titre et date (BAT) ; profil = impression | ecran (visuels) ;
// langue = fr | en (textes du bon à tirer et des planches).
// Les positions des champs sont en mm depuis le coin haut-gauche de la carte finie (hors fond perdu).
// Variantes (filiale, langue…) : un agent peut avoir les visuels de sa variante ; photos : chaque agent
// peut avoir une photo par champ photo, avec son recadrage.
#let projet = json("/projet.json")
#let agents = json("/agents.json")
#let variantes = projet.at("variantes", default: none)
#let entree(cle, defaut) = sys.inputs.at(cle, default: defaut)
#let mode = entree("mode", "cartes")
#let anglais = entree("langue", "fr") == "en"
#let tr(francais, anglais_) = if anglais { anglais_ } else { francais }

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

// Mesures d'un texte posé, pour le rapport de contrôle (mm depuis le coin haut-gauche de la carte finie) :
// taille retenue, lignes, débordement, encombrement réel de l'encre et ligne de base de sa dernière ligne.
#let mesures(a, f, valeur, r, y) = {
  let mm(longueur) = calc.round(longueur / 1mm, digits: 2)
  let w = measure(width: f.largeur_max_mm * 1mm, paragraphe(f, valeur, r.taille)).width
  let x = f.x_mm * 1mm
  let gauche = if f.ancre == "middle" { x - w / 2 } else if f.ancre == "end" { x - w } else { x }
  let encre(haut, bas) = measure(text(size: r.taille, ..style(f), top-edge: haut, bottom-edge: bas, valeur)).height
  let derniere = y + (r.lignes - 1) * K * r.taille
  (agent: a.id, champ: f.id, taille: calc.round(r.taille / 1pt, digits: 1), origine: f.taille_pt,
    lignes: r.lignes, deborde: r.deborde, gauche: mm(gauche), droite: mm(gauche + w),
    haut: mm(y - encre("bounds", "baseline")), bas: mm(derniere + encre("baseline", "bounds")), base: mm(derniere))
}

// Un texte avec un lien (téléphone, e-mail, site : cartes numériques) est cliquable dans le PDF.
#let poser(f, valeur, t, y, lien: none) = {
  let W = f.largeur_max_mm * 1mm
  let x = f.x_mm * 1mm
  let (dx, al) = if f.ancre == "middle" { (x - W / 2, center) } else if f.ancre == "end" { (x - W, right) } else { (x, left) }
  let contenu = align(al, paragraphe(f, valeur, t))
  place(top + left, dx: fp + dx, dy: fp + y, block(width: W, if lien == none { contenu } else { link(lien, contenu) }))
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
    [#metadata(mesures(a, f, v, r, y)) <controle>]
    poser(f, v, r.taille, y, lien: a.at("liens", default: (:)).at(f.id, default: none))
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
// son fond perdu est complété en prolongeant ses bords, seulement pour l'impression : l'aperçu, la
// mosaïque et les cartes numériques ne montrent pas le fond perdu. Sans visuel : carte blanche.
#let fond(chemin, avec-fond-perdu) = if chemin in (none, "") { [] } else if avec-fond-perdu {
  image(chemin, width: cw, height: ch, fit: "cover")
} else {
  if fp > 0mm and mode in ("cartes", "planches") { prolonger-bords(chemin) }
  place(dx: fp, dy: fp, image(chemin, width: largeur, height: hauteur, fit: "cover"))
}
// Les cartes ont un verso si le modèle ou l'une de ses variantes en a un ; un agent sans verso a alors
// un verso blanc (une planche recto verso garde sa forme).
#let a-un-verso(v) = v.at("fond_verso", default: none) not in (none, "")
#let avec-verso = a-un-verso(projet) or (variantes != none and variantes.valeurs.any(a-un-verso))

// Variante d'un agent : ses visuels remplacent ceux du modèle, face par face.
#let variante(a) = {
  let rang = a.at("variante", default: none)
  if variantes == none or rang == none { none } else { variantes.valeurs.at(rang, default: none) }
}

// Profil « écran » (cartes numériques) : la version écran d'un visuel (RVB, souvent au format fini)
// remplace celle de l'imprimeur quand le modèle en a une ; sinon, la version de l'imprimeur sert aussi.
// Le visuel d'une variante sert aussi pour l'écran : il est propre à ses agents.
#let profil = entree("profil", "impression")
#let visuel(face, a) = {
  let propre = variante(a)
  let chemin = if propre == none { none } else { propre.at("fond_" + face, default: none) }
  let ecran = projet.at("fond_" + face + "_ecran", default: none)
  if chemin not in (none, "") {
    fond(chemin, propre.at("fond_" + face + "_avec_fond_perdu", default: true))
  } else if profil == "ecran" and ecran not in (none, "") {
    fond(ecran, projet.at("fond_" + face + "_ecran_avec_fond_perdu", default: false))
  } else {
    fond(projet.at("fond_" + face, default: none), projet.at("fond_" + face + "_avec_fond_perdu", default: true))
  }
}

// Photo d'un agent dans son cadre : elle le couvre sans déformation (zoom 1), et le point visé de la photo
// (centre_x, centre_y : fractions depuis son coin haut-gauche) vient au centre du cadre, sans laisser de vide.
#let photo(f, p) = {
  let w = f.largeur_mm * 1mm
  let h = f.hauteur_mm * 1mm
  let proportions = p.largeur_px / p.hauteur_px
  let (iw, ih) = if proportions > w / h { (h * proportions, h) } else { (w, w / proportions) }
  iw = iw * calc.max(1, p.zoom)
  ih = ih * calc.max(1, p.zoom)
  let dx = calc.max(w - iw, calc.min(0pt, w / 2 - p.centre_x * iw))
  let dy = calc.max(h - ih, calc.min(0pt, h / 2 - p.centre_y * ih))
  let rayon = if f.forme == "cercle" { calc.min(w, h) / 2 } else if f.forme == "arrondi" { calc.min(w, h) * 0.12 } else { 0pt }
  box(width: w, height: h, clip: true, radius: rayon, place(dx: dx, dy: dy, image(p.chemin, width: iw, height: ih, fit: "stretch")))
}

// Carte complète, fond perdu compris (cw × ch).
#let carte-recto(a) = box(width: cw, height: ch, clip: true, fill: white, {
  place(visuel("recto", a))
  // Zones effacées (texte d'exemple incrusté dans le visuel) : aplats sous les informations.
  for m in projet.champs.filter(f => f.type == "masque") {
    place(top + left, dx: fp + m.x_mm * 1mm, dy: fp + m.y_mm * 1mm,
      rect(width: m.largeur_mm * 1mm, height: m.hauteur_mm * 1mm, fill: couleur(m.couleur), stroke: none))
  }
  // Photos, sous les textes ; un agent sans photo garde le visuel tel quel à cet endroit.
  for f in projet.champs.filter(f => f.type == "photo") {
    let p = a.at("photos", default: (:)).at(f.id, default: none)
    if p != none { place(top + left, dx: fp + f.x_mm * 1mm, dy: fp + f.y_mm * 1mm, photo(f, p)) }
  }
  textes-variables(a)
  // Pas de QR code quand l'agent n'a pas de vCard (aucune donnée de contact).
  if a.at("qr", default: none) != none {
    for f in projet.champs.filter(f => f.type == "qr") {
      place(top + left, dx: fp + f.x_mm * 1mm, dy: fp + f.y_mm * 1mm, qr(a.qr, f.taille_mm * 1mm, couleur(f.couleur)))
    }
  }
})
#let carte-verso(a) = box(width: cw, height: ch, clip: true, fill: white, visuel("verso", a))

// Page au format fini avec fond perdu natif : le PDF reçoit une TrimBox (zone de coupe) pour l'imprimeur.
#let page-carte(contenu) = page(width: largeur, height: hauteur, margin: 0pt, bleed: fp, background: contenu)[]

#let FEUILLES = (A4: (210mm, 297mm), A3: (297mm, 420mm), SRA3: (320mm, 450mm))

// Bon à tirer : une page A4 par carte à faire valider. Recto et verso en taille réelle (fond perdu
// visible, coupe en pointillés), recto agrandi pour la relecture, filigrane et encadré de validation.
#let ROUGE-BAT = rgb("#b42318")
#let avec-coupe(carte, legende) = stack(spacing: 2mm,
  box(width: cw, height: ch, {
    place(carte)
    place(dx: fp, dy: fp, rect(width: largeur, height: hauteur, stroke: (paint: ROUGE-BAT, thickness: 0.4pt, dash: "dashed")))
  }),
  text(8pt, fill: luma(90))[#legende])
#let case = box(width: 3.2mm, height: 3.2mm, stroke: 0.5pt, baseline: 0.5mm)
#let bat() = {
  let filigrane = place(center + horizon, rotate(-32deg,
    text(86pt, weight: "bold", fill: ROUGE-BAT.transparentize(86%), tr("BON À TIRER", "PROOF"))))
  set text(font: ("Arial", "Helvetica", "Liberation Sans", "DejaVu Sans"), size: 9pt)
  for a in agents {
    page(paper: "a4", margin: 14mm, foreground: filigrane, {
      grid(columns: (1fr, auto), align: (left, right),
        text(15pt, weight: "bold", fill: ROUGE-BAT, tr("BON À TIRER", "PROOF")),
        text(9pt)[#entree("date", "")])
      v(1mm)
      text(11pt, weight: "bold")[#entree("titre", "")]
      linebreak()
      let largeur-mm = projet.format.largeur_mm
      let hauteur-mm = projet.format.hauteur_mm
      let fp-mm = projet.format.fond_perdu_mm
      let qui = a.at("libelle", default: a.id)
      tr([Carte de #qui · format #largeur-mm × #hauteur-mm mm · fond perdu #fp-mm mm (pointillés : ligne de coupe)],
        [Card of #qui · #largeur-mm × #hauteur-mm mm format · #fp-mm mm bleed (dotted: cut line)])
      v(6mm)
      grid(columns: 2, column-gutter: 8mm,
        avec-coupe(carte-recto(a), tr([Recto, taille réelle], [Front, actual size])),
        if avec-verso { avec-coupe(carte-verso(a), tr([Verso, taille réelle], [Back, actual size])) })
      v(6mm)
      // Agrandi jusqu'à 200 %, dans la place laissée par la page (largeur utile, environ 11 cm de haut).
      let echelle = calc.min(2.0, 182mm / cw, 110mm / ch)
      stack(spacing: 2mm, scale(echelle * 100%, reflow: true, carte-recto(a)),
        text(8pt, fill: luma(90), tr([Recto agrandi à #calc.round(echelle * 100) %, pour la relecture],
          [Front enlarged to #calc.round(echelle * 100)%, for proofreading])))
      v(1fr)
      block(width: 100%, stroke: 0.5pt + luma(120), inset: 4mm, radius: 2mm, {
        text(10pt, weight: "bold", tr("Validation", "Approval"))
        v(2mm)
        tr([#case Bon pour accord #h(12mm) #case Bon pour accord après corrections #h(12mm) #case Refusé],
          [#case Approved #h(12mm) #case Approved after corrections #h(12mm) #case Rejected])
        v(5mm)
        tr([Corrections : #box(width: 1fr, repeat[.])], [Corrections: #box(width: 1fr, repeat[.])])
        v(5mm)
        tr([Date : #box(width: 45mm, repeat[.]) #h(10mm) Nom et signature : #box(width: 1fr, repeat[.])],
          [Date: #box(width: 45mm, repeat[.]) #h(10mm) Name and signature: #box(width: 1fr, repeat[.])])
      })
    })
  }
}

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
          place(dx: ox + c * cw, dy: oy + r * ch, if face == "RECTO" { carte-recto(a) } else { carte-verso(a) })
        }
        traits
        let nom-face = if face == "RECTO" { tr("RECTO", "FRONT") } else { tr("VERSO", "BACK") }
        let format = [#projet.format.largeur_mm × #projet.format.hauteur_mm mm]
        place(bottom + center, dy: -3mm, text(font: "Arial", size: 6pt, fill: REPERAGE, tr(
          [Automat-Process · planche #(i + 1)/#lots.len() · #nom-face · #lot.len() cartes · #format + fond perdu #projet.format.fond_perdu_mm mm],
          [Automat-Process · sheet #(i + 1)/#lots.len() · #nom-face · #lot.len() cards · #format + #projet.format.fond_perdu_mm mm bleed],
        )))
      })
    }
  }
}

#if mode == "apercu" {
  let a = agents.at(int(entree("agent", "0")))
  page-carte(if entree("face", "recto") == "verso" { carte-verso(a) } else { carte-recto(a) })
} else if mode == "cartes" {
  for a in agents {
    page-carte(carte-recto(a))
    if avec-verso { page-carte(carte-verso(a)) }
  }
} else if mode == "planches" {
  planches(FEUILLES.at(entree("feuille", "A4")))
} else if mode == "mosaique" {
  for a in agents { page-carte(carte-recto(a)) }
} else if mode == "ecran" {
  // Carte numérique : format fini, sans fond perdu ni repères, liens cliquables.
  let ecran(contenu) = page(width: largeur, height: hauteur, margin: 0pt, place(dx: -fp, dy: -fp, contenu))
  for a in agents {
    ecran(carte-recto(a))
    if avec-verso and entree("verso", "oui") == "oui" { ecran(carte-verso(a)) }
  }
} else if mode == "bat" {
  bat()
} else if mode == "controle" {
  // Les textes seuls (ni visuel ni QR code) : seules comptent les mesures <controle>.
  for a in agents { page(width: cw, height: ch, margin: 0pt, textes-variables(a)) }
}
