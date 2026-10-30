# lowkey

A directory of 260+ privacy tools, sorted by the job they do. It mixes two ideas: privacytools.io's "replace this app" lists with a note on why each tool made it, and Techlore's filter chips for device, price, license and setup.

Plain HTML, CSS and JavaScript. No build step, no dependencies, and no requests to anyone else's server (the Archivo font is in `fonts/`).

## Run it

Open `index.html` in a browser. Or serve the folder:

```
python3 -m http.server 8000
```

## Add or change a tool

Everything lives in `js/data.js`. Copy an entry in the right category, then check it:

```
node test/check-data.mjs
```

The check catches bad platform names, unknown trait or swap keys, non-https links and duplicates.

## Files

- `index.html` page structure and static copy
- `css/tokens.css` colours, type, spacing (every value the stylesheet uses)
- `css/site.css` layout and components
- `css/noscript.css` loads only with JavaScript off and hides the script-built parts (marked `data-js` in the HTML), leaving a note in their place
- `js/data.js` the tools, categories and "what we look for" notes
- `js/theme.js` light/dark switch (loads in the head so a saved choice applies before the page draws)
- `js/app.js` builds the list, filters, table view and search
- `favicon.svg` the keyhole mark (it sits low in the square: a low key); `apple-touch-icon.png` is the same mark at 180 px for phone home screens
- `fonts/` Archivo, SIL Open Font License (`fonts/OFL.txt`)
- `og.png` the preview image shown when the link is shared

## Suggest a tool or report a problem

Open an issue: https://github.com/retroul/lowkey/issues/new/choose. There's a form for each. A link to a source (audit, changelog, news story) helps.

## Light and dark

The page follows the device's light or dark setting. The half-circle button in the header switches it, and the choice is saved in the browser (localStorage, nothing sent anywhere). Dark colours live next to the light ones in `css/tokens.css`.

## Keyboard

`/` or Ctrl+K opens search. Esc clears filters. Filters are saved in the address bar, so a copied link keeps the view.

## License

MIT, see `LICENSE`. The Archivo font is under its own license, the SIL Open Font License (`fonts/OFL.txt`).
