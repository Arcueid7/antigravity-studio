# Third-Party Licenses & Notices

Antigravity Studio bundles the following third-party open-source and redistributable components so the application works out-of-the-box offline with zero build toolchain dependencies.

---

## 1. KaTeX

- **Location**: `static/vendor/katex/`
- **Project**: https://katex.org/ (`https://github.com/KaTeX/KaTeX`)
- **License**: MIT License
- **Copyright**: Copyright (c) 2013-2020 Khan Academy and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

---

## 2. Mermaid

- **Location**: `static/vendor/mermaid/`
- **Project**: https://mermaid.js.org/ (`https://github.com/mermaid-js/mermaid`)
- **License**: MIT License
- **Copyright**: Copyright (c) 2014-2024 Knut Sveidqvist and Mermaid contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

---

## 3. Microsoft Edge WebView2 SDK (Redistributable Libraries)

- **Location**: `desktop/lib/` (`Microsoft.Web.WebView2.Core.dll`, `Microsoft.Web.WebView2.WinForms.dll`, `WebView2Loader.dll`)
- **Project**: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
- **License**: Microsoft Edge WebView2 SDK License (Microsoft Software License Terms — Redistributable Code)
- **Copyright**: Copyright (c) Microsoft Corporation. All rights reserved.

These official Microsoft WebView2 redistributable assemblies are included solely to allow compiling and running the Windows desktop launcher (`desktop/AntigravityStudioLauncher.cs`) via the built-in .NET Framework compiler without requiring NuGet or Visual Studio.
