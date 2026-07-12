// v2 - 20260712064129
const express = require('express');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, '../images'))); // points directly to images folder
app.use(express.static(path.join(__dirname, '../public'))); // serves files like public/Nav_app.html directly, e.g. /Nav_app.html

const port = 3000;
app.set('views', path.join(__dirname, '../views'));
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

// AI road-safety chatbot page
app.get('/chatbox', function(req, res) {
    res.render('chatbox');
});

// Contact us page
app.get('/contactUs', function(req, res) {
    res.render('contactUs');
});

// About Us page
app.get('/about', function(req, res) {
    res.render('aboutUs');
});

// Privacy Policy
app.get('/privacy-policy', function(req, res) {
    res.render('privacyPolicy');
});

// Terms of Use
app.get('/terms-of-use', function(req, res) {
    res.render('termsOfUse');
});

// Handle contact form submission (feedback is shown client-side; this just
// re-renders the page so a direct/no-JS form post doesn't 404)
app.post('/contactUs', function(req, res) {
    console.log('Contact form submission:', req.body);
    res.redirect('/contactUs');
});

app.post('/api/translate', async function(req, res) {
    const { text, language } = req.body; // e.g. language = "Mandarin Chinese"

    try {
        const response = await fetch(
            'https://api.anthropic.com/v1/messages',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-6',
                    max_tokens: 1000,
                    messages: [
                        {
                            role: 'user',
                            content:
                                `Translate this into ${language} for a teenager reading a road safety website. Keep it simple and clear:\n\n${text}`
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('Translation API error:', data);

            return res.status(500).json({
                translated: 'Translation is currently unavailable.'
            });
        }

        res.json({
            translated: data.content[0].text
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            translated: 'Translation is currently unavailable.'
        });
    }
});

app.post('/api/chat', async function(req, res) {
    const userMessage = req.body.message;

    if (!userMessage || userMessage.trim() === '') {
        return res.status(400).json({
            reply: 'Please enter a road-safety question.'
        });
    }

    if (!process.env.GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY is missing.');

        return res.status(500).json({
            reply: 'The AI assistant has not been configured yet.'
        });
    }

    const SYSTEM_INSTRUCTION = "System Instructions: You are the Navigator+ assistant, a road safety expert in Singapore. Keep your answers concise (2-3 sentences), practical, and focused on road safety, driving rules, or the app's features. Do not use complex markdown, just basic bold text.";

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: SYSTEM_INSTRUCTION + '\n\nUser: ' + userMessage }]
                        }
                    ],
                    
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('Gemini API error:', JSON.stringify(data, null, 2));
            const errMsg = data?.error?.message || 'Unknown error';
            return res.status(500).json({
                reply: 'Gemini error: ' + errMsg
            });
        }

        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!reply) {
            console.error(
                'Unexpected Gemini response:',
                JSON.stringify(data, null, 2)
            );

            return res.status(500).json({
                reply: 'Sorry, I could not generate an answer.'
            });
        }

        res.json({
            reply: reply
        });

    } catch (error) {
        console.error('Gemini connection error:', error);

        res.status(500).json({
            reply: 'Sorry, something went wrong. Please try again.'
        });
    }
});

// HTTPS Configuration
const httpsOptions = {};
let useHttps = false;

try {
    if (fs.existsSync('server.key') && fs.existsSync('server.cert')) {
        httpsOptions.key = fs.readFileSync('server.key');
        httpsOptions.cert = fs.readFileSync('server.cert');
        useHttps = true;
    }
} catch (e) {
    console.log('Error reading SSL certificates:', e.message);
}

if (useHttps && !process.env.VERCEL) {
    https.createServer(httpsOptions, app).listen(port, () => {
        console.log(`HTTPS Server is running at https://localhost:${port}`);
    });
} else if (!process.env.VERCEL) {
    http.createServer(app).listen(port, () => {
        console.log(`HTTP Server is running at http://localhost:${port}`);
        console.log(`(Note: To enable HTTPS, place 'server.key' and 'server.cert' in the project root)`);
    });
}

// Export the app for Vercel Serverless Functions
module.exports = app;




