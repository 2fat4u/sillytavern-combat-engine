# Tavern Tactics — Kampfsteuerung für SillyTavern

Taktische Karten, verbindliche Würfe und Kampfregeln für SillyTavern. Aktueller Stand: **2.0.0-beta.2-hotfix.5**. Du steuerst Figuren manuell oder lässt Basic/Advanced AI handeln. Das Sprachmodell kann die berechneten Ergebnisse erzählen.

## Installation

Unter **Erweiterungen → Erweiterung installieren** die Adresse `https://github.com/2fat4u/sillytavern-combat-engine` eintragen, installieren und den Browser neu laden. Git muss auf dem SillyTavern-Rechner vorhanden sein. Im Chat über **⚔ Kampf** oder `/kampf` öffnen.

Die bisherige ZIP-Installation hieß `sillytavern-combat`, die Git-Installation normalerweise `sillytavern-combat-engine`. Nur eine Kopie aktivieren. Vor dem Umstieg den Kampf exportieren und die alte Kopie deaktivieren. Der interne Schlüssel `deterministic_combat_v1` bleibt gleich; vorhandene Chat-Kämpfe und Vorlagen werden durch den neuen Projektnamen nicht zurückgesetzt.

Updates über die Erweiterungsverwaltung prüfen. Keine zweite aktive Installation anlegen.

## Erster kleiner Kampf

Die Datei [08-Beta-Manuell-Chat.json](../examples/beta200beta1/08-Beta-Manuell-Chat.json) über **Raw / Download raw file** herunterladen und im Testchat als vollständigen Kampf importieren. Drei manuelle Figuren stehen drei Advanced-Gegnern auf 14×10 Feldern gegenüber.

Lyra hat Bogen und Feuerpfeile. Ivo kann heilen und Held entfernen. Nadir beginnt verletzt und gehalten und hat eine eigene Nachher-Reaktion gegen Brennen. Basalt ist gegen physischen Schaden resistent; Asche ist gegen Feuerschaden und Brennen immun. Nyra verwendet Gift. Der [Beta-Testplan](BETA-TESTPLAN.de.md) beschreibt die einzelnen Prüfungen.

Im Bereich Figuren lassen sich HP, Werte, Waffen, Fähigkeiten, Ressourcen/Zustände, Reaktionen und Aktionsbudget bearbeiten. Die Hilfe in der Oberfläche erklärt die Berechnungen und optionalen Regeln.

## Karten und Sicht

Karten bis 50×50 Felder, Hindernisse, Deckung, Höhen, Leitern und Abgründe sind verfügbar. Bewegung, Schussreichweite und optional Sichtweite haben getrennte Markierungen. Deckung für Schüsse wird aus der Schusslinie bestimmt. Zufallskarten und zufällige Aufstellung unterstützen unterschiedliche Verteilungen der Gruppen.

Unter **Board → Zufällige Karte → Wald** gibt es die Auswahl **Lichter Wald**, **Baumgruppen und Lichtungen**, **Dichter Wald** und **Wald mit Weg**. Die Auswahl erscheint nur beim Kartentyp Wald. Bäume bilden Gruppen; niedrige Deckung steht sparsamer und mit Abstand. Der breite Waldweg bleibt frei und Lichtungen sind erreichbar.

Dungeon-Karten behalten auch auf kleineren Flächen mehrere Räume. Bei 30×30 Feldern entstehen mit „Große Räume und Hallen“ mehrere große Räume statt einer einzigen Halle. Deckung liegt auch im Rauminneren; Verbindungen bleiben frei. Sehr kleine Karten lassen entsprechend weniger Platz für Räume und Möbel.

Die [sieben Kartenbeispiele](../examples/beta200beta2/) können als vollständige Testkämpfe importiert werden. Gespeicherte Geländeaufteilungen bleiben erhalten; die Anpassungen gelten beim Erzeugen einer neuen Karte. Derselbe Seed bleibt mit gleichen Einstellungen und Figurenpositionen in dieser Version reproduzierbar.

Mit aktivierter Sichtweite können unbekannte Gegner aus Karte, Initiative und Figurenübersicht ausgeblendet werden. Die Spielleiterkorrektur kann sie zum Bearbeiten einblenden. Angriffe benötigen weiterhin eigene Reichweite und Sicht.

## Figurensteuerung und Reaktionen

- **Manuell:** Du entscheidest über Bewegung und Aktionen.
- **Basic:** einfache automatische Kampfführung.
- **Advanced:** gewichtete Ziele, beobachtete Bedrohungen/Immunitäten, Unterstützung, Suche, Revierbindung, Alarm und situativer Rückzug.
- **DM:** bestätigungspflichtige Modellvorschläge; experimentell.

Unter Advanced-Optionen können Figuren warten, patrouillieren oder suchen. Gemeinsame Suche in kleinen Gruppen ist optional. Ein Boss kann im eigenen Revier bleiben; ein freier Sucher darf weitere Bereiche erkunden. Wissen entsteht aus Beobachtungen. Bereits als tot/kampfunfähig erkannte Kontakte und erledigte Hinweise halten die Suche nicht dauerhaft auf.

„Wie Figurensteuerung“ reagiert bei Basic/Advanced automatisch. Ausdrücklich „Immer nachfragen“, „Automatisch“ und „Aus“ haben Vorrang. Eigene Reaktionen mit berechneten Wirkungen benötigen Vorher/Nachher. Eine Nachher-Reinigung erstattet keinen bereits erlittenen Schaden. Aktions-/Reaktionsbudgets und Vorräte gelten weiter.

## Regeln und eigene Fähigkeiten

Regeln werden pro Kampf gespeichert. Treffer, Schaden, Heilung, Mana/Munition, Zustandsdauer, Schilde, Resistenzen und Immunitäten werden durch den Code berechnet. Zustandsimmunität und Schadensimmunität sind getrennt: Immunität gegen Brennen verhindert nicht automatisch den eigentlichen Feuerschaden.

Eigene DC-Proben und gespeicherte Fähigkeiten können optionale Schadens-/Heilungswürfel und eine Zustandswirkung enthalten. Eine gemeinsame Probe und einmalige Kosten pro Versuch. Weitere erzählerische Folgen spielt der Nutzer bei Bedarf selbst aus. Die eigene Fähigkeit kann auf sich selbst oder ein zulässiges gewähltes Ziel wirken, abhängig von ihrer Konfiguration.

Wiederbeleben, Toten erheben, Beherrschen, Stabilisieren, Rettung am Abgrund und das gemeinsame Bergen von Verbündeten sind vorhanden. Im Fähigkeiteneditor sind Kosten, Reichweite, Probe und Dauer konfigurierbar.

## Chat, Modell und TTS

Die Engine liefert den aktuellen verbindlichen Kampfkontext an SillyTavern. Nach einer ausgeführten Aktion „Ergebnis erzählen“ verwenden. Das Modell erzählt, während Würfe/HP/Zustände verbindlich aus dem Code kommen. Standardmäßig werden acht relevante Ereignisse geliefert; die Kontextmenge ist unter Oberfläche einstellbar.

Bei einem Zugwechsel soll die nächste Erzählung die neue aktive Figur berücksichtigen. Reine technische CombatEngine-Notizen sollen nicht als zusätzliche TTS-Figur vorgelesen werden. Die praktische Live-Anbindung hängt vom SillyTavern-/Modell-/TTS-Aufbau ab und ist ein Schwerpunkt der Beta. Zuverlässige JSON-DM-Vorschläge sind noch nicht zugesagt.

## Speichern und korrigieren

Der Zustand liegt in den Metadaten des jeweiligen Chats. Export/Import sichert komplette Kämpfe; Karten, Figurenprofile und Regeln können getrennt übertragen werden. Undo stellt vorherige Änderungen wieder her. Das rollierende Protokoll ist keine unbegrenzte Kampfchronik.

Bei Kampfunfähigkeit der ganzen Gruppe endet der Kampf. Bewusstlose und stabilisierte Figuren werden nicht pauschal als tot ausgegeben. Rettungsfristen pausieren nach dem Kampf und können manuell weitergeführt werden.

## Beta und weitere Entwicklung

1.696 automatisierte Tests in 65 Dateien, ergänzende begrenzte DOM-/VM-Prüfungen. Die Beta wartet auf weitere manuelle Partien und Live-Chat-/Modell-/TTS-Tests. Texturen und DM-Modellvorschläge bleiben experimentell. Szenarioziele wie „Ausgang erreichen und Hebel betätigen“, verdeckte Fallen und frei definierbare Attribute sind spätere Ideen.

Für lokale Entwicklung: Node.js 24, `npm test`. Die modulare Offline-Vorschau startet mit `node preview-server.mjs` auf `http://127.0.0.1:8775/demo.html`. Sie hat keine Chat-/Modellverbindung.

Lizenz: [MIT](../LICENSE), ursprünglicher Hinweis in [NOTICE](../NOTICE).
