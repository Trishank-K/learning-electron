import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class HelperView extends LitElement {
    static styles = css`
        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        * {
            font-family: 'Inter', sans-serif;
            cursor: default;
        }

        .container {
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .status-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            background: var(--input-background);
            border: 1px solid var(--button-border);
            border-radius: 8px;
        }

        .status-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #4caf50;
        }

        .status-dot.disconnected {
            background: #ff4444;
        }

        .status-text {
            font-size: 13px;
            color: var(--text-color);
        }

        .uid-display {
            font-size: 12px;
            color: var(--description-color);
            font-family: 'Monaco', 'Menlo', monospace;
        }

        .questions-container {
            flex: 1;
            overflow-y: auto;
            border-radius: 10px;
            background: var(--main-content-background);
            padding: 16px;
            min-height: 200px;
        }

        .question-item {
            padding: 12px;
            margin-bottom: 12px;
            background: var(--input-background);
            border: 1px solid var(--button-border);
            border-radius: 8px;
            color: var(--text-color);
            font-size: 14px;
            line-height: 1.6;
        }

        .question-time {
            font-size: 11px;
            color: var(--description-color);
            margin-top: 6px;
        }

        .no-questions {
            text-align: center;
            color: var(--description-color);
            font-size: 14px;
            padding: 40px 20px;
        }

        .questions-container::-webkit-scrollbar {
            width: 8px;
        }

        .questions-container::-webkit-scrollbar-track {
            background: var(--scrollbar-track);
            border-radius: 4px;
        }

        .questions-container::-webkit-scrollbar-thumb {
            background: var(--scrollbar-thumb);
            border-radius: 4px;
        }

        .questions-container::-webkit-scrollbar-thumb:hover {
            background: var(--scrollbar-thumb-hover);
        }

        .answer-input-container {
            display: flex;
            gap: 10px;
            align-items: flex-end;
        }

        .answer-textarea {
            flex: 1;
            background: var(--input-background);
            color: var(--text-color);
            border: 1px solid var(--button-border);
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 14px;
            font-family: 'Inter', sans-serif;
            resize: vertical;
            min-height: 80px;
            max-height: 200px;
        }

        .answer-textarea:focus {
            outline: none;
            border-color: var(--focus-border-color);
            box-shadow: 0 0 0 3px var(--focus-box-shadow);
            background: var(--input-focus-background);
        }

        .answer-textarea::placeholder {
            color: var(--placeholder-color);
        }

        .send-button {
            background: var(--start-button-background);
            color: var(--start-button-color);
            border: 1px solid var(--start-button-border);
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 6px;
            height: fit-content;
        }

        .send-button:hover {
            background: var(--start-button-hover-background);
            border-color: var(--start-button-hover-border);
        }

        .send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .send-button:disabled:hover {
            background: var(--start-button-background);
            border-color: var(--start-button-border);
        }

        .helper-title {
            font-size: 20px;
            font-weight: 600;
            color: var(--text-color);
            margin-bottom: 8px;
        }

        .helper-description {
            font-size: 13px;
            color: var(--description-color);
            margin-bottom: 16px;
        }
    `;

    static properties = {
        connected: { type: Boolean },
        pairedUID: { type: String },
        myUID: { type: String },
        questions: { type: Array },
        onSendAnswer: { type: Function },
    };

    constructor() {
        super();
        this.connected = false;
        this.pairedUID = '';
        this.myUID = '';
        this.questions = [];
        this.onSendAnswer = () => {};
    }

    async handleSendAnswer() {
        const textarea = this.shadowRoot.querySelector('#answerInput');
        if (textarea && textarea.value.trim()) {
            const answer = textarea.value.trim();
            textarea.value = ''; // Clear input
            await this.onSendAnswer(answer);
        }
    }

    handleAnswerKeydown(e) {
        // Ctrl+Enter or Cmd+Enter to send
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            this.handleSendAnswer();
        }
    }

    addQuestion(question) {
        this.questions = [
            {
                text: question,
                timestamp: new Date().toLocaleTimeString(),
            },
            ...this.questions,
        ];
        this.requestUpdate();
    }

    getStatusText() {
        if (!this.connected) {
            return 'Disconnected';
        }
        if (this.pairedUID) {
            return `Connected to ${this.pairedUID}`;
        }
        return 'Waiting for connection...';
    }

    render() {
        const statusText = this.getStatusText();
        const canSend = this.connected && this.pairedUID;

        return html`
            <div class="container">
                <div>
                    <div class="helper-title">Helper Mode</div>
                    <div class="helper-description">
                        You are helping someone remotely. Type and send answers when you receive questions.
                    </div>
                </div>

                <div class="status-bar">
                    <div class="status-info">
                        <div class="status-dot ${this.connected ? '' : 'disconnected'}"></div>
                        <span class="status-text">${statusText}</span>
                    </div>
                    ${this.myUID ? html`<span class="uid-display">Your UID: ${this.myUID}</span>` : ''}
                </div>

                <div class="questions-container">
                    ${this.questions.length === 0
                        ? html`<div class="no-questions">No questions received yet. Waiting for the asker to send questions...</div>`
                        : this.questions.map(
                              q => html`
                                  <div class="question-item">
                                      <div>${q.text}</div>
                                      <div class="question-time">${q.timestamp}</div>
                                  </div>
                              `
                          )}
                </div>

                <div class="answer-input-container">
                    <textarea
                        id="answerInput"
                        class="answer-textarea"
                        placeholder="Type your answer here... (Ctrl/Cmd + Enter to send)"
                        @keydown=${this.handleAnswerKeydown}
                        ?disabled=${!canSend}
                    ></textarea>
                    <button class="send-button" @click=${this.handleSendAnswer} ?disabled=${!canSend}>
                        Send Answer
                        <svg width="16px" height="16px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M22 12L3 20L7 12L3 4L22 12Z"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            ></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
}

customElements.define('helper-view', HelperView);
