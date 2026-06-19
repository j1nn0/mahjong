# Add responsibility payment v1 for daisangen and daisuushii

Responsibility payment was deliberately left out of the first east-only rules expansion because it adds a separate settlement exception beyond ordinary ron and tsumo payments. The next rules expansion adopts it in a narrow v1 so yakuman payments become closer to common riichi-mahjong expectations without reopening the broader match settlement model.

v1 covers only daisangen and daisuushii. These cases have a clear responsibility trigger: a player already has enough open honor triplets or quads, and another player discards the final honor tile that lets them complete the visible yakuman structure by pon or daiminkan. Suukantsu and rinshan responsibility after daiminkan stay out of scope because they require more kan-history and timing policy than this first responsibility-payment slice needs.

The implementation should record the discarder on open melds and mark the meld that creates responsibility. At win settlement, responsibility applies only when the winning yakuman matches that recorded responsibility kind. Tsumo is paid fully by the responsible player; ron is split between the discarder and responsible player, with the responsible player paying all if they are also the discarder.
