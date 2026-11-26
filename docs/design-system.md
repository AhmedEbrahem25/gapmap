# GapMap design system — “Calm academic clarity”

Design canvas: the GapMap UI/UX artifact (design system, flows and the nine demo screens).
Tokens live in `src/app/globals.css` (`@theme`).

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `primary-600` | `#2445D8` | Actions, focus, active navigation |
| `primary-800` | `#1A32A6` | Text on primary tints |
| `primary-50` | `#EEF2FF` | Selected rows, slide chips |
| `marker` | `#FDBA74` | Brand accent (logo dot, underline) |
| `ink` / `ink-2` | `#111827` / `#4B5563` | Text / secondary text |
| `line` / `ground` | `#E5E7EB` / `#F6F7F9` | Borders / page background |
| `met` | `#0F766E` on `#E6F4F1` | Criterion met |
| `partial` | `#B45309` on `#FEF3E2` | Criterion partly met |
| `missing` | `#B91C1C` on `#FDECEC` | Criterion missing |
| `ai` | `#5B21B6` on `#F3EEFF` | Anything AI-suggested and not yet approved |

Status is never colour alone: every status chip has an icon and a word.

## Type

IBM Plex Sans (UI), IBM Plex Sans Arabic (Arabic), IBM Plex Mono (SQL/code), Caveat (rendered
handwriting in demo scans). Scale: 32/40 display · 24–28 headings · 18/26 titles · 15/24 body · 13/20 small.

## Layout & motion

8-point spacing; radii 8 (inputs) · 12 (cards) · 16 (sheets). Instructor: 240 px side nav + content up
to 1200 px. Student: mobile-first 480 px column, 44 px touch targets, bottom tabs. Motion uses one
ease (`[0.22, 1, 0.36, 1]`): fade-up on entry, staggered lists, animated progress bars and count-ups,
spring tab indicators. `prefers-reduced-motion` disables all of it.
