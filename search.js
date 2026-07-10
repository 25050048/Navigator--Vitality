// Site search: matches by word against a small index of every page's
// title, description and keywords. No backend needed — pure client-side.
(function () {
    var SEARCH_INDEX = [
        {
            title: 'Home',
            url: '/home',
            description: "Road safety overview for Singapore's youth — stats, guidelines, causes of accidents, hotlines, petitions and news.",
            keywords: ['home', 'overview', 'stats', 'statistics', 'road safety begins with you', 'youth']
        },
        {
            title: 'Safety Guidelines',
            url: '/guidelines',
            description: 'Practical safety guidelines for pedestrians, cyclists, PMD riders, passengers and new drivers.',
            keywords: ['guidelines', 'pedestrian', 'cyclist', 'cycling', 'pmd', 'personal mobility device', 'passenger', 'new driver', 'rules', 'tips', 'helmet', 'crossing', 'bicycle']
        },
        {
            title: 'Causes of Accidents',
            url: '/causes',
            description: 'Causes of road accidents in Singapore, backed by statistics — speeding, distraction, PMD misuse and more.',
            keywords: ['causes', 'accidents', 'statistics', 'speeding', 'distraction', 'drink driving', 'data', 'crash', 'why']
        },
        {
            title: 'Emergency Hotlines',
            url: '/hotlines',
            description: 'Emergency hotlines and what to do if you witness or are involved in a road accident.',
            keywords: ['hotline', 'emergency', 'police', 'ambulance', 'accident', 'help', 'call', '995', '999', 'scdf']
        },
        {
            title: 'Petitions & Advocacy',
            url: '/petitions',
            description: 'Petitions and road safety advocacy campaigns by Singaporeans, from PMD regulation to tougher penalties.',
            keywords: ['petition', 'advocacy', 'campaign', 'sign', 'reckless driving', 'penalties', 'activism']
        },
        {
            title: 'News & Media',
            url: '/newsNmedia',
            description: 'Local and international road safety news — campaigns, enforcement changes, WHO and government updates.',
            keywords: ['news', 'media', 'who', 'world health organization', 'enforcement', 'campaign', 'cna', 'straits times', 'international', 'local']
        },
        {
            title: 'Road Safety Game',
            url: '/game',
            description: 'Play an interactive game to practise spotting hazards and making safe road choices.',
            keywords: ['game', 'play', 'quiz', 'interactive', 'hazard', 'fun']
        },
        {
            title: 'Navigator+ App',
            url: '/naviapp',
            description: 'Plan routes, check hazard alerts and get live road safety guidance with the Navigator+ app.',
            keywords: ['navigator', 'app', 'route', 'navigation', 'hazard alert', 'map', 'chat', 'assistant']
        },
        {
            title: 'Contact Us',
            url: '/contactUs',
            description: 'Get in touch with questions, feedback, or to report a road safety concern.',
            keywords: ['contact', 'email', 'feedback', 'report', 'reach', 'message', 'support']
        }
    ];

    function init() {
        var input = document.getElementById('site-search-input');
        var resultsBox = document.getElementById('site-search-results');
        var wrapper = document.getElementById('site-search');
        if (!input || !resultsBox || !wrapper) return;

        function normalize(str) {
            return (str || '').toLowerCase();
        }

        function escapeHtml(str) {
            var div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        // Matches a page if EVERY word typed appears somewhere in its
        // title/description/keywords (order doesn't matter, partial words OK).
        function search(query) {
            var words = normalize(query).trim().split(/\s+/).filter(Boolean);
            if (words.length === 0) return [];
            return SEARCH_INDEX.filter(function (page) {
                var haystack = normalize([page.title, page.description].concat(page.keywords).join(' '));
                return words.every(function (w) { return haystack.indexOf(w) !== -1; });
            });
        }

        function renderResults(matches, query) {
            if (!query.trim()) {
                resultsBox.innerHTML = '';
                resultsBox.classList.remove('show');
                return;
            }
            if (matches.length === 0) {
                resultsBox.innerHTML = '<div class="site-search-empty">No pages found for "' + escapeHtml(query) + '". Try another word.</div>';
            } else {
                resultsBox.innerHTML = matches.map(function (page) {
                    return '<a href="' + page.url + '" class="site-search-result" role="option">' +
                        '<div class="site-search-result-title">' + escapeHtml(page.title) + '</div>' +
                        '<div class="site-search-result-desc">' + escapeHtml(page.description) + '</div>' +
                        '</a>';
                }).join('');
            }
            resultsBox.classList.add('show');
        }

        input.addEventListener('input', function () {
            renderResults(search(input.value), input.value);
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var matches = search(input.value);
                if (matches.length > 0) window.location.href = matches[0].url;
            } else if (e.key === 'Escape') {
                resultsBox.classList.remove('show');
                input.blur();
            }
        });

        input.addEventListener('focus', function () {
            if (input.value.trim()) renderResults(search(input.value), input.value);
        });

        document.addEventListener('click', function (e) {
            if (!wrapper.contains(e.target)) {
                resultsBox.classList.remove('show');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
