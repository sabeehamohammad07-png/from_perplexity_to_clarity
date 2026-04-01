const input = document.querySelector('.main-input');
const submitBtn = document.querySelector('.submit-btn');
const chatHistoryContainer = document.getElementById('chat-history');
const logo = document.querySelector('.logo');
const mainContent = document.querySelector('.main-content');
const fileInput = document.getElementById('pdf-upload');
const addBtnTrigger = document.getElementById('add-btn-trigger');
const micBtn = document.querySelector('.mic-btn');

let chatHistory = [];
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// 1. DOM-based Event Listeners
if (addBtnTrigger && fileInput) {
    addBtnTrigger.addEventListener('click', () => fileInput.click());
}

// Auto-resize textarea
input.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Submit on Enter
input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
    }
});

// Submit on button click
submitBtn.addEventListener('click', function(e) {
    e.preventDefault();
    handleSubmit();
});

// 2. PDF Upload Handling
if (fileInput) {
    fileInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // UI Feedback
        addBtnTrigger.classList.add('active-pdf');
        const originalIcon = addBtnTrigger.innerHTML;
        addBtnTrigger.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        input.placeholder = "Processing PDF...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (response.ok) {
                input.placeholder = `Ask about ${file.name}...`;
                addBtnTrigger.innerHTML = '<i class="fa-solid fa-file-pdf"></i>';
            } else {
                input.placeholder = "Upload error: " + data.error;
                addBtnTrigger.innerHTML = originalIcon;
                addBtnTrigger.classList.remove('active-pdf');
            }
        } catch (err) {
            console.error(err);
            addBtnTrigger.innerHTML = originalIcon;
            addBtnTrigger.classList.remove('active-pdf');
        } finally {
            fileInput.value = '';
        }
    });
}

// 3. Voice Recording Handling
if (micBtn) {
    micBtn.addEventListener('click', toggleRecording);
}

async function toggleRecording() {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                handleSubmit(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            micBtn.classList.add('recording');
            micBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
            input.placeholder = "Listening...";
        } catch (err) {
            console.error("Mic access denied", err);
            alert("Please allow microphone access to use voice messages.");
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        micBtn.classList.remove('recording');
        micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        input.placeholder = "Type @ for connectors and sources";
    }
}

// 4. Main Submit Logic (supports text and audio)
async function handleSubmit(audioBlob = null) {
    const text = input.value.trim();
    if (!text && !audioBlob) return;

    // UI state
    logo.classList.add('hidden');
    chatHistoryContainer.classList.remove('hidden');
    mainContent.style.paddingTop = '5vh'; 
    mainContent.style.justifyContent = 'flex-end'; 
    
    const displayMsg = text || "[Voice Message]";
    input.value = '';
    input.style.height = 'auto';

    appendMessage(displayMsg, 'user');
    
    const loaderId = 'loader-' + Date.now();
    const loaderHTML = `<div id="${loaderId}" class="loading-indicator"><i class="fa-solid fa-circle-notch"></i> Thinking...</div>`;
    chatHistoryContainer.insertAdjacentHTML('beforeend', loaderHTML);
    scrollToBottom();

    // Use FormData for multimodal support
    const formData = new FormData();
    formData.append('message', text);
    formData.append('history', JSON.stringify(chatHistory));
    if (audioBlob) {
        formData.append('audio', audioBlob, 'recording.webm');
    }

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        const loaderElt = document.getElementById(loaderId);
        if (loaderElt) loaderElt.remove();

        if (response.ok) {
            appendMessage(data.response, 'model');
            chatHistory = data.history;
        } else {
            appendMessage("Error: " + (data.error || "Failed."), 'model');
        }
    } catch (err) {
        console.error(err);
        const loaderElt = document.getElementById(loaderId);
        if (loaderElt) loaderElt.remove();
        appendMessage("Connection error.", 'model');
    }
}

function appendMessage(text, role) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (role === 'model') {
        bubble.innerHTML = marked.parse(text);
    } else {
        bubble.textContent = text;
    }
    msgDiv.appendChild(bubble);
    chatHistoryContainer.appendChild(msgDiv);
    scrollToBottom();
}

function scrollToBottom() {
    setTimeout(() => {
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
    }, 50);
}
