# Alarmieren testen / Alert examples

## Deutsch

Eine Datei als vollständigen Kampf importieren. Die Kämpfe laufen bereits; nicht neu starten. [Ausführliche Anleitung](../../docs/ALERT-BETA5HF9.de.md).

1. **Manueller Sammelruf:** Nadir unter Weitere Aktionen → Fähigkeit → Alarmieren auswählen und ausführen lassen. Eine Aktion und eine Hornladung werden verbraucht. Nach Zugende dem Basic-Späher einen KI-Zug geben. Mira erhält bei ihrem manuellen Zug einen Hinweis; sie bewegt sich nicht automatisch. Auch nach Nadirs späterer Bewegung bleibt der ursprüngliche Sammelpunkt stehen.
2. **Wolfsrudel:** KI-Züge bis zum manuellen Zug ausführen. Der Leitwolf ruft einmal, weitere Wölfe kommen in ihren Zügen und kämpfen nach eigener Entdeckung. Verborgene Wölfe bleiben bis zur Sichtung unbekannt. Für einen weiteren Durchlauf den Zug des Reisenden beenden und erneut KI-Züge ausführen. Im Protokoll auf wiederholte Rufe achten.
3. **Advanced:** Die zugewiesene Alarmfähigkeit kostet eine Rufladung. Der alte Alarmvorrat bleibt unverändert; die alte Konfiguration mit 99 Kosten wird für diese Fähigkeit nicht benutzt. Die Sucherin erhält einen Positionshinweis ohne zusätzliche Sicht. Die KI-Freigabe der Fähigkeit und „Automatisch alarmieren“ steuern die automatische Auswahl.
4. **Kein Empfänger:** Der Verbündete ist bereits im Kampf. Alarmieren ist nicht ausführbar; Hornladungen bleiben erhalten.

Cooldown: standardmäßig drei Runden; der Sammelpunkt gilt sechs Runden. Bereits verständigte Gruppen verhindern Folgerufe auch nach dem Cooldown, solange Hilfe noch unterwegs oder nahe beim Rufenden ist. Radius, Cooldown und Gültigkeit lassen sich im Fähigkeitseditor ändern. Rückgängig/Wiederholen und Export/Import können ebenfalls geprüft werden.

## English

Import a JSON file as a complete combat; each encounter is already running. Scene 01 demonstrates a manual caller, Basic reinforcement and a manual recipient who keeps control. Scene 02 exercises a Basic wolf pack and suppression of repeated howls. Scene 03 uses an assigned Advanced Alert ability and its own stock costs instead of the legacy configuration. Scene 04 has no useful recipients and must spend nothing.

The defaults are a six-cell radius, three-round shared cooldown and six-round fixed rally point. Responders use normal movement/actions on their own turns. This offline preview has no model connection. Use Interface → Language to switch languages. Existing saved preview battles are retained; explicitly import a scene when needed.
