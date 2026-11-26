# Beta 6 · zweiter Test vollständig per KI

Am **4. November 2026** wurden der eingesandte vollständig automatisierte Grenzwacht-Durchlauf und das neue Debug-Protokoll geprüft. Alle 20 Figuren sind KI-gesteuert: 13 Advanced, 7 Basic.

## Abschluss und Fehlerprüfung

- Reguläres Kampfende in **Runde 43**, diesmal mit Sieg der Gegner.
- Selene flieht als letzte kampffähige Figur der Spieler-/Verbündetenseite mit 6 HP vom Kartenrand. Die übrigen eigenen Figuren sind geflohen oder stabilisiert und kampfunfähig. Damit ist das Ende plausibel und kein Stillstand.
- Rauk, Sporenläufer, Steinwächter und Nyra bleiben auf Gegnerseite kampffähig.
- Der Export besteht die Zustandsvalidierung. Keine negativen oder überhöhten HP und keine negativen Vorräte im Endstand. Die Quelldateien wurden nicht verändert.
- Im neuen Debug-Ausschnitt stehen **keine Fehlerereignisse oder fehlgeschlagenen Operationen**. Er enthält 200 Einträge von 19:45:14 bis 19:45:41 UTC. Im Kampfexport sind die letzten 300 Protokollereignisse erhalten.

## Entscheidungen am Kampfende

Die überprüften reinen Bewegungszüge sind als Suche beziehungsweise Annäherung an noch nicht erreichbare Angriffsziele protokolliert. Der Sporenläufer und Nyra prüfen erkundete Bereiche erneut; der Steinwächter nähert sich einem Ziel außerhalb seiner Angriffsreichweite. Rauk bleibt wiederholt zur Revierwache stehen, entsprechend seiner vorbereiteten Bosskonfiguration. Daraus ergibt sich kein bestätigter weiterer Entscheidungsfehler. Die Aufzeichnungen belegen nicht, dass jede frühere Entscheidung optimal war.

## Laufzeiten im aufgezeichneten Ausschnitt

| Messung | Anzahl | Median | 95. Perzentil | Maximum |
|---|---:|---:|---:|---:|
| Einzelne KI-Planung | 73 | 3 ms | 9 ms | 11 ms |
| Kampf-/Änderungsoperation | 39 | 30 ms | 52 ms | 60 ms |
| Darstellung nach Änderung | 39 | 105 ms | 124 ms | 151 ms |
| Speichern nach Änderung | 39 | 212 ms | 241 ms | 246 ms |

Die KI-Berechnung ist in diesem Ausschnitt kurz; Darstellung und Speichern kosten mehr Zeit. Das passt zur Rückmeldung des Nutzers, dass der Lauf ausreichend flüssig war. Die Messungen betreffen den aufgezeichneten Schlussabschnitt und sind kein Benchmark über den gesamten Kampf. Kein neuer Leistungsblocker aus diesem Test.

**Ergebnis:** kein zusätzlich bestätigter Fehler. Die bekannten RC-Korrekturen bleiben erforderlich; insbesondere ersetzt dieser erfolgreiche Durchlauf nicht den separat behobenen Alarmfall. Anschließend stehen die abschließende Codeprüfung und die Nachprüfung des tatsächlichen RC-Builds an.

[Erster praktischer Abschluss](BETA6-FINAL-PLAYTEST.de.md) · [RC-Prüfliste](BETA6-RELEASE-CHECK.de.md)
