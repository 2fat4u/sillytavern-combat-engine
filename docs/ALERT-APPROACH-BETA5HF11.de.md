# Hotfix 11 · Alarmziel und Gegnerkontakt unterwegs

## Verhalten

- **Bekannter Gegner beim Ruf:** Die zuletzt bekannte Position wird als feste Zielregion gemeldet. Die Empfänger suchen darin freie, legal erreichbare Felder mit Sichtlinie und zwei bis drei Feldern Abstand. Sie laufen nicht auf das gegnerische Feld. Die normale Kampftaktik kann nach eigener Sichtung eine andere Angriffsposition wählen.
- **Ohne Gegnerhinweis:** Der Rufende bleibt wie bisher der feste Sammelpunkt.
- **Irgendein Gegner wird unterwegs selbst gesehen:** Die Annäherung endet für diese Figur, auch wenn der Gegner nicht zum ursprünglichen Hinweis gehört. Normale Basic-/Advanced-Entscheidungen übernehmen; eine wirklich verbleibende Aktion kann noch eingesetzt werden. Nach einem Kontakt wird der alte Annäherungsbefehl nicht wieder aufgenommen.
- **Normale Basic-Patrouille:** Neue Sichtungen werden nun ebenfalls an legalen Zwischenfeldern geprüft. So entfällt der beobachtete leere Zug nach Sichtkontakt am Ende einer Patrouillenbewegung.

Der Radius bleibt die Hörweite vom Rufenden aus. Ein benachbarter Verbündeter hinter ihm kann jetzt ebenfalls Hilfe erhalten, wenn er den Gegner noch nicht sieht. Angriffe benötigen weiterhin eigene Sicht. Der Hinweis enthält den Stand beim Ruf, keine aktuelle Verfolgung eines unbemerkt weitergelaufenen Gegners. Reviergrenzen, Gelände, Vorräte, Zustände, Gelegenheitsangriffe und die normalen Budgets gelten. Der Ruf gibt keine Bewegung oder Aktion zusätzlich. Manuelle Empfänger bekommen nur den Hinweis und bleiben unter Spielerkontrolle.

Für unterschiedliche Sichtweiten wird innerhalb der Zielregion ein möglichst passendes Feld gewählt. Bei weniger als zwei Feldern Sichtweite kann der Mindestabstand eine Sichtung verhindern. Ein inzwischen verlassener Hinweis oder später versperrte Felder garantieren keinen Kontakt. Es gibt keine Garantie für einen sicheren Anmarsch und keinen automatischen zusätzlichen Suchmodus.

## Weiter testen

Die öffentlichen [Beispiele](../examples/beta200beta5hf11/) laufen bereits: nicht neu starten.

1. **Gegnerhinweis:** Manueller Ruf, anschließend KI-Züge. Beide bewaffneten Verbündeten nähern sich dem gemeldeten Gegner und können bei Sichtkontakt schießen.
2. **Gegner unterwegs:** Ein weiterer Gegner liegt zwischen Verstärkung und Hinweis. Der Gerufene entdeckt und bekämpft ihn mit seiner normalen Aktion.
3. **Basic-Patrouille:** Die Figur sieht anfangs keinen Gegner; auf ihrer Route entsteht Sichtkontakt. Sie soll ihre vorhandene Aktion noch im selben Zug verwenden.

Alte Kämpfe bleiben importierbar. Bereits gespeicherte Rufe ohne neue Annäherungskennzeichnung behalten ihr bisheriges Sammelziel. Die neue Zielwahl gilt für neu ausgeführte Alarmfähigkeiten. Rückgängig/Wiederholen speichert Zielregion und Kontaktende. Die bisherige Advanced-Warnfunktion ohne zugewiesene Alarmfähigkeit bleibt kompatibel.

Die Diagnose zeigt Annäherungsart und Kontaktende. Erzählkontext und Hinweis unter der aktiven Figur unterscheiden „Annäherung nahe …“ vom alten Sammelpunkt. Koordinaten dienen als Hinweis; erzählte Bewegung bleibt natürlich formuliert.

18 neue Tests prüfen die Zielregion, hörende Nachbarn, Revier/Hörweite, keinen heimlichen Positionsabgleich, Gegner unterwegs in beiden KI-Arten und beiden Ausführungswegen, Basic-Patrouille, verborgene Gegner, Pause/Fortsetzen und Import/Rückgängig/Wiederholen. Bestehende Alarmprüfungen wurden an die beabsichtigte neue Zielwahl angepasst. Insgesamt 2.228 Tests in 85 Dateien. Begrenzte deutsche/englische Offline-Bedienprüfung; kein grafischer oder Live-Modelltest. Waffen-/Zielbewertungsformeln und globale Wegsuche bleiben unverändert.

Hilfesuche und vollständiges Zustandslexikon sind weiterhin geplant. Lokal gebaut; keine GitHub-Veröffentlichung.
