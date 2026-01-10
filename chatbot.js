/* chatbot.js — Floating Gemini Chatbot for outing suggestions */

let chatMessages = [];
let isChatOpen = false;

// Initialize chatbot UI
function initChatbot() {
  // Create chatbot container
  const chatContainer = document.createElement('div');
  chatContainer.id = 'gemini-chatbot';
  chatContainer.innerHTML = `
    <div class="chatbot-toggle" id="chatbotToggle" title="Chat with Gemini AI">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </div>
    <div class="chatbot-window" id="chatbotWindow" style="display: none;">
      <div class="chatbot-header">
        <div class="chatbot-header-content">
          <span class="chatbot-icon">🤖</span>
          <div>
            <h3>Gemini Outings Assistant</h3>
            <p class="chatbot-subtitle">Ask me about cool places nearby!</p>
          </div>
        </div>
        <button class="chatbot-close" id="chatbotClose" aria-label="Close chat">×</button>
      </div>
      <div class="chatbot-messages" id="chatbotMessages">
        <div class="chatbot-message chatbot-assistant">
          <div class="message-content">
            <p>Hey! 👋 I'm your AI assistant for finding cool outings near you! Ask me things like:</p>
            <ul class="suggestion-list">
              <li>"What are some fun indoor activities nearby?"</li>
              <li>"Where can I grab coffee and work?"</li>
              <li>"Suggest some date ideas in the area"</li>
              <li>"What's good for a rainy day?"</li>
            </ul>
          </div>
        </div>
      </div>
      <div class="chatbot-input-container">
        <input 
          type="text" 
          id="chatbotInput" 
          class="chatbot-input" 
          placeholder="Ask about outings near you..." 
          autocomplete="off"
        />
        <button id="chatbotSend" class="chatbot-send" aria-label="Send message">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(chatContainer);
  
  // Event listeners
  const toggle = document.getElementById('chatbotToggle');
  const close = document.getElementById('chatbotClose');
  const chatWindow = document.getElementById('chatbotWindow');
  const input = document.getElementById('chatbotInput');
  const send = document.getElementById('chatbotSend');
  const container = document.getElementById('gemini-chatbot');

  // Toggle open/closed by adding/removing `.open` on container; CSS handles transition
  toggle.addEventListener('click', () => {
    isChatOpen = !isChatOpen;
    container.classList.toggle('open', isChatOpen);
    toggle.setAttribute('aria-expanded', String(isChatOpen));

    if (isChatOpen) {
      // Delay to allow CSS expansion, then focus
      setTimeout(() => {
        input.focus();
        scrollToBottom();
      }, 220);
    }
  });

  close.addEventListener('click', () => {
    isChatOpen = false;
    container.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isChatOpen) {
      isChatOpen = false;
      container.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
  
  // Send message on button click
  send.addEventListener('click', handleSendMessage);
  
  // Send message on Enter key
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });
}

// Handle sending a message
async function handleSendMessage() {
  const input = document.getElementById('chatbotInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  // Get current location
  const location = getCurrentLocation();
  if (!location) {
    addMessage('assistant', 'Please set your location first using "Use my location" or search for a city. Then I can help you find cool outings!');
    return;
  }
  
  // Clear input
  input.value = '';
  input.disabled = true;
  
  // Add user message to chat
  addMessage('user', message);
  
  // Show typing indicator
  const typingId = showTypingIndicator();
  
  try {
    // Get response from Gemini
    const response = await getGeminiChatResponse(message, location.lat, location.lng);
    
    // Remove typing indicator
    removeTypingIndicator(typingId);
    
    // Add assistant response
    addMessage('assistant', response);
  } catch (error) {
    removeTypingIndicator(typingId);
    console.error('[chatbot] Error getting response:', error);
    addMessage('assistant', 'Sorry, I encountered an error. Please make sure you have set your GEMINI_API_KEY. In the meantime, try using the "Find Activities Near Me" button above!');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

// Get current location from map or stored location
function getCurrentLocation() {
  // Normalize lastCoords (may have 'lon' or 'lng')
  const lc = window.lastCoords;
  if (lc && isFinite(lc.lat) && (isFinite(lc.lng) || isFinite(lc.lon))) {
    return { lat: Number(lc.lat), lng: Number(lc.lng ?? lc.lon) };
  }
  // Normalize currentUserLocation similarly
  const cu = window.currentUserLocation;
  if (cu && isFinite(cu.lat) && (isFinite(cu.lng) || isFinite(cu.lon))) {
    return { lat: Number(cu.lat), lng: Number(cu.lng ?? cu.lon) };
  }
  return null;
} 

// Generate a simple demo response when Gemini key is not set
function generateDemoResponse(userMessage, lat, lng, weatherDesc, city) {
  const lowered = userMessage.toLowerCase();
  let suggestions = [];
  if (lowered.includes('coffee') || lowered.includes('cafe')) {
    suggestions.push(`Try the cozy Coffee Shop downtown — great for working and just ${Math.round(Math.random()*5)+1} min from you.`);
  }
  if (lowered.includes('museum') || lowered.includes('indoor') || lowered.includes('rain')) {
    suggestions.push(`The Local Museum is perfect on a rainy day. It has new exhibits and indoor cafes.`);
  }
  if (lowered.includes('date') || lowered.includes('romantic')) {
    suggestions.push(`Consider a riverside dinner followed by a visit to the art gallery for a relaxed date night.`);
  }
  if (suggestions.length === 0) {
    suggestions.push(`In ${city || 'your area'}, on a ${weatherDesc}, consider visiting a museum, cafe, or indoor market close by.`);
    suggestions.push('Want something specific? Try: 

// Add a message to the chat
function addMessage(role, content) {
  chatMessages.push({ role, content, timestamp: Date.now() });
  
  const messagesContainer = document.getElementById('chatbotMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `chatbot-message chatbot-${role}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  // Format message content (support basic markdown-like formatting)
  const formattedContent = formatMessage(content);
  contentDiv.innerHTML = formattedContent;
  
  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  
  scrollToBottom();
}

// Format message content with basic markdown support
function formatMessage(text) {
  // Convert line breaks
  text = text.replace(/\n/g, '<br>');
  
  // Convert **bold**
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Convert *italic*
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Convert bullet lists (lines starting with - or *)
  text = text.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Wrap in paragraph
  return `<p>${text}</p>`;
}

// Show typing indicator
function showTypingIndicator() {
  const messagesContainer = document.getElementById('chatbotMessages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chatbot-message chatbot-assistant';
  typingDiv.id = 'chatbot-typing';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content typing-indicator';
  contentDiv.innerHTML = '<span></span><span></span><span></span>';
  
  typingDiv.appendChild(contentDiv);
  messagesContainer.appendChild(typingDiv);
  scrollToBottom();
  
  return 'chatbot-typing';
}

// Remove typing indicator
function removeTypingIndicator(id) {
  const typing = document.getElementById(id);
  if (typing) {
    typing.remove();
  }
}

// Scroll to bottom of chat
function scrollToBottom() {
  const messagesContainer = document.getElementById('chatbotMessages');
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Get response from Gemini API
async function getGeminiChatResponse(userMessage, lat, lng) {
  const apiKey = window.GEMINI_API_KEY;
  
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini API key not set');
  }
  
  // Get current weather context if available
  const weatherDesc = document.getElementById('desc')?.textContent || 'unknown';
  const city = document.getElementById('city')?.textContent || 'your area';
  
  // Build context-aware prompt
  const contextPrompt = `You are a helpful AI assistant helping users find cool outings and activities near them.

Current location: ${city} (latitude: ${lat}, longitude: ${lng})
Current weather: ${weatherDesc}

Based on this location and context, provide helpful, friendly suggestions for outings. Be conversational, specific, and include practical details like:
- Distance or area suggestions
- Best times to visit
- What makes it special
- Weather considerations if relevant

Keep responses concise (2-4 sentences typically) but informative. If asked about specific types of activities (indoor, outdoor, date ideas, etc.), tailor your suggestions accordingly.

User question: ${userMessage}`;

  // Build conversation history for context
  const conversationHistory = chatMessages.slice(-6).map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));
  
  // Add system context and current user message
  const contents = [
    ...conversationHistory,
    {
      role: 'user',
      parts: [{ text: contextPrompt }]
    }
  ];
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[chatbot] Gemini API error:', response.status, errorText);
    throw new Error(`API request failed: ${response.status}`);
  }
  
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error('No response from Gemini API');
  }
  
  return text.trim();
}

// Initialize chatbot on DOM load
window.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for page to fully load
  setTimeout(() => {
    initChatbot();
  }, 500);
});
