# Komfort-Testpatch · 2.0.0-beta.3

Die Erweiterung einmal aktualisieren und SillyTavern neu laden. Der Patch enthält alle vorherigen Hotfixes. Nur eine Kopie der Erweiterung aktiv lassen. Vor dem Import der Testszene den eigenen Kampf vollständig exportieren oder einen eigenen Testchat verwenden.

## Kleine Testszene

[01-Komfort-Test-2.0.0-beta.3.json](../examples/beta200beta3/01-Komfort-Test-2.0.0-beta.3.json) als vollständigen Kampf importieren und starten. Vier Figuren stehen auf 10 × 8 Feldern. Alle sind manuell steuerbar. Die Szene enthält keine Daten aus deinen eigenen Kämpfen.

1. Bei Mira **Ressourcen & Zustände** öffnen. Die einzelnen Einträge auf- und zuklappen; Name, Menge und Kosten ändern. Das Fenster bleibt offen. Beim Umschalten einer Verbrauchsquelle sollen Scrollposition und bereits eingegebene Zustände erhalten bleiben. Änderungen erst mit **Übernehmen** speichern; Abbrechen verwirft sie.
2. **Kleine Heiltränke** ist der einzige gemeinsame Vorrat (6 Stück). **Heiltrank trinken** und **Heiltrank werfen** verwenden beide diesen Vorrat. Erst trinken, dann Nadir mit dem Wurf behandeln: 6 → 5 → 4. Die verworfenen eigenen Profilmengen werden nicht als zusätzliche Tränke angezeigt. **Tranktechnik** unter Fähigkeiten verwendet den Wurf ebenfalls als Kostenquelle und soll denselben Vorrat einmal senken.
3. **Nur andere Figuren** beim Wurf und bei **Funkenstoß**: Die eigene Figur fehlt in der Zielwahl. Nadir oder der Gegner bleiben abhängig von Reichweite, Sicht und Seiteneinstellung mögliche Ziele. Vorlagen, die nur auf Gegner oder Verbündete wirken, behalten ihre festen Zielregeln; die neue Auswahl gilt für frei konfigurierte Wirkungen.
4. **Meuchelstich** benötigt **Versteckt**. Ohne Verstecken soll die Fähigkeit gesperrt sein und nichts kosten. **Verstecken** einsetzen und dann den Stich auf die Übungspuppe ausführen. Die Voraussetzung gibt keinen weiteren Bonus; normale Aufdeckregeln gelten. **Blutraserei** lässt sich erst einsetzen, nachdem bei Mira unter Zuständen **Blutend** gesetzt wurde. Der Zustand selbst wird durch das Prüfen nicht entfernt.
5. **Tranktechnik** gelingt ohne W20-Erfolgsprobe automatisch, solange das Ziel legal ist. Bei **Funkenstoß** ist die Probe eingeschaltet. Im Editor die Probe ausschalten: DC-Felder werden grau, ihre Werte bleiben beim erneuten Einschalten erhalten. Schadens-/Heilwürfel rollen weiterhin unabhängig davon.
6. **Akrobatik** erklärt Sprungweite beziehungsweise Deckung überwinden. **Schubsen** nennt die Zielreichweite; der eigentliche Schub bleibt ein Feld. Unter Treffereffekten ist **Schaden hinzufügen** als neuer Entwurf gekennzeichnet. Erst **Hinzufügen** erzeugt einen aktiven Eintrag.
7. Optional: Nadir ist festgehalten und besitzt **Befreiung bei Treffer** als Nachher-Reaktion mit der Voraussetzung **Festgehalten**. Die Übungspuppe kann ihn mit **Testbolzen** angreifen. Nadir die Reaktion manuell wählen lassen: Bei legaler Ausführung wird Held entfernt und eine Ladung bezahlt. Ohne Held wird diese Reaktion nicht angeboten. Nachher-Voraussetzungen müssen beim Angebot und bei der Ausführung vorliegen; sie werden nicht für einen bloß erwarteten künftigen Zustand angeboten.

**Nur andere** bedeutet alle anderen Teilnehmer, nicht nur Gegner. Seiteneinschränkungen von Heilmitteln gelten zusätzlich. Bei Flächenheilung wird der Anwender bei dieser Einstellung auch aus den tatsächlichen Empfängern ausgeschlossen. Aufladeitems bleiben auf den eigenen Vorrat beschränkt.

## Gemeinsame Vorräte und alte Dateien

Die Kostenquelle kann direkt ein Vorrat sein oder ein Heil-/Verbrauchsprofil, das auf einen gemeinsamen Vorrat verweist. Bezahlt wird der eingestellte Preis des gerade verwendeten Profils genau einmal; der Preis der verknüpften Trank-Anwendung wird nicht zusätzlich addiert. Ohne Verbrauch bleibt ohne Verbrauch. Ungenutzte eigene Mengen verknüpfter Profile werden erhalten und beim Wechsel zurück zu eigenem Bestand wieder sichtbar. Bestehende Exportdateien erhalten keine neue Voraussetzung und behalten ihre bisherige Zielauswahl.

Die KI-Kampfgewichte sind unverändert. 1.754 automatisierte Tests in 66 Dateien; begrenzte DOM-/VM-Prüfungen ersetzen keinen grafischen Live-Test in SillyTavern.
