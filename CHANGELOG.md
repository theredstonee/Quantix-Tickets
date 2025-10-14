# Changelog

## [Beta 0.3.6] - 2025-10-14

### Changed
- **Claim/Unclaim System Permissions**: Team-Rolle hat keinen automatischen Zugriff mehr auf geclaimte Tickets
  - Nur noch Creator, Claimer und hinzugefügte Nutzer haben Zugriff auf geclaimte Tickets
  - Hierarchische Priority-Rollen bleiben weiterhin aktiv und funktionsfähig
  - Verbesserte Sicherheit und Privatsphäre für geclaimte Tickets

### Removed
- **Chinesische Sprache entfernt**: Komplette Entfernung der chinesischen Sprachunterstützung
  - `zh.json` Translation-Datei gelöscht
  - Chinesische Flagge aus dem Web-Interface entfernt
  - Alle chinesischen Sprachoptionen aus Commands entfernt
  - Language-Selector aktualisiert

### Fixed
- Potentielle Startup-Fehler durch fehlerhafte zh.json Syntax behoben (durch Entfernung)

---

## [Beta 0.3.5] - 2025-10-13

### Added
- Hierarchisches Priority-System implementiert
  - Rot (Priority 2) sieht alle Tickets (2+1+0)
  - Orange (Priority 1) sieht Orange + Grün (1+0)
  - Grün (Priority 0) sieht nur Grüne Tickets (0)
- Neue Funktion `getHierarchicalPriorityRoles()` für hierarchische Zugriffskontrolle
- Priority-Rollen werden jetzt beim Claim/Unclaim korrekt berücksichtigt

### Changed
- `updatePriority()` Funktion nutzt jetzt hierarchische Priority-Rollen
- Claim-System wurde überarbeitet für bessere Rollenintegration
- Unclaim-System stellt jetzt korrekt alle hierarchischen Rollen wieder her

### Fixed
- Claim-System berücksichtigt jetzt Priority-Rollen in den Berechtigungen
- Unclaim-System stellt Priority-Rollen korrekt wieder her
- Priority-Änderungen aktualisieren Channel-Berechtigungen hierarchisch

---

## Ältere Versionen

Für ältere Versionen siehe Git-Commit-Historie.
