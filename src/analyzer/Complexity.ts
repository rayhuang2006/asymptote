export class Complexity {
    private polynomialFactors: Map<string, number>;
    private logarithmicFactors: Map<string, number>;
    public isExp: boolean;
    public isEstimate: boolean;

    constructor(n: number = 0, log: number = 0, isExp: boolean = false, isEstimate: boolean = false) {
        this.polynomialFactors = new Map();
        this.logarithmicFactors = new Map();
        this.isExp = isExp;
        this.isEstimate = isEstimate;

        if (n > 0) {
            this.polynomialFactors.set('N', n);
        }
        if (log > 0) {
            this.logarithmicFactors.set('N', log);
        }
    }

    /**
     * Backward-compatible accessors for the original O(N^n (log N)^log) model.
     * New analysis should use variable() and logarithmic() so loop bounds retain
     * their own symbols.
     */
    get n(): number {
        return this.polynomialFactors.get('N') || 0;
    }

    set n(value: number) {
        this.setFactor(this.polynomialFactors, 'N', value);
    }

    get log(): number {
        return this.logarithmicFactors.get('N') || 0;
    }

    set log(value: number) {
        this.setFactor(this.logarithmicFactors, 'N', value);
    }

    static variable(name: string, isEstimate: boolean = false): Complexity {
        const complexity = new Complexity(0, 0, false, isEstimate);
        complexity.polynomialFactors.set(this.normalizeSymbol(name), 1);
        return complexity;
    }

    static logarithmic(name: string, isEstimate: boolean = false): Complexity {
        const complexity = new Complexity(0, 0, false, isEstimate);
        complexity.logarithmicFactors.set(this.normalizeSymbol(name), 1);
        return complexity;
    }

    static fromString(s: string): Complexity {
        if (s.includes('2^N')) {
            return new Complexity(0, 0, true);
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

    multiply(other: Complexity): Complexity {
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

    compare(other: Complexity): number {
        if (this.isExp && !other.isExp) {
            return 1;
        }
        if (!this.isExp && other.isExp) {
            return -1;
        }
        if (this.isExp && other.isExp) {
            return 0;
        }

        const polynomialDifference = this.totalDegree(this.polynomialFactors) - other.totalDegree(other.polynomialFactors);
        if (polynomialDifference !== 0) {
            return polynomialDifference;
        }

        const logarithmicDifference = this.totalDegree(this.logarithmicFactors) - other.totalDegree(other.logarithmicFactors);
        if (logarithmicDifference !== 0) {
            return logarithmicDifference;
        }

        // O(N) and O(M) cannot be ordered without knowing how the inputs relate.
        return 0;
    }

    toString(): string {
        let baseStr = '';
        if (this.isExp) {
            baseStr = '2ᴺ';
        } else {
            const parts = [
                ...this.formatFactors(this.polynomialFactors, symbol => symbol),
                ...this.formatFactors(this.logarithmicFactors, symbol => `log ${symbol}`, true)
            ];
            baseStr = parts.length > 0 ? parts.join(' ') : '1';
        }

        const suffix = this.isEstimate ? ' (?)' : '';
        return `O( ${baseStr} )${suffix}`;
    }

    private static normalizeSymbol(name: string): string {
        const trimmed = name.trim();
        return trimmed ? trimmed.toUpperCase() : 'N';
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

    private totalDegree(factors: Map<string, number>): number {
        let degree = 0;
        for (const exponent of factors.values()) {
            degree += exponent;
        }
        return degree;
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
                const base = wrapPoweredFactor ? `(${formattedSymbol})` : formattedSymbol;
                return `${base}${this.toSuperscript(exponent)}`;
            });
    }

    private toSuperscript(num: number): string {
        const superscripts: { [key: string]: string } = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
            '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
        };
        return num.toString().split('').map(char => superscripts[char] || char).join('');
    }
}
