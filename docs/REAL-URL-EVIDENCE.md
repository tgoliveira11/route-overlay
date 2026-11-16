# Real directions URLs

Captured on 2026-11-16. No URL in this file was typed up to look like a share. Each row says where the string came from. Redirects were read from the HTTP `Location` header only. The Maps page body was not parsed for a route payload, and the Routes API was not called.

Screenshots from the desktop session:

- `docs/evidence/santos-montevideo-alternatives.webp` — three driving alternatives, Santos to Montevideo.
- `docs/evidence/desktop-share-dialog.webp` — Share dialog. The card mentions `maps.app.goo.gl`. No short-link string was copied.
- `docs/evidence/santos-three-stops.webp` — three stops in the form. Porto Alegre is the last field.

## Public short links

| Short link | Provenance | Live `302` target on 2026-11-16 | What is explicit |
| --- | --- | --- | --- |
| `https://maps.app.goo.gl/fCuimzb1oqRtdMzn6` | Stack Overflow question 79633170, presented as one shared route | London path coordinates `51.5199302,-0.1103523` to `51.5070144,-0.1084179`. Data ends in `!3e0`. No `!5i`. | Both endpoints. No polyline. |
| `https://maps.app.goo.gl/yn3mXWSyFrmwZfar6` | Same question, presented as a different route between those endpoints | Same coordinates. Data includes `!5i2` before `!5m1!1e1`. | Same endpoints. Integer `2` is present. No polyline. |
| `https://maps.app.goo.gl/ZLrT3Z5ESrsTxCcz5` | Stack Overflow answer on question 63026787 | Origin `33.3776464,-112.0612261`. Destination name Tempe Municipal Court. Blob coordinate `!1d-111.9373967!2d33.4256807`. Fields include `!8j1751276700` and `!3e3`. | Origin, destination name, one coordinate pair, an uninterpreted long integer. No polyline. |
| `https://goo.gl/maps/HcikiDXFwN2coeFN8` | Stack Overflow question 69853742 | Eiffel Tower to Palais Garnier, two `!1d`/`!2d` pairs, `!3e0`. | Two stops. The extra via coordinates quoted in a 2021 answer are not in this redirect. |

`entry=tts` is on the three `maps.app.goo.gl` targets. Maps URLs does not document `entry`. This report does not treat it as proof of a phone.

## Desktop session

Opened with the documented Maps URLs request `https://www.google.com/maps/dir/?api=1&origin=Santos%2C%20Brazil&destination=Montevideo%2C%20Uruguay&travelmode=driving`. Google then rewrote the address bar. The on-screen alternatives were:

1. via BR-116 — 25 hr, 1,936 km (initially selected)
2. via Brigadier Gral. Fructuoso Rivera / Ruta 5 — 27 hr, 1,997 km (clicked)
3. via BR-116 and Brigadier Gral. — 27 hr, 2,023 km

The names and distances were read from the page. They are not a recovered geometry.

Address bar after the click on alternative 2, copied as a complete URL and checked by the parser:

`https://www.google.com/maps/dir/Santos,+S%C3%A3o+Paulo,+Brazil/Montevideo,+Montevideo+Department,+Uruguay/@-28.9739549,-62.0565642,5z/data=!4m19!4m18!1m9!1m1!1s0x94ce03b97cc7856f:0x3ff3e507b04bbc46!2m2!1d-46.3317787!2d-23.9539549!1m5!1m1!1s0x959f80ffc63bf7d3:0x6b321b2e355bec99!2m2!1d-56.1851147!2d-34.9055016!3e0?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D`

Parser result: both names, both coordinates, observed driving token `!3e0`, no polyline, selected route not preserved. The string "BR-116" and the string "Ruta 5" do not occur in that URL.

The address bar saved for the initial BR-116 selection ends at `!2d-23.9539549` and has no Montevideo coordinate. The omnibox in the screenshot is ellipsized. That capture is incomplete and is not used as a successful parse of both cities.

After another stop was added, the form and the path listed Santos, then Montevideo, then Porto Alegre. The URL is the `SANTOS_THREE_STOPS` fixture in `tests/unit/real-urls.test.ts`. Porto Alegre is the destination in that URL. It is not marked `via`. Stop order is preserved. The roads are not.

The Share dialog's preview card shows the words `maps.app.goo.gl`. A short-link value was not captured from Copy. Desktop short-link behavior for this session is inconclusive.

## Mobile

Not run. The phone share sheet is not available in this environment.

What would close it: on a phone, build Santos to Montevideo, tap a non-default alternative, Share, Copy link, and paste that `maps.app.goo.gl` URL without editing it. The same for a route that has a stop between the two cities.

## Official references

- [Maps URLs, Get Started](https://developers.google.com/maps/documentation/urls/get-started). Directions parameters used above: `origin`, `destination`, `travelmode`, `waypoints`, `avoid`, place ids. No selected-route parameter and no polyline parameter. `avoid` accepts `tolls`, `highways`, and `ferries`. The guide says `api=1` is required for that contract.
- The `/maps/dir/stop/stop/data=!...` shape is what the Maps website put in the address bar. Parsing it is reading explicit URL text. It is not a documented request format, and the `data` tokens are not given meanings by that guide.

## What was not inferred into a route

- `!5i2` was not treated as "alternative number 2".
- `!8j1751276700` was not stored as a departure time.
- `!3e0` and `!3e3` are shown as partial travel-mode evidence, with the raw token.
- Mock polylines were not compared to the blue line on the map. There is no independent geometry for that comparison.
