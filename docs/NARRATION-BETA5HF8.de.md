# Hotfix 8 · Schusslinien und Erzählstil

## Gegner in der Schusslinie

Mit eingeschalteter Regel „Friendly Fire – Schüsse durch Figuren“ erhält der nächstgelegene sichtbare Gegner zwischen Schütze und Ziel einen hervorgehobenen Hinweis **„Kann treffen: …“ / „Might hit: …“**. Die bestehende neutrale Liste zeigt weiterhin Zwischenfiguren und Schusserschwernis. Verbündete behalten die Friendly-Fire-Warnung. Ein Gegner wird nicht als Friendly Fire bezeichnet. Der zusätzliche Hinweis bleibt auch im Kompaktmodus sichtbar.

Das ist eine Anzeigeänderung. Der Angriff bleibt unverändert: Scheitert der Treffer gegen das gewünschte Ziel, kann die nächste Zwischenfigur mit demselben Wurf getroffen werden. Der Hinweis verspricht keinen Treffer und betrifft nicht automatisch alle Figuren dahinter. Die separate Regel für Flächen-Friendly-Fire bleibt erhalten.

## Natürlicher erzählen

Automatisch eingetretene Todesfälle bleiben mit ihrer Ursache in den Daten verknüpft. Die Erzählfakten nennen den Tod ohne den technischen Zusatz zur abgelaufenen Rettungsfrist. Der Erzähler soll Countdown, Rundenfrist und fehlende Stabilisierung im normalen Fließtext weglassen. Bei ausdrücklichen Regelfragen darf er die Ursache erklären. Ein unabhängig eingetretener Tod darf weiterhin nicht dem gerade erzählten Angriff zugeschrieben werden. Das ausführliche Protokoll behält die genaue Ursache.

Für Stabilisierung steht in den Erzählfakten ausdrücklich: Die betroffene Figur **bleibt bewusstlos**, es wurden keine HP geheilt. Die Stabilisierung verursacht keine Bewusstlosigkeit und keine Kampfunfähigkeit. Erst eine tatsächlich berechnete Heilung kann die Figur wieder aufrichten.

Die KI erhält mehr Spielraum für lebendige, kurze Formulierungen: wechselnde Verben und Satzanfänge, Kampfhaltungen möglichst in die folgende Aktion einweben, statt wiederholt „takes a defensive/offensive stance“ anzuhängen. Jede aufgeführte Handlung soll einmal erzählt werden. Das erlaubt keine erfundenen Angriffe, Bewegungen, Verletzungen oder Ergebnisse. Die konkreten Worte wählt das Sprachmodell; die numerischen Kampfregeln und KI-Entscheidungen ändern sich nicht. Deutsche und englische Übergabe sind berücksichtigt. Die Combat-DM-Karte muss dafür nicht ersetzt werden.

## Alarmieren als Spieler

Die echte Alarmaktion ist bisher an Advanced AI und deren Alarmkonfiguration gebunden. Sie ist keine auswählbare Spielerfähigkeit. Eine eigene erzählerische Fähigkeit kann einen Warnruf darstellen, überträgt aber keine beobachteten Gegnerpositionen an die KI-Gedächtnisse. Eine mechanische Spieleraktion wäre eine gesonderte Erweiterung und wurde hier nicht eingeführt.

## Prüfen

Die Beispielszene unter examples/beta200beta5hf8 importieren, den Fernangriff gegen „Ziel hinter der Wache“ auswählen und die Warnung für die „Wache in der Schusslinie“ prüfen. Ein neuer Vorschau-Stand beginnt mit dieser Szene; gespeicherte Kämpfe bleiben erhalten.

16 neue, insgesamt **2.145 automatisierte Tests in 82 Dateien** und begrenzte deutsch/englische DOM-/VM-Prüfungen. Kein grafischer Browser- oder Live-Modelltest. Sprachliche Qualität und die tatsächliche Vermeidung von Wiederholungen bitte mit dem verwendeten Modell ausprobieren. Lokal gebaut, noch nicht auf GitHub veröffentlicht.
