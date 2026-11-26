# Beta 6 → Release Candidate

Beta 6 friert die Kampfmechanik aus Beta 5 Hotfix 12 ein. Neu sind der breite [Grenzwacht-Testkampf](../examples/beta200beta6/) und eine gekürzte, praktische Fehlersuche in der Hilfe. Dies ist eine Beta, keine stabile 2.0.

**Praktischer Abschluss am 31. Oktober:** Die Grenzwacht lief nach der Alarm-Zwischenlösung bis zum regulären Sieg in Runde 39 durch. Gespeicherter Endstand konsistent; keine Fehler im neuen Debug-Ausschnitt. [Prüfbefund und Grenzen](BETA6-FINAL-PLAYTEST.de.md). 

**Zweiter Durchlauf am 4. November:** Vollständig KI-gesteuert, regulärer Gegnersieg in Runde 43 nach Selenes Flucht. Endstand konsistent und keine Fehler im neuen Debug-Ausschnitt. Die 73 erfassten Planungsschritte benötigten im Median 3 ms und maximal 11 ms. Kein neuer bestätigter Entscheidungs- oder Leistungsblocker. [Befund und Messumfang](BETA6-ALL-AI-PLAYTEST.de.md).

1. Zwei bis drei Runden aus Datei 01 in SillyTavern mit verbundenem Modell manuell spielen. Erzählung eines Ergebnisses, eines ganzen Zuges und der letzten KI-Serie vergleichen. Keine alte Aktion erneut erzählen, keine erfundenen Schäden/Zustände, unabhängige Ereignisse getrennt behandeln.
2. Danach denselben Kampf per Gruppensteuerung automatisieren oder Datei 02 frisch durchlaufen lassen. Reaktionen, Heilung, Zustandskosten, Alarm/Sicht und Bossrevier beobachten. Ein KI-Kampf muss nicht jede vorhandene Fähigkeit einsetzen.
3. Seltene Aktionen mit Datei 03 prüfen. Rückgängig/Wiederholen, Speichern/Neuladen, Import/Export und Chatwechsel praktisch mitnehmen. Kompakt-/Vollansicht auf Deutsch und Englisch ansehen.
4. Bei unauffälligem Ergebnis den eingefrorenen Stand noch einmal auf Codefehler und sinnvolle Optimierungsmöglichkeiten prüfen lassen. Änderungen brauchen einen konkreten Nutzen und passende Nachprüfung.
5. Kleinere Korrekturen können in den Release Candidate einfließen. Größere Fehler würden einen weiteren Beta-/Teststand rechtfertigen. Erst nach erfolgreichem Abschluss stabile 2.0 freigeben.

## In 2.0.0-rc.1 umgesetzt

- **KI-Alarm:** Ein automatischer Advanced-Alarm setzt einen neuen gültigen Beobachtungsbericht voraus. Die Alarmfähigkeit behält ihre eigene Sammelpunktlogik. Der zuvor blockierte Spielstand lief 24 weitere Figurenzüge. [Ursache und Korrektur](RC-ALARM-STANDSTILL.de.md).
- **Hilfesuche:** Überschriften, vorhandene Texte und Zustandsnamen lassen sich auf Deutsch und Englisch durchsuchen. Treffer werden geöffnet und hervorgehoben. [Hilfesuche und späteres Zustandslexikon](HELP-PLAN.de.md).
- **Kompaktmodus:** Das Kontextmenü öffnet den passenden Bereich für Fähigkeit, eigene DC-Probe, Ressource oder Angriff. Entwürfe und Budgets bleiben verfügbar. Provoziert erhält das Symbol 😡.
- **Fähigkeitsmeldungen:** Die Anzeige nennt konkrete Gründe, etwa fehlende Aktionen oder bereits aktives Verstecken. Kurzmeldungen nennen Immunität und unterbrochene Bewegung. [Diagnose und Nachprüfung](RC-ABILITY-MESSAGES.de.md).
- **Erzählkontext:** Die Grenzwacht verwendet neutrale Testnamen. Für die Erzählung enthält der rekonstruierte Fenn-Zug Bewegung, Treffer und Giftschaden ohne Feldkoordinate. [Erzählbefund](RC-NARRATION-NAMES.de.md).

2.252 automatisierte Tests und die zweisprachigen Offline-Prüfungen sind bestanden. Zwei vollständige Grenzwacht-Kämpfe endeten ohne Ausführungsfehler in Runde 19 und 33. Die grafische Endkontrolle und Live-Erzählung in SillyTavern sind Teil des manuellen RC-Tests.
