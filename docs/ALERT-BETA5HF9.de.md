# Hotfix 9 · Alarmieren als Fähigkeit

## Einrichten

Unter **Fähigkeiten → + Alarmieren / + Alert** hinzufügen. Name und optionaler Vorrat lassen sich wie bei anderen Fähigkeiten einstellen. Vorgaben:

- Alarmradius: **6 Felder**.
- Cooldown: **3 Runden**, mit der verständigten Gruppe geteilt.
- Sammelpunkt: **6 Runden** gültig; Dauer und Cooldown sind einstellbar.
- Keine W20-Probe beim normalen Einsatz. Eine Aktion; optional einmalige Vorratskosten.
- Ziel ist immer die eigene Figur. Es gibt kein zusätzlich auszuwählendes Wirkungsziel.

Der Ruf setzt den aktuellen Standort als **festen Sammelpunkt**. Eine spätere Bewegung des Rufenden verschiebt ihn nicht. Empfänger werden nicht teleportiert; sie erhalten keine zusätzliche Aktion, Bewegung oder Sicht. Eine eigene DC-Probe kann die zugewiesene Fähigkeit weiterhin als Wirkung verwenden: Bei Fehlschlag gehen ihre normalen Versuchskosten ab, es wird aber niemand verständigt.

## Wer kommt?

Geeignete Empfänger sind kampffähige Verbündete im Radius, die noch helfen können und einen legalen Weg zum Rufpunkt haben. Bereits direkt daneben stehende, geflohene, nicht aufgestellte, betäubte, festgehaltene oder bereits kämpfende Figuren werden nicht extra gerufen. Ein aktiver älterer Ruf verhindert erneutes Verständigen. Geschützte Reviere bleiben gültig.

**Basic AI:** „KI darf selbstständig alarmieren“ einschalten. Sie ruft bei einem sichtbaren Gegner, sofern noch sinnvolle Unterstützung verfügbar ist und nicht bereits ein naher Verbündeter kämpft. Empfänger nähern sich in ihren eigenen Zügen mit normalen Bewegungspunkten. Der Weg wird schrittweise überprüft: Ein entdeckter Gegner kann die Reaktion in normalen Kampf übergehen lassen; dafür steht nur das wirkliche verbleibende Aktionsbudget bereit. Gelegenheitsangriffe und Zustände gelten weiter. Selbstheilung kann zuerst erfolgen, anschließend wird verbleibende Bewegung für den Ruf genutzt. Nach Ankunft wartet die Figur am Sammelpunkt, bis ein Gegner entdeckt wird oder der Ruf abläuft.

Ist die Sichtweitenregel ausgeschaltet, gelten Gegner überall als bekannt. Für diese Sammelfunktion gelten dann nahe Gegner innerhalb von drei Feldern mit Sichtlinie als unmittelbare Kampfbindung. Fern bekannte Gegner verhindern einen manuellen Sammelruf nicht. Es wird dadurch keine zusätzliche Sicht gewährt.

**Manuelle Figuren:** Können den Ruf selbst einsetzen und als Empfänger einen Hinweis mit Rufendem und Sammelpunkt sehen. Ihre Bewegung entscheidet weiterhin der Spieler. Eine gerade laufende eigene Aktion wird nicht unterbrochen.

**Advanced AI:** Die zusätzliche automatische Warnfunktion steht unter **Figur bearbeiten → Steuerung & KI → Advanced AI · Bewegung, Revier & Alarm**. Ohne Alarmieren-Fähigkeit werden dort ihre bisherigen Radius-/Kostenwerte eingestellt. Die Fähigkeit ist die tatsächliche Rufaktion, wenn sie zugewiesen wurde. **Advanced → Automatisch alarmieren** und die KI-Freigabe des Fähigkeitsprofils steuern die selbstständige Nutzung. Mit einer zugewiesenen Alarmfähigkeit verwendet die KI deren Radius, Vorrat und Cooldown. Ist sie nicht für KI freigegeben, gibt es keinen Rückfall auf einen kostenlosen alten Alarm. Bekannte Gefahren können als beobachtete Positionshinweise weitergegeben werden; das ersetzt keine eigene Sicht. Ohne neue Fähigkeit funktionieren die bisherigen Advanced-Alarme mit ihren bisherigen Kosten und der bisherigen Warnlogik weiter. Sie können nun ebenfalls Basic-/manuelle Empfänger rufen.

## Wiederholte Rufe verhindern

Der Cooldown wird bei Rufendem und Empfängern vermerkt. Wer schon verständigt wurde, stößt keinen Folgeruf aus. Auch nach Ablauf des Cooldowns ist derselbe Ruf gesperrt, solange Hilfe noch unterwegs oder nahe beim Rufenden angekommen ist. Ein weiterer sichtbarer Gegner umgeht diese Sperre nicht. Ein abgelaufener, nicht mehr hilfreicher Ruf blockiert spätere neue Unterstützung nicht dauerhaft.

Ohne geeignete Empfänger ist die Fähigkeit nicht ausführbar und verbraucht nichts. Die Erklärung im Aktionsbereich unterscheidet fehlende Empfänger, aktiven Cooldown und bereits verständigte Verstärkung. Ein hörbarer Ruf eines sichtbaren Gegners kann erzählt werden, ohne verborgene Rudelmitglieder oder deren Anzahl zu zeigen.

Ruf und Cooldown werden gespeichert, importiert und mit Rückgängig/Wiederholen wiederhergestellt. Neustart und übertragbare Figurenprofile enthalten keine alten Kampf-Rufe. Die Fähigkeit selbst bleibt in den Profilen erhalten.

## Kleine Tests

Die vollständigen Kampfdateien unter examples/beta200beta5hf9 importieren. Sie laufen bereits; nicht erneut starten.

1. **Manueller Sammelruf:** Nadir ruft einen Basic-Späher und eine manuelle Mira. Ruf ausführen, Zug beenden, Späher reagieren lassen. Bei Mira darf nur der Hinweis erscheinen.
2. **Wolfsrudel:** Der Leitwolf sieht einen Gegner, andere Wölfe noch nicht. KI-Serie laufen lassen. Ein Ruf, danach Annäherung und Kampf; keine Kette von Rufen.
3. **Advanced:** Die freigegebene Alarmfähigkeit ist der tatsächliche Ruf mit ihren eigenen Kosten. Automatische Nutzung ein- und ausschalten und den normalen manuellen Einsatz vergleichen.
4. **Kein Empfänger:** Alle Verbündeten sind bereits im Kampf. Die Fähigkeit bleibt gesperrt, der Vorrat unverändert.

**2.198 automatisierte Tests in 83 Dateien** bestehen, einschließlich 52 neuer Alarmprüfungen und einer zusätzlichen bestehenden Prüfung für eigene DC-Proben. Begrenzte deutsche/englische DOM-/VM-Prüfungen prüfen Vorschau und Bedienung. Kein grafischer Browser- oder Live-Modelltest. Die normalen Waffen- und Angriffsgewichte bleiben unverändert. Die Basic-Fortsetzung nach Aktionen wurde nur für einen noch offenen Sammelruf erweitert. Lokal zum Testen gebaut, noch nicht auf GitHub veröffentlicht.
