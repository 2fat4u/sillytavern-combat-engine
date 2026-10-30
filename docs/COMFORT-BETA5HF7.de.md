# Hotfix 7 · Aktionsfolge, Verätzt und Wiederholen

## Mehrere Aktionen erzählen

Neben „KI erzählt“ steht **Erzählumfang**. Automatisch verwendet die letzte gespeicherte KI-Serie, sonst den letzten Zug. Alternativ lassen sich letzter Zug, letzte KI-Serie oder letztes Einzelergebnis wählen. Der aufklappbare Bereich **Aktionsfolge** zeigt, was an den Erzähler geht. Angriffe, Fehlschläge, Bewegung, Verstecken, Alarmieren, Behandlung und automatische Zustandsfolgen behalten ihre Reihenfolge und ihre eigene ausführende Figur. Eine unabhängig ablaufende Rettungsfrist wird nicht zum tödlichen Effekt des vorherigen Angriffs.

„KI-Züge bis zum manuellen Zug“ sammelt seine sichtbaren Ereignisse über mehrere Figuren hinweg. Die Sammlung bleibt beim Speichern erhalten. Eine neue tatsächliche Kampfänderung sowie Rückgängig/Wiederholen ersetzt beziehungsweise verwirft den alten Ausschnitt. Eine ausdrücklich gewählte KI-Serie ohne gespeicherte Serie enthält keine alten Ersatzangriffe. Verborgene Identitäten werden beim Sammeln und erneut bei der Übergabe geschützt. Eine Serie ist auf 80 Ereignisse und eine begrenzte Textmenge beschränkt; längere Serien sind als gekürzter Ausschnitt markiert.

Der Erzähler erhält Schadensbeschreibungen relativ zu den maximalen HP des betroffenen Ziels: unter 10 % leicht, ab 10 % spürbar, ab 25 % schwer und ab 50 % verheerend. Null Schaden bleibt ohne HP-Schaden. Das ist eine Formulierungshilfe und keine neue Verletzungsregel. Direkter und Flächenschaden, eigene Wirkungen, Konter, Gelegenheitsangriffe und periodische Schäden sind berücksichtigt. Das Modell soll Zahlen nur auf Nachfrage nennen. Protokoll, Berechnung und Kampfwerte bleiben exakt. Die bisherige Combat-DM-Karte kann weiterverwendet werden; die tatsächliche Wortwahl muss mit dem eingesetzten Modell geprüft werden.

## Verätzt senkt DC · optionale Regel

Unter **Regeln → Heilung, Ressourcen & Effekte** einschalten. Standardmäßig aus, vorgeschlagener Malus **2**, einstellbar. Nur ein aktiver Zustand **Verätzt / Corroding (acid_damage)** senkt die Profil-DC einmal. Erneute Anwendung frischt den Zustand auf, stapelt den Malus aber nicht. Bei Reinigung oder Ablauf endet er; der bearbeitbare Basis-DC bleibt erhalten. Ausgeschaltete Effekte setzen auch den Malus aus.

Die reduzierte Profil-DC gilt bei Angriffen, Kontern, Gelegenheitsangriffen und Proben gegen die Ziel-Profil-DC. Feste DCs und Basis + Attribut bleiben unverändert. Die Berechnung nennt „Verätzt“ getrennt. **Reiner Säureschaden verursacht allein keinen Abwehrmalus**: Ein Fläschchen muss den Zustand ausdrücklich als Trefferwirkung enthalten. Schadensimmunität und Zustandsimmunität bleiben getrennte Einstellungen.

## Wiederholen

Der Knopf neben Rückgängig stellt den zuletzt zurückgenommenen Stand wieder her, einschließlich Würfel, HP, Ressourcen und Bewegung. Er würfelt nicht neu. Mehrere Schritte lassen sich zurücknehmen und wiederholen; bis zu 30 Stände je Richtung werden behalten. Eine neue erfolgreiche Änderung nach Rückgängig verwirft den bisherigen Wiederholen-Zweig. Fehlgeschlagene oder unverändert abgewiesene Aktionen tun das nicht. Alte Zugtokens und bereits verbrauchte Aktionsbelege bleiben gesperrt. Der Verlauf gehört zum jeweiligen Chat. Vollständige Vorschau-Sicherungen enthalten beide Richtungen; ein normaler Kampfexport enthält weiterhin nur den aktuellen Kampf.

## Testen

Die drei Szenen unter examples/beta200beta5hf7 importieren. Sie bereiten eine Aktionsfolge vor, zeigen Verätzt mit ausgeschalteter Regel und eine kleine KI-Serie bis zum manuellen Zug. Die Offline-Vorschau hat keine Modellverbindung. In SillyTavern besonders die gesammelte Erzählung praktisch testen.

40 neue, insgesamt **2.129 automatisierte Tests in 81 Dateien**. Dazu begrenzte deutsche/englische DOM-/VM-Prüfungen der Offline-Vorschau. Kein grafischer Browser- oder Live-Modelltest. Die normalen KI-Entscheidungen bleiben auf Hotfix 6; nur die ausdrücklich aktivierte Säureregel geht in ihre Trefferabschätzung ein. Lokal gebaut, noch nicht auf GitHub veröffentlicht.
