# Change Log

## [1.0.0]

First release.

- **Extract to StyleSheet** from `style={{ … }}` (quick fix and refactor), with a name prompt, a smart default name and validation. Creates the style sheet and the `StyleSheet` import when missing, or adds to the existing sheet; one undo reverts everything.
- **Dynamic values**: static properties move, dynamic ones stay inline as `[styles.x, { width: size }]`.
- **Array styles**: only the object literal is replaced.
- **Hints** on extractable inline styles, with the quick fix attached (`rnStyleExtract.showHints`).
- **Extract all**, **reuse identical styles**, **merge into an existing style**, **extract and rename**, and the reverse **inline style** action.
- Works on `style` and any prop ending in `Style`.
- **Settings**: `stylesName`, `placement` (`bottom`, `top`, `separateFile`), `factory`, `sortKeys`, `showHints`.
- **Separate styles file** (`Component.styles.ts`), several components or sheets in one file, any sheet name.
