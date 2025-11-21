import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { AppHeader } from './AppHeader.js';
import { MainView } from '../views/MainView.js';
import { CustomizeView } from '../views/CustomizeView.js';
import { HelpView } from '../views/HelpView.js';
import { HistoryView } from '../views/HistoryView.js';
import { AssistantView } from '../views/AssistantView.js';
import { HelperView } from '../views/HelperView.js';
import { OnboardingView } from '../views/OnboardingView.js';
import { AdvancedView } from '../views/AdvancedView.js';

export class CheatingDaddyApp extends LitElement {
    static styles = css`
        * {
            box-sizing: border-box;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            margin: 0px;
            padding: 0px;
            cursor: default;
            user-select: none;
        }

        :host {
            display: block;
            width: 100%;
            height: 100vh;
            background-color: var(--background-transparent);
            color: var(--text-color);
        }

        .window-container {
            height: 100vh;
            border-radius: 7px;
            overflow: hidden;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .main-content {
            flex: 1;
            padding: var(--main-content-padding);
            overflow-y: auto;
            margin-top: var(--main-content-margin-top);
            border-radius: var(--content-border-radius);
            transition: all 0.15s ease-out;
            background: var(--main-content-background);
        }

        .main-content.with-border {
            border: 1px solid var(--border-color);
        }

        .main-content.assistant-view {
            padding: 10px;
            border: none;
        }

        .main-content.onboarding-view {
            padding: 0;
            border: none;
            background: transparent;
        }

        .view-container {
            opacity: 1;
            transform: translateY(0);
            transition: opacity 0.15s ease-out, transform 0.15s ease-out;
            height: 100%;
        }

        .view-container.entering {
            opacity: 0;
            transform: translateY(10px);
        }

        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        ::-webkit-scrollbar-track {
            background: var(--scrollbar-background);
            border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--scrollbar-thumb);
            border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--scrollbar-thumb-hover);
        }
    `;

    static properties = {
        currentView: { type: String },
        statusText: { type: String },
        connectionStatus: { type: String },
        startTime: { type: Number },
        isRecording: { type: Boolean },
        sessionActive: { type: Boolean },
        selectedProfile: { type: String },
        selectedLanguage: { type: String },
        responses: { type: Array },
        currentResponseIndex: { type: Number },
        selectedScreenshotInterval: { type: String },
        selectedImageQuality: { type: String },
        layoutMode: { type: String },
        advancedMode: { type: Boolean },
        _viewInstances: { type: Object, state: true },
        _isClickThrough: { state: true },
        _awaitingNewResponse: { state: true },
        shouldAnimateResponse: { type: Boolean },
    };

    constructor() {
        super();
        this.currentView = localStorage.getItem('onboardingCompleted') ? 'main' : 'onboarding';
        this.statusText = '';
        this.connectionStatus = 'disconnected';
        this.startTime = null;
        this.isRecording = false;
        this.sessionActive = false;
        this.selectedProfile = localStorage.getItem('selectedProfile') || 'interview';
        this.selectedLanguage = localStorage.getItem('selectedLanguage') || 'en-US';
        this.selectedScreenshotInterval = localStorage.getItem('selectedScreenshotInterval') || '5';
        this.selectedImageQuality = localStorage.getItem('selectedImageQuality') || 'medium';
        this.layoutMode = localStorage.getItem('layoutMode') || 'normal';
        this.advancedMode = localStorage.getItem('advancedMode') === 'true';
        this.responses = [];
        this.currentResponseIndex = -1;
        this._viewInstances = new Map();
        this._isClickThrough = false;
        this._awaitingNewResponse = false;
        this._currentResponseIsComplete = true;
        this.shouldAnimateResponse = false;
        
        // WebSocket properties
        this.wsConnected = false;
        this.userRole = '';
        this.userUID = '';
        this.pairedUID = '';
        this.audioSharingEnabled = false;

        // Apply layout mode to document root
        this.updateLayoutMode();
    }

    connectedCallback() {
        super.connectedCallback();

        // Wait for cheddar to be ready if not already available
        if (!window.cheddar) {
            console.log('Waiting for cheddar to be ready...');
            window.addEventListener('cheddar-ready', () => {
                console.log('Cheddar is now ready!');
            }, { once: true });
        }

        // Set up IPC listeners if needed
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.on('update-response', (_, response) => {
                this.setResponse(response);
            });
            ipcRenderer.on('update-status', (_, status) => {
                this.setStatus(status);
            });
            ipcRenderer.on('click-through-toggled', (_, isEnabled) => {
                this._isClickThrough = isEnabled;
            });
            
            // WebSocket event listeners
            ipcRenderer.on('ws-connected', (_, data) => {
                console.log('WebSocket connected:', data);
                this.wsConnected = true;
                this.connectionStatus = 'connected';
                this.userUID = data.uid;
                
                // Update MainView with UID
                const mainView = this.shadowRoot.querySelector('main-view');
                if (mainView && mainView.setUID) {
                    mainView.setUID(data.uid);
                }
                
                this.requestUpdate();
            });
            
            ipcRenderer.on('ws-role-set', (_, data) => {
                console.log('Role set:', data);
                this.userRole = data.role;
                this.userUID = data.uid;
                this.setStatus(`Connected as ${data.role}`);
                this.requestUpdate();
            });
            
            ipcRenderer.on('ws-paired', (_, data) => {
                console.log('Paired:', data);
                this.pairedUID = data.pairedWithUID;
                this.setStatus(`Paired with ${data.pairedWithUID}`);
                this.requestUpdate();
            });
            
            ipcRenderer.on('ws-question-received', (_, data) => {
                console.log('Question received:', data);
                const helperView = this.shadowRoot.querySelector('helper-view');
                if (helperView && helperView.addQuestion) {
                    helperView.addQuestion(data.question);
                }
            });
            
            ipcRenderer.on('ws-partner-disconnected', (_, data) => {
                if (data.canReconnect) {
                    const minutes = Math.floor(data.reconnectWindow / 60);
                    this.setStatus(`Partner disconnected (can reconnect within ${minutes} min)`);
                } else {
                    this.setStatus('Partner disconnected');
                    this.pairedUID = '';
                }
            });

            ipcRenderer.on('ws-partner-reconnected', (_, data) => {
                console.log('Partner reconnected:', data);
                // Restore pairing if not already set
                if (!this.pairedUID && data.partnerUID) {
                    this.pairedUID = data.partnerUID;
                }
                this.setStatus(`Partner reconnected: ${data.partnerUID}`);
                this.requestUpdate();
            });

            ipcRenderer.on('ws-disconnected', () => {
                this.wsConnected = false;
                this.connectionStatus = 'reconnecting';
                this.setStatus('Disconnected - Attempting to reconnect...');
            });

            ipcRenderer.on('ws-reconnecting', (_, data) => {
                this.connectionStatus = 'reconnecting';
                this.setStatus(`Reconnecting... (attempt ${data.attempt}, ${Math.round(data.delay / 1000)}s)`);
            });

            ipcRenderer.on('ws-reconnected', (_, data) => {
                console.log('Successfully reconnected:', data);
                this.wsConnected = true;
                this.connectionStatus = 'connected';
                this.userUID = data.uid;
                this.userRole = data.role;
                
                // If we were paired before, restore pairing and notify user
                if (data.pairedWith) {
                    this.pairedUID = data.pairedWith;
                    this.setStatus(`Reconnected and paired with ${data.pairedWith}`);
                } else {
                    this.setStatus(`Reconnected as ${data.role}`);
                }
                
                // Ensure we're on the correct view for the role
                if (data.role === 'helper' && this.currentView !== 'helper') {
                    this.currentView = 'helper';
                } else if (data.role === 'asker' && this.currentView !== 'assistant') {
                    this.currentView = 'assistant';
                }
                
                this.requestUpdate();
            });

            ipcRenderer.on('ws-reconnect-failed', (_, data) => {
                this.connectionStatus = 'disconnected';
                this.setStatus(`Reconnection failed: ${data.reason}. Please restart.`);
            });

            ipcRenderer.on('manual-reconnect', async () => {
                console.log('Manual reconnect triggered');
                await this.handleManualReconnect();
            });

            ipcRenderer.on('ws-error', (_, data) => {
                console.error('WebSocket error:', data);
                this.setStatus('Error: ' + (data.error || 'Unknown error'));
            });
        }
    }    disconnectedCallback() {
        super.disconnectedCallback();
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.removeAllListeners('update-response');
            ipcRenderer.removeAllListeners('update-status');
            ipcRenderer.removeAllListeners('click-through-toggled');
            ipcRenderer.removeAllListeners('ws-connected');
            ipcRenderer.removeAllListeners('ws-role-set');
            ipcRenderer.removeAllListeners('ws-paired');
            ipcRenderer.removeAllListeners('ws-question-received');
            ipcRenderer.removeAllListeners('ws-partner-disconnected');
            ipcRenderer.removeAllListeners('ws-partner-reconnected');
            ipcRenderer.removeAllListeners('ws-disconnected');
            ipcRenderer.removeAllListeners('ws-reconnecting');
            ipcRenderer.removeAllListeners('ws-reconnected');
            ipcRenderer.removeAllListeners('ws-reconnect-failed');
            ipcRenderer.removeAllListeners('manual-reconnect');
            ipcRenderer.removeAllListeners('ws-error');
        }
    }

    setStatus(text) {
        this.statusText = text;
        
        // Mark response as complete when we get certain status messages
        if (text.includes('Ready') || text.includes('Listening') || text.includes('Error')) {
            this._currentResponseIsComplete = true;
            console.log('[setStatus] Marked current response as complete');
        }
    }

    setResponse(response) {
        // Check if this looks like a filler response (very short responses to hmm, ok, etc)
        const isFillerResponse =
            response.length < 30 &&
            (response.toLowerCase().includes('hmm') ||
                response.toLowerCase().includes('okay') ||
                response.toLowerCase().includes('next') ||
                response.toLowerCase().includes('go on') ||
                response.toLowerCase().includes('continue'));

        if (this._awaitingNewResponse || this.responses.length === 0) {
            // Always add as new response when explicitly waiting for one
            this.responses = [...this.responses, response];
            this.currentResponseIndex = this.responses.length - 1;
            this._awaitingNewResponse = false;
            this._currentResponseIsComplete = false;
            console.log('[setResponse] Pushed new response:', response);
        } else if (!this._currentResponseIsComplete && !isFillerResponse && this.responses.length > 0) {
            // For substantial responses, update the last one (streaming behavior)
            // Only update if the current response is not marked as complete
            this.responses = [...this.responses.slice(0, this.responses.length - 1), response];
            console.log('[setResponse] Updated last response:', response);
        } else {
            // For filler responses or when current response is complete, add as new
            this.responses = [...this.responses, response];
            this.currentResponseIndex = this.responses.length - 1;
            this._currentResponseIsComplete = false;
            console.log('[setResponse] Added response as new:', response);
        }
        this.shouldAnimateResponse = true;
        this.requestUpdate();
    }

    // Header event handlers
    handleCustomizeClick() {
        this.currentView = 'customize';
        this.requestUpdate();
    }

    handleHelpClick() {
        this.currentView = 'help';
        this.requestUpdate();
    }

    handleHistoryClick() {
        this.currentView = 'history';
        this.requestUpdate();
    }

    handleAdvancedClick() {
        this.currentView = 'advanced';
        this.requestUpdate();
    }

    async handleClose() {
        if (this.currentView === 'customize' || this.currentView === 'help' || this.currentView === 'history') {
            this.currentView = 'main';
        } else if (this.currentView === 'assistant' || this.currentView === 'helper') {
            // Disconnect from WebSocket
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('ws-disconnect');
            }
            this.sessionActive = false;
            this.wsConnected = false;
            this.currentView = 'main';
            console.log('Session closed');
        } else {
            // Quit the entire application
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('quit-application');
            }
        }
    }

    async handleHideToggle() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('toggle-window-visibility');
        }
    }

    // Main view event handlers
    async handleStart(role, pairWithUID, serverUrl) {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            
            // Connect to WebSocket server with custom URL
            const connectResult = await ipcRenderer.invoke('ws-connect', role, pairWithUID, serverUrl);
            if (!connectResult.success) {
                this.setStatus('Failed to connect: ' + connectResult.error);
                return;
            }
            
            // Wait a bit for connection to establish
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Set role
            const roleResult = await ipcRenderer.invoke('ws-set-role', role, pairWithUID);
            if (!roleResult.success) {
                this.setStatus('Failed to set role: ' + roleResult.error);
                return;
            }
            
            this.userRole = role;
            this.responses = [];
            this.currentResponseIndex = -1;
            this.startTime = Date.now();
            
            // Navigate to appropriate view based on role
            if (role === 'helper') {
                this.currentView = 'helper';
                
                // Start microphone capture for the helper (to send voice back)
                this.setStatus('Starting microphone...');
                if (window.cheddar && typeof window.cheddar.startHelperMicCapture === 'function') {
                    try {
                        await window.cheddar.startHelperMicCapture();
                        this.setStatus('Connected - microphone ready');
                    } catch (error) {
                        console.error('Failed to start helper microphone:', error);
                        this.setStatus('Connected - microphone failed: ' + error.message);
                    }
                } else {
                    this.setStatus('Connected - waiting for questions');
                }
            } else {
                this.currentView = 'assistant';
                
                // Start screen and audio capture for the asker
                this.setStatus('Starting capture...');
                const screenshotInterval = this.selectedScreenshotInterval || '5';
                const imageQuality = this.selectedImageQuality || 'medium';
                
                if (window.cheddar && typeof window.cheddar.startCapture === 'function') {
                    try {
                        await window.cheddar.startCapture(screenshotInterval, imageQuality);
                        this.isRecording = true;
                        this.setStatus('Capture started - waiting for questions');
                    } catch (error) {
                        console.error('Failed to start capture:', error);
                        this.setStatus('Failed to start capture: ' + error.message);
                    }
                } else {
                    console.error('startCapture function not available');
                    this.setStatus('Error: Capture function not available');
                }
            }
        }
    }

    async handleAPIKeyHelp() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('open-external', 'https://cheatingdaddy.com/help/api-key');
        }
    }

    async handleManualReconnect() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            this.connectionStatus = 'reconnecting';
            this.setStatus('Manual reconnection initiated...');
            
            const result = await ipcRenderer.invoke('ws-reconnect');
            
            if (!result.success) {
                this.connectionStatus = 'disconnected';
                this.setStatus('Reconnection failed: ' + result.error);
            }
        }
    }

    // Customize view event handlers
    handleProfileChange(profile) {
        this.selectedProfile = profile;
    }

    handleLanguageChange(language) {
        this.selectedLanguage = language;
    }

    handleScreenshotIntervalChange(interval) {
        this.selectedScreenshotInterval = interval;
    }

    handleImageQualityChange(quality) {
        this.selectedImageQuality = quality;
        localStorage.setItem('selectedImageQuality', quality);
    }

    handleAdvancedModeChange(advancedMode) {
        this.advancedMode = advancedMode;
        localStorage.setItem('advancedMode', advancedMode.toString());
    }

    handleBackClick() {
        this.currentView = 'main';
        this.requestUpdate();
    }

    // Help view event handlers
    async handleExternalLinkClick(url) {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('open-external', url);
        }
    }

    // Assistant view event handlers (for asker)
    async handleSendText(message) {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            const result = await ipcRenderer.invoke('ws-send-question', message);
            
            if (!result.success) {
                console.error('Failed to send question:', result.error);
                this.setStatus('Error sending question: ' + result.error);
            } else {
                this.setStatus('Question sent to helper...');
                this._awaitingNewResponse = true;
            }
        }
    }
    
    // Helper view event handlers
    async handleSendAnswer(answer) {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            const result = await ipcRenderer.invoke('ws-send-answer', answer);
            
            if (!result.success) {
                console.error('Failed to send answer:', result.error);
                this.setStatus('Error sending answer: ' + result.error);
            } else {
                this.setStatus('Answer sent to asker');
            }
        }
    }

    async handleToggleAudioSharing() {
        if (!window.cheddar) {
            console.error('Cheddar not available');
            this.setStatus('Error: Cheddar not available');
            return;
        }

        if (typeof window.cheddar.enableAudioSharing !== 'function' || typeof window.cheddar.disableAudioSharing !== 'function') {
            console.error('Audio sharing functions not available');
            this.setStatus('Error: Audio sharing functions not available. Please reload the app.');
            return;
        }

        try {
            if (this.audioSharingEnabled) {
                // Disable audio sharing
                const result = await window.cheddar.disableAudioSharing();
                if (result.success) {
                    this.audioSharingEnabled = false;
                    this.setStatus('Audio sharing disabled');
                    console.log('Audio sharing disabled successfully');
                }
            } else {
                // Enable audio sharing
                const result = await window.cheddar.enableAudioSharing();
                if (result.success) {
                    this.audioSharingEnabled = true;
                    this.setStatus('Audio sharing enabled - streaming mic and system audio');
                    console.log('Audio sharing enabled successfully');
                } else {
                    this.setStatus(result.error || 'Failed to enable audio sharing');
                    console.error('Failed to enable audio sharing:', result.error);
                }
            }
            this.requestUpdate();
        } catch (error) {
            console.error('Error toggling audio sharing:', error);
            this.setStatus('Error toggling audio sharing: ' + error.message);
        }
    }

    handleResponseIndexChanged(e) {
        this.currentResponseIndex = e.detail.index;
        this.shouldAnimateResponse = false;
        this.requestUpdate();
    }

    // Onboarding event handlers
    handleOnboardingComplete() {
        this.currentView = 'main';
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        // Only notify main process of view change if the view actually changed
        if (changedProperties.has('currentView') && window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('view-changed', this.currentView);

            // Add a small delay to smooth out the transition
            const viewContainer = this.shadowRoot?.querySelector('.view-container');
            if (viewContainer) {
                viewContainer.classList.add('entering');
                requestAnimationFrame(() => {
                    viewContainer.classList.remove('entering');
                });
            }
        }

        // Only update localStorage when these specific properties change
        if (changedProperties.has('selectedProfile')) {
            localStorage.setItem('selectedProfile', this.selectedProfile);
        }
        if (changedProperties.has('selectedLanguage')) {
            localStorage.setItem('selectedLanguage', this.selectedLanguage);
        }
        if (changedProperties.has('selectedScreenshotInterval')) {
            localStorage.setItem('selectedScreenshotInterval', this.selectedScreenshotInterval);
        }
        if (changedProperties.has('selectedImageQuality')) {
            localStorage.setItem('selectedImageQuality', this.selectedImageQuality);
        }
        if (changedProperties.has('layoutMode')) {
            this.updateLayoutMode();
        }
        if (changedProperties.has('advancedMode')) {
            localStorage.setItem('advancedMode', this.advancedMode.toString());
        }
    }

    renderCurrentView() {
        // Only re-render the view if it hasn't been cached or if critical properties changed
        const viewKey = `${this.currentView}-${this.selectedProfile}-${this.selectedLanguage}`;

        switch (this.currentView) {
            case 'onboarding':
                return html`
                    <onboarding-view .onComplete=${() => this.handleOnboardingComplete()} .onClose=${() => this.handleClose()}></onboarding-view>
                `;

            case 'main':
                return html`
                    <main-view
                        .onStart=${(role, pairWithUID, serverUrl) => this.handleStart(role, pairWithUID, serverUrl)}
                        .onAPIKeyHelp=${() => this.handleAPIKeyHelp()}
                        .onLayoutModeChange=${layoutMode => this.handleLayoutModeChange(layoutMode)}
                    ></main-view>
                `;

            case 'customize':
                return html`
                    <customize-view
                        .selectedProfile=${this.selectedProfile}
                        .selectedLanguage=${this.selectedLanguage}
                        .selectedScreenshotInterval=${this.selectedScreenshotInterval}
                        .selectedImageQuality=${this.selectedImageQuality}
                        .layoutMode=${this.layoutMode}
                        .advancedMode=${this.advancedMode}
                        .onProfileChange=${profile => this.handleProfileChange(profile)}
                        .onLanguageChange=${language => this.handleLanguageChange(language)}
                        .onScreenshotIntervalChange=${interval => this.handleScreenshotIntervalChange(interval)}
                        .onImageQualityChange=${quality => this.handleImageQualityChange(quality)}
                        .onLayoutModeChange=${layoutMode => this.handleLayoutModeChange(layoutMode)}
                        .onAdvancedModeChange=${advancedMode => this.handleAdvancedModeChange(advancedMode)}
                    ></customize-view>
                `;

            case 'help':
                return html` <help-view .onExternalLinkClick=${url => this.handleExternalLinkClick(url)}></help-view> `;

            case 'history':
                return html` <history-view></history-view> `;

            case 'advanced':
                return html` <advanced-view></advanced-view> `;

            case 'assistant':
                return html`
                    <assistant-view
                        .responses=${this.responses}
                        .currentResponseIndex=${this.currentResponseIndex}
                        .selectedProfile=${this.selectedProfile}
                        .onSendText=${message => this.handleSendText(message)}
                        .shouldAnimateResponse=${this.shouldAnimateResponse}
                        .audioSharingEnabled=${this.audioSharingEnabled}
                        .onToggleAudioSharing=${() => this.handleToggleAudioSharing()}
                        .connected=${this.wsConnected && this.pairedUID}
                        @response-index-changed=${this.handleResponseIndexChanged}
                        @response-animation-complete=${() => {
                            this.shouldAnimateResponse = false;
                            this._currentResponseIsComplete = true;
                            console.log('[response-animation-complete] Marked current response as complete');
                            this.requestUpdate();
                        }}
                    ></assistant-view>
                `;

            case 'helper':
                return html`
                    <helper-view
                        .connected=${this.wsConnected}
                        .pairedUID=${this.pairedUID}
                        .myUID=${this.userUID}
                        .onSendAnswer=${answer => this.handleSendAnswer(answer)}
                        .audioSharingEnabled=${this.audioSharingEnabled}
                        .onToggleAudioSharing=${() => this.handleToggleAudioSharing()}
                    ></helper-view>
                `;

            default:
                return html`<div>Unknown view: ${this.currentView}</div>`;
        }
    }

    render() {
        const mainContentClass = `main-content ${
            this.currentView === 'assistant' || this.currentView === 'helper' 
                ? 'assistant-view' 
                : this.currentView === 'onboarding' 
                ? 'onboarding-view' 
                : 'with-border'
        }`;

        return html`
            <div class="window-container">
                <div class="container">
                    <app-header
                        .currentView=${this.currentView}
                        .statusText=${this.statusText}
                        .connectionStatus=${this.connectionStatus}
                        .startTime=${this.startTime}
                        .advancedMode=${this.advancedMode}
                        .userUID=${this.userUID}
                        .userRole=${this.userRole}
                        .onCustomizeClick=${() => this.handleCustomizeClick()}
                        .onHelpClick=${() => this.handleHelpClick()}
                        .onHistoryClick=${() => this.handleHistoryClick()}
                        .onAdvancedClick=${() => this.handleAdvancedClick()}
                        .onReconnectClick=${() => this.handleManualReconnect()}
                        .onCloseClick=${() => this.handleClose()}
                        .onBackClick=${() => this.handleBackClick()}
                        .onHideToggleClick=${() => this.handleHideToggle()}
                        ?isClickThrough=${this._isClickThrough}
                    ></app-header>
                    <div class="${mainContentClass}">
                        <div class="view-container">${this.renderCurrentView()}</div>
                    </div>
                </div>
            </div>
        `;
    }

    updateLayoutMode() {
        // Apply or remove compact layout class to document root
        if (this.layoutMode === 'compact') {
            document.documentElement.classList.add('compact-layout');
        } else {
            document.documentElement.classList.remove('compact-layout');
        }
    }

    async handleLayoutModeChange(layoutMode) {
        this.layoutMode = layoutMode;
        localStorage.setItem('layoutMode', layoutMode);
        this.updateLayoutMode();

        // Notify main process about layout change for window resizing
        if (window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('update-sizes');
            } catch (error) {
                console.error('Failed to update sizes in main process:', error);
            }
        }

        this.requestUpdate();
    }
}

customElements.define('cheating-daddy-app', CheatingDaddyApp);
