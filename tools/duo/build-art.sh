#!/usr/bin/env bash
# Builds the Play Together images in www/img/duo/ from the CC0 kits listed in tools/duo/art.txt.
# The kits are unzipped into tools/duo/kenney-art/ (gitignored); Puzzle Pack 2 is shared with tools/hero/kenney/.
# Puzzle Pack 2 numbers its shapes one lower in orange than in the other colours (circle 22 v 23).
# Needs ffmpeg. Run from the repository root: bash tools/duo/build-art.sh [outdir]
set -e
K=tools/duo/kenney-art
PP=tools/hero/kenney/puzzle-pack-2/PNG
BG="$K/kenney_boardgame-pack/PNG"
OUT=${1:-www/img/duo}
mkdir -p "$OUT"
# webp at a given size (longest side); keeps transparency
w() { ffmpeg -loglevel error -y -i "$1" -vf "scale=$3:$3:force_original_aspect_ratio=decrease" -c:v libwebp -lossless 0 -quality 90 -compression_level 6 "$OUT/$2.webp"; }
# pixel art: scale by an exact factor with nearest neighbour so it stays crisp
px() { ffmpeg -loglevel error -y -i "$1" -vf "scale=iw*$3:ih*$3:flags=neighbor${4:+,$4}" -c:v libwebp -lossless 1 "$OUT/$2.webp"; }

# stones and discs
w "$PP/Balls/Black/ballBlack_10.png" stone_black 96
w "$PP/Balls/Grey/ballGrey_10.png" stone_white 96
w "$PP/Tiles red/tileRed_35.png" disc_red 96
w "$PP/Tiles yellow/tileYellow_35.png" disc_yellow 96
w "$PP/Tiles blue/tileBlue_35.png" disc_blue 96
# draughts: poker-chip style pieces
w "$BG/Chips/chipRedWhite_border.png" draught_red 96
w "$BG/Chips/chipWhiteBlue_border.png" draught_white 96
# mancala seeds: small glossy beads in seven colours
i=0; for c in Red Blue Yellow Green Pink Orange Grey; do lc=$(echo $c | tr A-Z a-z); n=23; [ $c = Orange ] && n=22; w "$PP/Tiles $lc/tile${c}_$n.png" seed_$i 40; i=$((i+1)); done
# dots and boxes: claimed box tiles
w "$PP/Tiles red/tileRed_25.png" box_red 96
w "$PP/Tiles blue/tileBlue_25.png" box_blue 96
# noughts and crosses: vector marks, copied as they are
cp "$K/kenney_ui-pack/Vector/Red/icon_cross.svg" "$OUT/mark_x.svg"
cp "$K/kenney_ui-pack/Vector/Blue/icon_outline_circle.svg" "$OUT/mark_o.svg"
# memory duel card backs
w "$BG/Cards/cardBack_blue2.png" card_back 160
# battleships: ships bow up and lying across, hit and miss markers
S=$K/sea-warfare
for pair in "Carrier/ShipCarrierHull carrier" "Battleship/ShipBattleshipHull battleship" "Cruiser/ShipCruiserHull cruiser" "Submarine/ShipSubMarineHull submarine" "PatrolBoat/ShipPatrolHull patrol"; do
  set -- $pair
  px "$S/$1.png" "ship_${2}_v" 2
  px "$S/$1.png" "ship_${2}_h" 2 "transpose=2"
done
w "$K/kenney_pirate-pack/PNG/Retina/Effects/explosion3.png" ship_hit 72
w "$PP/Balls/Grey/ballGrey_10.png" ship_miss 48
# word duel balloons, tinted to the seven balloon colours
i=0; for hex in e8604c f2b631 3fae6a 3b7ddd 9a7cf0 f08a4b e85d9c; do
  r=$((16#${hex:0:2})); g=$((16#${hex:2:2})); b=$((16#${hex:4:2}))
  ffmpeg -loglevel error -y -i tools/duo/kenney-art/balloon-rising/0.png -vf "crop=94:136:0:0,lutrgb=r='val*$r/245':g='val*$g/240':b='val*$b/232',scale=64:-1" -c:v libwebp -quality 90 "$OUT/balloon_$i.webp"
  i=$((i+1))
done
# air hockey and paddle ball
w "$PP/Balls/Black/ballBlack_10.png" puck 96
w "$PP/Tiles red/tileRed_35.png" mallet_red 128
w "$PP/Tiles blue/tileBlue_35.png" mallet_blue 128
w "$PP/Paddles/paddle_01.png" paddle_red 260
w "$PP/Paddles/paddle_05.png" paddle_blue 260
w "$PP/Balls/Grey/ballGrey_10.png" paddle_ball 64
# light cycles
for c in red blue; do w "$K/kenney_racing-pack/PNG/Motorcycles/motorcycle_$c.png" cycle_$c 100; done
# penalty shootout ball
w "$K/soccer-ball/SoccerBall.png" penalty_ball 96
echo "built into $OUT"
