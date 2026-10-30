# Hotfix 12 · Beschriftungen und Hilfe aus dem Review

Die Vorschläge aus „Review combat engine code“ wurden am lokalen Stand Hotfix 11 gegen die tatsächlichen Funktionen geprüft. Diese Fassung überarbeitet Texte und die Hilfestruktur. Kampfmechanik, KI-Planung, Alarmziele und Speicherung sind unverändert.

| Reviewpunkt | Ergebnis |
|---|---|
| HP, DC und erster Spielzug verständlicher erklären | Übernommen: Lebenspunkte (HP), Verteidigungswert (DC), Unterschied zur Schwierigkeit einer Probe und ein konkreter Ablauf von Einrichtung bis Zugende. |
| Grundlagen vor Advanced AI einordnen | Übernommen: nach dem Schnellstart folgen Steuerung, Angriffe, Fähigkeiten und Ressourcen. KI und Spezialthemen stehen weiter hinten. Bestehende Aufklappbereiche behalten ihre Kennungen. |
| Versionsgeschichte aus der Benutzerhilfe entfernen | Übernommen: „ab Hotfix 11“, alte Alpha-Koordinaten und die alte Attributabwehr-Migration stehen nicht mehr im laufenden Hilfetext. Das Änderungsprotokoll und die historischen Patchanleitungen bleiben erhalten. |
| Einheitliche deutsche Begriffe | Übernommen: Figurenvorlagen/Figurenbibliothek, Spielleiter-Korrektur, Rückgängig und Lebenspunkte durch Konstitution. Die englische Oberfläche behält passende englische Begriffe. „Advanced AI (Alpha)“ heißt passend zur aktuellen Beta „Advanced AI“. |
| KI-Arten erklären und Serienbeschreibung korrigieren | Übernommen: Manuell, Basic-KI, Advanced AI und DM-Vorschlag erklären getrennt, wer entscheidet, wer würfelt und wann bestätigt wird. Die KI-Serie nennt Basic und Advanced. |
| Alarmieren kürzer gliedern | Übernommen als eigener Hilfeabschnitt: selbst rufen, automatische Rufe, Verhalten der Empfänger und Gründe für eine Sperre. Hörweite, eigene Sicht, einmalige Kosten und Advanced-Freigaben bleiben ausdrücklich erklärt. |
| Fähigkeitserklärungen gleich aufbauen | Übernommen mit klaren Abschnitten für Wirkung, Dauer, Probe, Ziel, Kosten und automatische Nutzung. Unterschiedliche Sprungweite, Schubs-Zielreichweite und zwei Bergen-Endfelder bleiben erhalten, da sie verschiedene Dinge bezeichnen. |
| Hilfesuche und Zustandslexikon | Weiterhin als eigener Komfortpunkt geplant. Diese Textfassung enthält noch keine Suche und kein vollständiges Lexikon. |

Zusätzlich berichtigt: Der allgemeine Verstecken-Abschnitt erklärt nun das Verstecktbleiben im offenen Gelände bis zur nächsten eigenen Aktion/Reaktion. Die Hilfe zu berechneten eigenen Fähigkeiten beschreibt die vorhandene Advanced-KI-Nutzung und ihre Freigabe. „Sicher lösen“ wird mit der tatsächlichen Dauer bis zum Ende des eigenen Zuges erklärt. Reine Erzählwirkungen bleiben manuell.

Die Prüfung bestätigt die Textvorschläge; die im Review nicht abgeschlossene grafische Prüfung wird hier nicht als erledigt ausgegeben. 2.228 bestehende Tests in 85 Dateien sowie begrenzte Offline-Bedienprüfungen in Deutsch/Englisch bestehen. Vorhandene Beschriftungsprüfungen wurden an die neuen Begriffe und hervorgehobenen Abschnittstitel angepasst. Keine neuen Tests, die nur die neuen Texte wiederholen. Der aktuelle Kampf wird durch das Öffnen der Hilfe nicht verändert.

Lokal zum Testen gebaut, noch nicht auf GitHub veröffentlicht. Geplante Hilfesuche und Zustandsübersicht: [Plan](HELP-PLAN.de.md).
