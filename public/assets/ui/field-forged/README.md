# Field UI art — 2026-09-13

Built with the built-in image_gen tool. The original generated PNGs are copied into this directory without flattening or replacing their alpha. Both are 1254 × 1254 RGBA.

- `panel.png`: nine-slice leather and metal panel; source slice 160 px. DOM border 22 px / content inset 26 px; minimap border 10 px / inset 16 px; action border 6 px / text inset at least 8 px. Used by the React field HUD, Canvas minimap and action menu. Canvas keeps a dark fallback while loading.
- `crest.png`: decorative sword/shield crest in the character HUD. Empty alt text; it conveys no unique gameplay information.

Gameplay labels, resources, translated text, focus, hit testing and progress remain code-driven. The classic eight-action radial layout and existing game sprites remain.

## Final prompts

### Panel

Use case: stylized-concept. Asset type: production 2D RPG user-interface nine-slice panel texture, a standalone asset, NOT a game screenshot or a mockup. Create a square 1024 by 1024 front-facing flat rectangular panel for a dark classic tactical RPG. The inner surface is extremely dark charcoal-black fine worn leather, subtle hand-painted grain, quiet empty center for readable live UI text. Very restrained antique bronze and muted warm gold double-line edging, small angular engraved iron corner brackets. All ornament confined within the outermost 96 pixels, straight long edges suitable for nine-slice stretching. Border lies 12 pixels inside the image edges, transparent empty margin outside the panel. Actual transparent alpha background OUTSIDE the panel; interior must be opaque near-black leather. Balanced symmetry, crisp crafted edges, premium restrained fantasy inventory UI, not photoreal object perspective. Palette charcoal #121210, bronze #776345, ivory-gold #c3a76b, no bright red. Flat orthographic. No symbols or crest in the center, NO text, no letters, no numbers, no icons, no checkerboard, no scene, no glow, no drop shadow beyond the margin. Single large panel filling almost the entire square.

### Crest

Use case: stylized-concept. Asset type: isolated production 2D dark fantasy RPG UI emblem with genuine transparent background. A single compact heraldic emblem: a straight narrow silver longsword pointing downward, over a small dark steel shield, flanked by two restrained antique bronze laurel branches. No person, no face, no skull, no extra weapons, no jewel, no writing. Painterly high-end 2D fantasy inventory illustration with crisp simplified silhouettes readable at 48 to 72 pixels. Worn warm bronze #a48a55, ivory silver edge, charcoal dark steel. Strong central silhouette, understated warm rim light, minimal fine detail, zero glow. Symmetric front view. Centered object fills 80 percent of square 1024x1024 with generous transparent air on all sides. Actual transparent alpha everywhere outside emblem and between leaves and sword; NO backdrop, no checkerboard drawing, no panel, no text, no watermark.
