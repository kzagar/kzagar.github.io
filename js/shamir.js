// js/shamir.js
const Shamir = (() => {
    const PRIME = 257; // Smallest prime > 255 (for byte-wise operations)
    const CHARSET = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; // 35 characters
    const CHARSET_LOOKUP = {};
    for (let i = 0; i < CHARSET.length; i++) {
        CHARSET_LOOKUP[CHARSET[i]] = i;
    }

    // --- Helper Functions ---

    function textToBytes(text) {
        return Array.from(new TextEncoder().encode(text));
    }

    function bytesToText(bytes) {
        return new TextDecoder().decode(new Uint8Array(bytes));
    }

    // Modular arithmetic helpers
    function mod(n, m) {
        return ((n % m) + m) % m;
    }

    function extendedEuclideanAlgorithm(a, b) {
        if (a === 0) return [b, 0, 1];
        const [gcd, x1, y1] = extendedEuclideanAlgorithm(b % a, a);
        const x = y1 - Math.floor(b / a) * x1;
        const y = x1;
        return [gcd, x, y];
    }

    function modInverse(a, m) {
        const [gcd, x] = extendedEuclideanAlgorithm(a, m);
        if (gcd !== 1) throw new Error("Modular inverse does not exist");
        return mod(x, m);
    }

    // Polynomial evaluation: P(x) = coeffs[0] + coeffs[1]*x + ...
    // Here, coeffs[0] is the secret byte.
    function evaluatePolynomial(coeffs, x, prime) {
        let result = 0;
        let xPower = 1;
        for (let i = 0; i < coeffs.length; i++) {
            result = mod(result + coeffs[i] * xPower, prime);
            xPower = mod(xPower * x, prime);
        }
        return result;
    }
    
    // --- Share Encoding/Decoding ---

    // Encodes a value (0-34) to a single character from CHARSET
    function valueToChar(val) {
        if (val < 0 || val >= CHARSET.length) throw new Error(`Value ${val} out of CHARSET range`);
        return CHARSET[val];
    }

    // Decodes a single character from CHARSET to its value (0-34)
    function charToValue(char) {
        if (CHARSET_LOOKUP[char] === undefined) throw new Error(`Character '${char}' not in CHARSET`);
        return CHARSET_LOOKUP[char];
    }

    // Encodes a byte (0-255) into two CHARSET characters
    function byteToTwoChars(byteVal) {
        // byteVal can be 0 to PRIME-1 (0 to 256 in this case)
        if (byteVal < 0 || byteVal >= PRIME) {
            throw new Error(`Byte value ${byteVal} out of range 0-${PRIME-1} for 2-char encoding`);
        }
        const q = Math.floor(byteVal / CHARSET.length);
        const r = byteVal % CHARSET.length;
        return valueToChar(q) + valueToChar(r);
    }

    // Decodes two CHARSET characters into a byte (0-255)
    function twoCharsToByte(chars) {
        if (chars.length !== 2) throw new Error("Two-character string expected for byte decoding");
        const qVal = charToValue(chars[0]);
        const rVal = charToValue(chars[1]);
        return qVal * CHARSET.length + rVal;
    }
    
    function generateControlChar(dataChars) { // dataChars is a string of CHARSET characters
        let sum = 0;
        for (let i = 0; i < dataChars.length; i++) {
            sum = (sum + charToValue(dataChars[i])) % CHARSET.length;
        }
        return valueToChar(sum);
    }

    // Formats the raw data string (x_char + y_chars_concatenated) into groups of 4 with a control char
    function formatShareOutputString(rawDataStringWithTAndX) {
        const controlChar = generateControlChar(rawDataStringWithTAndX);
        const stringToFormat = rawDataStringWithTAndX + controlChar; // Append control char first
        
        let formatted = "";
        for (let i = 0; i < stringToFormat.length; i++) {
            if (i > 0 && i % 4 === 0) {
                formatted += "-";
            }
            formatted += stringToFormat[i];
        }
        return formatted;
    }

    // Parses the formatted share string, validates control char, and returns components
    function parseShareInputString(shareString) {
        const combinedString = shareString.replace(/-/g, ''); // Remove all hyphens to get continuous string

        if (combinedString.length < 3) throw new Error("Invalid share string: too short after removing hyphens."); // Min: T, X, Control

        const controlChar = combinedString.slice(-1);
        const dataPortion = combinedString.slice(0, -1); // All chars except the last one (control char)

        if (generateControlChar(dataPortion) !== controlChar) {
            throw new Error("Control character mismatch - share corrupted or invalid.");
        }

        if (dataPortion.length < 2) throw new Error("Data portion of share too short (missing T or X).");

        const t_char = dataPortion[0];
        const x_char = dataPortion[1];
        const y_chars_flat = dataPortion.substring(2);

        if (y_chars_flat.length % 2 !== 0) throw new Error("Invalid share data length for y values.");

        const embedded_t = charToValue(t_char) + 1; // t is 1-based (min 2 in UI)
        const x_coord = charToValue(x_char) + 1;    // x-coordinates are 1-based

        const y_values = [];
        for (let i = 0; i < y_chars_flat.length; i += 2) {
            y_values.push(twoCharsToByte(y_chars_flat.substring(i, i + 2)));
        }
        return { t: embedded_t, x: x_coord, y_values: y_values };
    }


    // --- Core SSS Functions ---

    function split(secretText, numShares_s, threshold_t) {
        const secretBytes = textToBytes(secretText);
        if (secretBytes.length === 0) throw new Error("Secret cannot be empty.");
        if (secretBytes.length > 32) throw new Error("Secret too long (max 32 bytes).");
        if (threshold_t > numShares_s) throw new Error("Threshold cannot exceed number of shares.");
        if (threshold_t < 2) throw new Error("Threshold must be at least 2.");
        if (threshold_t -1 >= CHARSET.length) throw new Error(`Threshold t (${threshold_t}) too large for CHARSET encoding.`);
        if (numShares_s -1 >= CHARSET.length) throw new Error(`Number of shares s (${numShares_s}) too large for CHARSET encoding.`);


        const resultSharesStrings = [];
        const bytePolynomialCoefficients = [];

        for (let j = 0; j < secretBytes.length; j++) {
            const byteSecret = secretBytes[j];
            const coeffs = [byteSecret]; 
            for (let i = 1; i < threshold_t; i++) {
                // Use crypto.getRandomValues for cryptographically secure random numbers
                const randomBytes = new Uint8Array(1);
                window.crypto.getRandomValues(randomBytes);
                coeffs.push(randomBytes[0] % (PRIME -1)); // Ensure coefficient is < PRIME-1
            }
            bytePolynomialCoefficients.push(coeffs);
        }

        for (let i = 1; i <= numShares_s; i++) { 
            const x_coord_val = i;
            const t_char = valueToChar(threshold_t - 1); // t is min 2, so t-1 is min 1.
            const x_char = valueToChar(x_coord_val - 1); // x_coord_val is min 1.
            let rawShareDataString = t_char + x_char;

            for (let j = 0; j < secretBytes.length; j++) {
                const y_val_for_byte = evaluatePolynomial(bytePolynomialCoefficients[j], x_coord_val, PRIME);
                rawShareDataString += byteToTwoChars(y_val_for_byte);
            }
            resultSharesStrings.push(formatShareOutputString(rawShareDataString));
        }
        return resultSharesStrings;
    }

    function reconstruct(shareStrings) {
        if (shareStrings.length === 0) throw new Error("No shares provided for reconstruction.");
        
        const parsedShares = shareStrings.map(s => parseShareInputString(s));

        if (parsedShares.length === 0) throw new Error("Cannot reconstruct with zero parsed shares."); // Should be caught by shareStrings.length check

        // Check for consistent 't' and if enough shares are provided
        const firstEmbeddedT = parsedShares[0].t;
        for (let i = 1; i < parsedShares.length; i++) {
            if (parsedShares[i].t !== firstEmbeddedT) {
                throw new Error("Inconsistent threshold (t) values in provided shares.");
            }
        }
        
        if (parsedShares.length < firstEmbeddedT) {
            throw new Error(`Not enough shares provided for reconstruction. Required: ${firstEmbeddedT}, Provided: ${parsedShares.length}.`);
        }

        // Proceed with reconstruction
        const numBytes = parsedShares[0].y_values.length;
        const reconstructedBytes = [];

        for (let byteIdx = 0; byteIdx < numBytes; byteIdx++) {
            let sum = 0;
            // Use only 'firstEmbeddedT' shares for reconstruction if more are provided,
            // or use all if parsedShares.length is exactly firstEmbeddedT.
            // For simplicity and to use all distinct information if available (though SSS only needs t),
            // we'll use all provided (and validated) shares. The check above ensures we have at least 't'.
            const sharesToUse = parsedShares; // Or: parsedShares.slice(0, firstEmbeddedT);

            for (let i = 0; i < sharesToUse.length; i++) {
                const currentShare = sharesToUse[i];
                const xi = currentShare.x;
                const yi_byte = currentShare.y_values[byteIdx];
                
                let lagrangeNumerator = 1;
                let lagrangeDenominator = 1;

                for (let j = 0; j < sharesToUse.length; j++) {
                    if (i === j) continue;
                    const xj = sharesToUse[j].x;
                    lagrangeNumerator = mod(lagrangeNumerator * (-xj), PRIME);
                    lagrangeDenominator = mod(lagrangeDenominator * (xi - xj), PRIME);
                }
                
                const term = mod(yi_byte * lagrangeNumerator * modInverse(lagrangeDenominator, PRIME), PRIME);
                sum = mod(sum + term, PRIME);
            }
            reconstructedBytes.push(sum);
        }
        return bytesToText(reconstructedBytes);
    }

    return {
        split: split,
        reconstruct: reconstruct
    };
})();