# Username image icons

Drop PNG files here and they appear automatically in Settings > Social >
Username > Icon on the next client build — no code changes needed.

Rules:
- Filename becomes the stored id and the picker tooltip: `pink-bow.png` →
  id `img-pink-bow`, shown as "Pink Bow".
- Use kebab-case: lowercase letters, digits and hyphens only (`[a-z0-9-]`),
  starting with a letter or digit. Anything else is skipped (the id must pass
  the emulator's icon allowlist).
- Pixel art renders at NATIVE size (never scaled) — keep icons roughly
  chat-line sized (~14-22px tall).
- Icon Color does not apply to image icons; the picker disables it when one
  is selected.
