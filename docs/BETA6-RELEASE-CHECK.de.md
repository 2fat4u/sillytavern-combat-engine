# Beta 6 → Release Candidate

Beta 6 friert die Kampfmechanik aus Beta 5 Hotfix 12 ein. Neu sind der breite [Grenzwacht-Testkampf](../examples/beta200beta6/) und eine gekürzte, praktische Fehlersuche in der Hilfe. Dies ist eine Beta, keine stabile 2.0.

1. Zwei bis drei Runden aus Datei 01 in SillyTavern mit verbundenem Modell manuell spielen. Erzählung eines Ergebnisses, eines ganzen Zuges und der letzten KI-Serie vergleichen. Keine alte Aktion erneut erzählen, keine erfundenen Schäden/Zustände, unabhängige Ereignisse getrennt behandeln.
2. Danach denselben Kampf per Gruppensteuerung automatisieren oder Datei 02 frisch durchlaufen lassen. Reaktionen, Heilung, Zustandskosten, Alarm/Sicht und Bossrevier beobachten. Ein KI-Kampf muss nicht jede vorhandene Fähigkeit einsetzen.
3. Seltene Aktionen mit Datei 03 prüfen. Rückgängig/Wiederholen, Speichern/Neuladen, Import/Export und Chatwechsel praktisch mitnehmen. Kompakt-/Vollansicht auf Deutsch und Englisch ansehen.
4. Bei unauffälligem Ergebnis den eingefrorenen Stand noch einmal auf Codefehler und sinnvolle Optimierungsmöglichkeiten prüfen lassen. Änderungen brauchen einen konkreten Nutzen und passende Nachprüfung.
5. Kleinere Korrekturen können in den Release Candidate einfließen. Größere Fehler würden einen weiteren Beta-/Teststand rechtfertigen. Erst nach erfolgreichem Abschluss stabile 2.0 freigeben.

Hilfesuche, vollständiges Zustandslexikon, neue zufällige Figurenprofile, Szenarioziele und ganze Kampfzusammenfassungen sind keine Voraussetzung für diesen RC. Sie bleiben spätere Komfort-/Featurearbeiten.

Die bestehenden 2.228 automatisierten Tests sind die technische Basis. Zusatzprüfungen kontrollieren vorbereitete Zustände, die vier Eröffnungsaktionen und zwei vollständige KI-Durchläufe mit verschiedenen Würfel-Seeds. Gemessene Laufzeiten der direkten Engine-Ausführung enthalten weder Browserdarstellung noch Modellaufrufe. Live-Erzählung und grafische Endkontrolle bleiben manuelle Prüfungen.
