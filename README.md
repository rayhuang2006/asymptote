<div align="center">
  <img src="media/icon.png" width="120" alt="Asymptote Logo" />
  <h1>Asymptote</h1>
  <p><strong>Time Complexity Analysis & Companion for Competitive Programming</strong></p>

  [![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/rayhuang2006.asymptote-helper?style=flat-square&label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=rayhuang2006.asymptote-helper)
  [![Installs](https://img.shields.io/visual-studio-marketplace/i/rayhuang2006.asymptote-helper?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=rayhuang2006.asymptote-helper)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
</div>

<br />

**Asymptote** is a VS Code extension designed to help competitive programmers visualize the theoretical speed of their code *while typing*. It combines a heuristic complexity analyzer with a robust local test runner.

> **⚠️ Note:** The complexity analysis is **heuristic** and based on static analysis patterns. It provides a "worst-case estimation" to help you catch $O(N^2)$ or $O(2^N)$ slips before submission, but it is not a formal mathematical proof.

---

## 🚦 How It Helps You During a Contest

1.  **Write Code:** Focus on your logic in C++.
2.  **Instant Analysis:** See a **worst-case time complexity** estimation directly above your function.
3.  **Sanity Check:** Catch accidental $O(N^2)$ or $O(2^N)$ logic before you even compile.
4.  **Local Runner:** Parse problems from Codeforces and run samples locally without switching windows.

---

## ✨ Features

### 1. Real-time Complexity Analysis (CodeLens)
See the Big O notation directly above your C++ functions. Asymptote parses your AST (Abstract Syntax Tree) to estimate time complexity.

* **Algebraic Awareness:** Understands that nested loops multiply ($N \times N = N^2$).
* **Confidence System:** Marks analysis with `(?)` if unknown functions are detected.
* **Toggleable:** Use `Asymptote: Toggle Complexity Lens` to show/hide the analysis instantly.

![Complexity Analysis Demo](images/demo1.gif)

### 2. The Runner (Sidekick)
A dedicated sidebar for managing test cases without leaving your editor.

> 💡 **Concept:** Think of it as a lightweight **Codeforces local judge** built directly into VS Code.

* **Problem Parsing:** One-click import from **Codeforces**. Fetches title, limits, and sample cases.
* **Local Execution:** Compiles and runs your code against inputs.
* **Verdict Display:** Clear **AC**, **WA**, **TLE**, or **RE** status with execution time.

![Runner Demo](images/demo2.gif)

---

## 📋 Requirements

To use the **Runner** feature, you need:

* **C++ Compiler (GCC/G++)**: Must be installed and accessible in your system's PATH.
* **Google Chrome**: Required for parsing problems from online judges (Codeforces). Asymptote will try to locate your system installation automatically.

> *Note: The Complexity Analysis features work out-of-the-box without any external dependencies.*

---

## ⚙️ Extension Settings

You can toggle the complexity CodeLens via the Command Palette or Settings:

* `asymptote.enableCodeLens`: Enable/disable the complexity analysis CodeLens (default: `true`).
* `asymptote.chromePath`: Custom path to the Chrome executable (optional, if auto-detection fails).

💡 **Tip:** You can also toggle it quickly via `Cmd/Ctrl + Shift + P` → `Asymptote: Toggle Complexity Lens`.

---

## 🧩 Supported Logic (Heuristics)

| Structure | Complexity Estimation |
| :--- | :--- |
| Simple Loops | $O(N)$ |
| Nested Loops | Multiplicative ($N \times M$) |
| Divide & Conquer (e.g., `k *= 2`) | $O(\log N)$ |
| `std::sort` | $O(N \log N)$ |
| `std::lower_bound` | $O(\log N)$ |
| Branching Recursion | $O(2^N)$ |

## ⚠️ Known Limitations

Asymptote is designed to be a helpful companion, not a formal verifier. Please be aware:

* **Static Analysis Only:** Complexity is estimated based on code structure (AST). It does not execute the code or analyze runtime values.
* **Recursion:** Complex recursive patterns or master theorem cases might be marked as `(?)` or underestimated.
* **Space Complexity:** Currently, only time complexity is analyzed.

---

## 🚀 Release Notes

### 0.1.0 (Planned)
* **Smart Cache (The Nexus):** Identify code structures via AST fingerprinting. Once you tag a template (e.g., Segment Tree) as $O(\log N)$, Asymptote will remember it forever.
* **Manual Tagging:** UI to manually correct/annotate complexity for `(?)` functions.

### 0.0.2
* **Fix:** Switched to using system Chrome (`puppeteer-core`) to resolve "Chromium not found" errors on users' machines.
* **New:** Auto-detection of Chrome path with a fallback manual selection dialog.

### 0.0.1
Initial release of Asymptote!
* Added Heuristic Complexity Analysis CodeLens.
* Added Secondary Sidebar Runner with Codeforces parsing.

---

## 🤝 Contributing

This project is open source! If you want to add support for more algorithms or improve the detection logic:

1.  Fork the repository.
2.  Create your feature branch.
3.  Submit a Pull Request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.