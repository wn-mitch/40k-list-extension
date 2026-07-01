/**
 * A known-good pasted army list (NewRecruit "simple" export of a Chaos Knights
 * roster) used to prove the 40kdc-data integration. Verified to resolve to
 * faction `chaos-knights` with all units mapped to entity IDs, and to import
 * cleanly: the reported total equals the sum of the cost lines, no warnings.
 */
export const SAMPLE_LIST_TEXT = `Chaos - Chaos Knights - Dog Kill God? - [445 pts]

# ++ Army Roster ++ [445 pts]
## Configuration
Battle Size: Strike Force (2000 Point limit)
Detachment: Houndpack Lance

## Battleline [445 pts]
War Dog Karnivore [165 pts]: Houndpack Lance Character, Preyslayer's Mantle [15 pts], Reaper chaintalon, Slaughterclaw, Havoc multi-launcher
War Dog Karnivore [150 pts]: Reaper chaintalon, Slaughterclaw, Havoc multi-launcher
War Dog Executioner [130 pts]: Houndpack Lance Character, Warlord, Armoured feet, 2x War Dog autocannon, Diabolus heavy stubber
`;

/**
 * The same roster with an inflated as-pasted total (2000 vs the 445 the cost
 * lines sum to). Exercises the importer's `points-mismatch` diagnostic: the
 * reported and computed totals are kept distinct, never reconciled.
 */
export const MISMATCHED_TOTAL_LIST_TEXT = SAMPLE_LIST_TEXT.replaceAll("[445 pts]", "[2000 pts]");
