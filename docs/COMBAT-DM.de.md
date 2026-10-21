# Combat DM 1.4.0

Die Karte erzählt ein feststehendes Ergebnis oder liefert auf ausdrückliche Anforderung einen einzelnen DM-Aktionsvorschlag. Sie verwendet die Kampfsprache der Erweiterung. Würfel und Kampfwerte werden weiterhin von Tavern Tactics berechnet.

## Verwenden

Die [Charakterkarte](../examples/Combat-DM-1.4.0.json) in SillyTavern als Charakter importieren und als Sprecher verwenden. Für eine bestehende eigene Erzählerkarte gibt es die [Textdefinition](../examples/Combat-DM-1.4.0-Prompt.txt). Die alte Definition ersetzen, statt beide Definitionen anzuhängen. Die fertige Karte enthält bereits Main Prompt und Post-History Instructions; die Textdefinition nicht zusätzlich einfügen.

Der vorhandene Kampf bleibt im selben SillyTavern-Chat. Eine Aktion ausführen und dann „Ergebnis erzählen / Narrate result“ wählen. Vor einem Versionswechsel den eigenen Kampf exportieren. Diese Karte enthält keinen festen Figurenkader und keine vorgegebene Anfangsszene.

## Was sich ändert

Die Karte unterscheidet die Figur des erzählten Ergebnisses von der aktuell am Zug befindlichen Figur. Sie erzählt einen kurzen Absatz über dieses Ergebnis. Frühere Runden sind Hintergrund. Ein Fehlschlag bleibt ein Fehlschlag; der Erzählwunsch einer Fähigkeit bestätigt keine zusätzlichen Wirkungen. Kritische Fehlschläge bekommen keine selbst erfundenen Schadensfolgen. Bewusstlos oder stabilisiert bedeutet nicht tot.

Ab Erweiterung **2.0.0-beta.2-hotfix.4** enthält die Übergabe beim Erzählen ein eigenes Feld `NARRATION TARGET` mit Ereignis-ID, ursprünglicher Runde, Zug, ausführender Figur, Ziel und Ergebnistexte. Statt zusätzlich mehrere frühere Kampflog-Einträge einzuspeisen, werden nur dieses Ergebnis und unmittelbar folgende zugehörige Effekte mitgegeben. Spätere Gift-/Feuerticks aus anderen Zügen gehören nicht zu dieser Aktion. Der aktuelle Figurenstand bleibt verfügbar. Aktuelle HP können bereits spätere Änderungen enthalten.

Die Karte funktioniert auch mit der bisherigen Übergabe ohne dieses Feld: Sie wählt dann die letzte eindeutig aufgelöste Aktion aus „Recent authoritative events“. Dafür hilft bei älteren Erweiterungen zum Vergleich die Einstellung Oberfläche / Interface → Kampfverlauf: Anzahl Ereignisse / Combat history: event count → **1**. Das begrenzt den zusätzlichen Kampflog-Kontext, nicht den gesamten SillyTavern-Chat. Hotfix.4 verwendet beim Ergebnis-Erzählen den gezielten Ausschnitt unabhängig von dieser Einstellung; andere Antwortarten behalten die eingestellte Ereignisanzahl.

## Praktisch prüfen

1. Eine erfolgreiche Aktion auflösen und erzählen lassen. Stimmen ausführende Figur, Ziel und Wirkung?
2. Danach eine andere Aktion absichtlich scheitern lassen. Der DM soll diesen Fehlschlag beschreiben und den vorherigen Treffer nicht wiederholen.
3. Den Zug weitergeben und das Ergebnis erneut erzählen lassen. Die Erzählung muss bei der ursprünglichen Figur bleiben.
4. Einen rein erzählerischen Fähigkeitswunsch mit nicht berechneter Zusatzwirkung verwenden. Es dürfen keine zusätzlichen HP- oder Zustandsänderungen als feststehende Folge hinzuerfunden werden.
5. Eine Aktion zurücknehmen. Beim erneuten Erzählen darf das widerrufene Ergebnis nicht als ausgeführt erscheinen.

Unter „KI-Kontext prüfen“ lässt sich nach einem Aufruf kontrollieren, ob der aktuelle Kontext und das gezielt markierte Ergebnis tatsächlich in der vorbereiteten Anfrage enthalten waren. Diese Diagnose prüft die Datenübergabe, nicht die inhaltliche Richtigkeit der Modellantwort.

Andere globale Prompts, Lorebooks oder Zusammenfassungen können weitere Erzählvorgaben enthalten. Diese Änderung lässt sie bestehen. Die automatisierten Prüfungen kontrollieren Auswahl, Übergabe, Datenschutz und unveränderte Kampfwerte. Ein Vergleich mit dem tatsächlich verwendeten Modell bleibt nötig; fehlerfreie Modellantworten sind damit nicht garantiert.
