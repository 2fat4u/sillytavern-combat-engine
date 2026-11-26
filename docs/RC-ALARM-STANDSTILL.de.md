# RC-Korrektur: Advanced-Alarm blockiert die KI-Serie

Status am 31. Oktober 2026: **lokal korrigiert und getestet, noch nicht veröffentlicht**. Der veröffentlichte Stand 2.0.0-beta.6 enthält den Fehler noch.

## Ursache und Verhalten

Im gemeldeten Grenzwacht-Kampf bleibt Nadir in Runde 21 am Zug. Das Debug-Protokoll zeigt wiederholte Abbrüche mit „Keine frische eigene Beobachtung für den Alarm.“ Der vollständige Export reproduziert denselben Fehler: `canAlarm` liefert `true`, `alarmReport` jedoch `null`; die Advanced-Planung wählt deshalb erneut die unmögliche Alarmaktion.

Die ältere automatische Advanced-Warnung kann auch Basic-/manuelle Empfänger mobilisieren. Diese Empfänger wurden in der Freigabeprüfung bereits als ausreichend betrachtet, obwohl die weiterzugebende neue Beobachtung fehlte oder schon angekündigt war. Die strengere Ausführung verweigerte den Alarm. Jeder weitere Start traf dieselbe Entscheidung, ohne den Zug fortzusetzen. Es handelte sich weder um Kampfende noch um eine ausstehende Reaktionsentscheidung.

## Änderung

Die Freigabe der älteren Advanced-Warnung verlangt jetzt zuerst einen tatsächlichen gültigen Alarmbericht. Erst danach werden Budget, Vorrat und Empfänger geprüft. Ohne Bericht plant die KI eine andere erlaubte Handlung oder beendet ihren Zug. Keine Fehler pauschal verschlucken, keinen Zug künstlich überspringen und keine Alarmkosten für eine abgewiesene Aktion erheben.

Die ausdrücklich zugewiesene Fähigkeit **Alarmieren / Alert** bleibt unabhängig davon erhalten. Ihre manuelle Sammelpunkt-Funktion braucht weiterhin keinen Gegnerbericht; vorhandene Auto-Nutzungsregeln, Cooldowns und Kosten bleiben unverändert.

## Nachprüfung

- 13 neue Regressionstests: bereits weitergemeldete, fehlende, veraltete, geklärte und inaktive Beobachtungen; Alarm bereits in dieser Runde; Basic-/manuelle/DM-Empfänger; Kostenfreiheit abgewiesener Aktionen; gültige bezahlte Warnung; manuelle Alert-Fähigkeit; synchrone/asynchrone KI und Fortsetzung über den Controller.
- Gesamte Suite: **2.241 Tests in 86 Dateien bestanden**, keine Fehler oder übersprungenen Tests.
- Eingesandter Kampf: Nadir wechselt mit dem korrigierten Code zu einer gültigen Zugbeendigung; anschließend sind Rauk und die folgenden Figuren wieder an der Reihe. Eine KI-Serie aus dem unveränderten exportierten Ausgangsstand beendet 24 weitere Figurenzüge und erreicht Runde 24 ohne Ausführungsfehler.
- Für den unveränderten veröffentlichten Beta-6-Code wurde zusätzlich eine lokale Spielstandkopie geprüft, in der ausschließlich Nadirs automatischer Advanced-Alarm deaktiviert ist. Auch diese Variante durchläuft 24 weitere Figurenzüge. Die Originaldatei bleibt unverändert. Die Zwischenlösung enthält keine vorab ausgeführten Züge und ändert keine HP, Vorräte oder Positionen.

Die persönlichen Spielstände und Debug-Protokolle werden nicht Teil des Repositorys; öffentliche Regressionstests verwenden ein kleines künstliches Szenario. Die Nachprüfung war eine Engine-/Controller-Prüfung, kein neuer grafischer oder Modelltest.
