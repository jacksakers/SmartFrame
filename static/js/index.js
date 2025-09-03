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
        leaderboard: 2 * 60 * 1000 // 2 minutes
    },
    choreboard: {
        apiUrl: "http://localhost:5001" // Update this to your Choreboard server IP and port
    },
    nasaApiKey: "EfFCqu9MJbGr7crV61dQ49Uo1jejD1M2kyERixTz" // Replace with your NASA API key or use "DEMO_KEY" for testing
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
const leaderboardListEl = document.getElementById('leaderboard-list');
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
    };
}
}

// --- Special Content Logic ---

const specialContentUpdaters = [
    updateNasaApod,
    updateDadJoke,
    updateAdvice,
    updateMarsPhoto
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
        newsListEl.innerHTML = data.articles.map(article => {
            // Split title at 21 characters
            const firstLine = article.title.substring(0, 21);
            const secondLine = article.title.substring(21);
            return `<div class="truncate text-4xl">${firstLine}</div>
            <div class="truncate text-3xl">${secondLine}</div>
            <div class="text-2xl opacity-80">${article.source.name}</div>`;
        }).join('');
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

async function updateLeaderboard() {
    try {
        const response = await fetch(`${CONFIG.choreboard.apiUrl}/api/state`);
        const data = await response.json();
        
        // Calculate scores for each user
        const scores = calculateChoreboardScores(data);
        
        if (scores.length > 0) {
            // Sort by total points descending
            scores.sort((a, b) => b.totalPoints - a.totalPoints);
            
            leaderboardListEl.innerHTML = scores.map((score, index) => {
                const position = index + 1;
                const medal = position === 1 ? '🏆' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
                return `<div class="flex justify-between items-center">
                    <span>${medal} ${score.userName}</span>
                    <span class="font-bold">${score.totalPoints} pts</span>
                </div>`;
            }).join('');
        } else {
            leaderboardListEl.innerHTML = `<div>No scores yet.</div>`;
        }
    } catch (error) {
        console.error("Failed to fetch leaderboard:", error);
        leaderboardListEl.innerHTML = `<div>Leaderboard unavailable</div>`;
    }
}

function calculateChoreboardScores(data) {
    const scores = [];
    
    data.users.forEach(user => {
        let totalPoints = 0;
        
        // Calculate points from completed log
        data.currentWeek.completedLog.forEach(log => {
            if (log.userId === user.id) {
                const chore = data.masterChores.find(c => c.id === log.choreId);
                if (chore) {
                    totalPoints += chore.points;
                }
            }
        });
        
        scores.push({
            userId: user.id,
            userName: user.name,
            totalPoints: totalPoints
        });
    });
    
    return scores;
}


// --- Initial Load and Intervals ---
function initialize() {
    // Initial calls to populate widgets immediately
    updateClock();
    updateWeather();
    updateNews();
    updateQuote();
    updateLeaderboard();
    fetchAndStartSlideshow();

    // Set intervals for periodic updates
    setInterval(updateClock, 1000); // Every second for the clock
    setInterval(updateWeather, CONFIG.updates.weather);
    setInterval(updateNews, CONFIG.updates.news);
    setInterval(updateQuote, CONFIG.updates.quote);
    setInterval(updateLeaderboard, CONFIG.updates.leaderboard);
}

// Start the application
document.addEventListener('DOMContentLoaded', initialize);
