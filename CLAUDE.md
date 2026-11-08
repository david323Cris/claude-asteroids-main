# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Asteroids clone in plain HTML5 Canvas + vanilla JS (ES6+). No dependencies, no bundler, no package.json, no tests, no linter. UI text and comments are in Spanish.

## Running

Open `index.html` in a browser, or serve statically: `npx serve .` (then http://localhost:3000). There is no build step.

## Architecture

All logic lives in `game.js`, loaded by `index.html` via a plain `<script>` tag (`'use strict'`, global scope). The canvas is fixed at 800x600 (`W`/`H` constants; `index.html` canvas size must match).

- **Loop**: `loop(ts)` → `update(dt)` → `draw()` via `requestAnimationFrame`. `dt` is in seconds and clamped to 0.05. All speeds are in px/s (or px/s²), timers in seconds.
- **State machine**: global `state` is `'playing' | 'dead' | 'gameover'`. `update()` branches per state; `'dead'` is a 2s respawn timer (`deadTimer`) during which asteroids and particles keep moving. Game state is module-level `let` variables (`ship, bullets, asteroids, particles, score, lives, level`) reset by `initGame()` / `nextLevel()`.
- **Entities** are classes (`Ship`, `Bullet`, `Asteroid`, `Particle`), each with `update(dt)` and `draw()`; removal uses a `dead` flag and array `.filter()` in `update()`. Entities draw directly to the global `ctx`.
- **World is toroidal**: positions wrap with `wrap(v, max)`.
- **Input**: `keys[code]` for held keys; `pressed(code)` consumes a one-shot "just pressed" edge (used for shooting and restart). Space fires once per press, not on hold.
- **Collisions**: circle-based using `dist()` and each entity's `radius`. Ship-vs-asteroid uses `a.radius * 0.82` as forgiveness; ship is skipped while `ship.invincible > 0` (also drives blinking in `Ship.draw`).
- **Asteroid size tables** `RADII`, `SPEEDS`, `POINTS` are indexed by size (1–3, index 0 unused). Destroying a size-N asteroid spawns two of size N-1 via `split()`.

## Notes

- **Disparo Triple power-up**: ~15% of size-3 asteroids spawn `glowing` (cyan pulsing). Destroying one drops a `PowerUp` item (in `powerups[]`, expires after `POWERUP_TTL`); touching it with the ship sets `ship.tripleTimer = TRIPLE_DURATION` (8s), making `tryShoot()` fire 3 bullets in a fan. `tripleTimer` resets in `Ship.reset()`.
- README mentions a "shooting star" asteroid type, but it is not implemented in the current `game.js`.
