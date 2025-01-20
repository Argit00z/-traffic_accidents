document.addEventListener('DOMContentLoaded', function () {
    // Элементы модального окна
    const authModal = document.getElementById('authModal');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authError = document.getElementById('authError');
    const closeModal = document.querySelector('.close');
    const authButton = document.getElementById('authButton');
    const historyButton = document.getElementById('historyButton');
    const historyContainer = document.getElementById('historyContainer');
    const historyList = document.getElementById('historyList');
    const switchToLogin = document.getElementById('switchToLogin');
    const switchToRegister = document.getElementById('switchToRegister');
    const authTitle = document.getElementById('authTitle');

    // Проверяем, что элементы существуют
    if (!authModal || !loginForm || !registerForm || !authError || !closeModal || !authButton || !switchToLogin || !switchToRegister) {
        console.error('Один из элементов не найден в DOM');
        return;
    }

    // Функция для открытия модального окна
    function openAuthModal(event) {
        event.preventDefault(); // Предотвращаем переход по ссылке
        authModal.style.display = 'block';
        showLoginForm(); // По умолчанию показываем форму входа
    }

    // Функция для закрытия модального окна
    function closeAuthModal() {
        authModal.style.display = 'none';
        authError.style.display = 'none'; // Скрываем сообщение об ошибке
    }

    // Функция для показа формы входа
    function showLoginForm() {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        authTitle.textContent = 'Вход';
        switchToLogin.classList.add('active');
        switchToRegister.classList.remove('active');
    }

    // Функция для показа формы регистрации
    function showRegisterForm() {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        authTitle.textContent = 'Регистрация';
        switchToRegister.classList.add('active');
        switchToLogin.classList.remove('active');
    }

    // Функция для выхода
    function handleLogout(event) {
        event.preventDefault(); // Предотвращаем переход по ссылке

        // Очищаем данные авторизации
        localStorage.removeItem('user_id');

        // Обновляем интерфейс
        authButton.textContent = 'Войти';
        authButton.removeEventListener('click', handleLogout);
        authButton.addEventListener('click', openAuthModal);

        alert('Вы успешно вышли из системы.');
    }

    // Обработчик клика на кнопку "Войти/Выйти"
    authButton.addEventListener('click', function (event) {
        const userId = localStorage.getItem('user_id');
        if (userId) {
            handleLogout(event); // Если пользователь авторизован, выполняем выход
        } else {
            openAuthModal(event); // Если пользователь не авторизован, открываем модальное окно
        }
    });

    // Обработчик клика на кнопку закрытия модального окна
    closeModal.addEventListener('click', closeAuthModal);

    // Обработчик клика вне модального окна для его закрытия
    window.addEventListener('click', function (event) {
        if (event.target === authModal) {
            closeAuthModal();
        }
    });

    // Обработчик переключения на форму входа
    switchToLogin.addEventListener('click', showLoginForm);

    // Обработчик переключения на форму регистрации
    switchToRegister.addEventListener('click', showRegisterForm);

    // Обработчик отправки формы входа
    loginForm.addEventListener('submit', function (event) {
        event.preventDefault(); // Предотвращаем отправку формы

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // Отправляем запрос на сервер для входа
        fetch('/backend/auth.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'login',
                username: username,
                password: password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Авторизация успешна');
                closeAuthModal();

                // Сохраняем user_id в localStorage
                localStorage.setItem('user_id', data.user_id);

                // Обновляем кнопку
                authButton.textContent = 'Выйти';
                authButton.removeEventListener('click', openAuthModal);
                authButton.addEventListener('click', handleLogout);
            } else {
                authError.textContent = data.error || 'Неверное имя пользователя или пароль';
                authError.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Ошибка:', error);
            authError.textContent = 'Ошибка при авторизации';
            authError.style.display = 'block';
        });
    });

    // Обработчик отправки формы регистрации
    registerForm.addEventListener('submit', function (event) {
        event.preventDefault(); // Предотвращаем отправку формы

        const username = document.getElementById('regUsername').value;
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Проверка совпадения паролей
        if (password !== confirmPassword) {
            authError.textContent = 'Пароли не совпадают';
            authError.style.display = 'block';
            return;
        }

        // Отправляем запрос на сервер для регистрации
        fetch('/backend/auth.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'register',
                username: username,
                password: password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Регистрация успешна');
                showLoginForm(); // Переключаем на форму входа после регистрации
            } else {
                authError.textContent = data.error || 'Ошибка при регистрации';
                authError.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Ошибка:', error);
            authError.textContent = 'Ошибка при регистрации';
            authError.style.display = 'block';
        });
    });

    // Проверка состояния авторизации при загрузке страницы
    const userId = localStorage.getItem('user_id');
    if (userId) {
        // Если пользователь авторизован, показываем кнопку "Выйти"
        authButton.textContent = 'Выйти';
        authButton.removeEventListener('click', openAuthModal);
        authButton.addEventListener('click', handleLogout);
    } else {
        // Если пользователь не авторизован, показываем кнопку "Войти"
        authButton.textContent = 'Войти';
        authButton.removeEventListener('click', handleLogout);
        authButton.addEventListener('click', openAuthModal);
    }

    // Обработчик клика на кнопку "История маршрутов"
    if (historyButton) {
        historyButton.addEventListener('click', function (event) {
            event.preventDefault(); // Предотвращаем переход по ссылке

            const userId = localStorage.getItem('user_id');
            if (!userId) {
                // Если пользователь не авторизован, показываем оповещение
                alert('Для просмотра истории маршрутов необходимо войти в систему.');
                openAuthModal(event); // Открываем модальное окно авторизации
            } else {
                // Если пользователь авторизован, показываем историю маршрутов
                showHistory(userId);
            }
        });
    }
});

// Получаем элементы модального окна истории
const historyModal = document.getElementById('historyModal');
const historyButton = document.getElementById('historyButton');
const closeHistoryModal = historyModal.querySelector('.close');

// Функция для открытия модального окна истории
historyButton.addEventListener('click', () => {
    historyModal.style.display = 'block';
    loadHistory(); // Загружаем историю маршрутов
});

// Функция для закрытия модального окна истории
closeHistoryModal.addEventListener('click', () => {
    historyModal.style.display = 'none';
});

// Закрытие модального окна при клике вне его области
window.addEventListener('click', (event) => {
    if (event.target === historyModal) {
        historyModal.style.display = 'none';
    }
});

function showHistory(userId) {
    const historyContainer = document.getElementById('historyContainer');
    const historyList = document.getElementById('historyList');

    // Запрашиваем историю маршрутов с сервера
    fetch(`/backend/history.php?user_id=${userId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Очищаем список
                historyList.innerHTML = '';

                // Добавляем каждый маршрут в список
                data.history.forEach(route => {
                    const li = document.createElement('li');
                    li.textContent = `Маршрут из ${route.start_point} в ${route.end_point} (${route.created_at})`;
                    li.dataset.routeId = route.id; // Сохраняем ID маршрута
                    li.style.cursor = 'pointer'; // Делаем элемент кликабельным
                    li.addEventListener('click', () => loadRoute(route.id)); // Загружаем маршрут при клике
                    historyList.appendChild(li);
                });

                // Показываем контейнер с историей
                
            } else {
                alert('Ошибка при загрузке истории маршрутов: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Ошибка:', error);
            alert('Ошибка при загрузке истории маршрутов.');
        });
}

async function loadRoute(routeId) {
    try {
        // Запрашиваем данные маршрута с сервера
        const response = await fetch(`/backend/get_route.php?route_id=${routeId}`);
        if (!response.ok) throw new Error('Ошибка при загрузке маршрута');
        const data = await response.json();

        if (data.success) {
            // Очищаем карту
            clearMap();

            // Отображаем маршрут на карте
            const route = JSON.parse(data.route.route_coordinates);
            mapElements.routeLine = L.polyline(route.map(coord => [coord[1], coord[0]]), { color: 'blue' }).addTo(map);
            map.fitBounds(mapElements.routeLine.getBounds());

            // Отображаем рекомендации
            if (data.route.recommendations) {
                const recommendations = JSON.parse(data.route.recommendations);
                displayRecommendations(recommendations);
            } else {
                console.warn('Рекомендации отсутствуют для этого маршрута');
            }
        } else {
            alert('Ошибка при загрузке маршрута: ' + data.error);
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Произошла ошибка при загрузке маршрута.');
    }
}