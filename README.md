# Tavern Tactics — Combat Engine for SillyTavern

**A tactical VTT and combat extension for SillyTavern with battlemaps, dice rolls, automated combat rules and AI opponents.**

**Current version: 2.0.0-beta.3-hotfix.3.** The combat engine handles rolls and rules; your language model can narrate the results. Play manually, use Basic or Advanced AI opponents, or combine both.

[Deutsche Anleitung](docs/README.de.md) · [Beta test](docs/BETA-TESTPLAN.de.md) · [Testing](docs/TESTING.md) · [Changelog](CHANGELOG.md)

## What it does

- Grid battlemaps with terrain, cover, heights, ladders, pits and random map layouts.
- Initiative, movement, melee/ranged weapons, damage types, healing, resources and configurable action budgets.
- Conditions, condition immunities, damage resistances/immunities, shields and reactions.
- Custom abilities and DC checks with optional damage, healing and one condition effect.
- Basic AI or Advanced AI with weighted targets, observed combat knowledge, optional search parties, alerts, territories and retreat.
- Vision range and optional hiding of unseen enemies from the board, initiative and player overview.
- Revival, raising servants, temporary allegiance changes, rescue and carrying allies.
- Combat, map, character-profile and rule import/export, per-chat saving, a combat log and Undo.
- German/English interface, optional compact controls, custom sounds and experimental terrain textures.

It supplies authoritative combat context to SillyTavern and can request narration of resolved actions. Normal play and numerical combat resolution do not require an LLM. Optional model-generated DM action proposals remain experimental; a model is not allowed to invent authoritative rolls or HP changes.

## Install in SillyTavern

1. Open **Extensions → Install extension**.
2. Paste this repository URL:

   `https://github.com/2fat4u/sillytavern-combat-engine`

3. Install, then reload SillyTavern in your browser.
4. Open a chat and use the **⚔ Combat / ⚔ Kampf** button or `/kampf`.

Git must be installed on the machine running SillyTavern. See the [official extension installation instructions](https://docs.sillytavern.app/extensions/#third-party-extensions).

`manifest.json`, `index.js` and `style.css` are at the repository root, as required for installation from a Git URL. No npm installation or build step is needed to use this extension.

### Moving from the earlier local ZIP

The earlier ZIP used the folder name `sillytavern-combat`; installing this repository normally creates `sillytavern-combat-engine`. Keep only one copy enabled. Export your current combat, disable the old copy, then install/reload the Git version. The internal chat-data key remains `deterministic_combat_v1`; the project rename does not reset chat combat or saved character templates. Existing numerical values and actor settings remain intact.

Use SillyTavern's extension manager to check for updates. Do not install both copies side by side as active extensions.

## Start with a small encounter

Download [08-Beta-Manuell-Chat.json](examples/beta200beta1/08-Beta-Manuell-Chat.json) using GitHub's **Raw / Download raw file** option, then import it as a complete combat in a test chat.

The scene has six actors on a 14×10 map:

| Side | Actors | Control |
| --- | --- | --- |
| Players/allies | Lyra, Ivo, Nadir | Manual |
| Enemies | Basalt, Asche, Nyra | Advanced AI |

Try a bow attack against Basalt's physical resistance, Ivo's healing/binding removal on wounded Nadir, and a fire arrow against Asche's fire immunity. Manual actors can prompt for reactions; the Advanced guard inherits automatic reactions. Costs and legal targets still apply.

For narration, connect a model in SillyTavern, resolve an action, then choose **Narrate result**. The request marks one selected result and its original actor; earlier combat-log actions are omitted from that narration request. The story should follow the engine's recorded outcome. [Optional Combat DM 1.4.0 card and setup](docs/COMBAT-DM.de.md) · [Step-by-step beta checks](docs/BETA-TESTPLAN.de.md).

More [beta examples](examples/beta200beta1/) include a 12-actor arena, a 40-actor battle, a 50×50 search-party map and small regression scenes. File 04 contains portable character profiles; file 05 contains rules only. The other numbered JSON files are complete combats. Earlier examples remain as test fixtures.

## Forest and dungeon layouts

Under **Board → Random map**, Forest now offers **Light woodland**, **Tree clusters and clearings**, **Dense forest** and **Forest trail**. Trees form clusters; low cover is sparse and spaced apart. Forest trails stay clear of trees and cover, and open clearings remain connected.

Compact dungeons retain multiple rooms. **Large rooms and halls** still creates larger spaces than the mixed setting on a 30×30 map. Cover is scattered inside rooms, with corridors kept clear. Very small maps leave less space for separate rooms and furniture.

[Seven map examples](examples/beta200beta2/) cover a 12×12 dungeon, 30×30 room variants and all four forests. Existing saved terrain is unchanged; generate a new map to use the adjusted layouts. Seeds are repeatable with the same settings and placed actors in this version.

## Local preview and development

With Node.js 24, run:

```sh
npm test
node preview-server.mjs
```

Open `http://127.0.0.1:8775/demo.html` for the local preview. The preview uses the same engine/UI modules, but stores its own state in the browser and has no SillyTavern chat or model connection.

The project has no npm dependencies. `npm run build` regenerates the English UI and synchronizes local module version references from `manifest.json`. The committed generated files are already ready for installation.

## Beta status

The existing suite has **1,717 passing tests in 65 files**. Engine/controller tests, saved-state validation and limited DOM/VM checks support the beta. Real manual play, the live SillyTavern integration, model narration and native TTS still need practical beta testing. This is not a stable 2.0 release.

Terrain textures and model-generated DM proposals are experimental. Full campaign/quest objectives, hidden traps and freely extensible attributes are outside the current scope.

## Feedback

Use [GitHub issues](https://github.com/2fat4u/sillytavern-combat-engine/issues) for reproducible bugs. Include the extension version, the action you took and what differed from the expected result. Share only a minimal combat/debug example you want to make public; do not include credentials or private chat content.

## License

[MIT](LICENSE). The original extension notice is preserved in [NOTICE](NOTICE).

Beta 3 comfort test: [small encounter and checklist (German)](docs/COMFORT-TEST.de.md). Shared supplies, other-only custom recipients, conditional abilities and a folding resource editor can be tested together.
