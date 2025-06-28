
// --- CONFIGURATION ---
// IMPORTANT: Replace these placeholders with your actual data and API keys!
const CONFIG = {
    weather: {
        apiKey: "48bf8926e401412ba4603116252506", 
        city: "New York", // e.g., "London", "Tokyo,JP"
        units: "imperial" // "metric" for Celsius, "imperial" for Fahrenheit
    },
    news: {
        // Get a FREE key from https://newsapi.org/
        apiKey: "2be14e6f95cf4eeb8ab6def2cc21e486",
        country: "us" // e.g., "gb", "jp", "de"
    },
    slideshow: {
        updateInterval: 15000 // Time in milliseconds (15 seconds)
    },
    updates: {
        weather: 30 * 60 * 1000, // 30 minutes
        news: 60 * 60 * 1000, // 1 hour
        quote: 4 * 60 * 60 * 1000, // 4 hours
        reminders: 5 * 60 * 1000 // 5 minutes
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
const newsListEl = document.getElementById('news-list');
const quoteTextEl = document.getElementById('quote-text');
const quoteAuthorEl = document.getElementById('quote-author');
const remindersListEl = document.getElementById('reminders-list');

// --- Slideshow Logic ---
let photos = [];
let currentPhotoIndex = 0;

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
    currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
    const imageUrl = `/static/uploads/${photos[currentPhotoIndex]}`;
    // Preload the next image to reduce flicker
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
        slideshowEl.style.backgroundImage = `url('${imageUrl}')`;
    };
}

// --- Widget Updaters ---

function updateClock() {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function updateWeather() {
    if (CONFIG.weather.apiKey === "YOUR_OPENWEATHERMAP_API_KEY") {
            tempEl.textContent = "Set API";
            descEl.textContent = "Key";
            return;
    }
    try {
        const url = `https://api.weatherapi.com/v1/current.json?key=${CONFIG.weather.apiKey}&q=West Columbia&aqi=no`;
        const response = await fetch(url);
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

async function updateNews() {
        if (CONFIG.news.apiKey === "YOUR_NEWSAPI_API_KEY") {
            newsListEl.innerHTML = `<div>Set NewsAPI Key</div>`;
            return;
    }
    try {
        const url = `https://newsapi.org/v2/top-headlines?country=${CONFIG.news.country}&apiKey=${CONFIG.news.apiKey}&pageSize=3`;
        const response = await fetch(url);
        const data = await response.json();
        newsListEl.innerHTML = data.articles.map(article => 
            `<div class="truncate text-4xl">${article.title.substring(0, 21)}</div>
            <div class="truncate text-3xl">${article.title.substring(21, 80)}</div>
            <div class="text-2xl opacity-80">${article.source.name}</div>`
        ).join('');
    } catch(error) {
        console.error("Failed to fetch news:", error);
        newsListEl.innerHTML = "News unavailable.";
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

async function updateReminders() {
    try {
        const response = await fetch('/api/reminders');
        const reminders = await response.json();
        if (reminders.length > 0) {
            remindersListEl.innerHTML = reminders.map(r => `<li>- ${r}</li>`).join('');
        } else {
            remindersListEl.innerHTML = `<li>No reminders yet.</li>`;
        }
    } catch (error) {
        console.error("Failed to fetch reminders:", error);
    }
}


// --- Initial Load and Intervals ---
function initialize() {
    // Initial calls to populate widgets immediately
    updateClock();
    updateWeather();
    updateNews();
    updateQuote();
    updateReminders();
    fetchAndStartSlideshow();

    // Set intervals for periodic updates
    setInterval(updateClock, 1000); // Every second for the clock
    setInterval(updateWeather, CONFIG.updates.weather);
    setInterval(updateNews, CONFIG.updates.news);
    setInterval(updateQuote, CONFIG.updates.quote);
    setInterval(updateReminders, CONFIG.updates.reminders);
}

// Start the application
document.addEventListener('DOMContentLoaded', initialize);
