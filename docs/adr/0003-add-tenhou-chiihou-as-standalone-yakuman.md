---
status: 完了
---

# Add tenhou and chiihou as standalone yakuman

Tenhou (dealer wins at deal time) and chiihou (non-dealer wins on first draw with no calls) are added as yakuman. Both are treated as standalone: even if the hand also qualifies for another yakuman (e.g. kokushi or suuankou), only one yakuman is counted. Stacking with double-yakuman hands is not allowed.

Chiihou is invalidated when `firstTurnInterrupted` is true, which already covers abortive-draw conditions. Calls (chi, pon, kan) from any player now also set `firstTurnInterrupted` to true, so a non-dealer can never claim chiihou after anyone has melded.

Tenhou is checked immediately after the deal, before the playing phase begins, by calling `finishRound()` directly if the dealer's hand is already complete. This avoids a dedicated phase and reuses the existing round-end flow.

The no-combination rule was chosen over allowing stacking because: double-yakuman combination with tenhou/chiihou is rare to the point of being hypothetical in practice; handling it correctly would require defining a precedence order among yakuman types; and the simpler rule matches the most common tournament conventions used in Japan.
