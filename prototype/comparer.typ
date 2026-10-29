// Compare le modèle PDF d'origine et les deux méthodes de retrait des balises.
#set page(width: 91mm * 3 + 16mm, height: 61mm + 14mm, margin: 4mm, fill: luma(85%))
#set text(font: "Arial", size: 8pt)
#grid(columns: 3, column-gutter: 4mm, row-gutter: 2.5mm,
  image("build/modele.pdf"), image("build/modele-fond-pdfium.pdf"), image("build/modele-fond-cible.pdf"),
  [*1.* Modèle PDF du graphiste (CMJN)], [*2.* PDFium réécrit la page : couleurs perdues], [*3.* Retrait ciblé : CMJN intact],
)
