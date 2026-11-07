# Third-party notices — SwitchLAN Studio Core 1.4.5 Beta

## Liquid Glass Web

- Repository: https://github.com/xiaofangstudio/liquid-glass-web
- Project describes its code as licensed under the MIT License.
- The readme credits the underlying liquid refraction engine to Shu Ding:
  https://github.com/shuding/liquid-glass (MIT, © Shu Ding).

SwitchLAN `js/liquid-fusion.js` adapts the SDF texture displacement approach,
normalization and SVG displacement-filter construction of the above reference,
and adds custom controls, event handling, clipping, fallbacks and UI styles for
this Windows administration application. No original external script is fetched
at runtime. The CSS (`assets/style.css`) applies glass only to decorative or
navigation elements; permission/credential content is deliberately not distorted.

MIT license reference: https://opensource.org/license/mit

This software is not affiliated with Apple, GitHub, or the upstream authors.

## Core 1.4.4 — Liquid Radar

The Radar optical layer reuses the already-present `sl-liquid-refract` SVG
displacement filter from `js/liquid-fusion.js`. Its SDF mapping approach was
adapted from `xiaofangstudio/liquid-glass-web` as described above. No additional
upstream JavaScript or remote runtime asset was introduced in 1.4.4.
The decorative refraction layer is composited **behind** the real SVG plotted
data so axes, markers, text, and chart readings are never displaced.


## License text for the adapted refraction engine

The following MIT notice is retained from shuding/liquid-glass. The intermediary
project xiaofangstudio/liquid-glass-web declares MIT licensing in its README but
does not provide a separate LICENSE file at the checked source URL. Its
attribution is retained above.

```text
MIT License

Copyright (c) 2025 Shu Ding

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Microsoft WebView2

The desktop project references Microsoft.Web.WebView2 through NuGet. That SDK and
the separately installed WebView2 Runtime have their own Microsoft license terms;
the SwitchLAN MIT license does not replace them. See the package metadata and
https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4314.35 for details.
