import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { resizeLayout } from '../../utils/windowResize.js';

export class MainView extends LitElement {
    static styles = css`
        * {
            font-family: 'Inter', sans-serif;
            cursor: default;
            user-select: none;
        }

        .welcome {
            font-size: 24px;
            margin-bottom: 8px;
            font-weight: 600;
            margin-top: auto;
        }

        .role-selection {
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
        }

        .role-button {
            flex: 1;
            background: var(--input-background);
            color: var(--text-color);
            border: 2px solid var(--button-border);
            padding: 20px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }

        .role-button:hover {
            border-color: var(--focus-border-color);
            background: var(--input-focus-background);
        }

        .role-button.selected {
            border-color: var(--start-button-background);
            background: rgba(0, 122, 255, 0.1);
        }

        .role-icon {
            font-size: 32px;
        }

        .role-title {
            font-size: 16px;
            font-weight: 600;
        }

        .role-description {
            font-size: 12px;
            color: var(--description-color);
            text-align: center;
        }

        .input-group {
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
        }

        .input-group input {
            flex: 1;
        }

        input {
            background: var(--input-background);
            color: var(--text-color);
            border: 1px solid var(--button-border);
            padding: 10px 14px;
            width: 100%;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.2s ease;
        }

        input:focus {
            outline: none;
            border-color: var(--focus-border-color);
            box-shadow: 0 0 0 3px var(--focus-box-shadow);
            background: var(--input-focus-background);
        }

        input::placeholder {
            color: var(--placeholder-color);
        }

        .uid-display {
            background: var(--input-background);
            border: 1px solid var(--button-border);
            padding: 12px 16px;
            border-radius: 8px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 18px;
            text-align: center;
            letter-spacing: 2px;
            color: var(--text-color);
            margin-bottom: 12px;
        }

        .uid-label {
            font-size: 12px;
            color: var(--description-color);
            text-align: center;
            margin-bottom: 6px;
        }

        .start-button {
            background: var(--start-button-background);
            color: var(--start-button-color);
            border: 1px solid var(--start-button-border);
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .start-button:hover {
            background: var(--start-button-hover-background);
            border-color: var(--start-button-hover-border);
        }

        .start-button.initializing {
            opacity: 0.5;
        }

        .start-button.initializing:hover {
            background: var(--start-button-background);
            border-color: var(--start-button-border);
        }

        .shortcut-icons {
            display: flex;
            align-items: center;
            gap: 2px;
            margin-left: 4px;
        }

        .shortcut-icons svg {
            width: 14px;
            height: 14px;
        }

        .shortcut-icons svg path {
            stroke: currentColor;
        }

        .description {
            color: var(--description-color);
            font-size: 14px;
            margin-bottom: 24px;
            line-height: 1.5;
        }

        .link {
            color: var(--link-color);
            text-decoration: underline;
            cursor: pointer;
        }

        .shortcut-hint {
            color: var(--description-color);
            font-size: 11px;
            opacity: 0.8;
        }

        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
            width: 100%;
            max-width: 500px;
        }
    `;

    static properties = {
        onStart: { type: Function },
        onAPIKeyHelp: { type: Function },
        isInitializing: { type: Boolean },
        onLayoutModeChange: { type: Function },
        showApiKeyError: { type: Boolean },
        selectedRole: { type: String },
        uid: { type: String },
        pairWithUID: { type: String },
    };

    constructor() {
        super();
        this.onStart = () => {};
        this.onAPIKeyHelp = () => {};
        this.isInitializing = false;
        this.onLayoutModeChange = () => {};
        this.showApiKeyError = false;
        this.boundKeydownHandler = this.handleKeydown.bind(this);
        this.selectedRole = localStorage.getItem('selectedRole') || 'asker';
        this.uid = '';
        this.pairWithUID = localStorage.getItem('pairWithUID') || '';
    }

    connectedCallback() {
        super.connectedCallback();
        window.electron?.ipcRenderer?.on('session-initializing', (event, isInitializing) => {
            this.isInitializing = isInitializing;
        });

        // Add keyboard event listener for Ctrl+Enter (or Cmd+Enter on Mac)
        document.addEventListener('keydown', this.boundKeydownHandler);

        // Load and apply layout mode on startup
        this.loadLayoutMode();
        // Resize window for this view
        resizeLayout();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.electron?.ipcRenderer?.removeAllListeners('session-initializing');
        // Remove keyboard event listener
        document.removeEventListener('keydown', this.boundKeydownHandler);
    }

    handleKeydown(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const isStartShortcut = isMac ? e.metaKey && e.key === 'Enter' : e.ctrlKey && e.key === 'Enter';

        if (isStartShortcut) {
            e.preventDefault();
            this.handleStartClick();
        }
    }

    handleRoleSelect(role) {
        this.selectedRole = role;
        localStorage.setItem('selectedRole', role);
        this.requestUpdate();
    }

    handlePairUIDInput(e) {
        this.pairWithUID = e.target.value.toUpperCase();
        localStorage.setItem('pairWithUID', this.pairWithUID);
    }

    handleStartClick() {
        if (this.isInitializing) {
            return;
        }
        
        // Validate helper needs a pair UID
        if (this.selectedRole === 'helper' && !this.pairWithUID.trim()) {
            const input = this.shadowRoot.querySelector('#pairUIDInput');
            if (input) {
                input.style.animation = 'blink-red 1s ease-in-out';
                setTimeout(() => {
                    input.style.animation = '';
                }, 1000);
            }
            return;
        }
        
        this.onStart(this.selectedRole, this.pairWithUID);
    }

    handleAPIKeyHelpClick() {
        this.onAPIKeyHelp();
    }

    handleResetOnboarding() {
        localStorage.removeItem('onboardingCompleted');
        // Refresh the page to trigger onboarding
        window.location.reload();
    }

    loadLayoutMode() {
        const savedLayoutMode = localStorage.getItem('layoutMode');
        if (savedLayoutMode && savedLayoutMode !== 'normal') {
            // Notify parent component to apply the saved layout mode
            this.onLayoutModeChange(savedLayoutMode);
        }
    }

    // Method to trigger the red blink animation
    triggerApiKeyError() {
        this.showApiKeyError = true;
        // Remove the error class after 1 second
        setTimeout(() => {
            this.showApiKeyError = false;
        }, 1000);
    }

    getStartButtonText() {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

        const cmdIcon = html`<svg width="14px" height="14px" viewBox="0 0 24 24" stroke-width="2" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 6V18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="M15 6V18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            <path
                d="M9 6C9 4.34315 7.65685 3 6 3C4.34315 3 3 4.34315 3 6C3 7.65685 4.34315 9 6 9H18C19.6569 9 21 7.65685 21 6C21 4.34315 19.6569 3 18 3C16.3431 3 15 4.34315 15 6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            ></path>
            <path
                d="M9 18C9 19.6569 7.65685 21 6 21C4.34315 21 3 19.6569 3 18C3 16.3431 4.34315 15 6 15H18C19.6569 15 21 16.3431 21 18C21 19.6569 19.6569 21 18 21C16.3431 21 15 19.6569 15 18"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            ></path>
        </svg>`;

        const enterIcon = html`<svg width="14px" height="14px" stroke-width="2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M10.25 19.25L6.75 15.75L10.25 12.25"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            ></path>
            <path
                d="M6.75 15.75H12.75C14.9591 15.75 16.75 13.9591 16.75 11.75V4.75"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            ></path>
        </svg>`;

        if (isMac) {
            return html`Start Session <span class="shortcut-icons">${cmdIcon}${enterIcon}</span>`;
        } else {
            return html`Start Session <span class="shortcut-icons">Ctrl${enterIcon}</span>`;
        }
    }

    setUID(uid) {
        this.uid = uid;
        this.requestUpdate();
    }

    render() {
        const showPairInput = this.selectedRole === 'helper';
        
        return html`
            <div class="welcome">Select Your Role</div>

            <div class="role-selection">
                <button 
                    class="role-button ${this.selectedRole === 'asker' ? 'selected' : ''}"
                    @click=${() => this.handleRoleSelect('asker')}
                >
                    <div class="role-icon">🎓</div>
                    <div class="role-title">Asker</div>
                    <div class="role-description">I need help (exam taker)</div>
                </button>

                <button 
                    class="role-button ${this.selectedRole === 'helper' ? 'selected' : ''}"
                    @click=${() => this.handleRoleSelect('helper')}
                >
                    <div class="role-icon">🤝</div>
                    <div class="role-title">Helper</div>
                    <div class="role-description">I'm providing help</div>
                </button>
            </div>

            ${this.uid ? html`
                <div class="uid-label">Your UID (share with your partner)</div>
                <div class="uid-display">${this.uid}</div>
            ` : ''}

            ${showPairInput ? html`
                <div class="input-group">
                    <input
                        id="pairUIDInput"
                        type="text"
                        placeholder="Enter the Asker's UID to connect"
                        .value=${this.pairWithUID}
                        @input=${this.handlePairUIDInput}
                        maxlength="8"
                        style="text-transform: uppercase"
                    />
                </div>
            ` : ''}

            <div class="input-group">
                <button 
                    @click=${this.handleStartClick} 
                    class="start-button ${this.isInitializing ? 'initializing' : ''}"
                    style="width: 100%"
                >
                    ${this.getStartButtonText()}
                </button>
            </div>

            <p class="description">
                ${this.selectedRole === 'asker' 
                    ? 'You will receive answers from your helper via WebSocket' 
                    : 'You will send answers to the asker via WebSocket'}
            </p>
        `;
    }
}

customElements.define('main-view', MainView);
