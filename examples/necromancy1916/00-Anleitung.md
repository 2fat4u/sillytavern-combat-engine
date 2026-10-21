# Nekromantie und Beherrschen testen · 1.9.16

Character-Dateien über Figurenimport, Abilities-Dateien über Fähigkeitenimport laden. 06-Allegiance-Crypt-Combat.json ist ein vollständiger Kampf mit neun Teilnehmern. Alte Testpakete bleiben verwendbar.

1. Testkampf importieren und starten. Morrin beginnt. Andere Aktionen → Fähigkeiten → Raise eternal servant → Fallen Mercenary. Erwartet: 8/20 HP, vier Mana verbraucht, jetzt Ally, Untot, Basic AI, frühestens Runde 2. Der Diener kämpft in seinen eigenen regulären Zügen. Casting des Zaubers ist manuell.
2. Rückgängig. Derselbe Tote mit Call back the fallen (gewöhnliches Revive) bleibt Enemy. So lassen sich beide Fähigkeiten direkt vergleichen. Seite nicht mit dem eigenen Steuerungsmodus verwechseln.
3. Ilyra erhält ihren Zug nach Morrin. Bend the will auf Crypt Marauder: Probe gegen dessen Profil-DC. Erfolg macht ihn für drei eigene Züge zum Ally, manuell steuerbar. Nach Ablauf wieder Enemy mit ursprünglicher Steuerung. Fehlschlag verbraucht Aktion und drei Mana, ändert keine Seite. Attribut, DC, Dauer und Kosten im Fähigkeiteneditor ändern.
4. Vesper kann Fallen Crypt Skeleton mit Three-turn bone servant erheben. Drei eigene Züge, danach tot; bei 0 HP direkt tot. Nur einmal erheben ist bei diesem Profil eingeschaltet. Morrins dauerhafte Variante hat diesen Schalter aus.
5. Maedra kann Ilyra beherrschen; jetzt gehört die betroffene Figur zeitweise zur gegnerischen Seite. Friendly Fire, Angriffsziele und Heilung aus beiden Perspektiven prüfen. Bestehende Bindungen lassen sich nicht erneut übernehmen.
6. Kampf stoppen. Befristete Bindungen unter Seitenwechsel & Zeit explizit weiterzählen. In Reserve, bei Flucht, Bewusstlosigkeit und Kampfpause pausiert die Dauer. Permanente Diener bleiben über Speichern/Neuladen bestehen. Undo nimmt eine Anwendung oder einen Zeitschritt zurück.
7. Im Kontextmenü Bearbeiten öffnet genau die angeklickte Figur. Unter Zufallsaufstellung wählen Alle auswählen/Alle abwählen nur die Checkboxen, ohne automatisch aufzustellen.

Einmal-Sperre betrifft Erheben, nicht gewöhnliches Wiederbeleben. Kein zusätzliches Dienerlimit und keine kostenlose Auffüllung von Vorräten. Frische Charakter-/Companion-Vorlagen enthalten keine laufenden Bindungen; der vollständige Kampfexport erhält sie. Diese Szene dient der Funktionsprüfung, nicht als ausbalanciertes Abenteuer.
