# Beta 6 · automatischer Abschlusstest

Stand: **2.0.0-beta.6**, 30. Oktober 2026. Die Kampf-/KI-Implementierung entspricht Beta 5 Hotfix 12; geändert wurden Versionsverweise und ein gekürzter Hilfeabschnitt. Die neue Grenzwacht ist eine Testkonfiguration.

- **2.228 Tests in 85 Dateien bestanden**, keine fehlgeschlagenen oder übersprungenen Tests.
- Offline-Vorschau in Deutsch/Englisch und Kompakt-/Vollansicht: vier Eröffnungsfolgen und vier kurze KI-Serien; Import, bestehende Figuren und Neuladen zusätzlich geprüft.
- Kontrollierte Eröffnung: Feuerimmunität, Immunität gegen Eingeschüchtert, Heilung mit Entfernen von Festgehalten bei erhaltener Blutung, einmalige Kosten und Schuss–Bewegung–Verstecken im Zugkontext.
- Zusatzszene: Wiederbeleben, Toten erheben, Bergen, Sprung F7→H9 und Säurefläche mit zwei Zielen ausgeführt.

| Vollständiger KI-Lauf | Ende in Runde | Figurenzüge | Fehler |
|---|---:|---:|---:|
| Ausgangs-Seed | 19 | 272 | 0 |
| Alternativer Seed | 33 | 389 | 0 |

Beide Läufe erreichten das Kampfende innerhalb der Begrenzung von 35 Runden / 800 Figurenzügen. Über beide Läufe wurden alle **zehn Schadensarten** tatsächlich protokolliert: acid, cold, fire, force, lightning, necrotic, physical, poison, psychic, radiant. 14 unterschiedliche Fähigkeitsarten wurden eingesetzt. Alle 21 Arten sind im Paket konfiguriert, werden aber nicht zwangsläufig von der KI ausgewählt. Für die seltenen Aktionen ist die kleinere manuelle Szene vorgesehen.

Die Läufe benutzen direkt die Engine mit festgelegten Zufallsfolgen. Importierte Figurenkennungen, manuelle Entscheidungen und andere Würfe können den späteren Ablauf verändern. Das ist keine garantierte Kampfstrategie und kein Leistungsbenchmark der Oberfläche.

**Noch praktisch zu prüfen:** die ersten zwei bis drei Runden in SillyTavern mit verbundenem Erzähler, tatsächliche Chatwechsel/Speicherung und die grafische Bedienung. Der Offline-Test prüft die bereitgestellten Erzählfakten, keine Antworten eines Sprachmodells. Danach folgt der abschließende Code-Review vor dem Release Candidate.

[Testdateien und Anleitung](../examples/beta200beta6/README.md) · [Weg zum Release Candidate](BETA6-RELEASE-CHECK.de.md)
