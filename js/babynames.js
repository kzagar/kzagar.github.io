// --- DOM Element References ---
const lengthSlider = document.getElementById('nameLength');
const lengthValueSpan = document.getElementById('lengthValue');
const includeBasicCheckbox = document.getElementById('includeBasicLetters');
const includeSlovenianCheckbox = document.getElementById('includeSlovenian');
const includeAccentedCheckbox = document.getElementById('includeAccented');
const includeChineseCheckbox = document.getElementById('includeChinese');
const spinButton = document.getElementById('spinBtn');
const wheelCanvas = document.getElementById('wheelCanvas');
const wheelCtx = wheelCanvas.getContext('2d');
const resultContainer = document.getElementById('resultContainer');
const proposedNameDiv = document.getElementById('proposedName');

// --- Character Sets ---
const CHARS = {
    basic: 'abcdefghijklmnopqrstuvwxyz',
    slovenian: 'čšž',
    accented: 'äöüéèêëàáâãåæçñòóôõøùúûýÿ',
    chinese: '的一是不了人我在有他这为之大来以个中上们到说国和地也子时道出而要于就下得可你年生'
};

const SEGMENT_COLORS = ['#ff6b6b', '#feca57', '#1dd1a1', '#54a0ff', '#5f27cd', '#ff9ff3', '#48dbfb', '#c8d6e5'];
const NUM_SEGMENTS = 8;
const SPIN_DURATION_MS = 5000;

// Vowels across the supported Latin-based character sets (used to keep names pronounceable).
const VOWELS = 'aeiouAEIOU' + 'äöüéèêëàáâãåæòóôõøùúûýÿ';
// Maximum number of consonants in a row before we force a vowel.
const MAX_CONSECUTIVE_CONSONANTS = 2;

let segmentLabels = [];
let isSpinning = false;

// --- Event Listeners ---

lengthSlider.addEventListener('input', () => {
    lengthValueSpan.textContent = lengthSlider.value;
});

spinButton.addEventListener('click', spin);

// --- Core Logic Functions ---

/**
 * Builds the string of characters available based on the checked options.
 */
function getAvailableChars() {
    let chars = '';
    if (includeBasicCheckbox.checked) chars += CHARS.basic;
    if (includeSlovenianCheckbox.checked) chars += CHARS.slovenian;
    if (includeAccentedCheckbox.checked) chars += CHARS.accented;
    if (includeChineseCheckbox.checked) chars += CHARS.chinese;
    return chars;
}

/**
 * Picks a single random character out of the given string using secure randomness.
 */
function randomChar(chars) {
    const randomArray = new Uint32Array(1);
    window.crypto.getRandomValues(randomArray);
    return chars[randomArray[0] % chars.length];
}

/**
 * Tells whether a character counts as a vowel for the purpose of keeping names pronounceable.
 * Characters outside the Latin-based sets (e.g. Chinese) are treated as neutral - they don't
 * count as either a vowel or a consonant, since "consonant streaks" don't really apply to them.
 */
function isVowel(ch) {
    return VOWELS.includes(ch);
}
function isNeutral(ch) {
    return CHARS.chinese.includes(ch);
}

/**
 * Picks the next character of a name, avoiding long runs of consecutive consonants:
 * once MAX_CONSECUTIVE_CONSONANTS consonants have appeared in a row, it prefers a vowel
 * (if the available character set actually contains one).
 */
function pickNextChar(chars, consecutiveConsonants) {
    if (consecutiveConsonants >= MAX_CONSECUTIVE_CONSONANTS) {
        const vowelsInSet = chars.split('').filter(isVowel).join('');
        if (vowelsInSet.length > 0) {
            return randomChar(vowelsInSet);
        }
    }
    return randomChar(chars);
}

/**
 * Generates a random baby name of the given length from the available characters,
 * forcing it to start with the given first character (e.g. the one the wheel landed on).
 * Tries to alternate consonants and vowels so the result stays somewhat pronounceable.
 */
function generateName(length, chars, firstChar) {
    let name = firstChar;
    let consecutiveConsonants = isVowel(firstChar) || isNeutral(firstChar) ? 0 : 1;

    for (let i = 1; i < length; i++) {
        const nextChar = pickNextChar(chars, consecutiveConsonants);
        name += nextChar;

        if (isVowel(nextChar) || isNeutral(nextChar)) {
            consecutiveConsonants = 0;
        } else {
            consecutiveConsonants++;
        }
    }

    return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Determines which wheel segment is resting under the pointer (at the top of the wheel)
 * once the wheel has stopped rotating by the given angle (in radians).
 */
function getSegmentUnderPointer(rotation) {
    const anglePerSegment = (2 * Math.PI) / NUM_SEGMENTS;
    const pointerAngle = -Math.PI / 2; // top of the wheel, in canvas coordinates
    const TWO_PI = 2 * Math.PI;
    let originalAngle = (pointerAngle - rotation) % TWO_PI;
    if (originalAngle < 0) originalAngle += TWO_PI;
    const index = Math.floor(originalAngle / anglePerSegment) % NUM_SEGMENTS;
    return segmentLabels[index];
}

/**
 * Kicks off the wheel spin and, once it stops, reveals the proposed name.
 */
function spin() {
    if (isSpinning) return;

    const chars = getAvailableChars();
    if (chars.length === 0) {
        resultContainer.classList.remove('hidden');
        proposedNameDiv.textContent = '';
        proposedNameDiv.innerHTML = '<span style="color: red; font-size: 18px;">Izberite vsaj eno skupino znakov.</span>';
        return;
    }

    resultContainer.classList.add('hidden');
    isSpinning = true;
    spinButton.disabled = true;

    // Refresh the characters shown on the wheel for this spin.
    segmentLabels = [];
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        segmentLabels.push(randomChar(chars));
    }

    const startTime = performance.now();
    // Spin between 4 and 6 full turns, plus a random final resting angle.
    const extraTurns = 4 + Math.random() * 2;
    const finalOffset = Math.random() * 2 * Math.PI;
    const totalRotation = extraTurns * 2 * Math.PI + finalOffset;

    function animate(now) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / SPIN_DURATION_MS, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic: fast start, slow finish
        const rotation = totalRotation * eased;

        drawWheel(rotation);

        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            isSpinning = false;
            spinButton.disabled = false;
            revealName(chars, rotation);
        }
    }

    requestAnimationFrame(animate);
}

/**
 * Draws the wheel of fortune at the given rotation angle (in radians).
 */
function drawWheel(rotation) {
    const centerX = wheelCanvas.width / 2;
    const centerY = wheelCanvas.height / 2;
    const radius = Math.min(centerX, centerY) - 4;
    const anglePerSegment = (2 * Math.PI) / NUM_SEGMENTS;

    wheelCtx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
    wheelCtx.save();
    wheelCtx.translate(centerX, centerY);
    wheelCtx.rotate(rotation);

    for (let i = 0; i < NUM_SEGMENTS; i++) {
        const startAngle = i * anglePerSegment;
        const endAngle = startAngle + anglePerSegment;

        wheelCtx.beginPath();
        wheelCtx.moveTo(0, 0);
        wheelCtx.arc(0, 0, radius, startAngle, endAngle);
        wheelCtx.closePath();
        wheelCtx.fillStyle = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        wheelCtx.fill();

        // Draw the character label in the middle of the segment.
        wheelCtx.save();
        wheelCtx.rotate(startAngle + anglePerSegment / 2);
        wheelCtx.textAlign = 'right';
        wheelCtx.textBaseline = 'middle';
        wheelCtx.fillStyle = '#1c1e21';
        wheelCtx.font = 'bold 28px Arial';
        wheelCtx.fillText(segmentLabels[i], radius - 20, 0);
        wheelCtx.restore();
    }

    wheelCtx.restore();
}

/**
 * Generates the final proposed name and displays it once the wheel stops.
 */
function revealName(chars, rotation) {
    const length = parseInt(lengthSlider.value, 10);
    const firstChar = getSegmentUnderPointer(rotation);
    const name = generateName(length, chars, firstChar);

    proposedNameDiv.textContent = name;
    resultContainer.classList.remove('hidden');
}

// --- Initial Draw ---
(function init() {
    segmentLabels = [];
    const chars = getAvailableChars() || CHARS.basic;
    for (let i = 0; i < NUM_SEGMENTS; i++) {
        segmentLabels.push(randomChar(chars));
    }
    drawWheel(0);
})();
