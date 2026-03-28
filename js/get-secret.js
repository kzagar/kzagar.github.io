document.addEventListener('DOMContentLoaded', () => {
    const sharesInputArea = document.getElementById('sharesInputArea');
    const reconstructedSecretArea = document.getElementById('reconstructedSecretArea');
    const reconstructedSecretValue = document.getElementById('reconstructedSecretValue');
    const statusMessages = document.getElementById('statusMessages');

    let collectedValidShares = []; // This will now be populated by processAllShares
    let shareCounter = 0;
    let processingTimeout = null; // For debouncing

    /**
     * Cleans and formats raw share input by uppercasing, removing invalid characters,
     * and adding hyphens every 4 characters.
     * @param {string} rawShare - The raw input string from the user.
     * @returns {string} The canonicalized share string.
     */
    function canonicalizeShare(rawShare) {
        // 1. Uppercase
        let processed = rawShare.toUpperCase();
        // 2. Remove all non-alphanumeric characters (A-Z, 0-9)
        processed = processed.replace(/[^A-Z0-9]/g, '');
        
        // 3. Group into chunks of 4, separated by hyphens
        if (processed.length === 0) {
            return '';
        }
        let formattedShare = '';
        for (let i = 0; i < processed.length; i++) {
            if (i > 0 && i % 4 === 0) {
                formattedShare += '-';
            }
            formattedShare += processed[i];
        }
        return formattedShare;
    }

    /**
     * Debounced handler that aggregates valid shares from all input fields,
     * attempts to determine the required threshold 't', auto-spawns necessary
     * input fields, and triggers Shamir's reconstruction if viable.
     */
    function processAllShares() {
        clearTimeout(processingTimeout);
        processingTimeout = setTimeout(() => {
            collectedValidShares = []; // Reset and collect all current shares
            const allInputs = sharesInputArea.querySelectorAll('input[type="text"]');
            let firstValidShareForTDetermination = null;
            let allCanonicalShares = [];
            let hasEmptyInput = false;

            allInputs.forEach(inp => {
                const rawShare = inp.value.trim();
                if (rawShare) {
                    const canonicalShare = canonicalizeShare(rawShare);
                    inp.value = canonicalShare; // Update input with canonical form
                    if (!allCanonicalShares.includes(canonicalShare)) {
                        allCanonicalShares.push(canonicalShare);
                    }
                    if (!firstValidShareForTDetermination) {
                        firstValidShareForTDetermination = canonicalShare;
                    }
                } else {
                    hasEmptyInput = true; // Track if there's any empty input
                }
            });

            if (allCanonicalShares.length === 0) {
                statusMessages.textContent = "Enter at least one share part.";
                statusMessages.className = '';
                reconstructedSecretArea.style.display = 'none';
                // Ensure at least one input box if all are empty and cleared
                if (allInputs.length === 0) addShareInputGroup();
                return;
            }

            // Determine 't' if not already known, using the first valid share
            let knownT = parseInt(document.body.dataset.requiredT || "0");
            if (knownT === 0 && firstValidShareForTDetermination) {
                try {
                    Shamir.reconstruct([firstValidShareForTDetermination]); // Expect this to fail for t > 1
                } catch (testError) {
                    if (testError.message.includes("Not enough shares provided")) {
                        const match = testError.message.match(/Required: (\d+)/);
                        if (match && match[1]) {
                            knownT = parseInt(match[1]);
                            document.body.dataset.requiredT = knownT.toString();
                            statusMessages.textContent = `Threshold 't' determined: ${knownT}. Enter all parts.`;
                            statusMessages.className = '';
                        }
                    } else {
                        // First share itself might be malformed, reconstruct will catch it later
                        statusMessages.textContent = `Warning: Could not determine 't' from first share or it might be malformed: ${testError.message}`;
                        statusMessages.className = 'error-message';
                    }
                }
            }
            
            // Add more input groups if 't' is known and we don't have enough
            const currentNumberOfInputGroups = allInputs.length;
            if (knownT > 0 && currentNumberOfInputGroups < knownT) {
                for (let i = currentNumberOfInputGroups; i < knownT; i++) {
                    addShareInputGroup(); // This will add listeners automatically
                }
            } else if (knownT === 0 && !hasEmptyInput && allCanonicalShares.length === currentNumberOfInputGroups) {
                // If t is still unknown, all current boxes are filled, and no reconstruction yet, add another box.
                 if (reconstructedSecretArea.style.display === 'none') {
                    addShareInputGroup();
                 }
            }

            if (typeof Shamir === 'undefined' || typeof Shamir.reconstruct !== 'function') {
                statusMessages.textContent = 'Error: shamir.js library not loaded correctly.';
                statusMessages.className = 'error-message';
                return;
            }

            statusMessages.textContent = `Processing ${allCanonicalShares.length} share part(s)...`;
            statusMessages.className = '';
            reconstructedSecretArea.style.display = 'none'; // Hide previous result

            if (allCanonicalShares.length > 0) {
                try {
                    const reconstructedSecret = Shamir.reconstruct(allCanonicalShares);
                    reconstructedSecretValue.textContent = reconstructedSecret;
                    reconstructedSecretArea.style.display = 'block';
                    statusMessages.textContent = `Secret reconstructed successfully with ${allCanonicalShares.length} share part(s)!`;
                    statusMessages.className = 'success';
                } catch (e) {
                    statusMessages.textContent = `Reconstruction failed: ${e.message}`;
                    statusMessages.className = 'error-message';
                    // If 't' is known and we have fewer than 't' shares, this is expected.
                    // The message from Shamir.reconstruct is usually informative enough.
                }
            } else {
                statusMessages.textContent = "Please enter share parts to reconstruct.";
                statusMessages.className = '';
            }
        }, 300); // Debounce for 300ms
    }

    /**
     * Injects a new DOM container specifically for accepting a new share input.
     * Automatically binds the related input and paste event listeners.
     */
    function addShareInputGroup() {
        shareCounter++;
        const containerDiv = document.createElement('div');
        containerDiv.className = 'share-input-container';
        containerDiv.id = `share_container_${shareCounter}`;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'share-input-group';

        const label = document.createElement('label');
        label.setAttribute('for', `share_input_${shareCounter}`);
        label.textContent = `Share Part ${shareCounter}:`;
        label.style.marginRight = '10px';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `share_input_${shareCounter}`;
        input.placeholder = 'Enter share part (e.g., A1B2-C3D4-E)';
        
        input.addEventListener('input', processAllShares); // Changed from 'keypress' and removed button click simulation
        input.addEventListener('paste', processAllShares);


        groupDiv.appendChild(label);
        groupDiv.appendChild(input);
        // Removed addButton
        containerDiv.appendChild(groupDiv);
        sharesInputArea.appendChild(containerDiv);
        if (shareCounter === 1 && !input.value) { // Only focus first empty input
             input.focus();
        }
    }

    // Add the first share input group
    addShareInputGroup();
    statusMessages.textContent = "Enter the first share part. Reconstruction will occur automatically.";
});
