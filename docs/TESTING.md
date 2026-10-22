# Testing

Use Node.js 24 and run `npm test` from the repository root. No dependency installation is needed. The beta baseline contains 1,801 tests in 68 files.

Beta 2 hotfix 1 adds 16 German/English UI tests for participant-profile import from both entry points, populated previews, explicit recipients for partial profiles, retained figures/maps/rules, Undo, full-save and roster-array imports, hidden-enemy deployment guidance and delayed/invalid/cancelled file reads. The tests use the actual UI and controller with a limited DOM harness; they are not a graphical browser test.

The suite covers engine rules, resources, conditions, custom abilities/reactions, AI, fog-of-war views, state migration, controller integration and UI behavior using test doubles. It is not a complete graphical browser or live SillyTavern/model/TTS test.

Beta 2 adds dungeon and forest generator checks: distinct compact rooms, room-scale differences, distributed cover, density variants, a broad forest trail, and connected free cells on small/narrow/large boards. Seed repeatability, unchanged combat dice and actors, legacy-map loading, map transfer, conditional forest controls and Undo are covered. Numerical combat rules and the saved-data key remain unchanged.

Before a stable release, follow the [manual beta test plan](BETA-TESTPLAN.de.md) in SillyTavern with a connected model. The standalone preview cannot validate a live model connection. DM proposals and terrain textures remain experimental.

Regenerate committed UI/version modules with `npm run build` after changing UI translation sources or the manifest version. Start the local demo with `node preview-server.mjs`.

Beta 2 hotfix 2 adds 12 German/English UI tests for explicitly revealing hidden participants for management, editing those figures, resetting that visibility between chats, explicit import success, and preserving board fog, model context, rules, RNG and history.

Beta 2 hotfix 3 extends German/English UI coverage for global and participant reaction switches, zero budgets, spent reactions, missing choices, reservations, redraws and independent shields. Two additional diagnostic tests distinguish a zero allowance from a spent budget, including an inherited global allowance of zero. These are limited DOM and engine checks, without a graphical browser or live SillyTavern run.

Beta 2 hotfix 4 adds 15 tests for selecting the latest result across turn changes and history settings, immediate versus later periodic effects, empty/private histories, Undo/reset/import boundaries, the live narration request and outgoing-anchor diagnostics. Combat DM 1.4.0 is checked as a JSON artifact; no model-generated answer was evaluated automatically.

Beta 2 hotfix 5 adds four German/English UI checks for accessible compact stance controls, stance locking after an action, expandable movement/batch details, fold preservation, changing default expansion, stock capacities, linked-stock deduplication and live quantities after actual resource use. Legacy compact visibility settings no longer hide controls. AI scoring is unchanged.

Beta 3 adds 37 engine/editor checks for indirect shared-stock costs, failure/insufficient-stock atomicity, other-only targeting and area recipients, all 20 supported prerequisites, profile transfer, gated own checks and Advanced AI selection, reaction timing and skipped-reaction costs, bilingual labels, disabled defense drafts, and retained resource editor identity/focus/scroll. Older UI tests now inspect the updated resource-entry subtree rather than expecting the dialog to be destroyed. Graphical/browser and live SillyTavern/model testing remain outstanding.

Beta 3 hotfix 1 adjusts only reaction heading/badge wrapping. The same 1,754 tests in 66 files pass; no new rule tests were added for this CSS-only change. The built preview retains the bilingual import/reaction/comfort smoke checks; graphical browser and live SillyTavern layout verification remain manual.

Beta 3 hotfix 2 adds 22 engine/controller/UI checks: complete Advanced AI support/miss turns, shared UI/narrator result IDs, persistence after movement/End turn and refresh, empty/movement-only/skipped turns, original actor tokens, private events and lifecycle boundaries, bilingual compact Other actions/Explanations folds, and preserved controls/costs. Result narration uses the same selected primary event as the card; the card can additionally display later periodic-status facts. 1,776 tests in 67 files. Model prose quality and graphical live layout still need manual checks.

Beta 3 hotfix 3 adds 25 Advanced AI checks for engaged/previously informed recipients, sender and recipient round limits, small versus substantial contact movement, cooldown serialization/reset/Undo/debugging, hidden enemies, meaningful attack/rest movement, cover and sight breaks, approach/disengagement, and side/style/stock-aware stabilization priorities. Earlier alarm tests now require uninformed reinforcements and no longer permit multiple contact updates within a turn. A private saved fight was imported and five subsequent AI turns were compared against the preceding implementation using the same seeded continuation; this is not a replay of the original random fight. 1,801 tests in 68 files. No graphical browser or live model test.
