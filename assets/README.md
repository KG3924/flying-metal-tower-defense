# Sprite assets

These three 16×16 RGBA PNGs are individual sprites from the [Angais Pixel Art Atlas 1.4M](https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m). The full dataset is not included.

Angais releases the sprites, captions, and collection under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) to the extent of the rights Angais can waive. That dedication does not grant rights in third-party material, trademarks, or Krea's models. The images are AI-generated. Krea's terms still apply to generated images: the dataset notes that this release does not override the [Krea 2 Community License](https://www.krea.ai/krea-2-licensing) (including its commercial-use provisions, §2.3) or the Krea Acceptable Use Policy. Krea claims no ownership of generated outputs under §5.3 of that license. This game is not an official or endorsed Krea release.

The game's own code stays under the MIT license in the repository root.

## Used in game

| File | row_id | subject | caption | Role |
|------|--------|---------|---------|------|
| `pulse-turret.png` | 1140687 | laser turret | top-down rotating laser turret with heavy wear | Pulse Turret sprite. Drawn in-world at 2× with nearest-neighbor sampling. The barrel points right (+X), which matches the game's aim angle. |

## Alternates (not used in game)

Kept in case the primary facing needed a swap. `game.js` does not load these.

| File | row_id | subject | caption |
|------|--------|---------|---------|
| `pulse-turret-alt-twin.png` | 749839 | laser turret | top-down twin-barreled laser turret with a targeting dish |
| `pulse-turret-alt-aperture.png` | 906788 | laser turret | top-down rotating laser turret |
