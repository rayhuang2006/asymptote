<div align="center">
  <img src="media/icon.png" width="120" alt="Asymptote Logo" />
  <h1>Asymptote</h1>
  <p><strong>Time Complexity Analysis & Companion for Competitive Programming</strong></p>

  [![CI Status](https://github.com/rayhuang2006/asymptote/actions/workflows/ci.yml/badge.svg)](https://github.com/rayhuang2006/asymptote/actions/workflows/ci.yml)
  [![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/rayhuang2006.asymptote-helper?style=flat-square&label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=rayhuang2006.asymptote-helper)
  [![Installs](https://img.shields.io/visual-studio-marketplace/i/rayhuang2006.asymptote-helper?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=rayhuang2006.asymptote-helper)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
</div>

<br />

**Asymptote** is a VS Code extension designed to help competitive programmers visualize the theoretical speed of their code *while typing*. It combines a heuristic complexity analyzer with a robust local test runner.

> **⚠️ Note:** The complexity analysis is **heuristic** and based on static analysis patterns. It provides a "worst-case estimation" to help you catch O(N^2) or O(2^N) slips before submission, but it is not a formal mathematical proof.

---

## How It Helps You During a Contest

1.  **Write Code:** Focus on your logic in C++.
2.  **Instant Analysis:** See a **worst-case time complexity** estimation directly above your function.
3.  **Sanity Check:** Catch accidental O(N^2) or O(2^N) logic before you even compile.
4.  **Local Runner:** Parse problems from Codeforces and run samples locally without switching windows.

---

## Features

### 1. Real-time Complexity Analysis (CodeLens)
See the Big O notation directly above your C++ functions. Asymptote parses your AST (Abstract Syntax Tree) to estimate time complexity.

* **Algebraic Awareness:** Understands that nested loops multiply (N * M).
* **Confidence System:** Marks analysis with `(?)` if unknown functions are detected.
* **Toggleable:** Use `Asymptote: Toggle Complexity Lens` to show/hide the analysis instantly.

![Complexity Analysis Demo](images/demo1.gif)

### 2. The Runner (Sidekick)
A dedicated sidebar for managing test cases without leaving your editor.

> 💡 **Concept:** Think of it as a lightweight **Codeforces local judge** built directly into VS Code.

* **Problem Parsing:** One-click import from **Codeforces**. Fetches title, limits, and sample cases.
* **Local Execution:** Compiles and runs your code against inputs.
* **Verdict Display:** Clear **AC**, **WA**, **TLE**, or **RE** status with execution time.
* **Strict Comparison Mode:** Option to enforce exact character-for-character matching for outputs, including trailing whitespaces.

![Runner Demo](images/demo2.gif)

### 3. Interactive Mode (Manual Judge)
Struggling with **Interactive Problems** (e.g., `? 1` -> `10`)? You no longer need to write a custom interactor.

* **Split-Column UI:** Left side is You (The Judge), Right side is Your Code.
* **Inline Input:** Type your response directly in the log flow, just like a terminal.
* **Automatic Piping:** Asymptote handles the complex process piping for you.

---

## Requirements

To use the **Runner** feature, you need:

* **C++ Compiler (GCC/G++)**: Must be installed and accessible in your system's PATH.
* **Browser**: **Google Chrome, Microsoft Edge, or Brave** is required for parsing problems from online judges. Asymptote will automatically locate your system installation.

> *Note: The Complexity Analysis features work out-of-the-box without any external dependencies.*

---

## Extension Settings

You can customize Asymptote via the Command Palette or VS Code Settings:

* `asymptote.enableCodeLens`: Enable/disable the complexity analysis CodeLens (default: `true`).
* `asymptote.chromePath`: Custom path to your browser executable (optional, if auto-detection fails).
* `asymptote.strictComparison`: Require exact character match for test cases, including trailing spaces and newlines (default: `false`).

---

## Future Roadmap

* **Manual Tagging & Community Rules:** UI to manually correct and annotate complexity for `(?)` functions, establishing a solid rule base.
* **Smart Cache (The Nexus):** Identify code structures via AST fingerprinting. Once a template is tagged, Asymptote remembers it.
* **AI Integration:** Incorporate LLMs to assist in evaluating complex algorithms that fall outside static analysis heuristics.

---

## Release Notes & Changelog

This project uses an automated CI/CD pipeline. All version history, release notes, and updates are automatically generated and maintained in the [CHANGELOG.md](CHANGELOG.md).

---

## Contributing

We welcome contributions! Asymptote follows a modern, automated development workflow:

1. Fork the repository and create your feature branch (`git checkout -b feature/amazing-feature`).
2. Commit your changes following the **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)** specification (e.g., `feat: add awesome feature`, `fix: resolve crash`). This is required for our automated release system.
3. Push to the branch (`git push origin feature/amazing-feature`).
4. Submit a Pull Request.

## License

Distributed under the MIT License. See `LICENSE` for more information.