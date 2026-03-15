class PopupManager {
  static queue = [];
  static active = 0;
  static maxActive = 3;
  static container = null;

  static init() {
    if (!document.getElementById('x-ocb-popup-container')) {
      this.container = document.createElement('div');
      this.container.id = 'x-ocb-popup-container';
      document.body.appendChild(this.container);
    } else {
      this.container = document.getElementById('x-ocb-popup-container');
    }
  }

  static getThemeColors() {
    const defaultLight = { bg: '#ffffff', text: '#0f1419' };
    const defaultDark = { bg: '#000000', text: '#ffffff' };
    
    // Guess based on body background
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    // Check if it's white or light grey
    if (bodyBg === 'rgb(255, 255, 255)' || bodyBg.startsWith('rgba(255, 255, 255') || bodyBg === 'rgb(247, 249, 249)') {
      return defaultLight;
    }
    // Dim theme (rgb(21, 32, 43))
    if (bodyBg === 'rgb(21, 32, 43)') {
        return { bg: '#15202b', text: '#ffffff' };
    }
    return defaultDark;
  }

  static show(username, targetElement, buttonWrapper = null) {
    if (this.active >= this.maxActive) {
      this.queue.push({username, targetElement, buttonWrapper});
      return;
    }
    this.active++;
    this.spawn(username, targetElement, buttonWrapper);
  }

  static spawn(username, targetElement, buttonWrapper) {
    const el = document.createElement('div');
    el.className = 'x-ocb-popup';
    
    const colors = this.getThemeColors();
    el.style.backgroundColor = colors.bg;
    el.style.color = colors.text;

    el.innerHTML = `
      <span class="x-ocb-popup-text">@${username} has been blocked</span>
      <button class="x-ocb-popup-undo">Undo</button>
      <button class="x-ocb-popup-close">
        <svg viewBox="0 0 24 24"><path d="M13.414 12l5.793-5.793c.39-.39.39-1.023 0-1.414s-1.023-.39-1.414 0L12 10.586 6.207 4.793c-.39-.39-1.023-.39-1.414 0s-.39 1.023 0 1.414L10.586 12l-5.793 5.793c-.39.39-.39 1.023 0 1.414.195.195.45.293.707.293s.512-.098.707-.293L12 13.414l5.793 5.793c.195.195.45.293.707.293s.512-.098.707-.293c.39-.39.39-1.023 0-1.414L13.414 12z"></path></svg>
      </button>
    `;

    this.container.appendChild(el);

    // Trigger appear animation
    requestAnimationFrame(() => {
      el.classList.add('show');
    });

    const closePopup = (didUndo) => {
      el.classList.remove('show');
      
      if (!didUndo && targetElement) {
         // Formally remove it from the DOM if we didn't undo
         if (targetElement.parentNode) targetElement.remove();
      }

      setTimeout(() => {
        if (el.parentNode) el.remove();
        this.active--;
        this.checkQueue();
      }, 300); // Wait for transition
    };

    let timer = setTimeout(() => closePopup(false), 5000);

    el.querySelector('.x-ocb-popup-close').addEventListener('click', () => {
      clearTimeout(timer);
      closePopup(false);
    });

    el.querySelector('.x-ocb-popup-undo').addEventListener('click', () => {
      clearTimeout(timer);
      el.querySelector('.x-ocb-popup-text').textContent = `Unblocked @${username}`;
      el.querySelector('.x-ocb-popup-undo').style.display = 'none';
      
      // Restore the element visually
      if (targetElement) {
          targetElement.style.display = ''; // Clear the inline display:none
      }
      
      if (buttonWrapper) {
          buttonWrapper.classList.remove('pressed');
      }
      
      chrome.runtime.sendMessage({ action: 'unblock', username: username });
      
      setTimeout(() => closePopup(true), 2000);
    });
  }

  static checkQueue() {
    if (this.queue.length > 0 && this.active < this.maxActive) {
      const nextItem = this.queue.shift();
      this.show(nextItem.username, nextItem.targetElement, nextItem.buttonWrapper);
    }
  }

  static clearQueue() {
    this.queue = [];
  }
}

// Variables for auto-scrapper and queue state
let isMassBlocking = false;
let isMassPaused = false;
let scrapeInterval = null;
let lastScrollTime = 0;
let blockedUsernames = new Set();
let scrollArrow = null;

// Find X's actual scrollable container (not window — X uses a custom scroll region)
function getScrollContainer() {
    // X's timeline scroll container is the element with role="region" inside primaryColumn,
    // OR a parent div with overflow-y: auto/scroll. Let's find it reliably.
    const primaryCol = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryCol) return document.documentElement;
    
    // Walk up from primaryColumn to find the first scrollable parent
    let el = primaryCol;
    while (el && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
            return el;
        }
        el = el.parentElement;
    }
    // Fallback: many X layouts use document.documentElement as the scroller
    return document.documentElement;
}

function injectArrow() {
    if (document.getElementById('x-ocb-scroll-arrow')) return;
    scrollArrow = document.createElement('div');
    scrollArrow.id = 'x-ocb-scroll-arrow';
    scrollArrow.className = 'x-ocb-scroll-arrow constant-bounce';
    const bg = PopupManager.getThemeColors().bg;
    const isDark = bg === '#000000' || bg === '#15202b';
    const fill = isDark ? '#ffffff' : '#000000';
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '48');
    svg.setAttribute('height', '48');
    svg.style.fill = fill;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 20.25L4.5 12.75l1.5-1.5 5 5V3h2v13.25l5-5 1.5 1.5L12 20.25z');
    svg.appendChild(path);
    scrollArrow.appendChild(svg);
    
    // Position horizontally centered over the timeline column
    const col = document.querySelector('[data-testid="primaryColumn"]');
    if (col) {
        const rect = col.getBoundingClientRect();
        scrollArrow.style.left = (rect.left + rect.width / 2) + 'px';
    }
    
    document.body.appendChild(scrollArrow);
}

function removeArrow() {
    const existing = document.getElementById('x-ocb-scroll-arrow');
    if (existing) existing.remove();
    scrollArrow = null;
}

function doScroll() {
    const container = getScrollContainer();
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
    
    if (atBottom) {
        removeArrow();
        return true; // reached bottom
    }
    
    container.scrollTop += 600;
    
    // Animate arrow
    if (scrollArrow) {
        const now = Date.now();
        const diff = now - lastScrollTime;
        
        if (diff > 2000) {
            scrollArrow.className = 'x-ocb-scroll-arrow fade-bounce';
        } else {
            scrollArrow.className = 'x-ocb-scroll-arrow constant-bounce';
        }
        lastScrollTime = now;
    }
    
    return false; // not at bottom yet
}

function toggleNeonBorder(enable) {
    const col = document.querySelector('[data-testid="primaryColumn"]');
    if (col) {
        if (enable) col.classList.add('x-ocb-pulsing-border');
        else col.classList.remove('x-ocb-pulsing-border');
    }
}

function startAutoScraping() {
    if (scrapeInterval) return;
    isMassBlocking = true;
    isMassPaused = false;
    injectArrow();
    toggleNeonBorder(true);
    
    scrapeInterval = setInterval(() => {
        // Scrape visible users
        const wrappers = document.querySelectorAll('.x-ocb-btn-wrapper[data-ocb-username]');
        wrappers.forEach(w => {
            const username = w.dataset.ocbUsername;
            
            let isAlreadyBlocked = blockedUsernames.has(username);
            // Check if user cell shows "Blocked" text
            if (!isAlreadyBlocked) {
                const cell = w.closest('[data-testid="UserCell"]');
                if (cell) {
                    const allText = cell.textContent.toLowerCase();
                    if (allText.includes('blocked')) {
                        isAlreadyBlocked = true;
                    }
                }
            }

            if (w.offsetParent !== null && !w.classList.contains('pressed') && !isAlreadyBlocked) {
                blockedUsernames.add(username);
                w.click();
            }
        });
        
        // Scroll down to load more users
        const reachedBottom = doScroll();
        if (reachedBottom) {
            // Stop scrolling but queue keeps processing in background
            removeArrow();
            toggleNeonBorder(false);
        }
    }, 1500);
}

function stopAutoScraping() {
    if (scrapeInterval) {
        clearInterval(scrapeInterval);
        scrapeInterval = null;
    }
    removeArrow();
    toggleNeonBorder(false);
}

// Detect SPA navigation to pause automatically
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    const isValidPage = window.location.pathname.includes('/followers') || window.location.pathname.includes('/following') || window.location.pathname.includes('/verified_followers');
    if (!isValidPage && isMassBlocking && !isMassPaused) {
        chrome.runtime.sendMessage({ action: 'pauseQueue' });
        stopAutoScraping();
        isMassPaused = true;
    }
  }
}).observe(document, {subtree: true, childList: true});

let positionInterval = null;
function startPositionTracker() {
    if (positionInterval) return;
    positionInterval = setInterval(() => {
        const btn = document.getElementById('x-ocb-mass-block');
        if (!btn) {
            clearInterval(positionInterval);
            positionInterval = null;
            return;
        }
        const col = document.querySelector('[data-testid="primaryColumn"]');
        if (col) {
            const rect = col.getBoundingClientRect();
            btn.style.left = (rect.left + rect.width / 2) + 'px';
        } else {
            btn.style.left = '50%';
        }
    }, 100);
}

// Helper to build the control panel HTML and attach listeners
function showControlPanel(massBtn, catName, count) {
    massBtn.innerHTML = '';
    
    const panel = document.createElement('div');
    panel.className = 'x-ocb-control-panel';
    
    const label = document.createElement('span');
    label.className = 'x-ocb-resume-text';
    label.textContent = count !== undefined 
        ? `Resume Blocking (${catName}) [${count}]`
        : `Resume Blocking (${catName})`;
    panel.appendChild(label);
    
    // Resume button
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'x-ocb-btn-action';
    resumeBtn.title = 'Resume';
    resumeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    resumeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: 'resumeQueue' });
    });
    panel.appendChild(resumeBtn);
    
    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'x-ocb-btn-action';
    cancelBtn.title = 'Cancel';
    cancelBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: 'cancelQueue' });
    });
    panel.appendChild(cancelBtn);
    
    // Undo button
    const undoBtn = document.createElement('button');
    undoBtn.className = 'x-ocb-btn-action';
    undoBtn.title = 'Undo All';
    undoBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C20.47 10.95 16.83 8 12.5 8z"/></svg>';
    undoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: 'undoQueue' });
    });
    panel.appendChild(undoBtn);
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'x-ocb-btn-action';
    closeBtn.title = 'Close';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        massBtn.remove();
        isMassBlocking = false;
        isMassPaused = false;
        stopAutoScraping();
    });
    panel.appendChild(closeBtn);
    
    massBtn.appendChild(panel);
    massBtn.disabled = false;
}

// Listen for broadcasted queue progress events from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'queueProgress') {
      const massBtn = document.getElementById('x-ocb-mass-block');
      const count = request.count;
      isMassPaused = request.isPaused;
      
      if (count === 0 && !isMassPaused) {
          isMassBlocking = false;
          stopAutoScraping();
          blockedUsernames.clear();
          if (massBtn) {
             massBtn.innerHTML = '';
             massBtn.disabled = false;
             const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
             massBtn.textContent = `Block All ${activeTab ? activeTab.textContent.trim() : 'All'}`;
          }
          return;
      }

      if (massBtn) {
          isMassBlocking = true;
          if (isMassPaused) {
              stopAutoScraping();
              const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
              const catName = activeTab ? activeTab.textContent.trim() : 'All';
              showControlPanel(massBtn, catName, count);
          } else {
              if (!scrapeInterval) startAutoScraping();
              massBtn.innerHTML = '';
              massBtn.textContent = `Queuing ${count}... (Click to Pause)`;
              massBtn.disabled = false;
          }
      }
  }
});

function injectBlockButtons() {
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  
  articles.forEach(article => {
    // Check if we already injected into this article
    if (article.dataset.xOcbInjected === 'true') return;
    
    // Find action bar
    const groups = article.querySelectorAll('div[role="group"]');
    let actionBar = null;
    for (const g of groups) {
      if (g.querySelector('[data-testid$="reply"]') || g.querySelector('[data-testid$="like"]') || g.querySelector('[data-testid="reply"]')) {
        actionBar = g;
        break;
      }
    }

    if (!actionBar) return;
    
    // Some tweets wrap bookmark and share in a sub-group (sometimes not). Just append or insert before Share.
    // Instead of messing with complex flex layouts, wrapping our button in a flex-1 group usually works
    const shareBtnContainer = Array.from(actionBar.children).find(c => c.innerHTML.includes('Share') || c.innerHTML.includes('share'));
    
    const wrapper = document.createElement('div');
    wrapper.className = 'x-ocb-btn-wrapper';
    
    wrapper.innerHTML = `
      <div class="x-ocb-btn-inner">
        <svg viewBox="0 0 24 24" aria-hidden="true" class="x-ocb-btn-icon">
          <g>
            <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8 0-1.921.684-3.682 1.821-5.06l11.24 11.24C15.682 19.316 13.921 20 12 20zm6.179-2.94L6.939 5.82C8.318 4.684 10.079 4 12 4c4.411 0 8 3.589 8 8 0 1.921-.684 3.682-1.821 5.06z"></path>
          </g>
        </svg>
      </div>
    `;

    // Extract Username
    let username = null;
    const links = article.querySelectorAll('[data-testid="User-Name"] a');
    for (const link of links) {
      if (link.textContent.includes('@')) {
        username = link.textContent.trim().replace('@', '');
        break;
      }
    }
    
    // fallback if User-Name not found (e.g. quote tweet inner article might have weird structure, though we usually want to block author of main tweet)
    if (!username) {
        const anyLink = article.querySelector('a[href^="/"]');
        if (anyLink) {
            const possibleHandle = anyLink.getAttribute('href').replace('/', '');
            if (possibleHandle && !['search', 'explore', 'notifications', 'messages', 'home'].includes(possibleHandle)) {
                username = possibleHandle;
            }
        }
    }

    if (username) {
      wrapper.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        wrapper.classList.add('pressed');
        
        // Visually hide the article temporarily (Undo will restore it)
        const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
        cell.style.display = 'none';
        
        chrome.runtime.sendMessage({ action: 'block', username: username });
        PopupManager.show(username, cell, wrapper);
      });
      
      if (shareBtnContainer && shareBtnContainer.parentNode === actionBar) {
         actionBar.insertBefore(wrapper, shareBtnContainer);
      } else {
         actionBar.appendChild(wrapper);
      }
      
      article.dataset.xOcbInjected = 'true';
    }
  });

  // Inject into User Cells (Followers / Following / Search lists) AND Hover Cards (Profile previews)
  const userCells = document.querySelectorAll('[data-testid="UserCell"], [data-testid="HoverCard"]');
  userCells.forEach(cell => {
    if (cell.dataset.xOcbInjected === 'true') return;

    // Find the Follow/Unfollow button inside the user cell to place our block button next to it
    const followBtn = cell.querySelector('[data-testid$="-follow"], [data-testid$="-unfollow"]');
    if (!followBtn) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'x-ocb-btn-wrapper x-ocb-btn-group';
    
    // Use flex on parent to ensure side-by-side
    if (followBtn.parentNode) {
        followBtn.parentNode.style.display = 'flex';
        followBtn.parentNode.style.flexDirection = 'row';
        followBtn.parentNode.style.alignItems = 'center';
    }

    // In user cells we have more space, make it a standard square/circle
    wrapper.innerHTML = `
      <div class="x-ocb-btn-inner" style="border: 1px solid rgb(83, 100, 113); margin-right: 8px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 9999px;">
        <svg viewBox="0 0 24 24" aria-hidden="true" class="x-ocb-btn-icon" style="width: 18px; height: 18px;">
          <g>
            <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8 0-1.921.684-3.682 1.821-5.06l11.24 11.24C15.682 19.316 13.921 20 12 20zm6.179-2.94L6.939 5.82C8.318 4.684 10.079 4 12 4c4.411 0 8 3.589 8 8 0 1.921-.684 3.682-1.821 5.06z"></path>
          </g>
        </svg>
      </div>
    `;

    // Try to extract username from the cell
    let username = null;
    // Look for "@username" text inside
    const spans = cell.querySelectorAll('span');
    for (const span of spans) {
        if (span.textContent.startsWith('@') && span.textContent.length > 1) {
            username = span.textContent.trim().replace('@', '');
            break;
        }
    }
    
    // Fallback: look at the follow button's testid which is usually "[username]-follow"
    if (!username) {
        const testid = followBtn.getAttribute('data-testid');
        if (testid) {
            username = testid.split('-').slice(0, -1).join('-'); // handles multiple dashes
        }
    }

    if (username) {
        wrapper.dataset.ocbUsername = username; // Store for mass block
        
        wrapper.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            wrapper.classList.add('pressed');
            cell.style.display = 'none';
            
            chrome.runtime.sendMessage({ action: 'block', username: username });
            PopupManager.show(username, cell, wrapper);
        });

        followBtn.parentNode.insertBefore(wrapper, followBtn);
        cell.dataset.xOcbInjected = 'true';
    }
  });

  // Inject into Main Profile Page header
  // userActions is the 3-dots button itself — we insert our button BEFORE it as a sibling
  const userActionsContainers = document.querySelectorAll('[data-testid="userActions"]');
  userActionsContainers.forEach(container => {
    if (container.dataset.xOcbInjected === 'true') return;
    const parentRow = container.parentNode;
    if (!parentRow) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'x-ocb-btn-wrapper x-ocb-profile-btn';

    wrapper.innerHTML = `
      <div class="x-ocb-btn-inner" style="border: 1px solid rgb(83, 100, 113); cursor: pointer;">
        <svg viewBox="0 0 24 24" aria-hidden="true" class="x-ocb-btn-icon" style="width: 18px; height: 18px;">
          <g>
            <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8 0-1.921.684-3.682 1.821-5.06l11.24 11.24C15.682 19.316 13.921 20 12 20zm6.179-2.94L6.939 5.82C8.318 4.684 10.079 4 12 4c4.411 0 8 3.589 8 8 0 1.921-.684 3.682-1.821 5.06z"></path>
          </g>
        </svg>
      </div>
    `;

    const username = window.location.pathname.split('/')[1];
    if (username && !['search', 'explore', 'notifications', 'messages', 'home', 'settings', 'i'].includes(username)) {
        wrapper.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            wrapper.classList.add('pressed');
            chrome.runtime.sendMessage({ action: 'block', username: username });
            PopupManager.show(username, null, wrapper);
        });

        // Insert before the 3-dots (userActions) in the parent row, NOT inside it
        parentRow.insertBefore(wrapper, container);
        container.dataset.xOcbInjected = 'true';
    }
  });

  // Inject Mass Block Button onto Followers/Following pages
  const isValidPage = window.location.pathname.includes('/followers') || window.location.pathname.includes('/following') || window.location.pathname.includes('/verified_followers');
  
  if (isValidPage) {
     // Determine the active tab label to show in the button
     const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
     const activeTabLabel = activeTab ? activeTab.textContent.trim() : 'All';

     // Find existing or inject new button
     let massBtn = document.getElementById('x-ocb-mass-block');

     if (!massBtn) {
         massBtn = document.createElement('button');
         massBtn.id = 'x-ocb-mass-block';
         massBtn.style.cssText = [
           'position: fixed',
           'bottom: 24px',
           'left: 50%',
           'transform: translateX(-50%)',
           'z-index: 9999',
           'background-color: rgb(244, 33, 46)',
           'color: white',
           'border: none',
           'border-radius: 9999px',
           'padding: 0 24px',
           'font-weight: 700',
           'font-size: 15px',
           'cursor: pointer',
           'height: 48px',
           'box-shadow: 0 4px 12px rgba(0,0,0,0.3)',
           'transition: transform 0.2s',
           'white-space: nowrap',
         ].join(';');

         massBtn.onmouseover = () => { if (!massBtn.disabled) massBtn.style.transform = 'translateX(-50%) scale(1.05)'; };
         massBtn.onmouseout = () => { if (!massBtn.disabled) massBtn.style.transform = 'translateX(-50%) scale(1)'; };

         massBtn.addEventListener('click', (e) => {
             // Don't handle if a sub-button was clicked (those have their own listeners)
             if (e.target.closest('.x-ocb-btn-action')) return;
             
             if (isMassBlocking && !isMassPaused) {
                 chrome.runtime.sendMessage({ action: 'pauseQueue' });
                 return;
             }
             if (isMassPaused) return; // Wait for them to use the panel
             
             startAutoScraping();
         });

         document.body.appendChild(massBtn);
         startPositionTracker();
     }

     // If we're in a paused state (e.g., user navigated away and came back), restore the control panel
     if (isMassPaused && massBtn && !massBtn.querySelector('.x-ocb-control-panel')) {
         showControlPanel(massBtn, activeTabLabel);
     }

     // Always keep the label in sync with the active tab, avoiding infinite mutation loops
     // (unless we are actively processing a queue)
     if (!massBtn.disabled && !isMassBlocking) {
         const expectedText = `Block All ${activeTabLabel}`;
         if (massBtn.textContent !== expectedText) {
             massBtn.textContent = expectedText;
         }
     }

  } else {
     // Not on a followers/following page — keep the button if mass blocking is active (paused state)
     const existingMassBtn = document.getElementById('x-ocb-mass-block');
     if (existingMassBtn && !isMassBlocking) {
         existingMassBtn.remove();
     }
  }
}

// Initialize
PopupManager.init();

// Use MutationObserver to gracefully inject as user scrolls
const observer = new MutationObserver((mutations) => {
  let hasNewNodes = false;
  for (const m of mutations) {
    if (m.addedNodes.length > 0) {
      hasNewNodes = true;
      break;
    }
  }
  if (hasNewNodes) {
    injectBlockButtons();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial run
injectBlockButtons();
