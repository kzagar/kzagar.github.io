// --- DOM Element References ---
const lengthSlider = document.getElementById('passwordLength');
const lengthValueSpan = document.getElementById('lengthValue');
const includeLettersUpperCheckbox = document.getElementById('includeLettersUpper');
const includeLettersLowerCheckbox = document.getElementById('includeLettersLower');
const includeNumbersCheckbox = document.getElementById('includeNumbers');
const includeSymbolsBasicCheckbox = document.getElementById('includeSymbolsBasic');
const includeSymbolsExtendedCheckbox = document.getElementById('includeSymbolsExtended');
const avoidAmbiguousCheckbox = document.getElementById('avoidAmbiguous');
const numPasswordsInput = document.getElementById('numPasswords');
const generateButton = document.getElementById('generateBtn');
const outputContainer = document.getElementById('outputContainer');
const messageBox = document.getElementById('messageBox');

// --- Character Sets ---
const CHARS = {
    lettersUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lettersLower: 'abcdefghijklmnopqrstuvwxyz',
    numbers: '0123456789',
    symbolsBasic: '!@#$%',
	symbolsExtended: '^&*()_+-=[]{}|;:,.<>/?~'
};

const AMBIGUOUS_CHARS = 'l1Io0!S5Z2B8g9uvpq';

// --- Event Listeners ---

// Update the password length display when the slider is moved
lengthSlider.addEventListener('input', () => {
    lengthValueSpan.textContent = lengthSlider.value;
});

// Main function to generate passwords on button click
generateButton.addEventListener('click', generatePasswords);

// --- Core Logic Functions ---

/**
 * Generates and displays the specified number of passwords.
 */
function generatePasswords() {
    // Clear previous passwords
    outputContainer.innerHTML = '<h2>Generated Passwords</h2>';
    outputContainer.classList.remove('hidden');

    const length = parseInt(lengthSlider.value, 10);
    const numPasswords = parseInt(numPasswordsInput.value, 10);
    const useLettersUpper = includeLettersUpperCheckbox.checked;
    const useLettersLower = includeLettersLowerCheckbox.checked;
    const useNumbers = includeNumbersCheckbox.checked;
    const useSymbolsBasic = includeSymbolsBasicCheckbox.checked;
    const useSymbolsExtended = includeSymbolsExtendedCheckbox.checked;
    const avoidAmbiguous = avoidAmbiguousCheckbox.checked;

    let availableChars = '';
    if (useLettersUpper) availableChars += CHARS.lettersUpper;
    if (useLettersLower) availableChars += CHARS.lettersLower;
    if (useNumbers) availableChars += CHARS.numbers;
    if (useSymbolsBasic) availableChars += CHARS.symbolsBasic;
    if (useSymbolsExtended) availableChars += CHARS.symbolsExtended;

    // Remove ambiguous characters if the checkbox is checked
    if (avoidAmbiguous) {
        AMBIGUOUS_CHARS.split('').forEach(char => {
            availableChars = availableChars.replace(new RegExp(char, 'g'), '');
        });
    }

    // Check if any character set is selected
    if (availableChars.length === 0) {
        outputContainer.innerHTML += '<p style="text-align: center; color: red;">Please select at least one character set.</p>';
        return;
    }

    // Generate the passwords and add them to the DOM
    for (let i = 0; i < numPasswords; i++) {
        const password = generateSinglePassword(length, availableChars);
        addPasswordToDOM(password);
    }
}

/**
 * Generates a single password of a given length from a set of available characters.
 * @param {number} length The desired length of the password.
 * @param {string} chars The string of characters to choose from.
 * @returns {string} The generated password.
 */
function generateSinglePassword(length, chars) {
    let password = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        password += chars[randomIndex];
    }
    return password;
}

/**
 * Creates a DOM element for a single password with a copy button.
 * @param {string} password The password to display.
 */
function addPasswordToDOM(password) {
    const passwordDiv = document.createElement('div');
    passwordDiv.className = 'password-container';

    const passwordSpan = document.createElement('span');
    passwordSpan.textContent = password;
    
    // Copy to clipboard button with a SVG icon
    const copyButton = document.createElement('button');
    copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    copyButton.onclick = () => copyToClipboard(password);

    passwordDiv.appendChild(passwordSpan);
    passwordDiv.appendChild(copyButton);
    outputContainer.appendChild(passwordDiv);
}

/**
 * Copies text to the clipboard and shows a temporary message.
 * @param {string} text The text to copy.
 */
function copyToClipboard(text) {
    // This is the recommended method for clipboard access
    // document.execCommand('copy') is a fallback for older browsers
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    
    try {
        document.execCommand('copy');
        showMessage();
    } catch (err) {
        console.error('Could not copy text to clipboard', err);
    }

    document.body.removeChild(tempInput);
}

/**
 * Displays a "Copied to clipboard!" message box temporarily.
 */
function showMessage() {
    messageBox.classList.add('show');
    setTimeout(() => {
        messageBox.classList.remove('show');
    }, 1500); // Hide the message after 1.5 seconds
}
