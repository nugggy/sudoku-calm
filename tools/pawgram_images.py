"""Downloads Fluent Emoji pictures (MIT licence) and turns them into Pawgram picture grids.

Writes tools/pawgram-candidates.json: for each picture and size, the filled cells and the
colour of every cell, which the level builder (gen-pawgram.mjs) then checks for logic solvability.
Usage: python tools/pawgram_images.py
"""
import io, json, os, sys, urllib.parse, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.pawgram-cache')
os.makedirs(CACHE, exist_ok=True)

NAMES = """Cat face|Cat|Black cat|Dog face|Dog|Poodle|Mouse face|Hamster|Rabbit face|Rabbit|Fox|Bear|Panda|Koala|Tiger face|Lion|Cow face|Pig face|Pig|Frog|Monkey face|Chicken|Penguin|Bird|Baby chick|Hatching chick|Duck|Owl|Eagle|Flamingo|Peacock|Parrot|Swan|Dove|Turkey|Rooster|Snail|Butterfly|Lady beetle|Honeybee|Bug|Ant|Spider|Spider web|Turtle|Snake|Lizard|Dragon|Sauropod|Whale|Spouting whale|Dolphin|Fish|Tropical fish|Blowfish|Shark|Octopus|Crab|Lobster|Shrimp|Squid|Seal|Elephant|Mammoth|Giraffe|Zebra|Horse|Horse face|Unicorn|Camel|Two-hump camel|Hippopotamus|Rhinoceros|Gorilla|Orangutan|Sloth|Otter|Skunk|Kangaroo|Hedgehog|Bat|Deer|Ox|Water buffalo|Ram|Ewe|Goat|Llama|Badger|Beaver|Raccoon|Mouse|Rat|Chipmunk|Paw prints|Feather|Bone|Cactus|Christmas tree|Evergreen tree|Deciduous tree|Palm tree|Seedling|Herb|Four leaf clover|Maple leaf|Fallen leaf|Mushroom|Tulip|Rose|Sunflower|Hibiscus|Cherry blossom|Blossom|Lotus|Bouquet|Sun|Crescent moon|Full moon|Star|Glowing star|Cloud|Snowflake|Snowman|Snowman without snow|Rainbow|Umbrella|High voltage|Fire|Droplet|Water wave|Volcano|Mountain|Globe showing americas|Comet|Ringed planet|Rocket|Flying saucer|Red apple|Green apple|Pear|Tangerine|Lemon|Banana|Watermelon|Grapes|Strawberry|Cherries|Peach|Pineapple|Mango|Coconut|Kiwi fruit|Tomato|Eggplant|Avocado|Carrot|Ear of corn|Hot pepper|Broccoli|Garlic|Onion|Potato|Peanuts|Chestnut|Bread|Croissant|Baguette bread|Pretzel|Pancakes|Cheese wedge|Egg|Cooking|Bacon|Hamburger|French fries|Pizza|Hot dog|Sandwich|Taco|Burrito|Popcorn|Doughnut|Cookie|Birthday cake|Shortcake|Cupcake|Pie|Chocolate bar|Candy|Lollipop|Custard|Honey pot|Ice cream|Soft ice cream|Shaved ice|Teacup without handle|Hot beverage|Baby bottle|Glass of milk|Teapot|Bubble tea|Cocktail glass|Tropical drink|Fork and knife|Spoon|Chopsticks|Sushi|Fried shrimp|Rice ball|Dumpling|Fortune cookie|Balloon|Party popper|Teddy bear|Kite|Yo-yo|Chess pawn|Game die|Joystick|Video game|Soccer ball|Basketball|American football|Baseball|Tennis|Bowling|Ping pong|Trophy|Crown|Gem stone|Ring|Lipstick|Guitar|Violin|Trumpet|Saxophone|Drum|Musical note|Headphone|Microphone|Light bulb|Flashlight|Candle|Magnifying glass tilted left|Key|Old key|Bell|Hourglass done|Alarm clock|Watch|Mobile phone|Laptop|Camera|Television|Radio|Telephone|Envelope|Pencil|Paintbrush|Crayon|Scissors|Paperclip|Pushpin|Books|Closed book|Scroll|Hammer|Wrench|Axe|Magnet|Anchor|Compass|Umbrella with rain drops|Shopping cart|Bicycle|Automobile|Bus|Fire engine|Taxi|Tractor|Airplane|Helicopter|Sailboat|Ship|Locomotive|House|House with garden|Castle|Tent|Ferris wheel|Carousel horse|T-shirt|Dress|Top hat|Billed cap|Glasses|Sunglasses|Socks|Gloves|Scarf|Running shoe|High-heeled shoe|Handbag|Backpack|Ghost|Jack-o-lantern|Alien|Robot|Skull|Mirror|Window|Bed|Chair|Toilet|Bathtub|Broom|Basket|Soap|Sponge|Bucket|Potted plant|Ice|Moai|Statue of liberty""".split('|')

BASE = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/'


def fetch(name):
    fn = name.lower().replace(' ', '_') + '_3d.png'
    path = os.path.join(CACHE, fn)
    if not os.path.exists(path):
        url = BASE + urllib.parse.quote(name) + '/3D/' + urllib.parse.quote(fn)
        req = urllib.request.Request(url, headers={'User-Agent': 'SudokuCalm-Pawgram/1.0'})
        data = urllib.request.urlopen(req, timeout=60).read()
        open(path, 'wb').write(data)
    return Image.open(path).convert('RGBA')


def square_crop(img):
    bbox = img.split()[3].point(lambda a: 255 if a > 40 else 0).getbbox()
    img = img.crop(bbox)
    w, h = img.size
    s = max(w, h)
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.paste(img, ((s - w) // 2, (s - h) // 2))
    return canvas


def otsu(values):
    """Threshold that best splits values into two groups (dark and light)."""
    if not values:
        return 0.5
    best_t, best_var = 0.5, -1
    for t in [i / 50 for i in range(5, 46)]:
        lo = [v for v in values if v < t]
        hi = [v for v in values if v >= t]
        if not lo or not hi:
            continue
        w0, w1 = len(lo) / len(values), len(hi) / len(values)
        m0, m1 = sum(lo) / len(lo), sum(hi) / len(hi)
        var = w0 * w1 * (m0 - m1) ** 2
        if var > best_var:
            best_t, best_var = t, var
    return best_t


def grids_for(img, n):
    """Two versions of the picture: its outline shape, and its darker areas (more detail)."""
    small = img.resize((n, n), Image.LANCZOS)
    px = small.load()
    cells = []
    for y in range(n):
        for x in range(n):
            r, g, b, a = px[x, y]
            cells.append((a > 110, (0.299 * r + 0.587 * g + 0.114 * b) / 255, '%02x%02x%02x' % (r, g, b) if a > 60 else ''))
    colours = [c[2] for c in cells]
    t = otsu([c[1] for c in cells if c[0]])
    shape = ''.join('1' if c[0] else '0' for c in cells)
    dark = ''.join('1' if c[0] and c[1] < t else '0' for c in cells)
    return [('shape', shape, colours), ('dark', dark, colours)]


def main():
    out = []
    for i, name in enumerate(NAMES):
        try:
            img = square_crop(fetch(name))
        except Exception as e:  # skip anything that fails to download
            print('skip', name, e, file=sys.stderr)
            continue
        for n in (5, 10, 15):
            for kind, cells, colours in grids_for(img, n):
                ratio = cells.count('1') / (n * n)
                if 0.3 <= ratio <= 0.8:
                    out.append({'name': name, 'n': n, 'kind': kind, 'cells': cells, 'colours': colours})
        if (i + 1) % 50 == 0:
            print(i + 1, 'pictures processed', file=sys.stderr)
    json.dump(out, open(os.path.join(HERE, 'pawgram-candidates.json'), 'w'))
    print(len(out), 'candidate grids')


if __name__ == '__main__':
    main()
