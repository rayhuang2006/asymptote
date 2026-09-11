const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Reports bundle failures the way the terminal and the problem matcher expect. */
const reportProblems = {
    name: 'report-problems',
    setup(build) {
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}`);
                }
            });
            if (result.errors.length === 0) {
                console.log(`build finished${production ? ' (production)' : ''}`);
            }
        });
    }
};

/**
 * web-tree-sitter loads tree-sitter.wasm from the directory of the script that
 * requires it, so bundling moves the lookup to dist/. Copy the file there.
 */
const copyTreeSitterWasm = {
    name: 'copy-tree-sitter-wasm',
    setup(build) {
        build.onEnd(() => {
            const source = require.resolve('web-tree-sitter/tree-sitter.wasm');
            const target = path.join(__dirname, 'dist', 'tree-sitter.wasm');
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(source, target);
        });
    }
};

async function main() {
    // A previous build's sourcemap must not survive into a production bundle.
    fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });

    const context = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        outfile: 'dist/extension.js',
        // vscode is provided by the editor. clone-deep and merge-deep reach their own
        // dependencies through lazy-cache, which resolves module names at runtime, so
        // bundling them yields an empty utils object and the stealth plugin throws.
        external: ['vscode', 'clone-deep', 'merge-deep'],
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        logLevel: 'silent',
        plugins: [copyTreeSitterWasm, reportProblems]
    });

    if (watch) {
        await context.watch();
        return;
    }

    await context.rebuild();
    await context.dispose();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
