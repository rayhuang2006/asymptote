# Change Log

All notable changes to the "asymptote" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.4.1](https://github.com/rayhuang2006/asymptote/compare/v0.4.0...v0.4.1) (2026-04-09)


### Bug Fixes

* disable visual debug mode and restore headless operation ([#35](https://github.com/rayhuang2006/asymptote/issues/35)) ([70378f0](https://github.com/rayhuang2006/asymptote/commit/70378f0f922307bfeed01c61c313a832fb014433))

## [0.4.0](https://github.com/rayhuang2006/asymptote/compare/v0.3.0...v0.4.0) (2026-04-09)


### Features

* add interactive mode for manual judging ([814097c](https://github.com/rayhuang2006/asymptote/commit/814097cbbf492c0658a2e1fb86410ee03a74e52d))
* add Python and Java support for complexity analysis (resolves [#5](https://github.com/rayhuang2006/asymptote/issues/5)) ([#17](https://github.com/rayhuang2006/asymptote/issues/17)) ([7dfcec3](https://github.com/rayhuang2006/asymptote/commit/7dfcec36c047b1d16fdf5bae259e773f62fda1c0))
* add strict comparison toggle (fixes [#1](https://github.com/rayhuang2006/asymptote/issues/1)) ([702d33d](https://github.com/rayhuang2006/asymptote/commit/702d33d8b497e2f31cbfea00bd0281da55c219df))
* auto-detect Edge and Brave browsers as fallback (resolves [#6](https://github.com/rayhuang2006/asymptote/issues/6)) ([#7](https://github.com/rayhuang2006/asymptote/issues/7)) ([8129e8a](https://github.com/rayhuang2006/asymptote/commit/8129e8ac62fbf8a4e17a36396342ba8e00d1617b))
* basic webview panel implementation ([3a2e5c9](https://github.com/rayhuang2006/asymptote/commit/3a2e5c9a9eeaa6fab3e8a62a9a98310f93e48247))
* complete AST analyzer testing infrastructure ([#13](https://github.com/rayhuang2006/asymptote/issues/13)) ([a2c62fe](https://github.com/rayhuang2006/asymptote/commit/a2c62fe44f919bea67e35e4a07c6dbc3e6ccc93f))
* complete complexity analysis with confidence score and toggle settings, fixed sidebar location ([47f276a](https://github.com/rayhuang2006/asymptote/commit/47f276ad2a7a491bc8ae712904fe5d29d2953339))
* complete composite analysis logic with unicode formatting and binary search fix ([c26406d](https://github.com/rayhuang2006/asymptote/commit/c26406da7be0a3751012c392e483b6ac8cb54405))
* complete runner UI integration and sidebar navigation ([9871592](https://github.com/rayhuang2006/asymptote/commit/98715925520123f3a2475d6940da930acd126378))
* complete system integration with clean code and performance guard ([f66536c](https://github.com/rayhuang2006/asymptote/commit/f66536cc9cee39f13cad1f471bf350d9981bb273))
* enhance runner UI with single-case execution, cloning, and id-based logic ([d3c334c](https://github.com/rayhuang2006/asymptote/commit/d3c334cbf29f1a6521bcc8828b25edc8f47fd178))
* implement algorithm fingerprinting with regex matching for Big-O analysis ([c6eb0d9](https://github.com/rayhuang2006/asymptote/commit/c6eb0d98ef87afd3c90e275817292d2f6752dea1))
* implement basic loop depth calculation for Big-O ([68a786b](https://github.com/rayhuang2006/asymptote/commit/68a786b4199c66971b7046545b0cdaffc2299c9c))
* implement basic recursion detection for complexity analysis ([493bd5d](https://github.com/rayhuang2006/asymptote/commit/493bd5de6ca0d61675b1e574b8bde2273b59091c))
* implement composite complexity analysis for nested loops and recursion ([d966aca](https://github.com/rayhuang2006/asymptote/commit/d966aca3df642ff9eaac0061e8784602b1eecf3b))
* implement functional C++ runner with compilation, execution, and auto-cleanup ([9e5a7b4](https://github.com/rayhuang2006/asymptote/commit/9e5a7b4545ce2850ace1235db8350f79482ca437))
* implement persistent state via workspaceState to prevent data loss on reload ([709982c](https://github.com/rayhuang2006/asymptote/commit/709982cfcbe2e40eac46fbe7b122240cc86390a1))
* implement strategy pattern for scraping, added NCU OJ support ([252f604](https://github.com/rayhuang2006/asymptote/commit/252f6040f278a28facb6076e937f28974d945015))
* implement tabbed workspace UI with problem view and mock data ([a7052b7](https://github.com/rayhuang2006/asymptote/commit/a7052b76e521cc40d110fa9831cf178011b65da8))
* initial commit with basic CodeLens UI ([9aad84c](https://github.com/rayhuang2006/asymptote/commit/9aad84c5fb53f6126865f5219edb064f9e247561))
* integrate tree-sitter-cpp and enable real parsing ([5f045c6](https://github.com/rayhuang2006/asymptote/commit/5f045c683186b46edf7d74c40312f31cebd53143))
* move runner to secondary sidebar (experimental) ([62f513e](https://github.com/rayhuang2006/asymptote/commit/62f513e3e21a6b1e5873d6aa445b517c1cd81a22))


### Bug Fixes

* add repository url and adjust engine version for publishing ([3c4a58f](https://github.com/rayhuang2006/asymptote/commit/3c4a58f7c53e4e32d81e31fe4a91e4006bb22978))
* forget to change the version ([64118b9](https://github.com/rayhuang2006/asymptote/commit/64118b988319a35fed9065037140832fd01e7ef6))
* implement multi-language execution strategy for local runner ([#21](https://github.com/rayhuang2006/asymptote/issues/21)) ([03d7e56](https://github.com/rayhuang2006/asymptote/commit/03d7e5637fd87d839a40810140f06ee2b84e5aaf)), closes [#20](https://github.com/rayhuang2006/asymptote/issues/20)
* integrate vsce publish into release workflow ([9e08ce0](https://github.com/rayhuang2006/asymptote/commit/9e08ce03719bc08c4bb7c2cab4264b4fceaff2a2))
* refine while loop complexity analysis and perfect unicode formatting ([8353bfa](https://github.com/rayhuang2006/asymptote/commit/8353bfa1d0300bbcb331e005fcfe9939b9627ae8))
* restore sidebar to secondarySidebar and stabilize core analysis logic ([48c94c7](https://github.com/rayhuang2006/asymptote/commit/48c94c7056e77621737c78728645f3f19d92313e))
* switch to system chrome using puppeteer-core to resolve binary issues ([dd3272e](https://github.com/rayhuang2006/asymptote/commit/dd3272e061a7a303463ee9b4163bb14e693fb005))

## [0.3.0](https://github.com/rayhuang2006/asymptote/compare/v0.2.1...v0.3.0) (2026-04-09)


### Features

* add Python and Java support for complexity analysis (resolves [#5](https://github.com/rayhuang2006/asymptote/issues/5)) ([#17](https://github.com/rayhuang2006/asymptote/issues/17)) ([7dfcec3](https://github.com/rayhuang2006/asymptote/commit/7dfcec36c047b1d16fdf5bae259e773f62fda1c0))

## [0.2.1](https://github.com/rayhuang2006/asymptote/compare/v0.2.0...v0.2.1) (2026-04-02)


### Bug Fixes

* integrate vsce publish into release workflow ([9e08ce0](https://github.com/rayhuang2006/asymptote/commit/9e08ce03719bc08c4bb7c2cab4264b4fceaff2a2))

## [0.2.0](https://github.com/rayhuang2006/asymptote/compare/v0.1.0...v0.2.0) (2026-04-02)


### Features

* complete AST analyzer testing infrastructure ([#13](https://github.com/rayhuang2006/asymptote/issues/13)) ([a2c62fe](https://github.com/rayhuang2006/asymptote/commit/a2c62fe44f919bea67e35e4a07c6dbc3e6ccc93f))

## [0.1.0](https://github.com/rayhuang2006/asymptote/compare/v0.0.5...v0.1.0) (2026-04-02)


### Features

* auto-detect Edge and Brave browsers as fallback (resolves [#6](https://github.com/rayhuang2006/asymptote/issues/6)) ([#7](https://github.com/rayhuang2006/asymptote/issues/7)) ([8129e8a](https://github.com/rayhuang2006/asymptote/commit/8129e8ac62fbf8a4e17a36396342ba8e00d1617b))

## [Unreleased]

- Initial release
