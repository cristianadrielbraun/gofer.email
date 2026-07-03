window.addEventListener("DOMContentLoaded", function () {
    const darkModeButton = document.getElementById("dark_mode_btn");
    const lightModeButton = document.getElementById("light_mode_btn");

    if (!darkModeButton || !lightModeButton) {
        return;
    }

    darkModeButton.addEventListener("click", function () {
        document.documentElement.setAttribute("data-theme", "dark");
        localStorage.theme = "dark";
    });

    lightModeButton.addEventListener("click", function () {
        document.documentElement.setAttribute("data-theme", "light");
        localStorage.theme = "light";
    });
});
