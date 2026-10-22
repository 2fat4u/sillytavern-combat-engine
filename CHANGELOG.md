# Changelog

## 2.0.0-beta.3-hotfix.1

- Keep reaction status words intact in narrow sidebars: Unavailable no longer splits before its final letter. Let the heading share space with the badge and wrap the badge to a new row when necessary. Preserve German labels and distinct reaction states; no combat-rule changes.

## 2.0.0-beta.3

- Fold individual resource entries and keep one editor dialog open. Editing fields retains focus and scrolling; source/purpose changes preserve entry expansion and unsaved status/trait inputs.
- Resolve ability, own-check, shield and weapon costs through a selected supply’s linked stock. Charge the invoking profile’s cost once, show the actual shared source, and hide unused linked-profile quantities without deleting them. Preserve shared dependencies in profile exports.
- Add Other participants only for supplies, custom abilities and own-check effects. Exclude the caster in execution, target lists and area treatment; keep existing side/range restrictions and legacy defaults.
- Add one optional user-condition prerequisite to custom abilities: Hidden or an existing classic/tactical condition. Validate it before rolls/costs across manual use, profile checks, Advanced AI and reactions, and recheck at reaction execution. Existing conditions retain their ordinary behavior.
- Clarify jump distance, shove target range, target defense DC, automatic success without a D20 check, and the draft used to add damage-over-time entries. Preserve disabled defense values.
- Include a small independent comfort test encounter. No AI scoring changes or migration of user battles.

## 2.0.0-beta.2-hotfix.5

- Keep Neutral/Offensive/Defensive stance selection visible in compact mode. Collapse its explanation instead of hiding the control.
- Replace hidden movement and AI-batch sections with native folds. Show remaining/total movement in the fold heading, retain direct Stop access during automation and remember expanded sections across redraws.
- Add a collapsible stock overview with quantities and capacities; linked use profiles do not duplicate their shared stock. Preserve per-action costs and current action/reaction budgets. The compact settings now select which detail sections start expanded.
- No AI scoring or combat-rule changes.

## 2.0.0-beta.2-hotfix.4

- Give result narration an explicit selected-result anchor with its original actor, target, round and turn. Omit earlier combat-log actions from this request while preserving live participant facts and other modes’ configured history count.
- Keep immediate recorded effects with their action; do not attach periodic damage from a later turn. Respect Undo and encounter/reset/import boundaries. Check the actual result anchor in outgoing-context diagnostics.
- Add Combat DM 1.4.0 with clearer separation of intent and resolved effects, short result-only narration and a fallback for older extension versions. Combat rules, costs and saved state are unchanged.

## 2.0.0-beta.2-hotfix.3

- Distinguish globally disabled reactions from a participant’s disabled reaction control. A zero reaction allowance now reads “Unavailable” instead of “OFF”.
- Show separate reasons for spent reactions, no allowed choices and a required reservation. Keep the numerical budget and independent shield controls. Localize badges and explanations in German and English and allow them to wrap in narrow panels.
- Correct custom-reaction diagnostics: a zero allowance is not reported as spent or promised to reset next turn. Combat settings and reaction costs are unchanged.

## 2.0.0-beta.2-hotfix.2

- Add “Show hidden enemies” under Participants, with a clear status when undiscovered opponents are hidden. This management-only view allows editing those figures while preserving board visibility, targeting rules, model context and combat state.
- Reset the extra participant visibility when changing chats. Keep it separate from GM position correction; show all opponents normally when enemy hiding is disabled.
- Begin successful participant, profile, roster-list and full-combat imports with an explicit success message. Direct users to the new participant switch when imported enemies are hidden.

## 2.0.0-beta.2-hotfix.1

- Recognize profile files in the main Import dialog and open the populated profile preview instead of treating profiles as full combat saves. Participant profiles add new figures; only full combat saves replace the current encounter.
- Show recipient and Add/Replace controls only for imported weapon, ability, resource, status or budget profiles. Do not preselect the first participant; a transfer opened from a specific participant retains that explicit recipient.
- Separate export settings from the detected import type. Disable Import while a file is loading or invalid and prevent earlier delayed reads from replacing a more recently selected file.
- Confirm how many participants were added. Explain that unplaced enemies can be hidden by vision settings and can be deployed using GM position correction.
- Preserve existing figures, terrain, combat rules and the saved chat-data key. Clear a previous dialog error when retrying.

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
