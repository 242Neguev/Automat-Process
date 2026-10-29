// Source de l'icône de l'application, aux couleurs de l'éditeur Eau sèche
// (Encre #22252A, Eau #1E6E72 en accent unique, Sec #EFEDE8). Régénérer les icônes :
//   typst compile src-tauri/icons/source/icone.typ icone.png --ppi 72 && npx tauri icon icone.png
#set page(width: 1024pt, height: 1024pt, margin: 0pt, fill: none)
#let encre = rgb("#22252A")
#let eau = rgb("#1E6E72")
#let sec = rgb("#EFEDE8")
#place(center + horizon, rect(width: 904pt, height: 904pt, radius: 210pt, fill: encre))
#place(center + horizon, dx: 46pt, dy: -58pt, rect(width: 560pt, height: 362pt, radius: 44pt, fill: eau))
#place(center + horizon, dy: 22pt, rect(width: 600pt, height: 388pt, radius: 46pt, fill: sec))
#place(center + horizon, dy: 22pt, text(font: "Arial", weight: "bold", size: 236pt, fill: encre, tracking: -6pt)[AP])
