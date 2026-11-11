/**
 * ============================================================================
 * ANIRBAN MANDAL - CINEMATIC PORTFOLIO JAVASCRIPT ENGINE
 * ============================================================================
 * Core Feature: High-Performance Scroll-Controlled Frame-by-Frame Canvas Scrubber
 * Author: Anirban Mandal
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     1. CONFIGURATION & CONSTANTS
     ========================================================================== */
  const TOTAL_FRAMES = 299;
  const FRAME_DIR = './ezgif-1226e59d693ca72c-jpg/';
  const FRAME_PREFIX = 'ezgif-frame-';
  const FRAME_EXT = '.jpg';
  const FALLBACK_POSTER = './assets/portfolio-poster.jpg';

  // Helper to format frame filename with 3 digits: "ezgif-frame-001.jpg"
  function getFrameUrl(index) {
    const padded = String(index).padStart(3, '0');
    return `${FRAME_DIR}${FRAME_PREFIX}${padded}${FRAME_EXT}`;
  }

  /* ==========================================================================
     2. DOM ELEMENTS
     ========================================================================== */
  const canvas = document.getElementById('scroll-frame-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null;
  const loaderBar = document.getElementById('frame-loader-bar');
  const loaderProgress = document.getElementById('frame-loader-progress');
  const siteHeader = document.getElementById('site-header');
  const navLinks = document.querySelectorAll('.nav-link');
  const mobileToggle = document.getElementById('mobile-toggle');
  const mobileDrawer = document.getElementById('mobile-drawer');
  const drawerClose = document.getElementById('drawer-close');
  const drawerLinks = document.querySelectorAll('.drawer-link');
  const contactForm = document.getElementById('portfolio-contact-form');

  /* ==========================================================================
     3. FRAME SCRUBBING ENGINE STATE
     ========================================================================== */
  const frameCache = new Map(); // Cached Image elements
  let loadedCount = 0;
  let currentRenderedFrame = -1;
  let targetFrame = 1;
  let isTicking = false;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let isInitialFrameDrawn = false;

  /* ==========================================================================
     4. CANVAS RESIZE & COVER CALCULATION
     ========================================================================== */
  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;

    canvas.width = Math.floor(canvasWidth * dpr);
    canvas.height = Math.floor(canvasHeight * dpr);

    ctx.scale(dpr, dpr);

    // Force redraw of currently active frame
    if (currentRenderedFrame > 0 && frameCache.has(currentRenderedFrame)) {
      drawFrame(frameCache.get(currentRenderedFrame));
    }
  }

  /**
   * Draw image with object-fit: cover equivalent scaling
   */
  function drawFrame(img) {
    if (!ctx || !img || !img.complete || img.naturalWidth === 0) return;

    const imgWidth = img.naturalWidth || 1920;
    const imgHeight = img.naturalHeight || 1080;
    const imgRatio = imgWidth / imgHeight;
    const canvasRatio = canvasWidth / canvasHeight;

    let drawW, drawH, offsetX, offsetY;

    if (canvasRatio > imgRatio) {
      drawW = canvasWidth;
      drawH = canvasWidth / imgRatio;
      offsetX = 0;
      offsetY = (canvasHeight - drawH) / 2;
    } else {
      drawH = canvasHeight;
      drawW = canvasHeight * imgRatio;
      offsetX = (canvasWidth - drawW) / 2;
      offsetY = 0;
    }

    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  }

  /* ==========================================================================
     5. PROGRESSIVE FRAME PRELOADER
     ========================================================================== */
  function preloadInitialFrame() {
    const firstImg = new Image();
    firstImg.src = getFrameUrl(1);

    firstImg.onload = () => {
      frameCache.set(1, firstImg);
      loadedCount++;
      drawFrame(firstImg);
      currentRenderedFrame = 1;
      isInitialFrameDrawn = true;
      startProgressivePreload();
    };

    firstImg.onerror = () => {
      // Fallback poster
      const poster = new Image();
      poster.src = FALLBACK_POSTER;
      poster.onload = () => {
        frameCache.set(1, poster);
        drawFrame(poster);
        startProgressivePreload();
      };
    };
  }

  function startProgressivePreload() {
    // Priority chunks: load key distributed frames first, then remainder
    const loadQueue = [];
    for (let i = 2; i <= TOTAL_FRAMES; i++) {
      loadQueue.push(i);
    }

    const CONCURRENCY = 6;
    let activeWorkers = 0;

    function next() {
      if (loadQueue.length === 0) {
        if (activeWorkers === 0 && loaderBar) {
          loaderBar.style.opacity = '0';
          setTimeout(() => { loaderBar.style.display = 'none'; }, 600);
        }
        return;
      }

      while (activeWorkers < CONCURRENCY && loadQueue.length > 0) {
        const frameIdx = loadQueue.shift();
        activeWorkers++;

        const img = new Image();
        img.src = getFrameUrl(frameIdx);

        img.onload = () => {
          frameCache.set(frameIdx, img);
          loadedCount++;
          activeWorkers--;

          // Update progress bar
          if (loaderProgress) {
            const pct = Math.floor((loadedCount / TOTAL_FRAMES) * 100);
            loaderProgress.style.width = pct + '%';
          }

          // If the user is currently waiting on this exact target frame, render it
          if (targetFrame === frameIdx && currentRenderedFrame !== targetFrame) {
            drawFrame(img);
            currentRenderedFrame = targetFrame;
          }

          next();
        };

        img.onerror = () => {
          activeWorkers--;
          next();
        };
      }
    }

    next();
  }

  /* ==========================================================================
     6. SCROLL TO FRAME SCRUBBING CALCULATION
     ========================================================================== */
  function onScroll() {
    // 1. Calculate scroll progress across the page
    const scrollY = window.scrollY || window.pageYOffset;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const scrollProgress = Math.max(0, Math.min(1, scrollY / maxScroll));

    // 2. Map progress linearly to [1, TOTAL_FRAMES]
    const calculatedFrame = Math.min(
      TOTAL_FRAMES,
      Math.max(1, Math.floor(scrollProgress * (TOTAL_FRAMES - 1)) + 1)
    );

    targetFrame = calculatedFrame;

    // 3. Request animation frame render tick
    if (!isTicking) {
      isTicking = true;
      requestAnimationFrame(renderLoop);
    }

    // 4. Update Header Styling & Nav Spy
    handleHeaderAndNav(scrollY);
  }

  /**
   * High-Performance Render Loop
   * - Only renders when targetFrame !== currentRenderedFrame
   * - Immediately freezes when scrolling stops
   * - Smoothly reverses when scrolling upward
   */
  function renderLoop() {
    if (targetFrame !== currentRenderedFrame) {
      if (frameCache.has(targetFrame)) {
        const img = frameCache.get(targetFrame);
        drawFrame(img);
        currentRenderedFrame = targetFrame;
      } else {
        // Nearest frame fallback if target frame is still downloading
        let nearest = targetFrame;
        for (let offset = 1; offset < 30; offset++) {
          if (frameCache.has(targetFrame - offset)) {
            nearest = targetFrame - offset;
            break;
          } else if (frameCache.has(targetFrame + offset)) {
            nearest = targetFrame + offset;
            break;
          }
        }
        if (frameCache.has(nearest)) {
          drawFrame(frameCache.get(nearest));
          currentRenderedFrame = nearest;
        }
      }
    }

    isTicking = false;
  }

  /* ==========================================================================
     7. HEADER, SCROLL-SPY & MOBILE DRAWER
     ========================================================================== */
  function handleHeaderAndNav(scrollY) {
    if (siteHeader) {
      if (scrollY > 40) {
        siteHeader.classList.add('scrolled');
      } else {
        siteHeader.classList.remove('scrolled');
      }
    }

    // Active Section Spy
    const sections = document.querySelectorAll('section[id]');
    const triggerPos = scrollY + window.innerHeight * 0.35;

    sections.forEach(sec => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      const id = sec.getAttribute('id');

      if (triggerPos >= top && triggerPos < top + height) {
        navLinks.forEach(link => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }

  // Mobile Drawer Controls
  if (mobileToggle && mobileDrawer && drawerClose) {
    mobileToggle.addEventListener('click', () => {
      mobileDrawer.classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    const closeDrawer = () => {
      mobileDrawer.classList.remove('open');
      document.body.style.overflow = '';
    };

    drawerClose.addEventListener('click', closeDrawer);
    mobileDrawer.addEventListener('click', (e) => {
      if (e.target === mobileDrawer) closeDrawer();
    });

    drawerLinks.forEach(link => {
      link.addEventListener('click', closeDrawer);
    });
  }

  /* ==========================================================================
     8. INTERACTIVE CONTACT FORM WITH VALIDATION & EMAIL DELIVERY
     ========================================================================== */
  if (contactForm) {
    const nameInput = document.getElementById('form-name');
    const emailInput = document.getElementById('form-email');
    const subjectInput = document.getElementById('form-subject');
    const messageInput = document.getElementById('form-message');
    const submitBtn = document.getElementById('submit-btn');
    const formStatus = document.getElementById('form-status');

    const nameError = document.getElementById('name-error');
    const emailError = document.getElementById('email-error');
    const messageError = document.getElementById('message-error');

    const hiddenSubject = document.getElementById('form-hidden-subject');
    const timeIstInput = document.getElementById('form-time-ist');
    const timeUtcInput = document.getElementById('form-time-utc');

    // Real-time error clearing on input
    [nameInput, emailInput, messageInput].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', () => {
        const errorId = input.id.replace('form-', '') + '-error';
        const errEl = document.getElementById(errorId);
        if (errEl) errEl.textContent = '';
        input.style.borderColor = '';
      });
    });

    function setFormStatus(type, messageHtml) {
      if (!formStatus) return;
      formStatus.className = `form-status ${type} show`;
      formStatus.innerHTML = messageHtml;
      formStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function clearFormStatus() {
      if (!formStatus) return;
      formStatus.className = 'form-status';
      formStatus.innerHTML = '';
    }

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Clear previous error messages & status banner
      if (nameError) nameError.textContent = '';
      if (emailError) emailError.textContent = '';
      if (messageError) messageError.textContent = '';
      clearFormStatus();

      const nameVal = nameInput ? nameInput.value.trim() : '';
      const emailVal = emailInput ? emailInput.value.trim() : '';
      const subjectVal = subjectInput ? subjectInput.value.trim() : '';
      const messageVal = messageInput ? messageInput.value.trim() : '';

      // Client-side Validation
      let isValid = true;

      if (!nameVal || nameVal.length < 2) {
        if (nameError) nameError.textContent = 'Please enter your full name (at least 2 characters).';
        if (nameInput) nameInput.style.borderColor = '#FF5252';
        isValid = false;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailVal || !emailRegex.test(emailVal)) {
        if (emailError) emailError.textContent = 'Please enter a valid email address.';
        if (emailInput) emailInput.style.borderColor = '#FF5252';
        isValid = false;
      }

      if (!messageVal || messageVal.length < 10) {
        if (messageError) messageError.textContent = 'Please enter a message of at least 10 characters.';
        if (messageInput) messageInput.style.borderColor = '#FF5252';
        isValid = false;
      }

      if (!isValid) return;

      // Prevent duplicate submission & show loading indicator
      const originalBtnHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="btn-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite; margin-right: 8px;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10"/>
        </svg>
        <span>Sending Message...</span>
      `;

      // Timestamps
      const now = new Date();
      const timeUTC = now.toISOString();
      const timeIST = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'long'
      }).format(now);

      if (timeIstInput) timeIstInput.value = timeIST;
      if (timeUtcInput) timeUtcInput.value = timeUTC;
      if (hiddenSubject) {
        hiddenSubject.value = `Portfolio Message from ${nameVal}: ${subjectVal || 'New Project Inquiry'}`;
      }

      const payload = {
        name: nameVal,
        email: emailVal,
        subject: subjectVal || 'General Portfolio Discussion',
        message: messageVal,
        submissionDateIST: timeIST,
        submissionDateUTC: timeUTC
      };

      let deliverySuccessful = false;
      let responseMessage = '';

      // --- Dispatch Step 1: Try Local / Backend Server API (/api/contact) ---
      try {
        const localResponse = await fetch('/api/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (localResponse.ok) {
          const resData = await localResponse.json();
          if (resData.success) {
            deliverySuccessful = true;
            responseMessage = resData.message;
          }
        }
      } catch (localErr) {
        console.warn('Backend /api/contact not reachable, attempting direct cloud dispatch...', localErr);
      }

      // --- Dispatch Step 2: Fallback to Direct FormSubmit Cloud Relay if backend is unavailable ---
      if (!deliverySuccessful) {
        try {
          const cloudPayload = {
            _subject: `New Portfolio Message from ${nameVal}: ${subjectVal || 'General Discussion'}`,
            _template: 'table',
            _captcha: 'false',
            _replyto: emailVal,
            Name: nameVal,
            Email: emailVal,
            Subject: subjectVal || 'General Portfolio Discussion',
            Message: messageVal,
            Submission_Date_IST: timeIST,
            Submission_Date_UTC: timeUTC
          };

          const cloudResponse = await fetch('https://formsubmit.co/ajax/anirbanmandal666@gmail.com', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(cloudPayload)
          });

          if (cloudResponse.ok) {
            const cloudData = await cloudResponse.json();
            if (cloudData.success === 'true' || cloudData.success === true || cloudData.message) {
              deliverySuccessful = true;
              responseMessage = `Thank you, ${nameVal}! Your message has been sent successfully to Anirban Mandal (anirbanmandal666@gmail.com). You will receive a response at ${emailVal} shortly.`;
            }
          }
        } catch (cloudErr) {
          console.error('Cloud relay also failed:', cloudErr);
        }
      }

      // --- Render Feedback ---
      if (deliverySuccessful) {
        setFormStatus(
          'success',
          `✓ <strong>Message Delivered!</strong> ${responseMessage || `Thank you, ${nameVal}! Your inquiry has been sent to anirbanmandal666@gmail.com. Anirban will get back to you shortly.`}`
        );

        submitBtn.innerHTML = '<span>✓ Sent Successfully</span>';
        submitBtn.style.background = '#2E7D32';
        submitBtn.style.boxShadow = '0 0 20px rgba(46, 125, 50, 0.6)';

        // Clear input fields
        contactForm.reset();

        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
          submitBtn.style.background = '';
          submitBtn.style.boxShadow = '';
        }, 5000);

      } else {
        // Fallback actionable error message with direct email mailto link
        const mailtoSubject = encodeURIComponent(subjectVal || 'Portfolio Inquiry');
        const mailtoBody = encodeURIComponent(`Name: ${nameVal}\nEmail: ${emailVal}\n\nMessage:\n${messageVal}`);
        const mailtoUrl = `mailto:anirbanmandal666@gmail.com?subject=${mailtoSubject}&body=${mailtoBody}`;

        setFormStatus(
          'error',
          `✕ <strong>Submission notice:</strong> Automated transmission could not complete due to network restrictions. 
           Please <a href="${mailtoUrl}" style="color: #FF7A00; text-decoration: underline; font-weight: 700;">click here to email Anirban directly</a> at <strong>anirbanmandal666@gmail.com</strong> or call <strong>+91 8131954199</strong>.`
        );

        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    });
  }

  /* ==========================================================================
     9. INITIALIZATION
     ========================================================================== */
  function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    preloadInitialFrame();
    onScroll(); // Initial position sync
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
