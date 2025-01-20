document.addEventListener('DOMContentLoaded', function() {
    const toggleButton = document.getElementById('toggle-controls');
    const controlsSection = document.querySelector('.controls');
    const leafletControls = document.querySelector('.leaflet-top .leaflet-control');

    // Изначально блок открыт, стрелка указывает влево
    toggleButton.innerHTML = '&#9664;'; // Стрелка влево

    // Функция для обновления отступов в зависимости от ширины экрана
    function updateMargins() {
        const screenWidth = window.innerWidth;
        let toggleButtonMargin, leafletControlsMargin;

        if (screenWidth < 400) {
            // Для мобильных устройств
            toggleButtonMargin = controlsSection.classList.contains('hidden') ? '10px' : '260px';
            leafletControlsMargin = controlsSection.classList.contains('hidden') ? '20px' : '260px';
        }else {
            // Для десктопов
            toggleButtonMargin = controlsSection.classList.contains('hidden') ? '10px' : '360px';
            leafletControlsMargin = controlsSection.classList.contains('hidden') ? '20px' : '360px';
        }

        // Применяем значения отступов
        toggleButton.style.marginLeft = toggleButtonMargin;
        leafletControls.style.marginLeft = leafletControlsMargin;
    }

    // Обработчик клика по кнопке
    toggleButton.addEventListener('click', function() {
        controlsSection.classList.toggle('hidden');
        toggleButton.classList.toggle('rotated'); // Добавляем/удаляем класс для вращения
        updateMargins(); // Обновляем отступы
    });

    // Обработчик изменения размера окна
    window.addEventListener('resize', function() {
        updateMargins(); // Обновляем отступы при изменении размера окна
    });

    // Инициализация отступов при загрузке страницы
    updateMargins();
});

document.addEventListener('DOMContentLoaded', function () {
    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');
    const startSuggestions = document.getElementById('start-suggestions');
    const endSuggestions = document.getElementById('end-suggestions');

    // Функция для получения подсказок
    async function getSuggestions(query) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        const data = await response.json();
        return data;
    }

    // Функция для отображения подсказок
    function showSuggestions(input, suggestionsContainer, data) {
        suggestionsContainer.innerHTML = ''; // Очищаем контейнер
        if (data.length > 0) {
            data.forEach(item => {
                const suggestion = document.createElement('div');
                suggestion.textContent = item.display_name;
                suggestion.addEventListener('click', () => {
                    input.value = item.display_name; // Вставляем выбранное значение в input
                    suggestionsContainer.innerHTML = ''; // Скрываем подсказки
                    suggestionsContainer.classList.remove('visible'); // Скрываем контейнер
                });
                suggestionsContainer.appendChild(suggestion);
            });
            suggestionsContainer.classList.add('visible'); // Показываем контейнер
        } else {
            suggestionsContainer.classList.remove('visible'); // Скрываем контейнер, если данных нет
        }
    }

    // Обработчик ввода для начальной точки
    startInput.addEventListener('input', async () => {
        if (startInput.value.length > 2) { // Минимум 3 символа для запроса
            const data = await getSuggestions(startInput.value);
            showSuggestions(startInput, startSuggestions, data);
        } else {
            startSuggestions.innerHTML = ''; // Очищаем подсказки, если ввод слишком короткий
            startSuggestions.classList.remove('visible'); // Скрываем контейнер
        }
    });

    // Обработчик ввода для конечной точки
    endInput.addEventListener('input', async () => {
        if (endInput.value.length > 2) { // Минимум 3 символа для запроса
            const data = await getSuggestions(endInput.value);
            showSuggestions(endInput, endSuggestions, data);
        } else {
            endSuggestions.innerHTML = ''; // Очищаем подсказки, если ввод слишком короткий
            endSuggestions.classList.remove('visible'); // Скрываем контейнер
        }
    });

    // Скрываем подсказки при клике вне input
    document.addEventListener('click', (event) => {
        if (!startInput.contains(event.target)) {
            startSuggestions.innerHTML = '';
            startSuggestions.classList.remove('visible');
        }
        if (!endInput.contains(event.target)) {
            endSuggestions.innerHTML = '';
            endSuggestions.classList.remove('visible');
        }
    });
});


