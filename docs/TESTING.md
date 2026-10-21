# Testing

Use Node.js 24 and run `npm test` from the repository root. No dependency installation is needed. The beta baseline contains 1,698 tests in 65 files.

Beta 2 hotfix 1 adds 16 German/English UI tests for participant-profile import from both entry points, populated previews, explicit recipients for partial profiles, retained figures/maps/rules, Undo, full-save and roster-array imports, hidden-enemy deployment guidance and delayed/invalid/cancelled file reads. The tests use the actual UI and controller with a limited DOM harness; they are not a graphical browser test.

The suite covers engine rules, resources, conditions, custom abilities/reactions, AI, fog-of-war views, state migration, controller integration and UI behavior using test doubles. It is not a complete graphical browser or live SillyTavern/model/TTS test.

Beta 2 adds dungeon and forest generator checks: distinct compact rooms, room-scale differences, distributed cover, density variants, a broad forest trail, and connected free cells on small/narrow/large boards. Seed repeatability, unchanged combat dice and actors, legacy-map loading, map transfer, conditional forest controls and Undo are covered. Numerical combat rules and the saved-data key remain unchanged.

Before a stable release, follow the [manual beta test plan](BETA-TESTPLAN.de.md) in SillyTavern with a connected model. The standalone preview cannot validate a live model connection. DM proposals and terrain textures remain experimental.

Regenerate committed UI/version modules with `npm run build` after changing UI translation sources or the manifest version. Start the local demo with `node preview-server.mjs`.

Beta 2 hotfix 2 adds 12 German/English UI tests for explicitly revealing hidden participants for management, editing those figures, resetting that visibility between chats, explicit import success, and preserving board fog, model context, rules, RNG and history.

Beta 2 hotfix 3 extends German/English UI coverage for global and participant reaction switches, zero budgets, spent reactions, missing choices, reservations, redraws and independent shields. Two additional diagnostic tests distinguish a zero allowance from a spent budget, including an inherited global allowance of zero. These are limited DOM and engine checks, without a graphical browser or live SillyTavern run.
