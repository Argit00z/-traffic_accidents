<?php
header('Content-Type: application/json');

// Настройки подключения к базе данных
$host = "localhost";
$dbname = "Russian_traffic_accidents";
$user = "postgres";
$password = "postgres";

// Подключение к базе данных
$connection = pg_connect("host=$host dbname=$dbname user=$user password=$password");

if (!$connection) {
    echo json_encode(["error" => "Ошибка подключения: " . pg_last_error()]);
    exit;
}

// Получаем данные из запроса
$data = json_decode(file_get_contents('php://input'), true);
$action = $data['action'] ?? null;

switch ($action) {
    case 'register':
        registerUser($connection, $data);
        break;
    case 'login':
        loginUser($connection, $data);
        break;
    case 'change_password':
        changePassword($connection, $data);
        break;
    default:
        echo json_encode(["error" => "Неизвестное действие"]);
        break;
}

pg_close($connection);

// Функция для регистрации пользователя
function registerUser($connection, $data) {
    $username = $data['username'] ?? null;
    $password = $data['password'] ?? null;

    // Валидация входных данных
    if (!$username || !$password) {
        echo json_encode(["error" => "Необходимо указать имя пользователя и пароль"]);
        exit;
    }

    if (strlen($username) < 3 || strlen($username) > 50) {
        echo json_encode(["error" => "Имя пользователя должно быть от 3 до 50 символов"]);
        exit;
    }

    if (strlen($password) < 6) {
        echo json_encode(["error" => "Пароль должен быть не менее 6 символов"]);
        exit;
    }

    // Проверка уникальности имени пользователя
    $query = "SELECT id FROM users WHERE username = $1";
    $result = pg_query_params($connection, $query, [$username]);

    if (!$result) {
        echo json_encode(["error" => "Ошибка при проверке имени пользователя: " . pg_last_error()]);
        exit;
    }

    if (pg_fetch_assoc($result)) {
        echo json_encode(["error" => "Имя пользователя уже занято"]);
        exit;
    }

    // Хешируем пароль
    $hashed_password = password_hash($password, PASSWORD_BCRYPT);

    // Вставляем пользователя в базу данных
    $query = "INSERT INTO users (username, password) VALUES ($1, $2)";
    $result = pg_query_params($connection, $query, [$username, $hashed_password]);

    if (!$result) {
        echo json_encode(["error" => "Ошибка при регистрации: " . pg_last_error()]);
        exit;
    }

    echo json_encode(["success" => "Пользователь успешно зарегистрирован"]);
}

// Функция для авторизации пользователя
function loginUser($connection, $data) {
    $username = $data['username'] ?? null;
    $password = $data['password'] ?? null;

    // Валидация входных данных
    if (!$username || !$password) {
        echo json_encode(["error" => "Необходимо указать имя пользователя и пароль"]);
        exit;
    }

    // Получаем пользователя из базы данных
    $query = "SELECT id, password FROM users WHERE username = $1";
    $result = pg_query_params($connection, $query, [$username]);

    if (!$result) {
        echo json_encode(["error" => "Ошибка при авторизации: " . pg_last_error()]);
        exit;
    }

    $user = pg_fetch_assoc($result);

    if (!$user) {
        echo json_encode(["error" => "Пользователь не найден"]);
        exit;
    }

    // Проверяем пароль
    if (password_verify($password, $user['password'])) {
        echo json_encode(["success" => "Авторизация успешна", "user_id" => $user['id']]);
    } else {
        echo json_encode(["error" => "Неверный пароль"]);
    }
}

// Функция для смены пароля
function changePassword($connection, $data) {
    $user_id = $data['user_id'] ?? null;
    $old_password = $data['old_password'] ?? null;
    $new_password = $data['new_password'] ?? null;

    // Валидация входных данных
    if (!$user_id || !$old_password || !$new_password) {
        echo json_encode(["error" => "Необходимо указать ID пользователя, старый и новый пароль"]);
        exit;
    }

    if (strlen($new_password) < 6) {
        echo json_encode(["error" => "Новый пароль должен быть не менее 6 символов"]);
        exit;
    }

    // Получаем текущий пароль пользователя
    $query = "SELECT password FROM users WHERE id = $1";
    $result = pg_query_params($connection, $query, [$user_id]);

    if (!$result) {
        echo json_encode(["error" => "Ошибка при получении данных пользователя: " . pg_last_error()]);
        exit;
    }

    $user = pg_fetch_assoc($result);

    if (!$user) {
        echo json_encode(["error" => "Пользователь не найден"]);
        exit;
    }

    // Проверяем старый пароль
    if (!password_verify($old_password, $user['password'])) {
        echo json_encode(["error" => "Неверный старый пароль"]);
        exit;
    }

    // Хешируем новый пароль
    $hashed_new_password = password_hash($new_password, PASSWORD_BCRYPT);

    // Обновляем пароль
    $query = "UPDATE users SET password = $1 WHERE id = $2";
    $result = pg_query_params($connection, $query, [$hashed_new_password, $user_id]);

    if (!$result) {
        echo json_encode(["error" => "Ошибка при смене пароля: " . pg_last_error()]);
        exit;
    }

    echo json_encode(["success" => "Пароль успешно изменен"]);
}
?>