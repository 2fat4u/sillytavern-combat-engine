# Changelog

## 2.0.0-beta.6

- Freeze the combat behavior from Beta 5 Hotfix 12 for final-beta playtesting. Include the accumulated Beta 5 fixes for opportunity attacks/Disengage, stealth, return and survival decisions, turn/batch narration, qualitative hints, corrosion, Undo/Redo and Alert approach/contact behavior. No new combat rules or AI scoring changes in Beta 6.
- Add The Border Watch: 20 participants on a 22×14 board, all ten damage types and all 21 ability kinds configured, a manual opening, an automatic counterpart and a smaller manual mechanics exercise. Finite tactical stocks and automatic reactions make the unattended variant practical.
- Shorten Feedback and troubleshooting to practical steps. Keep transparent development credits. Help search and a full condition glossary remain future comfort work.
- Validate 2,228 tests in 85 files, bilingual/compact offline preview checks, targeted opening/rare actions and two complete AI battles (19/33 rounds). Live SillyTavern/model play and a final code review remain before a release candidate. See docs/BETA6-TEST-RUN.de.md.

## 2.0.0-beta.5-hotfix.3

- Keep a resolved action as the narration/result anchor when its turn completion triggers recorded rescue deadlines or periodic damage. Link new automatic follow-ups explicitly to the preceding result and turn, including automatic action completion without an explicit End turn event.
- Record distinct rescue expiry, pit rescue expiry, countdown and periodic-damage causes. Preserve the affected participant and chronological order. Narration instructions explicitly separate an unrelated deadline death from the preceding attack, retaining hits and misses faithfully. Respect explicit bilingual condition text instead of replacing the expiry explanation with a generic condition label.
- Show linked deadline events beneath the primary result, alongside recorded effects. Preserve existing boundaries for Undo/import/reset/time/combat end and later actors/actions; do not guess associations for old or unlinked log entries. Hidden participants and hidden-turn transitions remain private.
- Add 24 focused regression checks and three public small narration exercises. Bilingual offline DOM/VM checks verify all three sequences, result display, prompt facts and reload. 2,028 tests in 78 files pass; no live model test performed.
- Keep AI weapon weighting unchanged following the situation tests. Opportunity attacks remain experimental and off by default.

## 2.0.0-beta.5-hotfix.2

- Clarify opportunity warnings with the moving participant's original cell, the provoking opponent and its cell, and the precise intermediate departure step. Retain per-opponent step details for jump/carry previews. Keep unseen names and enemy positions concealed in the player view.
- Explicitly require directly adjacent melee access at departure, including diagonals and existing wall/height restrictions. Allies cannot provoke each other, and a weapon's range field cannot extend opportunity reach to two cells. Ordinary movement paths and reaction costs are unchanged.
- Record the actual adjacent departure and attacker position in committed opportunity results and bilingual combat logs. Include warning stage, route and threats in new reaction decision/cancellation debug entries, including cases where the map still shows the pre-move position.
- Distinguish unconscious (red !) from stabilized (blue medical cross) on the board and participant cards, including compact mode. Keep life-condition markers legible when other effects are paused; preserve accessible text labels and all rescue mechanics.
- Add 13 regression checks, a public intermediate-step/status exercise and six bilingual offline UI checks. 2,004 tests in 77 files pass. This patch retains the previous AI improvements; opportunity attacks remain experimental and off by default.

## 2.0.0-beta.5-hotfix.1

- Keep meaningful emergency self-healing in the weighted choice at low HP when observed incoming attacks threaten incapacitation. Limit last-stock penalties in emergencies, preserve target restrictions/prerequisites and pay action/shared stock exactly once. A strong finishing attack or protective retreat remains an alternative.
- Score attack, healing and ability positions together with a reachable post-action endpoint. Respect remaining movement, split-movement rules, terrain, territory and opportunity risk. Estimate next-turn melee reach separately from ranged cover; do not value distance alone as a reason to wander.
- Learn bounded per-observer combat experience from visible attack modes, shot distances, ordinary damage, observed movement and normal attacks per turn. Use conservative estimates for unknown capabilities; never read private opponent weapons, movement bonuses or configured action counts for this forecast. Close shots establish a minimum range. Critical damage stays out of normal-damage samples; reaction attacks do not imply extra normal actions.
- Reconsider an unused action as soon as search, patrol or approach movement reveals a new opponent at a legal stopping cell. Keep sync/async handling, paid movement, territory, cancellation and interruption consistent.
- Explain blocked friendly firing lines, depleted weapon stock, restricted bonus actions, approach movement and the absence of a useful remaining move in German and English. A decision note is not narrated as a completed action.
- Preserve the relative age of AI clues and per-turn observations when import/Undo changes receipt tokens; preserve announced clue identities so loading does not cause another alarm for the same clue.
- Add 42 focused checks, four public small AI exercises and bilingual offline DOM/VM exercises alongside the existing opportunity-attack checks. 1,991 tests in 76 files pass. Opportunity attacks remain experimental and off by default.

## 2.0.0-beta.5

- Add Hidden with an own-turn duration to Resources & statuses, including precombat setup. Validate hiding rules, terrain and placement; manual correction spends no action.
- Add optional experimental opportunity attacks, off by default and requiring board rules and reactions. Check each departure along a voluntary route before moving. Use a legal visible melee weapon, existing reaction budget and ordinary weapon stock costs. Preserve damage types, protection and hit effects; do not create counter chains or nested defense prompts.
- Add Disengage: self only, no success check, one normal or matching bonus action plus configured stock. Prevent opportunity attacks for the rest of the own turn and permit remaining movement even without split movement. Offer it in the movement prompt only when affordable, reserving costs for a subsequent jump/carry.
- Apply the same voluntary-movement checks to clicks, dragging, cover movement, jumps, carrying and both AI runners. Stop on KO, stun, rooting or insufficient reduced movement; forced movement of the target, placement and GM correction are exempt. Keep cancellation/chat changes atomic and restore costs and turn protection with Undo.
- Make AI movement scoring account for observable opportunity damage and affordable withdrawal. Replan after interruption and retain the actual endpoint. Preserve visible damage and rolls in the log, board feedback and narration even when a reactor is subsequently out of sight, without revealing its identity or equipment.
- Add a public small test scene, 63 dedicated checks plus the new ability in the existing ability matrix (64 additional checks), seeded Basic/Advanced battles and bilingual offline DOM/VM checks.

## 2.0.0-beta.4-hotfix.3

- Show fled participants in the off-board area and offer Return & place from their context menu. Dragging or selecting a destination offers an explicit Return & deploy confirmation. Combine return and legal placement atomically; preserve HP, stocks and initiative and prevent duplicate own turns. Cancelled or invalid deployment keeps the participant fled.
- Observe discretionary Advanced AI repositioning along its actual route. Reassess when a new opponent becomes visible instead of finishing a blind move and immediately ending the turn. Keep normal attack, search, fear and retreat plans separate. Do not enter a different visible opponent's melee reach merely for optional repositioning, and do not treat a backup ranged weapon as a reason for healthy melee fighters to disengage.
- Add 20 regression checks for re-entry, atomicity, Undo, territory, non-omniscient movement, synchronous/asynchronous discovery and German/English controls.

## 2.0.0-beta.4-hotfix.2

- Keep visible attacks, misses, abilities and turn endings in the player log when only their appended current/next initiative preview identifies an unseen participant. Strip that private turn preview from the displayed copy; retain the authoritative saved event. Keep actual unseen actors, targets and other private details filtered.
- Apply the same visibility rule to recorded outcomes, result cards, focused narration and event eligibility. Preserve same-name participant handling and full GM views. Add 14 regression checks, including German and English log/result rendering.

## 2.0.0-beta.4-hotfix.1

- Add a global Strength throwing-range switch under Rules, with bilingual labels and a separate calculation-help row. Retain per-profile thrown-item selection; ordinary bows and crossbows are unaffected. Disabled throwing profiles use base range only, without falling back to the Perception bonus.
- Preserve Beta 4 behavior when loading older scenes or complete rule exports without the new switch. Keep drafts, rule transfer, Undo, map reach, targeting, healing and AI on the same calculation.

## 2.0.0-beta.4

- Add opt-in signed Strength throwing range to ranged weapon and treatment profiles. Compute base + floored Strength modifier, minimum one cell; zero-range treatments stay self-only. Strength replaces the optional Perception range bonus on that weapon. Share the effective value across legal targets, attacks, treatment centers, AI, live previews and board markings. Preserve legacy fixed ranges and existing variants.
- Add a common Damage items and shared stocks section to Resources & statuses, including acid/fire/custom templates and explicit adoption of an existing ranged attack. Edit the attack and its stock in one staged dialog, with shared stock quantity shown/edited once. Reuse ordinary weapon attacks for rolls, damage types, area, on-hit effects, protection, reactions and costs. New consumables have no automatic free standard variant. Cancel and Undo preserve both parts; actor/weapon profile exports retain their links.
- Guard asynchronous chat combat-block completion/failure with the originating chat key. A cancelled reaction after chat switching cannot create or overwrite a pending action in the destination chat. Cover user and model blocks.
- Patch native DOM nodes instead of replacing the entire combat window. Keep unchanged board cells and controls, update changed values/attributes, and skip identical consecutive markup. Retain a full-render fallback for limited embedders. Remove the outer Other actions fold frame/padding in compact mode.
- Reuse serialized keys only for deeply immutable cached Undo snapshots. Keep small histories, live state and the history array mutable; restore Undo into an editable copy. Preserve the persisted codec format and snapshot independence. Cache ranked cells and repeated alarm reports within one AI planning call, without changing legacy plans.
- Add 39 regression checks. Local 40-actor, 30-frame serialization comparison shows identical payload sizes and reduced packing/JSON time; browser rendering and real storage performance remain manual checks.

## 2.0.0-beta.3-hotfix.3

- Alert uninformed reinforcements rather than participants already seeing an opponent. Allow at most one sent alarm per participant per round and two rounds between received alarms; small updates within three cells of a fresh known/heard contact do not trigger another warning. Preserve direct-observation limits, clue age, stock/action costs and territorial restrictions. Persist cooldowns with safe legacy defaults, Undo/reset behavior and bounded debug fields.
- Require a concrete benefit for discretionary attack/support repositioning and remaining movement: a newly reachable action, improved expected attack outcome, cover, broken sight or useful disengagement. Always consider the current cell. Healthy offensive melee fighters keep contact instead of walking away solely to improve a distance heuristic. Search, pursuit, fear and purposeful retreat remain separate movement reasons.
- Lower ordinary enemy stabilization to a fallback when a useful attack or offensive ability is available and no nearby active friend has usable healing for another participant. Player-side allies and the existing Support combat style retain urgent rescue priorities. Stock, recipient restrictions, prerequisites and active-healer availability matter; stabilization does not restore HP.
- Add 25 focused regression tests and update previous alarm scenarios for the new warning policy. No Basic AI or numerical combat-rule changes.

## 2.0.0-beta.3-hotfix.2

- Keep the short board result visible after the acting participant ends a turn or uses remaining movement, in both compact and regular views. Include the recorded actor/recipient and attack damage. Dismissal lasts until the next result; import/reset boundaries clear the short outcome.
- Select the same visible recorded event for the result card and focused narration, including stabilization, healing, alerting and other non-attack actions. Show a later participant’s movement-only, skipped or empty turn instead of retelling a preceding actor’s attack. Preserve immediate effect-only narration and private-enemy masking.
- Fold Other actions in compact mode and retain its expansion across redraws. Collect explicitly marked static instructions in a separate collapsed Explanations section. Keep warnings, target restrictions, effect summaries, supplies, costs, action budgets and stance controls available.
- Record actor name and original turn/round on movement and skipped-turn events; no combat-rule or AI scoring changes. Alarm frequency review remains deferred until the next user debug export.

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
