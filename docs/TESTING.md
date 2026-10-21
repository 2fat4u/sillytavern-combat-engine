# Testing

Use Node.js 24 and run `npm test` from the repository root. No dependency installation is needed. The beta baseline contains 1,668 tests in 65 files.

The suite covers engine rules, resources, conditions, custom abilities/reactions, AI, fog-of-war views, state migration, controller integration and UI behavior using test doubles. It is not a complete graphical browser or live SillyTavern/model/TTS test.

Beta 2 adds dungeon and forest generator checks: distinct compact rooms, room-scale differences, distributed cover, density variants, a broad forest trail, and connected free cells on small/narrow/large boards. Seed repeatability, unchanged combat dice and actors, legacy-map loading, map transfer, conditional forest controls and Undo are covered. Numerical combat rules and the saved-data key remain unchanged.

Before a stable release, follow the [manual beta test plan](BETA-TESTPLAN.de.md) in SillyTavern with a connected model. The standalone preview cannot validate a live model connection. DM proposals and terrain textures remain experimental.

Regenerate committed UI/version modules with `npm run build` after changing UI translation sources or the manifest version. Start the local demo with `node preview-server.mjs`.
