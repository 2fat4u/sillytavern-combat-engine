# Wiederbeleben testen · 1.9.15

Die drei Character-Dateien über Figuren importieren laden. Sie enthalten spielbereite, lebende Profile ohne laufenden Kampf. 05-Revival-Abilities.json importiert Morrins Fähigkeiten samt benötigtem Mana in eine andere Figur. 04-Lantern-Crypt-Combat.json ist ein vollständiger Testkampf mit sieben Figuren; nur als ganzen Kampf importieren.

1. Den Testkampf importieren und starten. Morrin beginnt. Andere Aktionen → Fähigkeiten → Call back the fallen. Fallen Lantern Guard als Ziel wählen, D3 oder ein anderes angebotenes sicheres Feld wählen und ausführen. Erwartet: 8/20 HP, vier Mana verbraucht, weiterhin Ally, frühestens Runde 2 am Zug.
2. Mit Rückgängig den ganzen Vorgang zurücknehmen. D3 mit einer anderen Figur belegen: ein freies Nachbarfeld muss angeboten werden. Ohne freies Landefeld oder mit weniger als vier Mana ist kein Einsatz möglich und nichts wird verbraucht.
3. Schwester Elara kann Return to the light verwenden: 12 HP, sechs Mana. Den Unconscious Scout stattdessen mit Mending prayer heilen oder stabilisieren; er ist kein Wiederbelebungsziel.
4. Vesper als Gegner manuell steuern und das Fallen Crypt Skeleton zurückholen: 10 HP, fünf Mana, weiterhin Enemy. Die Basic-KI führt Wiederbeleben noch nicht selbst aus. Der Zauber macht niemanden automatisch zum Verbündeten.
5. Optional im Fähigkeitseditor eine W20-Probe aktivieren. Ein Fehlschlag verbraucht Aktion und Mana, stellt aber keine HP her. Speichern/Neuladen und Undo ausprobieren. Nach dem Kampf ist Wiederbeleben über den eigenen Bereich möglich; der Kampf startet dadurch nicht neu.

Keine erneute Auffüllung der Vorräte durch Wiederbeleben. Laufende Zustände, taktische Wirkungen und aktive Schilde werden bei erfolgreicher Rückkehr entfernt. Aus dem Szenario gelöschte Figuren sind keine Ziele. Die Vorlage ist zur Funktionsprüfung gedacht und kein ausbalanciertes Abenteuer.
