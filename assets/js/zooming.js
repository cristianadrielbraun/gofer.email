import Zooming from '../lib/js/zooming-v2.1.1.min.js';

function zoomBackgroundColor() {
    const theme = document.documentElement.getAttribute('data-theme');

    if (theme === 'dark') {
        return '#333';
    }

    if (theme === 'light') {
        return '#fff';
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? '#333' : '#fff';
}

function setZoomSize(img) {
    const naturalWidth = Number(img.getAttribute('width')) || img.naturalWidth;
    const naturalHeight = Number(img.getAttribute('height')) || img.naturalHeight;

    if (!naturalWidth || !naturalHeight) {
        return;
    }

    const maxWidth = window.innerWidth * 0.92;
    const maxHeight = window.innerHeight * 0.84;
    const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);

    img.dataset.zoomingWidth = Math.round(naturalWidth * scale);
    img.dataset.zoomingHeight = Math.round(naturalHeight * scale);
}

document.addEventListener('DOMContentLoaded', function () {
    const screenshots = document.querySelectorAll('.gofer-shot-grid img');

    if (!screenshots.length) {
        return;
    }

    screenshots.forEach(setZoomSize);

    const zooming = new Zooming({
        transitionDuration: 0.2,
        bgColor: zoomBackgroundColor(),
    });

    zooming.listen('.gofer-shot-grid img');

    window.addEventListener('resize', function () {
        screenshots.forEach(setZoomSize);
    });

    const darkModeButton = document.getElementById('dark_mode_btn');
    const lightModeButton = document.getElementById('light_mode_btn');

    if (darkModeButton) {
        darkModeButton.addEventListener('click', function () {
            zooming.config({ bgColor: '#333' });
        });
    }

    if (lightModeButton) {
        lightModeButton.addEventListener('click', function () {
            zooming.config({ bgColor: '#fff' });
        });
    }
});
