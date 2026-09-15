const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Reports failures, and brackets each build with the lines the task's problem
 * matcher watches for. Without them the editor waits forever for a watch task
 * that never says it has finished.
 */
const reportProblems = {
    name: 'report-problems',
    setup(build) {
        build.onStart(() => {
            if (watch) {
                console.log('[watch] build started');
            }
        });

        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}`);
                }
            });

            if (watch) {
                console.log('[watch] build finished');
            } else if (result.errors.length === 0) {
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
        // Provided by the editor at runtime, never bundled.
        external: ['vscode'],
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
