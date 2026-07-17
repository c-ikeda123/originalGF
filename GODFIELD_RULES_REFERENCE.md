# GodField rules reference

This project uses the current GodField rules below as its implementation baseline. Do not add themed mechanics merely because a name sounds like a location or feature in the game.

## Terminology

- `隠れ神殿` is the password-protected match/lobby mode. It is not a shop or a phase entered by using `両替`.
- Cards are `神器`; reusable magic learned after first use is `奇跡`.

## Core state

- Initial values: HP 40, MP 10, money 20, hand 9.
- The hand limit is 18.
- Using artifacts grants the same number of replacement artifacts, subject to the hand limit.
- A player without an attack-capable weapon may pray, gain one artifact, and end the turn.
- The normal artifact pool is represented as 500 weighted entries. A 0.2% acquisition rate is one copy, 0.4% is two copies, and so on.

## Base master data

- Single weapons: https://w.atwiki.jp/piong/pages/15.html
- Armor, rings, and defensive goods: https://w.atwiki.jp/piong/pages/17.html
- All-target weapons: https://w.atwiki.jp/piong/pages/18.html
- Goods and trade artifacts: https://w.atwiki.jp/piong/pages/19.html
- Miracles: https://w.atwiki.jp/piong/pages/20.html
- Incarnations in the editor correspond to the ten guardian gods: https://w.atwiki.jp/piong/pages/27.html
- Guardian gods have `copies: 0`: they are editable base entities but are summoned rather than dealt as artifacts.

## Trade artifacts

- `両替`: redistribute the current total of HP + MP + money at a 1:1 rate. It does not open a shrine and it does not sell gods.
- `売る`: select `売る` plus one artifact and force the target to buy it at its listed price. Payment is taken from money, then MP, then HP. The seller receives the full listed amount as money.
- `買う`: reveal one artifact selected at random from the target's hand. The user chooses whether to buy it. A purchase requires enough money; an unlearned miracle costs 0.

## Miracles

- The first use learns the miracle; it no longer remains as a normal hand artifact.
- Up to six miracles can be learned. Learning a seventh forgets the oldest.
- A learned miracle can be used repeatedly by paying its MP cost.
- Using a miracle grants one artifact, subject to the hand limit.

## Combat details currently represented

- Damage is attack minus valid defense.
- Any number of valid defense artifacts may be used, except while affected by Flash, which limits defense to one artifact.
- Fire is blocked by water/light; water by fire/light; wood by earth/light; earth by wood/light.
- Light attacks cannot be blocked. Dark attacks can be blocked by any attribute, but any unblocked dark damage causes ascension.
- Combining different attributes produces no attribute, except that light combined with one elemental attribute adopts that elemental attribute.

## Sources checked

- Current rules overview and combat details: https://w.atwiki.jp/piong/pages/16.html
- Trade artifact effects and prices: https://w.atwiki.jp/piong/pages/19.html
- Miracle behavior and learned-miracle limit: https://w.atwiki.jp/piong/pages/20.html
- Calamity effects: https://w.atwiki.jp/piong/pages/23.html
- Trade flow cross-check: https://godfield-beginner.game-info.wiki/

GodField contains many more artifacts and special-case interactions than this prototype currently models. New behavior should be added from a checked rule/card reference and covered by a server-side test.
