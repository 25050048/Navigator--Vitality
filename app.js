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

// AI road-safety chatbot page
app.get('/chatbox', function(req, res) {
    res.render('chatbox');
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

app.post('/api/translate', async function(req, res) {
    const { text, language } = req.body;

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

    try {
        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/interactions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': process.env.GEMINI_API_KEY
                },
                body: JSON.stringify({
                    model: 'gemini-3.5-flash',

                    system_instruction: `
You are Navigator AI, a helpful road-safety assistant for a Singapore road-safety website.

Only answer questions related to:
- Road safety
- Pedestrian safety
- Cyclist and PMD safety
- Passenger and seat-belt safety
- New-driver safety
- Road accidents
- Emergency actions
- Safe driving habits
- Singapore road-safety awareness

Keep answers simple, friendly and suitable for teenagers.
Keep answers below 120 words.

For emergencies, advise the user to contact the appropriate Singapore emergency service.

If the question is unrelated to road safety, politely explain that you only answer road-safety questions.
                    `,

                    input: userMessage,

                    generation_config: {
                        thinking_level: 'low',
                        max_output_tokens: 250
                    }
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('Gemini API error:', JSON.stringify(data, null, 2));

            return res.status(500).json({
                reply: 'Sorry, the AI assistant is currently unavailable.'
            });
        }

        let reply = '';

        if (Array.isArray(data.steps)) {
            for (let i = data.steps.length - 1; i >= 0; i--) {
                const step = data.steps[i];

                if (
                    step.type === 'model_output' &&
                    Array.isArray(step.content)
                ) {
                    const textPart = step.content.find(function(part) {
                        return part.type === 'text';
                    });

                    if (textPart && textPart.text) {
                        reply = textPart.text;
                        break;
                    }
                }
            }
        }

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

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});