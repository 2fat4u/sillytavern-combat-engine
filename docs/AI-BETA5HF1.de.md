# KI-Testpatch · Beta 5 Hotfix 1

Die Advanced AI soll bei wenig HP den letzten Heiltrank sinnvoll nutzen können, Angriffsweg und erreichbaren Rückzug gemeinsam bewerten und nach einer neuen Sichtung während der Suche noch freie Aktionen prüfen. Die Auswahl bleibt situationsabhängig und gewichtet. Ein aussichtsreicher ausschaltender Angriff bleibt bei Gefahr eine mögliche Alternative zur Heilung.

Die Gefahrabschätzung trennt beobachteten Nahkampf von Fernkampf. Deckung reduziert keine herankommende Nahkampfgefahr. Die KI lernt beobachtete normale Schadenswerte, Angriffsarten, gezeigte Schussentfernungen, Bewegung und normale Angriffe pro Zug. Unbekannte Fähigkeiten werden vorsichtig geschätzt; unbekannte Waffenwerte und versteckte Gegnerpositionen bleiben unbekannt. Eine kurze beobachtete Schussentfernung ist keine bekannte maximale Waffenreichweite. Beobachtete Bewegung ist ebenfalls nur ein Hinweis auf die mögliche Reichweite.

Ältere gespeicherte Kämpfe lassen sich weiter laden. Ihnen fehlen die neuen Beobachtungsfelder zunächst; diese werden mit weiteren sichtbaren Ereignissen gefüllt. Kampfneustart löscht das Erfahrungswissen. Import und Rückgängig erhalten das relative Alter vorhandener Hinweise und den Status bereits alarmierter Sichtungen.

Vier kleine [Testkämpfe mit Ablauf](../examples/beta200beta5hf1/README.md) liegen bei: letzter Heiltrank, Angriff mit Restbewegung, Suche hinter einer Ecke und blockierte Schusslinie. Sie laufen bereits; nach dem Import **KI-Zug ausführen** wählen. Für einen Vergleich kann man danach eigene Positionen, Vorräte und HP ändern oder den eigenen Kampf importieren.

Im Protokoll stehen konkretere Gründe, wenn die KI nicht schießt oder sich bewegt: ein Verbündeter in der Schusslinie, aufgebrauchter Vorrat, verbrauchte/ungeeignete Aktionen, ein noch unerreichbares Angriffsfeld oder kein vorteilhafter Rückzugsweg. Ein nach dem Angriff geplanter Endpunkt ist eine Bewertungshilfe; nach der tatsächlichen Wirkung entscheidet die KI erneut.

Die Regeln zur Stabilisierung bleiben bestehen. Gelegenheitsangriffe bleiben experimentell, optional und normalerweise ausgeschaltet. Der bisherige [Beta-5-Test](BETA5-EXPERIMENT.de.md) steht weiter zur Verfügung.

1.991 automatisierte Tests in 76 Dateien bestanden, davon 42 neue gezielte KI-Prüfungen. Zusätzlich begrenzte Offline-DOM-/VM-Prüfungen in Deutsch und Englisch einschließlich aller vier Szenen, bisheriger Reaktionsfenster und erneutem Laden. Kein grafischer Browser-, Live-SillyTavern- oder Modelltest. Lokal zum Testen gebaut; noch nicht veröffentlicht.
