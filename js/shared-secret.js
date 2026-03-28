document.addEventListener('DOMContentLoaded', () => {
    const secretInput = document.getElementById('secret');
    const numSharesInput = document.getElementById('numShares');
    const thresholdInput = document.getElementById('threshold');
    const splitBtn = document.getElementById('splitBtn');
    const sharesOutput = document.getElementById('sharesOutput');
    const sharesList = document.getElementById('sharesList');
    const requiredCountSpan = document.getElementById('requiredCount');

    splitBtn.addEventListener('click', () => {
        const secret = secretInput.value.trim();
        const n = parseInt(numSharesInput.value, 10);
        const m = parseInt(thresholdInput.value, 10);

        if (!secret) {
            alert('Please enter a secret to split.');
            return;
        }

        if (m > n) {
            alert('Threshold (M) cannot be greater than Total Shares (N).');
            return;
        }

        try {
            const shares = Shamir.split(secret, n, m);
            renderShares(shares);
            requiredCountSpan.textContent = m;
            sharesOutput.classList.remove('hidden');
        } catch (error) {
            alert('Error splitting secret: ' + error.message);
        }
    });

    /**
     * Iterates over a list of split shares and renders them into the DOM layout.
     * @param {string[]} shares - An array of formatted share strings.
     */
    function renderShares(shares) {
        sharesList.innerHTML = '';
        shares.forEach((share, index) => {
            const shareItem = document.createElement('div');
            shareItem.className = 'share-item';

            const shareValue = document.createElement('span');
            shareValue.className = 'share-value';
            shareValue.textContent = share;

            const copyBtn = document.createElement('button');
            copyBtn.textContent = 'Copy';
            copyBtn.onclick = () => copyToClipboard(share, copyBtn);

            shareItem.appendChild(shareValue);
            shareItem.appendChild(copyBtn);
            sharesList.appendChild(shareItem);
        });
    }

    /**
     * Asynchronously copies text to the user's system clipboard using the
     * contemporary Clipboard API, providing transient visual feedback.
     * @param {string} text - The raw text to push to the clipboard.
     * @param {HTMLElement} btn - The button triggering the action, used for visual feedback.
     */
    function copyToClipboard(text, btn) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }
});
