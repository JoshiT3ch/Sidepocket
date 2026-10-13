# Vendored QR libraries

The website serves both libraries from its own `dist/vendor/` directory. They do not fetch scripts, transmit player codes, or call a remote QR service.

## qrcode-generator 2.0.4

- Author: Kazuhiko Arase
- License: MIT, reproduced in `qrcode-generator-LICENSE.txt`
- Official repository: https://github.com/kazuhikoarase/qrcode-generator
- Pinned commit: `83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8`
- Original file: https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8/js/dist/qrcode.mjs
- Local file: `qrcode-generator.js`
- Changes: renamed `.mjs` to `.js` for the website's static JavaScript routes; content is unchanged.

## jsQR 1.4.0

- Authors: Cosmo Wolfe and contributors
- License: Apache-2.0, reproduced in `jsqr-LICENSE.txt`
- Official repository: https://github.com/cozmo/jsQR
- Pinned commit: `8e6a036beafa7053dd44b1b76ac578d22b1b3311`
- Original file: https://raw.githubusercontent.com/cozmo/jsQR/8e6a036beafa7053dd44b1b76ac578d22b1b3311/dist/jsQR.js
- Local file: `jsqr.js`
- Changes: added module-scoped CommonJS variables before the original UMD build and a default ES-module export after it. The decoder implementation is unchanged, and the adapter does not add a browser global.

`../qr.js` is Sideout's application adapter. It renders a four-module white quiet zone with black QR modules and recognizes player codes independently of the decoder.
