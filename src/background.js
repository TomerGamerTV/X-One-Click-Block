const queue = [];
let isProcessing = false;
let isPaused = false;
let sessionBlocked = []; // Track explicitly blocked users for Undo during mass block

// X's public API bearer token used by the web client
const BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'block') {
    queue.push({ type: 'block', username: request.username });
    processQueue();
  } else if (request.action === 'unblock') {
    // Check if the user is still in the queue waiting to be blocked
    const index = queue.findIndex(item => item.type === 'block' && item.username === request.username);
    if (index !== -1) {
      // Cancel the block
      queue.splice(index, 1);
      console.log(`Cancelled blocking @${request.username}`);
      broadcastProgress(queue.length);
    } else {
      // Already blocked, we need to unblock
      queue.push({ type: 'unblock', username: request.username });
      if (!isPaused) processQueue();
    }
  } else if (request.action === 'pauseQueue') {
    isPaused = true;
    broadcastProgress(queue.length);
  } else if (request.action === 'resumeQueue') {
    isPaused = false;
    processQueue();
  } else if (request.action === 'cancelQueue') {
    queue.length = 0;
    isPaused = false;
    sessionBlocked = [];
    console.log("Queue cancelled by user.");
    broadcastProgress(0);
  } else if (request.action === 'undoQueue') {
    isPaused = false;
    queue.length = 0;
    // Unblock the users we successfully blocked this session
    sessionBlocked.forEach(username => {
      queue.push({ type: 'unblock', username });
    });
    sessionBlocked = [];
    processQueue();
  } else if (request.action === 'clearQueue') {
    queue.length = 0;
    isPaused = false;
    console.log("Queue cleared because user navigated away.");
    broadcastProgress(0);
  }
});

function broadcastProgress(count) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'queueProgress', count: count, isPaused: isPaused }).catch(() => {});
    });
  });
}

async function processQueue() {
  if (isProcessing || isPaused) return; // Stop if paused
  if (queue.length === 0) {
      broadcastProgress(0);
      sessionBlocked = []; // Clear session history when queue naturally finishes
      return;
  }
  isProcessing = true;

  // Broadcast before popping so the count reflects remaining + current
  broadcastProgress(queue.length);
  const item = queue.shift();
  
  try {
    await performAction(item.type, item.username);
    console.log(`Successfully ${item.type}ed @${item.username}`);
    if (item.type === 'block') {
      sessionBlocked.push(item.username);
    }
  } catch (err) {
    console.error(`Failed to ${item.type} @${item.username}:`, err);
  }

  // Randomized cooldown between 2s and 4s to simulate human behavior and prevent fast rate limit
  const delay = Math.floor(Math.random() * (4000 - 2000 + 1)) + 2000;
  setTimeout(() => {
    isProcessing = false;
    processQueue();
  }, delay);
}

async function performAction(action, username) {
  // We need to fetch the ct0 cookie to use as x-csrf-token
  const cookie = await new Promise((resolve) => {
    chrome.cookies.get({ url: 'https://x.com', name: 'ct0' }, (c) => resolve(c));
  });

  if (!cookie) {
    throw new Error('No ct0 cookie found. Are you logged in to X?');
  }

  const endpoint = action === 'block' 
    ? 'https://x.com/i/api/1.1/blocks/create.json'
    : 'https://x.com/i/api/1.1/blocks/destroy.json';

  const body = new URLSearchParams();
  body.append('screen_name', username);

  const headers = {
    'authorization': BEARER_TOKEN,
    'x-csrf-token': cookie.value,
    'content-type': 'application/x-www-form-urlencoded'
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: body.toString()
  });

  if (!res.ok) {
    throw new Error(`API returned ${res.status}`);
  }
  
  return await res.json();
}
