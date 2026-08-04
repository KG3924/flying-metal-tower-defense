# Flying Metal Tower Defense

Sci-fi tower defense game (Bloons-inspired). Pure HTML5 Canvas + vanilla JavaScript — no build step, no dependencies.

## Play

Open `index.html` in a modern browser, or play on GitHub Pages once enabled.

```bash
# local
python3 -m http.server 8080
# then open http://localhost:8080
```

## Arsenal (11 structures)

| Key | Tower | Role |
|-----|-------|------|
| 1 | Pulse Turret | Fast kinetic — weak vs shields/armor |
| 2 | Plasma Blaster | Melts **energy shields**, hits air |
| 3 | Missile Pod | Anti-armor explosives + splash |
| 4 | Rail Sniper | Long-range ST, pierces, hits air |
| 5 | AA Point Defense | **Air only** — mandatory vs drones |
| 6 | Arc Mortar | Slow arcing AoE |
| 7 | Force Field | Aura: slow + shield drain (heavies resist) |
| 8 | Teleport Station | Shoves units **back** along path (bosses immune) |
| 9 | Roving Platform | Patrols the lane (place near path) |
| 0 | Drone Hive | Launches attack drones |
| · | Mech Bay | Deploys combat mechs onto the lane |

Each tower has **3 upgrade paths** (A/B/C), max 5 upgrades, one path to rank 3 when another is 2+.

## Hostiles

Shields (cyan bar) block kinetic fire. Wave intel tags:

- **AIR** — needs AA / plasma / rail / hive
- **SHD** — bring plasma or force fields
- **TP-IMM** — teleporters do nothing
- **STL** — needs detection upgrades

## Controls

`1–9` / `0` place · `Esc` cancel · `Space` wave/pause · `S` speed · `M` mute · `R` ranges

## GitHub Pages

1. Repo **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / root (`/`)
4. Save — site will be at `https://<username>.github.io/flying-metal-tower-defense/`

## License

MIT
