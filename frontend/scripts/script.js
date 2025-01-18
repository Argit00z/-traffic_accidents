document.addEventListener('DOMContentLoaded', function() {
    const toggleButton = document.getElementById('toggle-controls');
    const controlsSection = document.querySelector('.controls');

    toggleButton.addEventListener('click', function() {
        controlsSection.classList.toggle('hidden');
        if (controlsSection.classList.contains('hidden')) {
            toggleButton.style.left = '10px'; // Если блок скрыт, кнопка перемещается влево
        } else {
            toggleButton.style.left = '310px'; // Если блок видим, кнопка возвращается на место
        }
    });
});