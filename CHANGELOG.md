# Changelog

## 2.0.0-beta.2

- Add four forest layouts: light woodland, tree clusters with clearings, dense forest and a forest trail. The choice is shown only for Forest and survives map/combat saves.
- Replace the blanket of adjacent forest cover with sparse, spaced obstacles. Keep clustered trees and connect enclosed clearings; trails remain broad and clear of trees and cover.
- Scale dungeon room counts to compact maps. Large-room mode now produces several connected rooms on a 30×30 map; small partitions retain separating walls.
- Keep occasional merged halls without merging the entire compact dungeon into one room.
- Scatter cover through room interiors with space around each piece, keeping corridors and routes to placed participants clear.
- Existing saved terrain is unchanged. Newly generated forests and dungeons use the adjusted layouts; a given seed remains repeatable within this version.

## 2.0.0-beta.1

- Publish the existing beta as **Tavern Tactics — Combat Engine for SillyTavern**.
- Add Git-repository installation instructions, English/German documentation and the small six-actor manual beta scenario.
- Preserve the existing combat logic, internal chat-data key and configured actor values.
- Beta focus: manual play, live chat context, model narration and reactions. Stable release pending these checks.

## 2.0 Alpha 2 hotfixes

- Preserve visible actor names when an unseen actor has the same name.
- Resolve inherited Basic/Advanced reaction control automatically.
- Remember observed incapacitated/dead contacts, finish checked clues and prevent old warnings from repeatedly renewing searches.

## 2.0 Alpha

- Add Advanced AI, weighted targets, observation-based combat knowledge, optional search parties and alerts, territory controls, retreat and compact UI.

## 1.9 foundation

- Grid combat, configurable checks/abilities, resources, conditions, damage types, immunities/resistances, reactions, vision, map/profile/rule transfer and optional sounds/textures.
