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


## Bewegungen ab Beta 5 Hotfix 4

Die aktuelle Übergabe der Erweiterung fordert natürliche Bewegungsbeschreibungen. Der Erzähler soll Koordinaten, einzelne Wegschritte und Bewegungspunktzahlen nur bei ausdrücklicher Nachfrage nennen. Das Protokoll behält die genauen Felder. Die vorhandene Combat-DM-Karte kann weiterverwendet werden.

Eine belegte Annäherung kann als Annäherung und ein belegter Rückzug als Rückzug erzählt werden. Aus bloßen Koordinaten darf das Modell keine Deckung, Fluchtabsicht, Geschwindigkeit oder sichere Position erfinden. Ist nur ein Ortswechsel bekannt, reicht beispielsweise „Mira verändert ihre Position.“ Eine abgebrochene Bewegung darf nicht als vollendeter Weg erzählt werden.

Zum Prüfen eine Figur bewegen und Ergebnis erzählen wählen. Im normalen Text sollten keine Felder wie I14 oder D11 vorkommen. Auf die ausdrückliche Frage nach den genauen Feldern dürfen die vorhandenen Koordinaten genannt werden. Ein Vergleich mit dem verwendeten Modell bleibt erforderlich; automatische Prüfungen kontrollieren Übergabe und unveränderte Fakten.


## Zug- und Serienerzählung ab Beta 5 Hotfix 7



Neben „KI erzählt“ steht **Erzählumfang**. Automatisch verwendet die letzte gespeicherte KI-Serie, sonst den letzten Zug. Alternativ lassen sich letzter Zug, letzte KI-Serie oder letztes Einzelergebnis wählen. Der aufklappbare Bereich **Aktionsfolge** zeigt, was an den Erzähler geht. Angriffe, Fehlschläge, Bewegung, Verstecken, Alarmieren, Behandlung und automatische Zustandsfolgen behalten ihre Reihenfolge und ihre eigene ausführende Figur. Eine unabhängig ablaufende Rettungsfrist wird nicht zum tödlichen Effekt des vorherigen Angriffs.

„KI-Züge bis zum manuellen Zug“ sammelt seine sichtbaren Ereignisse über mehrere Figuren hinweg. Die Sammlung bleibt beim Speichern erhalten. Eine neue tatsächliche Kampfänderung sowie Rückgängig/Wiederholen ersetzt beziehungsweise verwirft den alten Ausschnitt. Eine ausdrücklich gewählte KI-Serie ohne gespeicherte Serie enthält keine alten Ersatzangriffe. Verborgene Identitäten werden beim Sammeln und erneut bei der Übergabe geschützt. Eine Serie ist auf 80 Ereignisse und eine begrenzte Textmenge beschränkt; längere Serien sind als gekürzter Ausschnitt markiert.

Der Erzähler erhält Schadensbeschreibungen relativ zu den maximalen HP des betroffenen Ziels: unter 10 % leicht, ab 10 % spürbar, ab 25 % schwer und ab 50 % verheerend. Null Schaden bleibt ohne HP-Schaden. Das ist eine Formulierungshilfe und keine neue Verletzungsregel. Direkter und Flächenschaden, eigene Wirkungen, Konter, Gelegenheitsangriffe und periodische Schäden sind berücksichtigt. Das Modell soll Zahlen nur auf Nachfrage nennen. Protokoll, Berechnung und Kampfwerte bleiben exakt. Die bisherige Combat-DM-Karte kann weiterverwendet werden; die tatsächliche Wortwahl muss mit dem eingesetzten Modell geprüft werden.

## Erzählstil ab Beta 5 Hotfix 8

Todesfälle behalten ihre echte Ursache in den strukturierten Daten. Der normale Erzähltext soll Frist/Countdown weglassen und den Tod nicht zu einem Treffer eines unbeteiligten Angreifers umdeuten. Stabilisierung hält eine bereits bewusstlose Figur am Leben; sie verursacht keine Kampfunfähigkeit und heilt nicht. Kampfhaltungen dürfen mit wechselnden natürlichen Formulierungen in folgende Aktionen eingebunden werden. Ereignisse nur einmal erzählen. Die genaue Formulierung bleibt Aufgabe des Modells; praktisch prüfen. [Hinweise zu Hotfix 8](NARRATION-BETA5HF8.de.md).
