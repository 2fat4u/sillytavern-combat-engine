# Beta 1 · kleiner manueller Test mit Chat und Modell

## Szene laden

Nach Installation der vollständigen Beta-Erweiterung einen kleinen Testchat verwenden und **08-Beta-Manuell-Chat.json als vollständigen Kampf importieren**. Die HTML-Datei ist eine Offline-Bedienvorschau; sie stellt keine Modellverbindung her. Für diesen Test sind 14×10 Felder, drei manuelle Figuren und drei Advanced-Gegner vorbereitet. Reaktionen sind aktiv. Bei den manuellen Figuren wird nachgefragt, beim Advanced-Wächter ist „Wie Figurensteuerung“ automatisch.

Lyra hat Kurzbogen, Feuerpfeil und Jagdmesser sowie 20 Pfeile. Ivo hat Heiltränke und „Heilende Befreiung“: eine Probe, ein Mana, Heilung plus Entfernen von Held. Nadir beginnt mit 18/60 HP und Held; zusätzlich hat er eine eigene Nachher-Reaktion gegen Brennen. Basalt ist gegen physischen Schaden resistent und kann automatisch blocken. Asche ist gegen Feuerschaden und Brennen immun. Nyra widersteht Kälte, ist gegen Frightened immun und kann Gift einsetzen.

## Kurz durchspielen

1. Kampf starten. Mit Lyra den Kurzbogen gegen Basalt verwenden: bei Treffer physische Resistenz und gegebenenfalls Block in der Rechnung, ein Pfeil verbraucht, kurze Rückmeldung unter der Karte und ausführliches Ergebnis im Log.
2. In Ivos Zug „Heilende Befreiung“ auf Nadir verwenden. Bei Erfolg HP erhöhen und Held entfernen; bei Fehlschlag beide Wirkungen auslassen. Der Versuch verbraucht einmal ein Mana und die normale Aktion. Weitere Zustände bleiben erhalten.
3. In einem späteren Zug einen Feuerpfeil auf Asche ausprobieren: ein gültiger Schuss kostet einen Pfeil; bei Treffer verhindern Feuerschadensimmunität und Brennen-Immunität ihre jeweiligen Wirkungen.
4. Gegnerzüge laufen lassen und eine manuelle Reaktion wählen, wenn angeboten. Nadir kann „Flammen abschütteln“ nach einem passenden Angriff verwenden; es entfernt Brennen und erstattet keinen bereits erlittenen Schaden. Verhalten und Verfügbarkeit hängen von Treffer, Ziel und verbleibendem Budget ab.
5. Eine Aktion rückgängig machen, Zustand/Ressourcen vergleichen und den Chat neu laden. Keine doppelte Wirkung, kein zusätzlicher Vorratsverbrauch und keine wiederholte alte Chat-Ausgabe erwarten. Ergebnis und Auswahl sollen bedienbar bleiben.

## Erzählen und aktueller Kontext

Ein Modell in SillyTavern verbinden. Eine tatsächliche Aktion auflösen, danach „Ergebnis erzählen“ beziehungsweise „Narrate result“ anfordern. Das Modell soll die gerade beteiligten Figuren, Erfolg/Fehlschlag, HP/Zustand und Ressourcen sinngemäß korrekt aufgreifen. Die Erzählung darf die verbindlichen Würfe oder Werte nicht erneut verändern.

Nach einem Zugwechsel eine andere Figur handeln lassen und erneut erzählen lassen. Der aktuelle Zug muss Vorrang vor älteren Chatereignissen haben; kein „Kampf hat noch nicht begonnen“. Nach Heilung/Befreiung darf Nadir nicht weiter als gehalten beschrieben werden, sofern keine neue Anwendung erfolgte. Bei optionalen Persona-Hinweisen die Ausgabe im Chat prüfen. Mechanische CombatEngine-Notizen sollen keine fehlende TTS-Stimme verlangen.

Optional unter Oberfläche → KI-Kontext einmal nur die letzte Aktion und einmal mehrere Ereignisse ausprobieren. Der aktuelle verbindliche Zustand bleibt in beiden Fällen enthalten. Gesonderte DM-Zugvorschläge mit JSON bleiben experimentell; ein fehlender JSON-Vorschlag ist nicht dasselbe wie eine fehlerhafte Erzählanbindung.

## Bei Auffälligkeiten

Debug-Aufzeichnung aktivieren und nach der auffälligen Aktion Kampf-JSON sowie Debug-Export sichern. Versionsanzeige, handelnde Figur, ausgeführte Aktion und beobachtete Abweichung reichen als kurze Beschreibung. Keine API-Schlüssel oder sonstigen Zugangsdaten mitschicken. Der vorliegende große Arenakampf wurde ohne Modellverbindung aufgezeichnet und ersetzt diesen praktischen Test nicht.
