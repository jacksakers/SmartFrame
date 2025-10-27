// --- CONFIGURATION ---
// IMPORTANT: Replace these placeholders with your actual data and API keys!
const CONFIG = {
    weather: {
        apiKey: "48bf8926e401412ba4603116252506", 
        city: "New York", // e.g., "London", "Tokyo,JP"
        units: "imperial" // "metric" for Celsius, "imperial" for Fahrenheit
    },
    slideshow: {
        updateInterval: 15000 // Time in milliseconds (15 seconds)
    },
    updates: {
        weather: 30 * 60 * 1000, // 30 minutes
        quote: 4 * 60 * 60 * 1000, // 4 hours
        reminders: 5 * 60 * 1000, // 5 minutes
        ncaaScores: 60 * 60 * 1000 // 1 hour - fetch new scores
    },
    ncaa: {
        scoreRotationInterval: 10000 // Rotate to next score every 10 seconds
    },
    nasaApiKey: "sPHoHKKLYtUJOoV78IcRcCWOfZOd5Hi8N2UKJ3vG" // Replace with your NASA API key or use "DEMO_KEY" for testing
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
const ncaaScoreEl = document.getElementById('ncaa-score');
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

// --- NCAA Football Scores ---
let ncaaScores = [];
let currentScoreIndex = 0;

async function fetchNcaaScores() {
    try {
        // Football uses YYYY/WK format instead of dates
        // Get current date to determine the week
        const now = new Date();
        const year = now.getFullYear();
        
        // Calculate approximate week number (NCAA football typically runs weeks 1-15)
        // Week 1 starts around late August/early September
        const startOfSeason = new Date(year, 7, 25); // Approximate Aug 25
        const weekNumber = Math.max(1, Math.min(15, Math.floor((now - startOfSeason) / (7 * 24 * 60 * 60 * 1000)) + 1));
        
        // Use our Flask backend as a proxy to avoid CORS issues
        const url = `/api/ncaa/scores/${year}/${String(weekNumber - 1).padStart(2, '0')}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.games && data.games.length > 0) {
            // Extract the actual game data from the nested structure
            ncaaScores = data.games
                .filter(item => item.game && item.game.gameState === 'final')
                .map(item => item.game);
            
            if (ncaaScores.length > 0) {
                currentScoreIndex = 0;
                displayCurrentNcaaScore();
            } else {
                ncaaScoreEl.innerHTML = `<div>No completed games yet</div>`;
            }
        } else {
            ncaaScoreEl.innerHTML = `<div>No games this week</div>`;
        }
    } catch (error) {
        console.error("Failed to fetch NCAA scores:", error);
        ncaaScoreEl.innerHTML = `<div>Scores unavailable</div>`;
    }
}

function displayCurrentNcaaScore() {
    if (ncaaScores.length === 0) {
        ncaaScoreEl.innerHTML = `<div>No scores available</div>`;
        return;
    }
    
    const game = ncaaScores[currentScoreIndex];
    
    // Extract team data from the API response
    const homeTeam = game.home || {};
    const awayTeam = game.away || {};
    
    const homeName = homeTeam.names?.short || homeTeam.name || 'Home';
    const awayName = awayTeam.names?.short || awayTeam.name || 'Away';
    const homeScore = parseInt(homeTeam.score) || 0;
    const awayScore = parseInt(awayTeam.score) || 0;
    
    // Get rankings (only show if ranked in top 25)
    const homeRank = homeTeam.rank ? `#${homeTeam.rank}` : '';
    const awayRank = awayTeam.rank ? `#${awayTeam.rank}` : '';
    
    // Determine winner
    const homeWon = homeTeam.winner === true;
    const awayWon = awayTeam.winner === true;
    
    // Format the date
    let dateStr = '';
    if (game.startDate) {
        dateStr = game.startDate;
    } else if (game.startTimeEpoch) {
        dateStr = new Date(game.startTimeEpoch * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    const gameStatus = game.finalMessage || game.gameState || 'Final';
    
    ncaaScoreEl.innerHTML = `
        <div class="space-y-1">
            <div class="flex justify-between items-center text-3xl ${awayWon ? 'font-bold text-4xl' : ''}">
                <span class="truncate mr-2">
                    ${awayRank ? `<span class="text-yellow-400 text-2xl">${awayRank}</span> ` : ''}${awayName}
                </span>
                <span>${awayScore}</span>
            </div>
            <div class="flex justify-between items-center text-3xl ${homeWon ? 'font-bold text-4xl' : ''}">
                <span class="truncate mr-2">
                    ${homeRank ? `<span class="text-yellow-400 text-2xl">${homeRank}</span> ` : ''}${homeName}
                </span>
                <span>${homeScore}</span>
            </div>
            <div class="text-lg opacity-70 mt-2">
                ${dateStr} ${gameStatus}
            </div>
        </div>
    `;
}

function rotateNcaaScore() {
    if (ncaaScores.length === 0) return;
    currentScoreIndex = (currentScoreIndex + 1) % ncaaScores.length;
    displayCurrentNcaaScore();
}


// --- Initial Load and Intervals ---
function initialize() {
    // Initial calls to populate widgets immediately
    updateClock();
    updateWeather();
    updateReminders();
    updateQuote();
    fetchNcaaScores();
    fetchAndStartSlideshow();

    // Set intervals for periodic updates
    setInterval(updateClock, 1000); // Every second for the clock
    setInterval(updateWeather, CONFIG.updates.weather);
    setInterval(updateReminders, CONFIG.updates.reminders);
    setInterval(updateQuote, CONFIG.updates.quote);
    setInterval(fetchNcaaScores, CONFIG.updates.ncaaScores);
    setInterval(rotateNcaaScore, CONFIG.ncaa.scoreRotationInterval);
}

// Start the application
document.addEventListener('DOMContentLoaded', initialize);
