// --- CONFIGURATION ---
// Note: API keys are now managed server-side via .env file
const CONFIG = {
    weather: {
        city: "West Columbia",
        units: "imperial"
    },
    slideshow: {
        updateInterval: 15000 // Time in milliseconds (15 seconds)
    },
    updates: {
        weather: 30 * 60 * 1000, // 30 minutes
        quote: 4 * 60 * 60 * 1000, // 4 hours
        reminders: 5 * 60 * 1000, // 5 minutes
        wikipedia: 24 * 60 * 60 * 1000 // 24 hours - new article daily
    },
    teleprompter: {
        scrollSpeed: 0.5, // pixels per frame (adjust for reading speed)
        pauseDuration: 3000, // pause at end before resetting (ms)
        articleRotationInterval: 40000, // rotate to next article every 40 seconds
    }
};

// --- DOM Elements ---
const slideshowEl = document.getElementById('slideshow');
const timeEl = document.getElementById('clock-time');
const dateEl = document.getElementById('clock-date');
const tempEl = document.getElementById('weather-temp');
const cityEl = document.getElementById('weather-city');
const descEl = document.getElementById('weather-desc');
const iconEl = document.getElementById('weather-icon');
const quoteTextEl = document.getElementById('quote-text');
const quoteAuthorEl = document.getElementById('quote-author');
const remindersListEl = document.getElementById('reminders-list');
const teleprompterContentEl = document.getElementById('teleprompter-content');
const specialContentOverlayEl = document.getElementById('special-content-overlay');
const specialContentEl = document.getElementById('special-content');

// --- Slideshow Logic ---
let photos = [];
let currentPhotoIndex = 0;
let photoChangeCounter = 0;
const SPECIAL_CONTENT_INTERVAL = 5;

async function fetchAndStartSlideshow() {
    try {
        const response = await fetch('/api/photos');
        if (!response.ok) throw new Error('Network response was not ok');
        photos = await response.json();
        
        if (photos.length > 0) {
            // Preload the first image
            const firstImageUrl = `/static/uploads/${photos[0]}`;
            slideshowEl.style.backgroundImage = `url('${firstImageUrl}')`;
            currentPhotoIndex = 0;
            
            // Apply initial dimming if needed
            applyNightModeDimming();
            
            // Start the interval to change photos
            setInterval(changePhoto, CONFIG.slideshow.updateInterval);
        } else {
            slideshowEl.style.backgroundColor = '#222'; // Fallback background
            console.log("No photos found in the uploads folder.");
        }
    } catch (error) {
        console.error("Failed to fetch photos:", error);
    }
}

function changePhoto() {
    if (photos.length === 0) return;

    photoChangeCounter++;

    if (photoChangeCounter >= SPECIAL_CONTENT_INTERVAL) {
        photoChangeCounter = 0;
        showSpecialContent();
    } else {
        hideSpecialContent();
    currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
    const imageUrl = `/static/uploads/${photos[currentPhotoIndex]}`;
    // Preload the next image to reduce flicker
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
        slideshowEl.style.backgroundImage = `url('${imageUrl}')`;
        applyNightModeDimming();
    };
}
}

// --- Special Content Logic ---

const specialContentUpdaters = [
    // updateNasaApod,
    // updateMarsPhoto,
    updateDadJoke,
    updateAdvice,
];

function showSpecialContent() {
    document.querySelector('.h-screen.grid').style.display = 'none';
    specialContentOverlayEl.classList.remove('hidden');

    const randomUpdater = specialContentUpdaters[Math.floor(Math.random() * specialContentUpdaters.length)];
    randomUpdater();
}

function hideSpecialContent() {
    document.querySelector('.h-screen.grid').style.display = 'grid';
    specialContentOverlayEl.classList.add('hidden');
    specialContentEl.innerHTML = '';
}

async function updateNasaApod() {
    try {
        const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${CONFIG.nasaApiKey}`);
        const data = await response.json();
        if (data.media_type === 'image') {
            slideshowEl.style.backgroundImage = `url('${data.url}')`;
            applyNightModeDimming();
            const content = `
                <div class="h-full grid grid-rows-5 gap-6">
                    <div class="row-span-1 widget flex items-center justify-center">
                        <h2 class="text-5xl font-bold text-center">${data.title}</h2>
                    </div>
                    <div class="row-span-3"></div>
                    <div class="row-span-1 widget overflow-hidden flex items-center justify-center">
                        <p class="text-2xl overflow-hidden">${data.explanation}</p>
                    </div>
                </div>
            `;
            specialContentEl.innerHTML = content;
        } else {
            hideSpecialContent();
        }
    } catch (error) {
        console.error("Failed to fetch NASA APOD:", error);
        hideSpecialContent();
    }
}

async function updateMarsPhoto() {
    try {
        const response = await fetch(`https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/latest_photos?api_key=${CONFIG.nasaApiKey}`);
        const data = await response.json();
        if (data.latest_photos && data.latest_photos.length > 0) {
            const randomIndex = Math.floor(Math.random() * data.latest_photos.length);
            const photo = data.latest_photos[randomIndex];
            slideshowEl.style.backgroundImage = `url('${photo.img_src}')`;
            applyNightModeDimming();
            const content = `
                <div class="h-full grid grid-rows-5 gap-6">
                    <div class="row-span-1 widget flex items-center justify-center">
                        <h2 class="text-5xl font-bold text-center">${photo.rover.name} | Sol: ${photo.sol}</h2>
                    </div>
                    <div class="row-span-3"></div>
                    <div class="row-span-1 widget overflow-hidden flex items-center justify-center">
                        <p class="text-4xl overflow-hidden">Camera: ${photo.camera.full_name} | Status: ${photo.rover.status}</p>
                    </div>
                </div>
            `;
            specialContentEl.innerHTML = content;
        } else {
            hideSpecialContent();
        }
    } catch (error) {
        console.error("Failed to fetch Mars Rover photo:", error);
        hideSpecialContent();
    }
}

async function updateDadJoke() {
    try {
        const response = await fetch('https://icanhazdadjoke.com/', {
            headers: { 'Accept': 'application/json' }
        });
        const data = await response.json();
        specialContentEl.innerHTML = `
            <div class="h-full flex items-center justify-center">
                <div class="widget max-w-3xl">
                    <h2 class="text-4xl font-bold mb-4">Dad Joke</h2>
                    <p class="text-6xl italic">\"${data.joke}\"</p>
                </div>
            </div>`;
    } catch (error) {
        console.error("Failed to fetch dad joke:", error);
        hideSpecialContent();
    }
}

async function updateAdvice() {
    try {
        const response = await fetch('https://api.adviceslip.com/advice');
        const data = await response.json();
        specialContentEl.innerHTML = `
            <div class="h-full flex items-center justify-center">
                <div class="widget max-w-3xl">
                    <h2 class="text-4xl font-bold mb-4">Some Advice</h2>
                    <p class="text-6xl italic">\"${data.slip.advice}\"</p>
                </div>
            </div>`;
    } catch (error) {
        console.error("Failed to fetch advice:", error);
        hideSpecialContent();
    }
}

// --- Night Mode Dimming ---

function applyNightModeDimming() {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Dim the slideshow after 6pm (18:00) and before 7am (07:00)
    if (currentHour >= 18 || currentHour < 7) {
        slideshowEl.style.filter = 'brightness(0.5)';
    } else {
        slideshowEl.style.filter = 'brightness(1)';
    }
}

// --- Widget Updaters ---

function updateClock() {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function updateWeather() {
    try {
        const url = `/api/weather`; // Will need to create this endpoint
        // For now, keeping direct call but should move to backend
        const directUrl = `https://api.weatherapi.com/v1/current.json?key=48bf8926e401412ba4603116252506&q=West Columbia&aqi=no`;
        const response = await fetch(directUrl);
        const data = await response.json();
        
        tempEl.textContent = `${Math.round(data.current.temp_f)}°`;
        cityEl.textContent = data.location.name;
        descEl.textContent = data.current.condition.text;
        iconEl.src = data.current.condition.icon;

    } catch (error) {
        console.error("Failed to fetch weather:", error);
        cityEl.textContent = "Weather unavailable";
    }
}

async function updateReminders() {
    try {
        const response = await fetch('/api/reminders');
        const reminders = await response.json();
        
        if (reminders.length > 0) {
            remindersListEl.innerHTML = reminders.map(reminder => 
                `<div class="mb-1">• ${reminder}</div>`
            ).join('');
        } else {
            remindersListEl.innerHTML = `<div class="opacity-70">No reminders</div>`;
        }
    } catch (error) {
        console.error("Failed to fetch reminders:", error);
        remindersListEl.innerHTML = `<div>Reminders unavailable</div>`;
    }
}

async function updateQuote() {
    try {
        // Using a free, no-key-required API for quotes
        const response = await fetch('http://api.quotable.io/random');
        const data = await response.json();
        quoteTextEl.textContent = `"${data.content}"`;
        quoteAuthorEl.textContent = `- ${data.author}`;
    } catch (error) {
        console.error("Failed to fetch quote:", error);
    }
}

// --- Wikipedia Teleprompter ---
let teleprompterScrollPosition = 0;
let teleprompterAnimationId = null;
let teleprompterPaused = false;
let teleprompterMaxScroll = 0;
let wikipediaArticles = [];
let currentArticleIndex = 0;

async function fetchWikipediaArticle() {
    try {
        const response = await fetch('/api/wikipedia/today');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        if (data && data.articles && data.articles.length > 0) {
            wikipediaArticles = data.articles;
            currentArticleIndex = 0;
            displayCurrentArticle();
            
            // Set up rotation between articles
            setInterval(rotateToNextArticle, CONFIG.teleprompter.articleRotationInterval);
        } else {
            teleprompterContentEl.innerHTML = `<div>No articles available</div>`;
        }
    } catch (error) {
        console.error("Failed to fetch Wikipedia articles:", error);
        teleprompterContentEl.innerHTML = `<div>Articles unavailable</div>`;
    }
}

function rotateToNextArticle() {
    if (wikipediaArticles.length === 0) return;
    
    // Stop current animation
    if (teleprompterAnimationId) {
        cancelAnimationFrame(teleprompterAnimationId);
        teleprompterAnimationId = null;
    }
    
    // Move to next article
    currentArticleIndex = (currentArticleIndex + 1) % wikipediaArticles.length;
    displayCurrentArticle();
}

function displayCurrentArticle() {
    if (wikipediaArticles.length === 0) return;
    
    const article = wikipediaArticles[currentArticleIndex];
    
    // Remove Wikipedia's inline styles and clean up HTML
    let cleanHtml = (article.extract_html || '')
        .replace(/style="[^"]*"/g, '')
        .replace(/<a [^>]*>/g, '<span>')
        .replace(/<\/a>/g, '</span>')
        .replace(/<b>/g, '<strong>')
        .replace(/<\/b>/g, '</strong>');
    
    const title = article.displaytitle || article.title || 'Featured Article';
    const articleType = article.type === 'featured' ? '⭐ Featured' : '📈 Trending';
    const viewCount = article.views ? `${(article.views / 1000).toFixed(0)}K views` : '';
    
    teleprompterContentEl.innerHTML = `
        <div class="text-xl opacity-70 mb-2">${articleType} ${viewCount ? '• ' + viewCount : ''}</div>
        <h3 class="text-3xl font-bold mb-4">${title}</h3>
        <div class="article-content">${cleanHtml}</div>
    `;
    
    // Reset scroll position
    teleprompterScrollPosition = 0;
    teleprompterPaused = false;
    teleprompterContentEl.style.transform = 'translateY(0)';
    
    // Calculate max scroll distance
    setTimeout(() => {
        const containerHeight = document.getElementById('teleprompter-container').offsetHeight;
        const contentHeight = teleprompterContentEl.offsetHeight;
        teleprompterMaxScroll = Math.max(0, contentHeight - containerHeight + 100);
        
        // Start scrolling animation if there's content to scroll
        if (teleprompterMaxScroll > 0) {
            startTeleprompterScroll();
        }
    }, 100);
}

function startTeleprompterScroll() {
    if (teleprompterAnimationId) {
        cancelAnimationFrame(teleprompterAnimationId);
    }
    
    function animate() {
        if (teleprompterPaused) {
            teleprompterAnimationId = requestAnimationFrame(animate);
            return;
        }
        
        teleprompterScrollPosition += CONFIG.teleprompter.scrollSpeed;
        
        if (teleprompterScrollPosition >= teleprompterMaxScroll) {
            // Reached the end, pause then reset
            teleprompterPaused = true;
            setTimeout(() => {
                teleprompterScrollPosition = 0;
                teleprompterPaused = false;
            }, CONFIG.teleprompter.pauseDuration);
        }
        
        teleprompterContentEl.style.transform = `translateY(-${teleprompterScrollPosition}px)`;
        teleprompterAnimationId = requestAnimationFrame(animate);
    }
    
    teleprompterAnimationId = requestAnimationFrame(animate);
}

// --- Initial Load and Intervals ---
function initialize() {
    // Initial calls to populate widgets immediately
    updateClock();
    updateWeather();
    updateReminders();
    fetchWikipediaArticle();
    fetchAndStartSlideshow();

    // Set intervals for periodic updates
    setInterval(updateClock, 1000); // Every second for the clock
    setInterval(updateWeather, CONFIG.updates.weather);
    setInterval(updateReminders, CONFIG.updates.reminders);
    setInterval(fetchWikipediaArticle, CONFIG.updates.wikipedia);
}

// Start the application
document.addEventListener('DOMContentLoaded', initialize);
