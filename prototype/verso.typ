// Simule un verso exporté en PDF CMJN par le graphiste (couleurs en quadrichromie).
#set page(width: 91mm, height: 61mm, margin: 0pt, fill: cmyk(100%, 75%, 25%, 35%))
#set text(font: "Arial", fill: cmyk(0%, 0%, 0%, 0%))
#place(center + horizon, dy: -6mm, stack(dir: ltr, spacing: 3mm,
  box(width: 14mm, height: 14mm, {
    circle(radius: 6mm, fill: white)
    place(top + left, dx: 6.5mm, dy: 1.5mm, circle(radius: 3mm, fill: cmyk(0%, 60%, 70%, 0%)))
  }),
  align(horizon, text(weight: "bold", size: 15pt, tracking: 0.08em)[EXEMPLE SA]),
))
#place(center + horizon, dy: 9mm, text(size: 7pt, tracking: 0.12em, fill: cmyk(0%, 60%, 70%, 0%))[L'EXCELLENCE AU SERVICE DE NOS CLIENTS])
