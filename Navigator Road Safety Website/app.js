const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use('/images', express.static('images')); // points directly to images folder
app.use(express.static('public')); // serves files like public/Nav_app.html directly, e.g. /Nav_app.html

const port = 3000;
app.set('view engine', 'ejs');

// Splash/landing page
app.get('/', function(req, res) {
    res.render('index');
});

// Home page
app.get('/home', function(req, res) {
    res.render('home');
});

// Road safety guidelines for pedestrians, cyclists/PMD riders, passengers & new drivers
app.get('/guidelines', function(req, res) {
    res.render('guidelines');
});

// Causes of road accidents in Singapore, with statistics
app.get('/causes', function(req, res) {
    res.render('causes');
});

// Emergency hotlines and what to do in a road accident
app.get('/hotlines', function(req, res) {
    res.render('hotlines');
});

// Petitions and road safety advocacy in Singapore
app.get('/petitions', function(req, res) {
    res.render('petitions');
});

// News & media on Singapore road safety
app.get('/newsNmedia', function(req, res) {
    res.render('newsNmedia');
});

// Road safety game
app.get('/game', function(req, res) {
    res.render('game');
});

// Navigator+ app page
app.get('/naviapp', function(req, res) {
    res.render('naviApp');
});
app.get('/naviApp', function(req, res) {
    res.redirect('/naviapp');
});

// Contact us page
app.get('/contactUs', function(req, res) {
    res.render('contactUs');
});

// Handle contact form submission (feedback is shown client-side; this just
// re-renders the page so a direct/no-JS form post doesn't 404)
app.post('/contactUs', function(req, res) {
    console.log('Contact form submission:', req.body);
    res.redirect('/contactUs');
});

app.post('/api/translate', async (req, res) => {
    const { text, language } = req.body; // e.g. language = "Mandarin Chinese"
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1000,
            messages: [{ role: "user", content: `Translate this into ${language} for a teenager reading a road safety website. Keep it simple and clear:\n\n${text}` }]
        })
    });
    const data = await response.json();
    res.json({ translated: data.content[0].text });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});