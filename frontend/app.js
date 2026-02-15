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

// ============== Speech Synthesis ==============
function speak(text) {
    if (!window.speechSynthesis) {
        console.warn('Speech synthesis not supported');
        return;
    }
    
    // Cancel any current speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speakSlowly ? 0.7 : 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    // Try to find a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
        v.lang.startsWith('en') && 
        (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Karen'))
    ) || voices.find(v => v.lang.startsWith('en'));
    
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }
    
    window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
    window.speechSynthesis.cancel();
}

// ============== Speech Recognition ==============
let recordingTimeout = null;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.warn('Speech recognition not supported');
        elements.micBtn.style.display = 'none';
        return false;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    // Increase timeout - some browsers stop after silence
    // Note: maxAlternatives not standard but try anyway
    
    recognition.onstart = () => {
        isRecording = true;
        restartAttempts = 0;
        elements.micBtn.classList.add('recording');
        elements.listeningIndicator.classList.remove('hidden');
        elements.messageInput.placeholder = 'Listening... Speak clearly';
        
        // Clear any existing timeout
        if (recordingTimeout) {
            clearTimeout(recordingTimeout);
        }
        
        // Auto-stop after 30 seconds of recording (safety)
        recordingTimeout = setTimeout(() => {
            if (isRecording) {
                console.log('Auto-stopping after 30 seconds');
                stopRecording();
                // Auto-send if there's text
                const text = elements.messageInput.value.trim();
                if (text) {
                    sendMessage(text);
                }
            }
        }, 30000);
        
        console.log('Recording started - tap microphone again when done speaking');
    };
    
    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        
        if (interimTranscript) {
            elements.messageInput.value = interimTranscript;
        }
        
        if (finalTranscript) {
            elements.messageInput.value = finalTranscript;
            // Update placeholder to show we're still listening
            elements.messageInput.placeholder = 'Still listening... tap mic when done';
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        
        // Don't stop for 'no-speech' or 'audio-capture' errors, just log them
        if (event.error === 'not-allowed') {
            showMessage('error', 'Please allow microphone access to use voice input.');
            stopRecording();
        } else if (event.error === 'network') {
            showMessage('error', 'Network error. Please try typing instead.');
            stopRecording();
        }
        // For other errors like 'no-speech', 'aborted', we try to restart
    };
    
    recognition.onend = () => {
        console.log('Speech recognition ended, isRecording:', isRecording);
        
        if (isRecording && restartAttempts < MAX_RESTART_ATTEMPTS) {
            // Try to restart if we're still supposed to be recording
            restartAttempts++;
            console.log('Attempting to restart recording, attempt:', restartAttempts);
            
            setTimeout(() => {
                try {
                    if (isRecording && recognition) {
                        recognition.start();
                    }
                } catch (e) {
                    console.error('Failed to restart:', e);
                    stopRecording();
                }
            }, 100);
        } else if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
            console.log('Max restart attempts reached, stopping');
            stopRecording();
        }
    };
    
    return true;
}

function startRecording() {
    if (!recognition) {
        if (!initSpeechRecognition()) {
            showMessage('error', 'Voice input is not supported on your device.');
            return;
        }
    }
    
    try {
        recognition.start();
    } catch (e) {
        console.error('Failed to start recording:', e);
    }
}

function stopRecording() {
    isRecording = false;
    restartAttempts = 0;
    
    if (recordingTimeout) {
        clearTimeout(recordingTimeout);
        recordingTimeout = null;
    }
    
    if (recognition) {
        try {
            recognition.stop();
            recognition.abort(); // Force stop
        } catch (e) {
            // Already stopped
        }
    }
    elements.micBtn.classList.remove('recording');
    elements.listeningIndicator.classList.add('hidden');
    elements.messageInput.placeholder = 'Type your question here...';
    console.log('Recording stopped');
}

// ============== WebSocket ==============
function connectWebSocket() {
    if (socket) {
        socket.close();
    }
    
    socket = new WebSocket(`${WS_URL}/${sessionId}`);
    
    socket.onopen = () => {
        console.log('Connected to assistant');
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            showMessage('error', data.error);
            elements.typingIndicator.classList.add('hidden');
            return;
        }
        
        if (data.type === 'stats') {
            // Update stats display (could show in UI)
            console.log('Session cost:', data.session_cost);
            return;
        }
        
        if (data.chunk) {
            // Streaming response
            updateStreamingMessage(data.chunk);
        }
        
        if (data.done) {
            finishStreamingMessage();
        }
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        showMessage('error', 'Connection error. Please try again.');
    };
    
    socket.onclose = () => {
        console.log('Disconnected from assistant');
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

function startStreamingMessage() {
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
    
    scrollToBottom();
}

function updateStreamingMessage(chunk) {
    if (!streamingMessageEl) {
        startStreamingMessage();
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
    
    // Show typing indicator
    elements.typingIndicator.classList.remove('hidden');
    scrollToBottom();
    
    // Use WebSocket if connected, otherwise fallback to HTTP
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ message: text }));
    } else {
        // Fallback to HTTP
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
            
            if (!response.ok) {
                throw new Error('Failed to get response');
            }
            
            const data = await response.json();
            sessionId = data.session_id;
            
            showMessage('assistant', data.response);
            speak(data.response);
            lastResponse = data.response;
            
        } catch (error) {
            console.error('Error:', error);
            showMessage('error', 'Sorry, I had trouble connecting. Please try again.');
        } finally {
            elements.typingIndicator.classList.add('hidden');
        }
    }
}

// ============== Session Management ==============
async function startSession() {
    try {
        // Create a new session
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Hello' })
        });
        
        const data = await response.json();
        sessionId = data.session_id;
        
        // Switch to chat screen
        screens.welcome.classList.remove('active');
        screens.chat.classList.add('active');
        
        // Connect WebSocket
        connectWebSocket();
        
        // Show greeting
        showMessage('assistant', data.response);
        speak(data.response);
        lastResponse = data.response;
        
    } catch (error) {
        console.error('Error starting session:', error);
        alert('Could not connect to the service. Please try again later.');
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
        console.error('Error requesting help:', error);
        showMessage('error', 'Could not request help. Please call 1-800-TECH-HELP directly.');
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
    
    // Microphone - Toggle recording
    elements.micBtn.addEventListener('click', () => {
        if (isRecording) {
            // Stop recording and auto-send if we have text
            const message = elements.messageInput.value.trim();
            stopRecording();
            
            if (message) {
                console.log('Auto-sending voice message:', message);
                sendMessage(message);
            } else {
                // No text captured, let user know
                elements.messageInput.placeholder = 'No speech detected. Please try again.';
                speak('I did not hear anything. Please try speaking again.');
            }
        } else {
            // Clear any previous text and start fresh
            elements.messageInput.value = '';
            elements.messageInput.placeholder = 'Listening... Speak now';
            startRecording();
        }
    });
    
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
    
    // Close modal on backdrop click
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
    
    initSpeechRecognition();
    initEventListeners();
    
    console.log('🤖 TechHelper AI loaded');
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
