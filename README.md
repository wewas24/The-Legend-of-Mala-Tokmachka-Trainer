# LOMT Trainer v1.1

WeMod-artiger Singleplayer-Trainer für *The Legend of Mala Tokmachka*.

## Start

1. ZIP vollständig entpacken.
2. `Start LOMT Trainer.cmd` doppelklicken.
3. Im Trainer `Spiel starten / verbinden` anklicken.
4. Cheats mit den Schaltern oder F1–F6 aktivieren.

Es ist keine Pfadeingabe nötig. Der Trainer sucht `LOMT.exe` in allen gefundenen Steam-Bibliotheken auf allen Laufwerken. Er liest dazu die Steam-Bibliotheken sowie die üblichen Steam-Ordner auf C: bis Z:. Innerhalb eines Spielordners werden bis zu drei Unterordner geprüft.

Beispiel: `D:\Steam\steamapps\common\The Legend of Mala Tokmachka`

## Voraussetzung

- Windows 10/11
- Node.js 18 oder neuer (Node.js 24 wird unterstützt)
- Microsoft Edge/WebView2

Keine npm-Installation erforderlich. Nur für Offline-/Singleplayer verwenden.

## Funktionen

- Geld, God Mode, Forschung, XP/Level, kostenlos bauen und keine Cooldowns
- sofortige Reparatur, Munition, Ressourcen und sofortiges Bauen
- alle Cheats zusammen aktivieren/deaktivieren
- Spieltempo, Wellen anhalten/fortsetzen und nächste Welle (experimentell)
- lokale Save-Sicherung und anpassbare Hotkeys

## Hinweis

Der Trainer startet das Spiel mit dem WebView2-Debug-Port und verbindet sich danach lokal mit dem Spielprozess. Falls eine Spielaktualisierung interne Variablen ändert, müssen die Ausdrücke in `server.js` angepasst werden.
