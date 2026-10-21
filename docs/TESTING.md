# Testing

Use Node.js 24 and run `npm test` from the repository root. No dependency installation is needed. The beta baseline contains 1,642 tests in 63 files.

The suite covers engine rules, resources, conditions, custom abilities/reactions, AI, fog-of-war views, state migration, controller integration and UI behavior using test doubles. It is not a complete graphical browser or live SillyTavern/model/TTS test.

The new repository packaging is checked against the existing beta engine. Branding is confined to metadata and documentation; the numerical combat logic and saved-data key remain unchanged. Tests are rerun in this clean publication folder, including all referenced example fixtures.

Before a stable release, follow the [manual beta test plan](BETA-TESTPLAN.de.md) in SillyTavern with a connected model. The standalone preview cannot validate a live model connection. DM proposals and terrain textures remain experimental.

Regenerate committed UI/version modules with `npm run build` after changing UI translation sources or the manifest version. Start the local demo with `node preview-server.mjs`.
