# Testpaket 1.9.19 · Bergen, Akrobatik und Zustände

01-Testkampf-1.9.19.json über Kampf importieren laden. Die neue Vorschau Vorschau-Bergen-Zustaende-1.9.19.html enthält dieselbe Szene mit eigenem lokalen Speicher. Es gibt keine Modellverbindung. Der Zustand wird nicht bei jedem Öffnen zurückgesetzt; bei Bedarf JSON erneut importieren.

1. Kampf mit Profilinitiative starten. Kara beginnt mit 6 Bewegung und 4 normalen Aktionen. Fähigkeit Verbündeten bergen, Ziel Downed scout, z. B. I4 wählen. Vorher werden Karas Endfeld und Wegkosten angezeigt. Beide bewegen sich, verbraucht werden die angezeigten Bewegungspunkte, eine Aktion und 2 Mana. Scout bleibt stabilisiert bei 0 HP. Einmal Rückgängig setzt beides zurück.
2. Bei Kara Heilen/Gegenmittel wählen, Ziel Selene. Beruhigung entfernt nur Eingeschüchtert; Fokus nur Abgelenkt; Befreiung Festgehalten. Brennen bleibt dabei erhalten. Jede Behandlung bezahlt ihren Itembestand einmal, auch bei vollen HP. Reinigungswelle entfernt die ausgewählten klassischen und taktischen Zustände in der Fläche und kostet einmal 3 Mana.
3. Selene → Ressourcen & Zustände → Alle Zustände bearbeiten. Klassische und taktische Einträge ein-/ausschalten; Dauer und bei Bedarf Quelle, Zielwaffe, Effektwert oder Fluchtverhalten einstellen. Änderungen übernehmen verbraucht keine Kampfaktion. Nur Brennen ausschalten lässt ihre übrigen Zustände bestehen. Auch außerhalb des Kampfes möglich.
4. Kara Zug beenden. Bei Ivo gibt es eine Akrobatik mit Anwendung Deckung überwinden oder Springen. Für Springen Scout auf D4 belassen und D5 wählen. Deckung überwinden gilt für Bewegung über Deckung im laufenden Zug. Die Anwendungen werden einzeln bezahlt; alte eigene Werte bleiben unabhängig. Unter Fähigkeiten bearbeiten sind beide in einem Abschnitt.
5. Unter Regeln → Bewegung findet sich Verbündete passieren genau einmal. Unter Spielfeld & Deckung steht es nicht mehr.
6. Gefallener Wächter hat nur eine kurze Tot-Markierung. Ziehen/Einsetzen versuchen: bei aktiver automatischer Leichenentfernung erscheint ein normaler Fehler unter dem Brett. Es entstehen weder Position noch Kosten. Bewusstlose und aktive Untote bleiben davon unterscheidbar.

02-Akrobatik.json ist ein Fähigkeitsprofil mit beiden Anwendungen, 03-Gegenmittel.json enthält Mana und Behandlungsvorlagen. Über passende Profilimporte verwenden. Zustandsdateien 04/05 zeigen den gezielten Export einschließlich taktischer Effekte; 05 benötigt im Zielkampf eine eindeutig passende Quelle namens Raider · Gegenüber.

Eigene Schadens-/Heilungswürfel und Zustandswirkungen im DC-Check sind für 1.9.20 geplant. Immunitäten, Sichtweite und Advanced AI folgen separat. Die Szene ersetzt keinen Live-Test in SillyTavern.
