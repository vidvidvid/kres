Assets for the kres 2026 scene (all PNGs are 1080x1920 portrait).

Layer stack (bottom to top), as drawn by viewer.js:
  ozadje.png        background (the room + glowing oval)
  [pixelated fire]  generated, sits on the oval
  zivalice/*.svg    the animal sprites, one per networked cursor
  normal.png        ornament frame, drawn normally, in front of the animals
  difference.png    side panels, drawn with the 'difference' blend mode
  paper.png         "plus darker" paper grain, drawn with the 'multiply' blend mode

zivalice/animal1..5.svg are assigned to cursors by a hash of their id, so each
machine keeps the same animal. Swap any file to restyle; keep the same names.

Source originals: ~/Downloads/kres2026 (paper.png came from "plus darker.png").
