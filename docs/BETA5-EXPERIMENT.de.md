# Beta 5: Versteckt und Gelegenheitsangriffe testen

Die optionale Regel **Gelegenheitsangriffe · experimentell** ist für normale neue Kämpfe aus. Unter Regeln einschalten; Reaktionen und Spielfeld müssen ebenfalls aktiv sein. Die beigefügte [Testszene](../examples/beta200beta5/01-Gelegenheitsangriffe-Test.json) aktiviert sie ausdrücklich. [Kurzer Ablauf](../examples/beta200beta5/README.md).

**Versteckt** lässt sich unter Ressourcen & Zustände setzen, mit Dauer in eigenen Zügen, oder dort aufheben. Aktives Verstecken, Platzierung, Kampffähigkeit und gegebenenfalls Gelände werden geprüft. Vorbereitung vor dem Start bleibt erhalten. Die manuelle Korrektur kostet keine Aktion; die Verstecken-Fähigkeit behält ihre Probe und Kosten. Die Spielleitungsverwaltung dient weiterhin zum Bearbeiten verborgener Gegner.

Freiwilliges Verlassen gegnerischer Nahkampfreichweite wird entlang des Weges geprüft. Der Gegner braucht Sicht, eine benutzbare Nahkampfwaffe und eine bezahlbare Reaktion. Bei normaler/zusätzlicher Aktionsquelle muss diese zuvor reserviert sein. Der Angriff kostet eine Reaktion und den eingestellten Waffenvorrat, auch beim Verfehlen. Pro Bewegungsauftrag reagiert derselbe Gegner höchstens einmal. Ein weiterer Auftrag kann weitere vorhandene Reaktionen auslösen.

Vor einer gefährdeten manuellen Bewegung erscheint eine Entscheidung: weiterbewegen, verfügbares **Sicher lösen / Disengage** einsetzen oder abbrechen. Die Fähigkeit ist selbstbezogen, ohne Probe und kostet eine normale oder passende Zusatzaktion sowie ihren konfigurierten Vorrat. Sie schützt bis zum eigenen Zugende. Nach einer verbrauchten Aktion ist sie nur mit weiteren passenden Aktionen nutzbar. Verbleibende Bewegung funktioniert danach auch ohne aufgeteilte Bewegung.

Sprünge und Trägerbewegung beim Bergen sind freiwillige Bewegung. Ein fehlgeschlagener Fähigkeitswurf löst keinen Gelegenheitsangriff aus. Sicher lösen wird jedoch vorher bezahlt, falls im Fenster ausgewählt. Für diese Kombination müssen beide Aktionen und Vorräte reichen. Das geschobene/getragene Ziel, Einsetzen und Spielleiterkorrekturen lösen selbst keine Angriffe aus.

Der Angriff wird vor dem auslösenden Schritt berechnet. Bei Kampfunfähigkeit, Betäubung, Festhalten oder zu wenig verbleibender Bewegung hält der Weg an. Wenn dies beim Durchqueren von Deckung oder einer liegenden Figur geschieht, gilt das letzte erlaubte Haltefeld; durchquerte Bewegung bleibt bezahlt. Das gewählte Endfeld wird nicht nachträglich angesteuert.

Aktive Schilde, Resistenzen und Immunitäten gelten. Im ersten experimentellen Umfang gibt es innerhalb des Gelegenheitsangriffs keine neuen Schutz-/Konterfenster und keine Gegenkonter-Ketten. Abbrechen verwirft den gesamten noch nicht abgeschlossenen Bewegungsauftrag einschließlich bereits vorbereiteter Reaktionen. Rückgängig stellt den vorherigen Zustand wieder her.

Die KI berücksichtigt nur beobachtbare Gefahren und die Kosten des sicheren Lösens. Gewichtung und Verhalten sollten mit kleinen manuellen Kämpfen weiter erprobt werden. Im Protokoll, im kurzen Ergebnis und beim Erzähler müssen der tatsächlich erreichte Ort und entstandener Schaden stehen. Verlässt ein Angreifer später die Sicht, bleiben bekannte Schadensfakten sichtbar, seine Identität wird ausgeblendet.

Praktisch prüfen: beide Reaktionssteuerungen, mehrere Gegner, erschöpfte Reaktionen, Sprung/Bergen, KO und Gelände, Abbrechen, Chatwechsel, Rückgängig und erneutes Laden. Die automatischen Tests und begrenzten DOM-/VM-Prüfungen ersetzen keinen grafischen SillyTavern-/Modelltest.


## Präzisere Warnung ab Hotfix 2

Ein gewähltes Zielfeld kann über Zwischenfelder erreicht werden. Auch wenn Start und Ziel jeweils zwei Felder vom Gegner entfernt sind, kann der berechnete Weg ein direktes Nachbarfeld durchqueren. Die Warnung nennt jetzt den Gegner, dessen Feld und den genauen auslösenden Schritt, bevor Kosten/Bewegung endgültig übernommen werden. Direkte Nachbarschaft umfasst diagonale Felder; zwei Felder Abstand entlang des gesamten Weges lösen keinen Gelegenheitsangriff aus. Verbündete greifen einander nicht an. Nach ausgeführtem Angriff stehen die auslösenden Felder auch im Protokoll; neue Debug-Exporte erfassen die Warnungsdaten bei Entscheidung oder Abbruch.

Bewusstlos ist mit einem roten ! markiert, stabilisiert mit einem blauen ✚. Textbeschriftungen und Rettungsregeln bleiben erhalten. Ein [kleiner Test mit Zwischenfeld und beiden Zuständen](../examples/beta200beta5hf2/README.md) liegt bei.
