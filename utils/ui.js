// UI Management Module

let statusIndicator = null;

/**
 * Show status message in bottom-right corner
 */
export function showStatus(msg, color = '#666') {
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.style.cssText = `
            position: fixed; bottom: 10px; right: 10px;
            font-family: monospace; font-size: 11px;
            color: #333; background: rgba(255,255,255,0.95);
            padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;
            pointer-events: none; z-index: 99999; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(statusIndicator);
    }
    statusIndicator.innerText = msg;
    statusIndicator.style.color = color;
    statusIndicator.style.display = 'block';
}

/**
 * Hide status indicator after timeout
 */
export function hideStatus(timeout = 4000) {
    if (statusIndicator) {
        setTimeout(() => {
            statusIndicator.style.display = 'none';
        }, timeout);
    }
}

/**
 * Unlock site protections (anti-copy, anti-select)
 */
export function unlockSite() {
    const events = ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'mousedown', 'mouseup', 'keydown', 'keyup', 'dragstart'];
    events.forEach(evt => window.addEventListener(evt, (e) => { e.stopPropagation(); }, true));
    
    const style = document.createElement('style');
    style.innerHTML = ' * { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; pointer-events: auto !important; } ';
    document.head.appendChild(style);
}
