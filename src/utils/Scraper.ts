import * as vscode from 'vscode';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-core';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
const chromeFinder = require('chrome-finder');

export interface ParsedProblem {
    title: string;
    timeLimit: string;
    memoryLimit: string;
    htmlContent: string;
    testCases: { input: string; expected: string; id: string }[];
}

export class Scraper {
    static async parse(url: string): Promise<ParsedProblem> {
        let browser = null;
        try {
            const config = vscode.workspace.getConfiguration('asymptote');
            let executablePath = config.get<string>('chromePath') || '';

            if (!executablePath) {
                try {
                    executablePath = chromeFinder();
                } catch (e) {
                    console.log(e);
                }
            }

            if (!executablePath) {
                const selection = await vscode.window.showErrorMessage(
                    "Asymptote needs Google Chrome to parse problems. Please select your Chrome executable.",
                    "Locate Chrome", "Cancel"
                );

                if (selection === "Locate Chrome") {
                    const fileUri = await vscode.window.showOpenDialog({
                        canSelectFiles: true,
                        canSelectFolders: false,
                        canSelectMany: false,
                        filters: { 'Executables': ['exe', 'app', ''] },
                        openLabel: "Select Chrome"
                    });

                    if (fileUri && fileUri[0]) {
                        executablePath = fileUri[0].fsPath;
                        if (process.platform === 'darwin' && executablePath.endsWith('.app')) {
                            executablePath += '/Contents/MacOS/Google Chrome';
                        }
                        await config.update('chromePath', executablePath, vscode.ConfigurationTarget.Global);
                    }
                }
            }

            if (!executablePath) {
                throw new Error("Chrome path not found. Cannot parse.");
            }

            const puppeteerExtra = addExtra(puppeteer);
            puppeteerExtra.use(StealthPlugin());

            browser = await puppeteerExtra.launch({
                headless: true,
                executablePath: executablePath,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            const content = await page.content();
            const $ = cheerio.load(content);

            if (url.includes('codeforces.com')) {
                return this.parseCodeforces($);
            } else {
                return this.parseNcuOj($);
            }

        } catch (error: any) {
            console.error(error);
            throw new Error(error.message || 'Scraping failed.');
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    private static parseCodeforces($: cheerio.CheerioAPI): ParsedProblem {
        if ($('body').text().includes('Just a moment...') || $('#challenge-running').length > 0) {
            throw new Error('Cloudflare Protection Triggered.');
        }

        const problemStatement = $('.problem-statement');
        if (problemStatement.length === 0) {
            throw new Error('Problem statement not found.');
        }

        const title = problemStatement.find('.header .title').text().trim();
        const timeLimit = problemStatement.find('.header .time-limit').text().replace('time limit per test', '').trim();
        const memoryLimit = problemStatement.find('.header .memory-limit').text().replace('memory limit per test', '').trim();

        const testCases: { input: string; expected: string; id: string }[] = [];
        const inputNodes = problemStatement.find('.sample-test .input pre');
        const outputNodes = problemStatement.find('.sample-test .output pre');

        inputNodes.each((i, elem) => {
            let input = '';
            const $input = $(elem);
            
            if ($input.find('div').length > 0) {
                $input.find('div').each((_, div) => {
                    input += $(div).text() + '\n';
                });
            } else {
                input = $input.html()?.replace(/<br>/g, '\n') || '';
                input = cheerio.load(input).text();
            }

            let expected = '';
            const $output = $(outputNodes[i]);

            if ($output.find('div').length > 0) {
                $output.find('div').each((_, div) => {
                    expected += $(div).text() + '\n';
                });
            } else {
                expected = $output.html()?.replace(/<br>/g, '\n') || '';
                expected = cheerio.load(expected).text();
            }
            
            testCases.push({
                id: `case-${Date.now()}-${i}`,
                input: input.trim(),
                expected: expected.trim()
            });
        });

        const contentClone = problemStatement.clone();
        
        contentClone.find('.header').remove();
        contentClone.find('.sample-test').remove();
        contentClone.find('.MathJax_Preview').remove();
        contentClone.find('.MathJax_Display').remove();
        contentClone.find('.MathJax').remove();

        contentClone.find('script[type="math/tex"]').each((_, elem) => {
            const tex = $(elem).html();
            $(elem).replaceWith(`$${tex}$`);
        });

        contentClone.find('script[type="math/tex; mode=display"]').each((_, elem) => {
            const tex = $(elem).html();
            $(elem).replaceWith(`$$${tex}$$`);
        });

        contentClone.find('script').remove();
        
        contentClone.find('img').each((_, img) => {
            const src = $(img).attr('src');
            if (src && !src.startsWith('http')) {
                $(img).attr('src', `https://codeforces.com${src}`);
            }
            $(img).css('max-width', '100%');
        });

        return {
            title,
            timeLimit,
            memoryLimit,
            htmlContent: contentClone.html() || '',
            testCases
        };
    }

    private static parseNcuOj($: cheerio.CheerioAPI): ParsedProblem {
        const title = $('.ivu-card-head').first().text().trim() || $('title').text().trim();
        
        let timeLimit = 'Unknown';
        let memoryLimit = 'Unknown';
        
        const infoText = $('body').text();
        const timeMatch = infoText.match(/Time Limit:\s*(\d+\s*s)/i);
        const memMatch = infoText.match(/Memory Limit:\s*(\d+\s*MB)/i);
        
        if (timeMatch) timeLimit = timeMatch[1];
        if (memMatch) memoryLimit = memMatch[1];

        const testCases: { input: string; expected: string; id: string }[] = [];
        
        const preElements = $('#problem-content pre');
        
        for (let i = 0; i < preElements.length; i += 2) {
            if (i + 1 < preElements.length) {
                testCases.push({
                    id: `case-ncu-${i}`,
                    input: $(preElements[i]).text().trim(),
                    expected: $(preElements[i+1]).text().trim()
                });
            }
        }

        const htmlContent = $('#problem-content').html() || '<div>Content not found</div>';

        return {
            title,
            timeLimit,
            memoryLimit,
            htmlContent,
            testCases
        };
    }
}