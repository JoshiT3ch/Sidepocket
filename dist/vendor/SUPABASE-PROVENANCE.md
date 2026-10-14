# Supabase browser SDK

- Package: `@supabase/supabase-js@2.117.3`, MIT license.
- Official source: https://github.com/supabase/supabase-js/tree/master/packages/core/supabase-js
- Download: https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.117.3.tgz
- npm integrity (verified): `sha512-K+f8PimXDunPWQ63CKRXaF5pbVPJxmfw5ryAnh0s9S9PkwcuqBjiSpIaqpF7KLDljeYwXIL85ST8QxaO0+XuvA==`
- Vendored source: package `dist/umd/supabase.js`; one line appended to expose `createClient` as an ES module export. No SDK logic was modified.
- Vendored SHA-256: `91e601a6b26a74509a62cca13302a2b9e04fe2a62c81ec9575f23eb29ef5df17`.
- The standalone official build includes the matching Supabase Auth, Data, Functions, Realtime, and Storage clients. No runtime CDN dependencies.
- License: `SUPABASE-LICENSE.txt`.

To update, download a pinned official npm release, verify its registry integrity, copy its standalone browser build, append the same ES module export, and update this provenance file and the service import together.
