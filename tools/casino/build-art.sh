#!/usr/bin/env bash
# Builds the Casino Night pictures in www/img/casino from the CC0 sources in tools/casino/art-src (see art.txt).
# Needs ffmpeg. Sources: Kenney Boardgame Pack (cards, chips, dice), jbp4444 "Felt Backgrounds" (felt).
set -e
cd "$(dirname "$0")"
SRC=art-src/kenney_boardgame-pack/PNG
OUT=../../www/img/casino
mkdir -p "$OUT"
w() { ffmpeg -loglevel error -y -i "$1" ${3:+-vf "$3"} -c:v libwebp -quality ${4:-88} -lossless 0 "$OUT/$2.webp"; }
for s in Spades:S Hearts:H Diamonds:D Clubs:C; do
  n=${s%%:*}; k=${s##*:}
  for r in A 2 3 4 5 6 7 8 9 10 J Q K; do rr=$r; [ "$r" = 10 ] && rr=T; w "$SRC/Cards/card$n$r.png" "card_$rr$k"; done
done
w "$SRC/Cards/cardBack_red2.png" card_back
# chips: 5 red, 25 green, 100 black, 500 blue, 1000 white and blue
w "$SRC/Chips/chipRedWhite_border.png" chip_5 "scale=96:96"
w "$SRC/Chips/chipGreenWhite_border.png" chip_25 "scale=96:96"
w "$SRC/Chips/chipBlackWhite_border.png" chip_100 "scale=96:96"
w "$SRC/Chips/chipBlueWhite_border.png" chip_500 "scale=96:96"
w "$SRC/Chips/chipWhiteBlue_border.png" chip_1000 "scale=96:96"
for i in 1 2 3 4 5 6; do w "$SRC/Dice/dieWhite_border$i.png" die_$i "scale=96:96"; done
# felt: the grey scan, tinted casino green (and a deep red for baccarat)
w art-src/felt/felt_grey.jpg felt "crop=1536:1536:256:256,scale=768:768,lutrgb=r='val*0.22':g='val*0.62':b='val*0.36'" 80
w art-src/felt/felt_grey.jpg felt_red "crop=1536:1536:256:256,scale=768:768,lutrgb=r='val*0.62':g='val*0.14':b='val*0.18'" 80
w art-src/felt/felt_grey.jpg felt_blue "crop=1536:1536:256:256,scale=768:768,lutrgb=r='val*0.12':g='val*0.28':b='val*0.62'" 80
echo "built $(ls "$OUT" | wc -l) files"
