const mapFiles = (prefix, first, folder, files) => Object.fromEntries(
  files.map((file, index) => [
    `gf_${prefix}_${String(first + index).padStart(3, '0')}`,
    `/godfield-current/images/items/${folder}/${file}.webp`,
  ]),
);

const weapons = [
  'bronze-club', 'silver-club', 'gold-club', 'whip', 'saver-rod', 'punch', 'saw-boom-boom', 'hatchet',
  'spiked-belt', 'chain-sickle', 'plate-of-strike', 'bouncing-sword', 'hard-hammer', 'elbow-sack',
  'glaive-classic', 'ghost-sword', 'final-tusk', 'hell-scissors', 'power-halberd', 'gale-sword',
  'wonder-sword', 'bogus-spear', 'sword-shield', 'reflection-sword', 'moonlight-axe', 'gravity-mace',
  'angel-knife', 'hexagon-doom', 'direct-smash-axe', 'real-ghost-sword', 'spiritual-staff',
  'spear-in-fine-view', 'severe-gale-sword', 'legendary-scabbard', 'angel-sword', 'violent-flail',
  'evil-broadsword', 'dragon-claws', 'angel-axe', 'god-sword', 'magical-stick', 'torch', 'ouch-knife',
  'fire-whip', 'flaming-roll', 'blaze-blade', 'fire-dragon-s-horn', 'icicle', 'fog-gun', 'frozen-hammer',
  'water-dragon-s-horn', 'wooden-sword', 'thorn-whip', 'bur-nut', 'dream-mallet', 'wind-talons',
  'sword-ware', 'diamond-sword', 'flash-dagger', 'star-staff', 'justice-lance', 'holy-sword',
  'dangerous-pestle', 'pri-pri-pricker', 'cobra', 'goodbye-sword', 'killer-fork', 'death-s-scythe',
  'blowgun', 'crossbow', 'boomerang', 'battle-ball', 'warrior-s-bow', 'jet-yo-yo', 'unknown-feather',
  'psychic-card', 'sky-harpoon', 'horror-wheel', 'top-of-combat', 'angel-bow', 'wand-of-ignition',
  'fire-crossbow', 'wand-of-mystic-water', 'leaf-shuriken', 'mature-rubber-bow', 'paleolithic-javelin',
  'neolithic-tomahawk', 'piece-of-brightness', 'abyss-dart', 'spark-bag', 'flame-cup', 'fire-shower',
  'flare-axe', 'fog-fan', 'chill-cup', 'oversize-snowball', 'rain-deity-s-saber', 'vine-shoot',
  'plant-cup', 'jinn-s-rocking-horse', 'rock-cup', 'cliff-hammer', 'petit-saturn', 'lightning-kids',
  'light-orb', 'ascension-bow', 'shadow-hand',
];

const armors = [
  'leather-cap', 'sky-boots', 'leather-clothes', 'iron-gauntlet', 'ogre-s-shoes', 'sky-gauntlet',
  'iron-shield', 'iron-armor', 'ogre-s-gauntlet', 'sky-helm', 'steel-gauntlet', 'spiritual-socks',
  'steel-helm', 'ogre-s-helm', 'sky-shield', 'steel-shield', 'beautiful-glasswork', 'moonlight-helm',
  'steel-armor', 'ogre-s-armor', 'spiritual-hood', 'sky-armor', 'angel-gauntlet', 'energy-helm',
  'moonlight-shield', 'energy-armor', 'angel-cap', 'core-barrier', 'spiritual-sash', 'moonlight-armor',
  'core-protector', 'angel-shield', 'angel-armor', 'god-shield', 'sparkle-glove', 'flame-boots',
  'flame-helm', 'flame-shield', 'flame-mail', 'burning-shield', 'burning-jacket', 'fever-mask',
  'heat-haze-armor', 'aqua-shoes', 'aqua-glove', 'ice-boots', 'ice-helm', 'ice-shield', 'ice-armor',
  'snow-mitten', 'snow-mask', 'laurel-wreath', 'wood-shield', 'sacred-tree-gauntlet', 'grove-shield',
  'resin-knit-robe', 'forest-shield', 'amber-breastplate', 'dreaming-hat', 'slate', 'bedrock',
  'crystal-board', 'terra-shoes', 'terra-gauntlet', 'terra-helm', 'terra-armor', 'shining-high-heels',
  'glittering-dress',
];

const rings = [
  'mars-ring', 'mercury-ring', 'jupiter-ring', 'saturn-ring',
  'uranus-ring', 'pluto-ring', 'neptune-ring', 'venus-ring',
];

const defenseItems = ['rainbow-curtain', 'super-mirror'];

const miracles = [
  'fireball', 'smoke', 'flame', 'magma', 'ice', 'avalanche', 'waterfall', 'ice-age', 'big-tree', 'rock',
  'mudflow', 'flash', 'thunder', 'meteor', 'absorption', 'darkness', 'wind', 'heaven-wind', 'fog', 'dream',
  'dark-cloud', 'tone', 'song', 'aura', 'mirage', 'turbulence', 'wall', 'spring', 'treasure', 'release',
];

const sundries = [
  'smile-dew', 'heart-dew', 'romance-water', 'galaxy-geyser', 'smile-flower', 'heart-flower',
  'romance-fragrance', 'heaven-herb', 'smile-shell', 'heart-shell', 'guardian-pot', 'thump-thump-tear',
  'strength-powder', 'spiritual-doll', 'nocturnal-broom', 'goddess-s-soap', 'string-of-fate',
  'sun-amulet', 'dangerous-mortar',
];

const trades = ['exchange', 'sell', 'buy'];

export const godfieldCurrentImages = {
  ...mapFiles('weapon', 1, 'weapons', weapons),
  ...mapFiles('armor', 108, 'armor', armors),
  ...mapFiles('ring', 176, 'armor', rings),
  ...mapFiles('defense_item', 184, 'armor', defenseItems),
  ...mapFiles('miracle', 186, 'miracles', miracles),
  ...mapFiles('item', 216, 'sundries', sundries),
  ...mapFiles('trade', 235, 'trade', trades),
};
