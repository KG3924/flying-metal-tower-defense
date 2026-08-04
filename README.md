# Flying Metal Tower Defense

Sci-fi tower defense (Bloons-inspired). Pure HTML5 Canvas + vanilla JavaScript — no build step, no dependencies.

## Play live

**https://KG3924.github.io/flying-metal-tower-defense/**

## Run locally

```bash
# open index.html in a browser, or:
python3 -m http.server 8080
# then open http://localhost:8080
```

Works on desktop and mobile browsers. On phones: horizontal arsenal dock, bottom Intel sheet (☰), and **pin location → Deploy** placement.

## How to place towers

1. Tap a tower in the arsenal.
2. Tap the map to pin a spot (cyan = valid, red = invalid).
3. Press **Deploy** to build (or tap again to move the pin).
4. Tap a built tower / open **☰ Intel** to upgrade or sell.

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

## Controls (desktop)

`1–9` / `0` select · tap map to pin · **Enter** deploy · `Esc` cancel · `Space` wave/pause · `S` speed · `M` mute · `R` ranges

## GitHub Pages

Repo: https://github.com/KG3924/flying-metal-tower-defense  

Settings → Pages → Deploy from branch **`main`** / root (`/`).

## License

MIT
