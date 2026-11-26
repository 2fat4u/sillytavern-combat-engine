# Fähigkeitsmeldungen · Prüfung für den Release Candidate

Die Befunde stammen aus **2.0.0-beta.6**, 30. Oktober 2026. In **2.0.0-rc.1** verwenden Seitenleiste, Kontextmenü und Ausführung konkrete Sperrgründe. Eigene DC-Proben melden fehlende Aktionen und zeigen Regelmeldungen in der gewählten Sprache. Die Ergebnisanzeige nennt auch Immunität und unterbrochene Bewegung.

## Bestätigte Befunde

1. **Verstecken: der allgemeine Hinweis verdeckt den eigentlichen Zustand.** In `ability-ui.js` wird `canUseSkill` vor dem Aktionsbudget geprüft. Versteckt + Aktion verbraucht liefert deshalb „Ziel, Bewegung, Reichweite und Zustand prüfen“. Bei einem fehlgeschlagenen Versuch ohne Versteckt und mit verbrauchter Aktion lautet die Meldung dagegen bereits korrekt „Keine passende Aktion übrig“. Versteckt allein sperrt die erneute Anwendung ebenfalls, selbst wenn noch eine Aktion verfügbar wäre. Dafür ist „Bereits versteckt“ die passende Erklärung. Bei mehreren Hindernissen einen verständlichen Hauptgrund und gegebenenfalls den aktiven Zustand ergänzen.
2. **Weitere konkrete Sperrgründe gehen im Sammelhinweis verloren.** Bestätigt für ausgeschaltetes Verstecken, fehlendes Gelände zum Verstecken, betäubte/kampfunfähige Anwender, fehlende Bewegung bei Deckung überwinden, Festgehalten beim Sprint, deaktivierte Gelegenheitsregel oder bereits aktives Sicher lösen, abgeschaltetes Zustandsmodul, lebendes Wiederbelebungsziel sowie gesperrtes Erheben. Springen nennt bei Festgehalten oder deaktiviertem Spielfeld nur ein fehlendes legales Sprungziel. Die vorhandenen Prüfungen sollen den jeweiligen Grund erklären; keine neuen Voraussetzungen hinzufügen.
3. **Die Bedienwege nennen unterschiedliche Gründe oder gar keinen.** `context-actions.js` bündelt fehlende Aktionen und Kampfunfähigkeit, statt sie auseinanderzuhalten. Seitenleiste und eigene DC-Probe mit Profilwirkung nutzen `abilityRestriction`; die Zielauswahl wird zuvor bereits nach `canUseSkill` gefiltert. Dadurch fehlen nicht mehr nutzbare Ziele in der Auswahl und es bleibt oft nur der Sammelhinweis. Eine eigene kostenpflichtige Probe ohne Profilwirkung hat bei verbrauchter Aktion einen deaktivierten Button, aber keinen entsprechenden Erklärungstext. Verbleibende Zusatzaktionen, die keine Fähigkeit erlauben, müssen von vollständig verbrauchten Aktionen unterschieden werden. Auch „Nicht am Zug“ nicht als erschöpftes Budget ausgeben.
4. **Englische Oberfläche, deutsche Laufzeitfehler.** Eine ungültige Unterstützen-Aktion liefert bei `rules.language = 'en'` weiterhin „Fähigkeit hier nicht nutzbar: Ziel, Reichweite, Vorrat oder Bewegung prüfen.“ Die UI übernimmt solche Fehlertexte direkt. Erwartete Fähigkeits-/Ziel-/Budgetfehler im jeweiligen UI-Sprachmodus ausgeben. Bei eigenen Wirkungen ersetzt die englische DC-Prüfung verschiedene Fehler außerdem durch denselben pauschalen Hinweis auf Würfel, Bonus, Zustand, Empfänger und Reichweite; auch dort den konkreten Grund erhalten.
5. **Erfolgreiche Probe ist nicht immer eine angewendete Wirkung.** Die Kurzmeldung aus `results.js` lautet bei `success: true` auch mit `immuneStatus` oder `interrupted` nur „Fähigkeit erfolgreich“. Die ausführlichen Daten unterscheiden diese Fälle bereits. Für den RC die Kurzmeldung bei Bedarf ergänzen, beispielsweise „Probe gelungen · Ziel immun“ oder einen Hinweis auf die unterbrochene Bewegung. Eine erfolgreiche Probe nicht in einen Fehlschlag umdeuten. Den erfolgreichen Teil einer unterbrochenen Aktion erhalten und die tatsächlich nicht ausgeführte Wirkung benennen.

## Bereits brauchbare Rückmeldungen

- Fähigkeiten global ausgeschaltet; fehlende konfigurierte Voraussetzung; zu wenig Vorrat.
- Deckung überwinden bereits versucht, inklusive bestehender manueller Freigabe.
- Sprint bereits aktiv; mehrere Alarmgründe wie Cooldown und fehlende Empfänger.
- Bergen nennt zahlreiche konkrete Koordinaten-, Belegungs-, Gelände- und Wegprobleme.
- Eigene berechnete Wirkungen unterscheiden bereits entfernte, vorher nicht vorhandene und durch Immunität verhinderte Zustände in der ausführlicheren Rückmeldung.

Diese Fälle beibehalten und bei der Vereinheitlichung nicht wieder auf einen Sammeltext reduzieren.

## Gewünschte Beschriftungen

| Tatsächlicher Grund | Deutsch | Englisch |
|---|---|---|
| Aktionsbudget leer | Keine Aktionen mehr verfügbar. | No actions remaining. |
| Nur unpassende Zusatzaktionen übrig | Keine passende Aktion für diese Fähigkeit übrig. | No matching action remaining for this ability. |
| Eigene Figur ist nicht aktiv | Diese Figur ist nicht am Zug. | It is not this participant’s turn. |
| Versteckt aktiv | Bereits versteckt. | Already hidden. |
| Sicher lösen aktiv | Sicher lösen ist in diesem Zug bereits aktiv. | Disengage is already active this turn. |
| Regel fehlt | Verstecken / Gelegenheitsangriffe sind ausgeschaltet. | Hiding / opportunity attacks are disabled. |
| Gelände fehlt | Zum Verstecken ist nahe Deckung oder eine Mauer erforderlich. | Hiding requires nearby cover or a wall. |
| Ziel fehlt | Zielfigur auswählen / kein passendes sichtbares Ziel. | Choose a target / no suitable visible target. |
| Entfernung oder Sicht | Außer Reichweite / keine Sichtlinie. | Out of range / no line of sight. |

Einheitliche, schreibgeschützte Begründungen in Seitenleiste, Kontextmenü und eigener DC-Probe verwenden. Die Erklärung muss zu den tatsächlichen Freigabeprüfungen passen und nur sichtbare Informationen verwenden. Keine Probe ausführen, um ihren Sperrgrund herauszufinden. Sonderfälle wie manuell aufgehobenes Aktionslimit, nachträgliches Wiederbeleben und kostenlose Erzählproben berücksichtigen.

## Umfang der Prüfung und Nachprüfung beim RC

Die Diagnose prüfte alle **21 Fähigkeitsarten in beiden Sprachen** (42 Ausgangsprüfungen), **26 Sperrsituationen in beiden Sprachen** (52 Prüfungen), eigene kostenpflichtige Proben ohne Restaktion, Kurzmeldungen und Laufzeitfehler. Die Prüfungen änderten den untersuchten Kampfzustand nicht. Ergebnisdaten: lokale Arbeitsdatei `work/beta6-ability-message-review.json` außerhalb des veröffentlichten Erweiterungspakets. Dies war eine Logik-/Textprüfung, kein grafischer oder Modelltest.

Beim Umsetzen gezielte Nachprüfungen ergänzen: Verstecken erfolgreich/fehlgeschlagen; keine Aktionen gegenüber unpassenden Zusatzaktionen; betäubt gegenüber nicht am Zug; Wiederholungen; Regel aus; fehlende Voraussetzung/Vorrat; Ziel, Reichweite, Sicht und Bewegung. Alle drei Bedienwege auf Deutsch/Englisch und in beiden Ansichten vergleichen. Kosten und Zustand vor einer abgewiesenen Aktion müssen unverändert bleiben; erlaubte Aktionen dürfen durch die Erklärung nicht gesperrt werden.
