# Die Grenzwacht · Abschlusstest für Beta 6

Ein breiter Testkampf auf **22 × 14 Feldern mit 20 Figuren**, davon zunächst 18 kampffähig. Normale Figuren haben ungefähr 16–28 HP; Rauk hat 30 HP und zwei Aktionen. Enthalten sind alle zehn Schadensarten und alle 21 vorhandenen Fähigkeitsarten. Nicht jede davon wird im selben KI-Durchlauf eingesetzt.

| Datei | Verwendung |
|---|---|
| [01-Die-Grenzwacht-Manuell.json](01-Die-Grenzwacht-Manuell.json) | Sechs eigene Figuren zunächst manuell, Verbündete und Gegner per KI. Für die ersten zwei bis drei Runden mit Erzähler. Anschließend kann derselbe Kampf automatisiert werden. |
| [02-Die-Grenzwacht-Alle-KI.json](02-Die-Grenzwacht-Alle-KI.json) | Derselbe Ausgangskampf mit vollständig automatischer Steuerung und Reaktionen. Zum direkten Durchlaufenlassen. |
| [03-Spezialaktionen-Manuell.json](03-Spezialaktionen-Manuell.json) | Neun nahe beieinander aufgestellte Figuren, manuelle Steuerung und je zwei Aktionen für kampffähige Figuren. Für seltene Aktionen gezielt wiederholt importieren. |

**Als vollständigen Kampf importieren. Die Szenen laufen bereits; nicht erneut „Kampf starten“ drücken.** Erneuter Import derselben Datei bringt den Ausgangsstand zurück. Vorher bei Bedarf deinen aktuellen Kampf exportieren. Die HTML-Vorschau bewahrt vorhandene Browserdaten und besitzt keine Modellverbindung.

## Die ersten Runden mit Erzähler

In SillyTavern einen eigenen Testchat und ein verbundenes Modell benutzen. Unter Oberfläche den Erzählumfang „Eigener Zug“ oder „Automatisch“ wählen. „Ergebnis erzählen“ gibt tatsächliche Ergebnisse wieder; die zusätzliche DM-Zugvorschlagsfunktion ist dafür nicht erforderlich.

1. **Aria:** Feuerfunke auf Asche. Bei Treffer verhindert Feuerimmunität den HP-Schaden; ein gültiger Schuss kostet trotzdem einmal Mana. Der Erzähler darf daraus keine Brandwunde machen. Mit einer anderen Schadensart vergleichen.
2. **Ivo:** Einschüchtern gegen Asche probieren. Asche ist gegen Eingeschüchtert immun. Bei der Probe wird die konfigurierte Ladung verbraucht. In einer späteren Runde Alarmieren ausprobieren und die verständigte Verstärkung beobachten.
3. **Lysann:** Heilende Befreiung auf Nadir. Bei Erfolg heilt sie und entfernt Festgehalten; seine Blutung bleibt bestehen. Bei Fehlschlag bleiben beide gewählten Wirkungen aus, der Versuch kostet trotzdem einmal Reagenzien. Danach erzählen lassen und Empfänger/Ergebnis prüfen.
4. **Mira:** Kurzbogen gegen Kelm, anschließend nach G4 bewegen und Verstecken verwenden. Mira hat zwei Aktionen. Nach „Eigener Zug“ erzählen lassen: Schuss einschließlich eventuellem Fehlschlag/Block, Bewegung und Verstecken sollen gemeinsam vorkommen. Nur tatsächlich ausgeführte Schritte erwarten.
5. Übrige eigene Figuren spielen; zwischen manuellen Zügen „KI bis zum manuellen Zug“ nutzen. Bei einer Reaktionsfrage eine erlaubte Wahl treffen. Nach dem KI-Durchlauf soll „Letzte KI-Serie“ beziehungsweise „Automatisch“ die gerade gelaufene Folge erzählen.

Die sichtbare Auswahl auf der Karte wird geteilt; jede KI braucht zum Angreifen ihre eigene Sicht. Ein Fernangriff muss keine Bewegung enthalten. Rauk bleibt an sein Revier gebunden. Ergebnisse und tatsächliche Kosten stehen im Protokoll.

## Danach denselben Kampf per KI fortsetzen

Unter **Regeln → Gruppensteuerung** für **Spieler** „Advanced AI“ wählen und **Übernehmen** drücken. Die sechs eigenen Figuren sind danach automatisch gesteuert. Ihre Reaktionen stehen auf „Wie Figurensteuerung“ und laufen damit ebenfalls automatisch. Persönlich abweichende Einstellungen bei Bedarf prüfen. Verbündete und Gegner sind bereits KI-gesteuert. Ein Neustart oder erneuter Import ist zum Wechseln nicht erforderlich.

Datei 02 ist eine zusätzliche frische Ausgangsvariante. In ihr sind sämtliche Reaktionen ausdrücklich automatisch; zeitweilig beherrschte Figuren werden Basic-KI-gesteuert. Direkt „KI bis zum manuellen Zug“ oder mehrere KI-Serien verwenden. Das Limit zählt **Figurenzüge, keine Runden**. Beispielsweise 40 Züge pro Serie verwenden und bei Bedarf erneut starten. Ohne manuelle Figuren wird erst am Sicherheitslimit oder Kampfende angehalten.

Begrenzte Heiltränke und Spezialladungen halten den Test überschaubar. Einige Bewegungs-/Verstecken-Fähigkeiten sind für die selbstständige KI-Auswahl ausgeschaltet, bleiben manuell verfügbar. Die Engine wurde dafür nicht angepasst. Je nach Würfen und Entscheidungen kann die Partie viele Runden dauern.

## Was wo enthalten ist

| Bereich | Figuren und Probe |
|---|---|
| Alle zehn Schadensarten | Aria: Feuer, Kälte, Blitz und Kraft. Ivo: Psychisch und Strahlend. Lysann: Gift, Feuer und Säure. Physische Waffen und nekrotische Gegnerangriffe ergänzen die Auswahl. |
| Resistenz und Schadensimmunität | Asche: Feuerimmunität; Frostwolf: Kälteimmunität; Ätherhülle: Kraftimmunität; Nyra: nekrotische Immunität; Sporenläufer: Giftimmunität. Unterschiedliche Resistenzen auf beiden Seiten. |
| Zustandsimmunität | Asche gegen Brennen/Eingeschüchtert; Lysann gegen Vergiftet; Steinwächter gegen Betäubung; Frostwolf gegen Verlangsamung. |
| Periodischer Schaden und Säure-DC-Regel | Giftbogen, Brand-/Säurefläschchen und Nadirs anfängliche Blutung. Die optionale Säure-DC-Regel ist eingeschaltet. Schadensart und anhaltender Zustand bleiben getrennt. |
| Vorräte, Wurfweite und Fläche | Lysanns Trinken/Heilwurf teilen einen Vorrat. Brand-/Säureprofile haben endliche Fläschchen und Radius 1. Stärke-Wurfweite, Flächenschaden und Schussrisiko sind aktiv. |
| Schilde, Block und Konter | Nadir: zwei Reaktionen, Verteidigungs-/Reduktionsprofile. Lysann: einmal absorbierender Schutz. Rauk: Block/Konter. Separates Reaktionsbudget. |
| Eigene Wirkungen und Nachher-Reaktion | Heilende Befreiung und Sturmfessel; Lysanns Flammen abschütteln entfernt Brennen nach einem passenden Angriff, ohne bereits erlittenen Schaden zu erstatten. |
| Verstecken, Voraussetzung und Disengage | Bartholomäus beginnt versteckt; Meuchelstich verlangt Versteckt. Verstecken bleibt manuell verfügbar. Experimentelle Gelegenheitsangriffe und Sicher lösen sind eingeschaltet. |
| Alarm, Suche und Revier | Ivo, Frostwolf, Moorhund und Rauk besitzen Alarmieren. Advanced-Sucher, Basic-Rudelhelfer und Rauks Bossrevier sind vorbereitet. |
| Heilung, Stabilisierung, Bergen und Wiederbeleben | Fenn beginnt bewusstlos, Varo tot. Nadir kann Fenn bergen, Selene Varo wiederbeleben. Bergen heilt/stabilisiert nicht automatisch. |
| Seltene Fähigkeiten | Datei 03: Sprung, Deckung überwinden, Schubsen, Entwaffnen, Festhalten, Betäuben, Beherrschen und Toten erheben manuell prüfen. Für Wiederbeleben und Erheben jeweils frisch importieren. |
| Speichern und Bedienung | Rückgängig/Wiederholen; anschließend Export/Import, Chatwechsel und Neuladen. HP, Vorräte, Zustände und Zugfolge vergleichen. Kompakt-/Vollansicht und DE/EN ausprobieren. |

## Zusatzproben in Datei 03

- Lysann befreit Nadir; er kann danach bei Fenn **Bergen** und zwei freie Endfelder wählen.
- Selene belebt Varo wieder. Nach frischem Import kann Ivo stattdessen **Toten erheben** verwenden; Seite, Steuerung und Dauer unterscheiden sich.
- Bartholomäus kann nach F7 gehen und diagonal über Fenn auf H9 springen, sofern die Zielfelder unverändert frei sind. Die Probe kann scheitern. Meuchelstich separat aus gültiger Nachbarschaft und mit Versteckt testen.
- Lysanns Säurefläschchen auf Asche kann auch den Steinwächter treffen. Für Friendly Fire vorher bewusst eine eigene Figur in die Fläche stellen und die Vorschau prüfen.
- Nach Nahkampfkontakt mit Nadir weggehen: Gelegenheitswarnung und Kosten prüfen. Nach gültigem Disengage darf die Bewegung keine solche Attacke auslösen.

## English opening for the narrator

The party reaches a ruined toll gate in an old border wall. Broken masonry divides the road, and a narrow raised ledge overlooks the southern approach. Fenn lies wounded beside the group; Varo has already fallen. Beyond the gate, armed figures begin to stir. A distant horn cuts through the silence as the party prepares to move.

## English quick guide

Import one JSON as a **full encounter**; combat is already active. File 01 starts with six manual heroes, AI allies and AI opponents. Test narration for the first two or three rounds: Aria's fire attack against fire-immune Asche; Ivo's intimidation against frightened immunity; Lysann's healing/held removal on Nadir; Mira's shot, movement to G4 and Hide in one turn. Respect actual rolls, blocks and remaining budgets.

To continue the same encounter automatically, use Rules → Group control, set **Players** to **Advanced AI**, then Apply. Player reactions inherit actor control and become automatic. File 02 is a fresh fully automated version with explicit automatic reactions and Basic-controlled converted servants. Tactical stocks are finite; some utility abilities remain manual. A batch limit counts individual turns, not rounds.

File 03 is a compact all-manual mechanics exercise. Reimport between mutually exclusive revival/raising tests. All ten damage types and all 21 ability kinds are configured across the pack; AI need not select every ability. Automated runs and opening checks supplement live SillyTavern/model narration and the final code review. [Release checklist](../../docs/BETA6-RELEASE-CHECK.de.md).

[Automatischer Testbericht](../../docs/BETA6-TEST-RUN.de.md)
