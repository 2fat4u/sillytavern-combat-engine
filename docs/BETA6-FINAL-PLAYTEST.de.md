# Beta 6 · abschließender Grenzwacht-Durchlauf

Am 31. Oktober 2026 wurden der abschließende Grenzwacht-Spielstand und das zugehörige neue Debug-Protokoll geprüft.

- Der Kampf ist regulär in **Runde 39** beendet (`phase: ended`), mit protokolliertem Sieg der Spielergruppe.
- Ivos letzter Fernangriff setzt Rauk von 2 auf 0 HP. Danach ist kein Gegner mehr kampffähig im Kampf; der noch lebende Steinwächter ist geflohen und zählt nicht als aktiver Gegner.
- Ivo, Selene und Basalt bleiben kampffähig. Die übrigen Zustände unterscheiden geflohene, stabilisierte, bewusstlose und tote Figuren; die gespeicherte Ergebnisliste ist damit vereinbar.
- Der Export besteht die Zustandsvalidierung. Die Quelldatei wurde nicht verändert.
- Der neue Debug-Ausschnitt umfasst 200 Einträge aus den letzten gut zwei Minuten bis nach dem Kampfende. Darin sind **keine Fehlerereignisse** oder fehlgeschlagenen Operationen erfasst.

Aus diesen Dateien ergibt sich **kein weiterer bestätigter Ausführungsfehler**. Sie belegen den Abschluss dieses Testkampfs, keine allgemeine Fehlerfreiheit aller Funktionen. Die zuvor gefundene Alarmblockade bleibt als lokal getestete RC-Korrektur dokumentiert; der praktische Durchlauf wurde mit deaktiviertem automatischem Alarm für Nadir fortgesetzt.

Für den RC bleiben die bereits vereinbarten Punkte: Alarmkorrektur veröffentlichen, Fähigkeitsmeldungen, automatisch sichtbare Kontextaktionen im Kompaktmodus, Hilfesuche, Provoziert-Symbol sowie die vorbereiteten Verbesserungen der Erzählfakten und Testnamen. Die abschließende Codeprüfung und Nachprüfung des tatsächlichen RC-Builds stehen noch aus.

[RC-Prüfliste](BETA6-RELEASE-CHECK.de.md) · [Alarmkorrektur](RC-ALARM-STANDSTILL.de.md)
