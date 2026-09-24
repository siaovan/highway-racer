# Highway Racer V3.2.1 — Offline

A fully offline HTML5 Canvas arcade traffic racer.

## V3.2 visual rebuild
- Player car scale reduced and grounded to the asphalt with a proper contact shadow.
- Fixed the tinting pipeline so transparent car sprites stay transparent (no red/colored rectangle).
- Player/NPC proportions changed from tall toy-like icons to wider, lower rear-view vehicles.
- New Coastal Expressway sunset scene based on the approved reference: sea and golden reflections on the left, illuminated skyline, layered mountains, forested hillside, continuous guardrails, reflectors, warm sunset road sheen and denser traffic.
- Road perspective widened and traffic scaling retuned so vehicles feel attached to the same world.
- Collision still uses the forgiving screen-space core hitbox from V3.1. Press H to inspect hitboxes.
- 100% offline; no CDN, server, npm, or internet required.

## Run
Extract the folder and double-click `index.html`.

## Controls
- A / D or Left / Right: steer
- Space / Shift: nitro
- Esc / P: pause
- H: debug collision hitboxes


## V3.2.1 hotfix
- Restored the missing player-car vector fallback renderer.
- Restored the missing traffic renderer and shared car drawing helpers.
- Cars now render immediately even before local SVG sprites finish loading.
- Prevents the animation loop from stopping with a ReferenceError on file:// URLs.
