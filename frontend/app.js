/**
 * TechHelper AI - Frontend JavaScript
 * Voice-enabled chat interface for seniors
 */

// ============== Configuration ==============
const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws';

// ============== State ==============
let sessionId = null;
let socket = null;
let isRecording = false;
let recognition = null;
let speakSlowly = false;
let lastResponse = '';

// Voice is optional - check support
const voiceSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// ============== DOM Elements ==============
const screens = {
    welcome: document.getElementById('welcome-screen'),
    chat: document.getElementById('chat-screen')
};

const elements = {
    startBtn: document.getElementById('start-btn'),
    messages: document.getElementById('messages'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    micBtn: document.getElementById('mic-btn'),
    typingIndicator: document.getElementById('typing-indicator'),
    listeningIndicator: document.getElementById('listening-indicator'),
    speakSlowlyBtn: document.getElementById('speak-slowly-btn'),
    readLastBtn: document.getElementById('read-last-btn'),
    humanHelpBtn: document.getElementById('human-help-btn'),
    humanHelpModal: document.getElementById('human-help-modal'),
    phoneInput: document.getElementById('phone-input'),
    confirmHelpBtn: document.getElementById('confirm-help-btn'),
    cancelHelpBtn: document.getElementById('cancel-help-btn'),
    quickBtns: document.querySelectorAll('.quick-btn')
};

// ============== Speech Synthesis (AI talks back) ==============
function speak(text) {
    if (!window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speakSlowly ? 0.7 : 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith('en'));
    if (preferredVoice) utterance.voice = preferredVoice;
    
    window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
    window.speechSynthesis.cancel();
}

// ============== Speech Recognition (Optional - Voice Input) ==============
function initSpeechRecognition() {
    if (!voiceSupported) return false;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
        isRecording = true;
        elements.micBtn.classList.add('recording');
        elements.micBtn.innerHTML = '🔴 Stop Recording';
        elements.messageInput.placeholder = 'Listening... speak now';
    };
    
    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        if (transcript) {
            elements.messageInput.value = transcript;
        }
    };
    
    recognition.onerror = (event) => {
        console.log('Voice error:', event.error);
        stopRecording();
    };
    
    recognition.onend = () => {
        stopRecording();
        // Auto-send if captured text
        const text = elements.messageInput.value.trim();
        if (text) {
            sendMessage(text);
        }
    };
    
    return true;
}

function startRecording() {
    if (!recognition) {
        if (!initSpeechRecognition()) {
            alert('Voice input is not supported in your browser. Please type instead.');
            return;
        }
    }
    
    try {
        elements.messageInput.value = '';
        recognition.start();
    } catch (e) {
        console.error('Failed to start recording:', e);
    }
}

function stopRecording() {
    isRecording = false;
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {}
    }
    if (elements.micBtn) {
        elements.micBtn.classList.remove('recording');
        elements.micBtn.innerHTML = '🎤 Or tap here to speak';
    }
    elements.messageInput.placeholder = 'Tap here and type your question...';
}

// ============== WebSocket ==============
function connectWebSocket() {
    if (socket) socket.close();
    
    socket = new WebSocket(`${WS_URL}/${sessionId}`);
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            showMessage('error', data.error);
            elements.typingIndicator.classList.add('hidden');
            return;
        }
        
        if (data.type === 'stats') return;
        
        if (data.chunk) {
            updateStreamingMessage(data.chunk);
        }
        
        if (data.done) {
            finishStreamingMessage();
        }
    };
    
    socket.onerror = () => {
        console.error('WebSocket error');
    };
}

// ============== Message Handling ==============
let streamingMessageEl = null;
let streamingText = '';

function showMessage(type, text) {
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${type}`;
    
    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'message-bubble';
    bubbleEl.textContent = text;
    
    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageEl.appendChild(bubbleEl);
    messageEl.appendChild(timeEl);
    elements.messages.appendChild(messageEl);
    
    scrollToBottom();
}

function updateStreamingMessage(chunk) {
    if (!streamingMessageEl) {
        streamingMessageEl = document.createElement('div');
        streamingMessageEl.className = 'message message-assistant';
        
        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'message-bubble';
        streamingMessageEl.appendChild(bubbleEl);
        
        const timeEl = document.createElement('div');
        timeEl.className = 'message-time';
        timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        streamingMessageEl.appendChild(timeEl);
        
        elements.messages.appendChild(streamingMessageEl);
        streamingText = '';
    }
    streamingText += chunk;
    streamingMessageEl.querySelector('.message-bubble').textContent = streamingText;
    scrollToBottom();
}

function finishStreamingMessage() {
    if (streamingMessageEl) {
        lastResponse = streamingText;
        speak(streamingText);
        streamingMessageEl = null;
        streamingText = '';
    }
    elements.typingIndicator.classList.add('hidden');
}

function scrollToBottom() {
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

// ============== Send Message ==============
async function sendMessage(text) {
    if (!text.trim()) return;
    
    // Show user message
    showMessage('user', text);
    elements.messageInput.value = '';
    
    // Show typing
    elements.typingIndicator.classList.remove('hidden');
    scrollToBottom();
    
    // Use WebSocket or HTTP fallback
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ message: text }));
    } else {
        try {
            const response = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    session_id: sessionId,
                    speak_slowly: speakSlowly
                })
            });
            
            if (!response.ok) throw new Error('Failed');
            
            const data = await response.json();
            sessionId = data.session_id;
            
            showMessage('assistant', data.response);
            speak(data.response);
            lastResponse = data.response;
            
        } catch (error) {
            showMessage('error', 'Sorry, connection issue. Please try again.');
        } finally {
            elements.typingIndicator.classList.add('hidden');
        }
    }
}

// ============== Session Management ==============
async function startSession() {
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Hello' })
        });
        
        const data = await response.json();
        sessionId = data.session_id;
        
        // Switch screens
        screens.welcome.classList.remove('active');
        screens.chat.classList.add('active');
        
        connectWebSocket();
        
        showMessage('assistant', data.response);
        speak(data.response);
        lastResponse = data.response;
        
    } catch (error) {
        alert('Could not connect. Please try again.');
    }
}

// ============== Human Help ==============
async function requestHumanHelp() {
    const phone = elements.phoneInput.value.trim();
    
    try {
        const response = await fetch(`${API_URL}/session/${sessionId}/human-help`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        
        const data = await response.json();
        hideHumanHelpModal();
        showMessage('assistant', data.message);
        speak(data.message);
        
    } catch (error) {
        showMessage('error', 'Could not request help. Please call 1-800-TECH-HELP.');
    }
}

function showHumanHelpModal() {
    elements.humanHelpModal.classList.remove('hidden');
    elements.phoneInput.focus();
}

function hideHumanHelpModal() {
    elements.humanHelpModal.classList.add('hidden');
    elements.phoneInput.value = '';
}

// ============== Event Listeners ==============
function initEventListeners() {
    // Start button
    elements.startBtn.addEventListener('click', startSession);
    
    // Send message
    elements.sendBtn.addEventListener('click', () => {
        sendMessage(elements.messageInput.value);
    });
    
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage(elements.messageInput.value);
        }
    });
    
    // Microphone (optional)
    if (elements.micBtn) {
        elements.micBtn.addEventListener('click', () => {
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        });
    }
    
    // Quick buttons
    elements.quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const message = btn.dataset.message;
            if (message === 'Can you say that again?') {
                if (lastResponse) {
                    speak(lastResponse);
                } else {
                    speak("I haven't said anything yet. How can I help you today?");
                }
            } else {
                sendMessage(message);
            }
        });
    });
    
    // Speak slowly toggle
    elements.speakSlowlyBtn.addEventListener('click', () => {
        speakSlowly = !speakSlowly;
        elements.speakSlowlyBtn.classList.toggle('active', speakSlowly);
        speak(speakSlowly ? 'I will speak more slowly now.' : 'I will speak at normal speed.');
    });
    
    // Read last response
    elements.readLastBtn.addEventListener('click', () => {
        if (lastResponse) {
            speak(lastResponse);
        } else {
            speak("I haven't answered anything yet. How can I help you?");
        }
    });
    
    // Human help
    elements.humanHelpBtn.addEventListener('click', showHumanHelpModal);
    elements.confirmHelpBtn.addEventListener('click', requestHumanHelp);
    elements.cancelHelpBtn.addEventListener('click', hideHumanHelpModal);
    
    elements.humanHelpModal.addEventListener('click', (e) => {
        if (e.target === elements.humanHelpModal) {
            hideHumanHelpModal();
        }
    });
    
    // Stop speaking when user starts typing
    elements.messageInput.addEventListener('focus', stopSpeaking);
}

// ============== Initialization ==============
function init() {
    // Pre-load voices
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }
    
    // Hide voice if not supported
    if (!voiceSupported) {
        const voiceOption = document.querySelector('.voice-option');
        if (voiceOption) voiceOption.style.display = 'none';
    }
    
    initSpeechRecognition();
    initEventListeners();
    
    console.log('🤖 TechHelper AI loaded. Voice:', voiceSupported ? 'Yes' : 'No');
}

// Start
document.addEventListener('DOMContentLoaded', init);
