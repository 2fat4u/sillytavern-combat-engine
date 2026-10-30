# Hotfix 10 · Alarmierte Advanced AI kommt zum Sammelpunkt

## Korrektur

Ein manueller Alarm konnte erfolgreich sein und trotzdem keine sinnvolle Advanced-Verstärkung bringen: Sobald der Ruf zusätzlich einen bekannten Gegner übermittelte, wurde sein Sammelpunkt übersprungen. Figuren mit „Warten“ oder „Patrouillieren“ folgten dann weiter ihrem bisherigen Verhalten; Sucher konnten stattdessen eine andere Spur verfolgen. Der Alarmradius war dabei nicht die Ursache.

Ein empfangener, noch gültiger Sammelruf bleibt jetzt das Bewegungsziel, solange kein eigener sichtbarer Gegner eine Kampfentscheidung verlangt. Das gilt für Warten, Patrouillieren und Suchen sowie nach einer nötigen Selbstheilung mit verbleibender Bewegung. Am Rufpunkt angekommen wartet die Figur während der Gültigkeit, statt sofort wieder zu patrouillieren. Ein unterwegs selbst entdeckter Gegner löst eine neue Entscheidung aus; eine tatsächlich noch verfügbare Aktion kann benutzt werden.

Basic AI erreichte den Rufpunkt bereits. Auf einem Gitter mit gleich teuren Diagonalen kann der kürzeste erlaubte Weg seitlich wirken. An der allgemeinen Wegsuche wurde nichts geändert.

Sichtregeln, Reviergrenzen, vorhandene Bewegungspunkte, bezahlte Aktionen, Vorräte, Cooldowns und experimentelle Gelegenheitsangriffe gelten weiterhin. Ein Alarm kostet nicht doppelt; manuelle Empfänger behalten ihre Steuerung. Radius bezeichnet, wer den Ruf hört, nicht eine sofortige zusätzliche Bewegung. Der Sammelpunkt bleibt die Position beim Rufen.

## Bessere Diagnose

Das Debug-Protokoll enthält jetzt auch den empfangenen Ruf mit Quelle, Sammelpunkt, Rufrunde, Ablauf, Ankunftsstatus und Cooldown sowie die eingestellten Alarmprofile. Diese Angaben fehlten im vorigen Export; fehlende Fehlereinträge allein konnten das Verhalten deshalb nicht erklären.

## Testen

[Öffentliche Testszene](../examples/beta200beta5hf10/01-Manueller-Ruf-Advanced-Patrouille.json) als vollständigen Kampf importieren. Der Kampf läuft bereits, die manuelle Rufende ist am Zug. Alarmieren ausführen, ihren Zug und den entfernten Gegnerzug beenden. Danach die KI-Züge ausführen. Der Advanced-Verbündete soll sich zum Rufpunkt M6 bewegen und nicht in sein Startgebiet zurückkehren. Über mehrere Runden bis zur Ankunft prüfen. Der Basic-Späher braucht wegen seines weiteren Weges länger. Ohne Sichtkontakt warten beide nach Ankunft am Punkt. Gespeicherte Hotfix-9-Kämpfe können weitergeführt werden; alte Ruf-Gültigkeit und Cooldowns werden nicht neu gestartet.

12 neue Regressionstests decken Warten/Patrouillieren/Suchen, einen manuellen Ruf vor dem Rundenwechsel, die mehrzügige Ankunft beider KI-Arten, Warten nach Ankunft, neue Gegner auf dem Weg, Selbstheilung mit Restbewegung, geschützte Reviere und Diagnosefelder ab. Insgesamt 2.210 automatisierte Tests in 84 Dateien. Begrenzte Offline-Prüfung der deutschen und englischen Bedienung; kein Live-Modell- oder grafischer Browser-Test. Normale Angriffsgewichte bleiben unverändert.

Hilfesuche und vollständiges Zustandslexikon bleiben [für einen folgenden Patch geplant](HELP-PLAN.de.md). Diese Fehlerkorrektur implementiert sie noch nicht. Lokal zum Testen gebaut, nicht auf GitHub veröffentlicht.
