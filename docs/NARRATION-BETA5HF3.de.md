# Hotfix 3 · Aktion und automatische Folgeereignisse erzählen

Ein Angriff darf im Erzählkontext erhalten bleiben, wenn beim anschließenden Zugende eine andere Figur an einer abgelaufenen Rettungsfrist stirbt. Das Ergebnis wird als kurze chronologische Folge übergeben: zuerst der Angriff oder Fehlschlag, danach die aufgezeichneten automatischen Ereignisse. Jeder Eintrag behält seine eigene Ursache und betroffene Figur. Der spätere Tod wird dem Angriff nicht als zusätzlicher Treffer oder Kill zugerechnet.

Neue Rettungs-/Abgrundfristen und periodische Schadensereignisse erhalten ausdrückliche Ursachen und eine Verknüpfung zum davor abgeschlossenen Ergebnis. Automatisch abgeschlossene Aktionen werden ebenso berücksichtigt wie ein manuell beendeter Zug. Im ausführlichen Ergebnis erscheinen die Folgeereignisse unter dem primären Ergebnis. Die tatsächlichen Rettungsfristen, HP und KI-Waffenwahl ändern sich nicht.

Drei [Testdateien mit Ablauf](../examples/beta200beta5hf3/README.md) sind enthalten: Treffer und unabhängiger Tod, Fehlschlag und unabhängiger Tod, sowie Angriff mit eigener Blutung und unabhängigem Tod. Die Dateien importieren, die Späherin angreifen lassen und den Zug beenden. Erst dann Ergebnis erzählen. Die tatsächliche Modellerzählung wird in SillyTavern mit einem verbundenen Modell geprüft; die Offline-Vorschau prüft den mechanischen Ablauf und die Ergebnisanzeige.

Beispiel für eine passende Erzählfolge: Die Späherin trifft den Übungsgegner. Unabhängig davon erliegt der zuvor verwundete Begleiter seinen Verletzungen, weil seine Rettungsfrist ohne Stabilisierung abläuft. Bei einem Fehlschlag bleibt der Angriff ein Fehlschlag.

Die Auswahl bleibt auf die letzte passende Aktionsfolge beschränkt. Ein späterer eigener Zug ohne Aktion darf keine ältere Attacke wieder aufleben lassen. Neue Aktionen, Undo, Import, Reset, manuelle Zeitänderungen und Kampfende behalten ihre bisherigen Grenzen. Verborgene Figuren werden nicht durch zusätzliche Folgeereignisse verraten. Alte, nicht ausdrücklich verknüpfte Einträge werden nicht nachträglich geraten. Es wird kein Verzeichnis bereits erzählter Ereignisse und keine vollständige Kampfzusammenfassung eingeführt.

2.028 automatisierte Tests in 78 Dateien bestanden, darunter 24 neue gezielte Prüfungen. Zusätzlich begrenzte Offline-DOM-/VM-Prüfungen in beiden Sprachen einschließlich aller drei Szenen und erneutem Laden. Ein grafischer Browser-/Live-SillyTavern-/Modelltest steht noch aus. Lokal zum Testen gebaut, noch nicht veröffentlicht.
