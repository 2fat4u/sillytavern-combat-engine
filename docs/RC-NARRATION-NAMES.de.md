# Erzählung: Testnamen und Koordinaten · RC-Befund

Geprüfter Stand: **2.0.0-beta.6**. Die Grenzwacht-Exporte und das zugehörige Debug-Protokoll passen zum gemeldeten Ablauf. Die folgende Diagnose betrifft die Erzählung, nicht die Freigabe bewusstloser Figuren zum Angreifen.

## Bestätigter Ablauf

Fenn wurde zunächst von Lysann geheilt (0 → 5 HP), später getroffen und vergiftet (5 → 3 HP). Bei seinem eigenen Zug bewegte er sich von G8 nach J7 und traf den Sporenläufer. Dessen Block reduzierte den Schaden auf 1 HP. Anschließend erlitt Fenn 1 Giftschaden (3 → 2 HP). Im exportierten Zustand und den begleitenden Debug-Zuständen ist er handlungsfähig (`condition: fit`).

Der im Test vorgegebene Name **„Fenn · bewusstloses Bergungsziel“** bleibt jedoch auch nach Heilung bestehen und steht mehrfach im Erzählkontext. Das ist ein irreführender Testname. Die beschriebene Bewusstlosigkeit, das Geschleiftwerden und ein unkontrollierter Zufallstreffer folgen nicht aus den aufgezeichneten Ereignissen. Dass der Namenszusatz den Modellfehler begünstigt, ist eine naheliegende Ursache; die interne Modellentscheidung lässt sich aus dem Debug-Protokoll nicht beweisen.

## Koordinate

Der rekonstruierte Zugkontext enthält den Bewegungseintrag mit `G8 → J7`. Die bestehende Stilvorgabe verbietet bereits das Vorlesen von Koordinaten, sofern der Spieler nicht ausdrücklich danach fragt. Der Ausreißer zeigt, dass diese Anweisung allein nicht immer befolgt wird. Der Debug-Ausschnitt meldet abgeschlossene Erzählanfragen, enthält aber keinen geprüften vorbereiteten Modell-Prompt. Die Rekonstruktion belegt die Datenquelle, nicht den vollständigen tatsächlich gesendeten Request oder den gesamten Chatkontext.

## Änderungen in 2.0.0-rc.1

- Dauerhafte Rollennamen für die Testfiguren, etwa **Fenn · Grenzwachtkämpfer** und **Varo · Grenzwachtveteran**. Bewusstlos/tot über Statusfelder erklären, nicht als bleibenden Namensteil. Keine automatische Umbenennung fremder Nutzerfiguren.
- Im Erzählkontext ausdrücklich klarstellen, dass Namenszusätze keine Zustandsinformationen sind. Aufgezeichnete Zustände und Ereigniszeitpunkt haben Vorrang; heutige HP dürfen nicht ungeprüft auf frühere Ereignisse übertragen werden.
- Für erzählerische Bewegungsbeschreibungen eine Form ohne Koordinaten bevorzugen; technische Positionen für Regeln, Bedienung und ausdrücklich angefragte Details erhalten. Auch Bewegungen in Fähigkeits-/Alarmausgängen berücksichtigen.
- Den konkreten Ablauf mit Heilung, späterem eigenen Angriff und periodischem Giftschaden auf Deutsch/Englisch nachprüfen. Eine gewöhnliche aufgezeichnete Bewegung ist kein Beleg für Tragen, Schleifen, Panik oder Kontrollverlust.

Die drei mitgelieferten Ausgangsszenen verwenden die neutralen Namen. Der Erzählkontext enthält die aufgezeichnete Bewegung, den Treffer und den Giftschaden in ihrer Reihenfolge. Die technische Bewegungsposition bleibt im Kampflog verfügbar. Der RC-Test prüft die gelieferten Fakten auf Deutsch und Englisch. Die Modellantwort selbst lässt sich in SillyTavern prüfen.
