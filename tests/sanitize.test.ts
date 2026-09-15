/// <reference types="mocha" />
import * as assert from 'assert';
import { sanitizeStatement } from '../src/scraper/sanitize';

describe('Statement sanitising', () => {
    it('drops a colour written for the judge\'s own page', () => {
        const cleaned = sanitizeStatement('<p style="color: rgb(51, 51, 51)">text</p>');

        assert.ok(!cleaned.includes('color'));
        assert.ok(cleaned.includes('text'));
    });

    it('keeps the declarations that carry meaning', () => {
        const cleaned = sanitizeStatement('<p style="color: #333; text-align: center">text</p>');

        assert.ok(cleaned.includes('text-align: center'));
        assert.ok(!cleaned.includes('#333'));
    });

    it('removes the attribute entirely when nothing is left of it', () => {
        assert.strictEqual(sanitizeStatement('<p style="color:#333">t</p>'), '<p>t</p>');
    });

    it('drops the colours of a font tag', () => {
        const cleaned = sanitizeStatement('<font color="#333" size="2">t</font>');

        assert.ok(!cleaned.includes('color'));
        assert.ok(!cleaned.includes('size'));
    });

    it('leaves markup that carries no styling alone', () => {
        const html = '<p>plain <b>text</b></p>';

        assert.strictEqual(sanitizeStatement(html), html);
    });

    it('strips a background as well, which fights the theme just as hard', () => {
        assert.strictEqual(
            sanitizeStatement('<div style="background-color: #fff; color: #000">t</div>'),
            '<div>t</div>'
        );
    });
});
