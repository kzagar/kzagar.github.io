const CARDS_DATA = [
    { name: "Arena", type: "QR", value: "M8045501953" },
    { name: "C&A (Klemen)", type: "CODE128", value: "701220005444948031" },
    { name: "Ciciban", type: "CODE128", value: "083053" },
    { name: "Coop", type: "EAN13", value: "2501067822065" },
    { name: "Flying Blue", type: "QR", value: "2121971971" },
    { name: "IKEA", type: "QR", value: "6275980261157593314" },
    { name: "Intersport", type: "CODE128", value: "221511824202441986" },
    { name: "Lego", type: "CODE128", value: "000808357" },
    { name: "Lekarna Ljubljana", type: "EAN13", value: "2034900602239" },
    { name: "Lesnina", type: "ITF", value: "0020129411" },
    { name: "Lidl", type: "QR", value: "77860006995582090" },
    { name: "Migros Cumulus", type: "EAN13", value: "2099555099377" },
    { name: "Miles & More (Lufthansa)", type: "ITF", value: "0992004418417079" },
    { name: "Miles & More (Swiss)", type: "ITF", value: "0992007221625143" },
    { name: "Miles & More (Urša)", type: "ITF", value: "0992001795131224" },
    { name: "Ochsner Shoes", type: "CODE128", value: "110020083424001" },
    { name: "Ochsner Sport Club", type: "QR", value: "110020083827475" },
    { name: "PADI AOWD", type: "CODE128", value: "99092694" },
    { name: "PADI OWD", type: "CODE128", value: "99089022" },
    { name: "Petrol", type: "EAN13", value: "3000025816638" },
    { name: "S.Oliver (Irena)", type: "CODE128", value: "943918" },
    { name: "Spar (Klemen CH)", type: "EAN13", value: "2096002528534" },
    { name: "Spar (Saša)", type: "CODE128", value: "2625451215306121" },
    { name: "Spar (Urša)", type: "CODE128", value: "2625223690151295" },
    { name: "The Nutrition", type: "CODE39", value: "0506333" },
    { name: "Transa", type: "CODE128", value: "K173135890" }
];

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('cardSearchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const cardsList = document.getElementById('cardsList');
    const emptyState = document.getElementById('emptyState');
    const cardModal = document.getElementById('cardModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const modalTitle = document.getElementById('modalTitle');
    const modalValue = document.getElementById('modalValue');
    const barcodeCanvas = document.getElementById('barcodeCanvas');
    const qrcodeContainer = document.getElementById('qrcodeContainer');

    let wakeLock = null;

    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {
                // Ignore wake lock rejection
            }
        }
    }

    function releaseWakeLock() {
        if (wakeLock !== null) {
            wakeLock.release().then(() => {
                wakeLock = null;
            }).catch(() => { });
        }
    }

    function renderList(query = '') {
        const normalizedQuery = query.trim().toLowerCase();
        cardsList.innerHTML = '';

        const filtered = CARDS_DATA.filter(c =>
            c.name.toLowerCase().includes(normalizedQuery) ||
            c.value.toLowerCase().includes(normalizedQuery) ||
            c.type.toLowerCase().includes(normalizedQuery)
        );

        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
        }

        filtered.forEach(card => {
            const item = document.createElement('div');
            item.className = 'card-list-item';
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.innerHTML = `
                <div class="card-item-left">
                    <span class="card-item-name">${escapeHtml(card.name)}</span>
                    <span class="card-item-value">${escapeHtml(formatCardValue(card.value))}</span>
                </div>
            `;

            item.addEventListener('click', () => showCard(card));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    showCard(card);
                }
            });

            cardsList.appendChild(item);
        });
    }

    function showCard(card) {
        modalTitle.textContent = card.name;
        modalValue.textContent = formatCardValue(card.value);

        // Reset display
        barcodeCanvas.style.display = 'none';
        qrcodeContainer.style.display = 'none';
        qrcodeContainer.innerHTML = '';

        if (card.type === 'QR') {
            qrcodeContainer.style.display = 'flex';
            try {
                // Generate QR Code with qrcode-generator
                const qr = qrcode(0, 'M');
                qr.addData(card.value);
                qr.make();
                qrcodeContainer.innerHTML = qr.createSvgTag({
                    scalable: true,
                    margin: 2
                });
            } catch (err) {
                console.error('QR code generation error:', err);
                qrcodeContainer.textContent = 'Error rendering QR code: ' + err.message;
            }
        } else {
            barcodeCanvas.style.display = 'block';
            try {
                let jsBarcodeFormat = card.type;
                if (card.type === 'ITF') {
                    jsBarcodeFormat = 'ITF';
                } else if (card.type === 'CODE128') {
                    jsBarcodeFormat = 'CODE128';
                } else if (card.type === 'CODE39') {
                    jsBarcodeFormat = 'CODE39';
                } else if (card.type === 'EAN13') {
                    jsBarcodeFormat = 'EAN13';
                }

                // Adjust width for long barcodes to fit mobile screen nicely
                const isLong = card.value.length > 14;
                const barWidth = isLong ? 1.8 : 2.4;

                JsBarcode(barcodeCanvas, card.value, {
                    format: jsBarcodeFormat,
                    lineColor: '#000000',
                    width: barWidth,
                    height: 120,
                    displayValue: false,
                    margin: 10,
                    background: '#ffffff'
                });
            } catch (err) {
                console.error('Barcode generation error:', err);
                const ctx = barcodeCanvas.getContext('2d');
                ctx.clearRect(0, 0, barcodeCanvas.width, barcodeCanvas.height);
            }
        }

        cardModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        requestWakeLock();
    }

    function closeModal() {
        cardModal.classList.add('hidden');
        document.body.style.overflow = '';
        releaseWakeLock();
    }

    modalCloseBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !cardModal.classList.contains('hidden')) {
            closeModal();
        }
    });

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val.length > 0) {
            clearSearchBtn.classList.remove('hidden');
        } else {
            clearSearchBtn.classList.add('hidden');
        }
        renderList(val);
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
        renderList('');
        searchInput.focus();
    });

    // Initial render
    renderList();
});

function formatCardValue(val) {
    if (!val) return '';
    // Group characters into chunks of 3 from left to right (e.g., '701 220 005 444 948 031')
    return val.match(/.{1,3}/g)?.join(' ') || val;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
