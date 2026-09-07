export class Complexity {
    private polynomialFactors: Map<string, number>;
    private logarithmicFactors: Map<string, number>;
    private additiveTerms: Complexity[] | null;
    public isExp: boolean;
    public isEstimate: boolean;

    constructor(n: number = 0, log: number = 0, isExp: boolean = false, isEstimate: boolean = false) {
        this.polynomialFactors = new Map();
        this.logarithmicFactors = new Map();
        this.additiveTerms = null;
        this.isExp = isExp;
        this.isEstimate = isEstimate;

        if (n > 0) {
            this.polynomialFactors.set('N', n);
        }
        if (log > 0) {
            this.logarithmicFactors.set('N', log);
        }
    }

    /** Backward-compatible accessors for the original N/log-N model. */
    get n(): number {
        return this.additiveTerms ? 0 : (this.polynomialFactors.get('N') || 0);
    }

    set n(value: number) {
        this.setFactor(this.polynomialFactors, 'N', value);
    }

    get log(): number {
        return this.additiveTerms ? 0 : (this.logarithmicFactors.get('N') || 0);
    }

    set log(value: number) {
        this.setFactor(this.logarithmicFactors, 'N', value);
    }

    static variable(name: string, isEstimate: boolean = false): Complexity {
        return this.power(name, 1, isEstimate);
    }

    static logarithmic(name: string, isEstimate: boolean = false): Complexity {
        const complexity = new Complexity(0, 0, false, isEstimate);
        complexity.logarithmicFactors.set(this.normalizeSymbol(name), 1);
        return complexity;
    }

    static squareRoot(name: string, isEstimate: boolean = false): Complexity {
        return this.power(name, 0.5, isEstimate);
    }

    static fromString(s: string): Complexity {
        if (s.includes('2^N')) {
            return new Complexity(0, 0, true);
        }
        if (s.includes('sqrt(N)') || s.includes('√N')) {
            return Complexity.squareRoot('N');
        }
        if (s.includes('N^2')) {
            return new Complexity(2, 0);
        }
        if (s.includes('N log N')) {
            return new Complexity(1, 1);
        }
        if (s.includes('log N')) {
            return new Complexity(0, 1);
        }
        if (s.includes('O(N)')) {
            return new Complexity(1, 0);
        }
        if (s.includes('O(1)')) {
            return new Complexity(0, 0);
        }
        if (s.includes('N')) {
            return new Complexity(1, 0);
        }
        return new Complexity(0, 0);
    }

    add(other: Complexity): Complexity {
        const allTerms = [
            ...this.getMonomialTerms().map(term => term.cloneMonomial()),
            ...other.getMonomialTerms().map(term => term.cloneMonomial())
        ];
        return Complexity.fromTerms(allTerms, this.isEstimate || other.isEstimate);
    }

    multiply(other: Complexity): Complexity {
        const products: Complexity[] = [];
        for (const left of this.getMonomialTerms()) {
            for (const right of other.getMonomialTerms()) {
                products.push(left.multiplyMonomial(right));
            }
        }
        return Complexity.fromTerms(products, this.isEstimate || other.isEstimate);
    }

    root(degree: number): Complexity {
        if (degree <= 0) {
            return new Complexity(0, 0, false, true);
        }
        const rootedTerms = this.getMonomialTerms().map(term => {
            const rooted = term.cloneMonomial();
            for (const [symbol, exponent] of rooted.polynomialFactors) {
                rooted.polynomialFactors.set(symbol, exponent / degree);
            }
            for (const [symbol, exponent] of rooted.logarithmicFactors) {
                rooted.logarithmicFactors.set(symbol, exponent / degree);
            }
            return rooted;
        });
        return Complexity.fromTerms(rootedTerms, this.isEstimate);
    }

    compare(other: Complexity): number {
        const leftTerms = this.getMonomialTerms();
        const rightTerms = other.getMonomialTerms();
        const leftDominates = rightTerms.every(right => leftTerms.some(left => left.dominatesMonomial(right)));
        const rightDominates = leftTerms.every(left => rightTerms.some(right => right.dominatesMonomial(left)));

        if (leftDominates && !rightDominates) {
            return 1;
        }
        if (rightDominates && !leftDominates) {
            return -1;
        }
        return 0;
    }

    toString(): string {
        const suffix = this.isEstimate ? ' (?)' : '';
        return `O( ${this.formatExpression()} )${suffix}`;
    }

    private static power(name: string, exponent: number, isEstimate: boolean): Complexity {
        const complexity = new Complexity(0, 0, false, isEstimate);
        complexity.polynomialFactors.set(this.normalizeSymbol(name), exponent);
        return complexity;
    }

    private static normalizeSymbol(name: string): string {
        const trimmed = name.trim();
        return trimmed ? trimmed.toUpperCase() : 'N';
    }

    private static fromTerms(terms: Complexity[], isEstimate: boolean): Complexity {
        const simplified: Complexity[] = [];

        for (const candidate of terms) {
            const duplicate = simplified.find(term => term.sameMonomial(candidate));
            if (duplicate) {
                continue;
            }
            if (simplified.some(term => term.dominatesMonomial(candidate))) {
                continue;
            }
            for (let index = simplified.length - 1; index >= 0; index--) {
                if (candidate.dominatesMonomial(simplified[index])) {
                    simplified.splice(index, 1);
                }
            }
            simplified.push(candidate.cloneMonomial());
        }

        if (simplified.length === 1) {
            simplified[0].isEstimate = isEstimate;
            return simplified[0];
        }

        const result = new Complexity(0, 0, false, isEstimate);
        result.additiveTerms = simplified;
        result.isExp = simplified.some(term => term.isExp);
        return result;
    }

    private getMonomialTerms(): Complexity[] {
        return this.additiveTerms || [this];
    }

    private cloneMonomial(): Complexity {
        const clone = new Complexity(0, 0, this.isExp, this.isEstimate);
        this.copyFactorsInto(this.polynomialFactors, clone.polynomialFactors);
        this.copyFactorsInto(this.logarithmicFactors, clone.logarithmicFactors);
        return clone;
    }

    private multiplyMonomial(other: Complexity): Complexity {
        if (this.isExp || other.isExp) {
            return new Complexity(0, 0, true, this.isEstimate || other.isEstimate);
        }

        const result = new Complexity(0, 0, false, this.isEstimate || other.isEstimate);
        this.copyFactorsInto(this.polynomialFactors, result.polynomialFactors);
        this.copyFactorsInto(this.logarithmicFactors, result.logarithmicFactors);
        other.copyFactorsInto(other.polynomialFactors, result.polynomialFactors);
        other.copyFactorsInto(other.logarithmicFactors, result.logarithmicFactors);
        return result;
    }

    private sameMonomial(other: Complexity): boolean {
        return this.isExp === other.isExp &&
            this.sameFactors(this.polynomialFactors, other.polynomialFactors) &&
            this.sameFactors(this.logarithmicFactors, other.logarithmicFactors);
    }

    private dominatesMonomial(other: Complexity): boolean {
        if (this.isExp) {
            return true;
        }
        if (other.isExp) {
            return false;
        }

        const symbols = new Set([
            ...this.polynomialFactors.keys(),
            ...other.polynomialFactors.keys(),
            ...this.logarithmicFactors.keys(),
            ...other.logarithmicFactors.keys()
        ]);

        for (const symbol of symbols) {
            const polynomial = this.polynomialFactors.get(symbol) || 0;
            const otherPolynomial = other.polynomialFactors.get(symbol) || 0;
            if (polynomial < otherPolynomial) {
                return false;
            }
            if (polynomial === otherPolynomial) {
                const logarithmic = this.logarithmicFactors.get(symbol) || 0;
                const otherLogarithmic = other.logarithmicFactors.get(symbol) || 0;
                if (logarithmic < otherLogarithmic) {
                    return false;
                }
            }
        }
        return true;
    }

    private sameFactors(left: Map<string, number>, right: Map<string, number>): boolean {
        if (left.size !== right.size) {
            return false;
        }
        for (const [symbol, exponent] of left) {
            if (right.get(symbol) !== exponent) {
                return false;
            }
        }
        return true;
    }

    private setFactor(factors: Map<string, number>, symbol: string, value: number): void {
        if (value > 0) {
            factors.set(symbol, value);
        } else {
            factors.delete(symbol);
        }
    }

    private copyFactorsInto(source: Map<string, number>, target: Map<string, number>): void {
        for (const [symbol, exponent] of source) {
            target.set(symbol, (target.get(symbol) || 0) + exponent);
        }
    }

    private formatExpression(): string {
        if (this.additiveTerms) {
            return this.additiveTerms.map(term => term.formatMonomial()).join(' + ');
        }
        return this.formatMonomial();
    }

    private formatMonomial(): string {
        if (this.isExp) {
            return '2ᴺ';
        }
        const parts = [
            ...this.formatFactors(this.polynomialFactors, symbol => symbol),
            ...this.formatFactors(this.logarithmicFactors, symbol => `log ${symbol}`, true)
        ];
        return parts.length > 0 ? parts.join(' ') : '1';
    }

    private formatFactors(
        factors: Map<string, number>,
        formatSymbol: (symbol: string) => string,
        wrapPoweredFactor: boolean = false
    ): string[] {
        return [...factors.entries()]
            .sort(([left], [right]) => {
                if (left === 'N') {
                    return -1;
                }
                if (right === 'N') {
                    return 1;
                }
                return left.localeCompare(right);
            })
            .map(([symbol, exponent]) => {
                const formattedSymbol = formatSymbol(symbol);
                if (exponent === 1) {
                    return formattedSymbol;
                }
                if (exponent === 0.5 && !wrapPoweredFactor) {
                    return `√${formattedSymbol}`;
                }
                const base = wrapPoweredFactor ? `(${formattedSymbol})` : formattedSymbol;
                return `${base}${this.toSuperscript(exponent)}`;
            });
    }

    private toSuperscript(num: number): string {
        if (!Number.isInteger(num)) {
            return `^${num}`;
        }
        const superscripts: { [key: string]: string } = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
            '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
        };
        return num.toString().split('').map(char => superscripts[char] || char).join('');
    }
}
